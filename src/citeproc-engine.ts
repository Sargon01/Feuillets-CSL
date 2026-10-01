/**
 * Feuillets CSL — Core Citeproc Document Engine (Lot 4)
 *
 * Implements CitationDocumentEngine using citeproc-ts in a stateless,
 * safe-text execution model.
 *
 * Invariants:
 * - One document request = one isolated citeproc evaluation context.
 * - Clusters processed in exact array order; retroactive updates applied automatically.
 * - Unknown citekeys, invalid style, or unavailable locale trigger fail-closed diagnostics.
 * - Safe text rendering (no raw HTML).
 * - Zero `any`.
 */

import { CSL } from "citeproc-ts";
import type {
  BibliographyLayout,
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
import type { CslItem } from "./bibtex-adapter.ts";

export interface CslLocaleProvider {
  retrieveLocale(language: string): string | null;
}

interface CiteprocReturnData {
  bibchange?: boolean;
  citation_errors?: unknown[];
}

type CiteprocUpdate = [number, string, string];

interface CiteprocCitationItem {
  id: string;
  prefix?: string;
  suffix?: string;
  locator?: string;
  label?: string;
  "suppress-author"?: boolean;
  "author-only"?: boolean;
}

interface CiteprocProperties {
  noteIndex?: number;
  mode?: string;
}

interface CiteprocCitationCluster {
  citationID: string;
  citationItems: CiteprocCitationItem[];
  properties: CiteprocProperties;
}

interface CiteprocBibliographyMeta {
  maxoffset?: number;
  entryspacing?: number;
  linespacing?: number;
  hangingindent?: boolean;
  "second-field-align"?: false | "flush" | "margin";
  entry_ids?: string[][];
  bibliography_errors?: unknown[];
}

interface CiteprocEngineInstance {
  setOutputFormat(format: string): void;
  updateItems(ids: string[]): void;
  processCitationCluster(
    citation: CiteprocCitationCluster,
    citationsPre: [string, number][],
    citationsPost: [string, number][]
  ): [CiteprocReturnData, CiteprocUpdate[]];
  makeBibliography(): [CiteprocBibliographyMeta, string[]] | false;
}

interface CslModule {
  Engine: new (
    sys: {
      retrieveLocale: (lang: string) => string | boolean;
      retrieveItem: (id: string) => CslItem | null;
    },
    style: string,
    lang?: string,
    forceLang?: boolean
  ) => CiteprocEngineInstance;
}

export class CiteprocDocumentEngine implements CitationDocumentEngine {
  private readonly localeProvider: CslLocaleProvider;

  constructor(localeProvider: CslLocaleProvider) {
    this.localeProvider = localeProvider;
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

    // 2. Parse and adapt bibliography sources
    const adapterResult = adaptBibliographies(request.bibliographies);
    const allDiagnostics: CitationEngineDiagnostic[] = [
      ...adapterResult.diagnostics,
    ];

    const hasFatalBibError = allDiagnostics.some((d) => d.severity === "error");
    if (hasFatalBibError) {
      return {
        documentId: request.documentId,
        revision: request.revision,
        citations: [],
        bibliography: null,
        diagnostics: allDiagnostics,
      };
    }

    // 3. Verify all cluster citekeys exist
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
        documentId: request.documentId,
        revision: request.revision,
        citations: [],
        bibliography: null,
        diagnostics: allDiagnostics,
      };
    }

    // 4. Verify requested locale
    const targetLocale = request.locale ? request.locale.trim() : "en-US";
    const primaryLocaleXml = this.localeProvider.retrieveLocale(targetLocale);
    if (!primaryLocaleXml) {
      allDiagnostics.push({
        code: "CSL_LOCALE_UNAVAILABLE",
        severity: "error",
        message: `Requested CSL locale '${targetLocale}' is unavailable.`,
      });
      return {
        documentId: request.documentId,
        revision: request.revision,
        citations: [],
        bibliography: null,
        diagnostics: allDiagnostics,
      };
    }

    // 5. Instantiate fresh citeproc engine
    const sys = {
      retrieveLocale: (lang: string): string | boolean => {
        const loc = this.localeProvider.retrieveLocale(lang);
        return loc !== null && loc.trim().length > 0 ? loc : false;
      },
      retrieveItem: (id: string): CslItem | null => {
        return adapterResult.items.get(id) ?? null;
      },
    };

    let engine: CiteprocEngineInstance;
    try {
      const EngineConstructor = (CSL as CslModule).Engine;
      engine = new EngineConstructor(sys, request.style.xml, targetLocale);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      allDiagnostics.push({
        code: "CSL_STYLE_ERROR",
        severity: "error",
        message: `CSL style parsing failed: ${msg}`,
      });
      return {
        documentId: request.documentId,
        revision: request.revision,
        citations: [],
        bibliography: null,
        diagnostics: allDiagnostics,
      };
    }

    // 6. Configure text output mode
    engine.setOutputFormat("text");

    // 7. Register cited items
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

    // 8. Process clusters in strict documentary order, tracking retroactive updates
    const clusterRenderings = new Map<string, string>();
    const citationsPre: [string, number][] = [];

    for (const cluster of request.clusters) {
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
          documentId: request.documentId,
          revision: request.revision,
          citations: [],
          bibliography: null,
          diagnostics: allDiagnostics,
        };
      }

      citationsPre.push([cluster.id, cluster.noteIndex ?? 0]);
    }

    // 9. Construct final rendered citations preserving original cluster order
    const renderedCitations: RenderedCitation[] = request.clusters.map(
      (cluster: CitationClusterInput) => {
        const plainText = clusterRenderings.get(cluster.id) ?? "";
        return {
          clusterId: cluster.id,
          plainText,
          content: [
            {
              type: "text",
              text: plainText,
            },
          ],
        };
      }
    );

    // 10. Generate bibliography if requested
    let bibliography: RenderedBibliography | null = null;
    if (request.includeBibliography) {
      try {
        const bibRes = engine.makeBibliography();
        if (bibRes) {
          const meta = bibRes[0];
          const entryStrings = bibRes[1];
          const entries: RenderedBibliographyEntry[] = [];

          for (let i = 0; i < entryStrings.length; i++) {
            const rawText = entryStrings[i].replace(/\r?\n$/, "");
            const itemIds =
              meta.entry_ids && meta.entry_ids[i] ? meta.entry_ids[i] : [];
            entries.push({
              itemIds,
              plainText: rawText,
              content: [
                {
                  type: "text",
                  text: rawText,
                },
              ],
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
          documentId: request.documentId,
          revision: request.revision,
          citations: [],
          bibliography: null,
          diagnostics: allDiagnostics,
        };
      }
    }

    return {
      documentId: request.documentId,
      revision: request.revision,
      citations: renderedCitations,
      bibliography,
      diagnostics: allDiagnostics,
    };
  }

  disposeDocument(_documentId: string): void {
    // Stateless in Lot 4; no-op
  }

  dispose(): void {
    // Stateless in Lot 4; no-op
  }
}
