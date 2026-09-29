import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT, readJson, result, printResult } from "./lib.mjs";

const pkg = readJson(path.join(ROOT, "package.json"));
const contract = readJson(path.join(ROOT, "ops/toolchain-contract.json"));
const systemNpm = process.env.npm_config_user_agent?.match(/npm\/(\d+\.\d+\.\d+)/)?.[1] || "unknown";
let corepackNpm = "unavailable";
try { corepackNpm = execFileSync("corepack", ["npm", "--version"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch {}
const actual = {
  node: process.version.replace(/^v/, ""),
  npm: corepackNpm === "unavailable" ? systemNpm : corepackNpm,
  next: readJson(path.join(ROOT, "node_modules/next/package.json")).version,
};
const expected = { node: contract.node, npm: contract.npm, next: pkg.dependencies.next };
const details = [];
for (const key of Object.keys(expected)) {
  if (actual[key] !== expected[key]) details.push(`${key}: expected ${expected[key]}, actual ${actual[key]}`);
}
if (pkg.packageManager !== `npm@${expected.npm}`) details.push(`package.json packageManager must be npm@${expected.npm}`);
const payload = result("Toolchain", details.length === 0, [
  `expected Node ${expected.node}; actual Node ${actual.node}`,
  `expected npm ${expected.npm}; Corepack npm ${actual.npm}; system npm ${systemNpm}`,
  `expected Next ${expected.next}; installed Next ${actual.next}`,
  ...details,
]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
