import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKSHEET_COLUMN_COUNT,
  DEFAULT_WORKSHEET_ROW_COUNT,
  createDefaultWorksheetData,
  normalizeWorksheetData,
} from "./opportunity-pricing-worksheet-defaults";

describe("worksheet defaults", () => {
  it("creates new worksheets with spreadsheet-like baseline capacity", () => {
    const worksheet = createDefaultWorksheetData();

    expect(worksheet.rowCount).toBe(DEFAULT_WORKSHEET_ROW_COUNT);
    expect(worksheet.columnCount).toBe(DEFAULT_WORKSHEET_COLUMN_COUNT);
    expect(worksheet.rows).toHaveLength(DEFAULT_WORKSHEET_ROW_COUNT);
    expect(worksheet.columns).toHaveLength(DEFAULT_WORKSHEET_COLUMN_COUNT);
    expect(worksheet.columns.at(-1)?.label).toBe("Z");
  });

  it("normalizes smaller persisted worksheets upward without losing cells", () => {
    const worksheet = normalizeWorksheetData({
      version: 1,
      sheetName: "Legacy Worksheet",
      rowCount: 3,
      columnCount: 2,
      rows: [
        { id: "1", index: 0, height: 36 },
        { id: "2", index: 1, height: 48 },
        { id: "3", index: 2, height: 36 },
      ],
      columns: [
        { id: "A", index: 0, label: "A", width: 220 },
        { id: "B", index: 1, label: "B", width: 96 },
      ],
      cells: {
        A1: {
          value: "Estimator note",
          type: "text",
          formula: null,
          computedValue: "Estimator note",
          displayValue: "Estimator note",
          metadata: { wrap: true },
        },
      },
      metadata: {
        templateId: null,
        notes: "legacy",
      },
    });

    expect(worksheet.rowCount).toBe(DEFAULT_WORKSHEET_ROW_COUNT);
    expect(worksheet.columnCount).toBe(DEFAULT_WORKSHEET_COLUMN_COUNT);
    expect(worksheet.rows).toHaveLength(DEFAULT_WORKSHEET_ROW_COUNT);
    expect(worksheet.columns).toHaveLength(DEFAULT_WORKSHEET_COLUMN_COUNT);
    expect(worksheet.rows[1]?.height).toBe(48);
    expect(worksheet.columns[0]?.width).toBe(220);
    expect(worksheet.columns[1]?.width).toBe(96);
    expect(worksheet.cells.A1?.displayValue).toBe("Estimator note");
    expect(worksheet.metadata.notes).toBe("legacy");
  });

  it("does not shrink larger persisted worksheets during normalization", () => {
    const worksheet = normalizeWorksheetData({
      version: 1,
      sheetName: "Large Worksheet",
      rowCount: 620,
      columnCount: 30,
      rows: Array.from({ length: 620 }, (_, index) => ({
        id: String(index + 1),
        index,
        height: index === 619 ? 52 : 36,
      })),
      columns: Array.from({ length: 30 }, (_, index) => ({
        id: index === 26 ? "AA" : String.fromCharCode(65 + index),
        index,
        label: index === 26 ? "AA" : String.fromCharCode(65 + index),
        width: index === 29 ? 188 : 140,
      })),
      cells: {},
      metadata: {},
    });

    expect(worksheet.rowCount).toBe(620);
    expect(worksheet.columnCount).toBe(30);
    expect(worksheet.rows).toHaveLength(620);
    expect(worksheet.columns).toHaveLength(30);
    expect(worksheet.rows[619]?.height).toBe(52);
    expect(worksheet.columns[29]?.width).toBe(188);
  });

  it("appends missing blank rows and columns while preserving existing indexes", () => {
    const worksheet = normalizeWorksheetData({
      version: 1,
      rowCount: 4,
      columnCount: 3,
      rows: [{ id: "1", index: 0, height: 44 }],
      columns: [{ id: "A", index: 0, label: "A", width: 160 }],
      cells: {},
      metadata: {},
    });

    expect(worksheet.rows[0]).toEqual({ id: "1", index: 0, height: 44 });
    expect(worksheet.rows[1]).toEqual({ id: "2", index: 1, height: 36 });
    expect(worksheet.columns[0]).toEqual({ id: "A", index: 0, label: "A", width: 160 });
    expect(worksheet.columns[1]).toEqual({ id: "B", index: 1, label: "B", width: 140 });
    expect(worksheet.columns[25]).toEqual({ id: "Z", index: 25, label: "Z", width: 140 });
  });

  it("preserves AI provenance metadata during normalization", () => {
    const worksheet = normalizeWorksheetData({
      version: 1,
      sheetName: "AI Estimate",
      rowCount: 4,
      columnCount: 4,
      rows: Array.from({ length: 4 }, (_, index) => ({
        id: String(index + 1),
        index,
        height: 36,
      })),
      columns: Array.from({ length: 4 }, (_, index) => ({
        id: String.fromCharCode(65 + index),
        index,
        label: String.fromCharCode(65 + index),
        width: 140,
      })),
      cells: {
        B2: {
          value: 125,
          type: "number",
          formula: null,
          computedValue: 125,
          displayValue: "125",
          metadata: {
            generatedByAi: true,
            aiInteractionId: "ai-123",
            aiJobId: "job-123",
            generatedAt: "2026-05-31T00:00:00.000Z",
            operationType: "update_cell",
            generationBatchId: "ai-123:batch-1",
            promptSummary: "Review labour rate",
            originalAiValue: 125,
            originalAiFormula: null,
            lastCorrectedAt: null,
            correctedByUserId: null,
          },
        },
      },
      metadata: {},
    });

    expect(worksheet.cells.B2?.metadata).toMatchObject({
      generatedByAi: true,
      aiInteractionId: "ai-123",
      aiJobId: "job-123",
      generationBatchId: "ai-123:batch-1",
      originalAiValue: 125,
    });
  });
});
