import {
  createDefaultWorksheetExtractedPricingData,
  createDefaultWorksheetPricingSummary,
  normalizeWorksheetData,
  type WorksheetData,
  type WorksheetExtractedPricingData,
  type WorksheetPricingSummary,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import type { Database, Json } from "@/lib/supabase/types";

const LEGACY_DEFAULT_SHEET_ID_PREFIX = "legacy-default-sheet:";

type PricingWorkbookParentRow = Pick<
  Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"],
  | "archived_at"
  | "created_at"
  | "created_by"
  | "extracted_pricing_data"
  | "id"
  | "last_active_sheet_id"
  | "name"
  | "opportunity_id"
  | "organization_id"
  | "project_id"
  | "pricing_summary"
  | "quote_id"
  | "sort_order"
  | "trade_package"
  | "updated_at"
  | "updated_by"
  | "variation_id"
  | "version"
  | "worksheet_data"
>;

type PricingWorkbookSheetRow = Pick<
  Database["public"]["Tables"]["opportunity_pricing_workbook_sheets"]["Row"],
  | "created_at"
  | "created_by"
  | "extracted_pricing_data"
  | "id"
  | "is_default"
  | "name"
  | "opportunity_id"
  | "organization_id"
  | "pricing_summary"
  | "sheet_order"
  | "updated_at"
  | "updated_by"
  | "version"
  | "workbook_id"
  | "worksheet_data"
>;

export type OpportunityPricingWorkbookSheet = {
  createdAt: string;
  createdBy: string;
  extractedPricingData: WorksheetExtractedPricingData;
  id: string;
  isDefault: boolean;
  name: string;
  pricingSummary: WorksheetPricingSummary;
  sheetOrder: number;
  updatedAt: string;
  updatedBy: string;
  version: number;
  workbookId: string;
  worksheet: WorksheetData;
};

export type OpportunityPricingWorkbook = {
  archivedAt: string | null;
  createdAt: string;
  createdBy: string;
  id: string;
  lastActiveSheetId: string | null;
  legacySheetFallback: boolean;
  name: string;
  opportunityId: string | null;
  organizationId: string;
  projectId: string | null;
  quoteId: string | null;
  sortOrder: number | null;
  tradePackage: string | null;
  updatedAt: string;
  updatedBy: string;
  variationId: string | null;
  version: number;
  sheets: OpportunityPricingWorkbookSheet[];
};

export type OpportunityPricingWorkbookEditorRecord = {
  extractedPricingData: WorksheetExtractedPricingData;
  pricingSummary: WorksheetPricingSummary;
  sheetId: string;
  sheetName: string;
  tradePackage: string | null;
  updatedAt: string | null;
  workbookId: string;
  workbookName: string;
  worksheet: WorksheetData;
};

export type OpportunityPricingWorkbookDeleteSheetResult = {
  deletedSheetId: string;
  nextSheetId: string | null;
};

export type OpportunityPricingWorkbookRegisterRow = {
  id: string;
  name: string;
  tradePackage: string | null;
  updatedAt: string;
};

type CreateWorkbookParams = {
  extractedPricingData: WorksheetExtractedPricingData;
  name: string;
  opportunityId: string | null;
  organizationId: string;
  projectId?: string | null;
  projectOwned?: boolean;
  pricingSummary: WorksheetPricingSummary;
  quoteId?: string | null;
  saveRequestId?: string | null;
  supabase: any;
  tradePackage: string | null;
  userId: string;
  variationId?: string | null;
  worksheet: WorksheetData;
};

type SaveWorkbookSheetParams = CreateWorkbookParams & {
  workbookId?: string | null;
  sheetId?: string | null;
};

type PricingWorkbookOwnerScope = {
  opportunityId: string | null;
  projectId?: string | null;
  projectOwned?: boolean;
  quoteId?: string | null;
  variationId?: string | null;
};

type PricingWorkbookOwnerKind = "opportunity" | "project" | "quote" | "variation";

type NormalizedPricingWorkbookOwnerScope = {
  kind: PricingWorkbookOwnerKind;
  opportunityId: string;
  projectId: string | null;
  quoteId: string | null;
  variationId: string | null;
};

export function buildLegacyDefaultSheetId(workbookId: string) {
  return `${LEGACY_DEFAULT_SHEET_ID_PREFIX}${workbookId}`;
}

export function isLegacyDefaultSheetId(sheetId: string | null | undefined) {
  return typeof sheetId === "string" && sheetId.startsWith(LEGACY_DEFAULT_SHEET_ID_PREFIX);
}

function normalizeWorksheetName(value: string | null | undefined, fallback = "Pricing Worksheet") {
  return value?.trim() || fallback;
}

function normalizeOptionalWorksheetName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function isInternalWorkbookPageName(value: string | null | undefined) {
  return typeof value === "string" && /^page\s+\d+$/i.test(value.trim());
}

function isJsonRecord(value: Json | null | undefined): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundPricingSummaryCurrency(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizePricingSummary(input: Json): WorksheetPricingSummary {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createDefaultWorksheetPricingSummary();
  }

  const record = input as Partial<WorksheetPricingSummary>;
  return {
    version: typeof record.version === "number" ? record.version : 1,
    currency: typeof record.currency === "string" && record.currency.trim() ? record.currency : "NZD",
    subtotal: roundPricingSummaryCurrency(record.subtotal),
    margin: roundPricingSummaryCurrency(record.margin),
    gst: roundPricingSummaryCurrency(record.gst),
    grandTotal: roundPricingSummaryCurrency(record.grandTotal),
    lastCalculatedAt:
      typeof record.lastCalculatedAt === "string" && record.lastCalculatedAt.trim()
        ? record.lastCalculatedAt
        : null,
  };
}

function normalizeExtractedPricingData(
  input: Json,
  sourceWorksheetVersion: number,
): WorksheetExtractedPricingData {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createDefaultWorksheetExtractedPricingData(sourceWorksheetVersion);
  }

  const record = input as Partial<WorksheetExtractedPricingData>;
  return {
    version: typeof record.version === "number" ? record.version : 1,
    extractedAt:
      typeof record.extractedAt === "string" && record.extractedAt.trim() ? record.extractedAt : null,
    method: record.method === "ai" ? "ai" : "ai",
    confidence: typeof record.confidence === "number" ? record.confidence : null,
    lineItems: Array.isArray(record.lineItems) ? record.lineItems : [],
    summary:
      record.summary && typeof record.summary === "object" && !Array.isArray(record.summary)
        ? record.summary
        : {},
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
    sourceWorksheetVersion:
      typeof record.sourceWorksheetVersion === "number"
        ? record.sourceWorksheetVersion
        : sourceWorksheetVersion,
  };
}

function normalizeWorkbookSheetRow(row: PricingWorkbookSheetRow): OpportunityPricingWorkbookSheet {
  const worksheet = normalizeWorksheetData(row.worksheet_data);
  const name = normalizeWorksheetName(row.name, worksheet.sheetName);

  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    extractedPricingData: normalizeExtractedPricingData(row.extracted_pricing_data, worksheet.version),
    id: row.id,
    isDefault: row.is_default,
    name,
    pricingSummary: normalizePricingSummary(row.pricing_summary),
    sheetOrder: row.sheet_order,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    version: row.version,
    workbookId: row.workbook_id,
    worksheet: {
      ...worksheet,
      sheetName: name,
    },
  };
}

function buildLegacyWorkbookSheet(workbook: PricingWorkbookParentRow): OpportunityPricingWorkbookSheet {
  const worksheet = normalizeWorksheetData(workbook.worksheet_data);
  const name = normalizeWorksheetName(workbook.name, worksheet.sheetName);

  return {
    createdAt: workbook.created_at,
    createdBy: workbook.created_by,
    extractedPricingData: normalizeExtractedPricingData(workbook.extracted_pricing_data, worksheet.version),
    id: buildLegacyDefaultSheetId(workbook.id),
    isDefault: true,
    name,
    pricingSummary: normalizePricingSummary(workbook.pricing_summary),
    sheetOrder: 0,
    updatedAt: workbook.updated_at,
    updatedBy: workbook.updated_by,
    version: workbook.version,
    workbookId: workbook.id,
    worksheet: {
      ...worksheet,
      sheetName: name,
    },
  };
}

function sortWorkbookSheets(sheets: OpportunityPricingWorkbookSheet[]) {
  return [...sheets].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    if (left.sheetOrder !== right.sheetOrder) {
      return left.sheetOrder - right.sheetOrder;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function buildOpportunityPricingWorkbook(params: {
  workbook: PricingWorkbookParentRow;
  sheets: PricingWorkbookSheetRow[];
}): OpportunityPricingWorkbook {
  const normalizedSheets =
    params.sheets.length > 0
      ? sortWorkbookSheets(params.sheets.map((sheet) => normalizeWorkbookSheetRow(sheet)))
      : [buildLegacyWorkbookSheet(params.workbook)];

  return {
    archivedAt: params.workbook.archived_at,
    createdAt: params.workbook.created_at,
    createdBy: params.workbook.created_by,
    id: params.workbook.id,
    lastActiveSheetId: params.workbook.last_active_sheet_id,
    legacySheetFallback: params.sheets.length === 0,
    name: normalizeWorksheetName(params.workbook.name, normalizedSheets[0]?.name ?? "Pricing Worksheet"),
    opportunityId: params.workbook.opportunity_id,
    organizationId: params.workbook.organization_id,
    projectId: params.workbook.project_id,
    quoteId: params.workbook.quote_id,
    sortOrder: params.workbook.sort_order,
    tradePackage: params.workbook.trade_package,
    updatedAt: params.workbook.updated_at,
    updatedBy: params.workbook.updated_by,
    variationId: params.workbook.variation_id,
    version: params.workbook.version,
    sheets: normalizedSheets,
  };
}

export function deriveOpportunityPricingWorkbookRegisterName(params: {
  workbook: Pick<PricingWorkbookParentRow, "name" | "trade_package" | "worksheet_data">;
  sheets?: Array<Pick<PricingWorkbookSheetRow, "created_at" | "is_default" | "name" | "sheet_order">>;
}) {
  const parentName = normalizeOptionalWorksheetName(params.workbook.name);
  if (parentName && !isInternalWorkbookPageName(parentName)) {
    return parentName;
  }

  const defaultSheet = [...(params.sheets ?? [])]
    .sort((left, right) => {
      if (left.is_default !== right.is_default) {
        return left.is_default ? -1 : 1;
      }

      if (left.sheet_order !== right.sheet_order) {
        return left.sheet_order - right.sheet_order;
      }

      return left.created_at.localeCompare(right.created_at);
    })
    .find((sheet) => sheet.is_default);
  const defaultSheetName = normalizeOptionalWorksheetName(defaultSheet?.name);
  if (defaultSheetName && !isInternalWorkbookPageName(defaultSheetName)) {
    return defaultSheetName;
  }

  const worksheetSheetName =
    isJsonRecord(params.workbook.worksheet_data) && typeof params.workbook.worksheet_data.sheetName === "string"
      ? normalizeOptionalWorksheetName(params.workbook.worksheet_data.sheetName)
      : null;
  if (worksheetSheetName && !isInternalWorkbookPageName(worksheetSheetName)) {
    return worksheetSheetName;
  }

  const tradePackageName = normalizeOptionalWorksheetName(params.workbook.trade_package);
  if (tradePackageName) {
    return tradePackageName;
  }

  return "Pricing Worksheet";
}

export function buildOpportunityPricingWorkbookRegisterRows(params: {
  workbooks: Array<
    Pick<PricingWorkbookParentRow, "id" | "name" | "trade_package" | "updated_at" | "variation_id" | "worksheet_data"> &
      Partial<Pick<PricingWorkbookParentRow, "project_id" | "quote_id">>
  >;
  sheets?: Array<Pick<PricingWorkbookSheetRow, "created_at" | "is_default" | "name" | "sheet_order" | "workbook_id">>;
  scope?: "opportunity" | "project";
}) {
  const sheetsByWorkbookId = new Map<string, Array<Pick<PricingWorkbookSheetRow, "created_at" | "is_default" | "name" | "sheet_order">>>();
  for (const sheet of params.sheets ?? []) {
    const current = sheetsByWorkbookId.get(sheet.workbook_id) ?? [];
    current.push(sheet);
    sheetsByWorkbookId.set(sheet.workbook_id, current);
  }

  return params.workbooks
    .filter((workbook) =>
      params.scope === "project"
        ? workbook.project_id != null && workbook.variation_id == null
        : workbook.project_id == null && workbook.quote_id == null && workbook.variation_id == null,
    )
    .map((workbook) => ({
      id: workbook.id,
      name: deriveOpportunityPricingWorkbookRegisterName({
        workbook,
        sheets: sheetsByWorkbookId.get(workbook.id),
      }),
      tradePackage: workbook.trade_package,
      updatedAt: workbook.updated_at,
    })) satisfies OpportunityPricingWorkbookRegisterRow[];
}

function parseWorkbookMutationRpcPayload(payload: Json | null, fallbackMessage: string) {
  if (!isJsonRecord(payload) || !isJsonRecord(payload.workbook)) {
    throw new Error(fallbackMessage);
  }

  const workbook = payload.workbook as unknown as PricingWorkbookParentRow;
  const sheets =
    Array.isArray(payload.sheets)
      ? payload.sheets.filter(isJsonRecord).map((sheet) => sheet as unknown as PricingWorkbookSheetRow)
      : [];
  const sheet =
    isJsonRecord(payload.sheet)
      ? (payload.sheet as unknown as PricingWorkbookSheetRow)
      : null;

  return {
    workbook,
    sheets: sheets.length > 0 ? sheets : sheet ? [sheet] : [],
  } satisfies {
    workbook: PricingWorkbookParentRow;
    sheets: PricingWorkbookSheetRow[];
  };
}

export function getOpportunityPricingWorkbookActiveSheet(
  workbook: OpportunityPricingWorkbook,
) {
  return workbook.sheets[0] ?? null;
}

export function buildOpportunityPricingWorkbookEditorRecord(
  workbook: OpportunityPricingWorkbook,
  activeSheetId?: string | null,
): OpportunityPricingWorkbookEditorRecord {
  const requestedActiveSheet =
    activeSheetId
      ? workbook.sheets.find((sheet) => sheet.id === activeSheetId)
      : null;
  const persistedActiveSheet =
    requestedActiveSheet || !workbook.lastActiveSheetId
      ? null
      : workbook.sheets.find((sheet) => sheet.id === workbook.lastActiveSheetId);
  const activeSheet =
    requestedActiveSheet ?? persistedActiveSheet ?? getOpportunityPricingWorkbookActiveSheet(workbook);

  if (!activeSheet) {
    const worksheet = normalizeWorksheetData(null);
    const sheetName = normalizeWorksheetName(workbook.name, worksheet.sheetName);
    return {
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      pricingSummary: createDefaultWorksheetPricingSummary(),
      sheetId: buildLegacyDefaultSheetId(workbook.id),
      sheetName,
      tradePackage: workbook.tradePackage,
      updatedAt: workbook.updatedAt,
      workbookId: workbook.id,
      workbookName: workbook.name,
      worksheet: {
        ...worksheet,
        sheetName,
      },
    };
  }

  return {
    extractedPricingData: activeSheet.extractedPricingData,
    pricingSummary: activeSheet.pricingSummary,
    sheetId: activeSheet.id,
    sheetName: activeSheet.name,
    tradePackage: workbook.tradePackage,
    updatedAt: activeSheet.updatedAt ?? workbook.updatedAt,
    workbookId: workbook.id,
    workbookName: workbook.name,
    worksheet: {
      ...activeSheet.worksheet,
      sheetName: activeSheet.name,
    },
  };
}

function normalizePricingWorkbookOwnerScope(
  owner: PricingWorkbookOwnerScope,
): NormalizedPricingWorkbookOwnerScope {
  const opportunityId =
    typeof owner.opportunityId === "string" && owner.opportunityId.trim().length > 0
      ? owner.opportunityId
      : null;
  const projectId =
    typeof owner.projectId === "string" && owner.projectId.trim().length > 0
      ? owner.projectId
      : null;
  const quoteId =
    typeof owner.quoteId === "string" && owner.quoteId.trim().length > 0
      ? owner.quoteId
      : null;
  const variationId =
    typeof owner.variationId === "string" && owner.variationId.trim().length > 0
      ? owner.variationId
      : null;

  if (quoteId && variationId) {
    throw new Error("Pricing worksheet owner cannot target both a quote and a variation.");
  }

  if (variationId) {
    if (!projectId) {
      throw new Error("Variation pricing worksheets require project ownership.");
    }
    if (!opportunityId) {
      throw new Error("Variation pricing worksheets require originating opportunity lineage.");
    }

    return {
      kind: "variation",
      opportunityId,
      projectId,
      quoteId: null,
      variationId,
    };
  }

  if (quoteId) {
    if (!projectId) {
      throw new Error("Quote pricing worksheets require project ownership.");
    }
    if (!opportunityId) {
      throw new Error("Quote pricing worksheets require originating opportunity lineage.");
    }

    return {
      kind: "quote",
      opportunityId,
      projectId,
      quoteId,
      variationId: null,
    };
  }

  if (projectId && owner.projectOwned === true) {
    if (!opportunityId) {
      throw new Error("Project pricing worksheets require originating opportunity lineage.");
    }

    return {
      kind: "project",
      opportunityId,
      projectId,
      quoteId: null,
      variationId: null,
    };
  }

  if (!opportunityId) {
    throw new Error("Opportunity pricing worksheets require originating opportunity lineage.");
  }

  return {
    kind: "opportunity",
    opportunityId,
    projectId: null,
    quoteId: null,
    variationId: null,
  };
}

function applyWorkbookOwnerFilters(query: any, owner: PricingWorkbookOwnerScope) {
  const normalizedOwner = normalizePricingWorkbookOwnerScope(owner);

  query.eq("opportunity_id", normalizedOwner.opportunityId);

  if (normalizedOwner.kind === "variation") {
    query.eq("variation_id", normalizedOwner.variationId);
    query.is("quote_id", null);
  } else if (normalizedOwner.kind === "quote") {
    query.eq("quote_id", normalizedOwner.quoteId);
    query.is("variation_id", null);
  } else if (normalizedOwner.kind === "project") {
    query.eq("project_id", normalizedOwner.projectId);
    query.is("variation_id", null);
    query.or("quote_id.is.null,clone_kind.eq.project_working");
  } else {
    query.is("project_id", null);
    query.is("quote_id", null);
    query.is("variation_id", null);
  }

  if (normalizedOwner.projectId && normalizedOwner.kind !== "project") {
    query.eq("project_id", normalizedOwner.projectId);
  }

  return query;
}

async function loadWorkbookParentRow(params: {
  supabase: any;
  organizationId: string;
  opportunityId: string | null;
  projectId?: string | null;
  projectOwned?: boolean;
  quoteId?: string | null;
  variationId?: string | null;
  workbookId?: string | null;
}) {
  const query = applyWorkbookOwnerFilters(
    params.supabase
    .from("opportunity_pricing_worksheets")
    .select(
      "id, organization_id, opportunity_id, project_id, quote_id, variation_id, name, trade_package, sort_order, archived_at, last_active_sheet_id, worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by, created_at, updated_at",
    )
    .eq("organization_id", params.organizationId)
    .is("archived_at", null),
    {
      opportunityId: params.opportunityId,
      projectId: params.projectId,
      projectOwned: params.projectOwned,
      quoteId: params.quoteId,
      variationId: params.variationId,
    },
  );

  const result = params.workbookId
    ? await query.eq("id", params.workbookId).single()
    : await query.maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data as PricingWorkbookParentRow | null) ?? null;
}

async function loadWorkbookSheetRows(params: {
  supabase: any;
  workbookId: string;
  organizationId: string;
  owner: PricingWorkbookOwnerScope;
}) {
  const normalizedOwner = normalizePricingWorkbookOwnerScope(params.owner);

  const { data, error } = await params.supabase
    .from("opportunity_pricing_workbook_sheets")
    .select(
      "id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by, created_at, updated_at",
    )
    .eq("organization_id", params.organizationId)
    .eq("opportunity_id", normalizedOwner.opportunityId)
    .eq("workbook_id", params.workbookId)
    .order("sheet_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PricingWorkbookSheetRow[];
}

export async function loadOpportunityPricingWorkbook(params: {
  supabase: any;
  organizationId: string;
  opportunityId: string | null;
  projectId?: string | null;
  projectOwned?: boolean;
  quoteId?: string | null;
  variationId?: string | null;
  workbookId?: string | null;
}) {
  const workbookRow = await loadWorkbookParentRow(params);
  if (!workbookRow) {
    return null;
  }

  const sheetRows = await loadWorkbookSheetRows({
    supabase: params.supabase,
    workbookId: workbookRow.id,
    organizationId: params.organizationId,
    owner: {
      opportunityId: params.opportunityId,
      projectId: params.projectId,
      projectOwned: params.projectOwned,
      quoteId: params.quoteId,
      variationId: params.variationId,
    },
  });

  return buildOpportunityPricingWorkbook({
    workbook: workbookRow,
    sheets: sheetRows,
  });
}

export async function setOpportunityPricingWorkbookLastActiveSheet(params: {
  supabase: any;
  organizationId: string;
  opportunityId: string | null;
  projectId?: string | null;
  projectOwned?: boolean;
  quoteId?: string | null;
  variationId?: string | null;
  workbookId: string;
  sheetId?: string | null;
}) {
  const nextSheetId =
    typeof params.sheetId === "string" && params.sheetId.trim().length > 0 && !isLegacyDefaultSheetId(params.sheetId)
      ? params.sheetId
      : null;

  const scopedUpdate = applyWorkbookOwnerFilters(
    params.supabase
    .from("opportunity_pricing_worksheets")
    .update({
      last_active_sheet_id: nextSheetId,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.workbookId)
    .is("archived_at", null),
    {
      opportunityId: params.opportunityId,
      projectId: params.projectId,
      projectOwned: params.projectOwned,
      quoteId: params.quoteId,
      variationId: params.variationId,
    },
  );

  const { error } = await scopedUpdate;

  if (error) {
    throw new Error(error.message);
  }
}

export async function createOpportunityPricingWorkbook(
  params: CreateWorkbookParams,
) {
  const normalizedOwner = normalizePricingWorkbookOwnerScope({
    opportunityId: params.opportunityId,
    projectId: params.projectId,
    projectOwned: params.projectOwned,
    quoteId: params.quoteId,
    variationId: params.variationId,
  });

  const workbookName = normalizeWorksheetName(params.name, params.worksheet.sheetName);
  const syncedWorksheet = {
    ...params.worksheet,
    sheetName: workbookName,
  };
  const normalizedPricingSummary = normalizePricingSummary(params.pricingSummary as unknown as Json);
  const { data, error } = await params.supabase.rpc("save_pricing_workbook_active_sheet" as never, {
    p_organization_id: params.organizationId,
    p_opportunity_id: normalizedOwner.opportunityId,
    p_project_id: normalizedOwner.projectId,
    p_quote_id: normalizedOwner.quoteId,
    p_user_id: params.userId,
    p_variation_id: normalizedOwner.variationId,
    p_workbook_id: null,
    p_sheet_id: null,
    p_name: workbookName,
    p_trade_package: params.tradePackage,
    p_worksheet_data: syncedWorksheet as unknown as Json,
    p_pricing_summary: normalizedPricingSummary as unknown as Json,
    p_extracted_pricing_data: params.extractedPricingData as unknown as Json,
    p_version: syncedWorksheet.version,
    p_save_request_id: params.saveRequestId ?? null,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return buildOpportunityPricingWorkbook(
    parseWorkbookMutationRpcPayload(data as Json | null, "Workbook creation response was empty."),
  );
}

export async function saveOpportunityPricingWorkbookActiveSheet(
  params: SaveWorkbookSheetParams,
) {
  const normalizedOwner = normalizePricingWorkbookOwnerScope({
    opportunityId: params.opportunityId,
    projectId: params.projectId,
    projectOwned: params.projectOwned,
    quoteId: params.quoteId,
    variationId: params.variationId,
  });

  const sheetName = normalizeWorksheetName(params.name, params.worksheet.sheetName);
  const syncedWorksheet = {
    ...params.worksheet,
    sheetName,
  };
  const normalizedPricingSummary = normalizePricingSummary(params.pricingSummary as unknown as Json);
  let persistedQuoteId = normalizedOwner.quoteId;
  if (normalizedOwner.kind === "project" && params.workbookId) {
    const { data: ownedWorkbook, error: ownerError } = await params.supabase
      .from("opportunity_pricing_worksheets")
      .select("quote_id")
      .eq("organization_id", params.organizationId)
      .eq("opportunity_id", normalizedOwner.opportunityId)
      .eq("project_id", normalizedOwner.projectId)
      .eq("id", params.workbookId)
      .is("variation_id", null)
      .or("quote_id.is.null,clone_kind.eq.project_working")
      .single();

    if (ownerError) {
      throw new Error(ownerError.message);
    }
    persistedQuoteId = ownedWorkbook.quote_id ?? null;
  }
  const { data, error } = await params.supabase.rpc("save_pricing_workbook_active_sheet" as never, {
    p_organization_id: params.organizationId,
    p_opportunity_id: normalizedOwner.opportunityId,
    p_project_id: normalizedOwner.projectId,
    p_quote_id: persistedQuoteId,
    p_user_id: params.userId,
    p_variation_id: normalizedOwner.variationId,
    p_workbook_id: params.workbookId ?? null,
    p_sheet_id: isLegacyDefaultSheetId(params.sheetId) ? null : params.sheetId ?? null,
    p_name: sheetName,
    p_trade_package: params.tradePackage,
    p_worksheet_data: syncedWorksheet as unknown as Json,
    p_pricing_summary: normalizedPricingSummary as unknown as Json,
    p_extracted_pricing_data: params.extractedPricingData as unknown as Json,
    p_version: syncedWorksheet.version,
    p_save_request_id: params.saveRequestId ?? null,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return buildOpportunityPricingWorkbook(
    parseWorkbookMutationRpcPayload(data as Json | null, "Workbook save response was empty."),
  );
}

export async function renameOpportunityPricingWorkbook(params: {
  supabase: any;
  organizationId: string;
  opportunityId: string;
  projectId?: string | null;
  workbookId: string;
  nextName: string;
  userId: string;
}) {
  const { data, error } = params.projectId
    ? await params.supabase.rpc("rename_pricing_workbook_v1" as never, {
        p_organization_id: params.organizationId,
        p_opportunity_id: params.opportunityId,
        p_project_id: params.projectId,
        p_workbook_id: params.workbookId,
        p_user_id: params.userId,
        p_next_name: params.nextName,
      } as never)
    : await params.supabase.rpc("rename_opportunity_pricing_workbook" as never, {
        p_organization_id: params.organizationId,
        p_opportunity_id: params.opportunityId,
        p_workbook_id: params.workbookId,
        p_user_id: params.userId,
        p_next_name: params.nextName,
      } as never);

  if (error) {
    throw new Error(error.message);
  }

  return buildOpportunityPricingWorkbook(
    parseWorkbookMutationRpcPayload(data as Json | null, "Workbook rename response was empty."),
  );
}

export async function duplicateOpportunityPricingWorkbook(params: {
  supabase: any;
  organizationId: string;
  opportunityId: string;
  projectId?: string | null;
  workbookId: string;
  userId: string;
}) {
  const { data, error } = params.projectId
    ? await params.supabase.rpc("duplicate_pricing_workbook_v1" as never, {
        p_organization_id: params.organizationId,
        p_opportunity_id: params.opportunityId,
        p_project_id: params.projectId,
        p_workbook_id: params.workbookId,
        p_user_id: params.userId,
      } as never)
    : await params.supabase.rpc("duplicate_opportunity_pricing_workbook" as never, {
        p_organization_id: params.organizationId,
        p_opportunity_id: params.opportunityId,
        p_workbook_id: params.workbookId,
        p_user_id: params.userId,
      } as never);

  if (error) {
    throw new Error(error.message);
  }

  return buildOpportunityPricingWorkbook(
    parseWorkbookMutationRpcPayload(data as Json | null, "Workbook duplicate response was empty."),
  );
}

export async function createOpportunityPricingWorkbookSheet(params: {
  supabase: any;
  organizationId: string;
  opportunityId: string | null;
  projectId?: string | null;
  projectOwned?: boolean;
  quoteId?: string | null;
  variationId?: string | null;
  workbookId: string;
  userId: string;
  worksheet: WorksheetData;
  pricingSummary: WorksheetPricingSummary;
  extractedPricingData: WorksheetExtractedPricingData;
  name?: string | null;
}) {
  const normalizedOwner = normalizePricingWorkbookOwnerScope({
    opportunityId: params.opportunityId,
    projectId: params.projectId,
    projectOwned: params.projectOwned,
    quoteId: params.quoteId,
    variationId: params.variationId,
  });

  const sheetName = normalizeWorksheetName(params.name, params.worksheet.sheetName);
  const syncedWorksheet = {
    ...params.worksheet,
    sheetName,
  };
  const { data: existingSheets, error: existingSheetsError } = await params.supabase
    .from("opportunity_pricing_workbook_sheets")
    .select("sheet_order")
    .eq("organization_id", params.organizationId)
    .eq("opportunity_id", normalizedOwner.opportunityId)
    .eq("workbook_id", params.workbookId)
    .order("sheet_order", { ascending: false })
    .limit(1);

  if (existingSheetsError) {
    throw new Error(existingSheetsError.message);
  }

  const nextSheetOrder = typeof existingSheets?.[0]?.sheet_order === "number" ? existingSheets[0].sheet_order + 1 : 0;
  const normalizedPricingSummary = normalizePricingSummary(params.pricingSummary as unknown as Json);
  const { data, error } = await params.supabase
    .from("opportunity_pricing_workbook_sheets")
    .insert({
      workbook_id: params.workbookId,
      organization_id: params.organizationId,
      opportunity_id: normalizedOwner.opportunityId,
      name: sheetName,
      sheet_order: nextSheetOrder,
      is_default: false,
      worksheet_data: syncedWorksheet as unknown as Json,
      pricing_summary: normalizedPricingSummary as unknown as Json,
      extracted_pricing_data: params.extractedPricingData as unknown as Json,
      version: syncedWorksheet.version,
      created_by: params.userId,
      updated_by: params.userId,
    })
    .select(
      "id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeWorkbookSheetRow(data as PricingWorkbookSheetRow);
}

export async function renameOpportunityPricingWorkbookSheet(params: {
  supabase: any;
  organizationId: string;
  opportunityId: string | null;
  projectId?: string | null;
  projectOwned?: boolean;
  quoteId?: string | null;
  variationId?: string | null;
  workbookId: string;
  sheetId: string;
  nextName: string;
  tradePackage?: string | null;
  userId: string;
}) {
  const normalizedOwner = normalizePricingWorkbookOwnerScope({
    opportunityId: params.opportunityId,
    projectId: params.projectId,
    projectOwned: params.projectOwned,
    quoteId: params.quoteId,
    variationId: params.variationId,
  });

  const { data, error } = await params.supabase
    .from("opportunity_pricing_workbook_sheets")
    .select(
      "id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by, created_at, updated_at",
    )
    .eq("organization_id", params.organizationId)
    .eq("opportunity_id", normalizedOwner.opportunityId)
    .eq("workbook_id", params.workbookId)
    .eq("id", params.sheetId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const currentSheet = normalizeWorkbookSheetRow(data as PricingWorkbookSheetRow);
  const nextName = normalizeWorksheetName(params.nextName, currentSheet.name);

  if (currentSheet.isDefault) {
    const workbook = await saveOpportunityPricingWorkbookActiveSheet({
      supabase: params.supabase,
      organizationId: params.organizationId,
      opportunityId: normalizedOwner.opportunityId,
      projectId: normalizedOwner.projectId,
      projectOwned: normalizedOwner.kind === "project",
      quoteId: normalizedOwner.quoteId,
      variationId: normalizedOwner.variationId,
      workbookId: params.workbookId,
      sheetId: params.sheetId,
      name: nextName,
      tradePackage: params.tradePackage ?? null,
      worksheet: {
        ...currentSheet.worksheet,
        sheetName: nextName,
      },
      pricingSummary: currentSheet.pricingSummary,
      extractedPricingData: currentSheet.extractedPricingData,
      userId: params.userId,
    });

    return buildOpportunityPricingWorkbookEditorRecord(workbook, params.sheetId);
  }

  const { data: updatedData, error: updateError } = await params.supabase
    .from("opportunity_pricing_workbook_sheets")
    .update({
      name: nextName,
      worksheet_data: {
        ...(currentSheet.worksheet as unknown as Record<string, Json | undefined>),
        sheetName: nextName,
      } as Json,
      updated_by: params.userId,
    })
    .eq("organization_id", params.organizationId)
    .eq("opportunity_id", normalizedOwner.opportunityId)
    .eq("workbook_id", params.workbookId)
    .eq("id", params.sheetId)
    .select(
      "id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by, created_at, updated_at",
    )
    .single();

  if (updateError) {
    throw new Error(updateError.message);
  }

  return normalizeWorkbookSheetRow(updatedData as PricingWorkbookSheetRow);
}

export async function deleteOpportunityPricingWorkbookSheet(params: {
  supabase: any;
  organizationId: string;
  opportunityId: string | null;
  projectId?: string | null;
  projectOwned?: boolean;
  quoteId?: string | null;
  variationId?: string | null;
  workbookId: string;
  sheetId: string;
  userId: string;
  nextSheetId?: string | null;
}) {
  const normalizedOwner = normalizePricingWorkbookOwnerScope({
    opportunityId: params.opportunityId,
    projectId: params.projectId,
    projectOwned: params.projectOwned,
    quoteId: params.quoteId,
    variationId: params.variationId,
  });

  const nextSheetId =
    typeof params.nextSheetId === "string" && params.nextSheetId.trim().length > 0
      ? params.nextSheetId
      : null;
  const { data, error } = await params.supabase.rpc("delete_opportunity_pricing_workbook_sheet" as never, {
    p_organization_id: params.organizationId,
    p_opportunity_id: normalizedOwner.opportunityId,
    p_workbook_id: params.workbookId,
    p_sheet_id: params.sheetId,
    p_user_id: params.userId,
    p_next_sheet_id: nextSheetId,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  if (!isJsonRecord(data as Json | null)) {
    throw new Error("Worksheet page delete response was empty.");
  }

  const response = data as unknown as {
    deletedSheetId?: string;
    nextSheetId?: string | null;
  };

  return {
    deletedSheetId: typeof response.deletedSheetId === "string" ? response.deletedSheetId : params.sheetId,
    nextSheetId: typeof response.nextSheetId === "string" ? response.nextSheetId : null,
  } satisfies OpportunityPricingWorkbookDeleteSheetResult;
}
