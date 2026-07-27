import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260716170000_add_procurement_commercial_hardening.sql"
);
const sql = readFileSync(migrationPath, "utf8");
const commitmentAlignmentSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716183000_align_commitment_release_to_po_lines.sql"
  ),
  "utf8"
);
const mappingInvalidationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716190000_invalidate_commercial_approval_on_mapping_changes.sql"
  ),
  "utf8"
);
const concurrencySql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716193000_serialize_commitment_release_and_invoice_approval.sql"
  ),
  "utf8"
);
const financeHashRlsSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716194500_scope_supplier_invoice_finance_hash_to_rls.sql"
  ),
  "utf8"
);
const routingConsistencySql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716200000_enforce_commercial_routing_mapping_consistency.sql"
  ),
  "utf8"
);
const allocationShapeSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716201500_enforce_one_commercial_allocation_per_invoice_line.sql"
  ),
  "utf8"
);
const descriptionVarianceSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716203000_require_description_variance_acceptance.sql"
  ),
  "utf8"
);
const derivedSnapshotTaxSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260720223000_derive_commercial_snapshot_tax_from_xero_treatment.sql"
  ),
  "utf8"
);
const snapshotCompletenessSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260721213000_enforce_complete_supplier_invoice_commercial_snapshots.sql"
  ),
  "utf8"
);

describe("procurement commercial hardening migration", () => {
  it("stores immutable approval, line, variance, and commitment release records", () => {
    expect(sql).toContain(
      "create table if not exists public.supplier_invoice_commercial_approvals"
    );
    expect(sql).toContain(
      "create table if not exists public.supplier_invoice_commercial_line_snapshots"
    );
    expect(sql).toContain(
      "create table if not exists public.supplier_invoice_commercial_variances"
    );
    expect(sql).toContain(
      "create table if not exists public.purchase_order_commitment_releases"
    );
  });

  it("prevents more than one active commercial approval", () => {
    expect(sql).toContain(
      "supplier_invoice_commercial_approvals_active_uidx"
    );
    expect(sql).toContain("where status = 'approved'");
  });

  it("uses approved commercial snapshots for progressive invoicing", () => {
    expect(sql).toContain(
      "from public.supplier_invoice_commercial_line_snapshots snapshot"
    );
    expect(sql).toContain("approval.status = 'approved'");
    expect(sql).not.toMatch(
      /from public\.project_actual_cost_events[\s\S]{0,500}over-invoice/
    );
  });

  it("enforces supplier, duplicate, allocation, mapping, tax, and over-invoice blockers", () => {
    expect(sql).toContain(
      "The invoice supplier does not match one or more purchase orders."
    );
    expect(sql).toContain(
      "Another invoice for this supplier uses the same invoice number."
    );
    expect(sql).toContain(
      "Every invoice line must have exactly one active allocation."
    );
    expect(sql).toContain(
      "Every allocation must be approved with active accounting and tax mappings."
    );
    expect(sql).toContain(
      "would over-invoice a purchase order line"
    );
  });

  it("invalidates approvals after material invoice, allocation, PO, or PO-line changes", () => {
    expect(sql).toContain(
      "invalidate_commercial_approval_from_invoice_change"
    );
    expect(sql).toContain(
      "invalidate_commercial_approval_from_invoice_line_change"
    );
    expect(sql).toContain(
      "invalidate_commercial_approval_from_allocation_change"
    );
    expect(sql).toContain(
      "invalidate_commercial_approval_from_purchase_order_change"
    );
    expect(sql).toContain(
      "invalidate_commercial_approval_from_purchase_order_line_change"
    );
  });

  it("keeps all commercial mutations behind permission-checked RPCs", () => {
    expect(sql).toContain(
      "public.has_org_permission(p_organization_id, 'supplier_invoices.review')"
    );
    expect(sql).toContain(
      "public.has_org_permission(p_organization_id, 'purchase_orders.write')"
    );
    expect(sql).toContain(
      "revoke insert, update, delete on public.supplier_invoice_commercial_approvals from authenticated"
    );
    expect(sql).toContain(
      "revoke insert, update, delete on public.purchase_order_commitment_releases from authenticated"
    );
  });

  it("aligns released commitment to PO lines and enforces limits after release", () => {
    expect(commitmentAlignmentSql).toContain(
      "create table if not exists public.purchase_order_commitment_release_lines"
    );
    expect(commitmentAlignmentSql).toContain(
      "enforce_commercial_snapshot_po_limits"
    );
    expect(commitmentAlignmentSql).toContain(
      "select coalesce(sum(line.total), 0) into v_po_value"
    );
  });

  it("invalidates approval when accounting or tax mappings change", () => {
    expect(mappingInvalidationSql).toContain(
      "invalidate_commercial_approval_from_accounting_mapping_change"
    );
    expect(mappingInvalidationSql).toContain(
      "invalidate_commercial_approval_from_tax_mapping_change"
    );
    expect(mappingInvalidationSql).toContain(
      "perform public.invalidate_supplier_invoice_commercial_approval"
    );
  });

  it("serializes approval snapshots against commitment release", () => {
    expect(concurrencySql).toContain(
      "from public.project_purchase_orders"
    );
    expect(concurrencySql).toContain("for update");
    expect(concurrencySql).toContain(
      "v_approved_value + v_released_value + new.amount"
    );
  });

  it("keeps finance-version hash reads under caller RLS", () => {
    expect(financeHashRlsSql).toContain("security invoker");
    expect(financeHashRlsSql).not.toContain("security definer");
  });

  it("enforces allocation routing and accounting mapping consistency at snapshot insertion", () => {
    expect(routingConsistencySql).toContain(
      "join public.organization_tradesstack_accounting_mappings mapping"
    );
    expect(routingConsistencySql).toContain(
      "mapping.tradesstack_cost_code = allocation.tradesstack_cost_code"
    );
    expect(routingConsistencySql).toContain(
      "mapping.project_id is not distinct from allocation.project_id"
    );
    expect(routingConsistencySql).toContain(
      "The allocation routing code and accounting mapping are not consistent."
    );
  });

  it("enforces exactly one allocation for every invoice line inside the database", () => {
    expect(allocationShapeSql).toContain(
      "left join public.supplier_invoice_line_allocations allocation"
    );
    expect(allocationShapeSql).toContain("having count(allocation.id) <> 1");
    expect(allocationShapeSql).toContain(
      "before insert on public.supplier_invoice_commercial_approvals"
    );
  });

  it("requires explicit acceptance when matched invoice and PO descriptions differ", () => {
    expect(descriptionVarianceSql).toContain(
      "accepted ->> 'type' = 'unexpected_line'"
    );
    expect(descriptionVarianceSql).toContain(
      "Accept and explain every invoice and purchase order line description variance."
    );
  });

  it("derives immutable commercial snapshot tax from the resolved Xero treatment", () => {
    expect(derivedSnapshotTaxSql).toContain(
      "allocation.tax_resolution_status"
    );
    expect(derivedSnapshotTaxSql).toContain("tax_rate.effective_rate");
    expect(derivedSnapshotTaxSql).toContain(
      "new.tax_amount := round(new.amount * v_effective_rate / 100, 2)"
    );
    expect(derivedSnapshotTaxSql).toContain(
      "before insert on public.supplier_invoice_commercial_line_snapshots"
    );
  });

  it("cannot commit an approved commercial header without one snapshot per invoice line", () => {
    expect(snapshotCompletenessSql).toContain(
      "assert_supplier_invoice_commercial_snapshot_completeness"
    );
    expect(snapshotCompletenessSql).toContain("deferrable initially deferred");
    expect(snapshotCompletenessSql).toContain("v_snapshot_count <> v_expected_count");
    expect(snapshotCompletenessSql).toContain("count(snapshot.id) <> 1");
    expect(snapshotCompletenessSql).toContain(
      "Commercial approval line snapshots were incomplete."
    );
  });
});
