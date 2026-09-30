import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "obsidian") {
      return {
        format: "module",
        shortCircuit: true,
        url: new URL("./mocks/obsidian-mock.mjs", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});
