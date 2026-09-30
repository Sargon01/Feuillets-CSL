# Feuillets CSL

An optional companion plugin for [Feuillets](https://github.com/Sargon01) that adds native Citation Style Language (CSL) citation processing.

> **Status:** Under active development (Lot 2: Companion Skeleton & Bridge).
> This repository does not yet include the CSL processing engine.

## Overview

Feuillets CSL connects to the Feuillets writing studio through its public citation provider API (`plugin.api.citations`, API v1).

- **Companion plugin:** Feuillets CSL is strictly optional and requires Feuillets to be installed and active in Obsidian.
- **Citation syntax:** Citations remain in standard Pandoc format (`[@citekey]`, `[@item1; @item2]`).
- **100% Local & Offline:** The plugin operates entirely locally. No network connections, telemetry, or remote requests are made now or in future releases.
- **Autonomous & Resilient:** Handles asynchronous plugin loading and automatic re-registration if Feuillets is reloaded.

## Current Scope (Lot 2)

Lot 2 establishes the autonomous plugin architecture and handshake protocol:

- Obsidian plugin lifecycle management (`onload`, `onunload`).
- Safe runtime discovery and validation of Feuillets' `plugin.api.citations` (API v1).
- Minimal provider registration under id `feuillets-csl`.
- Idempotent periodic heartbeat for seamless re-registration upon Feuillets reload.
- Clean unregistration on unload with guardrails preventing stale instances from unregistering newer providers.
- Zero runtime dependencies, zero CSL parsing/rendering code, zero network access.

Future lots will introduce the local CSL processor and bibliography generator.

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
