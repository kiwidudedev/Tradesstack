import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260801130000_correct_shadow_workspace_continuity.sql", import.meta.url),
  "utf8",
);

describe("Stage 4 permanent-workspace continuity correction", () => {
  it("remains additive and never performs promotion or lifecycle data mutation", () => {
    expect(migration).toContain("add column expected_difference_codes");
    expect(migration).not.toMatch(/promote_opportunity_workspace_v1\s*\(/i);
    expect(migration).not.toMatch(/insert into public\.opportunity_(final_projects|promotion_events)/i);
    expect(migration).not.toMatch(/update public\.organization_(opportunities|projects)/i);
    expect(migration).not.toMatch(/update public\.opportunity_lifecycles/i);
  });

  it("uses a versioned pure W-continuity evaluator", () => {
    expect(migration).toContain("evaluate_opportunity_promotion_shadow_v2");
    expect(migration).toContain("get_opportunity_workspace_continuity_snapshot_v1");
    expect(migration).toMatch(/language (sql|plpgsql)\s+stable\s+security definer/g);
    expect(migration).toContain("'shadow-v2'");
  });

  it("compares permanent identities, relationships, quantities, and history", () => {
    for (const evidence of [
      "task_continuity_mismatch",
      "takeoff_page_continuity_mismatch",
      "measurement_continuity_mismatch",
      "calibration_continuity_mismatch",
      "workspace_history_continuity_mismatch",
      "pricing_workbook_continuity_mismatch",
      "quantity_total",
      "event_count",
      "activity_count",
      "relationships_valid",
    ]) {
      expect(migration).toContain(evidence);
    }
  });

  it("classifies F omissions as expected only after W continuity has no mismatch", () => {
    expect(migration).toContain("if cardinality(mismatches) = 0 then");
    expect(migration).toContain("legacy_final_does_not_own_workspace_tasks");
    expect(migration).toContain("promoted_workspace_takeoff_continuity_verified");
    expect(migration).toContain("expected_difference_codes = expected_differences");
  });

  it("keeps trusted-only access and immutable finalized observations", () => {
    expect(migration).toContain("to service_role");
    expect(migration).toContain("Opportunity promotion shadow observations are immutable");
    expect(migration).not.toMatch(/grant execute[\s\S]*?to authenticated/i);
  });
});
