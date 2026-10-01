import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const FORBIDDEN_NETWORK_PACKAGES = [
  "axios",
  "node-fetch",
  "request",
  "got",
  "superagent",
  "urllib",
  "undici",
  "cross-fetch",
  "isomorphic-fetch",
];

const FORBIDDEN_NODE_MODULES = [
  "http",
  "https",
  "net",
  "tls",
  "dns",
  "dgram",
  "child_process",
];

const FORBIDDEN_WEB_APIS = [
  { name: "XMLHttpRequest", regex: /\bXMLHttpRequest\b/ },
  { name: "WebSocket", regex: /\bWebSocket\b/ },
  { name: "EventSource", regex: /\bEventSource\b/ },
  { name: "WebTransport", regex: /\bWebTransport\b/ },
  { name: "navigator.sendBeacon", regex: /\bsendBeacon\b/ },
  { name: "globalThis/window.fetch", regex: /(?:window|globalThis|navigator)\.fetch\b/ },
  {
    name: "standalone fetch invocation",
    // Matches standalone fetch(...) call that is NOT an object property access or method definition
    regex: /(?<![\w.$])fetch\s*\([^)]*\)\s*(?!\s*\{)/,
  },
];

let hasViolations = false;

function reportViolation(scope, message) {
  hasViolations = true;
  console.error(`[AUDIT VIOLATION] [${scope}] ${message}`);
}

// 1. Audit package.json dependencies
console.log("--> Auditing package.json dependencies...");
const pkgRaw = fs.readFileSync("package.json", "utf-8");
const pkg = JSON.parse(pkgRaw);

const runtimeDeps = Object.keys(pkg.dependencies || {});
const devDeps = Object.keys(pkg.devDependencies || {});
const allDeps = [...runtimeDeps, ...devDeps];

for (const dep of allDeps) {
  if (FORBIDDEN_NETWORK_PACKAGES.includes(dep.toLowerCase())) {
    reportViolation(
      "package.json",
      `Forbidden network package '${dep}' declared in dependencies.`
    );
  }
}

// Strictly verify allowed runtime dependencies in Lot 4
const expectedRuntimeDeps = ["@retorquere/bibtex-parser", "citeproc-ts"];
for (const dep of runtimeDeps) {
  if (!expectedRuntimeDeps.includes(dep)) {
    reportViolation(
      "package.json",
      `Unauthorized runtime dependency '${dep}' found in dependencies.`
    );
  }
}

// 2. Audit Source Code (src/ and main.ts)
console.log("--> Auditing source files (src/ and main.ts)...");
function collectFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const sourceFiles = ["main.ts", ...collectFiles("src")];

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, "utf-8");

  // Check Node network modules
  for (const mod of FORBIDDEN_NODE_MODULES) {
    const nodeModRegex = new RegExp(`["'](?:node:)?${mod}["']`);
    if (nodeModRegex.test(content)) {
      reportViolation(file, `Forbidden Node module import '${mod}'.`);
    }
  }

  // Check Web network APIs
  for (const { name, regex } of FORBIDDEN_WEB_APIS) {
    if (regex.test(content)) {
      reportViolation(file, `Forbidden web network API '${name}'.`);
    }
  }

  // Check hardcoded URLs in source files
  const urlRegex = /https?:\/\/[^\s"'\`<>)]+/g;
  const urls = content.match(urlRegex) || [];
  if (urls.length > 0) {
    reportViolation(
      file,
      `Hardcoded URL(s) found in source: ${urls.join(", ")}`
    );
  }
}

// 3. Audit main.js bundle if present
if (fs.existsSync("main.js")) {
  console.log("--> Auditing main.js plugin bundle...");
  const mainContent = fs.readFileSync("main.js", "utf-8");

  for (const mod of FORBIDDEN_NODE_MODULES) {
    const nodeModRegex = new RegExp(`["'](?:node:)?${mod}["']`);
    if (nodeModRegex.test(mainContent)) {
      reportViolation("main.js", `Forbidden Node module reference '${mod}'.`);
    }
  }

  for (const { name, regex } of FORBIDDEN_WEB_APIS) {
    if (regex.test(mainContent)) {
      reportViolation("main.js", `Forbidden web network API '${name}'.`);
    }
  }
}

// 4. Audit .engine-audit/engine-probe.js bundle
const probePath = ".engine-audit/engine-probe.js";
if (!fs.existsSync(probePath)) {
  console.log("--> Building engine probe for bundle inspection...");
  execSync("node scripts/build-engine-probe.mjs", { stdio: "inherit" });
}

if (fs.existsSync(probePath)) {
  console.log(`--> Auditing ${probePath}...`);
  const probeContent = fs.readFileSync(probePath, "utf-8");

  for (const mod of FORBIDDEN_NODE_MODULES) {
    const nodeModRegex = new RegExp(`["'](?:node:)?${mod}["']`);
    if (nodeModRegex.test(probeContent)) {
      reportViolation(probePath, `Forbidden Node module reference '${mod}'.`);
    }
  }

  for (const { name, regex } of FORBIDDEN_WEB_APIS) {
    if (regex.test(probeContent)) {
      reportViolation(probePath, `Forbidden web network API '${name}'.`);
    }
  }
}

if (hasViolations) {
  console.error("\n[FAILED] Network audit detected security violations!");
  process.exit(1);
} else {
  console.log("\n[PASS] Network audit passed: 0 network dependencies, 0 network APIs, 0 leaks.");
}
