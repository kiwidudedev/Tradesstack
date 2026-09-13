import { notFound, redirect } from "next/navigation";
import { SharedPricingWorksheetRegisterPage } from "@/components/app/PricingWorksheetRegisterPage";
import { appendSearchParams } from "@/lib/project-quote-route-selection";
import { resolveCanonicalProjectQuoteId } from "@/lib/project-quote-routing-server";
import { buildProjectPricingWorksheetOwner } from "@/lib/pricing-worksheet-owner";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

export default async function LegacyProjectPricingWorksheetDeepRoute({ params, searchParams }: {
  params: Promise<{ projectId: string; worksheetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId, worksheetId }, query] = await Promise.all([params, searchParams]);
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);
  if (!project?.source_opportunity_id) notFound();

  const quoteId = await resolveCanonicalProjectQuoteId({
    organizationId: project.organization_id,
    projectId: project.id,
  });
  if (quoteId) {
    redirect(appendSearchParams(
      `/app/projects/${project.slug}/preconstruction/quote/${quoteId}/pricing-worksheet/${worksheetId}`,
      query,
    ));
  }

  return (
    <SharedPricingWorksheetRegisterPage
      owner={buildProjectPricingWorksheetOwner({
        organizationId: project.organization_id,
        opportunityId: project.source_opportunity_id,
        projectId: project.id,
        projectSlug: project.slug,
      })}
      registerPath={`/app/projects/${project.slug}/preconstruction/pricing-worksheet`}
      contextLabel="project"
    />
  );
}
