import type { CitationEngineProvider } from "./feuillets-api-types.ts";
import { PROVIDER_ID, PROVIDER_NAME } from "./feuillets-api-types.ts";
import type {
  CitationDocumentEngine,
  CitationDocumentRequest,
  CitationDocumentResult,
} from "./engine-contract.ts";

export { PROVIDER_ID, PROVIDER_NAME };

/**
 * Citation engine provider representing Feuillets CSL (API v2).
 *
 * Wraps an internal CitationDocumentEngine instance and delegates
 * renderDocument() and per-document disposeDocument() calls to it.
 *
 * Also provides an internal dispose() method to release all engine sessions
 * and caches during plugin unload.
 */
export class FeuilletsCslProvider implements CitationEngineProvider {
  readonly id: string = PROVIDER_ID;
  readonly name: string = PROVIDER_NAME;
  readonly version: string;
  private readonly engine: CitationDocumentEngine;

  constructor(version: string, engine: CitationDocumentEngine) {
    this.version = version;
    this.engine = engine;
  }

  async renderDocument(
    request: CitationDocumentRequest
  ): Promise<CitationDocumentResult> {
    return this.engine.renderDocument(request);
  }

  disposeDocument(documentId: string): void {
    this.engine.disposeDocument(documentId);
  }

  /**
   * Internal plugin-level lifecycle cleanup.
   * Releases all document sessions and shared caches when Feuillets CSL unloads.
   */
  dispose(): void {
    this.engine.dispose();
  }
}
