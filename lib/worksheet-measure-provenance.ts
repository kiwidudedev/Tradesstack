import type { Json } from "@/lib/supabase/types";
import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { PricingWorksheetMeasureField, PricingWorksheetMeasureKind } from "@/lib/pricing-worksheet-measure-picker";

export const MEASURE_PROVENANCE_METADATA_KEY = "measureSource" as const;

export type WorksheetMeasureProvenanceV1 = {
  version: 1;
  bindingId: string;
  measurementId: string;
  measurementVersion: number;
  projectId: string;
  drawingSetId: string;
  drawingSetName: string;
  pageId: string;
  pageNumber: number;
  pageLabel: string | null;
  groupId: string | null;
  groupName: string | null;
  measurementKind: PricingWorksheetMeasureKind;
  measurementName: string;
  sourceDescription: string | null;
  insertedField: PricingWorksheetMeasureField;
  insertedValue: string | number;
  insertedQuantity: number;
  insertedUnit: string;
  sourceUpdatedAt: string;
  insertedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseWorksheetMeasureProvenance(value: unknown): WorksheetMeasureProvenanceV1 | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (
    typeof value.bindingId !== "string" || !value.bindingId ||
    typeof value.measurementId !== "string" || !value.measurementId ||
    !Number.isInteger(value.measurementVersion) || Number(value.measurementVersion) < 1 ||
    typeof value.projectId !== "string" || !value.projectId ||
    typeof value.drawingSetId !== "string" || !value.drawingSetId ||
    typeof value.drawingSetName !== "string" || !value.drawingSetName ||
    typeof value.pageId !== "string" || !value.pageId ||
    !Number.isInteger(value.pageNumber) || Number(value.pageNumber) < 1 ||
    !isNullableString(value.pageLabel) || !isNullableString(value.groupId) || !isNullableString(value.groupName) ||
    !["line", "area", "count"].includes(String(value.measurementKind)) ||
    typeof value.measurementName !== "string" || !value.measurementName ||
    !isNullableString(value.sourceDescription) ||
    !["quantity", "unit", "description"].includes(String(value.insertedField)) ||
    (typeof value.insertedValue !== "string" && (typeof value.insertedValue !== "number" || !Number.isFinite(value.insertedValue))) ||
    typeof value.insertedQuantity !== "number" || !Number.isFinite(value.insertedQuantity) ||
    typeof value.insertedUnit !== "string" || !value.insertedUnit ||
    !isTimestamp(value.sourceUpdatedAt) || !isTimestamp(value.insertedAt)
  ) return null;
  return value as unknown as WorksheetMeasureProvenanceV1;
}

export function getWorksheetCellMeasureProvenance(cell: WorksheetCell | null | undefined) {
  return parseWorksheetMeasureProvenance(cell?.metadata[MEASURE_PROVENANCE_METADATA_KEY]);
}

export function withWorksheetCellMeasureProvenance(
  cell: WorksheetCell,
  provenance: WorksheetMeasureProvenanceV1,
): WorksheetCell {
  return {
    ...cell,
    metadata: {
      ...cell.metadata,
      [MEASURE_PROVENANCE_METADATA_KEY]: provenance as unknown as Json,
    },
  };
}

export function withoutWorksheetCellMeasureProvenance(cell: WorksheetCell): WorksheetCell {
  if (!(MEASURE_PROVENANCE_METADATA_KEY in cell.metadata)) return cell;
  const metadata = { ...cell.metadata };
  delete metadata[MEASURE_PROVENANCE_METADATA_KEY];
  return { ...cell, metadata };
}

function valueSignature(cell: WorksheetCell) {
  return JSON.stringify({ value: cell.value, type: cell.type, formula: cell.formula });
}

export function invalidateChangedWorksheetMeasureProvenance(
  previousWorksheet: WorksheetData,
  nextWorksheet: WorksheetData,
): WorksheetData {
  const previousByBindingId = new Map<string, WorksheetCell>();
  Object.values(previousWorksheet.cells).forEach((cell) => {
    const provenance = getWorksheetCellMeasureProvenance(cell);
    if (cell && provenance) previousByBindingId.set(provenance.bindingId, cell);
  });

  let nextCells: WorksheetData["cells"] | null = null;
  Object.entries(nextWorksheet.cells).forEach(([cellKey, cell]) => {
    if (!cell) return;
    const provenance = getWorksheetCellMeasureProvenance(cell);
    if (!provenance) return;
    const previousCell = previousByBindingId.get(provenance.bindingId);
    if (!previousCell || valueSignature(previousCell) === valueSignature(cell)) return;
    nextCells ??= { ...nextWorksheet.cells };
    nextCells[cellKey] = withoutWorksheetCellMeasureProvenance(cell);
  });

  return nextCells ? { ...nextWorksheet, cells: nextCells } : nextWorksheet;
}
