import { describe, expect, it } from "vitest";
import { buildCommercialItemLockedMetadata, buildCommercialItemSourceLink, buildCommercialItemWorksheetSnapshot, deriveCommercialItemDescriptionFromSnapshot } from "@/lib/commercial-items/snapshot";
import { buildCommercialItemSourceSignature } from "@/lib/commercial-items/source-signature";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";

function buildRange(): WorksheetSelectionRange {
  return {
    startRowIndex: 0,
    endRowIndex: 1,
    startColumnIndex: 0,
    endColumnIndex: 1,
  };
}

describe("commercial item worksheet helpers", () => {
  it("builds a sanitized worksheet snapshot without formulas", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 4, columnCount: 4 });
    worksheet.cells.A1 = {
      value: "Partition wall",
      type: "text",
      formula: null,
      computedValue: "Partition wall",
      displayValue: "Partition wall",
      metadata: {},
    };
    worksheet.cells.B1 = {
      value: "=SUM(B2:B3)",
      type: "text",
      formula: "=SUM(B2:B3)",
      computedValue: 42,
      displayValue: "42",
      metadata: {
        format: {
          number: {
            kind: "number",
          },
        },
      },
    };

    const snapshot = buildCommercialItemWorksheetSnapshot({
      worksheet,
      range: buildRange(),
      sheetName: "Page 1",
    });

    expect(snapshot.rangeLabel).toBe("A1:B2");
    expect(snapshot.nonEmptyCellCount).toBe(2);
    expect(snapshot.cells.find((cell) => cell.cellKey === "B1")).toMatchObject({
      computedValue: 42,
      displayValue: "42",
    });
    expect(JSON.stringify(snapshot)).not.toContain("=SUM(B2:B3)");
    expect(deriveCommercialItemDescriptionFromSnapshot(snapshot)).toBe("Partition wall");
  });

  it("keeps formulas and metadata only inside locked metadata", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 2, columnCount: 2 });
    worksheet.metadata.privateNote = "keep internal";
    worksheet.cells.A1 = {
      value: "=A2",
      type: "text",
      formula: "=A2",
      computedValue: "15",
      displayValue: "15",
      metadata: { hiddenFormula: true },
    };

    const lockedMetadata = buildCommercialItemLockedMetadata({
      worksheet,
      range: buildRange(),
      sheetName: "Page 1",
    });

    expect(lockedMetadata.rangeLabel).toBe("A1:B2");
    expect(lockedMetadata.worksheetMetadata.privateNote).toBe("keep internal");
    expect(lockedMetadata.cells[0]?.formula).toBe("=A2");
    expect(lockedMetadata.cells[0]?.metadata.hiddenFormula).toBe(true);
  });

  it("builds a source link and signature that react to selection changes", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 2, columnCount: 2 });
    worksheet.version = 7;
    worksheet.cells.A1 = {
      value: "Door set",
      type: "text",
      formula: null,
      computedValue: "Door set",
      displayValue: "Door set",
      metadata: {},
    };

    const range = buildRange();
    const sourceLink = buildCommercialItemSourceLink({
      workbookId: "wb-1",
      worksheetId: "wb-1",
      sheetId: "sheet-1",
      worksheetName: "Doors package",
      sheetName: "Page 1",
      worksheet,
      range,
      capturedAt: "2026-07-07T03:00:00.000Z",
    });
    const firstSignature = buildCommercialItemSourceSignature({
      workbookId: "wb-1",
      sheetId: "sheet-1",
      worksheet,
      range,
    });

    worksheet.cells.A1 = {
      ...worksheet.cells.A1!,
      displayValue: "Door set revised",
      computedValue: "Door set revised",
    };

    const nextSignature = buildCommercialItemSourceSignature({
      workbookId: "wb-1",
      sheetId: "sheet-1",
      worksheet,
      range,
    });

    expect(sourceLink).toMatchObject({
      workbookId: "wb-1",
      sheetId: "sheet-1",
      worksheetName: "Doors package",
      range: "A1:B2",
      worksheetVersion: 7,
    });
    expect(firstSignature).not.toBe(nextSignature);
  });

  it("builds legitimate worksheet payloads with numeric count and index fields", () => {
    const worksheet = createDefaultWorksheetData({ sheetName: "Page 1", rowCount: 2, columnCount: 2 });
    worksheet.version = 3;
    worksheet.cells.A1 = {
      value: "Wall framing",
      type: "text",
      formula: null,
      computedValue: "Wall framing",
      displayValue: "Wall framing",
      metadata: {},
    };

    const range = buildRange();
    const snapshot = buildCommercialItemWorksheetSnapshot({
      worksheet,
      range,
      sheetName: "Page 1",
    });
    const sourceLink = buildCommercialItemSourceLink({
      workbookId: "wb-1",
      worksheetId: "wb-1",
      sheetId: "sheet-1",
      worksheetName: "Page 1",
      sheetName: "Page 1",
      worksheet,
      range,
      capturedAt: "2026-07-07T03:00:00.000Z",
    });
    const lockedMetadata = buildCommercialItemLockedMetadata({
      worksheet,
      range,
      sheetName: "Page 1",
    });

    expect(snapshot.rowCount).toBeTypeOf("number");
    expect(snapshot.columnCount).toBeTypeOf("number");
    expect(snapshot.cellCount).toBeTypeOf("number");
    expect(snapshot.nonEmptyCellCount).toBeTypeOf("number");
    expect(snapshot.columns[0]?.index).toBeTypeOf("number");
    expect(snapshot.rows[0]?.index).toBeTypeOf("number");
    expect(snapshot.cells[0]?.rowIndex).toBeTypeOf("number");
    expect(snapshot.cells[0]?.columnIndex).toBeTypeOf("number");
    expect(sourceLink.rowCount).toBeTypeOf("number");
    expect(sourceLink.columnCount).toBeTypeOf("number");
    expect(sourceLink.cellCount).toBeTypeOf("number");
    expect(sourceLink.worksheetVersion).toBeTypeOf("number");
    expect(lockedMetadata.worksheetVersion).toBeTypeOf("number");
    expect(lockedMetadata.cells[0]?.rowIndex).toBeTypeOf("number");
    expect(lockedMetadata.cells[0]?.columnIndex).toBeTypeOf("number");
  });
});
