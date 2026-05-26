"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ChevronDown, Save, Sparkles } from "lucide-react";
import {
  PricingWorksheetAiAssistDialog,
  type PricingWorksheetAiFindingDisposition,
  type PricingWorksheetAiPreviewAssistant,
  type PricingWorksheetAiContextSummary,
  type PricingWorksheetAiMatchedMemory,
  type PricingWorksheetAiPreviewSummary,
  type PricingWorksheetAiValidationWarning,
} from "@/components/app/PricingWorksheetAiAssistDialog";
import { useOpportunityWorkspaceData } from "@/components/app/OpportunityWorkspaceDataProvider";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import {
  createDefaultWorksheetData,
  createDefaultWorksheetExtractedPricingData,
  createDefaultWorksheetPricingSummary,
  normalizeWorksheetCell,
  normalizeWorksheetData,
  type WorksheetCell,
  type WorksheetColumn,
  type WorksheetData,
  type WorksheetExtractedPricingData,
  type WorksheetPricingSummary,
  type WorksheetRow,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  applyWorksheetAutoLayout,
  buildWorksheetColumnAutoFitTarget,
  buildWorksheetLayoutTargetFromDiffSummary,
  buildWorksheetRowAutoFitTarget,
} from "@/lib/opportunity-pricing-worksheet-layout";
import {
  buildWorksheetRedoState,
  buildWorksheetUndoState,
  commitWorksheetHistoryEntry,
} from "@/lib/opportunity-pricing-worksheet-history";
import {
  buildPricingWorksheetAiEvidenceFeedbackData,
  buildPricingWorksheetAiReviewSignalData,
  buildPricingWorksheetIntelligenceEvent,
  logPricingWorksheetIntelligenceFailure,
  summarizeWorksheetStructure,
  writePricingWorksheetIntelligenceEvents,
} from "@/lib/pricing-worksheet-intelligence";
import {
  recalculateWorksheetFormulas,
} from "@/lib/opportunity-pricing-worksheet-formulas";
import { applyWorksheetMutation } from "@/lib/opportunity-pricing-worksheet-mutations";
import {
  buildWorksheetTsvFromRange,
  extendRangeFromAnchor,
  getWorksheetSelectionRange,
  moveCellKey,
  type WorksheetSelectionRange,
} from "@/lib/opportunity-pricing-worksheet-copy";
import {
  resolveWorksheetPendingRangeSelectionState,
  resolveWorksheetPointerDragState,
  resolveWorksheetRangeSelectionPointerState,
} from "@/lib/opportunity-pricing-worksheet-selection";
import {
  applyWorksheetPasteToCells,
  buildWorksheetCellKey,
  expandWorksheetToFitPaste,
  getWorksheetAnchorPosition,
  parseWorksheetCellKey,
  parseWorksheetClipboardText,
} from "@/lib/opportunity-pricing-worksheet-paste";
import { shiftFormulaForFill } from "@/lib/opportunity-pricing-worksheet-formula-shift";
import { extractPricingWorksheetFormulaReferences } from "@/lib/pricing-worksheet-formula-references";
import {
  deleteWorksheetColumns,
  deleteWorksheetRows,
  insertWorksheetColumn,
  insertWorksheetRow,
} from "@/lib/opportunity-pricing-worksheet-structure";
import {
  applyBordersToRange,
  applyFormattingToRange,
  clearCellFill,
  clearCellNumberFormat,
  getFormattedCellDisplayValue,
  getCellFormat,
  hasCellFormatting,
  type WorksheetNegativeNumberStyle,
  type WorksheetNumberFormatKind,
  type WorksheetCellFormat,
} from "@/lib/opportunity-pricing-worksheet-formatting";
import {
  getColumnOffsets,
  getColumnVirtualizationWindow,
} from "@/lib/opportunity-pricing-worksheet-virtual-columns";
import {
  countPricingWorksheetPerformance,
  markPricingWorksheetPerformance,
  startPricingWorksheetPerformanceMeasure,
} from "@/lib/pricing-worksheet-performance";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";
import { buildPricingWorksheetAiContext } from "@/lib/pricing-worksheet-ai-context";
import type { PricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import type { PricingWorksheetAiFollowUpContext } from "@/lib/ai-pricing-worksheet-edit-assistant";
import {
  buildPricingWorksheetAiSuggestedEditSelectionResponse,
  simulatePricingWorksheetAiEditPlan,
  type PricingWorksheetAiAssistantResponse,
  type PricingWorksheetAiDiffSummary,
  type PricingWorksheetAiReviewFinding,
  type PricingWorksheetAiSuggestedEditGroup,
} from "@/lib/pricing-worksheet-edit-plan";
import { validateWorksheetBeforeSave } from "@/lib/opportunity-pricing-worksheet-save-validation";

type PricingWorksheetRow = Pick<
  Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"],
  | "id"
  | "name"
  | "trade_package"
  | "worksheet_data"
  | "pricing_summary"
  | "extracted_pricing_data"
  | "version"
  | "updated_at"
  | "updated_by"
>;
type WorksheetContextMenuState =
  | {
      type: "cell";
      x: number;
      y: number;
      cellKey: string;
    }
  | {
      type: "row";
      x: number;
      y: number;
      rowIndex: number;
    }
  | {
      type: "column";
      x: number;
      y: number;
      columnIndex: number;
    }
  | null;

type FormulaReferenceRangeHighlight = {
  colorIndex: number;
  startRowIndex: number;
  startColumnIndex: number;
  endRowIndex: number;
  endColumnIndex: number;
};

type PricingWorksheetAiPreviewResponse = {
  aiInteractionId: string;
  lifecycleState: string;
  validationStatus: string;
  preview: {
    worksheet: WorksheetData;
    compactOutput: PricingWorksheetAiPreviewSummary;
    matchedMemory: PricingWorksheetAiMatchedMemory | null;
    validationWarnings: PricingWorksheetAiValidationWarning[];
    contextSummary: PricingWorksheetAiContextSummary;
    classification?: PricingWorksheetConstructionIntent;
    assistant?: PricingWorksheetAiPreviewAssistant | null;
    generationMeta?: {
      provider: string;
      model: string;
      fallbackUsed: boolean;
      fallbackReason: string | null;
    };
  };
};

type PricingWorksheetAiJobStatus =
  | "queued"
  | "running"
  | "researching"
  | "generating"
  | "validating"
  | "ready"
  | "failed"
  | "cancelled";

type PricingWorksheetAiJobError = {
  code:
    | "provider_timeout"
    | "provider_520"
    | "provider_quota"
    | "provider_schema_error"
    | "parser_error"
    | "validation_blocked"
    | "cancelled"
    | "provider_error";
  message: string;
  retryable: boolean;
};

type PricingWorksheetAiJobResponse = {
  jobId: string;
  aiInteractionId: string;
  status: PricingWorksheetAiJobStatus;
  progressLabel: string;
  retryable?: boolean;
  lifecycleState?: string;
  validationStatus?: string;
  preview?: PricingWorksheetAiPreviewResponse["preview"] | null;
  error?: PricingWorksheetAiJobError | null;
};

type WorksheetCommitResult =
  | { committed: false; changed: boolean; message: string | null }
  | { committed: true; changed: boolean; worksheet: WorksheetData };

const CELL_INPUT_CLASS =
  "h-full w-full min-w-0 border-0 bg-transparent px-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]";
const WORKSHEET_HISTORY_LIMIT = 50;
const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 640;
const MIN_ROW_HEIGHT = 28;
const MAX_ROW_HEIGHT = 240;
const WORKSHEET_ROW_GUTTER_WIDTH = 64;
const WORKSHEET_ROW_OVERSCAN = 6;
const WORKSHEET_COLUMN_OVERSCAN = 2;
const WORKSHEET_VIEWPORT_FALLBACK_HEIGHT = 720;
const WORKSHEET_VIEWPORT_FALLBACK_WIDTH = 1120;
const WORKSHEET_ZOOM_LEVELS = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;
const FILL_SWATCHES = ["#FEF3C7", "#DBEAFE", "#DCFCE7", "#FCE7F3", "#F3F4F6"];
const TEXT_SWATCHES = ["#111827", "#1D4ED8", "#047857", "#B45309", "#BE123C"];
const FORMULA_REFERENCE_HIGHLIGHT_STYLES = [
  {
    outlineColor: "rgb(59 130 246 / 0.95)",
    backgroundColor: "rgb(219 234 254 / 0.55)",
  },
  {
    outlineColor: "rgb(147 51 234 / 0.95)",
    backgroundColor: "rgb(243 232 255 / 0.6)",
  },
  {
    outlineColor: "rgb(34 197 94 / 0.95)",
    backgroundColor: "rgb(220 252 231 / 0.65)",
  },
  {
    outlineColor: "rgb(249 115 22 / 0.95)",
    backgroundColor: "rgb(255 237 213 / 0.7)",
  },
  {
    outlineColor: "rgb(236 72 153 / 0.95)",
    backgroundColor: "rgb(252 231 243 / 0.7)",
  },
  {
    outlineColor: "rgb(13 148 136 / 0.95)",
    backgroundColor: "rgb(204 251 241 / 0.7)",
  },
] as const;
const WORKSHEET_CELL_HORIZONTAL_PADDING = 20;
const WORKSHEET_CELL_VERTICAL_PADDING = 12;
const WORKSHEET_CELL_FONT_SIZE = 14;
const WORKSHEET_CELL_LINE_HEIGHT = 20;
const SELECTION_OUTLINE_COLOR = "rgb(37 99 235)";
const FILL_PREVIEW_OUTLINE_COLOR = "rgb(59 130 246)";
const NUMBER_FORMAT_OPTIONS = [
  { value: "general", label: "General" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent" },
] satisfies Array<{ value: WorksheetNumberFormatKind; label: string }>;
const NEGATIVE_STYLE_OPTIONS = [
  { value: "minus", label: "-123" },
  { value: "parentheses", label: "(123)" },
] satisfies Array<{ value: WorksheetNegativeNumberStyle; label: string }>;
const MAX_NUMBER_DECIMAL_PLACES = 6;

function cloneWorksheetData(worksheet: WorksheetData) {
  return JSON.parse(JSON.stringify(worksheet)) as WorksheetData;
}

function clampWorksheetZoom(nextZoom: number) {
  const minZoom = WORKSHEET_ZOOM_LEVELS[0];
  const maxZoom = WORKSHEET_ZOOM_LEVELS[WORKSHEET_ZOOM_LEVELS.length - 1];
  return Math.min(maxZoom, Math.max(minZoom, nextZoom));
}

function buildNextCommittedCell(
  existingCell: WorksheetCell | undefined,
  nextValue: string
): WorksheetCell | null {
  const normalizedCell = normalizeWorksheetCell(nextValue);

  if (normalizedCell.type === "empty") {
    if (!hasCellFormatting(existingCell)) {
      return null;
    }

    return {
      ...normalizedCell,
      metadata: {
        ...existingCell?.metadata,
      },
    };
  }

  return {
    ...normalizedCell,
    metadata: {
      ...(existingCell?.metadata ?? {}),
    },
  };
}

function areWorksheetCellsEquivalent(
  existingCell: WorksheetCell | undefined,
  nextCell: WorksheetCell | null
) {
  if (nextCell === null) {
    return !existingCell;
  }

  if (!existingCell) {
    return false;
  }

  return (
    existingCell.value === nextCell.value &&
    existingCell.type === nextCell.type &&
    existingCell.formula === nextCell.formula &&
    existingCell.computedValue === nextCell.computedValue &&
    existingCell.displayValue === nextCell.displayValue &&
    JSON.stringify(existingCell.metadata) === JSON.stringify(nextCell.metadata)
  );
}

function isCellCommitNoOp(existingCell: WorksheetCell | undefined, nextValue: string) {
  return areWorksheetCellsEquivalent(existingCell, buildNextCommittedCell(existingCell, nextValue));
}

function hasWorksheetContent(worksheet: WorksheetData) {
  const summary = summarizeWorksheetStructure(worksheet);
  return summary.populatedCellCount > 0;
}

function buildCurrentWorksheetSummary(worksheet: WorksheetData) {
  const summary = summarizeWorksheetStructure(worksheet);
  return {
    rowCount: summary.rowCount,
    columnCount: summary.columnCount,
    formulaCount: summary.formulaCount,
    populatedCellCount: summary.populatedCellCount,
    hasExistingContent: summary.populatedCellCount > 0,
  };
}

function buildWorksheetAiEditedOutput(params: {
  preview: PricingWorksheetAiPreviewResponse["preview"];
  worksheetName: string;
  tradePackage: string | null;
}) {
  return {
    ...params.preview.compactOutput,
    worksheetName: params.worksheetName,
    tradePackage: params.tradePackage,
    responseMode: params.preview.assistant?.mode ?? null,
    answer: params.preview.assistant?.answer ?? null,
    summary: params.preview.assistant?.summary ?? null,
    operationTypes: params.preview.assistant?.operations.map((operation) => operation.type) ?? [],
    changedCells: params.preview.assistant?.diffSummary.changedCells ?? [],
    insertedRows: (params.preview.assistant?.diffSummary.insertedRows ?? []).map((row) => String(row)),
    affectedSections: params.preview.assistant?.diffPreview?.affectedSections ?? [],
    formulaChangeRefs: params.preview.assistant?.diffPreview?.formulaChanges.map((change) => change.ref) ?? [],
    reviewFindings: params.preview.assistant?.reviewFindings ?? [],
    reviewSummary: params.preview.assistant?.reviewSummary ?? null,
    evidenceSources: params.preview.assistant?.evidenceSources ?? [],
    suggestedEditGroups: (params.preview.assistant?.suggestedEditGroups ?? []).map((group) => ({
      id: group.id,
      title: group.title,
      purpose: group.purpose,
      confidence: group.confidence,
      relatedFindingIds: group.relatedFindingIds,
      operationCount: group.operations.length,
    })),
  } as Record<string, Json | null | string | number | string[]>;
}

function buildAssistantResponseFromPreview(
  assistant: PricingWorksheetAiPreviewAssistant,
): PricingWorksheetAiAssistantResponse {
  return {
    mode: assistant.mode,
    proposalName: assistant.proposalName,
    answer: assistant.answer,
    summary: assistant.summary,
    confidence: assistant.confidence,
    operations: [],
    assumptions: assistant.assumptions,
    warnings: assistant.warnings,
    evidenceSources: assistant.evidenceSources ?? [],
    reviewFindings: assistant.reviewFindings ?? [],
    reviewSummary: assistant.reviewSummary ?? null,
    suggestedEditGroups: assistant.suggestedEditGroups ?? [],
  };
}

function getFindingById(
  findings: PricingWorksheetAiReviewFinding[] | undefined,
  findingId: string
) {
  return (findings ?? []).find((finding) => finding.id === findingId) ?? null;
}

function buildFindingRevisionSummaries(params: {
  previousFindings: PricingWorksheetAiReviewFinding[];
  nextFindings: PricingWorksheetAiReviewFinding[];
  previousSuggestedEditGroups: PricingWorksheetAiSuggestedEditGroup[];
  nextSuggestedEditGroups: PricingWorksheetAiSuggestedEditGroup[];
}) {
  type FindingRevisionSummary = {
    outcome: "invalidated" | "confirmed" | "revised";
    finding: PricingWorksheetAiReviewFinding;
    previousFinding: PricingWorksheetAiReviewFinding;
  };

  const previousFindingMap = new Map(params.previousFindings.map((finding) => [finding.id, finding]));
  const nextSuggestedEditGroupIds = new Set(params.nextSuggestedEditGroups.map((group) => group.id));
  const removedSuggestedEditGroupIds = params.previousSuggestedEditGroups
    .filter((group) => !nextSuggestedEditGroupIds.has(group.id))
    .map((group) => group.id);

  const changedFindings: FindingRevisionSummary[] = params.nextFindings.flatMap((finding): FindingRevisionSummary[] => {
    const previousFinding =
      (finding.revisedFromFindingId ? previousFindingMap.get(finding.revisedFromFindingId) : null) ??
      previousFindingMap.get(finding.id) ??
      null;

    if (!previousFinding) {
      return [];
    }

    if (finding.findingStatus === "invalidated") {
      return [{ outcome: "invalidated" as const, finding, previousFinding }];
    }

    if (finding.findingStatus === "confirmed") {
      return [{ outcome: "confirmed" as const, finding, previousFinding }];
    }

    if (
      finding.findingStatus === "revised" ||
      finding.findingStatus === "downgraded" ||
      finding.confidence !== previousFinding.confidence ||
      finding.finding !== previousFinding.finding ||
      finding.assumption !== previousFinding.assumption ||
      finding.uncertainty !== previousFinding.uncertainty
    ) {
      return [{ outcome: "revised" as const, finding, previousFinding }];
    }

    return [];
  });

  return {
    changedFindings,
    removedSuggestedEditGroupIds,
  };
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

function getCellPosition(worksheet: WorksheetData, cellKey: string) {
  const parsed = parseWorksheetCellKey(cellKey);
  if (!parsed) {
    return null;
  }

  const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
  const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);

  if (columnIndex < 0 || rowIndex < 0) {
    return null;
  }

  return {
    columnIndex,
    rowIndex,
  };
}

function isPositionInRange(
  position: { rowIndex: number; columnIndex: number },
  range: WorksheetSelectionRange | null
) {
  if (!range) {
    return false;
  }

  return (
    position.rowIndex >= range.startRowIndex &&
    position.rowIndex <= range.endRowIndex &&
    position.columnIndex >= range.startColumnIndex &&
    position.columnIndex <= range.endColumnIndex
  );
}

function buildFormulaReferenceText(
  worksheet: WorksheetData,
  anchorCellKey: string,
  focusCellKey: string
) {
  if (anchorCellKey === focusCellKey) {
    return anchorCellKey;
  }

  const range = getWorksheetSelectionRange(worksheet, anchorCellKey, focusCellKey);
  if (!range) {
    return focusCellKey;
  }

  const startColumn = worksheet.columns[range.startColumnIndex];
  const startRow = worksheet.rows[range.startRowIndex];
  const endColumn = worksheet.columns[range.endColumnIndex];
  const endRow = worksheet.rows[range.endRowIndex];
  if (!startColumn || !startRow || !endColumn || !endRow) {
    return focusCellKey;
  }

  return `${buildWorksheetCellKey(startColumn.id, startRow.id)}:${buildWorksheetCellKey(endColumn.id, endRow.id)}`;
}

function buildFormattedBorderShadow(format: WorksheetCellFormat | undefined) {
  const border = format?.border;
  if (!border) {
    return "";
  }

  return [
    border.top ? `inset 0 1px 0 ${border.top.color ?? "#94A3B8"}` : null,
    border.bottom ? `inset 0 -1px 0 ${border.bottom.color ?? "#94A3B8"}` : null,
    border.left ? `inset 1px 0 0 ${border.left.color ?? "#94A3B8"}` : null,
    border.right ? `inset -1px 0 0 ${border.right.color ?? "#94A3B8"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function buildSelectionShadow(
  edgeFlags: {
    isTopEdge: boolean;
    isBottomEdge: boolean;
    isLeftEdge: boolean;
    isRightEdge: boolean;
  },
  color: string
) {
  return [
    edgeFlags.isTopEdge ? `inset 0 2px 0 ${color}` : null,
    edgeFlags.isBottomEdge ? `inset 0 -2px 0 ${color}` : null,
    edgeFlags.isLeftEdge ? `inset 2px 0 0 ${color}` : null,
    edgeFlags.isRightEdge ? `inset -2px 0 0 ${color}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function getRangeEdgeFlagsByIndex(
  rowIndex: number,
  columnIndex: number,
  range: WorksheetSelectionRange | null
) {
  if (!range) {
    return {
      isInRange: false,
      isTopEdge: false,
      isBottomEdge: false,
      isLeftEdge: false,
      isRightEdge: false,
    };
  }

  const isInRange =
    rowIndex >= range.startRowIndex &&
    rowIndex <= range.endRowIndex &&
    columnIndex >= range.startColumnIndex &&
    columnIndex <= range.endColumnIndex;

  return {
    isInRange,
    isTopEdge: isInRange && rowIndex === range.startRowIndex,
    isBottomEdge: isInRange && rowIndex === range.endRowIndex,
    isLeftEdge: isInRange && columnIndex === range.startColumnIndex,
    isRightEdge: isInRange && columnIndex === range.endColumnIndex,
  };
}

type WorksheetCellViewProps = {
  activeCellKey: string | null;
  activeEditor: "cell" | "formulaBar" | null;
  canWriteWorksheet: boolean;
  cell: WorksheetCell | undefined;
  cellKey: string;
  columnIndex: number;
  editingCellValue: string;
  fillPreviewRange: WorksheetSelectionRange | null;
  formulaReferenceHighlight: { colorIndex: number } | null;
  formulaReferenceRanges: FormulaReferenceRangeHighlight[];
  rowHeight: number;
  rowIndex: number;
  selectedRange: WorksheetSelectionRange | null;
  onBeginCellEdit: (cellKey: string, cell: WorksheetCell | undefined) => void;
  onBeginFillDrag: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onCellClick: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellContextMenu: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellMouseDown: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellMouseEnter: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onInputBlur: (cellKey: string) => void;
  onInputChange: (value: string) => void;
  onInputKeyDown: (cellKey: string, event: ReactKeyboardEvent<HTMLInputElement>) => void;
  setInputRef: (cellKey: string, node: HTMLInputElement | null) => void;
};

const WorksheetCellView = memo(function WorksheetCellView({
  activeCellKey,
  activeEditor,
  canWriteWorksheet,
  cell,
  cellKey,
  columnIndex,
  editingCellValue,
  fillPreviewRange,
  formulaReferenceHighlight,
  formulaReferenceRanges,
  rowHeight,
  rowIndex,
  selectedRange,
  onBeginCellEdit,
  onBeginFillDrag,
  onCellClick,
  onCellContextMenu,
  onCellMouseDown,
  onCellMouseEnter,
  onInputBlur,
  onInputChange,
  onInputKeyDown,
  setInputRef,
}: WorksheetCellViewProps) {
  const cellFormat = getCellFormat(cell);
  const isEditing = activeCellKey === cellKey && activeEditor === "cell";
  const inputValue = isEditing ? editingCellValue : getFormattedCellDisplayValue(cell);
  const edgeFlags = getRangeEdgeFlagsByIndex(rowIndex, columnIndex, selectedRange);
  const fillPreviewEdgeFlags = getRangeEdgeFlagsByIndex(rowIndex, columnIndex, fillPreviewRange);
  const selectionShadow = edgeFlags.isInRange ? buildSelectionShadow(edgeFlags, SELECTION_OUTLINE_COLOR) : undefined;
  const fillPreviewShadow = fillPreviewEdgeFlags.isInRange
    ? buildSelectionShadow(fillPreviewEdgeFlags, FILL_PREVIEW_OUTLINE_COLOR)
    : undefined;
  const formatBorderShadow = buildFormattedBorderShadow(cellFormat);
  const formulaReferenceStyle = formulaReferenceHighlight
    ? FORMULA_REFERENCE_HIGHLIGHT_STYLES[
        formulaReferenceHighlight.colorIndex % FORMULA_REFERENCE_HIGHLIGHT_STYLES.length
      ]
    : null;
  const formulaReferenceShadow = formulaReferenceStyle
    ? `inset 0 0 0 2px ${formulaReferenceStyle.outlineColor}`
    : undefined;
  const formulaReferenceRangeShadows: string[] = [];
  let formulaReferenceRangeBackgroundColor: string | undefined;
  for (const range of formulaReferenceRanges) {
    const rangeEdgeFlags = getRangeEdgeFlagsByIndex(rowIndex, columnIndex, {
      startRowIndex: range.startRowIndex,
      endRowIndex: range.endRowIndex,
      startColumnIndex: range.startColumnIndex,
      endColumnIndex: range.endColumnIndex,
    });
    if (!rangeEdgeFlags.isInRange) {
      continue;
    }

    const rangeStyle =
      FORMULA_REFERENCE_HIGHLIGHT_STYLES[range.colorIndex % FORMULA_REFERENCE_HIGHLIGHT_STYLES.length];
    const rangeShadow = buildSelectionShadow(rangeEdgeFlags, rangeStyle.outlineColor);
    if (rangeShadow) {
      formulaReferenceRangeShadows.push(rangeShadow);
    }
    if (!formulaReferenceRangeBackgroundColor) {
      formulaReferenceRangeBackgroundColor = rangeStyle.backgroundColor;
    }
  }
  const isSelectedRangeCorner =
    Boolean(selectedRange) &&
    edgeFlags.isBottomEdge &&
    edgeFlags.isRightEdge &&
    !activeCellKey;
  const cellTextAlign = cellFormat.text?.align ?? "left";
  const cellFillColor = edgeFlags.isInRange || fillPreviewEdgeFlags.isInRange
    ? undefined
    : cellFormat.fill?.color ?? formulaReferenceStyle?.backgroundColor ?? formulaReferenceRangeBackgroundColor;

  return (
    <div
      className={`relative border-r border-[var(--border)] last:border-r-0 ${
        edgeFlags.isInRange ? "bg-blue-50/50" : fillPreviewEdgeFlags.isInRange ? "bg-blue-100/50" : ""
      }`}
      style={{
        backgroundColor: cellFillColor,
        height: `${rowHeight}px`,
        boxShadow: [
          fillPreviewShadow,
          selectionShadow,
          formatBorderShadow,
          ...formulaReferenceRangeShadows,
          formulaReferenceShadow,
        ].filter(Boolean).join(", ") || undefined,
      }}
      onMouseDown={(event) => onCellMouseDown(cellKey, event)}
      onContextMenu={(event) => onCellContextMenu(cellKey, event)}
      onMouseEnter={(event) => onCellMouseEnter(cellKey, event)}
      onDoubleClick={() => onBeginCellEdit(cellKey, cell)}
    >
      {isEditing ? (
        <input
          ref={(node) => setInputRef(cellKey, node)}
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onBlur={() => onInputBlur(cellKey)}
          onKeyDown={(event) => onInputKeyDown(cellKey, event)}
          className={CELL_INPUT_CLASS}
          style={{
            height: `${rowHeight}px`,
            textAlign: cellTextAlign,
            fontWeight: cellFormat.text?.bold ? 700 : undefined,
            fontStyle: cellFormat.text?.italic ? "italic" : undefined,
            color: cellFormat.text?.color,
          }}
          placeholder=""
          disabled={!canWriteWorksheet}
          inputMode={cell?.type === "number" ? "decimal" : undefined}
        />
      ) : (
        <div
          className="flex h-full min-w-0 items-start px-2.5 py-1.5 text-sm text-[var(--text-primary)]"
          style={{
            justifyContent: "stretch",
          }}
          onClick={(event) => onCellClick(cellKey, event)}
        >
          <div
            className="min-w-0 w-full whitespace-pre-wrap break-words leading-5"
            style={{
              fontWeight: cellFormat.text?.bold ? 700 : undefined,
              fontStyle: cellFormat.text?.italic ? "italic" : undefined,
              color: cellFormat.text?.color,
              textAlign: cellTextAlign,
            }}
          >
            {getFormattedCellDisplayValue(cell)}
          </div>
        </div>
      )}
      {isSelectedRangeCorner ? (
        <button
          type="button"
          aria-label="Fill handle"
          className="absolute bottom-0.5 right-0.5 z-20 h-2 w-2 rounded-full border border-white bg-blue-600 shadow-sm"
          onMouseDown={onBeginFillDrag}
        />
      ) : null}
    </div>
  );
});

type WorksheetRowViewProps = {
  activeCellKey: string | null;
  activeEditor: "cell" | "formulaBar" | null;
  canWriteWorksheet: boolean;
  editingCellValue: string;
  fillPreviewRange: WorksheetSelectionRange | null;
  formulaReferenceHighlightByCellKey: Map<string, { colorIndex: number }>;
  formulaReferenceRanges: FormulaReferenceRangeHighlight[];
  gridTemplateColumns: string;
  leftSpacerWidth: number;
  rowCells: Array<WorksheetCell | undefined>;
  row: WorksheetRow;
  rowIndex: number;
  rightSpacerWidth: number;
  selectedRange: WorksheetSelectionRange | null;
  visibleColumnStartIndex: number;
  visibleColumns: WorksheetColumn[];
  onBeginCellEdit: (cellKey: string, cell: WorksheetCell | undefined) => void;
  onBeginFillDrag: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onAutoFitRow: (event: ReactMouseEvent<HTMLButtonElement>, rowId: string) => void;
  onBeginRowResize: (event: ReactMouseEvent<HTMLButtonElement>, rowId: string, height: number) => void;
  onCellClick: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellContextMenu: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellMouseDown: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellMouseEnter: (cellKey: string) => void;
  onInputBlur: (cellKey: string) => void;
  onInputChange: (value: string) => void;
  onInputKeyDown: (cellKey: string, event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onRowContextMenu: (event: ReactMouseEvent<HTMLDivElement>, rowIndex: number) => void;
  setInputRef: (cellKey: string, node: HTMLInputElement | null) => void;
};

const WorksheetRowView = memo(function WorksheetRowView({
  activeCellKey,
  activeEditor,
  canWriteWorksheet,
  editingCellValue,
  fillPreviewRange,
  formulaReferenceHighlightByCellKey,
  formulaReferenceRanges,
  gridTemplateColumns,
  leftSpacerWidth,
  rowCells,
  row,
  rowIndex,
  rightSpacerWidth,
  selectedRange,
  visibleColumnStartIndex,
  visibleColumns,
  onBeginCellEdit,
  onBeginFillDrag,
  onAutoFitRow,
  onBeginRowResize,
  onCellClick,
  onCellContextMenu,
  onCellMouseDown,
  onCellMouseEnter,
  onInputBlur,
  onInputChange,
  onInputKeyDown,
  onRowContextMenu,
  setInputRef,
}: WorksheetRowViewProps) {
  return (
    <div
      className="grid border-b border-[var(--border)] last:border-b-0"
      style={{
        gridTemplateColumns,
        minHeight: `${row.height}px`,
      }}
    >
      <div
        className="sticky left-0 z-10 border-r border-[var(--border)] bg-[#F8FAFC] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] relative"
        style={{ height: `${row.height}px` }}
        onContextMenu={(event) => onRowContextMenu(event, rowIndex)}
      >
        {row.id}
        <button
          type="button"
          aria-label={`Resize row ${row.id}`}
          className="absolute bottom-0 left-0 h-2 w-full translate-y-1/2 cursor-row-resize"
          onMouseDown={(event) => onBeginRowResize(event, row.id, row.height)}
          onDoubleClick={(event) => onAutoFitRow(event, row.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </div>
      <div
        aria-hidden="true"
        className="border-r border-[var(--border)] bg-white"
        style={{ height: `${row.height}px`, width: `${leftSpacerWidth}px` }}
      />
      {visibleColumns.map((column, columnOffset) => {
        const cellKey = buildWorksheetCellKey(column.id, row.id);
        const cell = rowCells[columnOffset];
        return (
          <WorksheetCellView
            key={cellKey}
            activeCellKey={activeCellKey}
            activeEditor={activeEditor}
            canWriteWorksheet={canWriteWorksheet}
            cell={cell}
            cellKey={cellKey}
            columnIndex={visibleColumnStartIndex + columnOffset}
            editingCellValue={editingCellValue}
            fillPreviewRange={fillPreviewRange}
            formulaReferenceHighlight={formulaReferenceHighlightByCellKey.get(cellKey) ?? null}
            formulaReferenceRanges={formulaReferenceRanges}
            rowHeight={row.height}
            rowIndex={rowIndex}
            selectedRange={selectedRange}
            onBeginCellEdit={onBeginCellEdit}
            onBeginFillDrag={onBeginFillDrag}
            onCellClick={onCellClick}
            onCellContextMenu={onCellContextMenu}
            onCellMouseDown={onCellMouseDown}
            onCellMouseEnter={onCellMouseEnter}
            onInputBlur={onInputBlur}
            onInputChange={onInputChange}
            onInputKeyDown={onInputKeyDown}
            setInputRef={setInputRef}
          />
        );
      })}
      <div
        aria-hidden="true"
        className="bg-white"
        style={{ height: `${row.height}px`, width: `${rightSpacerWidth}px` }}
      />
    </div>
  );
}, (previousProps, nextProps) => {
  if (
    previousProps.activeCellKey !== nextProps.activeCellKey ||
    previousProps.activeEditor !== nextProps.activeEditor ||
    previousProps.canWriteWorksheet !== nextProps.canWriteWorksheet ||
    previousProps.editingCellValue !== nextProps.editingCellValue ||
    previousProps.fillPreviewRange !== nextProps.fillPreviewRange ||
    previousProps.formulaReferenceHighlightByCellKey !== nextProps.formulaReferenceHighlightByCellKey ||
    previousProps.formulaReferenceRanges !== nextProps.formulaReferenceRanges ||
    previousProps.gridTemplateColumns !== nextProps.gridTemplateColumns ||
    previousProps.leftSpacerWidth !== nextProps.leftSpacerWidth ||
    previousProps.row !== nextProps.row ||
    previousProps.rowIndex !== nextProps.rowIndex ||
    previousProps.rightSpacerWidth !== nextProps.rightSpacerWidth ||
    previousProps.selectedRange !== nextProps.selectedRange
  ) {
    return false;
  }

  if (
    previousProps.visibleColumnStartIndex !== nextProps.visibleColumnStartIndex ||
    previousProps.visibleColumns !== nextProps.visibleColumns
  ) {
    return false;
  }

  if (previousProps.rowCells.length !== nextProps.rowCells.length) {
    return false;
  }

  for (let index = 0; index < previousProps.rowCells.length; index += 1) {
    if (previousProps.rowCells[index] !== nextProps.rowCells[index]) {
      return false;
    }
  }

  return (
    previousProps.onBeginCellEdit === nextProps.onBeginCellEdit &&
    previousProps.onBeginFillDrag === nextProps.onBeginFillDrag &&
    previousProps.onAutoFitRow === nextProps.onAutoFitRow &&
    previousProps.onBeginRowResize === nextProps.onBeginRowResize &&
    previousProps.onCellClick === nextProps.onCellClick &&
    previousProps.onCellContextMenu === nextProps.onCellContextMenu &&
    previousProps.onCellMouseDown === nextProps.onCellMouseDown &&
    previousProps.onCellMouseEnter === nextProps.onCellMouseEnter &&
    previousProps.onInputBlur === nextProps.onInputBlur &&
    previousProps.onInputChange === nextProps.onInputChange &&
    previousProps.onInputKeyDown === nextProps.onInputKeyDown &&
    previousProps.onRowContextMenu === nextProps.onRowContextMenu &&
    previousProps.setInputRef === nextProps.setInputRef
  );
});

function getRawCellInput(cell: WorksheetCell | undefined) {
  if (!cell) {
    return "";
  }

  if (cell.formula) {
    return cell.formula;
  }

  if (typeof cell.value === "number") {
    return String(cell.value);
  }

  if (typeof cell.value === "string") {
    return cell.value;
  }

  return "";
}

function getNumericCellValue(cell: WorksheetCell | undefined) {
  if (!cell || cell.formula) {
    return null;
  }

  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return cell.value;
  }

  return null;
}

function getDefaultDecimalPlaces(kind: WorksheetNumberFormatKind) {
  if (kind === "currency") {
    return 2;
  }

  if (kind === "number") {
    return 2;
  }

  return 0;
}

function clampNumberDecimalPlaces(value: number) {
  return Math.max(0, Math.min(MAX_NUMBER_DECIMAL_PLACES, value));
}

function isZeroStepSeries(values: number[]) {
  return values.every((value) => value === 0);
}

function getFillPreview(
  worksheet: WorksheetData,
  sourceRange: WorksheetSelectionRange | null,
  focusCellKey: string | null
) {
  if (!sourceRange || !focusCellKey) {
    return null;
  }

  const focusPosition = getCellPosition(worksheet, focusCellKey);
  if (!focusPosition) {
    return null;
  }

  const rowDelta = focusPosition.rowIndex - sourceRange.endRowIndex;
  const columnDelta = focusPosition.columnIndex - sourceRange.endColumnIndex;

  if (rowDelta <= 0 && columnDelta <= 0) {
    return null;
  }

  const useRightward = columnDelta > rowDelta;

  if (useRightward && columnDelta > 0) {
    return {
      direction: "right" as const,
      range: {
        startRowIndex: sourceRange.startRowIndex,
        endRowIndex: sourceRange.endRowIndex,
        startColumnIndex: sourceRange.endColumnIndex + 1,
        endColumnIndex: focusPosition.columnIndex,
      } satisfies WorksheetSelectionRange,
    };
  }

  if (rowDelta > 0) {
    return {
      direction: "down" as const,
      range: {
        startRowIndex: sourceRange.endRowIndex + 1,
        endRowIndex: focusPosition.rowIndex,
        startColumnIndex: sourceRange.startColumnIndex,
        endColumnIndex: sourceRange.endColumnIndex,
      } satisfies WorksheetSelectionRange,
    };
  }

  return null;
}

function getRowOffsets(rows: WorksheetRow[]) {
  const offsets: number[] = new Array(rows.length + 1);
  offsets[0] = 0;

  for (let index = 0; index < rows.length; index += 1) {
    offsets[index + 1] = offsets[index] + rows[index].height;
  }

  return offsets;
}

function getRowVirtualizationWindow(
  rows: WorksheetRow[],
  offsets: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number
) {
  const totalHeight = offsets[rows.length] ?? 0;
  if (rows.length === 0) {
    return {
      offsets,
      totalHeight,
      startIndex: 0,
      endIndex: -1,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      virtualRows: [] as Array<{ row: WorksheetRow; rowIndex: number }>,
    };
  }

  const normalizedScrollTop = Math.max(0, scrollTop);
  const normalizedViewportHeight = Math.max(1, viewportHeight);
  const viewportBottom = normalizedScrollTop + normalizedViewportHeight;
  let low = 0;
  let high = rows.length - 1;
  let firstVisibleIndex = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] < normalizedScrollTop) {
      low = middle + 1;
    } else {
      firstVisibleIndex = middle;
      high = middle - 1;
    }
  }

  let lastVisibleIndex = firstVisibleIndex;
  while (lastVisibleIndex < rows.length - 1 && (offsets[lastVisibleIndex] ?? 0) <= viewportBottom) {
    lastVisibleIndex += 1;
  }

  const startIndex = Math.max(0, firstVisibleIndex - overscan);
  const endIndex = Math.min(rows.length - 1, lastVisibleIndex + overscan);
  const virtualRows = rows.slice(startIndex, endIndex + 1).map((row, offset) => ({
    row,
    rowIndex: startIndex + offset,
  }));

  return {
    offsets,
    totalHeight,
    startIndex,
    endIndex,
    topSpacerHeight: offsets[startIndex] ?? 0,
    bottomSpacerHeight: Math.max(0, totalHeight - (offsets[endIndex + 1] ?? totalHeight)),
    virtualRows,
  };
}

export function OpportunityPricingWorksheetBoard({
  worksheetId: explicitWorksheetId,
  onDirtyStateChange,
}: {
  worksheetId?: string;
  onDirtyStateChange?: (isDirty: boolean) => void;
}) {
  const sharedOpportunity = useOpportunityWorkspaceData();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [worksheetId, setWorksheetId] = useState<string | null>(null);
  const [worksheetName, setWorksheetName] = useState<string | null>(null);
  const [worksheetTradePackage, setWorksheetTradePackage] = useState<string | null>(null);
  const [worksheet, setWorksheet] = useState<WorksheetData>(() => createDefaultWorksheetData());
  const worksheetRef = useRef<WorksheetData>(worksheet);
  const [pricingSummary, setPricingSummary] = useState<WorksheetPricingSummary>(() =>
    createDefaultWorksheetPricingSummary()
  );
  const [extractedPricingData, setExtractedPricingData] = useState<WorksheetExtractedPricingData>(() =>
    createDefaultWorksheetExtractedPricingData()
  );
  const [isLoadingWorksheet, setIsLoadingWorksheet] = useState(true);
  const [isSavingWorksheet, setIsSavingWorksheet] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGeneratingAiPreview, setIsGeneratingAiPreview] = useState(false);
  const [isSubmittingAiReview, setIsSubmittingAiReview] = useState(false);
  const [aiPreviewResponse, setAiPreviewResponse] = useState<PricingWorksheetAiPreviewResponse | null>(null);
  const [aiPreviewWorksheetName, setAiPreviewWorksheetName] = useState("");
  const [aiPreviewTradePackage, setAiPreviewTradePackage] = useState("");
  const [aiPreviewError, setAiPreviewError] = useState<string | null>(null);
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiJobStatus, setAiJobStatus] = useState<PricingWorksheetAiJobStatus | null>(null);
  const [aiJobProgressLabel, setAiJobProgressLabel] = useState<string | null>(null);
  const [aiJobError, setAiJobError] = useState<PricingWorksheetAiJobError | null>(null);
  const [aiFindingStates, setAiFindingStates] = useState<Record<string, PricingWorksheetAiFindingDisposition>>({});
  const [aiAppliedSuggestedEditGroupIds, setAiAppliedSuggestedEditGroupIds] = useState<string[]>([]);
  const [aiFollowUpPrompt, setAiFollowUpPrompt] = useState("");
  const [isSubmittingAiFollowUp, setIsSubmittingAiFollowUp] = useState(false);
  const aiJobPollTimeoutRef = useRef<number | null>(null);
  const [historyPast, setHistoryPast] = useState<WorksheetData[]>([]);
  const [historyFuture, setHistoryFuture] = useState<WorksheetData[]>([]);
  const historyPastRef = useRef<WorksheetData[]>([]);
  const historyFutureRef = useRef<WorksheetData[]>([]);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<"cell" | "formulaBar" | null>(null);
  const [editingCellValue, setEditingCellValue] = useState("");
  const [selectionAnchorCellKey, setSelectionAnchorCellKey] = useState<string | null>(null);
  const [selectionFocusCellKey, setSelectionFocusCellKey] = useState<string | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [fillSourceRange, setFillSourceRange] = useState<WorksheetSelectionRange | null>(null);
  const [fillPreviewFocusCellKey, setFillPreviewFocusCellKey] = useState<string | null>(null);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
  const [columnResizeStartX, setColumnResizeStartX] = useState(0);
  const [columnResizeStartWidth, setColumnResizeStartWidth] = useState(0);
  const [columnResizePreviewWidth, setColumnResizePreviewWidth] = useState<number | null>(null);
  const [resizingRowId, setResizingRowId] = useState<string | null>(null);
  const [rowResizeStartY, setRowResizeStartY] = useState(0);
  const [rowResizeStartHeight, setRowResizeStartHeight] = useState(0);
  const [rowResizePreviewHeight, setRowResizePreviewHeight] = useState<number | null>(null);
  const [worksheetViewportScrollLeft, setWorksheetViewportScrollLeft] = useState(0);
  const [worksheetViewportScrollTop, setWorksheetViewportScrollTop] = useState(0);
  const [worksheetViewportHeight, setWorksheetViewportHeight] = useState(WORKSHEET_VIEWPORT_FALLBACK_HEIGHT);
  const [worksheetViewportWidth, setWorksheetViewportWidth] = useState(WORKSHEET_VIEWPORT_FALLBACK_WIDTH);
  const [worksheetZoom, setWorksheetZoom] = useState(1);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const worksheetTextMeasureRef = useRef<HTMLDivElement | null>(null);
  const worksheetSurfaceRef = useRef<HTMLDivElement | null>(null);
  const worksheetViewportRef = useRef<HTMLDivElement | null>(null);
  const formulaBarRef = useRef<HTMLTextAreaElement | null>(null);
  const formattingToolbarRef = useRef<HTMLDivElement | null>(null);
  const didCountBoardMountRef = useRef(false);
  const isWorksheetBoardMountedRef = useRef(false);
  const activeWorksheetLoadScopeKeyRef = useRef<string | null>(null);
  const loadedWorksheetScopeKeyRef = useRef<string | null>(null);
  const loadingWorksheetScopeKeyRef = useRef<string | null>(null);
  const firstGridRenderScopeKeyRef = useRef<string | null>(null);
  const suppressBlurCommitCellKeyRef = useRef<string | null>(null);
  const suppressFormulaBarBlurCommitRef = useRef(false);
  const editingCellValueRef = useRef("");
  const isDraggingSelectionRef = useRef(false);
  const pendingSelectionDragRef = useRef<{
    anchorCellKey: string;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const rangeDragAnchorCellKeyRef = useRef<string | null>(null);
  const formulaReferenceDragAnchorCellKeyRef = useRef<string | null>(null);
  const formulaReferenceDragBaseValueRef = useRef<string | null>(null);
  const didDragSelectionRef = useRef(false);
  const handledFormulaReferenceMouseDownRef = useRef(false);
  const fillSourceRangeRef = useRef<WorksheetSelectionRange | null>(null);
  const fillPreviewFocusCellKeyRef = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<WorksheetContextMenuState>(null);
  const locationHrefRef = useRef("");

  useEffect(() => {
    if (didCountBoardMountRef.current) {
      markPricingWorksheetPerformance("board-mount-effect-replay", {
        worksheetId: explicitWorksheetId ?? "legacy",
      });
      return;
    }

    didCountBoardMountRef.current = true;
    countPricingWorksheetPerformance("board-mount-count", {
      worksheetId: explicitWorksheetId ?? "legacy",
    });
  }, [explicitWorksheetId]);

  useEffect(() => {
    isWorksheetBoardMountedRef.current = true;
    locationHrefRef.current = window.location.href;

    return () => {
      if (aiJobPollTimeoutRef.current) {
        window.clearTimeout(aiJobPollTimeoutRef.current);
        aiJobPollTimeoutRef.current = null;
      }
      isWorksheetBoardMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onDirtyStateChange?.(isDirty);
  }, [isDirty, onDirtyStateChange]);

  const canWriteWorksheet = useMemo(() => {
    return (
      session?.role === "owner" ||
      session?.role === "admin" ||
      session?.role === "qs" ||
      session?.role === "project_manager"
    );
  }, [session?.role]);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const logAiReviewIntelligenceEvents = useCallback((params: Array<{
    eventType:
      | "worksheet_ai_review_generated"
      | "worksheet_ai_followup_submitted"
      | "worksheet_ai_finding_accepted"
      | "worksheet_ai_finding_rejected"
      | "worksheet_ai_finding_invalidated"
      | "worksheet_ai_finding_revised"
      | "worksheet_ai_finding_confirmed"
      | "worksheet_ai_suggested_edit_applied";
    action: "reviewed" | "revised" | "accepted" | "rejected" | "invalidated" | "confirmed" | "applied";
    reason?: string | null;
    diffData?: Record<string, Json | null>;
  }>) => {
    const organizationId = session?.organizationId;
    const opportunityId = sharedOpportunity.opportunityId;
    const currentWorksheetId = worksheetId;

    if (!supabase || !organizationId || !opportunityId || !currentWorksheetId) {
      return;
    }

    void writePricingWorksheetIntelligenceEvents(supabase, params.map((entry) =>
      buildPricingWorksheetIntelligenceEvent({
        organizationId,
        opportunityId,
        entityId: currentWorksheetId,
        worksheetName: worksheetName?.trim() || worksheet.sheetName || "Pricing Worksheet",
        tradePackage: worksheetTradePackage,
        worksheet: worksheetRef.current,
        eventType: entry.eventType,
        eventFamily: "ai_review",
        action: entry.action,
        reason: entry.reason ?? null,
        diffData: entry.diffData,
      }),
    )).catch((eventWriteError) => {
      logPricingWorksheetIntelligenceFailure(params[0]?.eventType ?? "worksheet_ai_review_generated", eventWriteError);
    });
  }, [
    session?.organizationId,
    sharedOpportunity.opportunityId,
    supabase,
    worksheet.sheetName,
    worksheetId,
    worksheetName,
    worksheetTradePackage,
  ]);

  const logAiReviewIntelligenceEvent = useCallback((params: {
    eventType:
      | "worksheet_ai_review_generated"
      | "worksheet_ai_followup_submitted"
      | "worksheet_ai_finding_accepted"
      | "worksheet_ai_finding_rejected"
      | "worksheet_ai_finding_invalidated"
      | "worksheet_ai_finding_revised"
      | "worksheet_ai_finding_confirmed"
      | "worksheet_ai_suggested_edit_applied";
    action: "reviewed" | "revised" | "accepted" | "rejected" | "invalidated" | "confirmed" | "applied";
    reason?: string | null;
    diffData?: Record<string, Json | null>;
  }) => {
    logAiReviewIntelligenceEvents([params]);
  }, [logAiReviewIntelligenceEvents]);

  const selectedRange = useMemo(
    () =>
      getWorksheetSelectionRange(
        worksheet,
        selectionAnchorCellKey,
        selectionFocusCellKey
      ),
    [selectionAnchorCellKey, selectionFocusCellKey, worksheet]
  );

  const selectedSingleCellKey =
    selectionAnchorCellKey &&
    selectionFocusCellKey &&
    selectionAnchorCellKey === selectionFocusCellKey
      ? selectionAnchorCellKey
      : null;

  const selectedWorksheetCellKey =
    selectionFocusCellKey ??
    selectionAnchorCellKey ??
    buildWorksheetCellKey("A", "1");

  const formulaBarCellKey = activeCellKey ?? selectedWorksheetCellKey;
  const formulaBarCell = formulaBarCellKey ? worksheet.cells[formulaBarCellKey] : undefined;
  const formulaBarValue =
    activeCellKey === formulaBarCellKey
      ? editingCellValue
      : getRawCellInput(formulaBarCell);
  const {
    formulaReferenceHighlightByCellKey,
    formulaReferenceRanges,
  } = useMemo(() => {
    const trimmedFormulaBarValue = formulaBarValue.trim();
    if (!trimmedFormulaBarValue.startsWith("=")) {
      return {
        formulaReferenceHighlightByCellKey: new Map<string, { colorIndex: number }>(),
        formulaReferenceRanges: [] as FormulaReferenceRangeHighlight[],
      };
    }

    const colorIndexByReference = new Map<string, number>();
    const highlights = new Map<string, { colorIndex: number }>();
    const ranges: FormulaReferenceRangeHighlight[] = [];
    const rangeKeys = new Set<string>();

    for (const reference of extractPricingWorksheetFormulaReferences(trimmedFormulaBarValue)) {
      let colorIndex = colorIndexByReference.get(reference.normalizedRef);
      if (typeof colorIndex !== "number") {
        colorIndex = colorIndexByReference.size;
        colorIndexByReference.set(reference.normalizedRef, colorIndex);
      }

      if (reference.kind === "cell") {
        if (highlights.has(reference.normalizedRef)) {
          continue;
        }

        highlights.set(reference.normalizedRef, { colorIndex });
        continue;
      }

      const rangeKey = `${reference.startRowIndex}:${reference.startColumnIndex}:${reference.endRowIndex}:${reference.endColumnIndex}`;
      if (rangeKeys.has(rangeKey)) {
        continue;
      }
      rangeKeys.add(rangeKey);

      ranges.push({
        colorIndex,
        startRowIndex: reference.startRowIndex,
        startColumnIndex: reference.startColumnIndex,
        endRowIndex: reference.endRowIndex,
        endColumnIndex: reference.endColumnIndex,
      });
    }

    return {
      formulaReferenceHighlightByCellKey: highlights,
      formulaReferenceRanges: ranges,
    };
  }, [formulaBarValue]);
  const worksheetDisplayName =
    worksheetName?.trim() || worksheet.sheetName.trim() || "Pricing Worksheet";
  const selectedNumberFormat = getCellFormat(worksheet.cells[selectedWorksheetCellKey]).number;
  const selectedNumberFormatKind = selectedNumberFormat?.kind ?? "general";
  const selectedNegativeStyle = selectedNumberFormat?.negativeStyle ?? "minus";

  const resetAiPreviewState = useCallback(() => {
    if (aiJobPollTimeoutRef.current) {
      window.clearTimeout(aiJobPollTimeoutRef.current);
      aiJobPollTimeoutRef.current = null;
    }
    setAiPreviewResponse(null);
    setAiPreviewError(null);
    setIsGeneratingAiPreview(false);
    setIsSubmittingAiReview(false);
    setIsSubmittingAiFollowUp(false);
    setAiJobId(null);
    setAiJobStatus(null);
    setAiJobProgressLabel(null);
    setAiJobError(null);
    setAiFindingStates({});
    setAiAppliedSuggestedEditGroupIds([]);
    setAiFollowUpPrompt("");
  }, []);

  const openAiDialog = useCallback(() => {
    setAiPreviewError(null);
    setAiPreviewResponse(null);
    setAiPrompt("");
    setAiPreviewWorksheetName(worksheetDisplayName);
    setAiPreviewTradePackage(worksheetTradePackage ?? "");
    setAiFindingStates({});
    setAiAppliedSuggestedEditGroupIds([]);
    setAiFollowUpPrompt("");
    setIsAiDialogOpen(true);
  }, [worksheetDisplayName, worksheetTradePackage]);

  const handleAiDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (isGeneratingAiPreview || isSubmittingAiReview) {
      return;
    }

    if (!nextOpen) {
      resetAiPreviewState();
    }

    setIsAiDialogOpen(nextOpen);
  }, [isGeneratingAiPreview, isSubmittingAiReview, resetAiPreviewState]);

  const confirmDiscardUnsavedChanges = useCallback(() => {
    if (!isDirty) {
      return true;
    }

    return window.confirm(
      "You have unsaved pricing worksheet changes. Leave this page and discard those local edits?"
    );
  }, [isDirty]);

  const handleAiPromptChange = useCallback((value: string) => {
    setAiPrompt(value);
    setAiPreviewResponse(null);
    setAiPreviewError(null);
    setAiJobError(null);
    setAiJobStatus(null);
    setAiJobProgressLabel(null);
  }, []);

  const handleAiPreviewWorksheetNameChange = useCallback((event: ChangeEvent<HTMLInputElement> | string) => {
    setAiPreviewWorksheetName(typeof event === "string" ? event : event.target.value);
  }, []);

  const handleAiPreviewTradePackageChange = useCallback((event: ChangeEvent<HTMLInputElement> | string) => {
    setAiPreviewTradePackage(typeof event === "string" ? event : event.target.value);
  }, []);

  const buildAiFollowUpContext = useCallback((): PricingWorksheetAiFollowUpContext | null => {
    if (!aiPreviewResponse?.preview.assistant) {
      return null;
    }

    return {
      previousReviewFindings: aiPreviewResponse.preview.assistant.reviewFindings ?? [],
      previousReviewSummary: aiPreviewResponse.preview.assistant.reviewSummary ?? null,
      previousSuggestedEditGroups: aiPreviewResponse.preview.assistant.suggestedEditGroups ?? [],
      acceptedFindingIds: Object.entries(aiFindingStates)
        .filter(([, disposition]) => disposition === "accepted")
        .map(([findingId]) => findingId),
      rejectedFindingIds: Object.entries(aiFindingStates)
        .filter(([, disposition]) => disposition === "rejected")
        .map(([findingId]) => findingId),
      appliedEditGroupIds: aiAppliedSuggestedEditGroupIds,
      userCorrection: aiFollowUpPrompt.trim() || null,
    };
  }, [aiAppliedSuggestedEditGroupIds, aiFindingStates, aiFollowUpPrompt, aiPreviewResponse]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!isDirty || event.defaultPrevented) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const href = anchor.href;
      if (!href || href === window.location.href) {
        return;
      }

      if (!confirmDiscardUnsavedChanges()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [confirmDiscardUnsavedChanges, isDirty]);

  useEffect(() => {
    if (onDirtyStateChange) {
      return;
    }

    const handlePopState = () => {
      const previousHref = locationHrefRef.current || window.location.href;
      const nextHref = window.location.href;
      locationHrefRef.current = nextHref;

      if (!isDirty) {
        return;
      }

      if (confirmDiscardUnsavedChanges()) {
        return;
      }

      window.history.pushState(window.history.state, "", previousHref);
      locationHrefRef.current = previousHref;
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [confirmDiscardUnsavedChanges, isDirty, onDirtyStateChange]);

  const effectiveColumns = useMemo(
    () =>
      worksheet.columns.map((column) => ({
        ...column,
        width:
          column.id === resizingColumnId && columnResizePreviewWidth !== null
            ? columnResizePreviewWidth
            : column.width,
      })),
    [columnResizePreviewWidth, resizingColumnId, worksheet.columns]
  );

  const effectiveRows = useMemo(
    () =>
      worksheet.rows.map((row) => ({
        ...row,
        height:
          row.id === resizingRowId && rowResizePreviewHeight !== null
            ? rowResizePreviewHeight
            : row.height,
      })),
    [resizingRowId, rowResizePreviewHeight, worksheet.rows]
  );

  const columnOffsets = useMemo(() => getColumnOffsets(effectiveColumns), [effectiveColumns]);
  const normalizedWorksheetZoom = worksheetZoom > 0 ? worksheetZoom : 1;
  const zoomAdjustedScrollTop = worksheetViewportScrollTop / normalizedWorksheetZoom;
  const zoomAdjustedScrollLeft = worksheetViewportScrollLeft / normalizedWorksheetZoom;
  const zoomAdjustedViewportHeight = worksheetViewportHeight / normalizedWorksheetZoom;
  const zoomAdjustedViewportWidth = worksheetViewportWidth / normalizedWorksheetZoom;

  const virtualColumns = useMemo(
    () =>
      getColumnVirtualizationWindow(
        effectiveColumns,
        columnOffsets,
        zoomAdjustedScrollLeft,
        Math.max(0, zoomAdjustedViewportWidth - WORKSHEET_ROW_GUTTER_WIDTH),
        WORKSHEET_COLUMN_OVERSCAN
      ),
    [columnOffsets, effectiveColumns, zoomAdjustedScrollLeft, zoomAdjustedViewportWidth]
  );

  const virtualGridTemplateColumns = useMemo(
    () =>
      [
        `${WORKSHEET_ROW_GUTTER_WIDTH}px`,
        `${virtualColumns.leftSpacerWidth}px`,
        ...virtualColumns.visibleColumns.map((column) => `${column.width}px`),
        `${virtualColumns.rightSpacerWidth}px`,
      ].join(" "),
    [virtualColumns.leftSpacerWidth, virtualColumns.rightSpacerWidth, virtualColumns.visibleColumns]
  );

  const fillPreview = useMemo(
    () => getFillPreview(worksheet, fillSourceRange, fillPreviewFocusCellKey),
    [fillPreviewFocusCellKey, fillSourceRange, worksheet]
  );

  const rowOffsets = useMemo(() => getRowOffsets(effectiveRows), [effectiveRows]);
  const virtualRows = useMemo(
    () =>
      getRowVirtualizationWindow(
        effectiveRows,
        rowOffsets,
        zoomAdjustedScrollTop,
        zoomAdjustedViewportHeight,
        WORKSHEET_ROW_OVERSCAN
      ),
    [effectiveRows, rowOffsets, zoomAdjustedScrollTop, zoomAdjustedViewportHeight]
  );

  const visibleRowCells = useMemo(() => {
    return new Map(
      virtualRows.virtualRows.map(({ row }) => [
        row.id,
        virtualColumns.visibleColumns.map((column) => worksheet.cells[buildWorksheetCellKey(column.id, row.id)]),
      ])
    );
  }, [virtualColumns.visibleColumns, virtualRows.virtualRows, worksheet.cells]);

  useEffect(() => {
    if (isLoadingWorksheet) {
      return;
    }

    const scopeKey = `${session?.organizationId ?? "unknown"}:${sharedOpportunity.opportunityId}:${explicitWorksheetId ?? "legacy"}`;
    if (firstGridRenderScopeKeyRef.current === scopeKey) {
      return;
    }

      firstGridRenderScopeKeyRef.current = scopeKey;
    markPricingWorksheetPerformance("first-grid-render", {
      scopeKey,
      worksheetId: explicitWorksheetId ?? worksheetId ?? "legacy",
      virtualRowCount: virtualRows.virtualRows.length,
      virtualColumnCount: virtualColumns.visibleColumns.length,
      totalRowCount: worksheet.rows.length,
      columnCount: worksheet.columns.length,
      cellCount: Object.keys(worksheet.cells).length,
      viewportHeight: zoomAdjustedViewportHeight,
      viewportWidth: zoomAdjustedViewportWidth,
    });
  }, [
    explicitWorksheetId,
    isLoadingWorksheet,
    session?.organizationId,
    sharedOpportunity.opportunityId,
    virtualColumns.visibleColumns.length,
    virtualRows.virtualRows.length,
    worksheet.cells,
    worksheet.columns.length,
    worksheet.rows.length,
    worksheetId,
    zoomAdjustedViewportHeight,
    zoomAdjustedViewportWidth,
  ]);

  useEffect(() => {
    worksheetRef.current = worksheet;
  }, [worksheet]);

  useEffect(() => {
    historyPastRef.current = historyPast;
  }, [historyPast]);

  useEffect(() => {
    historyFutureRef.current = historyFuture;
  }, [historyFuture]);

  useEffect(() => {
    fillSourceRangeRef.current = fillSourceRange;
  }, [fillSourceRange]);

  useEffect(() => {
    fillPreviewFocusCellKeyRef.current = fillPreviewFocusCellKey;
  }, [fillPreviewFocusCellKey]);

  useEffect(() => {
    editingCellValueRef.current = editingCellValue;
  }, [editingCellValue]);

  const clearSelectionDragState = useCallback(() => {
    if (
      !isDraggingSelectionRef.current &&
      !pendingSelectionDragRef.current &&
      !rangeDragAnchorCellKeyRef.current &&
      !formulaReferenceDragAnchorCellKeyRef.current
    ) {
      return;
    }

    isDraggingSelectionRef.current = false;
    pendingSelectionDragRef.current = null;
    rangeDragAnchorCellKeyRef.current = null;
    formulaReferenceDragAnchorCellKeyRef.current = null;
    formulaReferenceDragBaseValueRef.current = null;
    setIsDraggingSelection(false);
  }, []);

  const clearFillDragState = useCallback(() => {
    if (!isDraggingFill && !fillSourceRangeRef.current && !fillPreviewFocusCellKeyRef.current) {
      return;
    }

    setIsDraggingFill(false);
    setFillSourceRange(null);
    fillSourceRangeRef.current = null;
    setFillPreviewFocusCellKey(null);
    fillPreviewFocusCellKeyRef.current = null;
  }, [isDraggingFill]);

  const clearColumnResizeState = useCallback(() => {
    if (!resizingColumnId && columnResizePreviewWidth === null) {
      return;
    }

    setResizingColumnId(null);
    setColumnResizePreviewWidth(null);
  }, [columnResizePreviewWidth, resizingColumnId]);

  const clearRowResizeState = useCallback(() => {
    if (!resizingRowId && rowResizePreviewHeight === null) {
      return;
    }

    setResizingRowId(null);
    setRowResizePreviewHeight(null);
  }, [resizingRowId, rowResizePreviewHeight]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearSelectionDragState();
      }
    };

    window.addEventListener("mouseup", clearSelectionDragState);
    window.addEventListener("pointerup", clearSelectionDragState);
    window.addEventListener("blur", clearSelectionDragState);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("mouseup", clearSelectionDragState);
      window.removeEventListener("pointerup", clearSelectionDragState);
      window.removeEventListener("blur", clearSelectionDragState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearSelectionDragState]);

  useEffect(() => {
    const viewport = worksheetViewportRef.current;
    if (!viewport) {
      return;
    }

    const measureViewport = () => {
      setWorksheetViewportHeight(viewport.clientHeight || WORKSHEET_VIEWPORT_FALLBACK_HEIGHT);
      setWorksheetViewportWidth(viewport.clientWidth || WORKSHEET_VIEWPORT_FALLBACK_WIDTH);
      setWorksheetViewportScrollLeft(viewport.scrollLeft);
      setWorksheetViewportScrollTop(viewport.scrollTop);
    };

    measureViewport();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measureViewport();
          });
    resizeObserver?.observe(viewport);
    window.addEventListener("resize", measureViewport);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureViewport);
    };
  }, [isLoadingWorksheet]);

  useEffect(() => {
    const viewport = worksheetViewportRef.current;
    const focusCellKey = selectionFocusCellKey ?? selectionAnchorCellKey;
    if (!viewport || !focusCellKey || activeCellKey) {
      return;
    }

    const position = getCellPosition(worksheet, focusCellKey);
    if (!position) {
      return;
    }

    const rowTop = rowOffsets[position.rowIndex] ?? 0;
    const rowBottom = rowOffsets[position.rowIndex + 1] ?? rowTop;
    const viewportTop = viewport.scrollTop / normalizedWorksheetZoom;
    const viewportBottom = viewportTop + zoomAdjustedViewportHeight;
    const viewportLeft = viewport.scrollLeft / normalizedWorksheetZoom;
    const effectiveViewportWidth = Math.max(0, zoomAdjustedViewportWidth - WORKSHEET_ROW_GUTTER_WIDTH);
    const viewportRight = viewportLeft + effectiveViewportWidth;
    const columnLeft = columnOffsets[position.columnIndex] ?? 0;
    const columnRight = columnOffsets[position.columnIndex + 1] ?? columnLeft;

    if (rowTop < viewportTop) {
      const nextScrollTop = rowTop * normalizedWorksheetZoom;
      viewport.scrollTop = nextScrollTop;
      setWorksheetViewportScrollTop(nextScrollTop);
    } else if (rowBottom > viewportBottom) {
      const nextScrollTop = Math.max(0, rowBottom - zoomAdjustedViewportHeight) * normalizedWorksheetZoom;
      viewport.scrollTop = nextScrollTop;
      setWorksheetViewportScrollTop(nextScrollTop);
    }

    if (columnLeft < viewportLeft) {
      const nextScrollLeft = columnLeft * normalizedWorksheetZoom;
      viewport.scrollLeft = nextScrollLeft;
      setWorksheetViewportScrollLeft(nextScrollLeft);
      return;
    }

    if (columnRight > viewportRight) {
      const nextScrollLeft = Math.max(0, columnRight - effectiveViewportWidth) * normalizedWorksheetZoom;
      viewport.scrollLeft = nextScrollLeft;
      setWorksheetViewportScrollLeft(nextScrollLeft);
    }
  }, [
    activeCellKey,
    columnOffsets,
    normalizedWorksheetZoom,
    rowOffsets,
    selectionAnchorCellKey,
    selectionFocusCellKey,
    worksheet,
    zoomAdjustedViewportHeight,
    zoomAdjustedViewportWidth,
  ]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenu = () => {
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!supabase || !session?.organizationId) {
      setIsLoadingWorksheet(false);
      setError("Unable to load the pricing worksheet right now.");
      return;
    }

    const scopeKey = `${session.organizationId}:${sharedOpportunity.opportunityId}:${explicitWorksheetId ?? "legacy"}`;
    activeWorksheetLoadScopeKeyRef.current = scopeKey;
    if (loadedWorksheetScopeKeyRef.current === scopeKey) {
      setIsLoadingWorksheet(false);
      setError(null);
      return;
    }

    if (loadingWorksheetScopeKeyRef.current === scopeKey) {
      return;
    }

    const loadWorksheet = async () => {
      const organizationId = session.organizationId;
      if (!organizationId) {
        throw new Error("Could not resolve your organization.");
      }

      setIsLoadingWorksheet(true);
      setError(null);

      try {
        loadingWorksheetScopeKeyRef.current = scopeKey;
        countPricingWorksheetPerformance("worksheet-query-count", {
          scopeKey,
          worksheetId: explicitWorksheetId ?? "legacy",
        });
        const endSupabaseQueryMeasure = startPricingWorksheetPerformanceMeasure(
          "worksheet-supabase-query",
          {
            scopeKey,
            worksheetId: explicitWorksheetId ?? "legacy",
          }
        );
        const loadQuery = supabase
          .from("opportunity_pricing_worksheets")
          .select(
            "id, name, trade_package, worksheet_data, pricing_summary, extracted_pricing_data, version, updated_at, updated_by"
          )
          .eq("organization_id", organizationId)
          .eq("opportunity_id", sharedOpportunity.opportunityId);

        const { data, error: loadError } = explicitWorksheetId
          ? await loadQuery.eq("id", explicitWorksheetId).single()
          : await loadQuery.maybeSingle();
        endSupabaseQueryMeasure({
          foundWorksheet: Boolean(data),
          hasError: Boolean(loadError),
        });

        if (loadError) {
          throw new Error(loadError.message);
        }

        if (
          !isWorksheetBoardMountedRef.current ||
          activeWorksheetLoadScopeKeyRef.current !== scopeKey
        ) {
          return;
        }

        const worksheetRow = data as PricingWorksheetRow | null;
        if (!worksheetRow) {
          if (explicitWorksheetId) {
            throw new Error("Pricing worksheet not found.");
          }

          const endFormulaMeasure = startPricingWorksheetPerformanceMeasure(
            "recalculateWorksheetFormulas",
            {
              scopeKey,
              worksheetId: "blank",
            }
          );
          const blankWorksheet = recalculateWorksheetFormulas(createDefaultWorksheetData());
          endFormulaMeasure({
            cellCount: Object.keys(blankWorksheet.cells).length,
            rowCount: blankWorksheet.rows.length,
            columnCount: blankWorksheet.columns.length,
          });
          setWorksheetId(null);
          setWorksheetName(null);
          setWorksheetTradePackage(null);
          setWorksheet(blankWorksheet);
          worksheetRef.current = blankWorksheet;
          loadedWorksheetScopeKeyRef.current = scopeKey;
          setPricingSummary(createDefaultWorksheetPricingSummary());
          setExtractedPricingData(createDefaultWorksheetExtractedPricingData(blankWorksheet.version));
          setHistoryPast([]);
          historyPastRef.current = [];
          setHistoryFuture([]);
          historyFutureRef.current = [];
          setLastSavedAt(null);
          setIsDirty(false);
          setMessage(null);
          setSelectionAnchorCellKey(buildWorksheetCellKey("A", "1"));
          setSelectionFocusCellKey(buildWorksheetCellKey("A", "1"));
          return;
        }

        setWorksheetId(worksheetRow.id);
        setWorksheetName(worksheetRow.name);
        setWorksheetTradePackage(typeof worksheetRow.trade_package === "string" ? worksheetRow.trade_package : null);
        const endNormalizeMeasure = startPricingWorksheetPerformanceMeasure(
          "normalizeWorksheetData",
          {
            scopeKey,
            worksheetId: worksheetRow.id,
          }
        );
        const normalizedWorksheet = normalizeWorksheetData(worksheetRow.worksheet_data);
        endNormalizeMeasure({
          cellCount: Object.keys(normalizedWorksheet.cells).length,
          rowCount: normalizedWorksheet.rows.length,
          columnCount: normalizedWorksheet.columns.length,
        });
        const endFormulaMeasure = startPricingWorksheetPerformanceMeasure(
          "recalculateWorksheetFormulas",
          {
            scopeKey,
            worksheetId: worksheetRow.id,
          }
        );
        const loadedWorksheet = recalculateWorksheetFormulas(normalizedWorksheet);
        endFormulaMeasure({
          cellCount: Object.keys(loadedWorksheet.cells).length,
          rowCount: loadedWorksheet.rows.length,
          columnCount: loadedWorksheet.columns.length,
        });
        setWorksheet(loadedWorksheet);
        worksheetRef.current = loadedWorksheet;
        loadedWorksheetScopeKeyRef.current = scopeKey;
        setPricingSummary(
          (worksheetRow.pricing_summary as WorksheetPricingSummary | null) ??
            createDefaultWorksheetPricingSummary()
        );
        setExtractedPricingData(
          (worksheetRow.extracted_pricing_data as WorksheetExtractedPricingData | null) ??
            createDefaultWorksheetExtractedPricingData()
        );
        setHistoryPast([]);
        historyPastRef.current = [];
        setHistoryFuture([]);
        historyFutureRef.current = [];
        setLastSavedAt(worksheetRow.updated_at ?? null);
        setIsDirty(false);
        setMessage(null);
        setSelectionAnchorCellKey(buildWorksheetCellKey("A", "1"));
        setSelectionFocusCellKey(buildWorksheetCellKey("A", "1"));
      } catch (loadWorksheetError) {
        if (
          isWorksheetBoardMountedRef.current &&
          activeWorksheetLoadScopeKeyRef.current === scopeKey
        ) {
          setError(
            loadWorksheetError instanceof Error
              ? loadWorksheetError.message
              : "Unable to load the pricing worksheet."
          );
        }
      } finally {
        if (loadingWorksheetScopeKeyRef.current === scopeKey) {
          loadingWorksheetScopeKeyRef.current = null;
        }

        if (
          isWorksheetBoardMountedRef.current &&
          activeWorksheetLoadScopeKeyRef.current === scopeKey
        ) {
          setIsLoadingWorksheet(false);
        }
      }
    };

    void loadWorksheet();
  }, [explicitWorksheetId, isAuthLoading, session?.organizationId, sharedOpportunity.opportunityId, supabase]);

  const applyCommittedWorksheetChange = useCallback((
    mutator: (current: WorksheetData) => WorksheetData,
    options?: { recalculateFormulas?: boolean; validateFormulaOutputs?: boolean }
  ) => {
    const endMutationMeasure = startPricingWorksheetPerformanceMeasure("committed-change", {
      recalculateFormulas: options?.recalculateFormulas !== false,
      validateFormulaOutputs: options?.validateFormulaOutputs === true,
      worksheetId: explicitWorksheetId ?? worksheetId ?? "legacy",
    });
    const mutationResult = applyWorksheetMutation(worksheetRef.current, mutator, {
      recalculateFormulas: options?.recalculateFormulas,
      validateFormulaOutputs: options?.validateFormulaOutputs,
    });

    if (!mutationResult.validation.ok) {
      endMutationMeasure({
        changed: mutationResult.changed,
        committed: false,
        formulaErrorCount: mutationResult.formulaErrors.length,
      });
      setError(mutationResult.validation.message);
      setMessage(null);
      return {
        committed: false,
        changed: mutationResult.changed,
        message: mutationResult.validation.message,
      } satisfies WorksheetCommitResult;
    }

    if (!mutationResult.changed) {
      endMutationMeasure({
        changed: false,
        committed: true,
        formulaErrorCount: 0,
      });
      return {
        committed: true,
        changed: false,
        worksheet: mutationResult.nextWorksheet,
      } satisfies WorksheetCommitResult;
    }

    const nextHistory = commitWorksheetHistoryEntry({
      changed: true,
      future: historyFutureRef.current,
      historyLimit: WORKSHEET_HISTORY_LIMIT,
      past: historyPastRef.current,
      previousWorksheet: mutationResult.previousWorksheet,
    });

    historyPastRef.current = nextHistory.past;
    historyFutureRef.current = nextHistory.future;
    worksheetRef.current = mutationResult.nextWorksheet;
    setWorksheet(mutationResult.nextWorksheet);
    setHistoryPast(nextHistory.past);
    setHistoryFuture(nextHistory.future);
    setIsDirty(true);
    setError(null);
    setMessage(null);
    endMutationMeasure({
      changed: true,
      committed: true,
      formulaErrorCount: 0,
      historyPastLength: nextHistory.past.length,
    });
    return {
      committed: true,
      changed: true,
      worksheet: mutationResult.nextWorksheet,
    } satisfies WorksheetCommitResult;
  }, [explicitWorksheetId, worksheetId]);

  const updateCell = useCallback((cellKey: string, nextValue: string) => {
    if (isCellCommitNoOp(worksheetRef.current.cells[cellKey], nextValue)) {
      return {
        committed: true,
        changed: false,
        worksheet: worksheetRef.current,
      } satisfies WorksheetCommitResult;
    }

    return applyCommittedWorksheetChange((current) => {
      const nextCells = { ...current.cells };
      const existingCell = current.cells[cellKey];
      const nextCell = buildNextCommittedCell(existingCell, nextValue);

      if (nextCell === null) {
        if (!existingCell) {
          return current;
        }

        delete nextCells[cellKey];
      } else {
        if (areWorksheetCellsEquivalent(existingCell, nextCell)) {
          return current;
        }

        nextCells[cellKey] = nextCell;
      }

      return {
        ...current,
        cells: nextCells,
      };
    });
  }, [applyCommittedWorksheetChange]);

  const focusWorksheetSurface = useCallback((options?: { immediate?: boolean }) => {
    const focus = () => {
      worksheetSurfaceRef.current?.focus();
    };

    if (options?.immediate) {
      focus();
      return;
    }

    requestAnimationFrame(focus);
  }, []);

  const restoreWorksheetSnapshot = useCallback((
    restoredWorksheet: WorksheetData,
    nextPast: WorksheetData[],
    nextFuture: WorksheetData[],
  ) => {
    historyPastRef.current = nextPast;
    historyFutureRef.current = nextFuture;
    worksheetRef.current = restoredWorksheet;

    setHistoryPast(nextPast);
    setHistoryFuture(nextFuture);
    setWorksheet(restoredWorksheet);
    setIsDirty(true);
    setError(null);
    setMessage(null);
    setActiveCellKey(null);
    setActiveEditor(null);
    setEditingCellValue("");
    focusWorksheetSurface();
  }, [focusWorksheetSurface]);

  const focusFormulaBar = useCallback((options?: { selectAll?: boolean }) => {
    requestAnimationFrame(() => {
      const input = formulaBarRef.current;
      if (!input) {
        return;
      }

      input.focus();

      if (options?.selectAll) {
        input.select();
      } else {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    });
  }, []);

  const focusInputCell = useCallback((cellKey: string | null, options?: { selectAll?: boolean }) => {
    if (!cellKey) {
      return;
    }

    requestAnimationFrame(() => {
      const input = inputRefs.current[cellKey];
      if (!input) {
        return;
      }

      input.focus();

      if (options?.selectAll === false) {
        const end = input.value.length;
        input.setSelectionRange(end, end);
        return;
      }

      input.select();
    });
  }, []);

  const getAdjacentCellKey = useCallback((
    cellKey: string,
    movement: { columnDelta?: number; rowDelta?: number }
  ) => {
    const parsed = parseWorksheetCellKey(cellKey);
    if (!parsed) {
      return null;
    }

    const columnIndex = worksheet.columns.findIndex((column) => column.id === parsed.columnId);
    const rowIndex = worksheet.rows.findIndex((row) => row.id === parsed.rowId);
    if (columnIndex < 0 || rowIndex < 0) {
      return null;
    }

    const nextColumnIndex = columnIndex + (movement.columnDelta ?? 0);
    const nextRowIndex = rowIndex + (movement.rowDelta ?? 0);
    const nextColumn = worksheet.columns[nextColumnIndex];
    const nextRow = worksheet.rows[nextRowIndex];

    if (!nextColumn || !nextRow) {
      return null;
    }

    return buildWorksheetCellKey(nextColumn.id, nextRow.id);
  }, [worksheet.columns, worksheet.rows]);

  const isFormulaEditing =
    activeCellKey !== null && editingCellValue.trim().startsWith("=");

  const isFormulaReferenceMode =
    isFormulaEditing && activeCellKey !== null;

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const pendingSelection = pendingSelectionDragRef.current;
      if (!pendingSelection || isDraggingSelectionRef.current) {
        return;
      }

      const pendingState = resolveWorksheetPendingRangeSelectionState({
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
        isFormulaEditing,
        isPendingSelection: true,
        startClientX: pendingSelection.startClientX,
        startClientY: pendingSelection.startClientY,
      });
      if (pendingState === "clear") {
        clearSelectionDragState();
        return;
      }
      if (pendingState !== "promote") {
        return;
      }

      isDraggingSelectionRef.current = true;
      pendingSelectionDragRef.current = null;
      setIsDraggingSelection(true);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [clearSelectionDragState, isFormulaEditing]);

  const beginCellEdit = useCallback((
    cellKey: string,
    cell: WorksheetCell | undefined,
    options?: { editor?: "cell" | "formulaBar"; focus?: boolean }
  ) => {
    if (!canWriteWorksheet) {
      return;
    }

    const nextEditor = options?.editor ?? "cell";
    setActiveCellKey(cellKey);
    setActiveEditor(nextEditor);
    setSelectionAnchorCellKey(cellKey);
    setSelectionFocusCellKey(cellKey);
    setEditingCellValue(
      cell?.formula ??
        (typeof cell?.value === "number"
          ? String(cell.value)
          : typeof cell?.value === "string"
          ? cell.value
          : "")
    );

    if (options?.focus === false) {
      return;
    }

    if (nextEditor === "formulaBar") {
      focusFormulaBar({ selectAll: false });
      return;
    }

    focusInputCell(cellKey);
  }, [canWriteWorksheet, focusFormulaBar, focusInputCell]);

  const commitCellEdit = useCallback((cellKey: string, nextValue: string, nextSelectedCellKey?: string | null) => {
    if (formulaBarRef.current === document.activeElement) {
      suppressFormulaBarBlurCommitRef.current = true;
      formulaBarRef.current.blur();
    }

    const activeInput = inputRefs.current[cellKey];
    if (activeInput === document.activeElement) {
      suppressBlurCommitCellKeyRef.current = cellKey;
      activeInput.blur();
    }

    if (!isCellCommitNoOp(worksheetRef.current.cells[cellKey], nextValue)) {
      updateCell(cellKey, nextValue);
    }
    setActiveCellKey((current) => (current === cellKey ? null : current));
    setActiveEditor(null);
    setEditingCellValue("");
    setSelectionAnchorCellKey(nextSelectedCellKey ?? cellKey);
    setSelectionFocusCellKey(nextSelectedCellKey ?? cellKey);
    focusWorksheetSurface({ immediate: true });
  }, [focusWorksheetSurface, updateCell]);

  const handleWorksheetPaste = (event: ReactClipboardEvent<HTMLElement>) => {
    if (!canWriteWorksheet) {
      return;
    }

    const target = event.target;
    const isTextEditingTarget =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (isTextEditingTarget) {
      return;
    }

    const clipboardText = event.clipboardData.getData("text/plain");
    const parsedPaste = parseWorksheetClipboardText(clipboardText);
    if (!parsedPaste) {
      return;
    }

    const anchorCellKey =
      selectionAnchorCellKey ??
      selectionFocusCellKey ??
      activeCellKey ??
      buildWorksheetCellKey("A", "1");

    if (!parsedPaste.isTabular) {
      if (activeCellKey) {
        return;
      }

      event.preventDefault();
      updateCell(anchorCellKey, clipboardText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, ""));
      setSelectionAnchorCellKey(anchorCellKey);
      setSelectionFocusCellKey(anchorCellKey);
      return;
    }

    event.preventDefault();

    applyCommittedWorksheetChange((current) => {
      const anchorPosition =
        getWorksheetAnchorPosition(current, anchorCellKey) ??
        getWorksheetAnchorPosition(current, buildWorksheetCellKey("A", "1"));

      if (!anchorPosition) {
        return current;
      }

      const expandedWorksheet = expandWorksheetToFitPaste(current, anchorPosition, parsedPaste);
      const patchedWorksheet = applyWorksheetPasteToCells(
        expandedWorksheet,
        anchorPosition,
        parsedPaste,
        normalizeWorksheetCell
      );

      return patchedWorksheet;
    });

    if (activeCellKey) {
      suppressBlurCommitCellKeyRef.current = activeCellKey;
    }
    setActiveCellKey(null);
    setActiveEditor(null);
    setEditingCellValue("");
    setSelectionAnchorCellKey(anchorCellKey);
    setSelectionFocusCellKey(anchorCellKey);
    focusWorksheetSurface();
  };

  const appendCellReferenceToFormula = useCallback((cellReference: string) => {
    if (!isFormulaReferenceMode || !activeCellKey) {
      return;
    }

    handledFormulaReferenceMouseDownRef.current = true;
    didDragSelectionRef.current = false;
    isDraggingSelectionRef.current = true;
    rangeDragAnchorCellKeyRef.current = cellReference;
    formulaReferenceDragAnchorCellKeyRef.current = cellReference;
    formulaReferenceDragBaseValueRef.current = editingCellValueRef.current;
    setIsDraggingSelection(true);
    setEditingCellValue(`${editingCellValueRef.current}${cellReference}`);
    setSelectionAnchorCellKey(cellReference);
    setSelectionFocusCellKey(cellReference);

    if (activeEditor === "formulaBar") {
      focusFormulaBar({ selectAll: false });
      return;
    }

    focusInputCell(activeCellKey, { selectAll: false });
  }, [
    activeCellKey,
    activeEditor,
    focusFormulaBar,
    focusInputCell,
    isFormulaReferenceMode,
  ]);

  const handleCellBlur = (cellKey: string) => {
    if (suppressBlurCommitCellKeyRef.current === cellKey) {
      suppressBlurCommitCellKeyRef.current = null;
      return;
    }

    commitCellEdit(
      cellKey,
      activeCellKey === cellKey ? editingCellValue : getRawCellInput(worksheet.cells[cellKey])
    );
  };

  const measureWorksheetCellLayout = useCallback((params: {
    cell: WorksheetCell | undefined;
    cellKey: string;
    column: WorksheetColumn;
    row: WorksheetRow;
    width: number;
    formattedValue: string;
  }) => {
    const measureNode = worksheetTextMeasureRef.current;
    const normalizedValue = params.formattedValue.replace(/\r\n/g, "\n").replace(/\r/g, "\n") || " ";
    const cellFormat = getCellFormat(params.cell);
    const availableWidth = Math.max(
      1,
      params.width - WORKSHEET_CELL_HORIZONTAL_PADDING
    );

    if (!measureNode || typeof window === "undefined") {
      const longestLineLength = normalizedValue
        .split("\n")
        .reduce((longest, line) => Math.max(longest, line.length), 0);
      const estimatedTextWidth = Math.max(
        WORKSHEET_CELL_HORIZONTAL_PADDING,
        Math.min(
          MAX_COLUMN_WIDTH,
          Math.ceil(longestLineLength * (WORKSHEET_CELL_FONT_SIZE * 0.68) + WORKSHEET_CELL_HORIZONTAL_PADDING)
        )
      );
      const estimatedLineCount = Math.max(
        1,
        Math.ceil(estimatedTextWidth / Math.max(availableWidth, WORKSHEET_CELL_FONT_SIZE * 2))
      );

      return {
        textWidth: estimatedTextWidth,
        wrappedHeight:
          estimatedLineCount * WORKSHEET_CELL_LINE_HEIGHT + WORKSHEET_CELL_VERTICAL_PADDING,
      };
    }

    measureNode.style.fontWeight = cellFormat.text?.bold ? "700" : "400";
    measureNode.style.fontStyle = cellFormat.text?.italic ? "italic" : "normal";
    measureNode.style.textAlign = cellFormat.text?.align ?? "left";
    measureNode.textContent = normalizedValue;

    measureNode.style.width = "auto";
    measureNode.style.whiteSpace = "pre";
    measureNode.style.overflowWrap = "normal";
    measureNode.style.wordBreak = "normal";
    const singleLineWidth = Math.ceil(measureNode.getBoundingClientRect().width + WORKSHEET_CELL_HORIZONTAL_PADDING);

    measureNode.style.width = `${availableWidth}px`;
    measureNode.style.whiteSpace = "pre-wrap";
    measureNode.style.overflowWrap = "anywhere";
    measureNode.style.wordBreak = "break-word";
    const wrappedHeight = Math.ceil(measureNode.scrollHeight + WORKSHEET_CELL_VERTICAL_PADDING);

    return {
      textWidth: singleLineWidth,
      wrappedHeight,
    };
  }, []);

  const autoLayoutWorksheet = useCallback((
    nextWorksheet: WorksheetData,
    diffSummary: PricingWorksheetAiDiffSummary | null | undefined
  ) => {
    return applyWorksheetAutoLayout({
      worksheet: nextWorksheet,
      target: buildWorksheetLayoutTargetFromDiffSummary(nextWorksheet, diffSummary),
      measureCell: measureWorksheetCellLayout,
      minColumnWidth: MIN_COLUMN_WIDTH,
      maxColumnWidth: MAX_COLUMN_WIDTH,
      minRowHeight: MIN_ROW_HEIGHT,
      maxRowHeight: MAX_ROW_HEIGHT,
      preserveExistingColumnWidths: true,
      preserveExistingRowHeights: true,
      resizeColumns: true,
      resizeRows: true,
    });
  }, [measureWorksheetCellLayout]);

  const autoFitColumn = useCallback((event: ReactMouseEvent<HTMLButtonElement>, columnId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingColumnId(null);
    setColumnResizePreviewWidth(null);

    applyCommittedWorksheetChange((current) => applyWorksheetAutoLayout({
      worksheet: current,
      target: buildWorksheetColumnAutoFitTarget(current, columnId),
      measureCell: measureWorksheetCellLayout,
      minColumnWidth: MIN_COLUMN_WIDTH,
      maxColumnWidth: MAX_COLUMN_WIDTH,
      minRowHeight: MIN_ROW_HEIGHT,
      maxRowHeight: MAX_ROW_HEIGHT,
      preserveExistingColumnWidths: false,
      preserveExistingRowHeights: true,
      resizeColumns: true,
      resizeRows: false,
    }), { recalculateFormulas: false });
  }, [applyCommittedWorksheetChange, measureWorksheetCellLayout]);

  const autoFitRow = useCallback((event: ReactMouseEvent<HTMLButtonElement>, rowId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingRowId(null);
    setRowResizePreviewHeight(null);

    applyCommittedWorksheetChange((current) => applyWorksheetAutoLayout({
      worksheet: current,
      target: buildWorksheetRowAutoFitTarget(current, rowId),
      measureCell: measureWorksheetCellLayout,
      minColumnWidth: MIN_COLUMN_WIDTH,
      maxColumnWidth: MAX_COLUMN_WIDTH,
      minRowHeight: MIN_ROW_HEIGHT,
      maxRowHeight: MAX_ROW_HEIGHT,
      preserveExistingColumnWidths: true,
      preserveExistingRowHeights: false,
      resizeColumns: false,
      resizeRows: true,
    }), { recalculateFormulas: false });
  }, [applyCommittedWorksheetChange, measureWorksheetCellLayout]);

  const beginColumnResize = (event: ReactMouseEvent<HTMLButtonElement>, columnId: string, width: number) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingColumnId(columnId);
    setColumnResizeStartX(event.clientX);
    setColumnResizeStartWidth(width);
    setColumnResizePreviewWidth(width);
  };

  const beginRowResize = useCallback((event: ReactMouseEvent<HTMLButtonElement>, rowId: string, height: number) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingRowId(rowId);
    setRowResizeStartY(event.clientY);
    setRowResizeStartHeight(height);
    setRowResizePreviewHeight(height);
  }, []);

  const commitActiveEditIfNeeded = () => {
    if (!activeCellKey) {
      return;
    }

    suppressBlurCommitCellKeyRef.current = activeCellKey;
    commitCellEdit(activeCellKey, editingCellValue);
  };

  const applyFormattingPatchToSelection = (patch: WorksheetCellFormat | ((format: WorksheetCellFormat) => WorksheetCellFormat)) => {
    if (!selectedRange) {
      return;
    }

    if (applyFormattingToRange(worksheetRef.current, selectedRange, patch) === worksheetRef.current) {
      return;
    }

    commitActiveEditIfNeeded();
    applyCommittedWorksheetChange(
      (current) => applyFormattingToRange(current, selectedRange, patch),
      { recalculateFormulas: false }
    );
  };

  const applyNumberFormatKindToSelection = (kind: WorksheetNumberFormatKind) => {
    applyFormattingPatchToSelection((format) => {
      const currentNumberFormat = format.number ?? {};
      const decimalPlaces =
        kind === "general"
          ? undefined
          : typeof currentNumberFormat.decimalPlaces === "number"
          ? currentNumberFormat.decimalPlaces
          : getDefaultDecimalPlaces(kind);

      return {
        ...format,
        number: {
          ...currentNumberFormat,
          kind,
          decimalPlaces,
          negativeStyle: currentNumberFormat.negativeStyle ?? "minus",
          currencyCode: kind === "currency" ? "NZD" : currentNumberFormat.currencyCode,
          useGrouping: kind === "general" ? false : currentNumberFormat.useGrouping ?? true,
        },
      };
    });
  };

  const adjustNumberDecimalPlacesForSelection = (direction: "decrease" | "increase") => {
    applyFormattingPatchToSelection((format) => {
      const currentNumberFormat = format.number ?? {};
      const kind = currentNumberFormat.kind ?? "number";
      const currentDecimalPlaces =
        typeof currentNumberFormat.decimalPlaces === "number"
          ? currentNumberFormat.decimalPlaces
          : getDefaultDecimalPlaces(kind);
      const nextDecimalPlaces = clampNumberDecimalPlaces(
        currentDecimalPlaces + (direction === "increase" ? 1 : -1)
      );

      return {
        ...format,
        number: {
          ...currentNumberFormat,
          kind,
          decimalPlaces: nextDecimalPlaces,
          negativeStyle: currentNumberFormat.negativeStyle ?? "minus",
          currencyCode: kind === "currency" ? "NZD" : currentNumberFormat.currencyCode,
          useGrouping: kind === "general" ? false : currentNumberFormat.useGrouping ?? true,
        },
      };
    });
  };

  const applyNegativeNumberStyleToSelection = (negativeStyle: WorksheetNegativeNumberStyle) => {
    applyFormattingPatchToSelection((format) => {
      const currentNumberFormat = format.number ?? {};
      const kind = currentNumberFormat.kind ?? "number";
      return {
        ...format,
        number: {
          ...currentNumberFormat,
          kind,
          decimalPlaces:
            typeof currentNumberFormat.decimalPlaces === "number"
              ? currentNumberFormat.decimalPlaces
              : getDefaultDecimalPlaces(kind),
          negativeStyle,
          currencyCode: kind === "currency" ? "NZD" : currentNumberFormat.currencyCode,
          useGrouping: kind === "general" ? false : currentNumberFormat.useGrouping ?? true,
        },
      };
    });
  };

  const clearNumberFormatForSelection = () => {
    applyFormattingPatchToSelection((format) => clearCellNumberFormat(format));
  };

  const applyBorderModeToSelection = (mode: "all" | "outer" | "clear") => {
    if (!selectedRange) {
      return;
    }

    if (applyBordersToRange(worksheetRef.current, selectedRange, mode) === worksheetRef.current) {
      return;
    }

    commitActiveEditIfNeeded();
    applyCommittedWorksheetChange(
      (current) => applyBordersToRange(current, selectedRange, mode),
      { recalculateFormulas: false }
    );
  };

  const clearContentsInRange = (range: WorksheetSelectionRange) => {
    commitActiveEditIfNeeded();
    applyCommittedWorksheetChange((current) => {
      const nextCells = { ...current.cells };

      for (
        let rowIndex = range.startRowIndex;
        rowIndex <= range.endRowIndex;
        rowIndex += 1
      ) {
        for (
          let columnIndex = range.startColumnIndex;
          columnIndex <= range.endColumnIndex;
          columnIndex += 1
        ) {
          const row = current.rows[rowIndex];
          const column = current.columns[columnIndex];

          if (!row || !column) {
            continue;
          }

          const cellKey = buildWorksheetCellKey(column.id, row.id);
          const existingCell = current.cells[cellKey];
          if (hasCellFormatting(existingCell)) {
            nextCells[cellKey] = {
              value: null,
              type: "empty",
              formula: null,
              computedValue: null,
              displayValue: "",
              metadata: {
                ...(existingCell?.metadata ?? {}),
              },
            };
          } else {
            delete nextCells[cellKey];
          }
        }
      }

      return {
        ...current,
        cells: nextCells,
      };
    });
  };

  const getRowRange = (rowIndex: number): WorksheetSelectionRange => ({
    startRowIndex: rowIndex,
    endRowIndex: rowIndex,
    startColumnIndex: 0,
    endColumnIndex: Math.max(0, worksheetRef.current.columnCount - 1),
  });

  const getColumnRange = (columnIndex: number): WorksheetSelectionRange => ({
    startRowIndex: 0,
    endRowIndex: Math.max(0, worksheetRef.current.rowCount - 1),
    startColumnIndex: columnIndex,
    endColumnIndex: columnIndex,
  });

  const selectRange = useCallback((range: WorksheetSelectionRange) => {
    const currentWorksheet = worksheetRef.current;
    const anchorColumn = currentWorksheet.columns[range.startColumnIndex];
    const anchorRow = currentWorksheet.rows[range.startRowIndex];
    const focusColumn = currentWorksheet.columns[range.endColumnIndex];
    const focusRow = currentWorksheet.rows[range.endRowIndex];

    if (!anchorColumn || !anchorRow || !focusColumn || !focusRow) {
      return;
    }

    setSelectionAnchorCellKey(buildWorksheetCellKey(anchorColumn.id, anchorRow.id));
    setSelectionFocusCellKey(buildWorksheetCellKey(focusColumn.id, focusRow.id));
  }, []);

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const getStructuralEditAnchorPosition = () => {
    const anchorCellKey =
      selectionAnchorCellKey ??
      selectionFocusCellKey ??
      selectedWorksheetCellKey ??
      buildWorksheetCellKey("A", "1");

    return getCellPosition(worksheetRef.current, anchorCellKey) ?? {
      columnIndex: 0,
      rowIndex: 0,
    };
  };

  const insertRowAtSelection = (position: "above" | "below") => {
    if (!canWriteWorksheet) {
      return;
    }

    commitActiveEditIfNeeded();
    const anchorPosition = getStructuralEditAnchorPosition();
    const insertRowIndex =
      position === "above" ? anchorPosition.rowIndex : anchorPosition.rowIndex + 1;
    insertRowAtIndex(insertRowIndex, anchorPosition.columnIndex);
  };

  const insertRowAtIndex = (insertRowIndex: number, columnIndex = 0) => {
    const anchorColumn =
      worksheetRef.current.columns[columnIndex] ??
      worksheetRef.current.columns[0];

    applyCommittedWorksheetChange((current) => insertWorksheetRow(current, insertRowIndex));

    if (anchorColumn) {
      const nextCellKey = buildWorksheetCellKey(anchorColumn.id, String(insertRowIndex + 1));
      setSelectionAnchorCellKey(nextCellKey);
      setSelectionFocusCellKey(nextCellKey);
    }
  };

  const insertColumnAtSelection = (position: "left" | "right") => {
    if (!canWriteWorksheet) {
      return;
    }

    commitActiveEditIfNeeded();
    const anchorPosition = getStructuralEditAnchorPosition();
    const insertColumnIndex =
      position === "left" ? anchorPosition.columnIndex : anchorPosition.columnIndex + 1;
    insertColumnAtIndex(insertColumnIndex, anchorPosition.rowIndex);
  };

  const insertColumnAtIndex = (insertColumnIndex: number, rowIndex = 0) => {
    const anchorRow =
      worksheetRef.current.rows[rowIndex] ??
      worksheetRef.current.rows[0];

    applyCommittedWorksheetChange((current) => insertWorksheetColumn(current, insertColumnIndex));

    if (anchorRow) {
      const nextCellKey = buildWorksheetCellKey(columnLabelFromIndex(insertColumnIndex), anchorRow.id);
      setSelectionAnchorCellKey(nextCellKey);
      setSelectionFocusCellKey(nextCellKey);
    }
  };

  const isFullRowRange = (range: WorksheetSelectionRange | null) =>
    range !== null &&
    range.startColumnIndex === 0 &&
    range.endColumnIndex >= worksheetRef.current.columnCount - 1;

  const isFullColumnRange = (range: WorksheetSelectionRange | null) =>
    range !== null &&
    range.startRowIndex === 0 &&
    range.endRowIndex >= worksheetRef.current.rowCount - 1;

  const getContextRowDeleteRange = (rowIndex: number) => {
    if (
      isFullRowRange(selectedRange) &&
      selectedRange &&
      rowIndex >= selectedRange.startRowIndex &&
      rowIndex <= selectedRange.endRowIndex
    ) {
      return {
        startRowIndex: selectedRange.startRowIndex,
        endRowIndex: selectedRange.endRowIndex,
      };
    }

    return {
      startRowIndex: rowIndex,
      endRowIndex: rowIndex,
    };
  };

  const getContextColumnDeleteRange = (columnIndex: number) => {
    if (
      isFullColumnRange(selectedRange) &&
      selectedRange &&
      columnIndex >= selectedRange.startColumnIndex &&
      columnIndex <= selectedRange.endColumnIndex
    ) {
      return {
        startColumnIndex: selectedRange.startColumnIndex,
        endColumnIndex: selectedRange.endColumnIndex,
      };
    }

    return {
      startColumnIndex: columnIndex,
      endColumnIndex: columnIndex,
    };
  };

  const canDeleteRowRange = (startRowIndex: number, endRowIndex: number) =>
    canWriteWorksheet &&
    worksheetRef.current.rowCount > 1 &&
    endRowIndex - startRowIndex + 1 < worksheetRef.current.rowCount;

  const canDeleteColumnRange = (startColumnIndex: number, endColumnIndex: number) =>
    canWriteWorksheet &&
    worksheetRef.current.columnCount > 1 &&
    endColumnIndex - startColumnIndex + 1 < worksheetRef.current.columnCount;

  const getRowDeleteLabel = (rowIndex: number) => {
    const range = getContextRowDeleteRange(rowIndex);
    return range.endRowIndex > range.startRowIndex ? "Delete selected rows" : "Delete row";
  };

  const getColumnDeleteLabel = (columnIndex: number) => {
    const range = getContextColumnDeleteRange(columnIndex);
    return range.endColumnIndex > range.startColumnIndex
      ? "Delete selected columns"
      : "Delete column";
  };

  const deleteRowsAtRange = (startRowIndex: number, endRowIndex: number) => {
    if (!canDeleteRowRange(startRowIndex, endRowIndex)) {
      return;
    }

    commitActiveEditIfNeeded();
    const nextSelectedRowIndex = Math.max(
      0,
      Math.min(startRowIndex, worksheetRef.current.rowCount - (endRowIndex - startRowIndex + 1) - 1)
    );
    const anchorColumn = worksheetRef.current.columns[0];

    applyCommittedWorksheetChange((current) =>
      deleteWorksheetRows(current, startRowIndex, endRowIndex)
    );

    if (anchorColumn) {
      const nextCellKey = buildWorksheetCellKey(anchorColumn.id, String(nextSelectedRowIndex + 1));
      setSelectionAnchorCellKey(nextCellKey);
      setSelectionFocusCellKey(nextCellKey);
    }
  };

  const deleteColumnsAtRange = (startColumnIndex: number, endColumnIndex: number) => {
    if (!canDeleteColumnRange(startColumnIndex, endColumnIndex)) {
      return;
    }

    commitActiveEditIfNeeded();
    const nextSelectedColumnIndex = Math.max(
      0,
      Math.min(
        startColumnIndex,
        worksheetRef.current.columnCount - (endColumnIndex - startColumnIndex + 1) - 1
      )
    );
    const anchorRow = worksheetRef.current.rows[0];

    applyCommittedWorksheetChange((current) =>
      deleteWorksheetColumns(current, startColumnIndex, endColumnIndex)
    );

    if (anchorRow) {
      const nextCellKey = buildWorksheetCellKey(columnLabelFromIndex(nextSelectedColumnIndex), anchorRow.id);
      setSelectionAnchorCellKey(nextCellKey);
      setSelectionFocusCellKey(nextCellKey);
    }
  };

  const getContextMenuRange = (menu: WorksheetContextMenuState): WorksheetSelectionRange | null => {
    if (!menu) {
      return selectedRange;
    }

    if (menu.type === "row") {
      return getRowRange(menu.rowIndex);
    }

    if (menu.type === "column") {
      return getColumnRange(menu.columnIndex);
    }

    const position = getCellPosition(worksheetRef.current, menu.cellKey);
    if (!position) {
      return selectedRange;
    }

    if (isPositionInRange(position, selectedRange)) {
      return selectedRange;
    }

    return {
      startRowIndex: position.rowIndex,
      endRowIndex: position.rowIndex,
      startColumnIndex: position.columnIndex,
      endColumnIndex: position.columnIndex,
    };
  };

  const copyRangeToClipboard = async (range: WorksheetSelectionRange | null) => {
    if (!range) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildWorksheetTsvFromRange(worksheetRef.current, range));
    } catch {
      setError("Unable to copy from the context menu. Use keyboard copy instead.");
    }
  };

  const focusFormattingToolbar = () => {
    formattingToolbarRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    formattingToolbarRef.current?.focus();
  };

  const openCellContextMenu = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    cellKey: string
  ) => {
    if (isFormulaReferenceMode || activeCellKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const position = getCellPosition(worksheetRef.current, cellKey);
    if (!position) {
      return;
    }

    if (!isPositionInRange(position, selectedRange)) {
      setSelectionAnchorCellKey(cellKey);
      setSelectionFocusCellKey(cellKey);
    }

    setContextMenu({
      type: "cell",
      x: event.clientX,
      y: event.clientY,
      cellKey,
    });
  }, [activeCellKey, isFormulaReferenceMode, selectedRange]);

  const openRowContextMenu = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    rowIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (
      !isFullRowRange(selectedRange) ||
      !selectedRange ||
      rowIndex < selectedRange.startRowIndex ||
      rowIndex > selectedRange.endRowIndex
    ) {
      selectRange(getRowRange(rowIndex));
    }
    setContextMenu({
      type: "row",
      x: event.clientX,
      y: event.clientY,
      rowIndex,
    });
  }, [selectedRange, selectRange]);

  const openColumnContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    columnIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (
      !isFullColumnRange(selectedRange) ||
      !selectedRange ||
      columnIndex < selectedRange.startColumnIndex ||
      columnIndex > selectedRange.endColumnIndex
    ) {
      selectRange(getColumnRange(columnIndex));
    }
    setContextMenu({
      type: "column",
      x: event.clientX,
      y: event.clientY,
      columnIndex,
    });
  };

  const runContextMenuAction = (action: () => void | Promise<void>) => {
    closeContextMenu();
    void action();
  };

  const selectSingleCell = useCallback((cellKey: string) => {
    if (isFormulaReferenceMode) {
      appendCellReferenceToFormula(cellKey);
      return;
    }

    pendingSelectionDragRef.current = null;
    isDraggingSelectionRef.current = false;
    rangeDragAnchorCellKeyRef.current = cellKey;
    formulaReferenceDragAnchorCellKeyRef.current = null;
    formulaReferenceDragBaseValueRef.current = null;
    setSelectionAnchorCellKey(cellKey);
    setSelectionFocusCellKey(cellKey);
    setIsDraggingSelection(false);
    focusWorksheetSurface();
  }, [appendCellReferenceToFormula, focusWorksheetSurface, isFormulaReferenceMode]);

  const startPendingRangeSelection = useCallback((
    cellKey: string,
    startClientX: number,
    startClientY: number
  ) => {
    if (isFormulaReferenceMode) {
      appendCellReferenceToFormula(cellKey);
      return;
    }

    pendingSelectionDragRef.current = {
      anchorCellKey: cellKey,
      startClientX,
      startClientY,
    };
    isDraggingSelectionRef.current = false;
    rangeDragAnchorCellKeyRef.current = cellKey;
    formulaReferenceDragAnchorCellKeyRef.current = null;
    formulaReferenceDragBaseValueRef.current = null;
    didDragSelectionRef.current = false;
    setSelectionAnchorCellKey(cellKey);
    setSelectionFocusCellKey(cellKey);
    setIsDraggingSelection(false);
    focusWorksheetSurface();
  }, [appendCellReferenceToFormula, focusWorksheetSurface, isFormulaReferenceMode]);

  const updateRangeSelection = useCallback((cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => {
    if (isFormulaReferenceMode) {
      const formulaReferenceAnchorCellKey = formulaReferenceDragAnchorCellKeyRef.current;
      const formulaReferenceBaseValue = formulaReferenceDragBaseValueRef.current;
      if (
        !isDraggingSelectionRef.current ||
        !formulaReferenceAnchorCellKey ||
        formulaReferenceBaseValue === null
      ) {
        return;
      }

      if (formulaReferenceAnchorCellKey !== cellKey) {
        didDragSelectionRef.current = true;
      }

      const nextReference = buildFormulaReferenceText(
        worksheetRef.current,
        formulaReferenceAnchorCellKey,
        cellKey
      );
      setSelectionAnchorCellKey(formulaReferenceAnchorCellKey);
      setSelectionFocusCellKey(cellKey);
      setEditingCellValue(`${formulaReferenceBaseValue}${nextReference}`);
      return;
    }

    if (isDraggingFill) {
      const pointerState = resolveWorksheetPointerDragState({
        buttons: event.buttons,
        isDragActive: true,
        isInteractionBlocked: false,
      });
      if (pointerState === "clear") {
        clearFillDragState();
        return;
      }

      setFillPreviewFocusCellKey(cellKey);
      return;
    }

    const pendingSelection = pendingSelectionDragRef.current;
    if (pendingSelection && !isDraggingSelectionRef.current) {
      const pendingState = resolveWorksheetPendingRangeSelectionState({
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
        isFormulaEditing,
        isPendingSelection: true,
        startClientX: pendingSelection.startClientX,
        startClientY: pendingSelection.startClientY,
      });
      if (pendingState === "clear") {
        clearSelectionDragState();
        return;
      }
      if (pendingState === "promote") {
        isDraggingSelectionRef.current = true;
        pendingSelectionDragRef.current = null;
        setIsDraggingSelection(true);
      }
    }

    const isRangeDragActive = isDraggingSelectionRef.current || isDraggingSelection;
    const pointerState = resolveWorksheetRangeSelectionPointerState({
      buttons: event.buttons,
      isRangeDragActive,
      isFormulaEditing,
    });
    if (pointerState === "ignore") {
      return;
    }
    if (pointerState === "clear") {
      clearSelectionDragState();
      return;
    }

    const anchorCellKey = rangeDragAnchorCellKeyRef.current ?? selectionAnchorCellKey;
    if (anchorCellKey && anchorCellKey !== cellKey) {
      didDragSelectionRef.current = true;
    }
    setSelectionFocusCellKey(cellKey);
  }, [
    clearFillDragState,
    clearSelectionDragState,
    isDraggingFill,
    isDraggingSelection,
    isFormulaEditing,
    isFormulaReferenceMode,
    selectionAnchorCellKey,
  ]);

  const beginFillDrag = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!selectedRange || activeCellKey || isFormulaEditing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFill(true);
    setFillSourceRange(selectedRange);
    setFillPreviewFocusCellKey(null);
    focusWorksheetSurface();
  }, [activeCellKey, focusWorksheetSurface, isFormulaEditing, selectedRange]);

  const handleBeginGridCellEdit = useCallback((cellKey: string, cell: WorksheetCell | undefined) => {
    beginCellEdit(cellKey, cell, { editor: "cell" });
  }, [beginCellEdit]);

  const handleCellContextMenu = useCallback((cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => {
    openCellContextMenu(event, cellKey);
  }, [openCellContextMenu]);

  const applyFillDrag = useCallback((
    sourceRange: WorksheetSelectionRange,
    previewRange: WorksheetSelectionRange,
    direction: "down" | "right"
  ) => {
    applyCommittedWorksheetChange((current) => {
      const nextCells = { ...current.cells };
      const sourceHeight = sourceRange.endRowIndex - sourceRange.startRowIndex + 1;
      const sourceWidth = sourceRange.endColumnIndex - sourceRange.startColumnIndex + 1;
      const canUseVerticalNumericSeries =
        direction === "down" &&
        sourceWidth === 1 &&
        Array.from({ length: sourceHeight }, (_, offset) => {
          const row = current.rows[sourceRange.startRowIndex + offset];
          const column = current.columns[sourceRange.startColumnIndex];
          return row && column
            ? getNumericCellValue(current.cells[buildWorksheetCellKey(column.id, row.id)])
            : null;
        }).every((value) => typeof value === "number");
      const canUseHorizontalNumericSeries =
        direction === "right" &&
        sourceHeight === 1 &&
        Array.from({ length: sourceWidth }, (_, offset) => {
          const row = current.rows[sourceRange.startRowIndex];
          const column = current.columns[sourceRange.startColumnIndex + offset];
          return row && column
            ? getNumericCellValue(current.cells[buildWorksheetCellKey(column.id, row.id)])
            : null;
        }).every((value) => typeof value === "number");

      for (let rowIndex = previewRange.startRowIndex; rowIndex <= previewRange.endRowIndex; rowIndex += 1) {
        for (
          let columnIndex = previewRange.startColumnIndex;
          columnIndex <= previewRange.endColumnIndex;
          columnIndex += 1
        ) {
          const targetRow = current.rows[rowIndex];
          const targetColumn = current.columns[columnIndex];

          if (!targetRow || !targetColumn) {
            continue;
          }

          const sourceRowIndex =
            direction === "down"
              ? sourceRange.startRowIndex +
                ((rowIndex - previewRange.startRowIndex) % sourceHeight)
              : sourceRange.startRowIndex +
                ((rowIndex - sourceRange.startRowIndex) % sourceHeight);
          const sourceColumnIndex =
            direction === "right"
              ? sourceRange.startColumnIndex +
                ((columnIndex - previewRange.startColumnIndex) % sourceWidth)
              : sourceRange.startColumnIndex +
                ((columnIndex - sourceRange.startColumnIndex) % sourceWidth);

          const sourceRow = current.rows[sourceRowIndex];
          const sourceColumn = current.columns[sourceColumnIndex];
          const sourceCell = sourceRow && sourceColumn
            ? current.cells[buildWorksheetCellKey(sourceColumn.id, sourceRow.id)]
            : undefined;
          const targetCellKey = buildWorksheetCellKey(targetColumn.id, targetRow.id);
          const sourceInput = getRawCellInput(sourceCell);
          const rowShift = sourceRow ? targetRow.index - sourceRow.index : 0;
          const columnShift = sourceColumn ? targetColumn.index - sourceColumn.index : 0;
          let nextInput = sourceInput;

          if (sourceCell?.formula) {
            nextInput = shiftFormulaForFill(sourceInput, rowShift, columnShift);
          } else if (canUseVerticalNumericSeries && sourceColumn) {
            const numericValues = Array.from({ length: sourceHeight }, (_, offset) => {
              const row = current.rows[sourceRange.startRowIndex + offset];
              return row
                ? getNumericCellValue(
                    current.cells[buildWorksheetCellKey(sourceColumn.id, row.id)]
                  ) ?? 0
                : 0;
            });
            const step =
              numericValues.length >= 2
                ? numericValues[numericValues.length - 1] - numericValues[numericValues.length - 2]
                : isZeroStepSeries(numericValues)
                ? 0
                : numericValues[0];
            const blockOffset = Math.floor(
              (rowIndex - previewRange.startRowIndex) / sourceHeight
            );
            const sourceOffset = rowIndex - previewRange.startRowIndex;
            const valueIndex = sourceOffset % sourceHeight;
            const baseValue = numericValues[valueIndex] ?? 0;
            nextInput = String(baseValue + step * (blockOffset + 1) * sourceHeight);
          } else if (canUseHorizontalNumericSeries && sourceRow) {
            const numericValues = Array.from({ length: sourceWidth }, (_, offset) => {
              const column = current.columns[sourceRange.startColumnIndex + offset];
              return column
                ? getNumericCellValue(
                    current.cells[buildWorksheetCellKey(column.id, sourceRow.id)]
                  ) ?? 0
                : 0;
            });
            const step =
              numericValues.length >= 2
                ? numericValues[numericValues.length - 1] - numericValues[numericValues.length - 2]
                : isZeroStepSeries(numericValues)
                ? 0
                : numericValues[0];
            const blockOffset = Math.floor(
              (columnIndex - previewRange.startColumnIndex) / sourceWidth
            );
            const sourceOffset = columnIndex - previewRange.startColumnIndex;
            const valueIndex = sourceOffset % sourceWidth;
            const baseValue = numericValues[valueIndex] ?? 0;
            nextInput = String(baseValue + step * (blockOffset + 1) * sourceWidth);
          }

          const normalizedCell = normalizeWorksheetCell(nextInput);

          if (normalizedCell.type === "empty") {
            delete nextCells[targetCellKey];
          } else {
            nextCells[targetCellKey] = normalizedCell;
          }
        }
      }

      return {
        ...current,
        cells: nextCells,
      };
    });

    const nextFocusCellKey = buildWorksheetCellKey(
      worksheet.columns[previewRange.endColumnIndex]?.id ?? worksheet.columns[sourceRange.endColumnIndex].id,
      worksheet.rows[previewRange.endRowIndex]?.id ?? worksheet.rows[sourceRange.endRowIndex].id
    );
    setSelectionAnchorCellKey(
      buildWorksheetCellKey(
        worksheet.columns[sourceRange.startColumnIndex].id,
        worksheet.rows[sourceRange.startRowIndex].id
      )
    );
    setSelectionFocusCellKey(nextFocusCellKey);
  }, [applyCommittedWorksheetChange, worksheet.columns, worksheet.rows]);

  const handleWorksheetCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (activeCellKey || !selectedRange) {
      return;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", buildWorksheetTsvFromRange(worksheet, selectedRange));
  };

  const handleUndo = () => {
    const undoState = buildWorksheetUndoState({
      currentWorksheet: worksheetRef.current,
      future: historyFutureRef.current,
      historyLimit: WORKSHEET_HISTORY_LIMIT,
      past: historyPastRef.current,
    });
    if (!undoState) {
      return;
    }

    restoreWorksheetSnapshot(undoState.worksheet, undoState.past, undoState.future);
  };

  const handleRedo = () => {
    const redoState = buildWorksheetRedoState({
      currentWorksheet: worksheetRef.current,
      future: historyFutureRef.current,
      historyLimit: WORKSHEET_HISTORY_LIMIT,
      past: historyPastRef.current,
    });
    if (!redoState) {
      return;
    }

    restoreWorksheetSnapshot(redoState.worksheet, redoState.past, redoState.future);
  };

  const adjustWorksheetZoom = (direction: "out" | "in") => {
    setWorksheetZoom((currentZoom) => {
      const currentIndex = WORKSHEET_ZOOM_LEVELS.findIndex((level) => level >= currentZoom);
      const normalizedIndex = currentIndex >= 0 ? currentIndex : WORKSHEET_ZOOM_LEVELS.indexOf(1);
      const nextIndex =
        direction === "in"
          ? Math.min(WORKSHEET_ZOOM_LEVELS.length - 1, normalizedIndex + 1)
          : Math.max(0, normalizedIndex - 1);
      return clampWorksheetZoom(WORKSHEET_ZOOM_LEVELS[nextIndex]);
    });
  };

  const resetWorksheetZoom = () => {
    setWorksheetZoom(1);
  };

  const handleWorksheetKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const isUndoShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "z" &&
      !event.shiftKey;
    const isRedoShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      ((event.key.toLowerCase() === "z" && event.shiftKey) ||
        event.key.toLowerCase() === "y");
    const isZoomInShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      (event.key === "+" || event.key === "=");
    const isZoomOutShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key === "-";
    const isZoomResetShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key === "0";

    if (isZoomInShortcut) {
      event.preventDefault();
      adjustWorksheetZoom("in");
      return;
    }

    if (isZoomOutShortcut) {
      event.preventDefault();
      adjustWorksheetZoom("out");
      return;
    }

    if (isZoomResetShortcut) {
      event.preventDefault();
      resetWorksheetZoom();
      return;
    }

    if (!canWriteWorksheet) {
      return;
    }

    if (isUndoShortcut) {
      event.preventDefault();
      handleUndo();
      return;
    }

    if (isRedoShortcut) {
      event.preventDefault();
      handleRedo();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (activeCellKey) {
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && selectedRange) {
      event.preventDefault();
      clearContentsInRange(selectedRange);
      return;
    }

    const baseCellKey =
      selectionFocusCellKey ??
      selectionAnchorCellKey ??
      buildWorksheetCellKey("A", "1");

    const moveSelection = (
      direction: "up" | "down" | "left" | "right",
      options?: { extend?: boolean }
    ) => {
      if (options?.extend) {
        const nextFocusKey = extendRangeFromAnchor(
          worksheet,
          selectionAnchorCellKey ?? baseCellKey,
          selectionFocusCellKey ?? baseCellKey,
          direction
        );

        if (nextFocusKey) {
          setSelectionFocusCellKey(nextFocusKey);
        }
        return;
      }

      const nextCellKey = moveCellKey(worksheet, baseCellKey, direction);
      if (!nextCellKey) {
        return;
      }

      setSelectionAnchorCellKey(nextCellKey);
      setSelectionFocusCellKey(nextCellKey);
    };

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection("up", { extend: event.shiftKey });
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection("down", { extend: event.shiftKey });
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection("left", { extend: event.shiftKey });
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection("right", { extend: event.shiftKey });
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      moveSelection(event.shiftKey ? "left" : "right");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      moveSelection(event.shiftKey ? "up" : "down");
      return;
    }

    if (!selectedSingleCellKey || event.key.length !== 1) {
      return;
    }

    event.preventDefault();
    setActiveCellKey(selectedSingleCellKey);
    setActiveEditor("cell");
    setEditingCellValue(event.key);
    focusInputCell(selectedSingleCellKey, { selectAll: false });
  };

  useEffect(() => {
    if (!isDraggingFill) {
      return;
    }

    const finalizeFillDrag = () => {
      const preview = getFillPreview(
        worksheetRef.current,
        fillSourceRangeRef.current,
        fillPreviewFocusCellKeyRef.current
      );

      if (fillSourceRangeRef.current && preview) {
        applyFillDrag(fillSourceRangeRef.current, preview.range, preview.direction);
      }

      clearFillDragState();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearFillDragState();
      }
    };

    window.addEventListener("mouseup", finalizeFillDrag);
    window.addEventListener("pointerup", finalizeFillDrag);
    window.addEventListener("blur", clearFillDragState);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("mouseup", finalizeFillDrag);
      window.removeEventListener("pointerup", finalizeFillDrag);
      window.removeEventListener("blur", clearFillDragState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [applyFillDrag, clearFillDragState, isDraggingFill]);

  useEffect(() => {
    if (!resizingColumnId) {
      return;
    }

    const handleMouseUp = () => {
      if (
        resizingColumnId &&
        columnResizePreviewWidth !== null &&
        worksheet.columns.some(
          (column) =>
            column.id === resizingColumnId && column.width !== columnResizePreviewWidth
        )
      ) {
        applyCommittedWorksheetChange((current) => {
          const resizedWorksheet = {
            ...current,
            columns: current.columns.map((column) =>
              column.id === resizingColumnId
                ? { ...column, width: columnResizePreviewWidth }
                : column
            ),
          };

          return applyWorksheetAutoLayout({
            worksheet: resizedWorksheet,
            target: buildWorksheetColumnAutoFitTarget(resizedWorksheet, resizingColumnId),
            measureCell: measureWorksheetCellLayout,
            minColumnWidth: MIN_COLUMN_WIDTH,
            maxColumnWidth: MAX_COLUMN_WIDTH,
            minRowHeight: MIN_ROW_HEIGHT,
            maxRowHeight: MAX_ROW_HEIGHT,
            preserveExistingColumnWidths: true,
            preserveExistingRowHeights: false,
            resizeColumns: false,
            resizeRows: true,
          });
        }, { recalculateFormulas: false });
      }

      clearColumnResizeState();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearColumnResizeState();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTH,
        Math.min(MAX_COLUMN_WIDTH, columnResizeStartWidth + (event.clientX - columnResizeStartX))
      );
      setColumnResizePreviewWidth(nextWidth);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("pointerup", handleMouseUp);
    window.addEventListener("blur", clearColumnResizeState);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("pointerup", handleMouseUp);
      window.removeEventListener("blur", clearColumnResizeState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    applyCommittedWorksheetChange,
    clearColumnResizeState,
    measureWorksheetCellLayout,
    columnResizePreviewWidth,
    columnResizeStartWidth,
    columnResizeStartX,
    resizingColumnId,
    worksheet.columns,
  ]);

  useEffect(() => {
    if (!resizingRowId) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearRowResizeState();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const nextHeight = Math.max(
        MIN_ROW_HEIGHT,
        Math.min(MAX_ROW_HEIGHT, rowResizeStartHeight + (event.clientY - rowResizeStartY))
      );
      setRowResizePreviewHeight(nextHeight);
    };

    const handleMouseUp = () => {
      if (
        resizingRowId &&
        rowResizePreviewHeight !== null &&
        worksheet.rows.some((row) => row.id === resizingRowId && row.height !== rowResizePreviewHeight)
      ) {
        applyCommittedWorksheetChange((current) => ({
          ...current,
          rows: current.rows.map((row) =>
            row.id === resizingRowId ? { ...row, height: rowResizePreviewHeight } : row
          ),
        }), { recalculateFormulas: false });
      }

      clearRowResizeState();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("pointerup", handleMouseUp);
    window.addEventListener("blur", clearRowResizeState);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("pointerup", handleMouseUp);
      window.removeEventListener("blur", clearRowResizeState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    applyCommittedWorksheetChange,
    clearRowResizeState,
    resizingRowId,
    rowResizePreviewHeight,
    rowResizeStartHeight,
    rowResizeStartY,
    worksheet.rows,
  ]);

  const saveWorksheet = async () => {
    if (!supabase || !session?.organizationId || !session?.id) {
      setError("Pricing worksheet save is not ready. Please refresh and try again.");
      return;
    }

    if (!canWriteWorksheet) {
      setError("You do not have permission to edit pricing worksheets.");
      return;
    }

    setIsSavingWorksheet(true);
    setError(null);
    setMessage(null);

    try {
      const organizationId = session.organizationId;
      const userId = session.id;
      if (!organizationId || !userId) {
        throw new Error("Could not resolve your organization or user.");
      }
      const endSaveValidationMeasure = startPricingWorksheetPerformanceMeasure("worksheet-save-validation", {
        worksheetId: explicitWorksheetId ?? worksheetId ?? "legacy",
      });
      const worksheetValidation = validateWorksheetBeforeSave({
        ...worksheetRef.current,
        sheetName: worksheetDisplayName,
      });
      endSaveValidationMeasure({
        ok: worksheetValidation.ok,
      });
      if (!worksheetValidation.ok) {
        throw new Error(worksheetValidation.message);
      }

      const syncedWorksheet = worksheetValidation.worksheet;
      const worksheetJson = syncedWorksheet as unknown as Json;
      const pricingSummaryJson = pricingSummary as unknown as Json;
      const extractedPricingDataJson = extractedPricingData as unknown as Json;

      const targetWorksheetId = explicitWorksheetId ?? worksheetId;

      if (targetWorksheetId) {
        const endSaveRequestMeasure = startPricingWorksheetPerformanceMeasure("worksheet-save-request", {
          action: "update",
          worksheetId: targetWorksheetId,
        });
        let updateError: { message: string } | null = null;
        let data: { id: string; updated_at: string | null } | null = null;
        try {
          const result = await supabase
            .from("opportunity_pricing_worksheets")
            .update({
              worksheet_data: worksheetJson,
              pricing_summary: pricingSummaryJson,
              extracted_pricing_data: extractedPricingDataJson,
              version: worksheet.version,
              updated_by: userId,
            })
            .eq("organization_id", organizationId)
            .eq("opportunity_id", sharedOpportunity.opportunityId)
            .eq("id", targetWorksheetId)
            .select("id, updated_at")
            .single();
          data = result.data;
          updateError = result.error;
        } finally {
          endSaveRequestMeasure({
            ok: !updateError,
          });
        }

        if (updateError) {
          throw new Error(updateError.message);
        }

        if (!data) {
          throw new Error("Worksheet save response was empty.");
        }

        setWorksheetId(data.id);
        setLastSavedAt(data.updated_at ?? null);
        void writePricingWorksheetIntelligenceEvents(supabase, [
          buildPricingWorksheetIntelligenceEvent({
            organizationId,
            opportunityId: sharedOpportunity.opportunityId,
            entityId: data.id,
            worksheetName: worksheetDisplayName,
            tradePackage: worksheetTradePackage,
            worksheet: syncedWorksheet,
            eventType: "worksheet_saved",
            eventFamily: "commercial_action",
            action: "saved",
          }),
        ]).catch((eventWriteError) => {
          logPricingWorksheetIntelligenceFailure("worksheet_saved", eventWriteError);
        });
      } else {
        const endSaveRequestMeasure = startPricingWorksheetPerformanceMeasure("worksheet-save-request", {
          action: "insert",
          worksheetId: "new",
        });
        let insertError: { message: string } | null = null;
        let data: { id: string; updated_at: string | null } | null = null;
        try {
          const result = await supabase
            .from("opportunity_pricing_worksheets")
            .insert({
              organization_id: organizationId,
              opportunity_id: sharedOpportunity.opportunityId,
              name: worksheetDisplayName,
              worksheet_data: worksheetJson,
              pricing_summary: pricingSummaryJson,
              extracted_pricing_data: extractedPricingDataJson,
              version: worksheet.version,
              created_by: userId,
              updated_by: userId,
            })
            .select("id, updated_at")
            .single();
          data = result.data;
          insertError = result.error;
        } finally {
          endSaveRequestMeasure({
            ok: !insertError,
          });
        }

        if (insertError) {
          throw new Error(insertError.message);
        }

        if (!data) {
          throw new Error("Worksheet save response was empty.");
        }

        setWorksheetId(data.id);
        setWorksheetName(worksheetDisplayName);
        setLastSavedAt(data.updated_at ?? null);
        void writePricingWorksheetIntelligenceEvents(supabase, [
          buildPricingWorksheetIntelligenceEvent({
            organizationId,
            opportunityId: sharedOpportunity.opportunityId,
            entityId: data.id,
            worksheetName: worksheetDisplayName,
            tradePackage: worksheetTradePackage,
            worksheet: syncedWorksheet,
            eventType: "worksheet_saved",
            eventFamily: "commercial_action",
            action: "saved",
          }),
        ]).catch((eventWriteError) => {
          logPricingWorksheetIntelligenceFailure("worksheet_saved", eventWriteError);
        });
      }

      setWorksheet(syncedWorksheet);
      worksheetRef.current = syncedWorksheet;
      setIsDirty(false);
      setMessage("Pricing worksheet saved.");
    } catch (saveWorksheetError) {
      setError(
        saveWorksheetError instanceof Error
          ? saveWorksheetError.message
          : "Unable to save the pricing worksheet."
      );
    } finally {
      setIsSavingWorksheet(false);
    }
  };

  const applyAiPreviewPayload = useCallback((payload: PricingWorksheetAiPreviewResponse, options?: {
    promptOverride?: string | null;
    followUpContext?: PricingWorksheetAiFollowUpContext | null;
  }) => {
    setAiPreviewResponse(payload);
    setAiPreviewWorksheetName(payload.preview.compactOutput.worksheetName);
    setAiPreviewTradePackage(payload.preview.compactOutput.tradePackage ?? "");
    const nextFindingStateEntries = (payload.preview.assistant?.reviewFindings ?? []).flatMap((finding) => {
      if (
        options?.followUpContext?.acceptedFindingIds?.includes(finding.id) ||
        (finding.revisedFromFindingId
          ? options?.followUpContext?.acceptedFindingIds?.includes(finding.revisedFromFindingId)
          : false)
      ) {
        return [[finding.id, "accepted" as const]];
      }

      if (
        options?.followUpContext?.rejectedFindingIds?.includes(finding.id) ||
        (finding.revisedFromFindingId
          ? options?.followUpContext?.rejectedFindingIds?.includes(finding.revisedFromFindingId)
          : false)
      ) {
        return [[finding.id, "rejected" as const]];
      }

      return [];
    });
    setAiFindingStates(Object.fromEntries(nextFindingStateEntries));
    const followUpContext = options?.followUpContext ?? null;
    const revisionSummary = followUpContext
      ? buildFindingRevisionSummaries({
          previousFindings: followUpContext.previousReviewFindings ?? [],
          nextFindings: payload.preview.assistant?.reviewFindings ?? [],
          previousSuggestedEditGroups: followUpContext.previousSuggestedEditGroups ?? [],
          nextSuggestedEditGroups: payload.preview.assistant?.suggestedEditGroups ?? [],
        })
      : null;

    const reviewEvents: Array<{
      eventType:
        | "worksheet_ai_review_generated"
        | "worksheet_ai_followup_submitted"
        | "worksheet_ai_finding_invalidated"
        | "worksheet_ai_finding_revised"
        | "worksheet_ai_finding_confirmed";
      action: "reviewed" | "revised" | "invalidated" | "confirmed";
      reason: string;
      diffData: Record<string, Json | null>;
    }> = [
      {
        eventType: followUpContext
          ? "worksheet_ai_followup_submitted"
          : "worksheet_ai_review_generated",
        action: followUpContext ? "revised" : "reviewed",
        reason: followUpContext ? "AI worksheet review revised from user follow-up." : "AI worksheet review generated.",
        diffData: buildPricingWorksheetAiReviewSignalData({
          polarity: followUpContext ? "mixed" : "neutral",
          weight:
            followUpContext
              ? -0.15 *
                (payload.preview.assistant?.reviewFindings?.filter((finding) => finding.findingStatus === "invalidated").length ?? 0)
              : 0,
          detail: {
            prompt: (options?.promptOverride ?? aiPrompt) || null,
            classification: payload.preview.classification ?? null,
            reviewFindingCount: payload.preview.assistant?.reviewFindings?.length ?? 0,
            evidenceSourceCount: payload.preview.assistant?.evidenceSources?.length ?? 0,
            invalidatedFindingCount:
              payload.preview.assistant?.reviewFindings?.filter((finding) => finding.findingStatus === "invalidated").length ?? 0,
            downgradedFindingCount:
              payload.preview.assistant?.reviewFindings?.filter((finding) => finding.findingStatus === "downgraded").length ?? 0,
            suggestedEditGroupCount: payload.preview.assistant?.suggestedEditGroups?.length ?? 0,
            affectedFindingIds: revisionSummary?.changedFindings.map((entry) => entry.finding.id) ?? [],
            affectedEvidenceSourceIds:
              revisionSummary?.changedFindings.flatMap((entry) => entry.finding.evidenceSourceIds ?? []) ?? [],
            removedSuggestedEditGroupIds: revisionSummary?.removedSuggestedEditGroupIds ?? [],
            userCorrectionSummary: followUpContext?.userCorrection ?? null,
          },
        }),
      },
    ];

    if (followUpContext && payload.preview.assistant) {
      for (const entry of revisionSummary?.changedFindings ?? []) {
        reviewEvents.push({
          eventType:
            entry.outcome === "invalidated"
              ? "worksheet_ai_finding_invalidated"
              : entry.outcome === "confirmed"
                ? "worksheet_ai_finding_confirmed"
                : "worksheet_ai_finding_revised",
          action:
            entry.outcome === "invalidated"
              ? "invalidated"
              : entry.outcome === "confirmed"
                ? "confirmed"
                : "revised",
          reason:
            entry.outcome === "invalidated"
              ? "AI worksheet review finding invalidated after user clarification."
              : entry.outcome === "confirmed"
                ? "AI worksheet review finding confirmed after user clarification."
                : "AI worksheet review finding revised after user clarification.",
          diffData: buildPricingWorksheetAiEvidenceFeedbackData({
            outcome: entry.outcome,
            interactionId: payload.aiInteractionId,
            finding: entry.finding,
            previousFinding: entry.previousFinding,
            evidenceSources: payload.preview.assistant.evidenceSources ?? [],
            classification: payload.preview.classification ?? null,
            userCorrectionSummary: followUpContext.userCorrection ?? null,
            removedSuggestedEditGroupIds: revisionSummary?.removedSuggestedEditGroupIds ?? [],
          }),
        });
      }
    }

    logAiReviewIntelligenceEvents(reviewEvents);
  }, [aiPrompt, logAiReviewIntelligenceEvents]);

  const pollAiWorksheetJob = useCallback(async (
    jobId: string,
    options?: {
      promptOverride?: string | null;
      followUpContext?: PricingWorksheetAiFollowUpContext | null;
    },
  ) => {
    if (!session?.organizationId) {
      return;
    }

    const response = await fetch(
      `/api/ai/pricing-worksheets/edit-assistant/jobs/${jobId}?organizationId=${encodeURIComponent(session.organizationId)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const payload = (await response.json()) as PricingWorksheetAiJobResponse | { error?: string };
    if (!response.ok || !("status" in payload)) {
      throw new Error(
        typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to read the AI worksheet job."
      );
    }

    setAiJobStatus(payload.status);
    setAiJobProgressLabel(payload.progressLabel);
    setAiJobError(payload.error ?? null);

    if (payload.status === "ready" && payload.preview) {
      const readyPayload: PricingWorksheetAiPreviewResponse = {
        aiInteractionId: payload.aiInteractionId,
        lifecycleState: payload.lifecycleState ?? "previewed",
        validationStatus: payload.validationStatus ?? "passed",
        preview: payload.preview,
      };
      applyAiPreviewPayload(readyPayload, options);
      setAiPreviewError(payload.error?.code === "validation_blocked" ? payload.error.message : null);
      setIsGeneratingAiPreview(false);
      return readyPayload;
    }

    if (payload.status === "failed" || payload.status === "cancelled") {
      setAiPreviewError(payload.error?.message ?? "Unable to complete the AI worksheet job.");
      setIsGeneratingAiPreview(false);
      return null;
    }

    aiJobPollTimeoutRef.current = window.setTimeout(() => {
      void pollAiWorksheetJob(jobId, options);
    }, payload.status === "queued" ? 800 : 1200);

    return null;
  }, [applyAiPreviewPayload, session?.organizationId]);

  const generateAiWorksheetPreview = useCallback(async (options?: {
    promptOverride?: string | null;
    followUpContext?: PricingWorksheetAiFollowUpContext | null;
  }) => {
    if (!session?.organizationId) {
      setAiPreviewError("AI worksheet preview is not ready. Please refresh and try again.");
      return;
    }

    if (aiJobPollTimeoutRef.current) {
      window.clearTimeout(aiJobPollTimeoutRef.current);
      aiJobPollTimeoutRef.current = null;
    }

    setIsGeneratingAiPreview(true);
    setAiPreviewError(null);
    setAiPreviewResponse(null);
    setAiJobError(null);
    setAiJobId(null);
    setAiJobStatus("queued");
    setAiJobProgressLabel("Queued");

    try {
      const worksheetSnapshot = cloneWorksheetData(worksheetRef.current);
      const endAiContextMeasure = startPricingWorksheetPerformanceMeasure("ai-context-build", {
        worksheetId: worksheetId ?? "unsaved",
      });
      const worksheetContext = buildPricingWorksheetAiContext(worksheetSnapshot, {
        worksheetId,
        worksheetName: aiPreviewWorksheetName.trim() || worksheetDisplayName,
        tradePackage: aiPreviewTradePackage.trim() || worksheetTradePackage || null,
        selection: {
          activeCellKey,
          anchorCellKey: selectionAnchorCellKey,
          focusCellKey: selectionFocusCellKey,
        },
      });
      endAiContextMeasure({
        contextRowCount: worksheetContext.rows.length,
        nearbyRowCount: worksheetContext.nearbyRows.length,
        contextBytes: JSON.stringify(worksheetContext).length,
      });

      const endAiPreviewRequestMeasure = startPricingWorksheetPerformanceMeasure("ai-preview-request", {
        worksheetId: worksheetId ?? "unsaved",
      });
      const requestPrompt = options?.promptOverride ?? aiPrompt;
      let response: Response | null = null;
      try {
        response = await fetch("/api/ai/pricing-worksheets/edit-assistant/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId: session.organizationId,
            opportunityId: sharedOpportunity.opportunityId,
            worksheetId,
            worksheetName: aiPreviewWorksheetName.trim() || worksheetDisplayName,
            tradePackage: aiPreviewTradePackage.trim() || null,
            prompt: requestPrompt,
            currentWorksheetSummary: buildCurrentWorksheetSummary(worksheetSnapshot),
            worksheetData: worksheetSnapshot,
            worksheetContext,
            followUpContext: options?.followUpContext ?? null,
          }),
        });
      } finally {
        endAiPreviewRequestMeasure({
          ok: response?.ok ?? false,
        });
      }

      if (!response) {
        throw new Error("Unable to start the AI worksheet job.");
      }

      const payload = (await response.json()) as PricingWorksheetAiJobResponse | { error?: string };
      if (!response.ok || !("jobId" in payload)) {
        throw new Error(
          typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to start the AI worksheet job."
        );
      }

      setAiJobId(payload.jobId);
      setAiJobStatus(payload.status);
      setAiJobProgressLabel(payload.progressLabel);

      return await pollAiWorksheetJob(payload.jobId, options);
    } catch (aiPreviewGenerationError) {
      setAiPreviewError(
        aiPreviewGenerationError instanceof Error
          ? aiPreviewGenerationError.message
          : "Unable to start the AI worksheet job."
      );
      setIsGeneratingAiPreview(false);
      return null;
    }
  }, [
    activeCellKey,
    aiPreviewTradePackage,
    aiPreviewWorksheetName,
    aiPrompt,
    pollAiWorksheetJob,
    selectionAnchorCellKey,
    selectionFocusCellKey,
    session?.organizationId,
    sharedOpportunity.opportunityId,
    worksheetId,
    worksheetDisplayName,
    worksheetTradePackage,
  ]);

  const submitAiWorksheetReview = useCallback(async (
    action: "accepted" | "edited" | "rejected",
    editedOutput?: Record<string, Json | null | string | number | string[]>
  ) => {
    if (!session?.organizationId || !aiPreviewResponse) {
      throw new Error("The AI worksheet preview is no longer available.");
    }

    const responseMode = aiPreviewResponse.preview.assistant?.mode ?? null;
    const response = await fetch("/api/ai/interactions/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: session.organizationId,
        aiInteractionId: aiPreviewResponse.aiInteractionId,
        action,
        editedOutput,
        feedbackSummary:
          action === "accepted"
            ? responseMode === "answer_only"
              ? "Worksheet assistant answer accepted."
              : "Worksheet assistant response accepted."
            : action === "edited"
              ? "Worksheet assistant response applied after manual preview edits."
              : "Worksheet assistant response rejected before apply.",
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to record the AI worksheet review.");
    }
  }, [aiPreviewResponse, session?.organizationId]);

  const handleAiFindingDispositionChange = useCallback((findingId: string, disposition: PricingWorksheetAiFindingDisposition) => {
    setAiFindingStates((current) => ({
      ...current,
      [findingId]: disposition,
    }));
    const finding = getFindingById(aiPreviewResponse?.preview.assistant?.reviewFindings, findingId);
    logAiReviewIntelligenceEvent({
      eventType:
        disposition === "accepted" ? "worksheet_ai_finding_accepted" : "worksheet_ai_finding_rejected",
      action: disposition,
      reason: `AI worksheet review finding ${disposition}.`,
      diffData: buildPricingWorksheetAiEvidenceFeedbackData({
        outcome: disposition,
        interactionId: aiPreviewResponse?.aiInteractionId ?? null,
        finding,
        evidenceSources: aiPreviewResponse?.preview.assistant?.evidenceSources ?? [],
        classification: aiPreviewResponse?.preview.classification ?? null,
      }),
    });
  }, [aiPreviewResponse, logAiReviewIntelligenceEvent]);

  const submitAiFollowUp = useCallback(async () => {
    if (!aiPreviewResponse || !session?.organizationId) {
      setAiPreviewError("Ask AI for a review before sending a follow-up.");
      return;
    }

    const nextPrompt = aiFollowUpPrompt.trim();
    if (!nextPrompt) {
      return;
    }

    setIsSubmittingAiFollowUp(true);
    setAiPreviewError(null);

    try {
      const previousInteractionId = aiPreviewResponse.aiInteractionId;
      const followUpContext = buildAiFollowUpContext();
      setAiPrompt(nextPrompt);
      const nextPreviewResponse = await generateAiWorksheetPreview({
        promptOverride: nextPrompt,
        followUpContext,
      });
      setAiFollowUpPrompt("");
      if (nextPreviewResponse?.aiInteractionId && nextPreviewResponse.aiInteractionId !== previousInteractionId) {
        await fetch("/api/ai/interactions/review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId: session.organizationId,
            aiInteractionId: previousInteractionId,
            action: "superseded",
            supersededByInteractionId: nextPreviewResponse.aiInteractionId,
            feedbackSummary: "Worksheet AI review superseded by follow-up revision.",
          }),
        });
      }
    } catch (followUpError) {
      setAiPreviewError(
        followUpError instanceof Error ? followUpError.message : "Unable to revise the AI worksheet review."
      );
    } finally {
      setIsSubmittingAiFollowUp(false);
    }
  }, [
    aiFollowUpPrompt,
    aiPreviewResponse,
    buildAiFollowUpContext,
    generateAiWorksheetPreview,
    session?.organizationId,
  ]);

  const rejectAiWorksheetPreview = useCallback(async () => {
    if (!aiPreviewResponse) {
      handleAiDialogOpenChange(false);
      return;
    }

    setIsSubmittingAiReview(true);
    setAiPreviewError(null);

    try {
      await submitAiWorksheetReview("rejected");
      setMessage("AI worksheet assistant response rejected.");
      handleAiDialogOpenChange(false);
    } catch (aiReviewError) {
      setAiPreviewError(
        aiReviewError instanceof Error ? aiReviewError.message : "Unable to reject the AI worksheet response."
      );
    } finally {
      setIsSubmittingAiReview(false);
    }
  }, [aiPreviewResponse, handleAiDialogOpenChange, submitAiWorksheetReview]);

  const applyAiSuggestedEditGroup = useCallback(async (groupId: string) => {
    if (!aiPreviewResponse?.preview.assistant) {
      setAiPreviewError("Ask AI for a review before applying a suggested edit.");
      return;
    }

    if (!canWriteWorksheet) {
      setAiPreviewError("You can review this AI suggestion, but applying worksheet edits requires write permission.");
      return;
    }

    const assistantResponse = buildAssistantResponseFromPreview(aiPreviewResponse.preview.assistant);
    const selectedResponse = buildPricingWorksheetAiSuggestedEditSelectionResponse(assistantResponse, [groupId]);
    const simulation = simulatePricingWorksheetAiEditPlan(worksheetRef.current, selectedResponse);
    const hasBlockingIssue = simulation.validationIssues.some((issue) => issue.severity === "error");
    if (hasBlockingIssue) {
      setAiPreviewError(simulation.validationIssues[0]?.message ?? "Unable to apply the selected suggested edit.");
      return;
    }

    setIsSubmittingAiReview(true);
    setAiPreviewError(null);

    try {
      const normalizedTradePackage = aiPreviewTradePackage.trim() || null;
      let nextWorksheet = cloneWorksheetData(simulation.worksheet);
      nextWorksheet = autoLayoutWorksheet(nextWorksheet, simulation.diffSummary);
      nextWorksheet.sheetName =
        aiPreviewWorksheetName.trim() || aiPreviewResponse.preview.compactOutput.worksheetName || nextWorksheet.sheetName;

      await submitAiWorksheetReview("edited", {
        ...buildWorksheetAiEditedOutput({
          preview: aiPreviewResponse.preview,
          worksheetName: nextWorksheet.sheetName,
          tradePackage: normalizedTradePackage,
        }),
        appliedSuggestedEditGroupIds: [groupId],
        selectedOperationTypes: selectedResponse.operations.map((operation) => operation.type),
      });

      const commitResult = applyCommittedWorksheetChange(() => nextWorksheet, {
        validateFormulaOutputs: true,
      });
      if (!commitResult.committed) {
        setAiPreviewError(commitResult.message ?? "Unable to apply the selected suggested edit.");
        return;
      }

      setWorksheetName(nextWorksheet.sheetName);
      setWorksheetTradePackage(normalizedTradePackage);
      setAiAppliedSuggestedEditGroupIds((current) => (current.includes(groupId) ? current : [...current, groupId]));
      setSelectionAnchorCellKey(buildWorksheetCellKey("A", "1"));
      setSelectionFocusCellKey(buildWorksheetCellKey("A", "1"));
      setActiveCellKey(null);
      setActiveEditor(null);
      setEditingCellValue("");
      setMessage("Selected AI worksheet edit applied locally. Review the sheet and save when ready.");
      logAiReviewIntelligenceEvent({
        eventType: "worksheet_ai_suggested_edit_applied",
        action: "applied",
        reason: "AI worksheet suggested edit group applied locally.",
        diffData: buildPricingWorksheetAiEvidenceFeedbackData({
          outcome: "applied",
          interactionId: aiPreviewResponse.aiInteractionId,
          evidenceSources: aiPreviewResponse.preview.assistant?.evidenceSources ?? [],
          classification: aiPreviewResponse.preview.classification ?? null,
          affectedSuggestedEditGroupIds: [groupId],
          affectedFindingIds:
            aiPreviewResponse.preview.assistant?.suggestedEditGroups
              ?.find((group) => group.id === groupId)
              ?.relatedFindingIds ?? [],
          evidenceSourceIds:
            aiPreviewResponse.preview.assistant?.suggestedEditGroups
              ?.find((group) => group.id === groupId)
              ?.relatedFindingIds.flatMap((findingId) =>
                getFindingById(aiPreviewResponse.preview.assistant?.reviewFindings, findingId)?.evidenceSourceIds ?? []
              ) ?? [],
        }),
      });
    } catch (applyGroupError) {
      setAiPreviewError(
        applyGroupError instanceof Error ? applyGroupError.message : "Unable to apply the selected suggested edit."
      );
    } finally {
      setIsSubmittingAiReview(false);
    }
  }, [
    aiPreviewResponse,
    aiPreviewTradePackage,
    aiPreviewWorksheetName,
    autoLayoutWorksheet,
    applyCommittedWorksheetChange,
    canWriteWorksheet,
    logAiReviewIntelligenceEvent,
    submitAiWorksheetReview,
  ]);

  const applyAiWorksheetPreview = useCallback(async () => {
    if (!aiPreviewResponse) {
      setAiPreviewError("Ask AI for a worksheet response before applying it.");
      return;
    }

    const hasMutatingOperations =
      (aiPreviewResponse.preview.assistant?.operations ?? []).some((operation) => operation.type !== "explain_formula") ?? false;
    if (hasMutatingOperations && !canWriteWorksheet) {
      setAiPreviewError("You can review this AI suggestion, but applying worksheet edits requires write permission.");
      return;
    }
    const hasExistingContent = hasWorksheetContent(worksheetRef.current);
    if (hasMutatingOperations && hasExistingContent) {
      const confirmed = window.confirm(
        "This will apply the AI worksheet changes to your current sheet locally. Your worksheet is not auto-saved. Continue?"
      );
      if (!confirmed) {
        return;
      }
    }

    setIsSubmittingAiReview(true);
    setAiPreviewError(null);

    try {
      const normalizedTradePackage = aiPreviewTradePackage.trim() || null;
      const editedOutput = buildWorksheetAiEditedOutput({
        preview: aiPreviewResponse.preview,
        worksheetName: aiPreviewWorksheetName.trim() || aiPreviewResponse.preview.compactOutput.worksheetName,
        tradePackage: normalizedTradePackage,
      });
      editedOutput.acceptedFindingIds = Object.entries(aiFindingStates)
        .filter(([, disposition]) => disposition === "accepted")
        .map(([findingId]) => findingId);
      editedOutput.rejectedFindingIds = Object.entries(aiFindingStates)
        .filter(([, disposition]) => disposition === "rejected")
        .map(([findingId]) => findingId);
      editedOutput.appliedSuggestedEditGroupIds = aiAppliedSuggestedEditGroupIds;
      const isEdited =
        (aiPreviewWorksheetName.trim() || aiPreviewResponse.preview.compactOutput.worksheetName) !==
          aiPreviewResponse.preview.compactOutput.worksheetName ||
        normalizedTradePackage !== (aiPreviewResponse.preview.compactOutput.tradePackage ?? null) ||
        aiAppliedSuggestedEditGroupIds.length > 0 ||
        Object.keys(aiFindingStates).length > 0;

      await submitAiWorksheetReview(isEdited ? "edited" : "accepted", editedOutput);

      if (hasMutatingOperations) {
        let nextWorksheet = cloneWorksheetData(aiPreviewResponse.preview.worksheet);
        nextWorksheet = autoLayoutWorksheet(nextWorksheet, aiPreviewResponse.preview.assistant?.diffSummary);
        nextWorksheet.sheetName =
          aiPreviewWorksheetName.trim() || aiPreviewResponse.preview.compactOutput.worksheetName || nextWorksheet.sheetName;

        const commitResult = applyCommittedWorksheetChange(() => nextWorksheet, {
          validateFormulaOutputs: true,
        });
        if (!commitResult.committed) {
          setAiPreviewError(commitResult.message ?? "Unable to apply the AI worksheet response.");
          return;
        }

        setWorksheetName(nextWorksheet.sheetName);
        setWorksheetTradePackage(normalizedTradePackage);
        setSelectionAnchorCellKey(buildWorksheetCellKey("A", "1"));
        setSelectionFocusCellKey(buildWorksheetCellKey("A", "1"));
        setActiveCellKey(null);
        setActiveEditor(null);
        setEditingCellValue("");
        setMessage("AI worksheet changes applied locally. Review the sheet and save when ready.");
      } else {
        setMessage("AI answer accepted.");
      }

      handleAiDialogOpenChange(false);
    } catch (aiApplyError) {
      setAiPreviewError(
        aiApplyError instanceof Error ? aiApplyError.message : "Unable to apply the AI worksheet response."
      );
    } finally {
      setIsSubmittingAiReview(false);
    }
  }, [
    aiPreviewResponse,
    aiPreviewTradePackage,
    aiPreviewWorksheetName,
    aiAppliedSuggestedEditGroupIds,
    aiFindingStates,
    autoLayoutWorksheet,
    applyCommittedWorksheetChange,
    canWriteWorksheet,
    handleAiDialogOpenChange,
    submitAiWorksheetReview,
  ]);

  const setWorksheetInputRef = useCallback((cellKey: string, node: HTMLInputElement | null) => {
    inputRefs.current[cellKey] = node;
  }, []);

  const handleGridCellMouseDown = useCallback((
    cellKey: string,
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0) {
      return;
    }

    if (
      isFormulaReferenceMode &&
      activeCellKey &&
      activeCellKey !== cellKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      appendCellReferenceToFormula(cellKey);
      return;
    }

    event.preventDefault();
    startPendingRangeSelection(cellKey, event.clientX, event.clientY);
  }, [activeCellKey, appendCellReferenceToFormula, isFormulaReferenceMode, startPendingRangeSelection]);

  const handleGridCellClick = useCallback((
    cellKey: string,
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    if (handledFormulaReferenceMouseDownRef.current) {
      handledFormulaReferenceMouseDownRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (isFormulaReferenceMode) {
      event.preventDefault();
      event.stopPropagation();
      appendCellReferenceToFormula(cellKey);
      return;
    }

    if (didDragSelectionRef.current) {
      didDragSelectionRef.current = false;
      return;
    }

    if (event.detail === 1) {
      selectSingleCell(cellKey);
    }
  }, [appendCellReferenceToFormula, isFormulaReferenceMode, selectSingleCell]);

  const handleGridCellKeyDown = useCallback((
    cellKey: string,
    event: ReactKeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      suppressBlurCommitCellKeyRef.current = cellKey;
      setActiveCellKey(null);
      setActiveEditor(null);
      setEditingCellValue("");
      focusWorksheetSurface();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const nextCellKey = getAdjacentCellKey(cellKey, {
        rowDelta: event.shiftKey ? -1 : 1,
      });
      suppressBlurCommitCellKeyRef.current = cellKey;
      commitCellEdit(cellKey, editingCellValue, nextCellKey);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const nextCellKey = getAdjacentCellKey(cellKey, {
        columnDelta: event.shiftKey ? -1 : 1,
      });
      suppressBlurCommitCellKeyRef.current = cellKey;
      commitCellEdit(cellKey, editingCellValue, nextCellKey);
    }
  }, [commitCellEdit, editingCellValue, focusWorksheetSurface, getAdjacentCellKey]);

  return (
    <div className="min-w-0 flex-1">
      <div className="overflow-hidden rounded-[6px] border border-[var(--border)] bg-white shadow-none">
        <div className="border-b border-[var(--border)] bg-white">
          <div className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold leading-5 text-[var(--text-primary)]">
                {worksheetDisplayName}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <span>{isDirty ? "Unsaved changes" : "Saved"}</span>
                <span aria-hidden="true">/</span>
                <span>
                  {lastSavedAt
                    ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString("en-NZ", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Not saved yet"}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-[6px] border border-[var(--border)] bg-white px-1 py-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => adjustWorksheetZoom("out")}
                  disabled={worksheetZoom <= WORKSHEET_ZOOM_LEVELS[0]}
                  className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                >
                  -
                </Button>
                <select
                  value={String(worksheetZoom)}
                  onChange={(event) => setWorksheetZoom(clampWorksheetZoom(Number(event.target.value) || 1))}
                  className="h-6 rounded-[4px] border border-[var(--border)] bg-white px-1.5 text-[11px] text-[var(--text-primary)] outline-none"
                  aria-label="Worksheet zoom"
                >
                  {WORKSHEET_ZOOM_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {Math.round(level * 100)}%
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => adjustWorksheetZoom("in")}
                  disabled={worksheetZoom >= WORKSHEET_ZOOM_LEVELS[WORKSHEET_ZOOM_LEVELS.length - 1]}
                  className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                >
                  +
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openAiDialog}
                disabled={isSavingWorksheet || isLoadingWorksheet}
                className="h-8 rounded-[6px] px-2.5 text-xs font-medium shadow-none"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask AI
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveWorksheet()}
                disabled={!canWriteWorksheet || isSavingWorksheet || isLoadingWorksheet || !isDirty}
                className="h-8 rounded-[6px] px-2.5 text-xs font-medium shadow-none"
              >
                <Save className="h-3.5 w-3.5" />
                {isSavingWorksheet ? "Saving..." : "Save worksheet"}
              </Button>
            </div>
          </div>
        </div>
        <div
          ref={worksheetSurfaceRef}
          className="space-y-0 outline-none"
          tabIndex={0}
          onPasteCapture={handleWorksheetPaste}
          onCopy={handleWorksheetCopy}
          onKeyDown={handleWorksheetKeyDown}
        >
          {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
          {message ? <OperationalAlert variant="success">{message}</OperationalAlert> : null}

          <div
            ref={formattingToolbarRef}
            tabIndex={-1}
            className="border-b border-[var(--border)] bg-[#F8FAFC] px-2 py-1 outline-none"
          >
            <div className="flex flex-wrap items-center gap-0.5">
              <div className="flex flex-wrap items-center gap-0.5">
                <select
                  value={selectedNumberFormatKind}
                  onChange={(event) =>
                    applyNumberFormatKindToSelection(event.target.value as WorksheetNumberFormatKind)
                  }
                  onKeyDown={(event) => event.stopPropagation()}
                  disabled={!canWriteWorksheet || !selectedRange}
                  aria-label="Number format"
                  className="h-6 rounded-[4px] border border-[var(--border)] bg-white px-1.5 text-[11px] text-[var(--text-primary)] outline-none disabled:opacity-50"
                >
                  {NUMBER_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                  aria-label="Decrease decimal places"
                  onClick={() => adjustNumberDecimalPlacesForSelection("decrease")}
                  disabled={!canWriteWorksheet || !selectedRange}
                >
                  -.0
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                  aria-label="Increase decimal places"
                  onClick={() => adjustNumberDecimalPlacesForSelection("increase")}
                  disabled={!canWriteWorksheet || !selectedRange}
                >
                  +.0
                </Button>
                <select
                  value={selectedNegativeStyle}
                  onChange={(event) =>
                    applyNegativeNumberStyleToSelection(event.target.value as WorksheetNegativeNumberStyle)
                  }
                  onKeyDown={(event) => event.stopPropagation()}
                  disabled={!canWriteWorksheet || !selectedRange}
                  aria-label="Negative number style"
                  className="h-6 rounded-[4px] border border-[var(--border)] bg-white px-1.5 text-[11px] text-[var(--text-primary)] outline-none disabled:opacity-50"
                >
                  {NEGATIVE_STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mx-1 h-4 w-px bg-[var(--border-subtle)]" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canWriteWorksheet || !selectedRange}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                    disabled={!canWriteWorksheet || !selectedRange}
                  >
                    Insert
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-[9rem] rounded-[6px] p-1">
                  <DropdownMenuItem
                    onSelect={() => insertRowAtSelection("above")}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Row above
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => insertRowAtSelection("below")}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Row below
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => insertColumnAtSelection("left")}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Column left
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => insertColumnAtSelection("right")}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Column right
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="mx-1 h-4 w-px bg-[var(--border-subtle)]" />
              <Button
                variant="secondary"
                size="sm"
                className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                onClick={() =>
                  applyFormattingPatchToSelection((format) => ({
                    ...format,
                    text: {
                      ...(format.text ?? {}),
                      bold: format.text?.bold ? undefined : true,
                    },
                  }))
                }
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Bold
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                onClick={() => applyFormattingPatchToSelection({ text: { align: "left" } })}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Left
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                onClick={() => applyFormattingPatchToSelection({ text: { align: "center" } })}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Center
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                onClick={() => applyFormattingPatchToSelection({ text: { align: "right" } })}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Right
              </Button>
              <div className="mx-1 h-4 w-px bg-[var(--border-subtle)]" />
              <div className="flex items-center gap-0.5">
                {FILL_SWATCHES.map((color) => (
                  <button
                    key={`fill-${color}`}
                    type="button"
                    aria-label={`Set fill color ${color}`}
                    className="h-5 w-5 rounded-[4px] border border-[var(--border)]"
                    style={{ backgroundColor: color }}
                    onClick={() => applyFormattingPatchToSelection({ fill: { color } })}
                    disabled={!canWriteWorksheet || !selectedRange}
                  />
                ))}
              </div>
              <div className="flex items-center gap-0.5">
                {TEXT_SWATCHES.map((color) => (
                  <button
                    key={`text-${color}`}
                    type="button"
                    aria-label={`Set text color ${color}`}
                    className="flex h-5 w-5 items-center justify-center rounded-[4px] border border-[var(--border)] bg-white text-[10px] font-semibold"
                    style={{ color }}
                    onClick={() => applyFormattingPatchToSelection({ text: { color } })}
                    disabled={!canWriteWorksheet || !selectedRange}
                  >
                    A
                  </button>
                ))}
              </div>
              <div className="mx-1 h-4 w-px bg-[var(--border-subtle)]" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canWriteWorksheet || !selectedRange}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                    disabled={!canWriteWorksheet || !selectedRange}
                  >
                    Borders
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-[9rem] rounded-[6px] p-1">
                  <DropdownMenuItem
                    onSelect={() => applyBorderModeToSelection("all")}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    All borders
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => applyBorderModeToSelection("outer")}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Outer border
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => applyBorderModeToSelection("clear")}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Clear borders
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canWriteWorksheet || !selectedRange}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 rounded-[4px] px-1.5 text-[11px] font-medium shadow-none"
                    disabled={!canWriteWorksheet || !selectedRange}
                  >
                    Clear
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-[9rem] rounded-[6px] p-1">
                  <DropdownMenuItem
                    onSelect={() =>
                      applyFormattingPatchToSelection((format) => clearCellFill(format))
                    }
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Clear fill
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={clearNumberFormatForSelection}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Clear number format
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => applyBorderModeToSelection("clear")}
                    disabled={!canWriteWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Clear borders
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-white px-2 py-1">
            <div className="flex h-6 w-14 shrink-0 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[#F8FAFC] px-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
              {formulaBarCellKey}
            </div>
            <div className="shrink-0 text-[11px] font-medium italic text-[var(--text-muted)]">fx</div>
            <textarea
              ref={formulaBarRef}
              value={formulaBarValue}
              rows={1}
              onFocus={() => {
                if (!formulaBarCellKey || !canWriteWorksheet) {
                  return;
                }

                beginCellEdit(formulaBarCellKey, formulaBarCell, {
                  editor: "formulaBar",
                  focus: false,
                });
              }}
              onChange={(event) => {
                if (!formulaBarCellKey || !canWriteWorksheet) {
                  return;
                }

                if (activeCellKey !== formulaBarCellKey || activeEditor !== "formulaBar") {
                  setActiveCellKey(formulaBarCellKey);
                  setActiveEditor("formulaBar");
                  setSelectionAnchorCellKey(formulaBarCellKey);
                  setSelectionFocusCellKey(formulaBarCellKey);
                }

                setEditingCellValue(event.target.value);
              }}
              onBlur={() => {
                if (suppressFormulaBarBlurCommitRef.current) {
                  suppressFormulaBarBlurCommitRef.current = false;
                  return;
                }

                if (!formulaBarCellKey || activeEditor !== "formulaBar") {
                  return;
                }

                commitCellEdit(formulaBarCellKey, editingCellValue);
              }}
              onKeyDown={(event) => {
                event.stopPropagation();

                if (!formulaBarCellKey) {
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setActiveCellKey(null);
                  setActiveEditor(null);
                  setEditingCellValue("");
                  focusWorksheetSurface();
                  return;
                }

                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  commitCellEdit(formulaBarCellKey, editingCellValue);
                }
              }}
              className="min-h-6 w-full resize-none rounded-[4px] border border-[var(--border)] bg-white px-2 py-1 text-[13px] leading-[18px] text-[var(--text-primary)] outline-none"
              placeholder="Enter a value or formula"
              disabled={!canWriteWorksheet}
              spellCheck={false}
            />
          </div>

          <div className="overflow-hidden border-t-0 border-[var(--border)] bg-white">
            <div
              ref={worksheetViewportRef}
              className="max-h-[70vh] overflow-auto"
              onScroll={(event) => {
                setWorksheetViewportScrollLeft(event.currentTarget.scrollLeft);
                setWorksheetViewportScrollTop(event.currentTarget.scrollTop);
                setWorksheetViewportHeight(
                  event.currentTarget.clientHeight || WORKSHEET_VIEWPORT_FALLBACK_HEIGHT
                );
                setWorksheetViewportWidth(
                  event.currentTarget.clientWidth || WORKSHEET_VIEWPORT_FALLBACK_WIDTH
                );
              }}
            >
              <div
                style={{
                  minWidth: `max(${WORKSHEET_VIEWPORT_FALLBACK_WIDTH}px, ${
                    WORKSHEET_ROW_GUTTER_WIDTH + effectiveColumns.reduce((sum, column) => sum + column.width, 0)
                  }px)`,
                  zoom: worksheetZoom,
                }}
              >
                <div
                  className="sticky top-0 z-20 grid border-b border-[var(--border)] bg-[#F8FAFC]"
                  style={{
                    gridTemplateColumns: virtualGridTemplateColumns,
                  }}
                >
                  <div className="sticky left-0 z-30 border-r border-[var(--border)] bg-[#F8FAFC] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                    #
                  </div>
                  <div
                    aria-hidden="true"
                    className="border-r border-[var(--border)] bg-[#F8FAFC]"
                    style={{ width: `${virtualColumns.leftSpacerWidth}px` }}
                  />
                  {virtualColumns.visibleColumns.map((column, columnOffset) => (
                    <div
                      key={column.id}
                      className="relative border-r border-[var(--border)] bg-[#F8FAFC] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] last:border-r-0"
                      onContextMenu={(event) => openColumnContextMenu(event, virtualColumns.startIndex + columnOffset)}
                    >
                      {column.label}
                      <button
                        type="button"
                        aria-label={`Resize column ${column.label}`}
                        className="absolute right-0 top-0 h-full w-2 translate-x-1/2 cursor-col-resize"
                        onMouseDown={(event) => beginColumnResize(event, column.id, column.width)}
                        onDoubleClick={(event) => autoFitColumn(event, column.id)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      />
                    </div>
                  ))}
                  <div
                    aria-hidden="true"
                    className="bg-[#F8FAFC]"
                    style={{ width: `${virtualColumns.rightSpacerWidth}px` }}
                  />
                </div>

                {isLoadingWorksheet ? (
                  <div className="px-4 py-6 text-sm text-[var(--text-secondary)]">Loading worksheet...</div>
                ) : (
                  <div>
                    {virtualRows.topSpacerHeight > 0 ? (
                      <div style={{ height: `${virtualRows.topSpacerHeight}px` }} />
                    ) : null}
                    {virtualRows.virtualRows.map(({ row, rowIndex }) => (
                      <WorksheetRowView
                        key={row.id}
                        activeCellKey={activeCellKey}
                        activeEditor={activeEditor}
                        canWriteWorksheet={canWriteWorksheet}
                        editingCellValue={editingCellValue}
                        fillPreviewRange={fillPreview?.range ?? null}
                        formulaReferenceHighlightByCellKey={formulaReferenceHighlightByCellKey}
                        formulaReferenceRanges={formulaReferenceRanges}
                        gridTemplateColumns={virtualGridTemplateColumns}
                        leftSpacerWidth={virtualColumns.leftSpacerWidth}
                        rowCells={visibleRowCells.get(row.id) ?? []}
                        row={row}
                        rowIndex={rowIndex}
                        rightSpacerWidth={virtualColumns.rightSpacerWidth}
                        selectedRange={selectedRange}
                        visibleColumnStartIndex={virtualColumns.startIndex}
                        visibleColumns={virtualColumns.visibleColumns}
                        onBeginCellEdit={handleBeginGridCellEdit}
                        onBeginFillDrag={beginFillDrag}
                        onAutoFitRow={autoFitRow}
                        onBeginRowResize={beginRowResize}
                        onCellClick={handleGridCellClick}
                        onCellContextMenu={handleCellContextMenu}
                        onCellMouseDown={handleGridCellMouseDown}
                        onCellMouseEnter={updateRangeSelection}
                        onInputBlur={handleCellBlur}
                        onInputChange={setEditingCellValue}
                        onInputKeyDown={handleGridCellKeyDown}
                        onRowContextMenu={openRowContextMenu}
                        setInputRef={setWorksheetInputRef}
                      />
                    ))}
                    {virtualRows.bottomSpacerHeight > 0 ? (
                      <div style={{ height: `${virtualRows.bottomSpacerHeight}px` }} />
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] min-w-0 whitespace-pre-wrap break-words px-2.5 py-1.5 text-sm leading-5 opacity-0"
            ref={worksheetTextMeasureRef}
            style={{
              fontSize: `${WORKSHEET_CELL_FONT_SIZE}px`,
              lineHeight: `${WORKSHEET_CELL_LINE_HEIGHT}px`,
            }}
          />

          {contextMenu ? (
            <div
              role="menu"
              className="fixed z-[500] min-w-[210px] rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-1.5 text-sm shadow-[var(--shadow-lg)]"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {contextMenu.type === "cell" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                    onClick={() =>
                      runContextMenuAction(() => copyRangeToClipboard(getContextMenuRange(contextMenu)))
                    }
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        const range = getContextMenuRange(contextMenu);
                        if (range) {
                          clearContentsInRange(range);
                        }
                      })
                    }
                  >
                    Clear contents
                  </button>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        const range = getContextMenuRange(contextMenu);
                        insertRowAtIndex(range?.startRowIndex ?? 0, range?.startColumnIndex ?? 0);
                      })
                    }
                  >
                    Insert row above
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        const range = getContextMenuRange(contextMenu);
                        insertRowAtIndex((range?.endRowIndex ?? 0) + 1, range?.startColumnIndex ?? 0);
                      })
                    }
                  >
                    Insert row below
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        const range = getContextMenuRange(contextMenu);
                        insertColumnAtIndex(range?.startColumnIndex ?? 0, range?.startRowIndex ?? 0);
                      })
                    }
                  >
                    Insert column left
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        const range = getContextMenuRange(contextMenu);
                        insertColumnAtIndex((range?.endColumnIndex ?? 0) + 1, range?.startRowIndex ?? 0);
                      })
                    }
                  >
                    Insert column right
                  </button>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                    onClick={() => runContextMenuAction(focusFormattingToolbar)}
                  >
                    Format cells
                  </button>
                </>
              ) : null}

              {contextMenu.type === "row" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        commitActiveEditIfNeeded();
                        insertRowAtIndex(contextMenu.rowIndex, 0);
                      })
                    }
                  >
                    Insert row above
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        commitActiveEditIfNeeded();
                        insertRowAtIndex(contextMenu.rowIndex + 1, 0);
                      })
                    }
                  >
                    Insert row below
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => clearContentsInRange(getRowRange(contextMenu.rowIndex)))
                    }
                  >
                    Clear row contents
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      !canDeleteRowRange(
                        getContextRowDeleteRange(contextMenu.rowIndex).startRowIndex,
                        getContextRowDeleteRange(contextMenu.rowIndex).endRowIndex
                      )
                    }
                    onClick={() =>
                      runContextMenuAction(() => {
                        const range = getContextRowDeleteRange(contextMenu.rowIndex);
                        deleteRowsAtRange(range.startRowIndex, range.endRowIndex);
                      })
                    }
                  >
                    {getRowDeleteLabel(contextMenu.rowIndex)}
                  </button>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full cursor-not-allowed items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-muted)] opacity-60"
                    disabled
                  >
                    Row height
                  </button>
                </>
              ) : null}

              {contextMenu.type === "column" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        commitActiveEditIfNeeded();
                        insertColumnAtIndex(contextMenu.columnIndex, 0);
                      })
                    }
                  >
                    Insert column left
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => {
                        commitActiveEditIfNeeded();
                        insertColumnAtIndex(contextMenu.columnIndex + 1, 0);
                      })
                    }
                  >
                    Insert column right
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWriteWorksheet}
                    onClick={() =>
                      runContextMenuAction(() => clearContentsInRange(getColumnRange(contextMenu.columnIndex)))
                    }
                  >
                    Clear column contents
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      !canDeleteColumnRange(
                        getContextColumnDeleteRange(contextMenu.columnIndex).startColumnIndex,
                        getContextColumnDeleteRange(contextMenu.columnIndex).endColumnIndex
                      )
                    }
                    onClick={() =>
                      runContextMenuAction(() => {
                        const range = getContextColumnDeleteRange(contextMenu.columnIndex);
                        deleteColumnsAtRange(range.startColumnIndex, range.endColumnIndex);
                      })
                    }
                  >
                    {getColumnDeleteLabel(contextMenu.columnIndex)}
                  </button>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full cursor-not-allowed items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-muted)] opacity-60"
                    disabled
                  >
                    Column width
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <PricingWorksheetAiAssistDialog
        open={isAiDialogOpen}
        canApply={
          canWriteWorksheet ||
          aiPreviewResponse?.preview.assistant?.mode === "answer_only"
        }
        prompt={aiPrompt}
        previewWorksheetName={aiPreviewWorksheetName}
        previewTradePackage={aiPreviewTradePackage}
        isGenerating={isGeneratingAiPreview}
        jobStatus={aiJobStatus}
        jobProgressLabel={aiJobProgressLabel}
        jobError={aiJobError}
        isSubmittingReview={isSubmittingAiReview}
        preview={aiPreviewResponse?.preview ?? null}
        error={aiPreviewError}
        onOpenChange={handleAiDialogOpenChange}
        onPromptChange={handleAiPromptChange}
        onPreviewWorksheetNameChange={handleAiPreviewWorksheetNameChange}
        onPreviewTradePackageChange={handleAiPreviewTradePackageChange}
        onGenerate={() => void generateAiWorksheetPreview()}
        onReject={() => void rejectAiWorksheetPreview()}
        onApply={() => void applyAiWorksheetPreview()}
        onApplySuggestedEditGroup={(groupId) => void applyAiSuggestedEditGroup(groupId)}
        findingStates={aiFindingStates}
        appliedSuggestedEditGroupIds={aiAppliedSuggestedEditGroupIds}
        followUpPrompt={aiFollowUpPrompt}
        isSubmittingFollowUp={isSubmittingAiFollowUp}
        onFollowUpPromptChange={setAiFollowUpPrompt}
        onSubmitFollowUp={() => void submitAiFollowUp()}
        onFindingDispositionChange={handleAiFindingDispositionChange}
      />
    </div>
  );
}
