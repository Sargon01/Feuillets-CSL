/**
 * Feuillets CSL — Stateful Document Engine (Lot 5)
 *
 * Implements CitationDocumentEngine using citeproc-ts with:
 * - Persistent, isolated document sessions.
 * - Append-only incremental fast path and automated full rebuild on non-safe changes.
 * - Invalidation on style, bibliography, or locale changes.
 * - Rich formatting converted to safe CitationRenderNode AST (zero raw HTML).
 * - Full disposeDocument() and dispose() lifecycle cleanup.
 * - Deterministic fail-closed error handling (REVISION_CONFLICT, STALE_REVISION, etc.).
 * - Zero `any`.
 */

import { CSL } from "citeproc-ts";
import type {
  BibliographyLayout,
  CitationBibliographySource,
  CitationClusterInput,
  CitationDocumentEngine,
  CitationDocumentRequest,
  CitationDocumentResult,
  CitationEngineDiagnostic,
  RenderedBibliography,
  RenderedBibliographyEntry,
  RenderedCitation,
} from "./engine-contract.ts";
import { validateCitationDocumentRequest } from "./engine-validation.ts";
import { adaptBibliographies } from "./bibtex-adapter.ts";
import type { BibtexAdapterResult, CslItem } from "./bibtex-adapter.ts";
import {
  DocumentSessionManager,
  computeResourceSignature,
  computeClusterSignatures,
  isAppendOnly,
  cloneResult,
} from "./citeproc-session.ts";
import type {
  CiteprocEngineInstance,
  CiteprocCitationCluster,
  CiteprocCitationItem,
  CiteprocProperties,
} from "./citeproc-session.ts";
import { convertCiteprocHtmlToNodes } from "./citeproc-markup.ts";

export interface CslLocaleProvider {
  retrieveLocale(language: string): string | null;
}

export interface CiteprocSys {
  retrieveLocale: (lang: string) => string | boolean;
  retrieveItem: (id: string) => CslItem | null;
}

export type CiteprocEngineFactory = (
  sys: CiteprocSys,
  styleXml: string,
  locale: string
) => CiteprocEngineInstance;

export type BibtexAdapterFn = (
  sources: CitationBibliographySource[]
) => BibtexAdapterResult;

interface CslModule {
  Engine: new (
    sys: CiteprocSys,
    style: string,
    lang?: string,
    forceLang?: boolean
  ) => CiteprocEngineInstance;
}

function defaultEngineFactory(
  sys: CiteprocSys,
  styleXml: string,
  locale: string
): CiteprocEngineInstance {
  const EngineConstructor = (CSL as CslModule).Engine;
  return new EngineConstructor(sys, styleXml, locale);
}

/**
 * Computes a deterministic cache key for the ordered set of bibliography sources.
 *
 * Invariant: Key is based solely on ordered tuples of [id, version, format].
 * Content is not hashed. Order is strictly preserved.
 */
export function computeBibCacheKey(
  bibliographies: readonly CitationBibliographySource[]
): string {
  return JSON.stringify(bibliographies.map((b) => [b.id, b.version, b.format]));
}

export class CiteprocDocumentEngine implements CitationDocumentEngine {
  private readonly localeProvider: CslLocaleProvider;
  private readonly sessionManager: DocumentSessionManager;
  private readonly bibCache: Map<string, BibtexAdapterResult>;
  private readonly engineFactory: CiteprocEngineFactory;
  private readonly bibAdapter: BibtexAdapterFn;

  constructor(
    localeProvider: CslLocaleProvider,
    engineFactory?: CiteprocEngineFactory,
    bibAdapter?: BibtexAdapterFn
  ) {
    this.localeProvider = localeProvider;
    this.sessionManager = new DocumentSessionManager();
    this.bibCache = new Map<string, BibtexAdapterResult>();
    this.engineFactory = engineFactory ?? defaultEngineFactory;
    this.bibAdapter = bibAdapter ?? adaptBibliographies;
  }

  async renderDocument(
    request: CitationDocumentRequest
  ): Promise<CitationDocumentResult> {
    // 1. Validate request schema
    const validation = validateCitationDocumentRequest(request);
    if (!validation.valid) {
      const schemaDiagnostics: CitationEngineDiagnostic[] = validation.errors.map(
        (err) => ({
          code: "INVALID_REQUEST_SCHEMA",
          severity: "error",
          message: `${err.path ? err.path + ": " : ""}${err.message}`,
        })
      );
      const docId =
        typeof request === "object" &&
        request !== null &&
        "documentId" in request &&
        typeof (request as { documentId: unknown }).documentId === "string"
          ? (request as { documentId: string }).documentId
          : "";
      const rev =
        typeof request === "object" &&
        request !== null &&
        "revision" in request &&
        typeof (request as { revision: unknown }).revision === "number"
          ? (request as { revision: number }).revision
          : 0;
      return {
        documentId: docId,
        revision: rev,
        citations: [],
        bibliography: null,
        diagnostics: schemaDiagnostics,
      };
    }

    const documentId = request.documentId;
    const existingSession = this.sessionManager.getSession(documentId);
    const newResourceSignature = computeResourceSignature(request);
    const newClusterSignatures = computeClusterSignatures(request.clusters);

    // 2. Check session revision constraints
    if (existingSession) {
      // 2A. Stale revision: request.revision < session.revision -> fail closed
      if (request.revision < existingSession.revision) {
        return {
          documentId,
          revision: request.revision,
          citations: [],
          bibliography: null,
          diagnostics: [
            {
              code: "STALE_REVISION",
              severity: "error",
              message: `Request revision ${request.revision} is older than current session revision ${existingSession.revision}.`,
            },
          ],
        };
      }

      // 2B. Same revision check: request.revision === session.revision
      if (request.revision === existingSession.revision) {
        const resourcesMatch =
          newResourceSignature === existingSession.resourceSignature;
        const clustersMatch =
          newClusterSignatures.length === existingSession.clusterSignatures.length &&
          newClusterSignatures.every(
            (sig, i) => sig === existingSession.clusterSignatures[i]
          );

        if (resourcesMatch && clustersMatch && existingSession.lastResult) {
          const cachedBibPresent =
            existingSession.lastResult.bibliography !== null;
          // If includeBibliography flag is identical, return cached result
          if (request.includeBibliography === cachedBibPresent) {
            return cloneResult(existingSession.lastResult);
          }
          // If only includeBibliography changed on identical revision, re-generate bibliography
          // without rebuilding citation state
          return this.recomputeBibliographyOnly(
            existingSession,
            request,
            newResourceSignature,
            newClusterSignatures
          );
        }

        // Same revision with different content represents a revision conflict -> fail closed
        return {
          documentId,
          revision: request.revision,
          citations: [],
          bibliography: null,
          diagnostics: [
            {
              code: "REVISION_CONFLICT",
              severity: "error",
              message: `Revision conflict: revision ${request.revision} was already rendered with different document content or resources.`,
            },
          ],
        };
      }
    }

    // 3. Parse and adapt bibliography sources (with cache on ordered set)
    const bibCacheKey = computeBibCacheKey(request.bibliographies);
    let adapterResult = this.bibCache.get(bibCacheKey);
    if (!adapterResult) {
      adapterResult = this.bibAdapter(request.bibliographies);
      this.bibCache.set(bibCacheKey, adapterResult);
    }

    const allDiagnostics: CitationEngineDiagnostic[] = [
      ...adapterResult.diagnostics,
    ];

    const hasFatalBibError = allDiagnostics.some((d) => d.severity === "error");
    if (hasFatalBibError) {
      return {
        documentId,
        revision: request.revision,
        citations: [],
        bibliography: null,
        diagnostics: allDiagnostics,
      };
    }

    // 4. Verify all cluster citekeys exist
    let hasMissingCitekey = false;
    for (const cluster of request.clusters) {
      for (const item of cluster.items) {
        if (!adapterResult.items.has(item.id)) {
          hasMissingCitekey = true;
          allDiagnostics.push({
            code: "UNKNOWN_CITEKEY",
            severity: "error",
            clusterId: cluster.id,
            citekey: item.id,
            message: `Citekey '${item.id}' referenced in cluster '${cluster.id}' was not found in bibliography sources.`,
          });
        }
      }
    }

    if (hasMissingCitekey) {
      return {
        documentId,
        revision: request.revision,
        citations: [],
        bibliography: null,
        diagnostics: allDiagnostics,
      };
    }

    // 5. Verify requested locale
    const targetLocale = request.locale ? request.locale.trim() : "en-US";
    const primaryLocaleXml = this.localeProvider.retrieveLocale(targetLocale);
    if (!primaryLocaleXml) {
      allDiagnostics.push({
        code: "CSL_LOCALE_UNAVAILABLE",
        severity: "error",
        message: `Requested CSL locale '${targetLocale}' is unavailable.`,
      });
      return {
        documentId,
        revision: request.revision,
        citations: [],
        bibliography: null,
        diagnostics: allDiagnostics,
      };
    }

    // 6. Check if append-only incremental execution is valid
    const canAppendOnly =
      existingSession !== undefined &&
      newResourceSignature === existingSession.resourceSignature &&
      isAppendOnly(existingSession.clusterSignatures, newClusterSignatures);

    let engine: CiteprocEngineInstance;
    let citationsPre: [string, number][];
    let clusterRenderings: Map<string, string>;
    let startIndex = 0;

    if (canAppendOnly) {
      // Re-use active session engine
      engine = existingSession.engine;
      citationsPre = existingSession.citationsPre;
      clusterRenderings = existingSession.clusterRenderings;
      startIndex = existingSession.clusterSignatures.length;

      // Update citeproc item registration with any new items
      const citedIds: string[] = [];
      const seenCitedIds = new Set<string>();
      for (const cluster of request.clusters) {
        for (const item of cluster.items) {
          if (!seenCitedIds.has(item.id)) {
            seenCitedIds.add(item.id);
            citedIds.push(item.id);
          }
        }
      }
      engine.updateItems(citedIds);
    } else {
      // Full rebuild: create fresh CSL Engine instance
      const sys: CiteprocSys = {
        retrieveLocale: (lang: string): string | boolean => {
          const loc = this.localeProvider.retrieveLocale(lang);
          return loc !== null && loc.trim().length > 0 ? loc : false;
        },
        retrieveItem: (id: string): CslItem | null => {
          return adapterResult.items.get(id) ?? null;
        },
      };

      try {
        engine = this.engineFactory(sys, request.style.xml, targetLocale);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        allDiagnostics.push({
          code: "CSL_STYLE_ERROR",
          severity: "error",
          message: `CSL style parsing failed: ${msg}`,
        });
        return {
          documentId,
          revision: request.revision,
          citations: [],
          bibliography: null,
          diagnostics: allDiagnostics,
        };
      }

      engine.setOutputFormat("html");

      const citedIds: string[] = [];
      const seenCitedIds = new Set<string>();
      for (const cluster of request.clusters) {
        for (const item of cluster.items) {
          if (!seenCitedIds.has(item.id)) {
            seenCitedIds.add(item.id);
            citedIds.push(item.id);
          }
        }
      }
      engine.updateItems(citedIds);

      citationsPre = [];
      clusterRenderings = new Map<string, string>();
      startIndex = 0;
    }

    // 7. Process clusters from startIndex to end, capturing updates
    for (let i = startIndex; i < request.clusters.length; i++) {
      const cluster = request.clusters[i];
      const citeprocItems: CiteprocCitationItem[] = cluster.items.map((it) => {
        const mapped: CiteprocCitationItem = {
          id: it.id,
          prefix: it.prefix,
          suffix: it.suffix,
          locator: it.locator,
          label: it.label,
        };
        if (it.mode === "suppress-author") {
          mapped["suppress-author"] = true;
        } else if (it.mode === "author-only") {
          mapped["author-only"] = true;
        }
        return mapped;
      });

      const hasComposite = cluster.items.some((it) => it.mode === "composite");
      const properties: CiteprocProperties = {
        noteIndex: cluster.noteIndex ?? 0,
        mode: hasComposite ? "composite" : undefined,
      };

      const citeprocCluster: CiteprocCitationCluster = {
        citationID: cluster.id,
        citationItems: citeprocItems,
        properties,
      };

      try {
        const result = engine.processCitationCluster(
          citeprocCluster,
          citationsPre,
          []
        );
        const updates = result[1];
        for (const update of updates) {
          const cid = update[2];
          const text = update[1];
          clusterRenderings.set(cid, text);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        allDiagnostics.push({
          code: "CSL_PROCESSING_ERROR",
          severity: "error",
          clusterId: cluster.id,
          message: `Error processing citation cluster '${cluster.id}': ${msg}`,
        });
        return {
          documentId,
          revision: request.revision,
          citations: [],
          bibliography: null,
          diagnostics: allDiagnostics,
        };
      }

      citationsPre.push([cluster.id, cluster.noteIndex ?? 0]);
    }

    // 8. Convert HTML renderings into safe CitationRenderNode ASTs
    const renderedCitations: RenderedCitation[] = request.clusters.map(
      (cluster: CitationClusterInput) => {
        const rawHtml = clusterRenderings.get(cluster.id) ?? "";
        const converted = convertCiteprocHtmlToNodes(rawHtml);
        for (const diag of converted.diagnostics) {
          allDiagnostics.push(diag);
        }
        return {
          clusterId: cluster.id,
          plainText: converted.plainText,
          content: converted.nodes,
        };
      }
    );

    // 9. Generate bibliography if requested
    let bibliography: RenderedBibliography | null = null;
    if (request.includeBibliography) {
      try {
        const bibRes = engine.makeBibliography();
        if (bibRes) {
          const meta = bibRes[0];
          const entryStrings = bibRes[1];
          const entries: RenderedBibliographyEntry[] = [];

          for (let i = 0; i < entryStrings.length; i++) {
            const rawEntryHtml = entryStrings[i];
            const converted = convertCiteprocHtmlToNodes(rawEntryHtml);
            for (const diag of converted.diagnostics) {
              allDiagnostics.push(diag);
            }

            const itemIds =
              meta.entry_ids && meta.entry_ids[i] ? meta.entry_ids[i] : [];

            entries.push({
              itemIds,
              plainText: converted.plainText,
              content: converted.nodes,
            });
          }

          const layout: BibliographyLayout = {
            hangingIndent: Boolean(meta.hangingindent),
            entrySpacing:
              typeof meta.entryspacing === "number" ? meta.entryspacing : 1,
            lineSpacing:
              typeof meta.linespacing === "number" ? meta.linespacing : 1,
            secondFieldAlign:
              meta["second-field-align"] === "flush" ||
              meta["second-field-align"] === "margin"
                ? meta["second-field-align"]
                : undefined,
            maxOffset:
              typeof meta.maxoffset === "number" ? meta.maxoffset : undefined,
          };

          bibliography = {
            entries,
            layout,
          };
        } else {
          bibliography = {
            entries: [],
            layout: {
              hangingIndent: false,
              entrySpacing: 1,
              lineSpacing: 1,
            },
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        allDiagnostics.push({
          code: "CSL_PROCESSING_ERROR",
          severity: "error",
          message: `Error generating bibliography: ${msg}`,
        });
        return {
          documentId,
          revision: request.revision,
          citations: [],
          bibliography: null,
          diagnostics: allDiagnostics,
        };
      }
    }

    const finalResult: CitationDocumentResult = {
      documentId,
      revision: request.revision,
      citations: renderedCitations,
      bibliography,
      diagnostics: allDiagnostics,
    };

    // 10. Update session state
    this.sessionManager.setSession(documentId, {
      documentId,
      revision: request.revision,
      resourceSignature: newResourceSignature,
      clusterSignatures: newClusterSignatures,
      engine,
      citationsPre,
      clusterRenderings,
      lastResult: finalResult,
    });

    return cloneResult(finalResult);
  }

  private recomputeBibliographyOnly(
    session: {
      documentId: string;
      revision: number;
      resourceSignature: string;
      clusterSignatures: string[];
      engine: CiteprocEngineInstance;
      citationsPre: [string, number][];
      clusterRenderings: Map<string, string>;
      lastResult?: CitationDocumentResult;
    },
    request: CitationDocumentRequest,
    resourceSignature: string,
    clusterSignatures: string[]
  ): CitationDocumentResult {
    let bibliography: RenderedBibliography | null = null;
    const allDiagnostics: CitationEngineDiagnostic[] = session.lastResult
      ? [...session.lastResult.diagnostics]
      : [];

    if (request.includeBibliography) {
      try {
        const bibRes = session.engine.makeBibliography();
        if (bibRes) {
          const meta = bibRes[0];
          const entryStrings = bibRes[1];
          const entries: RenderedBibliographyEntry[] = [];

          for (let i = 0; i < entryStrings.length; i++) {
            const rawEntryHtml = entryStrings[i];
            const converted = convertCiteprocHtmlToNodes(rawEntryHtml);
            for (const diag of converted.diagnostics) {
              allDiagnostics.push(diag);
            }

            const itemIds =
              meta.entry_ids && meta.entry_ids[i] ? meta.entry_ids[i] : [];

            entries.push({
              itemIds,
              plainText: converted.plainText,
              content: converted.nodes,
            });
          }

          const layout: BibliographyLayout = {
            hangingIndent: Boolean(meta.hangingindent),
            entrySpacing:
              typeof meta.entryspacing === "number" ? meta.entryspacing : 1,
            lineSpacing:
              typeof meta.linespacing === "number" ? meta.linespacing : 1,
            secondFieldAlign:
              meta["second-field-align"] === "flush" ||
              meta["second-field-align"] === "margin"
                ? meta["second-field-align"]
                : undefined,
            maxOffset:
              typeof meta.maxoffset === "number" ? meta.maxoffset : undefined,
          };

          bibliography = { entries, layout };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        allDiagnostics.push({
          code: "CSL_PROCESSING_ERROR",
          severity: "error",
          message: `Error generating bibliography: ${msg}`,
        });
      }
    }

    const updatedResult: CitationDocumentResult = {
      documentId: request.documentId,
      revision: request.revision,
      citations: session.lastResult ? session.lastResult.citations : [],
      bibliography,
      diagnostics: allDiagnostics,
    };

    session.lastResult = updatedResult;
    this.sessionManager.setSession(request.documentId, {
      ...session,
      resourceSignature,
      clusterSignatures,
    });

    return cloneResult(updatedResult);
  }

  getBibCacheSize(): number {
    return this.bibCache.size;
  }

  disposeDocument(documentId: string): void {
    this.sessionManager.disposeDocument(documentId);
  }

  dispose(): void {
    this.sessionManager.dispose();
    this.bibCache.clear();
  }
}
