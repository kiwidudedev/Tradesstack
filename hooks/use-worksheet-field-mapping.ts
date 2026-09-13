"use client";

import { useCallback, useReducer } from "react";
import {
  reduceWorksheetFieldMapping,
  type WorksheetFieldMappingOptions,
  type WorksheetFieldMappingSession,
} from "@/lib/worksheet-cell-mapping";

export function useWorksheetFieldMapping<TField extends string>(
  options: WorksheetFieldMappingOptions<TField>,
) {
  const [session, dispatch] = useReducer(
    (current: WorksheetFieldMappingSession<TField> | null, action: Parameters<typeof reduceWorksheetFieldMapping<TField>>[1]) =>
      reduceWorksheetFieldMapping(current, action, options),
    null,
  );

  const start = useCallback((params: Pick<WorksheetFieldMappingSession<TField>, "workbookId" | "sheetId" | "structureKey">) => {
    dispatch({ type: "start", session: params });
  }, []);
  const cancel = useCallback(() => dispatch({ type: "cancel" }), []);
  const armField = useCallback((field: TField | null) => dispatch({ type: "arm", field }), []);
  const assignCell = useCallback((cellKey: string) => dispatch({ type: "assign", cellKey }), []);
  const assignCellToField = useCallback((field: TField, cellKey: string) => dispatch({ type: "assign-field", field, cellKey }), []);
  const clearField = useCallback((field: TField) => dispatch({ type: "clear", field }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const setStatus = useCallback((message: string) => dispatch({ type: "status", message }), []);

  return { session, start, cancel, armField, assignCell, assignCellToField, clearField, reset, setStatus };
}
