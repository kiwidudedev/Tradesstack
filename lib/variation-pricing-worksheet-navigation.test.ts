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

const pricingWorksheetBoardPath = join(
  process.cwd(),
  "components/app/OpportunityPricingWorksheetBoard.tsx",
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

  it("keeps the worksheet overlay mounted until the canonical detail pathname commits", () => {
    expect(variationPageSource).toContain("const [isVariationWorksheetClosePending, setIsVariationWorksheetClosePending] = useState(false);");
    expect(variationPageSource).toContain("const variationWorksheetClosePendingRef = useRef(false);");
    expect(variationPageSource).toContain("variationWorksheetClosePendingRef.current = true;");
    expect(variationPageSource).toContain("pathname !== variationDetailPath");

    const closeHandlerStart = variationPageSource.indexOf("const closeVariationWorksheetOverlay = useCallback(() => {");
    const closeCommitEffect = variationPageSource.indexOf("useEffect(() => {", closeHandlerStart);
    const closeHandlerSource = variationPageSource.slice(closeHandlerStart, closeCommitEffect);
    const closeCommitSource = variationPageSource.slice(
      closeCommitEffect,
      variationPageSource.indexOf("useEffect(() => {", closeCommitEffect + 1),
    );

    expect(closeHandlerSource).toContain("setIsVariationWorksheetClosePending(true);");
    expect(closeHandlerSource).toContain("router.replace(variationDetailPath, { scroll: false });");
    expect(closeHandlerSource).not.toContain("setVariationWorksheetId(null);");
    expect(closeCommitSource).toContain("pathname !== variationDetailPath");
    expect(closeCommitSource).toContain("setVariationWorksheetId(null);");
    expect(closeCommitSource).toContain("setIsVariationWorksheetClosePending(false);");
  });

  it("keeps title flush and dirty-save success ahead of the Variation close callback", () => {
    const boardSource = readFileSync(pricingWorksheetBoardPath, "utf8");
    const closeStart = boardSource.indexOf("const closeWorksheet = async () => {");
    const closeEnd = boardSource.indexOf("const saveWorksheetAndTitle", closeStart);
    const closeSource = boardSource.slice(closeStart, closeEnd);

    const flushIndex = closeSource.indexOf("worksheetTitleAutosaveControllerRef.current?.flush()");
    const dirtyIndex = closeSource.indexOf("if (isDirty)");
    const saveIndex = closeSource.indexOf("await saveWorksheet({ silent: true })");
    const failedSaveIndex = closeSource.indexOf("if (!didSave)");
    const closeCallbackIndex = closeSource.indexOf("onClose?.()");

    expect(flushIndex).toBeGreaterThan(-1);
    expect(dirtyIndex).toBeGreaterThan(flushIndex);
    expect(saveIndex).toBeGreaterThan(dirtyIndex);
    expect(failedSaveIndex).toBeGreaterThan(saveIndex);
    expect(closeCallbackIndex).toBeGreaterThan(failedSaveIndex);
  });

  it("adds a first-class worksheet entry route for the variation record tab", () => {
    const routeSource = readFileSync(variationWorksheetEntryRoutePath, "utf8");

    expect(routeSource).toContain('import ProjectVariationsPage from "../page"');
    expect(routeSource).toContain("return <ProjectVariationsPage />;");
  });
});
