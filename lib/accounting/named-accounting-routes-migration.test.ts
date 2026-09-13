import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260824200000_add_named_accounting_routes.sql", import.meta.url),
  "utf8",
);

describe("named accounting route migration", () => {
  it("adds only the three workflow routes and does not seed Supplier Bills arbitrarily", () => {
    expect(migration).toContain("create table public.organization_accounting_route_mappings");
    for (const route of ["supplier_bill_expense", "payment_claim_revenue", "retention_receivable"]) {
      expect(migration).toContain(`'${route}'`);
    }
    const bootstrap = migration.slice(
      migration.indexOf("-- Deterministic compatibility bootstrap"),
      migration.indexOf("alter table public.supplier_invoice_line_allocations"),
    );
    expect(bootstrap).toContain("legacy.tradesstack_cost_code in (600, 700)");
    expect(bootstrap).not.toContain("supplier_bill_expense");
  });

  it("enforces project precedence, provider ownership and RLS", () => {
    expect(migration).toContain("case when mapping.project_id = p_project_id then 0 else 1 end");
    expect(migration).toContain("v_account.organization_id <> new.organization_id");
    expect(migration).toContain("v_account.external_provider is distinct from new.provider");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("public.is_member_of_organization(organization_id)");
  });

  it("supports dual-generation immutable AP snapshots", () => {
    expect(migration).toContain("supplier_invoice_commercial_snapshot_mapping_generation_check");
    expect(migration).toContain("organization_accounting_document_lines_mapping_generation_check");
    expect(migration).toContain("snapshot.accounting_route = 'supplier_bill_expense'");
    expect(migration).toContain("snapshot.account_override_organization_cost_code_id = snapshot.organization_cost_code_id");
    expect(migration).toContain("case when snapshot.accounting_route is null then mapping.tradesstack_cost_code else null end");
  });

  it("keeps reversal exact while allowing null construction routes", () => {
    const reversal = migration.slice(
      migration.indexOf("create or replace function public.reverse_supplier_invoice_actual_cost_event"),
      migration.indexOf("create or replace function public.resolve_cost_item_financial_routing_defaults"),
    );
    expect(reversal).not.toContain("Actual cost event is missing Financial Routing");
    expect(reversal).toContain("original_event.accounting_route, original_event.accounting_route_mapping_id");
    expect(reversal).toContain("original_event.amount * -1, original_event.tax_amount * -1, original_event.total_amount * -1");
    expect(reversal).toContain("This actual cost event has already been reversed.");
  });

  it("turns the mirror resolver into a non-classifying rolling-deployment shim", () => {
    const resolver = migration.slice(
      migration.indexOf("create or replace function public.resolve_cost_item_financial_routing_defaults"),
      migration.indexOf("-- Preserve PO quantity/value enforcement"),
    );
    expect(resolver).toContain("select null::integer, null::text, null::numeric");
    expect(resolver).not.toMatch(/resolved_code\s*:=\s*(100|200|300|400|500|800)/);
  });
});
