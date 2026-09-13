import { describe, expect, it } from "vitest";
import { lineItemTotal } from "@/lib/quote-editor-core";
import {
  buildQuoteLineFromSupplierPrice,
  resolveQuoteSupplierPrice,
} from "@/lib/materials/quote-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";

function pickerItem(overrides: {
  sourceCost?: number;
  sourceUnit?: string;
  sourceBasis?: string;
  sourceRate?: number | null;
  comparisonRate?: number | null;
  currency?: string;
  estimatingUnit?: string;
  estimatingCost?: number | null;
  status?: "available" | "conversion_required";
  productDescription?: string | null;
  conversion?: PricingWorksheetMaterialPickerItem["pricing"] extends infer T
    ? T extends { conversion: infer C } ? C : never
    : never;
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
    supplierId: "supplier-1",
    supplierName: "Carters",
    supplierProductId: "product-1",
    supplierProductDescription: overrides.productDescription === undefined ? "GIB Fyrelene 13mm (2.4m)" : overrides.productDescription,
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
        unitCost: status === "available" ? (overrides.estimatingCost ?? sourceCost) : null,
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

describe("Quote supplier pricing adapter", () => {
  it("maps an exclusive NZD estimating pair into a Materials line", () => {
    const line = buildQuoteLineFromSupplierPrice(pickerItem({ sourceCost: 15.972222222222223 }), () => "line-1");
    expect(line).toEqual({
      id: "line-1",
      section: "Materials",
      description: "GIB Fyrelene 13mm — GIB Fyrelene 13mm (2.4m)",
      quantity: 1,
      unit: "each",
      rate: 15.972222222222223,
      isOptional: false,
    });
  });

  it("derives a GST-exclusive rate from an inclusive source using canonical tax normalization", () => {
    const resolution = resolveQuoteSupplierPrice(pickerItem({ sourceCost: 115, sourceBasis: "inclusive", estimatingCost: 115 }));
    expect(resolution).toEqual({ status: "available", rate: 100, unit: "each" });
  });

  it("does not remove GST from zero-rated source pricing", () => {
    const resolution = resolveQuoteSupplierPrice(pickerItem({ sourceCost: 100, sourceBasis: "zero_rated", sourceRate: null }));
    expect(resolution).toEqual({ status: "available", rate: 100, unit: "each" });
  });

  it("preserves the exclusive rate/unit pair through a confirmed pack conversion", () => {
    const item = pickerItem({
      sourceCost: 46,
      sourceUnit: "sheet",
      sourceBasis: "inclusive",
      estimatingUnit: "m2",
      estimatingCost: 15.972222222222223,
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
    });
    const resolution = resolveQuoteSupplierPrice(item);
    expect(resolution.status).toBe("available");
    if (resolution.status === "available") {
      expect(resolution.unit).toBe("m2");
      expect(resolution.rate).toBeCloseTo(13.8888888889, 8);
    }
  });

  it("rejects unavailable rates, foreign currency, invalid tax evidence, and missing conversion", () => {
    expect(resolveQuoteSupplierPrice(pickerItem({ status: "conversion_required" })).status).toBe("unavailable");
    expect(resolveQuoteSupplierPrice(pickerItem({ currency: "AUD" })).status).toBe("unavailable");
    expect(resolveQuoteSupplierPrice(pickerItem({ comparisonRate: null })).status).toBe("unavailable");
    expect(resolveQuoteSupplierPrice(pickerItem({ sourceUnit: "sheet", estimatingUnit: "m2" })).status).toBe("unavailable");
  });

  it("uses the canonical name alone when product text is not meaningfully distinct", () => {
    const line = buildQuoteLineFromSupplierPrice(pickerItem({ productDescription: "gib fyrelene 13mm" }), () => "line-1");
    expect(line.description).toBe("GIB Fyrelene 13mm");
  });

  it("creates independent snapshots and applies Quote GST exactly once", () => {
    let nextId = 0;
    const item = pickerItem({ sourceCost: 115, sourceBasis: "inclusive", estimatingCost: 115 });
    const first = buildQuoteLineFromSupplierPrice(item, () => `line-${++nextId}`);
    const second = buildQuoteLineFromSupplierPrice(item, () => `line-${++nextId}`);
    expect(first.id).not.toBe(second.id);
    const subtotal = lineItemTotal(first);
    const gst = subtotal * 0.15;
    expect(subtotal).toBe(100);
    expect(gst).toBe(15);
    expect(subtotal + gst).toBe(115);
  });
});
