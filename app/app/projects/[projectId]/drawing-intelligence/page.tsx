import { notFound } from "next/navigation";
import { TradePackBuilderUploader } from "@/components/app/TradePackBuilderUploader";
import {
  getTradePackWorkspaceBySlugForCurrentUser,
  getTradePackWorkspaceDrawingSetsForCurrentUser,
} from "@/lib/trade-pack-workspaces-server";

export default async function ProjectDrawingIntelligencePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  const drawingSets = await getTradePackWorkspaceDrawingSetsForCurrentUser(project.id);

  return (
    <TradePackBuilderUploader
      projectId={project.id}
      organizationId={project.organization_id}
      initialDrawingSets={drawingSets}
    />
  );
}
