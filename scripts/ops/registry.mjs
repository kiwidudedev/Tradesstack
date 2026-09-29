import path from "node:path";
import { ROOT, readJson, validateRegistry, result, printResult } from "./lib.mjs";

const registry = readJson(path.join(ROOT, "ops/clients.json"));
const release = readJson(path.join(ROOT, "ops/releases/0.0.0-phase1v.local.json"));
const errors = validateRegistry(registry, [release.releaseId]);
const payload = result("Client registry", errors.length === 0, [
  `clients ${registry.clients?.length ?? "invalid"}`,
  "operating index only; no hosted client is represented",
  ...errors,
]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
