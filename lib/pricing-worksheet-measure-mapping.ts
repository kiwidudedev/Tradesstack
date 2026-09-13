import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { getWorksheetAnchorPosition } from "@/lib/opportunity-pricing-worksheet-paste";
import {
  buildMeasureWorksheetCell,
  type PricingWorksheetMeasureField,
  type PricingWorksheetMeasureSource,
} from "@/lib/pricing-worksheet-measure-picker";
import {
  buildWorksheetStructureKey,
  type WorksheetFieldMappingSession,
} from "@/lib/worksheet-cell-mapping";

export const PRICING_WORKSHEET_MEASURE_MAPPING_FIELDS = ["description", "quantity", "unit"] as const satisfies readonly PricingWorksheetMeasureField[];

export type PricingWorksheetMeasureInsertConflict = {
  field: PricingWorksheetMeasureField;
  cellKey: string;
  formula: string | null;
  currentValue: string;
};

export type PricingWorksheetMeasureMappedEntry = {
  field: PricingWorksheetMeasureField;
  target: NonNullable<WorksheetFieldMappingSession<PricingWorksheetMeasureField>["mappings"][PricingWorksheetMeasureField]>;
};

export function validatePricingWorksheetMeasureMappings(params: {
  session: WorksheetFieldMappingSession<PricingWorksheetMeasureField>;
  worksheet: WorksheetData;
  workbookId: string | null;
  sheetId: string | null;
}): { entries: PricingWorksheetMeasureMappedEntry[]; error: string | null } {
  const entries = PRICING_WORKSHEET_MEASURE_MAPPING_FIELDS.flatMap((field) => {
    const target = params.session.mappings[field];
    return target ? [{ field, target }] : [];
  });
  if (entries.length === 0) return { entries, error: "Map at least one Measure field to a worksheet cell." };
  const cellKeys = entries.map(({ target }) => target.cellKey);
  const structureKey = buildWorksheetStructureKey(params.worksheet);
  if (
    !params.workbookId ||
    params.workbookId !== params.session.workbookId ||
    params.sheetId !== params.session.sheetId ||
    structureKey !== params.session.structureKey ||
    new Set(cellKeys).size !== cellKeys.length ||
    entries.some(({ target }) =>
      target.workbookId !== params.workbookId ||
      target.sheetId !== params.sheetId ||
      target.structureKey !== structureKey ||
      !getWorksheetAnchorPosition(params.worksheet, target.cellKey)
    )
  ) {
    return { entries, error: "Measure destinations changed or are no longer available. Map the cells again and retry." };
  }
  return { entries, error: null };
}

export function buildPricingWorksheetMeasureInsertConflicts(
  worksheet: WorksheetData,
  entries: PricingWorksheetMeasureMappedEntry[],
): PricingWorksheetMeasureInsertConflict[] {
  return entries.flatMap(({ field, target }) => {
    const cell = worksheet.cells[target.cellKey];
    if (!cell || (!cell.formula && (cell.value === null || cell.value === ""))) return [];
    return [{
      field,
      cellKey: target.cellKey,
      formula: cell.formula,
      currentValue: cell.displayValue || String(cell.value ?? ""),
    }];
  });
}

export function buildPricingWorksheetMeasureConflictSignature(
  conflicts: PricingWorksheetMeasureInsertConflict[],
) {
  return JSON.stringify(conflicts);
}

export function applyPricingWorksheetMeasureMappings(params: {
  worksheet: WorksheetData;
  entries: PricingWorksheetMeasureMappedEntry[];
  source: PricingWorksheetMeasureSource;
  insertedAt: string;
  createBindingId?: () => string;
}): WorksheetData {
  const createBindingId = params.createBindingId ?? (() => crypto.randomUUID());
  return {
    ...params.worksheet,
    cells: params.entries.reduce((cells, { field, target }) => ({
      ...cells,
      [target.cellKey]: buildMeasureWorksheetCell({
        existingCell: cells[target.cellKey],
        source: params.source,
        field,
        bindingId: createBindingId(),
        insertedAt: params.insertedAt,
      }),
    }), { ...params.worksheet.cells }),
  };
}
