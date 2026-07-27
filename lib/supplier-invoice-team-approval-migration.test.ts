import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260720210500_extend_supplier_invoice_site_review_to_allocations.sql",
  "utf8",
);

describe("Supplier Invoice line-level Team Approval migration", () => {
  it("extends the existing RPC without adding a review table or changing allocation RLS", () => {
    expect(migration).toContain("p_allocation_id uuid");
    expect(migration).toContain("supplier_invoice_line_allocations");
    expect(migration).not.toMatch(/create table/i);
    expect(migration).not.toMatch(/create policy|alter policy/i);
  });

  it("validates the allocation snapshot and current finance version", () => {
    expect(migration).toContain("p_allocation_id = any(v_parent.allocation_ids_snapshot)");
    expect(migration).toContain("supplier_invoice_finance_version_hash");
    expect(migration).toContain("match_status in ('accepted', 'adjusted')");
    expect(migration).toContain("project_member.is_active");
  });

  it("updates one allocation and recomputes PO and submission aggregates", () => {
    expect(migration).toContain("where id = p_allocation_id");
    expect(migration).toContain("v_parent_status := case");
    expect(migration).toContain("v_submission_status := case");
    expect(migration).toContain("site_review_line_approved");
    expect(migration).toContain("site_review_line_disputed");
  });

  it("serializes concurrent decisions and keeps same-line retries idempotent", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_decision_id::text, 2))");
    expect(migration).toContain("for update");
    expect(migration).toContain("This Supplier Invoice line has already been reviewed.");
    expect(migration).toContain("return p_decision_id;");
  });

  it("resets current allocation review projections on invalidation while preserving activity", () => {
    expect(migration).toContain("approval_status = 'pending'");
    expect(migration).toContain("review_status = 'pending'");
    expect(migration).toContain("approval_checks_json = '{}'::jsonb");
    expect(migration).not.toMatch(/delete from public\.supplier_invoice_activity_events/i);
  });
});
