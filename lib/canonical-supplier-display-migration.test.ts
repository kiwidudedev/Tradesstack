import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getSupplierDisplayName } from "@/lib/suppliers";
import {
  buildMaterialEstimatingRateWorksheetCell,
  parsePricingWorksheetMaterialPickerPage,
} from "@/lib/pricing-worksheet-material-picker";
import { getWorksheetCellMaterialPricingProvenance } from "@/lib/worksheet-material-pricing-provenance";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816190000_canonicalize_material_supplier_display_names.sql"),
  "utf8",
);
const reviewMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816170000_add_converted_estimating_rates.sql"),
  "utf8",
);

const bunningsSupplier = {
  id: "4cde3a2c-d99e-4e8f-83a6-46a10a6522e8",
  company_name: "Bunnings",
  name: "John",
};
const bunningsPickerPage = {
  items: [{
    materialId: "5ed0006a-9a10-4001-ad32-af3e4f7bf937",
    materialName: "GIB Fyreline® 13mm",
    materialDescription: "Fire-rated plasterboard sheet, 13mm thick, 2400mm x 1200mm",
    category: null,
    defaultUnit: "m2",
    supplierId: bunningsSupplier.id,
    supplierName: "Bunnings",
    supplierProductId: "0addd886-9174-4e42-9d83-a2537ff54f15",
    supplierProductDescription: "GIB Fyreline® 13mm",
    supplierSku: "0724178",
    supplierUnit: "sheet",
    isPreferred: false,
    pricing: {
      sourcePricing: {
        supplierPriceId: "b1420453-b829-479b-8234-1ad37bf65779",
        unitCost: 63.1,
        unit: "sheet",
        currency: "NZD",
        sourceTaxBasis: "inclusive",
        sourceTaxRate: null,
        taxJurisdictionCode: "NEW ZEALAND",
        comparisonTaxBasis: "exclusive",
        comparisonTaxRate: 15,
        effectiveFrom: "2026-08-15T21:36:51.970773+00:00",
      },
      estimatingPricing: {
        status: "available",
        derivationKind: "confirmed_conversion",
        normalizedSourceUnitCost: 54.869565,
        unitCost: 19.051932,
        unit: "m2",
        currency: "NZD",
        taxBasis: "exclusive",
        calculationVersion: "material_estimating_price_v1",
        evaluatedAt: "2026-08-16T06:05:42.190Z",
      },
      conversion: {
        conversionId: "d7cb1051-0e22-440c-ba2b-97cda861e480",
        supplierQuantity: 1,
        supplierUnit: "sheet",
        materialQuantity: 2.88,
        materialUnit: "m2",
        confirmationSource: "user_confirmed_ai",
        contractVersion: "material_unit_conversion_v1",
        effectiveFrom: "2026-08-15T00:38:28.815977+00:00",
        confirmedAt: "2026-08-15T00:38:28.815977+00:00",
      },
    },
  }],
  page: 1,
  pageSize: 20,
  total: 1,
  hasMore: false,
  evaluatedAt: "2026-08-16T06:05:42.190Z",
};

describe("canonical Material supplier display names", () => {
  it.each([
    [{ company_name: "Bunnings", name: "John" }, "Bunnings"],
    [{ company_name: null, name: "Trade Direct" }, "Trade Direct"],
    [{ company_name: "   ", name: "Trade Direct" }, "Trade Direct"],
    [{ company_name: "   ", name: "   " }, ""],
  ])("keeps the application company-name-first convention for %o", (supplier, expected) => {
    expect(getSupplierDisplayName(supplier)).toBe(expected);
  });

  it("uses the same convention in picker projection and ordering", () => {
    expect(migration).toContain("nullif(btrim(supplier.company_name), '')");
    expect(migration).toContain("nullif(btrim(supplier.name), '')");
    expect(migration).toContain("'Unknown supplier'");
    expect(migration).toContain(") as supplier_name");
    expect(migration).toContain("is_preferred desc, lower(supplier_name)");
    expect(migration).not.toContain("supplier.name as supplier_name");
  });

  it("searches both the canonical company identity and the legacy name", () => {
    expect(migration).toContain("lower(coalesce(supplier.company_name, '')) like '%' || v_search || '%'");
    expect(migration).toContain("lower(coalesce(supplier.name, '')) like '%' || v_search || '%'");
  });

  it("keeps Material detail and picker identity aligned for the audited Bunnings fixture", () => {
    const picker = parsePricingWorksheetMaterialPickerPage(bunningsPickerPage);

    expect(getSupplierDisplayName(bunningsSupplier)).toBe("Bunnings");
    expect(picker?.items[0]).toMatchObject({
      supplierId: bunningsSupplier.id,
      supplierName: "Bunnings",
      supplierProductId: "0addd886-9174-4e42-9d83-a2537ff54f15",
    });
  });

  it("changes only the label while preserving audited pricing, conversion, and insertion provenance", () => {
    const item = parsePricingWorksheetMaterialPickerPage(bunningsPickerPage)?.items[0];
    expect(item).toBeDefined();

    const cell = buildMaterialEstimatingRateWorksheetCell({
      item: item!,
      bindingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(cell.value).toBe(19.051932);
    expect(Number(cell.value).toFixed(2)).toBe("19.05");
    expect(getWorksheetCellMaterialPricingProvenance(cell)).toMatchObject({
      supplierId: bunningsSupplier.id,
      supplierProductId: "0addd886-9174-4e42-9d83-a2537ff54f15",
      sourcePricing: { supplierPriceId: "b1420453-b829-479b-8234-1ad37bf65779" },
      conversion: { conversionId: "d7cb1051-0e22-440c-ba2b-97cda861e480" },
      labels: { supplierName: "Bunnings" },
    });
  });

  it("preserves the picker signature, authorization, pricing, conversion, and bounded pagination", () => {
    expect(migration.match(/create or replace function public\.search_pricing_worksheet_materials\(/g)).toHaveLength(1);
    expect(migration).toContain("p_workbook_id uuid");
    expect(migration).toContain("p_evaluation_time timestamptz default statement_timestamp()");
    expect(migration).toContain("is_member_of_organization(v_organization_id)");
    expect(migration).toContain("has_org_permission(v_organization_id, 'materials.view')");
    expect(migration).toContain("resolve_material_supplier_product_prices");
    expect(migration).toContain("derive_material_estimating_price");
    expect(migration).toContain("organization_material_supplier_product_unit_conversions");
    expect(migration).toContain("limit v_page_size offset ((v_page - 1) * v_page_size)");
  });

  it("does not replace price review or rewrite immutable Supplier snapshots", () => {
    expect(migration).not.toContain("review_pricing_worksheet_material_prices");
    expect(migration).not.toContain("worksheet_material_price_bindings");
    expect(reviewMigration).toContain("binding.supplier_name_snapshot");
    expect(reviewMigration).toContain("entry #>> '{provenance,labels,supplierName}'");
  });
});
