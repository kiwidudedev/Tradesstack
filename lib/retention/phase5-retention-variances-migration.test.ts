import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260723150000_add_retention_variance_foundation.sql",
  ),
  "utf8",
);

describe("Phase 5 retention variance migration", () => {
  it("adds isolated variance, append-only event, and bounded scanner entities", () => {
    for (const table of [
      "retention_variances",
      "retention_variance_events",
      "retention_variance_scan_runs",
      "retention_variance_scan_queue",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
    expect(migration).toContain("Retention variance events are append-only.");
    expect(migration).toContain("for update skip locked");
  });

  it("contains the stable type, state, event, and error vocabulary", () => {
    for (const value of [
      "ownership_reduced",
      "eligibility_reduced",
      "origin_payment_claim_cancelled",
      "schedule_changed",
      "schedule_cancelled",
      "legacy_reconciliation_conflict",
      "xero_local_financial_divergence",
      "corrective_transaction_pending",
      "warning",
      "reconciliation_required",
      "over_allocated",
      "resolution_pending",
      "resolved",
      "accepted_contractual_override",
      "variance_detected",
      "variance_reopened",
      "variance_auto_cleared",
      "variance_blocking",
      "live_position_still_invalid",
      "scan_already_claimed",
    ]) {
      expect(migration).toContain(`'${value}'`);
    }
  });

  it("uses current ownership, eligibility, immutable commitments, and unclamped diagnostics", () => {
    expect(migration).toContain("'ownershipVariance',round(v_owned-v_committed,2)");
    expect(migration).toContain("'eligibilityVariance',round(v_eligible-v_committed,2)");
    expect(migration).toContain(
      "'allocatableAvailability',greatest(round(least(v_owned,v_eligible)-v_committed,2),0)",
    );
    expect(migration).toContain("where c.status='submitted'");
    expect(migration).toContain("committedAllocationHash");
  });

  it("does not write or recalculate Payment Claims", () => {
    expect(migration).not.toMatch(/update public\.project_claims/i);
    expect(migration).not.toMatch(/insert into public\.project_claims/i);
    expect(migration).not.toMatch(/delete from public\.project_claims/i);
    expect(migration).not.toContain("recalculate_project_claim");
  });

  it("wraps only the approved Phase 3 and Phase 4 operations", () => {
    for (const name of [
      "submit_retention_claim_phase4_pre_variance",
      "refresh_retention_claim_eligibility_state_phase4_pre_variance",
      "activate_retention_release_schedule_phase4_pre_variance",
      "cancel_retention_release_schedule_phase4_pre_variance",
      "complete_retention_release_schedule_phase4_pre_variance",
    ]) {
      expect(migration).toContain(name);
    }
  });
});
