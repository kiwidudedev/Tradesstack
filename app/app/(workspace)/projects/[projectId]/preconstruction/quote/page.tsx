import { notFound, redirect } from "next/navigation";
import { appendSearchParams } from "@/lib/project-quote-route-selection";
import { resolveCanonicalProjectQuoteId } from "@/lib/project-quote-routing-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

export default async function ProjectQuoteResolverPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);
  if (!project) notFound();

  const selectedQuoteId = await resolveCanonicalProjectQuoteId({
    organizationId: project.organization_id,
    projectId: project.id,
  });
  const target = selectedQuoteId
    ? `/app/projects/${project.slug}/preconstruction/quote/${selectedQuoteId}`
    : `/app/projects/${project.slug}/preconstruction/quote/new`;
  redirect(appendSearchParams(target, query));
}
