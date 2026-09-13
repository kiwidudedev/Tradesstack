export type WorksheetCellReference = {
  workbookId: string;
  sheetId: string;
  cellKey: string;
  structureKey: string;
};

export function buildWorksheetStructureKey(worksheet: {
  columns: Array<{ id: string }>;
  rows: Array<{ id: string }>;
}) {
  return `${worksheet.columns.map((column) => column.id).join(",")}|${worksheet.rows.map((row) => row.id).join(",")}`;
}

export type WorksheetFieldMappings<TField extends string> = Record<
  TField,
  WorksheetCellReference | null
>;

export type WorksheetFieldMappingSession<TField extends string> = {
  workbookId: string;
  sheetId: string;
  structureKey: string;
  activeField: TField | null;
  mappings: WorksheetFieldMappings<TField>;
  statusMessage: string;
};

export type WorksheetFieldMappingAction<TField extends string> =
  | {
      type: "start";
      session: Pick<WorksheetFieldMappingSession<TField>, "workbookId" | "sheetId" | "structureKey">;
    }
  | { type: "cancel" }
  | { type: "arm"; field: TField | null }
  | { type: "assign"; cellKey: string }
  | { type: "assign-field"; field: TField; cellKey: string }
  | { type: "clear"; field: TField }
  | { type: "reset" }
  | { type: "status"; message: string };

export type WorksheetFieldMappingOptions<TField extends string> = {
  fields: readonly TField[];
  fieldLabel?: (field: TField) => string;
  validateAssignment?: (params: {
    field: TField;
    cellKey: string;
    session: WorksheetFieldMappingSession<TField>;
  }) => string | null;
};

function defaultFieldLabel(field: string) {
  return `${field[0]?.toUpperCase() ?? ""}${field.slice(1)}`;
}

export function createEmptyWorksheetFieldMappings<TField extends string>(
  fields: readonly TField[],
): WorksheetFieldMappings<TField> {
  return Object.fromEntries(fields.map((field) => [field, null])) as WorksheetFieldMappings<TField>;
}

export function buildWorksheetCellReference<TField extends string>(
  session: WorksheetFieldMappingSession<TField>,
  cellKey: string,
): WorksheetCellReference {
  return {
    workbookId: session.workbookId,
    sheetId: session.sheetId,
    cellKey,
    structureKey: session.structureKey,
  };
}

export function reduceWorksheetFieldMapping<TField extends string>(
  current: WorksheetFieldMappingSession<TField> | null,
  action: WorksheetFieldMappingAction<TField>,
  options: WorksheetFieldMappingOptions<TField>,
): WorksheetFieldMappingSession<TField> | null {
  const fieldLabel = options.fieldLabel ?? defaultFieldLabel;
  if (action.type === "start") {
    return {
      ...action.session,
      activeField: null,
      mappings: createEmptyWorksheetFieldMappings(options.fields),
      statusMessage: "Choose a field, then select its worksheet cell.",
    };
  }
  if (action.type === "cancel") return null;
  if (!current) return current;
  if (action.type === "status") return { ...current, statusMessage: action.message };
  if (action.type === "reset") {
    return {
      ...current,
      activeField: null,
      mappings: createEmptyWorksheetFieldMappings(options.fields),
      statusMessage: "Choose a field, then select its worksheet cell.",
    };
  }
  if (action.type === "arm") {
    return {
      ...current,
      activeField: action.field,
      statusMessage: action.field
        ? `${fieldLabel(action.field)} field armed. Select a worksheet cell.`
        : "Field selection cancelled.",
    };
  }
  if (action.type === "clear") {
    return {
      ...current,
      activeField: action.field,
      mappings: { ...current.mappings, [action.field]: null },
      statusMessage: `${fieldLabel(action.field)} cleared. Select a replacement cell.`,
    };
  }

  const field = action.type === "assign" ? current.activeField : action.field;
  if (!field) return current;
  const issue = options.validateAssignment?.({ field, cellKey: action.cellKey, session: current }) ?? null;
  if (issue) return { ...current, statusMessage: issue };

  const mappings = {
    ...current.mappings,
    [field]: buildWorksheetCellReference(current, action.cellKey),
  };
  const nextField = action.type === "assign"
    ? options.fields.slice(options.fields.indexOf(field) + 1).find((candidate) => !mappings[candidate]) ?? null
    : null;
  return {
    ...current,
    mappings,
    activeField: nextField,
    statusMessage: `${action.cellKey} assigned to ${fieldLabel(field)}.${nextField ? ` ${fieldLabel(nextField)} is ready.` : ""}`,
  };
}
