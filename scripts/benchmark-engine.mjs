import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { CiteprocDocumentEngine } from "../src/citeproc-engine.ts";
import { adaptBibliographies } from "../src/bibtex-adapter.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(relPath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

const enUsLocale = loadFixture("test/fixtures/locales/locales-en-US.xml");
const authorDateStyle = loadFixture("test/fixtures/styles/author-date.csl");

const localeProvider = {
  retrieveLocale: (lang) => (lang === "en-US" ? enUsLocale : null),
};

function generateBibtex(count) {
  const lines = [];
  for (let i = 1; i <= count; i++) {
    lines.push(`@book{ref_${i},
  title={Monograph on Subject Number ${i}},
  author={AuthorSurname_${i}, GivenName_${i}},
  publisher={Academic Press},
  year={2020}
}`);
  }
  return lines.join("\n\n");
}

function generateClusters(count, maxRef) {
  const clusters = [];
  for (let i = 1; i <= count; i++) {
    const refIdx = ((i - 1) % maxRef) + 1;
    clusters.push({
      id: `c_${i}`,
      items: [{ id: `ref_${refIdx}`, mode: "normal" }],
    });
  }
  return clusters;
}

async function runBenchmarkScenario(label, refCount, clusterCount) {
  console.log(`\n==================================================`);
  console.log(`BENCHMARK: ${label} (${refCount} references, ${clusterCount} clusters)`);
  console.log(`==================================================`);

  const bibContent = generateBibtex(refCount);
  const bibSource = [{ id: "bench-bib", version: "v1", format: "bibtex", content: bibContent }];

  // 1. Measure BibTeX adaptation
  const t0 = performance.now();
  const adaptRes = adaptBibliographies(bibSource);
  const t1 = performance.now();
  const adaptTime = t1 - t0;
  console.log(`1. BibTeX parsing & adaptation : ${adaptTime.toFixed(2)} ms (${adaptRes.items.size} items)`);

  const engine = new CiteprocDocumentEngine(localeProvider);
  const clusters = generateClusters(clusterCount, refCount);

  // 2. Measure first cold render
  const initialReq = {
    documentId: `bench-${label}`,
    revision: 1,
    style: { id: "author-date", version: "v1", xml: authorDateStyle },
    locale: "en-US",
    bibliographies: bibSource,
    clusters,
    includeBibliography: true,
  };

  const t2 = performance.now();
  const res1 = await engine.renderDocument(initialReq);
  const t3 = performance.now();
  const coldRenderTime = t3 - t2;
  console.log(`2. First render (cold engine)  : ${coldRenderTime.toFixed(2)} ms (${res1.citations.length} citations, ${res1.bibliography?.entries.length ?? 0} bib entries)`);

  // 3. Measure append-only update (append 10 new clusters)
  const appendCount = Math.min(10, refCount);
  const appendedClusters = [
    ...clusters,
    ...generateClusters(appendCount, refCount).map((c, idx) => ({
      ...c,
      id: `c_appended_${idx + 1}`,
    })),
  ];

  const appendReq = {
    ...initialReq,
    revision: 2,
    clusters: appendedClusters,
  };

  const t4 = performance.now();
  const resAppend = await engine.renderDocument(appendReq);
  const t5 = performance.now();
  const appendTime = t5 - t4;
  console.log(`3. Append-only update (+${appendCount} items) : ${appendTime.toFixed(2)} ms (${resAppend.citations.length} citations)`);

  // 4. Measure full rebuild (insertion in the middle)
  const middleInsertedClusters = [
    clusters[0],
    { id: "c_middle_inserted", items: [{ id: "ref_1", locator: "99", mode: "normal" }] },
    ...clusters.slice(1),
  ];

  const rebuildReq = {
    ...initialReq,
    revision: 3,
    clusters: middleInsertedClusters,
  };

  const t6 = performance.now();
  const resRebuild = await engine.renderDocument(rebuildReq);
  const t7 = performance.now();
  const rebuildTime = t7 - t6;
  console.log(`4. Full rebuild (middle edit)  : ${rebuildTime.toFixed(2)} ms (${resRebuild.citations.length} citations)`);

  return {
    label,
    refCount,
    clusterCount,
    adaptTime,
    coldRenderTime,
    appendTime,
    rebuildTime,
  };
}

async function main() {
  console.log("Starting Feuillets CSL Engine Benchmarks...");
  const benchA = await runBenchmarkScenario("Scenario A", 100, 100);
  const benchB = await runBenchmarkScenario("Scenario B", 1000, 500);

  console.log(`\n==================================================`);
  console.log(`BENCHMARK SUMMARY`);
  console.log(`==================================================`);
  console.log(`Scenario A (100 refs, 100 clusters):`);
  console.log(`  - Adapt BibTeX: ${benchA.adaptTime.toFixed(1)} ms`);
  console.log(`  - Cold render:  ${benchA.coldRenderTime.toFixed(1)} ms`);
  console.log(`  - Append-only:  ${benchA.appendTime.toFixed(1)} ms`);
  console.log(`  - Full rebuild: ${benchA.rebuildTime.toFixed(1)} ms`);
  console.log(`Scenario B (1000 refs, 500 clusters):`);
  console.log(`  - Adapt BibTeX: ${benchB.adaptTime.toFixed(1)} ms`);
  console.log(`  - Cold render:  ${benchB.coldRenderTime.toFixed(1)} ms`);
  console.log(`  - Append-only:  ${benchB.appendTime.toFixed(1)} ms`);
  console.log(`  - Full rebuild: ${benchB.rebuildTime.toFixed(1)} ms`);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
