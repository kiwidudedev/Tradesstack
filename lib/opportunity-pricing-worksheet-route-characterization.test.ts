import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const opportunityRegisterPagePath = join(
  process.cwd(),
  "app/app/(workspace)/leads-clients/opportunities/[opportunityId]/pricing-worksheet/page.tsx",
);

const opportunityDeepRoutePath = join(
  process.cwd(),
  "app/app/(workspace)/leads-clients/opportunities/[opportunityId]/pricing-worksheet/[worksheetId]/page.tsx",
);

const overlayDialogPath = join(
  process.cwd(),
  "components/app/PricingWorksheetOverlayDialog.tsx",
);

describe("opportunity pricing worksheet route characterization", () => {
  const registerPageSource = readFileSync(opportunityRegisterPagePath, "utf8");
  const deepRouteSource = readFileSync(opportunityDeepRoutePath, "utf8");
  const overlayDialogSource = readFileSync(overlayDialogPath, "utf8");

  it("keeps the opportunity register page as the pathname-driven overlay owner", () => {
    expect(registerPageSource).toContain("const registerPath = `/app/leads-clients/opportunities/${sharedOpportunity.slug}/pricing-worksheet`;");
    expect(registerPageSource).toContain("const overlayWorksheetIdFromPathname = useMemo(");
    expect(registerPageSource).toContain("resolveOverlayWorksheetIdFromPathname(pathname, registerPath)");
    expect(registerPageSource).toContain("const restoredOverlayWorksheetId = useMemo(");
    expect(registerPageSource).toContain("useState<string | null>(restoredOverlayWorksheetId)");
    expect(registerPageSource).toContain("const initialSheetId = useMemo(() => {");
    expect(registerPageSource).toContain("const sheetId = searchParams.get(\"sheetId\");");
    expect(registerPageSource).toContain("window.history.pushState({ pricingWorksheetOverlay: true, worksheetId }, \"\", targetPath);");
    expect(registerPageSource).toContain("router.replace(registerPath, { scroll: false });");
    expect(registerPageSource).toContain("window.addEventListener(\"popstate\", handlePopState);");
  });

  it("keeps unsaved-change protection active when browser history closes the overlay", () => {
    expect(registerPageSource).toContain("You have unsaved pricing worksheet changes. Leave this worksheet and discard those local edits?");
    expect(registerPageSource).toContain("window.history.pushState(");
    expect(registerPageSource).toContain("`${registerPath}/${selectedWorksheetId}`");
    expect(registerPageSource).toContain("setIsOverlayWorksheetDirty(false);");
    expect(registerPageSource).toContain("setSelectedWorksheetId(null);");
  });

  it("makes the direct worksheet route a canonical alias back into the shared register page after validating workbook access", () => {
    expect(deepRouteSource).toContain("import OpportunityPricingWorksheetRegisterPage from \"../page\";");
    expect(deepRouteSource).toContain("const { opportunityId, worksheetId } = await params;");
    expect(deepRouteSource).toContain("const sharedOpportunity = await getOpportunityWorkspaceData(opportunityId);");
    expect(deepRouteSource).toContain(".eq(\"id\", worksheetId)");
    expect(deepRouteSource).toContain(".eq(\"opportunity_id\", sharedOpportunity.opportunityId)");
    expect(deepRouteSource).toContain("if (error || !data) {");
    expect(deepRouteSource).toContain("return <OpportunityPricingWorksheetRegisterPage />;");
    expect(deepRouteSource).not.toContain("StandalonePricingWorksheetBoard");
  });

  it("keeps the shared overlay wrapper as a single full-viewport worksheet host", () => {
    expect(overlayDialogSource).toContain("<Dialog open onOpenChange={() => undefined}>");
    expect(overlayDialogSource).toContain("className=\"fixed inset-0 h-dvh w-dvw max-h-none max-w-none overflow-hidden rounded-none border-0 bg-[var(--surface)] p-0 shadow-none\"");
    expect(overlayDialogSource).toContain("<OpportunityPricingWorksheetBoard");
    expect(overlayDialogSource).toContain("initialSheetId={initialSheetId}");
    expect(overlayDialogSource.match(/<OpportunityPricingWorksheetBoard/g)?.length).toBe(1);
    expect(overlayDialogSource).toContain("onEscapeKeyDown={(event) => event.preventDefault()}");
    expect(overlayDialogSource).toContain("onPointerDownOutside={(event) => event.preventDefault()}");
  });

  it("keeps a single canonical board host with no alternate worksheet save path", () => {
    expect(registerPageSource).toContain("<PricingWorksheetOverlayDialog");
    expect(registerPageSource).not.toContain("OpportunityPricingWorksheetBoard");
    expect(overlayDialogSource.match(/<OpportunityPricingWorksheetBoard/g)?.length).toBe(1);
    expect(deepRouteSource).not.toContain("OpportunityPricingWorksheetBoard");
  });
});
