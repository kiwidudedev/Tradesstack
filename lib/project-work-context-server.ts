import "server-only";

import { getOrCreateOpportunityWorkspaceSlugForCurrentUser } from "@/lib/leads-clients-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getOrganizationProjectBySlugForCurrentUser } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ProjectWorkContextOrigin =
  | "opportunity-workspace"
  | "project"
  | "project-read-fallback-workspace";

export interface ProjectWorkContext {
  effectiveFeatureProjectId: string;
  effectiveReadProjectId: string;
  workspaceProjectId: string | null;
  sourceOpportunityId: string | null;
  origin: ProjectWorkContextOrigin;
  organizationId: string;
  projectSlug: string;
  projectName: string;
  projectStage: string;
}

async function hasFeatureDataForProject(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  organizationId: string;
  projectId: string;
}): Promise<boolean> {
  const { supabase, organizationId, projectId } = params;

  const [drawingSetsResult, tradePacksResult, scopeRunsResult] = await Promise.all([
    supabase
      .from("project_drawing_sets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("project_id", projectId),
    supabase
      .from("trade_packs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("project_id", projectId),
    supabase
      .from("scope_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("project_id", projectId),
  ]);

  if (drawingSetsResult.error || tradePacksResult.error || scopeRunsResult.error) {
    return false;
  }

  return (
    (drawingSetsResult.count ?? 0) > 0 ||
    (tradePacksResult.count ?? 0) > 0 ||
    (scopeRunsResult.count ?? 0) > 0
  );
}

export async function getProjectWorkContextForCurrentUser(params: {
  projectId?: string;
  opportunityId?: string;
}): Promise<ProjectWorkContext | null> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return null;
  }

  const supabase = await createServerSupabaseClient();

  if (params.opportunityId) {
    const workspaceSlug = await getOrCreateOpportunityWorkspaceSlugForCurrentUser(params.opportunityId);
    const opportunityResult = await supabase
      .from("organization_opportunities")
      .select("id, workspace_project_id")
      .eq("organization_id", member.organization_id)
      .eq("slug", params.opportunityId)
      .maybeSingle();

    if (opportunityResult.error || !opportunityResult.data?.workspace_project_id) {
      return null;
    }

    const project = await getOrganizationProjectBySlugForCurrentUser(workspaceSlug);
    if (!project) {
      return null;
    }

    return {
      effectiveFeatureProjectId: project.id,
      effectiveReadProjectId: project.id,
      workspaceProjectId: project.id,
      sourceOpportunityId: opportunityResult.data.id,
      origin: "opportunity-workspace",
      organizationId: project.organization_id,
      projectSlug: project.slug,
      projectName: project.name,
      projectStage: project.stage,
    };
  }

  if (!params.projectId) {
    return null;
  }

  const projectResult = await supabase
    .from("organization_projects")
    .select("id, organization_id, slug, name, stage, source_opportunity_id")
    .eq("organization_id", member.organization_id)
    .eq("slug", params.projectId)
    .maybeSingle();

  if (projectResult.error || !projectResult.data) {
    return null;
  }

  const project = projectResult.data;
  const sourceOpportunityId = project.source_opportunity_id ?? null;

  if (!sourceOpportunityId) {
    return {
      effectiveFeatureProjectId: project.id,
      effectiveReadProjectId: project.id,
      workspaceProjectId: null,
      sourceOpportunityId: null,
      origin: "project",
      organizationId: project.organization_id,
      projectSlug: project.slug,
      projectName: project.name,
      projectStage: project.stage,
    };
  }

  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, workspace_project_id")
    .eq("organization_id", member.organization_id)
    .eq("id", sourceOpportunityId)
    .maybeSingle();

  if (opportunityResult.error || !opportunityResult.data?.workspace_project_id) {
    return {
      effectiveFeatureProjectId: project.id,
      effectiveReadProjectId: project.id,
      workspaceProjectId: null,
      sourceOpportunityId,
      origin: "project",
      organizationId: project.organization_id,
      projectSlug: project.slug,
      projectName: project.name,
      projectStage: project.stage,
    };
  }

  const projectHasFeatureData = await hasFeatureDataForProject({
    supabase,
    organizationId: project.organization_id,
    projectId: project.id,
  });

  if (projectHasFeatureData) {
    return {
      effectiveFeatureProjectId: project.id,
      effectiveReadProjectId: project.id,
      workspaceProjectId: opportunityResult.data.workspace_project_id,
      sourceOpportunityId,
      origin: "project",
      organizationId: project.organization_id,
      projectSlug: project.slug,
      projectName: project.name,
      projectStage: project.stage,
    };
  }

  const workspaceProjectResult = await supabase
    .from("organization_projects")
    .select("id")
    .eq("organization_id", member.organization_id)
    .eq("id", opportunityResult.data.workspace_project_id)
    .maybeSingle();

  if (workspaceProjectResult.error || !workspaceProjectResult.data) {
    return {
      effectiveFeatureProjectId: project.id,
      effectiveReadProjectId: project.id,
      workspaceProjectId: null,
      sourceOpportunityId,
      origin: "project",
      organizationId: project.organization_id,
      projectSlug: project.slug,
      projectName: project.name,
      projectStage: project.stage,
    };
  }

  return {
    effectiveFeatureProjectId: project.id,
    effectiveReadProjectId: opportunityResult.data.workspace_project_id,
    workspaceProjectId: opportunityResult.data.workspace_project_id,
    sourceOpportunityId,
    origin: "project-read-fallback-workspace",
    organizationId: project.organization_id,
    projectSlug: project.slug,
    projectName: project.name,
    projectStage: project.stage,
  };
}
