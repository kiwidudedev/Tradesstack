import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VariationRecordTabs } from "@/components/app/VariationRecordTabs";

describe("VariationRecordTabs", () => {
  it("renders Variation Details and Pricing Worksheet record navigation", () => {
    const markup = renderToStaticMarkup(
      <VariationRecordTabs
        detailsHref="/app/projects/project-1/preconstruction/variations/variation-1"
        pricingWorksheetHref="/app/projects/project-1/preconstruction/variations/variation-1/pricing-worksheet"
        activeTab="details"
      />,
    );

    expect(markup).toContain("Variation Details");
    expect(markup).toContain("Pricing Worksheet");
    expect(markup).toContain("/app/projects/project-1/preconstruction/variations/variation-1/pricing-worksheet");
  });
});
