#!/usr/bin/env node
/**
 * Create or verify an immutable TradesStack Worker App release manifest.
 *
 * A Worker release is a deterministic snapshot identity (file list + SHA-256
 * per file + fingerprint) of a Worker App repository commit. It is produced in
 * Main so the same control plane owns web releases, Worker releases and
 * customer upgrade records.
 *
 * Usage:
 *   node scripts/ops/worker-release.mjs --create --version 1.0.0 \
 *     --worker-root ../tradesstack-worker-app/tradesstack-worker-app \
 *     --sha <commit> --typecheck PASS --lint PASS --tests PASS --build PASS [--write]
 *
 *   node scripts/ops/worker-release.mjs --verify --version 1.0.0 --worker-root <path>
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT, SECRET_PATTERNS, compareSemver, semver } from "./lib.mjs";
import {
  WORKER_REQUIRED_FILES,
  latestWorkerRelease,
  loadContract,
  loadWorkerProduct,
  validateWorkerReleaseManifest,
  workerPaths,
  workerReleaseFingerprint,
} from "./worker-contract.mjs";

const repositoryRoot = ROOT;
const contract = await loadContract(repositoryRoot);

/**
 * Compatibility policy for Worker App releases. The Worker App depends on the
 * mobile API contract (Edge Functions + mobile RPCs), not on the whole web
 * release history. The floor is the migration that introduced the current
 * mobile Variations contract; the minimum web release is the first approved
 * release that carries it. Both can be overridden per release on the command
 * line when the mobile contract genuinely changes.
 */
const WORKER_MINIMUM_WEB_RELEASE = "1.0.0";
const WORKER_DATABASE_MIGRATION_FLOOR = "20261003160000_add_mobile_project_variation_capabilities_v1.sql";

const INCLUDE_ROOTS = [
  ".github", "app", "assets", "components", "constants", "docs", "hooks", "profiles",
  "public", "scripts", "src", "tests", "vendor",
];
const INCLUDE_FILES = [
  ".gitignore", ".nvmrc", "app.config.ts", "eas.json", "eslint.config.js", "package-lock.json",
  "package.json", "README.md", "tsconfig.json", "worker-capabilities.json",
];
// Build output and native projects at the Worker repository root are never
// release content, but a nested `dist` (the vendored contract build) is.
const EXCLUDE_ROOT_ENTRIES = new Set([
  "dist", "web-build", "ios", "android", "supabase", ".vscode", "app-example", "test-results",
]);
const EXCLUDE_ANYWHERE = new Set(["node_modules", ".expo", ".git", ".DS_Store"]);
const EXCLUDE_PATTERNS = [
  /(^|\/)\.env(\..*)?$/,
  /\.tsbuildinfo$/,
  /\.log$/,
  /\.DS_Store$/,
];

function parseArgs(argv) {
  const options = { write: false, json: false, create: false, verify: false };
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") options.write = true;
    else if (argument === "--allow-dirty") options["allow-dirty"] = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--create") options.create = true;
    else if (argument === "--verify") options.verify = true;
    else if (argument.startsWith("--")) options[argument.slice(2)] = argv[++index];
  }
  return options;
}

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: "pipe", ...options });
}

function listWorkerFiles(workerRoot) {
  const files = [];
  const visit = (directory, relative) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (EXCLUDE_ANYWHERE.has(entry.name)) continue;
      if (relative === "" && EXCLUDE_ROOT_ENTRIES.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
      if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(relativePath))) continue;
      if (entry.isDirectory()) visit(full, relativePath);
      else files.push(relativePath);
    }
  };
  for (const rootEntry of INCLUDE_ROOTS) {
    const full = path.join(workerRoot, rootEntry);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) visit(full, rootEntry);
  }
  for (const file of INCLUDE_FILES) {
    if (fs.existsSync(path.join(workerRoot, file))) files.push(file);
  }
  return [...new Set(files)].sort();
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function scanSnapshotForSecrets(workerRoot, files) {
  const findings = [];
  for (const file of files) {
    const full = path.join(workerRoot, file);
    const buffer = fs.readFileSync(full);
    if (buffer.length > 2 * 1024 * 1024) continue;
    if (buffer.includes(0)) continue; // binary asset
    const text = buffer.toString("utf8");
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        findings.push(file);
        break;
      }
    }
  }
  return findings;
}

function extractSnapshot(workerRoot, sha) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-worker-release-"));
  const archive = path.join(directory, "snapshot.tar");
  run("git", ["archive", "--format=tar", sha, "-o", archive], workerRoot);
  const snapshot = path.join(directory, "snapshot");
  fs.mkdirSync(snapshot, { recursive: true });
  run("tar", ["-xf", archive, "-C", snapshot], workerRoot);
  return { directory, snapshot };
}

function git(workerRoot, args) {
  return run("git", args, workerRoot).trim();
}

function resolveWorkerRoot(options) {
  if (!options["worker-root"]) throw new Error("--worker-root is required");
  const workerRoot = path.resolve(repositoryRoot, options["worker-root"]);
  if (!fs.existsSync(path.join(workerRoot, ".git"))) {
    throw new Error(`Worker root is not a Git repository: ${workerRoot}`);
  }
  return workerRoot;
}

function buildRelease({ version, sourceSha, workerRoot, snapshot, files, options, dirtyPaths = [] }) {
  const fileHashes = Object.fromEntries(files.map((file) => [file, sha256File(path.join(snapshot, file))]));
  const capabilities = JSON.parse(fs.readFileSync(path.join(snapshot, "worker-capabilities.json"), "utf8"));
  const previous = latestWorkerRelease(repositoryRoot);
  const manifest = {
    schemaVersion: 1,
    releaseId: version,
    version,
    displayLabel: `TradesStack Worker ${version}`,
    releaseType: "OFFICIAL",
    status: "APPROVED",
    releaseDate: options.date ?? new Date().toISOString().slice(0, 10),
    previousRelease: options.previous ?? previous?.value.version ?? null,
    workerRepository: options.repository ?? "github:tradesstack/tradesstack-worker-app",
    sourceSha,
    sourceRef: options.ref ?? git(workerRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
    sourceWorkingTree: {
      dirty: dirtyPaths.length > 0,
      excludedPaths: dirtyPaths,
      note: "The release snapshot is produced with git archive from sourceSha. Uncommitted paths listed here are excluded from the snapshot and are never part of a release.",
    },
    releaseFingerprint: "",
    capabilities,
    configuration: {
      contract: "@tradesstack/worker-config@0.0.0",
      schemaVersion: 1,
      contractVersion: capabilities.contractVersion,
    },
    compatibility: {
      minimumMainRelease: options["minimum-main-release"] ?? WORKER_MINIMUM_WEB_RELEASE,
      databaseMigrationFloor: options["database-migration-floor"] ?? WORKER_DATABASE_MIGRATION_FLOOR,
      mobileApiContractVersion: capabilities.mobileApiContractVersion,
    },
    distribution: {
      channels: ["internal", "store"],
      supportsOverTheAirUpdate: false,
      requiresStoreResubmissionOnApplicationChange: true,
    },
    files,
    fileHashes,
    validation: {
      status: "PASS",
      typecheck: options.typecheck,
      lint: options.lint,
      tests: options.tests,
      build: options.build,
      ...(options.buildNote ? { buildNote: options.buildNote } : {}),
      recordedAt: options.date ?? new Date().toISOString().slice(0, 10),
      note: "Recorded from the Worker repository validation run; hosted/mobile distribution is not claimed.",
    },
    approval: {
      storePublish: "NOT_REQUESTED",
      customerRollout: "REQUIRES_CUSTOMER_APPROVAL",
    },
    createdAt: new Date().toISOString(),
  };
  manifest.releaseFingerprint = workerReleaseFingerprint(manifest);
  return manifest;
}

function assertValidationEvidence(options) {
  const required = ["typecheck", "lint", "tests"];
  const missing = required.filter((key) => options[key] !== "PASS");
  const buildAccepted = options.build === "PASS" || options.build === "PASS_WEB_EXPORT";
  if (!buildAccepted) missing.push("build");
  if (missing.length) {
    throw new Error(
      `Refusing to create a Worker release without PASS validation evidence: ${missing.join(", ")}. Pass --${missing[0]} PASS (or --build PASS_WEB_EXPORT for a static web export) after running the check.`,
    );
  }
  if (options.build === "PASS_WEB_EXPORT") {
    options.buildNote = "Static web export (expo export --platform web) passed. No native EAS build, device test or store submission was performed.";
  }
}

function create(options) {
  if (!options.version || !semver(options.version)) throw new Error("--version MAJOR.MINOR.PATCH is required");
  if (!options.sha) throw new Error("--sha <worker commit> is required");
  assertValidationEvidence(options);
  const existing = fs.existsSync(path.join(workerPaths(repositoryRoot).releases, `${options.version}.json`));
  if (existing) throw new Error(`Worker release ${options.version} already exists; official releases are immutable`);
  const latest = latestWorkerRelease(repositoryRoot);
  if (latest && compareSemver(options.version, latest.value.version) <= 0) {
    throw new Error(`Worker release ${options.version} is not newer than ${latest.value.version}`);
  }
  const workerRoot = resolveWorkerRoot(options);
  const sourceSha = git(workerRoot, ["rev-parse", options.sha]);
  if (sourceSha !== git(workerRoot, ["rev-parse", `${options.sha}^{commit}`])) {
    throw new Error(`--sha ${options.sha} does not resolve to a commit`);
  }
  const dirty = git(workerRoot, ["status", "--porcelain"]);
  const dirtyPaths = dirty ? dirty.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  if (dirtyPaths.length && options["allow-dirty"] !== true) {
    throw new Error(
      `Worker repository working tree has ${dirtyPaths.length} uncommitted change(s). Commit them, or pass --allow-dirty to release the committed snapshot while recording the excluded paths.`,
    );
  }

  const { directory, snapshot } = extractSnapshot(workerRoot, sourceSha);
  try {
    const files = listWorkerFiles(snapshot);
    const missing = WORKER_REQUIRED_FILES.filter((file) => !files.includes(file));
    if (missing.length) throw new Error(`Worker snapshot is missing required files: ${missing.join(", ")}`);
    const secretFindings = scanSnapshotForSecrets(snapshot, files);
    if (secretFindings.length) throw new Error(`Secret-like content in Worker snapshot: ${secretFindings.join(", ")}`);

    const committedCapabilities = JSON.parse(fs.readFileSync(path.join(snapshot, "worker-capabilities.json"), "utf8"));
    const expectedCapabilities = contract.WORKER_CAPABILITIES;
    if (JSON.stringify(committedCapabilities) !== JSON.stringify(expectedCapabilities)) {
      throw new Error(
        "worker-capabilities.json in the Worker repository does not match the Main @tradesstack/worker-config registry. Run worker:sync-config and regenerate capabilities before releasing.",
      );
    }

    let manifest = buildRelease({ version: options.version, sourceSha, workerRoot, snapshot, files, options, dirtyPaths });
    let errors = validateWorkerReleaseManifest(manifest, { root: repositoryRoot, contract });
    if (errors.length) throw new Error(`Generated Worker release is invalid: ${errors.join("; ")}`);

    // Rebuild from the same commit to prove determinism before writing.
    const replay = extractSnapshot(workerRoot, sourceSha);
    try {
      const replayFiles = listWorkerFiles(replay.snapshot);
      const replayHashes = Object.fromEntries(
        replayFiles.map((file) => [file, sha256File(path.join(replay.snapshot, file))]),
      );
      if (JSON.stringify(replayHashes) !== JSON.stringify(manifest.fileHashes)) {
        throw new Error("Worker release snapshot is not reproducible from the same commit");
      }
    } finally {
      fs.rmSync(replay.directory, { recursive: true, force: true });
    }

    const target = path.join(workerPaths(repositoryRoot).releases, `${options.version}.json`);
    if (options.write) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
      errors = validateWorkerReleaseManifest(JSON.parse(fs.readFileSync(target, "utf8")), { root: repositoryRoot, contract });
      if (errors.length) {
        fs.rmSync(target, { force: true });
        throw new Error(`Written Worker release failed read-back validation: ${errors.join("; ")}`);
      }
    }
    return {
      status: options.write ? "CREATED" : "READY_TO_CREATE",
      version: manifest.version,
      sourceSha,
      fingerprint: manifest.releaseFingerprint,
      files: files.length,
      previousRelease: manifest.previousRelease,
      compatibility: manifest.compatibility,
      manifestPath: path.relative(repositoryRoot, target),
      capabilities: {
        modules: manifest.capabilities.modules.length,
        features: manifest.capabilities.features.length,
        extensions: manifest.capabilities.extensions.length,
      },
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function verify(options) {
  if (!options.version) throw new Error("--version is required");
  const releaseFile = path.join(workerPaths(repositoryRoot).releases, `${options.version}.json`);
  if (!fs.existsSync(releaseFile)) throw new Error(`Worker release not found: ${options.version}`);
  const manifest = JSON.parse(fs.readFileSync(releaseFile, "utf8"));
  const errors = validateWorkerReleaseManifest(manifest, { root: repositoryRoot, contract });
  const details = ["manifest structure validated"];
  if (options["worker-root"]) {
    const workerRoot = resolveWorkerRoot(options);
    const { directory, snapshot } = extractSnapshot(workerRoot, manifest.sourceSha);
    try {
      const files = listWorkerFiles(snapshot);
      if (JSON.stringify(files) !== JSON.stringify(manifest.files)) {
        errors.push("worker snapshot file list differs from the release manifest");
      }
      for (const file of manifest.files) {
        if (!files.includes(file)) continue;
        if (sha256File(path.join(snapshot, file)) !== manifest.fileHashes[file]) {
          errors.push(`worker snapshot content differs for ${file}`);
        }
      }
      // The declared capability surface must equal the snapshot's committed
      // capabilities file, otherwise a manifest could advertise capability the
      // released Worker App does not contain.
      if (manifest.files.includes("worker-capabilities.json")) {
        const snapshotCapabilities = JSON.parse(
          fs.readFileSync(path.join(snapshot, "worker-capabilities.json"), "utf8"),
        );
        if (JSON.stringify(snapshotCapabilities) !== JSON.stringify(manifest.capabilities)) {
          errors.push("manifest capabilities differ from the released worker-capabilities.json");
        }
      }
      details.push(`snapshot compared against ${manifest.sourceSha}`);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
  const product = loadWorkerProduct(repositoryRoot).value;
  if (product && product.workerVersion === manifest.version) {
    if (product.releaseFingerprint !== manifest.releaseFingerprint) {
      errors.push("product-version releaseFingerprint differs from the verified release");
    }
  }
  return {
    status: errors.length === 0 ? "VERIFIED" : "BLOCKED",
    version: manifest.version,
    sourceSha: manifest.sourceSha,
    fingerprint: manifest.releaseFingerprint,
    details,
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  try {
    if (!options.create && !options.verify) throw new Error("Use --create or --verify");
    if (options.create && options.verify) throw new Error("Use only one of --create or --verify");
    const result = options.create ? create(options) : verify(options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "BLOCKED" ? 1 : 0;
  } catch (error) {
    console.error(`Worker release blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
