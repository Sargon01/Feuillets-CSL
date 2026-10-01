import { registerHooks } from "node:module";
import fs from "node:fs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "obsidian") {
      return {
        format: "module",
        shortCircuit: true,
        url: new URL("./mocks/obsidian-mock.mjs", import.meta.url).href,
      };
    }
    if (specifier.endsWith(".xml") && context.parentURL) {
      const resolvedUrl = new URL(specifier, context.parentURL);
      const content = fs.readFileSync(resolvedUrl, "utf-8");
      const code = `export default ${JSON.stringify(content)};`;
      const base64Code = Buffer.from(code).toString("base64");
      return {
        format: "module",
        shortCircuit: true,
        url: `data:text/javascript;base64,${base64Code}`,
      };
    }
    return nextResolve(specifier, context);
  },
});
