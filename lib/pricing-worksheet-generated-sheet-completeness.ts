import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import type { PricingWorksheetAiValidationIssue } from "@/lib/pricing-worksheet-edit-plan";

type GeneratedPricingColumnRole =
  | "quantity"
  | "currency_input"
  | "labour_output"
  | "material_output"
  | "total_output";

const HEADER_SCAN_ROW_LIMIT = 6;
const PLACEHOLDER_PATTERN = /^(?:-|n\/a|na|tbc)$/i;
const DECORATED_NUMERIC_PATTERN =
  /^\s*[$€£¥]?\s*-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*[$€£¥])?\s*$/;

function getWorksheetCell(worksheet: WorksheetData, rowIndex: number, columnIndex: number) {
  const row = worksheet.rows[rowIndex];
  const column = worksheet.columns[columnIndex];
  if (!row || !column) {
    return null;
  }

  return worksheet.cells[buildWorksheetCellKey(column.id, row.id)] ?? null;
}

function buildCellRef(worksheet: WorksheetData, rowIndex: number, columnIndex: number) {
  const row = worksheet.rows[rowIndex];
  const column = worksheet.columns[columnIndex];
  if (!row || !column) {
    return null;
  }

  return `${column.id}${row.id}`;
}

function normalizeHeaderText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9$%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCellTextValue(worksheet: WorksheetData, rowIndex: number, columnIndex: number) {
  const cell = getWorksheetCell(worksheet, rowIndex, columnIndex);
  if (!cell) {
    return "";
  }

  if (typeof cell.value === "string") {
    return cell.value.trim();
  }

  if (typeof cell.value === "number") {
    return String(cell.value);
  }

  return typeof cell.displayValue === "string" ? cell.displayValue.trim() : "";
}

function detectGeneratedPricingColumnRole(headerText: string): GeneratedPricingColumnRole | null {
  if (/\b(qty|quantity)\b/.test(headerText)) {
    return "quantity";
  }

  if (
    /\b(material rate|mat rate|mat rate \$|mat \$|labour rate|labor rate|rate|unit rate|price)\b/.test(headerText) ||
    /\brate \$\b/.test(headerText)
  ) {
    return "currency_input";
  }

  if (/^(labour|labor)$/.test(headerText) || /\b(labour total|labor total|labour cost|labor cost)\b/.test(headerText)) {
    return "labour_output";
  }

  if (/^material$/.test(headerText) || /\bmaterial total\b/.test(headerText)) {
    return "material_output";
  }

  if (/^total(?: \$)?$/.test(headerText) || /\b(grand total|sell price|subtotal|net cost|total \$)\b/.test(headerText)) {
    return "total_output";
  }

  return null;
}

function collectHeaderRolesForRow(worksheet: WorksheetData, rowIndex: number) {
  const rolesByColumn = new Map<number, GeneratedPricingColumnRole>();

  for (let columnIndex = 0; columnIndex < worksheet.columns.length; columnIndex += 1) {
    const normalizedHeader = normalizeHeaderText(getCellTextValue(worksheet, rowIndex, columnIndex));
    if (!normalizedHeader) {
      continue;
    }

    const role = detectGeneratedPricingColumnRole(normalizedHeader);
    if (!role) {
      continue;
    }

    rolesByColumn.set(columnIndex, role);
  }

  return rolesByColumn;
}

function rowLooksLikePricingHeader(worksheet: WorksheetData, rowIndex: number, rolesByColumn: Map<number, GeneratedPricingColumnRole>) {
  if (rolesByColumn.size < 2) {
    return false;
  }

  const normalizedValues = Array.from({ length: worksheet.columns.length }, (_, columnIndex) =>
    normalizeHeaderText(getCellTextValue(worksheet, rowIndex, columnIndex)),
  );
  const hasItemDescriptor =
    normalizedValues.includes("item") || normalizedValues.includes("description") || normalizedValues.includes("unit");

  if (hasItemDescriptor) {
    return true;
  }

  const outputRoleCount = Array.from(rolesByColumn.values()).filter((role) =>
    role === "labour_output" || role === "material_output" || role === "total_output",
  ).length;

  return rolesByColumn.size >= 3 || (rolesByColumn.size >= 2 && outputRoleCount >= 1);
}

function isMeaningfullyPopulatedCell(worksheet: WorksheetData, rowIndex: number, columnIndex: number) {
  const cell = getWorksheetCell(worksheet, rowIndex, columnIndex);
  if (!cell) {
    return false;
  }

  if (typeof cell.formula === "string" && cell.formula.trim().length > 0) {
    return true;
  }

  if (typeof cell.value === "number") {
    return true;
  }

  return typeof cell.value === "string" && cell.value.trim().length > 0;
}

function rowHasPricingOutputExpectation(
  worksheet: WorksheetData,
  rowIndex: number,
  rolesByColumn: Map<number, GeneratedPricingColumnRole>,
) {
  let hasQuantitySignal = false;
  let hasNonQuantityPricingSignal = false;

  for (const [columnIndex, role] of rolesByColumn.entries()) {
    if (!isMeaningfullyPopulatedCell(worksheet, rowIndex, columnIndex)) {
      continue;
    }

    if (role === "quantity") {
      hasQuantitySignal = true;
      continue;
    }

    hasNonQuantityPricingSignal = true;
  }

  if (hasQuantitySignal && hasNonQuantityPricingSignal) {
    return true;
  }

  for (const [columnIndex, role] of rolesByColumn.entries()) {
    if (role !== "labour_output" && role !== "material_output" && role !== "total_output") {
      continue;
    }

    if (isMeaningfullyPopulatedCell(worksheet, rowIndex, columnIndex)) {
      return true;
    }
  }

  return false;
}

export function validateGeneratedPricingWorksheetCompleteness(
  worksheet: WorksheetData,
): PricingWorksheetAiValidationIssue[] {
  const rolesByColumn = new Map<number, GeneratedPricingColumnRole>();
  let maxHeaderRowIndex = -1;

  for (let rowIndex = 0; rowIndex < Math.min(worksheet.rows.length, HEADER_SCAN_ROW_LIMIT); rowIndex += 1) {
    const rowRoles = collectHeaderRolesForRow(worksheet, rowIndex);
    if (!rowLooksLikePricingHeader(worksheet, rowIndex, rowRoles)) {
      continue;
    }

    for (const [columnIndex, role] of rowRoles.entries()) {
      if (rolesByColumn.has(columnIndex)) {
        continue;
      }

      rolesByColumn.set(columnIndex, role);
    }

    maxHeaderRowIndex = Math.max(maxHeaderRowIndex, rowIndex);
  }

  const outputColumnIndexes = Array.from(rolesByColumn.entries())
    .filter(([, role]) => role === "labour_output" || role === "material_output" || role === "total_output")
    .map(([columnIndex]) => columnIndex);

  if (outputColumnIndexes.length === 0) {
    return [];
  }

  const issues: PricingWorksheetAiValidationIssue[] = [];
  for (let rowIndex = maxHeaderRowIndex + 1; rowIndex < worksheet.rows.length; rowIndex += 1) {
    const itemSignal =
      getCellTextValue(worksheet, rowIndex, 1).length > 0 ||
      getCellTextValue(worksheet, rowIndex, 2).length > 0 ||
      getCellTextValue(worksheet, rowIndex, 3).length > 0;
    const pricingOutputExpectation = rowHasPricingOutputExpectation(worksheet, rowIndex, rolesByColumn);
    const rowLooksLikeLineItem = itemSignal && pricingOutputExpectation;
    if (!rowLooksLikeLineItem) {
      continue;
    }

    for (const [columnIndex, role] of rolesByColumn.entries()) {
      const ref = buildCellRef(worksheet, rowIndex, columnIndex);
      if (!ref) {
        continue;
      }

      const cell = getWorksheetCell(worksheet, rowIndex, columnIndex);
      const rawStringValue = typeof cell?.value === "string" ? cell.value.trim() : null;

      if (role === "quantity") {
        if (rawStringValue && PLACEHOLDER_PATTERN.test(rawStringValue)) {
          issues.push({
            code: "generated_pricing_placeholder_input",
            message: `Generated pricing sheet ${ref} used placeholder text like "${rawStringValue}". Leave the input blank or use a real numeric value.`,
            severity: "error",
            cellRef: ref,
          });
        }
        continue;
      }

      if (role === "currency_input") {
        if (!cell || cell.type === "empty" || cell.value === null) {
          continue;
        }

        if (rawStringValue && (PLACEHOLDER_PATTERN.test(rawStringValue) || DECORATED_NUMERIC_PATTERN.test(rawStringValue))) {
          issues.push({
            code: "generated_pricing_decorated_rate_literal",
            message: `Generated pricing rate ${ref} must be stored as a raw number with currency formatting, not "${rawStringValue}".`,
            severity: "error",
            cellRef: ref,
          });
          continue;
        }

        const numberFormat = cell.metadata?.format && typeof cell.metadata.format === "object"
          ? (cell.metadata.format as Record<string, unknown>).number
          : null;
        const hasCurrencyFormatting =
          numberFormat && typeof numberFormat === "object" && !Array.isArray(numberFormat)
            ? (numberFormat as Record<string, unknown>).kind === "currency"
            : false;

        if (cell.type !== "number" || typeof cell.value !== "number") {
          issues.push({
            code: "generated_pricing_rate_requires_numeric_value",
            message: `Generated pricing rate ${ref} must be a numeric cell, not a persisted text literal.`,
            severity: "error",
            cellRef: ref,
          });
          continue;
        }

        if (!hasCurrencyFormatting) {
          issues.push({
            code: "generated_pricing_rate_missing_currency_format",
            message: `Generated pricing rate ${ref} must include currency formatting metadata.`,
            severity: "error",
            cellRef: ref,
          });
        }
        continue;
      }

      if (role === "labour_output" || role === "material_output" || role === "total_output") {
        const hasFormula = typeof cell?.formula === "string" && cell.formula.trim().length > 0;
        if (hasFormula) {
          continue;
        }

        const displayedValue = rawStringValue ?? (typeof cell?.displayValue === "string" ? cell.displayValue.trim() : "");
        issues.push({
          code: "generated_pricing_output_requires_formula",
          message:
            displayedValue.length > 0
              ? `Generated pricing output ${ref} must be a formula cell, not the literal value "${displayedValue}".`
              : `Generated pricing output ${ref} is missing its worksheet formula.`,
          severity: "error",
          cellRef: ref,
        });
      }
    }
  }

  return issues;
}
