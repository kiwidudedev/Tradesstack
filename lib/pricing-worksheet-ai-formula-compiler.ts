import type { PricingWorksheetStructureSnapshot } from "@/lib/pricing-worksheet-ai-structure-snapshot";
import { parsePricingWorksheetFormula } from "@/lib/pricing-worksheet-formula-parser";

export type PricingWorksheetAiFormulaCompileInput = {
  expression: string;
  targetCell: string;
  currentRowNumber: number | null;
  currentSectionName?: string | null;
  snapshot: PricingWorksheetStructureSnapshot;
};

export type PricingWorksheetAiFormulaCompileResult = {
  success: boolean;
  formula: string | null;
  warnings: string[];
  unresolvedReferences: string[];
  blockedReason: string | null;
};

const RANGE_SECTION_PATTERN = /section\("([^"]+)"\)\.rows\.(total|quantity|materialRate|labourHours|labourRate|margin)/gi;
const SECTION_TOTAL_PATTERN = /section\("([^"]+)"\)\.total\b/gi;
const ROW_FIELD_PATTERN = /row\("([^"]+)"\)\.(quantity|materialRate|labourHours|labourRate|margin|total|notes)\b/gi;
const ROW_DEFAULT_PATTERN = /row\("([^"]+)"\)\b/gi;
const CURRENT_ROW_PATTERN = /currentRow\.(quantity|materialRate|labourHours|labourRate|margin|total|notes)\b/gi;
const CURLY_TOKEN_PATTERN = /\{[^}]+\}/g;
const FAKE_REF_PATTERN = /\b\d+_[A-Za-z][A-Za-z0-9_]*\b/g;
const IDENTIFIER_FUNCTION_PATTERN = /([A-Z_]+)\s*\(/gi;

type RowFieldKey = keyof PricingWorksheetStructureSnapshot["formulaTargets"]["rows"][number]["cells"];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseCellRef(ref: string): { columnIndex: number; rowNumber: number } | null {
  const match = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    return null;
  }

  let columnIndex = 0;
  for (const char of match[1]) {
    columnIndex = columnIndex * 26 + (char.charCodeAt(0) - 64);
  }

  return {
    columnIndex: columnIndex - 1,
    rowNumber: Number(match[2]),
  };
}

function getColumnForField(field: string): string {
  switch (field) {
    case "quantity":
      return "E";
    case "materialRate":
      return "F";
    case "labourHours":
      return "G";
    case "labourRate":
      return "H";
    case "margin":
      return "I";
    case "total":
      return "J";
    case "notes":
      return "K";
    default:
      return "J";
  }
}

function makeRef(column: string, rowNumber: number) {
  return `${column}${rowNumber}`;
}

function findRowByLabel(snapshot: PricingWorksheetStructureSnapshot, label: string, sectionName?: string | null) {
  const normalizedLabel = normalizeText(label);
  const normalizedSection = normalizeText(sectionName);
  return (
    snapshot.formulaTargets.rows.find(
      (row) =>
        normalizeText(row.label) === normalizedLabel &&
        (!normalizedSection || normalizeText(row.sectionName) === normalizedSection),
    ) ??
    snapshot.formulaTargets.rows.find((row) => normalizeText(row.label) === normalizedLabel) ??
    null
  );
}

function resolveNamedRef(snapshot: PricingWorksheetStructureSnapshot, identifier: string): string | null {
  const normalized = normalizeText(identifier).replace(/[^a-z0-9]+/g, "");
  if (!normalized) {
    return null;
  }

  return (
    snapshot.formulaTargets.namedRefs[normalized] ??
    snapshot.formulaTargets.sectionTotals[normalized] ??
    null
  );
}

function looksLikeSpreadsheetFormula(expression: string) {
  return expression.trim().startsWith("=") && !expression.includes("row(") && !expression.includes("section(") && !expression.includes("currentRow.");
}

export function compileAiWorksheetFormula(
  input: PricingWorksheetAiFormulaCompileInput,
): PricingWorksheetAiFormulaCompileResult {
  const warnings: string[] = [];
  const unresolvedReferences: string[] = [];
  const rawExpression = input.expression.trim();

  if (!rawExpression) {
    return {
      success: false,
      formula: null,
      warnings,
      unresolvedReferences,
      blockedReason: "formula_expression_empty",
    };
  }

  let expression = rawExpression.startsWith("=") ? rawExpression : `=${rawExpression}`;
  const currentRow = input.currentRowNumber
    ? input.snapshot.formulaTargets.rows.find((row) => row.rowNumber === input.currentRowNumber) ?? null
    : null;

  expression = expression.replace(CURRENT_ROW_PATTERN, (_, field: string) => {
    const ref = currentRow?.cells[field as RowFieldKey] ?? null;
    if (!ref) {
      unresolvedReferences.push(`currentRow.${field}`);
      return `UNRESOLVED_CURRENTROW_${field.toUpperCase()}`;
    }
    return ref;
  });

  expression = expression.replace(ROW_FIELD_PATTERN, (_, label: string, field: string) => {
    const row = findRowByLabel(input.snapshot, label, input.currentSectionName);
    const ref = row?.cells[field as RowFieldKey] ?? null;
    if (!ref) {
      unresolvedReferences.push(`row("${label}").${field}`);
      return `UNRESOLVED_ROWFIELD_${field.toUpperCase()}`;
    }
    return ref;
  });

  expression = expression.replace(ROW_DEFAULT_PATTERN, (_, label: string) => {
    const row = findRowByLabel(input.snapshot, label, input.currentSectionName);
    const ref = row?.primaryRef ?? row?.cells.quantity ?? null;
    if (!ref) {
      unresolvedReferences.push(`row("${label}")`);
      return "UNRESOLVED_ROW";
    }
    return ref;
  });

  expression = expression.replace(RANGE_SECTION_PATTERN, (_, sectionName: string, field: string) => {
    const normalized = normalizeText(sectionName).replace(/[^a-z0-9]+/g, "");
    if (field === "total") {
      const range = input.snapshot.formulaTargets.sectionTotalRanges[normalized] ?? null;
      if (!range) {
        unresolvedReferences.push(`section("${sectionName}").rows.total`);
        return "UNRESOLVED_SECTION_RANGE";
      }
      return range;
    }

    const section = input.snapshot.sections.find((entry) => normalizeText(entry.title) === normalizeText(sectionName));
    if (!section) {
      unresolvedReferences.push(`section("${sectionName}").rows.${field}`);
      return "UNRESOLVED_SECTION_RANGE";
    }

    const column = getColumnForField(field);
    const startRow = Math.min(section.startRow + 1, section.endRow);
    if (startRow > section.endRow) {
      unresolvedReferences.push(`section("${sectionName}").rows.${field}`);
      return "UNRESOLVED_SECTION_RANGE";
    }

    return `${column}${startRow}:${column}${section.endRow}`;
  });

  expression = expression.replace(SECTION_TOTAL_PATTERN, (_, sectionName: string) => {
    const normalized = normalizeText(sectionName).replace(/[^a-z0-9]+/g, "");
    const ref = input.snapshot.formulaTargets.sectionTotals[normalized] ?? null;
    if (!ref) {
      unresolvedReferences.push(`section("${sectionName}").total`);
      return "UNRESOLVED_SECTION_TOTAL";
    }
    return ref;
  });

  expression = expression.replace(/\b([A-Z][A-Za-z0-9_]*)\b/g, (token) => {
    if (/^(IF|IFERROR|IFS|SUM|MIN|MAX|ROUND|ROUNDUP|ROUNDDOWN|AND|OR|CEILING|QTY|UNIT|WASTE|PACKS|TRUE|FALSE)$/i.test(token)) {
      return token;
    }
    if (/^[A-Z]+\d+$/i.test(token)) {
      return token;
    }
    if (/^[A-Z]+:[A-Z]+$/i.test(token)) {
      return token;
    }
    const resolved = resolveNamedRef(input.snapshot, token);
    return resolved ?? token;
  });

  const unresolvedCurlyTokens = expression.match(CURLY_TOKEN_PATTERN) ?? [];
  const fakeRefs = expression.match(FAKE_REF_PATTERN) ?? [];
  const unresolvedTokens = expression.match(/UNRESOLVED_[A-Z_]+/g) ?? [];
  unresolvedReferences.push(...unresolvedCurlyTokens, ...fakeRefs, ...unresolvedTokens);

  if (unresolvedReferences.length > 0) {
    return {
      success: false,
      formula: null,
      warnings,
      unresolvedReferences: Array.from(new Set(unresolvedReferences)),
      blockedReason: "formula_unresolved_reference",
    };
  }

  const parseResult = parsePricingWorksheetFormula(expression, {
    allowedFunctions: input.snapshot.formulaCompatibility.allowedFunctions,
    maxRowCount: input.snapshot.bounds.rowCount,
    maxColumnCount: input.snapshot.bounds.columnCount,
  });

  if (!parseResult.success) {
    if (parseResult.issue.code === "formula_unsupported_function" && parseResult.issue.token) {
      return {
        success: false,
        formula: null,
        warnings,
        unresolvedReferences,
        blockedReason: `formula_unsupported_function:${parseResult.issue.token}`,
      };
    }

    if (parseResult.issue.code === "formula_ref_out_of_bounds" && parseResult.issue.token) {
      return {
        success: false,
        formula: null,
        warnings,
        unresolvedReferences: [parseResult.issue.token],
        blockedReason: "formula_ref_out_of_bounds",
      };
    }

    return {
      success: false,
      formula: null,
      warnings,
      unresolvedReferences,
      blockedReason: "formula_invalid_structure",
    };
  }

  const targetRef = input.targetCell.toUpperCase();
  if (expression.toUpperCase().includes(targetRef)) {
    return {
      success: false,
      formula: null,
      warnings,
      unresolvedReferences: [targetRef],
      blockedReason: "formula_self_reference",
    };
  }

  if (!looksLikeSpreadsheetFormula(expression) && unresolvedReferences.length === 0) {
    warnings.push("compiled_symbolic_formula");
  }

  return {
    success: true,
    formula: parseResult.normalizedFormula,
    warnings,
    unresolvedReferences: [],
    blockedReason: null,
  };
}
