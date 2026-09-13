import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import { getFormattedCellDisplayValue } from "@/lib/opportunity-pricing-worksheet-formatting";
import { getWorksheetAnchorPosition, parseWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import type { PublishedWorksheetSelection } from "@/lib/commercial-items/published-worksheet-selection";
import type {
  ConfirmedCommercialLineInput,
  FieldCandidate,
  InterpretedWorksheetSelection,
  SelectionAnchor,
} from "@/lib/commercial-items/worksheet-publish-v2";
import { buildWorksheetSelectionRangeLabel } from "@/lib/commercial-items/snapshot";
import { resolveEffectiveCommercialLineValues, type EffectiveCommercialLineValues } from "@/lib/commercial-items/commercial-line-effective-values";
import { formatMoneyOperational } from "@/lib/format/currency";
import { buildWorksheetStructureKey, type WorksheetCellReference } from "@/lib/worksheet-cell-mapping";

export { buildWorksheetStructureKey } from "@/lib/worksheet-cell-mapping";

export const COMMERCIAL_MAPPING_FIELDS = ["description", "quantity", "unit", "rate", "total"] as const;
export const EMPTY_COMMERCIAL_MAPPING_ERROR = "Add a Description or map at least one worksheet cell.";
export type CommercialMappingField = typeof COMMERCIAL_MAPPING_FIELDS[number];
export type CommercialMappingDestination = PublishedWorksheetSelection["destination"];

export type WorksheetCommercialSourceRef = WorksheetCellReference;

export type CommercialDescriptionSource =
  | { mode: "empty" }
  | { mode: "worksheet"; source: WorksheetCommercialSourceRef }
  | { mode: "manual"; value: string };

export type WorksheetCommercialMappedField = Exclude<CommercialMappingField, "description">;
export type WorksheetCommercialMappings = Record<WorksheetCommercialMappedField, WorksheetCommercialSourceRef | null>;

export interface WorksheetCommercialMappingSession {
  destination: CommercialMappingDestination;
  workbookId: string;
  sheetId: string;
  structureKey: string;
  startingCell: string;
  capturedSelection: WorksheetSelectionRange;
  capturedSelections: WorksheetSelectionRange[];
  activeField: CommercialMappingField | null;
  description: CommercialDescriptionSource;
  mappings: WorksheetCommercialMappings;
  statusMessage: string;
}

export type ResolvedWorksheetCommercialField = {
  field: CommercialMappingField;
  source: WorksheetCommercialSourceRef | null;
  cell: WorksheetCell | null;
  displayValue: string;
  value: string | number | null;
  error: string | null;
};

export type ResolvedWorksheetCommercialLine = {
  fields: Record<CommercialMappingField, ResolvedWorksheetCommercialField>;
  line: Omit<ConfirmedCommercialLineInput, "proposalId">;
  errors: string[];
  warnings: string[];
  effective: EffectiveCommercialLineValues | null;
};

export function createEmptyCommercialMappings(): WorksheetCommercialMappings {
  return { quantity: null, unit: null, rate: null, total: null };
}

export function getWorksheetCommercialFieldSource(
  session: WorksheetCommercialMappingSession,
  field: CommercialMappingField,
) {
  return field === "description"
    ? session.description.mode === "worksheet" ? session.description.source : null
    : session.mappings[field];
}

export function hasWorksheetCommercialFieldValue(
  session: WorksheetCommercialMappingSession,
  field: CommercialMappingField,
) {
  return field === "description"
    ? session.description.mode === "worksheet"
      || (session.description.mode === "manual" && session.description.value.trim().length > 0)
    : Boolean(session.mappings[field]);
}

function isFormulaError(cell: WorksheetCell | undefined) {
  return Boolean(cell?.displayValue && /^#(?:REF|VALUE|DIV\/0|NAME|N\/A|NUM|NULL)!?$/i.test(cell.displayValue.trim()));
}

function resolveText(cell: WorksheetCell | undefined) {
  if (!cell || isFormulaError(cell)) return null;
  if (typeof cell.computedValue === "string") return cell.computedValue;
  if (typeof cell.value === "string" && !cell.formula) return cell.value;
  if (typeof cell.computedValue === "number" && Number.isFinite(cell.computedValue)) return String(cell.computedValue);
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) return String(cell.value);
  return null;
}

export function resolveWorksheetCommercialNumericValue(cell: WorksheetCell | undefined) {
  if (!cell || isFormulaError(cell)) return null;
  if (typeof cell.computedValue === "number" && Number.isFinite(cell.computedValue)) return cell.computedValue;
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) return cell.value;
  return null;
}

export function resolveWorksheetCommercialField(params: {
  field: CommercialMappingField;
  source: WorksheetCommercialSourceRef | null;
  worksheet: WorksheetData;
  workbookId: string;
  sheetId: string;
}): ResolvedWorksheetCommercialField {
  const { field, source, worksheet, workbookId, sheetId } = params;
  if (!source) return { field, source, cell: null, displayValue: "", value: null, error: null };
  if (source.workbookId !== workbookId) return { field, source, cell: null, displayValue: "", value: null, error: "Mapped source belongs to a different workbook." };
  if (source.sheetId !== sheetId) return { field, source, cell: null, displayValue: "", value: null, error: "Mapped source belongs to a different sheet." };
  if (source.structureKey !== buildWorksheetStructureKey(worksheet)) return { field, source, cell: null, displayValue: "", value: null, error: "Worksheet structure changed after this field was mapped." };
  if (!getWorksheetAnchorPosition(worksheet, source.cellKey)) return { field, source, cell: null, displayValue: "", value: null, error: "Mapped source cell no longer exists." };

  const cell = worksheet.cells[source.cellKey];
  const displayValue = getFormattedCellDisplayValue(cell);
  if (isFormulaError(cell)) return { field, source, cell: cell ?? null, displayValue, value: null, error: "Mapped cell contains a formula error." };
  const numeric = field === "quantity" || field === "rate" || field === "total";
  const value = numeric ? resolveWorksheetCommercialNumericValue(cell) : resolveText(cell);
  const emptyText = !numeric && typeof value === "string" && !value.trim();
  const error = emptyText
    ? `${field[0].toUpperCase()}${field.slice(1)} source cell is empty.`
    : value === null
    ? numeric
      ? `${field[0].toUpperCase()}${field.slice(1)} requires a numeric worksheet cell.`
      : `${field[0].toUpperCase()}${field.slice(1)} requires a text-compatible worksheet cell.`
    : null;
  return { field, source, cell: cell ?? null, displayValue, value: emptyText ? null : value, error };
}

export function resolveWorksheetCommercialMapping(params: {
  session: WorksheetCommercialMappingSession;
  worksheet: WorksheetData;
  workbookId: string;
  sheetId: string;
}): ResolvedWorksheetCommercialLine {
  const fields = Object.fromEntries(COMMERCIAL_MAPPING_FIELDS.map((field) => {
    if (field === "description" && params.session.description.mode === "manual") {
      const value = params.session.description.value.trim();
      return [field, {
        field,
        source: null,
        cell: null,
        displayValue: value,
        value: value || null,
        error: null,
      } satisfies ResolvedWorksheetCommercialField];
    }
    return [field, resolveWorksheetCommercialField({
      field,
      source: getWorksheetCommercialFieldSource(params.session, field),
      worksheet: params.worksheet,
      workbookId: params.workbookId,
      sheetId: params.sheetId,
    })];
  })) as Record<CommercialMappingField, ResolvedWorksheetCommercialField>;
  const description = typeof fields.description.value === "string" ? fields.description.value.trim() : "";
  const quantity = typeof fields.quantity.value === "number" ? fields.quantity.value : null;
  const unit = typeof fields.unit.value === "string" && fields.unit.value.trim() ? fields.unit.value.trim() : null;
  const rate = typeof fields.rate.value === "number" ? fields.rate.value : null;
  const total = typeof fields.total.value === "number" ? fields.total.value : null;
  const errors = COMMERCIAL_MAPPING_FIELDS.flatMap((field) => fields[field].error ? [fields[field].error!] : []);
  if (!COMMERCIAL_MAPPING_FIELDS.some((field) => hasWorksheetCommercialFieldValue(params.session, field))) errors.push(EMPTY_COMMERCIAL_MAPPING_ERROR);

  let effective: EffectiveCommercialLineValues | null = null;
  try {
    effective = params.session.destination === "variation"
      ? resolveEffectiveCommercialLineValues("variation", { quantity, rate, total })
      : resolveEffectiveCommercialLineValues(params.session.destination, { quantity, rate, total });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Commercial values could not be resolved.");
  }
  const warnings: string[] = [];
  if (params.session.destination !== "variation" && quantity !== null && rate !== null && total !== null && Math.abs(quantity * rate - total) > 0.01) {
    warnings.push(`Mapped Total (${total}) differs from Quantity × Rate (${quantity * rate}). The destination persists Quantity × Rate.`);
  }
  if (effective?.derivedRate && effective.rate !== null) warnings.push(`Rate will be derived as ${formatMoneyOperational(effective.rate, { decimals: 2 })} from the mapped Total and effective Quantity.`);
  if (effective?.derivedQuantity) warnings.push("Quantity will be set to 1 because Total is mapped without Quantity or Rate.");

  return {
    fields,
    line: { description, quantity, unit, rate, total },
    errors,
    warnings,
    effective,
  };
}

function buildAnchor(worksheet: WorksheetData, cellKey: string): SelectionAnchor {
  const parsed = parseWorksheetCellKey(cellKey)!;
  const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);
  const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
  return {
    cellKey,
    rowId: parsed.rowId,
    rowIndex,
    rowLabel: worksheet.rows[rowIndex]?.id ?? parsed.rowId,
    columnId: parsed.columnId,
    columnIndex,
    columnLabel: worksheet.columns[columnIndex]?.label ?? parsed.columnId,
  };
}

function explicitCandidate<T>(worksheet: WorksheetData, source: WorksheetCommercialSourceRef | null, value: T | null): FieldCandidate<T> {
  return { value, confidence: "high", anchors: source ? [buildAnchor(worksheet, source.cellKey)] : [] };
}

export function buildExplicitMappedCommercialSelection(params: {
  session: WorksheetCommercialMappingSession;
  worksheet: WorksheetData;
  resolved: ResolvedWorksheetCommercialLine;
  proposalId?: string;
}): { interpretedSelection: InterpretedWorksheetSelection; confirmedLine: ConfirmedCommercialLineInput } {
  if (params.resolved.errors.length > 0) throw new Error(params.resolved.errors[0]);
  const { session, worksheet, resolved } = params;
  const proposalId = params.proposalId ?? "explicit-mapping-line-0";
  const primaryRangeLabel = buildWorksheetSelectionRangeLabel(worksheet, session.capturedSelection);
  const selectionRangeLabels = session.capturedSelections.map((range) => buildWorksheetSelectionRangeLabel(worksheet, range));
  const mappedSources = COMMERCIAL_MAPPING_FIELDS.flatMap((field) => {
    const source = getWorksheetCommercialFieldSource(session, field);
    return source ? [source] : [];
  });
  const visibleSelectedValues = mappedSources.map((source) => getFormattedCellDisplayValue(worksheet.cells[source.cellKey])).filter(Boolean);
  const interpretedSelection: InterpretedWorksheetSelection = {
    destination: session.destination,
    selectionRange: session.capturedSelection,
    primaryRangeLabel,
    // This value becomes the persisted commercial item's source_range. Keep it
    // identical to sourceLinkJson.range; field-specific provenance is recorded
    // separately in worksheetPublishV2.fieldMappings.
    selectionRangeLabel: primaryRangeLabel,
    selectionRanges: session.capturedSelections,
    selectionRangeLabels,
    skippedRows: [],
    warnings: resolved.warnings,
    visibleSelectedValues,
    proposedLines: [{
      id: proposalId,
      rowId: proposalId,
      rowIndex: session.capturedSelection.startRowIndex,
      rowLabel: primaryRangeLabel,
      sourceRange: session.capturedSelection,
      sourceRangeLabel: primaryRangeLabel,
      sourceSummary: "User-defined commercial field mapping",
      sectionHeading: null,
      warnings: resolved.warnings,
      includeByDefault: true,
      description: session.description.mode === "manual"
        ? explicitCandidate<string>(worksheet, null, null)
        : explicitCandidate(worksheet, getWorksheetCommercialFieldSource(session, "description"), resolved.line.description),
      quantity: explicitCandidate(worksheet, session.mappings.quantity, resolved.line.quantity),
      unit: explicitCandidate(worksheet, session.mappings.unit, resolved.line.unit),
      rate: explicitCandidate(worksheet, session.mappings.rate, resolved.line.rate),
      total: explicitCandidate(worksheet, session.mappings.total, resolved.line.total),
    }],
  };
  return {
    interpretedSelection,
    confirmedLine: { proposalId, ...resolved.line },
  };
}

export function combineExplicitMappedCommercialSelections(
  selections: Array<ReturnType<typeof buildExplicitMappedCommercialSelection>>,
): InterpretedWorksheetSelection {
  const first = selections[0]?.interpretedSelection;
  if (!first) throw new Error("Add at least one mapped commercial line.");
  return {
    ...first,
    destination: "variation",
    proposedLines: selections.flatMap((selection) => selection.interpretedSelection.proposedLines),
    skippedRows: selections.flatMap((selection) => selection.interpretedSelection.skippedRows),
    warnings: selections.flatMap((selection) => selection.interpretedSelection.warnings),
    visibleSelectedValues: Array.from(new Set(selections.flatMap((selection) => selection.interpretedSelection.visibleSelectedValues))),
  };
}
