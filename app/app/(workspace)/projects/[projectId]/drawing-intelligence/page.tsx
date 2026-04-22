import { notFound } from "next/navigation";
import { TradePackBuilderUploader } from "@/components/app/TradePackBuilderUploader";
import { getProjectDrawingSetsForCurrentUser } from "@/lib/projects-server";
import { getProjectWorkContextForCurrentUser } from "@/lib/project-work-context-server";

export default async function ProjectDrawingIntelligencePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await getProjectWorkContextForCurrentUser({ projectId });

  if (!context) {
    notFound();
  }

  const drawingSets = await getProjectDrawingSetsForCurrentUser(context.effectiveFeatureProjectId);

  return (
    <TradePackBuilderUploader
      projectId={context.effectiveFeatureProjectId}
      organizationId={context.organizationId}
      projectDashboardHref={`/app/projects/${context.projectSlug}/dashboard`}
      initialDrawingSets={drawingSets}
    />
  );
}
