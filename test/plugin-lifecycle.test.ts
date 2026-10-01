import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { App } from "obsidian";
import FeuilletsCslPlugin from "../main.ts";
import { PROVIDER_ID, PROVIDER_NAME } from "../src/citation-provider.ts";
import type { CitationEngineProvider, FeuilletsCitationApi } from "../src/feuillets-api-types.ts";
import { FEUILLETS_PLUGIN_ID } from "../src/feuillets-api.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MockRegistryState {
  providers: Map<string, CitationEngineProvider>;
  registerCallCount: number;
  unregisterCallCount: number;
}

function createMockCitationApi(state: MockRegistryState): FeuilletsCitationApi {
  return {
    apiVersion: 1,
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

interface MockAppConfig {
  withFeuillets?: boolean;
  citationApi?: FeuilletsCitationApi | null;
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

function createMockApp(config: MockAppConfig = {}): MockApp {
  const layoutReadyCallbacks: (() => void)[] = [];
  const plugins: Record<string, unknown> = {};

  if (config.withFeuillets) {
    plugins[FEUILLETS_PLUGIN_ID] = {
      api: {
        citations: config.citationApi !== undefined ? config.citationApi : null,
      },
    };
  }

  return {
    plugins: {
      plugins,
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
  id: "feuillets-csl",
  name: "Feuillets CSL",
  version: "0.1.0",
  minAppVersion: "1.13.0",
  description: "CSL companion plugin",
  author: "Halim Yalcin",
  isDesktopOnly: false,
};

describe("Plugin Lifecycle & Scenarios", () => {
  it("CAS A: registers immediately when Feuillets is already loaded", () => {
    const registryState: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(registryState);
    const mockApp = createMockApp({ withFeuillets: true, citationApi: mockApi });

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    assert.equal(plugin.isConnected(), true);
    assert.equal(registryState.registerCallCount, 1);
    assert.equal(registryState.providers.has(PROVIDER_ID), true);
    assert.equal(registryState.providers.get(PROVIDER_ID)?.id, PROVIDER_ID);
    assert.equal(registryState.providers.get(PROVIDER_ID)?.name, PROVIDER_NAME);
    assert.equal(registryState.providers.get(PROVIDER_ID)?.version, "0.1.0");

    plugin.onunload();
  });

  it("CAS B: handles Feuillets CSL loading before Feuillets with retry on layoutReady", () => {
    const registryState: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(registryState);

    // Initial state: Feuillets is not loaded yet
    const mockApp = createMockApp({ withFeuillets: false });
    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);

    plugin.onload();

    // First attempt failed cleanly without exceptions
    assert.equal(plugin.isConnected(), false);
    assert.equal(registryState.registerCallCount, 0);

    // Feuillets becomes available later
    mockApp.plugins.plugins[FEUILLETS_PLUGIN_ID] = {
      api: { citations: mockApi },
    };

    // Layout ready triggers retry
    mockApp.workspace.triggerLayoutReady();

    assert.equal(plugin.isConnected(), true);
    assert.equal(registryState.registerCallCount, 1);
    assert.equal(registryState.providers.has(PROVIDER_ID), true);

    plugin.onunload();
  });

  it("CAS C: reconnects automatically when Feuillets is reloaded with a new registry", () => {
    const state1: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi1 = createMockCitationApi(state1);
    const mockApp = createMockApp({ withFeuillets: true, citationApi: mockApi1 });

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    assert.equal(plugin.isConnected(), true);
    assert.equal(state1.registerCallCount, 1);

    // Feuillets is reloaded: new instance with empty registry
    const state2: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi2 = createMockCitationApi(state2);
    mockApp.plugins.plugins[FEUILLETS_PLUGIN_ID] = {
      api: { citations: mockApi2 },
    };

    // Next connection check (simulating periodic interval tick)
    const reconnected = plugin.connect();

    assert.equal(reconnected, true);
    assert.equal(plugin.isConnected(), true);
    assert.equal(state2.registerCallCount, 1);
    assert.equal(state2.providers.has(PROVIDER_ID), true);

    plugin.onunload();
  });

  it("CAS D: unregisters provider from current registry on onunload", () => {
    const registryState: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(registryState);
    const mockApp = createMockApp({ withFeuillets: true, citationApi: mockApi });

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    assert.equal(registryState.providers.has(PROVIDER_ID), true);

    plugin.onunload();

    assert.equal(plugin.isConnected(), false);
    assert.equal(plugin.getProvider(), null);
    assert.equal(registryState.unregisterCallCount, 1);
    assert.equal(registryState.providers.has(PROVIDER_ID), false);
  });

  it("CAS E: Feuillets absent causes no exception", () => {
    const mockApp = createMockApp({ withFeuillets: false });
    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);

    assert.doesNotThrow(() => {
      plugin.onload();
    });
    assert.equal(plugin.isConnected(), false);

    assert.doesNotThrow(() => {
      plugin.onunload();
    });
  });

  it("CAS F: Feuillets without citation API causes no exception", () => {
    const mockApp = createMockApp({ withFeuillets: true, citationApi: null });
    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);

    assert.doesNotThrow(() => {
      plugin.onload();
    });
    assert.equal(plugin.isConnected(), false);

    assert.doesNotThrow(() => {
      plugin.onunload();
    });
  });

  it("CAS G: rejects connection when apiVersion !== 1", () => {
    const registryState: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const invalidApi = {
      apiVersion: 2,
      registerProvider: (p: CitationEngineProvider) => {
        registryState.providers.set(p.id, p);
      },
      unregisterProvider: (id: string) => {
        registryState.providers.delete(id);
      },
      getProvider: (id?: string) => (id ? registryState.providers.get(id) ?? null : null),
    } as unknown as FeuilletsCitationApi;

    const mockApp = createMockApp({ withFeuillets: true, citationApi: invalidApi });
    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);

    plugin.onload();

    assert.equal(plugin.isConnected(), false);
    assert.equal(registryState.registerCallCount, 0);

    plugin.onunload();
  });

  it("CAS H: connect() is fully idempotent and does not re-register the same instance", () => {
    const registryState: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(registryState);
    const mockApp = createMockApp({ withFeuillets: true, citationApi: mockApi });

    const plugin = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin.onload();

    assert.equal(registryState.registerCallCount, 1);

    // Call connect() multiple times
    const secondConnect = plugin.connect();
    const thirdConnect = plugin.connect();

    assert.equal(secondConnect, true);
    assert.equal(thirdConnect, true);
    // registerProvider must NOT be called again
    assert.equal(registryState.registerCallCount, 1);

    plugin.onunload();
  });

  it("protects against unregistering a newer provider instance during unload", () => {
    const registryState: MockRegistryState = {
      providers: new Map(),
      registerCallCount: 0,
      unregisterCallCount: 0,
    };
    const mockApi = createMockCitationApi(registryState);
    const mockApp = createMockApp({ withFeuillets: true, citationApi: mockApi });

    const plugin1 = new FeuilletsCslPlugin(mockApp as unknown as App, mockManifest);
    plugin1.onload();

    // A newer plugin instance registers its own provider
    const newerProvider: CitationEngineProvider = {
      id: PROVIDER_ID,
      name: "Feuillets CSL (Newer)",
      version: "0.2.0",
    };
    registryState.providers.set(PROVIDER_ID, newerProvider);

    // Plugin 1 is unloaded
    plugin1.onunload();

    // unregisterProvider should NOT have been called because the active provider is not plugin1's
    assert.equal(registryState.unregisterCallCount, 0);
    assert.equal(registryState.providers.get(PROVIDER_ID), newerProvider);
  });

  it("verifies package.json has strictly and only the 2 authorized runtime dependencies", () => {
    const pkgPath = path.resolve(__dirname, "../package.json");
    const pkgRaw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;

    const deps = (pkg["dependencies"] ?? {}) as Record<string, string>;
    assert.deepEqual(deps, {
      "@retorquere/bibtex-parser": "11.0.0",
      "citeproc-ts": "0.2.5",
    });
  });

  it("verifies 0 network dependencies and 0 network usage in source and bundle", () => {
    const forbiddenPatterns = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bEventSource\b/,
      /\bWebTransport\b/,
      /["']node:http["']/,
      /["']http["']/,
      /["']node:https["']/,
      /["']https["']/,
      /["']node:net["']/,
      /["']net["']/,
      /["']node:tls["']/,
      /["']tls["']/,
      /["']node:dns["']/,
      /["']dns["']/,
      /["']node:child_process["']/,
      /["']child_process["']/,
    ];

    const sourceFiles = [
      path.resolve(__dirname, "../main.ts"),
      path.resolve(__dirname, "../src/citation-provider.ts"),
      path.resolve(__dirname, "../src/feuillets-api.ts"),
      path.resolve(__dirname, "../src/feuillets-api-types.ts"),
      path.resolve(__dirname, "../src/engine-contract.ts"),
      path.resolve(__dirname, "../src/engine-validation.ts"),
    ];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `File ${path.basename(file)} must not contain pattern ${pattern.toString()}`
        );
      }
    }

    const mainJsPath = path.resolve(__dirname, "../main.js");
    if (fs.existsSync(mainJsPath)) {
      const mainJsContent = fs.readFileSync(mainJsPath, "utf-8");
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(mainJsContent),
          false,
          `main.js must not contain pattern ${pattern.toString()}`
        );
      }
    }
  });
});
