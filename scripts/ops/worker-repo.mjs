/**
 * Shared helpers for dedicated customer Worker repositories.
 *
 * A customer Worker repository is a real source repository: a snapshot of an
 * approved Worker Main release in the Worker Main-owned paths, plus
 * customer-owned material under `client/`. Promotion replaces only release-owned
 * files, refuses silent divergence and records provenance in the customer repo.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fingerprint, readJson, sha } from "./lib.mjs";
import {
  WORKER_GENERATED_VOLATILE_FILES,
  isWorkerCustomerOwned,
  loadContract,
  workerReleaseFingerprint,
} from "./worker-contract.mjs";

export const CUSTOMER_RELEASE_MANIFEST = "release-manifest.json";
export const CUSTOMER_OWNED_PATHS = ["client/**", ".env*"];

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: "pipe",
    ...options,
  });
}

export function git(cwd, args) {
  return run("git", args, cwd).trim();
}

export function isGitRepository(root) {
  return fs.existsSync(path.join(root, ".git"));
}

export function requireCleanRepository(root) {
  if (!isGitRepository(root)) throw new Error(`Not a Git repository: ${root}`);
  const status = git(root, ["status", "--porcelain"]);
  if (status) throw new Error(`Customer Worker repository has uncommitted changes:\n${status}`);
  return git(root, ["branch", "--show-current"]);
}

export function readCustomerManifest(root) {
  const file = path.join(root, CUSTOMER_RELEASE_MANIFEST);
  return fs.existsSync(file) ? readJson(file) : null;
}

export function writeCustomerManifest(root, manifest) {
  fs.writeFileSync(path.join(root, CUSTOMER_RELEASE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Extract an approved Worker release commit into a temporary directory. */
export function extractWorkerRelease({ workerMain, release, contract }) {
  if (!sha(release.sourceSha)) throw new Error(`Release ${release.version} has no valid sourceSha`);
  const errors = [];
  if (release.status !== "APPROVED" || release.releaseType !== "OFFICIAL") {
    errors.push(`Release ${release.version} is not an approved official release`);
  }
  if (!fingerprint(release.releaseFingerprint)) errors.push(`Release ${release.version} has no fingerprint`);
  if (release.capabilities && contract) {
    const available = contract.WORKER_CAPABILITIES;
    for (const moduleKey of release.capabilities.modules ?? []) {
      if (!available.modules.includes(moduleKey)) errors.push(`release module ${moduleKey} is not supported by the contract`);
    }
  }
  if (errors.length) throw new Error(errors.join("; "));

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-worker-source-"));
  const archive = path.join(directory, "release.tar");
  run("git", ["archive", "--format=tar", release.sourceSha, "-o", archive], workerMain);
  const snapshot = path.join(directory, "snapshot");
  fs.mkdirSync(snapshot, { recursive: true });
  run("tar", ["-xf", archive, "-C", snapshot], workerMain);

  const mismatches = [];
  for (const file of release.files) {
    const full = path.join(snapshot, file);
    if (!fs.existsSync(full)) {
      mismatches.push(`missing ${file}`);
      continue;
    }
    if (sha256File(full) !== release.fileHashes[file]) mismatches.push(`content differs: ${file}`);
  }
  if (mismatches.length) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error(`Worker release snapshot does not match its manifest: ${mismatches.slice(0, 6).join(", ")}`);
  }
  return {
    snapshot,
    dispose: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

/**
 * Compare a customer repository with the release it claims to be based on and
 * return conflicts. Any modified/missing release-owned file is a conflict; no
 * promotion may overwrite it silently.
 */
export function detectPromotionConflicts({ root, release, manifest }) {
  const conflicts = [];
  const baselineFiles = manifest?.releaseOwnedFiles ?? release.files.filter((file) => !isWorkerCustomerOwned(file));
  const baselineHashes = manifest?.releaseOwnedHashes ?? release.fileHashes;

  for (const file of baselineFiles) {
    if (isWorkerCustomerOwned(file) || WORKER_GENERATED_VOLATILE_FILES.has(file)) continue;
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      conflicts.push(`release-owned file is missing locally: ${file}`);
      continue;
    }
    const actual = sha256File(full);
    const expected = baselineHashes[file];
    if (expected && actual !== expected) conflicts.push(`release-owned file was modified locally: ${file}`);
  }

  // Customer-added source outside client/ is a permanent divergence; report it
  // instead of deleting or silently retaining it.
  const tracked = git(root, ["ls-files"]).split("\n").filter(Boolean);
  const releaseFiles = new Set(release.files);
  const manifestFiles = new Set(baselineFiles);
  for (const file of tracked) {
    if (isWorkerCustomerOwned(file)) continue;
    if (file === CUSTOMER_RELEASE_MANIFEST) continue;
    if (WORKER_GENERATED_VOLATILE_FILES.has(file)) continue;
    if (!releaseFiles.has(file) && !manifestFiles.has(file)) {
      conflicts.push(`customer source outside client/ is not in Worker Main: ${file}`);
    }
  }

  return conflicts;
}

/** Write a release snapshot into a customer repository, preserving client/. */
export function materialiseWorkerRelease({ root, snapshot, release, previousRelease, manifest }) {
  const releaseFiles = release.files.filter((file) => !isWorkerCustomerOwned(file));
  const nextFiles = new Set(releaseFiles);

  for (const file of previousRelease?.files ?? []) {
    if (isWorkerCustomerOwned(file) || WORKER_GENERATED_VOLATILE_FILES.has(file)) continue;
    if (nextFiles.has(file)) continue;
    const full = path.join(root, file);
    if (fs.existsSync(full)) fs.rmSync(full, { force: true });
  }

  const nextHashes = {};
  for (const file of releaseFiles) {
    const source = path.join(snapshot, file);
    const target = path.join(root, file);
    if (!fs.existsSync(source)) throw new Error(`Release snapshot is missing ${file}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    nextHashes[file] = sha256File(target);
  }

  const nextManifest = {
    schemaVersion: 1,
    product: "TradesStack Worker",
    workerRelease: release.version,
    displayLabel: `TradesStack Worker ${release.version}`,
    sourceSha: release.sourceSha,
    releaseFingerprint: release.releaseFingerprint ?? workerReleaseFingerprint(release),
    previousWorkerRelease: release.previousRelease ?? null,
    promotedAt: new Date().toISOString(),
    promotedBy: "scripts/ops/worker-promote.mjs",
    customerOwnedPaths: CUSTOMER_OWNED_PATHS,
    releaseOwnedFiles: releaseFiles,
    releaseOwnedHashes: nextHashes,
    customerProfile: manifest?.customerProfile ?? null,
    requestedBy: manifest?.requestedBy ?? null,
  };
  writeCustomerManifest(root, nextManifest);
  return nextManifest;
}

/**
 * Create a brand-new customer Worker repository from a release snapshot.
 * `customerFiles` maps a relative path to file content and is written last.
 */
export function createCustomerWorkerRepository({ root, snapshot, release, customerFiles }) {
  if (fs.existsSync(path.join(root, ".git"))) throw new Error(`Refusing to overwrite existing repository: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  run("git", ["init", "--initial-branch=main"], root);
  materialiseWorkerRelease({ root, snapshot, release, previousRelease: null, manifest: null });
  for (const [relative, content] of Object.entries(customerFiles)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const manifest = readCustomerManifest(root);
  manifest.customerProfile = customerFiles["client/worker-profile.json"]
    ? sha256File(path.join(root, "client/worker-profile.json"))
    : null;
  writeCustomerManifest(root, manifest);
  return manifest;
}

/** Create the customer Worker profile from a validated Main profile. */
export function loadWorkerContract(root) {
  return loadContract(root);
}
