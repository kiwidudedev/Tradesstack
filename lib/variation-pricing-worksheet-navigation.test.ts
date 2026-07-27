import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const variationPagePath = join(
  process.cwd(),
  "app/app/(workspace)/projects/[projectId]/preconstruction/variations/[variationId]/page.tsx",
);

const variationWorksheetEntryRoutePath = join(
  process.cwd(),
  "app/app/(workspace)/projects/[projectId]/preconstruction/variations/[variationId]/pricing-worksheet/page.tsx",
);

describe("variation pricing worksheet navigation", () => {
  const variationPageSource = readFileSync(variationPagePath, "utf8");

  it("promotes Pricing Worksheet into record navigation and removes worksheet actions from the dropdown", () => {
    expect(variationPageSource).toContain("VariationRecordTabs");
    expect(variationPageSource).toContain("VariationPricingWorksheetEntryPanel");
    expect(variationPageSource).not.toContain("New Pricing Worksheet");
    expect(variationPageSource).not.toContain("Open Pricing Worksheet");
    expect(variationPageSource).toContain("All Variations");
    expect(variationPageSource).toContain("New Variation");
    expect(variationPageSource).toContain("Delete");
  });

  it("keeps overlay restoration and deep worksheet route state handling in place", () => {
    expect(variationPageSource).toContain("function resolveOverlayWorksheetIdFromPathname");
    expect(variationPageSource).toContain("function resolveOverlayWorksheetIdFromHistoryState");
    expect(variationPageSource).toContain("function readPersistedOverlayWorksheetId");
    expect(variationPageSource).toContain("function writePersistedOverlayWorksheetId");
    expect(variationPageSource).toContain("window.history.replaceState(");
    expect(variationPageSource).toContain("window.history.pushState(");
    expect(variationPageSource).toContain("router.replace(variationDetailPath, { scroll: false });");
  });

  it("adds a first-class worksheet entry route for the variation record tab", () => {
    const routeSource = readFileSync(variationWorksheetEntryRoutePath, "utf8");

    expect(routeSource).toContain('import ProjectVariationsPage from "../page"');
    expect(routeSource).toContain("return <ProjectVariationsPage />;");
  });
});
