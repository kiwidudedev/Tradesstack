import { notFound } from "next/navigation";
import { ProjectTodosBoard } from "@/components/app/ProjectTodosBoard";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

export default async function ProjectJobManagementTodosPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  return <ProjectTodosBoard />;
}
