# Changelog — Feuillets CSL

## 0.1.5 — 2026-10-12

### Fixed

- Corrected conversion of astronomical BibLaTeX years to historical CSL years for publication and original dates: year zero becomes 1 BC, and negative years retain the correct historical year and era.
- Preserved month and day components for supported signed dates and rejected malformed or unsupported negative date forms without inventing a date.
- Original dates (`origdate`) now inherit through `crossref` across bibliography files, consistently with entries parsed together in one file.
- Local fields take priority over inherited original dates, including explicit unparseable values; the nearest ancestor and entry-type inheritance rules remain aligned with the BibLaTeX parser.
- Added regression coverage for astronomical dates, year zero, original-date inheritance and edge cases, including real CSL rendering and Chicago notes and bibliography.

### Compatibility

- No public API changes or new dependencies. Existing BibLaTeX parsing and CSL rendering engines are retained.

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
