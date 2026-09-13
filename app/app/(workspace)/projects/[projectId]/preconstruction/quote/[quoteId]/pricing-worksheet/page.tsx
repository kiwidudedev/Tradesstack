import { ProjectPricingWorksheetRoutePage } from "@/components/app/ProjectPricingWorksheetRoutePage";

export default async function QuotePricingWorksheetEntryPage({
  params,
}: {
  params: Promise<{ projectId: string; quoteId: string }>;
}) {
  const { projectId, quoteId } = await params;
  return (
    <ProjectPricingWorksheetRoutePage
      projectSlug={projectId}
      quoteId={quoteId}
    />
  );
}
