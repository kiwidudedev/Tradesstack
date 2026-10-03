import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { promoteRegistry } from "./promote-release.mjs";

const repositoryRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const sourceSha = execFileSync("git", ["rev-parse", "afade9636fe8cc19ce65cfd3f921527b8de7cc6f"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
const files = [
  "lib/application-shell-release.ts",
  "lib/commercial-items/purchase-order-linking.ts",
  "lib/commercial-items/purchase-order-linking.test.ts",
  "lib/commercial-items-project-quote-source-link-migration.test.ts",
  "supabase/migrations/20261003130000_allow_project_quote_worksheet_source_links.sql",
];

function hash(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function run(args, cwd) { execFileSync("git", args, { cwd, stdio: "ignore" }); }

function fixture(root, id, dirty = false) {
  for (const file of files) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, file), destination);
  }
  fs.mkdirSync(path.join(root, "client"), { recursive: true });
  fs.writeFileSync(path.join(root, "client", `${id}.config`), `${id}-owned\n`);
  writeJson(path.join(root, "package.json"), {
    name: `fixture-${id}`,
    scripts: {
      "test:release": "node -e \"process.stdout.write('fixture tests passed\\n')\"",
      "typecheck:release": "node -e \"process.stdout.write('fixture typecheck passed\\n')\"",
      build: "node -e \"process.stdout.write('fixture build passed\\n')\"",
    },
  });
  const hashes = Object.fromEntries(files.map((file) => [file, hash(path.join(root, file))]));
  writeJson(path.join(root, "release-manifest.json"), { releaseId: "fixture-old", sourceSha, files, fileHashes: hashes });
  run(["init", "-q", "-b", "main"], root);
  run(["config", "user.name", "promotion-proof"], root);
  run(["config", "user.email", "promotion-proof@example.test"], root);
  run(["add", "-A"], root);
  run(["commit", "-qm", "fixture baseline"], root);
  if (dirty) fs.appendFileSync(path.join(root, files[0]), "\n// undeclared client core drift\n");
}

test("one Main release fans out while preserving two client configurations", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-promotion-proof-"));
  try {
    const alpha = path.join(root, "client-one");
    const beta = path.join(root, "client-two");
    const blocked = path.join(root, "client-blocked");
    fixture(alpha, "one"); fixture(beta, "two"); fixture(blocked, "blocked", true);
    const release = {
      schemaVersion: 1,
      releaseId: "9.9.9",
      version: "9.9.9",
      displayLabel: "TradesStack 9.9.9",
      releaseType: "OFFICIAL",
      status: "APPROVED",
      releaseDate: "2026-10-03",
      previousRelease: "9.9.8",
      sourceSha,
      applicationShell: { releaseId: "1.0.0", fingerprint: "730107a9922d91f8b4a30f50b418a849639c82ba54d82e3d0679b051246525d6" },
      database: { baseline: "phase1o-1", migrationTarget: files.at(-1).split("/").at(-1) },
      clientConfig: { contract: "@tradesstack/client-config@0.0.0" },
      toolchain: { node: "22.22.2", npm: "11.6.2", next: "16.3.3" },
      validation: { status: "PASS" },
      approval: { realClient: "APPROVED" },
      files,
      fileHashes: Object.fromEntries(files.map((file) => [file, hash(path.join(repositoryRoot, file))])),
    };
    const registry = {
      schemaVersion: 1,
      clients: [
        { clientId: "client-one", lifecycleStatus: "ACTIVE", rolloutStatus: "ENABLED", defaultBranch: "main", localRoot: alpha },
        { clientId: "client-two", lifecycleStatus: "ACTIVE", rolloutStatus: "ENABLED", defaultBranch: "main", localRoot: beta },
        { clientId: "client-blocked", lifecycleStatus: "ACTIVE", rolloutStatus: "ENABLED", defaultBranch: "main", localRoot: blocked },
      ],
    };
    const releasePath = path.join(root, "release.json");
    const registryPath = path.join(root, "registry.json");
    writeJson(releasePath, release); writeJson(registryPath, registry);
    const result = promoteRegistry({ registryPath, releaseManifestPath: releasePath, workspace: root, apply: true, push: false, skipDb: true });
    assert.deepEqual(result.results.map((item) => item.status), ["UPGRADE_PREPARED", "UPGRADE_PREPARED", "BLOCKED"]);
    assert.equal(result.results[0].validation.status, "PASS");
    assert.deepEqual(result.results[0].validation.checks.map((check) => check.status), ["PASS", "PASS", "PASS", "PASS"]);
    assert.equal(result.results[0].migration.status, "SKIPPED_BY_OPERATOR");
    assert.equal(result.results[0].sourceSha, sourceSha);
    assert.equal(result.results[0].fingerprint, result.results[1].fingerprint);
    assert.equal(result.results[2].errors.some((error) => error.includes("release-owned divergence:")), true);
    for (const [client, id] of [[alpha, "one"], [beta, "two"]]) {
      assert.equal(fs.readFileSync(path.join(client, "client", `${id}.config`), "utf8"), `${id}-owned\n`);
      assert.equal(hash(path.join(client, files[1])), release.fileHashes[files[1]]);
      assert.equal(JSON.parse(fs.readFileSync(path.join(client, "release-manifest.json"), "utf8")).releaseId, release.releaseId);
    }
    assert.equal(fs.readFileSync(path.join(blocked, files[0]), "utf8").includes("undeclared client core drift"), true);
    assert.equal(result.results[2].status, "BLOCKED");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
