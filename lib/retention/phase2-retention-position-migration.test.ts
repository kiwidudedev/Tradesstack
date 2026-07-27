import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260723120000_add_retention_position_read_model.sql";
const sql = readFileSync(migrationPath, "utf8");
const generatedTypes = readFileSync("lib/supabase/types.ts", "utf8");

describe("Retention Position Phase 2 migration", () => {
  it("adds only the canonical read functions and chronology index", () => {
    expect(sql).toContain(
      "create or replace function public.get_project_retention_position_summary",
    );
    expect(sql).toContain(
      "create or replace function public.get_project_retention_position_page",
    );
    expect(sql).toContain("project_claims_retention_position_chronology_idx");
    expect(sql).toContain("claim_date asc nulls last");
    expect(sql).toContain("created_at asc");
    expect(sql).toContain("id asc");
    expect(sql).not.toMatch(/create\s+(materialized\s+)?view/i);
    expect(sql).not.toMatch(/create\s+table/i);
  });

  it("derives from persisted Payment Claim snapshots without invoking writes", () => {
    expect(sql).toContain("from public.project_claims claim");
    expect(sql).toContain("claim.retention_withheld_amount");
    expect(sql).toContain("claim.retention_released_amount");
    expect(sql).toContain("claim.retention_balance");
    expect(sql).not.toMatch(/\b(update|insert into|delete from)\s+public\.project_claims\b/i);
    expect(sql).not.toContain("recalculate_project_claim_snapshots");
    expect(sql).not.toContain("sync_project_claim_line_items");
    expect(sql).not.toContain("save_project_claim");
  });

  it("does not introduce later-phase Retention Claim concepts", () => {
    for (const forbidden of [
      "retention_claims",
      "retention_claim_allocations",
      "retention_variances",
      "retention_schedules",
      "retention_reminders",
      "organization_accounting_documents",
      "organization_accounting_sync_jobs",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
    expect(sql).not.toContain("availableToClaim");
    expect(sql).not.toContain("claimedThroughRetentionClaims");
  });

  it("uses movement values for active totals and cumulative snapshots only for diagnostics", () => {
    expect(sql).toContain("status <> 'Cancelled'");
    expect(sql).toContain("total_retention_withheld");
    expect(sql).toContain("total_legacy_retention_released");
    expect(sql).toContain("movement_derived_balance");
    expect(sql).toContain("latest_cumulative_snapshot_mismatch");
    expect(sql).not.toMatch(
      /sum\s*\(\s*coalesce\s*\(\s*retention_released_to_date/i,
    );
  });

  it("implements capability, mode, permission, and tenant gating", () => {
    expect(sql).toContain(
      "public.has_org_permission(v_organization_id, 'retention.view')",
    );
    expect(sql).toContain("member.user_id = v_actor_user_id");
    expect(sql).toContain("when not v_capability_enabled then 'capability_disabled'");
    expect(sql).toContain("when v_mode = 'observe' then 'available'");
    expect(sql).toContain("when v_mode = 'legacy' then 'legacy_mode'");
    expect(sql).not.toContain("transition_project_retention_workflow_mode");
  });

  it("uses a deterministic server-side SHA-256 state hash", () => {
    expect(sql).toContain("extensions.digest(hash_input.serialized_state, 'sha256')");
    expect(sql).toContain("string_agg(");
    expect(sql).toContain("order by claim.chronological_sequence");
    expect(sql).toContain("'FM999999999999999999990.00'");
    expect(sql).toContain("'FM999999999999999999990.000'");
  });

  it("updates generated types for both Phase 2 RPCs", () => {
    expect(generatedTypes).toContain("get_project_retention_position_page:");
    expect(generatedTypes).toContain("get_project_retention_position_summary:");
  });
});
