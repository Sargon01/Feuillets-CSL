import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const outDir = ".engine-audit";
const outFile = path.join(outDir, "engine-probe.js");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

await esbuild.build({
  entryPoints: ["src/citeproc-engine.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2018",
  outfile: outFile,
  logLevel: "warning",
  treeShaking: true,
});

const rawBytes = fs.readFileSync(outFile);
const gzipBytes = zlib.gzipSync(rawBytes);

console.log(`[engine-probe] Successfully built ${outFile}`);
console.log(
  `[engine-probe] Raw size: ${rawBytes.length} bytes (${(
    rawBytes.length /
    (1024 * 1024)
  ).toFixed(2)} MB)`
);
console.log(
  `[engine-probe] Gzip size: ${gzipBytes.length} bytes (${(
    gzipBytes.length / 1024
  ).toFixed(2)} KB)`
);

if (fs.existsSync("main.js")) {
  const mainBytes = fs.statSync("main.js").size;
  console.log(
    `[engine-probe] main.js size: ${mainBytes} bytes (engine and bundled locales integrated in main plugin)`
  );
}
