import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QADefinition } from "@/lib/quality-assurance/definitions/types";
import {
  addFieldFromToolboxState,
  addFieldToSectionState,
  addSectionState,
  deleteFieldState,
  deleteSectionState,
  duplicateFieldState,
  duplicateSectionState,
  moveFieldState,
  moveSectionState,
  reorderFieldState,
  type QABuilderSelection,
} from "./builder-state";

const baseDefinition = (): QADefinition => ({
  id: "definition-1",
  name: "QA",
  description: "",
  status: "draft",
  definitionVersion: 1,
  sections: [],
});

describe("QA builder state transitions", () => {
  beforeEach(() => {
    let sequence = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `generated-${++sequence}` });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("starts from template selection and selects a newly added section", () => {
    const initial: QABuilderSelection = { type: "template" };
    expect(initial).toEqual({ type: "template" });
    const result = addSectionState(baseDefinition());
    expect(result.selection).toEqual({ type: "section", sectionId: result.definition.sections[0].id });
  });

  it("selects duplicated sections and fields while moves preserve selection", () => {
    const sectionAdded = addSectionState(baseDefinition());
    const sectionDuplicated = duplicateSectionState(sectionAdded.definition, 0);
    expect(sectionDuplicated.selection.type).toBe("section");
    const sectionMoved = moveSectionState(sectionDuplicated.definition, sectionDuplicated.selection, 1, -1);
    expect(sectionMoved.selection).toEqual(sectionDuplicated.selection);

    const sectionId = sectionMoved.definition.sections[0].id;
    const fieldAdded = addFieldToSectionState(sectionMoved.definition, sectionId, "short_text", "Short Text");
    expect(fieldAdded?.selection.type).toBe("field");
    const fieldDuplicated = duplicateFieldState(fieldAdded!.definition, sectionId, 0);
    expect(fieldDuplicated.selection.type).toBe("field");
    const fieldMoved = moveFieldState(fieldDuplicated.definition, fieldDuplicated.selection, sectionId, 1, -1);
    expect(fieldMoved.selection).toEqual(fieldDuplicated.selection);
  });

  it("reorders a field directly to its drag destination and preserves selection", () => {
    const sectionAdded = addSectionState(baseDefinition());
    const sectionId = sectionAdded.definition.sections[0].id;
    const first = addFieldToSectionState(sectionAdded.definition, sectionId, "short_text", "First")!;
    const second = addFieldToSectionState(first.definition, sectionId, "photo", "Second")!;
    const third = addFieldToSectionState(second.definition, sectionId, "date", "Third")!;
    const reordered = reorderFieldState(third.definition, third.selection, sectionId, 0, 2);
    expect(reordered.definition.sections[0].fields.map((field) => field.label)).toEqual(["Second", "Third", "First"]);
    expect(reordered.selection).toEqual(third.selection);
  });

  it("falls back to the parent section when the selected field is deleted", () => {
    const sectionAdded = addSectionState(baseDefinition());
    const sectionId = sectionAdded.definition.sections[0].id;
    const fieldAdded = addFieldToSectionState(sectionAdded.definition, sectionId, "short_text", "Short Text")!;
    const fieldId = fieldAdded.selection.type === "field" ? fieldAdded.selection.fieldId : "";
    const result = deleteFieldState(fieldAdded.definition, fieldAdded.selection, sectionId, fieldId);
    expect(result.selection).toEqual({ type: "section", sectionId });
  });

  it("falls back to the nearest section, then template, when a selected section is deleted", () => {
    const first = addSectionState(baseDefinition());
    const second = addSectionState(first.definition);
    const firstId = first.definition.sections[0].id;
    const nearest = deleteSectionState(second.definition, { type: "section", sectionId: firstId }, 0);
    expect(nearest.selection).toEqual({ type: "section", sectionId: nearest.definition.sections[0].id });
    const empty = deleteSectionState(nearest.definition, nearest.selection, 0);
    expect(empty.selection).toEqual({ type: "template" });
  });

  it("uses the selected or owning section as the toolbox target", () => {
    const sectionAdded = addSectionState(baseDefinition());
    const sectionId = sectionAdded.definition.sections[0].id;
    const fromSection = addFieldFromToolboxState(sectionAdded.definition, sectionAdded.selection, "number", "Number")!;
    const fromField = addFieldFromToolboxState(fromSection.definition, fromSection.selection, "date", "Date")!;
    expect(fromField.definition.sections[0].fields.map((field) => field.fieldType)).toEqual(["number", "date"]);
    expect(fromField.selection.type).toBe("field");
    expect(fromField.selection.type === "field" && fromField.selection.sectionId).toBe(sectionId);
  });

  it("creates a first section from the toolbox but refuses to guess among existing sections", () => {
    const first = addFieldFromToolboxState(baseDefinition(), { type: "template" }, "photo", "Photo")!;
    expect(first.definition.sections).toHaveLength(1);
    expect(first.definition.sections[0].fields[0].fieldType).toBe("photo");
    expect(first.selection.type).toBe("field");
    expect(addFieldFromToolboxState(first.definition, { type: "template" }, "file", "File")).toBeNull();
  });
});
