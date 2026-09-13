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
  if (!project?.source_opportunity_id) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data: quote, error: quoteError } = await supabase
    .from("project_quotes")
    .select("id")
    .eq("organization_id", project.organization_id)
    .eq("project_id", project.id)
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteError || !quote) {
    return null;
  }

  if (worksheetId) {
    const { data: worksheet, error: worksheetError } = await supabase
      .from("opportunity_pricing_worksheets")
      .select("id")
      .eq("organization_id", project.organization_id)
      .eq("opportunity_id", project.source_opportunity_id)
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
      opportunityId: project.source_opportunity_id,
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
