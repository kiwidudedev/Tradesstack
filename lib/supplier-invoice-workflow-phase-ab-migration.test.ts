import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260717113000_add_supplier_invoice_role_workflow_phase_ab.sql",
  "utf8",
);

describe("Supplier Invoice workflow Phase A/B migration", () => {
  it("adds provider-neutral versioned workflow records and narrow permissions", () => {
    expect(migration).toContain("supplier_invoice_site_review_submissions");
    expect(migration).toContain("supplier_invoice_site_review_decisions");
    expect(migration).toContain("supplier_invoice_accounts_approvals");
    expect(migration).toContain("supplier_invoices.capture");
    expect(migration).toContain("supplier_invoices.site_review");
    expect(migration).toContain("supplier_invoices.accounts_approve");
    expect(migration).toContain("revoke insert, update, delete");
  });

  it("preserves display PO reference while hashing its normalized value", () => {
    expect(migration).toContain("supplier_po_reference text null");
    expect(migration).toContain("supplier_po_reference_normalized text");
    expect(migration).toContain("coalesce(i.supplier_po_reference_normalized, '')");
  });

  it("persists line IDs in place and deletes only omitted IDs", () => {
    expect(migration).toContain("on conflict (id) do update set");
    expect(migration).toContain("l.supplier_invoice_id <> p_invoice_id or l.organization_id <> v_organization_id");
    expect(migration).toContain("not (l.id = any(v_keep_line_ids))");
    expect(migration).not.toContain("delete from public.supplier_invoice_lines;\n");
  });

  it("creates one pending site decision per affected PO and scopes reviewers", () => {
    expect(migration).toContain("group by a.purchase_order_id, po.project_id");
    expect(migration).toContain("supplier_invoice_site_review_decisions_unique_po");
    expect(migration).toContain("pm.project_id = v_decision.project_id");
    expect(migration).toContain("pm.is_active");
  });

  it("matches or removes Purchase Orders transactionally with authoritative Supplier checks", () => {
    expect(migration).toContain("set_supplier_invoice_purchase_order_match");
    expect(migration).toContain("Purchase Order Supplier mismatch. Correct the Supplier before matching.");
    expect(migration).toContain("case when p_remove then 'po_match_removed' else 'po_match_confirmed' end");
  });

  it("stores accepted site-review variances as an immutable decision snapshot", () => {
    expect(migration).toContain("accepted_variances jsonb not null default '[]'::jsonb");
    expect(migration).toContain("accepted_variances = coalesce(p_accepted_variances, '[]'::jsonb)");
  });

  it("binds site and Accounts decisions to the current finance hash", () => {
    expect(migration).toContain("p_expected_finance_hash");
    expect(migration).toContain("Every Purchase Order requires a current approved site-review decision.");
    expect(migration).toContain("A current commercial approval is required before final Accounts approval.");
  });
});
