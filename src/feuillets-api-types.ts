/**
 * Constants and types for the Feuillets citation engine provider contract.
 *
 * This contract defines the minimal subset required for companion plugins
 * such as Feuillets CSL to register citation providers with Feuillets.
 */

export const CITATION_API_VERSION = 1;
export const FEUILLETS_PLUGIN_ID = "feuillets";
export const PROVIDER_ID = "feuillets-csl";
export const PROVIDER_NAME = "Feuillets CSL";

export interface CitationEngineProvider {
  id: string;
  name: string;
  version: string;
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
