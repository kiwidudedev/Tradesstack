import type { WorksheetCell, WorksheetColumn, WorksheetData, WorksheetRow } from "@/lib/opportunity-pricing-worksheet-defaults";
import { getFormattedCellDisplayValue } from "@/lib/opportunity-pricing-worksheet-formatting";
import { buildWorksheetCellKey, parseWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import type { PricingWorksheetAiDiffSummary } from "@/lib/pricing-worksheet-edit-plan";

export type WorksheetLayoutTarget = {
  rowIds: string[];
  columnIds: string[];
  cellKeys: string[];
};

export type WorksheetCellLayoutMeasurement = {
  textWidth: number;
  wrappedHeight: number;
};

export type WorksheetCellLayoutMeasureFn = (params: {
  cell: WorksheetCell | undefined;
  cellKey: string;
  column: WorksheetColumn;
  row: WorksheetRow;
  width: number;
  formattedValue: string;
}) => WorksheetCellLayoutMeasurement;

export function buildWorksheetLayoutTargetFromDiffSummary(
  worksheet: WorksheetData,
  diffSummary: PricingWorksheetAiDiffSummary | null | undefined
): WorksheetLayoutTarget {
  if (!diffSummary) {
    return {
      rowIds: [],
      columnIds: [],
      cellKeys: [],
    };
  }

  const rowIds = new Set<string>();
  const columnIds = new Set<string>();
  const cellKeys = new Set<string>();

  diffSummary.affectedRows.forEach((rowNumber) => {
    const row = worksheet.rows[rowNumber - 1];
    if (row) {
      rowIds.add(row.id);
    }
  });

  const refs = [
    ...diffSummary.changedCells,
    ...diffSummary.formulaCells,
    ...diffSummary.formattingCells,
  ];

  refs.forEach((ref) => {
    const parsed = parseWorksheetCellKey(ref.toUpperCase());
    if (!parsed) {
      return;
    }

    const row = worksheet.rows.find((entry) => entry.id === parsed.rowId);
    const column = worksheet.columns.find((entry) => entry.id === parsed.columnId);
    if (!row || !column) {
      return;
    }

    rowIds.add(row.id);
    columnIds.add(column.id);
    cellKeys.add(buildWorksheetCellKey(column.id, row.id));
  });

  if (cellKeys.size === 0 && rowIds.size > 0) {
    rowIds.forEach((rowId) => {
      worksheet.columns.forEach((column) => {
        const cellKey = buildWorksheetCellKey(column.id, rowId);
        if (hasLayoutContent(worksheet.cells[cellKey])) {
          columnIds.add(column.id);
          cellKeys.add(cellKey);
        }
      });
    });
  }

  return {
    rowIds: Array.from(rowIds),
    columnIds: Array.from(columnIds),
    cellKeys: Array.from(cellKeys),
  };
}

export function buildWorksheetColumnAutoFitTarget(
  worksheet: WorksheetData,
  columnId: string
): WorksheetLayoutTarget {
  const column = worksheet.columns.find((entry) => entry.id === columnId);
  if (!column) {
    return { rowIds: [], columnIds: [], cellKeys: [] };
  }

  const rowIds: string[] = [];
  const cellKeys: string[] = [];
  worksheet.rows.forEach((row) => {
    const cellKey = buildWorksheetCellKey(column.id, row.id);
    if (!hasLayoutContent(worksheet.cells[cellKey])) {
      return;
    }

    rowIds.push(row.id);
    cellKeys.push(cellKey);
  });

  return {
    rowIds,
    columnIds: [column.id],
    cellKeys,
  };
}

export function buildWorksheetRowAutoFitTarget(
  worksheet: WorksheetData,
  rowId: string
): WorksheetLayoutTarget {
  const row = worksheet.rows.find((entry) => entry.id === rowId);
  if (!row) {
    return { rowIds: [], columnIds: [], cellKeys: [] };
  }

  const columnIds: string[] = [];
  const cellKeys: string[] = [];
  worksheet.columns.forEach((column) => {
    const cellKey = buildWorksheetCellKey(column.id, row.id);
    if (!hasLayoutContent(worksheet.cells[cellKey])) {
      return;
    }

    columnIds.push(column.id);
    cellKeys.push(cellKey);
  });

  return {
    rowIds: [row.id],
    columnIds,
    cellKeys,
  };
}

export function applyWorksheetAutoLayout(params: {
  worksheet: WorksheetData;
  target: WorksheetLayoutTarget;
  measureCell: WorksheetCellLayoutMeasureFn;
  minColumnWidth: number;
  maxColumnWidth: number;
  minRowHeight: number;
  maxRowHeight: number;
  preserveExistingColumnWidths?: boolean;
  preserveExistingRowHeights?: boolean;
  resizeColumns?: boolean;
  resizeRows?: boolean;
}): WorksheetData {
  const {
    worksheet,
    target,
    measureCell,
    minColumnWidth,
    maxColumnWidth,
    minRowHeight,
    maxRowHeight,
    preserveExistingColumnWidths = false,
    preserveExistingRowHeights = false,
    resizeColumns = true,
    resizeRows = true,
  } = params;

  const columnIds = target.columnIds.filter((columnId, index, values) =>
    values.indexOf(columnId) === index && worksheet.columns.some((column) => column.id === columnId)
  );
  const rowIds = target.rowIds.filter((rowId, index, values) =>
    values.indexOf(rowId) === index && worksheet.rows.some((row) => row.id === rowId)
  );

  if ((columnIds.length === 0 || !resizeColumns) && (rowIds.length === 0 || !resizeRows)) {
    return worksheet;
  }

  const relevantCellKeys = new Set(
    target.cellKeys.filter((cellKey) => {
      const parsed = parseWorksheetCellKey(cellKey);
      return Boolean(
        parsed &&
        worksheet.columns.some((column) => column.id === parsed.columnId) &&
        worksheet.rows.some((row) => row.id === parsed.rowId)
      );
    })
  );

  if (relevantCellKeys.size === 0) {
    rowIds.forEach((rowId) => {
      columnIds.forEach((columnId) => {
        const cellKey = buildWorksheetCellKey(columnId, rowId);
        if (hasLayoutContent(worksheet.cells[cellKey])) {
          relevantCellKeys.add(cellKey);
        }
      });
    });
  }

  if (relevantCellKeys.size === 0) {
    return worksheet;
  }

  const nextColumns = worksheet.columns.map((column) => ({ ...column }));
  const nextRows = worksheet.rows.map((row) => ({ ...row }));
  let changed = false;

  if (resizeColumns) {
    columnIds.forEach((columnId) => {
      const columnIndex = nextColumns.findIndex((column) => column.id === columnId);
      if (columnIndex < 0) {
        return;
      }

      const column = nextColumns[columnIndex];
      const columnCellKeys = Array.from(relevantCellKeys).filter((cellKey) => {
        const parsed = parseWorksheetCellKey(cellKey);
        return parsed?.columnId === column.id;
      });
      if (columnCellKeys.length === 0) {
        return;
      }

      let measuredWidth = minColumnWidth;
      columnCellKeys.forEach((cellKey) => {
        const parsed = parseWorksheetCellKey(cellKey);
        if (!parsed) {
          return;
        }

        const row = nextRows.find((entry) => entry.id === parsed.rowId);
        if (!row) {
          return;
        }

        const cell = worksheet.cells[cellKey];
        const formattedValue = getFormattedCellDisplayValue(cell);
        if (!formattedValue.trim()) {
          return;
        }

        const measurement = measureCell({
          cell,
          cellKey,
          column,
          row,
          width: column.width,
          formattedValue,
        });
        if (Number.isFinite(measurement.textWidth) && measurement.textWidth > measuredWidth) {
          measuredWidth = measurement.textWidth;
        }
      });

      const nextWidth = clampValue(Math.ceil(measuredWidth), minColumnWidth, maxColumnWidth);
      const resolvedWidth = preserveExistingColumnWidths
        ? Math.max(column.width, nextWidth)
        : nextWidth;
      if (resolvedWidth !== column.width) {
        nextColumns[columnIndex] = {
          ...column,
          width: resolvedWidth,
        };
        changed = true;
      }
    });
  }

  if (resizeRows) {
    rowIds.forEach((rowId) => {
      const rowIndex = nextRows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0) {
        return;
      }

      const row = nextRows[rowIndex];
      const rowCellKeys = Array.from(relevantCellKeys).filter((cellKey) => {
        const parsed = parseWorksheetCellKey(cellKey);
        return parsed?.rowId === row.id;
      });
      if (rowCellKeys.length === 0) {
        return;
      }

      let measuredHeight = minRowHeight;
      rowCellKeys.forEach((cellKey) => {
        const parsed = parseWorksheetCellKey(cellKey);
        if (!parsed) {
          return;
        }

        const column = nextColumns.find((entry) => entry.id === parsed.columnId);
        if (!column) {
          return;
        }

        const cell = worksheet.cells[cellKey];
        const formattedValue = getFormattedCellDisplayValue(cell);
        if (!formattedValue.trim()) {
          return;
        }

        const measurement = measureCell({
          cell,
          cellKey,
          column,
          row,
          width: column.width,
          formattedValue,
        });
        if (Number.isFinite(measurement.wrappedHeight) && measurement.wrappedHeight > measuredHeight) {
          measuredHeight = measurement.wrappedHeight;
        }
      });

      const nextHeight = clampValue(Math.ceil(measuredHeight), minRowHeight, maxRowHeight);
      const resolvedHeight = preserveExistingRowHeights
        ? Math.max(row.height, nextHeight)
        : nextHeight;
      if (resolvedHeight !== row.height) {
        nextRows[rowIndex] = {
          ...row,
          height: resolvedHeight,
        };
        changed = true;
      }
    });
  }

  if (!changed) {
    return worksheet;
  }

  return {
    ...worksheet,
    columns: nextColumns,
    rows: nextRows,
  };
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasLayoutContent(cell: WorksheetCell | undefined) {
  return getFormattedCellDisplayValue(cell).trim().length > 0;
}
