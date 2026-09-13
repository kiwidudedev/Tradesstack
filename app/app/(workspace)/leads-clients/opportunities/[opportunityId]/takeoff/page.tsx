import { notFound, redirect } from "next/navigation";
import { TakeoffDrawingSetRegister } from "@/components/app/TakeoffDrawingSetRegister";
import {
  getTakeoffAuthorizedContextForOwner,
  getTakeoffDrawingSetsForOpportunitySlug,
  getTakeoffDrawingTabsForOpportunitySlug,
} from "@/lib/takeoff-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildTakeoffRegisterHref } from "@/lib/takeoff/navigation";

export default async function OpportunityTakeoffRegisterPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const owner = { kind: "opportunity" as const, slug: opportunityId };
  const context = await getTakeoffAuthorizedContextForOwner(owner);
  if (!context) notFound();
  if (context.workspace.canonicalProject) {
    redirect(buildTakeoffRegisterHref({ kind: "project", slug: context.workspace.canonicalProject.slug }));
  }

  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const drawingSets = await getTakeoffDrawingSetsForOpportunitySlug(opportunityId, {
    resolvedWorkspace: context.workspace,
    supabase,
  });
  const registerRows = await getTakeoffDrawingTabsForOpportunitySlug(opportunityId, {
    drawingSets,
    resolvedWorkspace: context.workspace,
    supabase,
  });

  return (
    <TakeoffDrawingSetRegister
      owner={owner}
      organizationId={context.workspace.organizationId}
      projectId={context.workspace.projectId}
      initialDrawingSets={registerRows}
    />
  );
}
