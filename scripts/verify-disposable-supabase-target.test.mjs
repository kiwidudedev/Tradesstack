import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = path.resolve("scripts/verify-disposable-supabase-target.mjs");

function fixture(projectId, apiPort, dbPort) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tradesstack-guard-"));
  fs.mkdirSync(path.join(root, "supabase"));
  fs.writeFileSync(path.join(root, "supabase", "config.toml"), `project_id = "${projectId}"\n[api]\nport = ${apiPort}\n[db]\nport = ${dbPort}\n`);
  return root;
}

function run(sourceCopy, projectId, apiPort, dbPort) {
  return execFileSync(process.execPath, [script, "--source-copy", sourceCopy, "--expected-project-id", projectId, "--api-port", String(apiPort), "--db-port", String(dbPort), "--studio-port", "60423", "--protected-project-id", "Tradesstack-ai", "--protected-ports", "54321,54322,54323", "--marker", "tradesstack-0d3-acceptance"], { encoding: "utf8", stdio: "pipe" });
}

describe("disposable Supabase target guard", () => {
  it("allows the marked disposable target", () => {
    const root = fixture("tradesstack-0d3-acceptance", 60421, 60422);
    expect(run(root, "tradesstack-0d3-acceptance", 60421, 60422)).toContain("DISPOSABLE TARGET VERIFIED");
  });

  it("rejects the protected active local target", () => {
    const root = fixture("Tradesstack-ai", 54321, 54322);
    expect(() => run(root, "Tradesstack-ai", 54321, 54322)).toThrow();
  });

  it("rejects an unknown target", () => {
    const root = fixture("unknown-target", 60431, 60432);
    expect(() => run(root, "unknown-target", 60431, 60432)).toThrow();
  });
});
