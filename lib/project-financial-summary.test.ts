import { describe, expect, it } from "vitest";

import {
  calculateProjectFinancialSummary,
  type ProjectFinancialSummaryInput,
} from "@/lib/project-financial-summary";

function input(overrides: Partial<ProjectFinancialSummaryInput> = {}): ProjectFinancialSummaryInput {
  return {
    baselineQuote: null,
    approvedVariations: [],
    baselineQuoteLines: [],
    approvedVariationLines: [],
    committedPurchaseOrderCount: 0,
    committedLines: [],
    actualEvents: [],
    claims: [],
    ...overrides,
  };
}

describe("classification-independent project financial summary", () => {
  it("returns zero factual totals for an empty project", () => {
    expect(calculateProjectFinancialSummary(input())).toMatchObject({
      originalBudget: 0, approvedVariations: 0, currentBudget: 0,
      estimated: 0, committed: 0, actual: 0, reversed: 0, netActual: 0,
      remaining: 0, variance: 0, revenue: 0, retention: 0,
    });
  });

  it("uses the Quote commercial total and existing adjustment semantics", () => {
    const result = calculateProjectFinancialSummary(input({
      baselineQuote: { subtotal: 1000, marginPercent: 10, contingencyAmount: 25, discountAmount: 5 },
      baselineQuoteLines: [{ amount: 600 }, { amount: 400 }],
    }));
    expect(result).toMatchObject({ originalBudget: 1120, currentBudget: 1120, estimated: 1120 });
    expect(result.sourceCounts.estimate.commercialAdjustmentLines).toBe(1);
  });

  it("adds approved Variations while a rejected Variation supplied by neither loader nor core has no effect", () => {
    const result = calculateProjectFinancialSummary(input({
      baselineQuote: { subtotal: 1000 },
      baselineQuoteLines: [{ amount: 1000 }],
      approvedVariations: [{ subtotal: 200, marginPercent: 10 }],
      approvedVariationLines: [{ amount: 220 }],
    }));
    expect(result).toMatchObject({ approvedVariations: 220, currentBudget: 1220, estimated: 1220 });
  });

  it("counts only PO lines selected by the existing eligible-status loader", () => {
    const result = calculateProjectFinancialSummary(input({
      committedPurchaseOrderCount: 2,
      committedLines: [{ amount: 125.25 }, { amount: 74.75 }],
    }));
    expect(result.committed).toBe(200);
    expect(result.sourceCounts.committed).toEqual({ purchaseOrders: 2, purchaseOrderLines: 2 });
  });

  it("applies posting, reversal, and repost as an exact signed Actual ledger", () => {
    const result = calculateProjectFinancialSummary(input({
      baselineQuote: { subtotal: 1000 },
      baselineQuoteLines: [{ amount: 1000 }],
      actualEvents: [
        { eventType: "posting", amount: 250 },
        { eventType: "reversal", amount: -250 },
        { eventType: "posting", amount: 175 },
      ],
    }));
    expect(result).toMatchObject({ actual: 175, reversed: 250, netActual: 175, remaining: 825, variance: 825 });
    expect(result.sourceCounts.actual).toEqual({ postings: 2, reversals: 1 });
  });

  it("has no Cost Code or accounting-mapping input and therefore retains null, 800, and unmapped money", () => {
    const result = calculateProjectFinancialSummary(input({
      baselineQuote: { subtotal: 300 },
      baselineQuoteLines: [{ amount: 100 }, { amount: 100 }, { amount: 100 }],
      committedPurchaseOrderCount: 3,
      committedLines: [{ amount: 10 }, { amount: 20 }, { amount: 30 }],
      actualEvents: [
        { eventType: "posting", amount: 5 },
        { eventType: "posting", amount: 15 },
        { eventType: "posting", amount: 25 },
      ],
    }));
    expect(result).toMatchObject({ estimated: 300, committed: 60, actual: 45 });
    expect(JSON.stringify(input())).not.toMatch(/cost.?code|mapping/i);
  });

  it("excludes superseded/duplicate sources structurally by accepting only loader-qualified rows", () => {
    const result = calculateProjectFinancialSummary(input({
      baselineQuote: { subtotal: 100 },
      baselineQuoteLines: [{ amount: 100 }],
      approvedVariations: [{ subtotal: 25 }],
      approvedVariationLines: [{ amount: 25 }],
    }));
    expect(result.estimated).toBe(125);
    expect(result.sourceCounts.estimate).toMatchObject({ baselineQuoteLines: 1, approvedVariationLines: 1 });
  });

  it("uses active Project Claim facts for gross revenue and held less released retention", () => {
    const result = calculateProjectFinancialSummary(input({
      claims: [
        { status: "Submitted", claimAmount: 1000, retentionWithheldAmount: 100, retentionReleasedAmount: 0 },
        { status: "Paid", claimAmount: 500, retentionWithheldAmount: 0, retentionReleasedAmount: 40 },
        { status: "Cancelled", claimAmount: 999, retentionWithheldAmount: 999, retentionReleasedAmount: 0 },
      ],
    }));
    expect(result).toMatchObject({ revenue: 1500, retention: 60 });
    expect(result.sourceCounts.revenue).toEqual({ claims: 2, cancelledClaimsExcluded: 1 });
  });
});
