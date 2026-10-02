import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FeuilletsCslProvider,
  PROVIDER_ID,
  PROVIDER_NAME,
} from "../src/citation-provider.ts";
import type {
  CitationDocumentEngine,
  CitationDocumentRequest,
  CitationDocumentResult,
} from "../src/engine-contract.ts";
import type { CitationEngineProvider } from "../src/feuillets-api-types.ts";

class MockEngine implements CitationDocumentEngine {
  renderDocumentCallCount = 0;
  disposeDocumentCallCount = 0;
  disposeCallCount = 0;
  lastDisposedDocumentId: string | null = null;
  lastRequest: CitationDocumentRequest | null = null;

  async renderDocument(
    request: CitationDocumentRequest
  ): Promise<CitationDocumentResult> {
    this.renderDocumentCallCount++;
    this.lastRequest = request;
    return {
      documentId: request.documentId,
      revision: request.revision,
      citations: [],
      bibliography: null,
      diagnostics: [],
    };
  }

  disposeDocument(documentId: string): void {
    this.disposeDocumentCallCount++;
    this.lastDisposedDocumentId = documentId;
  }

  dispose(): void {
    this.disposeCallCount++;
  }
}

describe("FeuilletsCslProvider (API v2)", () => {
  it("initializes with correct id and name constants", () => {
    assert.equal(PROVIDER_ID, "feuillets-csl");
    assert.equal(PROVIDER_NAME, "Feuillets CSL");
  });

  it("instantiates with manifest version and engine", () => {
    const engine = new MockEngine();
    const provider = new FeuilletsCslProvider("0.1.0", engine);
    assert.equal(provider.id, "feuillets-csl");
    assert.equal(provider.name, "Feuillets CSL");
    assert.equal(provider.version, "0.1.0");

    const publicProvider: CitationEngineProvider = provider;
    assert.equal(typeof publicProvider.renderDocument, "function");
    assert.equal(typeof publicProvider.disposeDocument, "function");
  });

  it("delegates renderDocument to internal engine", async () => {
    const engine = new MockEngine();
    const provider = new FeuilletsCslProvider("0.1.0", engine);

    const request: CitationDocumentRequest = {
      documentId: "doc-test",
      revision: 3,
      style: { id: "s1", version: "1", xml: "<style/>" },
      bibliographies: [{ id: "b1", version: "1", format: "bibtex", content: "@book{}" }],
      clusters: [],
      includeBibliography: false,
    };

    const result = await provider.renderDocument(request);
    assert.equal(engine.renderDocumentCallCount, 1);
    assert.equal(engine.lastRequest, request);
    assert.equal(result.documentId, "doc-test");
    assert.equal(result.revision, 3);
  });

  it("delegates disposeDocument to internal engine", () => {
    const engine = new MockEngine();
    const provider = new FeuilletsCslProvider("0.1.0", engine);

    provider.disposeDocument("doc-to-dispose");
    assert.equal(engine.disposeDocumentCallCount, 1);
    assert.equal(engine.lastDisposedDocumentId, "doc-to-dispose");
  });

  it("delegates dispose() to internal engine for plugin lifecycle", () => {
    const engine = new MockEngine();
    const provider = new FeuilletsCslProvider("0.1.0", engine);

    provider.dispose();
    assert.equal(engine.disposeCallCount, 1);
  });
});
