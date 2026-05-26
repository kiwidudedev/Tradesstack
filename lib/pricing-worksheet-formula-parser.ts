export type PricingWorksheetFormulaParserOptions = {
  allowedFunctions: string[];
  maxRowCount?: number;
  maxColumnCount?: number;
};

export type PricingWorksheetFormulaParserIssue = {
  code:
    | "formula_empty"
    | "formula_missing_equals"
    | "formula_invalid_character"
    | "formula_unterminated_string"
    | "formula_unexpected_end"
    | "formula_unexpected_token"
    | "formula_unsupported_function"
    | "formula_invalid_reference"
    | "formula_invalid_range"
    | "formula_ref_out_of_bounds"
    | "formula_unknown_identifier";
  message: string;
  token?: string;
};

type FormulaToken =
  | { type: "number"; value: string }
  | { type: "string"; value: string }
  | { type: "cell"; value: string }
  | { type: "identifier"; value: string }
  | { type: "lparen"; value: "(" }
  | { type: "rparen"; value: ")" }
  | { type: "comma"; value: "," }
  | { type: "colon"; value: ":" }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "^" | "%" | "=" | "<" | ">" | "<=" | ">=" | "<>" };

type ParseSuccess = {
  success: true;
  normalizedFormula: string;
  referencedCells: string[];
  referencedRanges: string[];
  functionsUsed: string[];
};

type ParseFailure = {
  success: false;
  issue: PricingWorksheetFormulaParserIssue;
};

export type PricingWorksheetFormulaParserResult = ParseSuccess | ParseFailure;

function buildColumnLabel(index: number): string {
  let current = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return label;
}

function columnLabelToIndex(label: string): number | null {
  const normalized = label.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) {
    return null;
  }

  let value = 0;
  for (const char of normalized) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

function parseCellRef(ref: string): { columnIndex: number; rowNumber: number } | null {
  const match = ref.trim().toUpperCase().match(/^\$?([A-Z]+)\$?(\d+)$/);
  if (!match) {
    return null;
  }

  const columnIndex = columnLabelToIndex(match[1]);
  const rowNumber = Number(match[2]);
  if (columnIndex === null || !Number.isInteger(rowNumber) || rowNumber < 1) {
    return null;
  }

  return { columnIndex, rowNumber };
}

function isValidCellRef(ref: string) {
  return parseCellRef(ref) !== null;
}

function normalizeCellRef(ref: string) {
  const parsed = /^(\$?)([A-Z]+)(\$?)(\d+)$/i.exec(ref.trim());
  if (!parsed) {
    return ref.trim().toUpperCase();
  }

  return `${parsed[1]}${parsed[2].toUpperCase()}${parsed[3]}${parsed[4]}`;
}

function tokenizeFormulaBody(formulaBody: string): FormulaToken[] | PricingWorksheetFormulaParserIssue {
  const tokens: FormulaToken[] = [];
  let index = 0;

  while (index < formulaBody.length) {
    const char = formulaBody[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const cellMatch = formulaBody.slice(index).match(/^\$?[A-Z]+\$?\d+/i);
    if (cellMatch) {
      const value = normalizeCellRef(cellMatch[0]);
      if (!isValidCellRef(value)) {
        return {
          code: "formula_invalid_reference",
          message: `Formula reference "${cellMatch[0]}" is invalid.`,
          token: cellMatch[0],
        };
      }
      tokens.push({ type: "cell", value });
      index += cellMatch[0].length;
      continue;
    }

    const identifierMatch = formulaBody.slice(index).match(/^[A-Z_][A-Z0-9_]*/i);
    if (identifierMatch) {
      tokens.push({ type: "identifier", value: identifierMatch[0].toUpperCase() });
      index += identifierMatch[0].length;
      continue;
    }

    const numberMatch = formulaBody.slice(index).match(/^\d+(\.\d+)?/);
    if (numberMatch) {
      tokens.push({ type: "number", value: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }

    if (char === "\"") {
      let cursor = index + 1;
      let literal = "\"";
      let terminated = false;
      while (cursor < formulaBody.length) {
        const nextChar = formulaBody[cursor];
        literal += nextChar;
        cursor += 1;
        if (nextChar === "\"") {
          terminated = true;
          break;
        }
      }

      if (!terminated) {
        return {
          code: "formula_unterminated_string",
          message: "Formula string literal is not terminated.",
        };
      }

      tokens.push({ type: "string", value: literal });
      index = cursor;
      continue;
    }

    const twoCharOperator = formulaBody.slice(index, index + 2);
    if (twoCharOperator === "<=" || twoCharOperator === ">=" || twoCharOperator === "<>") {
      tokens.push({ type: "operator", value: twoCharOperator });
      index += 2;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "lparen", value: "(" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen", value: ")" });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma", value: "," });
      index += 1;
      continue;
    }
    if (char === ":") {
      tokens.push({ type: "colon", value: ":" });
      index += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "^" || char === "%" || char === "=" || char === "<" || char === ">") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    return {
      code: "formula_invalid_character",
      message: `Formula contains unsupported character "${char}".`,
      token: char,
    };
  }

  return tokens;
}

export function parsePricingWorksheetFormula(
  formula: string,
  options: PricingWorksheetFormulaParserOptions,
): PricingWorksheetFormulaParserResult {
  const normalized = formula.trim();
  if (normalized.length === 0) {
    return {
      success: false,
      issue: {
        code: "formula_empty",
        message: "Formula cannot be empty.",
      },
    };
  }

  if (!normalized.startsWith("=")) {
    return {
      success: false,
      issue: {
        code: "formula_missing_equals",
        message: "Formula must start with '='.",
      },
    };
  }

  const formulaBody = normalized.slice(1).trim();
  if (formulaBody.length === 0) {
    return {
      success: false,
      issue: {
        code: "formula_empty",
        message: "Formula cannot be empty.",
      },
    };
  }

  const tokenResult = tokenizeFormulaBody(formulaBody);
  if (!Array.isArray(tokenResult)) {
    return {
      success: false,
      issue: tokenResult,
    };
  }

  const tokens = tokenResult;
  const allowedFunctions = new Set(options.allowedFunctions.map((entry) => entry.toUpperCase()));
  const referencedCells = new Set<string>();
  const referencedRanges = new Set<string>();
  const functionsUsed = new Set<string>();
  let position = 0;

  const peek = () => tokens[position] ?? null;
  const consume = () => {
    const token = tokens[position] ?? null;
    if (token) {
      position += 1;
    }
    return token;
  };

  const fail = (issue: PricingWorksheetFormulaParserIssue): ParseFailure => ({
    success: false,
    issue,
  });

  const validateBounds = (ref: string): ParseFailure | null => {
    const parsed = parseCellRef(ref);
    if (!parsed) {
      return fail({
        code: "formula_invalid_reference",
        message: `Formula reference "${ref}" is invalid.`,
        token: ref,
      });
    }

    if (
      (typeof options.maxRowCount === "number" && parsed.rowNumber > options.maxRowCount) ||
      (typeof options.maxColumnCount === "number" && parsed.columnIndex >= options.maxColumnCount)
    ) {
      return fail({
        code: "formula_ref_out_of_bounds",
        message: `Formula reference "${ref}" is outside the worksheet bounds.`,
        token: ref,
      });
    }

    referencedCells.add(ref);
    return null;
  };

  const validateRange = (startRef: string, endRef: string): ParseFailure | null => {
    const start = parseCellRef(startRef);
    const end = parseCellRef(endRef);
    if (!start || !end) {
      return fail({
        code: "formula_invalid_range",
        message: `Formula range "${startRef}:${endRef}" is invalid.`,
        token: `${startRef}:${endRef}`,
      });
    }
    const startBounds = validateBounds(startRef);
    if (startBounds) {
      return startBounds;
    }
    const endBounds = validateBounds(endRef);
    if (endBounds) {
      return endBounds;
    }
    referencedRanges.add(`${startRef}:${endRef}`);
    return null;
  };

  const validateFunctionArity = (name: string, count: number): ParseFailure | null => {
    switch (name) {
      case "SUM":
      case "MIN":
      case "MAX":
      case "AND":
      case "OR":
        if (count < 1) {
          return fail({
            code: "formula_unexpected_token",
            message: `Function "${name}" requires at least one argument.`,
            token: name,
          });
        }
        return null;
      case "ROUND":
      case "ROUNDUP":
      case "ROUNDDOWN":
      case "CEILING":
        if (count !== 2) {
          return fail({
            code: "formula_unexpected_token",
            message: `Function "${name}" requires exactly two arguments.`,
            token: name,
          });
        }
        return null;
      case "IF":
        if (count !== 3) {
          return fail({
            code: "formula_unexpected_token",
            message: 'Function "IF" requires exactly three arguments.',
            token: name,
          });
        }
        return null;
      case "IFERROR":
        if (count !== 2) {
          return fail({
            code: "formula_unexpected_token",
            message: 'Function "IFERROR" requires exactly two arguments.',
            token: name,
          });
        }
        return null;
      case "IFS":
        if (count < 2 || count % 2 !== 0) {
          return fail({
            code: "formula_unexpected_token",
            message: 'Function "IFS" requires condition/result pairs.',
            token: name,
          });
        }
        return null;
      case "QTY":
        if (count !== 4) {
          return fail({
            code: "formula_unexpected_token",
            message: 'Function "QTY" requires exactly four arguments.',
            token: name,
          });
        }
        return null;
      case "UNIT":
        if (count !== 3) {
          return fail({
            code: "formula_unexpected_token",
            message: 'Function "UNIT" requires exactly three arguments.',
            token: name,
          });
        }
        return null;
      case "WASTE":
      case "PACKS":
        if (count !== 2) {
          return fail({
            code: "formula_unexpected_token",
            message: `Function "${name}" requires exactly two arguments.`,
            token: name,
          });
        }
        return null;
      default:
        return null;
    }
  };

  const parseExpression = (): ParseFailure | null => parseComparison();

  const parseComparison = (): ParseFailure | null => {
    const left = parseAdditive();
    if (left) {
      return left;
    }

    while (peek()?.type === "operator" && ["=", "<", ">", "<=", ">=", "<>"].includes(peek()!.value)) {
      consume();
      const right = parseAdditive();
      if (right) {
        return right;
      }
    }

    return null;
  };

  const parseAdditive = (): ParseFailure | null => {
    const left = parseMultiplicative();
    if (left) {
      return left;
    }

    while (peek()?.type === "operator" && (peek()!.value === "+" || peek()!.value === "-")) {
      consume();
      const right = parseMultiplicative();
      if (right) {
        return right;
      }
    }

    return null;
  };

  const parseMultiplicative = (): ParseFailure | null => {
    const left = parsePower();
    if (left) {
      return left;
    }

    while (peek()?.type === "operator" && (peek()!.value === "*" || peek()!.value === "/")) {
      consume();
      const right = parsePower();
      if (right) {
        return right;
      }
    }

    return null;
  };

  const parsePower = (): ParseFailure | null => {
    const left = parseUnary();
    if (left) {
      return left;
    }

    while (peek()?.type === "operator" && peek()!.value === "^") {
      consume();
      const right = parseUnary();
      if (right) {
        return right;
      }
    }

    return null;
  };

  const parseUnary = (): ParseFailure | null => {
    if (peek()?.type === "operator" && (peek()!.value === "+" || peek()!.value === "-")) {
      consume();
      return parseUnary();
    }

    return parsePostfix();
  };

  const parsePostfix = (): ParseFailure | null => {
    const primary = parsePrimary();
    if (primary) {
      return primary;
    }

    while (peek()?.type === "operator" && peek()!.value === "%") {
      consume();
    }

    return null;
  };

  const parseFunctionCall = (identifier: string): ParseFailure | null => {
    if (!allowedFunctions.has(identifier)) {
      return fail({
        code: "formula_unsupported_function",
        message: `Formula function "${identifier}" is not supported for AI-generated edits.`,
        token: identifier,
      });
    }

    functionsUsed.add(identifier);
    const open = consume();
    if (!open || open.type !== "lparen") {
      return fail({
        code: "formula_unexpected_token",
        message: `Function "${identifier}" must be followed by parentheses.`,
        token: identifier,
      });
    }

    let argumentCount = 0;
    if (peek()?.type === "rparen") {
      consume();
      const arityError = validateFunctionArity(identifier, argumentCount);
      return arityError;
    }

    while (true) {
      const argument = parseExpression();
      if (argument) {
        return argument;
      }
      argumentCount += 1;

      const next = peek();
      if (!next) {
        return fail({
          code: "formula_unexpected_end",
          message: `Function "${identifier}" is missing a closing parenthesis.`,
          token: identifier,
        });
      }
      if (next.type === "comma") {
        consume();
        if (peek()?.type === "rparen") {
          return fail({
            code: "formula_unexpected_token",
            message: `Function "${identifier}" has an empty argument.`,
            token: identifier,
          });
        }
        continue;
      }
      if (next.type === "rparen") {
        consume();
        break;
      }
      return fail({
        code: "formula_unexpected_token",
        message: `Function "${identifier}" has invalid argument syntax.`,
        token: next.value,
      });
    }

    return validateFunctionArity(identifier, argumentCount);
  };

  const parsePrimary = (): ParseFailure | null => {
    const token = peek();
    if (!token) {
      return fail({
        code: "formula_unexpected_end",
        message: "Formula ended before the expression was complete.",
      });
    }

    if (token.type === "number" || token.type === "string") {
      consume();
      return null;
    }

    if (token.type === "cell") {
      consume();
      if (peek()?.type === "colon") {
        consume();
        const next = consume();
        if (!next || next.type !== "cell") {
          return fail({
            code: "formula_invalid_range",
            message: `Formula range "${token.value}:" is incomplete.`,
            token: token.value,
          });
        }
        return validateRange(token.value, next.value);
      }
      return validateBounds(token.value);
    }

    if (token.type === "identifier") {
      const identifier = token.value.toUpperCase();
      consume();
      if (peek()?.type === "lparen") {
        return parseFunctionCall(identifier);
      }
      if (identifier === "TRUE" || identifier === "FALSE") {
        return null;
      }
      return fail({
        code: "formula_unknown_identifier",
        message: `Formula identifier "${identifier}" is not supported.`,
        token: identifier,
      });
    }

    if (token.type === "lparen") {
      consume();
      const nested = parseExpression();
      if (nested) {
        return nested;
      }
      const close = consume();
      if (!close || close.type !== "rparen") {
        return fail({
          code: "formula_unexpected_end",
          message: "Formula has unbalanced parentheses.",
          token: "(",
        });
      }
      return null;
    }

    return fail({
      code: "formula_unexpected_token",
      message: `Formula token "${token.value}" is not valid in this position.`,
      token: token.value,
    });
  };

  const parsed = parseExpression();
  if (parsed) {
    return parsed;
  }

  if (position < tokens.length) {
    const token = tokens[position];
    return fail({
      code: "formula_unexpected_token",
      message: `Formula contains unexpected trailing token "${token.value}".`,
      token: token.value,
    });
  }

  return {
    success: true,
    normalizedFormula: `=${formulaBody}`,
    referencedCells: Array.from(referencedCells),
    referencedRanges: Array.from(referencedRanges),
    functionsUsed: Array.from(functionsUsed),
  };
}
