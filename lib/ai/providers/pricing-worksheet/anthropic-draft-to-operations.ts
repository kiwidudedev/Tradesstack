import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { PricingWorksheetAiCompactContext } from "@/lib/pricing-worksheet-ai-context";
import type { PricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import type {
  PricingWorksheetAiAssistantResponse,
  PricingWorksheetAiCellValueEntry,
  PricingWorksheetAiOperation,
} from "@/lib/pricing-worksheet-edit-plan";

export type AnthropicWorksheetDraftMode = "worksheet_draft" | "answer_only";

export type AnthropicWorksheetDraftRow = {
  label: string;
  description: string | null;
  unit: string | null;
  rowPurpose: string;
  quantityValue: number | null;
  materialRate: number | null;
  labourRate: number | null;
  formulaIntent: string | null;
};

export type AnthropicWorksheetDraftSection = {
  title: string;
  rows: AnthropicWorksheetDraftRow[];
};

export type AnthropicWorksheetDraft = {
  mode: AnthropicWorksheetDraftMode;
  proposalName: string;
  answer: string;
  sections: AnthropicWorksheetDraftSection[];
  assumptions: string[];
  warnings: string[];
};

type ConvertAnthropicWorksheetDraftParams = {
  draft: Record<string, unknown>;
  worksheet: WorksheetData;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
};

type WorksheetColumnMapping = {
  sectionColumn: string;
  itemColumn: string;
  descriptionColumn: string | null;
  unitColumn: string | null;
  quantityColumn: string | null;
  materialRateColumn: string | null;
  labourHoursColumn: string | null;
  labourRateColumn: string | null;
  marginColumn: string | null;
  totalColumn: string | null;
  notesColumn: string | null;
};

const MAX_DRAFT_SECTIONS = 6;
const MAX_DRAFT_ROWS = 18;
const MAX_DRAFT_ASSUMPTIONS = 6;
const MAX_DRAFT_WARNINGS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeNullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeText(entry))
    .filter((entry) => entry.length > 0)
    .slice(0, MAX_DRAFT_WARNINGS);
}

function normalizeDraftRow(value: unknown): AnthropicWorksheetDraftRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = normalizeText(value.label);
  if (label.length === 0) {
    return null;
  }

  return {
    label,
    description: normalizeNullableText(value.description),
    unit: normalizeNullableText(value.unit),
    rowPurpose: normalizeText(value.rowPurpose, "line_item"),
    quantityValue: normalizeNullableNumber(value.quantityValue),
    materialRate: normalizeNullableNumber(value.materialRate),
    labourRate: normalizeNullableNumber(value.labourRate),
    formulaIntent: normalizeNullableText(value.formulaIntent),
  };
}

function normalizeDraftSection(value: unknown): AnthropicWorksheetDraftSection | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = normalizeText(value.title);
  const rows = Array.isArray(value.rows)
    ? value.rows
        .map((entry) => normalizeDraftRow(entry))
        .filter((entry): entry is AnthropicWorksheetDraftRow => Boolean(entry))
        .slice(0, MAX_DRAFT_ROWS)
    : [];

  if (title.length === 0 && rows.length === 0) {
    return null;
  }

  return {
    title: title || "Worksheet section",
    rows,
  };
}

export function isAnthropicWorksheetDraftResponse(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (value.mode === "worksheet_draft" || value.mode === "answer_only");
}

export function normalizeAnthropicWorksheetDraft(value: unknown): AnthropicWorksheetDraft {
  const candidate = isRecord(value) ? value : {};
  const sections = Array.isArray(candidate.sections)
    ? candidate.sections
        .map((entry) => normalizeDraftSection(entry))
        .filter((entry): entry is AnthropicWorksheetDraftSection => Boolean(entry))
        .slice(0, MAX_DRAFT_SECTIONS)
    : [];

  return {
    mode: candidate.mode === "worksheet_draft" ? "worksheet_draft" : "answer_only",
    proposalName: normalizeText(candidate.proposalName, "Worksheet draft"),
    answer: normalizeText(candidate.answer),
    sections,
    assumptions: normalizeTextArray(candidate.assumptions).slice(0, MAX_DRAFT_ASSUMPTIONS),
    warnings: normalizeTextArray(candidate.warnings).slice(0, MAX_DRAFT_WARNINGS),
  };
}

function buildColumnMapping(worksheet: WorksheetData): WorksheetColumnMapping {
  const columns = worksheet.columns.map((column) => column.id);
  const pick = (index: number) => columns[index] ?? null;

  return {
    sectionColumn: pick(0) ?? "A",
    itemColumn: pick(1) ?? "B",
    descriptionColumn: pick(2),
    unitColumn: pick(3),
    quantityColumn: pick(4),
    materialRateColumn: pick(5),
    labourHoursColumn: pick(6),
    labourRateColumn: pick(7),
    marginColumn: pick(8),
    totalColumn: pick(9) ?? pick(8) ?? pick(7) ?? pick(6) ?? pick(5),
    notesColumn: pick(10) ?? pick(9) ?? pick(8),
  };
}

function buildHeaderLabels(mapping: WorksheetColumnMapping): Array<{ column: string; value: string }> {
  const entries: Array<{ column: string | null; value: string }> = [
    { column: mapping.sectionColumn, value: "Section" },
    { column: mapping.itemColumn, value: "Item" },
    { column: mapping.descriptionColumn, value: "Description" },
    { column: mapping.unitColumn, value: "Unit" },
    { column: mapping.quantityColumn, value: "Quantity" },
    { column: mapping.materialRateColumn, value: "Material Rate" },
    { column: mapping.labourHoursColumn, value: "Labour Hours" },
    { column: mapping.labourRateColumn, value: "Labour Rate" },
    { column: mapping.marginColumn, value: "Margin" },
    { column: mapping.totalColumn, value: "Total" },
    { column: mapping.notesColumn, value: "Notes" },
  ];

  return entries.filter((entry): entry is { column: string; value: string } => Boolean(entry.column));
}

function firstEmptyInsertRow(worksheet: WorksheetData): number {
  let lastPopulatedRow = 0;
  for (const key of Object.keys(worksheet.cells)) {
    const match = /(\d+)$/.exec(key);
    if (!match) {
      continue;
    }
    lastPopulatedRow = Math.max(lastPopulatedRow, Number(match[1]));
  }

  return Math.min(lastPopulatedRow + 1, worksheet.rows.length + 1) || 1;
}

function shouldInsertHeaderRow(context: PricingWorksheetAiCompactContext) {
  return context.populatedCellCount <= 2;
}

function pushLiteralCell(
  accumulator: PricingWorksheetAiCellValueEntry[],
  column: string | null,
  value: string | number | null,
) {
  if (!column || value === null) {
    return;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return;
  }

  accumulator.push({
    column,
    value,
  });
}

function buildSectionHeadingOperation(sectionTitle: string, rowNumber: number, mapping: WorksheetColumnMapping): PricingWorksheetAiOperation {
  return {
    type: "insert_row",
    target: {
      insertBeforeRow: rowNumber,
      sectionName: sectionTitle,
    },
    values: {
      cells: [
        {
          column: mapping.sectionColumn,
          value: sectionTitle,
        },
      ],
    },
    formulas: {
      cells: [],
    },
    rationale: `Insert section heading for ${sectionTitle}.`,
  };
}

function buildDraftRowOperation(
  section: AnthropicWorksheetDraftSection,
  row: AnthropicWorksheetDraftRow,
  rowNumber: number,
  mapping: WorksheetColumnMapping,
): PricingWorksheetAiOperation | null {
  const values: PricingWorksheetAiCellValueEntry[] = [];
  const formulas: PricingWorksheetAiFormulaEntry[] = [];

  pushLiteralCell(values, mapping.sectionColumn, section.title);
  pushLiteralCell(values, mapping.itemColumn, row.label);
  pushLiteralCell(values, mapping.descriptionColumn, row.description);
  pushLiteralCell(values, mapping.unitColumn, row.unit);

  pushLiteralCell(values, mapping.quantityColumn, row.quantityValue);

  pushLiteralCell(values, mapping.materialRateColumn, row.materialRate);
  pushLiteralCell(values, mapping.labourRateColumn, row.labourRate);
  pushLiteralCell(values, mapping.notesColumn, row.formulaIntent);

  if (values.length === 0 && formulas.length === 0) {
    return null;
  }

  return {
    type: "insert_row",
    target: {
      insertBeforeRow: rowNumber,
      sectionName: section.title,
    },
    values: {
      cells: values,
    },
    formulas: {
      cells: formulas,
    },
    rationale: `Insert worksheet row for ${row.label}.`,
  };
}

export function convertAnthropicWorksheetDraftToOperations(
  params: ConvertAnthropicWorksheetDraftParams,
): PricingWorksheetAiAssistantResponse {
  const draft = normalizeAnthropicWorksheetDraft(params.draft);
  const mapping = buildColumnMapping(params.worksheet);
  const operations: PricingWorksheetAiOperation[] = [];
  let nextInsertRow = firstEmptyInsertRow(params.worksheet);
  const hasRenderableRows = draft.sections.some((section) => section.rows.length > 0);

  if (draft.mode === "answer_only") {
    return {
      mode: "answer_only",
      proposalName: draft.proposalName,
      answer: draft.answer,
      summary: draft.answer || "Anthropic returned an answer-only worksheet draft response.",
      confidence: "medium",
      operations: [],
      assumptions: draft.assumptions,
      warnings: draft.warnings,
    };
  }

  if (hasRenderableRows && shouldInsertHeaderRow(params.worksheetContext)) {
    operations.push({
      type: "insert_row",
      target: {
        insertBeforeRow: nextInsertRow,
        sectionName: "Worksheet headers",
      },
      values: {
        cells: buildHeaderLabels(mapping),
      },
      formulas: {
        cells: [],
      },
      rationale: "Insert starter worksheet headers for the generated pricing draft.",
    });
    nextInsertRow += 1;
  }

  for (const section of draft.sections) {
    if (section.title.trim().length > 0) {
      operations.push(buildSectionHeadingOperation(section.title, nextInsertRow, mapping));
      nextInsertRow += 1;
    }

    for (const row of section.rows) {
      const operation = buildDraftRowOperation(section, row, nextInsertRow, mapping);
      if (!operation) {
        continue;
      }
      operations.push(operation);
      nextInsertRow += 1;
    }
  }

  const convertedMode = operations.length > 0 ? "propose_edit" : "answer_only";
  const warnings = [...draft.warnings];
  if (draft.mode === "worksheet_draft" && operations.length === 0) {
    warnings.push("anthropic_draft_conversion_failed");
  }

  return {
    mode: convertedMode,
    proposalName: draft.proposalName,
    answer: draft.answer,
    summary: draft.answer || draft.proposalName,
    confidence: params.classification.primaryIntent === "worksheet_generation" ? "medium" : "low",
    operations,
    assumptions: draft.assumptions,
    warnings: Array.from(new Set(warnings)),
  };
}
