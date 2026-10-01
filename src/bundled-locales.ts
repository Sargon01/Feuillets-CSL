import type { CslLocaleProvider } from "./citeproc-engine.ts";
import enUSLocale from "./locales/locales-en-US.xml";
import frFRLocale from "./locales/locales-fr-FR.xml";

/**
 * Production CSL locale provider bundling official, full CSL locale definitions.
 *
 * In Lot 6, officially supports en-US and fr-FR with zero runtime downloads,
 * zero network access, and complete upstream metadata preserved.
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
