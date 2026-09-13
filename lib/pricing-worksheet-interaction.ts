export type PricingWorksheetEditorKind = "cell" | "formulaBar" | null;

export type WorksheetTextSelection = {
  start: number;
  end: number;
};

export type WorksheetFormulaReferencePickResult = {
  action: "insert" | "replace" | "noop";
  value: string;
  selection: WorksheetTextSelection;
};

const FORMULA_REFERENCE_LEFT_BOUNDARY = /[=+\-*/^&(<>,;:]/;
const FORMULA_REFERENCE_RIGHT_BOUNDARY = /[+\-*/^&)<>,;:]/;

function clampWorksheetTextSelection(value: string, selection: WorksheetTextSelection | null) {
  const fallback = value.length;
  const first = Math.max(0, Math.min(selection?.start ?? fallback, value.length));
  const second = Math.max(0, Math.min(selection?.end ?? first, value.length));

  return {
    start: Math.min(first, second),
    end: Math.max(first, second),
  } satisfies WorksheetTextSelection;
}

function isFormulaPositionInsideQuotedString(value: string, position: number) {
  let insideQuotedString = false;

  for (let cursor = 0; cursor < position; cursor += 1) {
    if (value[cursor] !== '"') {
      continue;
    }
    if (insideQuotedString && value[cursor + 1] === '"') {
      cursor += 1;
      continue;
    }
    insideQuotedString = !insideQuotedString;
  }

  return insideQuotedString;
}

function getPreviousNonWhitespaceCharacter(value: string, position: number) {
  for (let cursor = position - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(value[cursor] ?? "")) {
      return value[cursor];
    }
  }
  return undefined;
}

function getNextNonWhitespaceCharacter(value: string, position: number) {
  for (let cursor = position; cursor < value.length; cursor += 1) {
    if (!/\s/.test(value[cursor] ?? "")) {
      return value[cursor];
    }
  }
  return undefined;
}

export function getWorksheetFormulaReferencePickContext(
  value: string,
  selection: WorksheetTextSelection | null,
) {
  const normalizedSelection = clampWorksheetTextSelection(value, selection);
  if (
    !value.startsWith("=") ||
    normalizedSelection.start < 1 ||
    isFormulaPositionInsideQuotedString(value, normalizedSelection.start) ||
    isFormulaPositionInsideQuotedString(value, normalizedSelection.end)
  ) {
    return null;
  }

  const previousCharacter = getPreviousNonWhitespaceCharacter(value, normalizedSelection.start);
  const nextCharacter = getNextNonWhitespaceCharacter(value, normalizedSelection.end);
  const hasValidLeftBoundary = Boolean(
    previousCharacter && FORMULA_REFERENCE_LEFT_BOUNDARY.test(previousCharacter),
  );
  const hasValidRightBoundary =
    nextCharacter === undefined || FORMULA_REFERENCE_RIGHT_BOUNDARY.test(nextCharacter);

  if (!hasValidLeftBoundary || !hasValidRightBoundary) {
    return null;
  }

  return {
    action: normalizedSelection.start === normalizedSelection.end ? "insert" : "replace",
    selection: normalizedSelection,
  } as const;
}

export function applyWorksheetFormulaReferencePickTransaction(params: {
  value: string;
  selection: WorksheetTextSelection | null;
  reference: string;
}): WorksheetFormulaReferencePickResult {
  const context = getWorksheetFormulaReferencePickContext(params.value, params.selection);
  const unchangedSelection = clampWorksheetTextSelection(params.value, params.selection);
  if (!context) {
    return {
      action: "noop",
      value: params.value,
      selection: unchangedSelection,
    };
  }

  const insertion = insertTextAtWorksheetSelection(
    params.value,
    context.selection,
    params.reference,
  );
  return {
    action: context.action,
    ...insertion,
  };
}

export function shouldShowFormulaReferenceHighlights(params: {
  activeCellKey: string | null;
  activeEditor: PricingWorksheetEditorKind;
  editingValue: string;
}) {
  return Boolean(
    params.activeCellKey &&
      params.activeEditor &&
      params.editingValue.trimStart().startsWith("="),
  );
}

export function insertTextAtWorksheetSelection(
  value: string,
  selection: WorksheetTextSelection | null,
  insertedText: string,
) {
  const fallback = value.length;
  const start = Math.max(0, Math.min(selection?.start ?? fallback, value.length));
  const end = Math.max(start, Math.min(selection?.end ?? start, value.length));
  const nextValue = `${value.slice(0, start)}${insertedText}${value.slice(end)}`;
  const caret = start + insertedText.length;

  return {
    value: nextValue,
    selection: { start: caret, end: caret } satisfies WorksheetTextSelection,
  };
}

export function getApproximateWorksheetCaretIndex(params: {
  clientX: number;
  contentLeft: number;
  contentWidth: number;
  valueLength: number;
}) {
  if (params.valueLength <= 0 || params.contentWidth <= 0) {
    return 0;
  }

  const position = (params.clientX - params.contentLeft) / params.contentWidth;
  return Math.max(0, Math.min(params.valueLength, Math.round(position * params.valueLength)));
}

export function shouldApplyWorksheetSaveSnapshot(params: {
  currentRevision: number;
  savedRevision: number;
}) {
  return params.currentRevision === params.savedRevision;
}

export function canHandleWorksheetNavigation(params: {
  hasActiveEditor: boolean;
  isTextEditingTarget: boolean;
}) {
  return !params.hasActiveEditor && !params.isTextEditingTarget;
}

export function getWorksheetCommitMovement(key: "Enter" | "Tab", shiftKey: boolean) {
  if (key === "Enter") {
    return { rowDelta: shiftKey ? -1 : 1 } as const;
  }
  return { columnDelta: shiftKey ? -1 : 1 } as const;
}
