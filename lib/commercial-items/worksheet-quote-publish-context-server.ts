import "server-only";

import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface WorksheetQuotePublishContext {
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
  projectSlug: string | null;
  createdWorkspace: false;
  repairedWorkspaceLineage: false;
}

export async function resolveWorksheetQuotePublishContextForCurrentUser(params: {
  organizationId: string;
  opportunityId: string;
}): Promise<WorksheetQuotePublishContext> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  if (member.organization_id !== params.organizationId) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServerSupabaseClient();
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, organization_id, converted_project_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.opportunityId)
    .maybeSingle();

  if (opportunityResult.error) {
    throw new Error(opportunityResult.error.message);
  }

  if (!opportunityResult.data) {
    throw new Error("Opportunity not found.");
  }

  let projectId: string | null = null;
  let projectSlug: string | null = null;

  if (typeof opportunityResult.data.converted_project_id === "string") {
    const projectResult = await supabase
      .from("organization_projects")
      .select("id, slug, source_opportunity_id")
      .eq("organization_id", params.organizationId)
      .eq("id", opportunityResult.data.converted_project_id)
      .maybeSingle();

    if (projectResult.error) {
      throw new Error(projectResult.error.message);
    }

    if (!projectResult.data) {
      throw new Error("Converted project not found.");
    }

    if (
      projectResult.data.source_opportunity_id &&
      projectResult.data.source_opportunity_id !== params.opportunityId
    ) {
      throw new Error("This quote belongs to a different opportunity.");
    }

    projectId = projectResult.data.id;
    projectSlug = projectResult.data.slug ?? null;
  }

  return {
    organizationId: params.organizationId,
    opportunityId: params.opportunityId,
    projectId,
    projectSlug,
    createdWorkspace: false,
    repairedWorkspaceLineage: false,
  };
}
