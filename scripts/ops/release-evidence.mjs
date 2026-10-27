/**
 * Append-only release evidence reconciliation.
 *
 * An approved release manifest is immutable. If verification evidence arrives
 * after the manifest was written (for example, the first live Alpha deployment),
 * it is recorded in `ops/releases/<version>.evidence.json` instead of rewriting
 * the release. This command validates that the evidence still points at the
 * same source SHA and fingerprint and reports the effective status.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, officialReleaseManifests, result, printResult } from "./lib.mjs";

const releaseDirectory = path.join(ROOT, "ops/releases");
const releases = new Map(officialReleaseManifests().map(({ value }) => [value.version, value]));
const evidenceFiles = fs.existsSync(releaseDirectory)
  ? fs.readdirSync(releaseDirectory).filter((file) => file.endsWith(".evidence.json")).sort()
  : [];

const details = [];
const errors = [];
let reconciled = 0;
for (const file of evidenceFiles) {
  const evidence = readJson(path.join(releaseDirectory, file));
  const release = releases.get(evidence.releaseId);
  if (!release) {
    errors.push(`${file}: no official release manifest for ${evidence.releaseId}`);
    continue;
  }
  if (evidence.sourceSha !== release.sourceSha) errors.push(`${file}: source SHA differs from the immutable release manifest`);
  if (evidence.releaseFingerprint !== release.releaseFingerprint) errors.push(`${file}: fingerprint differs from the immutable release manifest`);
  if (evidence.immutableManifest !== `ops/releases/${release.releaseId}.json`) errors.push(`${file}: immutableManifest pointer is invalid`);
  if (evidence.status !== "RECONCILED") errors.push(`${file}: status must be RECONCILED`);
  if (evidence.alpha) {
    if (!evidence.alpha.deploymentId || !evidence.alpha.supabaseProjectRef || !evidence.alpha.migrationTarget) {
      errors.push(`${file}: Alpha evidence is incomplete`);
    }
    if (evidence.alpha.migrationStatus !== "APPLIED") errors.push(`${file}: Alpha migration is not recorded as APPLIED`);
    if (Number(evidence.alpha.httpStatus) !== 200) errors.push(`${file}: Alpha endpoint is not recorded as HTTP 200`);
  }
  reconciled += 1;
  details.push(`${evidence.releaseId}: RECONCILED (${evidence.reconciliation?.effectiveBrowserVerification ?? "unknown"} browser, ${evidence.reconciliation?.effectiveDatabasePromotionStatus ?? "unknown"} database)`);
}

if (evidenceFiles.length === 0) details.push("no post-approval evidence files; latest release manifest is the source of truth");
else details.push(`${reconciled}/${evidenceFiles.length} evidence files reconciled`);

const payload = result("Release evidence reconciliation", errors.length === 0, [...details, ...errors]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
