import { describe, expect, it } from "vitest";
import { buildReviewedPriceTaxConfirmation } from "@/lib/tax/review-confirmation";

describe("Material import reviewed tax confirmation", () => {
  it("marks an override as user-confirmed with actor and timestamp while discarding the extracted rate", () => {
    expect(buildReviewedPriceTaxConfirmation({
      reviewedTaxBasis: "exclusive",
      reviewedSourceTaxRate: 15,
      extractedTaxBasis: "inclusive",
      extractedTaxRate: 15,
      selectedPriceKey: "source-1:retail",
      actorUserId: "user-1",
      confirmedAt: "2026-08-15T04:00:00.000Z",
    })).toEqual({
      wasOverridden: true,
      explicitSourceTaxRate: null,
      confirmation: {
        source: "user_confirmed",
        actorUserId: "user-1",
        confirmedAt: "2026-08-15T04:00:00.000Z",
      },
    });
  });

  it("retains extracted provenance when the reviewed basis is unchanged", () => {
    expect(buildReviewedPriceTaxConfirmation({
      reviewedTaxBasis: "inclusive",
      reviewedSourceTaxRate: 15,
      extractedTaxBasis: "inclusive",
      extractedTaxRate: 15,
      selectedPriceKey: "source-1:retail",
      actorUserId: "user-1",
      confirmedAt: "2026-08-15T04:00:00.000Z",
    })).toMatchObject({
      wasOverridden: false,
      explicitSourceTaxRate: 15,
      confirmation: { source: "document_extracted" },
    });
  });

  it("marks a manual price basis as user-confirmed", () => {
    expect(buildReviewedPriceTaxConfirmation({
      reviewedTaxBasis: "exclusive",
      reviewedSourceTaxRate: null,
      extractedTaxBasis: "exclusive",
      extractedTaxRate: null,
      selectedPriceKey: "manual",
      actorUserId: "user-1",
      confirmedAt: "2026-08-15T04:00:00.000Z",
    }).confirmation.source).toBe("user_confirmed");
  });
});
