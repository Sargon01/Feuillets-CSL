# Feuillets CSL

An optional companion plugin for [Feuillets](https://github.com/Sargon01) that adds native Citation Style Language (CSL) citation processing.

> **Status:** Under active development (Lot 3 — Engine contract).
> The documentary contract is now defined. This repository does not yet include a CSL processing engine, and no CSL styles are rendered yet.

## Overview

Feuillets CSL connects to the Feuillets writing studio through its public citation provider API (`plugin.api.citations`, API v1).

- **Companion plugin:** Feuillets CSL is strictly optional and requires Feuillets to be installed and active in Obsidian.
- **Citation syntax:** Citations remain in standard Pandoc format (`[@citekey]`, `[@item1; @item2]`).
- **100% Local & Offline:** The plugin operates entirely locally. No network connections, telemetry, or remote requests are made now or in future releases.
- **Autonomous & Resilient:** Handles asynchronous plugin loading and automatic re-registration if Feuillets is reloaded.

## Current Scope (Lot 3)

Lot 3 establishes the pure documentary engine contract and validation layer:

- Formal document citation request and result contracts (`CitationDocumentRequest`, `CitationDocumentResult`).
- Pure data exchange: Feuillets resolves files and parses syntax; Feuillets CSL receives structured clusters and raw sources.
- Safe, HTML-free rendering AST (`CitationRenderNode`) guaranteeing zero raw HTML output.
- Strict preservation of documentary citation order.
- Runtime validation (`validateCitationDocumentRequest`) rejecting invalid inputs without silent normalization.
- Companion provider remains minimal (`FeuilletsCslProvider`, API v1) with zero engine methods exposed on the provider.
- Zero runtime dependencies, zero CSL parsing/rendering code, zero network access.

Future lots will integrate the local CSL processor and bibliography generator.

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build bundle (CJS, ES2018)
npm run build

# Run unit tests
npm test

# Lint code
npm run lint
```

## License

GNU Affero General Public License v3.0 or later ([AGPL-3.0-or-later](LICENSE)).
