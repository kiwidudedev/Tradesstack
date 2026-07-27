import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260606044500_fix_pattern_processing_status_constraint.sql",
);

describe("worksheet pricing pattern processing status constraint fix migration", () => {
  it("drops both historical constraint names and reapplies the claim-based status set", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("drop constraint if exists worksheet_pricing_pattern_evidence_processing_processing_status_check");
    expect(sql).toContain("drop constraint if exists worksheet_pricing_pattern_evidence_proc_processing_status_check");
    expect(sql).toContain("processing_status in ('pending', 'claimed', 'processed', 'retry_scheduled', 'dead_lettered')");
  });
});
