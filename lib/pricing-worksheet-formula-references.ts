export type PricingWorksheetFormulaReference =
  | {
      kind: "cell";
      ref: string;
      normalizedRef: string;
      rowIndex: number;
      columnIndex: number;
      start: number;
      end: number;
    }
  | {
      kind: "range";
      ref: string;
      normalizedRef: string;
      startRef: string;
      endRef: string;
      startRowIndex: number;
      startColumnIndex: number;
      endRowIndex: number;
      endColumnIndex: number;
      start: number;
      end: number;
    };

type ParsedCellReference = {
  normalizedRef: string;
  rowIndex: number;
  columnIndex: number;
};

function columnLabelToIndex(label: string) {
  let index = 0;

  for (let cursor = 0; cursor < label.length; cursor += 1) {
    index = index * 26 + (label.charCodeAt(cursor) - 64);
  }

  return index - 1;
}

function parseCellReference(reference: string): ParsedCellReference | null {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(reference.trim());
  if (!match) {
    return null;
  }

  const columnLabel = match[1].toUpperCase();
  const rowNumber = Number.parseInt(match[2], 10);
  if (!Number.isInteger(rowNumber) || rowNumber < 1) {
    return null;
  }

  return {
    normalizedRef: `${columnLabel}${rowNumber}`,
    columnIndex: columnLabelToIndex(columnLabel),
    rowIndex: rowNumber - 1,
  };
}

function isReferenceBoundaryCharacter(character: string | undefined) {
  if (!character) {
    return true;
  }

  return !/[A-Za-z0-9_$]/.test(character);
}

function isReferenceStartCharacter(character: string | undefined) {
  if (!character) {
    return false;
  }

  return character === "$" || /[A-Za-z]/.test(character);
}

function readCellReference(formula: string, start: number) {
  let cursor = start;

  if (formula[cursor] === "$") {
    cursor += 1;
  }

  const columnStart = cursor;
  while (cursor < formula.length && /[A-Za-z]/.test(formula[cursor] ?? "")) {
    cursor += 1;
  }

  if (cursor === columnStart) {
    return null;
  }

  if (formula[cursor] === "$") {
    cursor += 1;
  }

  const rowStart = cursor;
  while (cursor < formula.length && /[0-9]/.test(formula[cursor] ?? "")) {
    cursor += 1;
  }

  if (cursor === rowStart) {
    return null;
  }

  const ref = formula.slice(start, cursor);
  const parsed = parseCellReference(ref);
  if (!parsed) {
    return null;
  }

  return {
    ref,
    parsed,
    end: cursor,
  };
}

function skipQuotedString(formula: string, start: number) {
  let cursor = start + 1;

  while (cursor < formula.length) {
    if (formula[cursor] === "\"") {
      if (formula[cursor + 1] === "\"") {
        cursor += 2;
        continue;
      }

      return cursor + 1;
    }

    cursor += 1;
  }

  return formula.length;
}

export function extractPricingWorksheetFormulaReferences(formula: string): PricingWorksheetFormulaReference[] {
  if (!formula.startsWith("=")) {
    return [];
  }

  const references: PricingWorksheetFormulaReference[] = [];
  let cursor = 1;

  while (cursor < formula.length) {
    const current = formula[cursor];

    if (current === "\"") {
      cursor = skipQuotedString(formula, cursor);
      continue;
    }

    if (!isReferenceStartCharacter(current)) {
      cursor += 1;
      continue;
    }

    const previousCharacter = formula[cursor - 1];
    if (!isReferenceBoundaryCharacter(previousCharacter)) {
      cursor += 1;
      continue;
    }

    const firstReference = readCellReference(formula, cursor);
    if (!firstReference) {
      cursor += 1;
      continue;
    }

    let nextCursor = firstReference.end;
    while (formula[nextCursor] && /\s/.test(formula[nextCursor] ?? "")) {
      nextCursor += 1;
    }

    if (formula[nextCursor] === ":") {
      let afterColon = nextCursor + 1;
      while (formula[afterColon] && /\s/.test(formula[afterColon] ?? "")) {
        afterColon += 1;
      }

      const secondReference = readCellReference(formula, afterColon);
      const trailingCharacter = secondReference ? formula[secondReference.end] : undefined;
      if (secondReference && isReferenceBoundaryCharacter(trailingCharacter)) {
        const startColumnIndex = Math.min(
          firstReference.parsed.columnIndex,
          secondReference.parsed.columnIndex
        );
        const endColumnIndex = Math.max(
          firstReference.parsed.columnIndex,
          secondReference.parsed.columnIndex
        );
        const startRowIndex = Math.min(
          firstReference.parsed.rowIndex,
          secondReference.parsed.rowIndex
        );
        const endRowIndex = Math.max(
          firstReference.parsed.rowIndex,
          secondReference.parsed.rowIndex
        );
        const startRef =
          firstReference.parsed.columnIndex < secondReference.parsed.columnIndex ||
          (firstReference.parsed.columnIndex === secondReference.parsed.columnIndex &&
            firstReference.parsed.rowIndex <= secondReference.parsed.rowIndex)
            ? firstReference.parsed.normalizedRef
            : secondReference.parsed.normalizedRef;
        const endRef = startRef === firstReference.parsed.normalizedRef
          ? secondReference.parsed.normalizedRef
          : firstReference.parsed.normalizedRef;

        references.push({
          kind: "range",
          ref: formula.slice(cursor, secondReference.end),
          normalizedRef: `${startRef}:${endRef}`,
          startRef,
          endRef,
          startRowIndex,
          startColumnIndex,
          endRowIndex,
          endColumnIndex,
          start: cursor,
          end: secondReference.end,
        });
        cursor = secondReference.end;
        continue;
      }
    }

    const trailingCharacter = formula[firstReference.end];
    if (isReferenceBoundaryCharacter(trailingCharacter)) {
      references.push({
        kind: "cell",
        ref: firstReference.ref,
        normalizedRef: firstReference.parsed.normalizedRef,
        rowIndex: firstReference.parsed.rowIndex,
        columnIndex: firstReference.parsed.columnIndex,
        start: cursor,
        end: firstReference.end,
      });
      cursor = firstReference.end;
      continue;
    }

    cursor += 1;
  }

  return references;
}
