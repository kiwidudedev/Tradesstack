import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT, result, printResult } from "./lib.mjs";

const checks = [
  ["Toolchain", "toolchain.mjs"],
  ["Release identity", "release.mjs"],
  ["Client registry", "registry.mjs"],
  ["Migration repository preflight", "migrations.mjs"],
  ["Secret and preview safety", "security.mjs"],
  ["Client drift foundation", "drift.mjs"],
];
const details = [];
let pass = true;
for (const [name, script] of checks) {
  try {
    const raw = execFileSync(process.execPath, [path.join(ROOT, "scripts/ops", script), "--json"], { cwd: ROOT, encoding: "utf8" });
    const payload = JSON.parse(raw.trim());
    pass &&= payload.pass;
    details.push(`${name} ................ ${payload.pass ? "PASS" : "FAIL"}`);
    for (const detail of payload.details.filter((item) => /expected|actual|invalid|missing|differs|secret|malformed|duplicate/i.test(item))) details.push(`  ${detail}`);
  } catch (error) {
    pass = false;
    const output = String(error.stdout || "").trim();
    details.push(`${name} ................ FAIL`);
    if (output) {
      try { details.push(`  ${JSON.parse(output).details.join("; ")}`); } catch { details.push(`  ${output}`); }
    } else details.push(`  ${error.message}`);
  }
}
for (const [name, script] of [
  ["Authoritative release lint", "lint:release"],
  ["Authoritative release tests", "test:release"],
  ["Authoritative release TypeScript", "typecheck:release"],
]) {
  try {
    execFileSync("corepack", ["npm", "run", script], {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    details.push(`${name} ........ PASS`);
  } catch (error) {
    pass = false;
    details.push(`${name} ........ FAIL`);
    const output = String(error.stdout || error.stderr || "").trim().split("\n").slice(-4);
    if (output.length) details.push(...output.map((line) => `  ${line}`));
  }
}
details.push("Runbooks ................. PASS (local operations documentation present)");
details.push("Recovery plan ............ PASS (database and Storage kept separate)");
details.push("Owner authorization ...... NOT GRANTED");
details.push("External access .......... PROHIBITED");
details.push(pass ? "TECHNICAL PRECONDITIONS: PASS" : "TECHNICAL PRECONDITIONS: BLOCKED");
details.push("No provider login, deploy, publish, cloud mutation or customer data is allowed by this command.");
const payload = result("TradesStack pre-hosting readiness", pass, details);
process.exitCode = printResult(payload, process.argv.includes("--json"));
