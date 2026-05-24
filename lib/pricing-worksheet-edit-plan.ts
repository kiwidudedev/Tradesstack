import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  findWorksheetFormulaErrors,
  recalculateWorksheetFormulas,
} from "@/lib/opportunity-pricing-worksheet-formulas";
import { shiftFormulaForFill } from "@/lib/opportunity-pricing-worksheet-formula-shift";
import { insertWorksheetRow } from "@/lib/opportunity-pricing-worksheet-structure";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";

export type PricingWorksheetAiAssistantMode =
  | "answer_only"
  | "propose_edit"
  | "answer_and_propose_edit";

export type PricingWorksheetAiConfidence = "high" | "medium" | "low";
export type PricingWorksheetAiFindingSeverity = "info" | "low" | "medium" | "high";
export type PricingWorksheetAiFindingStatus =
  | "active"
  | "revised"
  | "downgraded"
  | "invalidated"
  | "confirmed"
  | "superseded";
export type PricingWorksheetAiFindingCategory =
  | "missing_scope"
  | "formula_risk"
  | "quantity_risk"
  | "labour_risk"
  | "wastage_risk"
  | "specification_uncertainty"
  | "quote_readiness"
  | "takeoff_readiness"
  | "general_review";

export type PricingWorksheetAiEvidenceSourceType =
  | "web"
  | "manufacturer"
  | "standard_or_code"
  | "industry_guidance"
  | "supplier"
  | "project_document"
  | "organization_memory"
  | "unknown";

export type PricingWorksheetAiEvidenceSource = {
  id: string;
  title: string;
  url?: string;
  sourceType: PricingWorksheetAiEvidenceSourceType;
  retrievedAt?: string;
  jurisdiction?: "AUS_NZ" | "AU" | "NZ" | "unknown";
  confidence: PricingWorksheetAiConfidence;
  supportedClaims?: string[];
};

export type PricingWorksheetAiOperationType =
  | "update_cell"
  | "update_cells"
  | "insert_row"
  | "copy_row_variant"
  | "fix_formula"
  | "explain_formula"
  | "insert_subtotal";

export type PricingWorksheetAiCellValueEntry = {
  ref?: string | null;
  column?: string | null;
  value?: string | number | boolean | null;
};

export type PricingWorksheetAiFormulaEntry = {
  ref?: string | null;
  column?: string | null;
  formula: string;
};

export type PricingWorksheetAiOperation = {
  type: PricingWorksheetAiOperationType;
  target?: {
    cell?: string | null;
    row?: number | null;
    sourceRow?: number | null;
    insertAfterRow?: number | null;
    insertBeforeRow?: number | null;
    startRow?: number | null;
    endRow?: number | null;
    sectionName?: string | null;
    totalColumn?: string | null;
    labelColumn?: string | null;
  } | null;
  values?: {
    cells?: PricingWorksheetAiCellValueEntry[] | null;
  } | null;
  formulas?: {
    cells?: PricingWorksheetAiFormulaEntry[] | null;
  } | null;
  rationale?: string | null;
};

export type PricingWorksheetAiReviewFinding = {
  id: string;
  category: PricingWorksheetAiFindingCategory;
  severity: PricingWorksheetAiFindingSeverity;
  confidence: PricingWorksheetAiConfidence;
  findingStatus?: PricingWorksheetAiFindingStatus;
  title: string;
  finding: string;
  worksheetEvidence?: string[];
  assumption?: string;
  uncertainty?: string;
  needsConfirmation?: string;
  suggestedAction?: string;
  relatedCells?: string[];
  relatedRows?: number[];
  suggestedEditGroupId?: string | null;
  canSuggestWorksheetEdit?: boolean;
  evidenceSourceIds?: string[];
  revisionReason?: string;
  revisedFromFindingId?: string | null;
  supersededByFindingId?: string | null;
};

export type PricingWorksheetAiReviewSummary = {
  presentItems: string[];
  possibleMissingItems: string[];
  keyRisks: string[];
  assumptions: string[];
  confirmationsNeeded: string[];
};

export type PricingWorksheetAiSuggestedEditGroup = {
  id: string;
  title: string;
  purpose: string;
  confidence: PricingWorksheetAiConfidence;
  assumptions: string[];
  warnings: string[];
  relatedFindingIds: string[];
  operations: PricingWorksheetAiOperation[];
};

export type PricingWorksheetAiAssistantResponse = {
  mode: PricingWorksheetAiAssistantMode;
  proposalName: string;
  answer: string;
  summary: string;
  confidence: PricingWorksheetAiConfidence;
  operations: PricingWorksheetAiOperation[];
  assumptions: string[];
  warnings: string[];
  reviewFindings?: PricingWorksheetAiReviewFinding[];
  reviewSummary?: PricingWorksheetAiReviewSummary | null;
  suggestedEditGroups?: PricingWorksheetAiSuggestedEditGroup[];
  evidenceSources?: PricingWorksheetAiEvidenceSource[];
};

export type PricingWorksheetAiValidationIssue = {
  code: string;
  message: string;
  severity: "warning" | "error";
};

export type PricingWorksheetAiDiffSummary = {
  changedCells: string[];
  formulaCells: string[];
  insertedRows: number[];
  affectedRows: number[];
};

export type PricingWorksheetAiSimulationResult = {
  worksheet: WorksheetData;
  diffSummary: PricingWorksheetAiDiffSummary;
  validationIssues: PricingWorksheetAiValidationIssue[];
};

const ALLOWED_FUNCTIONS = new Set(["SUM", "ROUND", "ROUNDUP", "ROUNDDOWN", "IF", "IFERROR", "OR", "CEILING"]);
const MAX_MUTATING_OPERATIONS = 12;
const MAX_CHANGED_CELLS = 60;
const MAX_BOUNDED_GENERATION_OPERATIONS = 32;
const MAX_BOUNDED_GENERATION_CHANGED_CELLS = 240;
const MAX_BOUNDED_GENERATION_ROW_SPAN = 48;
const MAX_REVIEW_FINDINGS = 12;
const MAX_SUGGESTED_EDIT_GROUPS = 8;
const MAX_EVIDENCE_SOURCES = 16;
const MAX_FINDING_TEXT_LENGTH = 320;
const MAX_SHORT_TEXT_LENGTH = 120;
const MAX_EVIDENCE_ITEMS = 6;
const MAX_RELATED_ROWS = 8;
const MAX_RELATED_CELLS = 10;
const MAX_SUPPORTED_CLAIMS = 4;
const MAX_URL_LENGTH = 280;
const FINDING_CATEGORY_SET: Set<PricingWorksheetAiFindingCategory> = new Set([
  "missing_scope",
  "formula_risk",
  "quantity_risk",
  "labour_risk",
  "wastage_risk",
  "specification_uncertainty",
  "quote_readiness",
  "takeoff_readiness",
  "general_review",
]);
const EVIDENCE_SOURCE_TYPE_SET: Set<PricingWorksheetAiEvidenceSourceType> = new Set([
  "web",
  "manufacturer",
  "standard_or_code",
  "industry_guidance",
  "supplier",
  "project_document",
  "organization_memory",
  "unknown",
]);

function cloneWorksheet<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

function buildCellRef(columnIndex: number, rowNumber: number): string {
  return `${buildColumnLabel(columnIndex)}${rowNumber}`;
}

function parseCellRef(ref: string): { columnIndex: number; rowNumber: number } | null {
  const match = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
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

function ensureCell(worksheet: WorksheetData, rowIndex: number, columnIndex: number): WorksheetCell {
  const row = worksheet.rows[rowIndex];
  const column = worksheet.columns[columnIndex];
  const cellKey = buildWorksheetCellKey(column.id, row.id);
  if (!worksheet.cells[cellKey]) {
    worksheet.cells[cellKey] = {
      value: null,
      type: "empty",
      formula: null,
      computedValue: null,
      displayValue: "",
      metadata: {},
    };
  }

  return worksheet.cells[cellKey] as WorksheetCell;
}

function setCellLiteral(cell: WorksheetCell, value: string | number | boolean | null | undefined): void {
  const nextValue = typeof value === "boolean" ? String(value) : value ?? null;
  cell.formula = null;
  cell.value = nextValue;
  cell.computedValue = nextValue;
  cell.displayValue = nextValue === null ? "" : String(nextValue);
  cell.type =
    typeof nextValue === "number" ? "number" : nextValue === null ? "empty" : "text";
}

function setCellFormula(cell: WorksheetCell, formula: string): void {
  const normalized = formula.trim().startsWith("=") ? formula.trim() : `=${formula.trim()}`;
  cell.formula = normalized;
  cell.value = normalized;
  cell.computedValue = normalized;
  cell.displayValue = normalized;
  cell.type = "text";
}

function isCellPopulated(cell: WorksheetCell | undefined): boolean {
  if (!cell) {
    return false;
  }

  if (typeof cell.formula === "string" && cell.formula.trim().length > 0) {
    return true;
  }

  if (typeof cell.value === "number" || typeof cell.value === "boolean") {
    return true;
  }

  return typeof cell.value === "string" && cell.value.trim().length > 0;
}

function getValueEntries(operation: PricingWorksheetAiOperation): PricingWorksheetAiCellValueEntry[] {
  return Array.isArray(operation.values?.cells) ? operation.values?.cells ?? [] : [];
}

function getFormulaEntries(operation: PricingWorksheetAiOperation): PricingWorksheetAiFormulaEntry[] {
  return Array.isArray(operation.formulas?.cells) ? operation.formulas?.cells ?? [] : [];
}

function validateFormulaAllowlist(
  formula: string,
  worksheet: WorksheetData,
): PricingWorksheetAiValidationIssue[] {
  const issues: PricingWorksheetAiValidationIssue[] = [];
  const normalized = formula.trim();
  if (normalized.length === 0) {
    issues.push({
      code: "formula_empty",
      message: "Formula cannot be empty.",
      severity: "error",
    });
    return issues;
  }

  const disallowedCharacterMatch = normalized.match(/[^A-Z0-9+\-*/().,:<>=\s_\"$]/i);
  if (disallowedCharacterMatch) {
    issues.push({
      code: "formula_invalid_character",
      message: `Formula contains unsupported character "${disallowedCharacterMatch[0]}".`,
      severity: "error",
    });
  }

  const identifierMatches = normalized.match(/[A-Z_]+(?=\s*\()/gi) ?? [];
  for (const identifier of identifierMatches) {
    const upper = identifier.toUpperCase();
    if (!ALLOWED_FUNCTIONS.has(upper)) {
      issues.push({
        code: "formula_unsupported_function",
        message: `Formula function "${upper}" is not supported for AI-generated edits.`,
        severity: "error",
      });
    }
  }

  const cellRefMatches = normalized.match(/\$?[A-Z]+\$?[0-9]+/gi) ?? [];
  for (const ref of cellRefMatches) {
    const parsed = parseCellRef(ref.replace(/\$/g, ""));
    if (!parsed) {
      issues.push({
        code: "formula_invalid_reference",
        message: `Formula reference "${ref}" is invalid.`,
        severity: "error",
      });
      continue;
    }

    if (parsed.rowNumber > worksheet.rows.length || parsed.columnIndex >= worksheet.columns.length) {
      issues.push({
        code: "formula_ref_out_of_bounds",
        message: `Formula reference "${ref}" is outside the worksheet bounds.`,
        severity: "error",
      });
    }
  }

  return issues;
}

function collectMutatingCellCount(operations: PricingWorksheetAiOperation[]): number {
  let count = 0;
  for (const operation of operations) {
    count += getValueEntries(operation).length;
    count += getFormulaEntries(operation).length;
  }
  return count;
}

function countWorksheetPopulatedCells(worksheet: WorksheetData): number {
  let count = 0;
  for (const cell of Object.values(worksheet.cells)) {
    if (isCellPopulated(cell)) {
      count += 1;
    }
  }
  return count;
}

function countWorksheetFormulaCells(worksheet: WorksheetData): number {
  let count = 0;
  for (const cell of Object.values(worksheet.cells)) {
    if (typeof cell?.formula === "string" && cell.formula.trim().length > 0) {
      count += 1;
    }
  }
  return count;
}

function estimateOperationRows(operation: PricingWorksheetAiOperation): number[] {
  const rows = new Set<number>();
  const target = operation.target;

  const candidateRows = [
    target?.row,
    target?.sourceRow,
    target?.insertAfterRow,
    target?.insertBeforeRow,
    target?.startRow,
    target?.endRow,
  ];

  for (const row of candidateRows) {
    if (typeof row === "number" && Number.isInteger(row) && row >= 1) {
      rows.add(row);
    }
  }

  for (const entry of [...getValueEntries(operation), ...getFormulaEntries(operation)]) {
    if (entry.ref) {
      const parsed = parseCellRef(entry.ref);
      if (parsed?.rowNumber) {
        rows.add(parsed.rowNumber);
      }
    }
  }

  return Array.from(rows);
}

function isBoundedWorksheetGenerationCandidate(
  worksheet: WorksheetData,
  operations: PricingWorksheetAiOperation[],
): boolean {
  if (operations.length === 0) {
    return false;
  }

  const populatedCellCount = countWorksheetPopulatedCells(worksheet);
  const formulaCellCount = countWorksheetFormulaCells(worksheet);
  const isMinimalWorksheet = populatedCellCount <= 12 && formulaCellCount <= 4;
  if (!isMinimalWorksheet) {
    return false;
  }

  if (operations.length > MAX_BOUNDED_GENERATION_OPERATIONS) {
    return false;
  }

  const changedCellCount = collectMutatingCellCount(operations);
  if (changedCellCount > MAX_BOUNDED_GENERATION_CHANGED_CELLS) {
    return false;
  }

  const rowNumbers = operations.flatMap((operation) => estimateOperationRows(operation));
  const maxRow = rowNumbers.length > 0 ? Math.max(...rowNumbers) : worksheet.rows.length;
  const minRow = rowNumbers.length > 0 ? Math.min(...rowNumbers) : 1;
  const rowSpan = maxRow - minRow + 1;

  return rowSpan <= MAX_BOUNDED_GENERATION_ROW_SPAN;
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
}

function normalizeCappedText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function normalizeId(value: unknown, fallbackPrefix: string, index: number): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const sanitized = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized.slice(0, 48) : `${fallbackPrefix}-${index + 1}`;
}

function normalizeCellRefArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim().toUpperCase() : ""))
    .filter((entry) => Boolean(parseCellRef(entry)))
    .slice(0, MAX_RELATED_CELLS);
}

function normalizeRowNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "number" && Number.isInteger(entry) && entry > 0 ? entry : null))
    .filter((entry): entry is number => entry !== null)
    .slice(0, MAX_RELATED_ROWS);
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().slice(0, MAX_URL_LENGTH);
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

function normalizeEvidenceSourceType(value: unknown): PricingWorksheetAiEvidenceSourceType {
  return typeof value === "string" && EVIDENCE_SOURCE_TYPE_SET.has(value as PricingWorksheetAiEvidenceSourceType)
    ? (value as PricingWorksheetAiEvidenceSourceType)
    : "unknown";
}

function normalizeJurisdiction(value: unknown): PricingWorksheetAiEvidenceSource["jurisdiction"] {
  return value === "AUS_NZ" || value === "AU" || value === "NZ" || value === "unknown" ? value : "unknown";
}

function buildEvidenceSourceDedupKey(source: Pick<PricingWorksheetAiEvidenceSource, "title" | "url">) {
  const normalizedUrl = source.url?.trim().toLowerCase();
  if (normalizedUrl) {
    return normalizedUrl;
  }

  return source.title.trim().toLowerCase();
}

function normalizeEvidenceSource(value: unknown, index: number): PricingWorksheetAiEvidenceSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const title = normalizeCappedText(candidate.title, MAX_SHORT_TEXT_LENGTH);
  const url = normalizeUrl(candidate.url);
  if (!title && !url) {
    return null;
  }

  return {
    id: normalizeId(candidate.id, "source", index),
    title: title || (url ?? `Source ${index + 1}`),
    url,
    sourceType: normalizeEvidenceSourceType(candidate.sourceType),
    retrievedAt: normalizeCappedText(candidate.retrievedAt, 48) || undefined,
    jurisdiction: normalizeJurisdiction(candidate.jurisdiction),
    confidence:
      candidate.confidence === "high" || candidate.confidence === "low" || candidate.confidence === "medium"
        ? candidate.confidence
        : "medium",
    supportedClaims: normalizeTextArray(candidate.supportedClaims).slice(0, MAX_SUPPORTED_CLAIMS),
  };
}

function normalizeFindingCategory(value: unknown): PricingWorksheetAiFindingCategory {
  return typeof value === "string" && FINDING_CATEGORY_SET.has(value as PricingWorksheetAiFindingCategory)
    ? (value as PricingWorksheetAiFindingCategory)
    : "general_review";
}

function normalizeSeverity(value: unknown): PricingWorksheetAiFindingSeverity {
  return value === "info" || value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeFindingStatus(value: unknown): PricingWorksheetAiFindingStatus {
  return value === "active" ||
    value === "revised" ||
    value === "downgraded" ||
    value === "invalidated" ||
    value === "confirmed" ||
    value === "superseded"
    ? value
    : "active";
}

function isFormulaLikeValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().startsWith("=");
}

function buildFormulaEntryIdentity(entry: Pick<PricingWorksheetAiFormulaEntry, "ref" | "column">) {
  return `${entry.ref?.trim().toUpperCase() ?? ""}::${entry.column?.trim().toUpperCase() ?? ""}`;
}

function normalizeOperation(value: unknown): PricingWorksheetAiOperation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const type = typeof candidate.type === "string" ? candidate.type.trim() : "";
  if (!type) {
    return null;
  }

  const targetSource = candidate.target && typeof candidate.target === "object" ? (candidate.target as Record<string, unknown>) : null;
  const valuesSource = candidate.values && typeof candidate.values === "object" ? (candidate.values as Record<string, unknown>) : null;
  const formulasSource =
    candidate.formulas && typeof candidate.formulas === "object" ? (candidate.formulas as Record<string, unknown>) : null;
  const normalizedValueCells: PricingWorksheetAiCellValueEntry[] = Array.isArray(valuesSource?.cells)
    ? valuesSource.cells.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const candidateEntry = entry as Record<string, unknown>;
        return [
          {
            ref: typeof candidateEntry.ref === "string" ? candidateEntry.ref : null,
            column: typeof candidateEntry.column === "string" ? candidateEntry.column : null,
            value:
              typeof candidateEntry.value === "string" ||
              typeof candidateEntry.value === "number" ||
              typeof candidateEntry.value === "boolean" ||
              candidateEntry.value === null
                ? candidateEntry.value
                : null,
          },
        ];
      })
    : [];
  const promotedFormulaCells: PricingWorksheetAiFormulaEntry[] = normalizedValueCells.flatMap((entry) =>
    isFormulaLikeValue(entry.value)
      ? [
          {
            ref: entry.ref ?? null,
            column: entry.column ?? null,
            formula: entry.value.trim(),
          },
        ]
      : [],
  );
  const normalizedFormulaCellsFromSource: PricingWorksheetAiFormulaEntry[] = Array.isArray(formulasSource?.cells)
    ? formulasSource.cells.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const candidateEntry = entry as Record<string, unknown>;
        if (typeof candidateEntry.formula !== "string" || candidateEntry.formula.trim().length === 0) {
          return [];
        }

        return [
          {
            ref: typeof candidateEntry.ref === "string" ? candidateEntry.ref : null,
            column: typeof candidateEntry.column === "string" ? candidateEntry.column : null,
            formula: candidateEntry.formula.trim(),
          },
        ];
      })
    : [];
  const formulaCellIdentities = new Set(
    normalizedFormulaCellsFromSource.map((entry) => buildFormulaEntryIdentity(entry)),
  );
  const normalizedFormulaCells: PricingWorksheetAiFormulaEntry[] = [
    ...normalizedFormulaCellsFromSource,
    ...promotedFormulaCells.filter((entry) => {
      const identity = buildFormulaEntryIdentity(entry);
      if (formulaCellIdentities.has(identity)) {
        return false;
      }

      formulaCellIdentities.add(identity);
      return true;
    }),
  ];
  const normalizedLiteralValueCells = normalizedValueCells.filter((entry) => !isFormulaLikeValue(entry.value));

  return {
    type: type as PricingWorksheetAiOperationType,
    target: targetSource
      ? {
          cell: typeof targetSource.cell === "string" ? targetSource.cell : null,
          row: typeof targetSource.row === "number" ? targetSource.row : null,
          sourceRow: typeof targetSource.sourceRow === "number" ? targetSource.sourceRow : null,
          insertAfterRow:
            typeof targetSource.insertAfterRow === "number" ? targetSource.insertAfterRow : null,
          insertBeforeRow:
            typeof targetSource.insertBeforeRow === "number" ? targetSource.insertBeforeRow : null,
          startRow: typeof targetSource.startRow === "number" ? targetSource.startRow : null,
          endRow: typeof targetSource.endRow === "number" ? targetSource.endRow : null,
          sectionName: typeof targetSource.sectionName === "string" ? targetSource.sectionName : null,
          totalColumn: typeof targetSource.totalColumn === "string" ? targetSource.totalColumn : null,
          labelColumn: typeof targetSource.labelColumn === "string" ? targetSource.labelColumn : null,
        }
      : null,
    values: valuesSource
      ? {
          cells: normalizedLiteralValueCells,
        }
      : null,
    formulas: formulasSource
      ? {
          cells: normalizedFormulaCells,
        }
      : null,
    rationale: typeof candidate.rationale === "string" ? candidate.rationale.trim() : "",
  };
}

function normalizeSuggestedEditGroup(value: unknown, index: number): PricingWorksheetAiSuggestedEditGroup | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const operations = Array.isArray(candidate.operations)
    ? candidate.operations
        .map((entry) => normalizeOperation(entry))
        .filter((entry): entry is PricingWorksheetAiOperation => Boolean(entry))
    : [];

  if (operations.length === 0) {
    return null;
  }

  return {
    id: normalizeId(candidate.id, "edit-group", index),
    title: normalizeCappedText(candidate.title, MAX_SHORT_TEXT_LENGTH) || `Suggested edit ${index + 1}`,
    purpose: normalizeCappedText(candidate.purpose, MAX_FINDING_TEXT_LENGTH),
    confidence:
      candidate.confidence === "high" || candidate.confidence === "low" || candidate.confidence === "medium"
        ? candidate.confidence
        : "medium",
    assumptions: normalizeTextArray(candidate.assumptions),
    warnings: normalizeTextArray(candidate.warnings),
    relatedFindingIds: Array.isArray(candidate.relatedFindingIds)
      ? candidate.relatedFindingIds
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)
          .slice(0, 8)
      : [],
    operations,
  };
}

function normalizeReviewFinding(value: unknown, index: number): PricingWorksheetAiReviewFinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const title = normalizeCappedText(candidate.title, MAX_SHORT_TEXT_LENGTH);
  const finding = normalizeCappedText(candidate.finding, MAX_FINDING_TEXT_LENGTH);
  if (!title || !finding) {
    return null;
  }

  const suggestedEditGroupIdRaw =
    typeof candidate.suggestedEditGroupId === "string" && candidate.suggestedEditGroupId.trim().length > 0
      ? candidate.suggestedEditGroupId.trim()
      : null;

  return {
    id: normalizeId(candidate.id, "finding", index),
    category: normalizeFindingCategory(candidate.category),
    severity: normalizeSeverity(candidate.severity),
    confidence:
      candidate.confidence === "high" || candidate.confidence === "low" || candidate.confidence === "medium"
        ? candidate.confidence
        : "medium",
    findingStatus: normalizeFindingStatus(candidate.findingStatus),
    title,
    finding,
    worksheetEvidence: normalizeTextArray(candidate.worksheetEvidence).slice(0, MAX_EVIDENCE_ITEMS),
    assumption: normalizeCappedText(candidate.assumption, MAX_FINDING_TEXT_LENGTH) || undefined,
    uncertainty: normalizeCappedText(candidate.uncertainty, MAX_FINDING_TEXT_LENGTH) || undefined,
    needsConfirmation: normalizeCappedText(candidate.needsConfirmation, MAX_FINDING_TEXT_LENGTH) || undefined,
    suggestedAction: normalizeCappedText(candidate.suggestedAction, MAX_FINDING_TEXT_LENGTH) || undefined,
    relatedCells: normalizeCellRefArray(candidate.relatedCells),
    relatedRows: normalizeRowNumberArray(candidate.relatedRows),
    suggestedEditGroupId: suggestedEditGroupIdRaw,
    canSuggestWorksheetEdit: candidate.canSuggestWorksheetEdit === true,
    evidenceSourceIds: Array.isArray(candidate.evidenceSourceIds)
      ? candidate.evidenceSourceIds
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)
          .slice(0, MAX_EVIDENCE_ITEMS)
      : [],
    revisionReason: normalizeCappedText(candidate.revisionReason, MAX_FINDING_TEXT_LENGTH) || undefined,
    revisedFromFindingId:
      typeof candidate.revisedFromFindingId === "string" && candidate.revisedFromFindingId.trim().length > 0
        ? candidate.revisedFromFindingId.trim()
        : null,
    supersededByFindingId:
      typeof candidate.supersededByFindingId === "string" && candidate.supersededByFindingId.trim().length > 0
        ? candidate.supersededByFindingId.trim()
        : null,
  };
}

function normalizeReviewSummary(value: unknown): PricingWorksheetAiReviewSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return {
    presentItems: normalizeTextArray(candidate.presentItems),
    possibleMissingItems: normalizeTextArray(candidate.possibleMissingItems),
    keyRisks: normalizeTextArray(candidate.keyRisks),
    assumptions: normalizeTextArray(candidate.assumptions),
    confirmationsNeeded: normalizeTextArray(candidate.confirmationsNeeded),
  };
}

export function buildPricingWorksheetAiAssistantSchema(): Record<string, unknown> {
  const operationSchema = {
    type: "object",
    additionalProperties: false,
    required: ["type", "target", "values", "formulas", "rationale"],
    properties: {
      type: {
        type: "string",
        enum: [
          "update_cell",
          "update_cells",
          "insert_row",
          "copy_row_variant",
          "fix_formula",
          "explain_formula",
          "insert_subtotal",
        ],
      },
      target: {
        type: "object",
        additionalProperties: false,
        required: [
          "cell",
          "row",
          "sourceRow",
          "insertAfterRow",
          "insertBeforeRow",
          "startRow",
          "endRow",
          "sectionName",
          "totalColumn",
          "labelColumn",
        ],
        properties: {
          cell: { type: ["string", "null"] },
          row: { type: ["number", "null"] },
          sourceRow: { type: ["number", "null"] },
          insertAfterRow: { type: ["number", "null"] },
          insertBeforeRow: { type: ["number", "null"] },
          startRow: { type: ["number", "null"] },
          endRow: { type: ["number", "null"] },
          sectionName: { type: ["string", "null"] },
          totalColumn: { type: ["string", "null"] },
          labelColumn: { type: ["string", "null"] },
        },
      },
      values: {
        type: "object",
        additionalProperties: false,
        required: ["cells"],
        properties: {
          cells: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["ref", "column", "value"],
              properties: {
                ref: { type: ["string", "null"] },
                column: { type: ["string", "null"] },
                value: {
                  type: ["string", "number", "boolean", "null"],
                },
              },
            },
          },
        },
      },
      formulas: {
        type: "object",
        additionalProperties: false,
        required: ["cells"],
        properties: {
          cells: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["ref", "column", "formula"],
              properties: {
                ref: { type: ["string", "null"] },
                column: { type: ["string", "null"] },
                formula: { type: "string" },
              },
            },
          },
        },
      },
      rationale: { type: "string" },
    },
  } as const;

  return {
    type: "object",
    additionalProperties: false,
    required: [
      "mode",
      "proposalName",
      "answer",
      "summary",
      "confidence",
      "operations",
      "assumptions",
      "warnings",
      "reviewFindings",
      "reviewSummary",
      "suggestedEditGroups",
      "evidenceSources",
    ],
    properties: {
      mode: {
        type: "string",
        enum: ["answer_only", "propose_edit", "answer_and_propose_edit"],
      },
      proposalName: { type: "string" },
      answer: { type: "string" },
      summary: { type: "string" },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
      operations: {
        type: "array",
        items: operationSchema,
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
      reviewFindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "category",
            "severity",
            "confidence",
            "findingStatus",
            "title",
            "finding",
            "worksheetEvidence",
            "assumption",
            "uncertainty",
            "needsConfirmation",
            "suggestedAction",
            "relatedCells",
            "relatedRows",
            "suggestedEditGroupId",
            "canSuggestWorksheetEdit",
            "evidenceSourceIds",
            "revisionReason",
            "revisedFromFindingId",
            "supersededByFindingId",
          ],
          properties: {
            id: { type: "string" },
            category: {
              type: "string",
              enum: [
                "missing_scope",
                "formula_risk",
                "quantity_risk",
                "labour_risk",
                "wastage_risk",
                "specification_uncertainty",
                "quote_readiness",
                "takeoff_readiness",
                "general_review",
              ],
            },
            severity: { type: "string", enum: ["info", "low", "medium", "high"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            findingStatus: {
              type: ["string", "null"],
              enum: ["active", "revised", "downgraded", "invalidated", "confirmed", "superseded", null],
            },
            title: { type: "string" },
            finding: { type: "string" },
            worksheetEvidence: { type: "array", items: { type: "string" } },
            assumption: { type: ["string", "null"] },
            uncertainty: { type: ["string", "null"] },
            needsConfirmation: { type: ["string", "null"] },
            suggestedAction: { type: ["string", "null"] },
            relatedCells: { type: "array", items: { type: "string" } },
            relatedRows: { type: "array", items: { type: "number" } },
            suggestedEditGroupId: { type: ["string", "null"] },
            canSuggestWorksheetEdit: { type: "boolean" },
            evidenceSourceIds: { type: "array", items: { type: "string" } },
            revisionReason: { type: ["string", "null"] },
            revisedFromFindingId: { type: ["string", "null"] },
            supersededByFindingId: { type: ["string", "null"] },
          },
        },
      },
      reviewSummary: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["presentItems", "possibleMissingItems", "keyRisks", "assumptions", "confirmationsNeeded"],
        properties: {
          presentItems: { type: "array", items: { type: "string" } },
          possibleMissingItems: { type: "array", items: { type: "string" } },
          keyRisks: { type: "array", items: { type: "string" } },
          assumptions: { type: "array", items: { type: "string" } },
          confirmationsNeeded: { type: "array", items: { type: "string" } },
        },
      },
      suggestedEditGroups: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "purpose", "confidence", "assumptions", "warnings", "relatedFindingIds", "operations"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            purpose: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            assumptions: { type: "array", items: { type: "string" } },
            warnings: { type: "array", items: { type: "string" } },
            relatedFindingIds: { type: "array", items: { type: "string" } },
            operations: {
              type: "array",
              items: operationSchema,
            },
          },
        },
      },
      evidenceSources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "url", "sourceType", "retrievedAt", "jurisdiction", "confidence", "supportedClaims"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            url: { type: ["string", "null"] },
            sourceType: {
              type: "string",
              enum: [
                "web",
                "manufacturer",
                "standard_or_code",
                "industry_guidance",
                "supplier",
                "project_document",
                "organization_memory",
                "unknown",
              ],
            },
            retrievedAt: { type: ["string", "null"] },
            jurisdiction: { type: ["string", "null"], enum: ["AUS_NZ", "AU", "NZ", "unknown", null] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            supportedClaims: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

export function normalizePricingWorksheetAiAssistantResponse(
  value: unknown,
): PricingWorksheetAiAssistantResponse {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const operations = Array.isArray(candidate.operations)
    ? candidate.operations
        .map((entry) => normalizeOperation(entry))
        .filter((entry): entry is PricingWorksheetAiOperation => Boolean(entry))
    : [];
  const suggestedEditGroups = Array.isArray(candidate.suggestedEditGroups)
    ? candidate.suggestedEditGroups
        .map((entry, index) => normalizeSuggestedEditGroup(entry, index))
        .filter((entry): entry is PricingWorksheetAiSuggestedEditGroup => Boolean(entry))
        .slice(0, MAX_SUGGESTED_EDIT_GROUPS)
    : [];
  const evidenceSources = Array.isArray(candidate.evidenceSources)
    ? candidate.evidenceSources
        .map((entry, index) => normalizeEvidenceSource(entry, index))
        .filter((entry): entry is PricingWorksheetAiEvidenceSource => Boolean(entry))
        .reduce<PricingWorksheetAiEvidenceSource[]>((accumulator, source) => {
          const existingIndex = accumulator.findIndex(
            (entry) => buildEvidenceSourceDedupKey(entry) === buildEvidenceSourceDedupKey(source),
          );
          if (existingIndex < 0) {
            accumulator.push(source);
            return accumulator;
          }

          const existing = accumulator[existingIndex];
          accumulator[existingIndex] = {
            ...existing,
            title: existing.title.length >= source.title.length ? existing.title : source.title,
            url: existing.url ?? source.url,
            sourceType: existing.sourceType === "unknown" ? source.sourceType : existing.sourceType,
            jurisdiction:
              existing.jurisdiction === "unknown" && source.jurisdiction ? source.jurisdiction : existing.jurisdiction,
            confidence:
              existing.confidence === "high" || source.confidence === "low"
                ? existing.confidence
                : source.confidence === "high"
                  ? "high"
                  : existing.confidence === "medium" || source.confidence === "medium"
                    ? "medium"
                    : "low",
            supportedClaims: Array.from(new Set([...(existing.supportedClaims ?? []), ...(source.supportedClaims ?? [])])).slice(
              0,
              MAX_SUPPORTED_CLAIMS,
            ),
            retrievedAt: existing.retrievedAt ?? source.retrievedAt,
          };
          return accumulator;
        }, [])
        .slice(0, MAX_EVIDENCE_SOURCES)
    : [];
  const evidenceSourceIds = new Set(evidenceSources.map((entry) => entry.id));
  const suggestedEditGroupIds = new Set(suggestedEditGroups.map((entry) => entry.id));
  const reviewFindings = Array.isArray(candidate.reviewFindings)
    ? candidate.reviewFindings
        .map((entry, index) => normalizeReviewFinding(entry, index))
        .filter((entry): entry is PricingWorksheetAiReviewFinding => Boolean(entry))
        .map((entry) => ({
          ...entry,
          suggestedEditGroupId:
            entry.suggestedEditGroupId && suggestedEditGroupIds.has(entry.suggestedEditGroupId)
              ? entry.suggestedEditGroupId
              : null,
          canSuggestWorksheetEdit:
            entry.canSuggestWorksheetEdit === true &&
            Boolean(entry.suggestedEditGroupId && suggestedEditGroupIds.has(entry.suggestedEditGroupId)),
          evidenceSourceIds: (entry.evidenceSourceIds ?? []).filter((sourceId) => evidenceSourceIds.has(sourceId)),
        }))
        .slice(0, MAX_REVIEW_FINDINGS)
    : [];
  const reviewSummary = normalizeReviewSummary(candidate.reviewSummary);

  return {
    mode:
      candidate.mode === "propose_edit" ||
      candidate.mode === "answer_and_propose_edit" ||
      candidate.mode === "answer_only"
        ? candidate.mode
        : "answer_only",
    proposalName:
      typeof candidate.proposalName === "string" && candidate.proposalName.trim().length > 0
        ? candidate.proposalName.trim()
        : "Worksheet assistant response",
    answer: typeof candidate.answer === "string" ? candidate.answer.trim() : "",
    summary: typeof candidate.summary === "string" ? candidate.summary.trim() : "",
    confidence:
      candidate.confidence === "high" || candidate.confidence === "low" || candidate.confidence === "medium"
        ? candidate.confidence
        : "medium",
    operations,
    assumptions: normalizeTextArray(candidate.assumptions),
    warnings: normalizeTextArray(candidate.warnings),
    reviewFindings,
    reviewSummary,
    suggestedEditGroups,
    evidenceSources,
  };
}

export function validatePricingWorksheetAiAssistantResponse(
  response: PricingWorksheetAiAssistantResponse,
  worksheet: WorksheetData,
): PricingWorksheetAiValidationIssue[] {
  const issues: PricingWorksheetAiValidationIssue[] = [];
  const mutatingOperations = response.operations.filter((operation) => operation.type !== "explain_formula");
  const suggestedGroupOperations = (response.suggestedEditGroups ?? []).flatMap((group) =>
    group.operations.filter((operation) => operation.type !== "explain_formula"),
  );
  const allowsBoundedGeneration = isBoundedWorksheetGenerationCandidate(worksheet, mutatingOperations);

  if (response.mode === "answer_only" && mutatingOperations.length > 0) {
    issues.push({
      code: "mode_answer_only_mutation",
      message: "Answer-only responses cannot include mutating worksheet operations.",
      severity: "error",
    });
  }

  if ((response.mode === "propose_edit" || response.mode === "answer_and_propose_edit") && response.operations.length === 0) {
    issues.push({
      code: "mode_missing_operations",
      message: "Edit proposals must include at least one supported operation.",
      severity: "error",
    });
  }

  if (mutatingOperations.length > (allowsBoundedGeneration ? MAX_BOUNDED_GENERATION_OPERATIONS : MAX_MUTATING_OPERATIONS)) {
    issues.push({
      code: "too_many_operations",
      message: allowsBoundedGeneration
        ? "AI proposed too many operations for a single bounded worksheet generation preview."
        : "AI proposed too many worksheet changes for a single safe preview.",
      severity: "error",
    });
  }

  if (!allowsBoundedGeneration && collectMutatingCellCount(mutatingOperations) > MAX_CHANGED_CELLS) {
    issues.push({
      code: "too_many_cells_changed",
      message: "AI proposed too many cell changes for a single safe preview.",
      severity: "error",
    });
  }

  if ((response.suggestedEditGroups ?? []).length > MAX_SUGGESTED_EDIT_GROUPS) {
    issues.push({
      code: "too_many_suggested_edit_groups",
      message: "AI proposed too many suggested edit groups for a single review.",
      severity: "error",
    });
  }

  for (const group of response.suggestedEditGroups ?? []) {
    const groupMutatingOperations = group.operations.filter((operation) => operation.type !== "explain_formula");
    const allowsBoundedGenerationGroup = isBoundedWorksheetGenerationCandidate(worksheet, groupMutatingOperations);

    if (group.operations.length > (allowsBoundedGenerationGroup ? MAX_BOUNDED_GENERATION_OPERATIONS : MAX_MUTATING_OPERATIONS)) {
      issues.push({
        code: "suggested_edit_group_too_many_operations",
        message: `Suggested edit group "${group.title}" contains too many operations.`,
        severity: "error",
      });
    }

    if (
      !allowsBoundedGenerationGroup &&
      collectMutatingCellCount(groupMutatingOperations) > MAX_CHANGED_CELLS
    ) {
      issues.push({
        code: "suggested_edit_group_too_many_cells_changed",
        message: `Suggested edit group "${group.title}" changes too many cells for a safe preview.`,
        severity: "error",
      });
    }
  }

  for (const operation of [...response.operations, ...suggestedGroupOperations]) {
    if (
      operation.type !== "update_cell" &&
      operation.type !== "update_cells" &&
      operation.type !== "insert_row" &&
      operation.type !== "copy_row_variant" &&
      operation.type !== "fix_formula" &&
      operation.type !== "explain_formula" &&
      operation.type !== "insert_subtotal"
    ) {
      issues.push({
        code: "unsupported_operation",
        message: `Unsupported AI operation type "${operation.type}".`,
        severity: "error",
      });
    }

    if (operation.type === "explain_formula" && (getValueEntries(operation).length > 0 || getFormulaEntries(operation).length > 0)) {
      issues.push({
        code: "explain_formula_mutation",
        message: "Explain-formula operations must be read-only.",
        severity: "error",
      });
    }

    if (operation.type === "fix_formula" && getFormulaEntries(operation).length === 0) {
      issues.push({
        code: "fix_formula_missing_formula",
        message: "Fix-formula operations must include a replacement formula.",
        severity: "error",
      });
    }

    for (const entry of getValueEntries(operation)) {
      if (entry.ref) {
        const parsed = parseCellRef(entry.ref);
        if (!parsed) {
          issues.push({
            code: "invalid_cell_ref",
            message: `Cell reference "${entry.ref}" is invalid.`,
            severity: "error",
          });
          continue;
        }

        if (parsed.rowNumber > worksheet.rows.length || parsed.columnIndex >= worksheet.columns.length) {
          issues.push({
            code: "cell_ref_out_of_bounds",
            message: `Cell reference "${entry.ref}" is outside the worksheet bounds.`,
            severity: "error",
          });
        }
      }
    }

    for (const entry of getFormulaEntries(operation)) {
      if (entry.ref) {
        const parsed = parseCellRef(entry.ref);
        if (!parsed) {
          issues.push({
            code: "invalid_formula_target",
            message: `Formula target "${entry.ref}" is invalid.`,
            severity: "error",
          });
          continue;
        }

        if (parsed.rowNumber > worksheet.rows.length || parsed.columnIndex >= worksheet.columns.length) {
          issues.push({
            code: "formula_target_out_of_bounds",
            message: `Formula target "${entry.ref}" is outside the worksheet bounds.`,
            severity: "error",
          });
        }
      }
    }
  }

  return issues;
}

function resolveInsertRowIndex(target: PricingWorksheetAiOperation["target"]): number | null {
  if (!target) {
    return null;
  }

  if (typeof target.insertBeforeRow === "number" && target.insertBeforeRow >= 1) {
    return target.insertBeforeRow - 1;
  }

  if (typeof target.insertAfterRow === "number" && target.insertAfterRow >= 1) {
    return target.insertAfterRow;
  }

  if (typeof target.row === "number" && target.row >= 1) {
    return target.row;
  }

  return null;
}

function resolveColumnIndex(entry: PricingWorksheetAiCellValueEntry | PricingWorksheetAiFormulaEntry): number | null {
  if (entry.ref) {
    return parseCellRef(entry.ref)?.columnIndex ?? null;
  }

  if (entry.column) {
    return columnLabelToIndex(entry.column);
  }

  return null;
}

function applyInsertedRowEntries(
  worksheet: WorksheetData,
  rowNumber: number,
  operation: PricingWorksheetAiOperation,
  issues: PricingWorksheetAiValidationIssue[],
  diffSummary: PricingWorksheetAiDiffSummary,
): void {
  const rowIndex = rowNumber - 1;
  for (const entry of getValueEntries(operation)) {
    const columnIndex = resolveColumnIndex(entry);
    if (columnIndex === null || columnIndex >= worksheet.columns.length) {
      issues.push({
        code: "insert_row_invalid_column",
        message: "AI proposed an inserted-row value for an unsupported column.",
        severity: "error",
      });
      continue;
    }

    const cell = ensureCell(worksheet, rowIndex, columnIndex);
    setCellLiteral(cell, entry.value);
    diffSummary.changedCells.push(buildCellRef(columnIndex, rowNumber));
  }

  for (const entry of getFormulaEntries(operation)) {
    const columnIndex = resolveColumnIndex(entry);
    if (columnIndex === null || columnIndex >= worksheet.columns.length) {
      issues.push({
        code: "insert_row_invalid_formula_column",
        message: "AI proposed an inserted-row formula for an unsupported column.",
        severity: "error",
      });
      continue;
    }

    const formulaIssues = validateFormulaAllowlist(entry.formula, worksheet);
    issues.push(...formulaIssues);
    if (formulaIssues.some((issue) => issue.severity === "error")) {
      continue;
    }

    const cell = ensureCell(worksheet, rowIndex, columnIndex);
    setCellFormula(cell, entry.formula);
    const ref = buildCellRef(columnIndex, rowNumber);
    diffSummary.changedCells.push(ref);
    diffSummary.formulaCells.push(ref);
  }
}

function copyRowCells(
  worksheet: WorksheetData,
  sourceRowIndex: number,
  targetRowIndex: number,
): void {
  const sourceRow = worksheet.rows[sourceRowIndex];
  const targetRow = worksheet.rows[targetRowIndex];
  const deltaRows = targetRowIndex - sourceRowIndex;

  for (let columnIndex = 0; columnIndex < worksheet.columns.length; columnIndex += 1) {
    const column = worksheet.columns[columnIndex];
    const sourceKey = buildWorksheetCellKey(column.id, sourceRow.id);
    const targetKey = buildWorksheetCellKey(column.id, targetRow.id);
    const sourceCell = worksheet.cells[sourceKey];
    if (!sourceCell) {
      delete worksheet.cells[targetKey];
      continue;
    }

    worksheet.cells[targetKey] = {
      ...cloneWorksheet(sourceCell),
      formula:
        typeof sourceCell.formula === "string" && sourceCell.formula.trim().length > 0
          ? shiftFormulaForFill(sourceCell.formula, deltaRows, 0)
          : null,
    };
  }
}

function buildSubtotalFormula(column: string, startRow: number, endRow: number): string {
  return `SUM(${column.toUpperCase()}${startRow}:${column.toUpperCase()}${endRow})`;
}

export function simulatePricingWorksheetAiEditPlan(
  worksheetInput: WorksheetData,
  response: PricingWorksheetAiAssistantResponse,
): PricingWorksheetAiSimulationResult {
  let worksheet = cloneWorksheet(worksheetInput);
  const validationIssues = validatePricingWorksheetAiAssistantResponse(response, worksheetInput);
  const diffSummary: PricingWorksheetAiDiffSummary = {
    changedCells: [],
    formulaCells: [],
    insertedRows: [],
    affectedRows: [],
  };

  if (validationIssues.some((issue) => issue.severity === "error")) {
    return {
      worksheet,
      diffSummary,
      validationIssues,
    };
  }

  for (const operation of response.operations) {
    if (operation.type === "explain_formula") {
      continue;
    }

    if (operation.type === "update_cell" || operation.type === "update_cells" || operation.type === "fix_formula") {
      for (const entry of getValueEntries(operation)) {
        if (!entry.ref) {
          validationIssues.push({
            code: "missing_update_ref",
            message: "AI update operations must target explicit cell references.",
            severity: "error",
          });
          continue;
        }

        const parsed = parseCellRef(entry.ref);
        if (!parsed) {
          continue;
        }

      const cell = ensureCell(worksheet, parsed.rowNumber - 1, parsed.columnIndex);
      setCellLiteral(cell, entry.value);
        diffSummary.changedCells.push(entry.ref.toUpperCase());
        diffSummary.affectedRows.push(parsed.rowNumber);
      }

      for (const entry of getFormulaEntries(operation)) {
        if (!entry.ref) {
          validationIssues.push({
            code: "missing_formula_ref",
            message: "AI formula updates must target explicit cell references.",
            severity: "error",
          });
          continue;
        }

        const parsed = parseCellRef(entry.ref);
        if (!parsed) {
          continue;
        }

        const formulaIssues = validateFormulaAllowlist(entry.formula, worksheet);
        validationIssues.push(...formulaIssues);
        if (formulaIssues.some((issue) => issue.severity === "error")) {
          continue;
        }

        const cell = ensureCell(worksheet, parsed.rowNumber - 1, parsed.columnIndex);
        setCellFormula(cell, entry.formula);
        diffSummary.changedCells.push(entry.ref.toUpperCase());
        diffSummary.formulaCells.push(entry.ref.toUpperCase());
        diffSummary.affectedRows.push(parsed.rowNumber);
      }
    }

    if (operation.type === "insert_row") {
      const insertIndex = resolveInsertRowIndex(operation.target);
      if (insertIndex === null || insertIndex < 0 || insertIndex > worksheet.rows.length) {
        validationIssues.push({
          code: "insert_row_invalid_index",
          message: "AI proposed an invalid row insertion index.",
          severity: "error",
        });
        continue;
      }

      worksheet = insertWorksheetRow(worksheet, insertIndex);
      const insertedRowNumber = insertIndex + 1;
      diffSummary.insertedRows.push(insertedRowNumber);
      diffSummary.affectedRows.push(insertedRowNumber);
      applyInsertedRowEntries(worksheet, insertedRowNumber, operation, validationIssues, diffSummary);
    }

    if (operation.type === "copy_row_variant") {
      const sourceRowNumber = operation.target?.sourceRow ?? operation.target?.row ?? null;
      if (!sourceRowNumber || sourceRowNumber < 1 || sourceRowNumber > worksheet.rows.length) {
        validationIssues.push({
          code: "copy_row_invalid_source",
          message: "AI proposed a row copy from an invalid source row.",
          severity: "error",
        });
        continue;
      }

      const sourceRowIndex = sourceRowNumber - 1;
      const insertIndex = resolveInsertRowIndex(operation.target) ?? sourceRowNumber;
      if (insertIndex < 0 || insertIndex > worksheet.rows.length) {
        validationIssues.push({
          code: "copy_row_invalid_insert",
          message: "AI proposed an invalid insert position for the copied row.",
          severity: "error",
        });
        continue;
      }

      worksheet = insertWorksheetRow(worksheet, insertIndex);
      const insertedRowNumber = insertIndex + 1;
      const insertedRowIndex = insertedRowNumber - 1;
      const adjustedSourceRowIndex = insertIndex <= sourceRowIndex ? sourceRowIndex + 1 : sourceRowIndex;
      copyRowCells(worksheet, adjustedSourceRowIndex, insertedRowIndex);
      diffSummary.insertedRows.push(insertedRowNumber);
      diffSummary.affectedRows.push(insertedRowNumber);

      for (let columnIndex = 0; columnIndex < worksheet.columns.length; columnIndex += 1) {
        const cellKey = buildWorksheetCellKey(worksheet.columns[columnIndex].id, worksheet.rows[insertedRowIndex].id);
        const cell = worksheet.cells[cellKey];
        if (isCellPopulated(cell)) {
          const ref = buildCellRef(columnIndex, insertedRowNumber);
          diffSummary.changedCells.push(ref);
          if (cell?.formula) {
            const issues = validateFormulaAllowlist(cell.formula, worksheet);
            validationIssues.push(...issues);
            if (!issues.some((issue) => issue.severity === "error")) {
              diffSummary.formulaCells.push(ref);
            }
          }
        }
      }

      applyInsertedRowEntries(worksheet, insertedRowNumber, operation, validationIssues, diffSummary);
    }

    if (operation.type === "insert_subtotal") {
      const insertIndex = resolveInsertRowIndex(operation.target);
      const startRow = operation.target?.startRow ?? null;
      const endRow = operation.target?.endRow ?? null;
      const totalColumn = operation.target?.totalColumn?.trim().toUpperCase() || null;
      const labelColumn = operation.target?.labelColumn?.trim().toUpperCase() || "A";

      if (
        insertIndex === null ||
        insertIndex < 0 ||
        insertIndex > worksheet.rows.length ||
        !startRow ||
        !endRow ||
        !totalColumn
      ) {
        validationIssues.push({
          code: "subtotal_invalid_target",
          message: "AI subtotal insertion needs a clear row range and total column.",
          severity: "error",
        });
        continue;
      }

      worksheet = insertWorksheetRow(worksheet, insertIndex);
      const insertedRowNumber = insertIndex + 1;
      diffSummary.insertedRows.push(insertedRowNumber);
      diffSummary.affectedRows.push(insertedRowNumber);

      const labelIndex = columnLabelToIndex(labelColumn);
      const totalIndex = columnLabelToIndex(totalColumn);
      if (labelIndex === null || totalIndex === null) {
        validationIssues.push({
          code: "subtotal_invalid_column",
          message: "AI subtotal insertion used an invalid label or total column.",
          severity: "error",
        });
        continue;
      }

      setCellLiteral(ensureCell(worksheet, insertedRowNumber - 1, labelIndex), "Subtotal");
      diffSummary.changedCells.push(buildCellRef(labelIndex, insertedRowNumber));

      const subtotalFormula = buildSubtotalFormula(totalColumn, startRow, endRow);
      const subtotalIssues = validateFormulaAllowlist(subtotalFormula, worksheet);
      validationIssues.push(...subtotalIssues);
      if (!subtotalIssues.some((issue) => issue.severity === "error")) {
        setCellFormula(ensureCell(worksheet, insertedRowNumber - 1, totalIndex), subtotalFormula);
        const ref = buildCellRef(totalIndex, insertedRowNumber);
        diffSummary.changedCells.push(ref);
        diffSummary.formulaCells.push(ref);
      }
    }
  }

  const recalculated = recalculateWorksheetFormulas(worksheet);
  for (const issue of findWorksheetFormulaErrors(recalculated)) {
    validationIssues.push({
      code: "formula_recalc_error",
      message: `Generated formula at ${issue.cellKey} recalculated to ${issue.error}.`,
      severity: "error",
    });
  }

  return {
    worksheet: recalculated,
    diffSummary: {
      changedCells: Array.from(new Set(diffSummary.changedCells)),
      formulaCells: Array.from(new Set(diffSummary.formulaCells)),
      insertedRows: Array.from(new Set(diffSummary.insertedRows)).sort((left, right) => left - right),
      affectedRows: Array.from(new Set(diffSummary.affectedRows)).sort((left, right) => left - right),
    },
    validationIssues,
  };
}

export function buildPricingWorksheetAiSuggestedEditSelectionResponse(
  response: PricingWorksheetAiAssistantResponse,
  selectedEditGroupIds: string[],
): PricingWorksheetAiAssistantResponse {
  const selectedIdSet = new Set(selectedEditGroupIds);
  const selectedGroups = (response.suggestedEditGroups ?? []).filter((group) => selectedIdSet.has(group.id));

  return {
    ...response,
    mode: selectedGroups.length > 0 ? "propose_edit" : "answer_only",
    operations: selectedGroups.flatMap((group) => group.operations),
    suggestedEditGroups: selectedGroups,
  };
}
