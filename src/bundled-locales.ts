import type { CslLocaleProvider } from "./citeproc-engine.ts";
import enUSLocale from "./locales/locales-en-US.xml";
import frFRLocale from "./locales/locales-fr-FR.xml";

/**
 * Production CSL locale provider bundling official, full CSL locale definitions.
 *
 * Official full en-US and fr-FR locales are bundled locally; no runtime
 * download is required. Upstream metadata is preserved.
 *
 * Any unbundled locale returns null, resulting in deterministic fail-closed
 * CSL_LOCALE_UNAVAILABLE diagnostics.
 */
export class BundledCslLocaleProvider implements CslLocaleProvider {
  private readonly locales: Map<string, string>;

  constructor() {
    this.locales = new Map<string, string>([
      ["en-US", enUSLocale],
      ["fr-FR", frFRLocale],
    ]);
  }

  retrieveLocale(language: string): string | null {
    return this.locales.get(language) ?? null;
  }
}
