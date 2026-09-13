import "server-only";

import { createHash } from "node:crypto";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { toProjectSlug, resolveUniqueProjectSlug } from "@/lib/projects";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  capturePromotionShadowBestEffort,
  finalizePromotionShadowBestEffort,
} from "@/lib/opportunity-promotion-shadow-server";
import type { Database } from "@/lib/supabase/types";
import { PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import { toTradePackPdfUrl } from "@/lib/trade-packs";

type OpportunityRow = Database["public"]["Tables"]["organization_opportunities"]["Row"];
type ClientRow = Pick<Database["public"]["Tables"]["organization_clients"]["Row"], "id" | "name" | "company_name">;
type MemberRow = Pick<Database["public"]["Tables"]["organization_members"]["Row"], "user_id" | "display_name">;
type ProjectQuoteRow = Database["public"]["Tables"]["project_quotes"]["Row"];
type TradePackPageIndexJson = Database["public"]["Tables"]["trade_packs"]["Row"]["page_index_json"];
type ScopeRunResultJson = Database["public"]["Tables"]["scope_runs"]["Row"]["result_json"];
type OpportunityStage = OpportunityRow["stage"];
type QuoteStatus = ProjectQuoteRow["status"];

export type OpportunityGroup = "pipeline" | "priced" | "won";

export interface LiveOpportunityRow {
  quoteSeriesId: string | null;
  quoteRevisionId: string | null;
  quoteNumber: string | null;
  revisionNumber: number | null;
  opportunityId: string;
  slug: string;
  name: string;
  location: string;
  stage: OpportunityStage;
  clientWinRatePct: number;
  clientId: string | null;
  clientName: string;
  ownerName: string;
  dueDateIso: string | null;
  quotedDateIso: string | null;
  hasQuote: boolean;
  latestQuoteStatus: QuoteStatus | null;
  latestQuoteUpdatedIso: string | null;
  valueNZD: number;
  workspaceProjectId: string | null;
  workspaceProjectSlug: string | null;
  convertedProjectId: string | null;
  group: OpportunityGroup;
}

export interface CreateOpportunityInput {
  name: string;
  location?: string;
  clientId?: string | null;
  dueDateIso?: string | null;
  estimatedValue?: number;
}

export interface OpportunityConversionResult {
  projectId: string;
  projectSlug: string;
  projectCreated: boolean;
  legacyTenderDataMigrationStatus: "complete" | "retry_required";
}

export class OpportunityConversionFailure extends Error {
  readonly databaseCode: string | null;
  readonly details: string | null;
  readonly hint: string | null;
  readonly operation: string;
  readonly opportunityId: string | null;
  readonly acceptedQuoteId: string;
  readonly organizationId: string;

  constructor(params: {
    message: string;
    databaseCode?: string | null;
    details?: string | null;
    hint?: string | null;
    operation: string;
    opportunityId?: string | null;
    acceptedQuoteId: string;
    organizationId: string;
  }) {
    super(params.message);
    this.name = "OpportunityConversionFailure";
    this.databaseCode = params.databaseCode ?? null;
    this.details = params.details ?? null;
    this.hint = params.hint ?? null;
    this.operation = params.operation;
    this.opportunityId = params.opportunityId ?? null;
    this.acceptedQuoteId = params.acceptedQuoteId;
    this.organizationId = params.organizationId;
  }
}

interface OpportunityWorkspaceProjectRow {
  id: string;
  slug: string;
  source_opportunity_id: string | null;
}

interface OpportunityWorkspaceSeed {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  client_id: string | null;
  created_by: string | null;
  owner_user_id: string | null;
  workspace_project_id: string | null;
}

function deterministicCloneId(sourceId: string, targetProjectId: string): string {
  const hex = createHash("sha256")
    .update(`workspace-clone:${sourceId}:${targetProjectId}`)
    .digest("hex")
    .slice(0, 32);
  const chars = hex.split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
}

function isExistingStorageObjectError(message: string | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("already exists")
    || normalized.includes("duplicate")
    || normalized.includes("resource exists")
  );
}

async function cloneLegacyTenderDataToProject(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  organizationId: string;
  sourceProjectId: string;
  targetProjectId: string;
  actingUserId: string;
}) {
  const { supabase, organizationId, sourceProjectId, targetProjectId, actingUserId } = params;

  const [drawingSetsResult, tradePacksResult, scopeRunsResult] = await Promise.all([
    supabase
      .from("project_drawing_sets")
      .select("id, uploaded_by, file_name, storage_path, file_size_bytes, mime_type, uploaded_at")
      .eq("organization_id", organizationId)
      .eq("project_id", sourceProjectId),
    supabase
      .from("trade_packs")
      .select("id, trade_id, trade_label, page_index_json, created_by, created_at")
      .eq("organization_id", organizationId)
      .eq("project_id", sourceProjectId),
    supabase
      .from("scope_runs")
      .select("id, trade_pack_id, status, result_json, error_message, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("project_id", sourceProjectId),
  ]);

  if (drawingSetsResult.error) {
    throw new Error(drawingSetsResult.error.message);
  }
  if (tradePacksResult.error) {
    throw new Error(tradePacksResult.error.message);
  }
  if (scopeRunsResult.error) {
    throw new Error(scopeRunsResult.error.message);
  }

  const drawingSets = drawingSetsResult.data ?? [];
  const tradePacks = tradePacksResult.data ?? [];
  const scopeRuns = scopeRunsResult.data ?? [];

  const drawingSetIdMap = new Map<string, string>();
  const targetPathByNewDrawingSetId = new Map<string, string>();
  const drawingSetRowsForClone: Array<{
    id: string;
    organization_id: string;
    project_id: string;
    uploaded_by: string;
    file_name: string;
    storage_path: string;
    file_size_bytes: number;
    mime_type: string | null;
    uploaded_at: string;
  }> = [];

  for (const row of drawingSets) {
    const pathParts = (row.storage_path ?? "").split("/");
    const objectName = pathParts.length >= 3 ? pathParts.slice(2).join("/") : `${crypto.randomUUID()}-drawing-set.pdf`;
    const targetStoragePath = `${organizationId}/${targetProjectId}/${objectName}`;
    const newDrawingSetId = deterministicCloneId(row.id, targetProjectId);

    const copyResult = await supabase
      .storage
      .from(PROJECT_DRAWING_SETS_BUCKET)
      .copy(row.storage_path, targetStoragePath);

    if (copyResult.error && !isExistingStorageObjectError(copyResult.error.message)) {
      throw new Error(copyResult.error.message);
    }

    drawingSetIdMap.set(row.id, newDrawingSetId);
    targetPathByNewDrawingSetId.set(newDrawingSetId, targetStoragePath);
    drawingSetRowsForClone.push({
      id: newDrawingSetId,
      organization_id: organizationId,
      project_id: targetProjectId,
      uploaded_by: actingUserId,
      file_name: row.file_name,
      storage_path: targetStoragePath,
      file_size_bytes: row.file_size_bytes,
      mime_type: row.mime_type,
      uploaded_at: row.uploaded_at,
    });
  }

  const tradePackRowsForClone: Array<{
    id: string;
    organization_id: string;
    project_id: string;
    trade_id: string;
    trade_label: string;
    pdf_url: string;
    page_index_json: TradePackPageIndexJson;
    created_by: string;
    created_at: string;
  }> = tradePacks
    .map((row) => {
      const mappedId = drawingSetIdMap.get(row.id);
      if (!mappedId) {
        return null;
      }

      return {
        id: mappedId,
        organization_id: organizationId,
        project_id: targetProjectId,
        trade_id: row.trade_id,
        trade_label: row.trade_label,
        pdf_url: toTradePackPdfUrl(targetPathByNewDrawingSetId.get(mappedId) ?? ""),
        page_index_json: row.page_index_json,
        created_by: actingUserId,
        created_at: row.created_at,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const scopeRunRowsForClone: Array<{
    id: string;
    organization_id: string;
    project_id: string;
    trade_pack_id: string;
    created_by: string;
    status: string;
    result_json: ScopeRunResultJson;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  }> = scopeRuns
    .map((row) => {
      const mappedTradePackId = drawingSetIdMap.get(row.trade_pack_id);
      if (!mappedTradePackId) {
        return null;
      }

      return {
        id: deterministicCloneId(row.id, targetProjectId),
        organization_id: organizationId,
        project_id: targetProjectId,
        trade_pack_id: mappedTradePackId,
        created_by: actingUserId,
        status: row.status,
        result_json: row.result_json,
        error_message: row.error_message,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const rpcClient = supabase as unknown as {
    rpc: (
      fn: "clone_workspace_metadata_to_project",
      params: {
        p_organization_id: string;
        p_target_project_id: string;
        p_drawing_sets: Record<string, unknown>[];
        p_trade_packs: Record<string, unknown>[];
        p_scope_runs: Record<string, unknown>[];
      }
    ) => Promise<{ error: { message?: string } | null }>;
  };

  const cloneRpcResult = await rpcClient.rpc("clone_workspace_metadata_to_project", {
    p_organization_id: organizationId,
    p_target_project_id: targetProjectId,
    p_drawing_sets: drawingSetRowsForClone as unknown as Record<string, unknown>[],
    p_trade_packs: tradePackRowsForClone as unknown as Record<string, unknown>[],
    p_scope_runs: scopeRunRowsForClone as unknown as Record<string, unknown>[],
  });

  if (cloneRpcResult.error) {
    const message = (cloneRpcResult.error.message ?? "").toLowerCase();
    const isMissingRpc =
      message.includes("clone_workspace_metadata_to_project") &&
      (message.includes("does not exist") || message.includes("not found") || message.includes("could not find"));

    if (isMissingRpc) {
      // Backward-compatible fallback if the RPC migration is not applied yet.
      const insertDrawingSetsFallback = await supabase
        .from("project_drawing_sets")
        .insert(drawingSetRowsForClone);

      if (insertDrawingSetsFallback.error) {
        throw new Error(insertDrawingSetsFallback.error.message);
      }

      return;
    }

    throw new Error(cloneRpcResult.error.message ?? "Failed to clone workspace metadata.");
  }
}

async function ensureOpportunityWorkspaceProject(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  organizationId: string;
  actingUserId: string;
  opportunity: OpportunityWorkspaceSeed;
}): Promise<{ projectId: string; projectSlug: string; created: boolean; repairedLineage: boolean }> {
  const { supabase, organizationId, actingUserId, opportunity } = params;

  if (opportunity.workspace_project_id) {
    const existingWorkspaceResult = await supabase
      .from("organization_projects")
      .select("id, slug, source_opportunity_id")
      .eq("organization_id", organizationId)
      .eq("id", opportunity.workspace_project_id)
      .maybeSingle();

    if (existingWorkspaceResult.error) {
      throw new Error(existingWorkspaceResult.error.message);
    }

    const existingWorkspace = existingWorkspaceResult.data as OpportunityWorkspaceProjectRow | null;
    if (existingWorkspace) {
      if (existingWorkspace.source_opportunity_id === opportunity.id) {
        return {
          projectId: existingWorkspace.id,
          projectSlug: existingWorkspace.slug,
          created: false,
          repairedLineage: false,
        };
      }

      if (existingWorkspace.source_opportunity_id === null) {
        const repairResult = await supabase
          .from("organization_projects")
          .update({ source_opportunity_id: opportunity.id })
          .eq("organization_id", organizationId)
          .eq("id", existingWorkspace.id)
          .is("source_opportunity_id", null)
          .select("id, slug")
          .single();

        if (repairResult.error) {
          throw new Error(repairResult.error.message);
        }

        return {
          projectId: repairResult.data.id,
          projectSlug: repairResult.data.slug,
          created: false,
          repairedLineage: true,
        };
      }

      throw new Error("This worksheet is not linked to a quote workspace yet.");
    }
  }

  const workspaceBaseSlug = toProjectSlug(`${opportunity.slug}-tender`);
  const existingProjectSlugsResult = await supabase
    .from("organization_projects")
    .select("slug")
    .eq("organization_id", organizationId)
    .like("slug", `${workspaceBaseSlug}%`);

  if (existingProjectSlugsResult.error) {
    throw new Error(existingProjectSlugsResult.error.message);
  }

  const workspaceSlug = resolveUniqueProjectSlug(
    workspaceBaseSlug,
    (existingProjectSlugsResult.data ?? []).map((row) => row.slug)
  );

  const workspaceCreatedBy = opportunity.owner_user_id ?? opportunity.created_by ?? actingUserId;
  const workspaceResult = await supabase
    .from("organization_projects")
    .insert({
      organization_id: organizationId,
      created_by: workspaceCreatedBy,
      client_id: opportunity.client_id,
      source_opportunity_id: opportunity.id,
      name: `${opportunity.name} Tender Workspace`,
      slug: workspaceSlug,
      stage: "Pricing",
      location: opportunity.location || "Unspecified",
      cover_image_url: null,
    })
    .select("id, slug")
    .single();

  if (workspaceResult.error) {
    throw new Error(workspaceResult.error.message);
  }

  const opportunityUpdateResult = await supabase
    .from("organization_opportunities")
    .update({ workspace_project_id: workspaceResult.data.id })
    .eq("organization_id", organizationId)
    .eq("id", opportunity.id);

  if (opportunityUpdateResult.error) {
    await supabase
      .from("organization_projects")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", workspaceResult.data.id);
    throw new Error(opportunityUpdateResult.error.message);
  }

  return {
    projectId: workspaceResult.data.id,
    projectSlug: workspaceResult.data.slug,
    created: true,
    repairedLineage: false,
  };
}

function resolveOpportunityGroup(stage: OpportunityStage, convertedProjectId: string | null): OpportunityGroup {
  if (stage === "Won" && convertedProjectId) {
    return "won";
  }

  if (stage === "Quoted" || stage === "Lost" || stage === "Won") {
    return "priced";
  }

  return "pipeline";
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export async function getLiveOpportunitiesForCurrentUser(): Promise<LiveOpportunityRow[]> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const opportunitiesResult = await supabase
    .from("organization_opportunities")
    .select("id, slug, opportunity_code, name, location, stage, client_id, owner_user_id, due_date, quoted_at, estimated_value, workspace_project_id, converted_project_id, created_by, created_at")
    .eq("organization_id", member.organization_id)
    .order("created_at", { ascending: false });

  const opportunities = (opportunitiesResult.error ? [] : (opportunitiesResult.data ?? [])) as OpportunityRow[];

  type CanonicalSeriesRow = {
    id: string;
    opportunity_id: string;
    recipient_client_id: string | null;
    base_quote_number: string;
    display_reference: string;
    recipient: { id: string; name: string; company_name: string | null } | null;
    current_revision: {
      id: string;
      status: QuoteStatus;
      total_quote_price: number;
      quote_date: string | null;
      expiry_date: string | null;
      updated_at: string;
      revision_number: number;
    } | null;
  };
  const canonicalClient = supabase as unknown as {
    from(table: "opportunity_quote_series"): {
      select(columns: string): {
        eq(column: string, value: string): { is(column: string, value: null): Promise<{ data: CanonicalSeriesRow[] | null; error: unknown }> };
      };
    };
  };
  const seriesResult = await canonicalClient
    .from("opportunity_quote_series")
    .select("id, opportunity_id, recipient_client_id, base_quote_number, display_reference, recipient:organization_clients!opportunity_quote_series_org_recipient_fkey(id,name,company_name), current_revision:project_quotes!opportunity_quote_series_org_current_revision_fkey(id,status,total_quote_price,quote_date,expiry_date,updated_at,revision_number)")
    .eq("organization_id", member.organization_id)
    .is("archived_at", null);
  const seriesByOpportunityId = new Map<string, CanonicalSeriesRow[]>();
  for (const series of seriesResult.data ?? []) {
    const existing = seriesByOpportunityId.get(series.opportunity_id) ?? [];
    existing.push(series);
    seriesByOpportunityId.set(series.opportunity_id, existing);
  }

  const clientIds = Array.from(
    new Set(
      opportunities
        .map((opportunity) => opportunity.client_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const memberIds = Array.from(
    new Set(
      opportunities
        .map((opportunity) => opportunity.owner_user_id ?? opportunity.created_by)
        .filter((value): value is string => Boolean(value))
    )
  );
  const workspaceProjectIds = Array.from(
    new Set(
      opportunities
        .map((opportunity) => opportunity.workspace_project_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [clientsResult, membersResult, projectsResult] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from("organization_clients")
          .select("id, name, company_name")
          .eq("organization_id", member.organization_id)
          .in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    memberIds.length > 0
      ? supabase
          .from("organization_members")
          .select("user_id, display_name")
          .eq("organization_id", member.organization_id)
          .in("user_id", memberIds)
      : Promise.resolve({ data: [], error: null }),
    workspaceProjectIds.length > 0
      ? supabase
          .from("organization_projects")
          .select("id, slug")
          .eq("organization_id", member.organization_id)
          .in("id", workspaceProjectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const clients = (clientsResult.error ? [] : (clientsResult.data ?? [])) as ClientRow[];
  const members = (membersResult.error ? [] : (membersResult.data ?? [])) as MemberRow[];
  const workspaceSlugByProjectId = new Map(
    (projectsResult.error ? [] : (projectsResult.data ?? [])).map((project) => [project.id, project.slug])
  );

  const clientNameById = new Map(
    clients.map((client) => [client.id, client.company_name?.trim() || "Unknown Company"])
  );
  const ownerNameByUserId = new Map(members.map((memberRow) => [memberRow.user_id, memberRow.display_name]));
  const wonCountByClientId = new Map<string, number>();
  const lostCountByClientId = new Map<string, number>();

  for (const opportunity of opportunities) {
    if (!opportunity.client_id) {
      continue;
    }

    if (opportunity.stage === "Won") {
      wonCountByClientId.set(opportunity.client_id, (wonCountByClientId.get(opportunity.client_id) ?? 0) + 1);
    }

    if (opportunity.stage === "Lost") {
      lostCountByClientId.set(opportunity.client_id, (lostCountByClientId.get(opportunity.client_id) ?? 0) + 1);
    }
  }

  return opportunities.flatMap((opportunity) => {
    const ownerUserId = opportunity.owner_user_id ?? opportunity.created_by;
    const clientWins = opportunity.client_id ? wonCountByClientId.get(opportunity.client_id) ?? 0 : 0;
    const clientLosses = opportunity.client_id ? lostCountByClientId.get(opportunity.client_id) ?? 0 : 0;
    const clientWinRatePct =
      clientWins + clientLosses > 0 ? Math.round((clientWins / (clientWins + clientLosses)) * 100) : 0;

    const seriesRows = seriesByOpportunityId.get(opportunity.id) ?? [];
    const rowSources: Array<CanonicalSeriesRow | null> = seriesRows.length > 0 ? seriesRows : [null];
    return rowSources.map((series) => {
      const revision = series?.current_revision ?? null;
      const recipientName = series?.recipient
        ? series.recipient.company_name?.trim() || series.recipient.name
        : opportunity.client_id ? clientNameById.get(opportunity.client_id) ?? "Unassigned client" : "Unassigned client";
      return {
      quoteSeriesId: series?.id ?? null,
      quoteRevisionId: revision?.id ?? null,
      quoteNumber: series?.display_reference ?? opportunity.opportunity_code ?? null,
      revisionNumber: revision?.revision_number ?? null,
      opportunityId: opportunity.id,
      slug: opportunity.slug,
      name: opportunity.name,
      location: opportunity.location,
      stage: opportunity.stage,
      clientWinRatePct,
      clientId: series?.recipient_client_id ?? opportunity.client_id,
      clientName: recipientName,
      ownerName: ownerNameByUserId.get(ownerUserId) ?? "Unassigned",
      dueDateIso: series ? normalizeIsoDate(revision?.expiry_date) : normalizeIsoDate(opportunity.due_date),
      quotedDateIso: series ? normalizeIsoDate(revision?.quote_date) : normalizeIsoDate(opportunity.quoted_at),
      hasQuote: Boolean(revision),
      latestQuoteStatus: revision?.status ?? null,
      latestQuoteUpdatedIso: normalizeIsoDate(revision?.updated_at),
      valueNZD: revision && revision.total_quote_price > 0 ? revision.total_quote_price : Number(opportunity.estimated_value ?? 0),
      workspaceProjectId: opportunity.workspace_project_id,
      workspaceProjectSlug: opportunity.workspace_project_id ? workspaceSlugByProjectId.get(opportunity.workspace_project_id) ?? null : null,
      convertedProjectId: opportunity.converted_project_id,
      group: resolveOpportunityGroup(opportunity.stage, opportunity.converted_project_id),
      } satisfies LiveOpportunityRow;
    });
  });
}

export async function createOpportunityForCurrentUser(input: CreateOpportunityInput): Promise<{ slug: string }> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Opportunity name is required.");
  }

  const supabase = await createServerSupabaseClient();
  const baseSlug = toProjectSlug(name);

  const existingSlugsResult = await supabase
    .from("organization_opportunities")
    .select("slug")
    .eq("organization_id", member.organization_id)
    .like("slug", `${baseSlug}%`);

  if (existingSlugsResult.error) {
    throw new Error(existingSlugsResult.error.message);
  }

  const existingSlugs = (existingSlugsResult.data ?? []).map((row) => row.slug);
  const slug = resolveUniqueProjectSlug(baseSlug, existingSlugs);

  const opportunityInsertResult = await supabase
    .from("organization_opportunities")
    .insert({
      organization_id: member.organization_id,
      created_by: member.user_id,
      owner_user_id: member.user_id,
      client_id: input.clientId ?? null,
      name,
      slug,
      stage: "New",
      location: input.location?.trim() || "Unspecified",
      due_date: normalizeIsoDate(input.dueDateIso),
      estimated_value: Number(input.estimatedValue ?? 0),
    })
    .select("id, name, slug, location, client_id, created_by, owner_user_id, workspace_project_id")
    .single();

  if (opportunityInsertResult.error) {
    throw new Error(opportunityInsertResult.error.message);
  }

  try {
    await ensureOpportunityWorkspaceProject({
      supabase,
      organizationId: member.organization_id,
      actingUserId: member.user_id,
      opportunity: opportunityInsertResult.data,
    });
  } catch (error) {
    await supabase
      .from("organization_opportunities")
      .delete()
      .eq("organization_id", member.organization_id)
      .eq("id", opportunityInsertResult.data.id);
    throw error;
  }

  return { slug };
}

export async function convertOpportunityToProjectForCurrentUser(
  opportunitySlug: string,
  acceptedQuoteId: string,
  shadowCorrelationId = crypto.randomUUID(),
): Promise<OpportunityConversionResult> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const normalizedAcceptedQuoteId = acceptedQuoteId.trim();
  if (!normalizedAcceptedQuoteId) {
    throw new OpportunityConversionFailure({
      message: "Accepted quote ID is required.",
      databaseCode: "TS422",
      operation: "validate-conversion-request",
      acceptedQuoteId: normalizedAcceptedQuoteId,
      organizationId: member.organization_id,
    });
  }

  const supabase = await createServerSupabaseClient();
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, workspace_project_id")
    .eq("organization_id", member.organization_id)
    .eq("slug", opportunitySlug)
    .maybeSingle();

  if (opportunityResult.error) {
    throw new OpportunityConversionFailure({
      message: opportunityResult.error.message,
      databaseCode: opportunityResult.error.code,
      details: opportunityResult.error.details,
      hint: opportunityResult.error.hint,
      operation: "resolve-opportunity",
      acceptedQuoteId: normalizedAcceptedQuoteId,
      organizationId: member.organization_id,
    });
  }

  const opportunity = opportunityResult.data;
  if (!opportunity) {
    throw new Error("Opportunity not found.");
  }

  const shadowCapture = await capturePromotionShadowBestEffort({
    organizationId: member.organization_id,
    opportunityId: opportunity.id,
    acceptedQuoteId: normalizedAcceptedQuoteId,
    actorUserId: member.user_id,
    correlationId: shadowCorrelationId,
  });

  const rpcClient = supabase as unknown as {
    rpc: (
      name: "award_opportunity_by_lifecycle_v1",
      args: {
        p_organization_id: string;
        p_opportunity_id: string;
        p_accepted_quote_id: string;
        p_correlation_id: string;
      },
    ) => Promise<{
      data: Array<{
        project_id: string;
        project_slug: string;
        project_created: boolean;
        storage_clone_required: boolean;
        lifecycle_strategy: string;
      }> | null;
      error: {
        code?: string;
        message: string;
        details?: string;
        hint?: string;
      } | null;
    }>;
  };

  const conversionResult = await rpcClient.rpc(
    "award_opportunity_by_lifecycle_v1",
    {
      p_organization_id: member.organization_id,
      p_opportunity_id: opportunity.id,
      p_accepted_quote_id: normalizedAcceptedQuoteId,
      p_correlation_id: shadowCorrelationId,
    },
  );

  if (conversionResult.error) {
    throw new OpportunityConversionFailure({
      message: conversionResult.error.message,
      databaseCode: conversionResult.error.code,
      details: conversionResult.error.details,
      hint: conversionResult.error.hint,
      operation: "award_opportunity_by_lifecycle_v1",
      opportunityId: opportunity.id,
      acceptedQuoteId: normalizedAcceptedQuoteId,
      organizationId: member.organization_id,
    });
  }

  const converted = conversionResult.data?.[0];
  if (!converted?.project_id || !converted.project_slug) {
    throw new OpportunityConversionFailure({
      message: "Conversion completed without a final Project result.",
      operation: "award_opportunity_by_lifecycle_v1",
      opportunityId: opportunity.id,
      acceptedQuoteId: normalizedAcceptedQuoteId,
      organizationId: member.organization_id,
    });
  }

  // New awards finalize pricing inside the atomic database lifecycle. Historical
  // mappings predate that lifecycle, so an idempotent retry brings the immutable
  // manifest and Project-owned worksheet continuations forward. Quote revisions
  // remain an explicit commercial action.
  const pricingFinalizer = supabase as unknown as {
    rpc: (
      name: "finalize_opportunity_award_pricing_v1",
      args: {
        p_organization_id: string;
        p_opportunity_id: string;
        p_project_id: string;
        p_accepted_quote_id: string;
      },
    ) => Promise<{
      data: unknown;
      error: {
        code?: string;
        message: string;
        details?: string;
        hint?: string;
      } | null;
    }>;
  };
  const pricingResult = await pricingFinalizer.rpc(
    "finalize_opportunity_award_pricing_v1",
    {
      p_organization_id: member.organization_id,
      p_opportunity_id: opportunity.id,
      p_project_id: converted.project_id,
      p_accepted_quote_id: normalizedAcceptedQuoteId,
    },
  );
  if (pricingResult.error) {
    throw new OpportunityConversionFailure({
      message: pricingResult.error.message,
      databaseCode: pricingResult.error.code,
      details: pricingResult.error.details,
      hint: pricingResult.error.hint,
      operation: "finalize_opportunity_award_pricing_v1",
      opportunityId: opportunity.id,
      acceptedQuoteId: normalizedAcceptedQuoteId,
      organizationId: member.organization_id,
    });
  }

  let legacyTenderDataMigrationStatus: OpportunityConversionResult["legacyTenderDataMigrationStatus"] = "complete";
  if (
    converted.storage_clone_required
    && opportunity.workspace_project_id
    && opportunity.workspace_project_id !== converted.project_id
  ) {
    try {
      await cloneLegacyTenderDataToProject({
        supabase,
        organizationId: member.organization_id,
        sourceProjectId: opportunity.workspace_project_id,
        targetProjectId: converted.project_id,
        actingUserId: member.user_id,
      });
    } catch (error) {
      legacyTenderDataMigrationStatus = "retry_required";
      console.error("[opportunity/convert] post-commit legacy tender data migration failed", {
        operation: "clone-legacy-tender-data",
        opportunityId: opportunity.id,
        organizationId: member.organization_id,
        projectId: converted.project_id,
        message: error instanceof Error ? error.message : "Unknown legacy tender data migration failure",
      });
    }
  }

  await finalizePromotionShadowBestEffort({
    organizationId: member.organization_id,
    runId: shadowCapture?.runId ?? null,
    finalProjectId: converted.project_id,
    actorUserId: member.user_id,
  });

  return {
    projectId: converted.project_id,
    projectSlug: converted.project_slug,
    projectCreated: converted.project_created,
    legacyTenderDataMigrationStatus,
  };
}

export async function getOrCreateOpportunityWorkspaceSlugForCurrentUser(opportunitySlug: string): Promise<string> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServerSupabaseClient();
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, name, slug, location, client_id, created_by, owner_user_id, workspace_project_id")
    .eq("organization_id", member.organization_id)
    .eq("slug", opportunitySlug)
    .maybeSingle();

  if (opportunityResult.error) {
    throw new Error(opportunityResult.error.message);
  }

  const opportunity = opportunityResult.data;
  if (!opportunity) {
    throw new Error("Opportunity not found.");
  }

  const workspace = await ensureOpportunityWorkspaceProject({
    supabase,
    organizationId: member.organization_id,
    actingUserId: member.user_id,
    opportunity,
  });

  return workspace.projectSlug;
}

export async function ensureOpportunityWorkspaceProjectForCurrentUser(opportunityId: string): Promise<{
  opportunityId: string;
  projectId: string;
  projectSlug: string;
  created: boolean;
  repairedLineage: boolean;
}> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServerSupabaseClient();
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, name, slug, location, client_id, created_by, owner_user_id, workspace_project_id")
    .eq("organization_id", member.organization_id)
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunityResult.error) {
    throw new Error(opportunityResult.error.message);
  }

  if (!opportunityResult.data) {
    throw new Error("Opportunity not found.");
  }

  const workspace = await ensureOpportunityWorkspaceProject({
    supabase,
    organizationId: member.organization_id,
    actingUserId: member.user_id,
    opportunity: opportunityResult.data,
  });

  return {
    opportunityId: opportunityResult.data.id,
    projectId: workspace.projectId,
    projectSlug: workspace.projectSlug,
    created: workspace.created,
    repairedLineage: workspace.repairedLineage,
  };
}

export async function deleteOpportunityForCurrentUser(opportunityId: string): Promise<void> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServerSupabaseClient();
  // Keep this narrow guard independent from the generated database type depth.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lifecycleResult = await (supabase as any)
    .from("opportunity_lifecycles")
    .select("id")
    .eq("organization_id", member.organization_id)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (lifecycleResult.error) {
    throw new Error(lifecycleResult.error.message);
  }
  if (lifecycleResult.data) {
    throw new Error("Lifecycle-managed opportunities cannot be deleted through the ordinary delete action.");
  }

  const deleteResult = await supabase
    .from("organization_opportunities")
    .delete()
    .eq("organization_id", member.organization_id)
    .eq("id", opportunityId);

  if (deleteResult.error) {
    throw new Error(deleteResult.error.message);
  }
}

export async function deleteOpportunityBySlugForCurrentUser(opportunitySlug: string): Promise<void> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServerSupabaseClient();
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id")
    .eq("organization_id", member.organization_id)
    .eq("slug", opportunitySlug)
    .maybeSingle();

  if (opportunityResult.error) {
    throw new Error(opportunityResult.error.message);
  }

  const opportunityId = opportunityResult.data?.id;
  if (!opportunityId) {
    throw new Error("Opportunity not found.");
  }

  await deleteOpportunityForCurrentUser(opportunityId);
}
