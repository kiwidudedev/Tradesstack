"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type Ref,
  type SyntheticEvent as ReactSyntheticEvent,
  type UIEvent as ReactUIEvent,
} from "react";
import {
  Bold as BoldIcon,
  Check,
  ChevronDown,
  Eraser,
  FileSpreadsheet,
  Grid2X2,
  Italic as ItalicIcon,
  LayoutGrid,
  Minus,
  Boxes,
  PaintBucket,
  Plus,
  Ruler,
  RotateCcw,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";
import {
  PricingWorksheetAiAssistDialog,
  type PricingWorksheetAiFindingDisposition,
  type PricingWorksheetAiPreviewAssistant,
  type PricingWorksheetAiContextSummary,
  type PricingWorksheetAiMatchedMemory,
  type PricingWorksheetAiPreviewContinuation,
  type PricingWorksheetAiPreviewSummary,
  type PricingWorksheetAiValidationWarning,
} from "@/components/app/PricingWorksheetAiAssistDialog";
import { PricingWorksheetAiChatPanel } from "@/components/app/PricingWorksheetAiChatPanel";
import {
  PricingWorksheetCommercialMappingDrawer,
  PricingWorksheetVariationMappingDrawer,
} from "@/components/app/PricingWorksheetCommercialMappingDrawer";
import {
  PricingWorksheetMaterialLibraryDrawer,
  type PricingWorksheetMaterialTarget,
} from "@/components/app/PricingWorksheetMaterialLibraryDrawer";
import {
  PricingWorksheetMeasureDrawer,
  type PricingWorksheetMeasureInsertResult,
} from "@/components/app/PricingWorksheetMeasureDrawer";
import { WorkbookPagesTray } from "@/components/app/WorkbookPagesTray";
import { usePricingWorksheetOwner } from "@/components/app/PricingWorksheetOwnerProvider";
import {
  WorksheetPublishToPurchaseOrderDialog,
  type WorksheetPublishConfirmationLineDraft,
} from "@/components/app/WorksheetPublishToPurchaseOrderDialog";
import { WorksheetPublishToQuoteDialog } from "@/components/app/WorksheetPublishToQuoteDialog";
import {
  WorksheetPublishToVariationDialog,
  type WorksheetPublishToVariationLineDraft,
} from "@/components/app/WorksheetPublishToVariationDialog";
import type { CommercialLineDraft } from "@/components/app/WorksheetCommercialLineConfirmationEditor";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import {
  useWorksheetCommercialMapping,
  useWorksheetVariationCommercialMapping,
} from "@/hooks/use-worksheet-commercial-mapping";
import { useRouter } from "next/navigation";
import { useWorksheetFieldMapping } from "@/hooks/use-worksheet-field-mapping";
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
  PricingWorksheetTitleAutosaveController,
  normalizePricingWorksheetTitle,
  resolveWorksheetPersistenceName,
  shouldSynchronizeLoadedWorksheetTitle,
  type PricingWorksheetTitleAutosaveState,
  type PricingWorksheetTitleSaveResult,
} from "@/lib/opportunity-pricing-worksheet-title";
import { deriveWorksheetPricingSummary } from "@/lib/opportunity-pricing-worksheet-summary";
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
  buildWorksheetClientMutationId,
  buildWorksheetLearningArtifacts,
  buildPricingWorksheetAiEvidenceFeedbackData,
  buildPricingWorksheetAiReviewSignalData,
  buildPricingWorksheetIntelligenceEvent,
  enqueueWorksheetMutationEvidenceV2Outbox,
  listWorksheetChangedCellKeys,
  logPricingWorksheetIntelligenceFailure,
  stampWorksheetAiProvenance,
  summarizeWorksheetStructure,
  writePricingWorksheetCorrectionEvent,
  writePricingWorksheetIntelligenceEvents,
} from "@/lib/pricing-worksheet-intelligence";
import {
  recalculateWorksheetFormulas,
} from "@/lib/opportunity-pricing-worksheet-formulas";
import { applyWorksheetMutation } from "@/lib/opportunity-pricing-worksheet-mutations";
import {
  buildMaterialEstimatingRateWorksheetCell,
  buildMaterialPriceWorksheetCell,
  type PricingWorksheetMaterialPickerItem,
} from "@/lib/pricing-worksheet-material-picker";
import {
  type PricingWorksheetMeasureField,
  type PricingWorksheetMeasureSource,
} from "@/lib/pricing-worksheet-measure-picker";
import {
  applyPricingWorksheetMeasureMappings,
  buildPricingWorksheetMeasureConflictSignature,
  buildPricingWorksheetMeasureInsertConflicts,
  PRICING_WORKSHEET_MEASURE_MAPPING_FIELDS,
  validatePricingWorksheetMeasureMappings,
} from "@/lib/pricing-worksheet-measure-mapping";
import type { WorksheetFieldMappingOptions } from "@/lib/worksheet-cell-mapping";
import {
  buildMaterialPriceReviewOverlay,
  type MaterialPriceReviewBindingTarget,
  type MaterialPriceReviewGroup,
} from "@/lib/pricing-worksheet-material-price-review";
import { getWorksheetCellMaterialPricingProvenance } from "@/lib/worksheet-material-pricing-provenance";
import {
  buildWorksheetTsvFromRange,
  extendRangeFromAnchor,
  getWorksheetSelectionRange,
  moveCellKey,
  type WorksheetSelectionRange,
} from "@/lib/opportunity-pricing-worksheet-copy";
import {
  addWorksheetSelectionFromCellKeys,
  createEmptyWorksheetMultiSelectionState,
  findWorksheetSelectionRangeIndexForCellKey,
  findWorksheetSelectionRangeIndexForColumn,
  findWorksheetSelectionRangeIndexForRow,
  getActiveWorksheetSelectionArea,
  isColumnIndexSelected,
  isPositionInWorksheetSelectionArea,
  isRowIndexSelected,
  replaceWorksheetSelectionFromCellKeys,
  toggleWorksheetCellSelection,
  toggleWorksheetColumnSelection,
  toggleWorksheetRowSelection,
  type WorksheetMultiSelectionState,
  type WorksheetSelectionArea,
  type WorksheetSelectionKind,
} from "@/lib/opportunity-pricing-worksheet-multi-selection";
import {
  resolveWorksheetPendingRangeSelectionState,
  resolveWorksheetPointerDragState,
  resolveWorksheetRangeSelectionPointerState,
} from "@/lib/opportunity-pricing-worksheet-selection";
import {
  deriveWorksheetSelectionAggregate,
  type WorksheetSelectionAggregate,
} from "@/lib/opportunity-pricing-worksheet-selection-aggregate";
import {
  applyWorksheetPasteToCells,
  buildWorksheetCellKey,
  expandWorksheetToFitPaste,
  getWorksheetAnchorPosition,
  parseWorksheetCellKey,
  parseWorksheetClipboardText,
} from "@/lib/opportunity-pricing-worksheet-paste";
import { shiftFormulaForFill } from "@/lib/opportunity-pricing-worksheet-formula-shift";
import {
  buildPricingWorksheetFormulaPresentation,
  getWorksheetCaretIndexFromTextMetrics,
} from "@/lib/pricing-worksheet-formula-presentation";
import {
  applyWorksheetFormulaReferencePickTransaction,
  canHandleWorksheetNavigation,
  getApproximateWorksheetCaretIndex,
  getWorksheetFormulaReferencePickContext,
  getWorksheetCommitMovement,
  insertTextAtWorksheetSelection,
  shouldApplyWorksheetSaveSnapshot,
  shouldShowFormulaReferenceHighlights,
  type WorksheetTextSelection,
} from "@/lib/pricing-worksheet-interaction";
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
  type WorksheetNumberFormatKind,
  type WorksheetTextAlign,
  type WorksheetTextWrapMode,
  type WorksheetCellFormat,
  type WorksheetBorderMode,
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
import { mapPricingWorksheetUiErrorMessage } from "@/lib/pricing-worksheet-ui-errors";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";
import { buildPricingWorksheetAiContext } from "@/lib/pricing-worksheet-ai-context";
import type { PricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import {
  buildPricingWorksheetContinuationPreview,
  type PricingWorksheetAiFollowUpContext,
} from "@/lib/ai-pricing-worksheet-edit-assistant";
import {
  buildPricingWorksheetAiSuggestedEditSelectionResponse,
  simulatePricingWorksheetAiEditPlan,
  type PricingWorksheetAiAssistantResponse,
  type PricingWorksheetAiDiffSummary,
  type PricingWorksheetAiReviewFinding,
  type PricingWorksheetAiSuggestedEditGroup,
} from "@/lib/pricing-worksheet-edit-plan";
import { validateWorksheetBeforeSave } from "@/lib/opportunity-pricing-worksheet-save-validation";
import {
  buildOpportunityPricingWorkbookEditorRecord,
  createOpportunityPricingWorkbookSheet,
  deleteOpportunityPricingWorkbookSheet,
  loadOpportunityPricingWorkbook,
  renameOpportunityPricingWorkbookSheet,
  saveOpportunityPricingWorkbookActiveSheet,
  setOpportunityPricingWorkbookLastActiveSheet,
  type OpportunityPricingWorkbook,
  type OpportunityPricingWorkbookSheet,
} from "@/lib/opportunity-pricing-workbook";
import {
  flushPendingWorksheetLearningWrites,
  queuePendingWorksheetLearningWrite,
  type PendingWorksheetLearningWrite,
} from "@/lib/pricing-worksheet-learning-persistence";
import {
  purchaseOrderDestinationAdapter,
  resolvePurchaseOrderPublishOptions,
  type PurchaseOrderPublishOption,
  type PurchaseOrderPublishTarget,
} from "@/lib/commercial-items/purchase-order-destination-adapter";
import {
  quoteDestinationAdapter,
  resolveInitialQuotePublishTargetIds,
  resolveInitialQuotePublishTargetMode,
  resolveQuotePublishOptions,
  resolveQuotePublishTarget,
  type QuotePublishOption,
  type QuotePublishTarget,
} from "@/lib/commercial-items/quote-destination-adapter";
import {
  variationDestinationAdapter,
  type VariationPublishTarget,
} from "@/lib/commercial-items/variation-destination-adapter";
import { resolveWorksheetPurchaseOrderPublishContext } from "@/lib/commercial-items/worksheet-purchase-order-publish-context";
import { resolveWorksheetQuotePublishContext } from "@/lib/commercial-items/worksheet-quote-publish-context";
import { resolveWorksheetVariationPublishContext } from "@/lib/commercial-items/worksheet-variation-publish-context";
import {
  mapWorksheetPurchaseOrderPublishErrorMessage,
  mapWorksheetQuotePublishErrorMessage,
  mapWorksheetVariationPublishErrorMessage,
} from "@/lib/commercial-items/worksheet-publish-errors";
import { publishWorksheetSelection } from "@/lib/commercial-items/worksheet-publish";
import {
  buildPublishedWorksheetSelectionFromConfirmedLines,
  interpretWorksheetSelectionForPublish,
  type InterpretedWorksheetSelection,
} from "@/lib/commercial-items/worksheet-publish-v2";
import {
  buildExplicitMappedCommercialSelection,
  buildWorksheetStructureKey,
  combineExplicitMappedCommercialSelections,
  getWorksheetCommercialFieldSource,
  resolveWorksheetCommercialMapping,
  type CommercialMappingField,
} from "@/lib/commercial-items/worksheet-commercial-mapping";
import {
  normalizeCommercialMoney,
  normalizeCommercialQuantity,
  normalizeCommercialRate,
} from "@/lib/commercial-items/precision";

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
  workbookId?: string | null;
  worksheetId?: string | null;
  sheetId: string | null;
  sheetName: string;
  lifecycleState: string;
  validationStatus: string;
  preview: {
    worksheet: WorksheetData;
    compactOutput: PricingWorksheetAiPreviewSummary;
    matchedMemory: PricingWorksheetAiMatchedMemory | null;
    validationIssues?: Array<{
      severity: "info" | "warning" | "error" | "critical";
      message: string;
    }>;
    validationWarnings: PricingWorksheetAiValidationWarning[];
    contextSummary: PricingWorksheetAiContextSummary;
    classification?: PricingWorksheetConstructionIntent;
    continuation?: PricingWorksheetAiPreviewContinuation | null;
    assistant?: PricingWorksheetAiPreviewAssistant | null;
    generationMeta?: {
      provider: string;
      model: string;
      fallbackUsed: boolean;
      fallbackReason: string | null;
    };
  };
};

function getBlockingAiPreviewIssue(preview: PricingWorksheetAiPreviewResponse["preview"] | null | undefined) {
  return preview?.validationIssues?.find((issue) => issue.severity === "error" || issue.severity === "critical") ?? null;
}

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

type WorksheetPageDialogState =
  | {
      type: "rename";
      sheetId: string;
      value: string;
    }
  | {
      type: "delete";
      sheetId: string;
    }
  | null;

type QuotePublishDialogState = {
  projectId: string | null;
  range: WorksheetSelectionRange;
  selectionRanges: WorksheetSelectionRange[];
  interpretedSelection: InterpretedWorksheetSelection;
  lines: CommercialLineDraft[];
  quotes: QuotePublishOption[];
};

type PurchaseOrderPublishDialogState = {
  context: {
    projectId: string;
    projectSlug: string | null;
  };
  range: WorksheetSelectionRange;
  selectionRanges: WorksheetSelectionRange[];
  interpretedSelection: InterpretedWorksheetSelection;
  lines: WorksheetPublishConfirmationLineDraft[];
  suppliers: Array<{ id: string; label: string }>;
  draftPurchaseOrders: PurchaseOrderPublishOption[];
};

type CommercialMappingPublishContext =
  | {
      destination: "quote";
      projectId: string | null;
      quotes: QuotePublishOption[];
    }
  | {
      destination: "purchase_order";
      projectId: string;
      projectSlug: string | null;
      suppliers: Array<{ id: string; label: string }>;
      draftPurchaseOrders: PurchaseOrderPublishOption[];
    };

type VariationCommercialMappingContext = {
  opportunityId: string;
  projectId: string;
  projectSlug: string | null;
  variationId: string;
  variationNumber: string;
  variationTitle: string;
  variationStatus: string;
};

type VariationPublishDialogState = {
  context: {
    opportunityId: string;
    projectId: string;
    projectSlug: string | null;
    variationId: string;
    variationNumber: string;
    variationTitle: string;
    variationStatus: string;
  };
  range: WorksheetSelectionRange;
  selectionRanges: WorksheetSelectionRange[];
  interpretedSelection: InterpretedWorksheetSelection;
  lines: WorksheetPublishToVariationLineDraft[];
};

type PricingWorksheetAiJobResponse = {
  jobId: string;
  aiInteractionId: string;
  workbookId?: string | null;
  worksheetId?: string | null;
  sheetId?: string | null;
  sheetName?: string | null;
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

type WorksheetSidePanelType = "materials" | "measures" | null;

const MEASURE_MAPPING_OPTIONS: WorksheetFieldMappingOptions<PricingWorksheetMeasureField> = {
  fields: PRICING_WORKSHEET_MEASURE_MAPPING_FIELDS,
  fieldLabel: (field) => field === "description" ? "Description" : field === "quantity" ? "Quantity" : "Unit",
  validateAssignment: ({ field, cellKey, session }) => {
    const duplicateField = PRICING_WORKSHEET_MEASURE_MAPPING_FIELDS.find(
      (candidate) => candidate !== field && session.mappings[candidate]?.cellKey === cellKey,
    );
    if (!duplicateField) return null;
    const duplicateLabel = duplicateField === "description" ? "Description" : duplicateField === "quantity" ? "Quantity" : "Unit";
    const fieldName = field === "description" ? "Description" : field === "quantity" ? "Quantity" : "Unit";
    return `${cellKey} is already mapped to ${duplicateLabel}. Select another cell for ${fieldName}.`;
  },
};

const CELL_INPUT_CLASS =
  "relative z-20 block h-full w-full min-w-0 appearance-none rounded-none border-0 bg-transparent px-2.5 py-1.5 text-sm leading-5 text-[var(--text-primary)] shadow-none outline-none placeholder:text-[var(--text-muted)]";
const WORKSHEET_HISTORY_LIMIT = 50;
const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 640;
const MIN_ROW_HEIGHT = 28;
const MAX_ROW_HEIGHT = 240;
const WORKSHEET_ROW_GUTTER_WIDTH = 64;
const WORKSHEET_ROW_OVERSCAN = 6;
const WORKSHEET_COLUMN_OVERSCAN = 2;
const WORKSHEET_VIEWPORT_FALLBACK_HEIGHT = 720;

function formatWorksheetPublishDraftValue(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" ? value : "";
}

function parseWorksheetPublishDraftNumber(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWorksheetPublishDraftText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeVariationPublishSection(
  sectionHint: string | null | undefined,
): WorksheetPublishToVariationLineDraft["section"] {
  const normalized = sectionHint?.trim().toLowerCase() ?? "";

  if (normalized.includes("material")) {
    return "Materials";
  }

  if (normalized.includes("subcontract")) {
    return "Subcontractors";
  }

  if (normalized.includes("plant")) {
    return "Plant";
  }

  if (normalized.includes("margin")) {
    return "Margin";
  }

  return "Labour";
}
const WORKSHEET_VIEWPORT_FALLBACK_WIDTH = 1120;
const WORKSHEET_ZOOM_LEVELS = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;
const DEFAULT_WORKSHEET_FONT_SIZE = 14;
const MIN_WORKSHEET_FONT_SIZE = 6;
const MAX_WORKSHEET_FONT_SIZE = 96;
const FILL_SWATCHES = [
  // light / pastel row — slate, blue, green, orange, violet
  "#F1F5F9",
  "#DBEAFE",
  "#DCFCE7",
  "#FFEDD5",
  "#EDE9FE",
  // medium row
  "#CBD5E1",
  "#93C5FD",
  "#86EFAC",
  "#FDBA74",
  "#C4B5FD",
  // strong row
  "#64748B",
  "#3B82F6",
  "#22C55E",
  "#F97316",
  "#8B5CF6",
];
const TEXT_COLOR_PALETTE = [
  // light / pastel row — slate, blue, green, orange, violet
  "#94A3B8",
  "#60A5FA",
  "#34D399",
  "#FB923C",
  "#A78BFA",
  // mid row
  "#475569",
  "#2563EB",
  "#059669",
  "#EA580C",
  "#7C3AED",
  // dark row
  "#0F172A",
  "#1E3A8A",
  "#065F46",
  "#C2410C",
  "#5B21B6",
];
const FORMULA_REFERENCE_HIGHLIGHT_STYLES = [
  {
    outlineColor: "rgb(59 130 246 / 0.95)",
    tokenColor: "rgb(37 99 235)",
  },
  {
    outlineColor: "rgb(147 51 234 / 0.95)",
    tokenColor: "rgb(126 34 206)",
  },
  {
    outlineColor: "rgb(34 197 94 / 0.95)",
    tokenColor: "rgb(22 163 74)",
  },
  {
    outlineColor: "rgb(249 115 22 / 0.95)",
    tokenColor: "rgb(234 88 12)",
  },
  {
    outlineColor: "rgb(236 72 153 / 0.95)",
    tokenColor: "rgb(219 39 119)",
  },
  {
    outlineColor: "rgb(13 148 136 / 0.95)",
    tokenColor: "rgb(13 148 136)",
  },
] as const;
const EMPTY_FORMULA_REFERENCE_HIGHLIGHTS = new Map<string, { colorIndex: number }>();
const EMPTY_FORMULA_REFERENCE_RANGES: FormulaReferenceRangeHighlight[] = [];
const WORKSHEET_CELL_HORIZONTAL_PADDING = 20;
const WORKSHEET_CELL_VERTICAL_PADDING = 12;
const WORKSHEET_CELL_FONT_SIZE = 14;
const WORKSHEET_CELL_LINE_HEIGHT = 20;
const SELECTION_OUTLINE_COLOR = "rgb(37 99 235)";
const SECONDARY_SELECTION_OUTLINE_COLOR = "rgb(96 165 250)";
const FILL_PREVIEW_OUTLINE_COLOR = "rgb(59 130 246)";
const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] satisfies Array<{ value: WorksheetTextAlign; label: string }>;
const MAX_NUMBER_DECIMAL_PLACES = 6;

function cloneWorksheetData(worksheet: WorksheetData) {
  return JSON.parse(JSON.stringify(worksheet)) as WorksheetData;
}

function cloneWorksheetSelectionRange(range: WorksheetSelectionRange | null) {
  return range
    ? {
        startRowIndex: range.startRowIndex,
        endRowIndex: range.endRowIndex,
        startColumnIndex: range.startColumnIndex,
        endColumnIndex: range.endColumnIndex,
      }
    : null;
}

function cloneWorksheetSelectionRanges(ranges: WorksheetSelectionRange[]) {
  return ranges.map((range) => ({
    startRowIndex: range.startRowIndex,
    endRowIndex: range.endRowIndex,
    startColumnIndex: range.startColumnIndex,
    endColumnIndex: range.endColumnIndex,
  }));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clampWorksheetZoom(nextZoom: number) {
  const minZoom = WORKSHEET_ZOOM_LEVELS[0];
  const maxZoom = WORKSHEET_ZOOM_LEVELS[WORKSHEET_ZOOM_LEVELS.length - 1];
  return Math.min(maxZoom, Math.max(minZoom, nextZoom));
}

function normalizeHexColorInput(value: string) {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;

  if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    return `#${hex.split("").map((character) => `${character}${character}`).join("")}`.toUpperCase();
  }

  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return `#${hex}`.toUpperCase();
  }

  return null;
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
  workbookId: string | null;
  sheetId: string | null;
  sheetName: string;
  worksheetName: string;
  tradePackage: string | null;
}): Record<string, Json> & { acceptedFindingIds?: string[]; rejectedFindingIds?: string[] } {
  return {
    ...params.preview.compactOutput,
    workbookId: params.workbookId,
    worksheetId: params.workbookId,
    sheetId: params.sheetId,
    sheetName: params.sheetName,
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
    continuation: params.preview.continuation
      ? {
          currentBatchIndex: params.preview.continuation.currentBatchIndex,
          totalBatchCount: params.preview.continuation.totalBatchCount,
          remainingBatchCount: params.preview.continuation.remainingBatchCount,
        }
      : null,
  };
}

function logWorksheetAiContinuation(action: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[pricing-worksheet-ai-continuation]", {
    action,
    ...payload,
  });
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

type WorksheetBorderEdge = "top" | "right" | "bottom" | "left" | "hMid" | "vMid";

const BORDER_MODE_EDGES: Record<
  Exclude<WorksheetBorderMode, "clear">,
  WorksheetBorderEdge[]
> = {
  all: ["top", "right", "bottom", "left", "hMid", "vMid"],
  outer: ["top", "right", "bottom", "left"],
  inner: ["hMid", "vMid"],
  horizontal: ["hMid"],
  vertical: ["vMid"],
  top: ["top"],
  bottom: ["bottom"],
  left: ["left"],
  right: ["right"],
};

function BorderModeIcon({ mode }: { mode: Exclude<WorksheetBorderMode, "clear"> }) {
  const active = new Set(BORDER_MODE_EDGES[mode]);
  const edgeColor = (edge: WorksheetBorderEdge) =>
    active.has(edge) ? "var(--text-primary)" : "#E2E8F0";
  return (
    <span aria-hidden="true" className="relative block h-[18px] w-[18px]">
      <span className="absolute left-0 right-0 top-0 h-[1.5px] rounded-full" style={{ backgroundColor: edgeColor("top") }} />
      <span className="absolute bottom-0 left-0 right-0 h-[1.5px] rounded-full" style={{ backgroundColor: edgeColor("bottom") }} />
      <span className="absolute bottom-0 left-0 top-0 w-[1.5px] rounded-full" style={{ backgroundColor: edgeColor("left") }} />
      <span className="absolute bottom-0 right-0 top-0 w-[1.5px] rounded-full" style={{ backgroundColor: edgeColor("right") }} />
      <span className="absolute left-0 right-0 top-1/2 h-[1.5px] -translate-y-1/2 rounded-full" style={{ backgroundColor: edgeColor("hMid") }} />
      <span className="absolute bottom-0 left-1/2 top-0 w-[1.5px] -translate-x-1/2 rounded-full" style={{ backgroundColor: edgeColor("vMid") }} />
    </span>
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

function focusElementWithoutScroll(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function useStableWorksheetEvent<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult
) {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
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

export const PricingWorksheetFormulaTextLayer = memo(function PricingWorksheetFormulaTextLayer({
  value,
  className,
  measureRef,
  style,
}: {
  value: string;
  className: string;
  measureRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}) {
  const presentation = useMemo(
    () => buildPricingWorksheetFormulaPresentation(value),
    [value],
  );

  return (
    <div aria-hidden="true" className={className} ref={measureRef} style={style}>
      {presentation.segments.map((segment, index) => {
        const referenceStyle = segment.colorIndex === null
          ? null
          : FORMULA_REFERENCE_HIGHLIGHT_STYLES[
              segment.colorIndex % FORMULA_REFERENCE_HIGHLIGHT_STYLES.length
            ];
        return (
          <span
            key={`${index}:${segment.normalizedRef ?? "plain"}`}
            data-formula-token-color={segment.colorIndex ?? undefined}
            style={{ color: referenceStyle?.tokenColor }}
          >
            {segment.text}
          </span>
        );
      })}
    </div>
  );
});

export function getPricingWorksheetFittedFormulaFontSize(
  baseFontSize: number,
  availableWidth: number,
  contentWidth: number,
): number {
  if (contentWidth <= 0 || contentWidth <= availableWidth) {
    return baseFontSize;
  }

  return Math.max(
    1,
    Math.floor((baseFontSize * Math.max(availableWidth, 1) / contentWidth) * 100) / 100,
  );
}

export const PricingWorksheetSelectionSum = memo(function PricingWorksheetSelectionSum({
  aggregate,
}: {
  aggregate: WorksheetSelectionAggregate | null;
}) {
  if (!aggregate) {
    return null;
  }

  return (
    <output
      aria-label={`Selection sum ${aggregate.displayValue}`}
      aria-live="polite"
      data-testid="pricing-worksheet-selection-sum"
      className="pointer-events-none absolute right-4 bottom-4 z-20 inline-flex h-10 w-max items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border)] bg-white px-3.5 text-center text-[12px] font-medium text-[var(--text-secondary)] shadow-[0_10px_28px_rgba(15,23,42,0.14)]"
      style={{ maxWidth: "min(22rem, calc(100% - 2rem))" }}
      title={`Sum: ${aggregate.displayValue}`}
    >
      <span className="inline-flex min-w-0 max-w-full items-baseline whitespace-nowrap leading-none">
        <span className="shrink-0">Sum:&nbsp;</span>
        <span className="min-w-0 truncate font-semibold tabular-nums text-[var(--text-primary)]">
          {aggregate.displayValue}
        </span>
      </span>
    </output>
  );
});

type WorksheetCellViewProps = {
  activeSelectedRange: WorksheetSelectionRange | null;
  activeCellKey: string | null;
  activeEditor: "cell" | "formulaBar" | null;
  canWriteWorksheet: boolean;
  commercialMappingHighlight?: boolean;
  cell: WorksheetCell | undefined;
  cellKey: string;
  columnIndex: number;
  editingCellValue: string;
  fillPreviewRange: WorksheetSelectionRange | null;
  formulaReferenceHighlight: { colorIndex: number } | null;
  formulaReferenceRanges: FormulaReferenceRangeHighlight[];
  rowHeight: number;
  rowIndex: number;
  selectedRanges: WorksheetSelectionArea[];
  showCommercialMappingDragHandle?: boolean;
  onBeginCellEdit: (
    cellKey: string,
    cell: WorksheetCell | undefined,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => void;
  onBeginFillDrag: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onCellClick: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellContextMenu: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellMouseDown: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellMouseEnter: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCommercialMappingDragStart?: (cellKey: string, event: ReactDragEvent<HTMLButtonElement>) => void;
  onInputBlur: (cellKey: string) => void;
  onInputChange: (value: string, selection: WorksheetTextSelection) => void;
  onInputKeyDown: (cellKey: string, event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onInputSelect: (event: ReactSyntheticEvent<HTMLInputElement>) => void;
  setInputRef: (cellKey: string, node: HTMLInputElement | null) => void;
};

export const WorksheetCellView = memo(function WorksheetCellView({
  activeSelectedRange,
  activeCellKey,
  activeEditor,
  canWriteWorksheet,
  commercialMappingHighlight = false,
  cell,
  cellKey,
  columnIndex,
  editingCellValue,
  fillPreviewRange,
  formulaReferenceHighlight,
  formulaReferenceRanges,
  rowHeight,
  rowIndex,
  selectedRanges,
  showCommercialMappingDragHandle = false,
  onBeginCellEdit,
  onBeginFillDrag,
  onCellClick,
  onCellContextMenu,
  onCellMouseDown,
  onCellMouseEnter,
  onCommercialMappingDragStart,
  onInputBlur,
  onInputChange,
  onInputKeyDown,
  onInputSelect,
  setInputRef,
}: WorksheetCellViewProps) {
  const cellFormat = getCellFormat(cell);
  const isEditing = activeCellKey === cellKey && activeEditor === "cell";
  const inputValue = isEditing ? editingCellValue : getFormattedCellDisplayValue(cell);
  const isEditingFormula = isEditing && inputValue.trimStart().startsWith("=");
  const baseEditorFontSize = cellFormat.text?.fontSize ?? 14;
  const formulaTextLayerRef = useRef<HTMLDivElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!isEditingFormula) {
      return;
    }

    const formulaLayer = formulaTextLayerRef.current;
    const formulaInput = formulaInputRef.current;
    if (!formulaLayer || !formulaInput) {
      return;
    }

    const fitFormulaToCell = () => {
      formulaLayer.style.fontSize = `${baseEditorFontSize}px`;
      const computedStyle = window.getComputedStyle(formulaLayer);
      const horizontalPadding =
        Number.parseFloat(computedStyle.paddingLeft) + Number.parseFloat(computedStyle.paddingRight);
      const availableWidth = Math.max(formulaLayer.clientWidth - horizontalPadding, 1);
      const contentWidth = Math.max(formulaLayer.scrollWidth - horizontalPadding, 1);
      const nextFontSize = getPricingWorksheetFittedFormulaFontSize(
        baseEditorFontSize,
        availableWidth,
        contentWidth,
      );
      formulaLayer.style.fontSize = `${nextFontSize}px`;
      formulaInput.style.fontSize = `${nextFontSize}px`;
    };

    fitFormulaToCell();
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(fitFormulaToCell);
    resizeObserver.observe(formulaLayer);
    return () => resizeObserver.disconnect();
  }, [baseEditorFontSize, inputValue, isEditingFormula]);
  const selectionEdgeFlags = selectedRanges
    .map((range) => ({
      range,
      edgeFlags: getRangeEdgeFlagsByIndex(rowIndex, columnIndex, range),
    }))
    .filter((entry) => entry.edgeFlags.isInRange);
  const activeSelectionEdgeFlags = getRangeEdgeFlagsByIndex(rowIndex, columnIndex, activeSelectedRange);
  const fillPreviewEdgeFlags = getRangeEdgeFlagsByIndex(rowIndex, columnIndex, fillPreviewRange);
  const selectionShadows = selectionEdgeFlags.map(({ range, edgeFlags }) =>
    buildSelectionShadow(
      edgeFlags,
      activeSelectedRange === range
        ? SELECTION_OUTLINE_COLOR
        : SECONDARY_SELECTION_OUTLINE_COLOR,
    ),
  ).filter(Boolean);
  const fillPreviewShadow = fillPreviewEdgeFlags.isInRange
    ? buildSelectionShadow(fillPreviewEdgeFlags, FILL_PREVIEW_OUTLINE_COLOR)
    : undefined;
  const formatBorderShadow = buildFormattedBorderShadow(cellFormat);
  const formulaReferenceStyle = formulaReferenceHighlight
    ? FORMULA_REFERENCE_HIGHLIGHT_STYLES[
        formulaReferenceHighlight.colorIndex % FORMULA_REFERENCE_HIGHLIGHT_STYLES.length
      ]
    : null;
  const formulaReferenceRangeDecorations: Array<{
    colorIndex: number;
    edgeFlags: ReturnType<typeof getRangeEdgeFlagsByIndex>;
    outlineColor: string;
  }> = [];
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
    formulaReferenceRangeDecorations.push({
      colorIndex: range.colorIndex,
      edgeFlags: rangeEdgeFlags,
      outlineColor: rangeStyle.outlineColor,
    });
  }
  const isSelectedRangeCorner =
    canWriteWorksheet &&
    Boolean(activeSelectedRange) &&
    activeSelectionEdgeFlags.isBottomEdge &&
    activeSelectionEdgeFlags.isRightEdge &&
    !activeCellKey;
  const cellTextAlign = cellFormat.text?.align ?? "left";
  const cellFillColor = (!isEditing && selectionEdgeFlags.length > 0) || fillPreviewEdgeFlags.isInRange
    ? undefined
    : cellFormat.fill?.color;
  const formulaReferenceColorIndex = formulaReferenceHighlight?.colorIndex
    ?? formulaReferenceRangeDecorations[0]?.colorIndex;
  const formulaEditorStyle: CSSProperties = {
    textAlign: cellTextAlign,
    fontWeight: cellFormat.text?.bold ? 700 : undefined,
    fontStyle: cellFormat.text?.italic ? "italic" : undefined,
    textDecoration:
      [
        cellFormat.text?.underline ? "underline" : null,
        cellFormat.text?.strikethrough ? "line-through" : null,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    fontSize: isEditingFormula
      ? `${baseEditorFontSize}px`
      : cellFormat.text?.fontSize
        ? `${cellFormat.text.fontSize}px`
        : undefined,
  };

  return (
    <div
      id={`worksheet-cell-${cellKey}`}
      role="gridcell"
      aria-selected={selectionEdgeFlags.length > 0}
      data-worksheet-cell={cellKey}
      data-editing={isEditing ? "true" : "false"}
      data-formula-reference={
        formulaReferenceHighlight || formulaReferenceRangeDecorations.length > 0 ? "true" : "false"
      }
      data-formula-reference-color={formulaReferenceColorIndex}
      className={`relative border-r border-[var(--border-subtle)] last:border-r-0 ${
        selectionEdgeFlags.length > 0 && !isEditing
          ? "bg-[rgba(49,91,255,0.07)]"
          : fillPreviewEdgeFlags.isInRange
            ? "bg-[rgba(244,93,34,0.08)]"
            : ""
      }`}
      style={{
        backgroundColor: cellFillColor,
        height: `${rowHeight}px`,
        boxShadow: [
          fillPreviewShadow,
          ...(isEditing ? [] : selectionShadows),
          formatBorderShadow,
        ].filter(Boolean).join(", ") || undefined,
      }}
      onMouseDown={(event) => onCellMouseDown(cellKey, event)}
      onContextMenu={(event) => onCellContextMenu(cellKey, event)}
      onMouseEnter={(event) => onCellMouseEnter(cellKey, event)}
      onDoubleClick={isEditing ? undefined : (event) => onBeginCellEdit(cellKey, cell, event)}
    >
      {formulaReferenceStyle && !isEditing ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 border-[1.5px] border-dashed"
          style={{ borderColor: formulaReferenceStyle.outlineColor }}
        />
      ) : null}
      {commercialMappingHighlight && !isEditing ? (
        <div aria-hidden="true" data-commercial-mapping-highlight="true" className="pointer-events-none absolute inset-0 z-10 border-2 border-[var(--orange-primary)] bg-[color-mix(in_srgb,var(--orange-primary)_10%,transparent)]" />
      ) : null}
      {formulaReferenceRangeDecorations.map(({ colorIndex, edgeFlags, outlineColor }) => (
        <div
          key={`${colorIndex}:${outlineColor}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            borderTop: edgeFlags.isTopEdge ? `1.5px dashed ${outlineColor}` : undefined,
            borderRight: edgeFlags.isRightEdge ? `1.5px dashed ${outlineColor}` : undefined,
            borderBottom: edgeFlags.isBottomEdge ? `1.5px dashed ${outlineColor}` : undefined,
            borderLeft: edgeFlags.isLeftEdge ? `1.5px dashed ${outlineColor}` : undefined,
          }}
        />
      ))}
      {isEditing ? (
        <div
          aria-hidden="true"
          data-formula-edit-outline="true"
          className="pointer-events-none absolute inset-0 z-30 shadow-[inset_0_0_0_2px_var(--brand-blue)]"
        />
      ) : null}
      {isEditing ? (
        <>
          {isEditingFormula ? (
            <PricingWorksheetFormulaTextLayer
              value={inputValue}
              className="pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre px-2.5 py-1.5 text-sm leading-5 text-[var(--text-primary)]"
              measureRef={formulaTextLayerRef}
              style={formulaEditorStyle}
            />
          ) : null}
          <input
            ref={(node) => {
              formulaInputRef.current = node;
              setInputRef(cellKey, node);
            }}
            type="text"
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value, {
              start: event.currentTarget.selectionStart ?? event.currentTarget.value.length,
              end: event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
            })}
            onBlur={() => onInputBlur(cellKey)}
            onKeyDown={(event) => onInputKeyDown(cellKey, event)}
            onSelect={onInputSelect}
            data-inline-worksheet-editor="true"
            className={CELL_INPUT_CLASS}
            style={{
              ...formulaEditorStyle,
              height: `${rowHeight}px`,
              color: isEditingFormula
                ? "transparent"
                : cellFormat.text?.color,
              caretColor: cellFormat.text?.color ?? "var(--text-primary)",
            }}
            placeholder=""
            disabled={!canWriteWorksheet}
            inputMode={cell?.type === "number" ? "decimal" : undefined}
          />
        </>
      ) : (
        <div
          className="flex h-full min-w-0 items-start px-2.5 py-1.5 text-sm text-[var(--text-primary)]"
          style={{
            justifyContent: "stretch",
          }}
          onClick={(event) => onCellClick(cellKey, event)}
        >
          <div
            data-worksheet-cell-display-text="true"
            className={`min-w-0 w-full leading-5 ${
              cellFormat.text?.wrap === "clip"
                ? "overflow-hidden whitespace-nowrap"
                : cellFormat.text?.wrap === "overflow"
                  ? "whitespace-nowrap"
                  : "whitespace-pre-wrap break-words"
            }`}
            style={{
              fontWeight: cellFormat.text?.bold ? 700 : undefined,
              fontStyle: cellFormat.text?.italic ? "italic" : undefined,
              textDecoration:
                [
                  cellFormat.text?.underline ? "underline" : null,
                  cellFormat.text?.strikethrough ? "line-through" : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined,
              fontSize: cellFormat.text?.fontSize ? `${cellFormat.text.fontSize}px` : undefined,
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
          className="absolute bottom-0.5 right-0.5 z-20 h-2.5 w-2.5 rounded-full border border-white bg-[var(--brand-blue)] shadow-[0_1px_2px_rgba(15,23,42,0.2)]"
          onMouseDown={onBeginFillDrag}
        />
      ) : null}
      {showCommercialMappingDragHandle && !isEditing ? (
        <button
          type="button"
          draggable
          aria-label={`Drag worksheet cell ${cellKey} to a commercial mapping field`}
          title="Drag to a mapping field"
          className="absolute right-1 top-1 z-30 hidden h-5 w-5 cursor-grab items-center justify-center rounded-full border border-white bg-[var(--orange-primary)] text-[10px] font-bold text-white shadow-sm md:flex"
          onMouseDown={(event) => event.stopPropagation()}
          onDragStart={(event) => onCommercialMappingDragStart?.(cellKey, event)}
        >
          ↗
        </button>
      ) : null}
    </div>
  );
});

type WorksheetRowViewProps = {
  activeSelectedRange: WorksheetSelectionRange | null;
  activeCellKey: string | null;
  activeEditor: "cell" | "formulaBar" | null;
  canWriteWorksheet: boolean;
  commercialMappingHighlightCellKeys: Set<string>;
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
  selectedRanges: WorksheetSelectionArea[];
  commercialMappingDragCellKey: string | null;
  visibleColumnStartIndex: number;
  visibleColumns: WorksheetColumn[];
  onBeginCellEdit: (
    cellKey: string,
    cell: WorksheetCell | undefined,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => void;
  onBeginFillDrag: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onAutoFitRow: (event: ReactMouseEvent<HTMLButtonElement>, rowId: string) => void;
  onBeginRowResize: (event: ReactMouseEvent<HTMLButtonElement>, rowId: string, height: number) => void;
  onCellClick: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellContextMenu: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellMouseDown: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCellMouseEnter: (cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCommercialMappingDragStart: (cellKey: string, event: ReactDragEvent<HTMLButtonElement>) => void;
  onInputBlur: (cellKey: string) => void;
  onInputChange: (value: string, selection: WorksheetTextSelection) => void;
  onInputKeyDown: (cellKey: string, event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onInputSelect: (event: ReactSyntheticEvent<HTMLInputElement>) => void;
  onRowClick: (event: ReactMouseEvent<HTMLDivElement>, rowIndex: number) => void;
  onRowContextMenu: (event: ReactMouseEvent<HTMLDivElement>, rowIndex: number) => void;
  setInputRef: (cellKey: string, node: HTMLInputElement | null) => void;
};

const WorksheetRowView = memo(function WorksheetRowView({
  activeSelectedRange,
  activeCellKey,
  activeEditor,
  canWriteWorksheet,
  commercialMappingHighlightCellKeys,
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
  selectedRanges,
  commercialMappingDragCellKey,
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
  onCommercialMappingDragStart,
  onInputBlur,
  onInputChange,
  onInputKeyDown,
  onInputSelect,
  onRowClick,
  onRowContextMenu,
  setInputRef,
}: WorksheetRowViewProps) {
  const isRowSelected = isRowIndexSelected(selectedRanges, rowIndex);
  return (
    <div
      role="row"
      className="grid border-b border-[var(--border-subtle)] last:border-b-0"
      style={{
        gridTemplateColumns,
        minHeight: `${row.height}px`,
      }}
    >
      <div
        role="rowheader"
        className={`relative sticky left-0 z-10 border-r border-[var(--border)] px-3 py-1.5 text-[11px] font-medium ${
          isRowSelected
            ? "bg-[rgba(49,91,255,0.12)] text-[var(--brand-blue)]"
            : "bg-[linear-gradient(180deg,#F8FAFD_0%,#F2F6FB_100%)] text-[var(--text-secondary)]"
        }`}
        style={{ height: `${row.height}px` }}
        onClick={(event) => onRowClick(event, rowIndex)}
        onContextMenu={(event) => onRowContextMenu(event, rowIndex)}
      >
        {row.id}
        <button
          type="button"
          aria-label={`Resize row ${row.id}`}
          disabled={!canWriteWorksheet}
          className={`absolute bottom-0 left-0 h-2 w-full translate-y-1/2 ${canWriteWorksheet ? "cursor-row-resize" : "cursor-default"}`}
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
        className="border-r border-[var(--border-subtle)] bg-white"
        style={{ height: `${row.height}px`, width: `${leftSpacerWidth}px` }}
      />
      {visibleColumns.map((column, columnOffset) => {
        const cellKey = buildWorksheetCellKey(column.id, row.id);
        const cell = rowCells[columnOffset];
        return (
          <WorksheetCellView
            key={cellKey}
            activeSelectedRange={activeSelectedRange}
            activeCellKey={activeCellKey}
            activeEditor={activeEditor}
            canWriteWorksheet={canWriteWorksheet}
            commercialMappingHighlight={commercialMappingHighlightCellKeys.has(cellKey)}
            cell={cell}
            cellKey={cellKey}
            columnIndex={visibleColumnStartIndex + columnOffset}
            editingCellValue={editingCellValue}
            fillPreviewRange={fillPreviewRange}
            formulaReferenceHighlight={formulaReferenceHighlightByCellKey.get(cellKey) ?? null}
            formulaReferenceRanges={formulaReferenceRanges}
            rowHeight={row.height}
            rowIndex={rowIndex}
            selectedRanges={selectedRanges}
            showCommercialMappingDragHandle={commercialMappingDragCellKey === cellKey}
            onBeginCellEdit={onBeginCellEdit}
            onBeginFillDrag={onBeginFillDrag}
            onCellClick={onCellClick}
            onCellContextMenu={onCellContextMenu}
            onCellMouseDown={onCellMouseDown}
            onCellMouseEnter={onCellMouseEnter}
            onCommercialMappingDragStart={onCommercialMappingDragStart}
            onInputBlur={onInputBlur}
            onInputChange={onInputChange}
            onInputKeyDown={onInputKeyDown}
            onInputSelect={onInputSelect}
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
  const previousActiveRowId = previousProps.activeCellKey
    ? parseWorksheetCellKey(previousProps.activeCellKey)?.rowId
    : null;
  const nextActiveRowId = nextProps.activeCellKey
    ? parseWorksheetCellKey(nextProps.activeCellKey)?.rowId
    : null;
  const isEditorRelevant = previousActiveRowId === previousProps.row.id || nextActiveRowId === nextProps.row.id;
  if (
    isEditorRelevant &&
    (previousProps.activeCellKey !== nextProps.activeCellKey ||
      previousProps.activeEditor !== nextProps.activeEditor ||
      previousProps.editingCellValue !== nextProps.editingCellValue)
  ) {
    return false;
  }

  const buildRangeSignature = (
    ranges: Array<WorksheetSelectionRange & { kind?: string }>,
    rowIndex: number,
  ) => ranges
    .filter((range) => rowIndex >= range.startRowIndex && rowIndex <= range.endRowIndex)
    .map((range) => [
      range.kind ?? "cells",
      range.startColumnIndex,
      range.endColumnIndex,
      rowIndex === range.startRowIndex,
      rowIndex === range.endRowIndex,
    ].join(":"))
    .join("|");
  const previousSelectionSignature = buildRangeSignature(previousProps.selectedRanges, previousProps.rowIndex);
  const nextSelectionSignature = buildRangeSignature(nextProps.selectedRanges, nextProps.rowIndex);
  const previousActiveSignature = previousProps.activeSelectedRange
    ? buildRangeSignature([previousProps.activeSelectedRange], previousProps.rowIndex)
    : "";
  const nextActiveSignature = nextProps.activeSelectedRange
    ? buildRangeSignature([nextProps.activeSelectedRange], nextProps.rowIndex)
    : "";
  const previousFillSignature = previousProps.fillPreviewRange
    ? buildRangeSignature([previousProps.fillPreviewRange], previousProps.rowIndex)
    : "";
  const nextFillSignature = nextProps.fillPreviewRange
    ? buildRangeSignature([nextProps.fillPreviewRange], nextProps.rowIndex)
    : "";
  const buildFormulaRangeSignature = (ranges: FormulaReferenceRangeHighlight[], rowIndex: number) => ranges
    .filter((range) => rowIndex >= range.startRowIndex && rowIndex <= range.endRowIndex)
    .map((range) => [
      range.startColumnIndex,
      range.endColumnIndex,
      range.colorIndex,
      rowIndex === range.startRowIndex,
      rowIndex === range.endRowIndex,
    ].join(":"))
    .join("|");
  const previousFormulaRangeSignature = buildFormulaRangeSignature(
    previousProps.formulaReferenceRanges,
    previousProps.rowIndex,
  );
  const nextFormulaRangeSignature = buildFormulaRangeSignature(
    nextProps.formulaReferenceRanges,
    nextProps.rowIndex,
  );
  const buildDirectFormulaSignature = (props: WorksheetRowViewProps) => props.visibleColumns
    .map((column) => props.formulaReferenceHighlightByCellKey.get(
      buildWorksheetCellKey(column.id, props.row.id),
    )?.colorIndex ?? "")
    .join(":");

  if (
    previousProps.canWriteWorksheet !== nextProps.canWriteWorksheet ||
    previousProps.commercialMappingDragCellKey !== nextProps.commercialMappingDragCellKey ||
    previousProps.commercialMappingHighlightCellKeys !== nextProps.commercialMappingHighlightCellKeys ||
    previousFillSignature !== nextFillSignature ||
    previousFormulaRangeSignature !== nextFormulaRangeSignature ||
    buildDirectFormulaSignature(previousProps) !== buildDirectFormulaSignature(nextProps) ||
    previousProps.gridTemplateColumns !== nextProps.gridTemplateColumns ||
    previousProps.leftSpacerWidth !== nextProps.leftSpacerWidth ||
    previousProps.row !== nextProps.row ||
    previousProps.rowIndex !== nextProps.rowIndex ||
    previousProps.rightSpacerWidth !== nextProps.rightSpacerWidth ||
    previousActiveSignature !== nextActiveSignature ||
    previousSelectionSignature !== nextSelectionSignature
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
    previousProps.onInputSelect === nextProps.onInputSelect &&
    previousProps.onRowClick === nextProps.onRowClick &&
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

function setSheetIdQueryParamInUrl(currentHref: string, sheetId: string | null) {
  const url = new URL(currentHref);
  if (sheetId && sheetId.trim().length > 0) {
    url.searchParams.set("sheetId", sheetId);
  } else {
    url.searchParams.delete("sheetId");
  }
  return url.toString();
}

export function OpportunityPricingWorksheetBoard({
  worksheetId: explicitWorksheetId,
  initialSheetId,
  onClose,
  onDirtyStateChange,
}: {
  worksheetId?: string;
  initialSheetId?: string | null;
  onClose?: () => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
}) {
  const router = useRouter();
  const worksheetOwner = usePricingWorksheetOwner();
  const { session, isLoading: isAuthLoading } = useAuth();
  const worksheetOpportunityId = worksheetOwner.opportunityId;
  const worksheetProjectId = worksheetOwner.projectId;
  const canPublishToVariation = worksheetOwner.ownerType === "variation" && Boolean(worksheetOwner.variationId && worksheetOwner.projectId);
  const [worksheetId, setWorksheetId] = useState<string | null>(null);
  const [worksheetSheetId, setWorksheetSheetId] = useState<string | null>(null);
  const [workbookSheets, setWorkbookSheets] = useState<OpportunityPricingWorkbookSheet[]>([]);
  const [worksheetName, setWorksheetName] = useState<string | null>(null);
  const [isWorksheetNameEditorOpen, setIsWorksheetNameEditorOpen] = useState(false);
  const [worksheetTitleAutosave, setWorksheetTitleAutosave] = useState<PricingWorksheetTitleAutosaveState>({
    confirmedTitle: "Pricing Worksheet",
    draftTitle: "Pricing Worksheet",
    error: null,
    lastSavedAt: null,
    status: "idle",
  });
  const [worksheetTitleDraft, setWorksheetTitleDraft] = useState("Pricing Worksheet");
  const [worksheetTradePackage, setWorksheetTradePackage] = useState<string | null>(null);
  const [worksheet, setWorksheet] = useState<WorksheetData>(() => createDefaultWorksheetData());
  const worksheetRef = useRef<WorksheetData>(worksheet);
  const [pricingSummary, setPricingSummary] = useState<WorksheetPricingSummary>(() =>
    createDefaultWorksheetPricingSummary()
  );
  const pricingSummaryRef = useRef<WorksheetPricingSummary>(pricingSummary);
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
  const [aiJobStatus, setAiJobStatus] = useState<PricingWorksheetAiJobStatus | null>(null);
  const [aiJobProgressLabel, setAiJobProgressLabel] = useState<string | null>(null);
  const [aiJobError, setAiJobError] = useState<PricingWorksheetAiJobError | null>(null);
  const [aiFindingStates, setAiFindingStates] = useState<Record<string, PricingWorksheetAiFindingDisposition>>({});
  const [aiAppliedSuggestedEditGroupIds, setAiAppliedSuggestedEditGroupIds] = useState<string[]>([]);
  const [aiFollowUpPrompt, setAiFollowUpPrompt] = useState("");
  const [isSubmittingAiFollowUp, setIsSubmittingAiFollowUp] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [activeSidePanel, setActiveSidePanel] = useState<WorksheetSidePanelType>(null);
  const [materialTarget, setMaterialTarget] = useState<PricingWorksheetMaterialTarget | null>(null);
  const commercialMapping = useWorksheetCommercialMapping();
  const variationCommercialMapping = useWorksheetVariationCommercialMapping();
  const measureMapping = useWorksheetFieldMapping(MEASURE_MAPPING_OPTIONS);
  const [commercialMappingContext, setCommercialMappingContext] = useState<CommercialMappingPublishContext | null>(null);
  const [variationCommercialMappingContext, setVariationCommercialMappingContext] = useState<VariationCommercialMappingContext | null>(null);
  const [commercialMappingHighlightField, setCommercialMappingHighlightField] = useState<CommercialMappingField | null>(null);
  const [variationCommercialMappingHighlight, setVariationCommercialMappingHighlight] = useState<{ lineId: string; field: CommercialMappingField } | null>(null);
  const [measureMappingHighlightField, setMeasureMappingHighlightField] = useState<PricingWorksheetMeasureField | null>(null);
  const [isNarrowCommercialCellPicker, setIsNarrowCommercialCellPicker] = useState(false);
  const [purchaseOrderMappingSection, setPurchaseOrderMappingSection] = useState<WorksheetPublishConfirmationLineDraft["purchaseOrderSection"]>("");
  const consumedMaterialTargetRef = useRef<string | null>(null);
  const aiPreApplySnapshotRef = useRef<{
    worksheet: WorksheetData;
    name: string | null;
    tradePackage: string | null;
  } | null>(null);
  const aiJobPollTimeoutRef = useRef<number | null>(null);
  const [historyPast, setHistoryPast] = useState<WorksheetData[]>([]);
  const [historyFuture, setHistoryFuture] = useState<WorksheetData[]>([]);
  const historyPastRef = useRef<WorksheetData[]>([]);
  const historyFutureRef = useRef<WorksheetData[]>([]);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<"cell" | "formulaBar" | null>(null);
  const [showGridlines, setShowGridlines] = useState(true);
  const [editingCellValue, setEditingCellValue] = useState("");
  const [selectionState, setSelectionState] = useState<WorksheetMultiSelectionState>(() =>
    createEmptyWorksheetMultiSelectionState(),
  );
  const selectionStateRef = useRef(selectionState);
  const editorTextSelectionRef = useRef<WorksheetTextSelection | null>(null);
  const editingSessionRef = useRef<{
    cellKey: string;
    originalValue: string;
  } | null>(null);
  const worksheetMutationRevisionRef = useRef(0);
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
  const [isPagesTrayOpen, setIsPagesTrayOpen] = useState(false);
  const [pageDialog, setPageDialog] = useState<WorksheetPageDialogState>(null);
  const [quotePublishDialog, setQuotePublishDialog] = useState<QuotePublishDialogState | null>(null);
  const [purchaseOrderPublishDialog, setPurchaseOrderPublishDialog] = useState<PurchaseOrderPublishDialogState | null>(null);
  const [variationPublishDialog, setVariationPublishDialog] = useState<VariationPublishDialogState | null>(null);
  const [quotePublishTargetMode, setQuotePublishTargetMode] = useState<"new" | "existing">("new");
  const [quotePublishTargetIds, setQuotePublishTargetIds] = useState<string[]>([]);
  const [purchaseOrderPublishSupplierId, setPurchaseOrderPublishSupplierId] = useState("");
  const [purchaseOrderPublishTitle, setPurchaseOrderPublishTitle] = useState("Worksheet Purchase Order");
  const [purchaseOrderPublishTargetMode, setPurchaseOrderPublishTargetMode] = useState<"new" | "existing">("new");
  const [purchaseOrderPublishTargetId, setPurchaseOrderPublishTargetId] = useState("");
  const [isPublishingWorksheetSelection, setIsPublishingWorksheetSelection] = useState(false);
  const [isMutatingPages, setIsMutatingPages] = useState(false);
  const [customTextColorInput, setCustomTextColorInput] = useState("");
  const [customFillColorInput, setCustomFillColorInput] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const worksheetTextMeasureRef = useRef<HTMLDivElement | null>(null);
  const worksheetSurfaceRef = useRef<HTMLDivElement | null>(null);
  const worksheetViewportRef = useRef<HTMLDivElement | null>(null);
  const suppressSelectionAutoScrollRef = useRef(false);
  const saveWorksheetRef = useRef<((options?: { silent?: boolean }) => Promise<boolean>) | null>(null);
  const formulaBarRef = useRef<HTMLTextAreaElement | null>(null);
  const formattingToolbarRef = useRef<HTMLDivElement | null>(null);
  const worksheetNameEditorRef = useRef<HTMLDivElement | null>(null);
  const didCountBoardMountRef = useRef(false);
  const isWorksheetBoardMountedRef = useRef(false);
  const activeWorksheetLoadScopeKeyRef = useRef<string | null>(null);
  const loadedWorksheetScopeKeyRef = useRef<string | null>(null);
  const loadingWorksheetScopeKeyRef = useRef<string | null>(null);
  const firstGridRenderScopeKeyRef = useRef<string | null>(null);
  const suppressBlurCommitCellKeyRef = useRef<string | null>(null);
  const suppressFormulaBarBlurCommitRef = useRef(false);
  const editingCellValueRef = useRef("");
  const isFormulaReferencePickArmedRef = useRef(false);
  const isDraggingSelectionRef = useRef(false);
  const pendingSelectionDragRef = useRef<{
    anchorCellKey: string;
    startClientX: number;
    startClientY: number;
    mode: "replace" | "add" | "extend";
    baseSelectionState: WorksheetMultiSelectionState;
  } | null>(null);
  const rangeDragAnchorCellKeyRef = useRef<string | null>(null);
  const formulaReferenceDragAnchorCellKeyRef = useRef<string | null>(null);
  const formulaReferenceDragBaseValueRef = useRef<string | null>(null);
  const formulaReferenceDragSelectionRef = useRef<WorksheetTextSelection | null>(null);
  const didDragSelectionRef = useRef(false);
  const workbookSheetsRef = useRef<OpportunityPricingWorkbookSheet[]>([]);
  const worksheetIdRef = useRef<string | null>(null);
  const worksheetSheetIdRef = useRef<string | null>(null);
  const handledFormulaReferenceMouseDownRef = useRef(false);
  const fillSourceRangeRef = useRef<WorksheetSelectionRange | null>(null);
  const fillPreviewFocusCellKeyRef = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<WorksheetContextMenuState>(null);
  const locationHrefRef = useRef("");
  const requestedSheetIdRef = useRef<string | null>(initialSheetId ?? null);
  const activeAiJobIdRef = useRef<string | null>(null);
  const activeAiJobSheetIdRef = useRef<string | null>(null);
  const persistedLastActiveWorkbookIdRef = useRef<string | null>(null);
  const persistedLastActiveSheetIdRef = useRef<string | null>(null);
  const pendingLearningWritesRef = useRef<PendingWorksheetLearningWrite[]>([]);
  const isWorksheetTitleEditingRef = useRef(false);
  const worksheetTitleDraftRef = useRef("Pricing Worksheet");
  const worksheetTitleSheetIdRef = useRef<string | null>(null);
  const persistWorksheetTitleRef = useRef<(title: string) => Promise<PricingWorksheetTitleSaveResult>>(async () => {
    throw new Error("Pricing worksheet title save is not ready. Please refresh and try again.");
  });
  const worksheetTitleAutosaveControllerRef = useRef<PricingWorksheetTitleAutosaveController | null>(null);
  if (!worksheetTitleAutosaveControllerRef.current) {
    worksheetTitleAutosaveControllerRef.current = new PricingWorksheetTitleAutosaveController({
      initialTitle: "Pricing Worksheet",
      onError: (message) => setError(message),
      onStateChange: (state) => {
        setWorksheetTitleAutosave(state);
        if (!isWorksheetTitleEditingRef.current) {
          worksheetTitleDraftRef.current = state.draftTitle;
          setWorksheetTitleDraft(state.draftTitle);
        }
      },
      persist: (title) => persistWorksheetTitleRef.current(title),
    });
  }

  const synchronizeLoadedWorksheetTitle = useCallback((params: {
    sheetId: string | null;
    title: string;
    updatedAt: string | null;
  }) => {
    const controller = worksheetTitleAutosaveControllerRef.current;
    if (!controller) {
      return;
    }

    const snapshot = controller.getSnapshot();
    if (!shouldSynchronizeLoadedWorksheetTitle({
      confirmedTitle: snapshot.confirmedTitle,
      currentSheetId: worksheetTitleSheetIdRef.current,
      draftTitle: worksheetTitleDraftRef.current,
      isEditing: isWorksheetTitleEditingRef.current,
      nextSheetId: params.sheetId,
      status: snapshot.status,
    })) {
      return;
    }

    worksheetTitleSheetIdRef.current = params.sheetId;
    controller.reset(params.title, params.updatedAt);
    const nextDraft = controller.getSnapshot().draftTitle;
    worksheetTitleDraftRef.current = nextDraft;
    setWorksheetTitleDraft(nextDraft);
  }, []);

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
      const titleAutosaveController = worksheetTitleAutosaveControllerRef.current;
      if (titleAutosaveController) {
        void titleAutosaveController.flush();
      }
      isWorksheetBoardMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onDirtyStateChange?.(isDirty || worksheetTitleAutosave.status !== "idle");
  }, [isDirty, onDirtyStateChange, worksheetTitleAutosave.status]);

  useEffect(() => {
    workbookSheetsRef.current = workbookSheets;
  }, [workbookSheets]);

  useEffect(() => {
    worksheetIdRef.current = worksheetId;
  }, [worksheetId]);

  useEffect(() => {
    worksheetSheetIdRef.current = worksheetSheetId;
  }, [worksheetSheetId]);

  const canWriteWorksheet = useMemo(() => {
    return !worksheetOwner.readOnly && (
      session?.role === "owner" ||
      session?.role === "admin" ||
      session?.role === "qs" ||
      session?.role === "project_manager"
    );
  }, [session?.role, worksheetOwner.readOnly]);
  const isWorksheetMappingMode = commercialMapping.session !== null || variationCommercialMapping.session !== null || measureMapping.session !== null;
  const activeWorksheetMapping = commercialMapping.session
    ? { kind: "commercial" as const, session: commercialMapping.session }
    : variationCommercialMapping.session
      ? { kind: "commercial" as const, session: variationCommercialMapping.session }
    : measureMapping.session
      ? { kind: "measure" as const, session: measureMapping.session }
      : null;
  const canMutateWorksheet = canWriteWorksheet && !isWorksheetMappingMode;

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);
  const hasUnsavedWorksheetChanges = isDirty || worksheetTitleAutosave.status !== "idle";

  persistWorksheetTitleRef.current = async (nextTitle) => {
    const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
    const sheetId = worksheetSheetIdRef.current;
    const organizationId = session?.organizationId;
    const userId = session?.id;
    if (!supabase || !organizationId || !userId || !workbookId || !sheetId || !worksheetOpportunityId) {
      throw new Error("Pricing worksheet title save is not ready. Please refresh and try again.");
    }
    if (!canWriteWorksheet) {
      throw new Error("You do not have permission to edit pricing worksheets.");
    }

    setError(null);
    const renamedSheet = await renameOpportunityPricingWorkbookSheet({
      supabase,
      organizationId,
      opportunityId: worksheetOpportunityId,
      projectId: worksheetProjectId,
      projectOwned: worksheetOwner.ownerType === "project",
      quoteId: worksheetOwner.quoteId,
      variationId: worksheetOwner.variationId,
      workbookId,
      sheetId,
      nextName: nextTitle,
      tradePackage: worksheetTradePackage,
      userId,
    });
    const title = "sheetName" in renamedSheet ? renamedSheet.sheetName : renamedSheet.name;
    const updatedAt = renamedSheet.updatedAt ?? new Date().toISOString();
    const currentWorksheet = worksheetRef.current;
    if (worksheetSheetIdRef.current === sheetId) {
      const nextWorksheet = { ...currentWorksheet, sheetName: title };
      worksheetRef.current = nextWorksheet;
      setWorksheet(nextWorksheet);
      setWorksheetName(title);
      setLastSavedAt(updatedAt);
    }
    const nextSheets = workbookSheetsRef.current.map((sheet) => sheet.id === sheetId
      ? { ...sheet, name: title, updatedAt, worksheet: { ...sheet.worksheet, sheetName: title } }
      : sheet);
    workbookSheetsRef.current = nextSheets;
    setWorkbookSheets(nextSheets);
    return { title, updatedAt };
  };

  useEffect(() => {
    const currentWorkbookId = worksheetId;
    if (!supabase || !session?.organizationId || !currentWorkbookId || worksheetOwner.readOnly) {
      return;
    }

    const nextSheetId =
      typeof worksheetSheetId === "string" && worksheetSheetId.trim().length > 0
        ? worksheetSheetId
        : null;
    const alreadyPersistedForWorkbook =
      persistedLastActiveWorkbookIdRef.current === currentWorkbookId &&
      persistedLastActiveSheetIdRef.current === nextSheetId;

    if (alreadyPersistedForWorkbook) {
      return;
    }

    const previousWorkbookId = persistedLastActiveWorkbookIdRef.current;
    const previousSheetId = persistedLastActiveSheetIdRef.current;
    persistedLastActiveWorkbookIdRef.current = currentWorkbookId;
    persistedLastActiveSheetIdRef.current = nextSheetId;

    void setOpportunityPricingWorkbookLastActiveSheet({
      supabase,
      organizationId: session.organizationId,
      opportunityId: worksheetOpportunityId,
      projectId: worksheetProjectId,
      projectOwned: worksheetOwner.ownerType === "project",
      quoteId: worksheetOwner.quoteId,
      variationId: worksheetOwner.variationId,
      workbookId: currentWorkbookId,
      sheetId: nextSheetId,
    }).catch(() => {
      if (persistedLastActiveWorkbookIdRef.current === currentWorkbookId) {
        persistedLastActiveWorkbookIdRef.current = previousWorkbookId;
        persistedLastActiveSheetIdRef.current = previousSheetId;
      }
    });
  }, [
    session?.organizationId,
    supabase,
    worksheetId,
    worksheetSheetId,
    worksheetOpportunityId,
    worksheetOwner.quoteId,
    worksheetOwner.readOnly,
    worksheetOwner.variationId,
    worksheetProjectId,
  ]);

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
    const opportunityId = worksheetOpportunityId;
    const currentWorksheetId = worksheetId;

    if (!supabase || !organizationId || !opportunityId || !currentWorksheetId) {
      return;
    }

    void writePricingWorksheetIntelligenceEvents(supabase, params.map((entry) =>
      buildPricingWorksheetIntelligenceEvent({
        organizationId,
        opportunityId,
        workbookId: currentWorksheetId,
        sheetId: worksheetSheetIdRef.current ?? worksheetSheetId ?? currentWorksheetId,
        sheetName: worksheetName?.trim() || worksheet.sheetName || "Pricing Worksheet",
        worksheetId: currentWorksheetId,
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
    worksheetOpportunityId,
    supabase,
    worksheet.sheetName,
    worksheetId,
    worksheetSheetId,
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

  const persistWorksheetLearningArtifacts = useCallback((params: {
    clientMutationId: string;
    previousWorksheet: WorksheetData;
    nextWorksheet: WorksheetData;
    occurredAt?: string;
  }) => {
    const organizationId = session?.organizationId;
    const userId = session?.id ?? null;
    const workbookId = explicitWorksheetId ?? worksheetId;

    if (!supabase || !organizationId || !userId || !workbookId || !worksheetOpportunityId) {
      return params.nextWorksheet;
    }

    const artifacts = buildWorksheetLearningArtifacts({
      organizationId,
      userId,
      projectId: worksheetProjectId,
      opportunityId: worksheetOpportunityId,
      workbookId,
      sheetId: worksheetSheetIdRef.current ?? worksheetSheetId ?? workbookId,
      sheetName: worksheetName?.trim() || params.nextWorksheet.sheetName || "Pricing Worksheet",
      worksheetId: workbookId,
      worksheetName: worksheetName?.trim() || params.nextWorksheet.sheetName || "Pricing Worksheet",
      tradePackage: worksheetTradePackage,
      source: "manual",
      previousWorksheet: params.previousWorksheet,
      nextWorksheet: params.nextWorksheet,
      clientMutationId: params.clientMutationId,
      occurredAt: params.occurredAt,
    });

    pendingLearningWritesRef.current = queuePendingWorksheetLearningWrite(pendingLearningWritesRef.current, {
      clientMutationId: params.clientMutationId,
      correctionEvents: artifacts.correctionEvents,
      enqueueOutbox: artifacts.intelligenceEvents.length > 0,
      nextWorksheet: params.nextWorksheet,
      occurredAt: params.occurredAt,
      previousWorksheet: params.previousWorksheet,
    });

    return artifacts.worksheet;
  }, [
    explicitWorksheetId,
    session?.id,
    session?.organizationId,
    worksheetOpportunityId,
    worksheetProjectId,
    supabase,
    worksheetId,
    worksheetName,
    worksheetSheetId,
    worksheetTradePackage,
  ]);

  const flushPersistedWorksheetLearningArtifacts = useCallback(async (params: {
    organizationId: string;
    sheetId: string;
    sheetName: string;
    tradePackage: string | null;
    userId: string;
    workbookId: string;
    workbookName: string;
    worksheetName: string;
  }) => {
    if (!supabase || !worksheetOpportunityId || pendingLearningWritesRef.current.length === 0) {
      return;
    }

    const result = await flushPendingWorksheetLearningWrites({
      queue: pendingLearningWritesRef.current,
      workbookId: params.workbookId,
      sheetId: params.sheetId,
      sheetName: params.sheetName,
      enqueueOutbox: async (input) => {
        await enqueueWorksheetMutationEvidenceV2Outbox(supabase, {
          organizationId: params.organizationId,
          userId: params.userId,
          projectId: worksheetProjectId,
          opportunityId: worksheetOpportunityId,
          workbookId: params.workbookId,
          workbookName: params.workbookName,
          sheetId: params.sheetId,
          sheetName: params.sheetName,
          worksheetId: params.workbookId,
          worksheetName: params.worksheetName,
          tradePackage: params.tradePackage,
          source: "manual",
          clientMutationId: input.clientMutationId,
          occurredAt: input.occurredAt,
          previousWorksheet: input.previousWorksheet,
          nextWorksheet: input.nextWorksheet,
        });
      },
      writeCorrectionEvent: async (input) => {
        await writePricingWorksheetCorrectionEvent(supabase, input);
      },
    });

    pendingLearningWritesRef.current = result.remainingQueue;
  }, [
    worksheetOpportunityId,
    worksheetProjectId,
    supabase,
  ]);

  const logAiPreviewOutcomeEvent = useCallback((params: {
    eventType: "worksheet_ai_preview_accepted" | "worksheet_ai_preview_rejected";
    action: "accepted" | "rejected";
    aiInteractionId: string;
    preview: PricingWorksheetAiPreviewResponse["preview"];
    sheetId?: string | null;
    sheetName?: string | null;
    acceptedFindingIds?: string[];
    rejectedFindingIds?: string[];
    appliedSuggestedEditGroupIds?: string[];
  }) => {
    const organizationId = session?.organizationId;
    const workbookId = explicitWorksheetId ?? worksheetId;

    if (!supabase || !organizationId || !workbookId || !worksheetOpportunityId) {
      return;
    }

    void writePricingWorksheetIntelligenceEvents(supabase, [
      buildPricingWorksheetIntelligenceEvent({
        organizationId,
        userId: session?.id ?? null,
        projectId: worksheetProjectId,
        opportunityId: worksheetOpportunityId,
        workbookId,
        sheetId: params.sheetId ?? worksheetSheetIdRef.current ?? worksheetSheetId ?? workbookId,
        sheetName: params.sheetName ?? worksheetName?.trim() ?? worksheetRef.current.sheetName ?? "Pricing Worksheet",
        worksheetId: workbookId,
        worksheetName: params.sheetName ?? worksheetName?.trim() ?? worksheetRef.current.sheetName ?? "Pricing Worksheet",
        tradePackage: worksheetTradePackage,
        worksheet: worksheetRef.current,
        eventType: params.eventType,
        eventFamily: "commercial_action",
        action: params.action,
        source: "ai",
        diffData: {
          aiInteractionId: params.aiInteractionId,
          responseMode: params.preview.assistant?.mode ?? null,
          operationCount: params.preview.assistant?.operations.length ?? 0,
          changedCellCount: params.preview.assistant?.diffSummary.changedCells.length ?? 0,
          acceptedFindingIds: params.acceptedFindingIds ?? [],
          rejectedFindingIds: params.rejectedFindingIds ?? [],
          appliedSuggestedEditGroupIds: params.appliedSuggestedEditGroupIds ?? [],
          validationWarningCount: params.preview.validationWarnings.length ?? 0,
        },
        reason:
          params.eventType === "worksheet_ai_preview_accepted"
            ? "AI worksheet preview accepted."
            : "AI worksheet preview rejected.",
      }),
    ]).catch((eventWriteError) => {
      logPricingWorksheetIntelligenceFailure(params.eventType, eventWriteError);
    });
  }, [
    explicitWorksheetId,
    session?.id,
    session?.organizationId,
    worksheetOpportunityId,
    worksheetProjectId,
    supabase,
    worksheetId,
    worksheetName,
    worksheetSheetId,
    worksheetTradePackage,
  ]);

  const applyAiProvenanceToWorksheet = useCallback((params: {
    nextWorksheet: WorksheetData;
    aiInteractionId: string;
    promptSummary?: string | null;
    operationTypes?: string[];
    batchIndex?: number | null;
  }) => {
    const changedCellKeys = listWorksheetChangedCellKeys({
      previousWorksheet: worksheetRef.current,
      nextWorksheet: params.nextWorksheet,
    });

    return stampWorksheetAiProvenance({
      worksheet: params.nextWorksheet,
      changedCellKeys,
      aiInteractionId: params.aiInteractionId,
      aiJobId: activeAiJobIdRef.current ?? params.aiInteractionId,
      generatedAt: new Date().toISOString(),
      operationType:
        params.operationTypes && params.operationTypes.length > 0
          ? Array.from(new Set(params.operationTypes)).join(",")
          : null,
      generationBatchId:
        params.batchIndex && params.batchIndex > 0
          ? `${params.aiInteractionId}:batch-${params.batchIndex}`
          : `${params.aiInteractionId}:batch-1`,
      promptSummary: params.promptSummary ?? null,
    });
  }, []);

  const selectionAnchorCellKey = selectionState.anchorCellKey;
  const selectionFocusCellKey = selectionState.focusCellKey;
  const selectedRanges = selectionState.ranges;
  const selectedRange = useMemo(
    () => getActiveWorksheetSelectionArea(selectionState),
    [selectionState],
  );
  const selectionAggregate = useMemo(
    () => deriveWorksheetSelectionAggregate({ worksheet, selectionState }),
    [selectionState, worksheet],
  );
  const activeWorkbookSheet = useMemo(
    () => workbookSheets.find((sheet) => sheet.id === worksheetSheetId) ?? workbookSheets[0] ?? null,
    [workbookSheets, worksheetSheetId],
  );

  const selectedSingleCellKey =
    selectedRanges.length === 1 &&
    selectionAnchorCellKey &&
    selectionFocusCellKey &&
    selectionAnchorCellKey === selectionFocusCellKey
      ? selectionAnchorCellKey
      : null;

  const materialPriceReviewOverlay = useMemo(
    () => buildMaterialPriceReviewOverlay(worksheet),
    [worksheet],
  );

  const selectedWorksheetCellKey =
    selectionFocusCellKey ??
    selectionAnchorCellKey ??
    buildWorksheetCellKey("A", "1");

  const worksheetStructureKey = useMemo(
    () => buildWorksheetStructureKey(worksheet),
    [worksheet],
  );
  const commercialMappingResolved = useMemo(() => {
    const mappingSession = commercialMapping.session;
    const workbookId = explicitWorksheetId ?? worksheetId;
    if (!mappingSession || !workbookId || !worksheetSheetId) return null;
    return resolveWorksheetCommercialMapping({
      session: mappingSession,
      worksheet,
      workbookId,
      sheetId: worksheetSheetId,
    });
  }, [commercialMapping.session, explicitWorksheetId, worksheet, worksheetId, worksheetSheetId]);
  const variationCommercialMappingResolved = useMemo(() => {
    const mappingSession = variationCommercialMapping.session;
    const workbookId = explicitWorksheetId ?? worksheetId;
    if (!mappingSession || !workbookId || !worksheetSheetId) return [];
    return mappingSession.lines.map((line) => ({
      line,
      resolved: resolveWorksheetCommercialMapping({
        session: line.mapping,
        worksheet,
        workbookId,
        sheetId: worksheetSheetId,
      }),
    }));
  }, [explicitWorksheetId, variationCommercialMapping.session, worksheet, worksheetId, worksheetSheetId]);
  const commercialMappingHighlightCellKeys = useMemo(() => {
    if (measureMapping.session) {
      const fieldsToHighlight = measureMappingHighlightField
        ? [measureMappingHighlightField]
        : PRICING_WORKSHEET_MEASURE_MAPPING_FIELDS;
      return new Set(fieldsToHighlight.flatMap((field) => {
        const target = measureMapping.session?.mappings[field];
        return target ? [target.cellKey] : [];
      }));
    }
    if (variationCommercialMapping.session && variationCommercialMappingHighlight) {
      const line = variationCommercialMapping.session.lines.find((candidate) => candidate.id === variationCommercialMappingHighlight.lineId);
      const source = line ? getWorksheetCommercialFieldSource(line.mapping, variationCommercialMappingHighlight.field) : null;
      return source ? new Set([source.cellKey]) : new Set<string>();
    }
    if (!commercialMapping.session || !commercialMappingHighlightField) return new Set<string>();
    const source = getWorksheetCommercialFieldSource(commercialMapping.session, commercialMappingHighlightField);
    return source ? new Set([source.cellKey]) : new Set<string>();
  }, [commercialMapping.session, commercialMappingHighlightField, measureMapping.session, measureMappingHighlightField, variationCommercialMapping.session, variationCommercialMappingHighlight]);

  const replaceSelection = useCallback((
    anchorCellKey: string | null,
    focusCellKey: string | null,
    kind: WorksheetSelectionKind = "cells",
  ) => {
    setSelectionState((current) => {
      const next = replaceWorksheetSelectionFromCellKeys(
        current,
        worksheetRef.current,
        anchorCellKey,
        focusCellKey,
        kind,
      );
      selectionStateRef.current = next;
      return next;
    });
  }, []);

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
    if (!shouldShowFormulaReferenceHighlights({
      activeCellKey,
      activeEditor,
      editingValue: editingCellValue,
    })) {
      return {
        formulaReferenceHighlightByCellKey: EMPTY_FORMULA_REFERENCE_HIGHLIGHTS,
        formulaReferenceRanges: EMPTY_FORMULA_REFERENCE_RANGES,
      };
    }

    const trimmedFormulaBarValue = formulaBarValue.trim();
    if (!trimmedFormulaBarValue.startsWith("=")) {
      return {
        formulaReferenceHighlightByCellKey: EMPTY_FORMULA_REFERENCE_HIGHLIGHTS,
        formulaReferenceRanges: EMPTY_FORMULA_REFERENCE_RANGES,
      };
    }

    const highlights = new Map<string, { colorIndex: number }>();
    const ranges: FormulaReferenceRangeHighlight[] = [];
    const rangeKeys = new Set<string>();

    for (const reference of buildPricingWorksheetFormulaPresentation(trimmedFormulaBarValue).references) {
      if (reference.kind === "cell") {
        if (highlights.has(reference.normalizedRef)) {
          continue;
        }

        highlights.set(reference.normalizedRef, { colorIndex: reference.colorIndex });
        continue;
      }

      const rangeKey = `${reference.startRowIndex}:${reference.startColumnIndex}:${reference.endRowIndex}:${reference.endColumnIndex}`;
      if (rangeKeys.has(rangeKey)) {
        continue;
      }
      rangeKeys.add(rangeKey);

      ranges.push({
        colorIndex: reference.colorIndex,
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
  }, [activeCellKey, activeEditor, editingCellValue, formulaBarValue]);
  const worksheetDisplayName =
    worksheetTitleAutosave.status !== "idle"
      ? normalizePricingWorksheetTitle(worksheetTitleDraft) || worksheetTitleAutosave.confirmedTitle
      : worksheetName?.trim() || worksheet.sheetName.trim() || worksheetTitleAutosave.confirmedTitle;
  const getWorksheetPersistenceName = useCallback(() => resolveWorksheetPersistenceName({
    worksheet: worksheetRef.current,
    worksheetName,
  }), [worksheetName]);
  const selectedCellFormat = getCellFormat(worksheet.cells[selectedWorksheetCellKey]);
  const selectedNumberFormat = selectedCellFormat.number;
  const selectedNumberFormatKind = selectedNumberFormat?.kind ?? "general";
  const selectedFillColor = selectedCellFormat.fill?.color;
  const selectedTextColor = selectedCellFormat.text?.color;
  const selectedTextAlign = selectedCellFormat.text?.align ?? "left";
  const selectedTextWrapMode = selectedCellFormat.text?.wrap ?? "wrap";
  const selectedTextBold = Boolean(selectedCellFormat.text?.bold);
  const selectedTextItalic = Boolean(selectedCellFormat.text?.italic);
  const selectedTextUnderline = Boolean(selectedCellFormat.text?.underline);
  const selectedTextStrikethrough = Boolean(selectedCellFormat.text?.strikethrough);
  const selectedFontSize = selectedCellFormat.text?.fontSize ?? DEFAULT_WORKSHEET_FONT_SIZE;
  const normalizedCustomTextColor = normalizeHexColorInput(customTextColorInput);
  const normalizedCustomFillColor = normalizeHexColorInput(customFillColorInput);

  const resetAiPreviewState = useCallback(() => {
    if (aiJobPollTimeoutRef.current) {
      window.clearTimeout(aiJobPollTimeoutRef.current);
      aiJobPollTimeoutRef.current = null;
    }
    activeAiJobIdRef.current = null;
    activeAiJobSheetIdRef.current = null;
    setAiPreviewResponse(null);
    setAiPreviewError(null);
    setIsGeneratingAiPreview(false);
    setIsSubmittingAiReview(false);
    setIsSubmittingAiFollowUp(false);
    setAiJobStatus(null);
    setAiJobProgressLabel(null);
    setAiJobError(null);
    setAiFindingStates({});
    setAiAppliedSuggestedEditGroupIds([]);
    setAiFollowUpPrompt("");
    setIsAiChatOpen(false);
    aiPreApplySnapshotRef.current = null;
  }, []);

  const cancelActiveAiJob = useCallback(async () => {
    const activeJobId = activeAiJobIdRef.current;
    const organizationId = session?.organizationId;
    if (!activeJobId || !organizationId) {
      return;
    }

    activeAiJobIdRef.current = null;
    activeAiJobSheetIdRef.current = null;

    try {
      await fetch(
        `/api/ai/pricing-worksheets/edit-assistant/jobs/${activeJobId}/cancel?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    } catch {
      // Best-effort cancellation only; local sheet scoping is the safety backstop.
    }
  }, [session?.organizationId]);

  const updateSheetUrlState = useCallback((nextSheetId: string | null) => {
    const nextHref = setSheetIdQueryParamInUrl(window.location.href, nextSheetId);
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
    window.history.replaceState(
      {
        ...currentState,
        pricingWorksheetOverlay: true,
        worksheetId: explicitWorksheetId ?? worksheetId ?? null,
        sheetId: nextSheetId,
      },
      "",
      nextHref,
    );
    locationHrefRef.current = nextHref;
    requestedSheetIdRef.current = nextSheetId;
  }, [explicitWorksheetId, worksheetId]);

  const resetWorksheetViewState = useCallback((nextWorksheet: WorksheetData) => {
    // Phase 2 intentionally resets transient editor state when switching pages.
    // Per-page scroll, selection, and history restoration can be layered in later.
    setHistoryPast([]);
    historyPastRef.current = [];
    setHistoryFuture([]);
    historyFutureRef.current = [];
    replaceSelection(buildWorksheetCellKey("A", "1"), buildWorksheetCellKey("A", "1"));
    setActiveCellKey(null);
    setActiveEditor(null);
    setEditingCellValue("");
    isFormulaReferencePickArmedRef.current = false;
    setContextMenu(null);
    setMessage(null);
    setError(null);
    setWorksheetViewportScrollLeft(0);
    setWorksheetViewportScrollTop(0);
    setWorksheetViewportHeight(WORKSHEET_VIEWPORT_FALLBACK_HEIGHT);
    setWorksheetViewportWidth(WORKSHEET_VIEWPORT_FALLBACK_WIDTH);
    worksheetRef.current = nextWorksheet;
    worksheetMutationRevisionRef.current = 0;
  }, [replaceSelection]);

  const hydrateWorkbookEditorState = useCallback((
    workbook: OpportunityPricingWorkbook,
    targetSheetId?: string | null,
    options?: {
      seedPersistedLastActiveSheet?: boolean;
    },
  ) => {
    const editorRecord = buildOpportunityPricingWorkbookEditorRecord(workbook, targetSheetId);
    const normalizedWorksheet = normalizeWorksheetData(editorRecord.worksheet as unknown as Json);
    const loadedWorksheet = recalculateWorksheetFormulas(normalizedWorksheet);

    if (options?.seedPersistedLastActiveSheet !== false) {
      persistedLastActiveWorkbookIdRef.current = workbook.id;
      persistedLastActiveSheetIdRef.current = workbook.lastActiveSheetId;
    }
    setWorksheetId(editorRecord.workbookId);
    worksheetIdRef.current = editorRecord.workbookId;
    setWorksheetSheetId(editorRecord.sheetId);
    worksheetSheetIdRef.current = editorRecord.sheetId;
    setWorkbookSheets(workbook.sheets);
    setWorksheetName(editorRecord.sheetName);
    setWorksheetTradePackage(editorRecord.tradePackage);
    setWorksheet(loadedWorksheet);
    worksheetMutationRevisionRef.current = 0;
    const nextPricingSummary = deriveWorksheetPricingSummary(loadedWorksheet, editorRecord.pricingSummary, {
      calculatedAt: editorRecord.pricingSummary.lastCalculatedAt,
    });
    pricingSummaryRef.current = nextPricingSummary;
    setPricingSummary(nextPricingSummary);
    setExtractedPricingData(editorRecord.extractedPricingData);
    setLastSavedAt(editorRecord.updatedAt ?? null);
    setIsDirty(false);
    synchronizeLoadedWorksheetTitle({
      sheetId: editorRecord.sheetId,
      title: editorRecord.sheetName,
      updatedAt: editorRecord.updatedAt ?? null,
    });
    resetWorksheetViewState(loadedWorksheet);
    resetAiPreviewState();
    setIsAiDialogOpen(false);
    return editorRecord;
  }, [resetAiPreviewState, resetWorksheetViewState, synchronizeLoadedWorksheetTitle]);

  const openAiDialog = useCallback(() => {
    setAiPreviewError(null);
    setAiPreviewResponse(null);
    setAiPrompt("");
    setAiPreviewWorksheetName(worksheetDisplayName);
    setAiPreviewTradePackage(worksheetTradePackage ?? "");
    setAiFindingStates({});
    setAiAppliedSuggestedEditGroupIds([]);
    setAiFollowUpPrompt("");
    setIsAiChatOpen(false);
    setActiveSidePanel(null);
    setMaterialTarget(null);
    measureMapping.cancel();
    setMeasureMappingHighlightField(null);
    aiPreApplySnapshotRef.current = null;
    setIsAiDialogOpen(true);
  }, [measureMapping, worksheetDisplayName, worksheetTradePackage]);

  const handleAiDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (isGeneratingAiPreview || isSubmittingAiReview) {
      return;
    }

    if (!nextOpen && !aiPreviewResponse && !isAiChatOpen) {
      resetAiPreviewState();
    }

    setIsAiDialogOpen(nextOpen);
  }, [aiPreviewResponse, isAiChatOpen, isGeneratingAiPreview, isSubmittingAiReview, resetAiPreviewState]);

  const closeCommercialMapping = useCallback(() => {
    commercialMapping.cancel();
    setCommercialMappingContext(null);
    setCommercialMappingHighlightField(null);
    setIsNarrowCommercialCellPicker(false);
    setPurchaseOrderMappingSection("");
    requestAnimationFrame(() => worksheetSurfaceRef.current?.focus({ preventScroll: true }));
  }, [commercialMapping]);

  const closeVariationCommercialMapping = useCallback(() => {
    variationCommercialMapping.cancel();
    setVariationCommercialMappingContext(null);
    setVariationCommercialMappingHighlight(null);
    setIsNarrowCommercialCellPicker(false);
    requestAnimationFrame(() => worksheetSurfaceRef.current?.focus({ preventScroll: true }));
  }, [variationCommercialMapping]);

  const armCommercialMappingField = useCallback((field: CommercialMappingField) => {
    commercialMapping.armField(field);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setIsNarrowCommercialCellPicker(true);
      requestAnimationFrame(() => worksheetSurfaceRef.current?.focus({ preventScroll: true }));
    }
  }, [commercialMapping]);

  const escapeCommercialMapping = useCallback(() => {
    if (commercialMapping.session?.activeField) {
      commercialMapping.armField(null);
      setIsNarrowCommercialCellPicker(false);
      return;
    }
    closeCommercialMapping();
  }, [closeCommercialMapping, commercialMapping]);

  const armVariationCommercialMappingField = useCallback((lineId: string, field: CommercialMappingField) => {
    variationCommercialMapping.armField(lineId, field);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setIsNarrowCommercialCellPicker(true);
      requestAnimationFrame(() => worksheetSurfaceRef.current?.focus({ preventScroll: true }));
    }
  }, [variationCommercialMapping]);

  const escapeVariationCommercialMapping = useCallback(() => {
    const activeLine = variationCommercialMapping.session?.lines.find((line) => line.mapping.activeField);
    if (activeLine) {
      variationCommercialMapping.armField(activeLine.id, null);
      setIsNarrowCommercialCellPicker(false);
      return;
    }
    closeVariationCommercialMapping();
  }, [closeVariationCommercialMapping, variationCommercialMapping]);

  const prepareCommercialMappingSurface = useCallback(() => {
    if (activeCellKey) {
      editingSessionRef.current = null;
      editorTextSelectionRef.current = null;
      isFormulaReferencePickArmedRef.current = false;
      setActiveCellKey(null);
      setActiveEditor(null);
      setEditingCellValue("");
    }
    setIsAiChatOpen(false);
    setIsAiDialogOpen(false);
    setActiveSidePanel(null);
    setMaterialTarget(null);
    measureMapping.cancel();
    setMeasureMappingHighlightField(null);
    setIsDraggingSelection(false);
    setIsDraggingFill(false);
    setResizingColumnId(null);
    setResizingRowId(null);
  }, [activeCellKey, measureMapping]);

  const startQuoteCommercialMapping = useCallback(async (
    range: WorksheetSelectionRange | null,
    selectionRanges: WorksheetSelectionRange[],
    startingCell: string,
  ) => {
    if (!range || !supabase || !session?.organizationId || !worksheetOpportunityId || !canWriteWorksheet) {
      setError("Select a worksheet cell and confirm you have permission to add it to a Quote.");
      return;
    }
    prepareCommercialMappingSurface();
    setError(null);
    try {
      if (!worksheetIdRef.current && !(await saveWorksheetRef.current?.({ silent: true }))) {
        throw new Error("Save the worksheet before starting Commercial Mapping Mode.");
      }
      const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
      const sheetId = worksheetSheetIdRef.current;
      if (!workbookId || !sheetId) throw new Error("Worksheet source identity is unavailable.");
      const publishContext = await resolveWorksheetQuotePublishContext({ organizationId: session.organizationId, opportunityId: worksheetOpportunityId });
      const resolution = await resolveQuotePublishTarget({ client: supabase, organizationId: session.organizationId, opportunityId: worksheetOpportunityId, projectId: publishContext.projectId });
      if (resolution.kind === "blocked") throw new Error(resolution.message);
      const quotes = resolution.kind === "choose" ? resolution.quotes : await resolveQuotePublishOptions({ client: supabase, organizationId: session.organizationId, opportunityId: worksheetOpportunityId });
      setQuotePublishTargetMode(resolveInitialQuotePublishTargetMode(resolution));
      setQuotePublishTargetIds(resolveInitialQuotePublishTargetIds(resolution));
      setCommercialMappingContext({ destination: "quote", projectId: publishContext.projectId, quotes });
      commercialMapping.start({ destination: "quote", workbookId, sheetId, structureKey: worksheetStructureKey, startingCell, capturedSelection: range, capturedSelections: selectionRanges.length ? selectionRanges : [range] });
    } catch (mappingError) {
      setError(mapWorksheetQuotePublishErrorMessage(mappingError instanceof Error ? mappingError.message : "Unable to start Quote mapping."));
      closeCommercialMapping();
    }
  }, [canWriteWorksheet, closeCommercialMapping, commercialMapping, explicitWorksheetId, prepareCommercialMappingSurface, session?.organizationId, supabase, worksheetOpportunityId, worksheetStructureKey]);

  const startPurchaseOrderCommercialMapping = useCallback(async (
    range: WorksheetSelectionRange | null,
    selectionRanges: WorksheetSelectionRange[],
    startingCell: string,
  ) => {
    if (!range || !supabase || !session?.organizationId || !canWriteWorksheet) {
      setError("Select a worksheet cell and confirm you have permission to add it to a Purchase Order.");
      return;
    }
    prepareCommercialMappingSurface();
    setError(null);
    try {
      if (!worksheetIdRef.current && !(await saveWorksheetRef.current?.({ silent: true }))) throw new Error("Save the worksheet before starting Commercial Mapping Mode.");
      const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
      const sheetId = worksheetSheetIdRef.current;
      if (!workbookId || !sheetId) throw new Error("Worksheet source identity is unavailable.");
      const publishContext = await resolveWorksheetPurchaseOrderPublishContext({ owner: worksheetOwner });
      const options = await resolvePurchaseOrderPublishOptions({ client: supabase, organizationId: session.organizationId, projectId: publishContext.projectId });
      setPurchaseOrderPublishSupplierId("");
      setPurchaseOrderPublishTitle("Worksheet Purchase Order");
      setPurchaseOrderPublishTargetMode("new");
      setPurchaseOrderPublishTargetId("");
      setPurchaseOrderMappingSection("");
      setCommercialMappingContext({ destination: "purchase_order", projectId: publishContext.projectId, projectSlug: publishContext.projectSlug, suppliers: options.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.label })), draftPurchaseOrders: options.draftPurchaseOrders });
      commercialMapping.start({ destination: "purchase_order", workbookId, sheetId, structureKey: worksheetStructureKey, startingCell, capturedSelection: range, capturedSelections: selectionRanges.length ? selectionRanges : [range] });
    } catch (mappingError) {
      setError(mapWorksheetPurchaseOrderPublishErrorMessage(mappingError instanceof Error ? mappingError.message : "Unable to start Purchase Order mapping."));
      closeCommercialMapping();
    }
  }, [canWriteWorksheet, closeCommercialMapping, commercialMapping, explicitWorksheetId, prepareCommercialMappingSurface, session?.organizationId, supabase, worksheetOwner, worksheetStructureKey]);

  const startVariationCommercialMapping = useCallback(async (
    range: WorksheetSelectionRange | null,
    selectionRanges: WorksheetSelectionRange[],
    startingCell: string,
  ) => {
    if (!range || !supabase || !canWriteWorksheet || !canPublishToVariation) {
      setError("Select a worksheet cell and confirm you have permission to add it to the Variation.");
      return;
    }
    prepareCommercialMappingSurface();
    setError(null);
    setMessage(null);
    try {
      if (!worksheetIdRef.current && !(await saveWorksheetRef.current?.({ silent: true }))) {
        throw new Error("Save the worksheet before starting Commercial Mapping Mode.");
      }
      const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
      const sheetId = worksheetSheetIdRef.current;
      if (!workbookId || !sheetId) throw new Error("Worksheet source identity is unavailable.");
      const publishContext = await resolveWorksheetVariationPublishContext({ owner: worksheetOwner });
      setVariationCommercialMappingContext(publishContext);
      variationCommercialMapping.start({
        workbookId,
        sheetId,
        structureKey: worksheetStructureKey,
        startingCell,
        capturedSelection: range,
        capturedSelections: selectionRanges.length ? selectionRanges : [range],
      });
    } catch (mappingError) {
      setError(mapWorksheetVariationPublishErrorMessage(mappingError instanceof Error ? mappingError.message : "Unable to start Variation mapping."));
      closeVariationCommercialMapping();
    }
  }, [canPublishToVariation, canWriteWorksheet, closeVariationCommercialMapping, explicitWorksheetId, prepareCommercialMappingSurface, supabase, variationCommercialMapping, worksheetOwner, worksheetStructureKey]);

  const executeCommercialMappingPublish = useCallback(async () => {
    const mappingSession = commercialMapping.session;
    const mappingContext = commercialMappingContext;
    if (!mappingSession || !mappingContext || !commercialMappingResolved || !supabase || !session?.organizationId || !worksheetOpportunityId || isPublishingWorksheetSelection) return;
    setIsPublishingWorksheetSelection(true);
    setError(null);
    try {
      if (mappingContext.destination === "quote" && quotePublishTargetMode === "existing" && quotePublishTargetIds.length === 0) {
        throw new Error("Select at least one draft Quote that should receive this mapped line.");
      }
      if (mappingContext.destination === "purchase_order") {
        if (!purchaseOrderPublishSupplierId) throw new Error("Select a supplier.");
        if (!purchaseOrderMappingSection) throw new Error("Select a procurement section.");
        if (purchaseOrderPublishTargetMode === "existing" && !purchaseOrderPublishTargetId) throw new Error("Select a draft Purchase Order.");
        if (purchaseOrderPublishTargetMode === "new" && !purchaseOrderPublishTitle.trim()) throw new Error("Enter a Purchase Order title.");
      }
      if (isDirty && !(await saveWorksheetRef.current?.({ silent: true }))) throw new Error("Unable to save the worksheet before publishing.");
      const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
      const sheetId = worksheetSheetIdRef.current;
      if (!workbookId || !sheetId || workbookId !== mappingSession.workbookId || sheetId !== mappingSession.sheetId || worksheetStructureKey !== mappingSession.structureKey) throw new Error("Worksheet source changed during mapping. Cancel and map the cells again.");
      const resolved = resolveWorksheetCommercialMapping({ session: mappingSession, worksheet: worksheetRef.current, workbookId, sheetId });
      const explicit = buildExplicitMappedCommercialSelection({ session: mappingSession, worksheet: worksheetRef.current, resolved });
      const roundedConfirmedLine = {
        ...explicit.confirmedLine,
        quantity: explicit.confirmedLine.quantity === null ? null : normalizeCommercialQuantity(explicit.confirmedLine.quantity),
        rate: explicit.confirmedLine.rate === null ? null : normalizeCommercialRate(explicit.confirmedLine.rate),
        total: explicit.confirmedLine.total === null ? null : normalizeCommercialMoney(explicit.confirmedLine.total),
      };
      const sheetName = workbookSheetsRef.current.find((sheet) => sheet.id === sheetId)?.name?.trim() || worksheetDisplayName;
      const selection = buildPublishedWorksheetSelectionFromConfirmedLines({ destination: mappingSession.destination, worksheet: worksheetRef.current, selectionRange: mappingSession.capturedSelection, selectionRanges: mappingSession.capturedSelections, workbookId, worksheetId: workbookId, sheetId, worksheetName: worksheetDisplayName, sheetName, owner: worksheetOwner, interpretedSelection: explicit.interpretedSelection, confirmedLines: [roundedConfirmedLine] });
      if (mappingContext.destination === "quote" && mappingSession.destination === "quote") {
        const target: QuotePublishTarget = quotePublishTargetMode === "existing" ? { mode: "existing", quoteIds: quotePublishTargetIds } : { mode: "new" };
        const result = await publishWorksheetSelection({ client: supabase, organizationId: session.organizationId, opportunityId: worksheetOpportunityId, projectId: mappingContext.projectId, workbookId, worksheetId: workbookId, sheetId, worksheetName: worksheetDisplayName, sheetName, worksheet: worksheetRef.current, selectionRange: mappingSession.capturedSelection, owner: worksheetOwner, selection, adapter: quoteDestinationAdapter, target });
        setMessage(result.result.message);
      } else if (mappingContext.destination === "purchase_order" && mappingSession.destination === "purchase_order") {
        const lineSelections = [{ rowId: explicit.confirmedLine.proposalId, purchaseOrderSection: purchaseOrderMappingSection as Exclude<WorksheetPublishConfirmationLineDraft["purchaseOrderSection"], ""> }];
        const target: PurchaseOrderPublishTarget = purchaseOrderPublishTargetMode === "existing" ? { mode: "existing", purchaseOrderId: purchaseOrderPublishTargetId, supplierId: purchaseOrderPublishSupplierId, lineSelections } : { mode: "new", supplierId: purchaseOrderPublishSupplierId, purchaseOrderTitle: purchaseOrderPublishTitle.trim(), lineSelections };
        const result = await publishWorksheetSelection({ client: supabase, organizationId: session.organizationId, opportunityId: worksheetOpportunityId, projectId: mappingContext.projectId, workbookId, worksheetId: workbookId, sheetId, worksheetName: worksheetDisplayName, sheetName, worksheet: worksheetRef.current, selectionRange: mappingSession.capturedSelection, owner: worksheetOwner, selection, adapter: purchaseOrderDestinationAdapter, target });
        setMessage(result.result.message);
      } else {
        throw new Error("Commercial mapping destination changed unexpectedly.");
      }
      closeCommercialMapping();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish the mapped commercial line.");
    } finally {
      setIsPublishingWorksheetSelection(false);
    }
  }, [commercialMapping.session, commercialMappingContext, commercialMappingResolved, closeCommercialMapping, explicitWorksheetId, isDirty, isPublishingWorksheetSelection, purchaseOrderMappingSection, purchaseOrderPublishSupplierId, purchaseOrderPublishTargetId, purchaseOrderPublishTargetMode, purchaseOrderPublishTitle, quotePublishTargetIds, quotePublishTargetMode, session?.organizationId, supabase, worksheetDisplayName, worksheetOpportunityId, worksheetOwner, worksheetStructureKey]);

  const executeVariationCommercialMappingPublish = useCallback(async () => {
    const mappingSession = variationCommercialMapping.session;
    const mappingContext = variationCommercialMappingContext;
    if (!mappingSession || !mappingContext || !supabase || !session?.organizationId || isPublishingWorksheetSelection) return;
    setIsPublishingWorksheetSelection(true);
    setError(null);
    setMessage(null);
    try {
      if (isDirty && !(await saveWorksheetRef.current?.({ silent: true }))) {
        throw new Error("Unable to save the worksheet before publishing.");
      }
      const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
      const sheetId = worksheetSheetIdRef.current;
      const firstMapping = mappingSession.lines[0]?.mapping;
      if (!workbookId || !sheetId || !firstMapping || workbookId !== firstMapping.workbookId || sheetId !== firstMapping.sheetId || worksheetStructureKey !== firstMapping.structureKey) {
        throw new Error("Worksheet source changed during mapping. Cancel and map the cells again.");
      }
      const explicitLines = mappingSession.lines.map((line) => {
        if (line.mapping.workbookId !== workbookId || line.mapping.sheetId !== sheetId || line.mapping.structureKey !== worksheetStructureKey) {
          throw new Error("Worksheet source changed during mapping. Cancel and map the cells again.");
        }
        const resolved = resolveWorksheetCommercialMapping({ session: line.mapping, worksheet: worksheetRef.current, workbookId, sheetId });
        const explicit = buildExplicitMappedCommercialSelection({ session: line.mapping, worksheet: worksheetRef.current, resolved, proposalId: line.id });
        return { line, resolved, explicit };
      });
      const interpretedSelection = combineExplicitMappedCommercialSelections(explicitLines.map(({ explicit }) => explicit));
      const confirmedLines = explicitLines.map(({ line, resolved, explicit }) => ({
        ...explicit.confirmedLine,
        proposalId: line.id,
        quantity: resolved.line.quantity === null ? null : normalizeCommercialQuantity(resolved.line.quantity),
        rate: resolved.line.rate === null ? null : normalizeCommercialRate(resolved.line.rate),
        total: resolved.effective?.total === null || resolved.effective?.total === undefined ? null : normalizeCommercialMoney(resolved.effective.total),
      }));
      const sheetName = workbookSheetsRef.current.find((sheet) => sheet.id === sheetId)?.name?.trim() || worksheetDisplayName;
      const selection = buildPublishedWorksheetSelectionFromConfirmedLines({
        destination: "variation",
        worksheet: worksheetRef.current,
        selectionRange: firstMapping.capturedSelection,
        selectionRanges: firstMapping.capturedSelections,
        workbookId,
        worksheetId: workbookId,
        sheetId,
        worksheetName: worksheetDisplayName,
        sheetName,
        owner: worksheetOwner,
        interpretedSelection,
        confirmedLines,
      });
      const target: VariationPublishTarget = {
        variationId: mappingContext.variationId,
        lineSelections: explicitLines.map(({ line }) => ({ rowId: line.id, section: line.section })),
      };
      const result = await publishWorksheetSelection({
        client: supabase,
        organizationId: session.organizationId,
        opportunityId: mappingContext.opportunityId,
        projectId: mappingContext.projectId,
        workbookId,
        worksheetId: workbookId,
        sheetId,
        worksheetName: worksheetDisplayName,
        sheetName,
        worksheet: worksheetRef.current,
        selectionRange: firstMapping.capturedSelection,
        owner: worksheetOwner,
        selection,
        adapter: variationDestinationAdapter,
        target,
      });
      setMessage(result.result.message);
      closeVariationCommercialMapping();
      router.refresh();
    } catch (publishError) {
      setError(mapWorksheetVariationPublishErrorMessage(publishError instanceof Error ? publishError.message : "Unable to publish the mapped Variation lines."));
    } finally {
      setIsPublishingWorksheetSelection(false);
    }
  }, [closeVariationCommercialMapping, explicitWorksheetId, isDirty, isPublishingWorksheetSelection, router, session?.organizationId, supabase, variationCommercialMapping.session, variationCommercialMappingContext, worksheetDisplayName, worksheetOwner, worksheetStructureKey]);

  const executeWorksheetPublishToQuote = useCallback(async () => {
    if (!quotePublishDialog || !supabase || !session?.organizationId || !worksheetOpportunityId || !canWriteWorksheet) {
      setError("You do not have permission to publish worksheet rows to a quote.");
      setMessage(null);
      return;
    }

    const includedLines = quotePublishDialog.lines;
    if (includedLines.length === 0) {
      setError("Add at least one commercial line before adding it to a quote.");
      setMessage(null);
      return;
    }

    if (quotePublishTargetMode === "existing" && quotePublishTargetIds.length === 0) {
      setError("Select at least one draft quote that should receive these worksheet rows.");
      setMessage(null);
      return;
    }

    setIsPublishingWorksheetSelection(true);
    setError(null);
    setMessage("Adding rows to quote...");

    try {
      const confirmedLines = includedLines.map((line) => {
        const description = line.description.trim();
        const quantityValue = parseWorksheetPublishDraftNumber(line.quantity);
        const rateValue = parseWorksheetPublishDraftNumber(line.rate);
        const explicitTotal = parseWorksheetPublishDraftNumber(line.total);
        const quantity = quantityValue === null ? null : normalizeCommercialQuantity(quantityValue);
        const rate = rateValue === null ? null : normalizeCommercialRate(rateValue);
        const total = explicitTotal !== null
          ? normalizeCommercialMoney(explicitTotal)
          : quantity !== null && rate !== null
          ? normalizeCommercialMoney(quantity * rate)
          : null;

        if (!description) {
          throw new Error("Enter a description.");
        }

        if (quantity === null && rate === null && total === null) {
          throw new Error("Enter at least one commercial value.");
        }

        return {
          proposalId: line.id,
          description,
          quantity,
          unit: normalizeWorksheetPublishDraftText(line.unit),
          rate,
          total,
        };
      });

      if (isDirty || !worksheetIdRef.current) {
        if (!saveWorksheetRef.current) {
          throw new Error("Save the worksheet before adding rows to a quote.");
        }

        const didSave = await saveWorksheetRef.current({ silent: true });
        if (!didSave) {
          throw new Error("Unable to save the worksheet before adding rows to the quote.");
        }
      }

      const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
      const sheetId = worksheetSheetIdRef.current;
      const sheetName =
        workbookSheetsRef.current.find((sheet) => sheet.id === sheetId)?.name?.trim() ||
        activeWorkbookSheet?.name?.trim() ||
        worksheetDisplayName;

      if (!workbookId || !sheetId) {
        throw new Error("Save the worksheet before adding rows to a quote.");
      }

      const selectionToPublish = buildPublishedWorksheetSelectionFromConfirmedLines({
        destination: "quote",
        worksheet: worksheetRef.current,
        selectionRange: quotePublishDialog.range,
        selectionRanges: quotePublishDialog.selectionRanges,
        workbookId,
        worksheetId: workbookId,
        sheetId,
        worksheetName: worksheetDisplayName,
        sheetName,
        owner: worksheetOwner,
        interpretedSelection: quotePublishDialog.interpretedSelection,
        confirmedLines,
      });

      const target: QuotePublishTarget = quotePublishTargetMode === "existing"
        ? {
            mode: "existing",
            quoteIds: quotePublishTargetIds,
          }
        : {
            mode: "new",
          };

      const publishResult = await publishWorksheetSelection({
        client: supabase,
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
        projectId: quotePublishDialog.projectId,
        workbookId,
        worksheetId: workbookId,
        sheetId,
        worksheetName: worksheetDisplayName,
        sheetName,
        worksheet: worksheetRef.current,
        selectionRange: quotePublishDialog.range,
        owner: worksheetOwner,
        selection: selectionToPublish,
        adapter: quoteDestinationAdapter,
        target,
      });

      const destinationResult = publishResult.result;
      setQuotePublishDialog(null);
      setQuotePublishTargetMode("new");
      setQuotePublishTargetIds([]);
      setMessage(
        destinationResult.partialLinkFailureMessage
          ? `${destinationResult.message} ${mapWorksheetQuotePublishErrorMessage(destinationResult.partialLinkFailureMessage)}`
          : destinationResult.message,
      );
    } catch (publishError) {
      setError(mapWorksheetQuotePublishErrorMessage(
        publishError instanceof Error ? publishError.message : "Unable to add rows to the quote right now.",
      ));
      setMessage(null);
    } finally {
      setIsPublishingWorksheetSelection(false);
    }
  }, [
    activeWorkbookSheet?.name,
    canWriteWorksheet,
    explicitWorksheetId,
    isDirty,
    quotePublishDialog,
    quotePublishTargetIds,
    quotePublishTargetMode,
    session?.organizationId,
    worksheetOpportunityId,
    supabase,
    worksheetDisplayName,
    worksheetOwner,
  ]);

  const beginWorksheetPublishToQuote = useCallback(async (
    range: WorksheetSelectionRange | null,
    selectionRanges?: WorksheetSelectionRange[],
  ) => {
    if (!range) {
      setError("Select a worksheet row or range before adding it to a quote.");
      setMessage(null);
      return;
    }

    if (!supabase || !session?.organizationId || !worksheetOpportunityId || !canWriteWorksheet) {
      setError("You do not have permission to publish worksheet rows to a quote.");
      setMessage(null);
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const publishContext = await resolveWorksheetQuotePublishContext({
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
      });
      const interpretedSelection = interpretWorksheetSelectionForPublish({
        destination: "quote",
        worksheet: worksheetRef.current,
        selectionRange: range,
        selectionRanges,
      });

      const resolution = await resolveQuotePublishTarget({
        client: supabase,
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
        projectId: publishContext.projectId,
      });

      if (resolution.kind === "blocked") {
        setError(mapWorksheetQuotePublishErrorMessage(resolution.message));
        setMessage(null);
        return;
      }

      const quotes = resolution.kind === "choose"
        ? resolution.quotes
        : await resolveQuotePublishOptions({
            client: supabase,
            organizationId: session.organizationId,
            opportunityId: worksheetOpportunityId,
          });
      const initialTargetMode = resolveInitialQuotePublishTargetMode(resolution);
      const initialTargetIds = resolveInitialQuotePublishTargetIds(resolution);
      const firstProposal = interpretedSelection.proposedLines[0];

      setQuotePublishDialog({
        projectId: publishContext.projectId,
        range,
        selectionRanges: selectionRanges && selectionRanges.length > 0 ? selectionRanges : [range],
        interpretedSelection,
        lines: [
          {
            id: firstProposal?.id ?? "selection-line-0",
            description: firstProposal?.description.value ?? "",
            quantity: formatWorksheetPublishDraftValue(firstProposal?.quantity.value),
            unit: formatWorksheetPublishDraftValue(firstProposal?.unit.value),
            rate: formatWorksheetPublishDraftValue(firstProposal?.rate.value),
            total: formatWorksheetPublishDraftValue(firstProposal?.total.value),
          },
        ],
        quotes,
      });
      setQuotePublishTargetMode(initialTargetMode);
      setQuotePublishTargetIds(initialTargetIds);
    } catch (publishError) {
      setError(mapWorksheetQuotePublishErrorMessage(
        publishError instanceof Error ? publishError.message : "Unable to prepare quote publishing.",
      ));
      setMessage(null);
    }
  }, [
    canWriteWorksheet,
    session?.organizationId,
    worksheetOpportunityId,
    supabase,
  ]);

  const executeWorksheetPublishToPurchaseOrder = useCallback(async () => {
    if (!purchaseOrderPublishDialog || !supabase || !session?.organizationId || !worksheetOpportunityId || !canWriteWorksheet) {
      setError("You do not have permission to publish worksheet rows to a purchase order.");
      setMessage(null);
      return;
    }

    const includedLines = purchaseOrderPublishDialog.lines;
    if (includedLines.length === 0) {
      setError("Add at least one commercial line before adding it to a purchase order.");
      setMessage(null);
      return;
    }

    if (!purchaseOrderPublishSupplierId) {
      setError("Select a supplier before adding rows to the purchase order.");
      setMessage(null);
      return;
    }

    if (purchaseOrderPublishTargetMode === "existing" && !purchaseOrderPublishTargetId) {
      setError("Select the draft purchase order that should receive these worksheet rows.");
      setMessage(null);
      return;
    }

    if (purchaseOrderPublishTargetMode === "new" && !purchaseOrderPublishTitle.trim()) {
      setError("Enter a purchase order title before creating a new draft.");
      setMessage(null);
      return;
    }

    setIsPublishingWorksheetSelection(true);
    setError(null);
    setMessage("Adding rows to purchase order...");

    try {
      const confirmedLines = includedLines.map((line) => {
        const description = line.description.trim();
        const quantityValue = parseWorksheetPublishDraftNumber(line.quantity);
        const rateValue = parseWorksheetPublishDraftNumber(line.rate);
        const explicitTotal = parseWorksheetPublishDraftNumber(line.total);
        const quantity = quantityValue === null ? null : normalizeCommercialQuantity(quantityValue);
        const rate = rateValue === null ? null : normalizeCommercialRate(rateValue);
        const total = explicitTotal !== null
          ? normalizeCommercialMoney(explicitTotal)
          : quantity !== null && rate !== null
          ? normalizeCommercialMoney(quantity * rate)
          : null;

        if (!description) {
          throw new Error("Enter a description.");
        }

        if (quantity === null && rate === null && total === null) {
          throw new Error("Enter at least one commercial value.");
        }

        return {
          proposalId: line.id,
          description,
          quantity,
          unit: normalizeWorksheetPublishDraftText(line.unit),
          rate,
          total,
        };
      });
      const lineSelections = includedLines.map((line) => {
        const purchaseOrderSection = line.purchaseOrderSection;
        if (!purchaseOrderSection) {
          throw new Error("Choose a procurement section.");
        }

        return {
          rowId: line.id,
          purchaseOrderSection,
        };
      });

      if (isDirty || !worksheetIdRef.current) {
        if (!saveWorksheetRef.current) {
          throw new Error("Save the worksheet before adding rows to a purchase order.");
        }

        const didSave = await saveWorksheetRef.current({ silent: true });
        if (!didSave) {
          throw new Error("Unable to save the worksheet before adding rows to the purchase order.");
        }
      }

      const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
      const sheetId = worksheetSheetIdRef.current;
      const sheetName =
        workbookSheetsRef.current.find((sheet) => sheet.id === sheetId)?.name?.trim() ||
        activeWorkbookSheet?.name?.trim() ||
        worksheetDisplayName;

      if (!workbookId || !sheetId) {
        throw new Error("Save the worksheet before adding rows to a purchase order.");
      }

      const selectionToPublish = buildPublishedWorksheetSelectionFromConfirmedLines({
        destination: "purchase_order",
        worksheet: worksheetRef.current,
        selectionRange: purchaseOrderPublishDialog.range,
        selectionRanges: purchaseOrderPublishDialog.selectionRanges,
        workbookId,
        worksheetId: workbookId,
        sheetId,
        worksheetName: worksheetDisplayName,
        sheetName,
        owner: worksheetOwner,
        interpretedSelection: purchaseOrderPublishDialog.interpretedSelection,
        confirmedLines,
      });

      const target: PurchaseOrderPublishTarget = purchaseOrderPublishTargetMode === "existing"
        ? {
            mode: "existing",
            purchaseOrderId: purchaseOrderPublishTargetId,
            supplierId: purchaseOrderPublishSupplierId,
            lineSelections,
          }
        : {
            mode: "new",
            supplierId: purchaseOrderPublishSupplierId,
            purchaseOrderTitle: purchaseOrderPublishTitle.trim(),
            lineSelections,
          };

      const publishResult = await publishWorksheetSelection({
        client: supabase,
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
        projectId: purchaseOrderPublishDialog.context.projectId,
        workbookId,
        worksheetId: workbookId,
        sheetId,
        worksheetName: worksheetDisplayName,
        sheetName,
        worksheet: worksheetRef.current,
        selectionRange: purchaseOrderPublishDialog.range,
        owner: worksheetOwner,
        selection: selectionToPublish,
        adapter: purchaseOrderDestinationAdapter,
        target,
      });

      const destinationResult = publishResult.result;
      setPurchaseOrderPublishDialog(null);
      setPurchaseOrderPublishSupplierId("");
      setPurchaseOrderPublishTitle("Worksheet Purchase Order");
      setPurchaseOrderPublishTargetMode("new");
      setPurchaseOrderPublishTargetId("");
      setMessage(
        destinationResult.partialLinkFailureMessage
          ? `${destinationResult.message} ${mapWorksheetPurchaseOrderPublishErrorMessage(destinationResult.partialLinkFailureMessage)}`
          : destinationResult.message,
      );
    } catch (publishError) {
      setError(mapWorksheetPurchaseOrderPublishErrorMessage(
        publishError instanceof Error ? publishError.message : "Unable to add rows to the purchase order.",
      ));
      setMessage(null);
    } finally {
      setIsPublishingWorksheetSelection(false);
    }
  }, [
    activeWorkbookSheet?.name,
    canWriteWorksheet,
    explicitWorksheetId,
    isDirty,
    purchaseOrderPublishDialog,
    purchaseOrderPublishSupplierId,
    purchaseOrderPublishTitle,
    purchaseOrderPublishTargetId,
    purchaseOrderPublishTargetMode,
    session?.organizationId,
    supabase,
    worksheetDisplayName,
    worksheetOpportunityId,
    worksheetOwner,
  ]);

  const beginWorksheetPublishToPurchaseOrder = useCallback(async (
    range: WorksheetSelectionRange | null,
    selectionRanges?: WorksheetSelectionRange[],
  ) => {
    if (!range) {
      setError("Select a worksheet row or range before adding it to a purchase order.");
      setMessage(null);
      return;
    }

    if (!supabase || !session?.organizationId || !canWriteWorksheet) {
      setError("You do not have permission to publish worksheet rows to a purchase order.");
      setMessage(null);
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const publishContext = await resolveWorksheetPurchaseOrderPublishContext({
        owner: worksheetOwner,
      });

      const interpretedSelection = interpretWorksheetSelectionForPublish({
        destination: "purchase_order",
        worksheet: worksheetRef.current,
        selectionRange: range,
        selectionRanges,
      });
      const options = await resolvePurchaseOrderPublishOptions({
        client: supabase,
        organizationId: session.organizationId,
        projectId: publishContext.projectId,
      });

      const firstProposal = interpretedSelection.proposedLines[0];
      const lines: WorksheetPublishConfirmationLineDraft[] = [
        {
          id: firstProposal?.id ?? "selection-line-0",
          description: firstProposal?.description.value ?? "",
          quantity: formatWorksheetPublishDraftValue(firstProposal?.quantity.value),
          unit: formatWorksheetPublishDraftValue(firstProposal?.unit.value),
          rate: formatWorksheetPublishDraftValue(firstProposal?.rate.value),
          total: formatWorksheetPublishDraftValue(firstProposal?.total.value),
          purchaseOrderSection: "",
        },
      ];

      setPurchaseOrderPublishDialog({
        context: {
          projectId: publishContext.projectId,
          projectSlug: publishContext.projectSlug,
        },
        range,
        selectionRanges: selectionRanges && selectionRanges.length > 0 ? selectionRanges : [range],
        interpretedSelection,
        lines,
        suppliers: options.suppliers.map((supplier) => ({
          id: supplier.id,
          label: supplier.label,
        })),
        draftPurchaseOrders: options.draftPurchaseOrders,
      });
      setPurchaseOrderPublishSupplierId("");
      setPurchaseOrderPublishTitle("Worksheet Purchase Order");
      setPurchaseOrderPublishTargetMode("new");
      setPurchaseOrderPublishTargetId("");
    } catch (publishError) {
      setError(mapWorksheetPurchaseOrderPublishErrorMessage(
        publishError instanceof Error ? publishError.message : "Unable to prepare purchase order publishing.",
      ));
      setMessage(null);
    }
  }, [
    canWriteWorksheet,
    session?.organizationId,
    supabase,
    worksheetOwner,
  ]);

  // Retained for the legacy inferred-selection dialogs; commercial mapping uses
  // the explicit publishers above and never routes through inference.
  void beginWorksheetPublishToQuote;
  void beginWorksheetPublishToPurchaseOrder;

  const executeWorksheetPublishToVariation = useCallback(async () => {
    if (!variationPublishDialog || !supabase || !session?.organizationId || !canWriteWorksheet) {
      setError("You do not have permission to publish worksheet rows to a variation.");
      setMessage(null);
      return;
    }

    const includedLines = variationPublishDialog.lines;
    if (includedLines.length === 0) {
      setError("Add at least one commercial line before adding it to the variation.");
      setMessage(null);
      return;
    }

    setIsPublishingWorksheetSelection(true);
    setError(null);
    setMessage("Adding rows to variation...");

    try {
      const confirmedLines = includedLines.map((line) => {
        const description = line.description.trim();
        const quantityValue = parseWorksheetPublishDraftNumber(line.quantity);
        const rateValue = parseWorksheetPublishDraftNumber(line.rate);
        const explicitTotal = parseWorksheetPublishDraftNumber(line.total);
        const quantity = quantityValue === null ? null : normalizeCommercialQuantity(quantityValue);
        const rate = rateValue === null ? null : normalizeCommercialRate(rateValue);
        const total = explicitTotal !== null
          ? normalizeCommercialMoney(explicitTotal)
          : quantity !== null && rate !== null
          ? normalizeCommercialMoney(quantity * rate)
          : null;

        if (!description) {
          throw new Error("Enter a description.");
        }

        if (quantity === null && rate === null && total === null) {
          throw new Error("Enter at least one commercial value.");
        }

        return {
          proposalId: line.id,
          description,
          quantity,
          unit: normalizeWorksheetPublishDraftText(line.unit),
          rate,
          total,
        };
      });
      const lineSelections = includedLines.map((line) => ({
        rowId: line.id,
        section: line.section,
      }));

      if (isDirty || !worksheetIdRef.current) {
        if (!saveWorksheetRef.current) {
          throw new Error("Save the worksheet before adding rows to the variation.");
        }

        const didSave = await saveWorksheetRef.current({ silent: true });
        if (!didSave) {
          throw new Error("Unable to save the worksheet before adding rows to the variation.");
        }
      }

      const workbookId = explicitWorksheetId ?? worksheetIdRef.current;
      const sheetId = worksheetSheetIdRef.current;
      const sheetName =
        workbookSheetsRef.current.find((sheet) => sheet.id === sheetId)?.name?.trim() ||
        activeWorkbookSheet?.name?.trim() ||
        worksheetDisplayName;

      if (!workbookId || !sheetId) {
        throw new Error("Save the worksheet before adding rows to the variation.");
      }

      const selectionToPublish = buildPublishedWorksheetSelectionFromConfirmedLines({
        destination: "variation",
        worksheet: worksheetRef.current,
        selectionRange: variationPublishDialog.range,
        selectionRanges: variationPublishDialog.selectionRanges,
        workbookId,
        worksheetId: workbookId,
        sheetId,
        worksheetName: worksheetDisplayName,
        sheetName,
        owner: worksheetOwner,
        interpretedSelection: variationPublishDialog.interpretedSelection,
        confirmedLines,
      });

      const target: VariationPublishTarget = {
        variationId: variationPublishDialog.context.variationId,
        lineSelections,
      };

      const publishResult = await publishWorksheetSelection({
        client: supabase,
        organizationId: session.organizationId,
        opportunityId: variationPublishDialog.context.opportunityId,
        projectId: variationPublishDialog.context.projectId,
        workbookId,
        worksheetId: workbookId,
        sheetId,
        worksheetName: worksheetDisplayName,
        sheetName,
        worksheet: worksheetRef.current,
        selectionRange: variationPublishDialog.range,
        owner: worksheetOwner,
        selection: selectionToPublish,
        adapter: variationDestinationAdapter,
        target,
      });

      const destinationResult = publishResult.result;
      setVariationPublishDialog(null);
      setMessage(
        destinationResult.partialLinkFailureMessage
          ? `${destinationResult.message} ${mapWorksheetVariationPublishErrorMessage(destinationResult.partialLinkFailureMessage)}`
          : destinationResult.message,
      );
    } catch (publishError) {
      setError(mapWorksheetVariationPublishErrorMessage(
        publishError instanceof Error ? publishError.message : "Unable to add rows to the variation.",
      ));
      setMessage(null);
    } finally {
      setIsPublishingWorksheetSelection(false);
    }
  }, [
    activeWorkbookSheet?.name,
    canWriteWorksheet,
    explicitWorksheetId,
    isDirty,
    session?.organizationId,
    supabase,
    variationPublishDialog,
    worksheetDisplayName,
    worksheetOwner,
  ]);

  const beginWorksheetPublishToVariation = useCallback(async (
    range: WorksheetSelectionRange | null,
    selectionRanges?: WorksheetSelectionRange[],
  ) => {
    if (!range) {
      setError("Select a worksheet row or range before adding it to the variation.");
      setMessage(null);
      return;
    }

    if (!supabase || !canWriteWorksheet) {
      setError("You do not have permission to publish worksheet rows to a variation.");
      setMessage(null);
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const publishContext = await resolveWorksheetVariationPublishContext({
        owner: worksheetOwner,
      });
      const interpretedSelection = interpretWorksheetSelectionForPublish({
        destination: "variation",
        worksheet: worksheetRef.current,
        selectionRange: range,
        selectionRanges,
      });

      const firstProposal = interpretedSelection.proposedLines[0];
      const defaultSection = normalizeVariationPublishSection(
        firstProposal?.sectionHeading ?? null,
      );

      setVariationPublishDialog({
        context: {
          opportunityId: publishContext.opportunityId,
          projectId: publishContext.projectId,
          projectSlug: publishContext.projectSlug,
          variationId: publishContext.variationId,
          variationNumber: publishContext.variationNumber,
          variationTitle: publishContext.variationTitle,
          variationStatus: publishContext.variationStatus,
        },
        range,
        selectionRanges: selectionRanges && selectionRanges.length > 0 ? selectionRanges : [range],
        interpretedSelection,
        lines: [
          {
            id: firstProposal?.id ?? "selection-line-0",
            description: firstProposal?.description.value ?? "",
            quantity: formatWorksheetPublishDraftValue(firstProposal?.quantity.value),
            unit: formatWorksheetPublishDraftValue(firstProposal?.unit.value),
            rate: formatWorksheetPublishDraftValue(firstProposal?.rate.value),
            total: formatWorksheetPublishDraftValue(firstProposal?.total.value),
            section: defaultSection,
          },
        ],
      });
    } catch (publishError) {
      setError(mapWorksheetVariationPublishErrorMessage(
        publishError instanceof Error ? publishError.message : "Unable to prepare variation publishing.",
      ));
      setMessage(null);
    }
  }, [
    canWriteWorksheet,
    supabase,
    worksheetOwner,
  ]);
  // Retained until the explicit Variation mapping browser and regression suites
  // prove the inferred-selection path can be deleted safely.
  void beginWorksheetPublishToVariation;

  const confirmDiscardUnsavedChanges = useCallback(() => {
    if (!hasUnsavedWorksheetChanges) {
      return true;
    }

    return window.confirm(
      "You have unsaved pricing worksheet changes. Leave this page and discard those local edits?"
    );
  }, [hasUnsavedWorksheetChanges]);

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
    if (!hasUnsavedWorksheetChanges) {
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
  }, [hasUnsavedWorksheetChanges]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!hasUnsavedWorksheetChanges || event.defaultPrevented) {
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
  }, [confirmDiscardUnsavedChanges, hasUnsavedWorksheetChanges]);

  useEffect(() => {
    if (onDirtyStateChange) {
      return;
    }

    const handlePopState = () => {
      const previousHref = locationHrefRef.current || window.location.href;
      const nextHref = window.location.href;
      locationHrefRef.current = nextHref;

      if (!hasUnsavedWorksheetChanges) {
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
  }, [confirmDiscardUnsavedChanges, hasUnsavedWorksheetChanges, onDirtyStateChange]);

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
  const activeDescendantCellId = useMemo(() => {
    if (!selectedSingleCellKey) {
      return undefined;
    }
    const parsed = parseWorksheetCellKey(selectedSingleCellKey);
    if (
      !parsed ||
      !virtualRows.virtualRows.some(({ row }) => row.id === parsed.rowId) ||
      !virtualColumns.visibleColumns.some((column) => column.id === parsed.columnId)
    ) {
      return undefined;
    }
    return `worksheet-cell-${selectedSingleCellKey}`;
  }, [selectedSingleCellKey, virtualColumns.visibleColumns, virtualRows.virtualRows]);

  useEffect(() => {
    if (isLoadingWorksheet) {
      return;
    }

    const scopeKey = `${session?.organizationId ?? "unknown"}:${worksheetOpportunityId ?? "unknown"}:${explicitWorksheetId ?? "legacy"}`;
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
    worksheetOpportunityId,
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
    selectionStateRef.current = selectionState;
  }, [selectionState]);

  useEffect(() => {
    pricingSummaryRef.current = pricingSummary;
  }, [pricingSummary]);

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

  useEffect(() => {
    if (!isWorksheetNameEditorOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || worksheetNameEditorRef.current?.contains(target)) {
        return;
      }

      isWorksheetTitleEditingRef.current = false;
      setIsWorksheetNameEditorOpen(false);
      void worksheetTitleAutosaveControllerRef.current?.flush();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isWorksheetNameEditorOpen]);

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
    formulaReferenceDragSelectionRef.current = null;
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

  const preserveWorksheetViewportScroll = useCallback(() => {
    const viewport = worksheetViewportRef.current;
    if (!viewport) {
      return;
    }

    const scrollLeft = viewport.scrollLeft;
    const scrollTop = viewport.scrollTop;
    suppressSelectionAutoScrollRef.current = true;

    requestAnimationFrame(() => {
      const nextViewport = worksheetViewportRef.current;
      if (nextViewport) {
        nextViewport.scrollLeft = scrollLeft;
        nextViewport.scrollTop = scrollTop;
        setWorksheetViewportScrollLeft(scrollLeft);
        setWorksheetViewportScrollTop(scrollTop);
      }

      requestAnimationFrame(() => {
        suppressSelectionAutoScrollRef.current = false;
      });
    });
  }, []);

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
    if (
      !viewport ||
      !focusCellKey ||
      activeCellKey ||
      suppressSelectionAutoScrollRef.current ||
      resizingColumnId ||
      resizingRowId ||
      columnResizePreviewWidth !== null ||
      rowResizePreviewHeight !== null
    ) {
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
    columnResizePreviewWidth,
    normalizedWorksheetZoom,
    resizingColumnId,
    resizingRowId,
    rowOffsets,
    rowResizePreviewHeight,
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

    if (!supabase || !session?.organizationId || !worksheetOpportunityId) {
      setIsLoadingWorksheet(false);
      setError("Unable to load the pricing worksheet right now.");
      return;
    }

    const scopeKey = `${session.organizationId}:${worksheetOpportunityId}:${explicitWorksheetId ?? "legacy"}`;
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
        const workbook = await loadOpportunityPricingWorkbook({
          supabase,
          organizationId,
          opportunityId: worksheetOpportunityId,
          projectId: worksheetProjectId,
          projectOwned: worksheetOwner.ownerType === "project",
          quoteId: worksheetOwner.quoteId,
          variationId: worksheetOwner.variationId,
          workbookId: explicitWorksheetId ?? null,
        });
        endSupabaseQueryMeasure({
          foundWorksheet: Boolean(workbook),
          hasError: false,
        });

        if (
          !isWorksheetBoardMountedRef.current ||
          activeWorksheetLoadScopeKeyRef.current !== scopeKey
        ) {
          return;
        }

        if (!workbook) {
          if (explicitWorksheetId) {
            pendingLearningWritesRef.current = [];
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
          worksheetIdRef.current = null;
          setWorksheetSheetId(null);
          worksheetSheetIdRef.current = null;
          persistedLastActiveWorkbookIdRef.current = null;
          persistedLastActiveSheetIdRef.current = null;
          setWorkbookSheets([]);
          setWorksheetName(null);
          synchronizeLoadedWorksheetTitle({
            sheetId: null,
            title: "Pricing Worksheet",
            updatedAt: null,
          });
          setWorksheetTradePackage(null);
          setWorksheet(blankWorksheet);
          loadedWorksheetScopeKeyRef.current = scopeKey;
          pendingLearningWritesRef.current = [];
          const nextPricingSummary = deriveWorksheetPricingSummary(
            blankWorksheet,
            createDefaultWorksheetPricingSummary(),
          );
          pricingSummaryRef.current = nextPricingSummary;
          setPricingSummary(nextPricingSummary);
          setExtractedPricingData(createDefaultWorksheetExtractedPricingData(blankWorksheet.version));
          setLastSavedAt(null);
          setIsDirty(false);
          resetWorksheetViewState(blankWorksheet);
          resetAiPreviewState();
          setIsAiDialogOpen(false);
          updateSheetUrlState(null);
          return;
        }
        const requestedSheetId = requestedSheetIdRef.current;
        const editorRecord = buildOpportunityPricingWorkbookEditorRecord(workbook, requestedSheetId);
        const endNormalizeMeasure = startPricingWorksheetPerformanceMeasure("normalizeWorksheetData", {
          scopeKey,
          worksheetId: editorRecord.workbookId,
        });
        const normalizedWorksheet = normalizeWorksheetData(editorRecord.worksheet as unknown as Json);
        endNormalizeMeasure({
          cellCount: Object.keys(normalizedWorksheet.cells).length,
          rowCount: normalizedWorksheet.rows.length,
          columnCount: normalizedWorksheet.columns.length,
        });
        const endFormulaMeasure = startPricingWorksheetPerformanceMeasure("recalculateWorksheetFormulas", {
          scopeKey,
          worksheetId: editorRecord.workbookId,
        });
        const loadedWorksheet = recalculateWorksheetFormulas(normalizedWorksheet);
        endFormulaMeasure({
          cellCount: Object.keys(loadedWorksheet.cells).length,
          rowCount: loadedWorksheet.rows.length,
          columnCount: loadedWorksheet.columns.length,
        });
        pendingLearningWritesRef.current = [];
        setWorksheet(loadedWorksheet);
        worksheetRef.current = loadedWorksheet;
        loadedWorksheetScopeKeyRef.current = scopeKey;
        hydrateWorkbookEditorState(workbook, editorRecord.sheetId);
        updateSheetUrlState(editorRecord.sheetId);
      } catch (loadWorksheetError) {
        if (
          isWorksheetBoardMountedRef.current &&
          activeWorksheetLoadScopeKeyRef.current === scopeKey
        ) {
          setError(mapPricingWorksheetUiErrorMessage(loadWorksheetError, "Unable to load the pricing worksheet."));
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
  }, [
    explicitWorksheetId,
    hydrateWorkbookEditorState,
    isAuthLoading,
    resetAiPreviewState,
    resetWorksheetViewState,
    session?.organizationId,
    worksheetOpportunityId,
    supabase,
    synchronizeLoadedWorksheetTitle,
    updateSheetUrlState,
  ]);

  const applyCommittedWorksheetChange = useCallback((
    mutator: (current: WorksheetData) => WorksheetData,
    options?: {
      recalculateFormulas?: boolean;
      validateFormulaOutputs?: boolean;
      trackLearning?: boolean;
      occurredAt?: string;
      mappedAction?: "measure";
    }
  ) => {
    const isAuthorizedMappedMeasureCommit =
      options?.mappedAction === "measure" && activeWorksheetMapping?.kind === "measure" && canWriteWorksheet;
    if (!canMutateWorksheet && !isAuthorizedMappedMeasureCommit) {
      return {
        committed: false,
        changed: false,
        message: isWorksheetMappingMode ? "Worksheet changes are disabled during Mapping Mode." : "You do not have permission to edit this worksheet.",
      } satisfies WorksheetCommitResult;
    }
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

    const committedWorksheet = options?.trackLearning
      ? persistWorksheetLearningArtifacts({
          clientMutationId: buildWorksheetClientMutationId(),
          previousWorksheet: mutationResult.previousWorksheet,
          nextWorksheet: mutationResult.nextWorksheet,
          occurredAt: options.occurredAt,
        })
      : mutationResult.nextWorksheet;

    const nextHistory = commitWorksheetHistoryEntry({
      changed: true,
      future: historyFutureRef.current,
      historyLimit: WORKSHEET_HISTORY_LIMIT,
      past: historyPastRef.current,
      previousWorksheet: mutationResult.previousWorksheet,
    });

    historyPastRef.current = nextHistory.past;
    historyFutureRef.current = nextHistory.future;
    worksheetRef.current = committedWorksheet;
    worksheetMutationRevisionRef.current += 1;
    const nextPricingSummary = deriveWorksheetPricingSummary(committedWorksheet, pricingSummaryRef.current, {
      calculatedAt: new Date().toISOString(),
    });
    pricingSummaryRef.current = nextPricingSummary;
    setWorksheet(committedWorksheet);
    setPricingSummary(nextPricingSummary);
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
      worksheet: committedWorksheet,
    } satisfies WorksheetCommitResult;
  }, [activeWorksheetMapping?.kind, canMutateWorksheet, canWriteWorksheet, explicitWorksheetId, isWorksheetMappingMode, persistWorksheetLearningArtifacts, worksheetId]);

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
    }, { trackLearning: true });
  }, [applyCommittedWorksheetChange]);

  const focusWorksheetSurface = useCallback((options?: { immediate?: boolean }) => {
    const focus = () => {
      focusElementWithoutScroll(worksheetSurfaceRef.current);
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
    worksheetMutationRevisionRef.current += 1;

    setHistoryPast(nextPast);
    setHistoryFuture(nextFuture);
    setWorksheet(restoredWorksheet);
    const nextPricingSummary = deriveWorksheetPricingSummary(restoredWorksheet, pricingSummaryRef.current, {
      calculatedAt: new Date().toISOString(),
    });
    pricingSummaryRef.current = nextPricingSummary;
    setPricingSummary(nextPricingSummary);
    setIsDirty(true);
    setError(null);
    setMessage(null);
    setActiveCellKey(null);
    setActiveEditor(null);
    setEditingCellValue("");
    isFormulaReferencePickArmedRef.current = false;
    focusWorksheetSurface();
  }, [focusWorksheetSurface]);

  const focusFormulaBar = useCallback((options?: {
    selectAll?: boolean;
    selection?: WorksheetTextSelection;
  }) => {
    requestAnimationFrame(() => {
      const input = formulaBarRef.current;
      if (!input) {
        return;
      }

      focusElementWithoutScroll(input);

      if (options?.selection) {
        input.setSelectionRange(options.selection.start, options.selection.end);
      } else if (options?.selectAll) {
        input.select();
      } else {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    });
  }, []);

  const focusInputCell = useCallback((cellKey: string | null, options?: {
    selectAll?: boolean;
    selection?: WorksheetTextSelection;
  }) => {
    if (!cellKey) {
      return;
    }

    requestAnimationFrame(() => {
      const input = inputRefs.current[cellKey];
      if (!input) {
        return;
      }

      focusElementWithoutScroll(input);

      if (options?.selection) {
        input.setSelectionRange(options.selection.start, options.selection.end);
        return;
      }

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

  const isFormulaEditing = shouldShowFormulaReferenceHighlights({
    activeCellKey,
    activeEditor,
    editingValue: editingCellValue,
  });

  const isFormulaReferenceMode =
    isFormulaEditing && activeCellKey !== null;

  const updateFormulaReferencePickState = useCallback((
    value: string,
    selection: WorksheetTextSelection,
  ) => {
    editingCellValueRef.current = value;
    editorTextSelectionRef.current = selection;
    isFormulaReferencePickArmedRef.current = Boolean(
      getWorksheetFormulaReferencePickContext(value, selection),
    );
  }, []);

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
    options?: {
      editor?: "cell" | "formulaBar";
      focus?: boolean;
      selection?: WorksheetTextSelection;
    }
  ) => {
    if (!canMutateWorksheet) {
      return;
    }

    const nextEditor = options?.editor ?? "cell";
    const originalValue = getRawCellInput(cell);
    editingSessionRef.current = {
      cellKey,
      originalValue,
    };
    const nextSelection = options?.selection ?? {
      start: originalValue.length,
      end: originalValue.length,
    };
    updateFormulaReferencePickState(originalValue, nextSelection);
    setActiveCellKey(cellKey);
    setActiveEditor(nextEditor);
    replaceSelection(cellKey, cellKey);
    setEditingCellValue(originalValue);

    if (options?.focus === false) {
      return;
    }

    if (nextEditor === "formulaBar") {
      focusFormulaBar({ selectAll: false, selection: nextSelection });
      return;
    }

    focusInputCell(cellKey, {
      selectAll: false,
      selection: nextSelection,
    });
  }, [canMutateWorksheet, focusFormulaBar, focusInputCell, replaceSelection, updateFormulaReferencePickState]);

  const cancelCellEdit = useCallback((cellKey?: string | null) => {
    const session = editingSessionRef.current;
    const targetCellKey = session?.cellKey ?? cellKey ?? activeCellKey;
    const formulaBar = formulaBarRef.current;
    if (activeEditor === "formulaBar" && formulaBar && formulaBar === document.activeElement) {
      suppressFormulaBarBlurCommitRef.current = true;
      formulaBar.blur();
    }
    if (targetCellKey) {
      const input = inputRefs.current[targetCellKey];
      if (input && input === document.activeElement) {
        suppressBlurCommitCellKeyRef.current = targetCellKey;
        input.blur();
      }
    }

    editingSessionRef.current = null;
    editorTextSelectionRef.current = null;
    isFormulaReferencePickArmedRef.current = false;
    setActiveCellKey(null);
    setActiveEditor(null);
    setEditingCellValue("");
    if (targetCellKey) {
      replaceSelection(targetCellKey, targetCellKey);
    }
    focusWorksheetSurface();
  }, [activeCellKey, activeEditor, focusWorksheetSurface, replaceSelection]);

  const commitCellEdit = useCallback((cellKey: string, nextValue: string, nextSelectedCellKey?: string | null) => {
    const formulaBar = formulaBarRef.current;
    if (formulaBar && formulaBar === document.activeElement) {
      suppressFormulaBarBlurCommitRef.current = true;
      formulaBar.blur();
    }

    const activeInput = inputRefs.current[cellKey];
    if (activeInput && activeInput === document.activeElement) {
      suppressBlurCommitCellKeyRef.current = cellKey;
      activeInput.blur();
    }

    if (!isCellCommitNoOp(worksheetRef.current.cells[cellKey], nextValue)) {
      updateCell(cellKey, nextValue);
    }
    setActiveCellKey((current) => (current === cellKey ? null : current));
    setActiveEditor(null);
    setEditingCellValue("");
    editingSessionRef.current = null;
    editorTextSelectionRef.current = null;
    isFormulaReferencePickArmedRef.current = false;
    replaceSelection(nextSelectedCellKey ?? cellKey, nextSelectedCellKey ?? cellKey);
    focusWorksheetSurface({ immediate: true });
  }, [focusWorksheetSurface, replaceSelection, updateCell]);

  const handleWorksheetPaste = (event: ReactClipboardEvent<HTMLElement>) => {
    if (!canMutateWorksheet) {
      return;
    }

    const target = event.target;
    const isTextEditingTarget =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (!canHandleWorksheetNavigation({
      hasActiveEditor: Boolean(activeCellKey),
      isTextEditingTarget,
    })) {
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
      replaceSelection(anchorCellKey, anchorCellKey);
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
    }, { trackLearning: true });

    if (activeCellKey) {
      suppressBlurCommitCellKeyRef.current = activeCellKey;
    }
    setActiveCellKey(null);
    setActiveEditor(null);
    setEditingCellValue("");
    replaceSelection(anchorCellKey, anchorCellKey);
    focusWorksheetSurface();
  };

  const appendCellReferenceToFormula = useCallback((cellReference: string) => {
    if (!isFormulaReferenceMode || !activeCellKey) {
      return;
    }

    handledFormulaReferenceMouseDownRef.current = true;
    if (cellReference === activeCellKey) {
      return;
    }
    if (!isFormulaReferencePickArmedRef.current) {
      return;
    }

    const baseValue = editingCellValueRef.current;
    const baseSelection = editorTextSelectionRef.current;
    const insertion = applyWorksheetFormulaReferencePickTransaction({
      value: baseValue,
      selection: baseSelection,
      reference: cellReference,
    });
    isFormulaReferencePickArmedRef.current = false;
    if (insertion.action === "noop") {
      return;
    }

    didDragSelectionRef.current = false;
    isDraggingSelectionRef.current = true;
    rangeDragAnchorCellKeyRef.current = cellReference;
    formulaReferenceDragAnchorCellKeyRef.current = cellReference;
    formulaReferenceDragBaseValueRef.current = baseValue;
    formulaReferenceDragSelectionRef.current = baseSelection;
    setIsDraggingSelection(true);
    editorTextSelectionRef.current = insertion.selection;
    editingCellValueRef.current = insertion.value;
    setEditingCellValue(insertion.value);

    if (activeEditor === "formulaBar") {
      focusFormulaBar({ selectAll: false, selection: insertion.selection });
      return;
    }

    focusInputCell(activeCellKey, { selectAll: false, selection: insertion.selection });
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
    const shouldWrap = (cellFormat.text?.wrap ?? "wrap") === "wrap";
    const singleLineHeight = WORKSHEET_CELL_LINE_HEIGHT + WORKSHEET_CELL_VERTICAL_PADDING;
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
        wrappedHeight: shouldWrap
          ? estimatedLineCount * WORKSHEET_CELL_LINE_HEIGHT + WORKSHEET_CELL_VERTICAL_PADDING
          : singleLineHeight,
      };
    }

    measureNode.style.fontWeight = cellFormat.text?.bold ? "700" : "400";
    measureNode.style.fontStyle = cellFormat.text?.italic ? "italic" : "normal";
    measureNode.style.fontSize = cellFormat.text?.fontSize
      ? `${cellFormat.text.fontSize}px`
      : "";
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
      wrappedHeight: shouldWrap ? wrappedHeight : singleLineHeight,
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
    preserveWorksheetViewportScroll();
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
  }, [applyCommittedWorksheetChange, measureWorksheetCellLayout, preserveWorksheetViewportScroll]);

  const autoFitRow = useCallback((event: ReactMouseEvent<HTMLButtonElement>, rowId: string) => {
    event.preventDefault();
    event.stopPropagation();
    preserveWorksheetViewportScroll();
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
  }, [applyCommittedWorksheetChange, measureWorksheetCellLayout, preserveWorksheetViewportScroll]);

  const openWorksheetNameEditor = () => {
    if (!canMutateWorksheet) return;
    isWorksheetTitleEditingRef.current = true;
    setIsWorksheetNameEditorOpen(true);
  };

  const updateWorksheetNameDraft = (nextTitle: string) => {
    worksheetTitleDraftRef.current = nextTitle;
    setWorksheetTitleDraft(nextTitle);
    worksheetTitleAutosaveControllerRef.current?.setDraft(nextTitle);
  };

  const applyWorksheetNameDraft = () => {
    isWorksheetTitleEditingRef.current = false;
    setIsWorksheetNameEditorOpen(false);
    void worksheetTitleAutosaveControllerRef.current?.flush();
  };

  const restoreConfirmedWorksheetName = () => {
    const confirmedTitle = worksheetTitleAutosaveControllerRef.current?.getSnapshot().confirmedTitle
      ?? worksheetTitleAutosave.confirmedTitle;
    isWorksheetTitleEditingRef.current = false;
    worksheetTitleAutosaveControllerRef.current?.escape();
    worksheetTitleDraftRef.current = confirmedTitle;
    setWorksheetTitleDraft(confirmedTitle);
    setIsWorksheetNameEditorOpen(false);
  };

  const beginColumnResize = (event: ReactMouseEvent<HTMLButtonElement>, columnId: string, width: number) => {
    if (!canMutateWorksheet) return;
    event.preventDefault();
    event.stopPropagation();
    preserveWorksheetViewportScroll();
    setResizingColumnId(columnId);
    setColumnResizeStartX(event.clientX);
    setColumnResizeStartWidth(width);
    setColumnResizePreviewWidth(width);
  };

  const beginRowResize = useCallback((event: ReactMouseEvent<HTMLButtonElement>, rowId: string, height: number) => {
    if (!canMutateWorksheet) return;
    event.preventDefault();
    event.stopPropagation();
    preserveWorksheetViewportScroll();
    setResizingRowId(rowId);
    setRowResizeStartY(event.clientY);
    setRowResizeStartHeight(height);
    setRowResizePreviewHeight(height);
  }, [canMutateWorksheet, preserveWorksheetViewportScroll]);

  const commitActiveEditIfNeeded = useCallback(() => {
    if (!activeCellKey) {
      return;
    }

    suppressBlurCommitCellKeyRef.current = activeCellKey;
    commitCellEdit(activeCellKey, editingCellValue);
  }, [activeCellKey, commitCellEdit, editingCellValue]);

  const captureSidePanelTarget = useCallback((cellAddress: string): PricingWorksheetMaterialTarget | null => {
    const currentWorkbookId = explicitWorksheetId ?? worksheetIdRef.current;
    const currentSheetId = worksheetSheetIdRef.current;
    if (!currentWorkbookId || !currentSheetId || !getWorksheetAnchorPosition(worksheetRef.current, cellAddress)) {
      return null;
    }
    const current = worksheetRef.current;
    return {
      workbookId: currentWorkbookId,
      sheetId: currentSheetId,
      cellAddress,
      cell: current.cells[cellAddress]
        ? { ...current.cells[cellAddress], metadata: { ...current.cells[cellAddress]?.metadata } } as WorksheetCell
        : null,
      structureKey: `${current.columns.map((column) => column.id).join(",")}|${current.rows.map((row) => row.id).join(",")}`,
    };
  }, [explicitWorksheetId]);

  const openMaterialLibrary = useCallback(() => {
    if (commercialMapping.session || variationCommercialMapping.session) {
      setError("Cancel Commercial Mapping Mode before opening the Material Library.");
      return;
    }
    commitActiveEditIfNeeded();
    setIsAiChatOpen(false);
    measureMapping.cancel();
    setMeasureMappingHighlightField(null);
    consumedMaterialTargetRef.current = null;
    setMaterialTarget(selectedSingleCellKey ? captureSidePanelTarget(selectedSingleCellKey) : null);
    setActiveSidePanel("materials");
  }, [captureSidePanelTarget, commercialMapping.session, commitActiveEditIfNeeded, measureMapping, selectedSingleCellKey, variationCommercialMapping.session]);

  const closeMaterialLibrary = useCallback(() => {
    setActiveSidePanel(null);
    setMaterialTarget(null);
    consumedMaterialTargetRef.current = null;
  }, []);

  const openMeasureDrawer = useCallback(() => {
    if (commercialMapping.session) {
      closeCommercialMapping();
    }
    if (variationCommercialMapping.session) {
      closeVariationCommercialMapping();
    }
    commitActiveEditIfNeeded();
    setIsAiChatOpen(false);
    setIsAiDialogOpen(false);
    consumedMaterialTargetRef.current = null;
    setMaterialTarget(null);
    const currentWorkbookId = explicitWorksheetId ?? worksheetIdRef.current;
    const currentSheetId = worksheetSheetIdRef.current;
    if (!currentWorkbookId || !currentSheetId) {
      setError("Save the pricing workbook before mapping Measures.");
      return;
    }
    measureMapping.start({ workbookId: currentWorkbookId, sheetId: currentSheetId, structureKey: buildWorksheetStructureKey(worksheetRef.current) });
    setMeasureMappingHighlightField(null);
    setActiveSidePanel("measures");
  }, [closeCommercialMapping, closeVariationCommercialMapping, commercialMapping.session, commitActiveEditIfNeeded, explicitWorksheetId, measureMapping, variationCommercialMapping.session]);

  const closeMeasureDrawer = useCallback(() => {
    setActiveSidePanel(null);
    measureMapping.cancel();
    setMeasureMappingHighlightField(null);
    requestAnimationFrame(() => worksheetSurfaceRef.current?.focus({ preventScroll: true }));
  }, [measureMapping]);

  const insertMaterialPrice = useCallback((item: PricingWorksheetMaterialPickerItem) => {
    const target = materialTarget;
    if (!target || !canMutateWorksheet) return false;
    const currentSheetId = worksheetSheetIdRef.current;
    const current = worksheetRef.current;
    const currentStructureKey = `${current.columns.map((column) => column.id).join(",")}|${current.rows.map((row) => row.id).join(",")}`;
    if (
      currentSheetId !== target.sheetId ||
      currentStructureKey !== target.structureKey ||
      !getWorksheetAnchorPosition(current, target.cellAddress)
    ) {
      setError("The selected Material insertion cell is no longer available. Select a new cell and try again.");
      return false;
    }
    try {
      const commitResult = applyCommittedWorksheetChange((worksheetData) => ({
        ...worksheetData,
        cells: {
          ...worksheetData.cells,
          [target.cellAddress]: buildMaterialEstimatingRateWorksheetCell({
            existingCell: worksheetData.cells[target.cellAddress],
            item,
            bindingId: crypto.randomUUID(),
          }),
        },
      }), { trackLearning: true });
      if (!commitResult.committed || !commitResult.changed) return false;
      replaceSelection(target.cellAddress, target.cellAddress);
      consumedMaterialTargetRef.current = `${target.sheetId}:${target.cellAddress}`;
      setMaterialTarget(null);
      setMessage(`${item.materialName} price inserted into ${target.cellAddress}. Save the workbook to preserve its source.`);
      return true;
    } catch (insertionError) {
      setError(insertionError instanceof Error ? insertionError.message : "Unable to insert the Material price.");
      return false;
    }
  }, [applyCommittedWorksheetChange, canMutateWorksheet, materialTarget, replaceSelection]);

  const insertMeasureValue = useCallback((
    source: PricingWorksheetMeasureSource,
    confirmedConflictSignature?: string,
  ): PricingWorksheetMeasureInsertResult => {
    const mappingSession = measureMapping.session;
    if (!mappingSession || !canWriteWorksheet) return { status: "blocked" };
    const currentSheetId = worksheetSheetIdRef.current;
    const current = worksheetRef.current;
    const currentWorkbookId = explicitWorksheetId ?? worksheetIdRef.current;
    const validation = validatePricingWorksheetMeasureMappings({
      session: mappingSession,
      worksheet: current,
      workbookId: currentWorkbookId,
      sheetId: currentSheetId,
    });
    if (validation.error) {
      setError(validation.error);
      return { status: "blocked" };
    }
    const targetKeys = validation.entries.map(({ target }) => target.cellKey);
    const conflicts = buildPricingWorksheetMeasureInsertConflicts(current, validation.entries);
    const conflictSignature = buildPricingWorksheetMeasureConflictSignature(conflicts);
    if (conflicts.length > 0 && confirmedConflictSignature !== conflictSignature) {
      return { status: "conflicts", conflicts, signature: conflictSignature };
    }
    if (confirmedConflictSignature !== undefined && confirmedConflictSignature !== conflictSignature) {
      setError("A mapped worksheet cell changed while confirmation was open. Review the destinations and try again.");
      return { status: "blocked" };
    }
    const insertedAt = new Date().toISOString();
    const commitResult = applyCommittedWorksheetChange((worksheetData) => applyPricingWorksheetMeasureMappings({
      worksheet: worksheetData,
      entries: validation.entries,
      source,
      insertedAt,
    }), { trackLearning: true, mappedAction: "measure" });
    if (!commitResult.committed || !commitResult.changed) return { status: "blocked" };
    replaceSelection(targetKeys[0] ?? null, targetKeys[0] ?? null);
    measureMapping.reset();
    setMeasureMappingHighlightField(null);
    setMessage(`${source.name} inserted into ${targetKeys.join(", ")}. Save the workbook to preserve its source.`);
    return { status: "inserted" };
  }, [applyCommittedWorksheetChange, canWriteWorksheet, explicitWorksheetId, measureMapping, replaceSelection]);

  const updateReviewedMaterialPrice = useCallback((
    group: MaterialPriceReviewGroup,
    target: MaterialPriceReviewBindingTarget,
  ) => {
    const currentSheetId = worksheetSheetIdRef.current;
    const currentPrice = group.currentPrice;
    const current = worksheetRef.current;
    const currentCell = current.cells[target.cellAddress];
    const provenance = getWorksheetCellMaterialPricingProvenance(currentCell);
    if (
      !canMutateWorksheet || !currentPrice || !["price_changed", "estimating_unit_mismatch"].includes(group.classification) ||
      target.sheetId !== currentSheetId || !currentCell || provenance?.bindingId !== target.bindingId ||
      provenance.supplierProductId !== group.supplierProductId || currentCell.formula ||
      currentCell.type !== "number" || typeof currentCell.value !== "number"
    ) return false;

    const pricing = group.currentPricing ?? {
      sourcePricing: {
        supplierPriceId: currentPrice.id, unitCost: currentPrice.unitCost, unit: currentPrice.unit,
        currency: currentPrice.currency, sourceTaxBasis: currentPrice.sourceTaxBasis,
        sourceTaxRate: currentPrice.sourceTaxRate, taxJurisdictionCode: currentPrice.taxJurisdictionCode,
        comparisonTaxBasis: null, comparisonTaxRate: null, effectiveFrom: currentPrice.effectiveFrom,
      },
      estimatingPricing: {
        status: "available" as const, derivationKind: "direct_unit_match" as const,
        normalizedSourceUnitCost: currentPrice.unitCost, unitCost: currentPrice.unitCost,
        unit: currentPrice.unit, currency: currentPrice.currency, taxBasis: null,
        calculationVersion: "material_estimating_price_v1" as const, evaluatedAt: currentPrice.evaluatedAt,
      },
      conversion: null,
    };
    const item: PricingWorksheetMaterialPickerItem = {
      materialId: group.materialId,
      materialName: group.materialName,
      materialDescription: null,
      category: null,
      defaultUnit: pricing.estimatingPricing.unit,
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      supplierProductId: group.supplierProductId,
      supplierProductDescription: group.supplierProductDescription,
      supplierSku: group.supplierSku,
      supplierUnit: currentPrice.unit,
      isPreferred: false,
      pricing,
    };
    const buildCell = provenance.version === 2 || group.classification === "estimating_unit_mismatch"
      ? buildMaterialEstimatingRateWorksheetCell : buildMaterialPriceWorksheetCell;
    const result = applyCommittedWorksheetChange((worksheetData) => ({
      ...worksheetData,
      cells: {
        ...worksheetData.cells,
        [target.cellAddress]: buildCell({
          existingCell: worksheetData.cells[target.cellAddress],
          item,
          bindingId: crypto.randomUUID(),
        }),
      },
    }), { trackLearning: true });
    if (!result.committed || !result.changed) return false;
    replaceSelection(target.cellAddress, target.cellAddress);
    setMessage(`${group.materialName} updated to the current Supplier Price in ${target.cellAddress}. Save the workbook to preserve the update.`);
    return true;
  }, [applyCommittedWorksheetChange, canMutateWorksheet, replaceSelection]);

  useEffect(() => {
    if (activeSidePanel !== "materials" || materialTarget || !selectedSingleCellKey || !worksheetSheetId) return;
    if (consumedMaterialTargetRef.current === `${worksheetSheetId}:${selectedSingleCellKey}`) return;
    setMaterialTarget(captureSidePanelTarget(selectedSingleCellKey));
  }, [activeSidePanel, captureSidePanelTarget, materialTarget, selectedSingleCellKey, worksheetSheetId]);

  useEffect(() => {
    if (!materialTarget || activeSidePanel !== "materials") return;
    if (
      materialTarget.sheetId === worksheetSheetId &&
      materialTarget.structureKey === worksheetStructureKey &&
      getWorksheetAnchorPosition(worksheet, materialTarget.cellAddress)
    ) return;
    consumedMaterialTargetRef.current = `${materialTarget.sheetId}:${materialTarget.cellAddress}`;
    setMaterialTarget(null);
  }, [activeSidePanel, materialTarget, worksheet, worksheetSheetId, worksheetStructureKey]);

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

  const toggleTextStyle = (key: "bold" | "italic" | "underline" | "strikethrough") => {
    applyFormattingPatchToSelection((format) => ({
      ...format,
      text: {
        ...(format.text ?? {}),
        [key]: format.text?.[key] ? undefined : true,
      },
    }));
  };

  const cycleTextWrapMode = () => {
    const wrapModeOrder: WorksheetTextWrapMode[] = ["overflow", "wrap", "clip"];
    applyFormattingPatchToSelection((format) => {
      const currentMode: WorksheetTextWrapMode = format.text?.wrap ?? "wrap";
      const nextMode = wrapModeOrder[(wrapModeOrder.indexOf(currentMode) + 1) % wrapModeOrder.length];
      return {
        ...format,
        text: {
          ...(format.text ?? {}),
          wrap: nextMode,
        },
      };
    });
  };

  const setFontSizeForSelection = (size: number) => {
    const clamped = Math.min(
      MAX_WORKSHEET_FONT_SIZE,
      Math.max(MIN_WORKSHEET_FONT_SIZE, Math.round(size))
    );
    applyFormattingPatchToSelection((format) => ({
      ...format,
      text: {
        ...(format.text ?? {}),
        fontSize: clamped === DEFAULT_WORKSHEET_FONT_SIZE ? undefined : clamped,
      },
    }));
  };

  const adjustFontSizeForSelection = (delta: number) => {
    setFontSizeForSelection(selectedFontSize + delta);
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

  const clearNumberFormatForSelection = () => {
    applyFormattingPatchToSelection((format) => clearCellNumberFormat(format));
  };

  const clearTextColorForSelection = () => {
    applyFormattingPatchToSelection((format) => {
      if (!format.text?.color) {
        return format;
      }

      const nextFormat: WorksheetCellFormat = { ...format };
      const remainingText = { ...format.text };
      delete remainingText.color;

      if (Object.keys(remainingText).length === 0) {
        delete nextFormat.text;
      } else {
        nextFormat.text = remainingText;
      }

      return nextFormat;
    });
  };

  const applyCustomTextColorForSelection = () => {
    const normalizedColor = normalizeHexColorInput(customTextColorInput);
    if (!normalizedColor) {
      return;
    }

    applyFormattingPatchToSelection({ text: { color: normalizedColor } });
    setCustomTextColorInput(normalizedColor);
  };

  const applyCustomFillColorForSelection = () => {
    const normalizedColor = normalizeHexColorInput(customFillColorInput);
    if (!normalizedColor) {
      return;
    }

    applyFormattingPatchToSelection({ fill: { color: normalizedColor } });
    setCustomFillColorInput(normalizedColor);
  };

  const applyBorderModeToSelection = (mode: WorksheetBorderMode) => {
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
    }, { trackLearning: true });
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

  const setActiveSelectionRangeIndex = useCallback((index: number) => {
    setSelectionState((current) => {
      const nextRange = current.ranges[index] ?? null;
      if (!nextRange) {
        return current;
      }

      const anchorCellKey = buildWorksheetCellKey(
        worksheetRef.current.columns[nextRange.startColumnIndex]?.id ?? "A",
        worksheetRef.current.rows[nextRange.startRowIndex]?.id ?? "1",
      );
      const focusCellKey = buildWorksheetCellKey(
        worksheetRef.current.columns[nextRange.endColumnIndex]?.id ?? "A",
        worksheetRef.current.rows[nextRange.endRowIndex]?.id ?? "1",
      );

      return {
        ...current,
        activeRangeIndex: index,
        anchorCellKey,
        focusCellKey,
      };
    });
  }, []);

  const selectRange = useCallback((range: WorksheetSelectionRange, kind: WorksheetSelectionKind = "cells") => {
    const currentWorksheet = worksheetRef.current;
    const anchorColumn = currentWorksheet.columns[range.startColumnIndex];
    const anchorRow = currentWorksheet.rows[range.startRowIndex];
    const focusColumn = currentWorksheet.columns[range.endColumnIndex];
    const focusRow = currentWorksheet.rows[range.endRowIndex];

    if (!anchorColumn || !anchorRow || !focusColumn || !focusRow) {
      return;
    }

    replaceSelection(
      buildWorksheetCellKey(anchorColumn.id, anchorRow.id),
      buildWorksheetCellKey(focusColumn.id, focusRow.id),
      kind,
    );
  }, [replaceSelection]);

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
    if (!canMutateWorksheet) {
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

    preserveWorksheetViewportScroll();
    applyCommittedWorksheetChange((current) => insertWorksheetRow(current, insertRowIndex));

    if (anchorColumn) {
      const nextCellKey = buildWorksheetCellKey(anchorColumn.id, String(insertRowIndex + 1));
      replaceSelection(nextCellKey, nextCellKey);
    }
  };

  const insertColumnAtSelection = (position: "left" | "right") => {
    if (!canMutateWorksheet) {
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

    preserveWorksheetViewportScroll();
    applyCommittedWorksheetChange((current) => insertWorksheetColumn(current, insertColumnIndex));

    if (anchorRow) {
      const nextCellKey = buildWorksheetCellKey(columnLabelFromIndex(insertColumnIndex), anchorRow.id);
      replaceSelection(nextCellKey, nextCellKey);
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
    canMutateWorksheet &&
    worksheetRef.current.rowCount > 1 &&
    endRowIndex - startRowIndex + 1 < worksheetRef.current.rowCount;

  const canDeleteColumnRange = (startColumnIndex: number, endColumnIndex: number) =>
    canMutateWorksheet &&
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

    preserveWorksheetViewportScroll();
    applyCommittedWorksheetChange((current) =>
      deleteWorksheetRows(current, startRowIndex, endRowIndex)
    );

    if (anchorColumn) {
      const nextCellKey = buildWorksheetCellKey(anchorColumn.id, String(nextSelectedRowIndex + 1));
      replaceSelection(nextCellKey, nextCellKey);
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

    preserveWorksheetViewportScroll();
    applyCommittedWorksheetChange((current) =>
      deleteWorksheetColumns(current, startColumnIndex, endColumnIndex)
    );

    if (anchorRow) {
      const nextCellKey = buildWorksheetCellKey(columnLabelFromIndex(nextSelectedColumnIndex), anchorRow.id);
      replaceSelection(nextCellKey, nextCellKey);
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

    const matchingRange = selectedRanges.find((range) => isPositionInWorksheetSelectionArea(position, range));
    if (matchingRange) {
      return matchingRange;
    }

    return {
      startRowIndex: position.rowIndex,
      endRowIndex: position.rowIndex,
      startColumnIndex: position.columnIndex,
      endColumnIndex: position.columnIndex,
    };
  };

  const getContextMenuSelectionRanges = (menu: WorksheetContextMenuState): WorksheetSelectionRange[] => {
    if (!menu) {
      return selectedRanges;
    }

    if (menu.type === "row") {
      const matchingRangeIndex = findWorksheetSelectionRangeIndexForRow(selectedRanges, menu.rowIndex);
      return matchingRangeIndex >= 0 ? selectedRanges : [getRowRange(menu.rowIndex)];
    }

    if (menu.type === "column") {
      const matchingRangeIndex = findWorksheetSelectionRangeIndexForColumn(selectedRanges, menu.columnIndex);
      return matchingRangeIndex >= 0 ? selectedRanges : [getColumnRange(menu.columnIndex)];
    }

    const matchingRangeIndex = findWorksheetSelectionRangeIndexForCellKey(
      worksheetRef.current,
      selectedRanges,
      menu.cellKey,
    );
    if (matchingRangeIndex >= 0) {
      return selectedRanges;
    }

    const fallbackRange = getContextMenuRange(menu);
    return fallbackRange ? [fallbackRange] : [];
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

    const matchingRangeIndex = findWorksheetSelectionRangeIndexForCellKey(
      worksheetRef.current,
      selectedRanges,
      cellKey,
    );

    if (matchingRangeIndex >= 0) {
      setActiveSelectionRangeIndex(matchingRangeIndex);
    } else {
      replaceSelection(cellKey, cellKey);
    }

    setContextMenu({
      type: "cell",
      x: event.clientX,
      y: event.clientY,
      cellKey,
    });
  }, [activeCellKey, isFormulaReferenceMode, replaceSelection, selectedRanges, setActiveSelectionRangeIndex]);

  const handleRowHeaderClick = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    rowIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const row = worksheetRef.current.rows[rowIndex];
    const firstColumn = worksheetRef.current.columns[0];
    if (!row || !firstColumn) {
      return;
    }

    const rowCellKey = buildWorksheetCellKey(firstColumn.id, row.id);
    if (event.metaKey || event.ctrlKey) {
      setSelectionState((current) => toggleWorksheetRowSelection(current, worksheetRef.current, rowIndex));
      return;
    }

    if (event.shiftKey) {
      replaceSelection(selectionAnchorCellKey ?? rowCellKey, rowCellKey, "rows");
      return;
    }

    replaceSelection(rowCellKey, rowCellKey, "rows");
  }, [replaceSelection, selectionAnchorCellKey]);

  const openRowContextMenu = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    rowIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const matchingRangeIndex = findWorksheetSelectionRangeIndexForRow(selectedRanges, rowIndex);
    if (matchingRangeIndex >= 0) {
      setActiveSelectionRangeIndex(matchingRangeIndex);
    } else {
      selectRange(getRowRange(rowIndex), "rows");
    }
    setContextMenu({
      type: "row",
      x: event.clientX,
      y: event.clientY,
      rowIndex,
    });
  }, [selectRange, selectedRanges, setActiveSelectionRangeIndex]);

  const handleColumnHeaderClick = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    columnIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const column = worksheetRef.current.columns[columnIndex];
    const firstRow = worksheetRef.current.rows[0];
    if (!column || !firstRow) {
      return;
    }

    const columnCellKey = buildWorksheetCellKey(column.id, firstRow.id);
    if (event.metaKey || event.ctrlKey) {
      setSelectionState((current) => toggleWorksheetColumnSelection(current, worksheetRef.current, columnIndex));
      return;
    }

    if (event.shiftKey) {
      replaceSelection(selectionAnchorCellKey ?? columnCellKey, columnCellKey, "columns");
      return;
    }

    replaceSelection(columnCellKey, columnCellKey, "columns");
  }, [replaceSelection, selectionAnchorCellKey]);

  const openColumnContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    columnIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const matchingRangeIndex = findWorksheetSelectionRangeIndexForColumn(selectedRanges, columnIndex);
    if (matchingRangeIndex >= 0) {
      setActiveSelectionRangeIndex(matchingRangeIndex);
    } else {
      selectRange(getColumnRange(columnIndex), "columns");
    }
    setContextMenu({
      type: "column",
      x: event.clientX,
      y: event.clientY,
      columnIndex,
    });
  };

  const runContextMenuAction = (
    action: () => void | Promise<void>,
    options?: { preserveUntilNextFrame?: boolean },
  ) => {
    if (options?.preserveUntilNextFrame) {
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          closeContextMenu();
        });
      } else {
        closeContextMenu();
      }
    } else {
      closeContextMenu();
    }
    void action();
  };

  const handleQuoteContextMenuAction = (
    event: ReactMouseEvent<HTMLButtonElement>,
    range: WorksheetSelectionRange | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const preservedRange = cloneWorksheetSelectionRange(range);
    const preservedSelectionRanges = cloneWorksheetSelectionRanges(getContextMenuSelectionRanges(contextMenu));
    const startingCell = contextMenu?.type === "cell" ? contextMenu.cellKey : selectedWorksheetCellKey;
    runContextMenuAction(() => startQuoteCommercialMapping(preservedRange, preservedSelectionRanges, startingCell), {
      preserveUntilNextFrame: true,
    });
  };

  const handlePurchaseOrderContextMenuAction = (
    event: ReactMouseEvent<HTMLButtonElement>,
    range: WorksheetSelectionRange | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const preservedRange = cloneWorksheetSelectionRange(range);
    const preservedSelectionRanges = cloneWorksheetSelectionRanges(getContextMenuSelectionRanges(contextMenu));
    const startingCell = contextMenu?.type === "cell" ? contextMenu.cellKey : selectedWorksheetCellKey;
    runContextMenuAction(() => startPurchaseOrderCommercialMapping(preservedRange, preservedSelectionRanges, startingCell), {
      preserveUntilNextFrame: true,
    });
  };

  const handleVariationContextMenuAction = (
    event: ReactMouseEvent<HTMLButtonElement>,
    range: WorksheetSelectionRange | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const preservedRange = cloneWorksheetSelectionRange(range);
    const preservedSelectionRanges = cloneWorksheetSelectionRanges(getContextMenuSelectionRanges(contextMenu));
    const startingCell = contextMenu?.type === "cell" ? contextMenu.cellKey : selectedWorksheetCellKey;
    runContextMenuAction(() => startVariationCommercialMapping(preservedRange, preservedSelectionRanges, startingCell), {
      preserveUntilNextFrame: true,
    });
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
    formulaReferenceDragSelectionRef.current = null;
    replaceSelection(cellKey, cellKey);
    setIsDraggingSelection(false);
    focusWorksheetSurface();
  }, [appendCellReferenceToFormula, focusWorksheetSurface, isFormulaReferenceMode, replaceSelection]);

  const goToMaterialPriceCell = useCallback((cellAddress: string) => {
    if (!getWorksheetAnchorPosition(worksheetRef.current, cellAddress)) return;
    selectSingleCell(cellAddress);
    requestAnimationFrame(() => {
      inputRefs.current[cellAddress]?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    });
  }, [selectSingleCell]);

  const startPendingRangeSelection = useCallback((
    cellKey: string,
    startClientX: number,
    startClientY: number,
    options?: {
      anchorCellKey?: string | null;
      mode?: "replace" | "add" | "extend";
    },
  ) => {
    if (isFormulaReferenceMode) {
      appendCellReferenceToFormula(cellKey);
      return;
    }

    const nextMode = options?.mode ?? "replace";
    const nextAnchorCellKey =
      nextMode === "extend" && options?.anchorCellKey
        ? options.anchorCellKey
        : cellKey;

    pendingSelectionDragRef.current = {
      anchorCellKey: nextAnchorCellKey,
      startClientX,
      startClientY,
      mode: nextMode,
      baseSelectionState: selectionState,
    };
    isDraggingSelectionRef.current = false;
    rangeDragAnchorCellKeyRef.current = nextAnchorCellKey;
    formulaReferenceDragAnchorCellKeyRef.current = null;
    formulaReferenceDragBaseValueRef.current = null;
    didDragSelectionRef.current = false;
    if (nextMode === "replace" || nextMode === "extend") {
      replaceSelection(nextAnchorCellKey, cellKey);
    }
    setIsDraggingSelection(false);
    focusWorksheetSurface();
  }, [appendCellReferenceToFormula, focusWorksheetSurface, isFormulaReferenceMode, replaceSelection, selectionState]);

  const updateRangeSelection = useCallback((cellKey: string, event: ReactMouseEvent<HTMLDivElement>) => {
    if (isFormulaReferenceMode) {
      const formulaReferenceAnchorCellKey = formulaReferenceDragAnchorCellKeyRef.current;
      const formulaReferenceBaseValue = formulaReferenceDragBaseValueRef.current;
      const formulaReferenceBaseSelection = formulaReferenceDragSelectionRef.current;
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
      const insertion = insertTextAtWorksheetSelection(
        formulaReferenceBaseValue,
        formulaReferenceBaseSelection,
        nextReference,
      );
      editorTextSelectionRef.current = insertion.selection;
      editingCellValueRef.current = insertion.value;
      setEditingCellValue(insertion.value);
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
    if (!anchorCellKey) {
      return;
    }
    if (pendingSelection?.mode === "add") {
      setSelectionState(
        addWorksheetSelectionFromCellKeys(
          pendingSelection.baseSelectionState,
          worksheetRef.current,
          anchorCellKey,
          cellKey,
          "cells",
        ),
      );
      return;
    }

    replaceSelection(anchorCellKey, cellKey);
  }, [
    clearFillDragState,
    clearSelectionDragState,
    isDraggingFill,
    isDraggingSelection,
    isFormulaEditing,
    isFormulaReferenceMode,
    replaceSelection,
    selectionAnchorCellKey,
  ]);

  const beginFillDrag = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!canMutateWorksheet || !selectedRange || activeCellKey || isFormulaEditing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFill(true);
    setFillSourceRange(selectedRange);
    setFillPreviewFocusCellKey(null);
    focusWorksheetSurface();
  }, [activeCellKey, canMutateWorksheet, focusWorksheetSurface, isFormulaEditing, selectedRange]);

  const handleBeginGridCellEdit = useCallback((
    cellKey: string,
    cell: WorksheetCell | undefined,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    const rawValue = getRawCellInput(cell);
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontalPadding = 10;
    const displayText = event.currentTarget.querySelector<HTMLElement>(
      "[data-worksheet-cell-display-text]",
    );
    const computedStyle = displayText ? window.getComputedStyle(displayText) : null;
    const canvasContext = document.createElement("canvas").getContext("2d");
    let caret: number;
    if (computedStyle && canvasContext) {
      canvasContext.font = computedStyle.font || [
        computedStyle.fontStyle,
        computedStyle.fontWeight,
        computedStyle.fontSize,
        computedStyle.fontFamily,
      ].filter(Boolean).join(" ");
      const letterSpacing = Number.parseFloat(computedStyle.letterSpacing) || 0;
      caret = getWorksheetCaretIndexFromTextMetrics({
        value: rawValue,
        contentX: event.clientX - bounds.left - horizontalPadding,
        scale: worksheetZoom,
        measureText: (value) =>
          canvasContext.measureText(value).width + Math.max(0, value.length - 1) * letterSpacing,
      });
    } else {
      caret = getApproximateWorksheetCaretIndex({
        clientX: event.clientX,
        contentLeft: bounds.left + horizontalPadding,
        contentWidth: Math.max(1, bounds.width - horizontalPadding * 2),
        valueLength: rawValue.length,
      });
    }
    beginCellEdit(cellKey, cell, {
      editor: "cell",
      selection: { start: caret, end: caret },
    });
  }, [beginCellEdit, worksheetZoom]);

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
    }, { trackLearning: true });

    const nextFocusCellKey = buildWorksheetCellKey(
      worksheet.columns[previewRange.endColumnIndex]?.id ?? worksheet.columns[sourceRange.endColumnIndex].id,
      worksheet.rows[previewRange.endRowIndex]?.id ?? worksheet.rows[sourceRange.endRowIndex].id
    );
    replaceSelection(
      buildWorksheetCellKey(
        worksheet.columns[sourceRange.startColumnIndex].id,
        worksheet.rows[sourceRange.startRowIndex].id
      ),
      nextFocusCellKey,
    );
  }, [applyCommittedWorksheetChange, replaceSelection, worksheet.columns, worksheet.rows]);

  const handleWorksheetCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (activeCellKey || !selectedRange) {
      return;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", buildWorksheetTsvFromRange(worksheet, selectedRange));
  };

  const handleUndo = () => {
    if (!canMutateWorksheet) return;
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
    if (!canMutateWorksheet) return;
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
    const target = event.target;
    const isTextEditingTarget =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (isTextEditingTarget) {
      return;
    }

    if (event.key === "Escape" && commercialMapping.session) {
      event.preventDefault();
      if (commercialMapping.session.activeField) {
        commercialMapping.armField(null);
        setIsNarrowCommercialCellPicker(false);
      } else {
        commercialMapping.cancel();
        setCommercialMappingContext(null);
        setCommercialMappingHighlightField(null);
        setIsNarrowCommercialCellPicker(false);
        focusWorksheetSurface({ immediate: true });
      }
      return;
    }

    if (event.key === "Escape" && variationCommercialMapping.session) {
      event.preventDefault();
      const activeLine = variationCommercialMapping.session.lines.find((line) => line.mapping.activeField);
      if (activeLine) {
        variationCommercialMapping.armField(activeLine.id, null);
        setIsNarrowCommercialCellPicker(false);
      } else {
        variationCommercialMapping.cancel();
        setVariationCommercialMappingContext(null);
        setVariationCommercialMappingHighlight(null);
        setIsNarrowCommercialCellPicker(false);
        focusWorksheetSurface({ immediate: true });
      }
      return;
    }

    if (event.key === "Escape" && measureMapping.session) {
      event.preventDefault();
      if (measureMapping.session.activeField) {
        measureMapping.armField(null);
      } else {
        closeMeasureDrawer();
      }
      return;
    }

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

    if (isUndoShortcut && canMutateWorksheet) {
      event.preventDefault();
      handleUndo();
      return;
    }

    if (isRedoShortcut && canMutateWorksheet) {
      event.preventDefault();
      handleRedo();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
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
          replaceSelection(selectionAnchorCellKey ?? baseCellKey, nextFocusKey);
        }
        return;
      }

      const nextCellKey = moveCellKey(worksheet, baseCellKey, direction);
      if (!nextCellKey) {
        return;
      }

      replaceSelection(nextCellKey, nextCellKey);
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

    if ((event.key === "Enter" || event.key === " ") && commercialMapping.session?.activeField && selectedSingleCellKey) {
      event.preventDefault();
      commercialMapping.assignCell(selectedSingleCellKey);
      setIsNarrowCommercialCellPicker(false);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && variationCommercialMapping.session?.lines.some((line) => line.mapping.activeField) && selectedSingleCellKey) {
      event.preventDefault();
      variationCommercialMapping.assignCell(selectedSingleCellKey);
      setIsNarrowCommercialCellPicker(false);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && measureMapping.session?.activeField && selectedSingleCellKey) {
      event.preventDefault();
      measureMapping.assignCell(selectedSingleCellKey);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      moveSelection(event.shiftKey ? "up" : "down");
      return;
    }

    if (!canMutateWorksheet) {
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && selectedRange) {
      event.preventDefault();
      clearContentsInRange(selectedRange);
      return;
    }

    if (!selectedSingleCellKey || event.key.length !== 1) {
      return;
    }

    event.preventDefault();
    editingSessionRef.current = {
      cellKey: selectedSingleCellKey,
      originalValue: getRawCellInput(worksheetRef.current.cells[selectedSingleCellKey]),
    };
    updateFormulaReferencePickState(event.key, { start: 1, end: 1 });
    setActiveCellKey(selectedSingleCellKey);
    setActiveEditor("cell");
    setEditingCellValue(event.key);
    focusInputCell(selectedSingleCellKey, {
      selectAll: false,
      selection: { start: 1, end: 1 },
    });
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
      preserveWorksheetViewportScroll();

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
    preserveWorksheetViewportScroll,
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
      preserveWorksheetViewportScroll();

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
    preserveWorksheetViewportScroll,
    resizingRowId,
    rowResizePreviewHeight,
    rowResizeStartHeight,
    rowResizeStartY,
    worksheet.rows,
  ]);

  const saveWorksheet = async (options?: { silent?: boolean }) => {
    if (!supabase || !session?.organizationId || !session?.id || !worksheetOpportunityId) {
      setError("Pricing worksheet save is not ready. Please refresh and try again.");
      return false;
    }

    if (!canWriteWorksheet) {
      setError("You do not have permission to edit pricing worksheets.");
      return false;
    }

    setIsSavingWorksheet(true);
    setError(null);
    setMessage(null);

    try {
      const organizationId = session.organizationId;
      const userId = session.id;
      const worksheetPersistenceName = getWorksheetPersistenceName();
      if (!organizationId || !userId) {
        throw new Error("Could not resolve your organization or user.");
      }
      const endSaveValidationMeasure = startPricingWorksheetPerformanceMeasure("worksheet-save-validation", {
        worksheetId: explicitWorksheetId ?? worksheetId ?? "legacy",
      });
      const worksheetValidation = validateWorksheetBeforeSave({
        ...worksheetRef.current,
        sheetName: worksheetPersistenceName,
      });
      endSaveValidationMeasure({
        ok: worksheetValidation.ok,
      });
      if (!worksheetValidation.ok) {
        throw new Error(worksheetValidation.message);
      }

      const syncedWorksheet = worksheetValidation.worksheet;
      const saveRevision = worksheetMutationRevisionRef.current;
      const nextPricingSummary = deriveWorksheetPricingSummary(syncedWorksheet, pricingSummaryRef.current, {
        calculatedAt: new Date().toISOString(),
      });
      const saveRequestId = crypto.randomUUID();

      const targetWorksheetId = explicitWorksheetId ?? worksheetId;
      let persistedWorkbook: OpportunityPricingWorkbook | null = null;

      if (targetWorksheetId) {
        const endSaveRequestMeasure = startPricingWorksheetPerformanceMeasure("worksheet-save-request", {
          action: "update",
          worksheetId: targetWorksheetId,
        });
        let saveError: Error | null = null;
        let savedWorkbook = null;
        try {
          savedWorkbook = await saveOpportunityPricingWorkbookActiveSheet({
            supabase,
            organizationId,
            opportunityId: worksheetOpportunityId,
            projectId: worksheetProjectId,
            projectOwned: worksheetOwner.ownerType === "project",
            quoteId: worksheetOwner.quoteId,
            variationId: worksheetOwner.variationId,
            workbookId: targetWorksheetId,
            sheetId: worksheetSheetId,
            name: worksheetPersistenceName,
            tradePackage: worksheetTradePackage,
            worksheet: syncedWorksheet,
            pricingSummary: nextPricingSummary,
            extractedPricingData,
            saveRequestId,
            userId,
          });
        } catch (error) {
          saveError = error instanceof Error ? error : new Error("Workbook save failed.");
        } finally {
          endSaveRequestMeasure({
            ok: !saveError,
          });
        }

        if (saveError) {
          throw saveError;
        }

        if (!savedWorkbook) {
          throw new Error("Worksheet save response was empty.");
        }

        const editorRecord = buildOpportunityPricingWorkbookEditorRecord(savedWorkbook);
        await flushPersistedWorksheetLearningArtifacts({
          organizationId,
          userId,
          workbookId: editorRecord.workbookId,
          workbookName: editorRecord.workbookName,
          sheetId: editorRecord.sheetId,
          sheetName: editorRecord.sheetName,
          worksheetName: editorRecord.sheetName,
          tradePackage: editorRecord.tradePackage,
        });
        persistedWorkbook = savedWorkbook;
        setWorksheetId(editorRecord.workbookId);
        worksheetIdRef.current = editorRecord.workbookId;
        setWorksheetSheetId(editorRecord.sheetId);
        worksheetSheetIdRef.current = editorRecord.sheetId;
        setWorksheetName(editorRecord.sheetName);
        synchronizeLoadedWorksheetTitle({
          sheetId: editorRecord.sheetId,
          title: editorRecord.sheetName,
          updatedAt: editorRecord.updatedAt ?? null,
        });
        setLastSavedAt(editorRecord.updatedAt ?? null);
      } else {
        const endSaveRequestMeasure = startPricingWorksheetPerformanceMeasure("worksheet-save-request", {
          action: "insert",
          worksheetId: "new",
        });
        let saveError: Error | null = null;
        let savedWorkbook = null;
        try {
          savedWorkbook = await saveOpportunityPricingWorkbookActiveSheet({
            supabase,
            organizationId,
            opportunityId: worksheetOpportunityId,
            projectId: worksheetProjectId,
            projectOwned: worksheetOwner.ownerType === "project",
            quoteId: worksheetOwner.quoteId,
            variationId: worksheetOwner.variationId,
            workbookId: null,
            sheetId: worksheetSheetId,
            name: worksheetPersistenceName,
            tradePackage: worksheetTradePackage,
            worksheet: syncedWorksheet,
            pricingSummary: nextPricingSummary,
            extractedPricingData,
            saveRequestId,
            userId,
          });
        } catch (error) {
          saveError = error instanceof Error ? error : new Error("Workbook save failed.");
        } finally {
          endSaveRequestMeasure({
            ok: !saveError,
          });
        }

        if (saveError) {
          throw saveError;
        }

        if (!savedWorkbook) {
          throw new Error("Worksheet save response was empty.");
        }

        const editorRecord = buildOpportunityPricingWorkbookEditorRecord(savedWorkbook);
        await flushPersistedWorksheetLearningArtifacts({
          organizationId,
          userId,
          workbookId: editorRecord.workbookId,
          workbookName: editorRecord.workbookName,
          sheetId: editorRecord.sheetId,
          sheetName: editorRecord.sheetName,
          worksheetName: editorRecord.sheetName,
          tradePackage: editorRecord.tradePackage,
        });
        persistedWorkbook = savedWorkbook;
        setWorksheetId(editorRecord.workbookId);
        worksheetIdRef.current = editorRecord.workbookId;
        setWorksheetSheetId(editorRecord.sheetId);
        worksheetSheetIdRef.current = editorRecord.sheetId;
        setWorksheetName(editorRecord.sheetName);
        synchronizeLoadedWorksheetTitle({
          sheetId: editorRecord.sheetId,
          title: editorRecord.sheetName,
          updatedAt: editorRecord.updatedAt ?? null,
        });
        setLastSavedAt(editorRecord.updatedAt ?? null);
      }

      const shouldApplySavedSnapshot = shouldApplyWorksheetSaveSnapshot({
        currentRevision: worksheetMutationRevisionRef.current,
        savedRevision: saveRevision,
      });
      if (shouldApplySavedSnapshot) {
        setWorksheet(syncedWorksheet);
        worksheetRef.current = syncedWorksheet;
        pricingSummaryRef.current = nextPricingSummary;
        setPricingSummary(nextPricingSummary);
      }
      if (persistedWorkbook && shouldApplySavedSnapshot) {
        const savedSheet = persistedWorkbook.sheets[0] ?? null;
        if (savedSheet) {
          setWorkbookSheets((current) => {
            if (current.length === 0) {
              workbookSheetsRef.current = [savedSheet];
              return [savedSheet];
            }

            const existingIndex = current.findIndex((sheet) => sheet.id === savedSheet.id);
            if (existingIndex === -1) {
              const nextSheets = [...current, savedSheet];
              workbookSheetsRef.current = nextSheets;
              return nextSheets;
            }

            const nextSheets = current.map((sheet) => (sheet.id === savedSheet.id ? savedSheet : sheet));
            workbookSheetsRef.current = nextSheets;
            return nextSheets;
          });
        }
      }
      setIsDirty(!shouldApplySavedSnapshot);
      if (!options?.silent) {
        setMessage(
          shouldApplySavedSnapshot
            ? null
            : "Earlier changes saved. Newer worksheet edits remain unsaved.",
        );
      }
      return shouldApplySavedSnapshot;
    } catch (saveWorksheetError) {
      setError(mapPricingWorksheetUiErrorMessage(saveWorksheetError, "Unable to save the pricing worksheet."));
      return false;
    } finally {
      setIsSavingWorksheet(false);
    }
  };

  const closeWorksheet = async () => {
    if (isSavingWorksheet || worksheetTitleAutosave.status === "saving") {
      return;
    }

    const didSaveTitle = await worksheetTitleAutosaveControllerRef.current?.flush();
    if (didSaveTitle === false) {
      return;
    }

    if (isDirty) {
      const didSave = await saveWorksheet({ silent: true });
      if (!didSave) {
        return;
      }
    }

    onClose?.();
  };

  const saveWorksheetAndTitle = async () => {
    const didSaveTitle = await worksheetTitleAutosaveControllerRef.current?.flush();
    if (didSaveTitle === false) {
      return false;
    }
    return isDirty ? saveWorksheet() : true;
  };

  saveWorksheetRef.current = saveWorksheet;

  const switchToWorkbookSheet = useCallback(async (nextSheetId: string) => {
    if (nextSheetId === worksheetSheetId) {
      return;
    }

    if (isSavingWorksheet) {
      return;
    }

    if (commercialMapping.session) {
      closeCommercialMapping();
    }
    if (variationCommercialMapping.session) {
      closeVariationCommercialMapping();
    }
    if (measureMapping.session) {
      measureMapping.cancel();
      setMeasureMappingHighlightField(null);
    }

    const didSaveTitle = await worksheetTitleAutosaveControllerRef.current?.flush();
    if (didSaveTitle === false) {
      return;
    }

    setActiveSidePanel(null);
    setMaterialTarget(null);
    consumedMaterialTargetRef.current = null;

    if (isDirty) {
      const didSave = await saveWorksheetRef.current?.({ silent: true });
      if (!didSave) {
        return;
      }
    }

    const nextSheet = workbookSheetsRef.current.find((sheet) => sheet.id === nextSheetId);
    const currentWorkbookId = explicitWorksheetId ?? worksheetId;
    if (!nextSheet || !currentWorkbookId || !session?.organizationId || !supabase) {
      return;
    }

    await cancelActiveAiJob();

    try {
      await setOpportunityPricingWorkbookLastActiveSheet({
        supabase,
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
        projectId: worksheetProjectId,
        projectOwned: worksheetOwner.ownerType === "project",
        quoteId: worksheetOwner.quoteId,
        variationId: worksheetOwner.variationId,
        workbookId: currentWorkbookId,
        sheetId: nextSheetId,
      });
      persistedLastActiveWorkbookIdRef.current = currentWorkbookId;
      persistedLastActiveSheetIdRef.current = nextSheetId;
    } catch {
      persistedLastActiveWorkbookIdRef.current = currentWorkbookId;
      persistedLastActiveSheetIdRef.current = null;
    }

    const workbookSnapshot: OpportunityPricingWorkbook = {
      archivedAt: null,
      createdAt: nextSheet.createdAt,
      createdBy: nextSheet.createdBy,
      id: currentWorkbookId,
      lastActiveSheetId: nextSheetId,
      legacySheetFallback: false,
      name: worksheetName?.trim() || nextSheet.name,
      opportunityId: worksheetOpportunityId,
      projectId: worksheetProjectId,
      quoteId: worksheetOwner.quoteId,
      variationId: worksheetOwner.variationId,
      organizationId: session.organizationId,
      sortOrder: null,
      tradePackage: worksheetTradePackage,
      updatedAt: nextSheet.updatedAt,
      updatedBy: nextSheet.updatedBy,
      version: nextSheet.version,
      sheets: workbookSheetsRef.current,
    };

    hydrateWorkbookEditorState(workbookSnapshot, nextSheetId, {
      seedPersistedLastActiveSheet: false,
    });
    updateSheetUrlState(nextSheetId);
  }, [
    cancelActiveAiJob,
    closeCommercialMapping,
    closeVariationCommercialMapping,
    commercialMapping.session,
    explicitWorksheetId,
    hydrateWorkbookEditorState,
    isDirty,
    isSavingWorksheet,
    measureMapping,
    session?.organizationId,
    worksheetOpportunityId,
    supabase,
    worksheetId,
    worksheetName,
    worksheetSheetId,
    worksheetTradePackage,
    updateSheetUrlState,
    variationCommercialMapping.session,
  ]);

  const addBlankWorkbookSheet = useCallback(async () => {
    if (!supabase || !session?.organizationId || !session?.id || !worksheetId || isMutatingPages) {
      return;
    }

    if (isDirty) {
      const didSave = await saveWorksheetRef.current?.({ silent: true });
      if (!didSave) {
        return;
      }
    }

    setIsMutatingPages(true);
    setError(null);

    try {
      const nextSheetNumber = workbookSheetsRef.current.length + 1;
      const nextWorksheet = createDefaultWorksheetData({
        sheetName: `Page ${nextSheetNumber}`,
      });
      const createdSheet = await createOpportunityPricingWorkbookSheet({
        supabase,
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
        projectId: worksheetProjectId,
        projectOwned: worksheetOwner.ownerType === "project",
        quoteId: worksheetOwner.quoteId,
        variationId: worksheetOwner.variationId,
        workbookId: worksheetId,
        userId: session.id,
        worksheet: nextWorksheet,
        pricingSummary: createDefaultWorksheetPricingSummary(),
        extractedPricingData: createDefaultWorksheetExtractedPricingData(nextWorksheet.version),
      });
      const nextSheets = [...workbookSheetsRef.current, createdSheet];
      workbookSheetsRef.current = nextSheets;
      setWorkbookSheets(nextSheets);
      setIsPagesTrayOpen(true);
      await switchToWorkbookSheet(createdSheet.id);
    } catch (sheetError) {
      setError(sheetError instanceof Error ? sheetError.message : "Unable to add a worksheet page.");
    } finally {
      setIsMutatingPages(false);
    }
  }, [
    isDirty,
    isMutatingPages,
    session?.id,
    session?.organizationId,
    worksheetOpportunityId,
    supabase,
    switchToWorkbookSheet,
    worksheetId,
  ]);

  const duplicateWorkbookSheet = useCallback(async (sheetId: string) => {
    if (!supabase || !session?.organizationId || !session?.id || !worksheetId || isMutatingPages) {
      return;
    }

    const sourceSheet = workbookSheetsRef.current.find((sheet) => sheet.id === sheetId);
    if (!sourceSheet) {
      return;
    }

    if (sheetId === worksheetSheetId && isDirty) {
      const didSave = await saveWorksheetRef.current?.({ silent: true });
      if (!didSave) {
        return;
      }
    }

    setIsMutatingPages(true);
    setError(null);

    try {
      const duplicatedSheet = await createOpportunityPricingWorkbookSheet({
        supabase,
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
        projectId: worksheetProjectId,
        projectOwned: worksheetOwner.ownerType === "project",
        quoteId: worksheetOwner.quoteId,
        variationId: worksheetOwner.variationId,
        workbookId: worksheetId,
        userId: session.id,
        name: `${sourceSheet.name} Copy`,
        worksheet: {
          ...cloneWorksheetData(sourceSheet.worksheet),
          sheetName: `${sourceSheet.name} Copy`,
        },
        pricingSummary: cloneJson(sourceSheet.pricingSummary),
        extractedPricingData: cloneJson(sourceSheet.extractedPricingData),
      });
      const nextSheets = [...workbookSheetsRef.current, duplicatedSheet];
      workbookSheetsRef.current = nextSheets;
      setWorkbookSheets(nextSheets);
      setIsPagesTrayOpen(true);
      await switchToWorkbookSheet(duplicatedSheet.id);
    } catch (sheetError) {
      setError(sheetError instanceof Error ? sheetError.message : "Unable to duplicate the worksheet page.");
    } finally {
      setIsMutatingPages(false);
    }
  }, [
    isDirty,
    isMutatingPages,
    session?.id,
    session?.organizationId,
    worksheetOpportunityId,
    supabase,
    switchToWorkbookSheet,
    worksheetId,
    worksheetSheetId,
  ]);

  const confirmPageRename = useCallback(async () => {
    if (pageDialog?.type !== "rename" || !supabase || !session?.organizationId || !session?.id || !worksheetId) {
      return;
    }

    const nextName = pageDialog.value.trim();
    if (!nextName) {
      setError("Worksheet page name cannot be blank.");
      return;
    }

    if (pageDialog.sheetId === worksheetSheetId) {
      setPageDialog(null);
      worksheetTitleAutosaveControllerRef.current?.setDraft(nextName);
      await worksheetTitleAutosaveControllerRef.current?.flush();
      return;
    }

    setIsMutatingPages(true);
    setError(null);
    try {
      await renameOpportunityPricingWorkbookSheet({
        supabase,
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
        projectId: worksheetProjectId,
        projectOwned: worksheetOwner.ownerType === "project",
        quoteId: worksheetOwner.quoteId,
        variationId: worksheetOwner.variationId,
        workbookId: worksheetId,
        sheetId: pageDialog.sheetId,
        nextName,
        tradePackage: worksheetTradePackage,
        userId: session.id,
      });
      const nextSheets = workbookSheetsRef.current.map((sheet) => (
        sheet.id === pageDialog.sheetId
          ? {
              ...sheet,
              name: nextName,
              worksheet: {
                ...sheet.worksheet,
                sheetName: nextName,
              },
            }
          : sheet
      ));
      workbookSheetsRef.current = nextSheets;
      setWorkbookSheets(nextSheets);
      setPageDialog(null);
    } catch (sheetError) {
      setError(sheetError instanceof Error ? sheetError.message : "Unable to rename the worksheet page.");
    } finally {
      setIsMutatingPages(false);
    }
  }, [
    pageDialog,
    session?.id,
    session?.organizationId,
    worksheetOpportunityId,
    supabase,
    worksheetId,
    worksheetSheetId,
    worksheetTradePackage,
  ]);

  const confirmPageDelete = useCallback(async () => {
    if (pageDialog?.type !== "delete" || !supabase || !session?.organizationId || !session?.id || !worksheetId) {
      return;
    }

    if (workbookSheetsRef.current.length <= 1) {
      setError("You must keep at least one worksheet page.");
      return;
    }

    if (pageDialog.sheetId === worksheetSheetId && isDirty) {
      const didSave = await saveWorksheetRef.current?.({ silent: true });
      if (!didSave) {
        return;
      }
    }

    const deletedSheet = workbookSheetsRef.current.find((sheet) => sheet.id === pageDialog.sheetId) ?? null;
    const remainingSheets = workbookSheetsRef.current.filter((sheet) => sheet.id !== pageDialog.sheetId);
    const promotedDefaultSheetId = deletedSheet?.isDefault ? (remainingSheets[0]?.id ?? null) : null;
    const nextSheetId =
      pageDialog.sheetId === worksheetSheetId
        ? remainingSheets[0]?.id ?? null
        : promotedDefaultSheetId;
    const activeFallbackSheetId =
      pageDialog.sheetId === worksheetSheetId
        ? remainingSheets[0]?.id ?? null
        : null;

    setIsMutatingPages(true);
    setError(null);
    try {
      await deleteOpportunityPricingWorkbookSheet({
        supabase,
        organizationId: session.organizationId,
        opportunityId: worksheetOpportunityId,
        projectId: worksheetProjectId,
        projectOwned: worksheetOwner.ownerType === "project",
        quoteId: worksheetOwner.quoteId,
        variationId: worksheetOwner.variationId,
        workbookId: worksheetId,
        sheetId: pageDialog.sheetId,
        userId: session.id,
        nextSheetId,
      });
      workbookSheetsRef.current = remainingSheets;
      setWorkbookSheets(remainingSheets);
      setPageDialog(null);

      if (activeFallbackSheetId) {
        await switchToWorkbookSheet(activeFallbackSheetId);
      }
    } catch (sheetError) {
      setError(sheetError instanceof Error ? sheetError.message : "Unable to delete the worksheet page.");
    } finally {
      setIsMutatingPages(false);
    }
  }, [
    isDirty,
    pageDialog,
    session?.id,
    session?.organizationId,
    worksheetOpportunityId,
    supabase,
    switchToWorkbookSheet,
    worksheetId,
    worksheetSheetId,
  ]);

  const applyAiPreviewPayload = useCallback((payload: PricingWorksheetAiPreviewResponse, options?: {
    promptOverride?: string | null;
    followUpContext?: PricingWorksheetAiFollowUpContext | null;
  }) => {
    if ((payload.sheetId ?? null) !== (worksheetSheetIdRef.current ?? null)) {
      return false;
    }

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

    // New flow: the dialog only collects the prompt. Once a preview is ready we
    // build it straight into the live sheet and hand review off to the docked
    // chat panel (Approve keeps it, Reject restores the pre-AI snapshot).
    const isFollowUp = Boolean(options?.followUpContext);
    const hasMutatingOperations = (payload.preview.assistant?.operations ?? []).some(
      (operation) => operation.type !== "explain_formula"
    );

    if (hasMutatingOperations && canMutateWorksheet) {
      // Keep the snapshot pinned to the true pre-AI sheet so Reject (and a final
      // reject after several follow-ups) always restores the original. A
      // follow-up's preview.worksheet is the complete revised sheet, so it
      // replaces the grid wholesale — no need to unwind the prior apply first.
      if (!isFollowUp) {
        aiPreApplySnapshotRef.current = {
          worksheet: cloneWorksheetData(worksheetRef.current),
          name: worksheetName,
          tradePackage: worksheetTradePackage,
        };
      }

      let nextWorksheet = cloneWorksheetData(payload.preview.worksheet);
      nextWorksheet = autoLayoutWorksheet(nextWorksheet, payload.preview.assistant?.diffSummary);
      nextWorksheet.sheetName =
        payload.preview.compactOutput.worksheetName || nextWorksheet.sheetName;
      nextWorksheet = applyAiProvenanceToWorksheet({
        nextWorksheet,
        aiInteractionId: payload.aiInteractionId,
        promptSummary: payload.preview.assistant?.summary ?? options?.promptOverride ?? aiPrompt,
        operationTypes: payload.preview.assistant?.operations.map((operation) => operation.type) ?? [],
        batchIndex: payload.preview.continuation?.currentBatchIndex ?? 1,
      });

      const commitResult = applyCommittedWorksheetChange(() => nextWorksheet, {
        validateFormulaOutputs: true,
      });
      if (commitResult.committed) {
        setWorksheetName(nextWorksheet.sheetName);
        setWorksheetTradePackage(payload.preview.compactOutput.tradePackage ?? null);
        replaceSelection(buildWorksheetCellKey("A", "1"), buildWorksheetCellKey("A", "1"));
        setActiveCellKey(null);
        setActiveEditor(null);
        setEditingCellValue("");
      } else {
        setAiPreviewError(commitResult.message ?? "Unable to build the AI worksheet into your sheet.");
      }
    }

    setIsAiChatOpen(true);
    return true;
  }, [
    applyCommittedWorksheetChange,
    aiPrompt,
    applyAiProvenanceToWorksheet,
    autoLayoutWorksheet,
    canMutateWorksheet,
    logAiReviewIntelligenceEvents,
    replaceSelection,
    worksheetName,
    worksheetTradePackage,
  ]);

  const pollAiWorksheetJob = useCallback(async (
    jobId: string,
    options?: {
      promptOverride?: string | null;
      followUpContext?: PricingWorksheetAiFollowUpContext | null;
      sheetId?: string | null;
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
        sheetId: payload.sheetId ?? options?.sheetId ?? null,
        sheetName: payload.sheetName?.trim() || aiPreviewWorksheetName.trim() || worksheetDisplayName,
        lifecycleState: payload.lifecycleState ?? "previewed",
        validationStatus: payload.validationStatus ?? "passed",
        preview: payload.preview,
      };
      const didApplyPreview = applyAiPreviewPayload(readyPayload, options);
      activeAiJobIdRef.current = null;
      activeAiJobSheetIdRef.current = null;
      if (!didApplyPreview) {
        setIsGeneratingAiPreview(false);
        return null;
      }
      setAiPreviewError(payload.error?.code === "validation_blocked" ? payload.error.message : null);
      setIsGeneratingAiPreview(false);
      return readyPayload;
    }

    if (payload.status === "failed" || payload.status === "cancelled") {
      activeAiJobIdRef.current = null;
      activeAiJobSheetIdRef.current = null;
      setAiPreviewError(payload.error?.message ?? "Unable to complete the AI worksheet job.");
      setIsGeneratingAiPreview(false);
      return null;
    }

    aiJobPollTimeoutRef.current = window.setTimeout(() => {
      void pollAiWorksheetJob(jobId, options);
    }, payload.status === "queued" ? 800 : 1200);

    return null;
  }, [aiPreviewWorksheetName, applyAiPreviewPayload, session?.organizationId, worksheetDisplayName]);

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
    setAiJobStatus("queued");
    setAiJobProgressLabel("Queued");

    try {
      const requestPrompt = options?.promptOverride ?? aiPrompt;
      const worksheetSnapshot = cloneWorksheetData(worksheetRef.current);
      const requestSheetId = worksheetSheetIdRef.current;
      const endAiContextMeasure = startPricingWorksheetPerformanceMeasure("ai-context-build", {
        worksheetId: worksheetId ?? "unsaved",
      });
      const worksheetContext = buildPricingWorksheetAiContext(worksheetSnapshot, {
        workbookId: worksheetId,
        worksheetId,
        sheetId: requestSheetId,
        sheetName: aiPreviewWorksheetName.trim() || worksheetDisplayName,
        worksheetName: aiPreviewWorksheetName.trim() || worksheetDisplayName,
        tradePackage: aiPreviewTradePackage.trim() || worksheetTradePackage || null,
        selection: {
          activeCellKey,
          anchorCellKey: selectionAnchorCellKey,
          focusCellKey: selectionFocusCellKey,
        },
        prompt: requestPrompt,
      });
      endAiContextMeasure({
        contextRowCount: worksheetContext.rows.length,
        nearbyRowCount: worksheetContext.nearbyRows.length,
        contextBytes: JSON.stringify(worksheetContext).length,
      });

      const endAiPreviewRequestMeasure = startPricingWorksheetPerformanceMeasure("ai-preview-request", {
        worksheetId: worksheetId ?? "unsaved",
      });
      let response: Response | null = null;
      try {
        response = await fetch("/api/ai/pricing-worksheets/edit-assistant/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId: session.organizationId,
            opportunityId: worksheetOpportunityId,
            workbookId: worksheetId,
            worksheetId,
            sheetId: requestSheetId,
            sheetName: aiPreviewWorksheetName.trim() || worksheetDisplayName,
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

      setAiJobStatus(payload.status);
      setAiJobProgressLabel(payload.progressLabel);
      activeAiJobIdRef.current = payload.jobId;
      activeAiJobSheetIdRef.current = requestSheetId;

      return await pollAiWorksheetJob(payload.jobId, {
        ...options,
        sheetId: requestSheetId,
      });
    } catch (aiPreviewGenerationError) {
      activeAiJobIdRef.current = null;
      activeAiJobSheetIdRef.current = null;
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
    worksheetOpportunityId,
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

  const revertAiPreApplySnapshot = useCallback(() => {
    const snapshot = aiPreApplySnapshotRef.current;
    if (!snapshot) {
      return;
    }

    applyCommittedWorksheetChange(() => cloneWorksheetData(snapshot.worksheet), {
      validateFormulaOutputs: false,
    });
    setWorksheetName(snapshot.name);
    setWorksheetTradePackage(snapshot.tradePackage);
    replaceSelection(buildWorksheetCellKey("A", "1"), buildWorksheetCellKey("A", "1"));
    setActiveCellKey(null);
    setActiveEditor(null);
    setEditingCellValue("");
    aiPreApplySnapshotRef.current = null;
  }, [applyCommittedWorksheetChange, replaceSelection]);

  const approveAiWorksheetPreview = useCallback(async () => {
    if (!aiPreviewResponse) {
      resetAiPreviewState();
      return;
    }

    if ((aiPreviewResponse.sheetId ?? null) !== (worksheetSheetIdRef.current ?? null)) {
      setAiPreviewError("This AI preview belongs to a different worksheet page. Ask AI again on the current page.");
      resetAiPreviewState();
      return;
    }

    const isAnswerOnly = aiPreviewResponse.preview.assistant?.mode === "answer_only";
    setIsSubmittingAiReview(true);
    setAiPreviewError(null);

    try {
      const normalizedTradePackage = aiPreviewTradePackage.trim() || null;
      const editedOutput = buildWorksheetAiEditedOutput({
        preview: aiPreviewResponse.preview,
        workbookId: worksheetId ?? null,
        sheetId: aiPreviewResponse.sheetId ?? worksheetSheetIdRef.current ?? null,
        sheetName: aiPreviewWorksheetName.trim() || aiPreviewResponse.sheetName,
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
      logAiPreviewOutcomeEvent({
        eventType: "worksheet_ai_preview_accepted",
        action: "accepted",
        aiInteractionId: aiPreviewResponse.aiInteractionId,
        preview: aiPreviewResponse.preview,
        sheetId: aiPreviewResponse.sheetId ?? worksheetSheetIdRef.current ?? null,
        sheetName: aiPreviewWorksheetName.trim() || aiPreviewResponse.sheetName,
        acceptedFindingIds: editedOutput.acceptedFindingIds,
        rejectedFindingIds: editedOutput.rejectedFindingIds,
        appliedSuggestedEditGroupIds: aiAppliedSuggestedEditGroupIds,
      });
      setMessage(
        isAnswerOnly
          ? "AI worksheet answer accepted."
          : "AI worksheet changes approved. Review the sheet and save when ready."
      );
      aiPreApplySnapshotRef.current = null;
      resetAiPreviewState();
    } catch (aiReviewError) {
      setAiPreviewError(
        aiReviewError instanceof Error ? aiReviewError.message : "Unable to approve the AI worksheet response."
      );
    } finally {
      setIsSubmittingAiReview(false);
    }
  }, [
    aiAppliedSuggestedEditGroupIds,
    aiFindingStates,
    aiPreviewResponse,
    aiPreviewTradePackage,
    aiPreviewWorksheetName,
    logAiPreviewOutcomeEvent,
    resetAiPreviewState,
    submitAiWorksheetReview,
    worksheetId,
  ]);

  const rejectAiWorksheetPreview = useCallback(async () => {
    revertAiPreApplySnapshot();

    if (!aiPreviewResponse) {
      resetAiPreviewState();
      return;
    }

    setIsSubmittingAiReview(true);
    setAiPreviewError(null);

    try {
      await submitAiWorksheetReview("rejected");
      logAiPreviewOutcomeEvent({
        eventType: "worksheet_ai_preview_rejected",
        action: "rejected",
        aiInteractionId: aiPreviewResponse.aiInteractionId,
        preview: aiPreviewResponse.preview,
        sheetId: aiPreviewResponse.sheetId ?? worksheetSheetIdRef.current ?? null,
        sheetName: aiPreviewWorksheetName.trim() || aiPreviewResponse.sheetName,
      });
      setMessage("AI worksheet changes reverted.");
      resetAiPreviewState();
    } catch (aiReviewError) {
      setAiPreviewError(
        aiReviewError instanceof Error ? aiReviewError.message : "Unable to reject the AI worksheet response."
      );
    } finally {
      setIsSubmittingAiReview(false);
    }
  }, [
    aiPreviewResponse,
    aiPreviewWorksheetName,
    logAiPreviewOutcomeEvent,
    resetAiPreviewState,
    revertAiPreApplySnapshot,
    submitAiWorksheetReview,
  ]);

  const dismissAiChat = useCallback(() => {
    if (isSubmittingAiReview || isSubmittingAiFollowUp) {
      return;
    }
    resetAiPreviewState();
  }, [isSubmittingAiFollowUp, isSubmittingAiReview, resetAiPreviewState]);

  const applyAiSuggestedEditGroup = useCallback(async (groupId: string) => {
    if (!aiPreviewResponse?.preview.assistant) {
      setAiPreviewError("Ask AI for a review before applying a suggested edit.");
      return;
    }

    if ((aiPreviewResponse.sheetId ?? null) !== (worksheetSheetIdRef.current ?? null)) {
      setAiPreviewError("This AI preview belongs to a different worksheet page. Ask AI again on the current page.");
      resetAiPreviewState();
      return;
    }

    if (!canMutateWorksheet) {
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
      nextWorksheet = applyAiProvenanceToWorksheet({
        nextWorksheet,
        aiInteractionId: aiPreviewResponse.aiInteractionId,
        promptSummary: aiPreviewResponse.preview.assistant?.summary ?? aiPrompt,
        operationTypes: selectedResponse.operations.map((operation) => operation.type),
        batchIndex: aiPreviewResponse.preview.continuation?.currentBatchIndex ?? 1,
      });

      await submitAiWorksheetReview("edited", {
        ...buildWorksheetAiEditedOutput({
          preview: aiPreviewResponse.preview,
          workbookId: worksheetId ?? null,
          sheetId: aiPreviewResponse.sheetId ?? worksheetSheetIdRef.current ?? null,
          sheetName: nextWorksheet.sheetName,
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
      replaceSelection(buildWorksheetCellKey("A", "1"), buildWorksheetCellKey("A", "1"));
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
    aiPrompt,
    applyAiProvenanceToWorksheet,
    autoLayoutWorksheet,
    applyCommittedWorksheetChange,
    canMutateWorksheet,
    logAiReviewIntelligenceEvent,
    replaceSelection,
    resetAiPreviewState,
    submitAiWorksheetReview,
    worksheetId,
  ]);

  const applyAiWorksheetPreview = useCallback(async () => {
    if (!aiPreviewResponse) {
      setAiPreviewError("Ask AI for a worksheet response before applying it.");
      return;
    }

    const blockingPreviewIssue = getBlockingAiPreviewIssue(aiPreviewResponse.preview);
    if (blockingPreviewIssue) {
      setAiPreviewError(blockingPreviewIssue.message);
      return;
    }

    if ((aiPreviewResponse.sheetId ?? null) !== (worksheetSheetIdRef.current ?? null)) {
      setAiPreviewError("This AI preview belongs to a different worksheet page. Ask AI again on the current page.");
      resetAiPreviewState();
      return;
    }

    const hasMutatingOperations =
      (aiPreviewResponse.preview.assistant?.operations ?? []).some((operation) => operation.type !== "explain_formula") ?? false;
    if (hasMutatingOperations && !canMutateWorksheet) {
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
        workbookId: worksheetId ?? null,
        sheetId: aiPreviewResponse.sheetId ?? worksheetSheetIdRef.current ?? null,
        sheetName: aiPreviewWorksheetName.trim() || aiPreviewResponse.sheetName,
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
      logAiPreviewOutcomeEvent({
        eventType: "worksheet_ai_preview_accepted",
        action: "accepted",
        aiInteractionId: aiPreviewResponse.aiInteractionId,
        preview: aiPreviewResponse.preview,
        sheetId: aiPreviewResponse.sheetId ?? worksheetSheetIdRef.current ?? null,
        sheetName: aiPreviewWorksheetName.trim() || aiPreviewResponse.sheetName,
        acceptedFindingIds: editedOutput.acceptedFindingIds,
        rejectedFindingIds: editedOutput.rejectedFindingIds,
        appliedSuggestedEditGroupIds: aiAppliedSuggestedEditGroupIds,
      });

      if (hasMutatingOperations) {
        logWorksheetAiContinuation("apply_batch_started", {
          currentBatchIndex: aiPreviewResponse.preview.continuation?.currentBatchIndex ?? 1,
          remainingBatchCountBeforeApply: aiPreviewResponse.preview.continuation?.remainingBatchCount ?? 0,
          totalBatchCount: aiPreviewResponse.preview.continuation?.totalBatchCount ?? 1,
          operationCount: aiPreviewResponse.preview.assistant?.operations.length ?? 0,
        });
        let nextWorksheet = cloneWorksheetData(aiPreviewResponse.preview.worksheet);
        nextWorksheet = autoLayoutWorksheet(nextWorksheet, aiPreviewResponse.preview.assistant?.diffSummary);
        nextWorksheet.sheetName =
          aiPreviewWorksheetName.trim() || aiPreviewResponse.preview.compactOutput.worksheetName || nextWorksheet.sheetName;
        nextWorksheet = applyAiProvenanceToWorksheet({
          nextWorksheet,
          aiInteractionId: aiPreviewResponse.aiInteractionId,
          promptSummary: aiPreviewResponse.preview.assistant?.summary ?? aiPrompt,
          operationTypes: aiPreviewResponse.preview.assistant?.operations.map((operation) => operation.type) ?? [],
          batchIndex: aiPreviewResponse.preview.continuation?.currentBatchIndex ?? 1,
        });

        const commitResult = applyCommittedWorksheetChange(() => nextWorksheet, {
          validateFormulaOutputs: true,
        });
        if (!commitResult.committed) {
          setAiPreviewError(commitResult.message ?? "Unable to apply the AI worksheet response.");
          return;
        }

        setWorksheetName(nextWorksheet.sheetName);
        setWorksheetTradePackage(normalizedTradePackage);
        replaceSelection(buildWorksheetCellKey("A", "1"), buildWorksheetCellKey("A", "1"));
        setActiveCellKey(null);
        setActiveEditor(null);
        setEditingCellValue("");
        const nextContinuationAssistantPreview =
          aiPreviewResponse.preview.continuation && aiPreviewResponse.preview.assistant
            ? buildPricingWorksheetContinuationPreview({
                preview: {
                  mode: aiPreviewResponse.preview.assistant.mode,
                  proposalName: aiPreviewResponse.preview.assistant.proposalName,
                  answer: aiPreviewResponse.preview.assistant.answer,
                  summary: aiPreviewResponse.preview.assistant.summary,
                  confidence: aiPreviewResponse.preview.assistant.confidence,
                  operations:
                    aiPreviewResponse.preview.continuation.remainingBatches[0]?.operations ??
                    [],
                  assumptions: aiPreviewResponse.preview.assistant.assumptions,
                  warnings: aiPreviewResponse.preview.assistant.warnings,
                  reviewFindings: aiPreviewResponse.preview.assistant.reviewFindings ?? [],
                  reviewSummary: aiPreviewResponse.preview.assistant.reviewSummary ?? null,
                  suggestedEditGroups: aiPreviewResponse.preview.assistant.suggestedEditGroups ?? [],
                  evidenceSources: aiPreviewResponse.preview.assistant.evidenceSources ?? [],
                  worksheet: aiPreviewResponse.preview.worksheet,
                  diffSummary: aiPreviewResponse.preview.assistant.diffSummary,
                  diffPreview: aiPreviewResponse.preview.assistant.diffPreview ?? {
                    changedCells: [],
                    insertedRows: [],
                    affectedSections: [],
                    formulaChanges: [],
                    formattingChanges: [],
                  },
                  storageSummary: {
                    responseMode: aiPreviewResponse.preview.assistant.mode,
                    sanitizedOperations: [],
                    affectedCellRefs: aiPreviewResponse.preview.assistant.diffSummary.changedCells,
                    formulaChangeSummary: aiPreviewResponse.preview.assistant.diffPreview?.formulaChanges ?? [],
                    formattingChangeSummary:
                      aiPreviewResponse.preview.assistant.diffPreview?.formattingChanges.map((change) => ({
                        ref: change.ref,
                        beforeFormattingSummary: change.beforeFormattingSummary,
                        afterFormattingSummary: change.afterFormattingSummary,
                      })) ?? [],
                    insertedRowSummary:
                      aiPreviewResponse.preview.assistant.diffPreview?.insertedRows.map((row) => ({
                        row: row.row,
                        sectionName: row.sectionName,
                      })) ?? [],
                    affectedSections: aiPreviewResponse.preview.assistant.diffPreview?.affectedSections ?? [],
                    assumptions: aiPreviewResponse.preview.assistant.assumptions,
                    warnings: aiPreviewResponse.preview.assistant.warnings,
                    evidenceSources: aiPreviewResponse.preview.assistant.evidenceSources ?? [],
                    reviewFindings: aiPreviewResponse.preview.assistant.reviewFindings ?? [],
                    reviewSummary: aiPreviewResponse.preview.assistant.reviewSummary ?? null,
                    suggestedEditGroups:
                      (aiPreviewResponse.preview.assistant.suggestedEditGroups ?? []).map((group) => ({
                        id: group.id,
                        title: group.title,
                        purpose: group.purpose,
                        confidence: group.confidence,
                        relatedFindingIds: group.relatedFindingIds,
                        operationTypes: group.operations.map((operation) => operation.type),
                      })),
                    continuation: aiPreviewResponse.preview.continuation
                      ? {
                          strategy: aiPreviewResponse.preview.continuation.strategy,
                          currentBatchIndex: aiPreviewResponse.preview.continuation.currentBatchIndex,
                          totalBatchCount: aiPreviewResponse.preview.continuation.totalBatchCount,
                          remainingBatchCount: aiPreviewResponse.preview.continuation.remainingBatchCount,
                          remainingOperationCount: aiPreviewResponse.preview.continuation.remainingOperationCount,
                        }
                      : null,
                  },
                  validationIssues: [],
                  validationWarnings: aiPreviewResponse.preview.validationWarnings,
                  compactOutput: aiPreviewResponse.preview.compactOutput,
                  matchedMemory: aiPreviewResponse.preview.matchedMemory,
                  contextSummary: aiPreviewResponse.preview.contextSummary,
                  classification: aiPreviewResponse.preview.classification ?? {
                    primaryIntent: "worksheet_generation",
                    defaultJurisdiction: "AUS_NZ",
                    requiresConstructionReasoning: true,
                    requiresRetrieval: false,
                    tradeHints: [],
                    systemHints: [],
                    confidence: "medium",
                    riskLevel: "medium",
                    shouldAskFollowUp: false,
                    reason: "Continuation preview",
                    recommendedPromptPath: "generation",
                  },
                  continuation: aiPreviewResponse.preview.continuation,
                },
                worksheet: nextWorksheet,
              })
            : null;

        if (nextContinuationAssistantPreview) {
          const nextContinuationPreview: PricingWorksheetAiPreviewResponse = {
            ...aiPreviewResponse,
            preview: {
              ...aiPreviewResponse.preview,
              worksheet: nextContinuationAssistantPreview.worksheet,
              compactOutput: nextContinuationAssistantPreview.compactOutput,
              matchedMemory: nextContinuationAssistantPreview.matchedMemory,
              validationWarnings: nextContinuationAssistantPreview.validationWarnings,
              contextSummary: nextContinuationAssistantPreview.contextSummary,
              classification: nextContinuationAssistantPreview.classification,
              continuation: nextContinuationAssistantPreview.continuation,
              assistant: {
                mode: nextContinuationAssistantPreview.mode,
                proposalName: nextContinuationAssistantPreview.proposalName,
                answer: nextContinuationAssistantPreview.answer,
                summary: nextContinuationAssistantPreview.summary,
                confidence: nextContinuationAssistantPreview.confidence,
                operations: nextContinuationAssistantPreview.operations.map((operation) => ({
                  type: operation.type,
                  rationale: operation.rationale ?? "",
                })),
                assumptions: nextContinuationAssistantPreview.assumptions,
                warnings: nextContinuationAssistantPreview.warnings,
                evidenceSources: nextContinuationAssistantPreview.evidenceSources,
                reviewFindings: nextContinuationAssistantPreview.reviewFindings,
                reviewSummary: nextContinuationAssistantPreview.reviewSummary,
                suggestedEditGroups: nextContinuationAssistantPreview.suggestedEditGroups,
                diffSummary: nextContinuationAssistantPreview.diffSummary,
                diffPreview: nextContinuationAssistantPreview.diffPreview,
              },
            },
          };
          logWorksheetAiContinuation("apply_batch_advanced", {
            currentBatchIndex: nextContinuationPreview.preview.continuation?.currentBatchIndex ?? null,
            remainingBatchCountAfterApply: nextContinuationPreview.preview.continuation?.remainingBatchCount ?? 0,
            totalBatchCount: nextContinuationPreview.preview.continuation?.totalBatchCount ?? 1,
            nextOperationCount: nextContinuationPreview.preview.assistant?.operations.length ?? 0,
          });
          applyAiPreviewPayload(nextContinuationPreview);
          setMessage("Applied the next safe worksheet batch. TradesStack queued the following batch for review.");
          return;
        }

        logWorksheetAiContinuation("apply_batch_completed", {
          currentBatchIndex: aiPreviewResponse.preview.continuation?.currentBatchIndex ?? 1,
          remainingBatchCountAfterApply: 0,
          totalBatchCount: aiPreviewResponse.preview.continuation?.totalBatchCount ?? 1,
          continuationCleared: true,
        });

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
    aiPrompt,
    applyAiProvenanceToWorksheet,
    autoLayoutWorksheet,
    applyAiPreviewPayload,
    applyCommittedWorksheetChange,
    canMutateWorksheet,
    handleAiDialogOpenChange,
    logAiPreviewOutcomeEvent,
    replaceSelection,
    resetAiPreviewState,
    submitAiWorksheetReview,
    worksheetId,
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
      activeCellKey === cellKey &&
      (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    ) {
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
    const isAdditiveSelection = event.ctrlKey || event.metaKey;
    startPendingRangeSelection(cellKey, event.clientX, event.clientY, {
      anchorCellKey: selectionAnchorCellKey,
      mode:
        event.shiftKey && Boolean(selectionAnchorCellKey)
          ? "extend"
          : isAdditiveSelection
            ? "add"
            : "replace",
    });
  }, [activeCellKey, appendCellReferenceToFormula, isFormulaReferenceMode, selectionAnchorCellKey, startPendingRangeSelection]);

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

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      setSelectionState((current) => toggleWorksheetCellSelection(current, worksheetRef.current, cellKey));
      return;
    }

    if (event.shiftKey && selectionAnchorCellKey) {
      replaceSelection(selectionAnchorCellKey, cellKey);
      return;
    }

    if (event.detail === 1) {
      selectSingleCell(cellKey);
      if (commercialMapping.session?.activeField) {
        commercialMapping.assignCell(cellKey);
        setIsNarrowCommercialCellPicker(false);
      } else if (variationCommercialMapping.session?.lines.some((line) => line.mapping.activeField)) {
        variationCommercialMapping.assignCell(cellKey);
        setIsNarrowCommercialCellPicker(false);
      } else if (measureMapping.session?.activeField) {
        measureMapping.assignCell(cellKey);
      }
    }
  }, [appendCellReferenceToFormula, commercialMapping, isFormulaReferenceMode, measureMapping, replaceSelection, selectSingleCell, selectionAnchorCellKey, variationCommercialMapping]);

  const handleGridCellKeyDown = useCallback((
    cellKey: string,
    event: ReactKeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelCellEdit(cellKey);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const nextCellKey = getAdjacentCellKey(
        cellKey,
        getWorksheetCommitMovement("Enter", event.shiftKey),
      );
      suppressBlurCommitCellKeyRef.current = cellKey;
      commitCellEdit(cellKey, editingCellValue, nextCellKey);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const nextCellKey = getAdjacentCellKey(
        cellKey,
        getWorksheetCommitMovement("Tab", event.shiftKey),
      );
      suppressBlurCommitCellKeyRef.current = cellKey;
      commitCellEdit(cellKey, editingCellValue, nextCellKey);
    }
  }, [cancelCellEdit, commitCellEdit, editingCellValue, getAdjacentCellKey]);

  const handleEditorTextSelect = useCallback((event: ReactSyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const selection = {
      start: event.currentTarget.selectionStart ?? event.currentTarget.value.length,
      end: event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
    };
    updateFormulaReferencePickState(event.currentTarget.value, selection);
  }, [updateFormulaReferencePickState]);

  const handleEditingCellValueChange = useCallback((
    value: string,
    selection: WorksheetTextSelection,
  ) => {
    updateFormulaReferencePickState(value, selection);
    setEditingCellValue(value);
  }, [updateFormulaReferencePickState]);

  const handleCommercialMappingDragStart = useCallback((cellKey: string, event: ReactDragEvent<HTMLButtonElement>) => {
    if (!commercialMapping.session && !variationCommercialMapping.session) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-tradesstack-worksheet-cell", cellKey);
    event.dataTransfer.setData("text/plain", cellKey);
  }, [commercialMapping.session, variationCommercialMapping.session]);

  const stableBeginGridCellEdit = useStableWorksheetEvent(handleBeginGridCellEdit);
  const stableBeginFillDrag = useStableWorksheetEvent(beginFillDrag);
  const stableAutoFitRow = useStableWorksheetEvent(autoFitRow);
  const stableBeginRowResize = useStableWorksheetEvent(beginRowResize);
  const stableGridCellClick = useStableWorksheetEvent(handleGridCellClick);
  const stableCellContextMenu = useStableWorksheetEvent(handleCellContextMenu);
  const stableGridCellMouseDown = useStableWorksheetEvent(handleGridCellMouseDown);
  const stableRangeSelectionUpdate = useStableWorksheetEvent(updateRangeSelection);
  const stableCellBlur = useStableWorksheetEvent(handleCellBlur);
  const stableGridCellKeyDown = useStableWorksheetEvent(handleGridCellKeyDown);
  const stableRowHeaderClick = useStableWorksheetEvent(handleRowHeaderClick);
  const stableRowContextMenu = useStableWorksheetEvent(openRowContextMenu);
  const handleWorksheetViewportScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    const nextHeight = viewport.clientHeight || WORKSHEET_VIEWPORT_FALLBACK_HEIGHT;
    const nextWidth = viewport.clientWidth || WORKSHEET_VIEWPORT_FALLBACK_WIDTH;
    const zoom = worksheetZoom > 0 ? worksheetZoom : 1;
    const nextRowWindow = getRowVirtualizationWindow(
      effectiveRows,
      rowOffsets,
      viewport.scrollTop / zoom,
      nextHeight / zoom,
      WORKSHEET_ROW_OVERSCAN,
    );
    const nextColumnWindow = getColumnVirtualizationWindow(
      effectiveColumns,
      columnOffsets,
      viewport.scrollLeft / zoom,
      Math.max(0, nextWidth / zoom - WORKSHEET_ROW_GUTTER_WIDTH),
      WORKSHEET_COLUMN_OVERSCAN,
    );

    setWorksheetViewportHeight((current) => current === nextHeight ? current : nextHeight);
    setWorksheetViewportWidth((current) => current === nextWidth ? current : nextWidth);
    if (
      nextRowWindow.startIndex !== virtualRows.startIndex ||
      nextRowWindow.endIndex !== virtualRows.endIndex
    ) {
      setWorksheetViewportScrollTop(viewport.scrollTop);
    }
    if (
      nextColumnWindow.startIndex !== virtualColumns.startIndex ||
      nextColumnWindow.endIndex !== virtualColumns.endIndex
    ) {
      setWorksheetViewportScrollLeft(viewport.scrollLeft);
    }
  }, [
    columnOffsets,
    effectiveColumns,
    effectiveRows,
    rowOffsets,
    virtualColumns.endIndex,
    virtualColumns.startIndex,
    virtualRows.endIndex,
    virtualRows.startIndex,
    worksheetZoom,
  ]);

  const worksheetZoomSliderPercent = (() => {
    const minZoom = WORKSHEET_ZOOM_LEVELS[0];
    const maxZoom = WORKSHEET_ZOOM_LEVELS[WORKSHEET_ZOOM_LEVELS.length - 1];
    return Math.min(100, Math.max(0, ((worksheetZoom - minZoom) / (maxZoom - minZoom)) * 100));
  })();
  const hasUnsavedTitle = worksheetTitleAutosave.status !== "idle";
  const isWorksheetSaveInProgress = isSavingWorksheet || worksheetTitleAutosave.status === "saving";
  const worksheetSaveStatusLabel = worksheetTitleAutosave.status === "error"
    ? "Save failed"
    : isWorksheetSaveInProgress
      ? "Saving..."
      : isDirty || worksheetTitleAutosave.status === "pending"
        ? "Unsaved changes"
        : lastSavedAt
          ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString("en-NZ", {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "Not saved yet";
  const materialTargetIssue = materialTarget && (
    materialTarget.sheetId !== worksheetSheetId ||
    materialTarget.structureKey !== worksheetStructureKey ||
    !getWorksheetAnchorPosition(worksheet, materialTarget.cellAddress)
  )
    ? "The selected cell is no longer available. Select a new cell to continue."
    : !materialTarget && selectedRanges.length > 0 && !selectedSingleCellKey
      ? "Material prices can only be inserted into one selected cell."
      : null;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="shrink-0 border-b border-[color-mix(in_srgb,var(--topbar)_82%,white_18%)] bg-[var(--topbar)] px-4 py-2.5 text-white">
          <div className="flex min-h-12 items-center justify-between gap-4">
            <div ref={worksheetNameEditorRef} className="relative flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white/15 text-white">
                  <FileSpreadsheet className="h-4.5 w-4.5" strokeWidth={1.75} />
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {isWorksheetNameEditorOpen ? (
                  <input
                    value={worksheetTitleDraft}
                    onChange={(event) => updateWorksheetNameDraft(event.target.value)}
                    onBlur={applyWorksheetNameDraft}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyWorksheetNameDraft();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        restoreConfirmedWorksheetName();
                        event.currentTarget.blur();
                      }
                    }}
                    autoFocus
                    aria-label="Worksheet name"
                    className="min-w-0 rounded-[6px] bg-white/10 px-1 py-0.5 text-left text-[14px] font-medium leading-5 text-white outline-none ring-2 ring-white/45 sm:text-[16px]"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={openWorksheetNameEditor}
                    disabled={!canMutateWorksheet}
                    className="min-w-0 truncate rounded-[6px] px-1 py-0.5 text-left text-[14px] font-medium leading-5 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 sm:text-[16px]"
                    aria-label="Edit worksheet name"
                  >
                    {worksheetDisplayName}
                  </button>
                )}
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-white/75">
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2 w-2 rounded-full ${
                      worksheetTitleAutosave.status === "error"
                        ? "bg-[var(--error)]"
                        : isDirty || hasUnsavedTitle
                          ? "bg-[var(--orange-primary)]"
                          : "bg-[var(--success)]"
                    }`}
                  />
                  <span>{worksheetSaveStatusLabel}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pr-14">
              <div className="flex h-9 items-center gap-2">
                <input
                  type="range"
                  min={WORKSHEET_ZOOM_LEVELS[0]}
                  max={WORKSHEET_ZOOM_LEVELS[WORKSHEET_ZOOM_LEVELS.length - 1]}
                  step={0.05}
                  value={worksheetZoom}
                  onChange={(event) => setWorksheetZoom(clampWorksheetZoom(Number(event.target.value)))}
                  aria-label="Worksheet zoom slider"
                  className="h-1.5 w-24 cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/45 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_1px_2px_rgba(15,23,42,0.4)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_2px_rgba(15,23,42,0.4)]"
                  style={{
                    background: `linear-gradient(to right, rgba(255,255,255,0.85) ${worksheetZoomSliderPercent}%, rgba(255,255,255,0.2) ${worksheetZoomSliderPercent}%)`,
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-9 rounded-[10px] border-0 bg-white/10 px-3 text-[12px] font-semibold text-white shadow-none hover:bg-white/15"
                      aria-label="Worksheet zoom"
                    >
                      {Math.round(worksheetZoom * 100)}%
                      <ChevronDown className="h-3.5 w-3.5 text-white/75" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-[7rem] rounded-[10px] p-1">
                    {WORKSHEET_ZOOM_LEVELS.map((level) => (
                      <DropdownMenuItem
                        key={level}
                        onSelect={() => setWorksheetZoom(level)}
                        className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                      >
                        {Math.round(level * 100)}%
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="h-6 w-px bg-white/20" />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setIsPagesTrayOpen((current) => !current)}
                className={`h-9 rounded-[10px] border-0 px-3 text-[12px] font-semibold text-white shadow-none ${
                  isPagesTrayOpen ? "bg-white/18" : "bg-white/10 hover:bg-white/15"
                }`}
                aria-pressed={isPagesTrayOpen}
                aria-label={isPagesTrayOpen ? "Hide worksheet pages" : "Show worksheet pages"}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Pages
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveWorksheetAndTitle()}
                disabled={
                  !canMutateWorksheet || isWorksheetSaveInProgress || isLoadingWorksheet || (!isDirty && !hasUnsavedTitle)
                }
                className="h-9 rounded-[10px] border-0 bg-white/10 px-3 text-[12px] font-semibold text-white shadow-none hover:bg-white/15 disabled:bg-white/10 disabled:text-white/45"
              >
                {isWorksheetSaveInProgress ? "Saving..." : "Save"}
              </Button>
              {onClose ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void closeWorksheet()}
                  disabled={isSavingWorksheet || isLoadingWorksheet}
                  className="h-9 rounded-[10px] bg-white px-4 text-[12px] font-semibold text-[var(--navy-primary)] shadow-[0_8px_20px_rgba(15,23,42,0.18)] hover:bg-[var(--surface-subtle)] disabled:bg-white/60 disabled:text-[var(--text-secondary)]"
                >
                  Close
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div
          ref={worksheetSurfaceRef}
          role="grid"
          aria-label="Pricing worksheet"
          aria-activedescendant={activeDescendantCellId}
          className="relative flex min-h-0 flex-1 flex-col space-y-0 bg-[var(--surface-muted)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-blue)]"
          tabIndex={0}
          onPasteCapture={handleWorksheetPaste}
          onCopy={handleWorksheetCopy}
          onKeyDown={handleWorksheetKeyDown}
        >
          {commercialMapping.session ? (
            <div data-testid="commercial-mapping-mode-banner" className="mx-3 mt-2 flex shrink-0 items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--brand-blue)_35%,var(--border))] bg-[var(--primary-soft)] px-3 py-2 text-xs text-[var(--text-primary)]">
              <span><strong>{commercialMapping.session.destination === "quote" ? "Quote" : "Purchase Order"} Mapping Mode.</strong> Select worksheet cells to populate the fields. Esc to cancel.</span>
              {isNarrowCommercialCellPicker ? <Button type="button" size="sm" variant="secondary" onClick={() => setIsNarrowCommercialCellPicker(false)}>Back to mappings</Button> : null}
            </div>
          ) : null}
          {variationCommercialMapping.session && isNarrowCommercialCellPicker ? (
            <div className="mx-3 mt-2 flex shrink-0 justify-end">
              <Button type="button" size="sm" variant="secondary" onClick={() => setIsNarrowCommercialCellPicker(false)}>Back to mappings</Button>
            </div>
          ) : null}
          {error ? <OperationalAlert variant="error" className="mx-3 mt-3">{error}</OperationalAlert> : null}
          {message ? <OperationalAlert variant="success" className="mx-3 mt-3">{message}</OperationalAlert> : null}

          <div
            ref={formattingToolbarRef}
            tabIndex={-1}
            style={{ zoom: 1.2 }}
            className="ml-[60px] mt-2.5 w-fit max-w-[calc(100%-72px)] overflow-x-auto rounded-[14px] border border-[var(--border)] bg-white px-2.5 py-1.5 shadow-[var(--shadow-card-elevated)] outline-none"
          >
            <div className="flex min-w-max items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={openAiDialog}
                disabled={isSavingWorksheet || isLoadingWorksheet}
                className="h-8 shrink-0 rounded-[8px] border border-[var(--brand-blue)]/25 bg-[var(--brand-blue)]/10 px-3 text-[12px] font-semibold text-[var(--brand-blue)] shadow-none hover:bg-[var(--brand-blue)]/15"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask AI
              </Button>
              <div className="h-5 w-px bg-[var(--border)]" />
              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  className={`h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[16px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                    selectedNumberFormatKind === "currency" ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : ""
                  }`}
                  aria-label="Currency format"
                  onClick={() => applyNumberFormatKindToSelection("currency")}
                  disabled={!canMutateWorksheet || !selectedRange}
                >
                  $
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className={`h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[16px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                    selectedNumberFormatKind === "percent" ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : ""
                  }`}
                  aria-label="Percent format"
                  onClick={() => applyNumberFormatKindToSelection("percent")}
                  disabled={!canMutateWorksheet || !selectedRange}
                >
                  %
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex h-8 w-[46px] items-center justify-center gap-1 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                  aria-label="Decrease decimal places"
                  onClick={() => adjustNumberDecimalPlacesForSelection("decrease")}
                  disabled={!canMutateWorksheet || !selectedRange}
                >
                  <span className="text-[14px] font-medium leading-none">.0</span>
                  <span className="text-[12px] leading-none text-[var(--text-secondary)]">←</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex h-8 w-[54px] items-center justify-center gap-1 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                  aria-label="Increase decimal places"
                  onClick={() => adjustNumberDecimalPlacesForSelection("increase")}
                  disabled={!canMutateWorksheet || !selectedRange}
                >
                  <span className="text-[14px] font-medium leading-none">.00</span>
                  <span className="text-[12px] leading-none text-[var(--text-secondary)]">→</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className={`h-8 rounded-[8px] border-0 bg-transparent px-2 text-[14px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                    selectedNumberFormatKind === "number" ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : ""
                  }`}
                  aria-label="Number format"
                  onClick={() => applyNumberFormatKindToSelection("number")}
                  disabled={!canMutateWorksheet || !selectedRange}
                >
                  123
                </Button>
              </div>
              <div className="h-5 w-px bg-[var(--border)]" />
              <div className="flex items-center gap-1">
                <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canMutateWorksheet || !selectedRange}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-[8px] border-0 bg-transparent px-2 text-[13px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                    disabled={!canMutateWorksheet || !selectedRange}
                  >
                    <Grid2X2 className="h-5 w-5" strokeWidth={1.75} />
                    Insert
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-[9rem] rounded-[10px] p-1">
                  <DropdownMenuItem
                    onSelect={() => insertRowAtSelection("above")}
                    disabled={!canMutateWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Row above
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => insertRowAtSelection("below")}
                    disabled={!canMutateWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Row below
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => insertColumnAtSelection("left")}
                    disabled={!canMutateWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Column left
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => insertColumnAtSelection("right")}
                    disabled={!canMutateWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Column right
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
              <Tooltip label="Browse Material Library">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={openMaterialLibrary}
                  disabled={isLoadingWorksheet || isSavingWorksheet}
                  aria-label="Open Material Library"
                  aria-pressed={activeSidePanel === "materials"}
                  className={`h-9 rounded-[8px] border-0 bg-transparent px-2.5 text-[13px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                    activeSidePanel === "materials" ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : ""
                  }`}
                >
                  <Boxes className="h-4 w-4" strokeWidth={1.75} />
                  Materials
                </Button>
              </Tooltip>
              <Tooltip label="Browse Project Measures">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={openMeasureDrawer}
                  disabled={isLoadingWorksheet || isSavingWorksheet}
                  aria-label="Open Measures"
                  aria-pressed={activeSidePanel === "measures"}
                  className={`h-9 rounded-[8px] border-0 bg-transparent px-2.5 text-[13px] font-medium text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                    activeSidePanel === "measures" ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : ""
                  }`}
                >
                  <Ruler className="h-4 w-4" strokeWidth={1.75} />
                  Measures
                </Button>
              </Tooltip>
              <div className="h-5 w-px bg-[var(--border)]" />
              <div className="flex items-center gap-1">
                <Tooltip label="Fill colour">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={!canMutateWorksheet || !selectedRange}>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                      disabled={!canMutateWorksheet || !selectedRange}
                      aria-label="Fill color"
                    >
                      <span className="relative flex h-6 w-6 translate-y-0.5 items-center justify-center">
                        <PaintBucket className="h-4.5 w-4.5" strokeWidth={1.75} />
                        <span
                          aria-hidden="true"
                          className="absolute bottom-[1px] h-0.5 w-[15px] rounded-full bg-[var(--surface-subtle)]"
                          style={selectedFillColor ? { backgroundColor: selectedFillColor } : undefined}
                        />
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="w-[14rem] rounded-[10px] p-2">
                    <div className="grid w-fit grid-cols-5 gap-2 px-1.5 py-0.5">
                      {FILL_SWATCHES.map((color) => (
                        <DropdownMenuItem
                          key={`fill-${color}`}
                          onSelect={() => applyFormattingPatchToSelection({ fill: { color } })}
                          disabled={!canMutateWorksheet || !selectedRange}
                          className="flex h-6 w-6 items-center justify-center rounded-full p-0 focus:bg-transparent"
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] ${
                              selectedFillColor === color
                                ? "ring-2 ring-[var(--brand-blue)] ring-offset-1 ring-offset-white"
                                : ""
                            }`}
                            style={{ backgroundColor: color }}
                          />
                          <span className="sr-only">{`Set fill color ${color}`}</span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="px-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      Custom
                    </DropdownMenuLabel>
                    <div className="flex items-center gap-2 px-1.5 pb-1 pt-1.5">
                      <span
                        aria-hidden="true"
                        className="h-7 w-7 shrink-0 rounded-full border border-[var(--border)]"
                        style={{ backgroundColor: normalizedCustomFillColor ?? selectedFillColor ?? "#FFFFFF" }}
                      />
                      <input
                        value={customFillColorInput}
                        onChange={(event) => setCustomFillColorInput(event.target.value)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter") {
                            event.preventDefault();
                            applyCustomFillColorForSelection();
                          }
                        }}
                        onClick={(event) => event.stopPropagation()}
                        placeholder="#DBEAFE"
                        disabled={!canMutateWorksheet || !selectedRange}
                        aria-label="Custom fill colour hex"
                        className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!canMutateWorksheet || !selectedRange || !normalizedCustomFillColor}
                        onClick={applyCustomFillColorForSelection}
                        className="h-8 rounded-[8px] border-[var(--border)] px-2 text-[12px] font-medium shadow-none"
                      >
                        Apply
                      </Button>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => applyFormattingPatchToSelection((format) => clearCellFill(format))}
                      disabled={!canMutateWorksheet || !selectedRange}
                      className="flex h-9 items-center gap-2 rounded-[6px] px-2 text-[13px] font-medium"
                    >
                      <Eraser className="h-4 w-4" />
                      Reset
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </Tooltip>
                <Tooltip label="Borders">
                <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canMutateWorksheet || !selectedRange}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                    disabled={!canMutateWorksheet || !selectedRange}
                    aria-label="Borders"
                  >
                    <Grid2X2 className="h-5 w-5" strokeWidth={1.75} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="w-auto rounded-[12px] p-2">
                  <div className="flex items-stretch gap-2">
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          "all",
                          "outer",
                          "inner",
                          "top",
                          "horizontal",
                          "bottom",
                          "left",
                          "vertical",
                          "right",
                        ] as const
                      ).map((mode) => (
                        <DropdownMenuItem
                          key={mode}
                          onSelect={() => applyBorderModeToSelection(mode)}
                          disabled={!canMutateWorksheet || !selectedRange}
                          aria-label={`${mode} border`}
                          className="flex h-9 w-9 items-center justify-center rounded-[8px] p-0 focus:bg-[var(--surface-muted)] data-[highlighted]:bg-[var(--surface-muted)]"
                        >
                          <BorderModeIcon mode={mode} />
                        </DropdownMenuItem>
                      ))}
                    </div>
                    <div className="w-px self-stretch bg-[var(--border)]" />
                    <DropdownMenuItem
                      onSelect={() => applyBorderModeToSelection("clear")}
                      disabled={!canMutateWorksheet || !selectedRange}
                      aria-label="Clear borders"
                      className="flex h-9 w-9 items-center justify-center self-start rounded-[8px] p-0 text-[var(--text-primary)] focus:bg-[var(--surface-muted)] data-[highlighted]:bg-[var(--surface-muted)]"
                    >
                      <RotateCcw className="h-5 w-5" strokeWidth={1.75} />
                    </DropdownMenuItem>
                  </div>
                  <DropdownMenuSeparator />
                  <button
                    type="button"
                    onClick={() => setShowGridlines((value) => !value)}
                    className="flex w-full items-center justify-between gap-6 rounded-[8px] px-2 py-1.5 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                  >
                    Show gridlines
                    <span
                      className={`relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors ${
                        showGridlines ? "bg-[var(--brand-blue)]" : "bg-[var(--border)]"
                      }`}
                    >
                      <span
                        className={`absolute flex h-[14px] w-[14px] items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                          showGridlines ? "translate-x-[14px]" : "translate-x-[2px]"
                        }`}
                      >
                        {showGridlines ? (
                          <Check className="h-2.5 w-2.5 text-[var(--brand-blue)]" strokeWidth={3} />
                        ) : null}
                      </span>
                    </span>
                  </button>
                </DropdownMenuContent>
              </DropdownMenu>
              </Tooltip>
              </div>
              <div className="h-5 w-px bg-[var(--border)]" />
              <div className="flex items-center gap-0.5 rounded-[8px] border border-[var(--border)] px-0.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 w-7 rounded-[6px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                  onClick={() => adjustFontSizeForSelection(-1)}
                  disabled={!canMutateWorksheet || !selectedRange || selectedFontSize <= MIN_WORKSHEET_FONT_SIZE}
                  aria-label="Decrease font size"
                >
                  <Minus className="h-4 w-4" strokeWidth={1.75} />
                </Button>
                <span className="min-w-[1.75rem] text-center text-[13px] font-medium tabular-nums text-[var(--text-primary)]">
                  {selectedFontSize}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 w-7 rounded-[6px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                  onClick={() => adjustFontSizeForSelection(1)}
                  disabled={!canMutateWorksheet || !selectedRange || selectedFontSize >= MAX_WORKSHEET_FONT_SIZE}
                  aria-label="Increase font size"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </div>
              <div className="flex items-center gap-1">
              <Tooltip label="Text colour">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canMutateWorksheet || !selectedRange}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                    disabled={!canMutateWorksheet || !selectedRange}
                    aria-label="Text color"
                  >
                    <span className="relative flex h-6 w-6 flex-col items-center justify-center">
                      <span
                        aria-hidden="true"
                        className="text-[18px] font-medium leading-none text-[var(--text-primary)]"
                      >
                        A
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute bottom-[1px] h-0.5 w-[15px] rounded-full"
                        style={{ backgroundColor: selectedTextColor ?? "#1E293B" }}
                      />
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="w-[14rem] rounded-[10px] p-2">
                  <div className="grid w-fit grid-cols-5 gap-2 px-1.5 py-0.5">
                    {TEXT_COLOR_PALETTE.map((color) => (
                      <DropdownMenuItem
                        key={`text-${color}`}
                        onSelect={() => applyFormattingPatchToSelection({ text: { color } })}
                        disabled={!canMutateWorksheet || !selectedRange}
                        className="flex h-6 w-6 items-center justify-center rounded-full p-0 focus:bg-transparent"
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] ${
                            selectedTextColor === color
                              ? "ring-2 ring-[var(--brand-blue)] ring-offset-1 ring-offset-white"
                              : ""
                          }`}
                          style={{ backgroundColor: color }}
                        >
                          {selectedTextColor === color ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                        </span>
                        <span className="sr-only">{`Set text color ${color}`}</span>
                      </DropdownMenuItem>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="px-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                    Custom
                  </DropdownMenuLabel>
                  <div className="flex items-center gap-2 px-1.5 pb-1 pt-1.5">
                    <span
                      aria-hidden="true"
                      className="h-7 w-7 shrink-0 rounded-full border border-[var(--border)]"
                      style={{ backgroundColor: normalizedCustomTextColor ?? selectedTextColor ?? "#111827" }}
                    />
                    <input
                      value={customTextColorInput}
                      onChange={(event) => setCustomTextColorInput(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyCustomTextColorForSelection();
                        }
                      }}
                      onClick={(event) => event.stopPropagation()}
                      placeholder="#1F2937"
                      disabled={!canMutateWorksheet || !selectedRange}
                      aria-label="Custom text colour hex"
                      className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-white px-2 text-[12px] font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canMutateWorksheet || !selectedRange || !normalizedCustomTextColor}
                      onClick={applyCustomTextColorForSelection}
                      className="h-8 rounded-[8px] border-[var(--border)] px-2 text-[12px] font-medium shadow-none"
                    >
                      Apply
                    </Button>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={clearTextColorForSelection}
                    disabled={!canMutateWorksheet || !selectedRange}
                    className="flex h-9 items-center gap-2 rounded-[6px] px-2 text-[13px] font-medium"
                  >
                    <Eraser className="h-4 w-4" />
                    Reset
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </Tooltip>
              <Tooltip label="Bold">
              <Button
                variant="secondary"
                size="sm"
                className={`h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                  selectedTextBold
                    ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]"
                    : ""
                }`}
                onClick={() => toggleTextStyle("bold")}
                disabled={!canMutateWorksheet || !selectedRange}
                aria-label="Bold"
              >
                <BoldIcon className="h-5 w-5" strokeWidth={2.1} />
              </Button>
              </Tooltip>
              <Tooltip label="Italic">
              <Button
                variant="secondary"
                size="sm"
                className={`h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                  selectedTextItalic ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : ""
                }`}
                onClick={() => toggleTextStyle("italic")}
                disabled={!canMutateWorksheet || !selectedRange}
                aria-label="Italic"
              >
                <ItalicIcon className="h-5 w-5" strokeWidth={1.75} />
              </Button>
              </Tooltip>
              <Tooltip label="Underline">
              <Button
                variant="secondary"
                size="sm"
                className={`h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                  selectedTextUnderline ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : ""
                }`}
                onClick={() => toggleTextStyle("underline")}
                disabled={!canMutateWorksheet || !selectedRange}
                aria-label="Underline"
              >
                <UnderlineIcon className="h-5 w-5" strokeWidth={1.75} />
              </Button>
              </Tooltip>
              <Tooltip label="Strikethrough">
              <Button
                variant="secondary"
                size="sm"
                className={`h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)] ${
                  selectedTextStrikethrough ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : ""
                }`}
                onClick={() => toggleTextStyle("strikethrough")}
                disabled={!canMutateWorksheet || !selectedRange}
                aria-label="Strikethrough"
              >
                <Strikethrough className="h-5 w-5" strokeWidth={1.75} />
              </Button>
              </Tooltip>
              <Tooltip label="Text alignment">
              <Button
                variant="secondary"
                size="sm"
                className="h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                disabled={!canMutateWorksheet || !selectedRange}
                aria-label={`Text alignment: ${selectedTextAlign}`}
                onClick={() => {
                  const currentIndex = TEXT_ALIGN_OPTIONS.findIndex((option) => option.value === selectedTextAlign);
                  const nextOption = TEXT_ALIGN_OPTIONS[(currentIndex + 1) % TEXT_ALIGN_OPTIONS.length];
                  applyFormattingPatchToSelection({ text: { align: nextOption.value } });
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  {selectedTextAlign === "center" ? (
                    <>
                      <line x1="5" y1="6" x2="19" y2="6" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                      <line x1="6" y1="18" x2="18" y2="18" />
                    </>
                  ) : selectedTextAlign === "right" ? (
                    <>
                      <line x1="5" y1="6" x2="19" y2="6" />
                      <line x1="13" y1="12" x2="19" y2="12" />
                      <line x1="10" y1="18" x2="19" y2="18" />
                    </>
                  ) : (
                    <>
                      <line x1="5" y1="6" x2="19" y2="6" />
                      <line x1="5" y1="12" x2="11" y2="12" />
                      <line x1="5" y1="18" x2="14" y2="18" />
                    </>
                  )}
                </svg>
              </Button>
              </Tooltip>
              <Tooltip label="Text wrapping">
              <Button
                variant="secondary"
                size="sm"
                className="h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                disabled={!canMutateWorksheet || !selectedRange}
                aria-label={`Text wrapping: ${selectedTextWrapMode}`}
                onClick={cycleTextWrapMode}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  {selectedTextWrapMode === "wrap" ? (
                    <>
                      <path d="M19 6 V11 a3 3 0 0 1 -3 3 H6" />
                      <polyline points="9 11 6 14 9 17" />
                    </>
                  ) : selectedTextWrapMode === "clip" ? (
                    <>
                      <line x1="6" y1="6" x2="6" y2="18" />
                      <line x1="18" y1="6" x2="18" y2="18" />
                      <line x1="6" y1="12" x2="18" y2="12" />
                    </>
                  ) : (
                    <>
                      <line x1="5" y1="5" x2="5" y2="19" />
                      <line x1="9" y1="12" x2="18" y2="12" />
                      <polyline points="14 8 18 12 14 16" />
                    </>
                  )}
                </svg>
              </Button>
              </Tooltip>
              </div>
              <div className="h-5 w-px bg-[var(--border)]" />
              <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canMutateWorksheet || !selectedRange}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 w-9 rounded-[8px] border-0 bg-transparent p-0 text-[var(--text-primary)] shadow-none hover:bg-[var(--surface-muted)]"
                    disabled={!canMutateWorksheet || !selectedRange}
                    aria-label="Clear formatting"
                  >
                    <Eraser className="h-5 w-5" strokeWidth={1.75} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-[9rem] rounded-[10px] p-1">
                  <DropdownMenuItem
                    onSelect={() =>
                      applyFormattingPatchToSelection((format) => clearCellFill(format))
                    }
                    disabled={!canMutateWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Clear fill
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={clearNumberFormatForSelection}
                    disabled={!canMutateWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Clear number format
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => applyBorderModeToSelection("clear")}
                    disabled={!canMutateWorksheet || !selectedRange}
                    className="h-8 rounded-[4px] px-2 text-[12px] font-medium"
                  >
                    Clear borders
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
          </div>

          <div className="mx-3 mt-2 flex shrink-0 items-center gap-1.5 px-0.5 py-1">
            <div className="flex h-8 w-12 shrink-0 items-center justify-center text-[13px] font-medium text-[var(--text-primary)]">
              {formulaBarCellKey}
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center text-[14px] font-medium italic text-[var(--text-muted)]">
              fx
            </div>
            <div className="relative min-h-8 min-w-0 flex-1 overflow-hidden rounded-[8px] border border-[var(--border)] bg-white focus-within:ring-2 focus-within:ring-[var(--brand-blue)]">
              {isFormulaEditing ? (
                <PricingWorksheetFormulaTextLayer
                  value={formulaBarValue}
                  className="pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre px-2.5 py-1.5 text-[14px] leading-[20px] text-[var(--text-primary)]"
                />
              ) : null}
              <textarea
              ref={formulaBarRef}
              value={formulaBarValue}
              rows={1}
              data-testid="pricing-worksheet-formula-bar"
              onFocus={(event) => {
                if (!formulaBarCellKey || !canMutateWorksheet) {
                  return;
                }

                beginCellEdit(formulaBarCellKey, formulaBarCell, {
                  editor: "formulaBar",
                  focus: false,
                  selection: {
                    start: event.currentTarget.selectionStart ?? event.currentTarget.value.length,
                    end: event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
                  },
                });
              }}
              onSelect={handleEditorTextSelect}
              onChange={(event) => {
                if (!formulaBarCellKey || !canMutateWorksheet) {
                  return;
                }

                if (activeCellKey !== formulaBarCellKey || activeEditor !== "formulaBar") {
                  setActiveCellKey(formulaBarCellKey);
                  setActiveEditor("formulaBar");
                  replaceSelection(formulaBarCellKey, formulaBarCellKey);
                }

                const selection = {
                  start: event.currentTarget.selectionStart ?? event.currentTarget.value.length,
                  end: event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
                };
                updateFormulaReferencePickState(event.target.value, selection);
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
                  cancelCellEdit(formulaBarCellKey);
                  return;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  const nextCellKey = getAdjacentCellKey(
                    formulaBarCellKey,
                    getWorksheetCommitMovement("Enter", event.shiftKey),
                  );
                  commitCellEdit(formulaBarCellKey, editingCellValue, nextCellKey);
                  return;
                }

                if (event.key === "Tab") {
                  event.preventDefault();
                  const nextCellKey = getAdjacentCellKey(
                    formulaBarCellKey,
                    getWorksheetCommitMovement("Tab", event.shiftKey),
                  );
                  commitCellEdit(formulaBarCellKey, editingCellValue, nextCellKey);
                }
              }}
              className="relative z-20 block min-h-8 w-full resize-none rounded-none border-0 bg-transparent px-2.5 py-1.5 text-[14px] leading-[20px] outline-none"
              style={{
                color: isFormulaEditing ? "transparent" : "var(--text-primary)",
                caretColor: "var(--text-primary)",
              }}
              placeholder="Enter a value or formula"
              disabled={!canMutateWorksheet}
              spellCheck={false}
              />
            </div>
          </div>

          {isAiChatOpen ? (
            <div className="pointer-events-none absolute top-[8.5rem] right-3 bottom-3 z-30 flex">
              <PricingWorksheetAiChatPanel
                answer={aiPreviewResponse?.preview.assistant?.answer ?? ""}
                summary={aiPreviewResponse?.preview.assistant?.summary ?? ""}
                confidence={aiPreviewResponse?.preview.assistant?.confidence ?? "medium"}
                assumptions={
                  aiPreviewResponse?.preview.assistant?.assumptions ??
                  aiPreviewResponse?.preview.compactOutput.assumptions ??
                  []
                }
                warnings={aiPreviewResponse?.preview.assistant?.warnings ?? []}
                changedCellCount={aiPreviewResponse?.preview.assistant?.diffSummary.changedCells.length ?? 0}
                isAnswerOnly={aiPreviewResponse?.preview.assistant?.mode === "answer_only"}
                canApply={
                  (canMutateWorksheet || aiPreviewResponse?.preview.assistant?.mode === "answer_only") &&
                  !getBlockingAiPreviewIssue(aiPreviewResponse?.preview)
                }
                hasBlockingWarning={
                  aiPreviewResponse?.preview.validationWarnings.some(
                    (warning) =>
                      warning.result === "failed" ||
                      warning.severity === "error" ||
                      warning.severity === "critical"
                  ) ?? false
                }
                hasResponse={Boolean(aiPreviewResponse)}
                error={aiPreviewError}
                followUpPrompt={aiFollowUpPrompt}
                isSubmittingFollowUp={isSubmittingAiFollowUp || isGeneratingAiPreview}
                isSubmittingReview={isSubmittingAiReview}
                onFollowUpPromptChange={setAiFollowUpPrompt}
                onSubmitFollowUp={() => void submitAiFollowUp()}
                onApprove={() => void approveAiWorksheetPreview()}
                onReject={() => void rejectAiWorksheetPreview()}
                onClose={dismissAiChat}
              />
            </div>
          ) : null}

          <div
            data-testid="pricing-worksheet-grid-shell"
            className="relative mx-3 min-h-0 flex-1 overflow-hidden rounded-[10px] border border-[var(--border)] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.03)]"
          >
            <div
              ref={worksheetViewportRef}
              className="h-full overflow-auto"
              onScroll={handleWorksheetViewportScroll}
            >
              <div
                style={{
                  minWidth: `max(${WORKSHEET_VIEWPORT_FALLBACK_WIDTH}px, ${
                    WORKSHEET_ROW_GUTTER_WIDTH + effectiveColumns.reduce((sum, column) => sum + column.width, 0)
                  }px)`,
                  zoom: worksheetZoom,
                  ...(showGridlines
                    ? {}
                    : ({ "--border-subtle": "transparent" } as CSSProperties)),
                }}
              >
                <div
                  className="sticky top-0 z-20 grid border-b border-[var(--border)] bg-[linear-gradient(180deg,#F9FBFE_0%,#F2F6FB_100%)]"
                  style={{
                    gridTemplateColumns: virtualGridTemplateColumns,
                  }}
                >
                  <div className="sticky left-0 z-30 border-r border-[var(--border)] bg-[linear-gradient(180deg,#F9FBFE_0%,#F2F6FB_100%)] px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)]">
                    #
                  </div>
                  <div
                    aria-hidden="true"
                    className="border-r border-[var(--border)] bg-[linear-gradient(180deg,#F9FBFE_0%,#F2F6FB_100%)]"
                    style={{ width: `${virtualColumns.leftSpacerWidth}px` }}
                  />
                  {virtualColumns.visibleColumns.map((column, columnOffset) => (
                    <div
                      key={column.id}
                      className={`relative border-r border-[var(--border)] px-3 py-2 text-[11px] font-medium last:border-r-0 ${
                        isColumnIndexSelected(selectedRanges, virtualColumns.startIndex + columnOffset)
                          ? "bg-[rgba(49,91,255,0.12)] text-[var(--brand-blue)]"
                          : "bg-[linear-gradient(180deg,#F9FBFE_0%,#F2F6FB_100%)] text-[var(--text-secondary)]"
                      }`}
                      onClick={(event) => handleColumnHeaderClick(event, virtualColumns.startIndex + columnOffset)}
                      onContextMenu={(event) => openColumnContextMenu(event, virtualColumns.startIndex + columnOffset)}
                    >
                      {column.label}
                      <button
                        type="button"
                        aria-label={`Resize column ${column.label}`}
                        disabled={!canMutateWorksheet}
                        className={`absolute right-0 top-0 h-full w-2 translate-x-1/2 ${canMutateWorksheet ? "cursor-col-resize" : "cursor-default"}`}
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
                    className="bg-[linear-gradient(180deg,#F9FBFE_0%,#F2F6FB_100%)]"
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
                        activeSelectedRange={selectedRange}
                        activeCellKey={activeCellKey}
                        activeEditor={activeEditor}
                        canWriteWorksheet={canMutateWorksheet}
                        commercialMappingHighlightCellKeys={commercialMappingHighlightCellKeys}
                        commercialMappingDragCellKey={commercialMapping.session || variationCommercialMapping.session ? selectedSingleCellKey : null}
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
                        selectedRanges={selectedRanges}
                        visibleColumnStartIndex={virtualColumns.startIndex}
                        visibleColumns={virtualColumns.visibleColumns}
                        onBeginCellEdit={stableBeginGridCellEdit}
                        onBeginFillDrag={stableBeginFillDrag}
                        onAutoFitRow={stableAutoFitRow}
                        onBeginRowResize={stableBeginRowResize}
                        onCellClick={stableGridCellClick}
                        onCellContextMenu={stableCellContextMenu}
                        onCellMouseDown={stableGridCellMouseDown}
                        onCellMouseEnter={stableRangeSelectionUpdate}
                        onCommercialMappingDragStart={handleCommercialMappingDragStart}
                        onInputBlur={stableCellBlur}
                        onInputChange={handleEditingCellValueChange}
                        onInputKeyDown={stableGridCellKeyDown}
                        onInputSelect={handleEditorTextSelect}
                        onRowClick={stableRowHeaderClick}
                        onRowContextMenu={stableRowContextMenu}
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
            <PricingWorksheetSelectionSum aggregate={selectionAggregate} />
          </div>

          <WorkbookPagesTray
            canWriteWorksheet={canMutateWorksheet}
            isLoadingWorksheet={isLoadingWorksheet}
            isMutatingPages={isMutatingPages}
            isOpen={isPagesTrayOpen}
            onAddBlankPage={() => void addBlankWorkbookSheet()}
            onDeletePage={(sheetId) => setPageDialog({ type: "delete", sheetId })}
            onDuplicatePage={(sheetId) => void duplicateWorkbookSheet(sheetId)}
            onRenamePage={(sheetId, currentName) => setPageDialog({ type: "rename", sheetId, value: currentName })}
            onSwitchPage={(sheetId) => void switchToWorkbookSheet(sheetId)}
            sheets={workbookSheets}
            worksheetSheetId={worksheetSheetId}
          />

          <Dialog open={pageDialog?.type === "rename"} onOpenChange={(open) => !open && setPageDialog(null)}>
            <DialogContent className="max-w-md p-6 sm:p-6">
              <DialogHeader className="pr-8">
                <DialogTitle>Rename page</DialogTitle>
              </DialogHeader>
              <input
                value={pageDialog?.type === "rename" ? pageDialog.value : ""}
                onChange={(event) =>
                  setPageDialog((current) =>
                    current?.type === "rename"
                      ? { ...current, value: event.target.value }
                      : current,
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void confirmPageRename();
                  }
                }}
                autoFocus
                className="mt-2 rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
                placeholder="Page name"
              />
              <DialogFooter className="mt-5 flex flex-row justify-end gap-2 border-t border-[var(--app-border)] pt-4">
                <Button type="button" variant="secondary" className="min-w-[104px]" onClick={() => setPageDialog(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="min-w-[104px]"
                  onClick={() => void confirmPageRename()}
                  disabled={isMutatingPages}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={pageDialog?.type === "delete"} onOpenChange={(open) => !open && setPageDialog(null)}>
            <DialogContent className="max-w-md p-6 sm:p-6" hideClose>
              <DialogHeader>
                <DialogTitle>Delete page?</DialogTitle>
              </DialogHeader>
              <DialogDescription className="mt-2 max-w-[32ch] text-sm leading-6 text-[var(--text-secondary)]">
                Delete this worksheet page from the workbook. The last remaining page cannot be deleted.
              </DialogDescription>
              <DialogFooter className="mt-5 flex flex-row justify-end gap-2 border-t border-[var(--app-border)] pt-4">
                <Button type="button" variant="secondary" className="min-w-[104px]" onClick={() => setPageDialog(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-w-[104px]"
                  onClick={() => void confirmPageDelete()}
                  disabled={isMutatingPages || workbookSheets.length <= 1}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <WorksheetPublishToPurchaseOrderDialog
            open={Boolean(purchaseOrderPublishDialog)}
            suppliers={purchaseOrderPublishDialog?.suppliers ?? []}
            draftPurchaseOrders={purchaseOrderPublishDialog?.draftPurchaseOrders ?? []}
            lines={purchaseOrderPublishDialog?.lines ?? []}
            purchaseOrderTitle={purchaseOrderPublishTitle}
            variationCode={worksheetOwner.variationCode}
            selectedSupplierId={purchaseOrderPublishSupplierId}
            selectedTargetMode={purchaseOrderPublishTargetMode}
            selectedPurchaseOrderId={purchaseOrderPublishTargetId}
            sourceRangeLabel={purchaseOrderPublishDialog?.interpretedSelection.selectionRangeLabel ?? ""}
            selectedValues={purchaseOrderPublishDialog?.interpretedSelection.visibleSelectedValues ?? []}
            onOpenChange={(open) => {
              if (!open && !isPublishingWorksheetSelection) {
                setPurchaseOrderPublishDialog(null);
                setPurchaseOrderPublishTitle("Worksheet Purchase Order");
              }
            }}
            onSupplierChange={setPurchaseOrderPublishSupplierId}
            onPurchaseOrderTitleChange={setPurchaseOrderPublishTitle}
            onTargetModeChange={setPurchaseOrderPublishTargetMode}
            onPurchaseOrderChange={setPurchaseOrderPublishTargetId}
            onAddLine={() =>
              setPurchaseOrderPublishDialog((current) =>
                current
                  ? {
                      ...current,
                      interpretedSelection: {
                        ...current.interpretedSelection,
                        proposedLines: [
                          ...current.interpretedSelection.proposedLines,
                          {
                            ...current.interpretedSelection.proposedLines[0],
                            id: `selection-line-${current.lines.length}`,
                            rowId: `selection-line-${current.lines.length}`,
                          },
                        ],
                      },
                      lines: [
                        ...current.lines,
                        {
                          id: `selection-line-${current.lines.length}`,
                          description: "",
                          quantity: "",
                          unit: "",
                          rate: "",
                          total: "",
                          purchaseOrderSection: "",
                        },
                      ],
                    }
                  : current,
              )
            }
            onRemoveLine={(lineId) =>
              setPurchaseOrderPublishDialog((current) =>
                current && current.lines.length > 1
                  ? {
                      ...current,
                      interpretedSelection: {
                        ...current.interpretedSelection,
                        proposedLines: current.interpretedSelection.proposedLines.filter((line) => line.id !== lineId),
                      },
                      lines: current.lines.filter((line) => line.id !== lineId),
                    }
                  : current,
              )
            }
            onLineChange={(lineId, patch) =>
              setPurchaseOrderPublishDialog((current) =>
                current
                  ? {
                      ...current,
                      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
                    }
                  : current,
              )
            }
            onConfirm={() => void executeWorksheetPublishToPurchaseOrder()}
            isSubmitting={isPublishingWorksheetSelection}
          />

          <WorksheetPublishToVariationDialog
            open={Boolean(variationPublishDialog)}
            lines={variationPublishDialog?.lines ?? []}
            variationNumber={variationPublishDialog?.context.variationNumber ?? "Variation"}
            variationTitle={variationPublishDialog?.context.variationTitle ?? ""}
            variationStatus={variationPublishDialog?.context.variationStatus ?? "Draft"}
            sourceRangeLabel={variationPublishDialog?.interpretedSelection.selectionRangeLabel ?? ""}
            selectedValues={variationPublishDialog?.interpretedSelection.visibleSelectedValues ?? []}
            onOpenChange={(open) => {
              if (!open && !isPublishingWorksheetSelection) {
                setVariationPublishDialog(null);
              }
            }}
            onLineChange={(lineId, patch) =>
              setVariationPublishDialog((current) =>
                current
                  ? {
                      ...current,
                      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
                    }
                  : current,
              )
            }
            onAddLine={() =>
              setVariationPublishDialog((current) => {
                if (!current) {
                  return current;
                }

                return {
                  ...current,
                  lines: [
                    ...current.lines,
                    {
                      id: `selection-line-${current.lines.length}`,
                      description: "",
                      quantity: "",
                      unit: "",
                      rate: "",
                      total: "",
                      section: current.lines[0]?.section ?? "Labour",
                    },
                  ],
                };
              })
            }
            onRemoveLine={(lineId) =>
              setVariationPublishDialog((current) =>
                current && current.lines.length > 1
                  ? {
                      ...current,
                      lines: current.lines.filter((line) => line.id !== lineId),
                    }
                  : current,
              )
            }
            onConfirm={() => void executeWorksheetPublishToVariation()}
            isSubmitting={isPublishingWorksheetSelection}
          />

          <WorksheetPublishToQuoteDialog
            open={Boolean(quotePublishDialog)}
            lines={quotePublishDialog?.lines ?? []}
            quotes={quotePublishDialog?.quotes ?? []}
            selectedTargetMode={quotePublishTargetMode}
            selectedQuoteIds={quotePublishTargetIds}
            sourceRangeLabel={quotePublishDialog?.interpretedSelection.selectionRangeLabel ?? ""}
            selectedValues={quotePublishDialog?.interpretedSelection.visibleSelectedValues ?? []}
            onOpenChange={(open) => {
              if (!open && !isPublishingWorksheetSelection) {
                setQuotePublishDialog(null);
                setQuotePublishTargetMode("new");
                setQuotePublishTargetIds([]);
              }
            }}
            onTargetModeChange={setQuotePublishTargetMode}
            onQuotesChange={setQuotePublishTargetIds}
            onLineChange={(lineId, patch) =>
              setQuotePublishDialog((current) =>
                current
                  ? {
                      ...current,
                      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
                    }
                  : current,
              )
            }
            onAddLine={() =>
              setQuotePublishDialog((current) => {
                if (!current) {
                  return current;
                }

                return {
                  ...current,
                  lines: [
                    ...current.lines,
                    {
                      id: `selection-line-${current.lines.length}`,
                      description: "",
                      quantity: "",
                      unit: "",
                      rate: "",
                      total: "",
                    },
                  ],
                };
              })
            }
            onRemoveLine={(lineId) =>
              setQuotePublishDialog((current) =>
                current
                  ? {
                      ...current,
                      lines: current.lines.filter((line) => line.id !== lineId),
                    }
                  : current,
              )
            }
            onConfirm={() => void executeWorksheetPublishToQuote()}
            isSubmitting={isPublishingWorksheetSelection}
          />

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
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet || isPublishingWorksheetSelection}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      const range = getContextMenuRange(contextMenu);
                      handleQuoteContextMenuAction(event, range);
                    }}
                  >
                    Add to Quote...
                  </button>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canMutateWorksheet || isPublishingWorksheetSelection}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      const range = getContextMenuRange(contextMenu);
                      handlePurchaseOrderContextMenuAction(event, range);
                    }}
                  >
                    Add to Purchase Order...
                  </button>
                  {canPublishToVariation ? (
                    <>
                      <div className="my-1 h-px bg-[var(--border)]" />
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canMutateWorksheet || isPublishingWorksheetSelection}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          const range = getContextMenuRange(contextMenu);
                          handleVariationContextMenuAction(event, range);
                        }}
                      >
                        Add to Variation...
                      </button>
                    </>
                  ) : null}
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet || isPublishingWorksheetSelection}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      const range = getContextMenuRange(contextMenu);
                      handleQuoteContextMenuAction(event, range);
                    }}
                  >
                    Add to Quote...
                  </button>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canMutateWorksheet || isPublishingWorksheetSelection}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      const range = getContextMenuRange(contextMenu);
                      handlePurchaseOrderContextMenuAction(event, range);
                    }}
                  >
                    Add to Purchase Order...
                  </button>
                  {canPublishToVariation ? (
                    <>
                      <div className="my-1 h-px bg-[var(--border)]" />
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canMutateWorksheet || isPublishingWorksheetSelection}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          const range = getContextMenuRange(contextMenu);
                          handleVariationContextMenuAction(event, range);
                        }}
                      >
                        Add to Variation...
                      </button>
                    </>
                  ) : null}
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet}
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
                    disabled={!canMutateWorksheet}
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
      {commercialMapping.session && commercialMappingResolved && commercialMappingContext && !isNarrowCommercialCellPicker ? (
        <PricingWorksheetCommercialMappingDrawer
          session={commercialMapping.session}
          resolved={commercialMappingResolved}
          sheetName={worksheetDisplayName}
          quoteOptions={commercialMappingContext.destination === "quote" ? commercialMappingContext.quotes : []}
          quoteTargetMode={quotePublishTargetMode}
          quoteTargetIds={quotePublishTargetIds}
          purchaseOrderOptions={commercialMappingContext.destination === "purchase_order" ? commercialMappingContext.draftPurchaseOrders : []}
          suppliers={commercialMappingContext.destination === "purchase_order" ? commercialMappingContext.suppliers : []}
          purchaseOrderTargetMode={purchaseOrderPublishTargetMode}
          purchaseOrderTargetId={purchaseOrderPublishTargetId}
          purchaseOrderSupplierId={purchaseOrderPublishSupplierId}
          purchaseOrderTitle={purchaseOrderPublishTitle}
          purchaseOrderSection={purchaseOrderMappingSection}
          isPublishing={isPublishingWorksheetSelection}
          onClose={closeCommercialMapping}
          onEscape={escapeCommercialMapping}
          onArmField={armCommercialMappingField}
          onClearField={commercialMapping.clearField}
          onAssignField={commercialMapping.assignCellToField}
          onHighlightField={setCommercialMappingHighlightField}
          onBeginDescriptionEdit={commercialMapping.beginDescriptionEdit}
          onCommitDescription={commercialMapping.commitDescription}
          onQuoteTargetModeChange={setQuotePublishTargetMode}
          onQuoteTargetIdsChange={setQuotePublishTargetIds}
          onPurchaseOrderTargetModeChange={setPurchaseOrderPublishTargetMode}
          onPurchaseOrderTargetIdChange={setPurchaseOrderPublishTargetId}
          onPurchaseOrderSupplierIdChange={setPurchaseOrderPublishSupplierId}
          onPurchaseOrderTitleChange={setPurchaseOrderPublishTitle}
          onPurchaseOrderSectionChange={setPurchaseOrderMappingSection}
          onPublish={() => void executeCommercialMappingPublish()}
        />
      ) : null}
      {variationCommercialMapping.session && variationCommercialMappingContext && !isNarrowCommercialCellPicker ? (
        <PricingWorksheetVariationMappingDrawer
          variationNumber={variationCommercialMappingContext.variationNumber}
          variationTitle={variationCommercialMappingContext.variationTitle}
          variationStatus={variationCommercialMappingContext.variationStatus}
          sheetName={worksheetDisplayName}
          lines={variationCommercialMappingResolved}
          isPublishing={isPublishingWorksheetSelection}
          onClose={closeVariationCommercialMapping}
          onEscape={escapeVariationCommercialMapping}
          onArmField={armVariationCommercialMappingField}
          onClearField={variationCommercialMapping.clearField}
          onAssignField={variationCommercialMapping.assignCellToField}
          onHighlightField={(lineId, field) => setVariationCommercialMappingHighlight(field ? { lineId, field } : null)}
          onBeginDescriptionEdit={variationCommercialMapping.beginDescriptionEdit}
          onCommitDescription={variationCommercialMapping.commitDescription}
          onSectionChange={variationCommercialMapping.setSection}
          onAddLine={variationCommercialMapping.addLine}
          onRemoveLine={variationCommercialMapping.removeLine}
          onPublish={() => void executeVariationCommercialMappingPublish()}
        />
      ) : null}
      {activeSidePanel === "materials" ? (
        <PricingWorksheetMaterialLibraryDrawer
          workbookId={explicitWorksheetId ?? worksheetId}
          activeSheetId={worksheetSheetId}
          isDirty={isDirty}
          localBindings={materialPriceReviewOverlay}
          target={materialTarget}
          targetIssue={materialTargetIssue}
          canWrite={canMutateWorksheet}
          onClose={closeMaterialLibrary}
          onGoToCell={goToMaterialPriceCell}
          onInsert={insertMaterialPrice}
          onUpdatePrice={updateReviewedMaterialPrice}
        />
      ) : null}
      {activeSidePanel === "measures" ? (
        <PricingWorksheetMeasureDrawer
          workbookId={explicitWorksheetId ?? worksheetId}
          mappingSession={measureMapping.session}
          canWrite={canWriteWorksheet}
          onClose={closeMeasureDrawer}
          onEscape={() => {
            if (measureMapping.session?.activeField) measureMapping.armField(null);
            else closeMeasureDrawer();
          }}
          onArmField={measureMapping.armField}
          onClearField={measureMapping.clearField}
          onAssignField={measureMapping.assignCellToField}
          onHighlightField={setMeasureMappingHighlightField}
          onInsert={insertMeasureValue}
        />
      ) : null}
      <PricingWorksheetAiAssistDialog
        open={isAiDialogOpen}
        canApply={
          (canMutateWorksheet ||
            aiPreviewResponse?.preview.assistant?.mode === "answer_only") &&
          !getBlockingAiPreviewIssue(aiPreviewResponse?.preview)
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
