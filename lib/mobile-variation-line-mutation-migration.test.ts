import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20261003150000_add_mobile_project_variation_line_mutation_v1.sql", import.meta.url),
  "utf8",
);

describe("mobile Variation line mutation contract migration", () => {
  it("uses one authenticated operation RPC with project-derived authorization and optimistic concurrency", () => {
    expect(sql).toContain("mobile_mutate_project_variation_manual_line_v1");
    expect(sql).toContain("resolve_mobile_project_member_context_v2(p_project_id)");
    expect(sql).toContain("has_org_permission(current_context.organization_id, 'variations.write')");
    expect(sql).toContain("variation_row.updated_at is distinct from p_expected_updated_at");
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).toContain("operation_normalized not in ('add', 'edit', 'delete')");
  });

  it("validates sections and delegates authoritative totals to the existing Variation save path", () => {
    for (const section of ["Labour", "Materials", "Subcontractors", "Plant", "Margin"]) {
      expect(sql).toContain(`'${section}'`);
    }
    expect(sql).toContain("save_project_variation_draft(");
    expect(sql).toContain("'total', case when operation_normalized = 'edit'");
    expect(sql).toContain("perform 1\n  from public.save_project_variation_draft(");
  });

  it("locks provenance-bearing lines and never accepts client provenance fields", () => {
    expect(sql).toContain("Provenance-bearing Variation lines cannot be edited or deleted from mobile");
    expect(sql).not.toContain("p_organization_id");
    expect(sql).not.toContain("p_total");
    expect(sql).not.toContain("p_source_project_quote");
    expect(sql).not.toContain("p_source_purchase_order");
    expect(sql).toContain("sourceProjectQuoteId', null");
    expect(sql).toContain("sourcePurchaseOrderId', null");
    expect(sql).toContain("'is_manual'");
    expect(sql).toContain("'is_editable'");
    expect(sql).toContain("'is_deletable'");
    expect(sql).toContain("'is_locked'");
    expect(sql).toContain("'lock_reason'");
  });

  it("rejects public and anonymous execution while granting authenticated execution", () => {
    expect(sql).toContain("revoke all on function public.mobile_mutate_project_variation_manual_line_v1");
    expect(sql).toContain(") from public, anon;");
    expect(sql).toContain(") to authenticated;");
  });
});
