import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260829140000_add_subcontractor_qa_builder_enhancements.sql", "utf8");

describe("Subcontractor QA Builder enhancement migration", () => {
  it("adds only the Product / Material field type and structured response storage", () => {
    expect(migration).toContain("'product_material'");
    expect(migration).toContain("add column product_material_value jsonb");
    expect(migration).toContain("qa_product_material_value_is_valid");
    expect(migration).toContain("Required photo evidence needs at least one photo");
    expect(migration).not.toMatch(/manufacturer_(?:name_)?column|batch_lot text|supplier_name text/i);
    expect(migration).not.toMatch(/alter table public\.project_quality_/i);
  });

  it("validates safe snapshots without commercial foreign keys", () => {
    for (const key of ["organizationMaterialId", "supplierProductId", "supplierId", "productName", "materialNameSnapshot", "manufacturerName", "supplierName", "batchLot", "productCode"]) expect(migration).toContain(`'${key}'`);
    expect(migration).not.toMatch(/product_material_value[\s\S]{0,500}references public\.organization_material/i);
    expect(migration).toContain("Invalid Product / Material response");
  });

  it("preserves one optimistic save path and authoritative completion", () => {
    expect(migration).toContain("create or replace function public.save_project_qa_response_v1");
    expect(migration).toContain("response_row.lock_version<>p_expected_lock_version");
    expect(migration).toContain("lock_version=response.lock_version+1");
    expect(migration).toContain("product_material_value=case when response_row.field_type='product_material'");
    expect(migration).toContain("when 'product_material' then");
    expect(migration).toContain("comment_rule='required'");
    expect(migration).toContain("comment_rule='required_on_fail'");
    expect(migration).toContain("Required photo evidence");
    expect(migration).not.toMatch(/holdPointEnabled[\s\S]{0,250}(?:raise exception|block)/);
  });

  it("keeps manual person names and target tolerance behavior", () => {
    expect(migration).toContain("p_value->>'personDisplayName'");
    expect(migration).toContain("when 'person' then nullif(btrim(coalesce(response_row.person_display_name,'')),'') is not null");
    expect(migration).toContain("target_value-tolerance_value");
    expect(migration).toContain("outside its captured target tolerance");
  });
});
