import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, readJson, scanJsonForSecrets, sha } from "./lib.mjs";

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
  const releaseSource = "ops/releases/0.0.0-phase1v.local.json";
  const commissioningSource = "ops/commissioning/client-alpha.json";
  const hardeningSource = "ops/hardening/client-alpha.json";
  const commissionProv = commissioning?.releaseProvenance ?? {};
  const hardeningInfra = hardening?.infrastructure ?? {};
  const recordedDeploymentId = hardeningInfra.lastRecordedDeployment ?? client.releaseProvenance?.deploymentId ?? commissionProv.deploymentId ?? null;
  const recordedRepositorySha = hardeningInfra.lastRecordedRepositorySha ?? client.releaseProvenance?.repositorySha ?? commissionProv.deployedRepositorySha ?? null;
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
      approvedMainSourceSha: fact(release.sourceSha, "EXPECTED", releaseSource, "VERIFIED"),
      customerTargetRelease: fact(client.targetRelease ?? null, "EXPECTED", registrySource, "VERIFIED"),
      recordedCustomerRelease: fact(commissionProv.applicationShellRelease ?? client.releaseProvenance?.applicationShellRelease ?? null, "HISTORICAL", commissioningSource, "VERIFIED", commissioning?.capturedAt ?? null, "STALE", "HISTORICAL_RECORD"),
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
  };
}

export function assembleOperationalContract({ root = ROOT } = {}) {
  const registry = readJson(path.join(root, "ops/clients.json"));
  const releaseFiles = fs.readdirSync(path.join(root, "ops/releases")).filter((file) => file.endsWith(".json")).sort();
  const releases = releaseFiles.map((file) => ({ file, value: readJson(path.join(root, "ops/releases", file)) }));
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
    return customerRecord(client, release, commissioning, hardening, differences, root === ROOT ? gitHead() : null);
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
      releaseSources: releases.map(({ file, value }) => ({ releaseId: value.releaseId, source: `ops/releases/${file}`, sourceSha: value.sourceSha })),
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
