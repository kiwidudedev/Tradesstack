import { describe, expect, it } from "vitest";

import { mapPricingWorksheetUiErrorMessage } from "./pricing-worksheet-ui-errors";

describe("mapPricingWorksheetUiErrorMessage", () => {
  it("hides internal permission and table errors", () => {
    expect(
      mapPricingWorksheetUiErrorMessage(
        new Error('permission denied for table intelligence_events'),
        "Unable to create the pricing worksheet.",
      ),
    ).toBe("Unable to create the pricing worksheet.");
  });

  it("preserves safe domain messages", () => {
    expect(
      mapPricingWorksheetUiErrorMessage(
        new Error("Pricing worksheet not found."),
        "Unable to load the pricing worksheet.",
      ),
    ).toBe("Pricing worksheet not found.");
  });

  it("hides raw PostgREST single-object coercion errors", () => {
    expect(
      mapPricingWorksheetUiErrorMessage(
        new Error("Cannot coerce the result to a single JSON object"),
        "Unable to load the pricing worksheet.",
      ),
    ).toBe("Unable to load the pricing worksheet.");
  });
});
