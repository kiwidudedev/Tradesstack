"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Save } from "lucide-react";
import { useOpportunityWorkspaceData } from "@/components/app/OpportunityWorkspaceDataProvider";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  createDefaultWorksheetData,
  createDefaultWorksheetExtractedPricingData,
  createDefaultWorksheetPricingSummary,
  normalizeWorksheetCell,
  normalizeWorksheetData,
  type WorksheetCell,
  type WorksheetData,
  type WorksheetExtractedPricingData,
  type WorksheetPricingSummary,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import { recalculateWorksheetFormulas } from "@/lib/opportunity-pricing-worksheet-formulas";
import {
  buildWorksheetTsvFromRange,
  extendRangeFromAnchor,
  getWorksheetRangeEdgeFlags,
  getWorksheetSelectionRange,
  moveCellKey,
  type WorksheetSelectionRange,
} from "@/lib/opportunity-pricing-worksheet-copy";
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
  applyBordersToRange,
  applyFormattingToRange,
  clearCellFill,
  getCellFormat,
  hasCellFormatting,
  type WorksheetCellFormat,
} from "@/lib/opportunity-pricing-worksheet-formatting";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";

type PricingWorksheetRow =
  import("@/lib/supabase/types").Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"];

const CELL_INPUT_CLASS =
  "h-full w-full min-w-0 border-0 bg-transparent px-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]";
const SELECTION_OUTLINE_COLOR = "rgb(37 99 235)";
const FILL_PREVIEW_OUTLINE_COLOR = "rgb(59 130 246)";
const WORKSHEET_HISTORY_LIMIT = 50;
const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 640;
const MIN_ROW_HEIGHT = 28;
const MAX_ROW_HEIGHT = 240;
const FILL_SWATCHES = ["#FEF3C7", "#DBEAFE", "#DCFCE7", "#FCE7F3", "#F3F4F6"];
const TEXT_SWATCHES = ["#111827", "#1D4ED8", "#047857", "#B45309", "#BE123C"];

function displayCellValue(cell: WorksheetCell | undefined) {
  if (!cell) {
    return "";
  }

  if (typeof cell.displayValue === "string") {
    return cell.displayValue;
  }

  if (typeof cell.value === "number") {
    return String(cell.value);
  }

  if (typeof cell.value === "string") {
    return cell.value;
  }

  return "";
}

function cloneWorksheetData(worksheet: WorksheetData) {
  return JSON.parse(JSON.stringify(worksheet)) as WorksheetData;
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

export function OpportunityPricingWorksheetBoard() {
  const sharedOpportunity = useOpportunityWorkspaceData();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [worksheetId, setWorksheetId] = useState<string | null>(null);
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
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const worksheetSurfaceRef = useRef<HTMLDivElement | null>(null);
  const formulaBarRef = useRef<HTMLTextAreaElement | null>(null);
  const loadedWorksheetScopeKeyRef = useRef<string | null>(null);
  const suppressBlurCommitCellKeyRef = useRef<string | null>(null);
  const didDragSelectionRef = useRef(false);
  const handledFormulaReferenceMouseDownRef = useRef(false);
  const fillSourceRangeRef = useRef<WorksheetSelectionRange | null>(null);
  const fillPreviewFocusCellKeyRef = useRef<string | null>(null);

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

  const gridTemplateColumns = useMemo(
    () => `64px ${effectiveColumns.map((column) => `${column.width}px`).join(" ")}`,
    [effectiveColumns]
  );

  const fillPreview = useMemo(
    () => getFillPreview(worksheet, fillSourceRange, fillPreviewFocusCellKey),
    [fillPreviewFocusCellKey, fillSourceRange, worksheet]
  );

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
    if (isAuthLoading) {
      return;
    }

    if (!supabase || !session?.organizationId) {
      setIsLoadingWorksheet(false);
      setError("Unable to load the pricing worksheet right now.");
      return;
    }

    const scopeKey = `${session.organizationId}:${sharedOpportunity.opportunityId}`;
    if (loadedWorksheetScopeKeyRef.current === scopeKey) {
      return;
    }

    let cancelled = false;

    const loadWorksheet = async () => {
      const organizationId = session.organizationId;
      if (!organizationId) {
        throw new Error("Could not resolve your organization.");
      }

      setIsLoadingWorksheet(true);
      setError(null);

      try {
        const { data, error: loadError } = await supabase
          .from("opportunity_pricing_worksheets")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("opportunity_id", sharedOpportunity.opportunityId)
          .maybeSingle();

        if (loadError) {
          throw new Error(loadError.message);
        }

        if (cancelled) {
          return;
        }

        const worksheetRow = data as PricingWorksheetRow | null;
        if (!worksheetRow) {
          const blankWorksheet = recalculateWorksheetFormulas(createDefaultWorksheetData());
          setWorksheetId(null);
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
        const loadedWorksheet = recalculateWorksheetFormulas(
          normalizeWorksheetData(worksheetRow.worksheet_data)
        );
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
        if (!cancelled) {
          setError(
            loadWorksheetError instanceof Error
              ? loadWorksheetError.message
              : "Unable to load the pricing worksheet."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWorksheet(false);
        }
      }
    };

    void loadWorksheet();

    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, session?.organizationId, sharedOpportunity.opportunityId, supabase]);

  const applyCommittedWorksheetChange = useCallback((
    mutator: (current: WorksheetData) => WorksheetData
  ) => {
    const previousWorksheet = cloneWorksheetData(worksheetRef.current);
    const nextWorksheet = recalculateWorksheetFormulas(
      mutator(cloneWorksheetData(worksheetRef.current))
    );

    worksheetRef.current = nextWorksheet;
    setWorksheet(nextWorksheet);
    setHistoryPast((current) => {
      const nextHistory = [...current, previousWorksheet];
      return nextHistory.length > WORKSHEET_HISTORY_LIMIT
        ? nextHistory.slice(nextHistory.length - WORKSHEET_HISTORY_LIMIT)
        : nextHistory;
    });
    setHistoryFuture([]);
    setIsDirty(true);
    setError(null);
    setMessage(null);
  }, []);

  const updateCell = (cellKey: string, nextValue: string) => {
    applyCommittedWorksheetChange((current) => {
      const nextCells = { ...current.cells };
      const existingCell = current.cells[cellKey];
      const normalizedCell = normalizeWorksheetCell(nextValue);

      if (normalizedCell.type === "empty") {
        if (hasCellFormatting(existingCell)) {
          nextCells[cellKey] = {
            ...normalizedCell,
            metadata: {
              ...existingCell?.metadata,
            },
          };
        } else {
          delete nextCells[cellKey];
        }
      } else {
        nextCells[cellKey] = {
          ...normalizedCell,
          metadata: {
            ...(existingCell?.metadata ?? {}),
          },
        };
      }

      return {
        ...current,
        cells: nextCells,
      };
    });
  };

  const focusWorksheetSurface = () => {
    requestAnimationFrame(() => {
      worksheetSurfaceRef.current?.focus();
    });
  };

  const focusFormulaBar = (options?: { selectAll?: boolean }) => {
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
  };

  const focusInputCell = (cellKey: string | null, options?: { selectAll?: boolean }) => {
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
  };

  const getAdjacentCellKey = (
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
  };

  const isFormulaEditing =
    activeCellKey !== null && editingCellValue.trim().startsWith("=");

  const isFormulaReferenceMode =
    isFormulaEditing && activeCellKey !== null;

  const beginCellEdit = (
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
  };

  const commitCellEdit = (cellKey: string, nextValue: string, nextSelectedCellKey?: string | null) => {
    updateCell(cellKey, nextValue);
    setActiveCellKey((current) => (current === cellKey ? null : current));
    setActiveEditor(null);
    setEditingCellValue("");
    setSelectionAnchorCellKey(nextSelectedCellKey ?? cellKey);
    setSelectionFocusCellKey(nextSelectedCellKey ?? cellKey);
    focusWorksheetSurface();
  };

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

  const appendCellReferenceToFormula = (cellReference: string) => {
    if (!isFormulaReferenceMode || !activeCellKey) {
      return;
    }

    handledFormulaReferenceMouseDownRef.current = true;
    didDragSelectionRef.current = false;
    setIsDraggingSelection(false);
    setEditingCellValue((current) => `${current}${cellReference}`);
    setSelectionFocusCellKey(cellReference);

    if (activeEditor === "formulaBar") {
      focusFormulaBar({ selectAll: false });
      return;
    }

    focusInputCell(activeCellKey, { selectAll: false });
  };

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

  const beginColumnResize = (event: ReactMouseEvent<HTMLButtonElement>, columnId: string, width: number) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingColumnId(columnId);
    setColumnResizeStartX(event.clientX);
    setColumnResizeStartWidth(width);
    setColumnResizePreviewWidth(width);
  };

  const beginRowResize = (event: ReactMouseEvent<HTMLButtonElement>, rowId: string, height: number) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingRowId(rowId);
    setRowResizeStartY(event.clientY);
    setRowResizeStartHeight(height);
    setRowResizePreviewHeight(height);
  };

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

    commitActiveEditIfNeeded();
    applyCommittedWorksheetChange((current) => applyFormattingToRange(current, selectedRange, patch));
  };

  const applyBorderModeToSelection = (mode: "all" | "outer" | "clear") => {
    if (!selectedRange) {
      return;
    }

    commitActiveEditIfNeeded();
    applyCommittedWorksheetChange((current) => applyBordersToRange(current, selectedRange, mode));
  };

  const selectSingleCell = (cellKey: string) => {
    if (isFormulaReferenceMode) {
      appendCellReferenceToFormula(cellKey);
      return;
    }

    setSelectionAnchorCellKey(cellKey);
    setSelectionFocusCellKey(cellKey);
    setIsDraggingSelection(false);
    focusWorksheetSurface();
  };

  const startRangeSelection = (cellKey: string) => {
    if (isFormulaReferenceMode) {
      appendCellReferenceToFormula(cellKey);
      return;
    }

    setSelectionAnchorCellKey(cellKey);
    setSelectionFocusCellKey(cellKey);
    setIsDraggingSelection(true);
    didDragSelectionRef.current = false;
    focusWorksheetSurface();
  };

  const updateRangeSelection = (cellKey: string) => {
    if (isFormulaReferenceMode) {
      return;
    }

    if (isDraggingFill) {
      setFillPreviewFocusCellKey(cellKey);
      return;
    }

    if (!isDraggingSelection || isFormulaEditing) {
      return;
    }

    if (selectionAnchorCellKey && selectionAnchorCellKey !== cellKey) {
      didDragSelectionRef.current = true;
    }
    setSelectionFocusCellKey(cellKey);
  };

  const beginFillDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!selectedRange || activeCellKey || isFormulaEditing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFill(true);
    setFillSourceRange(selectedRange);
    setFillPreviewFocusCellKey(null);
    focusWorksheetSurface();
  };

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
    const previousWorksheet = historyPastRef.current.at(-1);
    if (!previousWorksheet) {
      return;
    }

    const currentWorksheet = cloneWorksheetData(worksheetRef.current);
    const restoredWorksheet = cloneWorksheetData(previousWorksheet);
    const nextPast = historyPastRef.current.slice(0, -1);
    const nextFuture = [currentWorksheet, ...historyFutureRef.current].slice(
      0,
      WORKSHEET_HISTORY_LIMIT
    );

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
  };

  const handleRedo = () => {
    const nextWorksheet = historyFutureRef.current[0];
    if (!nextWorksheet) {
      return;
    }

    const currentWorksheet = cloneWorksheetData(worksheetRef.current);
    const restoredWorksheet = cloneWorksheetData(nextWorksheet);
    const nextPast = [...historyPastRef.current, currentWorksheet].slice(
      -WORKSHEET_HISTORY_LIMIT
    );
    const nextFuture = historyFutureRef.current.slice(1);

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
  };

  const handleWorksheetKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!canWriteWorksheet) {
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
      applyCommittedWorksheetChange((current) => {
        const nextCells = { ...current.cells };

        for (
          let rowIndex = selectedRange.startRowIndex;
          rowIndex <= selectedRange.endRowIndex;
          rowIndex += 1
        ) {
          for (
            let columnIndex = selectedRange.startColumnIndex;
            columnIndex <= selectedRange.endColumnIndex;
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
    if (!isDraggingSelection) {
      return;
    }

    const handleMouseUp = () => {
      setIsDraggingSelection(false);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSelection]);

  useEffect(() => {
    if (!isDraggingFill) {
      return;
    }

    const handleMouseUp = () => {
      const preview = getFillPreview(
        worksheetRef.current,
        fillSourceRangeRef.current,
        fillPreviewFocusCellKeyRef.current
      );

      if (fillSourceRangeRef.current && preview) {
        applyFillDrag(fillSourceRangeRef.current, preview.range, preview.direction);
      }

      setIsDraggingFill(false);
      setFillSourceRange(null);
      fillSourceRangeRef.current = null;
      setFillPreviewFocusCellKey(null);
      fillPreviewFocusCellKeyRef.current = null;
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingFill, applyFillDrag]);

  useEffect(() => {
    if (!resizingColumnId) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTH,
        Math.min(MAX_COLUMN_WIDTH, columnResizeStartWidth + (event.clientX - columnResizeStartX))
      );
      setColumnResizePreviewWidth(nextWidth);
    };

    const handleMouseUp = () => {
      if (
        resizingColumnId &&
        columnResizePreviewWidth !== null &&
        worksheet.columns.some(
          (column) =>
            column.id === resizingColumnId && column.width !== columnResizePreviewWidth
        )
      ) {
        applyCommittedWorksheetChange((current) => ({
          ...current,
          columns: current.columns.map((column) =>
            column.id === resizingColumnId
              ? { ...column, width: columnResizePreviewWidth }
              : column
          ),
        }));
      }

      setResizingColumnId(null);
      setColumnResizePreviewWidth(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    applyCommittedWorksheetChange,
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
        }));
      }

      setResizingRowId(null);
      setRowResizePreviewHeight(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    applyCommittedWorksheetChange,
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
      const worksheetJson = worksheet as unknown as Json;
      const pricingSummaryJson = pricingSummary as unknown as Json;
      const extractedPricingDataJson = extractedPricingData as unknown as Json;

      if (worksheetId) {
        const { data, error: updateError } = await supabase
          .from("opportunity_pricing_worksheets")
          .update({
            name: worksheet.sheetName.trim() || "Pricing Worksheet",
            worksheet_data: worksheetJson,
            pricing_summary: pricingSummaryJson,
            extracted_pricing_data: extractedPricingDataJson,
            version: worksheet.version,
            updated_by: userId,
          })
          .eq("organization_id", organizationId)
          .eq("id", worksheetId)
          .select("id, updated_at")
          .single();

        if (updateError) {
          throw new Error(updateError.message);
        }

        setWorksheetId(data.id);
        setLastSavedAt(data.updated_at ?? null);
      } else {
        const { data, error: insertError } = await supabase
          .from("opportunity_pricing_worksheets")
          .insert({
            organization_id: organizationId,
            opportunity_id: sharedOpportunity.opportunityId,
            name: worksheet.sheetName.trim() || "Pricing Worksheet",
            worksheet_data: worksheetJson,
            pricing_summary: pricingSummaryJson,
            extracted_pricing_data: extractedPricingDataJson,
            version: worksheet.version,
            created_by: userId,
            updated_by: userId,
          })
          .select("id, updated_at")
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }

        setWorksheetId(data.id);
        setLastSavedAt(data.updated_at ?? null);
      }

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

  return (
    <div className="min-w-0 flex-1">
      <OperationalPanel
        title="Pricing Worksheet"
        description="Build your pricing in a flexible worksheet and save it against this opportunity."
        actions={
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-[var(--text-secondary)]">
              <div>{isDirty ? "Unsaved changes" : "Saved"}</div>
              <div>{lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" }) : "Not saved yet"}</div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void saveWorksheet()}
              disabled={!canWriteWorksheet || isSavingWorksheet || isLoadingWorksheet || !isDirty}
            >
              <Save className="h-4 w-4" />
              {isSavingWorksheet ? "Saving..." : "Save worksheet"}
            </Button>
          </div>
        }
        toolbar={
          <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            <span>Start with a blank worksheet. Formula support, templates, supplier pricing, and takeoff links can be added later.</span>
          </div>
        }
        contentClassName="p-0"
      >
        <div
          ref={worksheetSurfaceRef}
          className="space-y-4 px-6 py-6 outline-none"
          tabIndex={0}
          onPasteCapture={handleWorksheetPaste}
          onCopy={handleWorksheetCopy}
          onKeyDown={handleWorksheetKeyDown}
        >
          {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
          {message ? <OperationalAlert variant="success">{message}</OperationalAlert> : null}

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
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
                onClick={() => applyFormattingPatchToSelection({ text: { align: "left" } })}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Left
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => applyFormattingPatchToSelection({ text: { align: "center" } })}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Center
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => applyFormattingPatchToSelection({ text: { align: "right" } })}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Right
              </Button>
              <div className="flex items-center gap-1">
                {FILL_SWATCHES.map((color) => (
                  <button
                    key={`fill-${color}`}
                    type="button"
                    aria-label={`Set fill color ${color}`}
                    className="h-8 w-8 rounded-[var(--radius-sm)] border border-[var(--border)]"
                    style={{ backgroundColor: color }}
                    onClick={() => applyFormattingPatchToSelection({ fill: { color } })}
                    disabled={!canWriteWorksheet || !selectedRange}
                  />
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    applyFormattingPatchToSelection((format) => clearCellFill(format))
                  }
                  disabled={!canWriteWorksheet || !selectedRange}
                >
                  Clear fill
                </Button>
              </div>
              <div className="flex items-center gap-1">
                {TEXT_SWATCHES.map((color) => (
                  <button
                    key={`text-${color}`}
                    type="button"
                    aria-label={`Set text color ${color}`}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-white text-sm font-semibold"
                    style={{ color }}
                    onClick={() => applyFormattingPatchToSelection({ text: { color } })}
                    disabled={!canWriteWorksheet || !selectedRange}
                  >
                    A
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => applyBorderModeToSelection("all")}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                All borders
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => applyBorderModeToSelection("outer")}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Outer border
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => applyBorderModeToSelection("clear")}
                disabled={!canWriteWorksheet || !selectedRange}
              >
                Clear borders
              </Button>
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="grid gap-3 md:grid-cols-[80px_minmax(0,1fr)] md:items-start">
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)]">
                {formulaBarCellKey}
              </div>
              <textarea
                ref={formulaBarRef}
                value={formulaBarValue}
                rows={2}
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
                className="min-h-[72px] w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                placeholder="Enter a value or formula"
                disabled={!canWriteWorksheet}
                spellCheck={false}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
            <div className="overflow-x-auto">
              <div
                style={{
                  minWidth: `max(1120px, ${
                    64 + effectiveColumns.reduce((sum, column) => sum + column.width, 0)
                  }px)`,
                }}
              >
                <div
                  className="sticky top-0 z-20 grid border-b border-[var(--border)] bg-[var(--surface-muted)]"
                  style={{
                    gridTemplateColumns,
                  }}
                >
                  <div className="sticky left-0 z-30 border-r border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    #
                  </div>
                  {effectiveColumns.map((column) => (
                    <div
                      key={column.id}
                      className="relative border-r border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] last:border-r-0"
                    >
                      {column.label}
                      <button
                        type="button"
                        aria-label={`Resize column ${column.label}`}
                        className="absolute right-0 top-0 h-full w-2 translate-x-1/2 cursor-col-resize"
                        onMouseDown={(event) => beginColumnResize(event, column.id, column.width)}
                      />
                    </div>
                  ))}
                </div>

                {isLoadingWorksheet ? (
                  <div className="px-4 py-6 text-sm text-[var(--text-secondary)]">Loading worksheet...</div>
                ) : (
                  <div>
                    {effectiveRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid border-b border-[var(--border)] last:border-b-0"
                        style={{
                          gridTemplateColumns,
                          minHeight: `${row.height}px`,
                        }}
                      >
                        <div
                          className="sticky left-0 z-10 border-r border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)] relative"
                          style={{ height: `${row.height}px` }}
                        >
                          {row.id}
                          <button
                            type="button"
                            aria-label={`Resize row ${row.id}`}
                            className="absolute bottom-0 left-0 h-2 w-full translate-y-1/2 cursor-row-resize"
                            onMouseDown={(event) => beginRowResize(event, row.id, row.height)}
                          />
                        </div>
                        {effectiveColumns.map((column) => {
                          const cellKey = buildWorksheetCellKey(column.id, row.id);
                          const cell = worksheet.cells[cellKey];
                          const cellFormat = getCellFormat(cell);
                          const isEditing = activeCellKey === cellKey && activeEditor === "cell";
                          const inputValue = isEditing ? editingCellValue : displayCellValue(cell);
                          const edgeFlags = getWorksheetRangeEdgeFlags(
                            worksheet,
                            cellKey,
                            selectedRange
                          );
                          const selectionShadow = edgeFlags.isInRange
                            ? buildSelectionShadow(edgeFlags, SELECTION_OUTLINE_COLOR)
                            : undefined;
                          const fillPreviewEdgeFlags = getWorksheetRangeEdgeFlags(
                            worksheet,
                            cellKey,
                            fillPreview?.range ?? null
                          );
                          const fillPreviewShadow = fillPreviewEdgeFlags.isInRange
                            ? buildSelectionShadow(fillPreviewEdgeFlags, FILL_PREVIEW_OUTLINE_COLOR)
                            : undefined;
                          const formatBorderShadow = buildFormattedBorderShadow(cellFormat);
                          const isSelectedRangeCorner =
                            Boolean(selectedRange) &&
                            edgeFlags.isBottomEdge &&
                            edgeFlags.isRightEdge &&
                            !activeCellKey;
                          const cellTextAlign = cellFormat.text?.align ?? "left";
                          const cellFillColor =
                            edgeFlags.isInRange || fillPreviewEdgeFlags.isInRange
                              ? undefined
                              : cellFormat.fill?.color;

                          return (
                            <div
                              key={cellKey}
                              className={`relative border-r border-[var(--border)] last:border-r-0 ${
                                edgeFlags.isInRange
                                  ? "bg-blue-50/50"
                                  : fillPreviewEdgeFlags.isInRange
                                  ? "bg-blue-100/50"
                                  : ""
                              }`}
                              style={{
                                backgroundColor: cellFillColor,
                                height: `${row.height}px`,
                                boxShadow: [formatBorderShadow, selectionShadow, fillPreviewShadow]
                                  .filter(Boolean)
                                  .join(", ") || undefined,
                              }}
                              onMouseDown={(event) => {
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

                                startRangeSelection(cellKey);
                              }}
                              onMouseEnter={() => {
                                updateRangeSelection(cellKey);
                              }}
                              onDoubleClick={() =>
                                beginCellEdit(cellKey, cell, { editor: "cell" })
                              }
                            >
                              {isEditing ? (
                                <input
                                  ref={(node) => {
                                    inputRefs.current[cellKey] = node;
                                  }}
                                  type="text"
                                  value={inputValue}
                                  onChange={(event) => setEditingCellValue(event.target.value)}
                                  onBlur={() => handleCellBlur(cellKey)}
                                  onKeyDown={(event) => {
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
                                  }}
                                  className={CELL_INPUT_CLASS}
                                  style={{
                                    height: `${row.height}px`,
                                    textAlign: cellTextAlign,
                                    fontWeight: cellFormat.text?.bold ? 700 : undefined,
                                    color: cellFormat.text?.color,
                                  }}
                                  placeholder=""
                                  disabled={!canWriteWorksheet}
                                  inputMode={cell?.type === "number" ? "decimal" : undefined}
                                />
                              ) : (
                                <div
                                  className="flex h-full min-w-0 items-center overflow-hidden px-2.5 text-sm text-[var(--text-primary)]"
                                  style={{
                                    justifyContent:
                                      cellTextAlign === "center"
                                        ? "center"
                                        : cellTextAlign === "right"
                                        ? "flex-end"
                                        : "flex-start",
                                    fontWeight: cellFormat.text?.bold ? 700 : undefined,
                                    color: cellFormat.text?.color,
                                    textAlign: cellTextAlign,
                                  }}
                                  onClick={(event) => {
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
                                  }}
                                >
                                  {displayCellValue(cell)}
                                </div>
                              )}
                              {isSelectedRangeCorner ? (
                                <button
                                  type="button"
                                  aria-label="Fill handle"
                                  className="absolute bottom-0 right-0 z-20 h-2.5 w-2.5 translate-x-1/2 translate-y-1/2 rounded-full border border-white bg-blue-600 shadow-sm"
                                  onMouseDown={beginFillDrag}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </OperationalPanel>
    </div>
  );
}
