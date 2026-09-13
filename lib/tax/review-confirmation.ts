import type { SourceTaxBasis } from "@/lib/tax/types";

export function buildReviewedPriceTaxConfirmation(params: {
  reviewedTaxBasis: SourceTaxBasis;
  reviewedSourceTaxRate: number | null;
  extractedTaxBasis: SourceTaxBasis;
  extractedTaxRate: number | null;
  selectedPriceKey: string;
  actorUserId: string;
  confirmedAt: string;
}) {
  const wasOverridden = params.reviewedTaxBasis !== params.extractedTaxBasis;
  return {
    wasOverridden,
    explicitSourceTaxRate: wasOverridden
      ? null
      : params.reviewedSourceTaxRate ?? params.extractedTaxRate,
    confirmation: {
      source: wasOverridden || params.selectedPriceKey === "manual"
        ? "user_confirmed" as const
        : "document_extracted" as const,
      actorUserId: params.actorUserId,
      confirmedAt: params.confirmedAt,
    },
  };
}
