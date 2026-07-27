import "server-only";

import { cache } from "react";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { QuoteStatus } from "@/lib/supabase/types";
import type { OpportunityWorkspaceData } from "@/lib/opportunity-workspace";

export const getOpportunityWorkspaceData = cache(async (opportunitySlug: string): Promise<OpportunityWorkspaceData | null> => {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("id, slug, name, client_id, owner_user_id, created_by, workspace_project_id")
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

  if (clientResult.error || ownerResult.error || latestQuoteResult.error || workspaceProjectResult.error) {
    throw new Error(
      clientResult.error?.message ??
      ownerResult.error?.message ??
      latestQuoteResult.error?.message ??
      workspaceProjectResult.error?.message ??
      "Unable to load opportunity workspace data."
    );
  }

  return {
    organizationId: member.organization_id,
    opportunityId: opportunity.id,
    slug: opportunity.slug,
    name: opportunity.name,
    clientId: opportunity.client_id,
    clientName: clientResult.data?.company_name?.trim() || "Unassigned",
    ownerUserId,
    ownerName: ownerResult.data?.display_name || "Unassigned",
    workspaceProjectId: opportunity.workspace_project_id,
    workspaceProjectSlug: workspaceProjectResult.data?.slug ?? null,
    latestQuoteSummary: latestQuoteResult.data
      ? {
          totalQuotePrice:
            typeof latestQuoteResult.data.total_quote_price === "number"
              ? latestQuoteResult.data.total_quote_price
              : null,
          status: (latestQuoteResult.data.status as QuoteStatus | null) ?? null,
          quoteDate: latestQuoteResult.data.quote_date ?? null,
          updatedAt: latestQuoteResult.data.updated_at ?? null,
        }
      : null,
  };
});
