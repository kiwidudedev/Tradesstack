import "server-only";

import { cache } from "react";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OpportunityWorkspaceData } from "@/lib/opportunity-workspace";
import { resolveOpportunityWorkspaceEnrichment } from "@/lib/opportunity-workspace-enrichment";

const OPPORTUNITY_WORKSPACE_REQUEST_TIMEOUT_MS = 10_000;

export const getOpportunityWorkspaceData = cache(async (opportunitySlug: string): Promise<OpportunityWorkspaceData | null> => {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return null;
  }

  const supabase = await createServerSupabaseClient({
    requestTimeoutMs: OPPORTUNITY_WORKSPACE_REQUEST_TIMEOUT_MS,
  });
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, slug, name, stage, converted_project_id, client_id, owner_user_id, created_by, workspace_project_id")
    .eq("organization_id", member.organization_id)
    .eq("slug", opportunitySlug)
    .maybeSingle();

  if (opportunityResult.error || !opportunityResult.data) {
    return null;
  }

  const opportunity = opportunityResult.data;
  const ownerUserId = opportunity.owner_user_id ?? opportunity.created_by ?? null;

  const [clientResult, ownerResult, latestQuoteResult, workspaceProjectResult] = await Promise.all([
    opportunity.client_id
      ? supabase
          .from("organization_clients")
          .select("company_name")
          .eq("organization_id", member.organization_id)
          .eq("id", opportunity.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ownerUserId
      ? supabase
          .from("organization_members")
          .select("display_name")
          .eq("organization_id", member.organization_id)
          .eq("user_id", ownerUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("project_quotes")
      .select("total_quote_price, status, quote_date, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("originating_opportunity_id", opportunity.id)
      .not("quote_series_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    opportunity.workspace_project_id
      ? supabase
          .from("organization_projects")
          .select("slug")
          .eq("organization_id", member.organization_id)
          .eq("id", opportunity.workspace_project_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const enrichment = resolveOpportunityWorkspaceEnrichment({
    client: clientResult,
    owner: ownerResult,
    latestQuote: latestQuoteResult,
    workspaceProject: workspaceProjectResult,
  });
  if (enrichment.warnings.length > 0) {
    console.warn("[opportunity/workspace] Optional metadata unavailable; rendering core workspace.", {
      opportunityId: opportunity.id,
      failures: enrichment.warnings,
    });
  }

  return {
    organizationId: member.organization_id,
    opportunityId: opportunity.id,
    slug: opportunity.slug,
    name: opportunity.name,
    stage: opportunity.stage,
    convertedProjectId: opportunity.converted_project_id,
    clientId: opportunity.client_id,
    clientName: enrichment.clientName,
    ownerUserId,
    ownerName: enrichment.ownerName,
    workspaceProjectId: opportunity.workspace_project_id,
    workspaceProjectSlug: enrichment.workspaceProjectSlug,
    latestQuoteSummary: enrichment.latestQuoteSummary,
  };
});
