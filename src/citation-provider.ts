import type { CitationEngineProvider } from "./feuillets-api-types.ts";
import { PROVIDER_ID, PROVIDER_NAME } from "./feuillets-api-types.ts";

export { PROVIDER_ID, PROVIDER_NAME };

/**
 * Minimal citation engine provider representing Feuillets CSL.
 *
 * Implements CitationEngineProvider without any heavy resources,
 * parsers, or CSL rendering logic.
 */
export class FeuilletsCslProvider implements CitationEngineProvider {
  readonly id: string = PROVIDER_ID;
  readonly name: string = PROVIDER_NAME;
  readonly version: string;

  constructor(version: string) {
    this.version = version;
  }
}
