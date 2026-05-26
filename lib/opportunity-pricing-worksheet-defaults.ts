import type { Json } from "@/lib/supabase/types";

export type WorksheetCellType = "text" | "number" | "empty";

export interface WorksheetColumn {
  id: string;
  index: number;
  label: string;
  width: number;
}

export interface WorksheetRow {
  id: string;
  index: number;
  height: number;
}

export interface WorksheetCell {
  value: string | number | null;
  type: WorksheetCellType;
  formula: string | null;
  computedValue: string | number | null;
  displayValue: string;
  metadata: Record<string, Json | undefined>;
}

export interface WorksheetData {
  version: number;
  sheetName: string;
  rowCount: number;
  columnCount: number;
  columns: WorksheetColumn[];
  rows: WorksheetRow[];
  cells: Record<string, WorksheetCell | undefined>;
  metadata: Record<string, Json | undefined>;
}

export interface WorksheetPricingSummary {
  version: number;
  currency: string;
  subtotal: number | null;
  margin: number | null;
  gst: number | null;
  grandTotal: number | null;
  lastCalculatedAt: string | null;
}

export interface WorksheetExtractedPricingData {
  version: number;
  extractedAt: string | null;
  method: "ai";
  confidence: number | null;
  lineItems: Json[];
  summary: Record<string, Json | undefined>;
  warnings: Json[];
  sourceWorksheetVersion: number;
}

export const DEFAULT_WORKSHEET_ROW_COUNT = 500;
export const DEFAULT_WORKSHEET_COLUMN_COUNT = 26;
const DEFAULT_WORKSHEET_COLUMN_WIDTH = 140;
const DEFAULT_WORKSHEET_ROW_HEIGHT = 36;

function columnLabelFromIndex(index: number) {
  let current = index;
  let label = "";

  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return label;
}

export function createDefaultWorksheetData(params?: {
  sheetName?: string;
  rowCount?: number;
  columnCount?: number;
}): WorksheetData {
  const rowCount = params?.rowCount ?? DEFAULT_WORKSHEET_ROW_COUNT;
  const columnCount = params?.columnCount ?? DEFAULT_WORKSHEET_COLUMN_COUNT;

  return {
    version: 1,
    sheetName: params?.sheetName?.trim() || "Pricing Worksheet",
    rowCount,
    columnCount,
    columns: Array.from({ length: columnCount }, (_, index) => ({
      id: columnLabelFromIndex(index),
      index,
      label: columnLabelFromIndex(index),
      width: DEFAULT_WORKSHEET_COLUMN_WIDTH,
    })),
    rows: Array.from({ length: rowCount }, (_, index) => ({
      id: String(index + 1),
      index,
      height: DEFAULT_WORKSHEET_ROW_HEIGHT,
    })),
    cells: {},
    metadata: {
      templateId: null,
      notes: null,
    },
  };
}

export function createDefaultWorksheetPricingSummary(): WorksheetPricingSummary {
  return {
    version: 1,
    currency: "NZD",
    subtotal: null,
    margin: null,
    gst: null,
    grandTotal: null,
    lastCalculatedAt: null,
  };
}

export function createDefaultWorksheetExtractedPricingData(
  sourceWorksheetVersion = 1
): WorksheetExtractedPricingData {
  return {
    version: 1,
    extractedAt: null,
    method: "ai",
    confidence: null,
    lineItems: [],
    summary: {},
    warnings: [],
    sourceWorksheetVersion,
  };
}

export function normalizeWorksheetCell(input: string): WorksheetCell {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return {
      value: null,
      type: "empty",
      formula: null,
      computedValue: null,
      displayValue: "",
      metadata: {},
    };
  }

  if (trimmed.startsWith("=")) {
    return {
      value: input,
      type: "text",
      formula: input,
      computedValue: input,
      displayValue: input,
      metadata: {},
    };
  }

  const parsedNumber = Number(trimmed);
  if (Number.isFinite(parsedNumber) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return {
      value: parsedNumber,
      type: "number",
      formula: null,
      computedValue: parsedNumber,
      displayValue: trimmed,
      metadata: {},
    };
  }

  return {
    value: input,
    type: "text",
    formula: null,
    computedValue: input,
    displayValue: input,
    metadata: {},
  };
}

function createDefaultWorksheetColumn(index: number): WorksheetColumn {
  return {
    id: columnLabelFromIndex(index),
    index,
    label: columnLabelFromIndex(index),
    width: DEFAULT_WORKSHEET_COLUMN_WIDTH,
  };
}

function createDefaultWorksheetRow(index: number): WorksheetRow {
  return {
    id: String(index + 1),
    index,
    height: DEFAULT_WORKSHEET_ROW_HEIGHT,
  };
}

function normalizeWorksheetColumns(input: Json | undefined, columnCount: number): WorksheetColumn[] {
  const source = Array.isArray(input) ? input : [];

  return Array.from({ length: columnCount }, (_, index) => {
    const fallback = createDefaultWorksheetColumn(index);
    const rawValue = source[index];

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      return fallback;
    }

    const columnRecord = rawValue as Record<string, Json | undefined>;

    return {
      id: typeof columnRecord.id === "string" && columnRecord.id.trim() ? columnRecord.id : fallback.id,
      index,
      label:
        typeof columnRecord.label === "string" && columnRecord.label.trim() ? columnRecord.label : fallback.label,
      width:
        typeof columnRecord.width === "number" && Number.isFinite(columnRecord.width)
          ? columnRecord.width
          : fallback.width,
    };
  });
}

function normalizeWorksheetRows(input: Json | undefined, rowCount: number): WorksheetRow[] {
  const source = Array.isArray(input) ? input : [];

  return Array.from({ length: rowCount }, (_, index) => {
    const fallback = createDefaultWorksheetRow(index);
    const rawValue = source[index];

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      return fallback;
    }

    const rowRecord = rawValue as Record<string, Json | undefined>;

    return {
      id: typeof rowRecord.id === "string" && rowRecord.id.trim() ? rowRecord.id : fallback.id,
      index,
      height:
        typeof rowRecord.height === "number" && Number.isFinite(rowRecord.height)
          ? rowRecord.height
          : fallback.height,
    };
  });
}

export function normalizeWorksheetData(input: Json | null | undefined): WorksheetData {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createDefaultWorksheetData();
  }

  const record = input as Record<string, Json | undefined>;
  const rawRows = Array.isArray(record.rows) ? record.rows : [];
  const rawColumns = Array.isArray(record.columns) ? record.columns : [];
  const declaredRowCount =
    typeof record.rowCount === "number" && Number.isFinite(record.rowCount) ? record.rowCount : rawRows.length;
  const declaredColumnCount =
    typeof record.columnCount === "number" && Number.isFinite(record.columnCount) ? record.columnCount : rawColumns.length;
  const rowCount = Math.max(DEFAULT_WORKSHEET_ROW_COUNT, declaredRowCount, rawRows.length);
  const columnCount = Math.max(DEFAULT_WORKSHEET_COLUMN_COUNT, declaredColumnCount, rawColumns.length);
  const fallback = createDefaultWorksheetData({
    sheetName: typeof record.sheetName === "string" ? record.sheetName : "Pricing Worksheet",
    rowCount,
    columnCount,
  });

  const columns = normalizeWorksheetColumns(record.columns, columnCount);
  const rows = normalizeWorksheetRows(record.rows, rowCount);
  const rawCells =
    record.cells && typeof record.cells === "object" && !Array.isArray(record.cells)
      ? (record.cells as Record<string, Json | undefined>)
      : {};

  const cells: Record<string, WorksheetCell | undefined> = {};
  Object.entries(rawCells).forEach(([key, rawValue]) => {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      return;
    }

    const cellRecord = rawValue as Record<string, Json | undefined>;
    const displayValue =
      typeof cellRecord.displayValue === "string"
        ? cellRecord.displayValue
        : typeof cellRecord.value === "string"
        ? cellRecord.value
        : cellRecord.value === null || cellRecord.value === undefined
        ? ""
        : String(cellRecord.value);
    const type =
      cellRecord.type === "text" || cellRecord.type === "number" || cellRecord.type === "empty"
        ? cellRecord.type
        : "text";

    cells[key] = {
      value:
        typeof cellRecord.value === "string" || typeof cellRecord.value === "number" || cellRecord.value === null
          ? cellRecord.value
          : null,
      type,
      formula: typeof cellRecord.formula === "string" ? cellRecord.formula : null,
      computedValue:
        typeof cellRecord.computedValue === "string" ||
        typeof cellRecord.computedValue === "number" ||
        cellRecord.computedValue === null
          ? cellRecord.computedValue
          : null,
      displayValue,
      metadata:
        cellRecord.metadata && typeof cellRecord.metadata === "object" && !Array.isArray(cellRecord.metadata)
          ? (cellRecord.metadata as Record<string, Json | undefined>)
          : {},
    };
  });

  return {
    version: typeof record.version === "number" && Number.isFinite(record.version) ? record.version : 1,
    sheetName: typeof record.sheetName === "string" && record.sheetName.trim() ? record.sheetName : fallback.sheetName,
    rowCount,
    columnCount,
    columns,
    rows,
    cells,
    metadata:
      record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, Json | undefined>)
        : fallback.metadata,
  };
}
