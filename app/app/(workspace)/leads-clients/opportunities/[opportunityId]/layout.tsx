import { notFound, redirect } from "next/navigation";
import { OpportunityWorkspaceDataProvider } from "@/components/app/OpportunityWorkspaceDataProvider";
import { OpportunityWorkspaceLayoutShell } from "@/components/app/OpportunityWorkspaceLayoutShell";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";

export default async function OpportunityWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ opportunityId: string }>;
}) {
  const [{ opportunityId }, member] = await Promise.all([params, getCurrentOrganizationMember()]);

  if (!member) {
    redirect("/app/leads-clients/opportunities");
  }

  const opportunityWorkspaceData = await getOpportunityWorkspaceData(opportunityId);
  if (!opportunityWorkspaceData) {
    notFound();
  }

  return (
    <OpportunityWorkspaceDataProvider data={opportunityWorkspaceData}>
      <OpportunityWorkspaceLayoutShell
        title={opportunityWorkspaceData.name.trim() || "Opportunity"}
        opportunityId={opportunityId}
      >
        {children}
      </OpportunityWorkspaceLayoutShell>
    </OpportunityWorkspaceDataProvider>
  );
}
