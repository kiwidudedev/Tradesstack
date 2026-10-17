#!/usr/bin/env node
/**
 * Distribute the portable Worker App configuration contract from Main to the
 * Worker App repository, and generate the Worker capabilities file.
 *
 * Main owns `packages/worker-config`. The Worker App repository must not edit
 * its vendored copy by hand: it is a controlled, checksum-recorded artifact of
 * an approved Main revision (the same distribution model proven for private
 * packages, without requiring a package registry).
 *
 * Usage:
 *   node scripts/ops/sync-worker-config.mjs --worker-root <path> [--check]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib.mjs";
import { loadContract } from "./worker-contract.mjs";

const options = { check: false };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--check") options.check = true;
  else if (argument.startsWith("--")) options[argument.slice(2)] = process.argv[++index];
}

if (!options["worker-root"]) {
  console.error("--worker-root is required");
  process.exit(1);
}

const contract = await loadContract(ROOT);
const workerRoot = path.resolve(ROOT, options["worker-root"]);
if (!fs.existsSync(path.join(workerRoot, ".git"))) {
  console.error(`Worker root is not a Git repository: ${workerRoot}`);
  process.exit(1);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const mainSourceSha = git(["rev-parse", "HEAD"]);
const mainStatus = git(["status", "--porcelain"]);
const packageRoot = path.join(ROOT, "packages/worker-config");
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
// The Worker repository consumes the compiled, dependency-free ESM build plus
// its declarations. Main remains the only editable source of the contract.
const builtFiles = {
  "dist/index.js": fs.readFileSync(path.join(packageRoot, "dist/index.js"), "utf8"),
  "dist/index.d.ts": fs.readFileSync(path.join(packageRoot, "dist/index.d.ts"), "utf8"),
};

const vendorRoot = path.join(workerRoot, "vendor/tradesstack-worker-config");
const vendorManifest = path.join(vendorRoot, "manifest.json");
const vendorPackageJson = path.join(vendorRoot, "package.json");
const capabilitiesPath = path.join(workerRoot, "worker-capabilities.json");
const vendoredPackageJson = `${JSON.stringify({
  name: "@tradesstack/worker-config-vendored",
  private: true,
  type: "module",
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      default: "./dist/index.js",
    },
  },
  note: "Controlled vendored copy of @tradesstack/worker-config. Do not edit by hand.",
}, null, 2)}\n`;

const manifest = {
  schemaVersion: 1,
  package: packageJson.name,
  packageVersion: packageJson.version,
  configSchemaVersion: contract.WORKER_CONFIG_SCHEMA_VERSION,
  contractVersion: contract.WORKER_APP_CONTRACT_VERSION,
  mobileApiContractVersion: contract.MOBILE_API_CONTRACT_VERSION,
  mainSourceSha,
  mainWorkingTreeDirty: Boolean(mainStatus),
  distribution: "VENDORED_ARTIFACT_FROM_TRADESSTACK_MAIN",
  generatedBy: "scripts/ops/sync-worker-config.mjs",
  files: {
    "dist/index.js": sha256(builtFiles["dist/index.js"]),
    "dist/index.d.ts": sha256(builtFiles["dist/index.d.ts"]),
    "package.json": sha256(vendoredPackageJson),
  },
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const capabilitiesText = `${JSON.stringify(contract.WORKER_CAPABILITIES, null, 2)}\n`;

if (options.check) {
  const problems = [];
  const readOrNull = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
  for (const [relative, content] of Object.entries(builtFiles)) {
    if (readOrNull(path.join(vendorRoot, relative)) !== content) {
      problems.push(`vendor/tradesstack-worker-config/${relative} differs from Main`);
    }
  }
  if (readOrNull(vendorPackageJson) !== vendoredPackageJson) {
    problems.push("vendor/tradesstack-worker-config/package.json is stale");
  }
  const currentManifest = readOrNull(vendorManifest);
  if (currentManifest !== manifestText) {
    problems.push(
      "vendor/tradesstack-worker-config/manifest.json is stale (regenerate with npm run worker:sync-config)",
    );
  }
  if (readOrNull(capabilitiesPath) !== capabilitiesText) {
    problems.push("worker-capabilities.json differs from the Main contract registry");
  }
  if (problems.length) {
    console.log(JSON.stringify({ status: "DRIFT", problems }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "IN_SYNC", packageVersion: packageJson.version, mainSourceSha }, null, 2));
  process.exit(0);
}

fs.mkdirSync(path.join(vendorRoot, "dist"), { recursive: true });
for (const [relative, content] of Object.entries(builtFiles)) {
  fs.writeFileSync(path.join(vendorRoot, relative), content);
}
fs.writeFileSync(vendorPackageJson, vendoredPackageJson);
fs.writeFileSync(vendorManifest, manifestText);
fs.writeFileSync(path.join(vendorRoot, "README.md"), `# Vendored @tradesstack/worker-config

This directory is a controlled copy of \`packages/worker-config\` from TradesStack
Main. Do not edit it by hand.

- Package version: ${packageJson.version}
- Configuration schema: ${contract.WORKER_CONFIG_SCHEMA_VERSION}
- Application contract: ${contract.WORKER_APP_CONTRACT_VERSION}
- Mobile API contract: ${contract.MOBILE_API_CONTRACT_VERSION}
- Main source SHA: ${mainSourceSha}${mainStatus ? " (dirty working tree at sync time)" : ""}

Regenerate with \`npm run worker:sync-config\` from TradesStack Main. The Worker App
CI runs \`npm run worker:sync-config:check\` and fails if this copy has drifted.
`);
fs.writeFileSync(capabilitiesPath, capabilitiesText);

console.log(JSON.stringify({
  status: "SYNCED",
  packageVersion: packageJson.version,
  mainSourceSha,
  mainWorkingTreeDirty: Boolean(mainStatus),
  files: Object.keys(manifest.files),
  workerCapabilitiesPath: path.relative(workerRoot, capabilitiesPath),
}, null, 2));
