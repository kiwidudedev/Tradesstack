import path from "node:path";
import {
  ROOT,
  readJson,
  officialReleaseManifests,
  validateRegistry,
  result,
  printResult,
} from "./lib.mjs";
import { loadContract, validateRegistryWorkerBindings } from "./worker-contract.mjs";

const registry = readJson(path.join(ROOT, "ops/clients.json"));
const webReleases = officialReleaseManifests();
const errors = validateRegistry(registry, webReleases.map(({ value }) => value.releaseId));

// Worker bindings are validated only when the Worker control plane is present,
// so an unreleased Main checkout still validates its web registry.
const details = [
  `clients ${registry.clients?.length ?? "invalid"}`,
  "operating index only; no hosted client is represented",
];
if ((registry.clients ?? []).some((client) => client.worker)) {
  try {
    const contract = await loadContract(ROOT);
    errors.push(...validateRegistryWorkerBindings(registry, { contract }));
    details.push("worker bindings validated against the Worker control plane");
  } catch (error) {
    errors.push(`worker binding validation unavailable: ${error.message}`);
  }
}

const payload = result("Client registry", errors.length === 0, [...details, ...errors]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
