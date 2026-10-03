import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repositoryRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) continue;
  args.set(argument, process.argv[index + 1]);
  index += 1;
}

const mainManifestPath = path.resolve(
  repositoryRoot,
  args.get("--main-manifest") ?? "ops/releases/0.0.0-phase1v.local.json",
);
const clientRoot = path.resolve(repositoryRoot, args.get("--client-root") ?? "..");
const clientManifestPath = path.resolve(
  clientRoot,
  args.get("--client-manifest") ?? "release-manifest.json",
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function hasCommit(sha) {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: repositoryRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const main = readJson(mainManifestPath);
const client = readJson(clientManifestPath);
const errors = [];
const targetMigration = main.database?.migrationTarget;

if (!hasCommit(main.sourceSha)) errors.push(`Main release source SHA is not a repository commit: ${main.sourceSha}`);
if (client.releaseId !== main.releaseId) errors.push(`client release ${client.releaseId} does not match Main ${main.releaseId}`);
if (client.sourceSha !== main.sourceSha) errors.push(`client source SHA ${client.sourceSha} does not match Main ${main.sourceSha}`);
if (!String(client.databaseCompatibility ?? "").includes(targetMigration)) {
  errors.push(`client database compatibility does not include Main migration target ${targetMigration}`);
}

const releaseOwnedFiles = [
  "lib/application-shell-release.ts",
  "lib/commercial-items/purchase-order-linking.ts",
  "lib/commercial-items/purchase-order-linking.test.ts",
  "lib/commercial-items-project-quote-source-link-migration.test.ts",
  targetMigration && `supabase/migrations/${targetMigration}`,
].filter(Boolean);

for (const relative of releaseOwnedFiles) {
  const mainPath = path.join(repositoryRoot, relative);
  const clientPath = path.join(clientRoot, relative);
  if (!fs.existsSync(mainPath) || !fs.existsSync(clientPath)) {
    errors.push(`release-owned file missing from Main or client: ${relative}`);
    continue;
  }
  const mainHash = sha256(mainPath);
  const clientHash = sha256(clientPath);
  if (mainHash !== clientHash) errors.push(`release-owned file differs: ${relative}`);
  if (client.fileHashes?.[relative] !== clientHash) errors.push(`client manifest hash mismatch: ${relative}`);
}

console.log(`Client release provenance: ${errors.length === 0 ? "PASS" : "BLOCKED"}`);
console.log(`  - Main release ${main.releaseId}`);
console.log(`  - source ${main.sourceSha}`);
console.log(`  - migration ${targetMigration}`);
for (const error of errors) console.log(`  - ${error}`);
process.exitCode = errors.length === 0 ? 0 : 1;
