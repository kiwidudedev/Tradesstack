import { ProjectPricingWorksheetRoutePage } from "@/components/app/ProjectPricingWorksheetRoutePage";

export default async function QuotePricingWorksheetPage({
  params,
}: {
  params: Promise<{ projectId: string; quoteId: string; worksheetId: string }>;
}) {
  const { projectId, quoteId, worksheetId } = await params;
  return (
    <ProjectPricingWorksheetRoutePage
      projectSlug={projectId}
      quoteId={quoteId}
      worksheetId={worksheetId}
    />
  );
}
