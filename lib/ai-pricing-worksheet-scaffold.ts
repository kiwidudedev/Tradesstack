/**
 * @deprecated
 * Legacy scaffold fallback for the previous full-sheet Ask AI flow.
 * Retained temporarily so older transition code remains readable while the
 * worksheet assistant path becomes the only supported runtime entrypoint.
 */
import {
  createDefaultWorksheetData,
  type WorksheetCell,
  type WorksheetData,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import { recalculateWorksheetFormulas } from "@/lib/opportunity-pricing-worksheet-formulas";
import { summarizeWorksheetStructure } from "@/lib/pricing-worksheet-intelligence";
import type { AiMemoryItem, AiValidationWarning } from "@/lib/ai-lifecycle-server";

type WorksheetScaffoldSummary = {
  suggestionSource: "organization_memory" | "default_template";
  memoryItemId: string | null;
  worksheetName: string;
  tradePackage: string | null;
  prompt: string;
  rowCount: number;
  columnCount: number;
  formulaCount: number;
  populatedCellCount: number;
  confidence: number;
  headers: string[];
  promptHighlights: string[];
  sampleLineItems: string[];
  sections?: string[];
  sectionCounts?: {
    inputRows: number;
    materialRows: number;
    labourRows: number;
    summaryRows: number;
  };
  assumptions?: string[];
};

export type PricingWorksheetScaffoldPreview = {
  worksheet: WorksheetData;
  compactOutput: WorksheetScaffoldSummary;
  matchedMemory: AiMemoryItem | null;
  validationWarnings: AiValidationWarning[];
};

const GENERIC_HEADERS = ["Item", "Description", "Quantity", "Unit", "Rate", "Total"] as const;

function createCell(value: string | number | null, overrides?: Partial<WorksheetCell>): WorksheetCell {
  return {
    value,
    type: typeof value === "number" ? "number" : value === null ? "empty" : "text",
    formula: null,
    computedValue: value,
    displayValue: value === null ? "" : String(value),
    metadata: {},
    ...overrides,
  };
}

function setCell(worksheet: WorksheetData, cellRef: string, cell: WorksheetCell) {
  worksheet.cells[cellRef] = cell;
}

function buildPromptHighlights(prompt: string) {
  return prompt
    .split(/[\n,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, 8);
}

function chooseBestWorksheetMemory(params: {
  worksheetName: string;
  tradePackage: string | null;
  memoryItems: AiMemoryItem[];
}) {
  const worksheetName = params.worksheetName.trim().toLowerCase();
  const tradePackage = params.tradePackage?.trim().toLowerCase() ?? null;

  const ranked = params.memoryItems
    .filter((item) => item.memoryCategory === "worksheet_structure")
    .map((item) => {
      const memoryWorksheetName =
        typeof item.memoryValue.worksheetName === "string" ? item.memoryValue.worksheetName.toLowerCase() : "";
      const memoryTradePackage =
        typeof item.memoryValue.tradePackage === "string" ? item.memoryValue.tradePackage.toLowerCase() : null;

      let score = item.confidenceScore;
      if (worksheetName && memoryWorksheetName === worksheetName) {
        score += 0.2;
      }
      if (tradePackage && memoryTradePackage === tradePackage) {
        score += 0.12;
      }

      return { item, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.item ?? null;
}

export function buildPricingWorksheetScaffoldPreview(params: {
  prompt: string;
  worksheetName: string;
  tradePackage: string | null;
  memoryItems: AiMemoryItem[];
}) {
  const matchedMemory = chooseBestWorksheetMemory(params);
  const worksheet = createDefaultWorksheetData({
    sheetName: params.worksheetName.trim() || "AI Worksheet Scaffold",
    rowCount: 12,
    columnCount: GENERIC_HEADERS.length,
  });

  worksheet.columns = worksheet.columns.map((column, index) => ({
    ...column,
    width: [90, 280, 110, 100, 120, 140][index] ?? column.width,
  }));

  GENERIC_HEADERS.forEach((header, index) => {
    const columnLabel = worksheet.columns[index]?.label ?? String.fromCharCode(65 + index);
    setCell(worksheet, `${columnLabel}1`, createCell(header));
  });

  setCell(worksheet, "A2", createCell(1));
  setCell(worksheet, "B2", createCell("Example line item"));
  setCell(worksheet, "C2", createCell(1));
  setCell(worksheet, "D2", createCell("item"));
  setCell(worksheet, "E2", createCell(0));
  setCell(
    worksheet,
    "F2",
    createCell("=C2*E2", {
      formula: "=C2*E2",
      computedValue: "=C2*E2",
      displayValue: "=C2*E2",
    })
  );

  setCell(worksheet, "E10", createCell("Grand Total"));
  setCell(
    worksheet,
    "F10",
    createCell("=SUM(F2:F9)", {
      formula: "=SUM(F2:F9)",
      computedValue: "=SUM(F2:F9)",
      displayValue: "=SUM(F2:F9)",
    })
  );

  const recalculatedWorksheet = recalculateWorksheetFormulas(worksheet);
  const structureSummary = summarizeWorksheetStructure(recalculatedWorksheet);
  const validationWarnings: AiValidationWarning[] = [
    {
      ruleKey: "ai_pricing_worksheet_memory_support",
      severity: matchedMemory ? "info" : "warning",
      result: matchedMemory ? "passed" : "warning",
      message: matchedMemory
        ? "Organization memory was available as optional context for this preview."
        : "AI generation was unavailable, so a generic calculator was created instead.",
    },
  ];

  return {
    worksheet: recalculatedWorksheet,
    compactOutput: {
      suggestionSource: matchedMemory ? "organization_memory" : "default_template",
      memoryItemId: matchedMemory?.id ?? null,
      worksheetName: recalculatedWorksheet.sheetName,
      tradePackage: params.tradePackage,
      rowCount: structureSummary.rowCount,
      columnCount: structureSummary.columnCount,
      formulaCount: structureSummary.formulaCount,
      populatedCellCount: structureSummary.populatedCellCount,
      confidence: matchedMemory ? Math.min(0.7, matchedMemory.confidenceScore) : 0.28,
      headers: [...GENERIC_HEADERS],
      prompt: params.prompt,
      promptHighlights: buildPromptHighlights(params.prompt),
      sampleLineItems: ["Example line item"],
      assumptions: [
        "This is a neutral fallback worksheet.",
        "Review column structure, formulas, and line items before applying.",
      ],
    },
    matchedMemory,
    validationWarnings,
  } satisfies PricingWorksheetScaffoldPreview;
}
