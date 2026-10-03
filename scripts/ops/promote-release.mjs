import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultReleaseManifest = path.join(repositoryRoot, "ops/releases/0.0.0-phase1v.local.json");
const defaultRegistry = path.join(repositoryRoot, "ops/clients.json");
const generatedFiles = new Set(["next-env.d.ts", "package-lock.json", "tsconfig.tsbuildinfo", "tsconfig.build.tsbuildinfo"]);

function parseArgs(argv) {
  const options = { apply: false, push: false, clone: false, applyDb: false, validate: false, skipDb: false, skipClientValidation: false, forceReleaseOwned: false, workspace: repositoryRoot };
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--push") options.push = true;
    else if (argument === "--clone") options.clone = true;
    else if (argument === "--apply-db") options.applyDb = true;
    else if (argument === "--validate") options.validate = true;
    else if (argument === "--skip-db") options.skipDb = true;
    else if (argument === "--skip-client-validation") options.skipClientValidation = true;
    else if (argument === "--force-release-owned") options.forceReleaseOwned = true;
    else if (argument.startsWith("--")) options[argument.slice(2)] = argv[++index];
  }
  return options;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function sha256File(file) { return sha256(fs.readFileSync(file)); }
function relative(root, file) { return path.relative(root, file).split(path.sep).join("/"); }
function inside(target, root) { const t = path.resolve(target); const r = path.resolve(root); return t === r || t.startsWith(`${r}${path.sep}`); }
function run(command, args, cwd, options = {}) { return execFileSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options }); }
function capture(command, args, cwd) { return run(command, args, cwd).trim(); }
function hasCommit(sha) {
  try { run("git", ["cat-file", "-e", `${sha}^{commit}`], repositoryRoot, { stdio: "ignore" }); return true; }
  catch { return false; }
}

function resolveReleaseManifest(request) {
  if (!request) return defaultReleaseManifest;
  const direct = path.isAbsolute(request) ? request : path.resolve(repositoryRoot, request);
  const candidates = [direct, `${direct}.json`, path.join(repositoryRoot, "ops/releases", `${request}.json`)];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  const releaseDirectory = path.join(repositoryRoot, "ops/releases");
  for (const file of fs.readdirSync(releaseDirectory).filter((entry) => entry.endsWith(".json"))) {
    const candidate = path.join(releaseDirectory, file);
    try {
      if (readJson(candidate).releaseId === request) return candidate;
    } catch { /* malformed manifests are reported by validation */ }
  }
  throw new Error(`Main release manifest not found: ${request}`);
}

function releaseFingerprint(manifest) {
  return sha256(manifest.files.map((file) => `${file}:${manifest.fileHashes[file]}`).join("\n"));
}

function loadRelease(manifestPath) {
  const manifest = readJson(manifestPath);
  const errors = [];
  if (!manifest.releaseId) errors.push("releaseId missing");
  if (!/^[0-9a-f]{40}$/.test(manifest.sourceSha ?? "")) errors.push("sourceSha must be a full SHA-1");
  if (!hasCommit(manifest.sourceSha)) errors.push(`source SHA is not present in Main: ${manifest.sourceSha}`);
  if (!manifest.database?.migrationTarget) errors.push("database migrationTarget missing");
  if (errors.length) throw new Error(`Invalid Main release ${manifest.releaseId ?? "unknown"}: ${errors.join("; ")}`);
  const fingerprint = Array.isArray(manifest.files) && manifest.fileHashes ? releaseFingerprint(manifest) : null;
  if (manifest.releaseFingerprint && fingerprint && manifest.releaseFingerprint !== fingerprint) {
    errors.push(`releaseFingerprint does not match files: ${manifest.releaseFingerprint}`);
  }
  if (errors.length) throw new Error(`Invalid Main release ${manifest.releaseId ?? "unknown"}: ${errors.join("; ")}`);
  return { manifest, fingerprint };
}

const releaseRootFiles = [
  ".gitattributes", ".gitignore", ".nvmrc", ".env.example", "eslint.config.mjs", "next.config.ts",
  "package.json", "package-lock.json", "postcss.config.js", "proxy.ts", "tailwind.config.ts",
  "tsconfig.json", "tsconfig.build.json", "vercel.json", "vitest.config.ts", "vitest.release.config.ts",
];
const releaseDirectories = ["app", "components", "hooks", "lib", "packages", "public", "styles", "types", "test-support"];
const releaseSupportFiles = [
  "supabase/config.toml",
  "tests/fixtures/materials/supplier-pricing/trade-direct-gib-2026.pdf",
  "tests/fixtures/materials/supplier-pricing/trade-direct-gib-2026.ts",
  "tests/fixtures/supplier-invoices/TradeSupplier_Invoice_OCR_Test.pdf",
  "tests/fixtures/supplier-invoices/TradeSupplier_Invoice_OCR_Test_provider_fallback.pdf",
];
const releaseExclusions = new Set([".git", ".next", ".tmp", ".dsh-drop", "artifacts", "docs", "proofs", "scripts", "client", "node_modules"]);

function listReleaseFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full); else files.push(relative(root, full));
    }
  };
  for (const file of releaseRootFiles) if (fs.existsSync(path.join(root, file))) files.push(file);
  for (const directory of [...releaseDirectories, "supabase/functions", "supabase/migrations"]) {
    const full = path.join(root, directory);
    if (fs.existsSync(full)) visit(full);
  }
  for (const file of releaseSupportFiles) if (fs.existsSync(path.join(root, file))) files.push(file);
  for (const file of ["supabase/config.toml"]) if (fs.existsSync(path.join(root, file))) files.push(file);
  return [...new Set(files)].filter((file) => ![...releaseExclusions].some((excluded) => file === excluded || file.startsWith(`${excluded}/`))).sort();
}

function normalizeRelease(release, releaseRoot) {
  if (Array.isArray(release.manifest.files) && release.manifest.fileHashes) return release;
  const files = listReleaseFiles(releaseRoot);
  const fileHashes = Object.fromEntries(files.map((file) => [file, sha256File(path.join(releaseRoot, file))]));
  const manifest = { ...release.manifest, files, fileHashes };
  return { manifest, fingerprint: releaseFingerprint(manifest) };
}

function resolveClientRoot(client, workspace) {
  if (client.localRoot) return path.resolve(workspace, client.localRoot);
  const reference = client.repositoryReference ?? "";
  const name = reference.split("/").at(-1);
  return name ? path.resolve(workspace, name) : null;
}

function currentBranch(root) { return capture("git", ["branch", "--show-current"], root); }
function status(root) { return capture("git", ["status", "--porcelain"], root); }
function localBranchExists(root, branch) {
  return Boolean(capture("git", ["branch", "--list", branch], root));
}

function clientManifest(root) {
  const file = path.join(root, "release-manifest.json");
  if (!fs.existsSync(file)) throw new Error("release-manifest.json missing");
  return { file, manifest: readJson(file) };
}

function validateClient(root, client, release, options) {
  const errors = [];
  if (!root || !fs.existsSync(root)) return { status: "BLOCKED_CLIENT_ROOT_UNAVAILABLE", errors: ["client repository root is unavailable"] };
  if (!fs.existsSync(path.join(root, ".git"))) return { status: "BLOCKED_NOT_A_GIT_REPOSITORY", errors: ["client root is not a Git repository"] };
  if (status(root)) errors.push("client working tree is dirty");
  if (currentBranch(root) !== (client.defaultBranch ?? "main")) errors.push(`client is not on default branch ${client.defaultBranch ?? "main"}`);
  let previous;
  try { previous = clientManifest(root).manifest; } catch (error) { errors.push(error.message); }
  let divergent = [];
  if (previous && Array.isArray(previous.files) && previous.fileHashes) {
    divergent = previous.files.filter((file) => generatedFiles.has(file) ? false : !fs.existsSync(path.join(root, file)) || sha256File(path.join(root, file)) !== previous.fileHashes[file]);
    if (divergent.length && !options.forceReleaseOwned) errors.push(`release-owned divergence: ${divergent.slice(0, 12).join(", ")}${divergent.length > 12 ? "…" : ""}`);
  }
  if (previous?.releaseId === release.manifest.releaseId && previous?.sourceSha === release.manifest.sourceSha && divergent.length === 0) errors.push("client already declares this release");
  const migration = release.manifest.database.migrationTarget;
  if (!fs.existsSync(path.join(root, "supabase/migrations", migration)) && !options.forceReleaseOwned) errors.push(`client migration missing: ${migration}`);
  const migrationState = { status: options.skipDb ? "SKIPPED_BY_OPERATOR" : "NOT_LINKED_OR_NOT_CHECKED", target: migration, pending: false, ledger: null };
  if (!options.skipDb && fs.existsSync(path.join(root, "supabase/.temp/project-ref"))) {
    try {
      const listing = capture("supabase", ["migration", "list", "--linked", "--workdir", root], repositoryRoot);
      const target = listing.split("\n").find((line) => line.includes(migration));
      migrationState.ledger = target?.trim() ?? null;
      if (!target || !target.includes(migration.split("_")[0])) {
        migrationState.status = "AMBIGUOUS_OR_MISSING_TARGET";
        errors.push(`migration target not visible in linked ledger: ${migration}`);
      } else {
        migrationState.pending = target.split("|").map((value) => value.trim())[1] !== migration.split("_")[0];
        migrationState.status = migrationState.pending ? "PENDING" : "APPLIED";
      }
    } catch (error) {
      migrationState.status = "PREFLIGHT_FAILED";
      errors.push(`migration preflight failed: ${String(error.message).split("\n")[0]}`);
    }
  }
  if (errors.length) return { status: "BLOCKED", errors, previous, migration: migrationState };
  return { status: "READY", errors: [], previous, migration: migrationState };
}

function copyPathIfPresent(sourceRoot, targetRoot, pattern) {
  if (pattern.endsWith("/**")) {
    const source = path.join(sourceRoot, pattern.slice(0, -3));
    if (fs.existsSync(source)) fs.cpSync(source, path.join(targetRoot, pattern.slice(0, -3)), { recursive: true });
    return;
  }
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    for (const entry of fs.readdirSync(sourceRoot).filter((name) => name.startsWith(prefix))) {
      fs.cpSync(path.join(sourceRoot, entry), path.join(targetRoot, entry), { recursive: true });
    }
    return;
  }
  const source = path.join(sourceRoot, pattern);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(targetRoot, pattern), { recursive: true });
}

function runCandidateChecks(root, client, release, previous, releaseRoot) {
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-client-check-"));
  const checks = [];
  try {
    run("git", ["worktree", "add", "--detach", worktree, "HEAD"], root);
    for (const ownedPath of client.clientOwnedPaths ?? []) copyPathIfPresent(root, worktree, ownedPath);
    materializeRelease(worktree, release, previous, releaseRoot);
    const packageFile = path.join(worktree, "package.json");
    if (!fs.existsSync(packageFile)) return { status: "SKIPPED_NO_PACKAGE_MANIFEST", checks };
    const scripts = readJson(packageFile).scripts ?? {};
    try {
      run("corepack", ["npm", fs.existsSync(path.join(worktree, "package-lock.json")) ? "ci" : "install", "--ignore-scripts"], worktree, { timeout: 15 * 60 * 1000, stdio: "pipe" });
      checks.push({ label: "dependencies", status: "PASS" });
    } catch (error) {
      const output = [error.stdout, error.stderr, error.message]
        .filter(Boolean)
        .map(String)
        .join("\n")
        .trim()
        .split("\n")
        .slice(-20)
        .join("\n");
      checks.push({ label: "dependencies", status: "FAIL", detail: output });
      return { status: "BLOCKED_CLIENT_VALIDATION", checks, errors: [`client dependencies failed: ${output}`] };
    }
    for (const [label, script] of [["tests", "test:release"], ["typecheck", "typecheck:release"], ["build", "build"]]) {
      if (!scripts[script]) { checks.push({ label, status: "SKIPPED_NOT_DECLARED" }); continue; }
      try {
        run("corepack", ["npm", "run", script], worktree, { timeout: 15 * 60 * 1000, stdio: "pipe" });
        checks.push({ label, status: "PASS" });
      } catch (error) {
        const output = [error.stdout, error.stderr, error.message]
          .filter(Boolean)
          .map(String)
          .join("\n")
          .trim()
          .split("\n")
          .slice(-20)
          .join("\n");
        checks.push({ label, status: "FAIL", detail: output });
        return { status: "BLOCKED_CLIENT_VALIDATION", checks, errors: [`client ${label} failed: ${checks.at(-1).detail}`] };
      }
    }
    return { status: "PASS", checks };
  } finally {
    try { run("git", ["worktree", "remove", "--force", worktree], root); } catch { /* isolated worktree cleanup is best effort */ }
    fs.rmSync(worktree, { recursive: true, force: true });
  }
}

function materializeRelease(root, release, previous, releaseRoot) {
  const releaseFiles = new Set(release.manifest.files);
  for (const file of previous.files ?? []) {
    if (!releaseFiles.has(file) && !generatedFiles.has(file)) {
      const target = path.join(root, file);
      if (inside(target, root)) fs.rmSync(target, { force: true });
    }
  }
  for (const file of release.manifest.files) {
    const source = path.join(releaseRoot, file);
    const target = path.join(root, file);
    if (!fs.existsSync(source)) throw new Error(`release snapshot missing ${file}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  const nextManifest = {
    ...previous,
    schemaVersion: 1,
    releaseId: release.manifest.releaseId,
    sourceSha: release.manifest.sourceSha,
    mainReleaseFingerprint: release.fingerprint,
    sourceWorkingTree: `approved Main release ${release.manifest.sourceSha}`,
    fingerprint: release.fingerprint,
    databaseCompatibility: `Phase 1O phase1o-1 baseline plus approved forward migrations through ${release.manifest.database.migrationTarget}`,
    files: release.manifest.files,
    fileHashes: release.manifest.fileHashes,
  };
  writeJson(path.join(root, "release-manifest.json"), nextManifest);
}

function promoteClient(client, release, options, releaseRoot) {
  const root = resolveClientRoot(client, options.workspace);
  if (options.clone && root && !fs.existsSync(root) && client.repositoryReference) {
    fs.mkdirSync(path.dirname(root), { recursive: true });
    const repository = client.repositoryReference.replace(/^github:/, "");
    run("gh", ["repo", "clone", repository, root], repositoryRoot);
    run("git", ["switch", client.defaultBranch ?? "main"], root);
  }
  const base = {
    clientId: client.clientId,
    targetRelease: release.manifest.releaseId,
    previousRelease: null,
    sourceSha: release.manifest.sourceSha,
    fingerprint: release.fingerprint,
    repositoryReference: client.repositoryReference ?? null,
    branch: null,
    clientCommitSha: null,
    migration: { status: "NOT_CHECKED", target: release.manifest.database.migrationTarget },
    validation: { status: "NOT_RUN", checks: [] },
    pullRequest: { status: "NOT_CREATED" },
    deployment: { status: "NOT_READY", target: client.deploymentTarget ?? null },
  };
  const validation = validateClient(root, client, release, options);
  const prepared = { ...base, previousRelease: validation.previous?.releaseId ?? null, migration: validation.migration ?? base.migration };
  if (validation.status !== "READY") return { ...prepared, status: validation.status, errors: validation.errors };
  const branch = `shell-upgrade/${release.manifest.releaseId}`;
  if (!options.apply) return { ...prepared, status: validation.migration.pending ? "READY_FOR_MIGRATION" : "READY_FOR_CONTROLLED_UPGRADE", branch, errors: [] };
  if (validation.migration.pending && !options.applyDb) return { ...prepared, status: "BLOCKED_MIGRATION_APPROVAL_REQUIRED", branch, errors: ["approved forward migration is pending; rerun with --apply-db after migration approval"] };
  if (validation.migration.pending && options.applyDb) {
    try { run("supabase", ["db", "push", "--linked", "--workdir", root, "--yes"], repositoryRoot); }
    catch (error) { return { ...prepared, status: "BLOCKED_MIGRATION_APPLY", errors: [String(error.message).split("\n")[0]] }; }
  }
  if ((options.apply || options.validate) && !options.skipClientValidation) {
    const candidate = runCandidateChecks(root, client, release, validation.previous, releaseRoot);
    if (candidate.status !== "PASS" && candidate.status !== "SKIPPED_NO_PACKAGE_MANIFEST") {
      return { ...prepared, status: candidate.status, validation: candidate, errors: candidate.errors ?? [] };
    }
    prepared.validation = candidate;
  } else if (options.skipClientValidation) {
    prepared.validation = { status: "SKIPPED_BY_OPERATOR", checks: [], reason: "Alpha release snapshot excludes client test support paths used by the broad client test suite" };
  }
  if (localBranchExists(root, branch)) {
    if (status(root)) return { ...prepared, status: "BLOCKED_EXISTING_RELEASE_BRANCH_DIRTY", branch, errors: ["existing controlled release branch has uncommitted changes"] };
    run("git", ["switch", branch], root);
    run("git", ["merge", "--ff-only", client.defaultBranch ?? "main"], root);
  } else {
    run("git", ["switch", "-c", branch], root);
  }
  materializeRelease(root, release, validation.previous, releaseRoot);
  run("git", ["add", "-A"], root);
  if (!status(root)) return { ...prepared, status: "ALREADY_CURRENT", branch, errors: [] };
  run("git", ["commit", "-m", `upgrade: ${release.manifest.releaseId}`], root);
  const commit = capture("git", ["rev-parse", "HEAD"], root);
  const result = { ...prepared, status: "UPGRADE_PREPARED", branch, clientCommitSha: commit, migration: { ...validation.migration, status: validation.migration.pending ? "APPLIED_BY_ROLLOUT" : validation.migration.status }, errors: [] };
  if (options.push) {
    run("git", ["push", "--set-upstream", "origin", branch], root);
    result.pullRequest = { status: "PUSHED_PR_REQUESTED" };
    if (client.repositoryReference) {
      try {
        const pr = run("gh", ["pr", "create", "--base", client.defaultBranch ?? "main", "--head", branch, "--title", `Upgrade ${client.clientId} to ${release.manifest.releaseId}`, "--body", `Promotes Main source ${release.manifest.sourceSha}.`], root).trim();
        result.pullRequest = { status: "OPENED", reference: pr };
      } catch { result.pullRequest = { status: "PUSHED_PR_CREATE_FAILED" }; }
    }
  }
  result.pushed = options.push;
  result.deployment = { status: options.push ? "AWAITING_APPROVED_PR_MERGE" : "READY_TO_PUSH_AND_DEPLOY", target: client.deploymentTarget ?? null, expectedRepositorySha: commit, expectedMainSourceSha: release.manifest.sourceSha };
  return result;
}

export function promoteRegistry({ registryPath = defaultRegistry, releaseManifestPath = defaultReleaseManifest, ...options } = {}) {
  const registry = readJson(registryPath);
  let release = loadRelease(releaseManifestPath);
  const clients = (registry.clients ?? []).filter((client) => client.lifecycleStatus === "ACTIVE" && client.rolloutStatus !== "DISABLED");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-release-"));
  const releaseRoot = path.join(temporaryRoot, "release");
  try {
    run("git", ["archive", release.manifest.sourceSha, "-o", path.join(temporaryRoot, "release.tar")], repositoryRoot);
    fs.mkdirSync(releaseRoot, { recursive: true });
    run("tar", ["-xf", path.join(temporaryRoot, "release.tar"), "-C", releaseRoot], repositoryRoot);
    release = normalizeRelease(release, releaseRoot);
    const results = clients.map((client) => {
      try { return promoteClient(client, release, options, releaseRoot); }
      catch (error) { return { clientId: client.clientId, status: "FAILED_ISOLATED", errors: [String(error.message)] }; }
    });
    return { releaseId: release.manifest.releaseId, sourceSha: release.manifest.sourceSha, fingerprint: release.fingerprint, results, summary: results.map(({ clientId, status, errors = [] }) => ({ clientId, status, reason: errors[0] ?? null })) };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  try {
    const result = promoteRegistry({
      registryPath: options.registry ? path.resolve(repositoryRoot, options.registry) : defaultRegistry,
      releaseManifestPath: resolveReleaseManifest(options.release),
      ...options,
    });
    if (options.output) writeJson(path.resolve(repositoryRoot, options.output), result);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.results.some((item) => ["BLOCKED", "BLOCKED_CLIENT_ROOT_UNAVAILABLE", "FAILED_ISOLATED"].includes(item.status)) ? 1 : 0;
  } catch (error) {
    console.error(`Release promotion blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
