import { describe, expect, it } from "vitest";
import { resolveCommercialSupplierPrice } from "@/lib/materials/commercial-supplier-pricing";
import {
  buildPurchaseOrderSelectionFromSupplierPrice,
  canUsePurchaseOrderSupplierPricing,
} from "@/lib/materials/purchase-order-supplier-pricing";
import { buildVariationLineFromSupplierPrice } from "@/lib/materials/variation-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";

function pickerItem(overrides: {
  supplierId?: string;
  supplierName?: string;
  sourceCost?: number;
  sourceUnit?: string;
  sourceBasis?: string;
  sourceRate?: number | null;
  comparisonRate?: number | null;
  currency?: string;
  estimatingUnit?: string;
  status?: "available" | "conversion_required";
  conversion?: NonNullable<PricingWorksheetMaterialPickerItem["pricing"]>["conversion"];
} = {}): PricingWorksheetMaterialPickerItem {
  const sourceCost = overrides.sourceCost ?? 100;
  const sourceUnit = overrides.sourceUnit ?? "each";
  const estimatingUnit = overrides.estimatingUnit ?? sourceUnit;
  const status = overrides.status ?? "available";
  return {
    materialId: "material-1",
    materialName: "GIB Fyrelene 13mm",
    materialDescription: null,
    category: "Linings",
    defaultUnit: estimatingUnit,
    supplierId: overrides.supplierId ?? "supplier-1",
    supplierName: overrides.supplierName ?? "Carters",
    supplierProductId: "product-1",
    supplierProductDescription: "GIB Fyrelene 13mm (2.4m)",
    supplierSku: "I01903",
    supplierUnit: sourceUnit,
    isPreferred: true,
    pricing: {
      sourcePricing: {
        supplierPriceId: "price-1",
        unitCost: sourceCost,
        unit: sourceUnit,
        currency: overrides.currency ?? "NZD",
        sourceTaxBasis: overrides.sourceBasis ?? "exclusive",
        sourceTaxRate: overrides.sourceRate === undefined ? 15 : overrides.sourceRate,
        taxJurisdictionCode: "NZ-GST",
        comparisonTaxBasis: "exclusive",
        comparisonTaxRate: overrides.comparisonRate === undefined ? 15 : overrides.comparisonRate,
        effectiveFrom: "2026-08-27T00:00:00.000Z",
      },
      estimatingPricing: {
        status,
        derivationKind: status === "available" ? (overrides.conversion ? "confirmed_conversion" : "direct_unit_match") : null,
        normalizedSourceUnitCost: status === "available" ? sourceCost : null,
        unitCost: status === "available" ? sourceCost : null,
        unit: estimatingUnit,
        currency: overrides.currency ?? "NZD",
        taxBasis: "exclusive",
        calculationVersion: "material_estimating_price_v1",
        evaluatedAt: "2026-08-27T00:00:00.000Z",
      },
      conversion: overrides.conversion ?? null,
    },
  };
}

describe("commercial supplier price resolution", () => {
  it("preserves an exclusive NZD rate at full local precision", () => {
    expect(resolveCommercialSupplierPrice(pickerItem({ sourceCost: 15.972222222222223 }), "Variation"))
      .toEqual({ status: "available", rate: 15.972222222222223, unit: "each" });
  });

  it("normalizes inclusive pricing to GST exclusive", () => {
    expect(resolveCommercialSupplierPrice(pickerItem({ sourceCost: 115, sourceBasis: "inclusive" }), "Purchase Order"))
      .toEqual({ status: "available", rate: 100, unit: "each" });
  });

  it.each(["zero_rated", "exempt", "no_tax"])("keeps %s pricing untaxed", (sourceBasis) => {
    expect(resolveCommercialSupplierPrice(pickerItem({ sourceCost: 100, sourceBasis, sourceRate: null })).status)
      .toBe("available");
    expect(resolveCommercialSupplierPrice(pickerItem({ sourceCost: 100, sourceBasis, sourceRate: null })))
      .toMatchObject({ rate: 100 });
  });

  it("rejects unavailable, non-NZD, invalid tax evidence, and invalid rates", () => {
    expect(resolveCommercialSupplierPrice(pickerItem({ status: "conversion_required" })).status).toBe("unavailable");
    expect(resolveCommercialSupplierPrice(pickerItem({ currency: "AUD" })).status).toBe("unavailable");
    expect(resolveCommercialSupplierPrice(pickerItem({ comparisonRate: null })).status).toBe("unavailable");
    expect(resolveCommercialSupplierPrice(pickerItem({ sourceCost: 115, sourceBasis: "inclusive", sourceRate: 10 })).status).toBe("unavailable");
    expect(resolveCommercialSupplierPrice(pickerItem({ sourceCost: -1 })).status).toBe("unavailable");
  });

  it("requires and applies the paired confirmed unit conversion", () => {
    expect(resolveCommercialSupplierPrice(pickerItem({ sourceUnit: "sheet", estimatingUnit: "m2" })).status)
      .toBe("unavailable");
    const resolution = resolveCommercialSupplierPrice(pickerItem({
      sourceCost: 46,
      sourceUnit: "sheet",
      sourceBasis: "inclusive",
      estimatingUnit: "m2",
      conversion: {
        conversionId: "conversion-1",
        supplierQuantity: 1,
        supplierUnit: "sheet",
        materialQuantity: 2.88,
        materialUnit: "m2",
        confirmationSource: "user_confirmed_manual",
        contractVersion: "material_unit_conversion_v2",
        effectiveFrom: "2026-08-27T00:00:00.000Z",
        confirmedAt: "2026-08-27T00:00:00.000Z",
      },
    }), "Purchase Order");
    expect(resolution.status).toBe("available");
    if (resolution.status === "available") {
      expect(resolution.unit).toBe("m2");
      expect(resolution.rate).toBeCloseTo(13.8888888889, 8);
    }
  });
});

describe("Variation supplier pricing mapper", () => {
  it("creates a manual Materials snapshot with rounded local total and no fake lineage", () => {
    const line = buildVariationLineFromSupplierPrice(pickerItem({ sourceCost: 15.972222222222223 }), () => "variation-line-1");
    expect(line).toEqual({
      id: "variation-line-1",
      section: "Materials",
      description: "GIB Fyrelene 13mm — GIB Fyrelene 13mm (2.4m)",
      quantity: 1,
      unit: "each",
      rate: 15.972222222222223,
      total: 15.97,
      sourceProjectQuoteId: null,
      sourceProjectQuoteLineItemId: null,
      sourceProjectQuoteNumber: "",
      sourcePurchaseOrderId: null,
      sourcePurchaseOrderLineItemId: null,
      sourcePurchaseOrderNumber: "",
      commercialItemLink: null,
    });
  });

  it("appends as independent snapshots when the same product is selected twice", () => {
    let id = 0;
    const item = pickerItem();
    expect(buildVariationLineFromSupplierPrice(item, () => `line-${++id}`).id)
      .not.toBe(buildVariationLineFromSupplierPrice(item, () => `line-${++id}`).id);
  });

  it("applies document GST exactly once after inclusive supplier normalization", () => {
    const line = buildVariationLineFromSupplierPrice(pickerItem({ sourceCost: 115, sourceBasis: "inclusive" }));
    expect(line.rate).toBe(100);
    expect(line.total + line.total * 0.15).toBe(115);
  });
});

describe("Purchase Order supplier pricing policy", () => {
  it.each([
    ["Material Supply", true],
    ["Subcontract Work", false],
    ["Plant / Equipment Hire", false],
    ["Site Expense", false],
    ["Freight / Delivery", false],
    ["Variation Order", false],
    ["General Purchase", false],
    ["Other", false],
  ])("allows supplier pricing for %s: %s", (purchaseOrderType, expected) => {
    expect(canUsePurchaseOrderSupplierPricing(purchaseOrderType)).toBe(expected);
  });

  it("sets an empty PO supplier and creates a manual Materials line", () => {
    let id = 0;
    const selection = buildPurchaseOrderSelectionFromSupplierPrice({
      item: pickerItem(),
      purchaseOrderSupplierId: null,
      purchaseOrderSupplierLabel: "",
      createId: () => `id-${++id}`,
    });
    expect(selection).toMatchObject({
      supplierId: "supplier-1",
      supplierLabel: "Carters",
      line: {
        id: "id-1",
        lineUid: "id-2",
        section: "Materials",
        quantity: 1,
        unit: "each",
        rate: 100,
        costItemId: null,
        sourceCostItemId: null,
        sourceTimeSheetEntryId: null,
        commercialItemLink: null,
      },
    });
  });

  it("allows a matching supplier without replacing the PO label", () => {
    const selection = buildPurchaseOrderSelectionFromSupplierPrice({
      item: pickerItem(),
      purchaseOrderSupplierId: "supplier-1",
      purchaseOrderSupplierLabel: "Carters Trade Account",
    });
    expect(selection.supplierId).toBe("supplier-1");
    expect(selection.supplierLabel).toBe("Carters Trade Account");
  });

  it("blocks a different supplier without returning a supplier or line mutation", () => {
    expect(() => buildPurchaseOrderSelectionFromSupplierPrice({
      item: pickerItem({ supplierId: "supplier-2", supplierName: "Bunnings" }),
      purchaseOrderSupplierId: "supplier-1",
      purchaseOrderSupplierLabel: "Carters",
    })).toThrow("Only prices from that supplier can be used");
  });

  it("creates independent PO line and lineUid identities", () => {
    let id = 0;
    const createId = () => `id-${++id}`;
    const item = pickerItem();
    const first = buildPurchaseOrderSelectionFromSupplierPrice({ item, purchaseOrderSupplierId: null, purchaseOrderSupplierLabel: "", createId });
    const second = buildPurchaseOrderSelectionFromSupplierPrice({ item, purchaseOrderSupplierId: null, purchaseOrderSupplierLabel: "", createId });
    expect(new Set([first.line.id, first.line.lineUid, second.line.id, second.line.lineUid]).size).toBe(4);
  });

  it("applies PO GST exactly once after inclusive supplier normalization", () => {
    const selection = buildPurchaseOrderSelectionFromSupplierPrice({
      item: pickerItem({ sourceCost: 115, sourceBasis: "inclusive" }),
      purchaseOrderSupplierId: null,
      purchaseOrderSupplierLabel: "",
    });
    expect(selection.line.rate).toBe(100);
    expect(selection.line.rate + selection.line.rate * 0.15).toBe(115);
  });
});
