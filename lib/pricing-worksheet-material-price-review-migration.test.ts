import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260816160000_add_pricing_worksheet_material_price_review.sql"), "utf8");

describe("Material price review migration", () => {
  it("uses active workbook bindings, one set resolver, and bounded grouped output", () => {
    expect(sql).toContain("where binding_state = 'active'");
    expect(sql.match(/resolve_material_supplier_product_prices\(/g)).toHaveLength(1);
    expect(sql).toContain("array_agg(distinct supplier_product_id)");
    expect(sql).toContain("limit v_page_size offset");
    expect(sql).toContain("'priceUpdates'");
    expect(sql).toContain("'needsReview'");
  });

  it("validates dirty overlays and derives organization from the workbook", () => {
    expect(sql).toContain("pricing_material_review:duplicate_overlay_binding");
    expect(sql).toContain("pricing_material_review:forged_overlay_binding");
    expect(sql).toContain("v_workbook.organization_id");
    expect(sql).not.toContain("p_organization_id");
  });

  it("separates read access, write permission, lifecycle, and stale action checks", () => {
    expect(sql).toContain("materials.view");
    expect(sql).toContain("can_write_pricing_workbook_owner");
    expect(sql).toContain("source_inactive");
    expect(sql).toContain("version_changed_same_terms");
    expect(sql).toContain("pricing_material_review:stale_update");
  });
});
