# Changelog — Feuillets CSL

## 0.1.4 — 2026-10-10

### Improved

- Added support for 37 BibTeX/BibLaTeX entry types and improved conversion of their metadata to CSL-JSON.
- Unsupported references no longer prevent independent valid citations from rendering throughout the document.
- Duplicate citekeys are treated as ambiguous, without selecting an arbitrary reference.
- Ambiguous or cyclic `crossref` dependencies cannot introduce unsafe inherited metadata into citation results.
- Preserved entry-specific diagnostics and the original syntax of unresolved citation groups.
- Strengthened tests with the real CSL engine and mandatory integration checks against Feuillets, including grouped citations, bibliography errors and resource repairs.

### Compatibility

- Feuillets 3.5.3 is recommended for full isolation of errors affecting cited references. Update Feuillets before this companion.
- BibLaTeX support covers the implemented entry types and metadata mappings.

## 0.1.3 — 2026-10-08

### Fixed

- Unknown citation keys no longer prevent valid citations elsewhere in the document from rendering.
- Citation clusters containing unknown keys remain in their original Pandoc syntax without partial rendering or invented bibliography entries.
- Preserved citation numbering, disambiguation and note context for valid citations around unresolved clusters.
- Added regression tests for mixed valid and unresolved citations, grouped citations and note-based CSL styles.
