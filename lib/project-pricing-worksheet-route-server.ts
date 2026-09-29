import "server-only";

import { cache } from "react";
import { buildProjectPricingWorksheetOwner } from "@/lib/pricing-worksheet-owner";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

export interface ProjectPricingWorksheetRouteContext {
  owner: ReturnType<typeof buildProjectPricingWorksheetOwner>;
  quoteId: string;
  registerPath: string;
}

export async function loadProjectPricingWorksheetRouteContext(
  projectSlug: string,
  quoteId: string,
  worksheetId?: string,
): Promise<ProjectPricingWorksheetRouteContext | null> {
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectSlug);
  if (!project) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data: quote, error: quoteError } = await supabase
    .from("project_quotes")
    .select("id, source_opportunity_id, originating_opportunity_id")
    .eq("organization_id", project.organization_id)
    .eq("project_id", project.id)
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteError || !quote) {
    return null;
  }

  // Older converted projects may not have the opportunity copied onto the
  // project row even though their canonical quote retains the lineage needed
  // to resolve the project working workbook. Prefer the project value when it
  // exists, then fall back to the validated quote lineage.
  const opportunityId =
    project.source_opportunity_id ??
    quote.source_opportunity_id ??
    quote.originating_opportunity_id;
  if (!opportunityId) {
    return null;
  }

  if (worksheetId) {
    const { data: worksheet, error: worksheetError } = await supabase
      .from("opportunity_pricing_worksheets")
      .select("id")
      .eq("organization_id", project.organization_id)
      .eq("opportunity_id", opportunityId)
      .eq("project_id", project.id)
      .eq("id", worksheetId)
      .is("variation_id", null)
      .is("archived_at", null)
      .or("quote_id.is.null,clone_kind.eq.project_working")
      .maybeSingle();

    if (worksheetError || !worksheet) {
      return null;
    }
  }

  return {
    owner: buildProjectPricingWorksheetOwner({
      organizationId: project.organization_id,
      opportunityId,
      projectId: project.id,
      projectSlug: project.slug,
      readOnly: false,
    }),
    quoteId: quote.id,
    registerPath: `/app/projects/${project.slug}/preconstruction/quote/${quote.id}/pricing-worksheet`,
  };
}

export const resolveProjectPricingWorksheetRouteContext = cache(
  loadProjectPricingWorksheetRouteContext,
);
