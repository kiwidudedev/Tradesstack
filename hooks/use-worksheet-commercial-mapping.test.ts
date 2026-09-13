import { describe, expect, it } from "vitest";
import {
  reduceWorksheetCommercialMapping,
  reduceWorksheetVariationCommercialMapping,
} from "@/hooks/use-worksheet-commercial-mapping";

const startAction = {
  type: "start" as const,
  session: {
    destination: "quote" as const,
    workbookId: "workbook-1",
    sheetId: "sheet-1",
    structureKey: "A,B|1,2",
    startingCell: "A1",
    capturedSelection: { startRowIndex: 0, endRowIndex: 0, startColumnIndex: 0, endColumnIndex: 1 },
    capturedSelections: [{ startRowIndex: 0, endRowIndex: 0, startColumnIndex: 0, endColumnIndex: 1 }],
  },
};

describe("worksheet commercial mapping controller", () => {
  it("starts, arms, assigns, replaces, clears, and cancels a session", () => {
    let state = reduceWorksheetCommercialMapping(null, startAction);
    expect(state?.startingCell).toBe("A1");
    expect(state?.description).toEqual({ mode: "empty" });

    state = reduceWorksheetCommercialMapping(state, { type: "arm", field: "description" });
    expect(state?.activeField).toBe("description");
    state = reduceWorksheetCommercialMapping(state, { type: "assign", cellKey: "A2" });
    expect(state?.description).toMatchObject({ mode: "worksheet", source: { cellKey: "A2" } });
    expect(state?.activeField).toBe("quantity");

    state = reduceWorksheetCommercialMapping(state, { type: "assign-field", field: "description", cellKey: "B2" });
    expect(state?.description).toMatchObject({ mode: "worksheet", source: { cellKey: "B2" } });
    state = reduceWorksheetCommercialMapping(state, { type: "clear", field: "description" });
    expect(state?.description).toEqual({ mode: "empty" });
    expect(state?.activeField).toBe("description");
    expect(reduceWorksheetCommercialMapping(state, { type: "cancel" })).toBeNull();
  });

  it("ignores assignment when no field is armed", () => {
    const state = reduceWorksheetCommercialMapping(null, startAction);
    expect(reduceWorksheetCommercialMapping(state, { type: "assign", cellKey: "A2" })).toBe(state);
  });

  it("keeps manual and worksheet Description authority mutually exclusive", () => {
    let state = reduceWorksheetCommercialMapping(null, startAction);
    state = reduceWorksheetCommercialMapping(state, { type: "commit-description", value: "  Plasterboard Linings  ", worksheetValue: null });
    expect(state?.description).toEqual({ mode: "manual", value: "Plasterboard Linings" });

    state = reduceWorksheetCommercialMapping(state, { type: "arm", field: "description" });
    state = reduceWorksheetCommercialMapping(state, { type: "assign", cellKey: "A2" });
    expect(state?.description).toMatchObject({ mode: "worksheet", source: { cellKey: "A2" } });

    state = reduceWorksheetCommercialMapping(state, { type: "commit-description", value: "Mapped value", worksheetValue: "Mapped value" });
    expect(state?.description).toMatchObject({ mode: "worksheet", source: { cellKey: "A2" } });

    state = reduceWorksheetCommercialMapping(state, { type: "commit-description", value: "Changed manually", worksheetValue: "Mapped value" });
    expect(state?.description).toEqual({ mode: "manual", value: "Changed manually" });

    state = reduceWorksheetCommercialMapping(state, { type: "commit-description", value: "   ", worksheetValue: null });
    expect(state?.description).toEqual({ mode: "empty" });
  });

  it("disarms the active mapping field when Description editing begins", () => {
    let state = reduceWorksheetCommercialMapping(null, startAction);
    state = reduceWorksheetCommercialMapping(state, { type: "arm", field: "rate" });
    state = reduceWorksheetCommercialMapping(state, { type: "begin-description-edit" });
    expect(state?.activeField).toBeNull();
    expect(state?.description).toEqual({ mode: "empty" });
  });
});

describe("worksheet Variation commercial mapping collection", () => {
  const startVariation = {
    type: "start" as const,
    lineId: "line-1",
    session: {
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      structureKey: "A,B|1,2",
      startingCell: "A1",
      capturedSelection: { startRowIndex: 0, endRowIndex: 0, startColumnIndex: 0, endColumnIndex: 1 },
      capturedSelections: [{ startRowIndex: 0, endRowIndex: 0, startColumnIndex: 0, endColumnIndex: 1 }],
    },
  };

  it("composes the single-line reducer while keeping one active line and field", () => {
    let state = reduceWorksheetVariationCommercialMapping(null, startVariation);
    state = reduceWorksheetVariationCommercialMapping(state, { type: "arm", lineId: "line-1", field: "description" });
    state = reduceWorksheetVariationCommercialMapping(state, { type: "assign", cellKey: "A2" });
    state = reduceWorksheetVariationCommercialMapping(state, { type: "add-line", lineId: "line-2" });
    state = reduceWorksheetVariationCommercialMapping(state, { type: "arm", lineId: "line-2", field: "total" });

    expect(state?.lines[0]?.mapping.activeField).toBeNull();
    expect(state?.lines[0]?.mapping.description).toMatchObject({ mode: "worksheet", source: { cellKey: "A2" } });
    expect(state?.lines[1]?.mapping.activeField).toBe("total");

    state = reduceWorksheetVariationCommercialMapping(state, { type: "assign", cellKey: "E3" });
    expect(state?.lines[0]?.mapping.mappings.total).toBeNull();
    expect(state?.lines[1]?.mapping.mappings.total).toMatchObject({ cellKey: "E3" });
  });

  it("preserves stable line mappings, Description authority, and sections after removal", () => {
    let state = reduceWorksheetVariationCommercialMapping(null, startVariation);
    state = reduceWorksheetVariationCommercialMapping(state, { type: "commit-description", lineId: "line-1", value: "Manual line one", worksheetValue: null });
    state = reduceWorksheetVariationCommercialMapping(state, { type: "set-section", lineId: "line-1", section: "Materials" });
    state = reduceWorksheetVariationCommercialMapping(state, { type: "add-line", lineId: "line-2" });
    state = reduceWorksheetVariationCommercialMapping(state, { type: "assign-field", lineId: "line-2", field: "description", cellKey: "A3" });
    state = reduceWorksheetVariationCommercialMapping(state, { type: "remove-line", lineId: "line-1" });

    expect(state?.lines).toHaveLength(1);
    expect(state?.lines[0]?.id).toBe("line-2");
    expect(state?.lines[0]?.section).toBe("Labour");
    expect(state?.lines[0]?.mapping.description).toMatchObject({ mode: "worksheet", source: { cellKey: "A3" } });
  });
});
