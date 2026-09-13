import { describe, expect, it } from "vitest";
import { reduceWorksheetFieldMapping, type WorksheetFieldMappingSession } from "@/lib/worksheet-cell-mapping";

const fields = ["description", "quantity", "unit"] as const;
type Field = typeof fields[number];
const options = {
  fields,
  validateAssignment: ({ field, cellKey, session }: { field: Field; cellKey: string; session: WorksheetFieldMappingSession<Field> }) => {
    const duplicate = fields.find((candidate) => candidate !== field && session.mappings[candidate]?.cellKey === cellKey);
    return duplicate ? `${cellKey} is already mapped to ${duplicate}.` : null;
  },
};

describe("worksheet field mapping core", () => {
  it("starts, arms, assigns, auto-advances, replaces, clears, resets, and cancels", () => {
    let state = reduceWorksheetFieldMapping<Field>(null, { type: "start", session: { workbookId: "wb-1", sheetId: "sheet-1", structureKey: "A,B|1,2" } }, options);
    state = reduceWorksheetFieldMapping(state, { type: "arm", field: "description" }, options);
    state = reduceWorksheetFieldMapping(state, { type: "assign", cellKey: "A1" }, options);
    expect(state?.mappings.description).toMatchObject({ workbookId: "wb-1", sheetId: "sheet-1", cellKey: "A1", structureKey: "A,B|1,2" });
    expect(state?.activeField).toBe("quantity");
    state = reduceWorksheetFieldMapping(state, { type: "assign-field", field: "description", cellKey: "B1" }, options);
    expect(state?.mappings.description?.cellKey).toBe("B1");
    state = reduceWorksheetFieldMapping(state, { type: "clear", field: "description" }, options);
    expect(state?.mappings.description).toBeNull();
    expect(state?.activeField).toBe("description");
    state = reduceWorksheetFieldMapping(state, { type: "reset" }, options);
    expect(Object.values(state?.mappings ?? {})).toEqual([null, null, null]);
    expect(reduceWorksheetFieldMapping(state, { type: "cancel" }, options)).toBeNull();
  });

  it("rejects duplicate cells without disarming the active field", () => {
    let state = reduceWorksheetFieldMapping<Field>(null, { type: "start", session: { workbookId: "wb-1", sheetId: "sheet-1", structureKey: "A,B|1,2" } }, options);
    state = reduceWorksheetFieldMapping(state, { type: "arm", field: "description" }, options);
    state = reduceWorksheetFieldMapping(state, { type: "assign", cellKey: "A1" }, options);
    state = reduceWorksheetFieldMapping(state, { type: "assign", cellKey: "A1" }, options);
    expect(state?.mappings.quantity).toBeNull();
    expect(state?.activeField).toBe("quantity");
    expect(state?.statusMessage).toContain("already mapped to description");
  });
});
