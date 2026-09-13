import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260818190000_fix_supplier_bill_ucl_dependency_trigger_variable_ambiguity.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("Supplier Bill UCL dependency trigger variable ambiguity fix", () => {
  it("replaces both affected trigger functions without recreating their triggers", () => {
    expect(sql).toContain(
      "create or replace function public._supplier_bill_ucl_purchase_order_dependency_trigger()",
    );
    expect(sql).toContain(
      "create or replace function public._supplier_bill_ucl_project_dependency_trigger()",
    );
    expect(sql).not.toMatch(/\b(?:drop|create) trigger\b/i);
  });

  it("uses prefixed variables in every tenant and document predicate", () => {
    expect(sql).toContain("v_organization_id uuid");
    expect(sql).toContain("v_purchase_order_id uuid");
    expect(sql).toContain("v_purchase_order_line_id uuid");
    expect(sql).toContain("v_project_id uuid");
    expect(sql).not.toMatch(/\.organization_id\s*=\s*organization_id\b/);
    expect(sql).not.toMatch(/\.purchase_order_id\s*=\s*purchase_order_id\b/);
    expect(sql).not.toMatch(/\.project_id\s*=\s*project_id\b/);
  });

  it("keeps PO-to-invoice fan-out tenant scoped and trigger functions private", () => {
    expect(sql).toContain("on po.organization_id = v_organization_id");
    expect(sql).toContain("where m.organization_id = v_organization_id");
    expect(sql).toContain("candidate.supplier_invoice_id is not null");
    expect(sql).toContain("from public, anon, authenticated");
  });
});
