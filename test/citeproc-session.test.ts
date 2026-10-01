import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CSL } from "citeproc-ts";
import { CiteprocDocumentEngine } from "../src/citeproc-engine.ts";
import type {
  CiteprocEngineFactory,
  CiteprocSys,
  BibtexAdapterFn,
} from "../src/citeproc-engine.ts";
import { computeResourceSignature } from "../src/citeproc-session.ts";
import { adaptBibliographies } from "../src/bibtex-adapter.ts";
import type {
  CitationDocumentRequest,
  CitationDocumentResult,
} from "../src/engine-contract.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");
}

describe("Citeproc Document Sessions & Invalidation (Lot 5)", () => {
  const enUsLocale = loadFixture("./fixtures/locales/locales-en-US.xml");
  const frFrLocale = loadFixture("./fixtures/locales/locales-fr-FR.xml");
  const authorDateStyle = loadFixture("./fixtures/styles/author-date.csl");
  const numericStyle = loadFixture("./fixtures/styles/numeric.csl");

  const localeProvider = {
    retrieveLocale: (lang: string) => {
      if (lang === "en-US") return enUsLocale;
      if (lang === "fr-FR") return frFrLocale;
      return null;
    },
  };

  const bibContent = `
@book{smith2020a,
  title={First Work of Philosophy},
  author={Smith, John},
  year={2020}
}

@book{smith2020b,
  title={Second Work of Philosophy},
  author={Smith, John},
  year={2020}
}

@book{doe2021,
  title={Theory of Systems},
  author={Doe, Jane},
  year={2021}
}
`;

  function createInstrumentedEngine(): {
    engine: CiteprocDocumentEngine;
    getEngineCreations: () => number;
  } {
    let engineCreations = 0;
    const instrumentedFactory: CiteprocEngineFactory = (sys: CiteprocSys, styleXml: string, locale: string) => {
      engineCreations++;
      const EngineCtor = (CSL as { Engine: new (...args: unknown[]) => unknown }).Engine;
      return new EngineCtor(sys, styleXml, locale) as any;
    };

    const engine = new CiteprocDocumentEngine(localeProvider, instrumentedFactory);
    return {
      engine,
      getEngineCreations: () => engineCreations,
    };
  }

  function createFullyInstrumentedEngine(): {
    engine: CiteprocDocumentEngine;
    getEngineCreations: () => number;
    getAdaptCalls: () => number;
  } {
    let engineCreations = 0;
    let adaptCalls = 0;
    const instrumentedFactory: CiteprocEngineFactory = (sys: CiteprocSys, styleXml: string, locale: string) => {
      engineCreations++;
      const EngineCtor = (CSL as { Engine: new (...args: unknown[]) => unknown }).Engine;
      return new EngineCtor(sys, styleXml, locale) as any;
    };
    const instrumentedAdapter: BibtexAdapterFn = (sources) => {
      adaptCalls++;
      return adaptBibliographies(sources);
    };

    const engine = new CiteprocDocumentEngine(localeProvider, instrumentedFactory, instrumentedAdapter);
    return {
      engine,
      getEngineCreations: () => engineCreations,
      getAdaptCalls: () => adaptCalls,
    };
  }

  it("reuses the citeproc engine on append-only revision increments", async () => {
    const { engine, getEngineCreations } = createInstrumentedEngine();

    // Rev 1: [smith2020a]
    const req1: CitationDocumentRequest = {
      documentId: "doc-append",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    const res1 = await engine.renderDocument(req1);
    assert.equal(getEngineCreations(), 1);
    assert.equal(res1.citations[0].plainText, "[1]");

    // Rev 2: [smith2020a], [doe2021] (append-only)
    const req2: CitationDocumentRequest = {
      ...req1,
      revision: 2,
      clusters: [
        { id: "c1", items: [{ id: "smith2020a", mode: "normal" }] },
        { id: "c2", items: [{ id: "doe2021", mode: "normal" }] },
      ],
    };

    const res2 = await engine.renderDocument(req2);
    // Engine must be reused, no new creation
    assert.equal(getEngineCreations(), 1);
    assert.equal(res2.citations.length, 2);
    assert.equal(res2.citations[0].plainText, "[1]");
    assert.equal(res2.citations[1].plainText, "[2]");

    // Rev 3: [smith2020a], [doe2021], [smith2020a] (append-only repeated first item)
    const req3: CitationDocumentRequest = {
      ...req1,
      revision: 3,
      clusters: [
        { id: "c1", items: [{ id: "smith2020a", mode: "normal" }] },
        { id: "c2", items: [{ id: "doe2021", mode: "normal" }] },
        { id: "c3", items: [{ id: "smith2020a", mode: "normal" }] },
      ],
    };

    const res3 = await engine.renderDocument(req3);
    assert.equal(getEngineCreations(), 1);
    assert.equal(res3.citations.length, 3);
    assert.equal(res3.citations[0].plainText, "[1]");
    assert.equal(res3.citations[1].plainText, "[2]");
    assert.equal(res3.citations[2].plainText, "[1]");
  });

  it("returns cached result for strictly identical request with same revision", async () => {
    const { engine, getEngineCreations } = createInstrumentedEngine();

    const req: CitationDocumentRequest = {
      documentId: "doc-cache",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    const res1 = await engine.renderDocument(req);
    assert.equal(getEngineCreations(), 1);

    const res2 = await engine.renderDocument(req);
    // Zero additional engine creations
    assert.equal(getEngineCreations(), 1);
    assert.deepEqual(res1, res2);

    // Verify returning cloned/immutable result
    assert.notEqual(res1, res2);
  });

  it("rebuilds engine when an existing cluster is inserted in the middle or reordered", async () => {
    const { engine, getEngineCreations } = createInstrumentedEngine();

    const baseReq: CitationDocumentRequest = {
      documentId: "doc-reorder",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [
        { id: "c1", items: [{ id: "smith2020a", mode: "normal" }] },
        { id: "c2", items: [{ id: "doe2021", mode: "normal" }] },
      ],
      includeBibliography: false,
    };

    await engine.renderDocument(baseReq);
    assert.equal(getEngineCreations(), 1);

    // Insertion between c1 and c2
    const reqInserted: CitationDocumentRequest = {
      ...baseReq,
      revision: 2,
      clusters: [
        { id: "c1", items: [{ id: "smith2020a", mode: "normal" }] },
        { id: "c-mid", items: [{ id: "smith2020b", mode: "normal" }] },
        { id: "c2", items: [{ id: "doe2021", mode: "normal" }] },
      ],
    };

    await engine.renderDocument(reqInserted);
    assert.equal(getEngineCreations(), 2, "Rebuilding required for middle insertion");

    // Reorder: swap c-mid and c1
    const reqReorder: CitationDocumentRequest = {
      ...baseReq,
      revision: 3,
      clusters: [
        { id: "c-mid", items: [{ id: "smith2020b", mode: "normal" }] },
        { id: "c1", items: [{ id: "smith2020a", mode: "normal" }] },
        { id: "c2", items: [{ id: "doe2021", mode: "normal" }] },
      ],
    };

    await engine.renderDocument(reqReorder);
    assert.equal(getEngineCreations(), 3, "Rebuilding required for reordering");
  });

  it("rebuilds engine when cluster properties (locator, mode, noteIndex, prefix/suffix) change", async () => {
    const { engine, getEngineCreations } = createInstrumentedEngine();

    const baseReq: CitationDocumentRequest = {
      documentId: "doc-props",
      revision: 1,
      style: { id: "author-date", version: "v1", xml: authorDateStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    await engine.renderDocument(baseReq);
    assert.equal(getEngineCreations(), 1);

    // 1. Locator change -> rebuild
    await engine.renderDocument({
      ...baseReq,
      revision: 2,
      clusters: [{ id: "c1", items: [{ id: "smith2020a", locator: "42", mode: "normal" }] }],
    });
    assert.equal(getEngineCreations(), 2);

    // 2. Mode change -> rebuild
    await engine.renderDocument({
      ...baseReq,
      revision: 3,
      clusters: [{ id: "c1", items: [{ id: "smith2020a", locator: "42", mode: "suppress-author" }] }],
    });
    assert.equal(getEngineCreations(), 3);

    // 3. Prefix change -> rebuild
    await engine.renderDocument({
      ...baseReq,
      revision: 4,
      clusters: [{ id: "c1", items: [{ id: "smith2020a", prefix: "e.g., ", locator: "42", mode: "suppress-author" }] }],
    });
    assert.equal(getEngineCreations(), 4);

    // 4. Note index change -> rebuild
    await engine.renderDocument({
      ...baseReq,
      revision: 5,
      clusters: [{ id: "c1", noteIndex: 12, items: [{ id: "smith2020a", prefix: "e.g., ", locator: "42", mode: "suppress-author" }] }],
    });
    assert.equal(getEngineCreations(), 5);
  });

  it("rebuilds engine when style version, bibliography version, or locale changes", async () => {
    const { engine, getEngineCreations } = createInstrumentedEngine();

    const baseReq: CitationDocumentRequest = {
      documentId: "doc-invalidation",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    await engine.renderDocument(baseReq);
    assert.equal(getEngineCreations(), 1);

    // Style version change
    await engine.renderDocument({
      ...baseReq,
      revision: 2,
      style: { id: "numeric", version: "v2", xml: numericStyle },
    });
    assert.equal(getEngineCreations(), 2);

    // Bibliography version change
    await engine.renderDocument({
      ...baseReq,
      revision: 3,
      style: { id: "numeric", version: "v2", xml: numericStyle },
      bibliographies: [{ id: "bib-1", version: "v2", format: "bibtex", content: bibContent }],
    });
    assert.equal(getEngineCreations(), 3);

    // Locale change
    await engine.renderDocument({
      ...baseReq,
      revision: 4,
      style: { id: "numeric", version: "v2", xml: numericStyle },
      locale: "fr-FR",
      bibliographies: [{ id: "bib-1", version: "v2", format: "bibtex", content: bibContent }],
    });
    assert.equal(getEngineCreations(), 4);
  });

  it("does not rebuild citation state when only includeBibliography changes", async () => {
    const { engine, getEngineCreations } = createInstrumentedEngine();

    const reqBibFalse: CitationDocumentRequest = {
      documentId: "doc-bib-toggle",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    const resFalse = await engine.renderDocument(reqBibFalse);
    assert.equal(getEngineCreations(), 1);
    assert.equal(resFalse.bibliography, null);

    // Same revision or rev 2 with includeBibliography: true -> reuse engine!
    const reqBibTrue: CitationDocumentRequest = {
      ...reqBibFalse,
      includeBibliography: true,
    };

    const resTrue = await engine.renderDocument(reqBibTrue);
    assert.equal(getEngineCreations(), 1, "Engine was not recreated when only bibliography requested");
    assert.notEqual(resTrue.bibliography, null);
    assert.equal(resTrue.bibliography?.entries.length, 1);
  });

  it("strictly isolates document sessions between different documentId values", async () => {
    const { engine, getEngineCreations } = createInstrumentedEngine();

    // Document A: Smith (1), Doe (2)
    const reqA: CitationDocumentRequest = {
      documentId: "doc-A",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [
        { id: "cA1", items: [{ id: "smith2020a", mode: "normal" }] },
        { id: "cA2", items: [{ id: "doe2021", mode: "normal" }] },
      ],
      includeBibliography: false,
    };

    // Document B: Doe (1), Smith (2)
    const reqB: CitationDocumentRequest = {
      documentId: "doc-B",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [
        { id: "cB1", items: [{ id: "doe2021", mode: "normal" }] },
        { id: "cB2", items: [{ id: "smith2020a", mode: "normal" }] },
      ],
      includeBibliography: false,
    };

    const resA = await engine.renderDocument(reqA);
    const resB = await engine.renderDocument(reqB);

    assert.equal(getEngineCreations(), 2, "Separate engine created for each documentId");

    // In doc A, Smith is [1] and Doe is [2]
    assert.equal(resA.citations[0].plainText, "[1]");
    assert.equal(resA.citations[1].plainText, "[2]");

    // In doc B, Doe is [1] and Smith is [2]
    assert.equal(resB.citations[0].plainText, "[1]");
    assert.equal(resB.citations[1].plainText, "[2]");
  });

  it("handles disposeDocument() and dispose() properly", async () => {
    const { engine, getEngineCreations } = createInstrumentedEngine();

    const reqA: CitationDocumentRequest = {
      documentId: "doc-A",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    const reqB: CitationDocumentRequest = {
      ...reqA,
      documentId: "doc-B",
    };

    await engine.renderDocument(reqA);
    await engine.renderDocument(reqB);
    assert.equal(getEngineCreations(), 2);

    // Dispose doc-A
    engine.disposeDocument("doc-A");

    // doc-B is append-only -> reused engine
    await engine.renderDocument({
      ...reqB,
      revision: 2,
      clusters: [
        { id: "c1", items: [{ id: "smith2020a", mode: "normal" }] },
        { id: "c2", items: [{ id: "doe2021", mode: "normal" }] },
      ],
    });
    assert.equal(getEngineCreations(), 2, "doc-B engine was preserved after doc-A disposal");

    // doc-A was disposed, so new request creates fresh engine
    await engine.renderDocument({
      ...reqA,
      revision: 2,
    });
    assert.equal(getEngineCreations(), 3, "doc-A starts fresh session after disposal");

    // Global dispose()
    engine.dispose();

    // Subsequent request for doc-B must recreate engine
    await engine.renderDocument(reqB);
    assert.equal(getEngineCreations(), 4, "dispose() cleared all sessions");
  });

  it("fails closed on STALE_REVISION when request revision is older than session revision", async () => {
    const { engine } = createInstrumentedEngine();

    const reqRev2: CitationDocumentRequest = {
      documentId: "doc-stale",
      revision: 2,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    await engine.renderDocument(reqRev2);

    // Request with older revision 1
    const reqRev1: CitationDocumentRequest = {
      ...reqRev2,
      revision: 1,
    };

    const result = await engine.renderDocument(reqRev1);
    assert.equal(result.citations.length, 0);
    assert.equal(result.bibliography, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].code, "STALE_REVISION");
    assert.equal(result.diagnostics[0].severity, "error");
  });

  it("fails closed on REVISION_CONFLICT when same revision has different content", async () => {
    const { engine } = createInstrumentedEngine();

    const req1: CitationDocumentRequest = {
      documentId: "doc-conflict",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    await engine.renderDocument(req1);

    // Same revision 1 but with different cluster
    const reqConflict: CitationDocumentRequest = {
      ...req1,
      clusters: [{ id: "c1", items: [{ id: "doe2021", mode: "normal" }] }],
    };

    const result = await engine.renderDocument(reqConflict);
    assert.equal(result.citations.length, 0);
    assert.equal(result.bibliography, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].code, "REVISION_CONFLICT");
    assert.equal(result.diagnostics[0].severity, "error");
  });

  it("propagates retroactive updates during downstream disambiguation in session", async () => {
    const { engine } = createInstrumentedEngine();

    // Rev 1: single Smith 2020 citation -> (Smith 2020)
    const req1: CitationDocumentRequest = {
      documentId: "doc-disambig",
      revision: 1,
      style: { id: "author-date", version: "v1", xml: authorDateStyle },
      locale: "en-US",
      bibliographies: [{ id: "bib-1", version: "v1", format: "bibtex", content: bibContent }],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    const res1 = await engine.renderDocument(req1);
    assert.equal(res1.citations[0].plainText, "(Smith, 2020)");

    // Rev 2: append second work by same author same year -> forces disambiguation
    const req2: CitationDocumentRequest = {
      ...req1,
      revision: 2,
      clusters: [
        { id: "c1", items: [{ id: "smith2020a", mode: "normal" }] },
        { id: "c2", items: [{ id: "smith2020b", mode: "normal" }] },
      ],
    };

    const res2 = await engine.renderDocument(req2);
    assert.equal(res2.citations.length, 2);
    // Prior citation c1 was retroactively updated to include suffix
    assert.equal(res2.citations[0].plainText, "(Smith, 2020a)");
    assert.equal(res2.citations[1].plainText, "(Smith, 2020b)");
  });

  it("supports multi-source crossref resolution, cache sharing across documents, and rebuild on version change", async () => {
    const { engine, getEngineCreations, getAdaptCalls } = createFullyInstrumentedEngine();

    const sourceAContent = `
@incollection{child2024,
  author = {Doe, Jane},
  title = {A Chapter on Methods},
  crossref = {parent2024},
  pages = {10--25}
}
`;
    const sourceBContent = `
@book{parent2024,
  editor = {Smith, John},
  title = {Collected Works on Science},
  publisher = {Acme Press},
  year = {2024}
}
`;

    const sourceA = { id: "source-a", version: "v1", format: "bibtex" as const, content: sourceAContent };
    const sourceB = { id: "source-b", version: "v1", format: "bibtex" as const, content: sourceBContent };

    const reqDoc1: CitationDocumentRequest = {
      documentId: "doc-crossref-1",
      revision: 1,
      style: { id: "author-date", version: "v1", xml: authorDateStyle },
      locale: "en-US",
      bibliographies: [sourceA, sourceB],
      clusters: [{ id: "c1", items: [{ id: "child2024", mode: "normal" }] }],
      includeBibliography: true,
    };

    // 1. First render on doc-crossref-1: adapts sources as an ensemble
    const res1 = await engine.renderDocument(reqDoc1);
    assert.equal(getAdaptCalls(), 1);
    assert.equal(getEngineCreations(), 1);
    assert.equal(engine.getBibCacheSize(), 1);
    assert.equal(res1.diagnostics.length, 0);

    // Crossref resolution check: child2024 inherited year and container-title from parent2024
    assert.equal(res1.citations[0].plainText, "(Doe, 2024)");
    assert.ok(res1.bibliography);
    const bibText = res1.bibliography.entries[0].plainText;
    assert.ok(bibText.includes("Collected Works on Science"), "child entry inherited parent container title");
    assert.ok(bibText.includes("2024"), "child entry inherited parent year");

    // 2. Second document doc-crossref-2 with the exact same ordered bibliography ensemble
    const reqDoc2: CitationDocumentRequest = {
      documentId: "doc-crossref-2",
      revision: 1,
      style: { id: "author-date", version: "v1", xml: authorDateStyle },
      locale: "en-US",
      bibliographies: [sourceA, sourceB],
      clusters: [{ id: "c1", items: [{ id: "child2024", mode: "normal" }] }],
      includeBibliography: true,
    };

    const resDoc2 = await engine.renderDocument(reqDoc2);
    // Uses shared adapted bibliography cache (adaptCalls remains 1)
    assert.equal(getAdaptCalls(), 1);
    // But engine instance is isolated per document (engine creations becomes 2)
    assert.equal(getEngineCreations(), 2);
    assert.equal(resDoc2.citations[0].plainText, "(Doe, 2024)");

    // Citeproc engine isolation: mutating/rendering doc 1 does not affect doc 2
    const reqDoc1Append: CitationDocumentRequest = {
      ...reqDoc1,
      revision: 2,
      clusters: [
        { id: "c1", items: [{ id: "child2024", mode: "normal" }] },
        { id: "c2", items: [{ id: "parent2024", mode: "normal" }] },
      ],
    };
    const resDoc1Append = await engine.renderDocument(reqDoc1Append);
    assert.equal(resDoc1Append.citations.length, 2);
    assert.equal(resDoc2.citations.length, 1);

    // 3. Change bibliography.version of source B:
    const sourceBv2 = { id: "source-b", version: "v2", format: "bibtex" as const, content: sourceBContent };
    const reqDoc1VersionChange: CitationDocumentRequest = {
      ...reqDoc1,
      revision: 3,
      bibliographies: [sourceA, sourceBv2],
    };

    // Cache miss on bibliography ensemble -> new adaptation call
    // Resource signature changed -> engine is rebuilt
    const resDoc1Rebuild = await engine.renderDocument(reqDoc1VersionChange);
    assert.equal(getAdaptCalls(), 2, "Cache miss triggers a new adaptation");
    assert.equal(getEngineCreations(), 3, "Version change triggers an engine rebuild");
    assert.equal(engine.getBibCacheSize(), 2);
    assert.equal(resDoc1Rebuild.citations[0].plainText, "(Doe, 2024)");
  });

  describe("Version Tokens & Resource Identity", () => {
    const baseRequest: CitationDocumentRequest = {
      documentId: "doc-tokens",
      revision: 1,
      style: { id: "numeric", version: "v1", xml: numericStyle },
      locale: "en-US",
      bibliographies: [
        { id: "bib-1", version: "v1", format: "bibtex", content: bibContent },
      ],
      clusters: [{ id: "c1", items: [{ id: "smith2020a", mode: "normal" }] }],
      includeBibliography: false,
    };

    it("A: produces identical resource signature for identical id, version, format, and order", () => {
      const sig1 = computeResourceSignature(baseRequest);
      const sig2 = computeResourceSignature({ ...baseRequest });
      assert.equal(sig1, sig2);
    });

    it("B: produces different resource signature when style.version changes", () => {
      const sig1 = computeResourceSignature(baseRequest);
      const sig2 = computeResourceSignature({
        ...baseRequest,
        style: { ...baseRequest.style, version: "v2" },
      });
      assert.notEqual(sig1, sig2);
    });

    it("C: produces different resource signature when bibliography.version changes", () => {
      const sig1 = computeResourceSignature(baseRequest);
      const sig2 = computeResourceSignature({
        ...baseRequest,
        bibliographies: [
          { ...baseRequest.bibliographies[0], version: "v2" },
        ],
      });
      assert.notEqual(sig1, sig2);
    });

    it("D: produces different resource signature when bibliography order changes", () => {
      const bib1 = { id: "bib-1", version: "v1", format: "bibtex" as const, content: bibContent };
      const bib2 = { id: "bib-2", version: "v1", format: "bibtex" as const, content: bibContent };

      const sig1 = computeResourceSignature({
        ...baseRequest,
        bibliographies: [bib1, bib2],
      });
      const sig2 = computeResourceSignature({
        ...baseRequest,
        bibliographies: [bib2, bib1],
      });
      assert.notEqual(sig1, sig2);
    });

    it("E: produces different resource signature when locale changes", () => {
      const sig1 = computeResourceSignature(baseRequest);
      const sig2 = computeResourceSignature({
        ...baseRequest,
        locale: "fr-FR",
      });
      assert.notEqual(sig1, sig2);
    });

    it("F: produces identical resource signature when content changes but id and version remain identical", async () => {
      // Voluntary contract test: 'version' is the sole invalidation token, content is never hashed
      const sig1 = computeResourceSignature(baseRequest);
      const sig2 = computeResourceSignature({
        ...baseRequest,
        style: {
          ...baseRequest.style,
          xml: "<!-- completely different xml content -->",
        },
        bibliographies: [
          {
            ...baseRequest.bibliographies[0],
            content: "% completely different bibtex content",
          },
        ],
      });
      assert.equal(sig1, sig2);

      // Verify at the engine level: unchanged version tokens mean resources are considered identical
      const { engine, getEngineCreations } = createInstrumentedEngine();
      await engine.renderDocument(baseRequest);
      assert.equal(getEngineCreations(), 1);

      // Revision 2 append-only with same style/bib version tokens but modified content string
      const reqRev2: CitationDocumentRequest = {
        ...baseRequest,
        revision: 2,
        style: {
          ...baseRequest.style,
          xml: "<!-- completely different xml content -->",
        },
        bibliographies: [
          {
            ...baseRequest.bibliographies[0],
            content: "% completely different bibtex content",
          },
        ],
        clusters: [
          { id: "c1", items: [{ id: "smith2020a", mode: "normal" }] },
          { id: "c2", items: [{ id: "smith2020b", mode: "normal" }] },
        ],
      };

      await engine.renderDocument(reqRev2);
      // Engine is preserved and reused because version tokens did not change
      assert.equal(getEngineCreations(), 1);
    });
  });
});
