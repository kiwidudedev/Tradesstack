import type { InterpretationRunMetadata } from "@/lib/document-intelligence/contracts";
import type { MaterialImportCandidateRow } from "@/lib/materials/types";
import type { MaterialSupplierPricingRow, MaterialSupplierPricingV1 } from "@/lib/materials/supplier-pricing-intelligence/contract";

function priceForInitialReview(row: MaterialSupplierPricingRow) {
  if (row.prices.length === 1) return row.prices[0]!;
  if (row.priceRecommendation.priceKey) return row.prices.find((price) => price.priceKey === row.priceRecommendation.priceKey) ?? null;
  return null;
}

function rowConfidence(row: MaterialSupplierPricingRow) {
  const values = [row.supplierDescription.confidence, row.proposedMaterialName.confidence, row.supplierUnit.confidence]
    .filter((value): value is number => typeof value === "number");
  return values.length ? Math.min(...values) : null;
}

export function mapMaterialSupplierPricingToImportRows(input: {
  canonical: MaterialSupplierPricingV1;
  runs: InterpretationRunMetadata[];
}): MaterialImportCandidateRow[] {
  return input.canonical.rows.map((row, index) => {
    const initialPrice = priceForInitialReview(row);
    return {
      rowIndex: index + 1,
      extractedName: row.proposedMaterialName.value ?? row.supplierDescription.value ?? `Imported material ${index + 1}`,
      extractedDescription: row.proposedMaterialDescription.value,
      extractedUnit: row.supplierUnit.value,
      extractedUnitCost: initialPrice?.amount.value ?? null,
      extractedCurrency: initialPrice?.currency.value ?? input.canonical.document.currency.value,
      supplierDescription: row.supplierDescription.value,
      supplierSku: row.supplierSku.value,
      confidence: rowConfidence(row),
      sourcePayload: {
        contractVersion: input.canonical.contractVersion,
        canonicalRow: row,
        document: input.canonical.document,
        priceOptions: row.prices,
        recommendedPriceKey: row.priceRecommendation.priceKey,
        selectedPriceKey: row.prices.length === 1 ? row.prices[0]!.priceKey : null,
        warnings: row.warnings,
        pack: { quantity: row.packQuantity.value, unit: row.packUnit.value },
        runs: input.runs,
      },
    };
  });
}
