# Feuillets CSL

An optional companion plugin for [Feuillets](https://github.com/Sargon01) that adds native Citation Style Language (CSL) citation processing.

> **Status:** Under active development (Lot 4 — Core CSL engine).
> The internal CSL processing engine is now implemented and tested in isolation. It is not yet exposed to Feuillets or integrated into the companion provider API.

## Overview

Feuillets CSL connects to the Feuillets writing studio through its public citation provider API (`plugin.api.citations`, API v1).

- **Companion plugin:** Feuillets CSL is strictly optional and requires Feuillets to be installed and active in Obsidian.
- **Citation syntax:** Citations remain in standard Pandoc format (`[@citekey]`, `[@item1; @item2]`).
- **100% Local & Offline:** The plugin operates entirely locally. No network connections, telemetry, or remote requests are made.
- **Autonomous & Resilient:** Handles asynchronous plugin loading and automatic re-registration if Feuillets is reloaded.

## Current Scope (Lot 4)

Lot 4 implements the isolated core CSL documentary engine:

- **BibTeX/BibLaTeX Adapter:** Converts raw BibTeX/BibLaTeX sources into internal CSL-JSON items via `@retorquere/bibtex-parser@11.0.0`. Supports standard types, creators (individual and corporate), dates, identifiers, LaTeX accent decoding, `@string` expansion, crossref inheritance, and duplicate citekey detection.
- **Citeproc Document Engine:** Implements the pure documentary engine contract (`CitationDocumentEngine`) using `citeproc-ts@0.2.5`. Renders full documents preserving strict cluster order.
- **Styles & Locales:** Supports author-date, numeric (with ordered sequence numbering `[1]`, `[2]`), and note styles (`noteIndex` preservation). Pluggable locale resolution (`CslLocaleProvider`).
- **Retroactive Updates:** Automatically tracks and reflects citation updates caused by downstream disambiguation.
- **Safe Output AST:** Emits sanitized text nodes into `CitationRenderNode` trees with zero raw HTML execution.
- **Fail-Closed Diagnostics:** Returns structured diagnostic errors on unknown citekeys, unavailable locales, style errors, or malformed data.
- **Strict Network Isolation:** 0 network dependencies, 0 network APIs, 0 remote calls (`npm run audit:network`).
- **Uncoupled Plugin Bundle:** The engine is not yet imported by `main.ts`, keeping `main.js` minimal (~5 KB).

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
```

## License

GNU Affero General Public License v3.0 or later ([AGPL-3.0-or-later](LICENSE)).
