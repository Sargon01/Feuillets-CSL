# Feuillets CSL

An optional companion plugin for [Feuillets](https://github.com/Sargon01) that adds native Citation Style Language (CSL) citation processing.

> **Status:** Under active development (Lot 5 — Stateful document engine).
> The internal CSL processing engine now supports persistent document sessions, safe append-only incremental rendering, automated rebuilds on non-safe modifications, rich formatting AST output without raw HTML, and full lifecycle disposal. It is not yet exposed to Feuillets or integrated into the companion provider API.

## Overview

Feuillets CSL connects to the Feuillets writing studio through its public citation provider API (`plugin.api.citations`, API v1).

- **Companion plugin:** Feuillets CSL is strictly optional and requires Feuillets to be installed and active in Obsidian.
- **Citation syntax:** Citations remain in standard Pandoc format (`[@citekey]`, `[@item1; @item2]`).
- **100% Local & Offline:** The plugin operates entirely locally. No network connections, telemetry, or remote requests are made.
- **Autonomous & Resilient:** Handles asynchronous plugin loading and automatic re-registration if Feuillets is reloaded.

## Current Scope (Lot 5)

Lot 5 establishes the stateful CSL document engine with rich safe output:

- **Isolated Document Sessions:** Every document (`documentId`) maintains its own private, isolated citeproc engine session. No engine instance is ever shared across documents.
- **Append-Only Incremental Fast Path:** When newly submitted clusters are an exact append-only extension of the previous sequence, the existing engine state is preserved and only appended clusters are evaluated (~10x faster).
- **Automated Rebuilds:** Any non-safe modification (middle insertion, cluster deletion, reordering, locator/mode/noteIndex alteration, or resource version change) triggers an automated full rebuild.
- **Rich AST Rendering:** Formatted output (italics, oblique, bold, small-caps, underline, super/subscripts, roman resets, numeric layout blocks, and structured link intentions) is converted into a safe `CitationRenderNode` AST with zero raw HTML strings.
- **Clean Plain Text:** Each rendered citation and bibliography entry provides a guaranteed tag-free `plainText` representation derived from AST traversal.
- **Deterministic Revision Handling:** Rejects stale revisions (`STALE_REVISION`) and prevents divergent document content on identical revisions (`REVISION_CONFLICT`).
- **Immutable Bibliographic Caching:** Parsed BibTeX item stores are cached by resource ID and version, shared safely across documents while citeproc engines remain strictly isolated.
- **Lifecycle Disposal:** Full resource and session cleanup via `disposeDocument(documentId)` and `dispose()`.
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

# Run informative performance benchmark
npm run benchmark:engine
```

## License

GNU Affero General Public License v3.0 or later ([AGPL-3.0-or-later](LICENSE)).
