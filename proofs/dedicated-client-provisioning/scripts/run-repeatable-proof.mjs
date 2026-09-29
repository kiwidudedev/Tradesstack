import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const proofRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(proofRoot, "../..");
const baselineFile = path.join(repositoryRoot, "supabase/baselines/phase1o-1/baseline.sql");
const sourceSupabase = path.join(repositoryRoot, "supabase");
const guardScript = path.join(repositoryRoot, "scripts/verify-disposable-supabase-target.mjs");
const supplierRelease = path.join(
  repositoryRoot,
  "proofs/client-consumption/.artifacts/releases/0.0.0-phase1m.2/tradesstack-suppliers-0.0.0-phase1m.2.tgz",
);
const expectedBaselineSha256 = "52ac69bea6587301c9d50fca809847bb077f03471406476b1d01ed2520c5a372";
const excludedDataMigration = "20260810190000_cleanup_phase1_material_test_fixtures.sql";
const cutPoint = "20260913160000_reconcile_indexes_and_check_contracts.sql";
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-1q-"));
const requireFromProof = createRequire(import.meta.url);
const startedProjects = [];

const clients = [
  {
    label: "alpha",
    projectId: `tradesstack-client-1q-alpha-${Date.now().toString(36)}`,
    api: 61721,
    db: 61722,
    studio: 61723,
    config: {
      schemaVersion: 1,
      identity: { clientKey: "client-alpha", displayName: "Client Alpha" },
      theme: { platformColor: "#123456", actionColor: "#D9480F" },
      defaults: { locale: "en-NZ", currency: "NZD", timezone: "Pacific/Auckland" },
    },
  },
  {
    label: "beta",
    projectId: `tradesstack-client-1q-beta-${Date.now().toString(36)}`,
    api: 61731,
    db: 61732,
    studio: 61733,
    config: {
      schemaVersion: 1,
      identity: { clientKey: "client-beta", displayName: "Client Beta" },
      theme: { platformColor: "#203040", actionColor: "#2F80ED" },
      defaults: { locale: "en-AU", currency: "AUD", timezone: "Australia/Sydney" },
    },
  },
];

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

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertInside(target, root, label) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} must remain inside the disposable proof root.`);
  }
}

function migrationFiles() {
  return fs.readdirSync(path.join(sourceSupabase, "migrations"))
    .filter((file) => file.endsWith(".sql") && file !== excludedDataMigration)
    .sort();
}

function migrationVersion(file) {
  return file.split("_", 1)[0];
}

function projectRoot(client) {
  return path.join(temporaryRoot, "clients", client.label);
}

function appRoot(client) {
  return path.join(projectRoot(client), "app");
}

function supabaseRoot(client) {
  return path.join(projectRoot(client), "supabase");
}

function prepareSupabase(client, files) {
  const root = supabaseRoot(client);
  fs.mkdirSync(path.join(root, "migrations"), { recursive: true });
  fs.copyFileSync(path.join(sourceSupabase, "config.toml"), path.join(root, "config.toml"));
  let config = fs.readFileSync(path.join(root, "config.toml"), "utf8");
  config = config
    .replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${client.projectId}"`)
    .replace(/(^\[api\][\s\S]*?^port\s*=\s*)\d+/m, `$1${client.api}`)
    .replace(/(^\[db\][\s\S]*?^port\s*=\s*)\d+/m, `$1${client.db}`)
    .replace(/(^\[studio\][\s\S]*?^port\s*=\s*)\d+/m, `$1${client.studio}`);
  fs.writeFileSync(path.join(root, "config.toml"), config);
  for (const file of files) {
    fs.copyFileSync(path.join(sourceSupabase, "migrations", file), path.join(root, "migrations", file));
  }
}

function copyMigrations(client, files) {
  const destination = path.join(supabaseRoot(client), "migrations");
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceSupabase, "migrations", file), path.join(destination, file));
  }
}

function verifyTarget(client) {
  run(process.execPath, [guardScript,
    "--source-copy", projectRoot(client),
    "--expected-project-id", client.projectId,
    "--api-port", String(client.api),
    "--db-port", String(client.db),
    "--studio-port", String(client.studio),
    "--protected-project-id", "Tradesstack-ai",
    "--protected-ports", "54321,54322,54323,61521,61522,61523,61531,61532,61533,61541,61542,61543",
    "--marker", client.projectId,
  ]);
}

function startSupabase(client) {
  verifyTarget(client);
  const excluded = ["storage-api", "imgproxy", "studio", "edge-runtime", "logflare", "vector", "supavisor", "postgres-meta", "realtime", "mailpit"];
  capture("supabase", ["start", "--workdir", projectRoot(client), "--yes", ...excluded.flatMap((name) => ["--exclude", name])]);
  startedProjects.push(client);
}

function dbContainer(client) {
  const name = capture("docker", ["ps", "--filter", `name=supabase_db_${client.projectId}`, "--format", "{{.Names}}"]).split("\n").find(Boolean);
  if (!name) throw new Error(`No disposable database container found for ${client.projectId}.`);
  return name;
}

function sql(client, statement) {
  return capture("docker", ["exec", dbContainer(client), "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", statement]);
}

function applySql(client, file) {
  execFileSync("docker", ["exec", "-i", dbContainer(client), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    cwd: repositoryRoot,
    input: fs.readFileSync(file, "utf8"),
    encoding: "utf8",
    stdio: ["pipe", "ignore", "pipe"],
  });
}

function repairLedger(client, versions) {
  capture("supabase", ["migration", "repair", ...versions, "--workdir", projectRoot(client), "--local", "--status", "applied"]);
}

function statusEnvironment(client) {
  const output = capture("supabase", ["status", "--workdir", projectRoot(client), "-o", "env"]);
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

function writeClientApp(client, artifactPaths) {
  const root = appRoot(client);
  assertInside(root, temporaryRoot, "client app workspace");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const packageJson = {
    name: `tradesstack-${client.label}-dedicated-client-proof`,
    version: "0.0.0-proof",
    private: true,
    type: "module",
    scripts: { build: "tsc -p tsconfig.json", test: "node dist/index.test.js" },
    dependencies: {
      "@tradesstack/client-config": `file:../../../artifacts/${path.basename(artifactPaths.clientConfig)}`,
      "@tradesstack/suppliers": `file:../../../artifacts/${path.basename(artifactPaths.suppliers)}`,
    },
    devDependencies: { "@types/node": "20.19.10", typescript: "5.9.2" },
  };
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true,
      noEmit: false, outDir: "dist", rootDir: "src", types: ["node"], lib: ["ES2022", "DOM"],
    },
    include: ["src/**/*.ts"],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "src/index.ts"), `import { defineTradesStackClientConfig, type ClientConfig } from "@tradesstack/client-config";\nimport { validateSupplierWriteInput } from "@tradesstack/suppliers";\n\nexport function resolveClient(config: unknown): ClientConfig {\n  return defineTradesStackClientConfig(config);\n}\n\nexport function validateClientSupplier(name: string) {\n  return validateSupplierWriteInput({ name, website: "supplier.example", countryCode: "nz", defaultCurrencyCode: "nzd", isActive: true });\n}\n\nexport async function assertOwnSupabase(url: string, anonKey: string) {\n  const response = await fetch(new URL("/auth/v1/health", url), { headers: { apikey: anonKey } });\n  if (!response.ok) throw new Error(\`Client Supabase health check failed: \${response.status}\`);\n  return response.status;\n}\n`);
  fs.writeFileSync(path.join(root, "src/index.test.ts"), `import assert from "node:assert/strict";\nimport { assertOwnSupabase, resolveClient, validateClientSupplier } from "./index.js";\n\nconst config = resolveClient(JSON.parse(process.env.CLIENT_CONFIG_JSON ?? "null"));\nassert.equal(config.identity.displayName, ${JSON.stringify(client.config.identity.displayName)});\nassert.equal(config.identity.clientKey, ${JSON.stringify(client.config.identity.clientKey)});\nassert.equal(validateClientSupplier("${client.label[0].toUpperCase() + client.label.slice(1)} Proof Supplier").defaultCurrencyCode, "NZD");\nconst status = await assertOwnSupabase(process.env.CLIENT_SUPABASE_URL ?? "", process.env.CLIENT_SUPABASE_ANON_KEY ?? "");\nassert.equal(status, 200);\nconsole.log("dedicated client app proof passed", config.identity.clientKey);\n`);
  return root;
}

function packLocalPackage(packagePath, artifactDir) {
  const output = capture("npm", ["pack", packagePath, "--pack-destination", artifactDir, "--silent"]);
  return path.join(artifactDir, output.split("\n").filter(Boolean).at(-1));
}

function installAndCheckClient(client, artifactPaths) {
  const root = writeClientApp(client, artifactPaths);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root });
  const resolvedConfig = requireFromProof.resolve("@tradesstack/client-config", { paths: [root] });
  const resolvedSuppliers = requireFromProof.resolve("@tradesstack/suppliers", { paths: [root] });
  const clientNodeModules = fs.realpathSync.native(path.join(root, "node_modules"));
  const outside = (resolved) => {
    const relative = path.relative(clientNodeModules, fs.realpathSync.native(resolved));
    return relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  };
  if (outside(resolvedConfig) || outside(resolvedSuppliers)) {
    throw new Error(`Client ${client.label} resolved a package outside its own node_modules: config=${resolvedConfig}, suppliers=${resolvedSuppliers}`);
  }
  const lockfile = path.join(root, "package-lock.json");
  const lockText = fs.readFileSync(lockfile, "utf8");
  if (lockText.includes(repositoryRoot)) throw new Error(`Client ${client.label} lockfile references the Master repository.`);
  run("npm", ["run", "build"], { cwd: root });
  return { root, lockfileSha256: sha256File(lockfile), coreSourceSha256: sha256File(path.join(root, "src/index.ts")) };
}

function runRlsAcceptance(client, env, suffix) {
  run("npm", ["run", "build"], { cwd: path.join(repositoryRoot, "proofs/isolated-client-supabase") });
  run("npm", ["test"], {
    cwd: path.join(repositoryRoot, "proofs/isolated-client-supabase"),
    env: {
      ...process.env,
      PHASE1N_SUPABASE_URL: env.API_URL,
      PHASE1N_SUPABASE_ANON_KEY: env.ANON_KEY,
      PHASE1N_SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
      PHASE1N_PROOF_SUFFIX: suffix,
    },
  });
}

function databaseLedger(client, forwardFiles) {
  const rows = sql(client, "select version from supabase_migrations.schema_migrations order by version").split("\n").filter(Boolean);
  const expected = forwardFiles.map(migrationVersion);
  const actualForward = rows.filter((version) => expected.includes(version));
  if (rows.length !== 504 + expected.length || actualForward.length !== expected.length) {
    throw new Error(`Unexpected migration ledger for ${client.label}: ${rows.length} rows, ${actualForward.length} forward rows.`);
  }
  return {
    count: rows.length,
    first: rows[0],
    last: rows.at(-1),
    forwardMigrationVersions: actualForward,
    ledgerHash: sha256Json(rows),
  };
}

function manifest(client, artifactPaths, appInfo, ledger, baselineSha256, forwardFiles) {
  return {
    proof: "phase1q-1",
    sourceSha,
    client: { label: client.label, clientKey: client.config.identity.clientKey, configSha256: sha256Json(client.config), config: client.config },
    packages: [
      { name: "@tradesstack/client-config", version: "0.0.0", sha256: sha256File(artifactPaths.clientConfig) },
      { name: "@tradesstack/suppliers", version: "0.0.0-phase1m.2", sha256: sha256File(artifactPaths.suppliers) },
    ],
    database: {
      baselineId: "phase1o-1",
      baselineSha256,
      cutPoint,
      forwardMigrationCount: forwardFiles.length,
      forwardMigrationFiles: forwardFiles,
      ledger,
    },
    infrastructure: { projectId: client.projectId, host: "127.0.0.1", apiPort: client.api, dbPort: client.db, studioPort: client.studio },
    application: { workspaceLockfileSha256: appInfo.lockfileSha256, coreSourceSha256: appInfo.coreSourceSha256 },
  };
}

function cleanupClient(client) {
  const root = projectRoot(client);
  if (!root.startsWith(`${temporaryRoot}${path.sep}`)) throw new Error("Refusing cleanup outside the Phase 1Q temporary root.");
  try { run("supabase", ["stop", "--workdir", root, "--no-backup", "--yes"]); } catch (error) {
    console.error(`Phase 1Q cleanup warning for ${client.projectId}:`, error instanceof Error ? error.message : error);
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function compareManifests(left, right) {
  return {
    coreSourceSame: left.application.coreSourceSha256 === right.application.coreSourceSha256,
    packageArtifactsSame: JSON.stringify(left.packages) === JSON.stringify(right.packages),
    baselineSame: left.database.baselineSha256 === right.database.baselineSha256,
    migrationTargetSame: JSON.stringify(left.database.forwardMigrationFiles) === JSON.stringify(right.database.forwardMigrationFiles),
    databaseLedgerSame: left.database.ledger.ledgerHash === right.database.ledger.ledgerHash,
    configDifferent: left.client.configSha256 !== right.client.configSha256,
    infrastructureDifferent: left.infrastructure.projectId !== right.infrastructure.projectId,
  };
}

function ensureProvenInputs(allMigrations) {
  if (!fs.existsSync(baselineFile)) throw new Error(`Approved baseline missing: ${baselineFile}`);
  const baselineSha256 = sha256File(baselineFile);
  if (baselineSha256 !== expectedBaselineSha256) throw new Error(`Approved baseline checksum mismatch: ${baselineSha256}`);
  if (!allMigrations.includes(cutPoint)) throw new Error(`Approved baseline cut point missing: ${cutPoint}`);
  if (sha256File(supplierRelease) !== "769c28cf6e6fec70044a79928e79b3ba8f239caad06e81aed3ac13ca98ca8c22") {
    throw new Error("Approved Phase 1M Supplier artifact checksum mismatch.");
  }
  return baselineSha256;
}

const manifests = [];
let artifactPaths;
let allMigrations;

try {
  allMigrations = migrationFiles();
  const baselineSha256 = ensureProvenInputs(allMigrations);
  const throughCut = allMigrations.filter((file) => file <= cutPoint);
  const forwardFiles = allMigrations.filter((file) => file > cutPoint);
  if (throughCut.length !== 504 || forwardFiles.length !== 3) throw new Error(`Expected 504 cut and 3 forward migrations; found ${throughCut.length} and ${forwardFiles.length}.`);

  run("npm", ["run", "build", "--workspace=@tradesstack/client-config"], { cwd: repositoryRoot });
  const artifactDir = path.join(temporaryRoot, "artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });
  const supplierArtifact = path.join(artifactDir, path.basename(supplierRelease));
  fs.copyFileSync(supplierRelease, supplierArtifact);
  artifactPaths = {
    clientConfig: packLocalPackage(path.join(repositoryRoot, "packages/client-config"), artifactDir),
    suppliers: supplierArtifact,
  };

  for (const client of [...clients, { ...clients[0], label: "alpha-repro", projectId: `tradesstack-1q-ar-${Date.now().toString(36)}`, api: 61741, db: 61742, studio: 61743 }]) {
    prepareSupabase(client, []);
    writeClientApp(client, artifactPaths);
    const appInfo = installAndCheckClient(client, artifactPaths);
    startSupabase(client);
    applySql(client, baselineFile);
    copyMigrations(client, allMigrations);
    repairLedger(client, throughCut.map(migrationVersion));
    capture("supabase", ["db", "push", "--workdir", projectRoot(client), "--local", "--include-all", "--yes"]);
    const env = statusEnvironment(client);
    runRlsAcceptance(client, env, `phase1q-${client.label}`);
    run("npm", ["run", "test"], {
      cwd: appRoot(client),
      env: {
        ...process.env,
        CLIENT_CONFIG_JSON: JSON.stringify(client.config),
        CLIENT_SUPABASE_URL: env.API_URL,
        CLIENT_SUPABASE_ANON_KEY: env.ANON_KEY,
      },
    });
    const ledger = databaseLedger(client, forwardFiles);
    const clientManifest = manifest(client, artifactPaths, appInfo, ledger, baselineSha256, forwardFiles);
    const manifestFile = path.join(appRoot(client), "provisioning-manifest.json");
    fs.writeFileSync(manifestFile, `${JSON.stringify(clientManifest, null, 2)}\n`);
    const recordedManifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    if (JSON.stringify(recordedManifest) !== JSON.stringify(clientManifest)) throw new Error(`Manifest read-back failed for ${client.label}.`);
    manifests.push(recordedManifest);
    console.log(`Phase 1Q provisioned and validated ${client.label}.`);
    cleanupClient(client);
    if (startedProjects.includes(client)) startedProjects.splice(startedProjects.indexOf(client), 1);
  }

  const alpha = manifests[0];
  const beta = manifests[1];
  const reprovision = manifests[2];
  const comparison = compareManifests(alpha, beta);
  const reprovisionComparison = {
    coreSourceSame: alpha.application.coreSourceSha256 === reprovision.application.coreSourceSha256,
    packageArtifactsSame: JSON.stringify(alpha.packages) === JSON.stringify(reprovision.packages),
    baselineSame: alpha.database.baselineSha256 === reprovision.database.baselineSha256,
    migrationTargetSame: JSON.stringify(alpha.database.forwardMigrationFiles) === JSON.stringify(reprovision.database.forwardMigrationFiles),
    configSame: alpha.client.configSha256 === reprovision.client.configSha256,
    databaseLedgerSame: alpha.database.ledger.ledgerHash === reprovision.database.ledger.ledgerHash,
  };
  if (!Object.values(comparison).every(Boolean)) throw new Error(`Alpha/Beta comparison failed: ${JSON.stringify(comparison)}`);
  if (!Object.values(reprovisionComparison).every(Boolean)) throw new Error(`Alpha reprovision comparison failed: ${JSON.stringify(reprovisionComparison)}`);
  console.log(JSON.stringify({
    verdict: "PASS 1Q COMPLETE — REPEATABLE DEDICATED CLIENT PROVISIONING PROVEN",
    sourceSha,
    baseline: { id: "phase1o-1", sha256: baselineSha256, cutPoint, cutMigrationCount: throughCut.length, forwardMigrationCount: forwardFiles.length },
    packageArtifacts: artifactPaths,
    clients: manifests.map(({ infrastructure, client, packages, database, application }) => ({ infrastructure, client, packages, database, application })),
    alphaBetaComparison: comparison,
    alphaReprovisionComparison: reprovisionComparison,
    noSecretsReported: true,
    cleanup: "all disposable Alpha, Beta, and Alpha-reprovision workspaces and Supabase projects removed",
  }, null, 2));
} finally {
  for (const client of [...startedProjects].reverse()) cleanupClient(client);
  if (fs.existsSync(temporaryRoot)) fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
