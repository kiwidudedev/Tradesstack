import fs from "node:fs";
import path from "node:path";
import { ROOT, compareSemver, latestOfficialReleaseManifest, nextSemver, semver } from "./lib.mjs";

const productVersionPath = path.join(ROOT, "ops/product-version.json");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--suggest") args.set("suggest", process.argv[++index]);
  else if (argument === "--version") args.set("version", process.argv[++index]);
  else if (argument === "--check") args.set("check", true);
}

const { value: latest, path: latestPath } = latestOfficialReleaseManifest();

if (args.get("suggest")) {
  const bump = args.get("suggest");
  const version = nextSemver(latest.version, bump);
  console.log(JSON.stringify({ current: latest.version, bump, next: version, label: `TradesStack ${version}` }, null, 2));
  process.exit(0);
}

if (args.get("version")) {
  const version = args.get("version");
  if (!semver(version)) throw new Error("Official release versions must be MAJOR.MINOR.PATCH, for example 1.1.0");
  if (compareSemver(version, latest.version) <= 0) throw new Error(`Release ${version} is not newer than approved ${latest.version}`);
  const target = path.join(ROOT, "ops/releases", `${version}.json`);
  if (fs.existsSync(target)) throw new Error(`Release manifest already exists: ${target}; official versions are immutable`);
  const [major, minor, patch] = latest.version.split(".").map(Number);
  const [nextMajor, nextMinor, nextPatch] = version.split(".").map(Number);
  const bump = nextMajor > major ? "major" : nextMinor > minor ? "minor" : "patch";
  console.log(JSON.stringify({ status: "READY_TO_CREATE", current: latest.version, version, label: `TradesStack ${version}`, bump, manifest: path.relative(ROOT, target), previousRelease: latest.version }, null, 2));
  process.exit(0);
}

if (args.get("check") || process.argv.length === 2) {
  const product = JSON.parse(fs.readFileSync(productVersionPath, "utf8"));
  const errors = [];
  if (product.officialVersion !== latest.version) errors.push(`product version ${product.officialVersion} differs from latest release ${latest.version}`);
  if (product.displayLabel !== latest.displayLabel) errors.push("product display label differs from latest release");
  if (product.approvedReleaseManifest !== path.relative(ROOT, latestPath)) errors.push("product release manifest pointer is stale");
  if (product.approvedSourceSha !== latest.sourceSha) errors.push("product source SHA differs from latest release");
  if (product.releaseFingerprint !== latest.releaseFingerprint) errors.push("product release fingerprint differs from latest release");
  if (errors.length) {
    console.error(JSON.stringify({ status: "FAIL", errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "PASS", officialVersion: latest.version, label: latest.displayLabel, sourceSha: latest.sourceSha, migrationTarget: latest.database.migrationTarget }, null, 2));
}
