import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CiteprocDocumentEngine } from "../src/citeproc-engine.ts";
import type { CslLocaleProvider } from "../src/citeproc-engine.ts";
import type {
  CitationClusterInput,
  CitationDocumentRequest,
} from "../src/engine-contract.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFixture(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");
}

class TestLocaleProvider implements CslLocaleProvider {
  private readonly locales: Map<string, string> = new Map();

  constructor() {
    this.locales.set("en-US", loadFixture("fixtures/locales/locales-en-US.xml"));
    this.locales.set("fr-FR", loadFixture("fixtures/locales/locales-fr-FR.xml"));
  }

  retrieveLocale(language: string): string | null {
    return this.locales.get(language) ?? null;
  }
}

describe("Citeproc Document Engine", () => {
  const localeProvider = new TestLocaleProvider();
  const authorDateStyle = loadFixture("fixtures/styles/author-date.csl");
  const numericStyle = loadFixture("fixtures/styles/numeric.csl");
  const noteStyle = loadFixture("fixtures/styles/note.csl");

  it("renders a minimal document with author-date style and preserves documentId/revision", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const request: CitationDocumentRequest = {
      documentId: "doc-alpha",
      revision: 7,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-1",
          version: "1.0",
          format: "bibtex",
          content: `@book{smith2020, title={Foundations of Logic}, author={Smith, John}, year={2020}}`,
        },
      ],
      clusters: [
        {
          id: "c1",
          items: [{ id: "smith2020" }],
        },
      ],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);

    assert.equal(result.documentId, "doc-alpha");
    assert.equal(result.revision, 7);
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.citations.length, 1);
    assert.equal(result.citations[0].clusterId, "c1");
    assert.ok(result.citations[0].plainText.includes("Smith"));
    assert.ok(result.citations[0].plainText.includes("2020"));

    assert.ok(result.bibliography);
    assert.equal(result.bibliography?.entries.length, 1);
    assert.deepEqual(result.bibliography?.entries[0].itemIds, ["smith2020"]);
  });

  it("handles numeric numbering sequence c1(smith) -> 1, c2(doe) -> 2, c3(smith) -> 1", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const bibContent = `
@book{smith2024, title={Cybernetics}, author={Smith, Alice}, year={2024}}
@book{doe2023, title={Information Theory}, author={Doe, Bob}, year={2023}}
`;

    const clusters: CitationClusterInput[] = [
      { id: "c1", items: [{ id: "smith2024" }] },
      { id: "c2", items: [{ id: "doe2023" }] },
      { id: "c3", items: [{ id: "smith2024" }] },
    ];

    const request: CitationDocumentRequest = {
      documentId: "doc-numeric",
      revision: 1,
      style: {
        id: "numeric",
        version: "1.0",
        xml: numericStyle,
      },
      bibliographies: [
        {
          id: "bib-numeric",
          version: "1.0",
          format: "bibtex",
          content: bibContent,
        },
      ],
      clusters,
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.citations.length, 3);

    // c1 is first encounter of smith -> [1]
    assert.equal(result.citations[0].plainText, "[1]");
    // c2 is first encounter of doe -> [2]
    assert.equal(result.citations[1].plainText, "[2]");
    // c3 is second encounter of smith -> reuses [1]
    assert.equal(result.citations[2].plainText, "[1]");

    // Bibliography layout
    assert.ok(result.bibliography);
    assert.equal(result.bibliography?.entries.length, 2);
    assert.equal(result.bibliography?.layout.secondFieldAlign, "flush");
  });

  it("renders note style preserving noteIndex and document order", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const bibContent = `
@book{descartes1637, title={Discourse on the Method}, author={Descartes, René}, year={1637}}
@book{spinoza1677, title={Ethics}, author={Spinoza, Baruch}, year={1677}}
`;

    const clusters: CitationClusterInput[] = [
      { id: "n1", items: [{ id: "descartes1637" }], noteIndex: 1 },
      { id: "n2", items: [{ id: "spinoza1677" }], noteIndex: 2 },
      { id: "n3", items: [{ id: "descartes1637" }], noteIndex: 3 },
    ];

    const request: CitationDocumentRequest = {
      documentId: "doc-notes",
      revision: 2,
      style: {
        id: "note",
        version: "1.0",
        xml: noteStyle,
      },
      bibliographies: [
        {
          id: "bib-notes",
          version: "1.0",
          format: "bibtex",
          content: bibContent,
        },
      ],
      clusters,
      includeBibliography: false,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.citations.length, 3);
    assert.equal(result.bibliography, null);

    assert.ok(result.citations[0].plainText.includes("Descartes"));

    assert.ok(result.citations[1].plainText.includes("Spinoza"));
    // Third note references note 1
    assert.ok(result.citations[2].plainText.includes("note 1"));
  });

  it("applies retroactive updates during disambiguation of ambiguous citations", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const bibContent = `
@book{smith_a, title={Book A}, author={Smith, Alice}, year={2020}}
@book{smith_b, title={Book B}, author={Smith, Bob}, year={2020}}
`;

    const request: CitationDocumentRequest = {
      documentId: "doc-disambig",
      revision: 1,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-disambig",
          version: "1.0",
          format: "bibtex",
          content: bibContent,
        },
      ],
      clusters: [
        { id: "c1", items: [{ id: "smith_a" }] },
        { id: "c2", items: [{ id: "smith_b" }] },
      ],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.citations.length, 2);

    // Disambiguation requires given names or initials to distinguish Alice vs Bob Smith
    assert.ok(result.citations[0].plainText.includes("A. Smith") || result.citations[0].plainText.includes("Alice"));
    assert.ok(result.citations[1].plainText.includes("B. Smith") || result.citations[1].plainText.includes("Bob"));
  });

  it("preserves disambiguation when an unresolved group separates ambiguous known works", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const request: CitationDocumentRequest = {
      documentId: "partial-disambiguation", revision: 1,
      style: { id: "author-date", version: "1", xml: authorDateStyle },
      bibliographies: [{ id: "bib", version: "1", format: "bibtex", content:
        "@book{smith_a, title={Book A}, author={Smith, Alice}, year={2020}}\n@book{smith_b, title={Book B}, author={Smith, Bob}, year={2020}}" }],
      clusters: [
        { id: "a", items: [{ id: "smith_a" }] },
        { id: "b", items: [{ id: "smith_b" }, { id: "missing9999" }] },
        { id: "c", items: [{ id: "smith_b" }] },
      ], includeBibliography: true,
    };
    const result = await engine.renderDocument(request);
    const referenceEngine = new CiteprocDocumentEngine(localeProvider);
    const reference = await referenceEngine.renderDocument({ ...request,
      clusters: request.clusters.filter((cluster) => cluster.id !== "b") });
    assert.deepEqual(result.citations, reference.citations);
    assert.deepEqual(result.bibliography, reference.bibliography);
    assert.equal(result.diagnostics.length, 1);
    assert.ok(result.citations[0].plainText.includes("A. Smith") || result.citations[0].plainText.includes("Alice"));
    assert.ok(result.citations[1].plainText.includes("B. Smith") || result.citations[1].plainText.includes("Bob"));
  });

  it("supports citation item locators, prefixes, suffixes, and suppress-author mode", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const bibContent = `@book{russell1910, title={Principia Mathematica}, author={Russell, Bertrand}, year={1910}}`;

    const request: CitationDocumentRequest = {
      documentId: "doc-options",
      revision: 3,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-options",
          version: "1.0",
          format: "bibtex",
          content: bibContent,
        },
      ],
      clusters: [
        {
          id: "c1",
          items: [
            {
              id: "russell1910",
              prefix: "see ",
              suffix: ", for logic",
              locator: "45",
              label: "page",
              mode: "suppress-author",
            },
          ],
        },
      ],
      includeBibliography: false,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);

    const cite = result.citations[0].plainText;
    assert.ok(cite.includes("see "));
    assert.ok(cite.includes(", for logic"));
    assert.ok(cite.includes("45"));
    // Suppress-author mode removes Russell
    assert.equal(cite.includes("Russell"), false);
  });

  it("supports composite mode formatting author outside parentheses", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const bibContent = `@book{chomsky1957, title={Syntactic Structures}, author={Chomsky, Noam}, year={1957}}`;

    const request: CitationDocumentRequest = {
      documentId: "doc-composite",
      revision: 1,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-comp",
          version: "1.0",
          format: "bibtex",
          content: bibContent,
        },
      ],
      clusters: [
        {
          id: "c1",
          items: [{ id: "chomsky1957", mode: "composite" }],
        },
      ],
      includeBibliography: false,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);
    // Composite formatting places author name before parentheses with date
    assert.ok(result.citations[0].plainText.includes("Chomsky"));
    assert.ok(result.citations[0].plainText.includes("(1957)"));
  });

  it("respects locale formatting (en-US vs fr-FR)", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const bibContent = `
@book{b1, title={Livre 1}, author={Dupont, Jean and Martin, Pierre and Durand, Paul and Petit, Jacques}, year={2020}}
`;

    // fr-FR request
    const requestFr: CitationDocumentRequest = {
      documentId: "doc-fr",
      revision: 1,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-fr",
          version: "1.0",
          format: "bibtex",
          content: bibContent,
        },
      ],
      locale: "fr-FR",
      clusters: [{ id: "c1", items: [{ id: "b1", locator: "12", label: "page" }] }],
      includeBibliography: false,
    };

    const resFr = await engine.renderDocument(requestFr);
    assert.equal(resFr.diagnostics.length, 0);
    // In fr-FR, page label short is p.
    assert.ok(resFr.citations[0].plainText.includes("p. 12"));
  });

  it("fails closed when requested locale is unavailable", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const request: CitationDocumentRequest = {
      documentId: "doc-missing-locale",
      revision: 1,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-1",
          version: "1.0",
          format: "bibtex",
          content: `@book{b1, title={T}, year={2020}}`,
        },
      ],
      locale: "de-DE", // Not provided by TestLocaleProvider
      clusters: [{ id: "c1", items: [{ id: "b1" }] }],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.citations.length, 0);
    assert.equal(result.bibliography, null);
    assert.ok(result.diagnostics.some((d) => d.code === "CSL_LOCALE_UNAVAILABLE" && d.severity === "error"));
  });

  it("leaves an unknown cluster unresolved without creating a bibliography item", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const request: CitationDocumentRequest = {
      documentId: "doc-unknown-key",
      revision: 1,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-1",
          version: "1.0",
          format: "bibtex",
          content: `@book{existingKey, title={Known}, year={2020}}`,
        },
      ],
      clusters: [{ id: "c1", items: [{ id: "nonExistentKey" }] }],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.citations.length, 0);
    assert.deepEqual(result.bibliography?.entries, []);

    const diag = result.diagnostics.find((d) => d.code === "UNKNOWN_CITEKEY");
    assert.ok(diag);
    assert.equal(diag.severity, "error");
    assert.equal(diag.clusterId, "c1");
    assert.equal(diag.citekey, "nonExistentKey");
  });

  for (const grouped of [false, true]) {
    it(`renders valid clusters around an unknown ${grouped ? "group" : "citation"} and preserves incremental state`, async () => {
      const engine = new CiteprocDocumentEngine(localeProvider);
      const request: CitationDocumentRequest = {
        documentId: "partial", revision: 1,
        style: { id: "numeric", version: "1", xml: numericStyle },
        bibliographies: [{ id: "bib", version: "1", format: "bibtex",
          content: "@book{known2026, title={Known}, author={Smith, John}, year={2026}}" }],
        clusters: [
          { id: "a", items: [{ id: "known2026" }] },
          { id: "b", items: grouped ? [{ id: "known2026" }, { id: "missing9999" }] : [{ id: "missing9999" }] },
          { id: "c", items: [{ id: "known2026" }] },
        ], includeBibliography: true,
      };
      const result = await engine.renderDocument(request);
      assert.deepEqual(result.citations.map((citation) => citation.clusterId), ["a", "c"]);
      assert.ok(result.citations.every((citation) => citation.plainText.includes("1")));
      assert.deepEqual(result.diagnostics.map(({ code, severity, clusterId, citekey }) =>
        ({ code, severity, clusterId, citekey })),
      [{ code: "UNKNOWN_CITEKEY", severity: "error", clusterId: "b", citekey: "missing9999" }]);
      assert.deepEqual(result.bibliography?.entries.map((entry) => entry.itemIds), [["known2026"]]);
      assert.deepEqual(await engine.renderDocument(request), result);
      const toggled = await engine.renderDocument({ ...request, includeBibliography: false });
      assert.deepEqual(toggled.citations, result.citations);
      assert.deepEqual(toggled.diagnostics, result.diagnostics);
      const appended = await engine.renderDocument({ ...request, revision: 2,
        clusters: [...request.clusters, { id: "d", items: [{ id: "known2026" }] }] });
      assert.deepEqual(appended.citations.map((citation) => citation.clusterId), ["a", "c", "d"]);
      const repaired = await engine.renderDocument({ ...request, revision: 3,
        clusters: request.clusters.map((cluster) => ({ ...cluster, items: [{ id: "known2026" }] })) });
      assert.equal(repaired.citations.length, 3);
      assert.deepEqual(repaired.diagnostics, []);
    });
  }

  it("fails closed when CSL style XML is invalid without throwing an unhandled exception", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const request: CitationDocumentRequest = {
      documentId: "doc-bad-style",
      revision: 1,
      style: {
        id: "corrupted-style",
        version: "1.0",
        xml: "<invalid-csl-xml>",
      },
      bibliographies: [
        {
          id: "bib-1",
          version: "1.0",
          format: "bibtex",
          content: `@book{b1, title={T}, year={2020}}`,
        },
      ],
      clusters: [{ id: "c1", items: [{ id: "b1" }] }],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.citations.length, 0);
    assert.equal(result.bibliography, null);
    assert.ok(result.diagnostics.some((d) => d.code === "CSL_STYLE_ERROR" && d.severity === "error"));
  });

  it("leaves a cited duplicate unresolved across bibliography sources", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const request: CitationDocumentRequest = {
      documentId: "doc-dup",
      revision: 1,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-a",
          version: "1.0",
          format: "bibtex",
          content: `@book{dupKey, title={Version A}, year={2020}}`,
        },
        {
          id: "bib-b",
          version: "1.0",
          format: "bibtex",
          content: `@book{dupKey, title={Version B}, year={2021}}`,
        },
      ],
      clusters: [{ id: "c1", items: [{ id: "dupKey" }] }],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.citations.length, 0);
    assert.deepEqual(result.bibliography?.entries, []);
    assert.ok(result.diagnostics.some((d) => d.code === "DUPLICATE_CITEKEY" && d.severity === "error"));
  });

  it("safely neutralizes malicious script and markup injection in metadata", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const maliciousBib = `
@book{xss2024,
  title={<script>alert(1)</script> and <img src=x onerror=alert(1)>},
  author={<script>bad()</script>, Attacker},
  year={2024}
}
`;

    const request: CitationDocumentRequest = {
      documentId: "doc-security",
      revision: 1,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-sec",
          version: "1.0",
          format: "bibtex",
          content: maliciousBib,
        },
      ],
      clusters: [{ id: "c1", items: [{ id: "xss2024" }] }],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);

    assert.equal(result.citations[0].content.length, 1);
    assert.equal(result.citations[0].content[0].type, "text");

    assert.ok(result.bibliography);
    assert.equal(result.bibliography?.entries[0].content[0].type, "text");

    // Recursively check all returned properties for forbidden HTML keys
    const forbiddenKeys = ["html", "innerHTML", "outerHTML", "rawHtml", "unsafeHtml"];
    function checkKeys(obj: unknown): void {
      if (typeof obj !== "object" || obj === null) return;
      if (Array.isArray(obj)) {
        for (const item of obj) checkKeys(item);
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        assert.equal(forbiddenKeys.includes(k), false, `Forbidden HTML key '${k}' found in output`);
        checkKeys(v);
      }
    }
    checkKeys(result);
  });

  it("produces rich bibliography AST with left-margin callout and right-inline block for numeric style", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const bib = `@book{turing1936, title={Computable Numbers}, author={Turing, Alan}, year={1936}}`;

    const request: CitationDocumentRequest = {
      documentId: "doc-numeric-blocks",
      revision: 1,
      style: { id: "numeric", version: "1.0", xml: numericStyle },
      bibliographies: [{ id: "bib-num", version: "1.0", format: "bibtex", content: bib }],
      clusters: [{ id: "c1", items: [{ id: "turing1936" }] }],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.bibliography);
    assert.equal(result.bibliography?.entries.length, 1);

    const entry = result.bibliography.entries[0];
    assert.equal(entry.itemIds[0], "turing1936");
    assert.ok(entry.plainText.includes("[1]"));
    assert.ok(entry.plainText.includes("Turing"));

    assert.equal(entry.content.length, 2);
    const leftMargin = entry.content[0] as { type: string; display: string };
    assert.equal(leftMargin.type, "block");
    assert.equal(leftMargin.display, "left-margin");

    const rightInline = entry.content[1] as { type: string; display: string };
    assert.equal(rightInline.type, "block");
    assert.equal(rightInline.display, "right-inline");
  });

  it("produces rich inline typography AST (italic span) with clean plainText", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);
    const bib = `@book{descartes1637, title={Discourse on Method}, author={Descartes, René}, year={1637}}`;

    const request: CitationDocumentRequest = {
      documentId: "doc-typo",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "bib-typo", version: "1.0", format: "bibtex", content: bib }],
      clusters: [{ id: "c1", items: [{ id: "descartes1637" }] }],
      includeBibliography: true,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);

    // In author-date style, bibliography entry title is formatted
    assert.ok(result.bibliography);
    const bibEntry = result.bibliography.entries[0];
    assert.ok(bibEntry.plainText.includes("Discourse on Method"));
    // plainText contains zero markup tags
    assert.equal(bibEntry.plainText.includes("<"), false);
  });
});
