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

const sharedRegisterPath = join(
  process.cwd(),
  "components/app/PricingWorksheetRegisterPage.tsx",
);

describe("opportunity pricing worksheet route characterization", () => {
  const registerPageSource = readFileSync(opportunityRegisterPagePath, "utf8");
  const sharedRegisterSource = readFileSync(sharedRegisterPath, "utf8");
  const deepRouteSource = readFileSync(opportunityDeepRoutePath, "utf8");
  const overlayDialogSource = readFileSync(overlayDialogPath, "utf8");

  it("keeps the opportunity register page as the pathname-driven overlay owner", () => {
    expect(registerPageSource).toContain('export { default } from "@/components/app/PricingWorksheetRegisterPage"');
    expect(sharedRegisterSource).toContain("registerPath={`/app/leads-clients/opportunities/${sharedOpportunity.slug}/pricing-worksheet`}");
    expect(sharedRegisterSource).toContain("const overlayWorksheetIdFromPathname = useMemo(");
    expect(sharedRegisterSource).toContain("resolveOverlayWorksheetIdFromPathname(pathname, registerPath)");
    expect(sharedRegisterSource).toContain("const restoredOverlayWorksheetId = useMemo(");
    expect(sharedRegisterSource).toContain("useState<string | null>(restoredOverlayWorksheetId)");
    expect(sharedRegisterSource).toContain("const initialSheetId = useMemo(() => {");
    expect(sharedRegisterSource).toContain("const sheetId = searchParams.get(\"sheetId\");");
    expect(sharedRegisterSource).toContain("window.history.pushState({ pricingWorksheetOverlay: true, worksheetId }, \"\", targetPath);");
    expect(sharedRegisterSource).toContain("if (!selectedWorksheetId || worksheetCloseInFlightRef.current)");
    expect(sharedRegisterSource).toContain("clearPricingWorksheetOverlayHistoryState(previousHistoryState)");
    expect(sharedRegisterSource).toContain('"",\n        registerPath,');
    expect(sharedRegisterSource).not.toContain("useRouter");
    expect(sharedRegisterSource).not.toContain("router.replace(registerPath");
    expect(sharedRegisterSource).toContain("window.addEventListener(\"popstate\", handlePopState);");
  });

  it("keeps unsaved-change protection active when browser history closes the overlay", () => {
    expect(sharedRegisterSource).toContain("You have unsaved pricing worksheet changes. Leave this worksheet and discard those local edits?");
    expect(sharedRegisterSource).toContain("window.history.pushState(");
    expect(sharedRegisterSource).toContain("`${registerPath}/${selectedWorksheetId}`");
    expect(sharedRegisterSource).toContain("setIsOverlayWorksheetDirty(false);");
    expect(sharedRegisterSource).toContain("setSelectedWorksheetId(null);");
  });

  it("closes state and URL in one native-history transition and rolls back synchronous failure", () => {
    const closeStart = sharedRegisterSource.indexOf("const closeWorksheetOverlay = useCallback(() => {");
    const closeEnd = sharedRegisterSource.indexOf("useEffect(() => {", closeStart);
    const closeSource = sharedRegisterSource.slice(closeStart, closeEnd);

    expect(closeSource).toContain("worksheetCloseInFlightRef.current");
    expect(closeSource).toContain("setSelectedWorksheetId(null)");
    expect(closeSource).toContain("writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, null)");
    expect(closeSource).toContain("clearPricingWorksheetOverlayHistoryState(previousHistoryState)");
    expect(closeSource).toContain("registerPath");
    expect(closeSource).not.toContain("router.");
    expect(closeSource).toContain("window.history.replaceState(previousHistoryState, \"\", previousHref)");
    expect(closeSource).toContain("setSelectedWorksheetId(selectedWorksheetId)");
    expect(closeSource).toContain("writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, selectedWorksheetId)");
  });

  it("treats pathname as one-way authority and never turns mounted identity into navigation intent", () => {
    expect(sharedRegisterSource).toContain("if (pathname === registerPath)");
    expect(sharedRegisterSource).toContain("if (overlayWorksheetIdFromPathname)");
    expect(sharedRegisterSource).toContain("setSelectedWorksheetId(overlayWorksheetIdFromPathname)");
    expect(sharedRegisterSource).not.toContain("pathname !== registerPath");
    expect(sharedRegisterSource.match(/window\.history\.replaceState\(/g)?.length).toBe(2);
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
    expect(sharedRegisterSource).toContain("<PricingWorksheetOverlayDialog");
    expect(sharedRegisterSource).not.toContain("OpportunityPricingWorksheetBoard");
    expect(overlayDialogSource.match(/<OpportunityPricingWorksheetBoard/g)?.length).toBe(1);
    expect(deepRouteSource).not.toContain("OpportunityPricingWorksheetBoard");
  });
});
