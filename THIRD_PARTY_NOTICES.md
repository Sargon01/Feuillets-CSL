# Third-Party Software Notices and Licenses

Feuillets CSL incorporates or links against open-source software libraries. This document records third-party notices, copyrights, and licenses in compliance with their terms.

---

## 1. citeproc-ts

- **Package**: `citeproc-ts`
- **Version**: `0.2.5`
- **Upstream**: https://github.com/cormacrelf/citeproc-ts
- **License**: `(CPAL-1.0 OR AGPL-3.0-or-later)`
- **Licensing Branch Selected**: Feuillets CSL selects and complies with the **AGPL-3.0-or-later** option, which aligns with Feuillets CSL's project license (`AGPL-3.0-or-later`).
- **Copyright**: Copyright (c) Frank Bennett and contributors (citeproc-js), Cormac Relf (citeproc-ts).

---

## 2. @retorquere/bibtex-parser

- **Package**: `@retorquere/bibtex-parser`
- **Version**: `11.0.0`
- **Upstream**: https://github.com/retorquere/bibtex-parser
- **Author**: Emiliano Heyns (Retorquere)
- **License Notice**:
  - The published `package.json` declares `"license": "ISC"`.
  - The upstream source repository and distributed `LICENSE` file declare the **MIT License**.
  - Both ISC and MIT are permissive open-source licenses that permit redistribution and bundling under the AGPL-3.0-or-later license of Feuillets CSL.
- **Copyright**: Copyright (c) 2015-2024 Emiliano Heyns.

---

## 3. Test Fixtures Provenance

### A. CSL Locale Fixtures
- **Files**: `test/fixtures/locales/locales-en-US.xml`, `test/fixtures/locales/locales-fr-FR.xml`
- **Provenance**: Subsets derived directly from the official Citation Style Language (CSL) locales repository (https://github.com/citation-style-language/locales).
- **License**: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0), as declared in their respective XML headers.
- **Copyright**: Copyright (c) Citation Style Language contributors / translators (CSL Project, Nicolas Dufourceaud).

### B. CSL Style Fixtures
- **Files**: `test/fixtures/styles/author-date.csl`, `test/fixtures/styles/numeric.csl`, `test/fixtures/styles/note.csl`, `test/fixtures/styles/note-positions.csl`
- **Provenance**: Minimal test fixtures created specifically for the Feuillets CSL test suite to validate CSL engine integration across in-text (author-date), numeric, note, and contextual note position style classes.
- **Notice**: These are project-internal test fixtures authored for this repository, not copies of official third-party styles. They are distributed under the project's repository license (AGPL-3.0-or-later).
