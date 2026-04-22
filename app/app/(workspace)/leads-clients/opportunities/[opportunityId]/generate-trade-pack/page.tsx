import { redirect } from "next/navigation";
import { getOrCreateOpportunityWorkspaceSlugForCurrentUser } from "@/lib/leads-clients-server";

export default async function OpportunityGenerateTradePackRedirectPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  await getOrCreateOpportunityWorkspaceSlugForCurrentUser(opportunityId);
  redirect(`/app/leads-clients/opportunities/${opportunityId}/drawing-intelligence`);
}
