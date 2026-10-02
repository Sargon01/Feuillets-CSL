# Third-Party Software Notices and Licenses

Feuillets CSL incorporates or links against open-source software libraries. This document records third-party notices, copyrights, and licenses in compliance with their terms.

---

## 1. citeproc-ts

- **Package**: `citeproc-ts`
- **Version**: `0.2.5`
- **Upstream**: https://codeberg.org/fiduswriter/citeproc-ts (as declared by the distributed `0.2.5` package)
- **License**: `(CPAL-1.0 OR AGPL-3.0-or-later)`
- **Licensing Branch Selected**: Feuillets CSL selects and complies with the **AGPL-3.0-or-later** option, which aligns with Feuillets CSL's project license (`AGPL-3.0-or-later`).
- **Copyright**: Copyright (c) 2009-2019 Frank Bennett (as declared in the distributed engine header).
- **Package Author and Contributors**: Johannes Wilm; Michael McMillan and Frank Bennett (as declared in the distributed `package.json`).

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
- **Copyright**: Copyright (c) 2017 Derek P Sifford, 2019 Derek P Sifford & Emiliano Heyns (as declared in the distributed `LICENSE`).

The distributed MIT license text is reproduced below:

```text
MIT License

Copyright (c) 2017 Derek P Sifford, 2019 Derek P Sifford & Emiliano Heyns

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

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

---

## 4. Runtime Bundled CSL Locales

- **Files**: `src/locales/locales-en-US.xml`, `src/locales/locales-fr-FR.xml`
- **Upstream Repository**: https://github.com/citation-style-language/locales
- **Upstream Commit**: `a89adece41013402236e2c9020972d7e931fbab8` (2026-09-10)
- **License**: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0), as declared in their respective XML headers.
- **Copyright & Contributors**:
  - `locales-en-US.xml`: Andrew Dunning, Sebastian Karcher, Rintze M. Zelle, Denis Meier, Brenton M. Wiernik, and CSL contributors.
  - `locales-fr-FR.xml`: Grégoire Colly, Collectif Zotero francophone, and CSL contributors.
- **Notice**: Full, unmodified official files bundled with complete XML metadata, contributor lists, and license declarations intact. Zero runtime downloads and zero network requests.
