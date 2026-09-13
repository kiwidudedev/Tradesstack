import { describe, expect, it } from "vitest";
import { buildTakeoffHref, buildTakeoffRegisterHref } from "@/lib/takeoff/navigation";

describe("Takeoff navigation routes", () => {
  it("routes Measure navigation to the Drawing Set Register", () => {
    expect(buildTakeoffRegisterHref("opportunity-1"))
      .toBe("/app/leads-clients/opportunities/opportunity-1/takeoff");
  });

  it("routes Quantities directly without a drawing selection", () => {
    expect(buildTakeoffHref("opportunity-1", "quantities", {}))
      .toBe("/app/leads-clients/opportunities/opportunity-1/takeoff/quantities");
  });

  it("keeps explicit drawing editors drawing-scoped", () => {
    expect(buildTakeoffHref("opportunity-1", "measure", { drawingSetId: "drawing-1" }))
      .toBe("/app/leads-clients/opportunities/opportunity-1/takeoff/measure?drawingSetId=drawing-1");
  });
});
