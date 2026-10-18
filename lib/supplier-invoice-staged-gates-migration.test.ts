import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261019120000_separate_supplier_invoice_site_and_accounting_gates.sql",
  "utf8",
);

function block(startMarker: string, endMarker: string) {
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("Supplier Invoice staged site/accounting migration", () => {
  it("adds an operational hash that excludes accounting-only allocation fields", () => {
    expect(migration).toContain("add column if not exists operational_hash text null");
    const operationalHash = block(
      "create or replace function public.supplier_invoice_operational_version_hash",
      "-- Public submission wrapper",
    );
    expect(operationalHash).toContain("supplier_invoice_line_allocations");
    expect(operationalHash).not.toContain("accounting_mapping_id");
    expect(operationalHash).not.toContain("accounting_tax_rate_id");
    expect(operationalHash).not.toContain("tax_resolution_status");
  });

  it("keeps the full finance hash sensitive to named-route and tax coding", () => {
    const financeHash = block(
      "create or replace function public.supplier_invoice_finance_version_hash",
      "-- Same operational facts",
    );
    expect(financeHash).toContain("a.accounting_route_mapping_id");
    expect(financeHash).toContain("a.account_override_organization_cost_code_id");
    expect(financeHash).toContain("a.accounting_resolution_status");
    expect(financeHash).toContain("a.tax_resolution_status");
  });

  it("removes accounting requirements from operational site submission", () => {
    const submit = block(
      "CREATE OR REPLACE FUNCTION private.submit_supplier_invoice_for_site_review_phase_ab_legacy",
      "-- PO-level decision path",
    );
    expect(submit).not.toContain("Resolve routing, accounting and tax coding");
    expect(submit).not.toContain("accounting_mapping_id is null");
    expect(submit).toContain("Allocate every Supplier Invoice line before site review.");
    expect(submit).toContain("A matched Purchase Order has a Supplier mismatch or is cancelled.");
    expect(submit).toContain("Allocated amounts do not reconcile to the Supplier Invoice.");
    expect(submit).toContain("supplier_invoice_operational_version_hash");
    expect(submit).toContain("operational_hash");
  });

  it("validates the site-review decision against the operational hash", () => {
    const decision = block(
      "create or replace function public.decide_supplier_invoice_site_review",
      "-- Accounts approval keeps the full finance hash",
    );
    expect(decision).toContain("coalesce(v_submission.operational_hash, v_submission.finance_hash)");
    expect(decision).toContain("supplier_invoice_operational_version_hash");
    expect(decision).not.toContain("supplier_invoice_finance_version_hash(v_parent.supplier_invoice_id)");
  });

  it("enforces named-route, override and legacy accounting at Accounts approval", () => {
    const accounts = block(
      "CREATE OR REPLACE FUNCTION private.record_supplier_invoice_accounts_approval_phase_ab_legacy",
      "-- Accounting-only allocation updates",
    );
    expect(accounts).toContain("organization_accounting_route_mappings route_mapping");
    expect(accounts).toContain("account_override_organization_cost_code_id = account.id");
    expect(accounts).toContain("organization_tradesstack_accounting_mappings legacy_mapping");
    expect(accounts).toContain("Every allocation requires a current Supplier Bills account or explicit line account before Accounts approval.");
    expect(accounts).toContain("Every allocation requires a current tax treatment before Accounts approval.");
    expect(accounts).toContain("coalesce(s.operational_hash, s.finance_hash)");
  });

  it("does not invalidate operational site review for accounting-only allocation updates", () => {
    const trigger = block(
      "create or replace function public.invalidate_role_workflow_from_invoice_child_change",
      "-- Accounting mapping/tax rate changes",
    );
    expect(trigger).toContain("tg_table_name = 'supplier_invoice_line_allocations' and tg_op = 'UPDATE'");
    expect(trigger).not.toContain("new.accounting_mapping_id");
    expect(trigger).toContain("new.allocated_amount is not distinct from old.allocated_amount");
  });

  it("moves GST repair to a review-permission action without invalidating site review", () => {
    const repair = block(
      "create or replace function public.repair_supplier_invoice_allocation_tax",
      "revoke all on function public.repair_supplier_invoice_allocation_tax",
    );
    expect(repair).toContain("has_org_permission(p_organization_id, 'supplier_invoices.review')");
    expect(repair).not.toContain("supplier_invoices.accounts_approve");
    expect(repair).toContain("invalidate_supplier_invoice_commercial_approval");
    expect(repair).not.toContain("invalidate_supplier_invoice_role_workflow");
  });
});
