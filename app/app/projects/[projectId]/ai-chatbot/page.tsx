import { AiChatbotPanel } from "@/components/app/AiChatbotPanel";

export default async function ProjectAiChatbotPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <AiChatbotPanel projectSlug={projectId} />;
}
