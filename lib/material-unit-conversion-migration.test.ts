import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260815120000_add_material_supplier_product_unit_conversions.sql";

describe("Material Supplier Product unit conversion migration", () => {
  it("creates versioned, organization-scoped, append-only conversion facts", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("create table public.organization_material_supplier_product_unit_conversions");
    expect(sql).toContain("supplier_quantity numeric(18, 6) not null");
    expect(sql).toContain("material_quantity numeric(18, 6) not null");
    expect(sql).toContain("effective_to is null or effective_to > effective_from");
    expect(sql).toContain("effective_interval_overlap");
    expect(sql).toContain("fact_immutable");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke insert, update, delete");
  });

  it("adds import lineage and wraps the existing approval in one transaction", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("add column approved_unit_conversion_id uuid null");
    expect(sql).toContain("rename to approve_material_import_row_without_unit_conversion");
    expect(sql).toContain("v_result := public.approve_material_import_row_without_unit_conversion(p_input)");
    expect(sql).toContain("v_expected_cost := v_price.unit_cost * v_supplier_quantity / v_material_quantity");
    expect(sql).toContain("set approved_unit_conversion_id = v_conversion.id");
  });
});
