import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";

const FORMULA_ERROR = "#ERROR!";
const FORMULA_REF_ERROR = "#REF!";
const FORMULA_CYCLE_ERROR = "#CYCLE!";
const FORMULA_ERROR_STRINGS = new Set([
  FORMULA_ERROR,
  FORMULA_REF_ERROR,
  FORMULA_CYCLE_ERROR,
]);

type FormulaValue =
  | { ok: true; value: number }
  | { ok: false; error: string };

type Token =
  | { type: "number"; value: number }
  | { type: "ref"; value: string }
  | { type: "identifier"; value: string }
  | { type: "plus" | "minus" | "multiply" | "divide" | "lparen" | "rparen" | "colon" | "comma" }
  | { type: "eof" };

function isFormulaString(input: string) {
  return input.trim().startsWith("=");
}

function formatComputedNumber(value: number) {
  if (!Number.isFinite(value)) {
    return FORMULA_ERROR;
  }

  if (Object.is(value, -0)) {
    return "0";
  }

  return String(value);
}

function columnIndexFromLabel(label: string) {
  let index = 0;

  for (let i = 0; i < label.length; i += 1) {
    const code = label.charCodeAt(i);
    if (code < 65 || code > 90) {
      return -1;
    }
    index = index * 26 + (code - 64);
  }

  return index - 1;
}

function parseCellReference(ref: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!match) {
    return null;
  }

  const columnIndex = columnIndexFromLabel(match[1]);
  const rowIndex = Number.parseInt(match[2], 10) - 1;

  if (columnIndex < 0 || rowIndex < 0) {
    return null;
  }

  return {
    columnLabel: match[1],
    rowLabel: String(rowIndex + 1),
    columnIndex,
    rowIndex,
  };
}

function isNumericCellValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && Number.isFinite(Number(trimmed));
  }

  return false;
}

function coerceToNumber(value: string | number | null | undefined): FormulaValue {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, error: FORMULA_ERROR };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return { ok: true, value: 0 };
    }

    if (FORMULA_ERROR_STRINGS.has(trimmed)) {
      return { ok: false, error: trimmed };
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed)
      ? { ok: true, value: parsed }
      : { ok: false, error: FORMULA_ERROR };
  }

  return { ok: true, value: 0 };
}

function tokenizeFormula(input: string): Token[] {
  const expression = input.trim().replace(/^=/, "");
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end])) {
        end += 1;
      }
      const raw = expression.slice(index, end);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new Error(FORMULA_ERROR);
      }
      tokens.push({ type: "number", value: parsed });
      index = end;
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[A-Za-z]/.test(expression[end])) {
        end += 1;
      }
      const letters = expression.slice(index, end).toUpperCase();

      let digitEnd = end;
      while (digitEnd < expression.length && /[0-9]/.test(expression[digitEnd])) {
        digitEnd += 1;
      }

      if (digitEnd > end) {
        tokens.push({ type: "ref", value: `${letters}${expression.slice(end, digitEnd)}` });
        index = digitEnd;
        continue;
      }

      tokens.push({ type: "identifier", value: letters });
      index = end;
      continue;
    }

    switch (char) {
      case "+":
        tokens.push({ type: "plus" });
        break;
      case "-":
        tokens.push({ type: "minus" });
        break;
      case "*":
        tokens.push({ type: "multiply" });
        break;
      case "/":
        tokens.push({ type: "divide" });
        break;
      case "(":
        tokens.push({ type: "lparen" });
        break;
      case ")":
        tokens.push({ type: "rparen" });
        break;
      case ":":
        tokens.push({ type: "colon" });
        break;
      case ",":
        tokens.push({ type: "comma" });
        break;
      default:
        throw new Error(FORMULA_ERROR);
    }

    index += 1;
  }

  tokens.push({ type: "eof" });
  return tokens;
}

function extractDirectReference(input: string) {
  const expression = input.trim().replace(/^=/, "").trim().toUpperCase();
  return /^[A-Z]+\d+$/.test(expression) ? expression : null;
}

class FormulaParser {
  private index = 0;

  constructor(
    private tokens: Token[],
    private helpers: {
      resolveRef: (ref: string) => FormulaValue;
      resolveRange: (startRef: string, endRef: string) => FormulaValue;
    }
  ) {}

  private current() {
    return this.tokens[this.index];
  }

  private next() {
    this.index += 1;
    return this.current();
  }

  private consume(type: Token["type"]) {
    const token = this.current();
    if (token.type !== type) {
      throw new Error(FORMULA_ERROR);
    }
    this.next();
    return token;
  }

  parse(): FormulaValue {
    const result = this.parseExpression();
    if (this.current().type !== "eof") {
      return { ok: false, error: FORMULA_ERROR };
    }
    return result;
  }

  private parseExpression(): FormulaValue {
    let left = this.parseTerm();

    while (this.current().type === "plus" || this.current().type === "minus") {
      const operator = this.current().type;
      this.next();
      const right = this.parseTerm();

      if (!left.ok) {
        return left;
      }
      if (!right.ok) {
        return right;
      }

      left = {
        ok: true,
        value: operator === "plus" ? left.value + right.value : left.value - right.value,
      };
    }

    return left;
  }

  private parseTerm(): FormulaValue {
    let left = this.parseFactor();

    while (this.current().type === "multiply" || this.current().type === "divide") {
      const operator = this.current().type;
      this.next();
      const right = this.parseFactor();

      if (!left.ok) {
        return left;
      }
      if (!right.ok) {
        return right;
      }

      if (operator === "divide" && right.value === 0) {
        return { ok: false, error: FORMULA_ERROR };
      }

      left = {
        ok: true,
        value: operator === "multiply" ? left.value * right.value : left.value / right.value,
      };
    }

    return left;
  }

  private parseFactor(): FormulaValue {
    const token = this.current();

    if (token.type === "plus") {
      this.next();
      return this.parseFactor();
    }

    if (token.type === "minus") {
      this.next();
      const value = this.parseFactor();
      if (!value.ok) {
        return value;
      }
      return { ok: true, value: value.value * -1 };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): FormulaValue {
    const token = this.current();

    if (token.type === "number") {
      this.next();
      return { ok: true, value: token.value };
    }

    if (token.type === "ref") {
      this.next();
      return this.helpers.resolveRef(token.value);
    }

    if (token.type === "lparen") {
      this.next();
      const nested = this.parseExpression();
      this.consume("rparen");
      return nested;
    }

    if (token.type === "identifier") {
      const identifier = token.value;
      this.next();
      this.consume("lparen");

      if (identifier !== "SUM") {
        return { ok: false, error: FORMULA_ERROR };
      }

      let total = 0;

      if (this.current().type === "rparen") {
        this.next();
        return { ok: true, value: total };
      }

      while (true) {
        if (this.current().type === "ref") {
          const startToken = this.current() as Extract<Token, { type: "ref" }>;
          const nextToken = this.tokens[this.index + 1];

          if (nextToken?.type === "colon") {
            this.next();
            this.next();
            const endToken = this.consume("ref") as Extract<Token, { type: "ref" }>;
            const rangeResult = this.helpers.resolveRange(startToken.value, endToken.value);
            if (!rangeResult.ok) {
              return rangeResult;
            }
            total += rangeResult.value;
          } else {
            const value = this.helpers.resolveRef(startToken.value);
            this.next();
            if (!value.ok) {
              return value;
            }
            total += value.value;
          }
        } else {
          const value = this.parseExpression();
          if (!value.ok) {
            return value;
          }
          total += value.value;
        }

        if (this.current().type === "comma") {
          this.next();
          continue;
        }

        break;
      }

      this.consume("rparen");
      return { ok: true, value: total };
    }

    return { ok: false, error: FORMULA_ERROR };
  }
}

export function recalculateWorksheetFormulas(worksheet: WorksheetData): WorksheetData {
  const nextCells: Record<string, WorksheetCell | undefined> = {};

  Object.entries(worksheet.cells).forEach(([key, cell]) => {
    nextCells[key] = cell ? { ...cell, metadata: { ...cell.metadata } } : undefined;
  });

  const cache = new Map<string, FormulaValue>();

  const resolveReferencedCellDisplay = (ref: string, stack: string[]) => {
    const parsed = parseCellReference(ref);
    if (!parsed) {
      return { ok: false as const, error: FORMULA_REF_ERROR };
    }

    if (
      parsed.columnIndex >= worksheet.columnCount ||
      parsed.rowIndex >= worksheet.rowCount
    ) {
      return { ok: false as const, error: FORMULA_REF_ERROR };
    }

    const cellKey = `${parsed.columnLabel}${parsed.rowLabel}`;
    if (stack.includes(cellKey)) {
      return { ok: false as const, error: FORMULA_CYCLE_ERROR };
    }

    const referencedCell = nextCells[cellKey];
    if (!referencedCell) {
      return { ok: true as const, computedValue: null as string | number | null, displayValue: "" };
    }

    if (referencedCell.formula && isFormulaString(referencedCell.formula)) {
      const evaluated = evaluateCell(cellKey, stack);
      if (!evaluated.ok) {
        return { ok: false as const, error: evaluated.error };
      }

      return {
        ok: true as const,
        computedValue: evaluated.value,
        displayValue: formatComputedNumber(evaluated.value),
      };
    }

    return {
      ok: true as const,
      computedValue: referencedCell.computedValue ?? referencedCell.value ?? null,
      displayValue: referencedCell.displayValue,
    };
  };

  const resolveRef = (ref: string, stack: string[]): FormulaValue => {
    const parsed = parseCellReference(ref);
    if (!parsed) {
      return { ok: false, error: FORMULA_REF_ERROR };
    }

    if (
      parsed.columnIndex >= worksheet.columnCount ||
      parsed.rowIndex >= worksheet.rowCount
    ) {
      return { ok: false, error: FORMULA_REF_ERROR };
    }

    const cellKey = `${parsed.columnLabel}${parsed.rowLabel}`;
    return evaluateCell(cellKey, stack);
  };

  const resolveRange = (startRef: string, endRef: string, stack: string[]): FormulaValue => {
    const start = parseCellReference(startRef);
    const end = parseCellReference(endRef);

    if (!start || !end) {
      return { ok: false, error: FORMULA_REF_ERROR };
    }

    if (
      start.columnIndex >= worksheet.columnCount ||
      end.columnIndex >= worksheet.columnCount ||
      start.rowIndex >= worksheet.rowCount ||
      end.rowIndex >= worksheet.rowCount
    ) {
      return { ok: false, error: FORMULA_REF_ERROR };
    }

    let total = 0;
    const minColumn = Math.min(start.columnIndex, end.columnIndex);
    const maxColumn = Math.max(start.columnIndex, end.columnIndex);
    const minRow = Math.min(start.rowIndex, end.rowIndex);
    const maxRow = Math.max(start.rowIndex, end.rowIndex);

    for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex += 1) {
      for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
        const column = worksheet.columns[columnIndex];
        const row = worksheet.rows[rowIndex];
        if (!column || !row) {
          return { ok: false, error: FORMULA_REF_ERROR };
        }

        const value = evaluateCell(`${column.id}${row.id}`, stack);
        if (!value.ok) {
          return value;
        }

        total += value.value;
      }
    }

    return { ok: true, value: total };
  };

  const evaluateCell = (cellKey: string, stack: string[]): FormulaValue => {
    if (cache.has(cellKey)) {
      return cache.get(cellKey)!;
    }

    if (stack.includes(cellKey)) {
      const cycle = { ok: false, error: FORMULA_CYCLE_ERROR } satisfies FormulaValue;
      cache.set(cellKey, cycle);
      return cycle;
    }

    const cell = nextCells[cellKey];
    if (!cell) {
      const empty = { ok: true, value: 0 } satisfies FormulaValue;
      cache.set(cellKey, empty);
      return empty;
    }

    if (!cell.formula || !isFormulaString(cell.formula)) {
      const literal = coerceToNumber(
        cell.computedValue ?? cell.value ?? cell.displayValue
      );
      cache.set(cellKey, literal);
      return literal;
    }

    try {
      const parser = new FormulaParser(tokenizeFormula(cell.formula), {
        resolveRef: (ref) => resolveRef(ref, [...stack, cellKey]),
        resolveRange: (startRef, endRef) => resolveRange(startRef, endRef, [...stack, cellKey]),
      });
      const result = parser.parse();
      cache.set(cellKey, result);
      return result;
    } catch {
      const failure = { ok: false, error: FORMULA_ERROR } satisfies FormulaValue;
      cache.set(cellKey, failure);
      return failure;
    }
  };

  Object.entries(nextCells).forEach(([cellKey, cell]) => {
    if (!cell) {
      return;
    }

    if (!cell.formula || !isFormulaString(cell.formula)) {
      if (cell.type === "number" && isNumericCellValue(cell.value)) {
        const parsed = Number(cell.value);
        cell.computedValue = parsed;
        cell.displayValue = formatComputedNumber(parsed);
      } else if (cell.type === "empty" || cell.value === null) {
        cell.computedValue = null;
        cell.displayValue = "";
      } else {
        cell.computedValue = typeof cell.value === "string" ? cell.value : cell.value ?? "";
        cell.displayValue = typeof cell.value === "string" ? cell.value : cell.value === null ? "" : String(cell.value);
      }
      return;
    }

    const directReference = extractDirectReference(cell.formula);
    if (directReference) {
      const resolved = resolveReferencedCellDisplay(directReference, [cellKey]);
      if (!resolved.ok) {
        cell.computedValue = resolved.error;
        cell.displayValue = resolved.error;
        return;
      }

      cell.computedValue = resolved.computedValue;
      cell.displayValue = resolved.displayValue;
      return;
    }

    const evaluated = evaluateCell(cellKey, []);
    if (!evaluated.ok) {
      cell.computedValue = evaluated.error;
      cell.displayValue = evaluated.error;
      return;
    }

    cell.computedValue = evaluated.value;
    cell.displayValue = formatComputedNumber(evaluated.value);
  });

  return {
    ...worksheet,
    cells: nextCells,
  };
}
