import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";

type WorksheetHistoryState = {
  future: WorksheetData[];
  past: WorksheetData[];
};

type WorksheetHistoryTransition = WorksheetHistoryState & {
  worksheet: WorksheetData;
};

function cloneWorksheetData(worksheet: WorksheetData) {
  return JSON.parse(JSON.stringify(worksheet)) as WorksheetData;
}

export function commitWorksheetHistoryEntry(params: {
  changed: boolean;
  future: WorksheetData[];
  historyLimit: number;
  past: WorksheetData[];
  previousWorksheet: WorksheetData;
}): WorksheetHistoryState {
  if (!params.changed) {
    return {
      future: params.future,
      past: params.past,
    };
  }

  const nextPast = [...params.past, cloneWorksheetData(params.previousWorksheet)];

  return {
    future: [],
    past:
      nextPast.length > params.historyLimit
        ? nextPast.slice(nextPast.length - params.historyLimit)
        : nextPast,
  };
}

export function buildWorksheetUndoState(params: {
  currentWorksheet: WorksheetData;
  future: WorksheetData[];
  historyLimit: number;
  past: WorksheetData[];
}): WorksheetHistoryTransition | null {
  const previousWorksheet = params.past.at(-1);
  if (!previousWorksheet) {
    return null;
  }

  return {
    future: [cloneWorksheetData(params.currentWorksheet), ...params.future].slice(
      0,
      params.historyLimit
    ),
    past: params.past.slice(0, -1),
    worksheet: cloneWorksheetData(previousWorksheet),
  };
}

export function buildWorksheetRedoState(params: {
  currentWorksheet: WorksheetData;
  future: WorksheetData[];
  historyLimit: number;
  past: WorksheetData[];
}): WorksheetHistoryTransition | null {
  const nextWorksheet = params.future[0];
  if (!nextWorksheet) {
    return null;
  }

  return {
    future: params.future.slice(1),
    past: [...params.past, cloneWorksheetData(params.currentWorksheet)].slice(-params.historyLimit),
    worksheet: cloneWorksheetData(nextWorksheet),
  };
}
