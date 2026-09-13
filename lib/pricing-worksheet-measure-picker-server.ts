import "server-only";

import {
  normalizePricingWorksheetMeasureSearch,
  PRICING_WORKSHEET_MEASURE_PICKER_PAGE_SIZE,
  type PricingWorksheetMeasurePage,
  type PricingWorksheetMeasureSource,
} from "@/lib/pricing-worksheet-measure-picker";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTakeoffProjectAuthorityWithClient } from "@/lib/takeoff-owner-server";

type MeasurePickerClient = SupabaseClient<Database>;

type MeasurementRow = {
  id: string;
  version: number;
  measurement_kind: "line" | "area" | "count";
  color_hex: string | null;
  name: string;
  description: string;
  display_value: number | null;
  display_unit: string | null;
  count_value: number | null;
  updated_at: string;
  project_drawing_sets: { id: string; file_name: string; display_name: string | null } | Array<{ id: string; file_name: string; display_name: string | null }> | null;
  takeoff_pages: { id: string; page_number: number; page_label: string | null } | Array<{ id: string; page_number: number; page_label: string | null }> | null;
  takeoff_measurement_groups: { id: string; name: string; code: string | null } | Array<{ id: string; name: string; code: string | null }> | null;
};

function fail(code: string): never {
  throw new Error(`pricing_measure_picker:${code}`);
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function safeSearch(value: string) {
  return normalizePricingWorksheetMeasureSearch(value.replace(/[,%_()]/g, " "));
}

async function resolveMeasureProject(params: {
  supabase: MeasurePickerClient;
  organizationId: string;
  workbookId: string;
}): Promise<{ projectId: string; opportunityId: string } | null> {
  const workbookResult = await params.supabase
    .from("opportunity_pricing_worksheets")
    .select("id, organization_id, opportunity_id, project_id, quote_id, variation_id, archived_at")
    .eq("organization_id", params.organizationId)
    .eq("id", params.workbookId)
    .is("archived_at", null)
    .maybeSingle();
  if (workbookResult.error) fail("invalid_workbook_scope");
  const workbook = workbookResult.data;
  if (!workbook) fail("invalid_workbook_scope");

  const workbookProjectId = typeof workbook.project_id === "string" ? workbook.project_id : null;
  let projectId = workbookProjectId;
  if (!projectId) {
    const opportunityResult = await params.supabase
      .from("organization_opportunities")
      .select("id, organization_id, workspace_project_id")
      .eq("organization_id", params.organizationId)
      .eq("id", workbook.opportunity_id)
      .maybeSingle();
    if (opportunityResult.error || !opportunityResult.data) fail("invalid_opportunity_scope");
    projectId = opportunityResult.data.workspace_project_id;
    if (!projectId) return null;
  }

  const projectResult = await params.supabase
    .from("organization_projects")
    .select("id, organization_id, source_opportunity_id")
    .eq("organization_id", params.organizationId)
    .eq("id", projectId)
    .maybeSingle();
  if (projectResult.error || !projectResult.data) fail("invalid_project_scope");
  if (workbookProjectId && projectResult.data.source_opportunity_id) {
    const authority = await resolveTakeoffProjectAuthorityWithClient({
      supabase: params.supabase,
      organizationId: params.organizationId,
      projectId: workbookProjectId,
      sourceOpportunityId: projectResult.data.source_opportunity_id,
    });
    projectId = authority.dataProjectId;
  }
  return { projectId, opportunityId: workbook.opportunity_id };
}

async function searchContextIds(params: {
  supabase: MeasurePickerClient;
  organizationId: string;
  projectId: string;
  search: string;
}) {
  if (!params.search) return { drawingSetIds: [], pageIds: [], groupIds: [] };
  const pattern = `%${params.search}%`;
  const [drawings, pages, groups] = await Promise.all([
    params.supabase.from("project_drawing_sets").select("id").eq("organization_id", params.organizationId).eq("project_id", params.projectId).eq("source_type", "source").is("archived_at", null).or(`file_name.ilike.${pattern},display_name.ilike.${pattern}`).limit(100),
    params.supabase.from("takeoff_pages").select("id").eq("organization_id", params.organizationId).eq("project_id", params.projectId).ilike("page_label", pattern).limit(100),
    params.supabase.from("takeoff_measurement_groups").select("id").eq("organization_id", params.organizationId).eq("project_id", params.projectId).eq("status", "active").or(`name.ilike.${pattern},code.ilike.${pattern}`).limit(100),
  ]);
  if (drawings.error || pages.error || groups.error) fail("query_failed");
  return {
    drawingSetIds: (drawings.data ?? []).map((row) => row.id),
    pageIds: (pages.data ?? []).map((row) => row.id),
    groupIds: (groups.data ?? []).map((row) => row.id),
  };
}

function buildSearchFilter(search: string, ids: Awaited<ReturnType<typeof searchContextIds>>) {
  if (!search) return null;
  const filters = [`name.ilike.%${search}%`, `description.ilike.%${search}%`];
  if (ids.drawingSetIds.length) filters.push(`drawing_set_id.in.(${ids.drawingSetIds.join(",")})`);
  if (ids.pageIds.length) filters.push(`page_id.in.(${ids.pageIds.join(",")})`);
  if (ids.groupIds.length) filters.push(`group_id.in.(${ids.groupIds.join(",")})`);
  return filters.join(",");
}

function mapMeasurement(row: MeasurementRow, projectId: string): PricingWorksheetMeasureSource | null {
  const drawingSet = relation(row.project_drawing_sets);
  const page = relation(row.takeoff_pages);
  const group = relation(row.takeoff_measurement_groups);
  const quantity = row.measurement_kind === "count"
    ? row.count_value ?? row.display_value
    : row.display_value;
  const unit = row.measurement_kind === "count" ? "count" : row.display_unit?.trim();
  if (!drawingSet || !page || typeof quantity !== "number" || !Number.isFinite(quantity) || !unit) return null;
  return {
    measurementId: row.id,
    measurementVersion: row.version,
    projectId,
    drawingSetId: drawingSet.id,
    drawingSetName: drawingSet.display_name?.trim() || drawingSet.file_name,
    pageId: page.id,
    pageNumber: page.page_number,
    pageLabel: page.page_label,
    groupId: group?.id ?? null,
    groupName: group?.name ?? null,
    groupCode: group?.code ?? null,
    kind: row.measurement_kind,
    colorHex: row.color_hex?.trim() || null,
    name: row.name?.trim() || (row.measurement_kind === "area" ? "Area" : row.measurement_kind === "count" ? "Count" : "Linear"),
    description: row.description?.trim() || null,
    quantity,
    unit,
    updatedAt: row.updated_at,
  };
}

export async function searchPricingWorksheetMeasures(params: {
  supabase: unknown;
  organizationId: string;
  workbookId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<PricingWorksheetMeasurePage> {
  const supabase = params.supabase as MeasurePickerClient;
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(params.pageSize ?? PRICING_WORKSHEET_MEASURE_PICKER_PAGE_SIZE)));
  const scope = await resolveMeasureProject({ supabase, organizationId: params.organizationId, workbookId: params.workbookId });
  if (!scope) return { items: [], page, pageSize, total: 0, hasMore: false, workspaceStatus: "no_workspace" };

  const drawingCountResult = await supabase
    .from("project_drawing_sets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", params.organizationId)
    .eq("project_id", scope.projectId)
    .eq("source_type", "source")
    .is("archived_at", null);
  if (drawingCountResult.error) fail("query_failed");
  if ((drawingCountResult.count ?? 0) === 0) {
    return { items: [], page, pageSize, total: 0, hasMore: false, workspaceStatus: "no_drawings" };
  }

  const search = safeSearch(params.search ?? "");
  const contextIds = await searchContextIds({ supabase, organizationId: params.organizationId, projectId: scope.projectId, search });
  let query = supabase
    .from("takeoff_measurements")
    .select(
      "id, version, measurement_kind, color_hex, name, description, display_value, display_unit, count_value, updated_at, drawing_set_id, page_id, group_id, project_drawing_sets!takeoff_measurements_drawing_set_id_fkey!inner(id,file_name,display_name), takeoff_pages!takeoff_measurements_page_id_fkey(id,page_number,page_label), takeoff_measurement_groups!takeoff_measurements_group_id_fkey(id,name,code)",
      { count: "exact" },
    )
    .eq("organization_id", params.organizationId)
    .eq("project_id", scope.projectId)
    .eq("status", "active")
    .eq("project_drawing_sets.source_type", "source")
    .is("project_drawing_sets.archived_at", null);
  const searchFilter = buildSearchFilter(search, contextIds);
  if (searchFilter) query = query.or(searchFilter);
  const offset = (page - 1) * pageSize;
  const result = await query
    .order("drawing_set_id", { ascending: true })
    .order("page_id", { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + pageSize - 1);
  if (result.error) fail("query_failed");
  const rows = (result.data ?? []) as unknown as MeasurementRow[];
  const items = rows.map((row) => mapMeasurement(row, scope.projectId)).filter(Boolean) as PricingWorksheetMeasureSource[];
  const total = result.count ?? 0;
  return { items, page, pageSize, total, hasMore: offset + pageSize < total, workspaceStatus: "ready" };
}
