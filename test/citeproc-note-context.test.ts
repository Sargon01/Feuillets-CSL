import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CiteprocDocumentEngine } from "../src/citeproc-engine.ts";
import type { CitationDocumentRequest } from "../src/engine-contract.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");
}

describe("Citeproc Note Context", () => {
  const enUsLocale = loadFixture("./fixtures/locales/locales-en-US.xml");
  const notePositionsStyle = loadFixture("./fixtures/styles/note-positions.csl");

  const localeProvider = {
    retrieveLocale: (lang: string) => {
      if (lang === "en-US") return enUsLocale;
      return null;
    },
  };

  const bibContent = `
@book{kant,
  title={Critique of Pure Reason},
  author={Kant, Immanuel},
  year={1781}
}

@book{hume,
  title={Treatise of Human Nature},
  author={Hume, David},
  year={1739}
}
`;

  it("evaluates contextual note positions: first, ibid, ibid-with-locator, and subsequent", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);

    const request: CitationDocumentRequest = {
      documentId: "doc-notes-1",
      revision: 1,
      style: {
        id: "note-positions",
        version: "v1",
        xml: notePositionsStyle,
      },
      locale: "en-US",
      bibliographies: [
        {
          id: "bib-1",
          version: "v1",
          format: "bibtex",
          content: bibContent,
        },
      ],
      clusters: [
        // Note 1: Kant first reference with locator 42
        {
          id: "c1",
          noteIndex: 1,
          items: [{ id: "kant", locator: "42", label: "page", mode: "normal" }],
        },
        // Note 2: Kant immediately repeated with same locator -> ibid
        {
          id: "c2",
          noteIndex: 2,
          items: [{ id: "kant", locator: "42", label: "page", mode: "normal" }],
        },
        // Note 3: Kant immediately repeated with changed locator -> ibid-with-locator
        {
          id: "c3",
          noteIndex: 3,
          items: [{ id: "kant", locator: "99", label: "page", mode: "normal" }],
        },
        // Note 4: Hume first reference
        {
          id: "c4",
          noteIndex: 4,
          items: [{ id: "hume", mode: "normal" }],
        },
        // Note 5: Kant again after intervening work -> subsequent short form
        {
          id: "c5",
          noteIndex: 5,
          items: [{ id: "kant", locator: "50", label: "page", mode: "normal" }],
        },
      ],
      includeBibliography: false,
    };

    const result = await engine.renderDocument(request);
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.citations.length, 5);

    // Note 1: First citation has full author and italic title
    const n1 = result.citations[0];
    assert.ok(n1.plainText.includes("Immanuel Kant"));
    assert.ok(n1.plainText.includes("Critique of Pure Reason"));
    assert.ok(n1.plainText.includes("p. 42"));

    // Note 2: Immediate repetition produces ibid
    const n2 = result.citations[1];
    assert.equal(n2.plainText, "Ibid.");

    // Note 3: Immediate repetition with changed locator produces ibid with locator
    const n3 = result.citations[2];
    assert.equal(n3.plainText, "Ibid., p. 99");

    // Note 4: First reference of different author
    const n4 = result.citations[3];
    assert.ok(n4.plainText.includes("David Hume"));
    assert.ok(n4.plainText.includes("Treatise of Human Nature"));

    // Note 5: Subsequent reference of Kant
    const n5 = result.citations[4];
    assert.ok(n5.plainText.startsWith("Kant"));
    assert.ok(n5.plainText.includes("p. 50"));
    // Subsequent does NOT contain first name "Immanuel"
    assert.ok(!n5.plainText.includes("Immanuel"));
  });

  it("preserves note positions correctly across incremental append-only revisions", async () => {
    const engine = new CiteprocDocumentEngine(localeProvider);

    // Revision 1: Notes 1 and 2
    const req1: CitationDocumentRequest = {
      documentId: "doc-notes-append",
      revision: 1,
      style: { id: "note-positions", version: "v1", xml: notePositionsStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [
        { id: "c1", noteIndex: 1, items: [{ id: "kant", locator: "10", label: "page", mode: "normal" }] },
        { id: "c2", noteIndex: 2, items: [{ id: "kant", locator: "10", label: "page", mode: "normal" }] },
      ],
      includeBibliography: false,
    };

    const res1 = await engine.renderDocument(req1);
    assert.equal(res1.citations[0].plainText.includes("Immanuel Kant"), true);
    assert.equal(res1.citations[1].plainText, "Ibid.");

    // Revision 2: Append Note 3 (same locator -> ibid)
    const req2: CitationDocumentRequest = {
      documentId: "doc-notes-append",
      revision: 2,
      style: { id: "note-positions", version: "v1", xml: notePositionsStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [
        { id: "c1", noteIndex: 1, items: [{ id: "kant", locator: "10", label: "page", mode: "normal" }] },
        { id: "c2", noteIndex: 2, items: [{ id: "kant", locator: "10", label: "page", mode: "normal" }] },
        { id: "c3", noteIndex: 3, items: [{ id: "kant", locator: "10", label: "page", mode: "normal" }] },
      ],
      includeBibliography: false,
    };

    const res2 = await engine.renderDocument(req2);
    assert.equal(res2.citations.length, 3);
    assert.equal(res2.citations[2].plainText, "Ibid.");
  });
});
