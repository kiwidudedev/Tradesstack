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

const variationWorksheetDeepRoutePath = join(
  process.cwd(),
  "app/app/(workspace)/projects/[projectId]/preconstruction/variations/[variationId]/pricing-worksheet/[worksheetId]/page.tsx",
);

describe("variation pricing worksheet route characterization", () => {
  const variationPageSource = readFileSync(variationPagePath, "utf8");
  const variationWorksheetEntryRouteSource = readFileSync(variationWorksheetEntryRoutePath, "utf8");
  const variationWorksheetDeepRouteSource = readFileSync(variationWorksheetDeepRoutePath, "utf8");

  it("keeps both variation worksheet routes aliased back to the canonical variation page", () => {
    expect(variationWorksheetEntryRouteSource).toContain('import ProjectVariationsPage from "../page"');
    expect(variationWorksheetEntryRouteSource).toContain("return <ProjectVariationsPage />;");
    expect(variationWorksheetDeepRouteSource).toContain('import ProjectVariationsPage from "../../page"');
    expect(variationWorksheetDeepRouteSource).toContain("return <ProjectVariationsPage />;");
  });

  it("keeps the canonical variation page responsible for overlay reconstruction and close behavior", () => {
    expect(variationPageSource).toContain("const variationWorksheetTabPath = variationDetailPath ? `${variationDetailPath}/pricing-worksheet` : null;");
    expect(variationPageSource).toContain("const overlayWorksheetIdFromPathname = useMemo(");
    expect(variationPageSource).toContain("resolveOverlayWorksheetIdFromPathname(pathname, variationDetailPath)");
    expect(variationPageSource).toContain("window.history.pushState(nextState, \"\", targetPath);");
    expect(variationPageSource).toContain("window.history.replaceState({ pricingWorksheetOverlay: true, worksheetId: data.id }, \"\", `${variationWorksheetTabPath}/${data.id}`);");
    expect(variationPageSource).toContain("router.replace(variationDetailPath, { scroll: false });");
    expect(variationPageSource).toContain("<PricingWorksheetOverlayDialog");
  });
});
