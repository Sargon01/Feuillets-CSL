# Feuillets CSL

Feuillets CSL is the optional citation engine companion for [Feuillets](https://github.com/Sargon01/Feuillets) in Obsidian. It adds native Citation Style Language (CSL) processing while Feuillets remains responsible for the writing interface, Markdown/Pandoc parsing, project configuration, and bibliography and style resource resolution.

## Requirements

- Obsidian **1.13.0 or later**.
- Feuillets **3.4.0 or later**, installed and enabled.
- Feuillets CSL enabled alongside Feuillets.

The public compatibility target is **Feuillets 3.4.0 or later**. Check the [Feuillets releases](https://github.com/Sargon01/Feuillets/releases) and [Feuillets CSL releases](https://github.com/Sargon01/Feuillets-CSL/releases) for available downloads.

Feuillets CSL is optional: Feuillets remains usable without it. Install and enable both plugins to use native CSL rendering.

## What it adds

- Author-date, numeric, and note-based citation styles.
- Stateful note citations, including subsequent citations and *ibid.* where defined by the CSL style.
- Bibliography generation with the style's formatting and ordering.
- Grouped citations, locators, prefixes, and suffixes.
- Structured citation modes supplied by Feuillets: normal, suppress-author, author-only, and composite (author in the sentence with the remaining citation following it).

Feuillets supplies Pandoc citekeys and uses the provider's results in Live Preview, Reading Mode, Continuous mode, paginated Preview, native PDF, DOCX, EPUB, ODT, and generated bibliographies where CSL rendering is selected and applicable. These writing surfaces and exports are provided by Feuillets.

## Citation syntax

Write Pandoc citations normally:

```markdown
[@smith2024]
[@smith2024, p. 42]
[@smith2024; @doe2023]
@smith2024
```

These examples show a citation, a page locator, a grouped citation, and a citation in the sentence. Feuillets parses the Markdown/Pandoc syntax. Feuillets CSL receives structured citation clusters, not raw manuscript Markdown.

## Bibliography and CSL resources

Configure the bibliography and CSL style in **Feuillets**. There is no separate Feuillets CSL settings interface. Feuillets resolves the active workspace or project resources and passes their contents to the provider; Feuillets CSL does not scan the Vault for bibliography or style files.

The supported bibliography input is **BibTeX/BibLaTeX content**, processed through the bundled adapter. JSON bibliographies are not supported.

Citekeys must match bibliography entries exactly. Duplicate keys are treated as ambiguous, and unknown keys or invalid entries can prevent citation rendering. Correct the bibliography or citation rather than relying on an automatic substitute.

## Locales

The supported runtime locales are **`en-US`** and **`fr-FR`**. Both full locale files are bundled locally from the [official CSL locale project](https://github.com/citation-style-language/locales). If Feuillets supplies no locale, the engine defaults to `en-US`.

An unsupported requested runtime locale fails closed rather than silently switching language. Runtime locales supply language terms and date conventions; this does not restrict CSL styles to English or French styles.

## Local and private

Feuillets CSL processes the resources supplied by Feuillets locally. It requires no account and has no telemetry, citation-processing network service, runtime CSL locale download, or remote bibliography lookup.

## Fail-closed behavior

When a citation cannot be safely processed, Feuillets preserves the raw citation syntax. This safety fallback avoids inventing a citation or silently substituting another reference or language.

## Installation

### Community Plugins

After the plugin is published in the Obsidian Community directory, open **Settings → Community plugins → Browse**, search for **Feuillets CSL**, then install and enable it. Feuillets must also be installed and enabled.

### Manual installation

1. Install and enable Feuillets **3.4.0 or later**.
2. Download `main.js` and `manifest.json` from a [Feuillets CSL GitHub release](https://github.com/Sargon01/Feuillets-CSL/releases).
3. Create the folder `.obsidian/plugins/feuillets-csl/` inside your Vault and place both files there.
4. Reload Obsidian and enable **Feuillets CSL** in Community plugins.

## Usage

1. Install and enable Feuillets and Feuillets CSL.
2. Configure a bibliography and CSL style in Feuillets.
3. Write Pandoc citations normally.
4. Select CSL citation rendering in Feuillets where applicable.
5. Preview your manuscript or export it.

## Troubleshooting

If citations remain raw, check that:

- Both plugins are enabled and Feuillets is **3.4.0 or later**.
- CSL citation rendering is selected for the relevant Feuillets surface or export.
- The active project has a bibliography and CSL style configured in Feuillets, and both files exist and are valid.
- Each citekey exists exactly once in the supplied bibliography, with matching spelling and case.
- The requested runtime locale is `en-US` or `fr-FR`.

Raw syntax is a safety fallback when resources, citekeys, or the provider are unavailable or incompatible. Feuillets CSL reconnects automatically when Feuillets becomes available or is reloaded.

## Architecture

The companion connects through Feuillets citation provider API **v2**:

```text
Feuillets
  → parses Markdown and resolves resources
  → CitationDocumentRequest
Feuillets CSL
  → citeproc processing
  → CitationDocumentResult / safe semantic AST
Feuillets
  → renders the result in each surface/export
```

See [the engine contract](docs/engine-contract.md) for session, lifecycle, cache, and safe-output details.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
npm run lint
npm run lint:obsidian
npm run audit:network
```

### Engine testing tools

`npm run probe:engine` builds an isolated browser engine bundle in the ignored `.engine-audit/` directory for dependency inspection and size reporting. `npm run benchmark:engine` measures bibliography adaptation, initial rendering, incremental appends, and rebuilds. The test and benchmark tooling requires a Node.js version with native TypeScript support and `node:module.registerHooks` support for the test loader.

## License and third-party software

Feuillets CSL is licensed under [AGPL-3.0-or-later](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party software and CSL locale attribution and licenses.
