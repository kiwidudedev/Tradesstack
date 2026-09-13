import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const boardSource = readFileSync(
  "components/app/OpportunityPricingWorksheetBoard.tsx",
  "utf8",
);
const overlaySource = readFileSync(
  "components/app/PricingWorksheetOverlayDialog.tsx",
  "utf8",
);

describe("pricing worksheet title autosave integration", () => {
  it("binds the controlled input to synchronous local draft state", () => {
    expect(boardSource).toContain("const [worksheetTitleDraft, setWorksheetTitleDraft]");
    expect(boardSource).toContain("value={worksheetTitleDraft}");
    expect(boardSource).toContain("setWorksheetTitleDraft(nextTitle)");
    expect(boardSource).toContain("worksheetTitleAutosaveControllerRef.current?.setDraft(nextTitle)");
  });

  it("guards external title synchronization without recreating the coordinator", () => {
    expect(boardSource).toContain("if (!worksheetTitleAutosaveControllerRef.current)");
    expect(boardSource).toContain("shouldSynchronizeLoadedWorksheetTitle({");
    expect(boardSource).not.toContain("worksheetTitleAutosaveControllerRef.current?.reset(editorRecord.sheetName");
  });

  it("flushes on blur and Enter and restores the confirmed title on Escape", () => {
    expect(boardSource).toContain("onBlur={applyWorksheetNameDraft}");
    expect(boardSource).toContain('if (event.key === "Enter")');
    expect(boardSource).toContain("worksheetTitleAutosaveControllerRef.current?.flush()");
    expect(boardSource).toContain('event.key === "Escape"');
    expect(boardSource).toContain("worksheetTitleAutosaveControllerRef.current?.escape()");
  });

  it("sends the active sheet identifier through the scoped shared rename mutation", () => {
    expect(boardSource).toContain("const sheetId = worksheetSheetIdRef.current");
    expect(boardSource).toContain("renameOpportunityPricingWorkbookSheet({");
    expect(boardSource).toContain("workbookId,");
    expect(boardSource).toContain("sheetId,");
    expect(boardSource).toContain("projectId: worksheetProjectId");
    expect(boardSource).toContain("variationId: worksheetOwner.variationId");
  });

  it("uses the same title-save implementation for every worksheet owner context", () => {
    expect(overlaySource).toContain("<PricingWorksheetOwnerProvider owner={owner}>");
    expect(overlaySource).toContain("<OpportunityPricingWorksheetBoard");
    expect(boardSource).toContain("const worksheetOpportunityId = worksheetOwner.opportunityId");
    expect(boardSource).toContain("const worksheetProjectId = worksheetOwner.projectId");
  });

  it("does not report Last saved while title persistence is pending, saving, or failed", () => {
    expect(boardSource).toContain('worksheetTitleAutosave.status === "error"');
    expect(boardSource).toContain('worksheetTitleAutosave.status === "saving"');
    expect(boardSource).toContain('worksheetTitleAutosave.status === "pending"');
    expect(boardSource).toContain('"Save failed"');
    expect(boardSource).toContain('"Unsaved changes"');
  });

  it("excludes text-editing targets from worksheet keyboard shortcuts", () => {
    expect(boardSource).toContain("target instanceof HTMLInputElement");
    expect(boardSource).toContain("target instanceof HTMLTextAreaElement");
    expect(boardSource).toContain("target instanceof HTMLSelectElement");
    expect(boardSource).toContain("target.isContentEditable");
    expect(boardSource).toContain("event.stopPropagation()");
  });
});
