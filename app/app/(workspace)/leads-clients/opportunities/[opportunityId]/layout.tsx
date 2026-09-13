import { notFound, redirect } from "next/navigation";
import { OpportunityWorkspaceDataProvider } from "@/components/app/OpportunityWorkspaceDataProvider";
import { OpportunityWorkspaceLayoutShell } from "@/components/app/OpportunityWorkspaceLayoutShell";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  resolveOpportunityFilesProjectForNavigation,
  shouldResolveOpportunityFilesProject,
} from "@/lib/documents/workspace-server";
import { resolveOpportunityFilesNavigation } from "@/lib/documents/files-navigation";

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
  const finalProject = shouldResolveOpportunityFilesProject(opportunityWorkspaceData)
    ? await resolveOpportunityFilesProjectForNavigation(
        await createServerSupabaseClient(),
        {
          organizationId: opportunityWorkspaceData.organizationId,
          opportunityId: opportunityWorkspaceData.opportunityId,
        },
      )
    : null;
  const filesNavigation = resolveOpportunityFilesNavigation({
    opportunitySlug: opportunityId,
    finalProject,
  });

  return (
    <OpportunityWorkspaceDataProvider data={opportunityWorkspaceData}>
      <OpportunityWorkspaceLayoutShell
        title={opportunityWorkspaceData.name.trim() || "Opportunity"}
        opportunityId={opportunityId}
        filesHref={filesNavigation.href}
        filesPrefetchKind={filesNavigation.prefetchKind}
        filesPrefetchSlug={filesNavigation.prefetchSlug}
      >
        {children}
      </OpportunityWorkspaceLayoutShell>
    </OpportunityWorkspaceDataProvider>
  );
}
