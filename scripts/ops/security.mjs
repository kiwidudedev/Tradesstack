import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, walkFiles, scanJsonForSecrets, result, printResult, SECRET_PATTERNS } from "./lib.mjs";

const errors = [];
const manifest = readJson(path.join(ROOT, "ops/releases/0.0.0-phase1v.local.json"));
const registry = readJson(path.join(ROOT, "ops/clients.json"));
for (const [label, value] of [["release manifest", manifest], ["client registry", registry]]) {
  for (const location of scanJsonForSecrets(value)) errors.push(`${label}: secret-like value at ${location}`);
}
const inspectRoots = ["ops", "docs/operations"];
const ignored = new Set(["node_modules", ".next", ".git"]);
const suspiciousFiles = [];
for (const relativeRoot of inspectRoots) {
  const root = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(root)) continue;
  for (const file of walkFiles(root, ignored)) {
    const text = fs.readFileSync(file, "utf8");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) suspiciousFiles.push(path.relative(ROOT, file));
  }
}
if (suspiciousFiles.length) errors.push(`secret-like patterns in local operations files: ${suspiciousFiles.join(", ")}`);
const payload = result("Secret and preview safety", errors.length === 0, [
  "registry and release artifacts contain names/identities only",
  "service-role and provider values are not required for local metadata checks",
  "regex scanning is a guardrail, not a complete secret detector",
  "public env exposure and server-only enforcement still require code/security review",
  ...errors,
]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
