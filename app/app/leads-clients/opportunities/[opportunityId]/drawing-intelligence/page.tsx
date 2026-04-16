import { notFound } from "next/navigation";
import { TradePackBuilderUploader } from "@/components/app/TradePackBuilderUploader";
import { OpportunityWorkspaceShell } from "@/components/app/OpportunityWorkspaceShell";
import { getOrCreateOpportunityWorkspaceSlugForCurrentUser } from "@/lib/leads-clients-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getTradePackWorkspaceBySlugForCurrentUser,
  getTradePackWorkspaceDrawingSetsForCurrentUser,
} from "@/lib/trade-pack-workspaces-server";

export default async function OpportunityDrawingIntelligencePage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const member = await getCurrentOrganizationMember();
  const supabase = await createServerSupabaseClient();
  const workspaceSlug = await getOrCreateOpportunityWorkspaceSlugForCurrentUser(opportunityId);
  const [project, opportunityResult] = await Promise.all([
    getTradePackWorkspaceBySlugForCurrentUser(workspaceSlug),
    member
      ? supabase
          .from("organization_opportunities")
          .select("name")
          .eq("organization_id", member.organization_id)
          .eq("slug", opportunityId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!project) {
    notFound();
  }

  if (opportunityResult.error) {
    throw new Error(opportunityResult.error.message);
  }

  const drawingSets = await getTradePackWorkspaceDrawingSetsForCurrentUser(project.id);
  const headerTitle = opportunityResult.data?.name?.trim() || project.name;

  return (
    <OpportunityWorkspaceShell
      title={headerTitle}
      opportunityId={opportunityId}
      activeTab="generate-trade-pack"
    >
      <div className="min-w-0 flex-1">
        <TradePackBuilderUploader
          projectId={project.id}
          organizationId={project.organization_id}
          initialDrawingSets={drawingSets}
          useOpportunityTone
        />
      </div>
    </OpportunityWorkspaceShell>
  );
}
