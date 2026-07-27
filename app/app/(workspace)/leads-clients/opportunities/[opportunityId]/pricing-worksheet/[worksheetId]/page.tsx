import OpportunityPricingWorksheetRegisterPage from "../page";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function OpportunityPricingWorksheetEditorPage({
  params,
}: {
  params: Promise<{ opportunityId: string; worksheetId: string }>;
}) {
  const { opportunityId, worksheetId } = await params;
  const sharedOpportunity = await getOpportunityWorkspaceData(opportunityId);

  if (!sharedOpportunity) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("opportunity_pricing_worksheets")
    .select("id")
    .eq("id", worksheetId)
    .eq("opportunity_id", sharedOpportunity.opportunityId)
    .is("archived_at", null)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  return <OpportunityPricingWorksheetRegisterPage />;
}
