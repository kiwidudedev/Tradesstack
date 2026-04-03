import "server-only";

import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { toProjectSlug, resolveUniqueProjectSlug } from "@/lib/projects";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, OpportunityStage, QuoteStatus } from "@/lib/supabase/types";
import { PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import { toTradePackPdfUrl } from "@/lib/trade-packs";

type OpportunityRow = Database["public"]["Tables"]["organization_opportunities"]["Row"];
type ClientRow = Pick<Database["public"]["Tables"]["organization_clients"]["Row"], "id" | "name" | "company_name">;
type MemberRow = Pick<Database["public"]["Tables"]["organization_members"]["Row"], "user_id" | "display_name">;
type OpportunityQuoteRow = Database["public"]["Tables"]["opportunity_quotes"]["Row"];
type OpportunityQuoteLineItemRow = Database["public"]["Tables"]["opportunity_quote_line_items"]["Row"];

export type OpportunityGroup = "pipeline" | "priced" | "won";

export interface LiveOpportunityRow {
  opportunityId: string;
  slug: string;
  name: string;
  location: string;
  stage: OpportunityStage;
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

async function cloneWorkspaceDataToProject(params: {
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
      .select("trade_pack_id, status, result_json, error_message, created_at, updated_at")
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
    const newDrawingSetId = crypto.randomUUID();

    const copyResult = await supabase
      .storage
      .from(PROJECT_DRAWING_SETS_BUCKET)
      .copy(row.storage_path, targetStoragePath);

    if (copyResult.error) {
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
    page_index_json: Record<string, unknown>[];
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
    organization_id: string;
    project_id: string;
    trade_pack_id: string;
    created_by: string;
    status: string;
    result_json: Record<string, unknown>;
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

async function syncLatestOpportunityQuoteToProject(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  organizationId: string;
  opportunityId: string;
  projectId: string;
  fallbackCreatedBy: string;
}): Promise<{ quoteDate: string | null }> {
  const { supabase, organizationId, opportunityId, projectId, fallbackCreatedBy } = params;

  const existingProjectQuote = await supabase
    .from("project_quotes")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .limit(1)
    .maybeSingle();

  if (existingProjectQuote.error) {
    throw new Error(existingProjectQuote.error.message);
  }

  if (existingProjectQuote.data?.id) {
    const latestProjectQuoteDate = await supabase
      .from("project_quotes")
      .select("quote_date")
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestProjectQuoteDate.error) {
      throw new Error(latestProjectQuoteDate.error.message);
    }

    return { quoteDate: latestProjectQuoteDate.data?.quote_date ?? null };
  }

  const latestOpportunityQuoteResult = await supabase
    .from("opportunity_quotes")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("opportunity_id", opportunityId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestOpportunityQuoteResult.error) {
    throw new Error(latestOpportunityQuoteResult.error.message);
  }

  const latestOpportunityQuote = latestOpportunityQuoteResult.data as OpportunityQuoteRow | null;
  if (!latestOpportunityQuote) {
    return { quoteDate: null };
  }

  const quoteNumberConflictResult = await supabase
    .from("project_quotes")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("quote_number", latestOpportunityQuote.quote_number)
    .limit(1)
    .maybeSingle();

  if (quoteNumberConflictResult.error) {
    throw new Error(quoteNumberConflictResult.error.message);
  }

  const quoteNumberForProject = quoteNumberConflictResult.data?.id ? "" : latestOpportunityQuote.quote_number;

  const projectQuoteInsertResult = await supabase
    .from("project_quotes")
    .insert({
      organization_id: organizationId,
      project_id: projectId,
      created_by: latestOpportunityQuote.created_by || fallbackCreatedBy,
      quote_title: latestOpportunityQuote.quote_title,
      quote_number: quoteNumberForProject,
      client_name: latestOpportunityQuote.client_name,
      company_name: latestOpportunityQuote.company_name,
      contact_person: latestOpportunityQuote.contact_person,
      client_email: latestOpportunityQuote.client_email,
      client_phone: latestOpportunityQuote.client_phone,
      site_address: latestOpportunityQuote.site_address,
      project_name: latestOpportunityQuote.project_name,
      quote_date: latestOpportunityQuote.quote_date,
      expiry_date: latestOpportunityQuote.expiry_date,
      status: latestOpportunityQuote.status,
      optional_items_notes: latestOpportunityQuote.optional_items_notes,
      scope_exclusions: latestOpportunityQuote.scope_exclusions,
      assumptions: latestOpportunityQuote.assumptions,
      scope_notes: latestOpportunityQuote.scope_notes,
      subtotal: latestOpportunityQuote.subtotal,
      optional_subtotal: latestOpportunityQuote.optional_subtotal,
      margin_percent: latestOpportunityQuote.margin_percent,
      margin_amount: latestOpportunityQuote.margin_amount,
      discount_amount: latestOpportunityQuote.discount_amount,
      contingency_amount: latestOpportunityQuote.contingency_amount,
      gst_percent: latestOpportunityQuote.gst_percent,
      gst_amount: latestOpportunityQuote.gst_amount,
      total_quote_price: latestOpportunityQuote.total_quote_price,
      validity_period: latestOpportunityQuote.validity_period,
      payment_terms: latestOpportunityQuote.payment_terms,
      lead_time: latestOpportunityQuote.lead_time,
      terms_inclusions: latestOpportunityQuote.terms_inclusions,
      terms_exclusions: latestOpportunityQuote.terms_exclusions,
      clarifications: latestOpportunityQuote.clarifications,
      acceptance_notes: latestOpportunityQuote.acceptance_notes,
    })
    .select("id")
    .single();

  if (projectQuoteInsertResult.error) {
    throw new Error(projectQuoteInsertResult.error.message);
  }

  const projectQuoteId = projectQuoteInsertResult.data.id;

  const opportunityQuoteItemsResult = await supabase
    .from("opportunity_quote_line_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("quote_id", latestOpportunityQuote.id)
    .order("sort_order", { ascending: true });

  if (opportunityQuoteItemsResult.error) {
    throw new Error(opportunityQuoteItemsResult.error.message);
  }

  const opportunityQuoteItems = (opportunityQuoteItemsResult.data ?? []) as OpportunityQuoteLineItemRow[];

  if (opportunityQuoteItems.length > 0) {
    const projectQuoteItemsInsertResult = await supabase
      .from("project_quote_line_items")
      .insert(
        opportunityQuoteItems.map((item) => ({
          organization_id: organizationId,
          project_id: projectId,
          quote_id: projectQuoteId,
          section: item.section,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          total: item.total,
          is_optional: item.is_optional,
          sort_order: item.sort_order,
        }))
      );

    if (projectQuoteItemsInsertResult.error) {
      throw new Error(projectQuoteItemsInsertResult.error.message);
    }
  }

  return { quoteDate: latestOpportunityQuote.quote_date ?? null };
}

export async function getLiveOpportunitiesForCurrentUser(): Promise<LiveOpportunityRow[]> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const [opportunitiesResult, clientsResult, membersResult, projectsResult, quotesResult] = await Promise.all([
    supabase
      .from("organization_opportunities")
      .select("id, slug, opportunity_code, name, location, stage, client_id, owner_user_id, due_date, quoted_at, estimated_value, workspace_project_id, converted_project_id, created_by, created_at")
      .eq("organization_id", member.organization_id)
      .order("created_at", { ascending: false }),
    supabase.from("organization_clients").select("id, name, company_name").eq("organization_id", member.organization_id),
    supabase.from("organization_members").select("user_id, display_name").eq("organization_id", member.organization_id),
    supabase.from("organization_projects").select("id, slug").eq("organization_id", member.organization_id),
    supabase
      .from("opportunity_quotes")
      .select("opportunity_id, status, total_quote_price, updated_at, created_at")
      .eq("organization_id", member.organization_id)
      .order("updated_at", { ascending: false }),
  ]);

  const opportunities = (opportunitiesResult.error ? [] : (opportunitiesResult.data ?? [])) as OpportunityRow[];
  const clients = (clientsResult.error ? [] : (clientsResult.data ?? [])) as ClientRow[];
  const members = (membersResult.error ? [] : (membersResult.data ?? [])) as MemberRow[];
  const quotes = (quotesResult.error ? [] : (quotesResult.data ?? [])) as Pick<
    OpportunityQuoteRow,
    "opportunity_id" | "status" | "updated_at" | "created_at" | "total_quote_price"
  >[];
  const workspaceSlugByProjectId = new Map(
    (projectsResult.error ? [] : (projectsResult.data ?? [])).map((project) => [project.id, project.slug])
  );

  const clientNameById = new Map(
    clients.map((client) => [client.id, client.company_name?.trim() || "Unknown Company"])
  );
  const ownerNameByUserId = new Map(members.map((memberRow) => [memberRow.user_id, memberRow.display_name]));
  const latestQuoteByOpportunityId = new Map<
    string,
    { status: QuoteStatus; updatedIso: string | null; totalNZD: number | null }
  >();
  for (const quote of quotes) {
    if (latestQuoteByOpportunityId.has(quote.opportunity_id)) {
      continue;
    }
    latestQuoteByOpportunityId.set(quote.opportunity_id, {
      status: quote.status as QuoteStatus,
      updatedIso: normalizeIsoDate(quote.updated_at ?? quote.created_at),
      totalNZD: typeof quote.total_quote_price === "number" ? quote.total_quote_price : null,
    });
  }

  return opportunities.map((opportunity) => {
    const ownerUserId = opportunity.owner_user_id ?? opportunity.created_by;
    const latestQuote = latestQuoteByOpportunityId.get(opportunity.id);
    const estimatedValue = Number(opportunity.estimated_value ?? 0);
    const quoteValue = latestQuote?.totalNZD ?? null;
    const resolvedValueNZD = quoteValue !== null && quoteValue > 0 ? quoteValue : estimatedValue;

    return {
      opportunityId: opportunity.id,
      slug: opportunity.slug,
      name: opportunity.name,
      location: opportunity.location,
      stage: opportunity.stage,
      clientId: opportunity.client_id,
      clientName: opportunity.client_id ? clientNameById.get(opportunity.client_id) ?? "Unassigned client" : "Unassigned client",
      ownerName: ownerNameByUserId.get(ownerUserId) ?? "Unassigned",
      dueDateIso: normalizeIsoDate(opportunity.due_date),
      quotedDateIso: normalizeIsoDate(opportunity.quoted_at),
      hasQuote: Boolean(latestQuote),
      latestQuoteStatus: latestQuote?.status ?? null,
      latestQuoteUpdatedIso: latestQuote?.updatedIso ?? null,
      valueNZD: resolvedValueNZD,
      workspaceProjectId: opportunity.workspace_project_id,
      workspaceProjectSlug: opportunity.workspace_project_id ? workspaceSlugByProjectId.get(opportunity.workspace_project_id) ?? null : null,
      convertedProjectId: opportunity.converted_project_id,
      group: resolveOpportunityGroup(opportunity.stage, opportunity.converted_project_id),
    } satisfies LiveOpportunityRow;
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

  const workspaceName = `${name} Tender Workspace`;
  const workspaceBaseSlug = toProjectSlug(`${slug}-tender`);
  const projectSlugsResult = await supabase
    .from("organization_projects")
    .select("slug")
    .eq("organization_id", member.organization_id)
    .like("slug", `${workspaceBaseSlug}%`);

  if (projectSlugsResult.error) {
    throw new Error(projectSlugsResult.error.message);
  }

  const workspaceSlug = resolveUniqueProjectSlug(
    workspaceBaseSlug,
    (projectSlugsResult.data ?? []).map((row) => row.slug)
  );

  const workspaceResult = await supabase
    .from("organization_projects")
    .insert({
      organization_id: member.organization_id,
      created_by: member.user_id,
      client_id: input.clientId ?? null,
      name: workspaceName,
      slug: workspaceSlug,
      stage: "Pricing",
      location: input.location?.trim() || "Unspecified",
      cover_image_url: null,
    })
    .select("id")
    .single();

  if (workspaceResult.error) {
    throw new Error(workspaceResult.error.message);
  }

  const insertResult = await supabase.from("organization_opportunities").insert({
    organization_id: member.organization_id,
    created_by: member.user_id,
    owner_user_id: member.user_id,
    client_id: input.clientId ?? null,
    workspace_project_id: workspaceResult.data.id,
    name,
    slug,
    stage: "New",
    location: input.location?.trim() || "Unspecified",
    due_date: normalizeIsoDate(input.dueDateIso),
    estimated_value: Number(input.estimatedValue ?? 0),
  });

  if (insertResult.error) {
    await supabase
      .from("organization_projects")
      .delete()
      .eq("organization_id", member.organization_id)
      .eq("id", workspaceResult.data.id);
    throw new Error(insertResult.error.message);
  }

  return { slug };
}

export async function convertOpportunityToProjectForCurrentUser(opportunitySlug: string): Promise<{ projectSlug: string }> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServerSupabaseClient();
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, organization_id, name, location, client_id, quoted_at, workspace_project_id, converted_project_id")
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

  if (opportunity.converted_project_id) {
    const existingProjectResult = await supabase
      .from("organization_projects")
      .select("id, slug")
      .eq("organization_id", member.organization_id)
      .eq("id", opportunity.converted_project_id)
      .maybeSingle();

    if (existingProjectResult.data?.slug) {
      const syncedQuote = await syncLatestOpportunityQuoteToProject({
        supabase,
        organizationId: member.organization_id,
        opportunityId: opportunity.id,
        projectId: existingProjectResult.data.id,
        fallbackCreatedBy: member.user_id,
      });

      const quotedAtForUpdate =
        opportunity.quoted_at ??
        syncedQuote.quoteDate ??
        normalizeIsoDate(new Date().toISOString());

      const enforceWonResult = await supabase
        .from("organization_opportunities")
        .update({
          converted_project_id: existingProjectResult.data.id,
          converted_at: new Date().toISOString(),
          stage: "Won",
          quoted_at: quotedAtForUpdate,
        })
        .eq("organization_id", member.organization_id)
        .eq("id", opportunity.id);

      if (enforceWonResult.error) {
        throw new Error(enforceWonResult.error.message);
      }

      return { projectSlug: existingProjectResult.data.slug };
    }
  }

  const baseProjectSlug = toProjectSlug(opportunity.name);
  const existingProjectSlugsResult = await supabase
    .from("organization_projects")
    .select("slug")
    .eq("organization_id", member.organization_id)
    .like("slug", `${baseProjectSlug}%`);

  if (existingProjectSlugsResult.error) {
    throw new Error(existingProjectSlugsResult.error.message);
  }

  const projectSlug = resolveUniqueProjectSlug(
    baseProjectSlug,
    (existingProjectSlugsResult.data ?? []).map((row) => row.slug)
  );

  const projectInsertResult = await supabase
    .from("organization_projects")
    .insert({
      organization_id: member.organization_id,
      created_by: member.user_id,
      client_id: opportunity.client_id,
      name: opportunity.name,
      slug: projectSlug,
      stage: "Pricing",
      location: opportunity.location || "Unspecified",
      cover_image_url: null,
    })
    .select("id, slug")
    .single();

  if (projectInsertResult.error) {
    throw new Error(projectInsertResult.error.message);
  }

  const createdProject = projectInsertResult.data;

  if (opportunity.workspace_project_id && opportunity.workspace_project_id !== createdProject.id) {
    await cloneWorkspaceDataToProject({
      supabase,
      organizationId: member.organization_id,
      sourceProjectId: opportunity.workspace_project_id,
      targetProjectId: createdProject.id,
      actingUserId: member.user_id,
    });
  }

  const syncedQuote = await syncLatestOpportunityQuoteToProject({
    supabase,
    organizationId: member.organization_id,
    opportunityId: opportunity.id,
    projectId: createdProject.id,
    fallbackCreatedBy: member.user_id,
  });

  const quotedAtForUpdate =
    opportunity.quoted_at ??
    syncedQuote.quoteDate ??
    normalizeIsoDate(new Date().toISOString());

  const opportunityUpdateResult = await supabase
    .from("organization_opportunities")
    .update({
      converted_project_id: createdProject.id,
      converted_at: new Date().toISOString(),
      stage: "Won",
      quoted_at: quotedAtForUpdate,
    })
    .eq("organization_id", member.organization_id)
    .eq("id", opportunity.id);

  if (opportunityUpdateResult.error) {
    throw new Error(opportunityUpdateResult.error.message);
  }

  return { projectSlug: createdProject.slug };
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

  if (opportunity.workspace_project_id) {
    const existingWorkspaceResult = await supabase
      .from("organization_projects")
      .select("id, slug")
      .eq("organization_id", member.organization_id)
      .eq("id", opportunity.workspace_project_id)
      .maybeSingle();

    if (existingWorkspaceResult.error) {
      throw new Error(existingWorkspaceResult.error.message);
    }

    if (existingWorkspaceResult.data?.slug) {
      return existingWorkspaceResult.data.slug;
    }
  }

  const workspaceBaseSlug = toProjectSlug(`${opportunity.slug}-tender`);
  const existingProjectSlugsResult = await supabase
    .from("organization_projects")
    .select("slug")
    .eq("organization_id", member.organization_id)
    .like("slug", `${workspaceBaseSlug}%`);

  if (existingProjectSlugsResult.error) {
    throw new Error(existingProjectSlugsResult.error.message);
  }

  const workspaceSlug = resolveUniqueProjectSlug(
    workspaceBaseSlug,
    (existingProjectSlugsResult.data ?? []).map((row) => row.slug)
  );

  const workspaceCreatedBy = opportunity.owner_user_id ?? opportunity.created_by ?? member.user_id;
  const workspaceResult = await supabase
    .from("organization_projects")
    .insert({
      organization_id: member.organization_id,
      created_by: workspaceCreatedBy,
      client_id: opportunity.client_id,
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
    .eq("organization_id", member.organization_id)
    .eq("id", opportunity.id);

  if (opportunityUpdateResult.error) {
    await supabase
      .from("organization_projects")
      .delete()
      .eq("organization_id", member.organization_id)
      .eq("id", workspaceResult.data.id);
    throw new Error(opportunityUpdateResult.error.message);
  }

  return workspaceResult.data.slug;
}

export async function deleteOpportunityForCurrentUser(opportunityId: string): Promise<void> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServerSupabaseClient();
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
