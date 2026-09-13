import { notFound } from "next/navigation";
import { TakeoffDrawingSetRegister } from "@/components/app/TakeoffDrawingSetRegister";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getTakeoffAuthorizedContextForOwner,
  getTakeoffDrawingSetsForOpportunitySlug,
  getTakeoffDrawingTabsForOpportunitySlug,
} from "@/lib/takeoff-server";

export default async function ProjectTakeoffRegisterPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const owner = { kind: "project" as const, slug: projectId };
  const context = await getTakeoffAuthorizedContextForOwner(owner);
  if (!context) notFound();
  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const drawingSets = await getTakeoffDrawingSetsForOpportunitySlug(projectId, {
    resolvedWorkspace: context.workspace,
    supabase,
  });
  const registerRows = await getTakeoffDrawingTabsForOpportunitySlug(projectId, {
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

