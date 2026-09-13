export const OPPORTUNITY_AWARD_PRICING_CLASSIFICATIONS = [
  "EXACT",
  "DERIVABLE",
  "AMBIGUOUS",
  "MANUAL_ONLY",
  "MIXED",
  "NO_WORKSHEET",
  "BROKEN_LINEAGE",
] as const;

export type OpportunityAwardPricingClassification =
  (typeof OPPORTUNITY_AWARD_PRICING_CLASSIFICATIONS)[number];

export type OpportunityAwardPricingReconciliationInput = {
  hasFinalProjectMapping: boolean;
  hasAcceptedQuote: boolean;
  acceptedQuoteMatchesOpportunity: boolean;
  acceptedQuoteMatchesProject: boolean;
  candidateWorkbookCount: number;
  quoteLineCount: number;
  worksheetLinkedQuoteLineCount: number;
  invalidWorksheetLinkCount: number;
  distinctLinkedWorkbookCount: number;
};

function nonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Pure classification shared by the read-only reconciliation tooling and tests.
 * It intentionally refuses to infer a workbook from ordering or timestamps.
 */
export function classifyOpportunityAwardPricing(
  input: OpportunityAwardPricingReconciliationInput,
): OpportunityAwardPricingClassification {
  const candidateWorkbookCount = nonNegativeInteger(input.candidateWorkbookCount);
  const quoteLineCount = nonNegativeInteger(input.quoteLineCount);
  const worksheetLinkedQuoteLineCount = nonNegativeInteger(input.worksheetLinkedQuoteLineCount);
  const invalidWorksheetLinkCount = nonNegativeInteger(input.invalidWorksheetLinkCount);
  const distinctLinkedWorkbookCount = nonNegativeInteger(input.distinctLinkedWorkbookCount);

  if (
    !input.hasFinalProjectMapping
    || !input.hasAcceptedQuote
    || !input.acceptedQuoteMatchesOpportunity
    || !input.acceptedQuoteMatchesProject
    || invalidWorksheetLinkCount > 0
    || worksheetLinkedQuoteLineCount > quoteLineCount
    || distinctLinkedWorkbookCount > candidateWorkbookCount
  ) {
    return "BROKEN_LINEAGE";
  }

  if (candidateWorkbookCount === 0) {
    return quoteLineCount > 0 ? "MANUAL_ONLY" : "NO_WORKSHEET";
  }

  if (quoteLineCount === 0 || worksheetLinkedQuoteLineCount === 0) {
    return "AMBIGUOUS";
  }

  if (worksheetLinkedQuoteLineCount < quoteLineCount) {
    return "MIXED";
  }

  if (distinctLinkedWorkbookCount === 0) {
    return "BROKEN_LINEAGE";
  }

  return candidateWorkbookCount === 1 && distinctLinkedWorkbookCount === 1
    ? "EXACT"
    : "DERIVABLE";
}

