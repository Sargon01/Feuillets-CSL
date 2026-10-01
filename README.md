# Feuillets CSL

An optional companion plugin for [Feuillets](https://github.com/Sargon01) that adds native Citation Style Language (CSL) citation processing.

> **Status:** Under active development (Lot 6 — Public provider bridge).
> The real CSL documentary engine is now exposed to Feuillets through the public citation provider API v2 (`renderDocument` and `disposeDocument`).
> Full official `en-US` and `fr-FR` runtime locales are bundled locally. Other locales are not yet bundled and fail closed with `CSL_LOCALE_UNAVAILABLE`.
> Feuillets surfaces (Live Preview, Reading Mode, Continu, Aperçu, Bibliographie, exports) do not consume the engine yet. Real-time UI rendering and host adapters will be integrated in Lot 7.

## Overview

Feuillets CSL connects to the Feuillets writing studio through its public citation provider API (`plugin.api.citations`, API v2).

- **Companion plugin:** Feuillets CSL is strictly optional and requires Feuillets to be installed and active in Obsidian.
- **Citation syntax:** Citations remain in standard Pandoc format (`[@citekey]`, `[@item1; @item2]`).
- **100% Local & Offline:** The plugin operates entirely locally. No network connections, telemetry, or remote requests are made.
- **Autonomous & Resilient:** Handles asynchronous plugin loading and automatic re-registration if Feuillets is reloaded.
- **Pure Documentary Bridge:** Exchanges pure DTO structures (`CitationDocumentRequest` and `CitationDocumentResult`) with zero Obsidian types, zero Vault access, and zero raw HTML.

## Current Scope (Lot 6)

Lot 6 establishes the real public API bridge between Feuillets and Feuillets CSL:

- **Provider API v2:** `CitationEngineProvider` now provides `renderDocument(request)` and `disposeDocument(documentId)` across the plugin boundary.
- **Real Engine Integration:** `main.ts` connects `BundledCslLocaleProvider` and `CiteprocDocumentEngine` to `FeuilletsCslProvider`.
- **Bundled Runtime Locales:** Official, full CSL locale definitions for `en-US` and `fr-FR` from `citation-style-language/locales` are embedded locally with complete metadata, contributors, and licensing notices preserved.
- **Fail-Closed Locale Strategy:** Requests for unbundled locales return `CSL_LOCALE_UNAVAILABLE` rather than falling back silently.
- **Independent Lifecycle:** Plugin unloads dispose local sessions and shared caches via `provider.dispose()`, even if a newer provider has registered with Feuillets. Reconnecting after a Feuillets reload preserves active engine sessions.
- **Strict Network Isolation:** 0 network dependencies, 0 network APIs, 0 remote calls (`npm run audit:network`).

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build plugin bundle (CJS, ES2018)
npm run build

# Run unit tests
npm test

# Lint code (general and Obsidian review gate)
npm run lint
npm run lint:obsidian

# Audit network isolation
npm run audit:network

# Build and measure engine probe bundle
npm run probe:engine

# Run informative performance benchmark
npm run benchmark:engine
```

## License

GNU Affero General Public License v3.0 or later ([AGPL-3.0-or-later](LICENSE)).
