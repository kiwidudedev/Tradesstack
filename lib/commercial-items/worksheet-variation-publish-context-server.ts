import "server-only";

import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MUTABLE_VARIATION_STATUSES = new Set(["Draft", "Priced"]);
const IMMUTABLE_VARIATION_MESSAGE = "This variation can no longer be changed from the pricing worksheet.";

export interface WorksheetVariationPublishContext {
  organizationId: string;
  opportunityId: string;
  projectId: string;
  projectSlug: string | null;
  variationId: string;
  variationNumber: string;
  variationTitle: string;
  variationStatus: string;
  ownerType: PricingWorksheetOwnerContextValue["ownerType"];
}

export async function resolveWorksheetVariationPublishContextForCurrentUser(params: {
  owner: PricingWorksheetOwnerContextValue;
}): Promise<WorksheetVariationPublishContext> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("Unauthorized");
  }

  if (member.organization_id !== params.owner.organizationId) {
    throw new Error("Unauthorized");
  }

  if (params.owner.ownerType !== "variation") {
    throw new Error("Add to Variation is only available from variation-owned pricing worksheets.");
  }

  if (!params.owner.projectId) {
    throw new Error("Variation worksheet project context is missing.");
  }

  if (!params.owner.variationId) {
    throw new Error("Variation worksheet context is missing.");
  }

  const supabase = await createServerSupabaseClient();

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

  const opportunityId = projectResult.data.source_opportunity_id?.trim() ?? "";
  if (!opportunityId) {
    throw new Error("This variation is not linked to an opportunity workspace yet.");
  }

  const variationResult = await supabase
    .from("project_variations")
    .select("id, project_id, variation_number, variation_title, status")
    .eq("organization_id", params.owner.organizationId)
    .eq("id", params.owner.variationId)
    .eq("project_id", projectResult.data.id)
    .maybeSingle();

  if (variationResult.error) {
    throw new Error(variationResult.error.message);
  }

  if (!variationResult.data) {
    throw new Error("Variation not found.");
  }

  if (!MUTABLE_VARIATION_STATUSES.has(variationResult.data.status ?? "")) {
    throw new Error(IMMUTABLE_VARIATION_MESSAGE);
  }

  return {
    organizationId: params.owner.organizationId,
    opportunityId,
    projectId: projectResult.data.id,
    projectSlug: projectResult.data.slug ?? null,
    variationId: variationResult.data.id,
    variationNumber: variationResult.data.variation_number ?? "Variation",
    variationTitle: variationResult.data.variation_title ?? "",
    variationStatus: variationResult.data.status ?? "Draft",
    ownerType: params.owner.ownerType,
  };
}

export { IMMUTABLE_VARIATION_MESSAGE };
