import { vi } from "vitest";

vi.mock("@/lib/fonts", () => ({
  interMedium: {
    className: "inter-medium",
  },
}));

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VariationPricingWorksheetEntryPanel } from "@/components/app/VariationPricingWorksheetEntryPanel";

describe("VariationPricingWorksheetEntryPanel", () => {
  it("renders the create state when the variation does not have a worksheet yet", () => {
    const markup = renderToStaticMarkup(
      <VariationPricingWorksheetEntryPanel
        canManageVariation
        hasSourceOpportunityLineage
        hasWorksheet={false}
        isCreatingWorksheet={false}
        onOpenWorksheet={() => undefined}
      />,
    );

    expect(markup).toContain("Pricing Worksheet");
    expect(markup).toContain("Create Pricing Worksheet");
    expect(markup).toContain("Create the first worksheet for this variation");
  });

  it("renders the open state when the variation already owns a worksheet", () => {
    const markup = renderToStaticMarkup(
      <VariationPricingWorksheetEntryPanel
        canManageVariation
        hasSourceOpportunityLineage
        hasWorksheet
        isCreatingWorksheet={false}
        onOpenWorksheet={() => undefined}
      />,
    );

    expect(markup).toContain("Open Pricing Worksheet");
    expect(markup).toContain("Resume the existing worksheet for this variation.");
  });
});
