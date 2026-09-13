import type { OrganizationTaxPolicy, SourceTaxBasis, TaxComparisonBasis, TaxNormalizationStatus } from "@/lib/tax/types";
import { divideByTaxFactor, multiplyByTaxFactor } from "@/lib/tax/rounding";

export type TaxNormalizationResult = {
  status: TaxNormalizationStatus;
  normalizedAmount: number | null;
  sourceBasis: SourceTaxBasis;
  comparisonBasis: TaxComparisonBasis | null;
  appliedRate: number | null;
  jurisdictionCode: string | null;
  taxName: string | null;
};

export function normalizePriceTaxBasis(input: {
  sourceAmount: number;
  sourceTaxBasis: SourceTaxBasis;
  sourceTaxRate?: number | null;
  policy: OrganizationTaxPolicy | null;
}): TaxNormalizationResult {
  const base = {
    normalizedAmount: null,
    sourceBasis: input.sourceTaxBasis,
    comparisonBasis: input.policy?.comparisonBasis ?? null,
    appliedRate: input.policy?.standardRate ?? null,
    jurisdictionCode: input.policy?.jurisdictionCode ?? null,
    taxName: input.policy?.taxName ?? null,
  };
  if (input.sourceTaxBasis === "unknown") return { ...base, status: "unknown_tax_basis" };
  if (!input.policy) return { ...base, status: "missing_tax_policy" };
  if (!input.policy.supportsInclusiveExclusive) return { ...base, status: "unsupported_tax_jurisdiction" };
  if (
    input.sourceTaxRate !== null
    && input.sourceTaxRate !== undefined
    && Math.abs(input.sourceTaxRate - input.policy.standardRate) > 0.0001
    && (input.sourceTaxBasis === "inclusive" || input.sourceTaxBasis === "exclusive")
  ) return { ...base, status: "tax_rate_conflict" };

  const rate = input.policy.standardRate;
  const untaxedTreatment = input.sourceTaxBasis === "zero_rated" || input.sourceTaxBasis === "exempt" || input.sourceTaxBasis === "no_tax";
  const net = input.sourceTaxBasis === "inclusive" ? divideByTaxFactor(input.sourceAmount, rate) : input.sourceAmount;
  const normalizedAmount = input.policy.comparisonBasis === "inclusive" && !untaxedTreatment
    ? multiplyByTaxFactor(net, rate)
    : net;
  return { ...base, status: "normalized", normalizedAmount };
}
