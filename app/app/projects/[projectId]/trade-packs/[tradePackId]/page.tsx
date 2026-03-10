import { notFound, redirect } from "next/navigation";
import { getOrganizationProjectBySlugForCurrentUser } from "@/lib/projects-server";

export default async function ProjectTradePackScopePage({
  params,
}: {
  params: Promise<{ projectId: string; tradePackId: string }>;
}) {
  const { projectId } = await params;
  const project = await getOrganizationProjectBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  redirect(`/app/projects/${project.slug}/scope-builder`);
}
