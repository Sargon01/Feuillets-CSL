/**
 * Feuillets CSL — Public Provider Bridge Tests
 *
 * Verifies end-to-end integration between:
 * Feuillets Citation API v2 <-> FeuilletsCslProvider <-> CiteprocDocumentEngine
 *
 * Covers:
 * - Real provider bridge through Feuillets Citation API v2
 * - Official runtime bundled en-US and fr-FR locales
 * - Fail-closed CSL_LOCALE_UNAVAILABLE for unbundled locales (e.g. de-DE)
 * - disposeDocument(documentId) per-document session release
 * - dispose() on plugin unload (including when replaced by a newer provider)
 * - Reconnection and session preservation across Feuillets reload cycles
 * - Structural DTO schema validation parity (zero raw HTML)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { App } from "obsidian";

import FeuilletsCslPlugin from "../main.ts";
import { PROVIDER_ID, PROVIDER_NAME } from "../src/citation-provider.ts";
import {
  CITATION_API_VERSION,
  FEUILLETS_PLUGIN_ID,
  type CitationEngineProvider,
  type FeuilletsCitationApi,
} from "../src/feuillets-api-types.ts";
import type {
  CitationDocumentRequest,
  CitationDocumentResult,
  CitationRenderNode,
} from "../src/engine-contract.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFixture(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");
}

interface MockRegistryState {
  providers: Map<string, CitationEngineProvider>;
  registerCallCount: number;
  unregisterCallCount: number;
}

function createMockCitationApi(state: MockRegistryState): FeuilletsCitationApi {
  return {
    apiVersion: 2,
    registerProvider(provider: CitationEngineProvider): void {
      state.registerCallCount++;
      state.providers.set(provider.id, provider);
    },
    unregisterProvider(providerId: string): void {
      state.unregisterCallCount++;
      state.providers.delete(providerId);
    },
    getProvider(providerId?: string): CitationEngineProvider | null {
      if (providerId) {
        return state.providers.get(providerId) ?? null;
      }
      return state.providers.values().next().value ?? null;
    },
  };
}

interface MockApp {
  plugins: {
    plugins: Record<string, unknown>;
  };
  workspace: {
    layoutReadyCallbacks: (() => void)[];
    onLayoutReady: (cb: () => void) => void;
    triggerLayoutReady: () => void;
  };
}

function createMockApp(api: FeuilletsCitationApi): MockApp {
  const layoutReadyCallbacks: (() => void)[] = [];
  return {
    plugins: {
      plugins: {
        [FEUILLETS_PLUGIN_ID]: {
          api: {
            citations: api,
          },
        },
      },
    },
    workspace: {
      layoutReadyCallbacks,
      onLayoutReady(cb: () => void) {
        layoutReadyCallbacks.push(cb);
      },
      triggerLayoutReady() {
        for (const cb of layoutReadyCallbacks) {
          cb();
        }
      },
    },
  };
}

const mockManifest = {
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  version: "0.1.0",
  minAppVersion: "1.7.0",
  description: "CSL citation engine for Feuillets",
  author: "Halim Yalcin",
};

/**
 * Validates AST nodes recursively, ensuring zero raw HTML fields.
 */
function assertSafeNodeAst(nodes: CitationRenderNode[]): void {
  const forbiddenKeys = ["html", "rawHtml", "innerHTML", "outerHTML", "unsafeHtml"];
  for (const node of nodes) {
    const record = node as unknown as Record<string, unknown>;
    for (const key of forbiddenKeys) {
      assert.equal(
        key in record,
        false,
        `Node of type ${node.type} must not contain forbidden HTML property '${key}'`
      );
    }

    if (node.type === "text") {
      assert.equal(typeof node.text, "string");
    } else if (node.type === "span") {
      assert.ok(node.style && typeof node.style === "object");
      assertSafeNodeAst(node.children);
    } else if (node.type === "block") {
      assert.ok(["block", "left-margin", "right-inline", "indent"].includes(node.display));
      assertSafeNodeAst(node.children);
    } else if (node.type === "link") {
      assert.equal(typeof node.href, "string");
      assertSafeNodeAst(node.children);
    }
  }
}

describe("Public Provider Bridge", () => {
  const authorDateStyle = loadFixture("fixtures/styles/author-date.csl");

  const sampleBibtex = `
@book{smith2020,
  title={Foundations of Modern Logic},
  author={Smith, John},
  year={2020},
  publisher={Oxford University Press}
}
@book{smithDoe2021,
  title={Advanced Epistemology},
  author={Smith, John and Doe, Jane},
  year={2021},
  publisher={Cambridge University Press}
}
@book{nodateAuthor,
  title={Manuscript Notes on Dialectics},
  author={Aristotle, Pseudo},
  publisher={Venice}
}
`;

  it("real bridge invocation via Feuillets Citation API v2", async () => {
    const state: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(state);
    const mockApp = createMockApp(mockApi);

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    assert.equal(state.registerCallCount, 1);
    const provider = mockApi.getProvider(PROVIDER_ID);
    assert.ok(provider !== null, "Provider must be registered");
    assert.equal(provider.id, PROVIDER_ID);
    assert.equal(provider.name, PROVIDER_NAME);
    assert.equal(provider.version, "0.1.0");
    assert.equal(CITATION_API_VERSION, 2);

    const request: CitationDocumentRequest = {
      documentId: "doc-bridge-test",
      revision: 1,
      style: {
        id: "author-date",
        version: "1.0",
        xml: authorDateStyle,
      },
      bibliographies: [
        {
          id: "bib-main",
          version: "1.0",
          format: "bibtex",
          content: sampleBibtex,
        },
      ],
      clusters: [
        {
          id: "c1",
          items: [{ id: "smith2020" }],
        },
      ],
      locale: "en-US",
      includeBibliography: true,
    };

    const result: CitationDocumentResult = await provider.renderDocument(request);

    assert.equal(result.documentId, "doc-bridge-test");
    assert.equal(result.revision, 1);
    assert.equal(result.citations.length, 1);
    assert.equal(result.citations[0].clusterId, "c1");
    assert.ok(result.citations[0].plainText.includes("Smith"));
    assert.ok(result.citations[0].plainText.includes("2020"));

    assertSafeNodeAst(result.citations[0].content);

    assert.ok(result.bibliography !== null);
    assert.equal(result.bibliography.entries.length, 1);
    assert.deepEqual(result.bibliography.entries[0].itemIds, ["smith2020"]);
    assert.ok(result.bibliography.entries[0].plainText.includes("Foundations of Modern Logic"));
    assertSafeNodeAst(result.bibliography.entries[0].content);

    assert.equal(result.diagnostics.length, 0);

    plugin.onunload();
  });

  it("uses complete official fr-FR runtime locale via public provider", async () => {
    const state: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(state);
    const mockApp = createMockApp(mockApi);

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    const provider = mockApi.getProvider(PROVIDER_ID);
    assert.ok(provider !== null);

    // Two-author cluster: English produces "and", French produces "et"
    const reqEn: CitationDocumentRequest = {
      documentId: "doc-lang-en",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "smithDoe2021" }] }],
      locale: "en-US",
      includeBibliography: false,
    };

    const reqFr: CitationDocumentRequest = {
      documentId: "doc-lang-fr",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "smithDoe2021" }] }],
      locale: "fr-FR",
      includeBibliography: false,
    };

    const resEn = await provider.renderDocument(reqEn);
    const resFr = await provider.renderDocument(reqFr);

    assert.equal(resEn.diagnostics.length, 0);
    assert.equal(resFr.diagnostics.length, 0);

    // In en-US, author delimiter is "and"
    assert.ok(
      resEn.citations[0].plainText.includes("Smith and Doe"),
      `Expected 'Smith and Doe' in en-US but got: '${resEn.citations[0].plainText}'`
    );

    // In fr-FR, author delimiter is "et"
    assert.ok(
      resFr.citations[0].plainText.includes("Smith et Doe"),
      `Expected 'Smith et Doe' in fr-FR but got: '${resFr.citations[0].plainText}'`
    );

    // No-date term: English produces "n.d.", French produces "s. d."
    const reqNoDateFr: CitationDocumentRequest = {
      documentId: "doc-nodate-fr",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "nodateAuthor" }] }],
      locale: "fr-FR",
      includeBibliography: false,
    };

    const resNoDateFr = await provider.renderDocument(reqNoDateFr);
    assert.ok(
      resNoDateFr.citations[0].plainText.includes("s. d."),
      `Expected 's. d.' (sans date) in fr-FR but got: '${resNoDateFr.citations[0].plainText}'`
    );

    plugin.onunload();
  });

  it("fails closed on unbundled locale (e.g. de-DE) with CSL_LOCALE_UNAVAILABLE", async () => {
    const state: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(state);
    const mockApp = createMockApp(mockApi);

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    const provider = mockApi.getProvider(PROVIDER_ID);
    assert.ok(provider !== null);

    const request: CitationDocumentRequest = {
      documentId: "doc-de-test",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "smith2020" }] }],
      locale: "de-DE",
      includeBibliography: false,
    };

    const result = await provider.renderDocument(request);

    assert.ok(result.diagnostics.length > 0, "Must produce diagnostics for unavailable locale");
    const localeDiag = result.diagnostics.find((d) => d.code === "CSL_LOCALE_UNAVAILABLE");
    assert.ok(localeDiag !== undefined, "Must contain CSL_LOCALE_UNAVAILABLE diagnostic");
    assert.equal(localeDiag.severity, "error");
    assert.ok(localeDiag.message.includes("de-DE"));

    assert.equal(result.citations.length, 0);

    plugin.onunload();
  });

  it("disposeDocument(documentId) releases document session without affecting others", async () => {
    const state: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(state);
    const mockApp = createMockApp(mockApi);

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    const provider = mockApi.getProvider(PROVIDER_ID);
    assert.ok(provider !== null);

    const docAReqRev1: CitationDocumentRequest = {
      documentId: "doc-A",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "smith2020" }] }],
      includeBibliography: false,
    };

    const docBReqRev1: CitationDocumentRequest = {
      documentId: "doc-B",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "smithDoe2021" }] }],
      includeBibliography: false,
    };

    await provider.renderDocument(docAReqRev1);
    await provider.renderDocument(docBReqRev1);

    provider.disposeDocument("doc-A");

    // Re-rendering doc-A at revision 1 starts fresh session
    const resA2 = await provider.renderDocument(docAReqRev1);
    assert.equal(resA2.documentId, "doc-A");
    assert.equal(resA2.revision, 1);
    assert.equal(resA2.citations.length, 1);

    // doc-B is unaffected and increments incrementally to revision 2
    const docBReqRev2: CitationDocumentRequest = {
      ...docBReqRev1,
      revision: 2,
      clusters: [
        { id: "c1", items: [{ id: "smithDoe2021" }] },
        { id: "c2", items: [{ id: "smith2020" }] },
      ],
    };

    const resB2 = await provider.renderDocument(docBReqRev2);
    assert.equal(resB2.documentId, "doc-B");
    assert.equal(resB2.revision, 2);
    assert.equal(resB2.citations.length, 2);

    plugin.onunload();
  });

  it("plugin onunload() cleans up provider and releases engine resources", async () => {
    const state: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(state);
    const mockApp = createMockApp(mockApi);

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    const provider = mockApi.getProvider(PROVIDER_ID);
    assert.ok(provider !== null);

    const req: CitationDocumentRequest = {
      documentId: "doc-unload-test",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "smith2020" }] }],
      includeBibliography: false,
    };
    await provider.renderDocument(req);

    plugin.onunload();

    assert.equal(state.unregisterCallCount, 1);
    assert.equal(state.providers.get(PROVIDER_ID), undefined);
    assert.equal(plugin.isConnected(), false);
    assert.equal(plugin.getProvider(), null);

    // A replacement provider must survive unloading the older plugin instance.
    const pluginOld = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    pluginOld.onload();

    const newerProvider: CitationEngineProvider = {
      id: PROVIDER_ID,
      name: "Feuillets CSL Newer",
      version: "0.2.0",
      renderDocument: async (r) => ({
        documentId: r.documentId,
        revision: r.revision,
        citations: [],
        bibliography: null,
        diagnostics: [],
      }),
      disposeDocument: () => {},
    };
    // Newer provider takes over Feuillets registry
    state.providers.set(PROVIDER_ID, newerProvider);

    // Unloading old plugin must NOT unregister newer provider
    const unregisterCountBefore = state.unregisterCallCount;
    pluginOld.onunload();
    assert.equal(
      state.unregisterCallCount,
      unregisterCountBefore,
      "Must not unregister newer provider"
    );
    assert.equal(state.providers.get(PROVIDER_ID), newerProvider);
  });

  it("preserves engine session across Feuillets reload cycles", async () => {
    let state: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    let mockApi = createMockCitationApi(state);
    const mockApp = createMockApp(mockApi);

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    const provider = mockApi.getProvider(PROVIDER_ID);
    assert.ok(provider !== null);

    const docReqRev1: CitationDocumentRequest = {
      documentId: "doc-session-persists",
      revision: 1,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "smith2020" }] }],
      includeBibliography: false,
    };
    const res1 = await provider.renderDocument(docReqRev1);
    assert.equal(res1.revision, 1);

    // Simulate Feuillets reload: new registry, previous providers wiped out
    state = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    mockApi = createMockCitationApi(state);
    mockApp.plugins.plugins[FEUILLETS_PLUGIN_ID] = {
      api: { citations: mockApi },
    };

    const connected = plugin.connect();
    assert.equal(connected, true);
    assert.equal(state.registerCallCount, 1);
    assert.equal(state.providers.get(PROVIDER_ID), provider);

    // Existing engine session for doc-session-persists is still alive and processes revision 2
    const docReqRev2: CitationDocumentRequest = {
      ...docReqRev1,
      revision: 2,
      clusters: [
        { id: "c1", items: [{ id: "smith2020" }] },
        { id: "c2", items: [{ id: "smithDoe2021" }] },
      ],
    };

    const res2 = await provider.renderDocument(docReqRev2);
    assert.equal(res2.documentId, "doc-session-persists");
    assert.equal(res2.revision, 2);
    assert.equal(res2.citations.length, 2);

    plugin.onunload();
  });

  it("validates structural schema parity (DTO contract)", async () => {
    const state: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(state);
    const mockApp = createMockApp(mockApi);

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    const provider = mockApi.getProvider(PROVIDER_ID);
    assert.ok(provider !== null);

    const request: CitationDocumentRequest = {
      documentId: "doc-parity",
      revision: 4,
      style: { id: "author-date", version: "1.0", xml: authorDateStyle },
      bibliographies: [{ id: "b1", version: "1.0", format: "bibtex", content: sampleBibtex }],
      clusters: [{ id: "c1", items: [{ id: "smith2020" }] }],
      includeBibliography: true,
      locale: "en-US",
    };

    const result = await provider.renderDocument(request);

    // Structural parity checks (same as Feuillets validator):
    assert.equal(typeof result.documentId, "string");
    assert.equal(result.documentId, "doc-parity");
    assert.equal(typeof result.revision, "number");
    assert.equal(Number.isInteger(result.revision), true);
    assert.equal(result.revision, 4);
    assert.ok(Array.isArray(result.citations));
    assert.ok(Array.isArray(result.diagnostics));

    // Zero raw HTML on result root
    const rootRecord = result as unknown as Record<string, unknown>;
    for (const key of ["html", "rawHtml", "innerHTML", "outerHTML", "unsafeHtml"]) {
      assert.equal(key in rootRecord, false);
    }

    for (const cit of result.citations) {
      assert.equal(typeof cit.clusterId, "string");
      assert.equal(typeof cit.plainText, "string");
      assert.ok(Array.isArray(cit.content));
      assertSafeNodeAst(cit.content);
    }

    assert.ok(result.bibliography !== null);
    assert.ok(Array.isArray(result.bibliography.entries));
    assert.equal(typeof result.bibliography.layout.hangingIndent, "boolean");
    assert.equal(typeof result.bibliography.layout.entrySpacing, "number");
    assert.equal(typeof result.bibliography.layout.lineSpacing, "number");

    for (const entry of result.bibliography.entries) {
      assert.ok(Array.isArray(entry.itemIds));
      assert.equal(typeof entry.plainText, "string");
      assert.ok(Array.isArray(entry.content));
      assertSafeNodeAst(entry.content);
    }

    plugin.onunload();
  });
});
