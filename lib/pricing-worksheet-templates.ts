import type { Json, Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOpportunityPricingWorkbook,
  type OpportunityPricingWorkbook,
} from "@/lib/opportunity-pricing-workbook";
import type {
  WorksheetExtractedPricingData,
  WorksheetPricingSummary,
  WorksheetData,
} from "@/lib/opportunity-pricing-worksheet-defaults";

type TemplatesClient = SupabaseClient<Database>;

export type PricingWorksheetTemplateInput = {
  sheetOrder: number;
  cellKey: string;
  label?: string | null;
  clearOnCreate?: boolean;
  defaultValue?: string | number | null;
};

export type PricingWorksheetTemplate = {
  id: string;
  organizationId: string;
  name: string;
  category: string | null;
  description: string | null;
  status: "active" | "archived";
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type PricingWorksheetTemplateVersion = {
  id: string;
  templateId: string;
  versionNumber: number;
  sourceWorkbookId: string | null;
  sourceWorkbookVersion: number | null;
  metadataSnapshot: Record<string, Json | undefined>;
  inputManifest: PricingWorksheetTemplateInput[];
  createdAt: string;
  sheets: PricingWorksheetTemplateSheet[];
};

export type PricingWorksheetTemplateSheet = {
  id: string;
  name: string;
  sheetOrder: number;
  isDefault: boolean;
  worksheetData: WorksheetData;
  pricingSummary: WorksheetPricingSummary;
  extractedPricingData: WorksheetExtractedPricingData;
  version: number;
};

type TemplateRow = {
  id: string;
  organization_id: string;
  name: string;
  category: string | null;
  description: string | null;
  status: "active" | "archived";
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type TemplateVersionRow = {
  id: string;
  organization_id: string;
  template_id: string;
  version_number: number;
  source_workbook_id: string | null;
  source_workbook_version: number | null;
  metadata_snapshot: Json;
  input_manifest: Json;
  created_at: string;
};

type TemplateSheetRow = {
  id: string;
  organization_id: string;
  template_version_id: string;
  name: string;
  sheet_order: number;
  is_default: boolean;
  worksheet_data: Json;
  pricing_summary: Json;
  extracted_pricing_data: Json;
  version: number;
  created_at: string;
};

function record(value: Json | null | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function parseManifest(value: Json): PricingWorksheetTemplateInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, Json | undefined>;
    const sheetOrder = item.sheetOrder;
    const cellKey = item.cellKey;
    if (typeof sheetOrder !== "number" || !Number.isInteger(sheetOrder) || typeof cellKey !== "string") return [];
    const defaultValue = item.defaultValue;
    return [{
      sheetOrder,
      cellKey,
      label: typeof item.label === "string" ? item.label : null,
      clearOnCreate: item.clearOnCreate !== false,
      defaultValue:
        defaultValue === null || typeof defaultValue === "string" || typeof defaultValue === "number"
          ? defaultValue
          : null,
    }];
  });
}

function mapTemplate(row: TemplateRow): PricingWorksheetTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    category: row.category,
    description: row.description,
    status: row.status,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function mapVersion(row: TemplateVersionRow, sheets: TemplateSheetRow[]): PricingWorksheetTemplateVersion {
  return {
    id: row.id,
    templateId: row.template_id,
    versionNumber: row.version_number,
    sourceWorkbookId: row.source_workbook_id,
    sourceWorkbookVersion: row.source_workbook_version,
    metadataSnapshot: record(row.metadata_snapshot),
    inputManifest: parseManifest(row.input_manifest),
    createdAt: row.created_at,
    sheets: sheets
      .sort((left, right) => left.sheet_order - right.sheet_order || left.created_at.localeCompare(right.created_at))
      .map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        sheetOrder: sheet.sheet_order,
        isDefault: sheet.is_default,
        worksheetData: sheet.worksheet_data as unknown as WorksheetData,
        pricingSummary: sheet.pricing_summary as unknown as WorksheetPricingSummary,
        extractedPricingData: sheet.extracted_pricing_data as unknown as WorksheetExtractedPricingData,
        version: sheet.version,
      })),
  };
}

function parseWorkbookPayload(payload: Json | null): OpportunityPricingWorkbook {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Template workbook response was empty.");
  }
  const value = payload as Record<string, Json | undefined>;
  const workbook = value.workbook;
  if (!workbook || typeof workbook !== "object" || Array.isArray(workbook)) {
    throw new Error("Template workbook response was invalid.");
  }
  const sheets = Array.isArray(value.sheets) ? value.sheets : [];
  return buildOpportunityPricingWorkbook({
    workbook: workbook as never,
    sheets: sheets as never,
  });
}

function parseTemplatePayload(payload: Json | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Template response was empty.");
  }
  const value = payload as Record<string, Json | undefined>;
  if (!value.template || !value.version || !Array.isArray(value.sheets)) {
    throw new Error("Template response was invalid.");
  }
  return {
    template: mapTemplate(value.template as unknown as TemplateRow),
    version: mapVersion(
      value.version as unknown as TemplateVersionRow,
      value.sheets as unknown as TemplateSheetRow[],
    ),
  };
}

export async function listPricingWorksheetTemplates(params: {
  supabase: TemplatesClient;
  organizationId: string;
  includeArchived?: boolean;
}) {
  let query = params.supabase
    .from("pricing_worksheet_templates" as never)
    .select("id, organization_id, name, category, description, status, current_version_id, created_at, updated_at, archived_at")
    .eq("organization_id", params.organizationId);
  if (!params.includeArchived) query = query.eq("status", "active").is("archived_at", null);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as TemplateRow[] | null | undefined ?? []).map(mapTemplate);
}

export async function loadPricingWorksheetTemplateVersion(params: {
  supabase: TemplatesClient;
  organizationId: string;
  templateId: string;
  versionId?: string | null;
}) {
  // The template tables are introduced by a forward migration; generated
  // Supabase types intentionally lag until the next type regeneration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templateQuery: any = await params.supabase
    .from("pricing_worksheet_templates" as never)
    .select("id, organization_id, name, category, description, status, current_version_id, created_at, updated_at, archived_at")
    .eq("organization_id", params.organizationId)
    .eq("id", params.templateId)
    .single();
  if (templateQuery.error || !templateQuery.data) throw new Error(templateQuery.error?.message ?? "Template not found.");
  const template = mapTemplate(templateQuery.data as unknown as TemplateRow);
  const versionId = params.versionId ?? template.currentVersionId;
  if (!versionId) throw new Error("Template has no current version.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versionQuery: any = await params.supabase
    .from("pricing_worksheet_template_versions" as never)
    .select("id, organization_id, template_id, version_number, source_workbook_id, source_workbook_version, metadata_snapshot, input_manifest, created_at")
    .eq("organization_id", params.organizationId)
    .eq("template_id", params.templateId)
    .eq("id", versionId)
    .single();
  if (versionQuery.error || !versionQuery.data) throw new Error(versionQuery.error?.message ?? "Template version not found.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sheetsQuery: any = await params.supabase
    .from("pricing_worksheet_template_version_sheets" as never)
    .select("id, organization_id, template_version_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version, created_at")
    .eq("organization_id", params.organizationId)
    .eq("template_version_id", versionId)
    .order("sheet_order", { ascending: true });
  if (sheetsQuery.error) throw new Error(sheetsQuery.error.message);
  return {
    template,
    version: mapVersion(versionQuery.data as unknown as TemplateVersionRow, (sheetsQuery.data ?? []) as unknown as TemplateSheetRow[]),
  };
}

export async function savePricingWorksheetAsTemplate(params: {
  supabase: TemplatesClient;
  organizationId: string;
  workbookId: string;
  userId: string;
  name: string;
  category?: string | null;
  description?: string | null;
  inputManifest?: PricingWorksheetTemplateInput[];
  requestId: string;
}) {
  const { data, error } = await params.supabase.rpc("save_pricing_worksheet_template_v1" as never, {
    p_organization_id: params.organizationId,
    p_source_workbook_id: params.workbookId,
    p_user_id: params.userId,
    p_name: params.name,
    p_category: params.category ?? null,
    p_description: params.description ?? null,
    p_input_manifest: (params.inputManifest ?? []) as unknown as Json,
    p_request_id: params.requestId,
  } as never);
  if (error) throw new Error(error.message);
  return parseTemplatePayload(data as Json);
}

export async function createBlankPricingWorksheetTemplate(params: {
  supabase: TemplatesClient;
  organizationId: string;
  userId: string;
  name: string;
  category?: string | null;
  description?: string | null;
  sheets: Array<{
    name: string;
    sheetOrder: number;
    isDefault: boolean;
    worksheetData: WorksheetData;
    pricingSummary: WorksheetPricingSummary;
    extractedPricingData: WorksheetExtractedPricingData;
    version: number;
  }>;
  inputManifest?: PricingWorksheetTemplateInput[];
  requestId: string;
}) {
  const { data, error } = await params.supabase.rpc("create_pricing_worksheet_template_v1" as never, {
    p_organization_id: params.organizationId,
    p_user_id: params.userId,
    p_name: params.name,
    p_category: params.category ?? null,
    p_description: params.description ?? null,
    p_sheets: params.sheets as unknown as Json,
    p_input_manifest: (params.inputManifest ?? []) as unknown as Json,
    p_request_id: params.requestId,
  } as never);
  if (error) throw new Error(error.message);
  return parseTemplatePayload(data as Json);
}

export async function createPricingWorksheetFromTemplate(params: {
  supabase: TemplatesClient;
  organizationId: string;
  templateVersionId: string;
  opportunityId: string;
  projectId?: string | null;
  quoteId?: string | null;
  variationId?: string | null;
  userId: string;
  name?: string | null;
  tradePackage?: string | null;
  requestId: string;
}) {
  const { data, error } = await params.supabase.rpc("create_pricing_worksheet_from_template_v1" as never, {
    p_organization_id: params.organizationId,
    p_template_version_id: params.templateVersionId,
    p_opportunity_id: params.opportunityId,
    p_project_id: params.projectId ?? null,
    p_quote_id: params.quoteId ?? null,
    p_variation_id: params.variationId ?? null,
    p_user_id: params.userId,
    p_name: params.name ?? null,
    p_trade_package: params.tradePackage ?? null,
    p_request_id: params.requestId,
  } as never);
  if (error) throw new Error(error.message);
  return parseWorkbookPayload(data as Json);
}

export async function archivePricingWorksheetTemplate(params: {
  supabase: TemplatesClient;
  organizationId: string;
  templateId: string;
  userId: string;
}) {
  const { data, error } = await params.supabase.rpc("archive_pricing_worksheet_template_v1" as never, {
    p_organization_id: params.organizationId,
    p_template_id: params.templateId,
    p_user_id: params.userId,
  } as never);
  if (error) throw new Error(error.message);
  return mapTemplate(data as unknown as TemplateRow);
}

export async function updatePricingWorksheetTemplateMetadata(params: {
  supabase: TemplatesClient;
  organizationId: string;
  templateId: string;
  userId: string;
  name: string;
  category?: string | null;
  description?: string | null;
}) {
  const { data, error } = await params.supabase.rpc("update_pricing_worksheet_template_metadata_v1" as never, {
    p_organization_id: params.organizationId,
    p_template_id: params.templateId,
    p_user_id: params.userId,
    p_name: params.name,
    p_category: params.category ?? null,
    p_description: params.description ?? null,
  } as never);
  if (error) throw error;
  return mapTemplate(data as unknown as TemplateRow);
}

export async function duplicatePricingWorksheetTemplate(params: {
  supabase: TemplatesClient;
  organizationId: string;
  templateId: string;
  userId: string;
  name?: string | null;
  requestId: string;
}) {
  const { data, error } = await params.supabase.rpc("duplicate_pricing_worksheet_template_v1" as never, {
    p_organization_id: params.organizationId,
    p_template_id: params.templateId,
    p_user_id: params.userId,
    p_name: params.name ?? null,
    p_request_id: params.requestId,
  } as never);
  if (error) throw error;
  return parseTemplatePayload(data as Json);
}

export async function createPricingWorksheetTemplateVersion(params: {
  supabase: TemplatesClient;
  organizationId: string;
  templateId: string;
  sourceWorkbookId: string;
  userId: string;
  inputManifest?: PricingWorksheetTemplateInput[];
  requestId: string;
}) {
  const { data, error } = await params.supabase.rpc("create_pricing_worksheet_template_version_v1" as never, {
    p_organization_id: params.organizationId,
    p_template_id: params.templateId,
    p_source_workbook_id: params.sourceWorkbookId,
    p_user_id: params.userId,
    p_input_manifest: (params.inputManifest ?? []) as unknown as Json,
    p_request_id: params.requestId,
  } as never);
  if (error) throw error;
  return parseTemplatePayload(data as Json);
}

export async function savePricingWorksheetTemplateVersion(params: {
  supabase: TemplatesClient;
  organizationId: string;
  templateId: string;
  expectedVersionId: string;
  userId: string;
  sheets: Array<{
    name: string;
    sheetOrder: number;
    isDefault: boolean;
    worksheetData: WorksheetData;
    pricingSummary: WorksheetPricingSummary;
    extractedPricingData: WorksheetExtractedPricingData;
    version: number;
  }>;
  inputManifest?: PricingWorksheetTemplateInput[];
  requestId: string;
}) {
  const { data, error } = await params.supabase.rpc("save_pricing_worksheet_template_version_v1" as never, {
    p_organization_id: params.organizationId,
    p_template_id: params.templateId,
    p_expected_version_id: params.expectedVersionId,
    p_user_id: params.userId,
    p_sheets: params.sheets as unknown as Json,
    p_input_manifest: (params.inputManifest ?? []) as unknown as Json,
    p_request_id: params.requestId,
  } as never);
  if (error) throw new Error(error.message);
  return parseTemplatePayload(data as Json);
}
