function columnLabelToIndex(label: string) {
  let index = 0;

  for (let cursor = 0; cursor < label.length; cursor += 1) {
    index = index * 26 + (label.charCodeAt(cursor) - 64);
  }

  return index - 1;
}

function columnIndexToLabel(index: number) {
  let current = index;
  let label = "";

  while (current >= 0) {
    label = String.fromCharCode((current % 26) + 65) + label;
    current = Math.floor(current / 26) - 1;
  }

  return label;
}

function parseRelativeReference(reference: string) {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(reference);
  if (!match) {
    return null;
  }

  return {
    columnLabel: match[1],
    columnIndex: columnLabelToIndex(match[1]),
    rowIndex: Number(match[2]) - 1,
  };
}

function shiftSingleReference(reference: string, rowDelta: number, columnDelta: number) {
  const parsed = parseRelativeReference(reference);
  if (!parsed) {
    return reference;
  }

  const nextColumnIndex = parsed.columnIndex + columnDelta;
  const nextRowIndex = parsed.rowIndex + rowDelta;
  if (nextColumnIndex < 0 || nextRowIndex < 0) {
    return reference;
  }

  return `${columnIndexToLabel(nextColumnIndex)}${nextRowIndex + 1}`;
}

function isReferenceBoundaryCharacter(character: string | undefined) {
  if (!character) {
    return true;
  }

  return !/[A-Za-z0-9_$]/.test(character);
}

export function shiftFormulaForFill(
  formula: string,
  rowDelta: number,
  columnDelta: number
) {
  if (!formula.startsWith("=") || formula.includes("$")) {
    return formula;
  }

  let result = "";
  let cursor = 0;
  const pattern = /([A-Z]+[1-9]\d*)(:([A-Z]+[1-9]\d*))?/g;

  for (const match of formula.matchAll(pattern)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) {
      continue;
    }

    const previousCharacter = formula[matchIndex - 1];
    const nextCharacter = formula[matchIndex + matchedText.length];
    if (
      !isReferenceBoundaryCharacter(previousCharacter) ||
      !isReferenceBoundaryCharacter(nextCharacter)
    ) {
      continue;
    }

    result += formula.slice(cursor, matchIndex);

    if (match[3]) {
      const shiftedStart = shiftSingleReference(match[1], rowDelta, columnDelta);
      const shiftedEnd = shiftSingleReference(match[3], rowDelta, columnDelta);
      result += `${shiftedStart}:${shiftedEnd}`;
    } else {
      result += shiftSingleReference(match[1], rowDelta, columnDelta);
    }

    cursor = matchIndex + matchedText.length;
  }

  if (cursor === 0) {
    return formula;
  }

  result += formula.slice(cursor);
  return result;
}
