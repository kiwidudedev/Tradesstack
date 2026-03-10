import { notFound } from "next/navigation";
import { TradePackBuilderUploader } from "@/components/app/TradePackBuilderUploader";
import {
  getOrganizationProjectBySlugForCurrentUser,
  getProjectDrawingSetsForCurrentUser,
} from "@/lib/projects-server";

export default async function ProjectDrawingIntelligencePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getOrganizationProjectBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  const drawingSets = await getProjectDrawingSetsForCurrentUser(project.id);

  return (
    <TradePackBuilderUploader
      projectId={project.id}
      organizationId={project.organization_id}
      initialDrawingSets={drawingSets}
    />
  );
}
