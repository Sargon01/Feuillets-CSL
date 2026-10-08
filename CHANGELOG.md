# Changelog — Feuillets CSL

## 0.1.3 — 2026-10-08

### Fixed

- Unknown citation keys no longer prevent valid citations elsewhere in the document from rendering.
- Citation clusters containing unknown keys remain in their original Pandoc syntax without partial rendering or invented bibliography entries.
- Preserved citation numbering, disambiguation and note context for valid citations around unresolved clusters.
- Added regression tests for mixed valid and unresolved citations, grouped citations and note-based CSL styles.
