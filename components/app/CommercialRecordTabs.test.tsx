import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommercialRecordTabs } from "@/components/app/CommercialRecordTabs";

describe("CommercialRecordTabs", () => {
  it("keeps semantic, responsive quote navigation and the active indicator", () => {
    const markup = renderToStaticMarkup(
      <CommercialRecordTabs
        detailsHref="/quote/quote-1"
        pricingWorksheetHref="/quote/quote-1/pricing-worksheet"
        detailsLabel="Quote Details"
        ariaLabel="Quote sections"
        activeTab="pricing-worksheet"
      />,
    );

    expect(markup).toContain('aria-label="Quote sections"');
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("min-w-max");
    expect(markup).toContain('href="/quote/quote-1"');
    expect(markup).toContain('href="/quote/quote-1/pricing-worksheet"');
    expect(markup).toMatch(/border-\[var\(--orange-primary\)\][^<]*href="\/quote\/quote-1\/pricing-worksheet"/);
  });
});
