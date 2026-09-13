export const PROJECT_FINANCIAL_SUMMARY_COMMITTED_STATUSES = [
  "Approved",
  "Issued",
  "Received",
  "Invoiced",
] as const;

export const PROJECT_FINANCIAL_SUMMARY_APPROVED_VARIATION_STATUSES = ["Approved"] as const;

export type CommercialTotalSource = {
  subtotal?: number | null;
  marginPercent?: number | null;
  discountAmount?: number | null;
  contingencyAmount?: number | null;
};

export type ProjectFinancialSummaryInput = {
  baselineQuote: CommercialTotalSource | null;
  approvedVariations: CommercialTotalSource[];
  baselineQuoteLines: Array<{ amount: number | null }>;
  approvedVariationLines: Array<{ amount: number | null }>;
  committedPurchaseOrderCount: number;
  committedLines: Array<{ amount: number | null }>;
  actualEvents: Array<{
    eventType: "posting" | "reversal";
    amount: number | null;
  }>;
  claims: Array<{
    status: string;
    claimAmount: number | null;
    retentionWithheldAmount: number | null;
    retentionReleasedAmount: number | null;
  }>;
};

export type ProjectFinancialSummary = {
  originalBudget: number;
  approvedVariations: number;
  currentBudget: number;
  estimated: number;
  committed: number;
  actual: number;
  reversed: number;
  netActual: number;
  remaining: number;
  variance: number;
  variancePercent: number | null;
  revenue: number;
  retention: number;
  sourceCounts: {
    estimate: {
      baselineQuotes: number;
      baselineQuoteLines: number;
      approvedVariations: number;
      approvedVariationLines: number;
      commercialAdjustmentLines: number;
    };
    committed: {
      purchaseOrders: number;
      purchaseOrderLines: number;
    };
    actual: {
      postings: number;
      reversals: number;
    };
    revenue: {
      claims: number;
      cancelledClaimsExcluded: number;
    };
    retention: {
      claims: number;
    };
  };
  warnings: string[];
};

export function roundProjectMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateProjectCommercialPreGstTotal(source: CommercialTotalSource) {
  const subtotal = Number(source.subtotal ?? 0);
  const marginPercent = Number(source.marginPercent ?? 0);
  const discountAmount = Number(source.discountAmount ?? 0);
  const contingencyAmount = Number(source.contingencyAmount ?? 0);

  return roundProjectMoney(
    Math.max(0, subtotal + subtotal * (marginPercent / 100) + contingencyAmount - discountAmount),
  );
}

function sumAmounts(rows: Array<{ amount: number | null }>) {
  return roundProjectMoney(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
}

/**
 * Deterministic, classification-independent project financial arithmetic.
 *
 * No routing, mapping, Cost Code, or lineage field is accepted by this contract.
 * Financial validity is established by the source loader before values arrive here.
 */
export function calculateProjectFinancialSummary(
  input: ProjectFinancialSummaryInput,
): ProjectFinancialSummary {
  const originalBudget = input.baselineQuote
    ? calculateProjectCommercialPreGstTotal(input.baselineQuote)
    : 0;
  const approvedVariations = roundProjectMoney(
    input.approvedVariations.reduce(
      (sum, variation) => sum + calculateProjectCommercialPreGstTotal(variation),
      0,
    ),
  );
  const currentBudget = roundProjectMoney(originalBudget + approvedVariations);

  // The legacy Project Cost Report reconciles classified Quote/Variation lines
  // to their commercial document totals with an explicit adjustment row.
  const classifiedEstimate = roundProjectMoney(
    sumAmounts(input.baselineQuoteLines) + sumAmounts(input.approvedVariationLines),
  );
  const commercialAdjustment = roundProjectMoney(currentBudget - classifiedEstimate);
  const estimated = roundProjectMoney(classifiedEstimate + commercialAdjustment);
  const committed = sumAmounts(input.committedLines);

  const postingEvents = input.actualEvents.filter((event) => event.eventType === "posting");
  const reversalEvents = input.actualEvents.filter((event) => event.eventType === "reversal");
  const postedActual = sumAmounts(postingEvents);
  const signedReversalMovement = sumAmounts(reversalEvents);
  const netActual = roundProjectMoney(postedActual + signedReversalMovement);

  const activeClaims = input.claims.filter((claim) => claim.status !== "Cancelled");
  const revenue = roundProjectMoney(
    activeClaims.reduce((sum, claim) => sum + Number(claim.claimAmount ?? 0), 0),
  );
  const retention = roundProjectMoney(Math.max(0, activeClaims.reduce(
    (sum, claim) => sum
      + Number(claim.retentionWithheldAmount ?? 0)
      - Number(claim.retentionReleasedAmount ?? 0),
    0,
  )));
  const remaining = roundProjectMoney(estimated - netActual);
  const warnings: string[] = [];

  if (!input.baselineQuote) warnings.push("No contractual baseline Quote was available.");
  if (commercialAdjustment !== 0) {
    warnings.push(
      `Commercial document totals differ from current factual estimate lines by ${commercialAdjustment.toFixed(2)}; the existing budget-adjustment semantics were applied.`,
    );
  }

  return {
    originalBudget,
    approvedVariations,
    currentBudget,
    estimated,
    committed,
    // `actual` remains the legacy-compatible signed Actual ledger total.
    actual: netActual,
    reversed: roundProjectMoney(Math.abs(signedReversalMovement)),
    netActual,
    remaining,
    variance: remaining,
    variancePercent: estimated === 0 ? null : (remaining / estimated) * 100,
    revenue,
    retention,
    sourceCounts: {
      estimate: {
        baselineQuotes: input.baselineQuote ? 1 : 0,
        baselineQuoteLines: input.baselineQuoteLines.length,
        approvedVariations: input.approvedVariations.length,
        approvedVariationLines: input.approvedVariationLines.length,
        commercialAdjustmentLines: commercialAdjustment === 0 ? 0 : 1,
      },
      committed: {
        purchaseOrders: input.committedPurchaseOrderCount,
        purchaseOrderLines: input.committedLines.length,
      },
      actual: {
        postings: postingEvents.length,
        reversals: reversalEvents.length,
      },
      revenue: {
        claims: activeClaims.length,
        cancelledClaimsExcluded: input.claims.length - activeClaims.length,
      },
      retention: { claims: activeClaims.length },
    },
    warnings,
  };
}
