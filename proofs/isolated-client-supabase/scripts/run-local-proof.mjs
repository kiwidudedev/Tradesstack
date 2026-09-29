import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const proofRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(proofRoot, "../..");
const sourceSupabase = path.join(repositoryRoot, "supabase");
const guardScript = path.join(repositoryRoot, "scripts/verify-disposable-supabase-target.mjs");
const projectId = "tradesstack-client-1n-20260927";
const apiPort = 61421;
const dbPort = 61422;
const studioPort = 61423;
const excludedDataMigration = "20260810190000_cleanup_phase1_material_test_fixtures.sql";
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-1n-"));
const temporarySupabase = path.join(temporaryRoot, "supabase");
let started = false;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
}

function statusEnvironment() {
  const output = execFileSync("supabase", ["status", "--workdir", temporaryRoot, "-o", "env"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const values = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) {
    if (!values[key]) throw new Error(`Supabase status did not return ${key}.`);
  }
  return values;
}

try {
  fs.mkdirSync(temporarySupabase, { recursive: true });
  fs.copyFileSync(path.join(sourceSupabase, "config.toml"), path.join(temporarySupabase, "config.toml"));
  let config = fs.readFileSync(path.join(temporarySupabase, "config.toml"), "utf8");
  config = config
    .replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${projectId}"`)
    .replace(/(^\[api\][\s\S]*?^port\s*=\s*)\d+/m, `$1${apiPort}`)
    .replace(/(^\[db\][\s\S]*?^port\s*=\s*)\d+/m, `$1${dbPort}`)
    .replace(/(^\[studio\][\s\S]*?^port\s*=\s*)\d+/m, `$1${studioPort}`);
  fs.writeFileSync(path.join(temporarySupabase, "config.toml"), config);

  const migrationDestination = path.join(temporarySupabase, "migrations");
  fs.mkdirSync(migrationDestination, { recursive: true });
  const migrationFiles = fs.readdirSync(path.join(sourceSupabase, "migrations"))
    .filter((file) => file.endsWith(".sql") && file !== excludedDataMigration)
    .sort();
  for (const file of migrationFiles) {
    fs.copyFileSync(path.join(sourceSupabase, "migrations", file), path.join(migrationDestination, file));
  }

  run(process.execPath, [guardScript,
    "--source-copy", temporaryRoot,
    "--expected-project-id", projectId,
    "--api-port", String(apiPort),
    "--db-port", String(dbPort),
    "--studio-port", String(studioPort),
    "--protected-project-id", "Tradesstack-ai",
    "--protected-ports", "54321,54322,54323",
    "--marker", projectId,
  ]);

  const excludedArgs = [
    "storage-api", "imgproxy", "studio", "edge-runtime", "logflare",
    "vector", "supavisor", "postgres-meta", "realtime", "mailpit",
  ];
  run("supabase", ["start", "--workdir", temporaryRoot, "--yes", ...excludedArgs.flatMap((name) => ["--exclude", name])]);
  started = true;
  run("supabase", ["db", "reset", "--workdir", temporaryRoot, "--local", "--no-seed", "--yes"]);

  const env = statusEnvironment();
  console.log(`Phase 1N isolated project ready: ${projectId}`);
  console.log(`Phase 1N migration files applied: ${migrationFiles.length}`);
  run("npm", ["run", "build"], { cwd: proofRoot });
  run("npm", ["test"], {
    cwd: proofRoot,
    env: {
      ...process.env,
      PHASE1N_SUPABASE_URL: env.API_URL,
      PHASE1N_SUPABASE_ANON_KEY: env.ANON_KEY,
      PHASE1N_SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
    },
  });
} finally {
  if (started) {
    try {
      run("supabase", ["stop", "--workdir", temporaryRoot, "--no-backup", "--yes"]);
    } catch (error) {
      console.error("Phase 1N cleanup warning: Supabase stop failed.", error instanceof Error ? error.message : error);
    }
  }
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  console.log(`Phase 1N temporary project removed: ${temporaryRoot}`);
}
