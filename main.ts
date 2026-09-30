import { Plugin } from "obsidian";
import { FeuilletsCslProvider, PROVIDER_ID } from "./src/citation-provider.ts";
import { getFeuilletsCitationApi } from "./src/feuillets-api.ts";
import type { FeuilletsCitationApi } from "./src/feuillets-api-types.ts";

/**
 * Feuillets CSL companion plugin.
 *
 * Connects to the Feuillets writing studio and registers a minimal
 * CSL citation engine provider.
 */
export default class FeuilletsCslPlugin extends Plugin {
  private provider: FeuilletsCslProvider | null = null;
  private connected: boolean = false;
  private unloaded: boolean = false;
  private warnedFeuilletsMissing: boolean = false;

  onload(): void {
    this.unloaded = false;
    this.provider = new FeuilletsCslProvider(this.manifest.version);

    // 1. Try connecting immediately in case Feuillets was loaded first
    this.connect();

    // 2. Retry after all plugins are loaded (layout ready)
    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) {
        return;
      }
      const ok = this.connect();
      if (!ok && !this.warnedFeuilletsMissing) {
        this.warnedFeuilletsMissing = true;
        console.warn(
          "[Feuillets CSL] Feuillets citation API (v1) not found. Feuillets CSL is waiting for Feuillets."
        );
      }
    });

    // 3. Periodic lightweight check to handle cases where Feuillets is reloaded
    const CHECK_INTERVAL_MS = 4000;
    const intervalFn =
      typeof window !== "undefined" && typeof window.setInterval === "function"
        ? window.setInterval.bind(window)
        : setInterval;

    const timerId = intervalFn(() => {
      if (this.unloaded) {
        return;
      }
      this.connect();
    }, CHECK_INTERVAL_MS);

    if (
      timerId &&
      typeof timerId === "object" &&
      "unref" in timerId &&
      typeof (timerId as { unref?: () => void }).unref === "function"
    ) {
      (timerId as { unref: () => void }).unref();
    }

    this.registerInterval(timerId as unknown as number);
  }

  /**
   * Attempts to discover Feuillets citation API and register the provider.
   *
   * Fully idempotent:
   * - Returns false if Feuillets / citation API is absent or incompatible.
   * - If already registered with the current provider instance, does nothing and returns true.
   * - If the provider was not registered or Feuillets was reloaded with a fresh registry,
   *   registers the provider and returns true.
   */
  connect(): boolean {
    if (this.unloaded || !this.provider) {
      this.connected = false;
      return false;
    }

    const api: FeuilletsCitationApi | null = getFeuilletsCitationApi(this.app);
    if (!api) {
      this.connected = false;
      return false;
    }

    if (api.getProvider(PROVIDER_ID) === this.provider) {
      this.connected = true;
      return true;
    }

    api.registerProvider(this.provider);
    this.connected = true;
    return true;
  }

  onunload(): void {
    this.unloaded = true;

    try {
      const api = getFeuilletsCitationApi(this.app);
      if (
        api &&
        this.provider &&
        api.getProvider(PROVIDER_ID) === this.provider
      ) {
        api.unregisterProvider(PROVIDER_ID);
      }
    } finally {
      this.provider = null;
      this.connected = false;
      super.onunload();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getProvider(): FeuilletsCslProvider | null {
    return this.provider;
  }
}
