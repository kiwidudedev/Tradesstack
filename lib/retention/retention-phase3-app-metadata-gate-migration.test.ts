import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260725120000_allow_signed_app_metadata_retention_phase3_gate.sql",
  ),
  "utf8",
);

describe("signed app_metadata Retention Phase 3 gate migration", () => {
  it("preserves existing gate inputs and accepts the admin-managed signed claim", () => {
    expect(sql).toContain(
      "current_setting('request.jwt.claim.retention_phase3_internal', true)",
    );
    expect(sql).toContain("->> 'retention_phase3_internal'");
    expect(sql).toContain(
      "#>> '{app_metadata,retention_phase3_internal}'",
    );
  });

  it("does not grant the private gate to browser roles", () => {
    expect(sql).toContain(
      "revoke all on function private.retention_claim_phase3_gate_enabled()",
    );
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toContain("grant execute");
  });
});
