import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { latestOfficialReleaseManifest } from "./lib.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = path.join(repositoryRoot, "ops/clients.json");
const options = { apply: false };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--apply") options.apply = true;
  else if (argument.startsWith("--")) options[argument.slice(2)] = process.argv[++index];
}

const required = ["client-id", "repository-reference", "deployment-target", "database-project-reference"];
const missing = required.filter((key) => !options[key]);
if (missing.length) {
  console.error(`Missing required options: ${missing.map((key) => `--${key}`).join(", ")}`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const release = latestOfficialReleaseManifest(repositoryRoot).value;
if (registry.clients.some((client) => client.clientId === options["client-id"])) {
  console.error(`Client already registered: ${options["client-id"]}`);
  process.exit(1);
}

const client = {
  clientId: options["client-id"],
  displayName: options["display-name"] ?? options["client-id"],
  environment: "managed-client",
  lifecycleStatus: "PENDING",
  defaultBranch: options["default-branch"] ?? "main",
  rolloutStatus: "ENABLED",
  releaseChannel: options["release-channel"] ?? "stable",
  clientOwnedPaths: (options["client-owned-paths"] ?? "client/**,.env*,.vercel/project.json").split(",").filter(Boolean),
  targetRelease: release.releaseId,
  repositoryReference: options["repository-reference"],
  deploymentTarget: options["deployment-target"],
  databaseProjectReference: options["database-project-reference"],
  releaseProvenance: { status: "PENDING_INITIAL_PROVISIONING", mainReleaseFingerprint: release.releaseFingerprint ?? null },
};

const next = { ...registry, clients: [...registry.clients, client] };
console.log(JSON.stringify({ status: options.apply ? "REGISTERED" : "READY_TO_REGISTER", client }, null, 2));
if (options.apply) fs.writeFileSync(registryPath, `${JSON.stringify(next, null, 2)}\n`);
