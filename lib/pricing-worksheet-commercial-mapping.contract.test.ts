import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const board = readFileSync(resolve(process.cwd(), "components/app/OpportunityPricingWorksheetBoard.tsx"), "utf8");
const drawer = readFileSync(resolve(process.cwd(), "components/app/PricingWorksheetCommercialMappingDrawer.tsx"), "utf8");
const mappingField = readFileSync(resolve(process.cwd(), "components/app/WorksheetCellMappingField.tsx"), "utf8");

describe("pricing worksheet Commercial Mapping Mode contract", () => {
  it("makes the explicit right-click path authoritative without deleting the legacy interpreter", () => {
    expect(board).toContain("startQuoteCommercialMapping(preservedRange");
    expect(board).toContain("startPurchaseOrderCommercialMapping(preservedRange");
    expect(board).toContain("startVariationCommercialMapping(preservedRange");
    expect(board).toContain("buildExplicitMappedCommercialSelection");
    expect(board).toContain("interpretWorksheetSelectionForPublish");
  });

  it("routes Variation through the shared exact-cell architecture while retaining legacy inference for safe cutover", () => {
    expect(board).toContain("useWorksheetVariationCommercialMapping");
    expect(board).toContain("PricingWorksheetVariationMappingDrawer");
    expect(board).toContain("combineExplicitMappedCommercialSelections");
    expect(board).toContain("void beginWorksheetPublishToVariation");
    expect(board).not.toContain("runContextMenuAction(() => beginWorksheetPublishToVariation");
  });

  it("uses a separate mutation gate at the central mutation boundary", () => {
    expect(board).toContain("const canMutateWorksheet = canWriteWorksheet && !isWorksheetMappingMode");
    expect(board).toContain("if (!canMutateWorksheet && !isAuthorizedMappedMeasureCommit)");
    expect(board).toContain("Worksheet changes are disabled during Mapping Mode");
  });

  it("keeps Material and Commercial panels mutually exclusive and implements responsive picking", () => {
    expect(board).toContain("setActiveSidePanel(null)");
    expect(board).toContain("isNarrowCommercialCellPicker");
    expect(drawer).toContain("WorksheetSidePanel");
  });

  it("provides click, keyboard, highlight and explicit-handle drag paths", () => {
    expect(board).toContain("commercialMapping.assignCell(cellKey)");
    expect(board).toContain('event.key === "Enter" || event.key === " "');
    expect(board).toContain("data-commercial-mapping-highlight");
    expect(board).toContain("application/x-tradesstack-worksheet-cell");
    expect(board).toContain("showCommercialMappingDragHandle");
    expect(drawer).toContain("WorksheetCellMappingField");
    expect(mappingField).toContain("onDrop={handleDrop}");
  });
});
