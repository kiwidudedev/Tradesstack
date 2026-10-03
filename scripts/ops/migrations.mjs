import fs from "node:fs";
import path from "node:path";
import { ROOT, latestOfficialReleaseManifest, migrationName, result, printResult } from "./lib.mjs";

const migrationsRoot = path.join(ROOT, "supabase/migrations");
const excluded = "20260810190000_cleanup_phase1_material_test_fixtures.sql";
const names = fs.readdirSync(migrationsRoot).filter((name) => name.endsWith(".sql"));
const errors = [];
const malformed = names.filter((name) => !migrationName(name));
if (malformed.length) errors.push(`malformed migration names: ${malformed.join(", ")}`);
const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
if (duplicateNames.length) errors.push(`duplicate migration names: ${[...new Set(duplicateNames)].join(", ")}`);
const ordered = names.filter((name) => name !== excluded).sort();
const target = ordered.at(-1);
const release = latestOfficialReleaseManifest().value;
if (release.database.migrationTarget !== target) errors.push(`manifest migration target ${release.database.migrationTarget} differs from repository target ${target}`);
if (!fs.existsSync(path.join(ROOT, "supabase/baselines/phase1o-1/baseline.sql"))) errors.push("Phase 1O baseline file missing");
const payload = result("Migration repository preflight", errors.length === 0, [
  `baseline phase1o-1 present; production promotion remains pending hosted reconciliation`,
  `candidate migration target ${target}`,
  `excluded data-operation migration ${excluded}`,
  `repository migration files ${names.length}; no hosted database inspected`,
  ...errors,
]);
process.exitCode = printResult(payload, process.argv.includes("--json"));
