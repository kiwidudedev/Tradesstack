import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityQuoteRegisterStatus } from "@/components/app/OpportunityQuoteRegisterStatus";

describe("OpportunityQuoteRegisterStatus", () => {
  it("renders the pricing warning inline beside the unchanged Draft badge", () => {
    const markup = renderToStaticMarkup(
      <OpportunityQuoteRegisterStatus status="Draft" sourceChanged />,
    );

    expect(markup).toContain("Draft");
    expect(markup).toContain("Pricing has changed");
    expect(markup).not.toContain("Source changed since creation");
    expect(markup).toContain("grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 whitespace-nowrap");
    expect(markup).toContain('data-testid="quote-register-status-badge"');
    expect(markup).not.toContain("col-start-2");
    expect(markup).toContain('data-testid="quote-register-pricing-warning"');
    expect(markup).toContain("justify-self-center text-xs text-amber-700");
    expect(markup).not.toContain("absolute");
    expect(markup).not.toContain("mt-1");
    expect(markup).toContain("text-amber-700");
  });

  it("does not render the warning when the existing source-change condition is false", () => {
    const markup = renderToStaticMarkup(
      <OpportunityQuoteRegisterStatus status="Draft" sourceChanged={false} />,
    );

    expect(markup).toContain("Draft");
    expect(markup).not.toContain("Pricing has changed");
    expect(markup).toContain('data-testid="quote-register-status-badge"');
    expect(markup).not.toContain('data-testid="quote-register-pricing-warning"');
  });
});
