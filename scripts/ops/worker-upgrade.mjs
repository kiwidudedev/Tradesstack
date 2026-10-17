#!/usr/bin/env node
/**
 * Plan and record a controlled Worker App upgrade for one customer.
 *
 * Guarantees:
 *   - the customer's profile and enabled customisations are never rewritten by
 *     an upgrade; only the pinned Worker release and the audit record change;
 *   - an upgrade that would invalidate an enabled customisation is BLOCKED with
 *     an explicit conflict (never silently discarded);
 *   - web/Worker/database compatibility is checked before any record is written;
 *   - every applied upgrade leaves an append-only audit record.
 *
 * Usage:
 *   node scripts/ops/worker-upgrade.mjs --client client-alpha [--to 1.1.0] [--apply]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, compareSemver, readJson, semver } from "./lib.mjs";
import { checkWorkerCompatibility, loadContract, workerPaths } from "./worker-contract.mjs";

const options = { apply: false };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--apply") options.apply = true;
  else if (argument === "--plan") options.apply = false;
  else if (argument.startsWith("--")) options[argument.slice(2)] = process.argv[++index];
}

const contract = await loadContract(ROOT);
const dataRoot = options.workspace ? path.resolve(ROOT, options.workspace) : ROOT;
const paths = workerPaths(dataRoot);
const registryPath = path.join(dataRoot, "ops/clients.json");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(reason, details = []) {
  console.log(JSON.stringify({ status: "BLOCKED", reason, details }, null, 2));
  process.exit(1);
}

if (!options.client) fail("--client is required");
const registry = readJson(registryPath);
const client = (registry.clients ?? []).find((entry) => entry.clientId === options.client);
if (!client) fail(`Unknown client: ${options.client}`);
if (!client.worker) fail(`Client ${options.client} has no Worker binding; provision it first`);

const profilePath = path.join(dataRoot, client.worker.profilePath);
if (!fs.existsSync(profilePath)) fail(`Customer Worker profile is missing: ${client.worker.profilePath}`);
let profileConfig;
try {
  profileConfig = contract.defineWorkerClientConfig(readJson(profilePath));
} catch (error) {
  fail(`Customer Worker profile is invalid: ${error.message}`);
}
const profileFingerprint = sha256(contract.canonicalizeWorkerClientConfig(profileConfig));
const profile = {
  relativePath: client.worker.profilePath,
  fingerprint: profileFingerprint,
  config: profileConfig,
};

const releaseDirectory = paths.releases;
const releaseFiles = fs.existsSync(releaseDirectory)
  ? fs.readdirSync(releaseDirectory).filter((file) => file.endsWith(".json"))
  : [];
const releases = releaseFiles
  .map((file) => readJson(path.join(releaseDirectory, file)))
  .filter((value) => value.releaseType === "OFFICIAL" && semver(value.version))
  .sort((left, right) => compareSemver(right.version, left.version));
const latest = releases[0] ?? null;
if (!latest) fail("No official Worker release exists");

const fromVersion = options.from ?? client.worker.targetWorkerRelease;
const toVersion = options.to ?? latest.version;
const fromRelease = releases.find((release) => release.version === fromVersion);
const toRelease = releases.find((release) => release.version === toVersion);
if (!fromRelease) fail(`Worker release ${fromVersion} does not exist`);
if (!toRelease) fail(`Worker release ${toVersion} does not exist`);
if (fromVersion === toVersion) {
  console.log(JSON.stringify({
    status: "ALREADY_CURRENT",
    clientId: client.clientId,
    workerRelease: fromVersion,
    note: "No upgrade is required.",
  }, null, 2));
  process.exit(0);
}
if (compareSemver(toVersion, fromVersion) < 0) fail(`Downgrade ${fromVersion} -> ${toVersion} is not a supported upgrade`);

const webReleaseFile = path.join(dataRoot, "ops/releases", `${client.targetRelease}.json`);
const webRelease = fs.existsSync(webReleaseFile) ? readJson(webReleaseFile) : null;

const conflicts = [];
const checks = [];
const record = (id, pass, detail) => {
  checks.push({ id, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) conflicts.push(detail);
};

record(
  "profile-fingerprint",
  client.worker.profileFingerprint === profileFingerprint,
  `registry profile fingerprint ${client.worker.profileFingerprint} must match ${client.worker.profilePath} (${profileFingerprint})`,
);
record(
  "sequential-release-chain",
  toRelease.previousRelease === fromVersion,
  toRelease.previousRelease === fromVersion
    ? `Worker ${toVersion} is the direct successor of ${fromVersion}`
    : `Worker ${toVersion} expects previous release ${toRelease.previousRelease}; upgrade through it first (customer is on ${fromVersion})`,
);
record(
  "worker-release-approval",
  toRelease.status === "APPROVED" && toRelease.releaseType === "OFFICIAL",
  `Worker release ${toVersion} is an approved official release`,
);

const compatibility = checkWorkerCompatibility({
  client,
  profile,
  workerRelease: { value: toRelease },
  mainRelease: webRelease,
  contract,
});
checks.push(...compatibility.checks);
conflicts.push(...compatibility.errors);

// Enabled customer customisations that the target release no longer supports
// are the core upgrade conflict. They are reported, never removed.
const customisations = {
  modules: contract.WORKER_MODULES.filter((module) => profileConfig.modules[module]),
  features: contract.WORKER_FEATURES.filter((feature) => profileConfig.features[feature]),
  extensions: contract.WORKER_EXTENSIONS.filter((extension) => profileConfig.extensions?.[extension]?.enabled),
  tabs: [...profileConfig.navigation.tabs],
  quickActions: profileConfig.navigation.quickActions.map((action) => ({ id: action.id, target: action.target })),
};
const clientExtensions = Array.isArray(client.worker.clientExtensions) ? client.worker.clientExtensions : [];

const distributionImpact = {
  applicationVersion: { from: fromVersion, to: toVersion },
  bundleIdentifiersChanged: false,
  requiresStoreResubmission:
    profileConfig.distribution.channel === "store"
    && toRelease.distribution.requiresStoreResubmissionOnApplicationChange === true,
  requiresCustomerApproval: true,
  distributionChannel: profileConfig.distribution.channel,
};

const noWidening = toRelease.distribution.channels.includes(profileConfig.distribution.channel);
record(
  "distribution-compatibility",
  noWidening,
  `Worker release ${toVersion} supports distribution channel ${profileConfig.distribution.channel}`,
);

const status = conflicts.length === 0 ? "READY_FOR_CONTROLLED_UPGRADE" : "BLOCKED";
const upgradeRecordPath = `ops/worker/upgrades/${client.clientId}/${fromVersion}__${toVersion}.json`;
const auditRecord = {
  schemaVersion: 1,
  clientId: client.clientId,
  fromVersion,
  toVersion,
  status,
  compatibility: { status: compatibility.status, checks },
  conflicts,
  preserved: {
    profilePath: client.worker.profilePath,
    profileFingerprint,
    customisations,
    clientExtensions,
    customisationsIntact: true,
    note: "Upgrades never rewrite the customer profile. Preserved customisations are recorded and re-validated against the target release.",
  },
  distributionImpact,
  approvals: {
    engineering: status === "READY_FOR_CONTROLLED_UPGRADE" ? "READY" : "BLOCKED",
    customerDeployment: "NOT_APPROVED",
    storeResubmission: distributionImpact.requiresStoreResubmission ? "REQUIRED" : "NOT_REQUIRED",
  },
  releases: {
    from: { version: fromRelease.version, fingerprint: fromRelease.releaseFingerprint, sourceSha: fromRelease.sourceSha },
    to: { version: toRelease.version, fingerprint: toRelease.releaseFingerprint, sourceSha: toRelease.sourceSha },
  },
  webRelease: client.targetRelease,
  generatedAt: new Date().toISOString(),
  generatedBy: "scripts/ops/worker-upgrade.mjs",
};

const summary = {
  status,
  clientId: client.clientId,
  fromVersion,
  toVersion,
  record: upgradeRecordPath,
  compatibility: compatibility.status,
  conflicts,
  preservedCustomisations: {
    modules: customisations.modules,
    features: customisations.features,
    extensions: customisations.extensions,
    quickActions: customisations.quickActions.map((action) => action.id),
  },
  distributionImpact,
};

if (!options.apply) {
  console.log(JSON.stringify({ ...summary, note: "Re-run with --apply to record the upgrade and update the customer Worker binding." }, null, 2));
  process.exit(status === "BLOCKED" ? 1 : 0);
}

const recordFile = path.join(dataRoot, upgradeRecordPath);
const existingRecord = fs.existsSync(recordFile) ? readJson(recordFile) : null;
if (existingRecord) {
  const sameDecision = existingRecord.status === status
    && JSON.stringify(existingRecord.conflicts) === JSON.stringify(conflicts)
    && existingRecord.preserved?.profileFingerprint === profileFingerprint;
  if (!sameDecision) {
    fail(`An upgrade record already exists with a different decision: ${upgradeRecordPath}`, [
      "Refusing to overwrite the audit trail; create a new release or resolve the recorded conflict.",
    ]);
  }
  console.log(JSON.stringify({ ...summary, status: existingRecord.status === "BLOCKED" ? "BLOCKED" : "ALREADY_RECORDED" }, null, 2));
  process.exit(existingRecord.status === "BLOCKED" ? 1 : 0);
}

fs.mkdirSync(path.dirname(recordFile), { recursive: true });
fs.writeFileSync(recordFile, `${JSON.stringify(auditRecord, null, 2)}\n`);

if (status === "BLOCKED") {
  console.log(JSON.stringify({ ...summary, note: "Conflict recorded. The customer binding was not changed." }, null, 2));
  process.exit(1);
}

const nextRegistry = {
  ...registry,
  clients: registry.clients.map((entry) => entry.clientId === client.clientId
    ? {
        ...entry,
        worker: {
          ...entry.worker,
          targetWorkerRelease: toVersion,
          compatibilityStatus: "COMPATIBLE",
          lastUpgrade: {
            fromVersion,
            toVersion,
            record: upgradeRecordPath,
            status: "RECORDED_AWAITING_DEPLOYMENT_APPROVAL",
          },
        },
      }
    : entry),
};
fs.writeFileSync(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`);

console.log(JSON.stringify({
  ...summary,
  status: "UPGRADE_RECORDED",
  note: "Supabase, builds and distribution were not changed. Deployment and store resubmission still require approval.",
}, null, 2));
