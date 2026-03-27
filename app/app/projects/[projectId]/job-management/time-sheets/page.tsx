import { notFound } from "next/navigation";
import { ProjectTimeSheetsBoard } from "@/components/app/ProjectTimeSheetsBoard";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

export default async function ProjectJobManagementTimeSheetsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  return <ProjectTimeSheetsBoard />;
}
