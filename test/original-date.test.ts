import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "@retorquere/bibtex-parser";
import { CSL } from "citeproc-ts";
import { adaptBibliographies, type CslItem } from "../src/bibtex-adapter.ts";
import { CiteprocDocumentEngine, type CiteprocSys } from "../src/citeproc-engine.ts";
import { BundledCslLocaleProvider } from "../src/bundled-locales.ts";
import type { CitationBibliographySource } from "../src/engine-contract.ts";
import type { CiteprocEngineInstance } from "../src/citeproc-session.ts";

const xml = fs.readFileSync(new URL("fixtures/styles/chicago-notes-bibliography-public.csl", import.meta.url), "utf8");
const source = (content: string, id = "bib"): CitationBibliographySource => ({ id, version: "1", format: "bibtex", content });
const parent = "@book{parent,title={Parent},year={2015},origdate={1936},publisher={Example Press}}";
const child = "@book{child,title={Synthetic Study},author={Example, Alice},crossref={parent}}";
const original = (sources: CitationBibliographySource[]) => adaptBibliographies(sources).items.get("child")?.["original-date"];

const inheritedTypes = ["article", "book", "inbook", "incollection", "inproceedings", "conference", "proceedings", "phdthesis", "mastersthesis", "thesis", "techreport", "report", "online", "www", "misc", "booklet", "manual", "unpublished", "mvbook", "collection", "mvcollection", "reference", "mvreference", "inreference", "software", "dataset", "patent", "artwork", "image", "movie", "video", "audio", "music", "performance", "letter", "jurisdiction", "legislation"];
for (const type of inheritedTypes) {
  it(`original-date inheritance for @${type} matches the parser across bibliography files`, () => {
    const entry = child.replace("@book", `@${type}`);
    const joined = parent + "\n" + entry;
    const parsed = parse(joined, { applyCrossRef: true, sentenceCase: false });
    const inherited = parsed.entries.find((item) => item.key === "child")?.fields.origdate;
    const expected = inherited ? { "date-parts": [[1936]] } : undefined;
    assert.deepEqual(original([source(joined)]), expected);
    assert.deepEqual(original([source(parent, "parent"), source(entry, "child")]), expected);
    assert.deepEqual(original([source(entry, "child"), source(parent, "parent")]), expected);
  });
}

for (const [label, intermediate, expected] of [
  ["nearest ancestor", "@book{middle,crossref={parent},origdate={1900}}", [[1900]]],
  ["multiple levels", "@book{middle,crossref={parent}}", [[1936]]],
  ["invalid nearest date", "@book{middle,crossref={parent},origdate={unknown}}", undefined],
  ["non-inheriting intermediate type", "@phdthesis{middle,crossref={parent}}", undefined],
] as const) {
  it(`preserves ${label} original-date inheritance without bypassing parser rules`, () => {
    const entry = child.replace("crossref={parent}", "crossref={middle}");
    const together = original([source(parent + "\n" + intermediate + "\n" + entry)]);
    const separate = original([source(parent, "parent"), source(intermediate, "middle"), source(entry, "child")]);
    assert.deepEqual(together, expected ? { "date-parts": expected } : undefined);
    assert.deepEqual(separate, together);
  });
}

for (const [field, expected] of [["origdate={1900}", [[1900]]], ["origdate={1900-04-01}", [[1900, 4, 1]]], ["origdate={unknown}", undefined]] as const) {
  it(`keeps the child's explicit ${field} ahead of its crossref parent`, () => {
    const entry = child.replace("crossref=", `${field},crossref=`);
    assert.deepEqual(original([source(parent, "parent"), source(entry, "child")]), expected ? { "date-parts": expected } : undefined);
  });
}

it("does not invent an original date from issued or unrecognized field names", () => {
  for (const field of ["", ",originaldate={1936}", ",origyear={1936}", ",original-date={1936}"]) {
    const entry = `@book{child,title={Synthetic Study},year={2015}${field}}`;
    const adapted = adaptBibliographies([source(entry)]).items.get("child");
    assert.deepEqual(adapted?.issued, { "date-parts": [[2015]] });
    assert.equal(adapted?.["original-date"], undefined);
  }
  assert.equal(original([source(parent.replace(",origdate={1936}", ""), "parent"), source(child, "child")]), undefined);
});

const cases: { label: string; sources: CitationBibliographySource[]; issued: number[][]; original?: number[][] }[] = [
  { label: "date and year-only origdate", sources: [source("@book{child,title={Synthetic Study},author={Example, Alice},publisher={Example Press},date={2015},origdate={1936}}")], issued: [[2015]], original: [[1936]] },
  { label: "year and year-only origdate", sources: [source("@book{child,title={Synthetic Study},author={Example, Alice},publisher={Example Press},year={2015},origdate={1936}}")], issued: [[2015]], original: [[1936]] },
  { label: "full original date", sources: [source("@book{child,title={Synthetic Study},author={Example, Alice},publisher={Example Press},date={2015-06-15},origdate={1936-04-01}}")], issued: [[2015, 6, 15]], original: [[1936, 4, 1]] },
  { label: "no original date", sources: [source("@book{child,title={Synthetic Study},author={Example, Alice},publisher={Example Press},year={2015}}")], issued: [[2015]] },
  { label: "unrecognized originaldate", sources: [source("@book{child,title={Synthetic Study},author={Example, Alice},publisher={Example Press},year={2015},originaldate={1936}}")], issued: [[2015]] },
  { label: "crossref within one file", sources: [source(parent + "\n" + child)], issued: [[2015]], original: [[1936]] },
  { label: "crossref across files", sources: [source(parent, "parent"), source(child, "child")], issued: [[2015]], original: [[1936]] },
];

for (const fixture of cases) {
  it(`real citeproc-ts / Chicago preserves ${fixture.label} in full notes and bibliography`, async () => {
    const received: CslItem[] = [];
    const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider(), (sys, style, locale) => {
      const Constructor = (CSL as { Engine: new (sys: CiteprocSys, style: string, locale: string) => CiteprocEngineInstance }).Engine;
      return new Constructor({ ...sys, retrieveItem(id) {
        const item = sys.retrieveItem(id);
        if (item) received.push(structuredClone(item));
        return item;
      } }, style, locale);
    });
    try {
      const result = await engine.renderDocument({ documentId: fixture.label, revision: 1,
        style: { id: "chicago", version: "1", xml }, bibliographies: fixture.sources,
        clusters: [1, 2].map((noteIndex) => ({ id: `note-${noteIndex}`, noteIndex, items: [{ id: "child" }] })),
        locale: "fr-FR", includeBibliography: true });
      assert.deepEqual(result.diagnostics, []);
      assert.equal(result.citations.length, 2);
      assert.equal(result.bibliography?.entries.length, 1);
      assert.ok(received.length > 0);
      for (const item of received) {
        assert.deepEqual(item.issued, { "date-parts": fixture.issued });
        assert.deepEqual(item["original-date"], fixture.original ? { "date-parts": fixture.original } : undefined);
      }
      assert.match(result.citations[0].plainText, /2015/);
      assert.match(result.bibliography?.entries[0].plainText ?? "", /2015/);
      const originalPattern = /1936/;
      assert.equal(originalPattern.test(result.citations[0].plainText), Boolean(fixture.original));
      assert.equal(originalPattern.test(result.bibliography?.entries[0].plainText ?? ""), Boolean(fixture.original));
      assert.doesNotMatch(result.citations[1].plainText, /1936|2015/);
    } finally { engine.dispose(); }
  });
}
