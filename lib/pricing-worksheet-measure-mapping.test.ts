import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "@/lib/opportunity-pricing-worksheet-mutations";
import { buildWorksheetUndoState, buildWorksheetRedoState, commitWorksheetHistoryEntry } from "@/lib/opportunity-pricing-worksheet-history";
import {
  applyPricingWorksheetMeasureMappings,
  buildPricingWorksheetMeasureInsertConflicts,
  validatePricingWorksheetMeasureMappings,
} from "@/lib/pricing-worksheet-measure-mapping";
import type { PricingWorksheetMeasureSource } from "@/lib/pricing-worksheet-measure-picker";
import { getWorksheetCellMeasureProvenance } from "@/lib/worksheet-measure-provenance";
import { buildWorksheetStructureKey, type WorksheetFieldMappingSession } from "@/lib/worksheet-cell-mapping";

const source: PricingWorksheetMeasureSource = {
  measurementId: "measurement-1", measurementVersion: 2, projectId: "project-1",
  drawingSetId: "drawing-1", drawingSetName: "A-101.pdf", pageId: "page-1", pageNumber: 1,
  pageLabel: "Floor Plan", groupId: null, groupName: null, groupCode: null, kind: "line",
  colorHex: null, name: "Wall Type 1", description: "Internal wall", quantity: 16.3278,
  unit: "m", updatedAt: "2026-08-23T00:00:00.000Z",
};

function sessionFor(worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 4 })): {
  worksheet: ReturnType<typeof createDefaultWorksheetData>;
  session: WorksheetFieldMappingSession<"description" | "quantity" | "unit">;
} {
  const identity = { workbookId: "wb-1", sheetId: "sheet-1", structureKey: buildWorksheetStructureKey(worksheet) };
  const ref = (cellKey: string) => ({ ...identity, cellKey });
  return {
    worksheet,
    session: {
      ...identity,
      activeField: null,
      mappings: { description: ref("A1"), quantity: ref("B1"), unit: ref("C1") },
      statusMessage: "Ready",
    } satisfies WorksheetFieldMappingSession<"description" | "quantity" | "unit">,
  };
}

describe("pricing worksheet Measure mapping", () => {
  it("validates partial mappings and rejects duplicate, stale, and cross-sheet destinations", () => {
    const { worksheet, session } = sessionFor();
    session.mappings.description = null;
    session.mappings.unit = null;
    expect(validatePricingWorksheetMeasureMappings({ session, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }).error).toBeNull();
    session.mappings.description = session.mappings.quantity;
    expect(validatePricingWorksheetMeasureMappings({ session, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }).error).toMatch(/changed|no longer available/);
    expect(validatePricingWorksheetMeasureMappings({ session, worksheet, workbookId: "wb-1", sheetId: "other" }).error).toMatch(/changed|no longer available/);
    worksheet.rows.push({ id: "4", index: 3, height: 36 });
    expect(validatePricingWorksheetMeasureMappings({ session, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }).error).toMatch(/changed|no longer available/);
  });

  it("reports constants and formulas together while ignoring blank destinations", () => {
    const { worksheet, session } = sessionFor();
    worksheet.cells.B1 = { value: 4, type: "number", formula: null, computedValue: 4, displayValue: "4", metadata: {} };
    worksheet.cells.C1 = { value: "=1+1", type: "text", formula: "=1+1", computedValue: 2, displayValue: "2", metadata: {} };
    const validation = validatePricingWorksheetMeasureMappings({ session, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    expect(buildPricingWorksheetMeasureInsertConflicts(worksheet, validation.entries)).toEqual([
      { field: "quantity", cellKey: "B1", formula: null, currentValue: "4" },
      { field: "unit", cellKey: "C1", formula: "=1+1", currentValue: "2" },
    ]);
  });

  it("writes every mapped field atomically with distinct bindings and one undo/redo entry", () => {
    const { worksheet, session } = sessionFor();
    worksheet.cells.D1 = { value: "=B1*2", type: "text", formula: "=B1*2", computedValue: null, displayValue: "=B1*2", metadata: {} };
    const validation = validatePricingWorksheetMeasureMappings({ session, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    let id = 0;
    const insertedAt = "2026-08-23T01:02:03.000Z";
    const mutation = applyWorksheetMutation(worksheet, (current) => applyPricingWorksheetMeasureMappings({
      worksheet: current,
      entries: validation.entries,
      source,
      insertedAt,
      createBindingId: () => `binding-${++id}`,
    }));
    expect(mutation.nextWorksheet.cells.A1?.value).toBe("Internal wall");
    expect(mutation.nextWorksheet.cells.B1?.value).toBe(16.3278);
    expect(mutation.nextWorksheet.cells.C1?.value).toBe("m");
    expect(mutation.nextWorksheet.cells.D1?.computedValue).toBe(32.6556);
    const provenance = ["A1", "B1", "C1"].map((key) => getWorksheetCellMeasureProvenance(mutation.nextWorksheet.cells[key]));
    expect(provenance.map((value) => value?.insertedField)).toEqual(["description", "quantity", "unit"]);
    expect(new Set(provenance.map((value) => value?.bindingId)).size).toBe(3);
    expect(new Set(provenance.map((value) => value?.insertedAt))).toEqual(new Set([insertedAt]));

    const history = commitWorksheetHistoryEntry({ changed: mutation.changed, future: [], historyLimit: 50, past: [], previousWorksheet: mutation.previousWorksheet });
    expect(history.past).toHaveLength(1);
    const undo = buildWorksheetUndoState({ currentWorksheet: mutation.nextWorksheet, ...history, historyLimit: 50 });
    expect(undo?.worksheet.cells.A1).toBeUndefined();
    expect(undo?.worksheet.cells.B1).toBeUndefined();
    expect(undo?.worksheet.cells.C1).toBeUndefined();
    const redo = undo && buildWorksheetRedoState({ currentWorksheet: undo.worksheet, past: undo.past, future: undo.future, historyLimit: 50 });
    expect(redo?.worksheet.cells.B1?.value).toBe(16.3278);
  });

  it("invalidates only the manually edited cell's provenance", () => {
    const { worksheet, session } = sessionFor();
    const validation = validatePricingWorksheetMeasureMappings({ session, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    const inserted = applyWorksheetMutation(worksheet, (current) => applyPricingWorksheetMeasureMappings({ worksheet: current, entries: validation.entries, source, insertedAt: "2026-08-23T01:02:03.000Z", createBindingId: (() => { let id = 0; return () => `binding-${++id}`; })() })).nextWorksheet;
    const edited = applyWorksheetMutation(inserted, (current) => ({ ...current, cells: { ...current.cells, B1: { ...current.cells.B1!, value: 20, computedValue: 20, displayValue: "20" } } })).nextWorksheet;
    expect(getWorksheetCellMeasureProvenance(edited.cells.A1)).not.toBeNull();
    expect(getWorksheetCellMeasureProvenance(edited.cells.B1)).toBeNull();
    expect(getWorksheetCellMeasureProvenance(edited.cells.C1)).not.toBeNull();
  });
});
