#!/usr/bin/env node
/**
 * Provision a dedicated TradesStack Worker App implementation for a customer.
 *
 * Provisioning is metadata + configuration only. It never creates a Supabase
 * project, store listing, signing credential or deployment; those steps are
 * listed as external actions that require approval.
 *
 * The workflow is repeatable and safe to retry:
 *   - identical inputs -> ALREADY_PROVISIONED (no writes)
 *   - conflicting inputs -> BLOCKED (no writes)
 *   - first run --apply -> writes profile, registry binding and audit record
 *
 * Usage:
 *   node scripts/ops/worker-provision.mjs \
 *     --client-id wilson-construction \
 *     --display-name "Wilson Construction" \
 *     --profile ops/worker/fixtures/wilson-construction.json \
 *     [--worker-release 1.0.0] [--target-release 1.2.0] [--apply] [--workspace <dir>]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, compareSemver, readJson, semver } from "./lib.mjs";
import { loadContract, workerPaths } from "./worker-contract.mjs";

const options = { apply: false, json: true };
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

function fail(message, details = []) {
  console.log(JSON.stringify({ status: "BLOCKED", reason: message, details }, null, 2));
  process.exit(1);
}

function latestRelease(directory) {
  if (!fs.existsSync(directory)) return null;
  const releases = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(directory, file)))
    .filter((value) => value.releaseType === "OFFICIAL" && semver(value.version))
    .sort((left, right) => compareSemver(right.version, left.version));
  return releases[0] ?? null;
}

if (!options["client-id"]) fail("--client-id is required");
if (!options.profile) fail("--profile is required");
const clientId = options["client-id"];
if (!/^[a-z][a-z0-9-]{2,62}$/.test(clientId)) fail(`Invalid client ID: ${clientId}`);

const profileSourcePath = path.resolve(dataRoot, options.profile);
if (!fs.existsSync(profileSourcePath)) fail(`Profile source not found: ${options.profile}`);
let profile;
try {
  profile = contract.defineWorkerClientConfig(readJson(profileSourcePath));
} catch (error) {
  fail(`Profile is invalid: ${error.message}`);
}
const canonical = contract.canonicalizeWorkerClientConfig(profile);
const profileFingerprint = sha256(canonical);
if (profile.clientKey !== clientId) {
  fail(`Profile clientKey ${profile.clientKey} must equal --client-id ${clientId}`);
}

const workerReleaseVersion = options["worker-release"] ?? latestRelease(paths.releases)?.version;
const workerRelease = workerReleaseVersion
  ? readJson(path.join(paths.releases, `${workerReleaseVersion}.json`))
  : null;
if (!workerRelease) fail(`Worker release ${workerReleaseVersion ?? "(latest)"} does not exist in ${paths.releases}`);
const webRelease = options["target-release"]
  ? readJson(path.join(dataRoot, "ops/releases", `${options["target-release"]}.json`))
  : latestRelease(path.join(dataRoot, "ops/releases"));
if (!webRelease) fail("No approved Main web release could be resolved");

const registry = fs.existsSync(registryPath)
  ? readJson(registryPath)
  : { schemaVersion: 1, registryStatus: "OPERATING_INDEX_ONLY", clients: [] };

/* -------------------------------------------------------------------------- */
/* Validation steps                                                            */
/* -------------------------------------------------------------------------- */

const steps = [];
const errors = [];
const step = (id, pass, detail) => {
  steps.push({ id, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) errors.push(detail);
};

step("profile-validated", true, `${path.relative(dataRoot, profileSourcePath)} is a valid Worker profile (${profileFingerprint.slice(0, 12)}…)`);

step(
  "worker-release-resolved",
  Boolean(workerRelease),
  `Worker release ${workerRelease.version} resolves to ${workerRelease.releaseFingerprint.slice(0, 12)}…`,
);
step("web-release-resolved", Boolean(webRelease), `Customer web release target ${webRelease.version}`);

const minimumWeb = workerRelease.compatibility.minimumMainRelease;
step(
  "web-release-compatibility",
  compareSemver(webRelease.version, minimumWeb) >= 0,
  `web release ${webRelease.version} satisfies Worker minimum ${minimumWeb}`,
);
const floor = workerRelease.compatibility.databaseMigrationFloor;
step(
  "database-floor-compatibility",
  webRelease.database.migrationTarget >= floor,
  `web release migration target ${webRelease.database.migrationTarget} satisfies Worker floor ${floor}`,
);

const existingClient = (registry.clients ?? []).find((client) => client.clientId === clientId);
const desiredProfilePath = `ops/worker/profiles/${clientId}.json`;
const existingProfileFile = path.join(dataRoot, desiredProfilePath);
const existingProfileText = fs.existsSync(existingProfileFile)
  ? fs.readFileSync(existingProfileFile, "utf8")
  : null;
const desiredProfileText = `${JSON.stringify(profile, null, 2)}\n`;

let alreadyProvisioned = false;
if (existingClient && !existingClient.worker) {
  step(
    "client-registration",
    true,
    `client ${clientId} is already registered as a web implementation; this run attaches its first Worker App implementation`,
  );
} else if (existingClient) {
  const binding = existingClient.worker ?? {};
  const sameBinding =
    binding.profilePath === desiredProfilePath
    && binding.profileFingerprint === profileFingerprint
    && binding.targetWorkerRelease === workerRelease.version
    && existingProfileText === desiredProfileText;
  step(
    "client-registration",
    sameBinding,
    sameBinding
      ? `client ${clientId} is already registered with this exact Worker binding`
      : `client ${clientId} is already registered with a different Worker binding; use worker-upgrade.mjs for version changes`,
  );
  alreadyProvisioned = sameBinding;
} else {
  step("client-registration", true, `client ${clientId} is not registered yet`);
}

if (existingProfileText !== null && existingProfileText !== desiredProfileText) {
  step("profile-write", false, `${desiredProfilePath} already exists with different content; refusing to overwrite customer customisation`);
} else {
  step("profile-write", true, existingProfileText === null ? `will create ${desiredProfilePath}` : `${desiredProfilePath} is identical`);
}

// Isolation against every other registered customer and every profile in ops/worker/profiles.
const isolationErrors = [];
const profileFiles = fs.existsSync(paths.profiles)
  ? fs.readdirSync(paths.profiles).filter((file) => file.endsWith(".json"))
  : [];
for (const file of profileFiles) {
  if (file === `${clientId}.json`) continue;
  let other;
  try {
    other = contract.defineWorkerClientConfig(readJson(path.join(paths.profiles, file)));
  } catch {
    continue;
  }
  isolationErrors.push(...contract.findWorkerIsolationConflicts(profile, other).map((error) => `${file}: ${error}`));
}
for (const client of registry.clients ?? []) {
  if (client.clientId === clientId) continue;
  const ref = String(client.databaseProjectReference ?? "").replace(/^supabase:/, "");
  if (profile.environment.kind === "hosted" && ref === profile.environment.supabaseProjectRef) {
    isolationErrors.push(`${client.clientId}: shares Supabase project ${ref}`);
  }
}
step(
  "customer-isolation",
  isolationErrors.length === 0,
  isolationErrors.length === 0
    ? "environment, bundle identifiers, scheme and update channel are unique"
    : `isolation conflicts: ${isolationErrors.join("; ")}`,
);

if (errors.length) {
  console.log(JSON.stringify({
    status: "BLOCKED",
    clientId,
    steps,
    errors,
    note: "No files were written.",
  }, null, 2));
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                       */
/* -------------------------------------------------------------------------- */

const provisioningRecordPath = `ops/worker/provisioning/${clientId}.json`;
const registryEntry = existingClient ?? {
  clientId,
  displayName: options["display-name"] ?? profile.identity.appName,
  environment: "managed-client",
  lifecycleStatus: "PENDING",
  defaultBranch: "main",
  rolloutStatus: "ENABLED",
  releaseChannel: "stable",
  clientOwnedPaths: ["client/**", ".env*", "ops/worker/profiles/**"],
  targetRelease: webRelease.version,
  repositoryReference: options["repository-reference"] ?? "PENDING",
  deploymentTarget: options["deployment-target"] ?? "PENDING",
  databaseProjectReference: `supabase:${profile.environment.kind === "hosted" ? profile.environment.supabaseProjectRef : "PENDING"}`,
  runtimeReference: options["runtime-reference"] ?? "PENDING",
  domainReference: options["domain-reference"] ?? "PENDING",
  releaseProvenance: { status: "PENDING_INITIAL_PROVISIONING", mainReleaseFingerprint: webRelease.releaseFingerprint ?? null },
  worker: {
    profilePath: desiredProfilePath,
    profileFingerprint,
    targetWorkerRelease: workerRelease.version,
    workerRepository: workerRelease.workerRepository,
    distributionChannel: profile.distribution.channel,
    clientExtensions: [],
    provisioningRecord: provisioningRecordPath,
    compatibilityStatus: "COMPATIBLE",
  },
};
if (existingClient) {
  registryEntry.worker = {
    ...existingClient.worker,
    profilePath: desiredProfilePath,
    profileFingerprint,
    targetWorkerRelease: workerRelease.version,
    workerRepository: workerRelease.workerRepository,
    distributionChannel: profile.distribution.channel,
    clientExtensions: existingClient.worker?.clientExtensions ?? [],
    provisioningRecord: provisioningRecordPath,
    compatibilityStatus: "COMPATIBLE",
  };
}

const externalActions = [
  { id: "create-supabase-project", status: "NOT_PERFORMED", requires: "Supabase account owner approval" },
  { id: "apply-database-baseline-and-migrations", status: "NOT_PERFORMED", requires: "Migration approval for the new customer environment" },
  { id: "set-environment-secrets", status: "NOT_PERFORMED", requires: "Worker build environment: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY" },
  { id: "create-store-listing", status: profile.distribution.channel === "store" ? "NOT_PERFORMED" : "NOT_REQUIRED", requires: "Apple/Google developer account ownership" },
  { id: "create-signing-credentials", status: "NOT_PERFORMED", requires: "Apple certificates/provisioning and Android keystore approval" },
  { id: "create-push-credentials", status: profile.features.notifications ? "NOT_PERFORMED" : "NOT_REQUIRED", requires: "APNs key / FCM credentials" },
  { id: "build-and-distribute-worker-app", status: "NOT_PERFORMED", requires: "Operator build approval and distribution approval" },
];

const plan = {
  schemaVersion: 1,
  clientId,
  status: alreadyProvisioned ? "ALREADY_PROVISIONED" : "READY_TO_PROVISION",
  profilePath: desiredProfilePath,
  profileFingerprint,
  workerRelease: workerRelease.version,
  workerReleaseFingerprint: workerRelease.releaseFingerprint,
  webRelease: webRelease.version,
  environment: {
    kind: profile.environment.kind,
    environmentId: profile.environment.environmentId,
    supabaseProjectRef: profile.environment.kind === "hosted" ? profile.environment.supabaseProjectRef : null,
  },
  distribution: {
    channel: profile.distribution.channel,
    iosBundleIdentifier: profile.distribution.iosBundleIdentifier,
    androidPackage: profile.distribution.androidPackage,
    updateChannel: profile.distribution.updateChannel,
  },
  customisations: {
    modules: contract.WORKER_MODULES.filter((module) => profile.modules[module]),
    features: contract.WORKER_FEATURES.filter((feature) => profile.features[feature]),
    extensions: contract.WORKER_EXTENSIONS.filter((extension) => profile.extensions?.[extension]?.enabled),
    quickActions: profile.navigation.quickActions.map((action) => action.id),
  },
  steps,
  externalActions,
  plannedWrites: [
    desiredProfilePath,
    "ops/clients.json",
    provisioningRecordPath,
  ],
};
const planFingerprint = sha256(JSON.stringify({ steps: plan.steps, profileFingerprint, workerRelease: workerRelease.version, webRelease: webRelease.version, clientId }));

if (!options.apply) {
  console.log(JSON.stringify({ ...plan, status: alreadyProvisioned ? "ALREADY_PROVISIONED" : "PLAN_ONLY", planFingerprint, note: "Re-run with --apply to write the plan." }, null, 2));
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                      */
/* -------------------------------------------------------------------------- */

if (alreadyProvisioned) {
  console.log(JSON.stringify({ ...plan, status: "ALREADY_PROVISIONED", planFingerprint, note: "No files written." }, null, 2));
  process.exit(0);
}

fs.mkdirSync(path.dirname(path.join(dataRoot, desiredProfilePath)), { recursive: true });
fs.writeFileSync(path.join(dataRoot, desiredProfilePath), desiredProfileText);

const nextRegistry = existingClient
  ? { ...registry, clients: registry.clients.map((client) => (client.clientId === clientId ? registryEntry : client)) }
  : { ...registry, clients: [...(registry.clients ?? []), registryEntry] };
fs.writeFileSync(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`);

const record = {
  schemaVersion: 1,
  clientId,
  status: "PROVISIONED_AWAITING_EXTERNAL_ACTIONS",
  planFingerprint,
  inputs: {
    profilePath: desiredProfilePath,
    profileFingerprint,
    workerRelease: workerRelease.version,
    workerReleaseFingerprint: workerRelease.releaseFingerprint,
    webRelease: webRelease.version,
    environment: plan.environment,
    distribution: plan.distribution,
    customisations: plan.customisations,
  },
  steps,
  externalActions,
  artifacts: {
    profile: desiredProfilePath,
    registryClientId: clientId,
    record: provisioningRecordPath,
  },
  generatedAt: new Date().toISOString(),
  generatedBy: "scripts/ops/worker-provision.mjs",
};
fs.mkdirSync(path.dirname(path.join(dataRoot, provisioningRecordPath)), { recursive: true });
fs.writeFileSync(path.join(dataRoot, provisioningRecordPath), `${JSON.stringify(record, null, 2)}\n`);

console.log(JSON.stringify({
  status: "PROVISIONED_AWAITING_EXTERNAL_ACTIONS",
  clientId,
  planFingerprint,
  written: plan.plannedWrites,
  externalActions: externalActions.filter((action) => action.status === "NOT_PERFORMED").map((action) => action.id),
  note: "Configuration and registry only. No Supabase project, store listing, signing credential, build or deployment was created.",
}, null, 2));
