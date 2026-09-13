import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityQuoteRevisionHistory } from "@/components/app/OpportunityQuoteRevisionHistory";

describe("OpportunityQuoteRevisionHistory", () => {
  it("hides an empty history", () => {
    expect(renderToStaticMarkup(
      <OpportunityQuoteRevisionHistory opportunitySlug="test" baseQuoteNumber="Q-26024-1" rows={[]} />,
    )).toBe("");
  });

  it("renders persisted status, amount, date, display identity, and exact revision links", () => {
    const markup = renderToStaticMarkup(
      <OpportunityQuoteRevisionHistory
        opportunitySlug="test-21-aug-r1"
        baseQuoteNumber="Q-26024-2"
        rows={[
          {
            revision_id: "revision-r1",
            revision_number: 2,
            status: "Sent",
            total_quote_price: 11240,
            updated_at: "2026-08-22T00:00:00.000Z",
          },
          {
            revision_id: "revision-original",
            revision_number: 1,
            status: "Sent",
            total_quote_price: 1000,
            updated_at: "2026-08-21T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(markup).toContain("Previous Revisions");
    expect(markup).not.toContain("View earlier locked versions of this client quotation.");
    expect(markup.indexOf("Updated")).toBeLessThan(markup.indexOf("Quoted Amount"));
    expect(markup).toContain("26024-2-R1");
    expect(markup).toContain("26024-2");
    expect(markup).toContain("$11,240");
    expect(markup).toContain("$1,000");
    expect(markup).toContain("/app/leads-clients/opportunities/test-21-aug-r1/quote/revision-r1");
    expect(markup).toContain("/app/leads-clients/opportunities/test-21-aug-r1/quote/revision-original");
  });
});
