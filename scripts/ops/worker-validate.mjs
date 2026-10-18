#!/usr/bin/env node
/**
 * Validate the Worker App control plane in TradesStack Main.
 *
 * Checks:
 *   - the Worker product version pointer is current and immutable-release based;
 *   - every official Worker release manifest is valid and self-consistent;
 *   - every customer Worker profile is valid and isolated from other customers;
 *   - every customer Worker binding resolves, is compatible with its web
 *     release and database target, and records the current profile fingerprint.
 *
 * This is metadata validation only. It does not contact any provider, build a
 * mobile application or deploy anything.
 *
 * Usage:
 *   node scripts/ops/worker-validate.mjs [--json] [--worker-root <path>]
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, compareSemver, readJson, result, printResult, semver } from "./lib.mjs";
import {
  checkWorkerCompatibility,
  latestWorkerRelease,
  listWorkerProfiles,
  loadContract,
  loadWorkerProduct,
  loadWorkerReleases,
  resolveClientWorker,
  validateProfileIsolation,
  validateRegistryWorkerBindings,
  validateWorkerProductVersion,
  validateWorkerReleaseManifest,
  workerPaths,
} from "./worker-contract.mjs";

const options = { json: false };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--json") options.json = true;
  else if (argument.startsWith("--")) options[argument.slice(2)] = process.argv[++index];
}

const contract = await loadContract(ROOT);
const registry = readJson(path.join(ROOT, "ops/clients.json"));
const paths = workerPaths(ROOT);
const releases = loadWorkerReleases(ROOT);
const product = loadWorkerProduct(ROOT);
const profiles = listWorkerProfiles(ROOT, contract);
const errors = [];
const details = [];

/* Product version ---------------------------------------------------------- */
const productErrors = validateWorkerProductVersion(
  product.value,
  releases,
  product.value ? path.resolve(ROOT, product.value.releaseManifest) : null,
);
errors.push(...productErrors.map((error) => `product-version: ${error}`));
{
  const latest = latestWorkerRelease(ROOT);
  if (latest) {
    details.push(`worker release ${latest.value.version} (${latest.value.releaseFingerprint.slice(0, 12)}…)`);
    details.push(
      `compatibility: web >= ${latest.value.compatibility.minimumMainRelease}, database >= ${latest.value.compatibility.databaseMigrationFloor}, mobile API contract v${latest.value.compatibility.mobileApiContractVersion}`,
    );
  } else {
    errors.push("worker: no official Worker release manifest exists");
  }
}

/* Releases ---------------------------------------------------------------- */
for (const release of releases) {
  const releaseErrors = validateWorkerReleaseManifest(release.value, { root: ROOT, contract });
  errors.push(...releaseErrors.map((error) => `${release.relativePath}: ${error}`));
}
const versions = new Set();
for (const release of releases) {
  if (versions.has(release.value.version)) errors.push(`duplicate Worker release ${release.value.version}`);
  versions.add(release.value.version);
  if (release.value.previousRelease !== null) {
    const previous = releases.find(({ value }) => value.version === release.value.previousRelease);
    if (!previous) errors.push(`${release.relativePath}: previousRelease ${release.value.previousRelease} does not exist`);
    else if (compareSemver(previous.value.version, release.value.version) >= 0) {
      errors.push(`${release.relativePath}: previousRelease must be older than the release`);
    }
  }
}
details.push(`worker releases ${releases.length}; profiles ${profiles.length}`);

/* Profiles ---------------------------------------------------------------- */
for (const profile of profiles) {
  for (const error of profile.errors) errors.push(error);
}
errors.push(...validateProfileIsolation(profiles, contract));

/* Registry bindings ------------------------------------------------------- */
errors.push(...validateRegistryWorkerBindings(registry, { root: ROOT, contract, releases, profiles }));

const bindings = [];
for (const client of registry.clients ?? []) {
  if (!client.worker) continue;
  const { profile, release } = resolveClientWorker(client, { root: ROOT, contract, releases, profiles });
  let mainRelease = null;
  const mainReleaseFile = path.join(ROOT, "ops/releases", `${client.targetRelease}.json`);
  if (semver(client.targetRelease) && fs.existsSync(mainReleaseFile)) mainRelease = readJson(mainReleaseFile);
  const compatibility = checkWorkerCompatibility({
    client,
    profile,
    workerRelease: release,
    mainRelease,
    contract,
  });
  if (compatibility.status !== "COMPATIBLE") {
    errors.push(`${client.clientId}: worker compatibility BLOCKED — ${compatibility.errors.join("; ")}`);
  }
  const latest = latestWorkerRelease(ROOT);
  bindings.push({
    clientId: client.clientId,
    targetWorkerRelease: client.worker.targetWorkerRelease,
    latestWorkerRelease: latest?.value.version ?? null,
    upgradeAvailable: Boolean(
      latest && client.worker.targetWorkerRelease
      && compareSemver(latest.value.version, client.worker.targetWorkerRelease) > 0,
    ),
    profile: profile?.relativePath ?? null,
    profileFingerprint: profile?.fingerprint ?? null,
    compatibility: compatibility.status,
    checks: compatibility.checks,
  });
}
details.push(`customer Worker bindings ${bindings.length}`);

const workerRoot = options["worker-root"] ? path.resolve(ROOT, options["worker-root"]) : null;
if (workerRoot) {
  if (!fs.existsSync(path.join(workerRoot, ".git"))) {
    errors.push(`worker-root is not a Git repository: ${workerRoot}`);
  } else {
    details.push("worker-root supplied for optional release verification (see worker-release.mjs --verify)");
  }
}

// Artifact lifecycle records: a pin never substitutes for a build proof.
const distributionRoot = path.join(paths.directory, "distribution");
const artifactStates = [];
if (fs.existsSync(distributionRoot)) {
  for (const file of fs.readdirSync(distributionRoot).filter((name) => name.endsWith(".json"))) {
    const record = readJson(path.join(distributionRoot, file));
    const clientId = file.replace(/\.json$/, "");
    if (!(registry.clients ?? []).some((client) => client.clientId === clientId)) {
      errors.push(`distribution record belongs to unknown client: ${clientId}`);
      continue;
    }
    const seen = { BUILT: false, DISTRIBUTED: false, INSTALLED: false };
    for (const event of record.events ?? []) {
      if (!semver(event.release)) errors.push(`${clientId}: artifact event has invalid release ${event.release}`);
      if (!fs.existsSync(path.join(paths.releases, `${event.release}.json`))) {
        errors.push(`${clientId}: artifact event references unknown release ${event.release}`);
      }
      if (event.stage !== "BUILT" && !seen.BUILT) {
        errors.push(`${clientId}: ${event.stage} recorded before BUILT`);
      }
      if (event.stage === "INSTALLED" && !seen.DISTRIBUTED && !String(event.channel ?? "").startsWith("local")) {
        errors.push(`${clientId}: INSTALLED recorded before DISTRIBUTED`);
      }
      seen[event.stage] = true;
    }
    artifactStates.push({
      clientId,
      target: (registry.clients ?? []).find((client) => client.clientId === clientId)?.worker?.targetWorkerRelease ?? null,
      artifactState: record.artifactState ?? null,
      events: (record.events ?? []).length,
    });
  }
}
if (artifactStates.length) details.push(`artifact lifecycle records ${artifactStates.length}`);

const payload = result("Worker App control plane", errors.length === 0, [...details, ...errors]);
if (options.json) {
  console.log(JSON.stringify({ ...payload, bindings, artifactStates, product: product.value, releases: releases.length, profiles: profiles.length }, null, 2));
  process.exitCode = payload.pass ? 0 : 1;
} else {
  if (bindings.length) {
    console.log("Customer Worker bindings:");
    for (const binding of bindings) {
      console.log(
        `  - ${binding.clientId}: worker ${binding.targetWorkerRelease} (latest ${binding.latestWorkerRelease}) ${binding.compatibility}${binding.upgradeAvailable ? " — upgrade available" : ""}`,
      );
    }
  }
  process.exitCode = printResult(payload);
}
