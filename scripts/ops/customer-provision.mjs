#!/usr/bin/env node
/**
 * Unified TradesStack customer provisioning.
 *
 * One command prepares the complete customer implementation:
 * dedicated Web repository, dedicated Worker repository, shared customer
 * identity, environment binding, configurations, one registry record and
 * lifecycle checkpoints. It is idempotent, resumable and retry-safe.
 *
 * External infrastructure (Supabase project, DNS, signing, stores) is recorded
 * as an external action; this tool never creates paid infrastructure.
 *
 * Usage:
 *   node scripts/ops/customer-provision.mjs --customer-id wilson-construction \
 *     --display-name "Wilson Construction" \
 *     --worker-profile ops/worker/fixtures/wilson-construction.json \
 *     --supabase-project-ref wlsnconstruction0001 --provider local --apply
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

const options = { apply: false, resume: false, activate: false, attachWorker: false, provider: "local" };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--apply") options.apply = true;
  else if (argument === "--resume") options.resume = true;
  else if (argument === "--activate") options.activate = true;
  else if (argument === "--attach-worker") options.attachWorker = true;
  else if (argument.startsWith("--")) options[argument.slice(2)] = process.argv[++index];
}

const dataRoot = path.resolve(ROOT, options.root ?? ".");
const reposRoot = path.resolve(dataRoot, options["repos-root"] ?? "customer-repos");
const registryPath = path.join(dataRoot, "ops/clients.json");
const workerMainRoot = options["worker-main"]
  ? path.resolve(ROOT, options["worker-main"])
  : path.resolve(ROOT, "../tradesstack-worker-app/tradesstack-worker-app");
const owner = options.owner ?? "tradesstack";
const provider = options.provider === "github" ? "github" : "local";
const contract = await loadContract(ROOT);

function ensureGithubRepository({ directory, fullName, description }) {
  let exists = false;
  try {
    run("gh", ["repo", "view", fullName, "--json", "name"], ROOT);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) {
    run("gh", ["repo", "create", fullName, "--private", "--description", description], ROOT);
  }
  const remotes = git(directory, ["remote"]).split("\n").filter(Boolean);
  const url = `https://github.com/${fullName}.git`;
  if (remotes.includes("origin")) run("git", ["remote", "set-url", "origin", url], directory);
  else run("git", ["remote", "add", "origin", url], directory);
  run("git", ["push", "-u", "origin", "main"], directory);
  return { fullName, created: !exists, pushed: true };
}

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
const attachWorker = options.attachWorker;
const operationRoot = path.join(dataRoot, "ops/provisioning", customerId);
const checkpointPath = path.join(operationRoot, "operation.json");
const lockPath = path.join(operationRoot, ".lock");

const registry = readJson(registryPath);
const existingClient = (registry.clients ?? []).find((client) => client.clientId === customerId);

// Inputs shared by plan and apply.
const webRelease = options["web-release"]
  ? readJson(path.join(dataRoot, "ops/releases", `${options["web-release"]}.json`))
  : latestRelease(path.join(dataRoot, "ops/releases"));
const workerRelease = options["worker-release"]
  ? readJson(path.join(workerPaths(dataRoot).releases, `${options["worker-release"]}.json`))
  : latestRelease(workerPaths(dataRoot).releases);
if (!webRelease) fail("No approved Web release found");
if (!workerRelease) fail("No approved Worker release found");

let workerProfileSource = null;
let workerProfileConfig = null;
if (options["worker-profile"]) {
  const profilePath = path.resolve(dataRoot, options["worker-profile"]);
  if (!fs.existsSync(profilePath)) fail(`Worker profile not found: ${options["worker-profile"]}`);
  try {
    workerProfileConfig = contract.defineWorkerClientConfig(readJson(profilePath));
  } catch (error) {
    fail(`Worker profile is invalid: ${error.message}`);
  }
  workerProfileSource = path.relative(dataRoot, profilePath).split(path.sep).join("/");
} else if (existingClient?.worker?.profilePath) {
  workerProfileSource = existingClient.worker.profilePath;
  workerProfileConfig = contract.defineWorkerClientConfig(readJson(path.join(dataRoot, workerProfileSource)));
} else if (attachWorker) {
  fail("--attach-worker needs an existing worker profile (ops/worker/profiles/<id>.json) or --worker-profile");
} else {
  fail("--worker-profile is required for a new customer");
}
if (workerProfileConfig.clientKey !== customerId) {
  fail(`Worker profile clientKey ${workerProfileConfig.clientKey} must equal --customer-id ${customerId}`);
}
const canonicalProfile = contract.canonicalizeWorkerClientConfig(workerProfileConfig);
const profileFingerprint = sha256Text(canonicalProfile);

const environment =
  workerProfileConfig.environment.kind === "hosted"
    ? {
        kind: "hosted",
        environmentId: workerProfileConfig.environment.environmentId,
        supabaseProjectRef: workerProfileConfig.environment.supabaseProjectRef,
      }
    : { kind: "local", environmentId: workerProfileConfig.environment.environmentId, supabaseProjectRef: null };
if (environment.kind === "hosted" && !/^[a-z0-9]{20}$/.test(environment.supabaseProjectRef)) {
  fail("A hosted customer profile needs a valid Supabase project ref");
}

const baseName = customerId.startsWith("client-") ? customerId : `client-${customerId}`;
const webRepoName = `${owner}/tradesstack-${baseName}`;
const workerRepoName = `${owner}/tradesstack-worker-${baseName}`;
const existingWebRepository = existingClient?.repositoryReference ?? null;
const webRepository = attachWorker ? existingWebRepository : `github:${webRepoName}`;
if (!webRepository) fail("Existing customer has no web repository reference; cannot attach a Worker implementation");

// Redirect desktop and build output into the workspace only.
if (provider === "local") {
  fs.mkdirSync(reposRoot, { recursive: true });
}

function loadCheckpoint() {
  return fs.existsSync(checkpointPath) ? readJson(checkpointPath) : null;
}

function stepRecord(checkpoint, id, status, detail, artifact = null) {
  const existing = checkpoint.steps.find((step) => step.id === id);
  if (existing) {
    existing.status = status;
    existing.detail = detail;
    existing.artifact = artifact ?? existing.artifact ?? null;
    existing.updatedAt = new Date().toISOString();
    if (status === "PASS") existing.finishedAt = new Date().toISOString();
  } else {
    checkpoint.steps.push({
      id,
      status,
      detail,
      artifact,
      startedAt: new Date().toISOString(),
      finishedAt: status === "PASS" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
  }
}

function saveCheckpoint(checkpoint) {
  fs.mkdirSync(operationRoot, { recursive: true });
  checkpoint.updatedAt = new Date().toISOString();
  fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

function operationInputs() {
  return {
    customerId,
    displayName: options["display-name"] ?? existingClient?.displayName ?? workerProfileConfig.identity.appName,
    attachWorker,
    provider,
    environment,
    profileFingerprint,
    webRelease: webRelease.version,
    workerRelease: workerRelease.version,
    webRepository,
    workerRepository: `github:${workerRepoName}`,
    deploymentTarget: options["deployment-target"] ?? "PENDING",
    domain: options["domain"] ?? "PENDING",
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

const plan = {
  status: options.apply ? null : "PLAN_ONLY",
  operationId,
  customerId,
  displayName: operationInputs().displayName,
  provider,
  identity: { baseName, environment, profileFingerprint },
  repositories: {
    web: { name: webRepoName, reuseExisting: Boolean(existingWebRepository), reference: webRepository },
    worker: { name: workerRepoName, reference: `github:${workerRepoName}` },
  },
  releases: {
    web: { version: webRelease.version, sourceSha: webRelease.sourceSha },
    worker: { version: workerRelease.version, sourceSha: workerRelease.sourceSha, fingerprint: workerRelease.releaseFingerprint },
  },
  externalActions: [
    { id: "create-supabase-project", status: environment.kind === "hosted" ? "REQUIRED" : "USE_LOCAL", detail: environment.supabaseProjectRef ?? "local" },
    { id: "apply-database-baseline-and-migrations", status: "REQUIRED", detail: "Approved baseline + migrations for the customer project" },
    { id: "bind-web-environment-secrets", status: "REQUIRED", detail: "Web hosting env: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SITE_URL" },
    { id: "bind-worker-build-secrets", status: "REQUIRED", detail: "EXPO_PUBLIC_SUPABASE_URL / ANON_KEY / FUNCTIONS_URL" },
    { id: "signing-and-store-listing", status: workerProfileConfig.distribution.channel === "store" ? "REQUIRED" : "NOT_REQUIRED", detail: "Owner approval required" },
    { id: "build-and-distribute", status: "REQUIRED", detail: "Web deploy + Worker build/distribution approvals" },
  ],
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
    for (const profile of fs.existsSync(workerPaths(dataRoot).profiles)
      ? fs.readdirSync(workerPaths(dataRoot).profiles).filter((file) => file.endsWith(".json"))
      : []) {
      if (profile === `${customerId}.json`) continue;
      const other = contract.defineWorkerClientConfig(readJson(path.join(workerPaths(dataRoot).profiles, profile)));
      const conflicts = contract.findWorkerIsolationConflicts(workerProfileConfig, other);
      if (conflicts.length) fail(`Customer isolation conflict with ${profile}: ${conflicts.join("; ")}`);
    }
  } else {
    for (const client of registry.clients ?? []) {
      if (client.clientId !== customerId && client.worker?.repositoryReference === `github:${workerRepoName}`) {
        fail(`Worker repository ${workerRepoName} is already registered to ${client.clientId}`);
      }
    }
  }
  completeStep("identity", `Customer ${customerId} identity validated (${environment.environmentId})`);

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
      const clientConfig = options["web-config"]
        ? readJson(path.resolve(dataRoot, options["web-config"]))
        : {
            schemaVersion: 1,
            identity: {
              clientKey: customerId,
              displayName: operationInputs().displayName,
              description: `${operationInputs().displayName} TradesStack implementation`,
            },
            theme: {
              platformColor: workerProfileConfig.branding.platformColor,
              actionColor: workerProfileConfig.branding.actionColor,
            },
            defaults: workerProfileConfig.defaults ?? {
              locale: "en-NZ",
              currency: "NZD",
              timezone: "Pacific/Auckland",
            },
          };
      const webContract = await import(path.join(ROOT, "packages/client-config/dist/index.js"));
      const validatedClientConfig = webContract.defineTradesStackClientConfig(clientConfig);
      const configDir = path.join(webDir, "client/config");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, `${customerId}.ts`),
        `import { defineTradesStackClientConfig } from "@tradesstack/client-config";\n\nexport const CLIENT_CONFIG = defineTradesStackClientConfig(${JSON.stringify(validatedClientConfig, null, 2)});\n`,
      );
      fs.writeFileSync(
        path.join(webDir, "client/CLIENT_OWNERSHIP.md"),
        `# ${operationInputs().displayName} — customer-owned web material\n\nThis directory is preserved by Web Main upgrades.\n`,
      );
      fs.writeFileSync(
        path.join(webDir, "release-manifest.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          releaseId: webRelease.releaseId,
          version: webRelease.version,
          sourceSha: webRelease.sourceSha,
          mainReleaseFingerprint: webRelease.releaseFingerprint ?? null,
          customerId,
          clientConfigFingerprint: sha256Text(JSON.stringify(validatedClientConfig)),
          files,
          fileHashes,
          databaseCompatibility: webRelease.database?.migrationTarget ?? null,
          adoptedAt: new Date().toISOString(),
          adoptedBy: "scripts/ops/customer-provision.mjs",
        }, null, 2)}\n`,
      );
      fs.rmSync(temporary, { recursive: true, force: true });
      run("git", ["add", "-A"], webDir);
      run("git", ["-c", "user.name=TradesStack Ops", "-c", "user.email=ops@tradesstack.invalid", "commit", "-m", `Initial ${operationInputs().displayName} web implementation from ${webRelease.version}`], webDir);
    }
    if (provider === "github") {
      const webFullName = webRepoName.replace(/^.*\//, `${owner}/`);
      const published = ensureGithubRepository({
        directory: webDir,
        fullName: webFullName,
        description: `${operationInputs().displayName} TradesStack web implementation`,
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
  const workerDir = path.join(reposRoot, baseName, "worker");
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
          "client/README.md": `# ${operationInputs().displayName} — customer-owned Worker material\n\nPreserved by Worker Main upgrades. Add customer screens under client/extensions and assets under client/assets.\n`,
          "client/extensions/home/index.tsx": "import type { HomeExtension } from '@/src/config/extension-host';\n\nexport const homeExtensions: HomeExtension[] = [];\n",
          "client/IMPLEMENTATION.md": `# ${operationInputs().displayName} Worker implementation\n\n- Baseline Worker Main release: ${workerRelease.version} (${workerRelease.sourceSha})\n- Environment: ${environment.environmentId} (${environment.supabaseProjectRef ?? "local"})\n- Bundle: ${workerProfileConfig.distribution.iosBundleIdentifier} / ${workerProfileConfig.distribution.androidPackage}\n`,
        },
      });
      run("git", ["add", "-A"], workerDir);
      run("git", ["-c", "user.name=TradesStack Ops", "-c", "user.email=ops@tradesstack.invalid", "commit", "-m", `Initial ${operationInputs().displayName} Worker implementation from ${workerRelease.version}`], workerDir);
    } finally {
      extracted.dispose();
    }
  }
  if (provider === "github") {
    const published = ensureGithubRepository({
      directory: workerDir,
      fullName: workerRepoName,
      description: `${operationInputs().displayName} TradesStack Worker implementation`,
    });
    checkpoint.github = { ...(checkpoint.github ?? {}), worker: published };
    saveCheckpoint(checkpoint);
  }
  completeStep("worker-repository", `Worker repository prepared at ${path.relative(dataRoot, workerDir)} from ${workerRelease.version}`, { path: path.relative(dataRoot, workerDir) });

  // 4. Backend binding ------------------------------------------------------
  completeStep(
    "backend-binding",
    `Environment ${environment.environmentId} bound to ${environment.supabaseProjectRef ?? "local"}; project creation/migrations remain external`,
  );

  // 5. Configuration --------------------------------------------------------
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
    fs.writeFileSync(profileTarget, customerProfileJson);
  }
  maybeSimulateFailure("configuration");
  completeStep("configuration", `Worker profile recorded at ${path.relative(dataRoot, profileTarget)}`, { path: path.relative(dataRoot, profileTarget) });

  // 6. Link validation ------------------------------------------------------
  const profileInRepo = readJson(path.join(workerDir, "client/worker-profile.json"));
  const repoRef = profileInRepo.environment.kind === "hosted"
    ? profileInRepo.environment.supabaseProjectRef
    : null;
  if (repoRef !== environment.supabaseProjectRef) {
    fail("Worker repository profile does not point at the customer environment");
  }
  if (environment.supabaseProjectRef === "mvxyxvrxaorzglppxzzz") {
    fail("Refusing to provision a customer against the reference/Main Supabase project");
  }
  completeStep("link-validation", `Web and Worker both resolve to ${environment.environmentId} (${environment.supabaseProjectRef ?? "local"})`);

  // 7. Registry -------------------------------------------------------------
  const provisioningRecord = path.relative(dataRoot, checkpointPath).split(path.sep).join("/");
  const workerBinding = {
    profilePath: path.relative(dataRoot, profileTarget).split(path.sep).join("/"),
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
  };
  const existingEntry = (registry.clients ?? []).find((client) => client.clientId === customerId);
  const databaseBinding = {
    baseline: webRelease.database?.baseline ?? "phase1o-1",
    migrationTarget: webRelease.database?.migrationTarget ?? null,
    status: "PENDING_APPLICATION",
  };
  const registryEntry = existingEntry
    ? {
        ...existingEntry,
        database: existingEntry.database ?? databaseBinding,
        worker: { ...(existingEntry.worker ?? {}), ...workerBinding },
        provisioning: { operationId, record: provisioningRecord, state: checkpoint.state },
      }
    : {
        clientId: customerId,
        displayName: operationInputs().displayName,
        environment: environment.kind === "hosted" ? "managed-client" : "local-development",
        lifecycleStatus: "PENDING",
        defaultBranch: "main",
        rolloutStatus: "ENABLED",
        releaseChannel: "stable",
        clientOwnedPaths: ["client/**", ".env*"],
        targetRelease: webRelease.version,
        repositoryReference: `github:${webRepoName}`,
        deploymentTarget: operationInputs().deploymentTarget,
        databaseProjectReference: `supabase:${environment.supabaseProjectRef ?? "PENDING"}`,
        runtimeReference: options["runtime-reference"] ?? "PENDING",
        domainReference: operationInputs().domain,
        releaseProvenance: { status: "PENDING_INITIAL_PROVISIONING", mainReleaseFingerprint: webRelease.releaseFingerprint ?? null },
        database: databaseBinding,
        worker: workerBinding,
        provisioning: { operationId, record: provisioningRecord, state: checkpoint.state },
      };
  const nextRegistry = existingEntry
    ? { ...registry, clients: registry.clients.map((client) => client.clientId === customerId ? registryEntry : client) }
    : { ...registry, clients: [...(registry.clients ?? []), registryEntry] };
  fs.writeFileSync(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`);
  completeStep("registry", `One registry entry joins web, worker and environment for ${customerId}`);

  // 8. CI -------------------------------------------------------------------
  const webCi = fs.existsSync(path.join(webDir, ".github/workflows"));
  const workerCi = fs.existsSync(path.join(workerDir, ".github/workflows/worker-app-ci.yml"));
  completeStep(
    "ci",
    `Web CI ${webCi ? "present" : "requires configuration"}; Worker CI ${workerCi ? "present" : "missing"}`,
  );

  // 9. Validation -----------------------------------------------------------
  const validation = [];
  if (fs.existsSync(workerDir)) {
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
  completeStep("validate", `Web/Worker configuration and vendor integrity validated`, { validation });

  // 10. Finalise ------------------------------------------------------------
  checkpoint.externalActions = plan.externalActions;
  checkpoint.state = options.activate ? "ACTIVE" : "READY_FOR_DEPLOYMENT";
  completeStep("finalise", `Customer implementation ${checkpoint.state}`);
  const finalRegistry = readJson(registryPath);
  for (const client of finalRegistry.clients ?? []) {
    if (client.clientId !== customerId) continue;
    client.provisioning = { ...(client.provisioning ?? {}), operationId, record: provisioningRecord, state: checkpoint.state };
    if (options.activate) client.lifecycleStatus = "ACTIVE";
  }
  fs.writeFileSync(registryPath, `${JSON.stringify(finalRegistry, null, 2)}\n`);
  saveCheckpoint(checkpoint);
  fs.rmSync(lockPath, { force: true });

  output({
    status: checkpoint.state,
    operationId,
    customerId,
    identity: plan.identity,
    repositories: {
      web: `github:${webRepoName}`,
      worker: `github:${workerRepoName}`,
      localDirectories: attachWorker ? null : { web: path.relative(dataRoot, webDir), worker: path.relative(dataRoot, workerDir) },
    },
    releases: plan.releases,
    externalActions: plan.externalActions.filter((action) => action.status === "REQUIRED"),
    github: checkpoint.github ?? null,
    record: path.relative(dataRoot, checkpointPath),
    note: "Migrations, secrets, deployment and distribution remain external actions.",
  });
} catch (error) {
  stepRecord(checkpoint, "finalise", "FAILED_RETRYABLE", String(error.message).slice(0, 300));
  checkpoint.state = "PARTIALLY_PROVISIONED";
  checkpoint.errors.push({ message: String(error.message), at: new Date().toISOString() });
  saveCheckpoint(checkpoint);
  fs.rmSync(lockPath, { force: true });
  output({ status: "PARTIALLY_PROVISIONED", reason: String(error.message), record: path.relative(dataRoot, checkpointPath) }, 1);
}
