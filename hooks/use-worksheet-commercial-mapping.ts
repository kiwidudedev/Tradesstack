"use client";

import { useCallback, useReducer } from "react";
import {
  COMMERCIAL_MAPPING_FIELDS,
  createEmptyCommercialMappings,
  type CommercialMappingDestination,
  type CommercialMappingField,
  type WorksheetCommercialMappingSession,
} from "@/lib/commercial-items/worksheet-commercial-mapping";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import {
  DEFAULT_VARIATION_COST_SECTION,
  type VariationCostSection,
} from "@/lib/commercial-items/variation-sections";
import {
  reduceWorksheetFieldMapping,
  type WorksheetFieldMappingSession,
} from "@/lib/worksheet-cell-mapping";

export type WorksheetCommercialMappingAction =
  | { type: "start"; session: Omit<WorksheetCommercialMappingSession, "activeField" | "description" | "mappings" | "statusMessage"> }
  | { type: "cancel" }
  | { type: "arm"; field: CommercialMappingField | null }
  | { type: "assign"; cellKey: string }
  | { type: "assign-field"; field: CommercialMappingField; cellKey: string }
  | { type: "begin-description-edit" }
  | { type: "commit-description"; value: string; worksheetValue: string | null }
  | { type: "clear"; field: CommercialMappingField };

function fieldLabel(field: CommercialMappingField) {
  return `${field[0].toUpperCase()}${field.slice(1)}`;
}

const CORE_OPTIONS = {
  fields: COMMERCIAL_MAPPING_FIELDS,
  fieldLabel,
};

function toCoreSession(
  current: WorksheetCommercialMappingSession,
): WorksheetFieldMappingSession<CommercialMappingField> {
  return {
    workbookId: current.workbookId,
    sheetId: current.sheetId,
    structureKey: current.structureKey,
    activeField: current.activeField,
    mappings: {
      description: current.description.mode === "worksheet" ? current.description.source : null,
      ...current.mappings,
    },
    statusMessage: current.statusMessage,
  };
}

function applyCoreSession(
  current: WorksheetCommercialMappingSession,
  core: WorksheetFieldMappingSession<CommercialMappingField>,
  descriptionMode: "preserve" | "mapping" | "clear" = "preserve",
): WorksheetCommercialMappingSession {
  return {
    ...current,
    activeField: core.activeField,
    description: descriptionMode === "mapping" && core.mappings.description
      ? { mode: "worksheet", source: core.mappings.description }
      : descriptionMode === "clear"
        ? { mode: "empty" }
        : current.description,
    mappings: {
      quantity: core.mappings.quantity,
      unit: core.mappings.unit,
      rate: core.mappings.rate,
      total: core.mappings.total,
    },
    statusMessage: core.statusMessage,
  };
}

export function reduceWorksheetCommercialMapping(
  current: WorksheetCommercialMappingSession | null,
  action: WorksheetCommercialMappingAction,
): WorksheetCommercialMappingSession | null {
  if (action.type === "start") {
    return {
      ...action.session,
      activeField: null,
      description: { mode: "empty" },
      mappings: createEmptyCommercialMappings(),
      statusMessage: "Choose a field, then select its worksheet cell.",
    };
  }
  if (action.type === "cancel") return null;
  if (!current) return current;
  if (action.type === "arm") {
    return applyCoreSession(current, reduceWorksheetFieldMapping(toCoreSession(current), action, CORE_OPTIONS)!);
  }
  if (action.type === "begin-description-edit") {
    return {
      ...current,
      activeField: null,
      statusMessage: "Editing Description manually.",
    };
  }
  if (action.type === "commit-description") {
    const value = action.value.trim();
    const unchangedWorksheetValue = current.description.mode === "worksheet"
      && value === (action.worksheetValue ?? "").trim();
    return {
      ...current,
      activeField: null,
      description: !value
        ? { mode: "empty" }
        : unchangedWorksheetValue
          ? current.description
          : { mode: "manual", value },
      statusMessage: !value
        ? "Description cleared."
        : unchangedWorksheetValue
          ? "Worksheet Description retained."
          : "Manual Description saved.",
    };
  }
  if (action.type === "assign") {
    if (!current.activeField) return current;
    const field = current.activeField;
    const core = reduceWorksheetFieldMapping(toCoreSession(current), action, CORE_OPTIONS)!;
    return applyCoreSession(current, core, field === "description" ? "mapping" : "preserve");
  }
  if (action.type === "assign-field") {
    const core = reduceWorksheetFieldMapping(toCoreSession(current), action, CORE_OPTIONS)!;
    return applyCoreSession(current, core, action.field === "description" ? "mapping" : "preserve");
  }
  const core = reduceWorksheetFieldMapping(toCoreSession(current), action, CORE_OPTIONS)!;
  return applyCoreSession(current, core, action.field === "description" ? "clear" : "preserve");
}

export function useWorksheetCommercialMapping() {
  const [session, dispatch] = useReducer(reduceWorksheetCommercialMapping, null);

  const start = useCallback((params: {
    destination: CommercialMappingDestination;
    workbookId: string;
    sheetId: string;
    structureKey: string;
    startingCell: string;
    capturedSelection: WorksheetSelectionRange;
    capturedSelections: WorksheetSelectionRange[];
  }) => {
    dispatch({ type: "start", session: params });
  }, []);

  const cancel = useCallback(() => dispatch({ type: "cancel" }), []);
  const armField = useCallback((field: CommercialMappingField | null) => dispatch({ type: "arm", field }), []);
  const assignCell = useCallback((cellKey: string) => dispatch({ type: "assign", cellKey }), []);
  const assignCellToField = useCallback((field: CommercialMappingField, cellKey: string) => dispatch({ type: "assign-field", field, cellKey }), []);
  const beginDescriptionEdit = useCallback(() => dispatch({ type: "begin-description-edit" }), []);
  const commitDescription = useCallback((value: string, worksheetValue: string | null) => dispatch({ type: "commit-description", value, worksheetValue }), []);
  const clearField = useCallback((field: CommercialMappingField) => dispatch({ type: "clear", field }), []);

  return { session, start, cancel, armField, assignCell, assignCellToField, beginDescriptionEdit, commitDescription, clearField };
}

export interface WorksheetVariationCommercialMappingLine {
  id: string;
  section: VariationCostSection;
  mapping: WorksheetCommercialMappingSession;
}

export interface WorksheetVariationCommercialMappingSession {
  destination: "variation";
  lines: WorksheetVariationCommercialMappingLine[];
  statusMessage: string;
}

export type WorksheetVariationCommercialMappingAction =
  | { type: "start"; lineId: string; session: Omit<WorksheetCommercialMappingSession, "destination" | "activeField" | "description" | "mappings" | "statusMessage"> }
  | { type: "cancel" }
  | { type: "add-line"; lineId: string }
  | { type: "remove-line"; lineId: string }
  | { type: "set-section"; lineId: string; section: VariationCostSection }
  | { type: "arm"; lineId: string; field: CommercialMappingField | null }
  | { type: "assign"; cellKey: string }
  | { type: "assign-field"; lineId: string; field: CommercialMappingField; cellKey: string }
  | { type: "begin-description-edit"; lineId: string }
  | { type: "commit-description"; lineId: string; value: string; worksheetValue: string | null }
  | { type: "clear"; lineId: string; field: CommercialMappingField };

function createVariationMappingLine(params: {
  id: string;
  basis: Omit<WorksheetCommercialMappingSession, "destination" | "activeField" | "description" | "mappings" | "statusMessage">;
}): WorksheetVariationCommercialMappingLine {
  const mapping = reduceWorksheetCommercialMapping(null, {
    type: "start",
    session: { ...params.basis, destination: "variation" },
  });
  if (!mapping) throw new Error("Variation commercial mapping line could not be created.");
  return { id: params.id, section: DEFAULT_VARIATION_COST_SECTION, mapping };
}

function disarmVariationLines(lines: WorksheetVariationCommercialMappingLine[]) {
  return lines.map((line) => line.mapping.activeField
    ? { ...line, mapping: reduceWorksheetCommercialMapping(line.mapping, { type: "arm", field: null })! }
    : line);
}

export function reduceWorksheetVariationCommercialMapping(
  current: WorksheetVariationCommercialMappingSession | null,
  action: WorksheetVariationCommercialMappingAction,
): WorksheetVariationCommercialMappingSession | null {
  if (action.type === "start") {
    return {
      destination: "variation",
      lines: [createVariationMappingLine({ id: action.lineId, basis: action.session })],
      statusMessage: "Choose a field, then select its worksheet cell.",
    };
  }
  if (action.type === "cancel") return null;
  if (!current) return current;

  if (action.type === "add-line") {
    const basis = current.lines[0]?.mapping;
    if (!basis) return current;
    return {
      ...current,
      lines: [...disarmVariationLines(current.lines), createVariationMappingLine({
        id: action.lineId,
        basis: {
          workbookId: basis.workbookId,
          sheetId: basis.sheetId,
          structureKey: basis.structureKey,
          startingCell: basis.startingCell,
          capturedSelection: basis.capturedSelection,
          capturedSelections: basis.capturedSelections,
        },
      })],
      statusMessage: "Commercial line added.",
    };
  }

  if (action.type === "remove-line") {
    if (current.lines.length <= 1) return current;
    return {
      ...current,
      lines: current.lines.filter((line) => line.id !== action.lineId),
      statusMessage: "Commercial line removed.",
    };
  }

  if (action.type === "set-section") {
    return {
      ...current,
      lines: current.lines.map((line) => line.id === action.lineId ? { ...line, section: action.section } : line),
    };
  }

  if (action.type === "assign") {
    const activeLine = current.lines.find((line) => line.mapping.activeField);
    if (!activeLine) return current;
    const nextMapping = reduceWorksheetCommercialMapping(activeLine.mapping, action)!;
    return {
      ...current,
      lines: current.lines.map((line) => line.id === activeLine.id ? { ...line, mapping: nextMapping } : line),
      statusMessage: nextMapping.statusMessage,
    };
  }

  const lines = action.type === "arm" && action.field
    ? disarmVariationLines(current.lines)
    : current.lines;
  let nextStatus = current.statusMessage;
  const nextLines = lines.map((line) => {
    if (line.id !== action.lineId) return line;
    const lineAction: WorksheetCommercialMappingAction = action.type === "arm"
      ? { type: "arm", field: action.field }
      : action.type === "assign-field"
        ? { type: "assign-field", field: action.field, cellKey: action.cellKey }
        : action.type === "begin-description-edit"
          ? { type: "begin-description-edit" }
          : action.type === "commit-description"
            ? { type: "commit-description", value: action.value, worksheetValue: action.worksheetValue }
            : { type: "clear", field: action.field };
    const mapping = reduceWorksheetCommercialMapping(line.mapping, lineAction)!;
    nextStatus = mapping.statusMessage;
    return { ...line, mapping };
  });
  return { ...current, lines: nextLines, statusMessage: nextStatus };
}

function nextVariationLineId() {
  return crypto.randomUUID();
}

export function useWorksheetVariationCommercialMapping() {
  const [session, dispatch] = useReducer(reduceWorksheetVariationCommercialMapping, null);
  const start = useCallback((params: Omit<WorksheetCommercialMappingSession, "destination" | "activeField" | "description" | "mappings" | "statusMessage">) => {
    dispatch({ type: "start", lineId: nextVariationLineId(), session: params });
  }, []);
  const cancel = useCallback(() => dispatch({ type: "cancel" }), []);
  const addLine = useCallback(() => dispatch({ type: "add-line", lineId: nextVariationLineId() }), []);
  const removeLine = useCallback((lineId: string) => dispatch({ type: "remove-line", lineId }), []);
  const setSection = useCallback((lineId: string, section: VariationCostSection) => dispatch({ type: "set-section", lineId, section }), []);
  const armField = useCallback((lineId: string, field: CommercialMappingField | null) => dispatch({ type: "arm", lineId, field }), []);
  const assignCell = useCallback((cellKey: string) => dispatch({ type: "assign", cellKey }), []);
  const assignCellToField = useCallback((lineId: string, field: CommercialMappingField, cellKey: string) => dispatch({ type: "assign-field", lineId, field, cellKey }), []);
  const beginDescriptionEdit = useCallback((lineId: string) => dispatch({ type: "begin-description-edit", lineId }), []);
  const commitDescription = useCallback((lineId: string, value: string, worksheetValue: string | null) => dispatch({ type: "commit-description", lineId, value, worksheetValue }), []);
  const clearField = useCallback((lineId: string, field: CommercialMappingField) => dispatch({ type: "clear", lineId, field }), []);
  return { session, start, cancel, addLine, removeLine, setSection, armField, assignCell, assignCellToField, beginDescriptionEdit, commitDescription, clearField };
}
