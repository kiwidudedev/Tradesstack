import { notFound } from "next/navigation";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { AiChatbotPanel } from "@/components/app/AiChatbotPanel";

export default async function ProjectAiChatbotPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  return <AiChatbotPanel projectSlug={projectId} projectName={project.name} />;
}
