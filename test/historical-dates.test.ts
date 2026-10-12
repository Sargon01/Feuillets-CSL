import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CSL } from "citeproc-ts";
import { CiteprocDocumentEngine, type CiteprocSys } from "../src/citeproc-engine.ts";
import { BundledCslLocaleProvider } from "../src/bundled-locales.ts";
import type { CslItem } from "../src/bibtex-adapter.ts";
import type { CiteprocEngineInstance } from "../src/citeproc-session.ts";

// Test-only CSL makes both dates observable without changing distributed styles.
const dateStyle = `<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info><title>Historical dates test</title><id>historical-dates-test</id><updated>2026-10-12T00:00:00Z</updated></info>
  <macro name="dates"><group delimiter=" | ">
    <date variable="issued" prefix="issued="><date-part name="year"/></date>
    <date variable="original-date" prefix="original="><date-part name="year"/></date>
  </group></macro>
  <citation><layout><text macro="dates"/></layout></citation>
  <bibliography><layout><text macro="dates"/></layout></bibliography>
</style>`;
const numericStyle = fs.readFileSync(new URL("fixtures/styles/numeric.csl", import.meta.url), "utf8");
const authorDateStyle = fs.readFileSync(new URL("fixtures/styles/author-date.csl", import.meta.url), "utf8");
const Engine = (CSL as { Engine: new (sys: CiteprocSys, style: string, locale: string) => CiteprocEngineInstance }).Engine;

async function render(content: string, locale: string, xml = dateStyle, keys = ["item"]) {
  const received: CslItem[] = [];
  const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider(), (sys, style, language) =>
    new Engine({ ...sys, retrieveItem(id) {
      const item = sys.retrieveItem(id);
      if (item) received.push(structuredClone(item));
      return item;
    } }, style, language));
  try {
    const result = await engine.renderDocument({ documentId: "historical-dates", revision: 1,
      style: { id: "test-style", version: "1", xml },
      bibliographies: [{ id: "dates", version: "1", format: "bibtex", content }],
      clusters: keys.map((id, index) => ({ id: `c${index}`, noteIndex: index + 1, items: [{ id }] })),
      locale, includeBibliography: true });
    return { result, received };
  } finally { engine.dispose(); }
}

for (const locale of ["en-US", "fr-FR"]) {
  for (const [year, expected] of locale === "en-US"
    ? [[-335, "335 BC"], [-336, "336 BC"], [-2, "2 BC"], [-1, "1 BC"], [1, "1 AD"], [1936, "1936"]] as const
    : [[-335, "335av. J.-C."], [-336, "336av. J.-C."], [-2, "2av. J.-C."], [-1, "1av. J.-C."], [1, "1apr. J.-C."], [1936, "1936"]] as const) {
    it(`citeproc-ts directly renders historical CSL year ${year} in ${locale}`, () => {
      const locales = new BundledCslLocaleProvider();
      const engine = new Engine({ retrieveLocale: (language) => locales.retrieveLocale(language) ?? false,
        retrieveItem: () => ({ id: "item", type: "book", issued: { "date-parts": [[year]] } }) }, dateStyle, locale);
      engine.updateItems(["item"]);
      const [, citations] = engine.processCitationCluster({ citationID: "direct", citationItems: [{ id: "item" }], properties: { noteIndex: 1 } }, [], []);
      assert.equal(citations[0][1], `issued=${expected}`);
      const bibliography = engine.makeBibliography();
      assert.ok(bibliography);
      assert.deepEqual(bibliography[0].bibliography_errors, []);
      assert.deepEqual(bibliography[1], [`  <div class="csl-entry">issued=${expected}</div>\n`]);
    });
  }

  it(`citeproc-ts does not give CSL year zero a printable historical date in ${locale}`, () => {
    const locales = new BundledCslLocaleProvider();
    const engine = new Engine({ retrieveLocale: (language) => locales.retrieveLocale(language) ?? false,
      retrieveItem: () => ({ id: "item", type: "book", issued: { "date-parts": [[0]] } }) }, dateStyle, locale);
    engine.updateItems(["item"]);
    const [, citations] = engine.processCitationCluster({ citationID: "zero", citationItems: [{ id: "item" }], properties: { noteIndex: 1 } }, [], []);
    assert.equal(citations[0][1], "[CSL STYLE ERROR: reference with no printed form.]");
    const bibliography = engine.makeBibliography();
    assert.ok(bibliography);
    assert.deepEqual(bibliography[1], []);
    assert.deepEqual(bibliography[0].bibliography_errors, [{ index: 0, itemID: "item", error_code: 1 }]);
  });

  for (const [input, cslYear, english, french] of [
    ["1936", 1936, "1936", "1936"],
    ["0001", 1, "1 AD", "1apr. J.-C."],
    ["0000", -1, "1 BC", "1av. J.-C."],
    ["-0001", -2, "2 BC", "2av. J.-C."],
    ["-0334", -335, "335 BC", "335av. J.-C."],
    ["-0335", -336, "336 BC", "336av. J.-C."],
    ["-335", -336, "336 BC", "336av. J.-C."],
  ] as const) {
    it(`renders BibLaTeX date=${input} with the exact historical year and era in ${locale}`, async () => {
      const { result, received } = await render(`@book{item,title={Ancient Work},date={${input}}}`, locale);
      const expected = `issued=${locale === "en-US" ? english : french}`;
      assert.deepEqual(result.diagnostics, []);
      assert.equal(result.citations[0].plainText, expected);
      assert.equal(result.bibliography?.entries[0].plainText, expected);
      assert.equal(result.bibliography?.entries.length, 1);
      assert.ok(received.length > 0);
      for (const item of received) assert.deepEqual(item.issued, { "date-parts": [[cslYear]] });
    });
  }

  it(`renders an ancient original date and a modern issued date separately in ${locale}`, async () => {
    const { result, received } = await render("@book{item,title={Modern Edition},origdate={-0334},date={1936}}", locale);
    const expected = locale === "en-US" ? "issued=1936 | original=335 BC" : "issued=1936 | original=335av. J.-C.";
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.citations[0].plainText, expected);
    assert.equal(result.bibliography?.entries[0].plainText, expected);
    assert.ok(received.length > 0);
    for (const item of received) {
      assert.deepEqual(item.issued, { "date-parts": [[1936]] });
      assert.deepEqual(item["original-date"], { "date-parts": [[-335]] });
    }
  });

  it(`renders an ancient publication with the existing author-date fixture in ${locale}`, async () => {
    const { result } = await render("@book{item,title={Ancient Work},author={Example, Alice},date={-0335}}", locale, authorDateStyle);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.citations[0].plainText, locale === "en-US" ? "(Example, 336 BC)" : "(Example, 336av. J.-C.)");
    assert.equal(result.bibliography?.entries[0].plainText, locale === "en-US" ? "Example. 336 BC. Ancient Work." : "Example. 336av. J.-C. Ancient Work.");
  });
}

it("historical dates leave modern metadata, bibliography generation and numeric citations intact", async () => {
  const { result, received } = await render(`@book{ancient,title={Ancient Work},author={Example, Alice},date={-0335}}
    @book{modern,title={Modern Work},author={Sample, Bob},date={2024-02-03}}`, "en-US", numericStyle, ["ancient", "modern", "ancient"]);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.citations.map((citation) => citation.plainText), ["[1]", "[2]", "[1]"]);
  assert.deepEqual(result.bibliography?.entries.map((entry) => entry.itemIds), [["ancient"], ["modern"]]);
  assert.ok(received.length > 0);
  assert.ok(received.some((item) => item.id === "ancient"));
  assert.ok(received.some((item) => item.id === "modern"));
  for (const item of received) {
    assert.deepEqual(item.issued, { "date-parts": item.id === "ancient" ? [[-336]] : [[2024, 2, 3]] });
    assert.equal(item.title, item.id === "ancient" ? "Ancient Work" : "Modern Work");
  }
});
