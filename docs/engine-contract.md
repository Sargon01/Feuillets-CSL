# Pure CSL Documentary Engine Contract

This document defines the pure documentary contract between **Feuillets** (the host writing studio) and **Feuillets CSL** (the citation companion plugin).

## Architecture & Data Flow

```
Feuillets (Host Writing Studio)
   │
   │ Resolves file references, parses Markdown / Pandoc syntax
   ▼
CitationDocumentRequest (Pure Data)
   │
   │ Raw resources + ordered citation clusters (HTML-free)
   ▼
Feuillets CSL Engine
   │
   │ Pure CSL evaluation & rendering
   ▼
CitationDocumentResult (Safe Semantic AST)
   │
   │ Plain text + styled spans + layout blocks + links + diagnostics (Zero raw HTML)
```

Feuillets CSL has no knowledge of the Obsidian Vault, Binder, Continu, workspaces, research folders, or internal filesystem resolution paths. Feuillets resolves all resources into raw strings before calling Feuillets CSL.

---

## Safe Semantic Rendering AST

The rendering output is a 100% structured, HTML-free Abstract Syntax Tree (`CitationRenderNode`):

1. **Leaf Text (`CitationRenderText`)**: Plain text content. Quotes, punctuation, parentheses, and brackets are ordinary text nodes.
2. **Inline Spans (`CitationRenderSpan`)**: Carry a granular `CitationTextStyle` object covering:
   - `fontStyle`: `"normal" | "italic" | "oblique"`
   - `fontWeight`: `"normal" | "bold" | "light"`
   - `fontVariant`: `"normal" | "small-caps"`
   - `textDecoration`: `"none" | "underline"`
   - `verticalAlign`: `"baseline" | "superscript" | "subscript"`
   Explicit values allow both applying styles and explicitly cancelling/reverting them (e.g., reverting to `normal` fontStyle within an italic title).
3. **Bibliography Layout Blocks (`CitationRenderBlock`)**: Preserve CSL layout structures via `display`:
   - `"block"`: Standard standalone block.
   - `"left-margin"`: Hanging column (e.g., numeric callouts `[1]` in IEEE styles).
   - `"right-inline"`: Inline content column aligned with left-margin callouts.
   - `"indent"`: Indented paragraph block.
4. **Structured Hyperlinks (`CitationRenderLink`)**: Represent link intentions (`href` + `children`) for DOIs, URLs, and PMIDs without any markup or DOM coupling.

---

## The 10 Invariants

1. **Feuillets resolves files and parses Markdown / Pandoc syntax**
   Feuillets is solely responsible for resolving bibliography paths, locating CSL styles, and parsing inline Markdown / Pandoc citation syntax (`[@citekey]`). Feuillets CSL never performs file discovery or Markdown tokenization.

2. **Feuillets CSL never reads the Vault**
   The engine does not import Obsidian `TFile` or `TFolder` types, never calls Vault read APIs, and never accesses the filesystem directly. All inputs are passed in-memory within the request.

3. **Feuillets transmits a complete, ordered sequence of citation clusters**
   Every request represents the entire set of citations present in the document at that revision. Feuillets passes clusters in the exact order they appear in the logical document.

4. **Cluster order is the official documentary citation order**
   The array index of each citation cluster defines its citation sequence. This invariant is required for:
   - Numeric citation styles (e.g., IEEE `[1]`, `[2]`, `[1]`);
   - Note-based styles (e.g., Chicago Notes & Bibliography);
   - Subsequent / ibid citation resolution;
   - Disambiguation algorithms.

5. **`documentId` isolates documentary states**
   Two documents referencing the same `.bib` and `.csl` sources maintain strictly separated citation contexts. Engine citation numbers, disambiguation state, and note references are scoped entirely to a single `documentId`.

6. **`revision` guards against obsolete asynchronous results**
   Each document request carries a monotonic non-negative integer `revision`. Because rendering operations are asynchronous, the caller uses `revision` to discard late-arriving results that belong to earlier document states.

7. **`style.version` and `bibliography.version` enable future cache invalidation**
   Resource versions are opaque strings provided by Feuillets (e.g., file modification hashes or timestamps). The engine will use them to invalidate cached ASTs and parsed bibliographic data when sources change.

8. **Zero raw HTML crosses the contract boundary**
   No rendered output contains raw HTML strings (`html`, `innerHTML`, `outerHTML`, `rawHtml`, or `unsafeHtml`). All formatting is structured through the safe semantic AST (`CitationRenderText`, `CitationRenderSpan`, `CitationRenderBlock`, `CitationRenderLink`). No field allows transporting arbitrary markup.

9. **One document request = one coherent CSL context**
   A single `CitationDocumentRequest` corresponds to exactly one coherent citation universe. In multi-document views such as Continu, Feuillets will determine how and when to partition requests into coherent citation contexts.

10. **Optimizations and caches remain strictly internal to the engine**
    Session caching, AST memoization, incremental evaluation, and resource indexation are private implementation details of Feuillets CSL. The public contract exposes only stateless request / result interactions and explicit lifecycle disposal (`disposeDocument`, `dispose`).
