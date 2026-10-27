#!/usr/bin/env node
/**
 * Hosted customer database bootstrap.
 *
 * Applies the approved Phase 1O baseline to an empty, dedicated Supabase
 * project, records exactly the baseline-covered migration versions, applies the
 * approved forward migrations, and verifies the final ledger.
 *
 * Safety:
 *   - dry-run by default; every mutation requires --apply
 *   - refuses the Main, Alpha and Business Hub project references
 *   - refuses a database host that does not contain the expected project ref
 *   - refuses a non-empty public schema unless --resume proves only baseline
 *     versions are present
 *   - never prints the database URL or password
 *   - writes an optional pg_dump backup before mutation
 *
 * This is the hosted operator procedure behind the existing Phase 1O baseline;
 * it does not invent a second migration history. The customer repository's
 * approved `supabase/migrations` are the only forward source.
 *
 * Usage:
 *   CUSTOMER_DATABASE_URL=postgresql://... node scripts/ops/bootstrap-customer-database.mjs \
 *     --customer-key tradelynk --project-ref abcdefghij0123456789 \
 *     --customer-repo /path/to/customer-repo --backup-dir /secure/backups --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ROOT, latestOfficialReleaseManifest, readJson, semver } from "./lib.mjs";

export const PLATFORM_SUPABASE_REFS = Object.freeze([
  "mvxyxvrxaorzglppxzzz", // TradesStack Main / reference
  "ibjyzpyuqupsxqakpzxj", // Client Alpha
  "pcekmljoyrlacdsrlmiy", // Business Hub
]);
export const DEFAULT_BASELINE_CUT = "20260913160000";
export const EXCLUDED_FIXTURE_MIGRATION = "20260810190000_cleanup_phase1_material_test_fixtures.sql";

export function migrationVersion(file) {
  const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file);
  return match ? match[1] : null;
}

export function migrationPlan(migrationsDirectory, target, baselineCut = DEFAULT_BASELINE_CUT) {
  const files = fs.readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql")).sort();
  const malformed = files.filter((file) => !migrationVersion(file));
  const targetVersion = migrationVersion(target);
  const all = files.map((file) => ({ file, version: migrationVersion(file) })).filter((entry) => entry.version && entry.version <= targetVersion);
  const baseline = all.filter((entry) => entry.version <= baselineCut && entry.file !== EXCLUDED_FIXTURE_MIGRATION);
  const forward = all.filter((entry) => entry.version > baselineCut && entry.file !== EXCLUDED_FIXTURE_MIGRATION);
  return {
    files,
    malformed,
    target,
    targetVersion,
    baseline,
    forward,
    excluded: files.filter((file) => file === EXCLUDED_FIXTURE_MIGRATION),
  };
}

export function validateBootstrapPlan({
  plan,
  projectRef,
  databaseUrl,
  release,
  baselinePath,
}) {
  const errors = [];
  if (!/^[a-z0-9]{20}$/.test(projectRef ?? "")) errors.push("project ref must be 20 lowercase alphanumeric characters");
  if (PLATFORM_SUPABASE_REFS.includes(projectRef)) errors.push("project ref is a platform identity");
  if (!plan.targetVersion) errors.push("release migration target is malformed");
  if (!plan.baseline.length) errors.push("baseline migration set is empty");
  if (plan.malformed.length) errors.push(`malformed migration names: ${plan.malformed.slice(0, 5).join(", ")}`);
  if (!plan.forward.some((entry) => entry.version === plan.targetVersion)) {
    errors.push(`release target ${plan.target} is not a forward migration after cut ${DEFAULT_BASELINE_CUT}`);
  }
  if (!fs.existsSync(baselinePath)) errors.push("approved baseline file is missing");
  else {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(baselinePath)).digest("hex");
    if (release?.database?.baselineSha256 && hash !== release.database.baselineSha256) {
      errors.push("approved baseline SHA-256 does not match the release manifest");
    }
  }
  if (release?.database?.migrationTarget && release.database.migrationTarget !== plan.target) {
    errors.push("release migration target differs from the supplied target");
  }
  if (!databaseUrl) errors.push("CUSTOMER_DATABASE_URL is required");
  else {
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") errors.push("database URL must be PostgreSQL");
      if (!parsed.hostname.includes(projectRef)) errors.push("database host does not contain the expected project ref");
    } catch {
      errors.push("database URL is not a valid absolute URL");
    }
  }
  return [...new Set(errors)];
}

function redact(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .replace(/password=[^\s]+/gi, "password=[redacted]");
}

function psql(databaseUrl, sql, options = {}) {
  const result = spawnSync("psql", ["--no-psqlrc", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", databaseUrl], {
    input: sql,
    encoding: "utf8",
    timeout: options.timeout ?? 300_000,
    env: { ...process.env, PGCONNECT_TIMEOUT: "10" },
  });
  if (result.error) throw new Error(`psql could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`psql failed: ${redact(result.stderr || result.stdout).trim().slice(0, 800)}`);
  }
  return String(result.stdout ?? "").trim();
}

function quotePath(file) {
  return `'${file.replace(/'/g, "''")}'`;
}

function backup(databaseUrl, backupDirectory, customerKey) {
  if (!backupDirectory) return null;
  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(backupDirectory, `${customerKey}-${stamp}.dump`);
  const result = spawnSync("pg_dump", ["--no-owner", "--no-acl", "--format=custom", "--file", file, databaseUrl], {
    encoding: "utf8",
    timeout: 600_000,
    env: { ...process.env, PGCONNECT_TIMEOUT: "10" },
  });
  if (result.error) throw new Error(`pg_dump could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`pg_dump failed: ${redact(result.stderr).slice(0, 500)}`);
  return { file, bytes: fs.statSync(file).size };
}

function preflight(databaseUrl, plan, resume) {
  const database = psql(databaseUrl, "select current_database();", { timeout: 30_000 });
  const publicTables = Number(psql(databaseUrl, "select count(*) from information_schema.tables where table_schema = 'public' and table_name not like 'pg_%';", { timeout: 30_000 }));
  const ledgerExists = psql(databaseUrl, "select to_regclass('supabase_migrations.schema_migrations') is not null;", { timeout: 30_000 }) === "t";
  let applied = [];
  if (ledgerExists) {
    applied = psql(databaseUrl, "select version from supabase_migrations.schema_migrations order by version;", { timeout: 30_000 })
      .split("\n").map((line) => line.trim()).filter(Boolean);
  }
  const expected = new Set(plan.baseline.concat(plan.forward).map((entry) => entry.version));
  const unexpected = applied.filter((version) => !expected.has(version));
  if (!resume && (publicTables > 0 || applied.length > 0)) {
    throw new Error(`Refusing a non-empty target: public tables=${publicTables}, ledger entries=${applied.length}. Use --resume only after verifying these are baseline versions.`);
  }
  if (resume && unexpected.length) {
    throw new Error(`Refusing to resume: ledger contains versions outside the approved baseline and forward set (${unexpected.slice(0, 8).join(", ")}).`);
  }
  return { database, publicTables, ledgerExists, applied };
}

function ensureLedgerTable(databaseUrl) {
  psql(databaseUrl, `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);
`);
}

function applyBaseline(databaseUrl, baselinePath) {
  psql(databaseUrl, `begin;\n\\i ${quotePath(baselinePath)}\ncommit;`, { timeout: 900_000 });
}

function recordVersions(databaseUrl, entries) {
  if (!entries.length) return;
  const values = entries.map((entry) => `('${entry.version}', '${entry.file.replace(/'/g, "''")}')`).join(",");
  psql(databaseUrl, `insert into supabase_migrations.schema_migrations (version, name) values ${values} on conflict (version) do nothing;`);
}

function applyForward(databaseUrl, files, migrationsDirectory, alreadyApplied = []) {
  const applied = [];
  const seen = new Set(alreadyApplied);
  for (const entry of files) {
    if (seen.has(entry.version)) continue;
    const file = path.join(migrationsDirectory, entry.file);
    psql(databaseUrl, `
begin;
\\i ${quotePath(file)}
insert into supabase_migrations.schema_migrations (version, name)
values ('${entry.version}', '${entry.file.replace(/'/g, "''")}')
on conflict (version) do nothing;
commit;
`, { timeout: 900_000 });
    applied.push(entry);
  }
  return applied;
}

function verifyLedger(databaseUrl, plan) {
  const applied = psql(databaseUrl, "select version from supabase_migrations.schema_migrations order by version;")
    .split("\n").map((line) => line.trim()).filter(Boolean);
  const expected = plan.baseline.concat(plan.forward).map((entry) => entry.version).sort();
  const missing = expected.filter((version) => !applied.includes(version));
  const unexpected = applied.filter((version) => !expected.includes(version));
  const targetApplied = applied.includes(plan.targetVersion);
  const errors = [];
  if (!targetApplied) errors.push(`target ${plan.target} is not applied`);
  if (missing.length) errors.push(`missing ${missing.length} migration(s): ${missing.slice(0, 8).join(", ")}`);
  if (unexpected.length) errors.push(`unexpected ${unexpected.length} migration(s): ${unexpected.slice(0, 8).join(", ")}`);
  return {
    status: errors.length ? "FAIL" : "PASS",
    errors,
    appliedCount: applied.length,
    target: plan.target,
    targetApplied,
    first: applied[0] ?? null,
    last: applied.at(-1) ?? null,
  };
}

export function parseArgs(argv) {
  const options = { apply: false, resume: false, baselineCut: DEFAULT_BASELINE_CUT };
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--resume") options.resume = true;
    else if (argument.startsWith("--")) options[argument.slice(2)] = argv[++index];
  }
  return options;
}

function output(payload, code = 0) {
  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = code;
}

export async function main(argv = process.argv) {
  const options = parseArgs(argv);
  const release = options.release
    ? readJson(path.join(ROOT, "ops/releases", `${options.release}.json`))
    : latestOfficialReleaseManifest(ROOT).value;
  if (!release || !semver(release.version)) throw new Error("No approved release manifest found.");
  const target = options.target ?? release.database?.migrationTarget;
  const customerRepo = options["customer-repo"] ? path.resolve(options["customer-repo"]) : path.join(ROOT, ".");
  const migrationsDirectory = path.join(customerRepo, "supabase/migrations");
  if (!fs.existsSync(migrationsDirectory)) throw new Error(`Customer repository migrations not found: ${migrationsDirectory}`);
  const baselinePath = path.resolve(options.baseline ?? path.join(ROOT, "supabase/baselines/phase1o-1/baseline.sql"));
  const plan = migrationPlan(migrationsDirectory, target, options.baselineCut);
  const databaseUrl = process.env.CUSTOMER_DATABASE_URL?.trim() ?? "";
  const projectRef = options["project-ref"]?.trim() ?? "";
  const customerKey = options["customer-key"]?.trim() ?? "";
  const errors = validateBootstrapPlan({ plan, projectRef, databaseUrl, release, baselinePath });
  if (!/^[a-z][a-z0-9-]{2,62}$/.test(customerKey)) errors.push("--customer-key is required and must be a safe slug");
  if (errors.length) {
    output({ status: "BLOCKED", errors, release: release.version, target }, 2);
    return;
  }

  const summary = {
    customerKey,
    release: release.version,
    sourceSha: release.sourceSha,
    target,
    baseline: "phase1o-1",
    baselineSha256: release.database.baselineSha256,
    baselineCut: options.baselineCut,
    baselineMigrations: plan.baseline.length,
    forwardMigrations: plan.forward.length,
    excludedFixtureMigration: EXCLUDED_FIXTURE_MIGRATION,
    mode: options.apply ? "APPLY" : "DRY_RUN",
  };

  if (!options.apply) {
    output({ status: "PLAN_ONLY", ...summary, note: "No mutation. Re-run with --apply on the dedicated, isolated project." });
    return;
  }

  const pre = preflight(databaseUrl, plan, options.resume);
  const backupResult = backup(databaseUrl, options["backup-dir"] ? path.resolve(options["backup-dir"]) : null, customerKey);
  ensureLedgerTable(databaseUrl);
  if (!options.resume) applyBaseline(databaseUrl, baselinePath);
  recordVersions(databaseUrl, plan.baseline);
  const forward = applyForward(databaseUrl, plan.forward, migrationsDirectory, pre.applied);
  const verification = verifyLedger(databaseUrl, plan);
  const result = {
    status: verification.status === "PASS" ? "APPLIED" : "FAILED_VERIFICATION",
    ...summary,
    database: pre.database,
    previousLedgerEntries: pre.applied.length,
    appliedBaselineVersions: plan.baseline.length,
    appliedForwardVersions: forward.length,
    backup: backupResult ? { file: backupResult.file, bytes: backupResult.bytes } : null,
    verification,
    note: "Backup/restore verification and Auth/RLS acceptance remain separate gates.",
  };
  output(result, verification.status === "PASS" ? 0 : 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    output({ status: "FAILED", reason: redact(error.message) }, 2);
  });
}
