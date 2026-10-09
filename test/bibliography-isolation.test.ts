import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { adaptBibliographies } from "../src/bibtex-adapter.ts";
import { CiteprocDocumentEngine } from "../src/citeproc-engine.ts";
import { BundledCslLocaleProvider } from "../src/bundled-locales.ts";
import type { CitationDocumentRequest } from "../src/engine-contract.ts";

const xml = fs.readFileSync(new URL("fixtures/styles/chicago-notes-bibliography-public.csl", import.meta.url), "utf8");
const known = "@book{known, title={Synthetic Study}, author={Example, Alice}, year={2020}}";
const duplicate = "@book{ambiguous, title={First}, year={2021}}\n@book{ambiguous, title={Second}, year={2022}}";
const unsupported = "@customtype{unsupported, title={Unsupported}}";

function request(content: string, keys: string[][] = [["known"]]): CitationDocumentRequest {
  return { documentId: "isolation", revision: 1, style: { id: "chicago", version: "1", xml },
    bibliographies: [{ id: "bib", version: "1", format: "bibtex", content }],
    clusters: keys.map((ids, index) => ({ id: `c${index}`, items: ids.map((id) => ({ id })), noteIndex: index + 1 })),
    locale: "fr-FR", includeBibliography: true };
}

for (const [label, anomaly] of [["valid library", ""], ["unused unsupported entry", unsupported],
  ["unused duplicate key", duplicate], ["multiple unused anomalies", duplicate + "\n" + unsupported]] as const) {
  it(`Chicago / real citeproc-ts renders known citations with ${label}`, async () => {
    const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider());
    const result = await engine.renderDocument(request(known + "\n" + anomaly));
    assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0"]);
    assert.match(result.citations[0].plainText, /Example/);
    assert.deepEqual(result.bibliography?.entries.map((e) => e.itemIds), [["known"]]);
    if (anomaly) assert.ok(result.diagnostics.length > 0);
    assert.ok(result.diagnostics.every((d) => d.severity === "warning"));
    engine.dispose();
  });
}

for (const [key, content, code] of [["ambiguous", duplicate, "DUPLICATE_CITEKEY"],
  ["unsupported", unsupported, "UNSUPPORTED_BIBTEX_TYPE"], ["missing", "", "UNKNOWN_CITEKEY"]] as const) {
  it(`isolates a cited ${key} key and the whole mixed group, preserving incremental state`, async () => {
    const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider());
    const req = request(known + "\n" + content, [["known"], ["known", key], [key], ["known"]]);
    const result = await engine.renderDocument(req);
    assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0", "c3"]);
    assert.deepEqual(result.diagnostics.filter((d) => d.severity === "error").map((d) => [d.code, d.clusterId, d.citekey]),
      [[code, "c1", key], [code, "c2", key]]);
    assert.deepEqual(result.bibliography?.entries.map((e) => e.itemIds), [["known"]]);
    assert.deepEqual(await engine.renderDocument(req), result);
    const appended = await engine.renderDocument({ ...req, revision: 2, clusters: [...req.clusters, { id: "appended", items: [{ id: "known" }], noteIndex: 5 }] });
    assert.deepEqual(appended.citations.map((c) => c.clusterId), ["c0", "c3", "appended"]);
    const repaired = await engine.renderDocument({ ...req, revision: 3, bibliographies: [{ ...req.bibliographies[0], version: "2", content: known + `\n@book{${key},title={Repaired},author={Sample, Bob},year={2024}}` }] });
    assert.equal(repaired.citations.length, 4);
    assert.deepEqual(repaired.diagnostics, []);
    engine.dispose();
  });
}

const types: Record<string, string> = { misc: "document", booklet: "pamphlet", manual: "report", unpublished: "manuscript",
  mvbook: "book", collection: "book", mvcollection: "book", reference: "book", mvreference: "book",
  inreference: "entry", software: "software", dataset: "dataset", patent: "patent", artwork: "graphic",
  image: "graphic", movie: "motion_picture", video: "motion_picture", audio: "song", music: "song",
  performance: "performance", letter: "personal_communication", jurisdiction: "legal_case", legislation: "legislation" };
for (const [type, cslType] of Object.entries(types)) {
  it(`converts and renders @${type} as ${cslType} without guessing from a URL`, async () => {
    const content = `@${type}{known,title={Synthetic Study},author={Example, Alice},year={2020},url={https://example.org}}`;
    assert.equal(adaptBibliographies(request(content).bibliographies).items.get("known")?.type, cslType);
    const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider());
    const result = await engine.renderDocument(request(content));
    assert.equal(result.citations.length, 1);
    assert.ok(result.citations[0].plainText.length > 0);
    assert.deepEqual(result.diagnostics, []);
    engine.dispose();
  });
}

it("never inherits metadata from an ambiguous crossref parent", async () => {
  const content = known + "\n" + duplicate + "\n@incollection{child,title={Chapter},crossref={ambiguous}}";
  const adapted = adaptBibliographies(request(content).bibliographies);
  assert.equal(adapted.items.has("child"), false);
  assert.ok(adapted.diagnostics.some((d) => d.code === "AMBIGUOUS_CROSSREF" && d.citekey === "child"));
  const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider());
  const result = await engine.renderDocument(request(content, [["known"], ["child"]]));
  assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0"]);
  assert.ok(result.diagnostics.some((d) => d.code === "AMBIGUOUS_CROSSREF" && d.clusterId === "c1"));
  engine.dispose();
});

it("reports duplication even when the first occurrence has an unsupported type", async () => {
  const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider());
  const result = await engine.renderDocument(request(known + "\n@customtype{ambiguous,title={First}}\n@book{ambiguous,title={Second}}", [["known"], ["ambiguous"]]));
  assert.deepEqual(result.citations.map((c) => c.clusterId), ["c0"]);
  assert.equal(result.diagnostics.find((d) => d.severity === "error")?.code, "DUPLICATE_CITEKEY");
  engine.dispose();
});

it("rejects transitive crossrefs to duplicate parents in separate sources", () => {
  const result = adaptBibliographies([
    { id: "first", version: "1", format: "bibtex", content: "@book{Parent,title={First},year={2020}}\n@book{middle,title={Middle},crossref={Parent}}\n@incollection{child,title={Child},crossref={middle}}" },
    { id: "second", version: "1", format: "bibtex", content: "@book{Parent,title={Second},year={2021}}" },
  ]);
  assert.equal(result.items.size, 0);
  assert.ok(result.diagnostics.some((d) => d.code === "AMBIGUOUS_CROSSREF" && d.citekey === "child"));
});

it("keeps genuine source parsing failures fatal", async () => {
  const engine = new CiteprocDocumentEngine(new BundledCslLocaleProvider(), undefined, () => ({
    items: new Map(), diagnostics: [{ code: "BIBTEX_PARSE_ERROR", severity: "error", message: "Synthetic source failure" }] }));
  const result = await engine.renderDocument(request(known));
  assert.deepEqual(result.citations, []);
  assert.equal(result.bibliography, null);
  assert.equal(result.diagnostics[0].severity, "error");
});
