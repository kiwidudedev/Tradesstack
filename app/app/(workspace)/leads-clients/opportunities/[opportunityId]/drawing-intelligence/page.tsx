import { notFound } from "next/navigation";
import { TradePackBuilderUploader } from "@/components/app/TradePackBuilderUploader";
import { getOrCreateOpportunityWorkspaceSlugForCurrentUser } from "@/lib/leads-clients-server";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";
import { getOrganizationProjectByIdForCurrentUser } from "@/lib/projects-server";
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
  const sharedOpportunity = await getOpportunityWorkspaceData(opportunityId);
  if (!sharedOpportunity) {
    notFound();
  }

  const project = sharedOpportunity.workspaceProjectId
    ? await getOrganizationProjectByIdForCurrentUser(sharedOpportunity.workspaceProjectId)
    : null;
  const resolvedProject =
    project ??
    await (async () => {
      const workspaceSlug = await getOrCreateOpportunityWorkspaceSlugForCurrentUser(opportunityId);
      return getTradePackWorkspaceBySlugForCurrentUser(workspaceSlug);
    })();

  if (!resolvedProject) {
    notFound();
  }

  const drawingSets = await getTradePackWorkspaceDrawingSetsForCurrentUser(resolvedProject.id);

  return (
    <div className="min-w-0 flex-1">
      <TradePackBuilderUploader
        projectId={resolvedProject.id}
        organizationId={resolvedProject.organization_id}
        initialDrawingSets={drawingSets}
        useOpportunityTone
      />
    </div>
  );
}
