import type {
  CitationClusterInput,
  CitationDocumentRequest,
  CitationDocumentResult,
} from "./engine-contract.ts";

export interface CiteprocReturnData {
  bibchange?: boolean;
  citation_errors?: unknown[];
}

export type CiteprocUpdate = [number, string, string];

export interface CiteprocCitationItem {
  id: string;
  prefix?: string;
  suffix?: string;
  locator?: string;
  label?: string;
  "suppress-author"?: boolean;
  "author-only"?: boolean;
}

export interface CiteprocProperties {
  noteIndex?: number;
  mode?: string;
}

export interface CiteprocCitationCluster {
  citationID: string;
  citationItems: CiteprocCitationItem[];
  properties: CiteprocProperties;
}

export interface CiteprocBibliographyMeta {
  maxoffset?: number;
  entryspacing?: number;
  linespacing?: number;
  hangingindent?: boolean;
  "second-field-align"?: false | "flush" | "margin";
  entry_ids?: string[][];
  bibliography_errors?: unknown[];
}

export interface CiteprocEngineInstance {
  setOutputFormat(format: string): void;
  updateItems(ids: string[]): void;
  processCitationCluster(
    citation: CiteprocCitationCluster,
    citationsPre: [string, number][],
    citationsPost: [string, number][]
  ): [CiteprocReturnData, CiteprocUpdate[]];
  makeBibliography(): [CiteprocBibliographyMeta, string[]] | false;
}

export interface DocumentSession {
  documentId: string;
  revision: number;
  resourceSignature: string;
  clusterSignatures: string[];
  engine: CiteprocEngineInstance;
  citationsPre: [string, number][];
  clusterRenderings: Map<string, string>;
  lastResult?: CitationDocumentResult;
}

/**
 * Computes a deterministic, unambiguous resource signature.
 *
 * Invariant: Uses ONLY opaque tokens provided in the request:
 * - request.style.id
 * - request.style.version
 * - request.locale ?? ""
 * - for each bibliography in exact received order: [id, version, format]
 *
 * The order of bibliographies is part of the identity.
 * Content (style.xml, bibliography.content) NEVER participates in this signature.
 * Same id + same version = same resource according to the contract.
 */
export function computeResourceSignature(request: CitationDocumentRequest): string {
  return JSON.stringify({
    styleId: request.style.id,
    styleVersion: request.style.version,
    locale: request.locale ?? "",
    bibliographies: request.bibliographies.map((b) => [b.id, b.version, b.format]),
  });
}

/**
 * Computes deterministic cluster signatures for each CitationClusterInput.
 */
export function computeClusterSignatures(clusters: CitationClusterInput[]): string[] {
  return clusters.map((c) => {
    const itemsPart = c.items
      .map(
        (it) =>
          `${it.id}:${it.prefix ?? ""}:${it.suffix ?? ""}:${it.locator ?? ""}:${it.label ?? ""}:${it.mode ?? "normal"}`
      )
      .join(";");
    return `${c.id}|note:${c.noteIndex ?? 0}|items:${itemsPart}`;
  });
}

/**
 * Determines whether the new sequence of cluster signatures is an EXACT append-only extension
 * of the existing session sequence.
 */
export function isAppendOnly(
  existingSignatures: string[],
  newSignatures: string[]
): boolean {
  if (newSignatures.length < existingSignatures.length) {
    return false;
  }
  for (let i = 0; i < existingSignatures.length; i++) {
    if (existingSignatures[i] !== newSignatures[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Clones a CitationDocumentResult to return an isolated copy and protect internal caches from mutation.
 */
export function cloneResult(result: CitationDocumentResult): CitationDocumentResult {
  return JSON.parse(JSON.stringify(result)) as CitationDocumentResult;
}

/**
 * Manages active document sessions.
 *
 * Invariant: Every document session is strictly isolated by documentId.
 * No citeproc Engine is EVER shared between documents.
 */
export class DocumentSessionManager {
  private readonly sessions = new Map<string, DocumentSession>();

  hasSession(docId: string): boolean {
    return this.sessions.has(docId);
  }

  getSession(docId: string): DocumentSession | undefined {
    return this.sessions.get(docId);
  }

  setSession(docId: string, session: DocumentSession): void {
    this.sessions.set(docId, session);
  }

  disposeDocument(docId: string): void {
    this.sessions.delete(docId);
  }

  dispose(): void {
    this.sessions.clear();
  }

  size(): number {
    return this.sessions.size;
  }
}
