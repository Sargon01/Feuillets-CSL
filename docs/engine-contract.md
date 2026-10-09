# Citation Document Engine Contract

This document describes the current boundary between **Feuillets**, the host writing studio, and **Feuillets CSL**, its optional citation engine companion. The public citation provider API is **v2**; the internal `CitationDocumentEngine` implements rendering and lifecycle operations delegated to by `FeuilletsCslProvider`.

## Architecture and data flow

```text
Feuillets
  → parses Markdown/Pandoc syntax and resolves bibliography/style resources
  → CitationDocumentRequest (resource contents + ordered citation clusters)
Feuillets CSL
  → bibliography adaptation and stateful citeproc processing
  → CitationDocumentResult (plain text + safe semantic AST + diagnostics)
Feuillets
  → renders citations and bibliographies in each writing surface/export
```

Feuillets CSL never reads the Obsidian Vault, discovers files, interprets resource IDs as paths, or parses manuscript Markdown. Feuillets owns project/workspace configuration and resource resolution. Bibliographies and CSL styles reach the engine as in-memory strings. No network service, remote bibliography lookup, or runtime locale download participates in processing.

## Requests and coherent citation documents

`CitationDocumentRequest` contains:

- A non-empty `documentId` and a non-negative integer `revision`.
- One CSL style with an opaque `id`, `version`, and XML content.
- At least one bibliography source, each with a unique opaque `id`, a `version`, `format: "bibtex"`, and non-empty content.
- An optional runtime `locale`.
- The complete ordered `clusters` sequence for that document revision.
- `includeBibliography`, which controls bibliography generation.

The bundled adapter processes BibTeX/BibLaTeX content into internal CSL items. It preserves exact citekeys, rejects unsupported entry types, and removes duplicate keys rather than choosing a first or last occurrence. Unknown or rejected referenced keys leave only their whole cluster unresolved; genuinely fatal bibliography-source diagnostics prevent document rendering.

Clusters have unique IDs and non-empty, order-sensitive item arrays. Items carry exact citekeys, optional prefixes, suffixes, locators and locator labels, and the modes `normal`, `suppress-author`, `author-only`, or `composite`. Optional `noteIndex` values are non-negative integers. Feuillets supplies document positions and note context; source offsets are outside this contract.

Feuillets builds a coherent logical citation document for each surface. Feuillets CSL receives one ordered cluster sequence per document session. Cluster order determines numeric numbering, note positions, subsequent/ibid behavior, and disambiguation. Continuous and composite rendering, including resource resolution and mapping results back to source segments, remain host-owned. Provider state is isolated by `documentId`, even when documents share bibliography or style resources.

## Resource identity and cache invalidation

Resource versions are **opaque caller-provided invalidation tokens**. Feuillets must change the relevant version when its resource content changes; the engine does not discover changed content from the Vault or hash the supplied content.

Session resource identity includes:

- Style `id` and `version`.
- The requested locale (`""` when omitted).
- The ordered bibliography tuples `[id, version, format]`.

The parsed bibliography cache uses that same ordered bibliography tuple sequence. Order is significant because the adapter resolves sources together, including cross-references between sources. Parsed bibliography data may be reused across documents, while each document retains its own citeproc engine and citation context.

Unchanged IDs and versions mean unchanged resources, even if the caller passes different content strings. Changed resource identity or locale requires a session rebuild at a newer revision. The public contract exposes no cache controls or cached HTML.

## Rendering, revisions, and sessions

`renderDocument(request)` returns a promise of `CitationDocumentResult`, preserving the request's document ID and revision. Runtime validation rejects invalid fields without silent coercion and reports schema errors with field paths.

For an existing document session:

- An older revision fails closed with `STALE_REVISION`.
- The same revision with matching resource and cluster signatures returns an isolated copy of the cached result. Changing only `includeBibliography` recomputes the bibliography without rebuilding citation state.
- The same revision with changed resource or cluster signatures fails closed with `REVISION_CONFLICT`.
- A newer revision with matching resources and an unchanged cluster prefix reuses the session for an append-only update.
- Other newer revisions rebuild citation state from the complete ordered sequence.

Append-only processing still applies citeproc updates to earlier clusters: a newly cited work can change an earlier citation through disambiguation. Stateful note context is carried through the ordered citation history and note indexes, supporting first, subsequent, ibid, and ibid-with-locator forms when defined by the style.

Results are cloned before returning so caller mutations cannot alter cached results. Feuillets must also check revisions and discard obsolete asynchronous results before displaying them.

## Safe semantic rendering AST

`CitationRenderNode` carries structure rather than executable markup:

| Node | Meaning |
| --- | --- |
| `CitationRenderText` | Plain text, including ordinary quotes, punctuation, and literal angle brackets. |
| `CitationRenderSpan` | Inline children with explicit typography styles. |
| `CitationRenderBlock` | Bibliography layout: `block`, `left-margin`, `right-inline`, or `indent`. |
| `CitationRenderLink` | A link intention with `href` and children; the host sanitizes protocols before rendering. |

Span styles cover font style (`normal`, `italic`, `oblique`), font weight (`normal`, `bold`, `light`), font variant (`normal`, `small-caps`), text decoration (`none`, `underline`), and vertical alignment (`baseline`, `superscript`, `subscript`). Explicit reset values preserve cases such as roman text inside an italic title.

The engine uses citeproc's HTML output internally, then converts supported formatting into this AST. Unknown tags produce a warning and contribute text without becoming markup nodes. Raw HTML never crosses the provider boundary: consumers cannot receive arbitrary HTML, CSS, event handlers, or DOM objects through rendering fields. This keeps the citation engine independent of host rendering and allows each surface/export to interpret the same semantic result safely. Structured link data is not a substitute for host-side protocol checks.

`RenderedCitation` identifies its cluster and provides `plainText` and AST content. A bibliography contains entries with item IDs, plain text, and AST content, plus layout metadata for hanging indents, entry/line spacing, second-field alignment, and maximum label offset. Bibliographies are generated from cited items; `includeBibliography: false` yields `bibliography: null`.

## Locales and failure handling

The production locale provider bundles the full official `en-US` and `fr-FR` locales. When the request omits a locale, the engine uses `en-US`. An unsupported requested locale returns `CSL_LOCALE_UNAVAILABLE` without silently switching to another language. Styles and runtime locales are separate resources.

Fatal validation, revision, bibliography-source, locale, style-parsing, and citation-processing failures return diagnostics rather than substitute citations. Rejected bibliography entries are library warnings when unused. Cited unknown, incompatible, duplicate, ambiguous-crossref or cyclic references produce errors tied to their requested cluster and key; the whole affected cluster is omitted. Compatible Feuillets hosts accept those partial results while rejecting all global errors and unexplained missing clusters. Warning diagnostics can accompany usable output, for example when unsupported citeproc markup is reduced to text. Feuillets owns the user-visible raw-syntax fallback.

## Lifecycle and provider registration

`disposeDocument(documentId)` releases only that document's session. Other sessions and the shared parsed bibliography cache remain available. Rendering that document again creates a fresh session, without the disposed session's revision constraints.

Internal `dispose()` releases all document sessions and the shared bibliography cache. It is used during companion plugin unload; it is not an additional public API v2 method.

The plugin registers immediately when a compatible Feuillets citation API is available, retries when Obsidian's layout is ready, and checks every four seconds for a missing or replaced registry. Registration is idempotent. Reconnecting after a Feuillets reload retains the companion's engine sessions until explicitly disposed. Unload unregisters the provider only if the current registry still holds that instance, then disposes the companion's resources even if another provider has replaced it.

Compatibility discovery checks API v2 and the registry methods, rather than the host plugin's version string. API discovery is available from Feuillets 3.4.0, but partial rendering with new recoverable diagnostics requires the host fix described in the [compatibility matrix](compatibility.md). Published Feuillets 3.5.2 accepts `UNKNOWN_CITEKEY` only; it rejects the new cited-entry diagnostics for the complete document.

See [the TypeScript contract](../src/engine-contract.ts) for exported types and [third-party notices](../THIRD_PARTY_NOTICES.md) for dependency and locale provenance.
