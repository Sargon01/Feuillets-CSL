import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { CiteprocDocumentEngine } from "../../src/citeproc-engine.ts";
import { adaptBibliographies } from "../../src/bibtex-adapter.ts";
import type { CitationDocumentRequest } from "../../src/engine-contract.ts";

const xml = fs.readFileSync(new URL("../fixtures/styles/chicago-notes-bibliography-public.csl", import.meta.url), "utf8");
const locale = fs.readFileSync(new URL("../fixtures/locales/locales-en-US.xml", import.meta.url), "utf8");

export async function measureBibliographyScale(count: number) {
  const entries = Array.from({ length: count }, (_, index) =>
    `@book{ref${index},title={Synthetic Study ${index}},author={Example${index}, Alice},publisher={Press},year={2024}}`);
  // Keep the total input size exact; six controlled anomalies span two files.
  entries[count - 6] = "@book{duplicate,title={First}}";
  entries[count - 5] = "@book{duplicate,title={Second}}";
  entries[count - 4] = "@typefutur2027{unsupported,title={Unknown}}";
  entries[count - 3] = "@book{,title={No Key}}";
  entries[count - 2] = "@book{recoverable,title={Recovered},year=}";
  entries[count - 1] = "@book{empty,}";
  const sources = [entries.slice(0, count - 5), entries.slice(count - 5)].map((part, index) =>
    ({ id: `library${index}`, version: "1", format: "bibtex" as const, content: part.join("\n") }));
  const conversionStart = performance.now();
  const adapted = adaptBibliographies(sources);
  const conversionMs = performance.now() - conversionStart;
  assert.equal(adapted.items.size, count - 4);
  let adapterCalls = 0;
  let adaptationMs = 0;
  const engine = new CiteprocDocumentEngine({ retrieveLocale: () => locale }, undefined, (input) => {
    adapterCalls++;
    const start = performance.now();
    const result = adaptBibliographies(input);
    adaptationMs += performance.now() - start;
    return result;
  });
  const validKeys = Array.from({ length: 100 }, (_, index) => `ref${Math.floor(index * (count - 6) / 100)}`);
  const groups = [...validKeys.map((key) => [key]), ["duplicate"], ["unsupported"], ["missing"], [validKeys[0], "duplicate"]];
  const request: CitationDocumentRequest = { documentId: `scale${count}`, revision: 1,
    style: { id: "chicago", version: "1", xml }, locale: "en-US", bibliographies: sources, includeBibliography: true,
    clusters: groups.map((ids, index) => ({ id: `c${index}`, items: ids.map((id) => ({ id })), noteIndex: index + 1 })) };
  try {
    const coldStart = performance.now();
    const initial = await engine.renderDocument(request);
    const coldMs = performance.now() - coldStart;
    const renderMs = coldMs - adaptationMs;
    assert.equal(initial.citations.length, 100);
    assert.equal(initial.bibliography?.entries.length, 100);
    assert.equal(initial.diagnostics.filter((d) => d.severity === "error").length, 4);
    const refreshStart = performance.now();
    for (let index = 0; index < 10; index++) assert.deepEqual(await engine.renderDocument(request), initial);
    const cachedRefreshMs = (performance.now() - refreshStart) / 10;
    assert.equal(adapterCalls, 1);
    const appendStart = performance.now();
    const appended = await engine.renderDocument({ ...request, revision: 2,
      clusters: [...request.clusters, { id: "appended", items: [{ id: validKeys[0] }], noteIndex: 105 }] });
    const appendMs = performance.now() - appendStart;
    assert.equal(appended.citations.length, 101);
    assert.equal(adapterCalls, 1);
    const rebuildStart = performance.now();
    const rebuilt = await engine.renderDocument({ ...request, revision: 3,
      clusters: [{ id: "inserted", items: [{ id: validKeys[1] }], noteIndex: 1 }, ...request.clusters] });
    const rebuildMs = performance.now() - rebuildStart;
    assert.equal(rebuilt.citations.length, 101);
    assert.equal(adapterCalls, 1);
    const callsBeforeResourceChange = adapterCalls;
    const changed = await engine.renderDocument({ ...request, revision: 4,
      bibliographies: sources.map((bib) => ({ ...bib, version: "2" })) });
    assert.equal(changed.citations.length, 100);
    assert.equal(adapterCalls, 2);
    return { inputEntries: count, usableEntries: adapted.items.size, producedCitations: initial.citations.length,
      bibliographyEntries: initial.bibliography?.entries.length, conversionMs, coldMs, renderMs, cachedRefreshMs,
      appendMs, rebuildMs, adapterCallsBeforeResourceChange: callsBeforeResourceChange, adapterCallsAfterResourceChange: adapterCalls };
  } finally { engine.dispose(); }
}
