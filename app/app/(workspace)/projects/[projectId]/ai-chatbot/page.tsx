import { notFound, redirect } from "next/navigation";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

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

  redirect(`/app/ai-assistant?project=${encodeURIComponent(project.slug)}`);
}
