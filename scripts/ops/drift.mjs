import path from "node:path";
import { ROOT, readJson, latestOfficialReleaseManifest, compareSemver, semver, result, printResult } from "./lib.mjs";

const registry = readJson(path.join(ROOT, "ops/clients.json"));
const release = latestOfficialReleaseManifest().value;
const details = ["provider drift is intentionally not inspected without provider access"];
const errors = [];
for (const client of registry.clients || []) {
  if (client.targetRelease && !["UNKNOWN", "NOT_APPLICABLE"].includes(client.targetRelease) && client.targetRelease !== release.releaseId) {
    if (semver(client.targetRelease) && semver(release.releaseId) && compareSemver(client.targetRelease, release.releaseId) < 0) {
      // A newly approved release is expected to be ahead of customers until the
      // controlled promotion runs. Record the lag; do not call it corruption.
      details.push(`${client.clientId}: behind approved ${release.releaseId} at ${client.targetRelease}; controlled promotion pending`);
    } else {
      errors.push(`${client.clientId}: target release ${client.targetRelease} is not an approved prior release`);
    }
  }
  for (const field of ["databaseBaseline", "migrationTarget", "configContractFingerprint", "toolchain"]) {
    if (client[field] === "UNKNOWN") details.push(`${client.clientId}: ${field} unknown; review required`);
  }
}
details.push(errors.length ? "drift is reported only; no auto-repair is performed" : "no recorded client drift; empty/unprovisioned registry is expected");
const payload = result("Client drift foundation", errors.length === 0, [...details, ...errors]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
