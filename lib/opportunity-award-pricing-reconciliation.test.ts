import { describe, expect, it } from "vitest";
import {
  classifyOpportunityAwardPricing,
  type OpportunityAwardPricingReconciliationInput,
} from "@/lib/opportunity-award-pricing-reconciliation";

const base: OpportunityAwardPricingReconciliationInput = {
  hasFinalProjectMapping: true,
  hasAcceptedQuote: true,
  acceptedQuoteMatchesOpportunity: true,
  acceptedQuoteMatchesProject: true,
  candidateWorkbookCount: 1,
  quoteLineCount: 2,
  worksheetLinkedQuoteLineCount: 2,
  invalidWorksheetLinkCount: 0,
  distinctLinkedWorkbookCount: 1,
};

describe("Opportunity award pricing reconciliation", () => {
  it("classifies one workbook with fully published lines as EXACT", () => {
    expect(classifyOpportunityAwardPricing(base)).toBe("EXACT");
  });

  it("classifies multiple workbooks with complete source links as DERIVABLE", () => {
    expect(classifyOpportunityAwardPricing({
      ...base,
      candidateWorkbookCount: 2,
      distinctLinkedWorkbookCount: 2,
    })).toBe("DERIVABLE");
  });

  it("does not guess between multiple workbooks without source evidence", () => {
    expect(classifyOpportunityAwardPricing({
      ...base,
      candidateWorkbookCount: 2,
      worksheetLinkedQuoteLineCount: 0,
      distinctLinkedWorkbookCount: 0,
    })).toBe("AMBIGUOUS");
  });

  it("classifies quote lines without any workbook as MANUAL_ONLY", () => {
    expect(classifyOpportunityAwardPricing({
      ...base,
      candidateWorkbookCount: 0,
      worksheetLinkedQuoteLineCount: 0,
      distinctLinkedWorkbookCount: 0,
    })).toBe("MANUAL_ONLY");
  });

  it("classifies published and unlinked quote lines as MIXED", () => {
    expect(classifyOpportunityAwardPricing({
      ...base,
      quoteLineCount: 3,
      worksheetLinkedQuoteLineCount: 2,
    })).toBe("MIXED");
  });

  it("classifies an award without a workbook or quote lines as NO_WORKSHEET", () => {
    expect(classifyOpportunityAwardPricing({
      ...base,
      candidateWorkbookCount: 0,
      quoteLineCount: 0,
      worksheetLinkedQuoteLineCount: 0,
      distinctLinkedWorkbookCount: 0,
    })).toBe("NO_WORKSHEET");
  });

  it("fails closed for inconsistent tenant or source lineage", () => {
    expect(classifyOpportunityAwardPricing({
      ...base,
      invalidWorksheetLinkCount: 1,
    })).toBe("BROKEN_LINEAGE");
  });
});

