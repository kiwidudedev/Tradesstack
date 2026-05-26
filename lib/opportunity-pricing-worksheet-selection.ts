export const PRIMARY_POINTER_BUTTON_MASK = 1;
export const WORKSHEET_SELECTION_DRAG_THRESHOLD_PX = 4;

export function isPrimaryPointerButtonPressed(buttons: number | null | undefined) {
  return typeof buttons === "number" && (buttons & PRIMARY_POINTER_BUTTON_MASK) === PRIMARY_POINTER_BUTTON_MASK;
}

export function resolveWorksheetPointerDragState(params: {
  buttons: number | null | undefined;
  isDragActive: boolean;
  isInteractionBlocked: boolean;
}) {
  if (!params.isDragActive || params.isInteractionBlocked) {
    return "ignore" as const;
  }

  if (!isPrimaryPointerButtonPressed(params.buttons)) {
    return "clear" as const;
  }

  return "extend" as const;
}

export function resolveWorksheetRangeSelectionPointerState(params: {
  buttons: number | null | undefined;
  isRangeDragActive: boolean;
  isFormulaEditing: boolean;
}) {
  return resolveWorksheetPointerDragState({
    buttons: params.buttons,
    isDragActive: params.isRangeDragActive,
    isInteractionBlocked: params.isFormulaEditing,
  });
}

export function hasWorksheetSelectionDragThresholdPassed(params: {
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  thresholdPx?: number;
}) {
  const thresholdPx = params.thresholdPx ?? WORKSHEET_SELECTION_DRAG_THRESHOLD_PX;
  return (
    Math.abs(params.clientX - params.startClientX) >= thresholdPx ||
    Math.abs(params.clientY - params.startClientY) >= thresholdPx
  );
}

export function resolveWorksheetPendingRangeSelectionState(params: {
  buttons: number | null | undefined;
  clientX: number;
  clientY: number;
  isFormulaEditing: boolean;
  isPendingSelection: boolean;
  startClientX: number;
  startClientY: number;
  thresholdPx?: number;
}) {
  if (!params.isPendingSelection || params.isFormulaEditing) {
    return "ignore" as const;
  }

  if (!isPrimaryPointerButtonPressed(params.buttons)) {
    return "clear" as const;
  }

  if (hasWorksheetSelectionDragThresholdPassed({
    startClientX: params.startClientX,
    startClientY: params.startClientY,
    clientX: params.clientX,
    clientY: params.clientY,
    thresholdPx: params.thresholdPx,
  })) {
    return "promote" as const;
  }

  return "pending" as const;
}
