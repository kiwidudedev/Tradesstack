import { execFileSync } from "node:child_process";
import { ROOT, result, printResult } from "./lib.mjs";

const checks = [
  ["toolchain", "ops:toolchain"],
  ["release lint", "lint:release"],
  ["release tests", "test:release"],
  ["TypeScript", "typecheck:release"],
  ["release identity", "ops:release"],
  ["registry", "ops:registry"],
  ["migration preflight", "ops:migrations"],
  ["security", "ops:security"],
  ["drift", "ops:drift"],
];
const details = [];
let pass = true;
for (const [name, script] of checks) {
  try {
    execFileSync("corepack", ["npm", "run", script], { cwd: ROOT, stdio: "pipe", encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    details.push(`${name}: PASS`);
  } catch (error) {
    pass = false;
    details.push(`${name}: FAIL`);
    const output = String(error.stdout || error.stderr || "").trim().split("\n").slice(-8).join("\n");
    if (output) details.push(output);
  }
}
details.push(pass ? "AUTHORITATIVE LOCAL RELEASE VALIDATION: PASS" : "AUTHORITATIVE LOCAL RELEASE VALIDATION: BLOCKED");
details.push("External/hosted/credential tests are separate tiers and are not silently treated as passed.");
process.exitCode = printResult(result("Authoritative local release validation", pass, details), process.argv.includes("--json"));
