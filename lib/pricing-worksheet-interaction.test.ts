import { describe, expect, it } from "vitest";
import {
  applyWorksheetFormulaReferencePickTransaction,
  canHandleWorksheetNavigation,
  getApproximateWorksheetCaretIndex,
  getWorksheetFormulaReferencePickContext,
  getWorksheetCommitMovement,
  insertTextAtWorksheetSelection,
  shouldApplyWorksheetSaveSnapshot,
  shouldShowFormulaReferenceHighlights,
} from "@/lib/pricing-worksheet-interaction";

describe("pricing worksheet interaction transitions", () => {
  it("keeps a selected formula visually calm until an editor is active", () => {
    expect(shouldShowFormulaReferenceHighlights({
      activeCellKey: null,
      activeEditor: null,
      editingValue: "=A1+B1",
    })).toBe(false);
    expect(shouldShowFormulaReferenceHighlights({
      activeCellKey: "C1",
      activeEditor: "cell",
      editingValue: "=A1+B1",
    })).toBe(true);
    expect(shouldShowFormulaReferenceHighlights({
      activeCellKey: "C1",
      activeEditor: "formulaBar",
      editingValue: "=A1+B1",
    })).toBe(true);
  });

  it("inserts a picked reference at the active caret or selection", () => {
    expect(insertTextAtWorksheetSelection("=SUM() + A1", { start: 5, end: 5 }, "B5")).toEqual({
      value: "=SUM(B5) + A1",
      selection: { start: 7, end: 7 },
    });
    expect(insertTextAtWorksheetSelection("=A1+OLD", { start: 4, end: 7 }, "B5:C7")).toEqual({
      value: "=A1+B5:C7",
      selection: { start: 9, end: 9 },
    });
  });

  it("inserts one reference after an operator", () => {
    expect(applyWorksheetFormulaReferencePickTransaction({
      value: "=I7*",
      selection: { start: 4, end: 4 },
      reference: "J7",
    })).toEqual({
      action: "insert",
      value: "=I7*J7",
      selection: { start: 6, end: 6 },
    });
  });

  it("turns repeated same-cell picks into no-op transactions", () => {
    const first = applyWorksheetFormulaReferencePickTransaction({
      value: "=I7*",
      selection: { start: 4, end: 4 },
      reference: "J7",
    });
    const second = applyWorksheetFormulaReferencePickTransaction({
      value: first.value,
      selection: first.selection,
      reference: "J7",
    });
    const third = applyWorksheetFormulaReferencePickTransaction({
      value: second.value,
      selection: second.selection,
      reference: "J7",
    });

    expect(second.action).toBe("noop");
    expect(third.action).toBe("noop");
    expect(third.value).toBe("=I7*J7");
  });

  it("does not concatenate a bare reference after another reference", () => {
    expect(applyWorksheetFormulaReferencePickTransaction({
      value: "=I7*G7",
      selection: { start: 6, end: 6 },
      reference: "J7",
    })).toEqual({
      action: "noop",
      value: "=I7*G7",
      selection: { start: 6, end: 6 },
    });
  });

  it("replaces an explicitly selected reference", () => {
    expect(applyWorksheetFormulaReferencePickTransaction({
      value: "=I7*G7",
      selection: { start: 4, end: 6 },
      reference: "J7",
    })).toEqual({
      action: "replace",
      value: "=I7*J7",
      selection: { start: 6, end: 6 },
    });
  });

  it("inserts at a valid middle caret without disturbing surrounding tokens", () => {
    expect(applyWorksheetFormulaReferencePickTransaction({
      value: "=I7*+G7",
      selection: { start: 4, end: 4 },
      reference: "J7",
    }).value).toBe("=I7*J7+G7");
  });

  it("inserts inside an empty function argument", () => {
    expect(applyWorksheetFormulaReferencePickTransaction({
      value: "=SUM()",
      selection: { start: 5, end: 5 },
      reference: "J7",
    }).value).toBe("=SUM(J7)");
  });

  it("inserts a dragged range once and rejects accidental range adjacency", () => {
    const first = applyWorksheetFormulaReferencePickTransaction({
      value: "=SUM(",
      selection: { start: 5, end: 5 },
      reference: "B2:B8",
    });
    const repeated = applyWorksheetFormulaReferencePickTransaction({
      value: first.value,
      selection: first.selection,
      reference: "B2:B8",
    });

    expect(first.value).toBe("=SUM(B2:B8");
    expect(repeated.action).toBe("noop");
    expect(repeated.value).toBe("=SUM(B2:B8");
  });

  it("re-arms reference picking only after the user creates a valid context", () => {
    expect(getWorksheetFormulaReferencePickContext("=J7", { start: 3, end: 3 })).toBeNull();
    expect(getWorksheetFormulaReferencePickContext("=J7+", { start: 4, end: 4 })).toEqual({
      action: "insert",
      selection: { start: 4, end: 4 },
    });
    expect(applyWorksheetFormulaReferencePickTransaction({
      value: "=J7+",
      selection: { start: 4, end: 4 },
      reference: "J7",
    }).value).toBe("=J7+J7");
  });

  it("does not treat a caret inside a quoted string as a reference-pick target", () => {
    expect(applyWorksheetFormulaReferencePickTransaction({
      value: '=IF(A1="")',
      selection: { start: 8, end: 8 },
      reference: "J7",
    }).action).toBe("noop");
  });

  it("uses the double-click position to choose a bounded caret", () => {
    expect(getApproximateWorksheetCaretIndex({
      clientX: 75,
      contentLeft: 25,
      contentWidth: 100,
      valueLength: 10,
    })).toBe(5);
  });

  it("keeps newer local mutations when an older save completes", async () => {
    expect(shouldApplyWorksheetSaveSnapshot({ currentRevision: 4, savedRevision: 4 })).toBe(true);
    expect(shouldApplyWorksheetSaveSnapshot({ currentRevision: 5, savedRevision: 4 })).toBe(false);

    let finishRequest!: (value: string) => void;
    const deferredRequest = new Promise<string>((resolve) => {
      finishRequest = resolve;
    });
    let revision = 4;
    let worksheetValue = "snapshot-at-save-start";
    let isDirty = true;
    const saveRevision = revision;
    const saveCompletion = deferredRequest.then((savedValue) => {
      if (shouldApplyWorksheetSaveSnapshot({ currentRevision: revision, savedRevision: saveRevision })) {
        worksheetValue = savedValue;
        isDirty = false;
      }
    });

    revision += 1;
    worksheetValue = "newer-local-edit";
    finishRequest("stale-server-snapshot");
    await saveCompletion;

    expect(worksheetValue).toBe("newer-local-edit");
    expect(isDirty).toBe(true);

    const normalSaveRevision = revision;
    if (shouldApplyWorksheetSaveSnapshot({
      currentRevision: revision,
      savedRevision: normalSaveRevision,
    })) {
      worksheetValue = "latest-server-snapshot";
      isDirty = false;
    }
    expect(worksheetValue).toBe("latest-server-snapshot");
    expect(isDirty).toBe(false);
  });

  it("allows grid navigation independently from write permission", () => {
    expect(canHandleWorksheetNavigation({ hasActiveEditor: false, isTextEditingTarget: false })).toBe(true);
    expect(canHandleWorksheetNavigation({ hasActiveEditor: true, isTextEditingTarget: false })).toBe(false);
  });

  it("normalizes Enter and Tab movement for both worksheet editors", () => {
    expect(getWorksheetCommitMovement("Enter", false)).toEqual({ rowDelta: 1 });
    expect(getWorksheetCommitMovement("Enter", true)).toEqual({ rowDelta: -1 });
    expect(getWorksheetCommitMovement("Tab", false)).toEqual({ columnDelta: 1 });
    expect(getWorksheetCommitMovement("Tab", true)).toEqual({ columnDelta: -1 });
  });
});
