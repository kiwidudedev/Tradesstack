import { OpportunityPricingWorksheetBoard } from "@/components/app/OpportunityPricingWorksheetBoard";

export default async function OpportunityPricingWorksheetEditorPage({
  params,
}: {
  params: Promise<{ worksheetId: string }>;
}) {
  const { worksheetId } = await params;

  return <OpportunityPricingWorksheetBoard worksheetId={worksheetId} />;
}
