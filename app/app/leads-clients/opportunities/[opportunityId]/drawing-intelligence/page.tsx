import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TradePackBuilderUploader } from "@/components/app/TradePackBuilderUploader";
import { interMedium } from "@/lib/fonts";
import { getOrCreateOpportunityWorkspaceSlugForCurrentUser } from "@/lib/leads-clients-server";
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
  const workspaceSlug = await getOrCreateOpportunityWorkspaceSlugForCurrentUser(opportunityId);
  const project = await getTradePackWorkspaceBySlugForCurrentUser(workspaceSlug);

  if (!project) {
    notFound();
  }

  const drawingSets = await getTradePackWorkspaceDrawingSetsForCurrentUser(project.id);

  return (
    <main className="space-y-4 pb-8">
      <Link
        href={`/app/leads-clients/opportunities/${opportunityId}`}
        className={`${interMedium.className} inline-flex h-8 w-fit items-center gap-1.5 rounded-[8px] px-2 text-xs font-medium text-[#667085] hover:text-[#344054]`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Lead Dashboard
      </Link>
      <TradePackBuilderUploader
        projectId={project.id}
        organizationId={project.organization_id}
        initialDrawingSets={drawingSets}
      />
    </main>
  );
}
