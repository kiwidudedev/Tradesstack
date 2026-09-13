import { describe, expect, it } from "vitest";
import { validateMaterialImportReviewDraft } from "@/lib/materials/validation";

const review = {
  rowId: "row-1",
  action: "create_material" as const,
  reviewedName: "GIB Standard Plasterboard 10mm",
  reviewedUnit: "m2",
  reviewedUnitCost: 8.3,
  reviewedCurrency: "NZD",
  reviewedSupplierDescription: "GIB Standard 10mm",
  reviewedSupplierSku: null,
  selectedPriceKey: "source-1:fis",
};

describe("Material import review description boundary", () => {
  it("approves without requiring a user-reviewed Material description", () => {
    expect(validateMaterialImportReviewDraft(review)).toMatchObject({
      reviewedName: review.reviewedName,
      reviewedDescription: null,
      reviewedSupplierDescription: review.reviewedSupplierDescription,
    });
  });

  it("preserves an internally supplied extracted description", () => {
    expect(validateMaterialImportReviewDraft({
      ...review,
      reviewedDescription: "GIB standard plasterboard 10mm thickness, priced per m2",
    }).reviewedDescription).toBe("GIB standard plasterboard 10mm thickness, priced per m2");
  });

  it("requires an explicit boolean acknowledgement for a possible prior import", () => {
    expect(validateMaterialImportReviewDraft({
      ...review,
      allowDuplicateSourceObservation: true,
    }).allowDuplicateSourceObservation).toBe(true);
    expect(validateMaterialImportReviewDraft({
      ...review,
      allowDuplicateSourceObservation: false,
    }).allowDuplicateSourceObservation).toBe(false);
  });

  it("separates supplier and Material units and validates a confirmed conversion", () => {
    expect(validateMaterialImportReviewDraft({
      ...review,
      reviewedUnit: undefined,
      supplierUnit: "each",
      materialUnit: "L/M",
      reviewedUnitCost: 48.75,
      confirmedUnitConversion: {
        supplierQuantity: 1,
        supplierUnit: "ea",
        materialQuantity: 6,
        materialUnit: "linear metre",
        convertedUnitCost: 8.125,
        currency: "NZD",
        contractVersion: "material_unit_conversion_v1",
        source: "user_confirmed_ai",
        explanation: "One six metre length.",
        confidence: 0.98,
      },
    })).toMatchObject({
      supplierUnit: "each",
      materialUnit: "lm",
      confirmedUnitConversion: { convertedUnitCost: 8.125 },
    });
  });

  it("rejects a conversion that would change the immutable source-price arithmetic", () => {
    expect(() => validateMaterialImportReviewDraft({
      ...review,
      reviewedUnit: undefined,
      supplierUnit: "each",
      materialUnit: "lm",
      reviewedUnitCost: 48.75,
      confirmedUnitConversion: {
        supplierQuantity: 1,
        supplierUnit: "each",
        materialQuantity: 6,
        materialUnit: "lm",
        convertedUnitCost: 9,
        currency: "NZD",
        contractVersion: "material_unit_conversion_v1",
        source: "user_confirmed_ai",
        explanation: null,
        confidence: null,
      },
    })).toThrow(/does not match the source price/);
  });
});
