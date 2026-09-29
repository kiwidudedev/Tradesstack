import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const registerPagePath = join(
  process.cwd(),
  "components/app/PricingWorksheetRegisterPage.tsx",
);

const overlayLifecyclePath = join(
  process.cwd(),
  "lib/pricing-worksheet-overlay-lifecycle.ts",
);

const worksheetBoardPath = join(
  process.cwd(),
  "components/app/OpportunityPricingWorksheetBoard.tsx",
);

describe("worksheet publish overlay state", () => {
  const registerPageSource = readFileSync(registerPagePath, "utf8");
  const overlayLifecycleSource = readFileSync(overlayLifecyclePath, "utf8");
  const worksheetBoardSource = readFileSync(worksheetBoardPath, "utf8");

  it("restores the active worksheet overlay from pathname, history state, or persisted overlay state if the register page remounts", () => {
    expect(registerPageSource).toContain("resolveOverlayWorksheetIdFromPathname");
    expect(overlayLifecycleSource).toContain("resolveRestoredPricingWorksheetId");
    expect(overlayLifecycleSource).toContain("historyState");
    expect(registerPageSource).toContain("function readPersistedOverlayWorksheetId");
    expect(registerPageSource).toContain("function writePersistedOverlayWorksheetId");
    expect(registerPageSource).toContain("const overlayWorksheetIdFromPathname = useMemo(");
    expect(registerPageSource).toContain("const restoredOverlayWorksheetId = useMemo(");
    expect(registerPageSource).toContain("useState<string | null>(restoredOverlayWorksheetId)");
    expect(registerPageSource).toContain("setSelectedWorksheetId((current) => current ?? restoredOverlayWorksheetId)");
    expect(registerPageSource).toContain("writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, worksheetId);");
    expect(registerPageSource).toContain("writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, selectedWorksheetId);");
    expect(registerPageSource).toContain("window.history.replaceState(");
  });

  it("captures the worksheet selection before closing the context menu and blocks default click behavior", () => {
    expect(worksheetBoardSource).toContain("function cloneWorksheetSelectionRange");
    expect(worksheetBoardSource).toContain("const preservedRange = cloneWorksheetSelectionRange(range);");
    expect(worksheetBoardSource).toContain("startQuoteCommercialMapping(preservedRange, preservedSelectionRanges, startingCell)");
    expect(worksheetBoardSource).toContain("startPurchaseOrderCommercialMapping(preservedRange, preservedSelectionRanges, startingCell)");
    expect(worksheetBoardSource).toContain("startVariationCommercialMapping(preservedRange, preservedSelectionRanges, startingCell)");
    expect(worksheetBoardSource).toContain("event.preventDefault();");
    expect(worksheetBoardSource).toContain("event.stopPropagation();");
    expect(worksheetBoardSource).toContain("onMouseDown={(event) => {");
  });

  it("routes worksheet selection through explicit multi-range state and supports ctrl/cmd additive selection", () => {
    expect(worksheetBoardSource).toContain("const [selectionState, setSelectionState] = useState<WorksheetMultiSelectionState>");
    expect(worksheetBoardSource).toContain("event.metaKey || event.ctrlKey");
    expect(worksheetBoardSource).toContain("mode:");
    expect(worksheetBoardSource).toContain("? \"add\"");
    expect(worksheetBoardSource).toContain("toggleWorksheetCellSelection(current, worksheetRef.current, cellKey)");
    expect(worksheetBoardSource).toContain("toggleWorksheetRowSelection(current, worksheetRef.current, rowIndex)");
    expect(worksheetBoardSource).toContain("toggleWorksheetColumnSelection(current, worksheetRef.current, columnIndex)");
    expect(worksheetBoardSource).toContain("const preservedSelectionRanges = cloneWorksheetSelectionRanges(getContextMenuSelectionRanges(contextMenu));");
    expect(worksheetBoardSource).toContain("startQuoteCommercialMapping(preservedRange, preservedSelectionRanges, startingCell)");
    expect(worksheetBoardSource).toContain("startPurchaseOrderCommercialMapping(preservedRange, preservedSelectionRanges, startingCell)");
  });

  it("does not navigate to a quote route from the worksheet publish board", () => {
    expect(worksheetBoardSource).not.toContain("router.push(");
    expect(worksheetBoardSource).not.toContain("router.replace(");
  });
});
