import { describe, expect, it } from "vitest";

import { calculateProjectFinancialSummary } from "@/lib/project-financial-summary";

describe("Phase 2 legacy/new dual run", () => {
  it("reconciles every factual total while retaining an explicit unclassified compatibility bucket", () => {
    const estimateLines = [
      { amount: 400, legacyGroup: "100 Materials" },
      { amount: 350, legacyGroup: "800 Others" },
      { amount: 250, legacyGroup: "Unclassified" },
    ];
    const committedLines = [
      { amount: 125, legacyGroup: "300 Subcontractors" },
      { amount: 75, legacyGroup: "Unclassified" },
    ];
    const actualEvents = [
      { eventType: "posting" as const, amount: 120, legacyGroup: "100 Materials" },
      { eventType: "posting" as const, amount: 80, legacyGroup: "800 Others" },
      { eventType: "reversal" as const, amount: -20, legacyGroup: "Unmatched actuals" },
    ];
    const claims = [
      { status: "Submitted", claimAmount: 500, retentionWithheldAmount: 50, retentionReleasedAmount: 10 },
    ];

    const summary = calculateProjectFinancialSummary({
      baselineQuote: { subtotal: 1000 },
      approvedVariations: [],
      baselineQuoteLines: estimateLines,
      approvedVariationLines: [],
      committedPurchaseOrderCount: 2,
      committedLines,
      actualEvents,
      claims,
    });
    const legacy = {
      originalBudget: 1000,
      currentBudget: 1000,
      estimated: estimateLines.reduce((sum, line) => sum + line.amount, 0),
      committed: committedLines.reduce((sum, line) => sum + line.amount, 0),
      actual: actualEvents.reduce((sum, event) => sum + event.amount, 0),
      variance: 1000 - actualEvents.reduce((sum, event) => sum + event.amount, 0),
      revenue: claims.reduce((sum, claim) => sum + claim.claimAmount, 0),
      retention: claims.reduce(
        (sum, claim) => sum + claim.retentionWithheldAmount - claim.retentionReleasedAmount,
        0,
      ),
    };

    expect({
      originalBudget: summary.originalBudget,
      currentBudget: summary.currentBudget,
      estimated: summary.estimated,
      committed: summary.committed,
      actual: summary.actual,
      variance: summary.variance,
      revenue: summary.revenue,
      retention: summary.retention,
    }).toEqual(legacy);
    expect(estimateLines.filter((line) => line.legacyGroup === "Unclassified")).toHaveLength(1);
    expect(committedLines.filter((line) => line.legacyGroup === "Unclassified")).toHaveLength(1);
    expect(actualEvents.filter((event) => event.legacyGroup === "Unmatched actuals")).toHaveLength(1);
  });
});
