import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260724110000_add_legacy_retention_reconciliation.sql",
  ),
  "utf8",
);

describe("Phase 6 legacy retention reconciliation migration", () => {
  it("adds isolated case, source, allocation, and append-only event entities", () => {
    for (const table of [
      "retention_legacy_reconciliation_cases",
      "retention_legacy_release_sources",
      "retention_legacy_release_allocations",
      "retention_legacy_reconciliation_events",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
    expect(migration).toContain(
      "Retention legacy reconciliation events are append-only.",
    );
  });

  it("requires explicit evidence-backed source-to-origin allocation and approval", () => {
    for (const value of [
      "reconciliation_evidence_required",
      "legacy_sources_not_fully_allocated",
      "source_overallocated",
      "origin_overallocated",
      "origin_after_legacy_release",
      "approval_reason_required",
      "retention.legacy.reconcile",
      "retention.legacy.approve",
    ]) {
      expect(migration).toContain(`'${value}'`);
    }
    expect(migration).toContain("allocation_amount numeric(14,2)");
    expect(migration).toContain("evidence_reference text null");
    expect(migration).toContain("approved_by=auth.uid(),approved_at=now()");
  });

  it("keeps approved evidence immutable and consumes it in native availability", () => {
    expect(migration).toContain("Approved legacy reconciliation evidence is immutable.");
    expect(migration).toContain("private.current_legacy_committed_by_origin");
    expect(migration).toContain("'legacyCommittedRetention'");
    expect(migration).toContain("'legacy_reconciliation_conflict'");
    expect(migration).toContain(
      "a.existing_submitted_allocation_before+coalesce(l.amount,0)",
    );
    expect(migration).toContain(
      "l.originating_payment_claim_id=a.originating_payment_claim_id",
    );
  });

  it("does not mutate Payment Claims or create invoices, payments, or Xero records", () => {
    expect(migration).not.toMatch(/update public\.project_claims/i);
    expect(migration).not.toMatch(/insert into public\.project_claims/i);
    expect(migration).not.toMatch(/delete from public\.project_claims/i);
    expect(migration).not.toContain("recalculate_project_claim");
    expect(migration).not.toMatch(/insert into public\..*invoice/i);
    expect(migration).not.toMatch(/insert into public\..*payment/i);
    expect(migration).not.toMatch(/insert into public\..*xero/i);
  });

  it("preserves the Phase 2 raw read model and wraps only approved boundaries", () => {
    expect(migration).toContain(
      "get_project_retention_position_summary_phase2_pre_legacy_reconciliation",
    );
    expect(migration).toContain("retention_eligibility_state_phase4_pre_legacy");
    expect(migration).toContain("retention_variance_snapshot_phase5_pre_legacy");
    expect(migration).toContain("submit_retention_claim_phase5_pre_legacy");
  });
});
