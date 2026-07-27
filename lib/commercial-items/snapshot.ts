import type { WorksheetCell, WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { getFormattedCellDisplayValue, getCellFormat } from "@/lib/opportunity-pricing-worksheet-formatting";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import type { Json } from "@/lib/supabase/types";

export interface CommercialItemSnapshotCell {
  cellKey: string;
  rowId: string;
  rowIndex: number;
  columnId: string;
  columnIndex: number;
  type: WorksheetCell["type"];
  value: string | number | null;
  computedValue: string | number | null;
  displayValue: string;
  format: {
    numberKind: string | null;
    textAlign: string | null;
    textWrapMode: string | null;
  };
}

export interface CommercialItemWorksheetSnapshot {
  version: 1;
  sheetName: string;
  rangeLabel: string;
  rowCount: number;
  columnCount: number;
  cellCount: number;
  nonEmptyCellCount: number;
  columns: Array<{ id: string; index: number; label: string }>;
  rows: Array<{ id: string; index: number }>;
  cells: CommercialItemSnapshotCell[];
}

export interface CommercialItemSourceLinkPayload {
  version: 1;
  sourceType: "worksheet_selection";
  ownerType: PricingWorksheetOwnerContextValue["ownerType"] | null;
  opportunityId: string | null;
  opportunitySlug: string | null;
  projectId: string | null;
  projectSlug: string | null;
  quoteId: string | null;
  variationId: string | null;
  worksheetId: string;
  workbookId: string;
  sheetId: string;
  worksheetName: string;
  sheetName: string;
  range: string;
  rowCount: number;
  columnCount: number;
  cellCount: number;
  worksheetVersion: number;
  capturedAt: string;
}

export interface CommercialItemLockedMetadataPayload {
  version: 1;
  worksheetVersion: number;
  sheetName: string;
  rangeLabel: string;
  worksheetMetadata: Record<string, Json | undefined>;
  cells: Array<{
    cellKey: string;
    rowId: string;
    rowIndex: number;
    columnId: string;
    columnIndex: number;
    formula: string | null;
    value: string | number | null;
    computedValue: string | number | null;
    displayValue: string;
    metadata: Record<string, Json | undefined>;
  }>;
}

function sanitizeScalar(value: WorksheetCell["value"] | WorksheetCell["computedValue"]) {
  if (typeof value === "string" || typeof value === "number" || value === null) {
    return value;
  }

  return null;
}

function sanitizeCellForSnapshot(params: {
  cell: WorksheetCell | undefined;
  cellKey: string;
  rowId: string;
  rowIndex: number;
  columnId: string;
  columnIndex: number;
}): CommercialItemSnapshotCell {
  const { cell, cellKey, rowId, rowIndex, columnId, columnIndex } = params;
  const format = getCellFormat(cell);

  return {
    cellKey,
    rowId,
    rowIndex,
    columnId,
    columnIndex,
    type: cell?.type ?? "empty",
    value: cell?.formula ? sanitizeScalar(cell.computedValue ?? null) : sanitizeScalar(cell?.value ?? null),
    computedValue: sanitizeScalar(cell?.computedValue ?? null),
    displayValue: getFormattedCellDisplayValue(cell),
    format: {
      numberKind: format.number?.kind ?? null,
      textAlign: format.text?.align ?? null,
      textWrapMode: format.text?.wrap ?? null,
    },
  };
}

export function buildWorksheetSelectionRangeLabel(
  worksheet: WorksheetData,
  range: WorksheetSelectionRange,
) {
  const startRow = worksheet.rows[range.startRowIndex];
  const endRow = worksheet.rows[range.endRowIndex];
  const startColumn = worksheet.columns[range.startColumnIndex];
  const endColumn = worksheet.columns[range.endColumnIndex];

  if (!startRow || !endRow || !startColumn || !endColumn) {
    throw new Error("Worksheet selection is out of bounds.");
  }

  return `${startColumn.id}${startRow.id}:${endColumn.id}${endRow.id}`;
}

export function buildCommercialItemWorksheetSnapshot(params: {
  worksheet: WorksheetData;
  range: WorksheetSelectionRange;
  sheetName: string;
}): CommercialItemWorksheetSnapshot {
  const { worksheet, range, sheetName } = params;
  const columns = worksheet.columns
    .slice(range.startColumnIndex, range.endColumnIndex + 1)
    .map((column) => ({ id: column.id, index: column.index, label: column.label }));
  const rows = worksheet.rows
    .slice(range.startRowIndex, range.endRowIndex + 1)
    .map((row) => ({ id: row.id, index: row.index }));
  const cells: CommercialItemSnapshotCell[] = [];

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    const row = worksheet.rows[rowIndex];
    if (!row) {
      continue;
    }

    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      const column = worksheet.columns[columnIndex];
      if (!column) {
        continue;
      }

      const cellKey = `${column.id}${row.id}`;
      cells.push(
        sanitizeCellForSnapshot({
          cell: worksheet.cells[cellKey],
          cellKey,
          rowId: row.id,
          rowIndex,
          columnId: column.id,
          columnIndex,
        }),
      );
    }
  }

  return {
    version: 1,
    sheetName,
    rangeLabel: buildWorksheetSelectionRangeLabel(worksheet, range),
    rowCount: rows.length,
    columnCount: columns.length,
    cellCount: rows.length * columns.length,
    nonEmptyCellCount: cells.filter((cell) => cell.displayValue.trim().length > 0).length,
    columns,
    rows,
    cells,
  };
}

export function buildCommercialItemSourceLink(params: {
  workbookId: string;
  worksheetId: string;
  sheetId: string;
  worksheetName: string;
  sheetName: string;
  worksheet: WorksheetData;
  range: WorksheetSelectionRange;
  owner?: PricingWorksheetOwnerContextValue | null;
  capturedAt?: string;
}): CommercialItemSourceLinkPayload {
  const snapshot = buildCommercialItemWorksheetSnapshot({
    worksheet: params.worksheet,
    range: params.range,
    sheetName: params.sheetName,
  });

  return {
    version: 1,
    sourceType: "worksheet_selection",
    ownerType: params.owner?.ownerType ?? null,
    opportunityId: params.owner?.opportunityId ?? null,
    opportunitySlug: params.owner?.opportunitySlug ?? null,
    projectId: params.owner?.projectId ?? null,
    projectSlug: params.owner?.projectSlug ?? null,
    quoteId: params.owner?.quoteId ?? null,
    variationId: params.owner?.variationId ?? null,
    worksheetId: params.worksheetId,
    workbookId: params.workbookId,
    sheetId: params.sheetId,
    worksheetName: params.worksheetName,
    sheetName: params.sheetName,
    range: snapshot.rangeLabel,
    rowCount: snapshot.rowCount,
    columnCount: snapshot.columnCount,
    cellCount: snapshot.cellCount,
    worksheetVersion: params.worksheet.version,
    capturedAt: params.capturedAt ?? new Date().toISOString(),
  };
}

export function buildCommercialItemLockedMetadata(params: {
  worksheet: WorksheetData;
  range: WorksheetSelectionRange;
  sheetName: string;
}): CommercialItemLockedMetadataPayload {
  const { worksheet, range, sheetName } = params;
  const cells: CommercialItemLockedMetadataPayload["cells"] = [];

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    const row = worksheet.rows[rowIndex];
    if (!row) {
      continue;
    }

    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      const column = worksheet.columns[columnIndex];
      if (!column) {
        continue;
      }

      const cellKey = `${column.id}${row.id}`;
      const cell = worksheet.cells[cellKey];
      cells.push({
        cellKey,
        rowId: row.id,
        rowIndex,
        columnId: column.id,
        columnIndex,
        formula: cell?.formula ?? null,
        value: sanitizeScalar(cell?.value ?? null),
        computedValue: sanitizeScalar(cell?.computedValue ?? null),
        displayValue: typeof cell?.displayValue === "string" ? cell.displayValue : "",
        metadata: { ...(cell?.metadata ?? {}) },
      });
    }
  }

  return {
    version: 1,
    worksheetVersion: worksheet.version,
    sheetName,
    rangeLabel: buildWorksheetSelectionRangeLabel(worksheet, range),
    worksheetMetadata: { ...worksheet.metadata },
    cells,
  };
}

export function deriveCommercialItemDescriptionFromSnapshot(snapshot: CommercialItemWorksheetSnapshot) {
  const firstPopulatedCell = snapshot.cells.find((cell) => cell.displayValue.trim().length > 0);
  if (!firstPopulatedCell) {
    return `Worksheet selection ${snapshot.rangeLabel}`;
  }

  return firstPopulatedCell.displayValue.trim().slice(0, 120);
}
