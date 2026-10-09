import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { adaptBibliographies } from "../src/bibtex-adapter.ts";
import { CiteprocDocumentEngine } from "../src/citeproc-engine.ts";
import { BundledCslLocaleProvider } from "../src/bundled-locales.ts";
import type { CitationBibliographySource, CitationDocumentRequest } from "../src/engine-contract.ts";

const xml = fs.readFileSync(new URL("fixtures/styles/chicago-notes-bibliography-public.csl", import.meta.url), "utf8");
const independent = "@book{independent,title={Independent Study},author={Example, Alice},year={2024}}";
const source = (content: string, id = "library"): CitationBibliographySource => ({ id, version: "1", format: "bibtex", content });
const request = (sources: CitationBibliographySource[], keys: string[][]): CitationDocumentRequest => ({
  documentId: "edge-cases", revision: 1, style: { id: "chicago", version: "1", xml },
  bibliographies: sources, locale: "en-US", includeBibliography: true,
  clusters: keys.map((ids, index) => ({ id: `c${index}`, items: ids.map((id) => ({ id })), noteIndex: index + 1 })),
});
async function render(sources: CitationBibliographySource[], keys: string[][]) {
  const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider());
  try { return await engine.renderDocument(request(sources, keys)); } finally { engine.dispose(); }
}

// Independent expectations: do not derive the oracle from the production table.
const types: Record<string, string> = {
  article: "article-journal", book: "book", inbook: "chapter", incollection: "chapter",
  inproceedings: "paper-conference", conference: "paper-conference", proceedings: "book",
  phdthesis: "thesis", mastersthesis: "thesis", thesis: "thesis", techreport: "report", report: "report",
  online: "webpage", www: "webpage", misc: "document", booklet: "pamphlet", manual: "report",
  unpublished: "manuscript", mvbook: "book", collection: "book", mvcollection: "book",
  reference: "book", mvreference: "book", inreference: "entry", software: "software", dataset: "dataset",
  patent: "patent", artwork: "graphic", image: "graphic", movie: "motion_picture", video: "motion_picture",
  audio: "song", music: "song", performance: "performance", letter: "personal_communication",
  jurisdiction: "legal_case", legislation: "legislation",
};
for (const [type, cslType] of Object.entries(types)) {
  it(`type matrix: @${type} -> ${cslType}, metadata and real Chicago citation`, async () => {
    const sources = [source(`@${type}{item,title={Synthetic Title},author={Example, Alice},editor={Sample, Bob},
      translator={Translator, Carol},date={2024-02-03},origdate={1990},journal={Journal},booktitle={Collection},
      publisher={Publisher},address={Paris},volume={2},number={4},pages={10--20},edition={3},
      doi={10.0000/example},url={https://example.org/item},isbn={9780000000000},issn={0000-0000},langid={english}}`)];
    const adapted = adaptBibliographies(sources);
    assert.deepEqual(adapted.diagnostics, []);
    const item = adapted.items.get("item");
    assert.ok(item);
    assert.equal(item.type, cslType);
    assert.equal(item.title, "Synthetic Title");
    assert.deepEqual(item.author, [{ family: "Example", given: "Alice" }]);
    assert.deepEqual(item.editor, [{ family: "Sample", given: "Bob" }]);
    assert.deepEqual(item.translator, [{ family: "Translator", given: "Carol" }]);
    assert.deepEqual(item.issued, { "date-parts": [[2024, 2, 3]] });
    assert.deepEqual(item["original-date"], { "date-parts": [[1990]] });
    assert.equal(item["container-title"], "Journal");
    assert.equal(item.publisher, "Publisher");
    assert.equal(item["publisher-place"], "Paris");
    for (const [field, value] of Object.entries({ volume: "2", issue: "4", page: "10–20", edition: "3", DOI: "10.0000/example",
      URL: "https://example.org/item", ISBN: "9780000000000", ISSN: "0000-0000", language: "english" })) {
      assert.equal(item[field as keyof typeof item], value, field);
    }
    const result = await render(sources, [["item"]]);
    assert.equal(result.citations.length, 1);
    assert.match(result.citations[0].plainText, /Synthetic Title/);
    assert.deepEqual(result.bibliography?.entries[0].itemIds, ["item"]);
    assert.deepEqual(result.diagnostics, []);
  });
  it(`type matrix: @${type} renders without optional metadata`, async () => {
    const result = await render([source(`@${type}{item,title={Minimal Title}}`)], [["item"]]);
    assert.equal(result.citations.length, 1);
    assert.match(result.citations[0].plainText, /Minimal Title/);
    assert.deepEqual(result.diagnostics, []);
  });
}

for (const type of ["typefutur2027", "constructor", "__proto__", "toString"]) {
  it(`isolates unsupported @${type}, including object prototype names`, async () => {
    const sources = [source(independent + `\n@${type}{bad,title={Unsupported}}`)];
    assert.equal(adaptBibliographies(sources).items.has("bad"), false);
    const result = await render(sources, [["independent"], ["bad"], ["independent", "bad"], ["independent"]]);
    assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0", "c3"]);
    assert.deepEqual(result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
      ["UNSUPPORTED_BIBTEX_TYPE", "UNSUPPORTED_BIBTEX_TYPE"]);
  });
}

it("ignores unknown fields while preserving Unicode, LaTeX and empty-field fallbacks", async () => {
  const sources = [source(String.raw`@book{custom,title={Étude de {\LaTeX} et caf{\'e}},author={Müller, Zoë},year={2024},
    publisher={},institution={Research Institute},customfield={value},zoteroextra={information},unknownmetadata={text}}`)];
  const adapted = adaptBibliographies(sources);
  const item = adapted.items.get("custom");
  assert.ok(item);
  // The parser preserves the typeset LaTeX logo and combining accents.
  assert.match(item.title!.normalize("NFC"), /Étude de L.*X et café/);
  assert.deepEqual(item.author, [{ family: "Müller", given: "Zoë" }]);
  assert.equal(item.publisher, "Research Institute");
  assert.equal("customfield" in item, false);
  assert.equal("zoteroextra" in item, false);
  assert.equal("unknownmetadata" in item, false);
  const result = await render(sources, [["custom"]]);
  assert.equal(result.citations.length, 1);
  assert.match(result.citations[0].plainText, /Müller/);
});

for (const type of ["phdthesis", "mastersthesis", "thesis"]) {
  it(`preserves @${type} school and explicit thesis genre`, async () => {
    const sources = [source(`@${type}{item,title={Thesis Title},school={Example University},type={Doctoral dissertation},year={2024}}`)];
    const item = adaptBibliographies(sources).items.get("item");
    assert.equal(item?.publisher, "Example University");
    assert.equal(item?.genre, "Doctoral dissertation");
    const result = await render(sources, [["item"]]);
    assert.match(result.citations[0].plainText, /Example University/);
    assert.match(result.citations[0].plainText, /Doctoral dissertation/);
  });
}

for (const identical of [true, false]) for (const split of [true, false]) {
  it(`isolates ${identical ? "identical" : "different"} duplicates ${split ? "across sources" : "in one source"}`, async () => {
    const first = "@book{duplicate,title={First}}";
    const second = identical ? first : "@article{duplicate,title={Second}}";
    const sources = split ? [source(independent + first), source(second, "second")] : [source(independent + first + second)];
    const adapted = adaptBibliographies(sources);
    assert.equal(adapted.items.has("duplicate"), false);
    assert.equal(adapted.items.has("independent"), true);
    const unused = await render(sources, [["independent"]]);
    assert.equal(unused.citations.length, 1);
    const result = await render(sources, [["duplicate"], ["independent", "duplicate"], ["independent"]]);
    assert.deepEqual(result.citations.map((c) => c.clusterId), ["c2"]);
    assert.deepEqual(result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code), ["DUPLICATE_CITEKEY", "DUPLICATE_CITEKEY"]);
  });
}

it("treats citation keys as case-sensitive, while crossref parent matching is case-insensitive", async () => {
  const sources = [source(`${independent}@book{Case,title={Upper}}@book{case,title={Lower}}
    @incollection{child,title={Child},crossref={CASE}}`)];
  const adapted = adaptBibliographies(sources);
  assert.equal(adapted.items.has("Case"), true);
  assert.equal(adapted.items.has("case"), true);
  assert.equal(adapted.items.has("child"), false);
  const result = await render(sources, [["Case"], ["case"], ["CASE"], ["child"], ["independent"]]);
  assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0", "c1", "c4"]);
  assert.ok(result.diagnostics.some((d) => d.code === "UNKNOWN_CITEKEY" && d.citekey === "CASE"));
});

it("matches the parser's Unicode crossref folding and rejects ambiguous parents", async () => {
  const sources = [source(`${independent}@book{ß,title={First},publisher={First Publisher}}
    @book{SS,title={Second},publisher={Second Publisher}}@incollection{child,title={Child},crossref={ß}}`)];
  const adapted = adaptBibliographies(sources);
  assert.equal(adapted.items.has("child"), false);
  const result = await render(sources, [["independent"], ["child"]]);
  assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0"]);
  assert.ok(result.diagnostics.some((d) => d.code === "AMBIGUOUS_CROSSREF" && d.clusterId === "c1"));
});

for (const split of [true, false]) {
  it(`preserves safe direct crossref metadata ${split ? "across sources" : "within one source"} for multiple children`, async () => {
    const parent = "@book{parent,title={Collected Studies},editor={Sample, Bob},publisher={Publisher},year={2024}}";
    const children = "@incollection{one,title={First Chapter},crossref={parent}}@incollection{two,title={Second Chapter},crossref={parent}}";
    const sources = split ? [source(parent), source(children, "children")] : [source(parent + children)];
    const adapted = adaptBibliographies(sources);
    for (const key of ["one", "two"]) {
      const item = adapted.items.get(key);
      assert.equal(item?.["container-title"], "Collected Studies");
      assert.equal(item?.publisher, "Publisher");
      assert.deepEqual(item?.issued, { "date-parts": [[2024]] });
      assert.deepEqual(item?.editor, [{ family: "Sample", given: "Bob" }]);
    }
    const result = await render(sources, [["one"], ["two"]]);
    assert.equal(result.citations.length, 2);
    assert.deepEqual(result.diagnostics, []);
  });
}

it("keeps a self-contained child of a missing or unsupported parent usable", async () => {
  const sources = [source(`${independent}@typefutur2027{parent,title={Parent Metadata},publisher={Publisher}}
    @incollection{missing,title={Standalone Child},author={Sample, Bob},year={2024},crossref={absent}}
    @incollection{unknown,title={Child},crossref={parent}}`)];
  const adapted = adaptBibliographies(sources);
  assert.equal(adapted.items.get("missing")?.title, "Standalone Child");
  assert.equal(adapted.items.get("unknown")?.publisher, "Publisher");
  const result = await render(sources, [["independent"], ["missing"], ["unknown"], ["parent"]]);
  assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0", "c1", "c2"]);
});

for (const self of [true, false]) {
  it(`rejects ${self ? "self" : "mutual"} cyclic crossrefs and dependent children without blocking independent entries`, async () => {
    const cycle = self ? "@book{a,title={Alpha},crossref={a}}" :
      "@book{a,title={Alpha},crossref={b}}@book{b,title={Beta},year={2024},crossref={a}}";
    const sources = [source(independent + cycle + "@incollection{child,title={Child},crossref={a}}")];
    const adapted = adaptBibliographies(sources);
    assert.equal(adapted.items.has("a"), false);
    assert.equal(adapted.items.has("child"), false);
    const result = await render(sources, [["independent"], ["a"], ["child"], ["independent", "a"]]);
    assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0"]);
    assert.deepEqual(result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
      ["CYCLIC_CROSSREF", "CYCLIC_CROSSREF", "CYCLIC_CROSSREF"]);
  });
}

it("preserves a supported three-level crossref chain in one library", async () => {
  const sources = [source("@book{top,title={Collection},publisher={Publisher},year={2024}}@book{middle,crossref={top}}@incollection{child,title={Child},crossref={middle}}")];
  const item = adaptBibliographies(sources).items.get("child");
  assert.equal(item?.publisher, "Publisher");
  assert.deepEqual(item?.issued, { "date-parts": [[2024]] });
  const result = await render(sources, [["child"]]);
  assert.match(result.citations[0].plainText, /Collection/);
});

it("preserves safe three-level crossref metadata across source boundaries", async () => {
  const sources = [source("@book{top,title={Collection},editor={Sample, Bob},publisher={Publisher},address={Paris},year={2024}}"),
    source("@book{middle,crossref={top}}", "middle"), source("@incollection{child,title={Child},crossref={middle}}", "child")];
  const item = adaptBibliographies(sources).items.get("child");
  assert.equal(item?.["container-title"], "Collection");
  assert.equal(item?.publisher, "Publisher");
  assert.equal(item?.["publisher-place"], "Paris");
  assert.deepEqual(item?.issued, { "date-parts": [[2024]] });
  assert.deepEqual(item?.editor, [{ family: "Sample", given: "Bob" }]);
  const result = await render(sources, [["child"]]);
  assert.match(result.citations[0].plainText, /Collection/);
  assert.match(result.citations[0].plainText, /Publisher/);
});

it("isolates combined syntax recovery, missing keys, empty fields, duplicates and unknown types across libraries", async () => {
  const sources = [source(`${independent}@book{,title={No Key}}@book{empty,}@book{recoverable,title={Recovered},year=}
    @book{duplicate,title={First}}@typefutur2027{bad,title={Unknown}}`),
    source("@book{duplicate,title={Second}}@book{unicode,title={Étude},author={Müller, Zoë}}", "second")];
  const result = await render(sources, [["independent"], ["unicode"], ["recoverable"], ["empty"], ["bad"], ["duplicate"], ["absent"], ["independent", "absent"]]);
  assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0", "c1", "c2", "c3"]);
  assert.ok(result.diagnostics.some((d) => d.code === "MISSING_CITEKEY" && d.severity === "warning"));
  assert.ok(result.diagnostics.some((d) => d.code === "BIBTEX_SYNTAX_WARNING"));
  assert.deepEqual(result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
    ["UNSUPPORTED_BIBTEX_TYPE", "DUPLICATE_CITEKEY", "UNKNOWN_CITEKEY", "UNKNOWN_CITEKEY"]);
});

it("reports a genuinely invalid CSL style as a fatal document error", async () => {
  const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider());
  try {
    const result = await engine.renderDocument({ ...request([source(independent)], [["independent"]]), style: { id: "broken", version: "1", xml: "<style>" } });
    assert.deepEqual(result.citations, []);
    assert.equal(result.bibliography, null);
    assert.ok(result.diagnostics.some((d) => d.severity === "error" && !d.clusterId));
  } finally { engine.dispose(); }
});

it("respects Chicago's deliberate omission of inaccessible miscellaneous documents from the bibliography", async () => {
  const result = await render([source("@misc{item,title={Private Document},author={Example, Alice},year={2024}}")], [["item"]]);
  assert.equal(result.citations.length, 1);
  assert.match(result.citations[0].plainText, /Private Document/);
  assert.deepEqual(result.bibliography?.entries, []);
  assert.deepEqual(result.diagnostics, []);
});

for (const damaged of ["@book{damaged,title={Unterminated", String.raw`@book{damaged,title={\unknowncommand{Title}}}`]) {
  it(`preserves independent entries when recovering ${damaged.includes("unknowncommand") ? "an unknown LaTeX command" : "an unterminated brace"}`, async () => {
    const result = await render([source(independent + damaged)], [["independent"]]);
    assert.equal(result.citations.length, 1);
    assert.match(result.citations[0].plainText, /Independent Study/);
    assert.ok(result.diagnostics.some((d) => d.code === "BIBTEX_SYNTAX_WARNING"));
    assert.ok(result.diagnostics.every((d) => d.severity === "warning"));
  });
}
