import path from "node:path";
import { ROOT, readJson, validateReleaseManifest, result, printResult } from "./lib.mjs";

const file = path.join(ROOT, "ops/releases/0.0.0-phase1v.local.json");
const manifest = readJson(file);
const errors = validateReleaseManifest(manifest);
const payload = result("Release identity", errors.length === 0, [
  `release ${manifest.releaseId}`,
  `source ${manifest.sourceSha}`,
  `shell ${manifest.applicationShell?.releaseId || "unknown"}`,
  `database ${manifest.database?.baseline || "unknown"} -> ${manifest.database?.migrationTarget || "unknown"}`,
  ...errors,
]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
