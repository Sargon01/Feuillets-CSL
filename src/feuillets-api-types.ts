/**
 * Constants and types for the Feuillets citation engine provider contract (v2).
 *
 * This contract defines the subset required for companion plugins
 * such as Feuillets CSL to register citation providers with Feuillets.
 */

import type {
  CitationDocumentRequest,
  CitationDocumentResult,
} from "./engine-contract.ts";

export const CITATION_API_VERSION = 2;
export const FEUILLETS_PLUGIN_ID = "feuillets";
export const PROVIDER_ID = "feuillets-csl";
export const PROVIDER_NAME = "Feuillets CSL";

export interface CitationEngineProvider {
  id: string;
  name: string;
  version: string;
  renderDocument(
    request: CitationDocumentRequest
  ): Promise<CitationDocumentResult>;
  disposeDocument(documentId: string): void;
}

export interface FeuilletsCitationApi {
  readonly apiVersion: number;
  registerProvider(provider: CitationEngineProvider): void;
  unregisterProvider(providerId: string): void;
  getProvider(providerId?: string): CitationEngineProvider | null;
}

export interface FeuilletsPublicApiSubset {
  readonly citations: FeuilletsCitationApi;
}
