import { latestOfficialReleaseManifest, validateReleaseManifest, result, printResult } from "./lib.mjs";

const { value: manifest } = latestOfficialReleaseManifest();
const errors = validateReleaseManifest(manifest);
const payload = result("Release identity", errors.length === 0, [
  `release ${manifest.displayLabel}`,
  `source ${manifest.sourceSha}`,
  `shell ${manifest.applicationShell?.releaseId || "unknown"}`,
  `database ${manifest.database?.baseline || "unknown"} -> ${manifest.database?.migrationTarget || "unknown"}`,
  ...errors,
]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
