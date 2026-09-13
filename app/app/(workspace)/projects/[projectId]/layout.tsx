import { notFound } from "next/navigation";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import ProjectLayoutShell from "@/components/app/ProjectLayoutShell";
import { resolveCanonicalProjectQuoteId } from "@/lib/project-quote-routing-server";
import { hasOrganizationPermission } from "@/lib/permissions-server";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const timingLabel = `[projects][layout] load:${projectId}`;
  console.time(timingLabel);

  const approximateBaseQueries = 2;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    console.info("[projects][layout] query-count", {
      projectId,
      approximateBaseQueries: 1,
    });
    console.timeEnd(timingLabel);
    notFound();
  }

  let pricingWorksheetQuoteId: string | null = null;
  const canViewQA = await hasOrganizationPermission(project.organization_id, "qa.view");
  try {
    pricingWorksheetQuoteId = await resolveCanonicalProjectQuoteId({
      organizationId: project.organization_id,
      projectId: project.id,
    });
  } catch (error) {
    console.warn("[projects][layout] pricing worksheet navigation resolution failed", {
      projectId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
  const pricingWorksheetHref = pricingWorksheetQuoteId
    ? `/app/projects/${project.slug}/preconstruction/quote/${pricingWorksheetQuoteId}/pricing-worksheet`
    : `/app/projects/${project.slug}/preconstruction/pricing-worksheet`;
  const quoteHref = pricingWorksheetQuoteId
    ? `/app/projects/${project.slug}/preconstruction/quote/${pricingWorksheetQuoteId}`
    : `/app/projects/${project.slug}/preconstruction/quote`;

  console.info("[projects][layout] query-count", {
    projectId,
    approximateBaseQueries,
    note: "Canonical Draft classification RPCs are additional when applicable.",
  });
  console.timeEnd(timingLabel);

  return (
    <ProjectLayoutShell
      projectName={project.name}
      projectStage={project.stage}
      quoteHref={quoteHref}
      pricingWorksheetHref={pricingWorksheetHref}
      canViewQA={canViewQA}
    >
      {children}
    </ProjectLayoutShell>
  );
}
