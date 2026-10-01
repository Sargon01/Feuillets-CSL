import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import {
  getFeuilletsCitationApi,
  isFeuilletsPresentWithoutCitationApi,
  FEUILLETS_PLUGIN_ID,
} from "../src/feuillets-api.ts";
import type { CitationEngineProvider, FeuilletsCitationApi } from "../src/feuillets-api-types.ts";

function createValidCitationApi(): FeuilletsCitationApi {
  const providers = new Map<string, CitationEngineProvider>();
  return {
    apiVersion: 2,
    registerProvider(provider: CitationEngineProvider): void {
      providers.set(provider.id, provider);
    },
    unregisterProvider(providerId: string): void {
      providers.delete(providerId);
    },
    getProvider(providerId?: string): CitationEngineProvider | null {
      if (providerId) {
        return providers.get(providerId) ?? null;
      }
      return providers.values().next().value ?? null;
    },
  };
}

function createAppWithFeuillets(apiOverride?: unknown): App {
  const pluginInstance = apiOverride !== undefined
    ? { api: apiOverride }
    : {
        api: {
          citations: createValidCitationApi(),
        },
      };

  return {
    plugins: {
      plugins: {
        [FEUILLETS_PLUGIN_ID]: pluginInstance,
      },
    },
  } as unknown as App;
}

describe("getFeuilletsCitationApi", () => {
  it("detects a valid Feuillets citation API v2", () => {
    const app = createAppWithFeuillets();
    const api = getFeuilletsCitationApi(app);

    assert.ok(api !== null);
    assert.equal(api.apiVersion, 2);
    assert.equal(typeof api.registerProvider, "function");
    assert.equal(typeof api.unregisterProvider, "function");
    assert.equal(typeof api.getProvider, "function");
  });

  it("returns null when app is null or undefined without throwing", () => {
    assert.equal(getFeuilletsCitationApi(null as unknown as App), null);
    assert.equal(getFeuilletsCitationApi(undefined as unknown as App), null);
    assert.equal(getFeuilletsCitationApi({} as unknown as App), null);
  });

  it("returns null when plugins manager is missing or empty", () => {
    const appWithoutPlugins = { plugins: {} } as unknown as App;
    assert.equal(getFeuilletsCitationApi(appWithoutPlugins), null);

    const appWithEmptyPlugins = { plugins: { plugins: {} } } as unknown as App;
    assert.equal(getFeuilletsCitationApi(appWithEmptyPlugins), null);
  });

  it("returns null when Feuillets plugin has no api object", () => {
    const app = createAppWithFeuillets(null);
    assert.equal(getFeuilletsCitationApi(app), null);
  });

  it("returns null when api has no citations property", () => {
    const app = createAppWithFeuillets({});
    assert.equal(getFeuilletsCitationApi(app), null);
  });

  it("strictly enforces apiVersion === 2 (v1 rejected, v2 accepted, v3 rejected)", () => {
    // v1 is rejected cleanly
    const appV1 = createAppWithFeuillets({
      citations: {
        apiVersion: 1,
        registerProvider: () => {},
        unregisterProvider: () => {},
        getProvider: () => null,
      },
    });
    assert.equal(getFeuilletsCitationApi(appV1), null, "API v1 must be rejected cleanly");

    // v2 is accepted
    const appV2 = createAppWithFeuillets({
      citations: {
        apiVersion: 2,
        registerProvider: () => {},
        unregisterProvider: () => {},
        getProvider: () => null,
      },
    });
    assert.ok(getFeuilletsCitationApi(appV2) !== null, "API v2 must be accepted");

    // v3 is rejected cleanly
    const appV3 = createAppWithFeuillets({
      citations: {
        apiVersion: 3,
        registerProvider: () => {},
        unregisterProvider: () => {},
        getProvider: () => null,
      },
    });
    assert.equal(getFeuilletsCitationApi(appV3), null, "API v3 must be rejected cleanly");

    // Other invalid versions
    const invalidVersions = [0, 99, "2", null, undefined];
    for (const v of invalidVersions) {
      const app = createAppWithFeuillets({
        citations: {
          apiVersion: v,
          registerProvider: () => {},
          unregisterProvider: () => {},
          getProvider: () => null,
        },
      });
      assert.equal(
        getFeuilletsCitationApi(app),
        null,
        `Expected null for apiVersion ${String(v)}`
      );
    }
  });

  it("returns null when required methods are missing or not functions", () => {
    const missingRegister = createAppWithFeuillets({
      citations: {
        apiVersion: 2,
        unregisterProvider: () => {},
        getProvider: () => null,
      },
    });
    assert.equal(getFeuilletsCitationApi(missingRegister), null);

    const missingUnregister = createAppWithFeuillets({
      citations: {
        apiVersion: 2,
        registerProvider: () => {},
        getProvider: () => null,
      },
    });
    assert.equal(getFeuilletsCitationApi(missingUnregister), null);

    const missingGet = createAppWithFeuillets({
      citations: {
        apiVersion: 2,
        registerProvider: () => {},
        unregisterProvider: () => {},
      },
    });
    assert.equal(getFeuilletsCitationApi(missingGet), null);
  });

  it("catches throwing getters safely and returns null", () => {
    const throwingApp = {
      get plugins() {
        throw new Error("Simulated plugin manager access failure");
      },
    } as unknown as App;

    assert.equal(getFeuilletsCitationApi(throwingApp), null);
  });
});

describe("isFeuilletsPresentWithoutCitationApi", () => {
  it("returns false when Feuillets is absent", () => {
    const app = { plugins: { plugins: {} } } as unknown as App;
    assert.equal(isFeuilletsPresentWithoutCitationApi(app), false);
  });

  it("returns false when Feuillets is present with valid API v2", () => {
    const app = createAppWithFeuillets();
    assert.equal(isFeuilletsPresentWithoutCitationApi(app), false);
  });

  it("returns true when Feuillets is present without citation API", () => {
    const app = createAppWithFeuillets({});
    assert.equal(isFeuilletsPresentWithoutCitationApi(app), true);
  });

  it("returns true when Feuillets has an incompatible apiVersion (e.g. v1 or v3)", () => {
    const appV1 = createAppWithFeuillets({
      citations: {
        apiVersion: 1,
        registerProvider: () => {},
        unregisterProvider: () => {},
        getProvider: () => null,
      },
    });
    assert.equal(isFeuilletsPresentWithoutCitationApi(appV1), true);

    const appV3 = createAppWithFeuillets({
      citations: {
        apiVersion: 3,
        registerProvider: () => {},
        unregisterProvider: () => {},
        getProvider: () => null,
      },
    });
    assert.equal(isFeuilletsPresentWithoutCitationApi(appV3), true);
  });
});
