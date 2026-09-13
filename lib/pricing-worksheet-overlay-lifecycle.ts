export type PricingWorksheetOverlayHistoryState = Record<string, unknown> & {
  pricingWorksheetOverlay?: unknown;
  worksheetId?: unknown;
  sheetId?: unknown;
};

function asHistoryState(state: unknown): PricingWorksheetOverlayHistoryState {
  return state && typeof state === "object"
    ? { ...(state as PricingWorksheetOverlayHistoryState) }
    : {};
}

export function resolveRestoredPricingWorksheetId(params: {
  isRegisterPath: boolean;
  pathnameWorksheetId: string | null;
  historyState: unknown;
  persistedWorksheetId: string | null;
}) {
  // An explicit canonical register pathname means closed. Recovery state is
  // only a fallback while the pathname is unresolved, never an instruction to
  // override a committed register URL.
  if (params.isRegisterPath) {
    return null;
  }

  const historyState = asHistoryState(params.historyState);
  const historyWorksheetId = historyState.pricingWorksheetOverlay && typeof historyState.worksheetId === "string"
    ? historyState.worksheetId.trim()
    : "";

  return params.pathnameWorksheetId
    ?? (historyWorksheetId.length > 0 ? historyWorksheetId : null)
    ?? params.persistedWorksheetId;
}

export function clearPricingWorksheetOverlayHistoryState(state: unknown) {
  const nextState = asHistoryState(state);
  delete nextState.pricingWorksheetOverlay;
  delete nextState.worksheetId;
  delete nextState.sheetId;
  return nextState;
}
