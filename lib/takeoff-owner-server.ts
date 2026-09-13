import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { TakeoffConversionMode, TakeoffRouteOwner } from "@/lib/takeoff/owner";

type TakeoffClient = SupabaseClient<Database>;

export interface AuthorizedTakeoffContext {
  organizationId: string;
  routeOwner: TakeoffRouteOwner & { id: string };
  routeProjectId: string;
  routeProjectSlug: string;
  dataProjectId: string;
  lineageOpportunityId: string | null;
  conversionMode: TakeoffConversionMode;
  displayName: string;
  canonicalProject: { id: string; slug: string } | null;
}

export class TakeoffAuthorityConflictError extends Error {
  readonly code = "TAKEOFF_AUTHORITY_RECONCILIATION_REQUIRED";
  readonly routeProjectId: string;
  readonly workspaceProjectId: string;

  constructor(params: { routeProjectId: string; workspaceProjectId: string }) {
    super("Takeoff has connected data in both the final and workspace Projects. Reconciliation is required before Takeoff can be opened safely.");
    this.name = "TakeoffAuthorityConflictError";
    this.routeProjectId = params.routeProjectId;
    this.workspaceProjectId = params.workspaceProjectId;
  }
}

async function projectHasConnectedTakeoffGraph(params: {
  supabase: TakeoffClient;
  organizationId: string;
  projectId: string;
}) {
  const { supabase, organizationId, projectId } = params;
  const [pages, measurements, jobs] = await Promise.all([
    supabase.from("takeoff_pages").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("project_id", projectId),
    supabase.from("takeoff_measurements").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("project_id", projectId),
    supabase.from("takeoff_render_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("project_id", projectId),
  ]);
  if (pages.error || measurements.error || jobs.error) {
    throw new Error("Unable to verify the authoritative Takeoff graph.");
  }
  return (pages.count ?? 0) > 0 || (measurements.count ?? 0) > 0 || (jobs.count ?? 0) > 0;
}

export async function resolveTakeoffProjectAuthorityWithClient(params: {
  supabase: TakeoffClient;
  organizationId: string;
  projectId: string;
  sourceOpportunityId?: string | null;
}): Promise<{
  dataProjectId: string;
  lineageOpportunityId: string | null;
  conversionMode: Exclude<TakeoffConversionMode, "workspace">;
}> {
  let sourceOpportunityId = params.sourceOpportunityId;
  if (sourceOpportunityId === undefined) {
    const projectResult = await params.supabase
      .from("organization_projects")
      .select("id, source_opportunity_id")
      .eq("organization_id", params.organizationId)
      .eq("id", params.projectId)
      .maybeSingle();
    if (projectResult.error || !projectResult.data) throw new Error("Unable to resolve the Project Takeoff owner.");
    sourceOpportunityId = projectResult.data.source_opportunity_id ?? null;
  }
  if (!sourceOpportunityId) {
    return { dataProjectId: params.projectId, lineageOpportunityId: null, conversionMode: "project" };
  }

  const opportunityResult = await params.supabase
    .from("organization_opportunities")
    .select("id, workspace_project_id, converted_project_id")
    .eq("organization_id", params.organizationId)
    .eq("id", sourceOpportunityId)
    .maybeSingle();
  if (opportunityResult.error || !opportunityResult.data?.workspace_project_id) {
    throw new Error("Unable to verify the Project's Takeoff lineage.");
  }
  if (opportunityResult.data.converted_project_id && opportunityResult.data.converted_project_id !== params.projectId) {
    throw new Error("The Project is not the canonical conversion target for this Takeoff workspace.");
  }
  const workspaceProjectId = opportunityResult.data.workspace_project_id;
  if (workspaceProjectId === params.projectId) {
    return { dataProjectId: params.projectId, lineageOpportunityId: sourceOpportunityId, conversionMode: "promoted" };
  }

  const workspaceResult = await params.supabase
    .from("organization_projects")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("id", workspaceProjectId)
    .maybeSingle();
  if (workspaceResult.error || !workspaceResult.data) throw new Error("The authoritative Takeoff workspace is unavailable.");

  const [workspaceHasGraph, finalHasGraph] = await Promise.all([
    projectHasConnectedTakeoffGraph({ ...params, projectId: workspaceProjectId }),
    projectHasConnectedTakeoffGraph(params),
  ]);
  if (finalHasGraph) {
    console.error("[takeoff-authority] reconciliation required", {
      organizationId: params.organizationId,
      routeProjectId: params.projectId,
      workspaceProjectId,
      workspaceHasGraph,
      finalHasGraph,
    });
    throw new TakeoffAuthorityConflictError({ routeProjectId: params.projectId, workspaceProjectId });
  }
  return { dataProjectId: workspaceProjectId, lineageOpportunityId: sourceOpportunityId, conversionMode: "legacy-reference" };
}

export async function resolveAuthorizedTakeoffContext(params: {
  owner: TakeoffRouteOwner;
  member?: NonNullable<Awaited<ReturnType<typeof getCurrentOrganizationMember>>>;
  supabase?: TakeoffClient;
}): Promise<AuthorizedTakeoffContext | null> {
  const member = params.member ?? await getCurrentOrganizationMember();
  if (!member) return null;
  const supabase = params.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });

  if (params.owner.kind === "opportunity") {
    const opportunityResult = await supabase
      .from("organization_opportunities")
      .select("id, slug, name, workspace_project_id, converted_project_id")
      .eq("organization_id", member.organization_id)
      .eq("slug", params.owner.slug)
      .maybeSingle();
    const opportunity = opportunityResult.data;
    if (opportunityResult.error || !opportunity?.workspace_project_id) return null;
    const workspaceResult = await supabase
      .from("organization_projects")
      .select("id, slug, name")
      .eq("organization_id", member.organization_id)
      .eq("id", opportunity.workspace_project_id)
      .maybeSingle();
    if (workspaceResult.error || !workspaceResult.data) return null;
    let canonicalProject: { id: string; slug: string } | null = null;
    if (opportunity.converted_project_id) {
      const finalResult = await supabase
        .from("organization_projects")
        .select("id, slug, source_opportunity_id")
        .eq("organization_id", member.organization_id)
        .eq("id", opportunity.converted_project_id)
        .maybeSingle();
      if (finalResult.error || !finalResult.data || (finalResult.data.source_opportunity_id && finalResult.data.source_opportunity_id !== opportunity.id)) return null;
      canonicalProject = { id: finalResult.data.id, slug: finalResult.data.slug };
    }
    return {
      organizationId: member.organization_id,
      routeOwner: { ...params.owner, id: opportunity.id },
      routeProjectId: workspaceResult.data.id,
      routeProjectSlug: workspaceResult.data.slug,
      dataProjectId: workspaceResult.data.id,
      lineageOpportunityId: opportunity.id,
      conversionMode: "workspace",
      displayName: opportunity.name?.trim() || workspaceResult.data.name,
      canonicalProject,
    };
  }

  const projectResult = await supabase
    .from("organization_projects")
    .select("id, slug, name, source_opportunity_id")
    .eq("organization_id", member.organization_id)
    .eq("slug", params.owner.slug)
    .maybeSingle();
  if (projectResult.error || !projectResult.data) return null;
  const authority = await resolveTakeoffProjectAuthorityWithClient({
    supabase,
    organizationId: member.organization_id,
    projectId: projectResult.data.id,
    sourceOpportunityId: projectResult.data.source_opportunity_id,
  });
  return {
    organizationId: member.organization_id,
    routeOwner: { ...params.owner, id: projectResult.data.id },
    routeProjectId: projectResult.data.id,
    routeProjectSlug: projectResult.data.slug,
    dataProjectId: authority.dataProjectId,
    lineageOpportunityId: authority.lineageOpportunityId,
    conversionMode: authority.conversionMode,
    displayName: projectResult.data.name,
    canonicalProject: null,
  };
}

export const getAuthorizedTakeoffContext = cache(async (owner: TakeoffRouteOwner) =>
  resolveAuthorizedTakeoffContext({ owner }),
);
