import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDefaultWorksheetData, type WorksheetCell } from "@/lib/opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "@/lib/opportunity-pricing-worksheet-mutations";
import {
  buildMaterialEstimatingRateWorksheetCell,
  buildMaterialPriceWorksheetCell,
  isPricingWorksheetMaterialPickerSearchValid,
  normalizePricingWorksheetMaterialPickerSearch,
  parsePricingWorksheetMaterialPickerPage,
  type PricingWorksheetMaterialPickerItem,
} from "@/lib/pricing-worksheet-material-picker";
import { searchOrganizationMaterials, searchPricingWorksheetMaterials } from "@/lib/pricing-worksheet-material-picker-server";
import { getWorksheetCellMaterialPricingProvenance } from "@/lib/worksheet-material-pricing-provenance";

const item: PricingWorksheetMaterialPickerItem = {
  materialId: "11111111-1111-4111-8111-111111111111",
  materialName: "92mm 0.75BMT Stud",
  materialDescription: "Steel wall framing",
  category: "Framing",
  defaultUnit: "L/m",
  supplierId: "22222222-2222-4222-8222-222222222222",
  supplierName: "Metro Building Supplies",
  supplierProductId: "33333333-3333-4333-8333-333333333333",
  supplierProductDescription: "92mm Stud 3000",
  supplierSku: "MBS-92-30",
  supplierUnit: "L/m",
  isPreferred: true,
  pricing: {
    sourcePricing: {
      supplierPriceId: "44444444-4444-4444-8444-444444444444", unitCost: 4.88, unit: "L/m",
      currency: "NZD", sourceTaxBasis: "exclusive", sourceTaxRate: 15,
      taxJurisdictionCode: "NZ-GST", comparisonTaxBasis: "exclusive", comparisonTaxRate: 15,
      effectiveFrom: "2026-08-16T00:00:00.000Z",
    },
    estimatingPricing: {
      status: "available", derivationKind: "direct_unit_match", normalizedSourceUnitCost: 4.88,
      unitCost: 4.88, unit: "L/m", currency: "NZD", taxBasis: "exclusive",
      calculationVersion: "material_estimating_price_v1", evaluatedAt: "2026-08-16T03:00:00.000Z",
    },
    conversion: null,
  },
};

const page = { items: [item], page: 1, pageSize: 20, total: 1, hasMore: false, evaluatedAt: item.pricing!.estimatingPricing.evaluatedAt };

describe("pricing worksheet Material picker", () => {
  it("normalizes picker searches and requires two normalized characters", () => {
    expect(normalizePricingWorksheetMaterialPickerSearch("  92   mm  ")).toBe("92 mm");
    for (const search of ["", " ", "   ", "g", " 9 "]) {
      expect(isPricingWorksheetMaterialPickerSearchValid(search)).toBe(false);
    }
    for (const search of ["13", "90", "H1", "gib"]) {
      expect(isPricingWorksheetMaterialPickerSearchValid(search)).toBe(true);
    }
  });

  it("runtime-validates the bounded picker response and commercial price", () => {
    expect(parsePricingWorksheetMaterialPickerPage(page)).toEqual(page);
    expect(parsePricingWorksheetMaterialPickerPage({ ...page, items: [{ ...item, pricing: { id: "bad" } }] })).toBeNull();
  });

  it("builds exact Phase 1A provenance while preserving existing formatting metadata", () => {
    const existing: WorksheetCell = {
      value: 4.72,
      type: "number",
      formula: null,
      computedValue: 4.72,
      displayValue: "$4.72",
      metadata: { format: { number: { kind: "currency" }, text: { align: "right" } } },
    };
    const next = buildMaterialPriceWorksheetCell({
      existingCell: existing,
      item,
      bindingId: "55555555-5555-4555-8555-555555555555",
    });
    expect(next.value).toBe(4.88);
    expect(next.formula).toBeNull();
    expect(next.metadata.format).toEqual(existing.metadata.format);
    expect(getWorksheetCellMaterialPricingProvenance(next)).toMatchObject({
      supplierPriceId: item.pricing!.sourcePricing.supplierPriceId,
      supplierProductId: item.supplierProductId,
      snapshot: { unitCost: 4.88, sourceTaxBasis: "exclusive" },
    });
  });

  it("travels through the canonical mutation pipeline and recalculates formula dependents", () => {
    const worksheet = createDefaultWorksheetData();
    worksheet.cells.A1 = { value: 2, type: "number", formula: null, computedValue: 2, displayValue: "2", metadata: {} };
    worksheet.cells.B1 = { value: null, type: "number", formula: "=A1*2", computedValue: 4, displayValue: "4", metadata: {} };
    const result = applyWorksheetMutation(worksheet, (current) => ({
      ...current,
      cells: { ...current.cells, A1: buildMaterialPriceWorksheetCell({ existingCell: current.cells.A1, item, bindingId: "55555555-5555-4555-8555-555555555555" }) },
    }));
    expect(result.changed).toBe(true);
    expect(result.nextWorksheet.cells.A1?.value).toBe(4.88);
    expect(result.nextWorksheet.cells.B1?.computedValue).toBe(9.76);
  });

  it("builds V2 provenance and stores the full-precision estimating rate", () => {
    const converted = {
      ...item,
      defaultUnit: "m2",
      supplierUnit: "each",
      pricing: {
        ...item.pricing!,
        sourcePricing: { ...item.pricing!.sourcePricing, unitCost: 46, unit: "each" },
        estimatingPricing: {
          ...item.pricing!.estimatingPricing,
          derivationKind: "confirmed_conversion" as const,
          normalizedSourceUnitCost: 46,
          unitCost: 15.972222222222223,
          unit: "m2",
        },
        conversion: {
          conversionId: "66666666-6666-4666-8666-666666666666", supplierQuantity: 1,
          supplierUnit: "each", materialQuantity: 2.88, materialUnit: "m2",
          confirmationSource: "user_confirmed_ai" as const, contractVersion: "material_unit_conversion_v2",
          effectiveFrom: "2026-08-16T00:00:00.000Z", confirmedAt: "2026-08-16T00:00:00.000Z",
        },
      },
    };
    const cell = buildMaterialEstimatingRateWorksheetCell({
      item: converted, bindingId: "77777777-7777-4777-8777-777777777777",
    });
    expect(cell.value).toBe(15.972222222222223);
    expect(getWorksheetCellMaterialPricingProvenance(cell)).toMatchObject({
      version: 2,
      sourcePricing: { unitCost: 46, unit: "each" },
      conversion: { supplierQuantity: 1, materialQuantity: 2.88 },
      estimatingPricing: { unitCost: 15.972222222222223, unit: "m2" },
    });
  });

  it("refuses V2 insertion for an unavailable estimating result", () => {
    const unavailable = { ...item, pricing: { ...item.pricing!, estimatingPricing: { ...item.pricing!.estimatingPricing, status: "conversion_required" as const, derivationKind: null, unitCost: null } } };
    expect(() => buildMaterialEstimatingRateWorksheetCell({ item: unavailable, bindingId: "77777777-7777-4777-8777-777777777777" })).toThrow(/no safe estimating rate/i);
  });

  it("keeps the inserted historical snapshot independent from later library prices", () => {
    const inserted = buildMaterialPriceWorksheetCell({
      item,
      bindingId: "55555555-5555-4555-8555-555555555555",
    });
    const laterPickerItem = { ...item, pricing: { ...item.pricing!, sourcePricing: { ...item.pricing!.sourcePricing, supplierPriceId: "66666666-6666-4666-8666-666666666666", unitCost: 5.15 } } };
    expect(laterPickerItem.pricing.sourcePricing.unitCost).toBe(5.15);
    expect(inserted.value).toBe(4.88);
    const provenance = getWorksheetCellMaterialPricingProvenance(inserted);
    expect(provenance?.version === 1 ? provenance.supplierPriceId : null).toBe(item.pricing!.sourcePricing.supplierPriceId);
  });

  it("uses one bounded RPC call per picker page", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: page, error: null });
    const result = await searchPricingWorksheetMaterials({ supabase: { rpc }, workbookId: "workbook-1", search: " stud ", page: 2 });
    expect(result.items[0].supplierSku).toBe("MBS-92-30");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("search_pricing_worksheet_materials", expect.objectContaining({ p_workbook_id: "workbook-1", p_search: "stud", p_page: 2, p_page_size: 20 }));
  });

  it("uses one bounded organization-scoped RPC call without a workbook", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: page, error: null });
    const result = await searchOrganizationMaterials({ supabase: { rpc }, organizationId: "org-1", search: "gib", page: 2 });
    expect(result.items[0].supplierSku).toBe("MBS-92-30");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("search_organization_supplier_materials", expect.objectContaining({
      p_organization_id: "org-1", p_search: "gib", p_page: 2, p_page_size: 20,
    }));
  });

  it.each(["", " ", "   ", "a", " 9 "])("returns an empty first page without an RPC for insufficient search %j", async (search) => {
    const rpc = vi.fn();
    const result = await searchPricingWorksheetMaterials({
      supabase: { rpc },
      workbookId: "workbook-1",
      search,
      page: 3,
      evaluationTime: "2026-08-16T03:00:00.000Z",
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasMore: false,
      evaluatedAt: "2026-08-16T03:00:00.000Z",
    });
  });

  it.each(["13", "90", "H1", "gib"])("calls the bounded RPC once for valid search %j", async (search) => {
    const rpc = vi.fn().mockResolvedValue({ data: page, error: null });
    await searchPricingWorksheetMaterials({ supabase: { rpc }, workbookId: "workbook-1", search });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("search_pricing_worksheet_materials", expect.objectContaining({ p_search: search }));
  });

  it("collapses internal whitespace before calling the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: page, error: null });
    await searchPricingWorksheetMaterials({ supabase: { rpc }, workbookId: "workbook-1", search: "  92   mm  " });

    expect(rpc).toHaveBeenCalledWith("search_pricing_worksheet_materials", expect.objectContaining({ p_search: "92 mm" }));
  });
});
