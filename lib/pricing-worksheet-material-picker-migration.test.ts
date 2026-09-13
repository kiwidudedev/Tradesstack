import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260816150000_add_pricing_worksheet_material_picker.sql"), "utf8");

describe("pricing worksheet Material picker migration", () => {
  it("derives organization scope from an accessible workbook and requires materials.view", () => {
    expect(migration).toContain("where workbook.id = p_workbook_id");
    expect(migration).toContain("is_member_of_organization(v_organization_id)");
    expect(migration).toContain("has_org_permission(v_organization_id, 'materials.view')");
    expect(migration).not.toContain("p_organization_id");
  });

  it("searches every approved picker field and excludes inactive lifecycle rows", () => {
    for (const fragment of ["material.normalized_name", "material.description", "material.category", "supplier.name", "normalized_supplier_description", "normalized_supplier_sku"]) expect(migration).toContain(fragment);
    expect(migration).toContain("product.is_active and product.archived_at is null");
    expect(migration).toContain("material.is_active and material.archived_at is null");
  });

  it("pages deterministically before invoking the canonical resolver once", () => {
    expect(migration).toContain("limit v_page_size offset ((v_page - 1) * v_page_size)");
    expect(migration.match(/resolve_material_supplier_product_prices/g)).toHaveLength(1);
    expect(migration).toContain("is_preferred desc");
    expect(migration).toContain("supplier_product_id");
    expect(migration).toContain("when rows.price_id is null then null");
  });
});
