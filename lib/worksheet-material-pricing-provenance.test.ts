import { describe, expect, it } from "vitest";
import {
  createDefaultWorksheetData,
  normalizeWorksheetCell,
  normalizeWorksheetData,
  type WorksheetData,
} from "./opportunity-pricing-worksheet-defaults";
import { applyWorksheetMutation } from "./opportunity-pricing-worksheet-mutations";
import {
  applyWorksheetPasteToCells,
  parseWorksheetClipboardText,
} from "./opportunity-pricing-worksheet-paste";
import {
  deleteWorksheetColumns,
  deleteWorksheetRows,
  insertWorksheetColumn,
  insertWorksheetRow,
} from "./opportunity-pricing-worksheet-structure";
import {
  buildWorksheetRedoState,
  buildWorksheetUndoState,
  commitWorksheetHistoryEntry,
} from "./opportunity-pricing-worksheet-history";
import {
  getWorksheetCellMaterialPricingProvenance,
  parseWorksheetMaterialPricingProvenance,
  withWorksheetCellMaterialPricingProvenance,
  type WorksheetMaterialPricingProvenance,
} from "./worksheet-material-pricing-provenance";

const PROVENANCE: WorksheetMaterialPricingProvenance = {
  version: 1,
  bindingId: "11111111-1111-4111-8111-111111111111",
  organizationMaterialId: "22222222-2222-4222-8222-222222222222",
  supplierId: "33333333-3333-4333-8333-333333333333",
  supplierProductId: "44444444-4444-4444-8444-444444444444",
  supplierPriceId: "55555555-5555-4555-8555-555555555555",
  snapshot: {
    materialName: "92mm 0.75BMT Stud",
    supplierName: "Supplier A",
    supplierProductDescription: "92mm stud",
    supplierSku: "STUD-92",
    unitCost: 4.88,
    unit: "Lm",
    currency: "NZD",
    sourceTaxBasis: "exclusive",
    sourceTaxRate: 15,
    taxJurisdictionCode: "NZ",
    priceEffectiveFrom: "2026-08-01T00:00:00.000Z",
    evaluatedAt: "2026-08-16T00:00:00.000Z",
  },
};

const V2_PROVENANCE: WorksheetMaterialPricingProvenance = {
  version: 2,
  bindingId: "66666666-6666-4666-8666-666666666666",
  organizationMaterialId: PROVENANCE.organizationMaterialId,
  supplierId: PROVENANCE.supplierId,
  supplierProductId: PROVENANCE.supplierProductId,
  sourcePricing: {
    supplierPriceId: PROVENANCE.supplierPriceId,
    unitCost: 46,
    unit: "each",
    currency: "NZD",
    sourceTaxBasis: "exclusive",
    sourceTaxRate: 15,
    taxJurisdictionCode: "NZ",
    comparisonTaxBasis: "exclusive",
    comparisonTaxRate: 15,
    priceEffectiveFrom: "2026-08-01T00:00:00.000Z",
  },
  conversion: {
    conversionId: "77777777-7777-4777-8777-777777777777",
    contractVersion: "material_unit_conversion_v2",
    confirmationSource: "user_confirmed_manual",
    supplierQuantity: 1,
    supplierUnit: "each",
    materialQuantity: 2.88,
    materialUnit: "m2",
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    confirmedAt: "2026-08-01T00:00:00.000Z",
  },
  estimatingPricing: {
    derivationKind: "confirmed_conversion",
    normalizedSourceUnitCost: 46,
    unitCost: 15.972222222222223,
    unit: "m2",
    currency: "NZD",
    taxBasis: "exclusive",
    calculationVersion: "material_estimating_price_v1",
    evaluatedAt: "2026-08-16T00:00:00.000Z",
  },
  labels: {
    materialName: "13mm GIB Fyreline",
    supplierName: "Carters",
    supplierProductDescription: "GIB Fyreline sheet",
    supplierSku: "GIB-FL-13",
  },
};

function buildBoundWorksheet(cellAddress = "B2") {
  const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 4 });
  worksheet.cells[cellAddress] = withWorksheetCellMaterialPricingProvenance(
    normalizeWorksheetCell("4.88"),
    PROVENANCE,
  );
  worksheet.cells.D4 = normalizeWorksheetCell("10");
  return worksheet;
}

function mutateCell(worksheet: WorksheetData, cellAddress: string, input: string) {
  return applyWorksheetMutation(worksheet, (current) => {
    const nextCells = { ...current.cells };
    const nextCell = normalizeWorksheetCell(input);
    if (nextCell.type === "empty") {
      delete nextCells[cellAddress];
    } else {
      nextCells[cellAddress] = nextCell;
    }
    return { ...current, cells: nextCells };
  });
}

describe("worksheet Material Pricing provenance", () => {
  it("round-trips valid optional metadata and ignores malformed metadata", () => {
    const worksheet = buildBoundWorksheet();
    const normalized = normalizeWorksheetData(JSON.parse(JSON.stringify(worksheet)));

    expect(getWorksheetCellMaterialPricingProvenance(normalized.cells.B2)).toEqual(PROVENANCE);
    expect(getWorksheetCellMaterialPricingProvenance(createDefaultWorksheetData().cells.A1)).toBeNull();
    expect(parseWorksheetMaterialPricingProvenance({ bindingId: "not-a-uuid" })).toBeNull();
  });

  it("round-trips V2 source, conversion, and estimating snapshots without reinterpreting V1", () => {
    expect(parseWorksheetMaterialPricingProvenance(V2_PROVENANCE)).toEqual(V2_PROVENANCE);
    expect(parseWorksheetMaterialPricingProvenance(PROVENANCE)).toEqual(PROVENANCE);
  });

  it("rejects internally inconsistent or tampered V2 conversion evidence", () => {
    expect(parseWorksheetMaterialPricingProvenance({
      ...V2_PROVENANCE,
      conversion: null,
    })).toBeNull();
    expect(parseWorksheetMaterialPricingProvenance({
      ...V2_PROVENANCE,
      conversion: { ...V2_PROVENANCE.conversion!, materialQuantity: 0 },
    })).toBeNull();
    expect(parseWorksheetMaterialPricingProvenance({
      ...V2_PROVENANCE,
      estimatingPricing: { ...V2_PROVENANCE.estimatingPricing, calculationVersion: "forged" },
    })).toBeNull();
  });

  it("preserves provenance for formatting-only changes", () => {
    const worksheet = buildBoundWorksheet();
    const result = applyWorksheetMutation(
      worksheet,
      (current) => ({
        ...current,
        cells: {
          ...current.cells,
          B2: {
            ...current.cells.B2!,
            metadata: {
              ...current.cells.B2!.metadata,
              format: { backgroundColor: "#ffffff" },
            },
          },
        },
      }),
      { recalculateFormulas: false },
    );

    expect(getWorksheetCellMaterialPricingProvenance(result.nextWorksheet.cells.B2)).toEqual(PROVENANCE);
  });

  it.each([
    ["manual value", "5.15"],
    ["formula", "=SUM(A1:A2)"],
    ["clear", ""],
  ])("invalidates provenance after %s replacement", (_label, input) => {
    const result = mutateCell(buildBoundWorksheet(), "B2", input);
    expect(getWorksheetCellMaterialPricingProvenance(result.nextWorksheet.cells.B2)).toBeNull();
  });

  it("moves the same binding through row and column insertion", () => {
    const rowResult = applyWorksheetMutation(buildBoundWorksheet(), (current) => insertWorksheetRow(current, 1));
    expect(getWorksheetCellMaterialPricingProvenance(rowResult.nextWorksheet.cells.B3)?.bindingId)
      .toBe(PROVENANCE.bindingId);

    const columnResult = applyWorksheetMutation(buildBoundWorksheet(), (current) => insertWorksheetColumn(current, 1));
    expect(getWorksheetCellMaterialPricingProvenance(columnResult.nextWorksheet.cells.C2)?.bindingId)
      .toBe(PROVENANCE.bindingId);
  });

  it("drops deleted bindings while preserving surviving binding identities", () => {
    const rowDeleted = applyWorksheetMutation(buildBoundWorksheet(), (current) => deleteWorksheetRows(current, 1));
    expect(Object.values(rowDeleted.nextWorksheet.cells).some(
      (cell) => getWorksheetCellMaterialPricingProvenance(cell)?.bindingId === PROVENANCE.bindingId,
    )).toBe(false);
    expect(rowDeleted.nextWorksheet.cells.D3?.value).toBe(10);

    const columnDeleted = applyWorksheetMutation(buildBoundWorksheet(), (current) => deleteWorksheetColumns(current, 1));
    expect(Object.values(columnDeleted.nextWorksheet.cells).some(
      (cell) => getWorksheetCellMaterialPricingProvenance(cell)?.bindingId === PROVENANCE.bindingId,
    )).toBe(false);
    expect(columnDeleted.nextWorksheet.cells.C4?.value).toBe(10);
  });

  it("plain TSV paste neither copies provenance nor preserves overwritten provenance", () => {
    const paste = parseWorksheetClipboardText("5.15\t6.00");
    if (!paste) throw new Error("Expected parsed paste");

    const result = applyWorksheetMutation(buildBoundWorksheet(), (current) =>
      applyWorksheetPasteToCells(current, { columnIndex: 1, rowIndex: 1 }, paste, normalizeWorksheetCell),
    );

    expect(getWorksheetCellMaterialPricingProvenance(result.nextWorksheet.cells.B2)).toBeNull();
    expect(getWorksheetCellMaterialPricingProvenance(result.nextWorksheet.cells.C2)).toBeNull();
  });

  it("full-snapshot undo and redo restore the corresponding binding state", () => {
    const original = buildBoundWorksheet();
    const edited = mutateCell(original, "B2", "5.15").nextWorksheet;
    const history = commitWorksheetHistoryEntry({
      changed: true,
      future: [],
      historyLimit: 50,
      past: [],
      previousWorksheet: original,
    });
    const undo = buildWorksheetUndoState({
      currentWorksheet: edited,
      future: history.future,
      historyLimit: 50,
      past: history.past,
    });
    expect(getWorksheetCellMaterialPricingProvenance(undo?.worksheet.cells.B2)?.bindingId)
      .toBe(PROVENANCE.bindingId);

    const redo = undo && buildWorksheetRedoState({
      currentWorksheet: undo.worksheet,
      future: undo.future,
      historyLimit: 50,
      past: undo.past,
    });
    expect(getWorksheetCellMaterialPricingProvenance(redo?.worksheet.cells.B2)).toBeNull();
  });
});
