import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260816170000_add_converted_estimating_rates.sql"), "utf8");

describe("converted estimating rates migration", () => {
  it("centralizes tax and direct conversion arithmetic", () => {
    expect(sql).toContain("create or replace function public.derive_material_estimating_price");
    expect(sql).toContain("round(p_source_unit_cost / (1 + v_rate / 100), 6)");
    expect(sql).toContain("v_normalized * p_conversion_supplier_quantity / p_conversion_material_quantity");
    expect(sql).toContain("material_estimating_price_v1");
    expect(sql).toContain("currency_incompatible");
  });

  it("adds immutable V2 worksheet and conversion snapshots without rewriting V1", () => {
    for (const field of ["provenance_version", "worksheet_rate_snapshot", "worksheet_unit_snapshot", "unit_conversion_id", "conversion_supplier_quantity_snapshot", "conversion_material_quantity_snapshot"]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("references public.organization_material_supplier_product_unit_conversions (organization_id, id) on delete restrict");
    expect(sql).not.toMatch(/update public\.opportunity_pricing_workbook_sheets\s+set worksheet_data/i);
  });

  it("branches reconciliation and rejects browser-tampered estimating evidence", () => {
    expect(sql).toContain("if v_version = 1 then");
    expect(sql).toContain("elsif v_version = 2 then");
    expect(sql).toContain("worksheet_material_pricing:invalid_estimating_evidence");
    expect(sql).toContain("abs((v_cell.cell_data->>'value')::numeric - (v_derived #>> '{estimatingPricing,unitCost}')::numeric)");
  });

  it("keeps picker and review set-oriented and conversion-aware", () => {
    expect(sql).toContain("effective_prices as materialized");
    expect(sql).toContain("left join public.organization_material_supplier_product_unit_conversions conversion");
    expect(sql).toContain("conversion_changed");
    expect(sql).toContain("price_and_conversion_changed");
    expect(sql).toContain("estimating_unit_mismatch");
  });
});
