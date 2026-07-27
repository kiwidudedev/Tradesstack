import "server-only";

import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface WorksheetPurchaseOrderPublishContext {
  organizationId: string;
  opportunityId: string | null;
  projectId: string;
  projectSlug: string | null;
  ownerType: PricingWorksheetOwnerContextValue["ownerType"];
}

export async function resolveWorksheetPurchaseOrderPublishContextForCurrentUser(params: {
  owner: PricingWorksheetOwnerContextValue;
}): Promise<WorksheetPurchaseOrderPublishContext> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  if (member.organization_id !== params.owner.organizationId) {
    throw new Error("Unauthorized");
  }

  const supabase = await createServerSupabaseClient();

  if (params.owner.ownerType === "variation") {
    if (!params.owner.projectId) {
      throw new Error("Variation worksheet project context is missing.");
    }

    const projectResult = await supabase
      .from("organization_projects")
      .select("id, slug, source_opportunity_id")
      .eq("organization_id", params.owner.organizationId)
      .eq("id", params.owner.projectId)
      .maybeSingle();

    if (projectResult.error) {
      throw new Error(projectResult.error.message);
    }

    if (!projectResult.data) {
      throw new Error("Project not found.");
    }

    if (
      params.owner.opportunityId &&
      projectResult.data.source_opportunity_id &&
      projectResult.data.source_opportunity_id !== params.owner.opportunityId
    ) {
      throw new Error("Project must belong to the same opportunity.");
    }

    return {
      organizationId: params.owner.organizationId,
      opportunityId: params.owner.opportunityId ?? projectResult.data.source_opportunity_id ?? null,
      projectId: projectResult.data.id,
      projectSlug: projectResult.data.slug ?? null,
      ownerType: params.owner.ownerType,
    };
  }

  if (!params.owner.opportunityId) {
    throw new Error("Opportunity context is missing.");
  }

  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, converted_project_id")
    .eq("organization_id", params.owner.organizationId)
    .eq("id", params.owner.opportunityId)
    .maybeSingle();

  if (opportunityResult.error) {
    throw new Error(opportunityResult.error.message);
  }

  if (!opportunityResult.data) {
    throw new Error("Opportunity not found.");
  }

  if (!opportunityResult.data.converted_project_id) {
    throw new Error("Purchase Orders are available after this opportunity is converted to a project.");
  }

  const projectResult = await supabase
    .from("organization_projects")
    .select("id, slug, source_opportunity_id")
    .eq("organization_id", params.owner.organizationId)
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
    projectResult.data.source_opportunity_id !== params.owner.opportunityId
  ) {
    throw new Error("Project must belong to the same opportunity.");
  }

  return {
    organizationId: params.owner.organizationId,
    opportunityId: params.owner.opportunityId,
    projectId: projectResult.data.id,
    projectSlug: projectResult.data.slug ?? null,
    ownerType: params.owner.ownerType,
  };
}
