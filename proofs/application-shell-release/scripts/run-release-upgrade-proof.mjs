import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const proofRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(proofRoot, "../..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-1r-"));
const releaseSourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
const generated = path.join(temporaryRoot, "releases");
const alphaRoot = path.join(temporaryRoot, "client-alpha");
const freshRoot = path.join(temporaryRoot, "fresh-alpha-b");
const clientOwnedPaths = ["client/config/client-alpha.ts", "client/CLIENT_OWNERSHIP.md"];
const environmentPath = ".env.local";
const generatedPaths = new Set(["next-env.d.ts", "package-lock.json"]);
const rootFiles = [
  ".gitattributes", ".gitignore", ".nvmrc", ".env.example", "eslint.config.mjs", "next-env.d.ts", "next.config.ts",
  "package.json", "package-lock.json", "postcss.config.js", "proxy.ts", "tailwind.config.ts",
  "tsconfig.json", "tsconfig.build.json", "vercel.json", "vitest.config.ts",
];
const sourceDirectories = ["app", "components", "hooks", "lib", "packages", "public", "styles", "types"];
const supabaseDirectories = ["functions", "migrations"];
const releaseExclusions = [
  ".git", ".env", ".env.local", ".env.test.local", "node_modules", ".next", ".tmp", ".dsh-drop",
  "artifacts", "proofs", "docs", "scripts", "supabase/.temp", "supabase/.branches", "tsconfig.tsbuildinfo",
  "tsconfig.build.tsbuildinfo", "Back",
];

function assert(condition, message) { if (!condition) throw new Error(message); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function sha256File(file) { return sha256(fs.readFileSync(file)); }
function json(value) { return JSON.stringify(value, null, 2) + "\n"; }
function rel(root, file) { return path.relative(root, file).split(path.sep).join("/"); }
function inside(target, root, label) {
  const t = path.resolve(target); const r = path.resolve(root);
  assert(t === r || t.startsWith(`${r}${path.sep}`), `${label} escaped disposable root`);
}
function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: "inherit", ...options });
}
function capture(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}
function copyTree(source, destination) {
  fs.cpSync(source, destination, { recursive: true, filter: (entry) => {
    const relative = path.relative(repositoryRoot, entry).split(path.sep).join("/");
    return !releaseExclusions.some((item) => relative === item || relative.startsWith(`${item}/`));
  }});
}
function listFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full); else files.push(rel(root, full));
    }
  }
  visit(root); return files;
}
function write(root, relative, content) {
  const file = path.join(root, relative); inside(file, root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
}
function shellMarker(releaseId, sourceSha) {
  return `/** Master-owned application-shell provenance marker. */\nexport const APPLICATION_SHELL_RELEASE = "${releaseId}" as const;\nexport const APPLICATION_SHELL_SOURCE_SHA = "${sourceSha}" as const;\n`;
}
function shellManifest(releaseRoot, releaseId) {
  const files = listFiles(releaseRoot).filter((file) => file !== "release-manifest.json");
  const hashes = Object.fromEntries(files.map((file) => [file, sha256File(path.join(releaseRoot, file))]));
  const fingerprint = sha256(files.map((file) => `${file}:${hashes[file]}`).join("\n"));
  const manifest = {
    schemaVersion: 1,
    releaseId,
    sourceSha: releaseSourceSha,
    sourceWorkingTree: "dirty-preserved; generated from current Master workspace",
    fingerprint,
    clientConfigContract: "@tradesstack/client-config@0.0.0 schema 1",
    databaseCompatibility: "Phase 1O phase1o-1 baseline plus approved forward migrations; no DB change in 1R",
    packageIdentities: {
      "@tradesstack/core-contracts": "0.0.0",
      "@tradesstack/client-config": "0.0.0",
      "@tradesstack/shared-ui": "0.0.0",
      "@tradesstack/pdf-utils": "0.0.0",
      "@tradesstack/suppliers": "0.0.0",
    },
    includedCategories: ["app", "components", "hooks", "lib", "packages", "public", "styles", "types", "root build/test config", "supabase config/migrations/functions"],
    excludedCategories: releaseExclusions,
    files,
    fileHashes: hashes,
  };
  write(releaseRoot, "release-manifest.json", json(manifest));
  return manifest;
}
function makeRelease(releaseId) {
  const root = path.join(generated, releaseId);
  fs.mkdirSync(root, { recursive: true });
  for (const directory of sourceDirectories) copyTree(path.join(repositoryRoot, directory), path.join(root, directory));
  for (const file of rootFiles) {
    const source = path.join(repositoryRoot, file); if (fs.existsSync(source)) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.copyFileSync(source, path.join(root, file)); }
  }
  fs.mkdirSync(path.join(root, "supabase"), { recursive: true });
  for (const file of ["config.toml"]) fs.copyFileSync(path.join(repositoryRoot, "supabase", file), path.join(root, "supabase", file));
  for (const directory of supabaseDirectories) copyTree(path.join(repositoryRoot, "supabase", directory), path.join(root, "supabase", directory));
  write(root, "lib/application-shell-release.ts", shellMarker(releaseId, releaseSourceSha));
  const manifest = shellManifest(root, releaseId);
  return { root, manifest };
}
function initClient(root, release) {
  fs.cpSync(release.root, root, { recursive: true });
  write(root, "client/config/client-alpha.ts", `import { defineTradesStackClientConfig } from "@tradesstack/client-config";\n\nexport const CLIENT_ALPHA_CONFIG = defineTradesStackClientConfig(${json({ schemaVersion: 1, identity: { clientKey: "client-alpha", displayName: "Client Alpha", description: "Fictional local Phase 1R proof client" }, theme: { platformColor: "#123456", actionColor: "#D9480F" }, defaults: { locale: "en-NZ", currency: "NZD", timezone: "Pacific/Auckland" } })});\n`);
  write(root, "client/CLIENT_OWNERSHIP.md", "# Client Alpha owned material\n\nThis directory is the fictional client's deployment/configuration boundary. It is preserved by application-shell upgrades.\n");
  write(root, environmentPath, "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=phase1r-local-public-placeholder\nNEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000\nTRADESSTACK_CLIENT_KEY=client-alpha\nTRADESSTACK_APP_NAME=Client Alpha\nTRADESSTACK_APP_DESCRIPTION=Fictional local Phase 1R proof client\nTRADESSTACK_PLATFORM_COLOR=#123456\nTRADESSTACK_ACTION_COLOR=#D9480F\nTRADESSTACK_DEFAULT_LOCALE=en-NZ\nTRADESSTACK_DEFAULT_CURRENCY=NZD\nTRADESSTACK_DEFAULT_TIMEZONE=Pacific/Auckland\n");
  run("git", ["init", "-q", "-b", "main"], root);
  run("git", ["config", "user.name", "TradesStack Phase 1R Proof"], root);
  run("git", ["config", "user.email", "phase1r-proof@example.test"], root);
  run("git", ["add", "-A"], root); run("git", ["commit", "-qm", `application-shell ${release.manifest.releaseId}`], root);
}
function fileHash(root, file) { return sha256File(path.join(root, file)); }
function releaseFiles(manifest) { return manifest.files; }
function replaceReleaseOwned(root, fromManifest, toRelease) {
  const currentHashMismatches = [];
  for (const file of releaseFiles(fromManifest)) {
    const current = path.join(root, file);
    if (!generatedPaths.has(file) && (!fs.existsSync(current) || fileHash(root, file) !== fromManifest.fileHashes[file])) currentHashMismatches.push(file);
  }
  assert(currentHashMismatches.length === 0, `upgrade refused: release-owned divergence in ${currentHashMismatches.join(", ")}`);
  for (const file of releaseFiles(fromManifest)) if (!toRelease.manifest.files.includes(file)) fs.rmSync(path.join(root, file), { force: true });
  for (const file of toRelease.manifest.files) {
    const source = path.join(toRelease.root, file); const destination = path.join(root, file); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination);
  }
  write(root, "release-manifest.json", json(toRelease.manifest));
}
function gitStatus(root) { return capture("git", ["status", "--short"], root); }
function installAndCheck(root, label) {
  run("npm", ["install", "--no-audit", "--no-fund"], root);
  const resolved = path.resolve(root, "node_modules/next/package.json");
  assert(resolved.startsWith(`${path.resolve(root)}${path.sep}`), `${label} Next resolution escaped client repo`);
  run("npx", ["tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.build.json"], root);
  run("npx", ["vitest", "run", "packages/client-config/src/index.test.ts", "packages/core-contracts/src/index.test.ts", "packages/pdf-utils/src/index.test.ts", "packages/shared-ui/src/index.test.tsx", "packages/suppliers/src/index.test.ts"], root);
  run("npm", ["run", "build"], root, { env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "phase1r-local-public-placeholder", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000" } });
}
function normalizedProductDiff(upgraded, fresh, manifest) {
  const differences = [];
  for (const file of manifest.files) {
    if (!generatedPaths.has(file)) {
      const a = sha256File(path.join(upgraded, file)); const b = sha256File(path.join(fresh, file)); if (a !== b) differences.push(file);
    }
  }
  return differences;
}
function assertReleaseSafety(release) {
  const files = listFiles(release.root);
  assert(!files.some((file) => file === ".env.local" || file === ".env.test.local" || file.startsWith("node_modules/") || file.startsWith(".git/")), "release contains local/generated state");
  const suspicious = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(release.root, file));
    if (content.includes(Buffer.from("/Users/corey/"))) suspicious.push(`${file}:absolute-master-path`);
    if (content.includes(Buffer.from("sb_secret_")) || content.includes(Buffer.from("sk-proj-")) || content.includes(Buffer.from("service_role_key="))) suspicious.push(`${file}:credential-pattern`);
  }
  assert(suspicious.length === 0, `release safety scan failed: ${suspicious.join(", ")}`);
}

try {
  inside(generated, temporaryRoot, "release output"); inside(alphaRoot, temporaryRoot, "client output"); inside(freshRoot, temporaryRoot, "fresh output");
  fs.mkdirSync(generated, { recursive: true });
  const releaseA = makeRelease("0.0.0-phase1r.1");
  const releaseB = makeRelease("0.0.0-phase1r.2");
  assertReleaseSafety(releaseA); assertReleaseSafety(releaseB);
  assert(releaseA.manifest.fingerprint !== releaseB.manifest.fingerprint, "Release A and B must differ");
  const secondA = makeRelease("0.0.0-phase1r.1");
  assert(releaseA.manifest.fingerprint === secondA.manifest.fingerprint, "Release A content was not reproducible");
  initClient(alphaRoot, releaseA);
  const configBefore = fileHash(alphaRoot, clientOwnedPaths[0]);
  const ownershipBefore = fileHash(alphaRoot, clientOwnedPaths[1]);
  const envBefore = fileHash(alphaRoot, environmentPath);
  installAndCheck(alphaRoot, "Alpha A");
  const initialCommit = capture("git", ["rev-parse", "HEAD"], alphaRoot);

  // A release-owned edit must fail closed before any file is overwritten.
  const releaseOwnedPath = "lib/application-shell-release.ts";
  const releaseOwnedOriginal = fs.readFileSync(path.join(alphaRoot, releaseOwnedPath));
  fs.appendFileSync(path.join(alphaRoot, releaseOwnedPath), "// local divergence\n");
  let conflictDetected = false;
  try { replaceReleaseOwned(alphaRoot, releaseA.manifest, releaseB); } catch (error) { conflictDetected = String(error.message).includes("release-owned divergence"); }
  assert(conflictDetected, "release-owned modification was not rejected");
  fs.writeFileSync(path.join(alphaRoot, releaseOwnedPath), releaseOwnedOriginal);

  // Client-owned modifications and deployment bindings must survive the upgrade.
  fs.appendFileSync(path.join(alphaRoot, "client/CLIENT_OWNERSHIP.md"), "\nClient Alpha local note.\n");
  const modifiedConfig = fs.readFileSync(path.join(alphaRoot, clientOwnedPaths[0]), "utf8").replace("Client Alpha", "Client Alpha Custom");
  fs.writeFileSync(path.join(alphaRoot, clientOwnedPaths[0]), modifiedConfig);
  fs.appendFileSync(path.join(alphaRoot, environmentPath), "TRADESSTACK_PHASE1R_LOCAL_BINDING=alpha\n");
  const configModifiedBefore = fileHash(alphaRoot, clientOwnedPaths[0]);
  const ownershipModifiedBefore = fileHash(alphaRoot, clientOwnedPaths[1]);
  const envModifiedBefore = fileHash(alphaRoot, environmentPath);
  replaceReleaseOwned(alphaRoot, releaseA.manifest, releaseB);
  assert(fileHash(alphaRoot, clientOwnedPaths[0]) === configModifiedBefore, "client config was overwritten");
  assert(fileHash(alphaRoot, clientOwnedPaths[1]) === ownershipModifiedBefore, "client-owned file was overwritten");
  assert(fileHash(alphaRoot, environmentPath) === envModifiedBefore, "environment binding was overwritten");
  assert(fs.readFileSync(path.join(alphaRoot, releaseOwnedPath), "utf8").includes(releaseB.manifest.releaseId), "Release B marker missing");
  run("git", ["add", "-A"], alphaRoot); run("git", ["commit", "-qm", `application-shell upgrade ${releaseB.manifest.releaseId}`], alphaRoot);
  installAndCheck(alphaRoot, "Alpha B");
  const upgradeCommit = capture("git", ["rev-parse", "HEAD"], alphaRoot);

  initClient(freshRoot, releaseB);
  installAndCheck(freshRoot, "Fresh B");
  const unresolved = normalizedProductDiff(alphaRoot, freshRoot, releaseB.manifest);
  assert(unresolved.length === 0, `upgraded B differs from fresh B: ${unresolved.join(", ")}`);
  assert(fileHash(alphaRoot, clientOwnedPaths[0]) === configModifiedBefore, "config changed after build");
  assert(fileHash(alphaRoot, clientOwnedPaths[1]) === ownershipModifiedBefore, "client-owned file changed after build");
  assert(fileHash(alphaRoot, environmentPath) === envModifiedBefore, "environment changed after build");
  assert(configBefore !== configModifiedBefore && ownershipBefore !== ownershipModifiedBefore && envBefore !== envModifiedBefore, "client-owned modification test did not modify inputs");
  assert(gitStatus(alphaRoot).includes(".env.local") === false, "environment binding was accidentally committed");

  console.log(JSON.stringify({
    verdict: "PASS 1R COMPLETE — APPLICATION-SHELL RELEASE + CLIENT UPGRADE PROVEN",
    model: "HYBRID APPLICATION-SHELL RELEASE MODEL",
    sourceSha: releaseSourceSha,
    releaseA: { id: releaseA.manifest.releaseId, fingerprint: releaseA.manifest.fingerprint, files: releaseA.manifest.files.length },
    releaseB: { id: releaseB.manifest.releaseId, fingerprint: releaseB.manifest.fingerprint, files: releaseB.manifest.files.length },
    releaseDiff: { added: releaseB.manifest.files.filter((file) => !releaseA.manifest.files.includes(file)), modified: [releaseOwnedPath], deleted: [] },
    reproducible: true,
    conflictDetected,
    clientRepo: alphaRoot,
    initialCommit,
    upgradeCommit,
    clientOwnedPreserved: true,
    environmentPreserved: true,
    upgradedVsFreshBProductDifferences: unresolved,
    cleanup: "pending",
  }, null, 2));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
