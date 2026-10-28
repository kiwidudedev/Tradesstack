#!/usr/bin/env node
/**
 * Unified TradesStack customer provisioning.
 *
 * One command prepares a complete customer implementation:
 * dedicated Web repository, optional dedicated Worker repository, shared
 * customer identity, environment binding, customer configuration, deployable
 * Cloudflare overlay, one registry record and resumable lifecycle checkpoints.
 *
 * External infrastructure (Supabase project, R2 bucket, DNS, signing, stores) is
 * recorded as an external action; this tool never creates paid infrastructure.
 *
 * Usage:
 *   # web + Worker
 *   node scripts/ops/customer-provision.mjs --customer-id acme \
 *     --display-name "Acme" --worker-profile ops/worker/profiles/acme.json \
 *     --provider github --apply
 *
 *   # web only (no Worker application)
 *   node scripts/ops/customer-provision.mjs --customer-id acme --web-only \
 *     --display-name "Acme" --environment-id acme-production \
 *     --supabase-project-ref abcdefghij0123456789 --provider github --apply
 *
 *   # attach a dedicated Worker repository to an existing web customer
 *   node scripts/ops/customer-provision.mjs --customer-id client-alpha \
 *     --attach-worker --provider github --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, semver } from "./lib.mjs";
import { listReleaseFiles } from "./promote-release.mjs";
import { loadContract, workerPaths } from "./worker-contract.mjs";
import {
  createCustomerWorkerRepository,
  extractWorkerRelease,
  git,
  readCustomerManifest,
  run,
  sha256File,
} from "./worker-repo.mjs";
import {
  CUSTOMER_REPOSITORY_OWNER,
  PLATFORM_SUPABASE_REFS,
  defaultR2BucketName,
  defaultSiteUrl,
  defaultWorkerName,
  deploymentIdentity,
  deploymentTemplateFingerprint,
  updateDeploymentRelease,
  validateDeploymentIdentity,
  validateDeploymentOverlay,
  writeDeploymentOverlay,
} from "./customer-deploy.mjs";

const options = {
  apply: false,
  resume: false,
  activate: false,
  attachWorker: false,
  webOnly: false,
  takeoff: false,
  provider: "local",
};
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--apply") options.apply = true;
  else if (argument === "--resume") options.resume = true;
  else if (argument === "--activate") options.activate = true;
  else if (argument === "--attach-worker") options.attachWorker = true;
  else if (argument === "--web-only") options.webOnly = true;
  else if (argument === "--takeoff") options.takeoff = true;
  else if (argument.startsWith("--")) options[argument.slice(2)] = process.argv[++index];
}

const dataRoot = path.resolve(ROOT, options.root ?? ".");
const reposRoot = path.resolve(dataRoot, options["repos-root"] ?? "customer-repos");
const registryPath = path.join(dataRoot, "ops/clients.json");
const owner = options.owner ?? CUSTOMER_REPOSITORY_OWNER;
const provider = options.provider === "github" ? "github" : "local";
const webOnly = Boolean(options.webOnly);
const attachWorker = Boolean(options.attachWorker);
if (webOnly && attachWorker) fail("--web-only cannot be combined with --attach-worker.");

function output(payload, code = 0) {
  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = code;
}

function fail(reason, details = [], state = "BLOCKED") {
  output({ status: state, reason, details }, 1);
  process.exit(1);
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function latestRelease(directory) {
  if (!fs.existsSync(directory)) return null;
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(directory, file)))
    .filter((value) => value.releaseType === "OFFICIAL" && semver(value.version))
    .sort((left, right) => (left.version === right.version ? 0 : semverCompare(right.version, left.version)))[0];
}

function semverCompare(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const customerId = options["customer-id"];
if (!customerId || !/^[a-z][a-z0-9-]{2,62}$/.test(customerId)) fail("--customer-id is required and must be a safe slug");
if (customerId === "tradesstack-master" || (customerId === "client-alpha" && !attachWorker)) {
  fail(`Customer id ${customerId} is reserved${customerId === "client-alpha" ? "; use --attach-worker to adopt it" : ""}`);
}
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) fail("--owner must be a GitHub user or organisation name");
const operationRoot = path.join(dataRoot, "ops/provisioning", customerId);
const checkpointPath = path.join(operationRoot, "operation.json");
const lockPath = path.join(operationRoot, ".lock");

const registry = readJson(registryPath);
const existingClient = (registry.clients ?? []).find((client) => client.clientId === customerId);

// Inputs shared by plan and apply.
const webRelease = options["web-release"]
  ? readJson(path.join(dataRoot, "ops/releases", `${options["web-release"]}.json`))
  : latestRelease(path.join(dataRoot, "ops/releases"));
if (!webRelease) fail("No approved Web release found");

const workerEnabled = !webOnly;
let contract = null;
let workerRelease = null;
let workerProfileConfig = null;
let profileFingerprint = null;
let workerMainRoot = null;

if (workerEnabled || attachWorker) {
  contract = await loadContract(ROOT);
  workerMainRoot = options["worker-main"]
    ? path.resolve(ROOT, options["worker-main"])
    : path.resolve(ROOT, "../tradesstack-worker-app/tradesstack-worker-app");
  workerRelease = options["worker-release"]
    ? readJson(path.join(workerPaths(dataRoot).releases, `${options["worker-release"]}.json`))
    : latestRelease(workerPaths(dataRoot).releases);
  if (!workerRelease) fail("No approved Worker release found");

  if (options["worker-profile"]) {
    const profilePath = path.resolve(dataRoot, options["worker-profile"]);
    if (!fs.existsSync(profilePath)) fail(`Worker profile not found: ${options["worker-profile"]}`);
    try {
      workerProfileConfig = contract.defineWorkerClientConfig(readJson(profilePath));
    } catch (error) {
      fail(`Worker profile is invalid: ${error.message}`);
    }
  } else if (existingClient?.worker?.profilePath) {
    workerProfileConfig = contract.defineWorkerClientConfig(readJson(path.join(dataRoot, existingClient.worker.profilePath)));
  } else if (attachWorker) {
    fail("--attach-worker needs an existing worker profile (ops/worker/profiles/<id>.json) or --worker-profile");
  } else {
    fail("--worker-profile is required for a new web + Worker customer; use --web-only for a web-only implementation");
  }
  if (workerProfileConfig.clientKey !== customerId) {
    fail(`Worker profile clientKey ${workerProfileConfig.clientKey} must equal --customer-id ${customerId}`);
  }
  profileFingerprint = sha256Text(contract.canonicalizeWorkerClientConfig(workerProfileConfig));
}

// The environment is explicit for web-only customers and derived from the
// Worker profile for web + Worker customers. Both paths end in one hosted
// environment identity.
const explicitEnvironmentId = options["environment-id"]?.trim() || null;
const explicitProjectRef = options["supabase-project-ref"]?.trim() || null;
let environment;
if (workerProfileConfig) {
  const profileEnvironment = workerProfileConfig.environment;
  if (explicitEnvironmentId && explicitEnvironmentId !== profileEnvironment.environmentId) {
    fail(`--environment-id ${explicitEnvironmentId} differs from the Worker profile environment ${profileEnvironment.environmentId}`);
  }
  if (explicitProjectRef && explicitProjectRef !== profileEnvironment.supabaseProjectRef) {
    fail(`--supabase-project-ref ${explicitProjectRef} differs from the Worker profile project ${profileEnvironment.supabaseProjectRef}`);
  }
  environment = profileEnvironment.kind === "hosted"
    ? {
        kind: "hosted",
        environmentId: profileEnvironment.environmentId,
        supabaseProjectRef: profileEnvironment.supabaseProjectRef,
      }
    : { kind: "local", environmentId: profileEnvironment.environmentId, supabaseProjectRef: null };
} else {
  if (!explicitEnvironmentId || !explicitProjectRef) {
    fail("A web-only implementation requires --environment-id and --supabase-project-ref");
  }
  environment = { kind: "hosted", environmentId: explicitEnvironmentId, supabaseProjectRef: explicitProjectRef };
}
if (environment.kind !== "hosted") {
  fail("Customer provisioning requires a hosted environment; local Worker profiles are not deployable");
}
if (!/^[a-z0-9]{20}$/.test(environment.supabaseProjectRef ?? "")) {
  fail("A hosted customer needs a valid 20-character Supabase project ref");
}
if (!workerEnabled && existingClient?.worker) {
  fail("Existing customer has a Worker application; use a new customer key or keep the Worker enabled");
}

const displayName = options["display-name"] ?? existingClient?.displayName ?? workerProfileConfig?.identity?.appName ?? customerId;
const platformColor = options["platform-color"] ?? workerProfileConfig?.branding?.platformColor ?? existingClient?.deployment?.branding?.platformColor ?? "#162033";
const actionColor = options["action-color"] ?? workerProfileConfig?.branding?.actionColor ?? existingClient?.deployment?.branding?.actionColor ?? "#F45D22";
const defaults = workerProfileConfig?.defaults ?? { locale: "en-NZ", currency: "NZD", timezone: "Pacific/Auckland" };

const baseName = customerId.startsWith("client-") ? customerId : `client-${customerId}`;
const webRepoName = `${owner}/tradesstack-${baseName}`;
const workerRepoName = workerEnabled ? `${owner}/tradesstack-worker-${baseName}` : null;
const workerName = options["worker-name"] ?? (existingClient?.runtimeReference && !/^PENDING$/i.test(existingClient.runtimeReference) ? existingClient.runtimeReference : defaultWorkerName(customerId));
const r2BucketName = options["r2-bucket"] ?? defaultR2BucketName(workerName);
const siteUrl = (options["site-url"] ?? (typeof existingClient?.domainReference === "string" && existingClient.domainReference.startsWith("http") ? existingClient.domainReference : defaultSiteUrl(workerName))).replace(/\/+$/, "");
const existingWebRepository = existingClient?.repositoryReference ?? null;
const webRepository = attachWorker ? existingWebRepository : `github:${webRepoName}`;
if (!webRepository) fail("Existing customer has no web repository reference; cannot attach a Worker implementation");

const identity = deploymentIdentity({
  customerKey: customerId,
  displayName,
  environmentId: environment.environmentId,
  supabaseProjectRef: environment.supabaseProjectRef,
  workerName,
  r2BucketName,
  siteUrl,
  release: webRelease.version,
  sourceSha: webRelease.sourceSha,
  releaseFingerprint: webRelease.releaseFingerprint,
  takeoff: Boolean(options.takeoff),
});

// Redirect desktop and build output into the workspace only.
if (provider === "local") {
  fs.mkdirSync(reposRoot, { recursive: true });
}

function loadCheckpoint() {
  return fs.existsSync(checkpointPath) ? readJson(checkpointPath) : null;
}

function saveCheckpoint(checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  atomicWriteJson(checkpointPath, checkpoint);
}

function stepRecord(checkpoint, id, status, detail, artifact = null) {
  const existing = checkpoint.steps.find((step) => step.id === id);
  const finishedAt = ["PASS", "SKIPPED"].includes(status) ? new Date().toISOString() : null;
  if (existing) {
    existing.status = status;
    existing.detail = detail;
    existing.artifact = artifact ?? existing.artifact ?? null;
    existing.updatedAt = new Date().toISOString();
    if (finishedAt) existing.finishedAt = finishedAt;
  } else {
    checkpoint.steps.push({
      id,
      status,
      detail,
      artifact,
      startedAt: new Date().toISOString(),
      finishedAt,
      updatedAt: new Date().toISOString(),
    });
  }
}

function operationInputs() {
  return {
    customerId,
    displayName,
    owner,
    attachWorker,
    webOnly,
    takeoff: Boolean(options.takeoff),
    provider,
    environment,
    profileFingerprint,
    webRelease: webRelease.version,
    workerRelease: workerRelease?.version ?? null,
    webRepository,
    workerRepository: workerEnabled ? `github:${workerRepoName}` : null,
    deployment: {
      workerName,
      r2BucketName,
      siteUrl,
      environment: identity.cloudflareEnvironment,
    },
    domain: options.domain ?? "PENDING",
  };
}

const operationId = `prov-${customerId}-${sha256Text(JSON.stringify(operationInputs())).slice(0, 16)}`;
let checkpoint = loadCheckpoint();
if (checkpoint && checkpoint.operationId !== operationId && !options.resume) {
  fail("An existing provisioning operation has different inputs. Re-run with --resume to resume it or use a new customer id.", [
    `existing ${checkpoint.operationId}`,
    `requested ${operationId}`,
  ]);
}
if (checkpoint && checkpoint.operationId === operationId && ["READY_FOR_VALIDATION", "READY_FOR_DEPLOYMENT", "ACTIVE"].includes(checkpoint.state) && !options.resume) {
  output({ status: "ALREADY_PROVISIONED", state: checkpoint.state, operationId, record: path.relative(dataRoot, checkpointPath) });
  process.exit(0);
}
if (fs.existsSync(lockPath) && options.apply && !options.resume) {
  const lock = readJson(lockPath);
  const age = Date.now() - new Date(lock.startedAt).getTime();
  if (age < 10 * 60 * 1000) {
    fail("Another provisioning operation appears to be running for this customer.", [
      `lock ${lock.operationId} started ${lock.startedAt}`,
      "Re-run with --resume only after confirming the other operation is gone.",
    ], "PROVISIONING_IN_PROGRESS");
  }
}

if (!checkpoint) {
  checkpoint = {
    schemaVersion: 1,
    operationId,
    customerId,
    state: "PLANNED",
    inputs: operationInputs(),
    steps: [],
    externalActions: [],
    errors: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "scripts/ops/customer-provision.mjs",
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const externalActions = [
  { id: "create-supabase-project", status: environment.kind === "hosted" ? "REQUIRED" : "USE_LOCAL", detail: environment.supabaseProjectRef },
  { id: "apply-database-baseline-and-migrations", status: "REQUIRED", detail: "Approved baseline + migrations for the customer project" },
  { id: "create-r2-bucket", status: "REQUIRED", detail: `Private R2 bucket ${r2BucketName}` },
  { id: "bind-web-environment-secrets", status: "REQUIRED", detail: "Web hosting env: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SITE_URL, plus server secrets" },
  { id: "create-cloudflare-worker", status: "REQUIRED", detail: `Cloudflare Worker ${workerName} and its R2 binding` },
  { id: "configure-customer-domain", status: options.domain ? "REQUIRED" : "PENDING_APPROVAL", detail: options.domain ?? `${siteUrl} (workers.dev staging; custom domain pending)` },
  ...(workerEnabled
    ? [
        { id: "bind-worker-build-secrets", status: "REQUIRED", detail: "Worker build env: EXPO_PUBLIC_SUPABASE_URL / ANON_KEY / FUNCTIONS_URL" },
        { id: "signing-and-store-listing", status: workerProfileConfig.distribution.channel === "store" ? "REQUIRED" : "NOT_REQUIRED", detail: "Owner approval required" },
      ]
    : []),
  { id: "build-and-distribute", status: "REQUIRED", detail: workerEnabled ? "Web deploy + Worker build/distribution approvals" : "Web deploy approval" },
];

const plan = {
  status: options.apply ? null : "PLAN_ONLY",
  operationId,
  customerId,
  displayName,
  provider,
  identity: { baseName, environment, profileFingerprint, workerEnabled, deployment: identity },
  repositories: {
    web: { name: webRepoName, reuseExisting: Boolean(existingWebRepository), reference: webRepository },
    worker: workerEnabled ? { name: workerRepoName, reference: `github:${workerRepoName}` } : null,
  },
  releases: {
    web: { version: webRelease.version, sourceSha: webRelease.sourceSha, fingerprint: webRelease.releaseFingerprint ?? null },
    worker: workerEnabled ? { version: workerRelease.version, sourceSha: workerRelease.sourceSha, fingerprint: workerRelease.releaseFingerprint } : null,
  },
  externalActions,
  steps: ["identity", "web-repository", "worker-repository", "backend-binding", "configuration", "link-validation", "registry", "ci", "validate", "finalise"],
};

if (!options.apply) {
  output(plan);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

fs.mkdirSync(operationRoot, { recursive: true });
fs.writeFileSync(lockPath, `${JSON.stringify({ operationId, startedAt: new Date().toISOString(), pid: process.pid })}\n`);
checkpoint.state = "PROVISIONING";
saveCheckpoint(checkpoint);

function completeStep(id, detail, artifact = null) {
  // A step that already passed and whose artifact still exists is reused.
  const existing = checkpoint.steps.find((step) => step.id === id);
  if (existing?.status === "PASS") {
    const artifactOk = !artifact || !artifact.path || fs.existsSync(artifact.path);
    if (artifactOk) return;
  }
  stepRecord(checkpoint, id, "PASS", detail, artifact);
  saveCheckpoint(checkpoint);
}

function skipStep(id, detail) {
  stepRecord(checkpoint, id, "SKIPPED", detail);
  saveCheckpoint(checkpoint);
}

function maybeSimulateFailure(id) {
  if (options["simulate-failure"] !== id) return;
  stepRecord(checkpoint, id, "FAILED_RETRYABLE", `Simulated failure at ${id}`);
  checkpoint.state = "PARTIALLY_PROVISIONED";
  checkpoint.errors.push({ step: id, message: `Simulated failure at ${id}`, at: new Date().toISOString() });
  saveCheckpoint(checkpoint);
  fs.rmSync(lockPath, { force: true });
  output({
    status: "PARTIALLY_PROVISIONED",
    step: id,
    reason: `Simulated failure at ${id}`,
    retry: "Re-run the same command with --apply --resume",
    record: path.relative(dataRoot, checkpointPath),
  }, 1);
  process.exit(1);
}

function ensureGithubRepository({ directory, fullName, description }) {
  let exists = false;
  try {
    const raw = run("gh", ["repo", "view", fullName, "--json", "isPrivate"], ROOT);
    const info = JSON.parse(raw);
    exists = true;
    if (info.isPrivate !== true) fail(`GitHub repository ${fullName} already exists and is not private; refusing to use it`);
  } catch (error) {
    const text = `${error?.stderr ?? ""}\n${error?.stdout ?? ""}\n${error?.message ?? ""}`;
    if (!/Could not resolve|HTTP 404|Not Found/i.test(text)) throw error;
  }
  if (!exists) {
    run("gh", ["repo", "create", fullName, "--private", "--description", description], ROOT);
  }
  const remotes = git(directory, ["remote"]).split("\n").filter(Boolean);
  const url = `https://github.com/${fullName}.git`;
  if (remotes.includes("origin")) run("git", ["remote", "set-url", "origin", url], directory);
  else run("git", ["remote", "add", "origin", url], directory);
  const localHead = git(directory, ["rev-parse", "HEAD"]);
  const remote = git(directory, ["ls-remote", "origin", "refs/heads/main"]).trim();
  const remoteSha = remote.split(/\s+/)[0] || null;
  if (remoteSha && remoteSha !== localHead) {
    fail(`Remote ${fullName} main has diverged from the prepared snapshot; refusing to overwrite it`, [
      `remote ${remoteSha}`,
      `local ${localHead}`,
    ]);
  }
  if (!remoteSha) run("git", ["push", "-u", "origin", "main"], directory);
  return { fullName, created: !exists, pushed: !remoteSha, existing: exists, head: localHead };
}

function snapshotSummary(webDir, release) {
  const file = path.join(webDir, "release-manifest.json");
  if (!fs.existsSync(file)) return { errors: ["release-manifest.json missing"], fileCount: 0 };
  const manifest = readJson(file);
  const errors = [];
  if (manifest.releaseId !== release.version || manifest.sourceSha !== release.sourceSha) {
    errors.push(`release manifest is ${manifest.releaseId}/${manifest.sourceSha}, expected ${release.version}/${release.sourceSha}`);
  }
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (files.length === 0) errors.push("release manifest has no file list");
  const hashes = manifest.fileHashes ?? {};
  const missing = [];
  const mismatched = [];
  for (const relative of files) {
    const target = path.join(webDir, relative);
    if (!fs.existsSync(target)) missing.push(relative);
    else if (sha256File(target) !== hashes[relative]) mismatched.push(relative);
  }
  if (missing.length) errors.push(`missing release files: ${missing.slice(0, 8).join(", ")}`);
  if (mismatched.length) errors.push(`release file hashes differ: ${mismatched.slice(0, 8).join(", ")}`);
  return { manifest, errors, fileCount: files.length };
}

const webContract = await import(path.join(ROOT, "packages/client-config/dist/index.js"));
const clientConfig = webContract.defineTradesStackClientConfig(
  options["web-config"]
    ? readJson(path.resolve(dataRoot, options["web-config"]))
    : {
        schemaVersion: 1,
        identity: {
          clientKey: customerId,
          displayName,
          description: `${displayName} TradesStack implementation`,
        },
        theme: { platformColor, actionColor },
        defaults,
      },
);
const clientConfigFingerprint = sha256Text(JSON.stringify(clientConfig));
const templateFingerprint = deploymentTemplateFingerprint();

try {
  // 1. Identity -------------------------------------------------------------
  const resumingSameOperation =
    existingClient &&
    (existingClient.provisioning?.operationId === operationId || checkpoint.operationId === operationId);
  if (existingClient && !attachWorker && !resumingSameOperation) {
    fail("Customer is already registered. Use --attach-worker to add a dedicated Worker repository.", [
      "Existing customers must not be recreated.",
    ]);
  }
  if (!attachWorker) {
    for (const client of registry.clients ?? []) {
      if (client.clientId === customerId) fail("Duplicate customer id");
      if (String(client.databaseProjectReference ?? "") === `supabase:${environment.supabaseProjectRef}`) {
        fail(`Environment ${environment.supabaseProjectRef} is already owned by ${client.clientId}`);
      }
    }
    if (PLATFORM_SUPABASE_REFS.includes(environment.supabaseProjectRef)) {
      fail(`Refusing to provision a customer against platform Supabase project ${environment.supabaseProjectRef}`);
    }
    const identityErrors = validateDeploymentIdentity(identity);
    if (identityErrors.length) fail(`Customer deployment identity is invalid: ${identityErrors.join("; ")}`, identityErrors);
  } else {
    for (const client of registry.clients ?? []) {
      if (client.clientId !== customerId && client.worker?.repositoryReference === `github:${workerRepoName}`) {
        fail(`Worker repository ${workerRepoName} is already registered to ${client.clientId}`);
      }
    }
  }
  if (workerEnabled) {
    for (const profile of fs.existsSync(workerPaths(dataRoot).profiles)
      ? fs.readdirSync(workerPaths(dataRoot).profiles).filter((file) => file.endsWith(".json"))
      : []) {
      if (profile === `${customerId}.json`) continue;
      const other = contract.defineWorkerClientConfig(readJson(path.join(workerPaths(dataRoot).profiles, profile)));
      const conflicts = contract.findWorkerIsolationConflicts(workerProfileConfig, other);
      if (conflicts.length) fail(`Customer isolation conflict with ${profile}: ${conflicts.join("; ")}`);
    }
  }
  completeStep("identity", `Customer ${customerId} identity validated (${environment.environmentId}); ${workerEnabled ? "web + Worker" : "web-only"}`);

  // 2. Web repository -------------------------------------------------------
  const webDir = path.join(reposRoot, baseName, "web");
  if (!attachWorker) {
    fs.mkdirSync(path.dirname(webDir), { recursive: true });
    if (fs.existsSync(path.join(webDir, ".git"))) {
      const manifest = fs.existsSync(path.join(webDir, "release-manifest.json"))
        ? readJson(path.join(webDir, "release-manifest.json"))
        : null;
      if (manifest?.releaseId !== webRelease.version || manifest?.sourceSha !== webRelease.sourceSha) {
        fail(`Existing web repository ${webDir} is not based on ${webRelease.version}`);
      }
      const overlay = validateDeploymentOverlay(webDir);
      if (overlay.present && overlay.errors.length) {
        fail(`Existing customer deployment overlay is invalid: ${overlay.errors.join("; ")}`);
      }
      if (!overlay.present) {
        writeDeploymentOverlay({ root: webDir, identity });
      } else {
        updateDeploymentRelease(webDir, {
          version: webRelease.version,
          sourceSha: webRelease.sourceSha,
          releaseFingerprint: webRelease.releaseFingerprint,
        });
      }
    } else {
      const temporary = fs.mkdtempSync(path.join(operationRoot, "web-snapshot-"));
      const archive = path.join(temporary, "release.tar");
      run("git", ["archive", "--format=tar", webRelease.sourceSha, "-o", archive], ROOT);
      const snapshot = path.join(temporary, "snapshot");
      fs.mkdirSync(snapshot, { recursive: true });
      run("tar", ["-xf", archive, "-C", snapshot], ROOT);
      fs.mkdirSync(webDir, { recursive: true });
      run("git", ["init", "--initial-branch=main"], webDir);
      const files = listReleaseFiles(snapshot);
      const fileHashes = {};
      for (const file of files) {
        const target = path.join(webDir, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(snapshot, file), target);
        fileHashes[file] = sha256File(target);
      }
      const configDir = path.join(webDir, "client/config");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, `${customerId}.ts`),
        `import { defineTradesStackClientConfig } from "@tradesstack/client-config";\n\nexport const CLIENT_CONFIG = defineTradesStackClientConfig(${JSON.stringify(clientConfig, null, 2)});\n`,
      );
      fs.writeFileSync(
        path.join(webDir, "client/CLIENT_OWNERSHIP.md"),
        `# ${displayName} — customer-owned web material\n\nThis directory, deploy/, wrangler.jsonc, cloudflare/, open-next.config.ts and the deployment scripts are preserved by Web Main upgrades.\n`,
      );
      writeDeploymentOverlay({ root: webDir, identity });
      fs.writeFileSync(
        path.join(webDir, "release-manifest.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          releaseId: webRelease.releaseId,
          version: webRelease.version,
          sourceSha: webRelease.sourceSha,
          mainReleaseFingerprint: webRelease.releaseFingerprint ?? null,
          customerId,
          clientConfigFingerprint,
          deploymentTemplateFingerprint: templateFingerprint,
          deployment: {
            workerName,
            r2BucketName,
            siteUrl,
            environmentId: environment.environmentId,
            workerEnabled,
            takeoff: Boolean(options.takeoff),
          },
          files,
          fileHashes,
          databaseCompatibility: webRelease.database?.migrationTarget ?? null,
          adoptedAt: new Date().toISOString(),
          adoptedBy: "scripts/ops/customer-provision.mjs",
        }, null, 2)}\n`,
      );
      fs.rmSync(temporary, { recursive: true, force: true });
      run("git", ["add", "-A"], webDir);
      run("git", ["-c", "user.name=TradesStack Ops", "-c", "user.email=ops@tradesstack.invalid", "commit", "-m", `Initial ${displayName} web implementation from ${webRelease.version}`], webDir);
    }
    if (provider === "github") {
      const webFullName = webRepoName.replace(/^.*\//, `${owner}/`);
      const published = ensureGithubRepository({
        directory: webDir,
        fullName: webFullName,
        description: `${displayName} TradesStack web implementation`,
      });
      checkpoint.github = { ...(checkpoint.github ?? {}), web: published };
      saveCheckpoint(checkpoint);
    }
    maybeSimulateFailure("web-repository");
    completeStep("web-repository", `Web repository prepared at ${path.relative(dataRoot, webDir)} from ${webRelease.version}`, { path: path.relative(dataRoot, webDir) });
  } else {
    completeStep("web-repository", `Existing web repository reused: ${webRepository}`);
  }

  // 3. Worker repository ----------------------------------------------------
  const workerDir = workerEnabled ? path.join(reposRoot, baseName, "worker") : null;
  if (!workerEnabled) {
    skipStep("worker-repository", "Skipped — web-only implementation has no Worker application");
  } else {
    const customerProfileJson = `${JSON.stringify(workerProfileConfig, null, 2)}\n`;
    if (!fs.existsSync(path.join(workerDir, ".git"))) {
      maybeSimulateFailure("worker-repository");
    }
    if (fs.existsSync(path.join(workerDir, ".git"))) {
      const manifest = readCustomerManifest(workerDir);
      if (!manifest || manifest.workerRelease !== workerRelease.version) {
        fail(`Existing Worker repository ${workerDir} is not based on ${workerRelease.version}`);
      }
      if (!fs.existsSync(path.join(workerDir, "client/worker-profile.json"))) {
        fail(`Existing Worker repository ${workerDir} has no client profile`);
      }
      const actual = sha256Text(contract.canonicalizeWorkerClientConfig(
        contract.defineWorkerClientConfig(readJson(path.join(workerDir, "client/worker-profile.json"))),
      ));
      if (actual !== profileFingerprint) fail("Existing Worker repository profile differs from the registered profile");
    } else {
      const extracted = extractWorkerRelease({ workerMain: workerMainRoot, release: workerRelease, contract });
      try {
        fs.mkdirSync(path.dirname(workerDir), { recursive: true });
        createCustomerWorkerRepository({
          root: workerDir,
          snapshot: extracted.snapshot,
          release: workerRelease,
          customerFiles: {
            "client/worker-profile.json": customerProfileJson,
            "client/README.md": `# ${displayName} — customer-owned Worker material\n\nPreserved by Worker Main upgrades. Add customer screens under client/extensions and assets under client/assets.\n`,
            "client/extensions/home/index.tsx": "import type { HomeExtension } from '@/src/config/extension-host';\n\nexport const homeExtensions: HomeExtension[] = [];\n",
            "client/IMPLEMENTATION.md": `# ${displayName} Worker implementation\n\n- Baseline Worker Main release: ${workerRelease.version} (${workerRelease.sourceSha})\n- Environment: ${environment.environmentId} (${environment.supabaseProjectRef})\n- Bundle: ${workerProfileConfig.distribution.iosBundleIdentifier} / ${workerProfileConfig.distribution.androidPackage}\n`,
          },
        });
        run("git", ["add", "-A"], workerDir);
        run("git", ["-c", "user.name=TradesStack Ops", "-c", "user.email=ops@tradesstack.invalid", "commit", "-m", `Initial ${displayName} Worker implementation from ${workerRelease.version}`], workerDir);
      } finally {
        extracted.dispose();
      }
    }
    if (provider === "github") {
      const published = ensureGithubRepository({
        directory: workerDir,
        fullName: workerRepoName,
        description: `${displayName} TradesStack Worker implementation`,
      });
      checkpoint.github = { ...(checkpoint.github ?? {}), worker: published };
      saveCheckpoint(checkpoint);
    }
    completeStep("worker-repository", `Worker repository prepared at ${path.relative(dataRoot, workerDir)} from ${workerRelease.version}`, { path: path.relative(dataRoot, workerDir) });
  }

  // 4. Backend binding ------------------------------------------------------
  completeStep(
    "backend-binding",
    `Environment ${environment.environmentId} bound to ${environment.supabaseProjectRef}; Supabase project creation and migrations remain external`,
  );

  // 5. Configuration --------------------------------------------------------
  if (workerEnabled) {
    const profileTarget = path.join(workerPaths(dataRoot).profiles, `${customerId}.json`);
    fs.mkdirSync(path.dirname(profileTarget), { recursive: true });
    if (fs.existsSync(profileTarget)) {
      const existingFingerprint = sha256Text(contract.canonicalizeWorkerClientConfig(
        contract.defineWorkerClientConfig(readJson(profileTarget)),
      ));
      if (existingFingerprint !== profileFingerprint) {
        fail(`Existing customer profile ${path.relative(dataRoot, profileTarget)} differs; refusing to overwrite customer configuration`);
      }
    } else {
      fs.writeFileSync(profileTarget, `${JSON.stringify(workerProfileConfig, null, 2)}\n`);
    }
    maybeSimulateFailure("configuration");
    completeStep("configuration", `Worker profile recorded at ${path.relative(dataRoot, profileTarget)}; deployment overlay written`, { path: path.relative(dataRoot, profileTarget) });
  } else {
    maybeSimulateFailure("configuration");
    completeStep("configuration", "Web-only implementation: no Worker profile; deployment overlay written to deploy/customer.json");
  }

  // 6. Link validation ------------------------------------------------------
  if (workerEnabled) {
    const profileInRepo = readJson(path.join(workerDir, "client/worker-profile.json"));
    const repoRef = profileInRepo.environment.kind === "hosted"
      ? profileInRepo.environment.supabaseProjectRef
      : null;
    if (repoRef !== environment.supabaseProjectRef) {
      fail("Worker repository profile does not point at the customer environment");
    }
  }
  if (PLATFORM_SUPABASE_REFS.includes(environment.supabaseProjectRef) && !attachWorker) {
    fail("Refusing to provision a customer against a platform Supabase project");
  }
  if (!attachWorker) {
    const overlayValidation = validateDeploymentOverlay(webDir);
    if (overlayValidation.errors.length) {
      fail(`Customer deployment overlay is invalid: ${overlayValidation.errors.join("; ")}`, overlayValidation.errors);
    }
  }
  completeStep("link-validation", `${workerEnabled ? "Web and Worker both" : "Web"} resolve to ${environment.environmentId} (${environment.supabaseProjectRef}); deployment identity validated`);

  // 7. Registry -------------------------------------------------------------
  const provisioningRecord = path.relative(dataRoot, checkpointPath).split(path.sep).join("/");
  const workerBinding = workerEnabled
    ? {
        profilePath: path.relative(dataRoot, path.join(workerPaths(dataRoot).profiles, `${customerId}.json`)).split(path.sep).join("/"),
        profileFingerprint,
        workerMainRepository: "github:tradesstack/tradesstack-worker-app",
        repositoryReference: `github:${workerRepoName}`,
        targetWorkerRelease: workerRelease.version,
        promotedWorkerRelease: workerRelease.version,
        sourceBaseline: {
          release: workerRelease.version,
          sourceSha: workerRelease.sourceSha,
          fingerprint: workerRelease.releaseFingerprint,
        },
        distributionChannel: workerProfileConfig.distribution.channel,
        clientExtensions: [],
        provisioningRecord,
        compatibilityStatus: "COMPATIBLE",
      }
    : null;
  const existingEntry = (registry.clients ?? []).find((client) => client.clientId === customerId);
  const databaseBinding = {
    baseline: webRelease.database?.baseline ?? "phase1o-1",
    migrationTarget: webRelease.database?.migrationTarget ?? null,
    status: "PENDING_APPLICATION",
  };
  const releaseProvenance = {
    status: "SOURCE_PREPARED",
    releaseId: webRelease.version,
    sourceSha: webRelease.sourceSha,
    fingerprint: webRelease.releaseFingerprint ?? null,
    installedVersion: null,
    installedAt: null,
    installationMethod: "scripts/ops/customer-provision.mjs",
    repositoryReference: `github:${webRepoName}`,
    preparedAt: new Date().toISOString(),
  };
  const deploymentBinding = attachWorker
    ? existingEntry?.deployment ?? null
    : {
        provider: "cloudflare",
        workerName,
        r2BucketName,
        siteUrl,
        deploymentUrl: identity.deploymentUrl,
        environment: identity.cloudflareEnvironment,
        workerEnabled,
        takeoff: Boolean(options.takeoff),
        status: "NOT_DEPLOYED",
        templateVersion: identity.templateVersion,
        templateFingerprint,
      };
  const registryEntry = existingEntry
    ? {
        ...existingEntry,
        displayName,
        targetRelease: webRelease.version,
        repositoryReference: `github:${webRepoName}`,
        database: existingEntry.database ?? databaseBinding,
        ...(deploymentBinding ? { deployment: { ...(existingEntry.deployment ?? {}), ...deploymentBinding } } : {}),
        releaseProvenance: { ...(existingEntry.releaseProvenance ?? {}), ...releaseProvenance },
        ...(workerBinding ? { worker: { ...(existingEntry.worker ?? {}), ...workerBinding } } : {}),
        provisioning: { operationId, record: provisioningRecord, state: checkpoint.state },
      }
    : {
        clientId: customerId,
        displayName,
        environment: environment.kind === "hosted" ? "managed-client" : "local-development",
        lifecycleStatus: "PENDING",
        defaultBranch: "main",
        rolloutStatus: "ENABLED",
        releaseChannel: "stable",
        clientOwnedPaths: [
          "client/**",
          ".env*",
          "deploy/**",
          "wrangler.jsonc",
          "cloudflare/**",
          "cloudflare-env.d.ts",
          "open-next.config.ts",
          "scripts/**",
          ".github/**",
        ],
        targetRelease: webRelease.version,
        repositoryReference: `github:${webRepoName}`,
        deploymentTarget: workerName,
        databaseProjectReference: `supabase:${environment.supabaseProjectRef}`,
        runtimeReference: workerName,
        domainReference: siteUrl,
        workerEnabled,
        takeoff: Boolean(options.takeoff),
        releaseProvenance,
        database: databaseBinding,
        ...(deploymentBinding ? { deployment: deploymentBinding } : {}),
        ...(workerBinding ? { worker: workerBinding } : {}),
        provisioning: { operationId, record: provisioningRecord, state: checkpoint.state },
      };
  const nextRegistry = existingEntry
    ? { ...registry, clients: registry.clients.map((client) => client.clientId === customerId ? registryEntry : client) }
    : { ...registry, clients: [...(registry.clients ?? []), registryEntry] };
  atomicWriteJson(registryPath, nextRegistry);
  completeStep("registry", `One registry entry joins the web repository, environment and ${workerEnabled ? "Worker" : "web-only deployment"} for ${customerId}`);

  // 8. CI -------------------------------------------------------------------
  const webCi = fs.existsSync(path.join(webDir, ".github/workflows"));
  const workerCi = workerEnabled && fs.existsSync(path.join(workerDir, ".github/workflows/worker-app-ci.yml"));
  completeStep(
    "ci",
    `Web CI ${webCi ? "present" : "requires configuration"}${workerEnabled ? `; Worker CI ${workerCi ? "present" : "missing"}` : "; no Worker CI required"}`,
  );

  // 9. Validation -----------------------------------------------------------
  const validation = [];
  if (workerDir && fs.existsSync(workerDir)) {
    try {
      run("npm", ["run", "config:verify-vendor"], workerDir, { timeout: 120000 });
      validation.push({ check: "worker vendor integrity", status: "PASS" });
    } catch (error) {
      validation.push({ check: "worker vendor integrity", status: "FAIL", detail: String(error.message).slice(0, 160) });
    }
    try {
      run("npm", ["run", "config:validate:profile"], workerDir, { timeout: 120000 });
      validation.push({ check: "worker profile validation", status: "PASS" });
    } catch (error) {
      validation.push({ check: "worker profile validation", status: "FAIL", detail: String(error.message).slice(0, 160) });
    }
  }
  if (!attachWorker) {
    const snapshot = snapshotSummary(webDir, webRelease);
    validation.push({
      check: "release snapshot integrity",
      status: snapshot.errors.length ? "FAIL" : "PASS",
      detail: snapshot.errors.length ? snapshot.errors.join("; ") : `${snapshot.fileCount} release files verified`,
    });
    const configManifest = readJson(path.join(webDir, "release-manifest.json"));
    validation.push({
      check: "customer configuration",
      status: configManifest.clientConfigFingerprint === clientConfigFingerprint ? "PASS" : "FAIL",
      detail: configManifest.clientConfigFingerprint === clientConfigFingerprint ? "client config fingerprint matches" : "client config fingerprint differs",
    });
    const finalOverlay = validateDeploymentOverlay(webDir);
    validation.push({
      check: "deployment overlay",
      status: finalOverlay.errors.length ? "FAIL" : "PASS",
      detail: finalOverlay.errors.length ? finalOverlay.errors.join("; ") : "Cloudflare overlay is customer-specific and complete",
    });
    validation.push({
      check: "deployment identity",
      status: validateDeploymentIdentity(identity).length ? "FAIL" : "PASS",
      detail: validateDeploymentIdentity(identity).join("; ") || "no Alpha/Main identities present",
    });
  }
  const validationFailed = validation.some((item) => item.status === "FAIL");
  maybeSimulateFailure("validate");
  if (validationFailed) {
    stepRecord(checkpoint, "validate", "FAILED_RETRYABLE", "Customer validation failed", { validation });
    checkpoint.state = "PARTIALLY_PROVISIONED";
    checkpoint.errors.push({ step: "validate", message: "Customer validation failed", at: new Date().toISOString() });
    saveCheckpoint(checkpoint);
    fs.rmSync(lockPath, { force: true });
    output({ status: "PARTIALLY_PROVISIONED", validation, record: path.relative(dataRoot, checkpointPath) }, 1);
  }
  completeStep("validate", "Release snapshot, customer configuration, deployment overlay and identity validated", { validation });

  // 10. Finalise ------------------------------------------------------------
  checkpoint.externalActions = plan.externalActions;
  checkpoint.state = options.activate ? "ACTIVE" : "READY_FOR_DEPLOYMENT";
  completeStep("finalise", `Customer implementation ${checkpoint.state}`);
  const finalRegistry = readJson(registryPath);
  for (const client of finalRegistry.clients ?? []) {
    if (client.clientId !== customerId) continue;
    client.provisioning = { ...(client.provisioning ?? {}), operationId, record: provisioningRecord, state: checkpoint.state };
    client.releaseProvenance = { ...(client.releaseProvenance ?? {}), status: "SOURCE_PREPARED", preparedAt: new Date().toISOString() };
    if (options.activate) client.lifecycleStatus = "ACTIVE";
  }
  atomicWriteJson(registryPath, finalRegistry);
  saveCheckpoint(checkpoint);
  fs.rmSync(lockPath, { force: true });

  output({
    status: checkpoint.state,
    operationId,
    customerId,
    webOnly: !workerEnabled,
    identity: plan.identity,
    repositories: {
      web: `github:${webRepoName}`,
      worker: workerEnabled ? `github:${workerRepoName}` : null,
      localDirectories: attachWorker ? null : {
        web: path.relative(dataRoot, webDir),
        ...(workerDir ? { worker: path.relative(dataRoot, workerDir) } : {}),
      },
    },
    releases: plan.releases,
    deployment: deploymentBinding,
    externalActions: plan.externalActions.filter((action) => action.status === "REQUIRED"),
    github: checkpoint.github ?? null,
    record: path.relative(dataRoot, checkpointPath),
    note: "Migrations, R2 creation, secrets, deployment and optional Worker distribution remain external actions.",
  });
} catch (error) {
  stepRecord(checkpoint, "finalise", "FAILED_RETRYABLE", String(error.message).slice(0, 300));
  checkpoint.state = "PARTIALLY_PROVISIONED";
  checkpoint.errors.push({ message: String(error.message), at: new Date().toISOString() });
  saveCheckpoint(checkpoint);
  fs.rmSync(lockPath, { force: true });
  output({ status: "PARTIALLY_PROVISIONED", reason: String(error.message), record: path.relative(dataRoot, checkpointPath) }, 1);
}
