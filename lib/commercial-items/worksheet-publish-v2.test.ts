import { describe, expect, it } from "vitest";
import { buildCommercialItemSourceSignature } from "@/lib/commercial-items/source-signature";
import {
  buildPublishedWorksheetSelectionFromConfirmedLines,
  interpretWorksheetSelectionForPublish,
} from "@/lib/commercial-items/worksheet-publish-v2";
import { createDefaultWorksheetData, type WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import { recalculateWorksheetFormulas } from "@/lib/opportunity-pricing-worksheet-formulas";

function setCell(
  worksheet: WorksheetData,
  cellKey: string,
  params: { value?: string | number | null; formula?: string | null },
) {
  const value = params.formula ?? params.value ?? null;
  const displayValue = value === null ? "" : String(value);

  worksheet.cells[cellKey] = {
    value,
    type: typeof params.value === "number" ? "number" : typeof value === "string" ? "text" : "empty",
    formula: params.formula ?? null,
    computedValue: value,
    displayValue,
    metadata: {},
  };
}

function buildRange(
  startRowIndex: number,
  endRowIndex: number,
  endColumnIndex = 4,
): WorksheetSelectionRange {
  return {
    startRowIndex,
    endRowIndex,
    startColumnIndex: 0,
    endColumnIndex,
  };
}

describe("worksheet-publish-v2", () => {
  it("creates one draft line from a contiguous selection", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 6, columnCount: 5 });
    setCell(worksheet, "A2", { value: "GIB plasterboard" });
    setCell(worksheet, "B2", { value: 10 });
    setCell(worksheet, "C2", { value: "sheet" });
    setCell(worksheet, "D2", { value: 20 });
    setCell(worksheet, "E2", { formula: "=B2*D2" });
    const calculated = recalculateWorksheetFormulas(worksheet);

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet: calculated,
      selectionRange: buildRange(1, 1),
    });

    expect(interpreted.proposedLines).toHaveLength(1);
    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "GIB plasterboard" },
      quantity: { value: 10 },
      unit: { value: "sheet" },
      rate: { value: 20 },
      total: { value: 200 },
    });
  });

  it("keeps a calculator block as one draft line", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 8, columnCount: 3 });
    setCell(worksheet, "A2", { value: "Sheets Required" });
    setCell(worksheet, "B2", { value: 92 });
    setCell(worksheet, "A3", { value: "Board Rate" });
    setCell(worksheet, "B3", { value: 30 });
    setCell(worksheet, "A4", { value: "Board Supply Cost" });
    setCell(worksheet, "B4", { formula: "=B2*B3" });
    const calculated = recalculateWorksheetFormulas(worksheet);

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet: calculated,
      selectionRange: buildRange(1, 3, 2),
    });

    expect(interpreted.proposedLines).toHaveLength(1);
    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "Board Supply Cost", confidence: "high" },
      quantity: { value: 92, confidence: "high" },
      unit: { value: "Sheets", confidence: "medium" },
      rate: { value: 30, confidence: "high" },
      total: { value: 2760, confidence: "high" },
    });
  });

  it("ignores neighbouring cells outside the exact selection", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 8, columnCount: 4 });
    setCell(worksheet, "A2", { value: "Selected Description" });
    setCell(worksheet, "B2", { value: 25 });
    setCell(worksheet, "C2", { value: "sheet" });
    setCell(worksheet, "D2", { value: 40 });
    setCell(worksheet, "A3", { value: "Outside Description" });
    setCell(worksheet, "B3", { value: 999 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 2,
      },
    });

    expect(interpreted.visibleSelectedValues).toEqual(["Selected Description", "25", "sheet"]);
    expect(interpreted.proposedLines[0]?.description.value).toBe("Selected Description");
    expect(interpreted.proposedLines[0]?.rate.value).toBeNull();
  });

  it("leaves unit blank when selected text values do not include a recognized unit token", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 4, columnCount: 3 });
    setCell(worksheet, "A2", { value: "Alpha" });
    setCell(worksheet, "B2", { value: "Beta" });
    setCell(worksheet, "C2", { value: 12 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 2,
      },
    });

    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "Alpha" },
      unit: { value: null },
    });
  });

  it("does not treat currency formatting as a unit", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 4, columnCount: 3 });
    setCell(worksheet, "A2", { value: "Board Supply Cost" });
    setCell(worksheet, "B2", { value: "$" });
    setCell(worksheet, "C2", { value: 2760 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 2,
      },
    });

    expect(interpreted.proposedLines[0]?.unit.value).toBeNull();
  });

  it("retains the original selected range for source provenance", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 8, columnCount: 3 });
    worksheet.version = 9;
    setCell(worksheet, "A2", { value: "Sheets Required" });
    setCell(worksheet, "B2", { value: 92 });
    setCell(worksheet, "A3", { value: "Board Rate" });
    setCell(worksheet, "B3", { value: 30 });
    setCell(worksheet, "A4", { value: "Board Supply Cost" });
    setCell(worksheet, "B4", { formula: "=B2*B3" });
    const calculated = recalculateWorksheetFormulas(worksheet);
    const selectionRange = buildRange(1, 3, 2);
    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet: calculated,
      selectionRange,
    });
    const proposal = interpreted.proposedLines[0]!;

    const published = buildPublishedWorksheetSelectionFromConfirmedLines({
      destination: "purchase_order",
      worksheet: calculated,
      selectionRange,
      workbookId: "wb-1",
      worksheetId: "wb-1",
      sheetId: "sheet-1",
      worksheetName: "Board package",
      sheetName: "Page 1",
      interpretedSelection: interpreted,
      confirmedLines: [
        {
          proposalId: proposal.id,
          description: "Board Supply Cost",
          quantity: 92,
          unit: "Sheets",
          rate: 30,
          total: 2760,
        },
      ],
    });

    expect(published.commercialRows).toHaveLength(1);
    expect(published.commercialRows[0]?.sourceRangeLabel).toBe("A2:C4");
    expect((published.commercialRows[0]?.lockedMetadataJson as {
      worksheetMetadata?: { worksheetPublishV2?: { selectedValues?: string[] } };
    }).worksheetMetadata?.worksheetPublishV2?.selectedValues).toContain("Board Supply Cost");
  });

  it("uses five scattered cells as one purchase-order draft line", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Sheet 1", rowCount: 20, columnCount: 6 });
    setCell(worksheet, "B15", { value: "Board Supply Cost" });
    setCell(worksheet, "E13", { value: 92 });
    setCell(worksheet, "D13", { value: "sheets" });
    setCell(worksheet, "F14", { value: 30 });
    setCell(worksheet, "E15", { value: 2760 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet,
      selectionRange: {
        startRowIndex: 14,
        endRowIndex: 14,
        startColumnIndex: 1,
        endColumnIndex: 1,
      },
      selectionRanges: [
        { startRowIndex: 14, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 1 },
        { startRowIndex: 12, endRowIndex: 12, startColumnIndex: 4, endColumnIndex: 4 },
        { startRowIndex: 12, endRowIndex: 12, startColumnIndex: 3, endColumnIndex: 3 },
        { startRowIndex: 13, endRowIndex: 13, startColumnIndex: 5, endColumnIndex: 5 },
        { startRowIndex: 14, endRowIndex: 14, startColumnIndex: 4, endColumnIndex: 4 },
      ],
    });

    expect(interpreted.selectionRangeLabel).toBe("5 selected cells on Sheet 1");
    expect(interpreted.visibleSelectedValues).toEqual([
      "sheets",
      "92",
      "30",
      "Board Supply Cost",
      "2760",
    ]);
    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "Board Supply Cost" },
      quantity: { value: 92 },
      unit: { value: "sheets" },
      rate: { value: 30 },
      total: { value: 2760 },
    });
  });

  it("preserves both selected text values for scattered selections without reinterpreting them", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Sheet 1", rowCount: 20, columnCount: 6 });
    setCell(worksheet, "B15", { value: "92mm 0.75BMT Stud" });
    setCell(worksheet, "E13", { value: 660 });
    setCell(worksheet, "D13", { value: "L/m" });
    setCell(worksheet, "F14", { value: 4.88 });
    setCell(worksheet, "E15", { value: 3220.8 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "quote",
      worksheet,
      selectionRange: {
        startRowIndex: 14,
        endRowIndex: 14,
        startColumnIndex: 1,
        endColumnIndex: 1,
      },
      selectionRanges: [
        { startRowIndex: 14, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 1 },
        { startRowIndex: 12, endRowIndex: 12, startColumnIndex: 4, endColumnIndex: 4 },
        { startRowIndex: 12, endRowIndex: 12, startColumnIndex: 3, endColumnIndex: 3 },
        { startRowIndex: 13, endRowIndex: 13, startColumnIndex: 5, endColumnIndex: 5 },
        { startRowIndex: 14, endRowIndex: 14, startColumnIndex: 4, endColumnIndex: 4 },
      ],
    });

    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "92mm 0.75BMT Stud" },
      quantity: { value: 660 },
      unit: { value: "L/m" },
      rate: { value: 4.88 },
      total: { value: 3220.8 },
    });
  });

  it("preserves both selected text values for a single-row selection when one matches a recognized unit token", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 6, columnCount: 5 });
    setCell(worksheet, "A2", { value: "92mm 0.75BMT Stud" });
    setCell(worksheet, "B2", { value: 660 });
    setCell(worksheet, "C2", { value: "L/m" });
    setCell(worksheet, "D2", { value: 4.88 });
    setCell(worksheet, "E2", { value: 3220.8 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "quote",
      worksheet,
      selectionRange: buildRange(1, 1),
    });

    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "92mm 0.75BMT Stud" },
      quantity: { value: 660 },
      unit: { value: "L/m" },
      rate: { value: 4.88 },
      total: { value: 3220.8 },
    });
  });

  it("leaves unit blank for scattered selections when no selected text matches a recognized unit token", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Sheet 1", rowCount: 20, columnCount: 6 });
    setCell(worksheet, "B15", { value: "Steel Stud" });
    setCell(worksheet, "D13", { value: "Fire Rated" });
    setCell(worksheet, "E13", { value: 660 });
    setCell(worksheet, "F14", { value: 4.88 });
    setCell(worksheet, "E15", { value: 3220.8 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "quote",
      worksheet,
      selectionRange: {
        startRowIndex: 14,
        endRowIndex: 14,
        startColumnIndex: 1,
        endColumnIndex: 1,
      },
      selectionRanges: [
        { startRowIndex: 14, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 1 },
        { startRowIndex: 12, endRowIndex: 12, startColumnIndex: 3, endColumnIndex: 3 },
        { startRowIndex: 12, endRowIndex: 12, startColumnIndex: 4, endColumnIndex: 4 },
        { startRowIndex: 13, endRowIndex: 13, startColumnIndex: 5, endColumnIndex: 5 },
        { startRowIndex: 14, endRowIndex: 14, startColumnIndex: 4, endColumnIndex: 4 },
      ],
    });

    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "Steel Stud" },
      unit: { value: null },
      quantity: { value: 660 },
      rate: { value: 4.88 },
      total: { value: 3220.8 },
    });
  });

  it("leaves unit blank for single-row selections when no selected text matches a recognized unit token", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 6, columnCount: 5 });
    setCell(worksheet, "A2", { value: "Material" });
    setCell(worksheet, "B2", { value: 660 });
    setCell(worksheet, "C2", { value: "Length" });
    setCell(worksheet, "D2", { value: 4.88 });
    setCell(worksheet, "E2", { value: 3220.8 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "quote",
      worksheet,
      selectionRange: buildRange(1, 1),
    });

    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "Material" },
      unit: { value: null },
      quantity: { value: 660 },
      rate: { value: 4.88 },
      total: { value: 3220.8 },
    });
  });

  it("promotes a recognized unit token while leaving the remaining selected text as description", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 6, columnCount: 3 });
    setCell(worksheet, "A2", { value: "Description" });
    setCell(worksheet, "B2", { value: "sheet" });
    setCell(worksheet, "C2", { value: 12 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "quote",
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 2,
      },
    });

    expect(interpreted.proposedLines[0]).toMatchObject({
      description: { value: "Description" },
      unit: { value: "sheet" },
    });
  });

  it("deduplicates overlapping cells across multiple ranges", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Sheet 1", rowCount: 6, columnCount: 4 });
    setCell(worksheet, "A1", { value: "alpha" });
    setCell(worksheet, "B1", { value: "beta" });
    setCell(worksheet, "B2", { value: 25 });

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet,
      selectionRange: {
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 1,
      },
      selectionRanges: [
        { startRowIndex: 0, endRowIndex: 0, startColumnIndex: 0, endColumnIndex: 1 },
        { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 1 },
      ],
    });

    expect(interpreted.visibleSelectedValues).toEqual(["alpha", "beta", "25"]);
  });

  it("treats literal and formula cells the same for isolated scattered selection ranges", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Sheet 1", rowCount: 12, columnCount: 10 });
    setCell(worksheet, "A9", { value: "Wall Zone Quantities" });
    setCell(worksheet, "J9", { formula: "=5+5" });
    const calculated = recalculateWorksheetFormulas(worksheet);
    const selectionRange = {
      startRowIndex: 8,
      endRowIndex: 8,
      startColumnIndex: 0,
      endColumnIndex: 0,
    };
    const selectionRanges = [
      selectionRange,
      {
        startRowIndex: 8,
        endRowIndex: 8,
        startColumnIndex: 9,
        endColumnIndex: 9,
      },
    ];

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "variation",
      worksheet: calculated,
      selectionRange,
      selectionRanges,
    });

    expect(interpreted.selectionRanges).toEqual(selectionRanges);
    expect(interpreted.visibleSelectedValues).toEqual(["Wall Zone Quantities", "10"]);
  });

  it("stores all original ranges in locked provenance for multi-selection", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Sheet 1", rowCount: 20, columnCount: 6 });
    worksheet.version = 9;
    setCell(worksheet, "B15", { value: "Board Supply Cost" });
    setCell(worksheet, "E13", { value: 92 });
    setCell(worksheet, "D13", { value: "sheets" });
    setCell(worksheet, "F14", { value: 30 });
    setCell(worksheet, "E15", { value: 2760 });
    const selectionRange = { startRowIndex: 14, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 1 };
    const selectionRanges = [
      selectionRange,
      { startRowIndex: 12, endRowIndex: 12, startColumnIndex: 4, endColumnIndex: 4 },
      { startRowIndex: 12, endRowIndex: 12, startColumnIndex: 3, endColumnIndex: 3 },
      { startRowIndex: 13, endRowIndex: 13, startColumnIndex: 5, endColumnIndex: 5 },
      { startRowIndex: 14, endRowIndex: 14, startColumnIndex: 4, endColumnIndex: 4 },
    ];

    const interpreted = interpretWorksheetSelectionForPublish({
      destination: "purchase_order",
      worksheet,
      selectionRange,
      selectionRanges,
    });
    const proposal = interpreted.proposedLines[0]!;
    const published = buildPublishedWorksheetSelectionFromConfirmedLines({
      destination: "purchase_order",
      worksheet,
      selectionRange,
      selectionRanges,
      workbookId: "wb-1",
      worksheetId: "wb-1",
      sheetId: "sheet-1",
      worksheetName: "Board package",
      sheetName: "Sheet 1",
      interpretedSelection: interpreted,
      confirmedLines: [
        {
          proposalId: proposal.id,
          description: "Board Supply Cost",
          quantity: 92,
          unit: "sheets",
          rate: 30,
          total: 2760,
        },
      ],
    });

    expect(published.commercialRows[0]?.sourceRangeLabel).toBe("5 selected cells on Sheet 1");
    expect((published.commercialRows[0]?.sourceLinkJson as {
      range?: string;
      rowCount?: number;
      columnCount?: number;
      cellCount?: number;
    })).toMatchObject({
      range: "5 selected cells on Sheet 1",
      rowCount: 3,
      columnCount: 4,
      cellCount: 5,
    });
    expect((published.commercialRows[0]?.snapshotJson as {
      rangeLabel?: string;
      rowCount?: number;
      columnCount?: number;
      cellCount?: number;
    })).toMatchObject({
      rangeLabel: "5 selected cells on Sheet 1",
      rowCount: 3,
      columnCount: 4,
      cellCount: 5,
    });
    expect((published.commercialRows[0]?.lockedMetadataJson as {
      rangeLabel?: string;
      worksheetMetadata?: {
        worksheetPublishV2?: { originalSelectionRanges?: Array<{ rangeLabel: string }> }
      };
    })).toMatchObject({
      rangeLabel: "5 selected cells on Sheet 1",
    });
    expect((published.commercialRows[0]?.lockedMetadataJson as {
      worksheetMetadata?: {
        worksheetPublishV2?: { originalSelectionRanges?: Array<{ rangeLabel: string }> }
      };
    }).worksheetMetadata?.worksheetPublishV2?.originalSelectionRanges).toHaveLength(5);
  });

  it("preserves the exact scattered selection ranges for quote, purchase order, and variation publishing", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Sheet 1", rowCount: 12, columnCount: 10 });
    worksheet.version = 9;
    setCell(worksheet, "A9", { value: "Wall Zone Quantities" });
    setCell(worksheet, "J9", { value: 10 });

    const selectionRange = {
      startRowIndex: 8,
      endRowIndex: 8,
      startColumnIndex: 0,
      endColumnIndex: 0,
    };
    const selectionRanges = [
      selectionRange,
      {
        startRowIndex: 8,
        endRowIndex: 8,
        startColumnIndex: 9,
        endColumnIndex: 9,
      },
    ];

    const destinations = [
      "quote",
      "purchase_order",
      "variation",
    ] as const;

    for (const destination of destinations) {
      const interpreted = interpretWorksheetSelectionForPublish({
        destination,
        worksheet,
        selectionRange,
        selectionRanges,
      });

      const proposal = interpreted.proposedLines[0]!;
      const published = buildPublishedWorksheetSelectionFromConfirmedLines({
        destination,
        worksheet,
        selectionRange,
        selectionRanges,
        workbookId: "wb-1",
        worksheetId: "wb-1",
        sheetId: "sheet-1",
        worksheetName: "Board package",
        sheetName: "Sheet 1",
        interpretedSelection: interpreted,
        confirmedLines: [
          {
            proposalId: proposal.id,
            description: "Wall Zone Quantities",
            quantity: 10,
            unit: null,
            rate: null,
            total: null,
          },
        ],
      });

      expect(interpreted.selectionRanges).toEqual(selectionRanges);
      expect((published.commercialRows[0]?.lockedMetadataJson as {
        worksheetMetadata?: {
          worksheetPublishV2?: {
            originalSelectionRanges?: Array<WorksheetSelectionRange & { rangeLabel: string }>
          }
        }
      }).worksheetMetadata?.worksheetPublishV2?.originalSelectionRanges).toEqual([
        { ...selectionRanges[0], rangeLabel: "A9:A9" },
        { ...selectionRanges[1], rangeLabel: "J9:J9" },
      ]);
    }
  });

  it("changes the source signature when the confirmed line fingerprint changes inside the same range", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 4, columnCount: 2 });
    worksheet.version = 5;
    setCell(worksheet, "A2", { value: "Board Supply Cost" });
    setCell(worksheet, "B2", { value: 2760 });

    const first = buildCommercialItemSourceSignature({
      workbookId: "wb-1",
      sheetId: "sheet-1",
      worksheet,
      range: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 1,
      },
      fingerprint: {
        proposalId: "selection-line-0",
        description: "Board Supply Cost",
        quantity: 92,
      },
    });
    const next = buildCommercialItemSourceSignature({
      workbookId: "wb-1",
      sheetId: "sheet-1",
      worksheet,
      range: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 1,
      },
      fingerprint: {
        proposalId: "selection-line-1",
        description: "Board Supply Cost",
        quantity: 92,
      },
    });

    expect(first).not.toBe(next);
  });
});
