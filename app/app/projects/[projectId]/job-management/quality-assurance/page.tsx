import { notFound } from "next/navigation";
import { ProjectQualityAssuranceBoard } from "@/components/app/ProjectQualityAssuranceBoard";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

export default async function ProjectJobManagementQualityAssurancePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  return <ProjectQualityAssuranceBoard />;
}
