import { describe, expect, it } from "vitest";
import {
  opportunityQuoteDisplayNumber,
  opportunityQuoteDisplayRevisionNumber,
  opportunityQuoteRevisionLabel,
  opportunityQuoteSeriesDisplayReference,
} from "@/lib/opportunity-quote-display";

describe("Opportunity client quote display identity", () => {
  it("presents stored revision one as the original shared reference", () => {
    expect(opportunityQuoteDisplayNumber("26A001", 1)).toBe("26A001");
    expect(opportunityQuoteRevisionLabel(1)).toBe("Original");
    expect(opportunityQuoteDisplayRevisionNumber(1)).toBe(0);
  });

  it("presents later stored revisions as user revisions starting at R1", () => {
    expect(opportunityQuoteDisplayNumber("26A001", 2)).toBe("26A001-R1");
    expect(opportunityQuoteDisplayNumber("26A001", 3)).toBe("26A001-R2");
    expect(opportunityQuoteRevisionLabel(2)).toBe("R1");
  });

  it("keeps the client-series suffix while hiding the persistence prefix", () => {
    expect(opportunityQuoteSeriesDisplayReference("Q-26024-1")).toBe("26024-1");
    expect(opportunityQuoteDisplayNumber(
      opportunityQuoteSeriesDisplayReference("Q-26024-2"),
      3,
    )).toBe("26024-2-R2");
  });
});
