import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";

export const FORMULA_ERROR = "#ERROR!";
export const FORMULA_REF_ERROR = "#REF!";
export const FORMULA_VALUE_ERROR = "#VALUE!";
export const FORMULA_DIV_ZERO_ERROR = "#DIV/0!";
export const FORMULA_CYCLE_ERROR = "#CYCLE!";
export const FORMULA_ERROR_STRINGS = new Set([
  FORMULA_ERROR,
  FORMULA_REF_ERROR,
  FORMULA_VALUE_ERROR,
  FORMULA_DIV_ZERO_ERROR,
  FORMULA_CYCLE_ERROR,
]);

type FormulaValue =
  | { ok: true; kind: "number"; value: number }
  | { ok: true; kind: "string"; value: string }
  | { ok: true; kind: "boolean"; value: boolean }
  | { ok: true; kind: "blank"; value: null }
  | { ok: false; error: string };

type FormulaNumberValue = Extract<FormulaValue, { ok: true; kind: "number" }>;
type FormulaBooleanValue = Extract<FormulaValue, { ok: true; kind: "boolean" }>;

type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "ref"; value: string }
  | { type: "error"; value: string }
  | { type: "identifier"; value: string }
  | {
      type:
        | "plus"
        | "minus"
        | "multiply"
        | "divide"
        | "power"
        | "percent"
        | "lparen"
        | "rparen"
        | "colon"
        | "comma"
        | "equal"
        | "notEqual"
        | "less"
        | "lessOrEqual"
        | "greater"
        | "greaterOrEqual";
    }
  | { type: "eof" };

type FormulaRangeValue =
  | { ok: true; values: FormulaValue[]; rowCount: number; columnCount: number }
  | { ok: false; error: string };

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

function createNumberValue(value: number): FormulaNumberValue | { ok: false; error: string } {
  return Number.isFinite(value)
    ? { ok: true, kind: "number", value }
    : { ok: false, error: FORMULA_ERROR };
}

function createStringValue(value: string): FormulaValue {
  return { ok: true, kind: "string", value };
}

function createBooleanValue(value: boolean): FormulaBooleanValue {
  return { ok: true, kind: "boolean", value };
}

function createBlankValue(): FormulaValue {
  return { ok: true, kind: "blank", value: null };
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
  const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref.toUpperCase());
  if (!match) {
    return null;
  }

  const columnIndex = columnIndexFromLabel(match[2]);
  const rowIndex = Number.parseInt(match[4], 10) - 1;

  if (columnIndex < 0 || rowIndex < 0) {
    return null;
  }

  return {
    columnLabel: match[2],
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

function coerceRawValueToFormulaValue(value: string | number | null | undefined): FormulaValue {
  if (typeof value === "number") {
    return createNumberValue(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return createBlankValue();
    }

    if (FORMULA_ERROR_STRINGS.has(trimmed)) {
      return { ok: false, error: trimmed };
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? createNumberValue(parsed) : createStringValue(value);
  }

  return createBlankValue();
}

function coerceFormulaValueToNumber(value: FormulaValue): FormulaNumberValue | { ok: false; error: string } {
  if (!value.ok) {
    return value;
  }

  if (value.kind === "number") {
    return value;
  }

  if (value.kind === "blank") {
    return createNumberValue(0);
  }

  if (value.kind === "boolean") {
    return createNumberValue(value.value ? 1 : 0);
  }

  const trimmed = value.value.trim();
  if (trimmed.length === 0) {
    return createNumberValue(0);
  }

  if (FORMULA_ERROR_STRINGS.has(trimmed)) {
    return { ok: false, error: trimmed };
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? createNumberValue(parsed) : { ok: false, error: FORMULA_VALUE_ERROR };
}

function coerceFormulaValueToText(value: FormulaValue): { ok: true; value: string } | { ok: false; error: string } {
  if (!value.ok) {
    return value;
  }

  if (value.kind === "blank") {
    return { ok: true, value: "" };
  }

  if (value.kind === "number") {
    return { ok: true, value: formatComputedNumber(value.value) };
  }

  if (value.kind === "boolean") {
    return { ok: true, value: value.value ? "TRUE" : "FALSE" };
  }

  return { ok: true, value: value.value };
}

function coerceFormulaValueToBoolean(value: FormulaValue): FormulaBooleanValue | { ok: false; error: string } {
  if (!value.ok) {
    return value;
  }

  if (value.kind === "boolean") {
    return value;
  }

  if (value.kind === "blank") {
    return createBooleanValue(false);
  }

  if (value.kind === "number") {
    return createBooleanValue(value.value !== 0);
  }

  const trimmed = value.value.trim();
  if (FORMULA_ERROR_STRINGS.has(trimmed)) {
    return { ok: false, error: trimmed };
  }

  return createBooleanValue(value.value.length > 0);
}

function compareFormulaValues(left: FormulaValue, right: FormulaValue, operator: Token["type"]): FormulaValue {
  if (!left.ok) {
    return left;
  }
  if (!right.ok) {
    return right;
  }

  let comparisonResult = false;
  if (operator === "equal" || operator === "notEqual") {
    const leftComparable = left.kind === "blank" ? "" : left.kind === "boolean" ? left.value : left.value;
    const rightComparable = right.kind === "blank" ? "" : right.kind === "boolean" ? right.value : right.value;
    comparisonResult = leftComparable === rightComparable;
    return createBooleanValue(operator === "equal" ? comparisonResult : !comparisonResult);
  }

  const leftNumber = coerceFormulaValueToNumber(left);
  const rightNumber = coerceFormulaValueToNumber(right);
  if (!leftNumber.ok) {
    return leftNumber;
  }
  if (!rightNumber.ok) {
    return rightNumber;
  }

  if (operator === "less") {
    comparisonResult = leftNumber.value < rightNumber.value;
  } else if (operator === "lessOrEqual") {
    comparisonResult = leftNumber.value <= rightNumber.value;
  } else if (operator === "greater") {
    comparisonResult = leftNumber.value > rightNumber.value;
  } else {
    comparisonResult = leftNumber.value >= rightNumber.value;
  }

  return createBooleanValue(comparisonResult);
}

function formulaValueToCellValue(value: FormulaValue): {
  computedValue: string | number | null;
  displayValue: string;
} {
  if (!value.ok) {
    return {
      computedValue: value.error,
      displayValue: value.error,
    };
  }

  if (value.kind === "number") {
    return {
      computedValue: value.value,
      displayValue: formatComputedNumber(value.value),
    };
  }

  if (value.kind === "string") {
    return {
      computedValue: value.value,
      displayValue: value.value,
    };
  }

  if (value.kind === "boolean") {
    const numericBoolean = value.value ? 1 : 0;
    return {
      computedValue: numericBoolean,
      displayValue: formatComputedNumber(numericBoolean),
    };
  }

  return {
    computedValue: null,
    displayValue: "",
  };
}

function areFormulaValuesBothNumeric(left: FormulaValue, right: FormulaValue) {
  return (
    left.ok &&
    right.ok &&
    coerceFormulaValueToNumber(left).ok &&
    coerceFormulaValueToNumber(right).ok
  );
}

function isFormulaValueBlank(value: FormulaValue) {
  if (!value.ok) {
    return false;
  }

  return value.kind === "blank" || (value.kind === "string" && value.value.length === 0);
}

function roundFormulaNumber(value: number, decimalPlaces: number) {
  const factor = 10 ** decimalPlaces;
  if (!Number.isFinite(factor) || factor === 0) {
    return value;
  }

  return Math.round(value * factor) / factor;
}

function matchesFormulaCriteria(value: FormulaValue, criteria: FormulaValue) {
  if (!value.ok) {
    return false;
  }
  if (!criteria.ok) {
    return false;
  }

  const criteriaText = coerceFormulaValueToText(criteria);
  if (!criteriaText.ok) {
    return false;
  }

  const rawCriteria = criteriaText.value;
  const operatorMatch = /^(>=|<=|<>|>|<|=)(.*)$/.exec(rawCriteria);
  const operator = operatorMatch?.[1] ?? "=";
  const operandText = operatorMatch ? operatorMatch[2] : rawCriteria;
  const operand = coerceRawValueToFormulaValue(operandText);
  if (!operand.ok) {
    return false;
  }

  if (operator === "<>" && operandText.length === 0) {
    return !isFormulaValueBlank(value);
  }

  if (operator === "=" && operandText.length === 0) {
    return isFormulaValueBlank(value);
  }

  if (operator === "=" || operator === "<>") {
    let comparisonResult = false;
    if (areFormulaValuesBothNumeric(value, operand)) {
      const numericValue = coerceFormulaValueToNumber(value);
      const numericOperand = coerceFormulaValueToNumber(operand);
      comparisonResult = numericValue.ok && numericOperand.ok && numericValue.value === numericOperand.value;
    } else {
      const valueText = coerceFormulaValueToText(value);
      const operandComparableText = coerceFormulaValueToText(operand);
      comparisonResult =
        valueText.ok &&
        operandComparableText.ok &&
        valueText.value.toLocaleLowerCase() === operandComparableText.value.toLocaleLowerCase();
    }

    return operator === "=" ? comparisonResult : !comparisonResult;
  }

  const numericValue = coerceFormulaValueToNumber(value);
  const numericOperand = coerceFormulaValueToNumber(operand);
  if (!numericValue.ok || !numericOperand.ok) {
    return false;
  }

  if (operator === ">") {
    return numericValue.value > numericOperand.value;
  }

  if (operator === ">=") {
    return numericValue.value >= numericOperand.value;
  }

  if (operator === "<") {
    return numericValue.value < numericOperand.value;
  }

  return numericValue.value <= numericOperand.value;
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

    if (char === "\"") {
      let end = index + 1;
      let value = "";
      while (end < expression.length) {
        const current = expression[end];
        if (current === "\"") {
          if (expression[end + 1] === "\"") {
            value += "\"";
            end += 2;
            continue;
          }

          break;
        }

        value += current;
        end += 1;
      }

      if (end >= expression.length || expression[end] !== "\"") {
        throw new Error(FORMULA_ERROR);
      }

      tokens.push({ type: "string", value });
      index = end + 1;
      continue;
    }

    let matchedFormulaError: string | null = null;
    for (const formulaError of FORMULA_ERROR_STRINGS) {
      if (expression.slice(index, index + formulaError.length).toUpperCase() === formulaError) {
        matchedFormulaError = formulaError;
        break;
      }
    }
    if (matchedFormulaError) {
      tokens.push({ type: "error", value: matchedFormulaError });
      index += matchedFormulaError.length;
      continue;
    }

    const twoCharacterOperator = expression.slice(index, index + 2);
    if (twoCharacterOperator === "<>") {
      tokens.push({ type: "notEqual" });
      index += 2;
      continue;
    }

    if (twoCharacterOperator === "<=") {
      tokens.push({ type: "lessOrEqual" });
      index += 2;
      continue;
    }

    if (twoCharacterOperator === ">=") {
      tokens.push({ type: "greaterOrEqual" });
      index += 2;
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

    if (char === "$" || /[A-Za-z]/.test(char)) {
      const columnAbsolute = char === "$";
      const letterStart = columnAbsolute ? index + 1 : index;
      if (letterStart >= expression.length || !/[A-Za-z]/.test(expression[letterStart])) {
        throw new Error(FORMULA_ERROR);
      }

      let end = letterStart + 1;
      while (end < expression.length && /[A-Za-z]/.test(expression[end])) {
        end += 1;
      }
      const letters = expression.slice(letterStart, end).toUpperCase();

      const rowAbsolute = expression[end] === "$";
      const digitStart = rowAbsolute ? end + 1 : end;
      let digitEnd = digitStart;
      while (digitEnd < expression.length && /[0-9]/.test(expression[digitEnd])) {
        digitEnd += 1;
      }

      if (digitEnd > digitStart) {
        tokens.push({
          type: "ref",
          value: `${columnAbsolute ? "$" : ""}${letters}${rowAbsolute ? "$" : ""}${expression.slice(digitStart, digitEnd)}`,
        });
        index = digitEnd;
        continue;
      }

      if (columnAbsolute || rowAbsolute) {
        throw new Error(FORMULA_ERROR);
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
      case "^":
        tokens.push({ type: "power" });
        break;
      case "%":
        tokens.push({ type: "percent" });
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
      case "=":
        tokens.push({ type: "equal" });
        break;
      case "<":
        tokens.push({ type: "less" });
        break;
      case ">":
        tokens.push({ type: "greater" });
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
  return /^\$?[A-Z]+\$?\d+$/.test(expression) ? expression : null;
}

export function isWorksheetFormulaError(value: unknown): value is string {
  return typeof value === "string" && FORMULA_ERROR_STRINGS.has(value.trim().toUpperCase());
}

export function getWorksheetFormulaError(cell: WorksheetCell | undefined): string | null {
  if (!cell?.formula) {
    return null;
  }

  if (isWorksheetFormulaError(cell.computedValue)) {
    return cell.computedValue.trim().toUpperCase();
  }

  if (isWorksheetFormulaError(cell.displayValue)) {
    return cell.displayValue.trim().toUpperCase();
  }

  return null;
}

export function findWorksheetFormulaErrors(worksheet: WorksheetData) {
  const issues: Array<{ cellKey: string; error: string }> = [];

  Object.entries(worksheet.cells).forEach(([cellKey, cell]) => {
    const error = getWorksheetFormulaError(cell);
    if (error) {
      issues.push({ cellKey, error });
    }
  });

  return issues;
}

class FormulaParser {
  private index = 0;

  constructor(
    private tokens: Token[],
    private helpers: {
      resolveRef: (ref: string) => FormulaValue;
      resolveRange: (startRef: string, endRef: string) => FormulaValue;
      resolveRangeValues: (startRef: string, endRef: string) => FormulaRangeValue;
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
    const result = this.parseComparison();
    if (this.current().type !== "eof") {
      return { ok: false, error: FORMULA_ERROR };
    }
    return result;
  }

  private parseComparison(): FormulaValue {
    let left = this.parseAdditive();

    while (
      this.current().type === "equal" ||
      this.current().type === "notEqual" ||
      this.current().type === "less" ||
      this.current().type === "lessOrEqual" ||
      this.current().type === "greater" ||
      this.current().type === "greaterOrEqual"
    ) {
      const operator = this.current().type;
      this.next();
      const right = this.parseAdditive();

      left = compareFormulaValues(left, right, operator);
    }

    return left;
  }

  private parseAdditive(): FormulaValue {
    let left = this.parseMultiplicative();

    while (this.current().type === "plus" || this.current().type === "minus") {
      const operator = this.current().type;
      this.next();
      const right = this.parseMultiplicative();

      const numericLeft = coerceFormulaValueToNumber(left);
      if (!numericLeft.ok) {
        return numericLeft;
      }
      const numericRight = coerceFormulaValueToNumber(right);
      if (!numericRight.ok) {
        return numericRight;
      }

      left = {
        ok: true,
        kind: "number",
        value: operator === "plus" ? numericLeft.value + numericRight.value : numericLeft.value - numericRight.value,
      };
    }

    return left;
  }

  private parseMultiplicative(): FormulaValue {
    let left = this.parsePower();

    while (this.current().type === "multiply" || this.current().type === "divide") {
      const operator = this.current().type;
      this.next();
      const right = this.parsePower();

      const numericLeft = coerceFormulaValueToNumber(left);
      if (!numericLeft.ok) {
        return numericLeft;
      }
      const numericRight = coerceFormulaValueToNumber(right);
      if (!numericRight.ok) {
        return numericRight;
      }

      if (operator === "divide" && numericRight.value === 0) {
        return { ok: false, error: FORMULA_DIV_ZERO_ERROR };
      }

      left = {
        ok: true,
        kind: "number",
        value: operator === "multiply" ? numericLeft.value * numericRight.value : numericLeft.value / numericRight.value,
      };
    }

    return left;
  }

  private parsePower(): FormulaValue {
    let left = this.parseUnary();

    while (this.current().type === "power") {
      this.next();
      const right = this.parseUnary();

      const numericLeft = coerceFormulaValueToNumber(left);
      if (!numericLeft.ok) {
        return numericLeft;
      }
      const numericRight = coerceFormulaValueToNumber(right);
      if (!numericRight.ok) {
        return numericRight;
      }

      left = createNumberValue(numericLeft.value ** numericRight.value);
    }

    return left;
  }

  private parseUnary(): FormulaValue {
    const token = this.current();

    if (token.type === "plus") {
      this.next();
      return this.parseUnary();
    }

    if (token.type === "minus") {
      this.next();
      const value = this.parseUnary();
      if (!value.ok) {
        return value;
      }
      const numericValue = coerceFormulaValueToNumber(value);
      if (!numericValue.ok) {
        return numericValue;
      }
      return createNumberValue(numericValue.value * -1);
    }

    return this.parsePostfix();
  }

  private parsePostfix(): FormulaValue {
    let value = this.parsePrimary();

    while (this.current().type === "percent") {
      this.next();
      const numericValue = coerceFormulaValueToNumber(value);
      if (!numericValue.ok) {
        return numericValue;
      }

      value = createNumberValue(numericValue.value / 100);
    }

    return value;
  }

  private parsePrimary(): FormulaValue {
    const token = this.current();

    if (token.type === "number") {
      this.next();
      return createNumberValue(token.value);
    }

    if (token.type === "string") {
      this.next();
      return createStringValue(token.value);
    }

    if (token.type === "ref") {
      this.next();
      return this.helpers.resolveRef(token.value);
    }

    if (token.type === "error") {
      this.next();
      return { ok: false, error: token.value };
    }

    if (token.type === "lparen") {
      this.next();
      const nested = this.parseComparison();
      this.consume("rparen");
      return nested;
    }

    if (token.type === "identifier") {
      const identifier = token.value;
      this.next();
      if (identifier === "TRUE" || identifier === "FALSE") {
        return createBooleanValue(identifier === "TRUE");
      }

      this.consume("lparen");
      const argumentTokens = this.collectFunctionArguments();
      return this.evaluateFunction(identifier, argumentTokens);
    }

    return { ok: false, error: FORMULA_ERROR };
  }

  private collectFunctionArguments() {
    const args: Token[][] = [];
    let currentArg: Token[] = [];
    let depth = 0;

    if (this.current().type === "rparen") {
      this.next();
      return args;
    }

    while (this.current().type !== "eof") {
      const token = this.current();

      if (token.type === "lparen") {
        depth += 1;
        currentArg.push(token);
        this.next();
        continue;
      }

      if (token.type === "rparen") {
        if (depth === 0) {
          args.push(currentArg);
          this.next();
          return args;
        }

        depth -= 1;
        currentArg.push(token);
        this.next();
        continue;
      }

      if (token.type === "comma" && depth === 0) {
        args.push(currentArg);
        currentArg = [];
        this.next();
        continue;
      }

      currentArg.push(token);
      this.next();
    }

    throw new Error(FORMULA_ERROR);
  }

  private evaluateFunction(identifier: string, args: Token[][]): FormulaValue {
    if (identifier === "IF") {
      return this.evaluateIf(args);
    }

    if (identifier === "IFERROR") {
      return this.evaluateIfError(args);
    }

    if (identifier === "IFS") {
      return this.evaluateIfs(args);
    }

    if (identifier === "OR") {
      return this.evaluateOr(args);
    }

    if (identifier === "AND") {
      return this.evaluateAnd(args);
    }

    if (identifier === "SUM") {
      return this.evaluateAggregate(args, "sum");
    }

    if (identifier === "MIN") {
      return this.evaluateAggregate(args, "min");
    }

    if (identifier === "MAX") {
      return this.evaluateAggregate(args, "max");
    }

    if (identifier === "AVERAGE") {
      return this.evaluateAggregate(args, "average");
    }

    if (identifier === "COUNT") {
      return this.evaluateAggregate(args, "count");
    }

    if (identifier === "ROUND" || identifier === "ROUNDUP" || identifier === "ROUNDDOWN") {
      return this.evaluateRoundFunction(identifier, args);
    }

    if (identifier === "CEILING") {
      return this.evaluateCeiling(args);
    }

    if (identifier === "CONCAT") {
      return this.evaluateConcat(args);
    }

    if (identifier === "LEFT" || identifier === "RIGHT" || identifier === "MID") {
      return this.evaluateTextSliceFunction(identifier, args);
    }

    if (identifier === "TRIM") {
      return this.evaluateTrim(args);
    }

    if (identifier === "TEXTJOIN") {
      return this.evaluateTextJoin(args);
    }

    if (identifier === "SUMIF") {
      return this.evaluateSumIf(args);
    }

    if (identifier === "SUMIFS") {
      return this.evaluateSumIfs(args);
    }

    if (identifier === "COUNTIF") {
      return this.evaluateCountIf(args);
    }

    if (identifier === "COUNTIFS") {
      return this.evaluateCountIfs(args);
    }

    if (identifier === "QTY") {
      return this.evaluateQty(args);
    }

    if (identifier === "UNIT") {
      return this.evaluateUnit(args);
    }

    if (identifier === "WASTE") {
      return this.evaluateWaste(args);
    }

    if (identifier === "PACKS") {
      return this.evaluatePacks(args);
    }

    return { ok: false, error: FORMULA_ERROR };
  }

  private evaluateIf(args: Token[][]): FormulaValue {
    if (args.length !== 3) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const condition = this.evaluateTokenExpression(args[0]);
    if (!condition.ok) {
      return condition;
    }

    const booleanCondition = coerceFormulaValueToBoolean(condition);
    if (!booleanCondition.ok) {
      return booleanCondition;
    }

    return this.evaluateTokenExpression(booleanCondition.value ? args[1] : args[2]);
  }

  private evaluateIfError(args: Token[][]): FormulaValue {
    if (args.length !== 2) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const value = this.evaluateTokenExpression(args[0]);
    return value.ok ? value : this.evaluateTokenExpression(args[1]);
  }

  private evaluateIfs(args: Token[][]): FormulaValue {
    if (args.length < 2 || args.length % 2 !== 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    for (let index = 0; index < args.length; index += 2) {
      const condition = this.evaluateTokenExpression(args[index]);
      if (!condition.ok) {
        return condition;
      }

      const booleanCondition = coerceFormulaValueToBoolean(condition);
      if (!booleanCondition.ok) {
        return booleanCondition;
      }

      if (booleanCondition.value) {
        return this.evaluateTokenExpression(args[index + 1]);
      }
    }

    return { ok: false, error: FORMULA_ERROR };
  }

  private evaluateOr(args: Token[][]): FormulaValue {
    if (args.length === 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    for (const arg of args) {
      const values = this.evaluateArgumentValues(arg);
      if (!values.ok) {
        return { ok: false, error: values.error };
      }

      for (const value of values.values) {
        const booleanValue = coerceFormulaValueToBoolean(value);
        if (!booleanValue.ok) {
          return booleanValue;
        }

        if (booleanValue.value) {
          return createBooleanValue(true);
        }
      }
    }

    return createBooleanValue(false);
  }

  private evaluateAnd(args: Token[][]): FormulaValue {
    if (args.length === 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    for (const arg of args) {
      const values = this.evaluateArgumentValues(arg);
      if (!values.ok) {
        return { ok: false, error: values.error };
      }

      for (const value of values.values) {
        const booleanValue = coerceFormulaValueToBoolean(value);
        if (!booleanValue.ok) {
          return booleanValue;
        }

        if (!booleanValue.value) {
          return createBooleanValue(false);
        }
      }
    }

    return createBooleanValue(true);
  }

  private evaluateHelperNumberArg(arg: Token[]): FormulaNumberValue | { ok: true; kind: "blank"; value: null } | { ok: false; error: string } {
    const value = this.evaluateTokenExpression(arg);
    if (!value.ok) {
      return value;
    }

    if (isFormulaValueBlank(value)) {
      return createBlankValue();
    }

    return coerceFormulaValueToNumber(value);
  }

  private evaluateQty(args: Token[][]): FormulaValue {
    if (args.length !== 4) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const qty = this.evaluateHelperNumberArg(args[0]);
    const length = this.evaluateHelperNumberArg(args[1]);
    const width = this.evaluateHelperNumberArg(args[2]);
    const height = this.evaluateHelperNumberArg(args[3]);
    if (!qty.ok) {
      return qty;
    }
    if (!length.ok) {
      return length;
    }
    if (!width.ok) {
      return width;
    }
    if (!height.ok) {
      return height;
    }

    const values = [qty, length, width, height];
    if (values.every((value) => value.kind === "blank")) {
      return createBlankValue();
    }

    if (qty.kind === "number" && length.kind === "number" && width.kind === "blank" && height.kind === "blank") {
      return createNumberValue(roundFormulaNumber(qty.value * length.value, 2));
    }

    if (qty.kind === "number" && length.kind === "number" && width.kind === "number" && height.kind === "blank") {
      return createNumberValue(roundFormulaNumber(qty.value * length.value * width.value, 2));
    }

    if (qty.kind === "number" && length.kind === "number" && width.kind === "number" && height.kind === "number") {
      return createNumberValue(roundFormulaNumber(qty.value * length.value * width.value * height.value, 2));
    }

    return { ok: false, error: FORMULA_ERROR };
  }

  private evaluateUnit(args: Token[][]): FormulaValue {
    if (args.length !== 3) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const length = this.evaluateHelperNumberArg(args[0]);
    const width = this.evaluateHelperNumberArg(args[1]);
    const height = this.evaluateHelperNumberArg(args[2]);
    if (!length.ok) {
      return length;
    }
    if (!width.ok) {
      return width;
    }
    if (!height.ok) {
      return height;
    }

    if (length.kind === "blank" && width.kind === "blank" && height.kind === "blank") {
      return createBlankValue();
    }

    if (length.kind === "number" && width.kind === "blank" && height.kind === "blank") {
      return createStringValue("m/No");
    }

    if (length.kind === "number" && width.kind === "number" && height.kind === "blank") {
      return createStringValue("m2");
    }

    if (length.kind === "number" && width.kind === "number" && height.kind === "number") {
      return createStringValue("m3");
    }

    return { ok: false, error: FORMULA_ERROR };
  }

  private evaluateWaste(args: Token[][]): FormulaValue {
    if (args.length !== 2) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const quantity = this.evaluateHelperNumberArg(args[0]);
    const percentage = this.evaluateHelperNumberArg(args[1]);
    if (!quantity.ok) {
      return quantity;
    }
    if (!percentage.ok) {
      return percentage;
    }

    if (quantity.kind === "blank") {
      return createBlankValue();
    }

    if (percentage.kind !== "number") {
      return { ok: false, error: FORMULA_ERROR };
    }

    return createNumberValue(roundFormulaNumber(quantity.value * (1 + percentage.value), 2));
  }

  private evaluatePacks(args: Token[][]): FormulaValue {
    if (args.length !== 2) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const quantity = this.evaluateHelperNumberArg(args[0]);
    const packSize = this.evaluateHelperNumberArg(args[1]);
    if (!quantity.ok) {
      return quantity;
    }
    if (!packSize.ok) {
      return packSize;
    }

    if (quantity.kind === "blank") {
      return createBlankValue();
    }

    if (quantity.value === 0) {
      return createNumberValue(0);
    }

    if (packSize.kind !== "number" || packSize.value <= 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    return createNumberValue(roundFormulaNumber(Math.max(1, quantity.value / packSize.value), 2));
  }

  private evaluateRoundFunction(identifier: string, args: Token[][]): FormulaValue {
    if (args.length !== 2) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const value = this.evaluateTokenExpression(args[0]);
    const decimals = this.evaluateTokenExpression(args[1]);
    const numericValue = coerceFormulaValueToNumber(value);
    if (!numericValue.ok) {
      return numericValue;
    }
    const numericDecimals = coerceFormulaValueToNumber(decimals);
    if (!numericDecimals.ok) {
      return numericDecimals;
    }

    const decimalPlaces = Math.trunc(numericDecimals.value);
    const factor = 10 ** decimalPlaces;
    if (!Number.isFinite(factor) || factor === 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    let roundedValue: number;
    if (identifier === "ROUNDUP") {
      roundedValue = Math.sign(numericValue.value) * Math.ceil(Math.abs(numericValue.value) * factor) / factor;
    } else if (identifier === "ROUNDDOWN") {
      roundedValue = Math.sign(numericValue.value) * Math.floor(Math.abs(numericValue.value) * factor) / factor;
    } else {
      roundedValue = Math.round(numericValue.value * factor) / factor;
    }

    return createNumberValue(roundedValue);
  }

  private evaluateCeiling(args: Token[][]): FormulaValue {
    if (args.length < 1 || args.length > 2) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const value = this.evaluateTokenExpression(args[0]);
    const numericValue = coerceFormulaValueToNumber(value);
    if (!numericValue.ok) {
      return numericValue;
    }

    const significance = args.length === 2
      ? coerceFormulaValueToNumber(this.evaluateTokenExpression(args[1]))
      : createNumberValue(1);
    if (!significance.ok) {
      return significance;
    }

    const divisor = Math.abs(significance.value);
    if (!Number.isFinite(divisor) || divisor === 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    return createNumberValue(Math.ceil(numericValue.value / divisor) * divisor);
  }

  private evaluateAggregate(
    args: Token[][],
    mode: "sum" | "min" | "max" | "average" | "count"
  ): FormulaValue {
    if (args.length === 0) {
      return mode === "sum" || mode === "count"
        ? createNumberValue(0)
        : { ok: false, error: FORMULA_ERROR };
    }

    let total = 0;
    let count = 0;
    let min: number | null = null;
    let max: number | null = null;

    for (const arg of args) {
      const values = this.evaluateArgumentValues(arg);
      if (!values.ok) {
        return { ok: false, error: values.error };
      }

      for (const value of values.values) {
        const numericValue = coerceFormulaValueToNumber(value);
        if (!numericValue.ok) {
          return numericValue;
        }

        total += numericValue.value;
        count += 1;
        min = min === null ? numericValue.value : Math.min(min, numericValue.value);
        max = max === null ? numericValue.value : Math.max(max, numericValue.value);
      }
    }

    if (mode === "sum") {
      return createNumberValue(total);
    }

    if (mode === "count") {
      return createNumberValue(count);
    }

    if (count === 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    if (mode === "min") {
      return createNumberValue(min ?? 0);
    }

    if (mode === "max") {
      return createNumberValue(max ?? 0);
    }

    return createNumberValue(total / count);
  }

  private evaluateConcat(args: Token[][]): FormulaValue {
    let result = "";
    for (const arg of args) {
      const value = this.evaluateTokenExpression(arg);
      const text = coerceFormulaValueToText(value);
      if (!text.ok) {
        return text;
      }

      result += text.value;
    }

    return createStringValue(result);
  }

  private evaluateTextSliceFunction(identifier: string, args: Token[][]): FormulaValue {
    if (identifier === "MID" ? args.length !== 3 : args.length !== 2) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const text = coerceFormulaValueToText(this.evaluateTokenExpression(args[0]));
    if (!text.ok) {
      return text;
    }

    const firstNumber = coerceFormulaValueToNumber(this.evaluateTokenExpression(args[1]));
    if (!firstNumber.ok) {
      return firstNumber;
    }

    const firstCount = Math.trunc(firstNumber.value);
    if (!Number.isFinite(firstCount)) {
      return { ok: false, error: FORMULA_ERROR };
    }

    if (identifier === "LEFT") {
      if (firstCount < 0) {
        return { ok: false, error: FORMULA_ERROR };
      }
      return createStringValue(text.value.slice(0, firstCount));
    }

    if (identifier === "RIGHT") {
      if (firstCount < 0) {
        return { ok: false, error: FORMULA_ERROR };
      }
      return createStringValue(firstCount === 0 ? "" : text.value.slice(-firstCount));
    }

    const count = coerceFormulaValueToNumber(this.evaluateTokenExpression(args[2]));
    if (!count.ok) {
      return count;
    }

    const start = firstCount;
    const length = Math.trunc(count.value);
    if (start < 1 || length < 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    return createStringValue(text.value.slice(start - 1, start - 1 + length));
  }

  private evaluateTrim(args: Token[][]): FormulaValue {
    if (args.length !== 1) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const text = coerceFormulaValueToText(this.evaluateTokenExpression(args[0]));
    if (!text.ok) {
      return text;
    }

    return createStringValue(text.value.trim().replace(/\s+/g, " "));
  }

  private evaluateTextJoin(args: Token[][]): FormulaValue {
    if (args.length < 3) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const delimiter = coerceFormulaValueToText(this.evaluateTokenExpression(args[0]));
    if (!delimiter.ok) {
      return delimiter;
    }

    const ignoreEmpty = coerceFormulaValueToBoolean(this.evaluateTokenExpression(args[1]));
    if (!ignoreEmpty.ok) {
      return ignoreEmpty;
    }

    const parts: string[] = [];
    for (const arg of args.slice(2)) {
      const values = this.evaluateArgumentValues(arg);
      if (!values.ok) {
        return { ok: false, error: values.error };
      }

      for (const value of values.values) {
        const text = coerceFormulaValueToText(value);
        if (!text.ok) {
          return text;
        }

        if (ignoreEmpty.value && text.value.length === 0) {
          continue;
        }

        parts.push(text.value);
      }
    }

    return createStringValue(parts.join(delimiter.value));
  }

  private evaluateCountIf(args: Token[][]): FormulaValue {
    if (args.length !== 2) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const range = this.evaluateRequiredRangeArgument(args[0]);
    if (!range.ok) {
      return { ok: false, error: range.error };
    }

    const criteria = this.evaluateTokenExpression(args[1]);
    if (!criteria.ok) {
      return criteria;
    }

    return createNumberValue(
      range.values.reduce((total, value) => total + (matchesFormulaCriteria(value, criteria) ? 1 : 0), 0)
    );
  }

  private evaluateCountIfs(args: Token[][]): FormulaValue {
    if (args.length < 2 || args.length % 2 !== 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const criteriaPairs = this.evaluateCriteriaPairs(args, 0);
    if (!criteriaPairs.ok) {
      return { ok: false, error: criteriaPairs.error };
    }

    let count = 0;
    for (let valueIndex = 0; valueIndex < criteriaPairs.rowCount * criteriaPairs.columnCount; valueIndex += 1) {
      if (
        criteriaPairs.pairs.every((pair) =>
          matchesFormulaCriteria(pair.range.values[valueIndex], pair.criteria)
        )
      ) {
        count += 1;
      }
    }

    return createNumberValue(count);
  }

  private evaluateSumIf(args: Token[][]): FormulaValue {
    if (args.length !== 2 && args.length !== 3) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const criteriaRange = this.evaluateRequiredRangeArgument(args[0]);
    if (!criteriaRange.ok) {
      return { ok: false, error: criteriaRange.error };
    }

    const criteria = this.evaluateTokenExpression(args[1]);
    if (!criteria.ok) {
      return criteria;
    }

    const sumRange = args[2] ? this.evaluateRequiredRangeArgument(args[2]) : criteriaRange;
    if (!sumRange.ok) {
      return { ok: false, error: sumRange.error };
    }

    if (
      criteriaRange.rowCount !== sumRange.rowCount ||
      criteriaRange.columnCount !== sumRange.columnCount
    ) {
      return { ok: false, error: FORMULA_ERROR };
    }

    let total = 0;
    for (let valueIndex = 0; valueIndex < criteriaRange.values.length; valueIndex += 1) {
      if (!matchesFormulaCriteria(criteriaRange.values[valueIndex], criteria)) {
        continue;
      }

      const numericValue = coerceFormulaValueToNumber(sumRange.values[valueIndex]);
      if (!numericValue.ok) {
        return numericValue;
      }

      total += numericValue.value;
    }

    return createNumberValue(total);
  }

  private evaluateSumIfs(args: Token[][]): FormulaValue {
    if (args.length < 3 || args.length % 2 !== 1) {
      return { ok: false, error: FORMULA_ERROR };
    }

    const sumRange = this.evaluateRequiredRangeArgument(args[0]);
    if (!sumRange.ok) {
      return { ok: false, error: sumRange.error };
    }

    const criteriaPairs = this.evaluateCriteriaPairs(args, 1);
    if (!criteriaPairs.ok) {
      return { ok: false, error: criteriaPairs.error };
    }

    if (
      sumRange.rowCount !== criteriaPairs.rowCount ||
      sumRange.columnCount !== criteriaPairs.columnCount
    ) {
      return { ok: false, error: FORMULA_ERROR };
    }

    let total = 0;
    for (let valueIndex = 0; valueIndex < sumRange.values.length; valueIndex += 1) {
      if (
        !criteriaPairs.pairs.every((pair) =>
          matchesFormulaCriteria(pair.range.values[valueIndex], pair.criteria)
        )
      ) {
        continue;
      }

      const numericValue = coerceFormulaValueToNumber(sumRange.values[valueIndex]);
      if (!numericValue.ok) {
        return numericValue;
      }

      total += numericValue.value;
    }

    return createNumberValue(total);
  }

  private evaluateCriteriaPairs(
    args: Token[][],
    startIndex: number
  ):
    | {
        ok: true;
        rowCount: number;
        columnCount: number;
        pairs: Array<{ range: Extract<FormulaRangeValue, { ok: true }>; criteria: FormulaValue }>;
      }
    | { ok: false; error: string } {
    const pairs: Array<{ range: Extract<FormulaRangeValue, { ok: true }>; criteria: FormulaValue }> = [];
    let rowCount: number | null = null;
    let columnCount: number | null = null;

    for (let argIndex = startIndex; argIndex < args.length; argIndex += 2) {
      const range = this.evaluateRequiredRangeArgument(args[argIndex]);
      if (!range.ok) {
        return { ok: false, error: range.error };
      }

      const criteria = this.evaluateTokenExpression(args[argIndex + 1]);
      if (!criteria.ok) {
        return criteria;
      }

      if (rowCount === null || columnCount === null) {
        rowCount = range.rowCount;
        columnCount = range.columnCount;
      } else if (range.rowCount !== rowCount || range.columnCount !== columnCount) {
        return { ok: false, error: FORMULA_ERROR };
      }

      pairs.push({ range, criteria });
    }

    if (rowCount === null || columnCount === null) {
      return { ok: false, error: FORMULA_ERROR };
    }

    return {
      ok: true,
      rowCount,
      columnCount,
      pairs,
    };
  }

  private evaluateRequiredRangeArgument(arg: Token[]): FormulaRangeValue {
    if (
      arg.length === 3 &&
      arg[0].type === "ref" &&
      arg[1].type === "colon" &&
      arg[2].type === "ref"
    ) {
      return this.helpers.resolveRangeValues(arg[0].value, arg[2].value);
    }

    return { ok: false, error: FORMULA_ERROR };
  }

  private evaluateArgumentValues(arg: Token[]): FormulaRangeValue {
    if (
      arg.length === 3 &&
      arg[0].type === "ref" &&
      arg[1].type === "colon" &&
      arg[2].type === "ref"
    ) {
      return this.helpers.resolveRangeValues(arg[0].value, arg[2].value);
    }

    const value = this.evaluateTokenExpression(arg);
    return { ok: true, values: [value], rowCount: 1, columnCount: 1 };
  }

  private evaluateTokenExpression(tokens: Token[]): FormulaValue {
    if (tokens.length === 0) {
      return { ok: false, error: FORMULA_ERROR };
    }

    return new FormulaParser([...tokens, { type: "eof" }], this.helpers).parse();
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
        ...formulaValueToCellValue(evaluated),
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

        const numericValue = coerceFormulaValueToNumber(value);
        if (!numericValue.ok) {
          return numericValue;
        }

        total += numericValue.value;
      }
    }

    return createNumberValue(total);
  };

  const resolveRangeValues = (startRef: string, endRef: string, stack: string[]): FormulaRangeValue => {
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

    const values: FormulaValue[] = [];
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

        values.push(evaluateCell(`${column.id}${row.id}`, stack));
      }
    }

    return {
      ok: true,
      values,
      rowCount: maxRow - minRow + 1,
      columnCount: maxColumn - minColumn + 1,
    };
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
      const empty = createBlankValue();
      cache.set(cellKey, empty);
      return empty;
    }

    if (!cell.formula || !isFormulaString(cell.formula)) {
      const literal = coerceRawValueToFormulaValue(
        cell.computedValue ?? cell.value ?? cell.displayValue
      );
      cache.set(cellKey, literal);
      return literal;
    }

    try {
      const parser = new FormulaParser(tokenizeFormula(cell.formula), {
        resolveRef: (ref) => resolveRef(ref, [...stack, cellKey]),
        resolveRange: (startRef, endRef) => resolveRange(startRef, endRef, [...stack, cellKey]),
        resolveRangeValues: (startRef, endRef) =>
          resolveRangeValues(startRef, endRef, [...stack, cellKey]),
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

    const formattedValue = formulaValueToCellValue(evaluated);
    cell.computedValue = formattedValue.computedValue;
    cell.displayValue = formattedValue.displayValue;
  });

  return {
    ...worksheet,
    cells: nextCells,
  };
}
