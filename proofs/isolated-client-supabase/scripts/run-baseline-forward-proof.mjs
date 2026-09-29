import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const proofRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(proofRoot, "../..");
const sourceSupabase = path.join(repositoryRoot, "supabase");
const guardScript = path.join(repositoryRoot, "scripts/verify-disposable-supabase-target.mjs");
const excludedDataMigration = "20260810190000_cleanup_phase1_material_test_fixtures.sql";
const cutPoint = "20260913160000_reconcile_indexes_and_check_contracts.sql";
const baselineId = "phase1o-1";
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
const baselineDir = path.join(repositoryRoot, "supabase", "baselines", baselineId);
const baselineFile = path.join(baselineDir, "baseline.sql");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-1o-"));
const projects = [
  { label: "reference-cut", id: "tradesstack-client-1o-ref-cut", api: 61521, db: 61522, studio: 61523 },
  { label: "reference-current", id: "tradesstack-client-1o-ref-current", api: 61531, db: 61532, studio: 61533 },
  { label: "baseline-forward", id: "tradesstack-client-1o-baseline", api: 61541, db: 61542, studio: 61543 },
];
const startedProjects = [];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
}

function capture(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  }).trim();
}

function projectRoot(project) {
  return path.join(temporaryRoot, project.label);
}

function projectSupabase(project) {
  return path.join(projectRoot(project), "supabase");
}

function prepareProject(project, files) {
  const supabaseDir = projectSupabase(project);
  fs.mkdirSync(path.join(supabaseDir, "migrations"), { recursive: true });
  fs.copyFileSync(path.join(sourceSupabase, "config.toml"), path.join(supabaseDir, "config.toml"));
  let config = fs.readFileSync(path.join(supabaseDir, "config.toml"), "utf8");
  config = config
    .replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${project.id}"`)
    .replace(/(^\[api\][\s\S]*?^port\s*=\s*)\d+/m, `$1${project.api}`)
    .replace(/(^\[db\][\s\S]*?^port\s*=\s*)\d+/m, `$1${project.db}`)
    .replace(/(^\[studio\][\s\S]*?^port\s*=\s*)\d+/m, `$1${project.studio}`);
  fs.writeFileSync(path.join(supabaseDir, "config.toml"), config);
  for (const file of files) {
    fs.copyFileSync(path.join(sourceSupabase, "migrations", file), path.join(supabaseDir, "migrations", file));
  }
}

function copyMigrations(project, files) {
  const destination = path.join(projectSupabase(project), "migrations");
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceSupabase, "migrations", file), path.join(destination, file));
  }
}

function candidateMigrations() {
  return fs.readdirSync(path.join(sourceSupabase, "migrations"))
    .filter((file) => file.endsWith(".sql") && file !== excludedDataMigration)
    .sort();
}

function migrationVersion(file) {
  return file.split("_", 1)[0];
}

function verifyTarget(project) {
  run(process.execPath, [guardScript,
    "--source-copy", projectRoot(project),
    "--expected-project-id", project.id,
    "--api-port", String(project.api),
    "--db-port", String(project.db),
    "--studio-port", String(project.studio),
    "--protected-project-id", "Tradesstack-ai",
    "--protected-ports", "54321,54322,54323",
    "--marker", project.id,
  ]);
}

function start(project) {
  verifyTarget(project);
  const excludedArgs = ["storage-api", "imgproxy", "studio", "edge-runtime", "logflare", "vector", "supavisor", "postgres-meta", "realtime", "mailpit"];
  run("supabase", ["start", "--workdir", projectRoot(project), "--yes", ...excludedArgs.flatMap((name) => ["--exclude", name])]);
  startedProjects.push(project);
}

function reset(project) {
  run("supabase", ["db", "reset", "--workdir", projectRoot(project), "--local", "--no-seed", "--yes"]);
}

function dbContainer(project) {
  const name = capture("docker", ["ps", "--filter", `name=supabase_db_${project.id}`, "--format", "{{.Names}}"])
    .split("\n").find(Boolean);
  if (!name) throw new Error(`No disposable database container found for ${project.id}.`);
  return name;
}

function sql(project, statement) {
  return capture("docker", ["exec", dbContainer(project), "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", statement]);
}

function applySql(project, file) {
  const container = dbContainer(project);
  const contents = fs.readFileSync(file, "utf8");
  execFileSync("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    cwd: repositoryRoot,
    input: contents,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function repairLedger(project, versions) {
  if (!versions.length) return;
  run("supabase", ["migration", "repair", ...versions, "--workdir", projectRoot(project), "--local", "--status", "applied"]);
}

function queryJson(project, statement) {
  const value = sql(project, statement);
  return value ? JSON.parse(value) : [];
}

function fingerprint(project) {
  const tables = queryJson(project, `
    select coalesce(jsonb_agg(to_jsonb(x) order by table_schema, table_name, column_name), '[]'::jsonb)
    from (select table_schema, table_name, column_name, data_type, udt_schema, udt_name, is_nullable, column_default
          from information_schema.columns where table_schema in ('public', 'private')) x`);
  const constraints = queryJson(project, `
    select coalesce(jsonb_agg(to_jsonb(x) order by table_schema, table_name, constraint_name), '[]'::jsonb)
    from (select n.nspname as table_schema, c.relname as table_name, con.conname as constraint_name, con.contype,
                 pg_get_constraintdef(con.oid, true) as definition
          from pg_constraint con join pg_class c on c.oid = con.conrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('public', 'private')) x`);
  const indexes = queryJson(project, `
    select coalesce(jsonb_agg(to_jsonb(x) order by table_schema, table_name, index_name), '[]'::jsonb)
    from (select n.nspname as table_schema, t.relname as table_name, i.relname as index_name, pg_get_indexdef(i.oid) as definition
          from pg_class i join pg_index ix on ix.indexrelid = i.oid
          join pg_class t on t.oid = ix.indrelid join pg_namespace n on n.oid = t.relnamespace
          where n.nspname in ('public', 'private')) x`);
  const functions = queryJson(project, `
    select coalesce(jsonb_agg(to_jsonb(x) order by identity), '[]'::jsonb)
    from (select p.oid::regprocedure::text as identity,
                 regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g') as definition
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public', 'private') and p.prokind = 'f') x`);
  const triggers = queryJson(project, `
    select coalesce(jsonb_agg(to_jsonb(x) order by table_schema, table_name, trigger_name), '[]'::jsonb)
    from (select trigger_schema as table_schema, event_object_table as table_name, trigger_name,
                 regexp_replace(action_statement, '\\s+', ' ', 'g') as action_statement,
                 event_manipulation, action_timing, action_orientation
          from information_schema.triggers where trigger_schema in ('public', 'private')) x`);
  const rls = queryJson(project, `
    select coalesce(jsonb_agg(to_jsonb(x) order by table_schema, table_name), '[]'::jsonb)
    from (select n.nspname as table_schema, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('public', 'private') and c.relkind in ('r','p')) x`);
  const policies = queryJson(project, `
    select coalesce(jsonb_agg(to_jsonb(x) order by schemaname, tablename, policyname), '[]'::jsonb)
    from (select schemaname, tablename, policyname, permissive, roles, cmd,
                 regexp_replace(coalesce(qual, ''), '\\s+', ' ', 'g') as using_expression,
                 regexp_replace(coalesce(with_check, ''), '\\s+', ' ', 'g') as check_expression
          from pg_policies where schemaname in ('public', 'private')) x`);
  const permissions = queryJson(project, `
    select coalesce(jsonb_agg(to_jsonb(x) order by source, key, role), '[]'::jsonb)
    from (
      select 'permission' as source, permission_key as key, '' as role from public.app_permissions
      union all
      select 'role_permission', permission_key, role from public.role_permissions
    ) x`);
  const schema = { tables, constraints, indexes, functions, triggers, rls };
  const security = { functions, triggers, rls, policies };
  const data = { permissions };
  const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalize(entry)]));
    return value;
  };
  const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
  return { schema, security, data, schemaHash: digest(schema), securityHash: digest(security), dataHash: digest(data), allHash: digest({ schema, security, data }) };
}

function fingerprintDiff(left, right) {
  const categories = ["tables", "constraints", "indexes", "functions", "triggers", "rls", "policies", "permissions"];
  const result = {};
  for (const category of categories) {
    const leftValues = left.schema[category] ?? left.security[category] ?? left.data[category] ?? [];
    const rightValues = right.schema[category] ?? right.security[category] ?? right.data[category] ?? [];
    const key = (value) => JSON.stringify(value);
    const rightSet = new Set(rightValues.map(key));
    const leftSet = new Set(leftValues.map(key));
    result[category] = {
      leftCount: leftValues.length,
      rightCount: rightValues.length,
      onlyLeft: leftValues.filter((value) => !rightSet.has(key(value))).slice(0, 3),
      onlyRight: rightValues.filter((value) => !leftSet.has(key(value))).slice(0, 3),
    };
  }
  return result;
}

function dumpBaseline(cutProject) {
  fs.mkdirSync(baselineDir, { recursive: true });
  run("supabase", ["db", "dump", "--workdir", projectRoot(cutProject), "--local", "--schema", "public,private", "--file", baselineFile]);
  const quote = (value) => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
  const appPermissions = queryJson(cutProject, "select coalesce(jsonb_agg(to_jsonb(x) order by permission_key), '[]'::jsonb) from (select permission_key, description from public.app_permissions) x");
  const rolePermissions = queryJson(cutProject, "select coalesce(jsonb_agg(to_jsonb(x) order by role, permission_key), '[]'::jsonb) from (select role, permission_key, is_allowed from public.role_permissions) x");
  const referenceData = [
    "-- Phase 1O TradesStack-owned Auth bootstrap hook; Supabase Auth internals remain platform-managed",
    "drop trigger if exists on_auth_user_created on auth.users;",
    "create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();",
    "-- Phase 1O approved reference data: app_permissions, role_permissions",
    ...appPermissions.map((row) => `insert into public.app_permissions (permission_key, description) values (${quote(row.permission_key)}, ${quote(row.description)}) on conflict (permission_key) do nothing;`),
    ...rolePermissions.map((row) => `insert into public.role_permissions (role, permission_key, is_allowed) values (${quote(row.role)}, ${quote(row.permission_key)}, ${row.is_allowed ? "true" : "false"}) on conflict (role, permission_key) do nothing;`),
    "",
  ].join("\n");
  console.log(`Baseline reference-data tables: app_permissions (${appPermissions.length}), role_permissions (${rolePermissions.length})`);
  fs.appendFileSync(baselineFile, `\n${referenceData}`);
  const text = fs.readFileSync(baselineFile, "utf8");
  if (/^(copy\s+public|\\copy)\b/im.test(text)) {
    throw new Error("Generated baseline contains operational COPY data statements.");
  }
  if (/(sb_secret_|service_role_key\s*=|jwt_secret\s*=|eyJ[a-zA-Z0-9_-]{30,}\.)/i.test(text)) {
    throw new Error("Generated baseline contains a secret-like value.");
  }
  return { sha256: crypto.createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text) };
}

function acceptance(project, label) {
  const envOutput = capture("supabase", ["status", "--workdir", projectRoot(project), "-o", "env"]);
  const values = {};
  for (const line of envOutput.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  run("npm", ["test"], {
    cwd: proofRoot,
    env: {
      ...process.env,
      PHASE1N_SUPABASE_URL: values.API_URL,
      PHASE1N_SUPABASE_ANON_KEY: values.ANON_KEY,
      PHASE1N_SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
      PHASE1N_PROOF_SUFFIX: label.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    },
  });
  console.log(`Phase 1O Auth/RLS acceptance passed: ${label}`);
}

try {
  const all = candidateMigrations();
  const throughCut = all.filter((file) => file <= cutPoint);
  const afterCut = all.filter((file) => file > cutPoint);
  if (!throughCut.includes(cutPoint)) throw new Error(`Cut point not found: ${cutPoint}`);
  if (afterCut.length === 0) throw new Error("No forward migrations remain after the cut point.");

  prepareProject(projects[0], throughCut);
  prepareProject(projects[1], all);
  prepareProject(projects[2], []);
  for (const project of projects) start(project);
  reset(projects[0]);
  reset(projects[1]);
  reset(projects[2]);

  const cutFingerprint = fingerprint(projects[0]);
  const currentFingerprint = fingerprint(projects[1]);
  const artifact = dumpBaseline(projects[0]);

  applySql(projects[2], baselineFile);
  copyMigrations(projects[2], all);
  repairLedger(projects[2], throughCut.map(migrationVersion));
  const baselineAtCutFingerprint = fingerprint(projects[2]);
  console.log(JSON.stringify({
    cutComparison: {
      cut: { schema: cutFingerprint.schemaHash, security: cutFingerprint.securityHash, data: cutFingerprint.dataHash },
      baselineAtCut: { schema: baselineAtCutFingerprint.schemaHash, security: baselineAtCutFingerprint.securityHash, data: baselineAtCutFingerprint.dataHash },
      diff: fingerprintDiff(cutFingerprint, baselineAtCutFingerprint),
    },
  }, null, 2));
  if (baselineAtCutFingerprint.schemaHash !== cutFingerprint.schemaHash) throw new Error("Baseline schema fingerprint differs at the cut point.");
  if (baselineAtCutFingerprint.securityHash !== cutFingerprint.securityHash) throw new Error("Baseline security fingerprint differs at the cut point.");
  if (baselineAtCutFingerprint.dataHash !== cutFingerprint.dataHash) throw new Error("Baseline bootstrap/reference data fingerprint differs at the cut point.");

  run("npm", ["run", "build"], { cwd: proofRoot });
  acceptance(projects[2], "baseline at cut");
  run("supabase", ["db", "push", "--workdir", projectRoot(projects[2]), "--local", "--include-all", "--yes"]);

  const baselineForwardFingerprint = fingerprint(projects[2]);
  console.log(JSON.stringify({
    comparison: {
      cut: { schema: cutFingerprint.schemaHash, security: cutFingerprint.securityHash, data: cutFingerprint.dataHash },
      baselineAtCut: { schema: baselineAtCutFingerprint.schemaHash, security: baselineAtCutFingerprint.securityHash, data: baselineAtCutFingerprint.dataHash },
      current: { schema: currentFingerprint.schemaHash, security: currentFingerprint.securityHash, data: currentFingerprint.dataHash },
    },
    diffAtCut: fingerprintDiff(cutFingerprint, baselineAtCutFingerprint),
  }, null, 2));
  if (baselineForwardFingerprint.schemaHash !== currentFingerprint.schemaHash) throw new Error("Final schema fingerprint differs from current full replay.");
  if (baselineForwardFingerprint.securityHash !== currentFingerprint.securityHash) throw new Error("Final security fingerprint differs from current full replay.");
  if (baselineForwardFingerprint.dataHash !== currentFingerprint.dataHash) throw new Error("Final bootstrap/reference data fingerprint differs from current full replay.");
  acceptance(projects[0], "reference at cut");
  acceptance(projects[2], "baseline plus forward migrations");
  console.log(JSON.stringify({
    verdict: "PASS 1O COMPLETE — CLIENT DATABASE BASELINE + FORWARD MIGRATION PROVEN",
    baselineId,
    sourceSha,
    cutPoint,
    fullReplayMigrationCount: all.length,
    cutMigrationCount: throughCut.length,
    forwardMigrationCount: afterCut.length,
    excludedDataMigration,
    baselineArtifact: path.relative(repositoryRoot, baselineFile),
    baselineSha256: artifact.sha256,
    baselineBytes: artifact.bytes,
    cutFingerprint: cutFingerprint.allHash,
    currentFingerprint: currentFingerprint.allHash,
    baselineForwardFingerprint: baselineForwardFingerprint.allHash,
  }, null, 2));
} finally {
  for (const project of [...startedProjects].reverse()) {
    try { run("supabase", ["stop", "--workdir", projectRoot(project), "--no-backup", "--yes"]); }
    catch (error) { console.error(`Phase 1O cleanup warning for ${project.id}:`, error instanceof Error ? error.message : error); }
  }
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  console.log(`Phase 1O temporary projects removed: ${temporaryRoot}`);
}
