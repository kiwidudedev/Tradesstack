import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "@/lib/opportunity-pricing-worksheet-mutations";
import { buildWorksheetRedoState, buildWorksheetUndoState, commitWorksheetHistoryEntry } from "@/lib/opportunity-pricing-worksheet-history";
import { buildMaterialPriceWorksheetCell, type PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";
import { getWorksheetCellMaterialPricingProvenance } from "@/lib/worksheet-material-pricing-provenance";
import {
  buildMaterialPriceReviewOverlay,
  classifyMaterialPriceReview,
  parseMaterialPriceReviewPage,
  parseMaterialPriceReviewRequest,
} from "@/lib/pricing-worksheet-material-price-review";
import { reviewPricingWorksheetMaterialPrices } from "@/lib/pricing-worksheet-material-price-review-server";

const historical = {
  id: "44444444-4444-4444-8444-444444444444", unitCost: 4.88, unit: "L/m", currency: "NZD",
  sourceTaxBasis: "exclusive", sourceTaxRate: 0.15, taxJurisdictionCode: "NZ-GST",
  effectiveFrom: "2026-08-01T00:00:00.000Z", evaluatedAt: "2026-08-10T00:00:00.000Z",
};
const current = { ...historical, id: "55555555-5555-4555-8555-555555555555", unitCost: 5.15, evaluatedAt: "2026-08-16T00:00:00.000Z" };

const pickerItem: PricingWorksheetMaterialPickerItem = {
  materialId: "11111111-1111-4111-8111-111111111111", materialName: "Stud", materialDescription: null,
  category: "Framing", defaultUnit: "L/m", supplierId: "22222222-2222-4222-8222-222222222222",
  supplierName: "Metro", supplierProductId: "33333333-3333-4333-8333-333333333333",
  supplierProductDescription: "92mm Stud", supplierSku: "STUD-92", supplierUnit: "L/m", isPreferred: false,
  pricing: {
    sourcePricing: {
      supplierPriceId: historical.id, unitCost: historical.unitCost, unit: historical.unit,
      currency: historical.currency, sourceTaxBasis: historical.sourceTaxBasis,
      sourceTaxRate: historical.sourceTaxRate, taxJurisdictionCode: historical.taxJurisdictionCode,
      comparisonTaxBasis: "exclusive", comparisonTaxRate: 15, effectiveFrom: historical.effectiveFrom,
    },
    estimatingPricing: {
      status: "available", derivationKind: "direct_unit_match", normalizedSourceUnitCost: historical.unitCost,
      unitCost: historical.unitCost, unit: historical.unit, currency: historical.currency,
      taxBasis: "exclusive", calculationVersion: "material_estimating_price_v1", evaluatedAt: historical.evaluatedAt,
    },
    conversion: null,
  },
};

describe("Material price review classification", () => {
  it("distinguishes current, same-terms versions, increases, decreases and zero bases", () => {
    expect(classifyMaterialPriceReview({ historicalPrice: historical, currentPrice: historical }).classification).toBe("current");
    expect(classifyMaterialPriceReview({ historicalPrice: historical, currentPrice: { ...current, unitCost: 4.88 } }).classification).toBe("version_changed_same_terms");
    expect(classifyMaterialPriceReview({ historicalPrice: historical, currentPrice: current })).toMatchObject({ classification: "price_changed", absoluteDifference: 0.27000000000000046 });
    expect(classifyMaterialPriceReview({ historicalPrice: historical, currentPrice: { ...current, unitCost: 4.6 } })).toMatchObject({ classification: "price_changed", percentageDifference: expect.any(Number) });
    expect(classifyMaterialPriceReview({ historicalPrice: { ...historical, unitCost: 0 }, currentPrice: current }).percentageDifference).toBeNull();
  });

  it.each([
    ["unit", { unit: "ea" }], ["currency", { currency: "AUD" }],
    ["tax_basis", { sourceTaxBasis: "inclusive" }], ["tax_rate", { sourceTaxRate: 0.1 }],
    ["tax_jurisdiction", { taxJurisdictionCode: "AU-GST" }],
  ] as const)("classifies a %s mismatch as commercial terms changed", (reason, change) => {
    expect(classifyMaterialPriceReview({ historicalPrice: historical, currentPrice: { ...current, ...change } })).toMatchObject({ classification: "commercial_terms_changed", reasonCodes: [reason] });
  });

  it("treats same-price missing-to-complete tax evidence as commercial evidence change", () => {
    expect(classifyMaterialPriceReview({
      historicalPrice: {
        ...historical,
        taxJurisdictionCode: null,
        sourceTaxBasis: "exclusive",
      },
      currentPrice: {
        ...current,
        unitCost: historical.unitCost,
        sourceTaxBasis: "exclusive",
        taxJurisdictionCode: "NZ",
      },
    })).toMatchObject({
      classification: "commercial_terms_changed",
      reasonCodes: ["tax_jurisdiction"],
      absoluteDifference: null,
      percentageDifference: null,
    });
  });

  it("classifies unavailable, inactive and missing-current sources before price comparison", () => {
    expect(classifyMaterialPriceReview({ historicalPrice: historical, currentPrice: current, sourceAvailable: false }).classification).toBe("source_unavailable");
    expect(classifyMaterialPriceReview({ historicalPrice: historical, currentPrice: current, sourceActive: false }).classification).toBe("source_inactive");
    expect(classifyMaterialPriceReview({ historicalPrice: historical, currentPrice: null }).classification).toBe("no_current_price");
  });
});

describe("Material price review dirty-sheet overlay", () => {
  it("includes new bindings, tracks structural moves, and excludes manual/formula/clear replacements", () => {
    const worksheet = createDefaultWorksheetData();
    worksheet.cells.A1 = buildMaterialPriceWorksheetCell({ item: pickerItem, bindingId: "66666666-6666-4666-8666-666666666666" });
    expect(buildMaterialPriceReviewOverlay(worksheet)[0]).toMatchObject({ cellAddress: "A1", value: 4.88 });

    const moved = { ...worksheet, cells: { B2: worksheet.cells.A1 } };
    expect(buildMaterialPriceReviewOverlay(moved)[0]?.cellAddress).toBe("B2");

    const edited = applyWorksheetMutation(worksheet, (value) => ({ ...value, cells: { ...value.cells, A1: { ...value.cells.A1!, value: 5 } } }));
    expect(buildMaterialPriceReviewOverlay(edited.nextWorksheet)).toEqual([]);
    const formula = applyWorksheetMutation(worksheet, (value) => ({ ...value, cells: { ...value.cells, A1: { ...value.cells.A1!, formula: "=1+1" } } }));
    expect(buildMaterialPriceReviewOverlay(formula.nextWorksheet)).toEqual([]);
    const cleared = applyWorksheetMutation(worksheet, (value) => ({ ...value, cells: {} }));
    expect(buildMaterialPriceReviewOverlay(cleared.nextWorksheet)).toEqual([]);
  });

  it("runtime-validates request provenance and rejects malformed overlays", () => {
    const worksheet = createDefaultWorksheetData();
    worksheet.cells.A1 = buildMaterialPriceWorksheetCell({ item: pickerItem, bindingId: "66666666-6666-4666-8666-666666666666" });
    const localBindings = buildMaterialPriceReviewOverlay(worksheet);
    const request = { workbookId: "77777777-7777-4777-8777-777777777777", activeSheetId: "88888888-8888-4888-8888-888888888888", localBindings, mode: "review" };
    expect(parseMaterialPriceReviewRequest(request)?.localBindings).toHaveLength(1);
    expect(parseMaterialPriceReviewRequest({ ...request, localBindings: [{ ...localBindings[0], value: "forged" }] })).toBeNull();
  });
});

describe("explicit reviewed price mutation", () => {
  it("uses a new binding, preserves formatting, recalculates formulas, and supports undo/redo", () => {
    const worksheet = createDefaultWorksheetData();
    worksheet.cells.A1 = buildMaterialPriceWorksheetCell({ item: pickerItem, bindingId: "66666666-6666-4666-8666-666666666666" });
    worksheet.cells.A1.metadata.format = { number: { kind: "currency" } };
    worksheet.cells.B1 = { value: null, type: "number", formula: "=A1*2", computedValue: 9.76, displayValue: "9.76", metadata: {} };
    const updatedItem = {
      ...pickerItem,
      pricing: {
        ...pickerItem.pricing!,
        sourcePricing: { ...pickerItem.pricing!.sourcePricing, supplierPriceId: current.id, unitCost: current.unitCost },
        estimatingPricing: { ...pickerItem.pricing!.estimatingPricing, normalizedSourceUnitCost: current.unitCost, unitCost: current.unitCost, evaluatedAt: current.evaluatedAt },
      },
    };
    const mutation = applyWorksheetMutation(worksheet, (value) => ({
      ...value,
      cells: { ...value.cells, A1: buildMaterialPriceWorksheetCell({ existingCell: value.cells.A1, item: updatedItem, bindingId: "99999999-9999-4999-8999-999999999999" }) },
    }));
    expect(mutation.nextWorksheet.cells.A1?.value).toBe(5.15);
    expect(mutation.nextWorksheet.cells.A1?.metadata.format).toEqual(worksheet.cells.A1.metadata.format);
    expect(mutation.nextWorksheet.cells.B1?.computedValue).toBe(10.3);
    expect(getWorksheetCellMaterialPricingProvenance(mutation.nextWorksheet.cells.A1)?.bindingId).toBe("99999999-9999-4999-8999-999999999999");
    expect(getWorksheetCellMaterialPricingProvenance(worksheet.cells.A1)?.bindingId).toBe("66666666-6666-4666-8666-666666666666");

    const history = commitWorksheetHistoryEntry({ changed: true, future: [], historyLimit: 10, past: [], previousWorksheet: worksheet });
    const undo = buildWorksheetUndoState({ currentWorksheet: mutation.nextWorksheet, future: history.future, historyLimit: 10, past: history.past })!;
    expect(getWorksheetCellMaterialPricingProvenance(undo.worksheet.cells.A1)?.bindingId).toBe("66666666-6666-4666-8666-666666666666");
    const redo = buildWorksheetRedoState({ currentWorksheet: undo.worksheet, future: undo.future, historyLimit: 10, past: undo.past })!;
    expect(getWorksheetCellMaterialPricingProvenance(redo.worksheet.cells.A1)?.bindingId).toBe("99999999-9999-4999-8999-999999999999");
  });
});

describe("Material price review service", () => {
  const response = {
    items: [], summary: { priceUpdates: 0, needsReview: 0, current: 1, versionChangedSameTerms: 0 },
    page: 1, pageSize: 20, total: 0, hasMore: false, evaluatedAt: "2026-08-16T00:00:00.000Z",
  };

  it("uses one set-oriented RPC for review and action-time revalidation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
    const request = parseMaterialPriceReviewRequest({ workbookId: "77777777-7777-4777-8777-777777777777", mode: "review" })!;
    expect(await reviewPricingWorksheetMaterialPrices({ supabase: { rpc }, request })).toEqual(response);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("review_pricing_worksheet_material_prices", expect.objectContaining({ p_workbook_id: request.workbookId, p_require_write: false }));
  });

  it("runtime-validates response summaries and groups", () => {
    expect(parseMaterialPriceReviewPage(response)).toEqual(response);
    expect(parseMaterialPriceReviewPage({ ...response, summary: { priceUpdates: "bad" } })).toBeNull();
  });
});
