#!/usr/bin/env node
/**
 * Promote an approved Worker Main release into a dedicated customer Worker
 * repository (source promotion, not a metadata pin).
 *
 * Sequence:
 *   approved release -> verify customer baseline -> conflict detection ->
 *   new branch -> materialise Worker Main-owned files -> preserve client/** ->
 *   candidate checks -> commit -> optional push + PR -> Main audit record.
 *
 * The customer's profile and every `client/**` file are preserved byte-for-byte.
 * A modified or missing Worker Main-owned file blocks the promotion.
 *
 * Usage:
 *   node scripts/ops/worker-promote.mjs --client client-alpha --to 1.3.0 \
 *     --worker-root <customer repo> [--worker-main <Worker Main repo>] \
 *     [--from <release>] [--apply] [--push] [--skip-validation]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, semver } from "./lib.mjs";
import {
  checkWorkerCompatibility,
  loadContract,
  loadWorkerReleases,
  workerCustomerRepository,
  workerMainRepository,
} from "./worker-contract.mjs";
import {
  CUSTOMER_RELEASE_MANIFEST,
  detectPromotionConflicts,
  extractWorkerRelease,
  git,
  materialiseWorkerRelease,
  readCustomerManifest,
  requireCleanRepository,
  run,
} from "./worker-repo.mjs";

const options = { apply: false, push: false, skipValidation: false };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--apply") options.apply = true;
  else if (argument === "--push") options.push = true;
  else if (argument === "--skip-validation") options.skipValidation = true;
  else if (argument.startsWith("--")) options[argument.slice(2)] = process.argv[++index];
}

const dataRoot = options.workspace ? path.resolve(ROOT, options.workspace) : ROOT;
const registryPath = path.join(dataRoot, "ops/clients.json");
const contract = await loadContract(ROOT);
const registry = readJson(registryPath);
const client = (registry.clients ?? []).find((entry) => entry.clientId === options.client);

function fail(status, reason, details = []) {
  console.log(JSON.stringify({ status, reason, details }, null, 2));
  process.exit(1);
}

if (!client) fail("BLOCKED", `Unknown client: ${options.client}`);
if (!client.worker) fail("BLOCKED", `Client ${client.clientId} has no Worker binding`);
if (!options["worker-root"]) fail("BLOCKED", "--worker-root is required");
const workerRoot = path.resolve(dataRoot, options["worker-root"]);
const workerMainRoot = options["worker-main"]
  ? path.resolve(ROOT, options["worker-main"])
  : path.resolve(ROOT, "../tradesstack-worker-app/tradesstack-worker-app");

const releases = loadWorkerReleases(ROOT);
const fromVersion = options.from ?? client.worker.promotedWorkerRelease ?? client.worker.targetWorkerRelease;
const toVersion = options.to;
if (!fromVersion || !semver(fromVersion)) fail("BLOCKED", "--from (or a promotedWorkerRelease/targetWorkerRelease) is required");
if (!toVersion || !semver(toVersion)) fail("BLOCKED", "--to is required");
if (fromVersion === toVersion) {
  console.log(JSON.stringify({ status: "ALREADY_PROMOTED", clientId: client.clientId, release: toVersion }, null, 2));
  process.exit(0);
}
const fromRelease = releases.find(({ value }) => value.version === fromVersion)?.value;
const toRelease = releases.find(({ value }) => value.version === toVersion)?.value;
if (!fromRelease) fail("BLOCKED", `Worker release ${fromVersion} does not exist`);
if (!toRelease) fail("BLOCKED", `Worker release ${toVersion} does not exist`);
if (toRelease.previousRelease !== fromVersion) {
  fail("BLOCKED", `Worker ${toVersion} expects previous release ${toRelease.previousRelease}; promote ${fromVersion} -> ${toRelease.previousRelease} first`);
}

const profilePath = path.join(dataRoot, client.worker.profilePath);
if (!fs.existsSync(profilePath)) fail("BLOCKED", `Registered Worker profile is missing: ${client.worker.profilePath}`);
const profileConfig = contract.defineWorkerClientConfig(readJson(profilePath));
const profile = {
  relativePath: client.worker.profilePath,
  fingerprint: crypto
    .createHash("sha256")
    .update(contract.canonicalizeWorkerClientConfig(profileConfig))
    .digest("hex"),
  config: profileConfig,
};

const compatibility = checkWorkerCompatibility({
  client,
  profile,
  workerRelease: { value: toRelease },
  mainRelease: fs.existsSync(path.join(dataRoot, "ops/releases", `${client.targetRelease}.json`))
    ? readJson(path.join(dataRoot, "ops/releases", `${client.targetRelease}.json`))
    : null,
  contract,
});

const customerRepo = workerCustomerRepository(client.worker);
const mainRepo = workerMainRepository(client.worker);
const details = [];
if (!customerRepo) details.push("registry has no dedicated customer repository yet (expected for a first promotion)");

// Repository integrity and baseline.
try {
  requireCleanRepository(workerRoot);
} catch (error) {
  fail("BLOCKED", error.message, details);
}
const defaultBranch = client.defaultBranch ?? "main";
const branch = options.branch ?? `worker-upgrade/${toVersion}`;
const directMain = branch === defaultBranch;
const currentBranch = git(workerRoot, ["branch", "--show-current"]);
if (currentBranch !== defaultBranch) {
  fail("BLOCKED", `Customer repository must be on ${defaultBranch} before promotion (currently ${currentBranch})`);
}
let manifest = readCustomerManifest(workerRoot);
if (!manifest) {
  fail("BLOCKED", `Customer repository has no ${CUSTOMER_RELEASE_MANIFEST}; create it from an approved release first`);
}
if (manifest.workerRelease !== fromVersion) {
  fail("BLOCKED", `Customer repository baseline is ${manifest.workerRelease}, not ${fromVersion}`);
}
if (manifest.sourceSha !== fromRelease.sourceSha) {
  fail("BLOCKED", `Customer baseline source SHA ${manifest.sourceSha} does not match release ${fromVersion} (${fromRelease.sourceSha})`);
}

// Customer-owned profile must be the registered profile.
const customerProfilePath = path.join(workerRoot, "client/worker-profile.json");
if (!fs.existsSync(customerProfilePath)) {
  fail("BLOCKED", "Customer repository is missing client/worker-profile.json");
}
let customerProfileConfig;
try {
  customerProfileConfig = contract.defineWorkerClientConfig(readJson(customerProfilePath));
} catch (error) {
  fail("BLOCKED", `Customer client/worker-profile.json is invalid: ${error.message}`);
}
const customerProfileFingerprint = crypto
  .createHash("sha256")
  .update(contract.canonicalizeWorkerClientConfig(customerProfileConfig))
  .digest("hex");
if (customerProfileFingerprint !== profile.fingerprint) {
  fail("BLOCKED", "Customer client/worker-profile.json differs from the registered Worker profile; update the Main profile and registry first");
}

const conflicts = detectPromotionConflicts({ root: workerRoot, release: fromRelease, manifest });
if (conflicts.length) {
  console.log(JSON.stringify({
    status: "BLOCKED",
    reason: "Customer repository has diverged from its baseline",
    conflicts,
    preserved: "No files were modified.",
  }, null, 2));
  process.exit(1);
}

const summary = {
  clientId: client.clientId,
  fromVersion,
  toVersion,
  branch,
  customerRepository: customerRepo ?? path.relative(dataRoot, workerRoot),
  workerMainRepository: mainRepo,
  compatibility: compatibility.status,
  conflicts,
  customerProfilePreserved: true,
  releaseSourceSha: toRelease.sourceSha,
  releaseFingerprint: toRelease.releaseFingerprint,
  checks: compatibility.checks,
};

if (!options.apply) {
  console.log(JSON.stringify({
    status: "READY_TO_PROMOTE",
    ...summary,
    note: "Re-run with --apply to create the promotion branch and materialise the release source.",
  }, null, 2));
  process.exit(0);
}

if (compatibility.status !== "COMPATIBLE") {
  fail("BLOCKED", `Worker ${toVersion} is not compatible with ${client.clientId}: ${compatibility.errors.join("; ")}`, details);
}

const extracted = extractWorkerRelease({ workerMain: workerMainRoot, release: toRelease, contract });
let promotionManifest;
try {
  if (!directMain) {
    // Recreate the tool-owned promotion branch from the default branch.
    const branches = git(workerRoot, ["branch", "--list", branch]);
    if (branches) {
      git(workerRoot, ["branch", "-D", branch]);
    }
    git(workerRoot, ["switch", "-c", branch]);
  }
  promotionManifest = materialiseWorkerRelease({
    root: workerRoot,
    snapshot: extracted.snapshot,
    release: toRelease,
    previousRelease: fromRelease,
    manifest: { ...manifest, customerProfile: customerProfileFingerprint },
  });
} catch (error) {
  fail("FAILED", `Materialisation failed: ${error.message}`, details);
} finally {
  extracted.dispose();
}

let validation = { status: "SKIPPED_NO_DEPENDENCIES" };
if (!options.skipValidation && fs.existsSync(path.join(workerRoot, "node_modules"))) {
  try {
    run("npm", ["run", "check"], workerRoot, { timeout: 15 * 60 * 1000 });
    validation = { status: "PASS", command: "npm run check" };
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message]
      .filter(Boolean)
      .map(String)
      .join("\n")
      .trim()
      .split("\n")
      .slice(-15)
      .join("\n");
    validation = { status: "FAIL", command: "npm run check", output };
  }
}

git(workerRoot, ["add", "-A"]);
try {
  git(workerRoot, [
    "-c", "user.name=TradesStack Ops",
    "-c", "user.email=ops@tradesstack.invalid",
    "commit", "-m", `worker: promote TradesStack Worker ${toVersion}`,
  ]);
} catch {
  // No material difference (for example an identical re-run) — keep the branch.
}
const commitSha = git(workerRoot, ["rev-parse", "HEAD"]);
summary.validation = validation;
summary.commitSha = commitSha;
summary.releaseManifest = promotionManifest;

const promotionRecordPath = `ops/worker/promotions/${client.clientId}/${fromVersion}__${toVersion}.json`;
const artifactRecordPath = path.join(dataRoot, "ops/worker/distribution", `${client.clientId}.json`);
const artifactState = fs.existsSync(artifactRecordPath)
  ? readJson(artifactRecordPath).artifactState ?? null
  : null;
const record = {
  schemaVersion: 1,
  clientId: client.clientId,
  fromVersion,
  toVersion,
  status: validation.status === "FAIL" ? "BLOCKED_CANDIDATE_VALIDATION" : "SOURCE_PROMOTED",
  customerRepository: customerRepo ?? path.relative(dataRoot, workerRoot),
  workerMainRepository: mainRepo,
  branch,
  mode: directMain ? "DIRECT_MAIN_BASELINE_ADOPTION" : "CONTROLLED_UPGRADE_BRANCH",
  commitSha,
  release: {
    sourceSha: toRelease.sourceSha,
    fingerprint: toRelease.releaseFingerprint,
    previousRelease: toRelease.previousRelease,
  },
  preserved: {
    customerOwnedPaths: ["client/**", ".env*"],
    profileFingerprint: customerProfileFingerprint,
    releaseOwnedConflicts: conflicts,
  },
  validation,
  artifactState: {
    targetRelease: client.worker.targetWorkerRelease,
    builtRelease: artifactState?.builtRelease ?? null,
    distributedRelease: artifactState?.distributedRelease ?? null,
    installedRelease: artifactState?.installedRelease ?? null,
    note: "Source promotion is independent of build, distribution and installation. See ops/worker/distribution.",
  },
  approvals: { sourcePromotion: "READY", build: "NOT_APPROVED", distribution: "NOT_APPROVED", merge: "NOT_APPROVED" },
  recordedAt: new Date().toISOString(),
  recordedBy: "scripts/ops/worker-promote.mjs",
};
const recordFile = path.join(dataRoot, promotionRecordPath);
fs.mkdirSync(path.dirname(recordFile), { recursive: true });
const existingRecord = fs.existsSync(recordFile) ? readJson(recordFile) : null;
if (existingRecord && existingRecord.commitSha && existingRecord.commitSha !== commitSha) {
  fail("BLOCKED", `A promotion record already exists for a different commit: ${promotionRecordPath}`, ["Refusing to overwrite the audit trail."]);
}
if (!existingRecord) fs.writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);

summary.promotionRecord = promotionRecordPath;

if (validation.status === "FAIL") {
  console.log(JSON.stringify({ status: "BLOCKED_CANDIDATE_VALIDATION", ...summary }, null, 2));
  process.exit(1);
}

// Only a validated promotion updates the registry pin.
const nextRegistry = {
  ...registry,
  clients: registry.clients.map((entry) => entry.clientId === client.clientId
    ? {
        ...entry,
        worker: {
          ...entry.worker,
          targetWorkerRelease: toVersion,
          promotedWorkerRelease: toVersion,
          sourceBaseline: {
            release: toVersion,
            sourceSha: toRelease.sourceSha,
            fingerprint: toRelease.releaseFingerprint,
          },
          lastPromotion: {
            fromVersion,
            toVersion,
            branch,
            commitSha,
            record: promotionRecordPath,
            status: "SOURCE_PROMOTED_AWAITING_BUILD",
          },
        },
      }
    : entry),
};
fs.writeFileSync(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`);

if (options.push) {
  if (!customerRepo) fail("BLOCKED", "--push requires a registered customer repository reference");
  git(workerRoot, ["push", "--set-upstream", "origin", branch]);
  let pullRequest = { status: "PUSHED_PR_REQUESTED" };
  try {
    const created = run("gh", [
      "pr", "create",
      "--repo", customerRepo.replace(/^github:/, ""),
      "--base", defaultBranch,
      "--head", branch,
      "--title", `Promote TradesStack Worker ${toVersion}`,
      "--body", `Worker Main release ${toVersion} (source ${toRelease.sourceSha}).\n\nCustomer-owned \`client/**\` material is preserved. Candidate validation: ${validation.status}.`,
    ], workerRoot).trim();
    pullRequest = { status: "OPENED", reference: created };
  } catch {
    pullRequest = { status: "PUSHED_PR_CREATE_FAILED" };
  }
  summary.pullRequest = pullRequest;
  const recordAfterPush = readJson(recordFile);
  recordAfterPush.pullRequest = pullRequest;
  fs.writeFileSync(recordFile, `${JSON.stringify(recordAfterPush, null, 2)}\n`);
}

console.log(JSON.stringify({ status: "PROMOTED", ...summary }, null, 2));
