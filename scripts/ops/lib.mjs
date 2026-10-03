import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
export const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /(?:sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{12,})/,
  /(?:service_role|access_token|refresh_token|client_secret)\s*[:=]\s*[^\s,}"']+/i,
  /(?:postgres(?:ql)?:\/\/|mongodb(?:\+srv)?:\/\/)[^\s/]+:[^\s@]+@/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function secretLike(value) {
  if (typeof value !== "string") return false;
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function scanJsonForSecrets(value, location = "$", findings = []) {
  if (typeof value === "string") {
    if (secretLike(value)) findings.push(location);
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanJsonForSecrets(item, `${location}[${index}]`, findings));
    return findings;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) scanJsonForSecrets(item, `${location}.${key}`, findings);
  }
  return findings;
}

export function sha(value) {
  return /^[0-9a-f]{40}$/i.test(value);
}

export function fingerprint(value) {
  return /^[0-9a-f]{64}$/i.test(value);
}

export function migrationName(value) {
  return /^\d{14}_[a-z0-9_]+\.sql$/.test(value);
}

export function validateReleaseManifest(manifest) {
  const errors = [];
  const required = ["schemaVersion", "releaseId", "sourceSha", "applicationShell", "database", "clientConfig", "toolchain", "validation", "approval"];
  for (const field of required) if (!(field in manifest)) errors.push(`missing ${field}`);
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof manifest.releaseId !== "string" || !manifest.releaseId) errors.push("releaseId must be non-empty");
  if (!sha(manifest.sourceSha)) errors.push("sourceSha must be a 40-character SHA-1");
  if (!manifest.applicationShell || typeof manifest.applicationShell.releaseId !== "string") errors.push("applicationShell.releaseId missing");
  if (!manifest.applicationShell || !fingerprint(manifest.applicationShell.fingerprint)) errors.push("applicationShell.fingerprint must be SHA-256");
  if (manifest.releaseFingerprint !== undefined && !fingerprint(manifest.releaseFingerprint)) errors.push("releaseFingerprint must be SHA-256 when present");
  if (!manifest.database || manifest.database.baseline !== "phase1o-1") errors.push("database.baseline must be phase1o-1");
  if (!manifest.database || !migrationName(manifest.database.migrationTarget)) errors.push("database.migrationTarget must be a migration filename");
  if (!manifest.clientConfig || manifest.clientConfig.contract !== "@tradesstack/client-config@0.0.0") errors.push("clientConfig.contract is not the known contract");
  if (!manifest.toolchain || !/^v?\d+\.\d+\.\d+$/.test(manifest.toolchain.node)) errors.push("toolchain.node missing/invalid");
  if (!manifest.toolchain || !/^\d+\.\d+\.\d+$/.test(manifest.toolchain.npm)) errors.push("toolchain.npm missing/invalid");
  if (!manifest.toolchain || !/^\d+\.\d+\.\d+$/.test(manifest.toolchain.next)) errors.push("toolchain.next missing/invalid");
  if (!manifest.validation || manifest.validation.status !== "LOCAL_CHECKS_REQUIRED") errors.push("validation.status must remain LOCAL_CHECKS_REQUIRED");
  if (!manifest.approval || manifest.approval.realClient !== "BLOCKED") errors.push("approval.realClient must remain BLOCKED");
  errors.push(...scanJsonForSecrets(manifest).map((location) => `secret-like value at ${location}`));
  return errors;
}

export function validateRegistry(registry, knownReleaseIds = []) {
  const errors = [];
  if (registry.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!Array.isArray(registry.clients)) errors.push("clients must be an array");
  const seen = new Set();
  const resourceRefs = new Set();
  const lifecycle = new Set(["FICTIONAL_LOCAL_UNPROVISIONED", "NOT_PROVISIONED", "PENDING", "ACTIVE", "SUSPENDED", "OFFBOARDING", "OFFBOARDED"]);
  for (const [index, client] of (registry.clients || []).entries()) {
    if (!client || typeof client !== "object") { errors.push(`clients[${index}] must be an object`); continue; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(client.clientId || "")) errors.push(`clients[${index}].clientId invalid`);
    if (seen.has(client.clientId)) errors.push(`duplicate client ID ${client.clientId}`); seen.add(client.clientId);
    if (!lifecycle.has(client.lifecycleStatus)) errors.push(`${client.clientId}: invalid lifecycleStatus`);
    if (typeof client.defaultBranch !== "string" || !client.defaultBranch.trim()) errors.push(`${client.clientId}: defaultBranch missing`);
    if (!['ENABLED', 'DISABLED'].includes(client.rolloutStatus)) errors.push(`${client.clientId}: rolloutStatus invalid`);
    if (typeof client.releaseChannel !== "string" || !client.releaseChannel.trim()) errors.push(`${client.clientId}: releaseChannel missing`);
    if (!Array.isArray(client.clientOwnedPaths) || client.clientOwnedPaths.some((value) => typeof value !== "string" || !value.trim())) {
      errors.push(`${client.clientId}: clientOwnedPaths invalid`);
    }
    if (client.targetRelease !== "NOT_APPLICABLE" && client.targetRelease !== "UNKNOWN" && !knownReleaseIds.includes(client.targetRelease)) errors.push(`${client.clientId}: unknown targetRelease`);
    for (const key of ["databaseProjectReference", "runtimeReference", "domainReference"]) {
      const ref = client[key];
      if (ref && !["NOT_APPLICABLE", "NOT_PROVISIONED", "PENDING", "UNKNOWN"].includes(ref)) {
        if (resourceRefs.has(ref)) errors.push(`${client.clientId}: duplicate resource reference ${ref}`);
        resourceRefs.add(ref);
      }
    }
    const scheduler = client.operations?.scheduler;
    if (scheduler !== undefined) {
      if (!scheduler || typeof scheduler !== "object" || Array.isArray(scheduler)) {
        errors.push(`${client.clientId}: operations.scheduler must be an object`);
      } else {
        if (!["vercel-cron", "external"].includes(scheduler.adapter)) {
          errors.push(`${client.clientId}: operations.scheduler.adapter invalid`);
        }
        if (scheduler.dispatcherPath !== "/api/cron/dispatch") {
          errors.push(`${client.clientId}: operations.scheduler.dispatcherPath invalid`);
        }
        if (!Array.isArray(scheduler.enabledJobs)) {
          errors.push(`${client.clientId}: operations.scheduler.enabledJobs must be an array`);
        } else {
          const jobs = scheduler.enabledJobs;
          if (jobs.some((job) => typeof job !== "string" || !job.trim())) {
            errors.push(`${client.clientId}: operations.scheduler.enabledJobs contains an invalid job`);
          }
          if (new Set(jobs).size !== jobs.length) {
            errors.push(`${client.clientId}: operations.scheduler.enabledJobs contains duplicates`);
          }
        }
        if (typeof scheduler.activationStatus !== "string" || !scheduler.activationStatus) {
          errors.push(`${client.clientId}: operations.scheduler.activationStatus missing`);
        }
      }
    }
    errors.push(...scanJsonForSecrets(client, `clients[${index}]`).map((location) => `secret-like value at ${location}`));
  }
  errors.push(...scanJsonForSecrets(registry).map((location) => `secret-like value at ${location}`));
  return [...new Set(errors)];
}

export function walkFiles(directory, ignored = new Set()) {
  const output = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const relative = path.relative(ROOT, full).split(path.sep).join("/");
      if (ignored.has(entry.name) || ignored.has(relative)) continue;
      if (entry.isDirectory()) visit(full); else output.push(full);
    }
  }
  visit(directory);
  return output;
}

export function result(name, pass, details = []) {
  return { name, pass, details };
}

export function printResult(payload, json = false) {
  if (json) console.log(JSON.stringify(payload));
  else {
    console.log(`${payload.name}: ${payload.pass ? "PASS" : "FAIL"}`);
    for (const detail of payload.details || []) console.log(`  - ${detail}`);
  }
  return payload.pass ? 0 : 1;
}
