export function resolveOpportunityFilesNavigation({
  opportunitySlug,
  finalProject,
}: {
  opportunitySlug: string;
  finalProject: { slug: string } | null;
}) {
  if (finalProject) {
    return {
      href: `/app/projects/${finalProject.slug}/files`,
      prefetchKind: "project" as const,
      prefetchSlug: finalProject.slug,
    };
  }
  return {
    href: `/app/leads-clients/opportunities/${opportunitySlug}/files`,
    prefetchKind: "opportunity" as const,
    prefetchSlug: opportunitySlug,
  };
}
