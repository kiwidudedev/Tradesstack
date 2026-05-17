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
  const rowCount = params?.rowCount ?? 50;
  const columnCount = params?.columnCount ?? 12;

  return {
    version: 1,
    sheetName: params?.sheetName?.trim() || "Pricing Worksheet",
    rowCount,
    columnCount,
    columns: Array.from({ length: columnCount }, (_, index) => ({
      id: columnLabelFromIndex(index),
      index,
      label: columnLabelFromIndex(index),
      width: 140,
    })),
    rows: Array.from({ length: rowCount }, (_, index) => ({
      id: String(index + 1),
      index,
      height: 36,
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

export function normalizeWorksheetData(input: Json | null | undefined): WorksheetData {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createDefaultWorksheetData();
  }

  const record = input as Record<string, Json | undefined>;
  const rowCount = typeof record.rowCount === "number" && Number.isFinite(record.rowCount) ? record.rowCount : 50;
  const columnCount =
    typeof record.columnCount === "number" && Number.isFinite(record.columnCount) ? record.columnCount : 12;
  const fallback = createDefaultWorksheetData({
    sheetName: typeof record.sheetName === "string" ? record.sheetName : "Pricing Worksheet",
    rowCount,
    columnCount,
  });

  const columns = Array.isArray(record.columns) ? record.columns : fallback.columns;
  const rows = Array.isArray(record.rows) ? record.rows : fallback.rows;
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
    columns: columns as WorksheetColumn[],
    rows: rows as WorksheetRow[],
    cells,
    metadata:
      record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, Json | undefined>)
        : fallback.metadata,
  };
}
