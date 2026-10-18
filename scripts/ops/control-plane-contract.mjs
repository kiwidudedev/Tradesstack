import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, compareSemver, fingerprint, readJson, scanJsonForSecrets, semver, sha } from "./lib.mjs";

export const CONTRACT_SCHEMA_VERSION = 1;
export const VERIFICATION_STATES = ["VERIFIED", "NOT_VERIFIED", "UNKNOWN", "STALE", "BLOCKED", "ERROR"];
export const FRESHNESS_STATES = ["CURRENT", "STALE", "UNKNOWN"];
export const LIFECYCLE_STATES = ["FICTIONAL_LOCAL_UNPROVISIONED", "NOT_PROVISIONED", "PENDING", "ACTIVE", "SUSPENDED", "OFFBOARDING", "OFFBOARDED"];
export const DIFFERENCE_CATEGORIES = ["CONFIGURATION", "BRANDING", "TEMPLATE", "WORKFLOW", "PERMISSIONS", "INTEGRATION", "AI", "MODULE", "EXTENSION", "SOURCE", "DATABASE", "MIGRATION", "OPERATIONS", "LIMITATION", "TEMPORARY_PATCH"];
export const DIFFERENCE_STATUSES = ["ACTIVE", "REMOVED", "RECONCILED"];
export const DIFFERENCE_KINDS = ["CONFIGURATION_DIFFERENCE", "APPROVED_CUSTOMER_EXTENSION", "TEMPORARY_CUSTOMER_PATCH", "REUSABLE_MAIN_CANDIDATE", "EXPECTED_ENVIRONMENT_DIFFERENCE"];

function evidence(source, verification, observedAt = null, freshness = "UNKNOWN", evidenceType = "REPOSITORY_RECORD") {
  return { source, observedAt, verification, freshness, evidenceType };
}

function fact(value, classification, source, verification = "VERIFIED", observedAt = null, freshness = "UNKNOWN", evidenceType = "REPOSITORY_RECORD") {
  return { value, classification, evidence: evidence(source, verification, observedAt, freshness, evidenceType) };
}

function readOptional(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function recordedProvider(provider, projectRef, productionUrl, deploymentId, recordedAt, source) {
  return {
    provider,
    projectRef: projectRef ?? null,
    productionUrl: productionUrl ?? null,
    recordedDeploymentId: deploymentId ?? null,
    recordedAt: recordedAt ?? null,
    verification: "NOT_VERIFIED",
    freshness: "UNKNOWN",
    evidence: evidence(source, "NOT_VERIFIED", recordedAt ?? null, "UNKNOWN", "HISTORICAL_RECORD"),
  };
}

function emptyObserved(value = null) {
  return fact(value, "OBSERVED", "NOT_AVAILABLE_FROM_REPOSITORY", "NOT_VERIFIED", null, "UNKNOWN", "RUNTIME_STATE");
}

function customerRecord(client, release, commissioning, hardening, differences, mainHead) {
  const registrySource = "ops/clients.json";
  const releaseSource = `ops/releases/${release.version}.json`;
  const commissioningSource = "ops/commissioning/client-alpha.json";
  const hardeningSource = "ops/hardening/client-alpha.json";
  const commissionProv = commissioning?.releaseProvenance ?? {};
  const hardeningInfra = hardening?.infrastructure ?? {};
  const recordedDeploymentId = client.releaseProvenance?.deploymentId ?? hardeningInfra.lastRecordedDeployment ?? commissionProv.deploymentId ?? null;
  const recordedRepositorySha = client.releaseProvenance?.repositorySha ?? hardeningInfra.lastRecordedRepositorySha ?? commissionProv.deployedRepositorySha ?? null;
  const historicalSha = commissionProv.deployedRepositorySha ?? client.releaseProvenance?.repositorySha ?? null;
  const historicalDeployment = commissionProv.deploymentId ?? client.releaseProvenance?.deploymentId ?? null;

  return {
    customerId: client.clientId,
    displayName: client.displayName,
    lifecycle: fact(client.lifecycleStatus, "MANUAL", registrySource, "VERIFIED", null, "UNKNOWN"),
    repository: {
      reference: fact(client.repositoryReference ?? null, "PROVIDER_REFERENCE", registrySource, "VERIFIED"),
      defaultBranch: fact(client.defaultBranch ?? null, "MANUAL", registrySource, "VERIFIED"),
      expectedMainSourceSha: fact(release.sourceSha, "EXPECTED", releaseSource, "VERIFIED"),
      observedCustomerSha: emptyObserved(),
      lastRecordedCustomerSha: fact(recordedRepositorySha, "HISTORICAL", hardening ? hardeningSource : registrySource, "NOT_VERIFIED", hardening?.capturedAt ?? null, "STALE", "HISTORICAL_RECORD"),
      historicalCommissionedSha: fact(historicalSha, "HISTORICAL", commissioningSource, "VERIFIED", commissioning?.capturedAt ?? null, "STALE", "HISTORICAL_RECORD"),
    },
    release: {
      currentMainHead: fact(mainHead, "OBSERVED", "git:HEAD", mainHead ? "VERIFIED" : "UNKNOWN", null, mainHead ? "CURRENT" : "UNKNOWN", "REPOSITORY_STATE"),
      approvedMainRelease: fact(release.releaseId, "EXPECTED", releaseSource, "VERIFIED"),
      approvedMainVersion: fact(release.version, "EXPECTED", releaseSource, "VERIFIED"),
      approvedMainLabel: fact(release.displayLabel, "EXPECTED", releaseSource, "VERIFIED"),
      approvedMainSourceSha: fact(release.sourceSha, "EXPECTED", releaseSource, "VERIFIED"),
      customerTargetRelease: fact(client.targetRelease ?? null, "EXPECTED", registrySource, "VERIFIED"),
      currentCustomerVersion: fact(client.targetRelease ?? null, "OBSERVED", registrySource, "VERIFIED"),
      recordedCustomerRelease: fact(client.releaseProvenance?.applicationShellRelease ?? client.targetRelease ?? commissionProv.applicationShellRelease ?? null, "HISTORICAL", registrySource, "VERIFIED", null, "CURRENT", "REPOSITORY_RECORD"),
      updateAvailable: fact(semver(client.targetRelease) && compareSemver(client.targetRelease, release.version) < 0, "DERIVED", "scripts/ops/control-plane-contract.mjs", "VERIFIED"),
    },
    migration: {
      expectedMigrationTarget: fact(release.database?.migrationTarget ?? null, "EXPECTED", releaseSource, "VERIFIED"),
      observedMigrationState: emptyObserved(),
      recordedMigrationState: fact(client.database?.migrationLedger ?? commissioning?.resources?.supabase?.migrationLedger ?? null, "HISTORICAL", client.database ? registrySource : commissioningSource, "NOT_VERIFIED", commissioning?.capturedAt ?? null, "STALE", "HISTORICAL_RECORD"),
    },
    configuration: {
      contract: fact(release.clientConfig?.contract ?? null, "EXPECTED", releaseSource, "VERIFIED"),
      recordedFingerprint: fact(client.releaseProvenance?.clientConfigFingerprint ?? commissionProv.clientConfigFingerprint ?? hardening?.clientConfigFingerprint ?? null, "MANUAL", hardening ? hardeningSource : registrySource, "NOT_VERIFIED", hardening?.capturedAt ?? commissioning?.capturedAt ?? null, "UNKNOWN", "RECORDED_METADATA"),
      scope: "Validated client-config contract metadata; not customer database/business configuration.",
    },
    deployment: {
      vercel: recordedProvider("vercel", client.runtimeReference ?? client.deploymentTarget ?? hardeningInfra.runtime, client.domainReference ?? hardeningInfra.productionUrl, recordedDeploymentId, hardening?.capturedAt ?? commissioning?.capturedAt ?? null, hardening ? hardeningSource : registrySource),
      historicalCommissioningDeployment: fact(historicalDeployment, "HISTORICAL", commissioningSource, "VERIFIED", commissioning?.capturedAt ?? null, "STALE", "HISTORICAL_RECORD"),
      currentProduction: emptyObserved(),
    },
    providers: {
      supabase: recordedProvider("supabase", client.databaseProjectReference ?? hardeningInfra.database, null, null, commissioning?.capturedAt ?? null, commissioning ? commissioningSource : registrySource),
    },
    differences: {
      source: "ops/differences/${client.clientId}.json",
      records: differences,
      unexpectedDrift: "DELEGATED_TO_EXISTING_RELEASE_PROVENANCE_TOOLING",
    },
    backup: fact(hardening?.recovery ?? null, "HISTORICAL", hardeningSource, "NOT_VERIFIED", hardening?.capturedAt ?? null, "STALE", "HISTORICAL_RECORD"),
    health: fact(hardening?.evidence ?? null, "HISTORICAL", hardeningSource, "NOT_VERIFIED", hardening?.capturedAt ?? null, "STALE", "HISTORICAL_RECORD"),
    upgrade: {
      targetRelease: fact(client.targetRelease ?? null, "EXPECTED", registrySource, "VERIFIED"),
      status: fact("NOT_APPLIED_BY_THIS_CONTRACT", "DERIVED", "scripts/ops/promote-release.mjs", "VERIFIED"),
    },
    worker: workerCustomerRecord(client, { releases: [], profiles: new Map() }),
  };
}


/* -------------------------------------------------------------------------- */
/* Worker App facts                                                           */
/* -------------------------------------------------------------------------- */

function readWorkerArtifacts(root) {
  const directory = path.join(root, "ops/worker");
  if (!fs.existsSync(directory)) return { releases: [], profiles: new Map() };
  const releaseDirectory = path.join(directory, "releases");
  const releases = fs.existsSync(releaseDirectory)
    ? fs.readdirSync(releaseDirectory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => ({ file, value: readJson(path.join(releaseDirectory, file)) }))
      .filter(({ value }) => value.releaseType === "OFFICIAL" && semver(value.version))
      .sort((left, right) => compareSemver(right.value.version, left.value.version))
    : [];
  const profileDirectory = path.join(directory, "profiles");
  const profiles = new Map(
    fs.existsSync(profileDirectory)
      ? fs.readdirSync(profileDirectory)
        .filter((file) => file.endsWith(".json"))
        .map((file) => [`ops/worker/profiles/${file}`, readJson(path.join(profileDirectory, file))])
      : [],
  );
  return { releases, profiles };
}

function workerCustomerRecord(client, artifacts) {
  const binding = client.worker ?? null;
  const source = "ops/clients.json";
  if (!binding) {
    return {
      configuration: fact("NO_WORKER_BINDING", "DERIVED", source, "VERIFIED"),
      distribution: fact("NOT_PROVISIONED", "DERIVED", source, "VERIFIED"),
      note: "This customer has no dedicated Worker App implementation recorded.",
    };
  }
  const release = artifacts.releases.find(({ value }) => value.version === binding.targetWorkerRelease)?.value ?? null;
  const profile = artifacts.profiles.get(binding.profilePath) ?? null;
  const latest = artifacts.releases[0]?.value ?? null;
  const enabledModules = profile
    ? Object.entries(profile.modules ?? {}).filter(([, enabled]) => enabled === true).map(([module]) => module)
    : [];
  const enabledFeatures = profile
    ? Object.entries(profile.features ?? {}).filter(([, enabled]) => enabled === true).map(([feature]) => feature)
    : [];
  const enabledExtensions = profile
    ? Object.entries(profile.extensions ?? {}).filter(([, extension]) => extension?.enabled === true).map(([extension]) => extension)
    : [];
  const unsupported = release && profile
    ? [
        ...enabledModules.filter((module) => !release.capabilities.modules.includes(module)).map((module) => `module:${module}`),
        ...enabledFeatures.filter((feature) => !release.capabilities.features.includes(feature)).map((feature) => `feature:${feature}`),
        ...enabledExtensions.filter((extension) => !release.capabilities.extensions.includes(extension)).map((extension) => `extension:${extension}`),
        ...((profile.navigation?.tabs ?? []).filter((tab) => !release.capabilities.tabs.includes(tab)).map((tab) => `tab:${tab}`)),
      ]
    : ["missing-release-or-profile"];
  const minimumWeb = release?.compatibility?.minimumMainRelease ?? null;
  const webCompatible = semver(client.targetRelease) && minimumWeb && compareSemver(client.targetRelease, minimumWeb) >= 0;
  const databaseFloor = release?.compatibility?.databaseMigrationFloor ?? null;
  const databaseCompatible = typeof client.database?.migrationTarget === "string"
    && databaseFloor
    && client.database.migrationTarget >= databaseFloor;
  const profileFingerprintMatches = Boolean(profile && binding.profileFingerprint)
    && typeof binding.profileFingerprint === "string";
  const compatible = Boolean(release && profile && unsupported.length === 0 && webCompatible && databaseCompatible);
  return {
    release: fact(binding.targetWorkerRelease ?? null, "EXPECTED", source, "VERIFIED"),
    latestRelease: fact(latest?.version ?? null, "EXPECTED", "ops/worker/releases", "VERIFIED"),
    releaseFingerprint: fact(release?.releaseFingerprint ?? null, "EXPECTED", `ops/worker/releases/${binding.targetWorkerRelease}.json`, release ? "VERIFIED" : "UNKNOWN"),
    releaseSourceSha: fact(release?.sourceSha ?? null, "EXPECTED", `ops/worker/releases/${binding.targetWorkerRelease}.json`, release ? "VERIFIED" : "UNKNOWN"),
    upgradeAvailable: fact(
      Boolean(latest && semver(binding.targetWorkerRelease) && compareSemver(latest.version, binding.targetWorkerRelease) > 0),
      "DERIVED",
      "scripts/ops/control-plane-contract.mjs",
      "VERIFIED",
    ),
    profile: fact(binding.profilePath ?? null, "MANUAL", source, "VERIFIED"),
    profileFingerprint: fact(binding.profileFingerprint ?? null, "EXPECTED", source, "VERIFIED"),
    recordedProfileFingerprint: fact(profile ? binding.profileFingerprint : null, "HISTORICAL", source, "NOT_VERIFIED", null, "UNKNOWN", "RECORDED_METADATA"),
    profileFingerprintRecorded: fact(profileFingerprintMatches, "DERIVED", source, "VERIFIED"),
    environmentId: fact(profile?.environment?.environmentId ?? null, "EXPECTED", binding.profilePath, profile ? "VERIFIED" : "UNKNOWN"),
    environmentKind: fact(profile?.environment?.kind ?? null, "EXPECTED", binding.profilePath, profile ? "VERIFIED" : "UNKNOWN"),
    distributionChannel: fact(profile?.distribution?.channel ?? binding.distributionChannel ?? null, "EXPECTED", binding.profilePath, profile ? "VERIFIED" : "UNKNOWN"),
    bundleIdentifiers: fact(
      profile
        ? { ios: profile.distribution.iosBundleIdentifier, android: profile.distribution.androidPackage }
        : null,
      "EXPECTED",
      binding.profilePath,
      profile ? "VERIFIED" : "UNKNOWN",
    ),
    enabledCustomisations: fact({ modules: enabledModules, features: enabledFeatures, extensions: enabledExtensions }, "MANUAL", binding.profilePath, profile ? "VERIFIED" : "UNKNOWN"),
    compatibility: fact(compatible ? "COMPATIBLE" : "BLOCKED", "DERIVED", "scripts/ops/control-plane-contract.mjs", "VERIFIED"),
    compatibilityReasons: fact(unsupported, "DERIVED", "scripts/ops/control-plane-contract.mjs", "VERIFIED"),
    databaseFloor: fact(
      databaseFloor && client.database?.migrationTarget
        ? { floor: databaseFloor, customer: client.database.migrationTarget }
        : null,
      "EXPECTED",
      "ops/worker/releases",
      databaseFloor ? "VERIFIED" : "UNKNOWN",
    ),
    upgradeRecord: fact(binding.lastUpgrade?.record ?? null, "HISTORICAL", source, "VERIFIED", null, "UNKNOWN", "RECORDED_METADATA"),
    provisioningRecord: fact(binding.provisioningRecord ?? null, "HISTORICAL", source, "VERIFIED", null, "UNKNOWN", "RECORDED_METADATA"),
    distributionModel: fact(
      "DEDICATED_WHITE_LABEL_BUILD_PER_CUSTOMER",
      "DERIVED",
      "docs/architecture/TRADESSTACK_WORKER_APP_ARCHITECTURE.md",
      "VERIFIED",
    ),
    storePublishState: fact("NOT_APPROVED_BY_THIS_CONTRACT", "DERIVED", "scripts/ops/worker-release.mjs", "VERIFIED"),
    note: "Worker App facts are repository-recorded. No mobile build, store submission or device validation is claimed.",
  };
}

export function assembleOperationalContract({ root = ROOT } = {}) {
  const registry = readJson(path.join(root, "ops/clients.json"));
  const artifacts = readWorkerArtifacts(root);
  const releaseFiles = fs.readdirSync(path.join(root, "ops/releases")).filter((file) => file.endsWith(".json")).sort();
  const releases = releaseFiles.map((file) => ({ file, value: readJson(path.join(root, "ops/releases", file)) })).filter(({ value }) => value.releaseType === "OFFICIAL" && semver(value.version));
  const releaseById = new Map(releases.map(({ value }) => [value.releaseId, value]));
  const commissioningDir = path.join(root, "ops/commissioning");
  const hardeningDir = path.join(root, "ops/hardening");
  const registeredClientIds = new Set((registry.clients ?? []).map((client) => client.clientId));
  const differenceRoot = path.join(root, "ops/differences");
  const orphanDifferenceFiles = fs.existsSync(differenceRoot)
    ? fs.readdirSync(differenceRoot).filter((file) => file.endsWith(".json") && !registeredClientIds.has(file.replace(/\.json$/, ""))).sort()
    : [];
  const customers = (registry.clients ?? []).map((client) => {
    const release = releaseById.get(client.targetRelease) ?? releases[0]?.value;
    const commissioning = readOptional(path.join(commissioningDir, `${client.clientId}.json`));
    const hardening = readOptional(path.join(hardeningDir, `${client.clientId}.json`));
    const differenceFile = path.join(root, "ops/differences", `${client.clientId}.json`);
    const differences = readOptional(differenceFile)?.differences ?? [];
    const record = customerRecord(client, release, commissioning, hardening, differences, root === ROOT ? gitHead() : null);
    return { ...record, worker: workerCustomerRecord(client, artifacts) };
  });
  const contract = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    contract: "tradesstack-owner-operational",
    contractSemantics: {
      verification: VERIFICATION_STATES,
      freshness: FRESHNESS_STATES,
      freshnessPolicy: "Observation age is recorded; no global age threshold is assumed by Main.",
      providerState: "Provider-backed fields remain NOT_VERIFIED unless a live provider observation is supplied.",
      lifecycle: "Lifecycle metadata does not execute infrastructure actions.",
    },
    main: {
      currentHead: fact(root === ROOT ? gitHead() : null, "OBSERVED", "git:HEAD", root === ROOT ? "VERIFIED" : "UNKNOWN", null, root === ROOT ? "CURRENT" : "UNKNOWN", "REPOSITORY_STATE"),
      latestApprovedVersion: fact(releases.sort((left, right) => compareSemver(right.value.version, left.value.version))[0]?.value.version ?? null, "EXPECTED", "ops/releases", "VERIFIED"),
      latestApprovedLabel: fact(releases[0]?.value.displayLabel ?? null, "EXPECTED", "ops/releases", "VERIFIED"),
      releaseSources: releases.map(({ file, value }) => ({ releaseId: value.releaseId, source: `ops/releases/${file}`, sourceSha: value.sourceSha })),
      workerReleases: artifacts.releases.map(({ file, value }) => ({
        releaseId: value.releaseId,
        source: `ops/worker/releases/${file}`,
        sourceSha: value.sourceSha,
        fingerprint: value.releaseFingerprint,
        mobileApiContractVersion: value.compatibility?.mobileApiContractVersion ?? null,
        minimumMainRelease: value.compatibility?.minimumMainRelease ?? null,
        databaseMigrationFloor: value.compatibility?.databaseMigrationFloor ?? null,
      })),
    },
    orphanDifferenceFiles,
    customers,
  };
  return contract;
}

function validShaOrNull(value) {
  return value === null || value === undefined || sha(value);
}

export function validateOperationalContract(contract) {
  const errors = [];
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return ["contract must be an object"];
  if (contract.schemaVersion !== CONTRACT_SCHEMA_VERSION) errors.push("unsupported schemaVersion");
  if (contract.contract !== "tradesstack-owner-operational") errors.push("invalid contract name");
  const customers = Array.isArray(contract.customers) ? contract.customers : [];
  if (!Array.isArray(contract.customers)) errors.push("customers must be an array");
  const customerIds = new Set();
  const differenceIds = new Set();
  for (const [index, customer] of customers.entries()) {
    const prefix = `customers[${index}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(customer?.customerId ?? "")) errors.push(`${prefix}.customerId invalid`);
    if (customerIds.has(customer.customerId)) errors.push(`duplicate customerId ${customer.customerId}`);
    customerIds.add(customer.customerId);
    if (!LIFECYCLE_STATES.includes(customer?.lifecycle?.value)) errors.push(`${prefix}.lifecycle invalid`);
    for (const field of ["lifecycle", "repository", "release", "migration", "configuration", "deployment", "providers", "differences", "backup", "health", "upgrade"]) {
      if (!customer || typeof customer[field] !== "object") errors.push(`${prefix}.${field} missing`);
    }
    if (customer?.worker !== undefined) {
      if (!customer.worker || typeof customer.worker !== "object") {
        errors.push(`${prefix}.worker must be an object`);
      } else if (customer.worker.compatibility) {
        const state = customer.worker.compatibility.value;
        if (!["COMPATIBLE", "BLOCKED", "UNKNOWN"].includes(state)) errors.push(`${prefix}.worker.compatibility invalid`);
        if (customer.worker.release?.value && !semver(customer.worker.release.value)) errors.push(`${prefix}.worker.release invalid`);
        if (customer.worker.releaseFingerprint?.value && !fingerprint(customer.worker.releaseFingerprint.value)) {
          errors.push(`${prefix}.worker.releaseFingerprint invalid`);
        }
        if (customer.worker.profileFingerprint?.value && !fingerprint(customer.worker.profileFingerprint.value)) {
          errors.push(`${prefix}.worker.profileFingerprint invalid`);
        }
        if (customer.worker.upgradeAvailable && typeof customer.worker.upgradeAvailable.value !== "boolean") {
          errors.push(`${prefix}.worker.upgradeAvailable invalid`);
        }
      }
    }
    const shaFields = [customer?.repository?.expectedMainSourceSha?.value, customer?.repository?.observedCustomerSha?.value, customer?.repository?.lastRecordedCustomerSha?.value, customer?.repository?.historicalCommissionedSha?.value, customer?.release?.approvedMainSourceSha?.value];
    shaFields.forEach((value) => { if (!validShaOrNull(value)) errors.push(`${prefix} contains malformed SHA`); });
    const inspectEvidence = (value, location) => {
      if (!value || typeof value !== "object") return;
      if (value.evidence && (!VERIFICATION_STATES.includes(value.evidence.verification) || !FRESHNESS_STATES.includes(value.evidence.freshness))) errors.push(`${location}.evidence invalid`);
      for (const [key, child] of Object.entries(value)) inspectEvidence(child, `${location}.${key}`);
    };
    inspectEvidence(customer, prefix);
    const records = customer?.differences?.records;
    if (!Array.isArray(records)) errors.push(`${prefix}.differences.records must be an array`);
    for (const [differenceIndex, difference] of (records ?? []).entries()) {
      const differencePrefix = `${prefix}.differences.records[${differenceIndex}]`;
      if (!/^DIFF-[A-Z0-9-]+$/.test(difference?.differenceId ?? "")) errors.push(`${differencePrefix}.differenceId invalid`);
      if (differenceIds.has(difference.differenceId)) errors.push(`duplicate differenceId ${difference.differenceId}`);
      differenceIds.add(difference.differenceId);
      if (difference.customerId !== customer.customerId) errors.push(`${differencePrefix}.customerId does not match customer`);
      if (!DIFFERENCE_CATEGORIES.includes(difference?.category)) errors.push(`${differencePrefix}.category invalid`);
      if (!DIFFERENCE_STATUSES.includes(difference?.status)) errors.push(`${differencePrefix}.status invalid`);
      if (difference.kind !== undefined && !DIFFERENCE_KINDS.includes(difference.kind)) errors.push(`${differencePrefix}.kind invalid`);
    }
  }
  for (const file of contract.orphanDifferenceFiles ?? []) errors.push(`difference file belongs to unknown customer: ${file}`);
  const secretFindings = scanJsonForSecrets(contract);
  if (secretFindings.length) errors.push(`secret-like value at ${secretFindings[0]}`);
  return [...new Set(errors)];
}
