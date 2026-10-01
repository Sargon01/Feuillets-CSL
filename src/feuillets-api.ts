import type { App } from "obsidian";
import type { FeuilletsCitationApi } from "./feuillets-api-types.ts";
import {
  CITATION_API_VERSION,
  FEUILLETS_PLUGIN_ID,
} from "./feuillets-api-types.ts";

export { FEUILLETS_PLUGIN_ID };

interface ObsidianPluginManager {
  readonly plugins?: Record<string, unknown>;
}

interface ObsidianAppWithPlugins {
  readonly plugins?: ObsidianPluginManager;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function isValidCitationApi(val: unknown): val is FeuilletsCitationApi {
  if (!isRecord(val)) {
    return false;
  }

  const { apiVersion, registerProvider, unregisterProvider, getProvider } = val;

  return (
    apiVersion === CITATION_API_VERSION &&
    typeof registerProvider === "function" &&
    typeof unregisterProvider === "function" &&
    typeof getProvider === "function"
  );
}

/**
 * Safely discovers and retrieves the Feuillets citation API from the Obsidian App.
 *
 * Returns null if Feuillets is not loaded, if its API is not exposed,
 * or if its citation API version/contract does not match CITATION_API_VERSION (2).
 * Never throws exceptions.
 */
export function getFeuilletsCitationApi(app: App): FeuilletsCitationApi | null {
  try {
    if (!isRecord(app)) {
      return null;
    }

    const appWithPlugins = app as unknown as ObsidianAppWithPlugins;
    const pluginManager = appWithPlugins.plugins;
    if (!isRecord(pluginManager)) {
      return null;
    }

    const plugins = pluginManager.plugins;
    if (!isRecord(plugins)) {
      return null;
    }

    const feuilletsPlugin = plugins[FEUILLETS_PLUGIN_ID];
    if (!isRecord(feuilletsPlugin)) {
      return null;
    }

    const api = feuilletsPlugin["api"];
    if (!isRecord(api)) {
      return null;
    }

    const citations = api["citations"];
    if (!isValidCitationApi(citations)) {
      return null;
    }

    return citations;
  } catch {
    return null;
  }
}

/**
 * Returns true if the Feuillets plugin is present in Obsidian's plugin manager
 * but either does not expose the citations API or exposes an incompatible version.
 * Useful for diagnostics and logging warnings without false positives.
 */
export function isFeuilletsPresentWithoutCitationApi(app: App): boolean {
  try {
    if (!isRecord(app)) {
      return false;
    }

    const appWithPlugins = app as unknown as ObsidianAppWithPlugins;
    const pluginManager = appWithPlugins.plugins;
    if (!isRecord(pluginManager)) {
      return false;
    }

    const plugins = pluginManager.plugins;
    if (!isRecord(plugins)) {
      return false;
    }

    const feuilletsPlugin = plugins[FEUILLETS_PLUGIN_ID];
    if (!isRecord(feuilletsPlugin)) {
      return false;
    }

    return getFeuilletsCitationApi(app) === null;
  } catch {
    return false;
  }
}
