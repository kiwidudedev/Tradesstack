import { redirect } from "next/navigation";

export default async function AiAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const params = await searchParams;
  redirect(params.project ? `/app/projects/${encodeURIComponent(params.project)}?assistant=open` : "/app/dashboard?assistant=open");
}
