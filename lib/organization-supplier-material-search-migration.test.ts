import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260827190000_add_organization_supplier_material_search.sql", import.meta.url),
  "utf8",
);

describe("organization supplier Material search migration", () => {
  it("centralizes organization search with membership and materials.view authority", () => {
    expect(migration).toContain("search_organization_supplier_materials");
    expect(migration).toContain("is_member_of_organization(p_organization_id)");
    expect(migration).toContain("has_org_permission(p_organization_id, 'materials.view')");
    expect(migration).toContain("product.organization_id = p_organization_id");
    expect(migration).toContain("is_preferred desc");
    expect(migration).toContain("derive_material_estimating_price");
  });

  it("keeps workbook search as a scope-validating compatibility wrapper", () => {
    expect(migration).toContain("create or replace function public.search_pricing_worksheet_materials");
    expect(migration).toContain("workbook.id = p_workbook_id and workbook.archived_at is null");
    expect(migration).toContain("return public.search_organization_supplier_materials(");
  });
});
