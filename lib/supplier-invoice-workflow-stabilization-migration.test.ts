import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260718090000_stabilize_supplier_invoice_workflow_phase_ab.sql",
  "utf8",
);

describe("Supplier Invoice workflow stabilization migration", () => {
  it("uses stable PostgreSQL whitespace normalization", () => {
    expect(migration).toContain("'[[:space:]]+'");
    expect(migration).not.toContain("'\\\\s+'");
  });

  it("makes workflow decisions idempotent without exposing legacy implementations", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("if v_submission_id is not null then return v_submission_id");
    expect(migration).toContain("if v_approval_id is not null then return v_approval_id");
    expect(migration).toContain("if v_existing_decision = p_decision then return p_decision_id");
    expect(migration).toContain("set schema private");
    expect(migration).toContain("revoke all on schema private from public, anon, authenticated");
  });

  it("validates line references inside the resolved organization", () => {
    expect(migration).toContain("A Supplier Invoice line cost code does not belong to this organization.");
    expect(migration).toContain("A Supplier Invoice line project does not belong to this organization.");
  });

  it("scopes QS and PM reads to active project membership", () => {
    expect(migration).toContain("can_view_supplier_invoice_workflow");
    expect(migration).toContain("pm.organization_member_id = m.id");
    expect(migration).toContain("pm.is_active");
  });

  it("requires Accounts permissions for legacy direct mutations and commercial decisions", () => {
    expect(migration).toContain("supplier_invoices.capture");
    expect(migration).toContain("supplier_invoices.accounts_approve");
    expect(migration).toContain("approve_supplier_invoice_commercially_phase_ab_legacy");
    expect(migration).toContain("Privileged reviewers can create project actual cost events");
  });
});
