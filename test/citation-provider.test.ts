import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FeuilletsCslProvider,
  PROVIDER_ID,
  PROVIDER_NAME,
} from "../src/citation-provider.ts";

describe("FeuilletsCslProvider", () => {
  it("initializes with correct id and name constants", () => {
    assert.equal(PROVIDER_ID, "feuillets-csl");
    assert.equal(PROVIDER_NAME, "Feuillets CSL");
  });

  it("instantiates with the manifest version", () => {
    const provider = new FeuilletsCslProvider("0.1.0");
    assert.equal(provider.id, "feuillets-csl");
    assert.equal(provider.name, "Feuillets CSL");
    assert.equal(provider.version, "0.1.0");
  });

  it("contains no CSL engine or rendering methods", () => {
    const provider = new FeuilletsCslProvider("0.1.0");
    const record = provider as unknown as Record<string, unknown>;

    assert.equal(record["renderCitation"], undefined);
    assert.equal(record["renderDocument"], undefined);
    assert.equal(record["createSession"], undefined);
    assert.equal(record["makeBibliography"], undefined);
    assert.equal(record["parseBibtex"], undefined);
    assert.equal(record["loadStyle"], undefined);
  });
});
