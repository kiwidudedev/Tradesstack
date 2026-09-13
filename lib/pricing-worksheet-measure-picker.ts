import type { WorksheetCell } from "@/lib/opportunity-pricing-worksheet-defaults";
import { withWorksheetCellMeasureProvenance } from "@/lib/worksheet-measure-provenance";

export const PRICING_WORKSHEET_MEASURE_PICKER_PAGE_SIZE = 30;

export type PricingWorksheetMeasureKind = "line" | "area" | "count";
export type PricingWorksheetMeasureField = "quantity" | "unit" | "description";
export type PricingWorksheetMeasureWorkspaceStatus = "ready" | "no_workspace" | "no_drawings";

export type PricingWorksheetMeasureSource = {
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
  groupCode: string | null;
  kind: PricingWorksheetMeasureKind;
  colorHex: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  updatedAt: string;
};

export type PricingWorksheetMeasurePage = {
  items: PricingWorksheetMeasureSource[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  workspaceStatus: PricingWorksheetMeasureWorkspaceStatus;
};

export function normalizePricingWorksheetMeasureSearch(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parsePricingWorksheetMeasurePage(value: unknown): PricingWorksheetMeasurePage | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const page = Number(value.page);
  const pageSize = Number(value.pageSize);
  const total = Number(value.total);
  if (
    !Number.isInteger(page) || page < 1 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
    !Number.isInteger(total) || total < 0 ||
    typeof value.hasMore !== "boolean" ||
    !["ready", "no_workspace", "no_drawings"].includes(String(value.workspaceStatus))
  ) return null;

  const items: PricingWorksheetMeasureSource[] = [];
  for (const candidate of value.items) {
    if (!isRecord(candidate)) return null;
    if (
      typeof candidate.measurementId !== "string" || !candidate.measurementId ||
      !Number.isInteger(candidate.measurementVersion) || Number(candidate.measurementVersion) < 1 ||
      typeof candidate.projectId !== "string" || !candidate.projectId ||
      typeof candidate.drawingSetId !== "string" || !candidate.drawingSetId ||
      typeof candidate.drawingSetName !== "string" || !candidate.drawingSetName ||
      typeof candidate.pageId !== "string" || !candidate.pageId ||
      !Number.isInteger(candidate.pageNumber) || Number(candidate.pageNumber) < 1 ||
      !isNullableString(candidate.pageLabel) ||
      !isNullableString(candidate.groupId) ||
      !isNullableString(candidate.groupName) ||
      !isNullableString(candidate.groupCode) ||
      !["line", "area", "count"].includes(String(candidate.kind)) ||
      !isNullableString(candidate.colorHex) ||
      typeof candidate.name !== "string" || !candidate.name ||
      !isNullableString(candidate.description) ||
      typeof candidate.quantity !== "number" || !Number.isFinite(candidate.quantity) ||
      typeof candidate.unit !== "string" || !candidate.unit ||
      !isTimestamp(candidate.updatedAt)
    ) return null;
    items.push(candidate as PricingWorksheetMeasureSource);
  }

  return {
    items,
    page,
    pageSize,
    total,
    hasMore: value.hasMore,
    workspaceStatus: value.workspaceStatus as PricingWorksheetMeasureWorkspaceStatus,
  };
}

function baseWorksheetCell(existingCell?: WorksheetCell): WorksheetCell {
  return existingCell ?? {
    value: null,
    type: "empty",
    formula: null,
    computedValue: null,
    displayValue: "",
    metadata: {},
  };
}

export function buildMeasureWorksheetCell(params: {
  existingCell?: WorksheetCell;
  source: PricingWorksheetMeasureSource;
  field: PricingWorksheetMeasureField;
  bindingId: string;
  insertedAt: string;
}): WorksheetCell {
  const insertedValue = params.field === "quantity"
    ? params.source.quantity
    : params.field === "unit"
      ? params.source.unit
      : params.source.description ?? params.source.name;
  const nextCell: WorksheetCell = {
    ...baseWorksheetCell(params.existingCell),
    value: insertedValue,
    type: params.field === "quantity" ? "number" : "text",
    formula: null,
    computedValue: insertedValue,
    displayValue: String(insertedValue),
  };

  return withWorksheetCellMeasureProvenance(nextCell, {
    version: 1,
    bindingId: params.bindingId,
    measurementId: params.source.measurementId,
    measurementVersion: params.source.measurementVersion,
    projectId: params.source.projectId,
    drawingSetId: params.source.drawingSetId,
    drawingSetName: params.source.drawingSetName,
    pageId: params.source.pageId,
    pageNumber: params.source.pageNumber,
    pageLabel: params.source.pageLabel,
    groupId: params.source.groupId,
    groupName: params.source.groupName,
    measurementKind: params.source.kind,
    measurementName: params.source.name,
    sourceDescription: params.source.description,
    insertedField: params.field,
    insertedValue,
    insertedQuantity: params.source.quantity,
    insertedUnit: params.source.unit,
    sourceUpdatedAt: params.source.updatedAt,
    insertedAt: params.insertedAt,
  });
}
