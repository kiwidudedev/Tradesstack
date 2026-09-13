export const SOURCE_TAX_BASES = ["exclusive", "inclusive", "zero_rated", "exempt", "no_tax", "unknown"] as const;
export type SourceTaxBasis = typeof SOURCE_TAX_BASES[number];
export type TaxComparisonBasis = "exclusive" | "inclusive";
export type TaxNormalizationStatus =
  | "normalized"
  | "unknown_tax_basis"
  | "unsupported_tax_jurisdiction"
  | "missing_tax_policy"
  | "tax_rate_conflict";

export type OrganizationTaxPolicy = {
  id: string | null;
  organizationId: string;
  jurisdictionCode: string;
  taxName: string;
  registrationStatus: "registered" | "unregistered" | "unknown";
  comparisonBasis: TaxComparisonBasis;
  standardRate: number;
  supportsInclusiveExclusive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  policySource: string;
};

export type PriceTaxSnapshot = {
  sourceTaxBasis: SourceTaxBasis;
  sourceTaxRate: number | null;
  taxJurisdictionCode: string | null;
  comparisonTaxBasis: TaxComparisonBasis | null;
  comparisonTaxRate: number | null;
  taxPolicySnapshot: Record<string, unknown>;
  taxEvidence: Record<string, unknown>;
};
