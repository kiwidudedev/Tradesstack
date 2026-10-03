import path from "node:path";
import { ROOT, readJson, latestOfficialReleaseManifest, validateRegistry, result, printResult } from "./lib.mjs";

const registry = readJson(path.join(ROOT, "ops/clients.json"));
const release = latestOfficialReleaseManifest().value;
const errors = validateRegistry(registry, [release.releaseId]);
const payload = result("Client registry", errors.length === 0, [
  `clients ${registry.clients?.length ?? "invalid"}`,
  "operating index only; no hosted client is represented",
  ...errors,
]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
