import { describe, expect, it } from "vitest";
import {
  isPrimaryPointerButtonPressed,
  PRIMARY_POINTER_BUTTON_MASK,
  resolveWorksheetPendingRangeSelectionState,
  resolveWorksheetPointerDragState,
  resolveWorksheetRangeSelectionPointerState,
  WORKSHEET_SELECTION_DRAG_THRESHOLD_PX,
} from "./opportunity-pricing-worksheet-selection";

describe("worksheet selection pointer guards", () => {
  it("detects the primary pointer button from the buttons bitmask", () => {
    expect(isPrimaryPointerButtonPressed(PRIMARY_POINTER_BUTTON_MASK)).toBe(true);
    expect(isPrimaryPointerButtonPressed(3)).toBe(true);
    expect(isPrimaryPointerButtonPressed(0)).toBe(false);
    expect(isPrimaryPointerButtonPressed(undefined)).toBe(false);
  });

  it("clears stale drag selection when mouseenter arrives without the primary button pressed", () => {
    expect(resolveWorksheetRangeSelectionPointerState({
      buttons: 0,
      isRangeDragActive: true,
      isFormulaEditing: false,
    })).toBe("clear");
  });

  it("keeps extending range selection while the primary button is held", () => {
    expect(resolveWorksheetRangeSelectionPointerState({
      buttons: 1,
      isRangeDragActive: true,
      isFormulaEditing: false,
    })).toBe("extend");
  });

  it("ignores mouseenter when there is no active drag or formula editing blocks range selection", () => {
    expect(resolveWorksheetRangeSelectionPointerState({
      buttons: 1,
      isRangeDragActive: false,
      isFormulaEditing: false,
    })).toBe("ignore");

    expect(resolveWorksheetRangeSelectionPointerState({
      buttons: 1,
      isRangeDragActive: true,
      isFormulaEditing: true,
    })).toBe("ignore");
  });

  it("can guard other drag interactions like fill preview with the same primary-button rule", () => {
    expect(resolveWorksheetPointerDragState({
      buttons: 0,
      isDragActive: true,
      isInteractionBlocked: false,
    })).toBe("clear");

    expect(resolveWorksheetPointerDragState({
      buttons: 1,
      isDragActive: true,
      isInteractionBlocked: false,
    })).toBe("extend");
  });

  it("keeps a plain mousedown pending until the pointer actually moves", () => {
    expect(resolveWorksheetPendingRangeSelectionState({
      buttons: 1,
      clientX: 100 + WORKSHEET_SELECTION_DRAG_THRESHOLD_PX - 1,
      clientY: 100,
      isFormulaEditing: false,
      isPendingSelection: true,
      startClientX: 100,
      startClientY: 100,
    })).toBe("pending");
  });

  it("does not promote pending selection just because a different cell is hovered", () => {
    expect(resolveWorksheetPendingRangeSelectionState({
      buttons: 1,
      clientX: 100,
      clientY: 100,
      isFormulaEditing: false,
      isPendingSelection: true,
      startClientX: 100,
      startClientY: 100,
    })).toBe("pending");
  });

  it("promotes pending selection into a drag after meaningful movement", () => {
    expect(resolveWorksheetPendingRangeSelectionState({
      buttons: 1,
      clientX: 100 + WORKSHEET_SELECTION_DRAG_THRESHOLD_PX,
      clientY: 100,
      isFormulaEditing: false,
      isPendingSelection: true,
      startClientX: 100,
      startClientY: 100,
    })).toBe("promote");
  });

  it("clears a pending selection if the primary button is no longer pressed", () => {
    expect(resolveWorksheetPendingRangeSelectionState({
      buttons: 0,
      clientX: 100,
      clientY: 100,
      isFormulaEditing: false,
      isPendingSelection: true,
      startClientX: 100,
      startClientY: 100,
    })).toBe("clear");
  });
});
