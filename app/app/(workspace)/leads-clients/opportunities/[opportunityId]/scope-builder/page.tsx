import { notFound } from "next/navigation";
import { ScopeBuilderWorkbench } from "@/components/app/ScopeBuilderWorkbench";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";
import { getOrganizationProjectByIdForCurrentUser } from "@/lib/projects-server";
import {
  getTradePackWorkspaceBySlugForCurrentUser,
  getTradePackWorkspaceDrawingSetsForCurrentUser,
} from "@/lib/trade-pack-workspaces-server";
import { getOrCreateOpportunityWorkspaceSlugForCurrentUser } from "@/lib/leads-clients-server";
import {
  getGeneratedTradePackTradeId,
  getGeneratedTradePackTradeLabel,
  isGeneratedTradePackDrawingSet,
} from "@/lib/trade-packs";

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first.trim().length > 0 ? first.trim() : undefined;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

export default async function OpportunityScopeBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<{
    tradeId?: string | string[];
    storagePath?: string | string[];
    fileName?: string | string[];
    drawingSetId?: string | string[];
  }>;
}) {
  const [{ opportunityId }, query] = await Promise.all([params, searchParams]);
  const sharedOpportunity = await getOpportunityWorkspaceData(opportunityId);
  if (!sharedOpportunity) {
    notFound();
  }

  const project = sharedOpportunity.workspaceProjectId
    ? await getOrganizationProjectByIdForCurrentUser(sharedOpportunity.workspaceProjectId)
    : null;
  const resolvedProject =
    project ??
    await (async () => {
      const workspaceSlug = await getOrCreateOpportunityWorkspaceSlugForCurrentUser(opportunityId);
      return getTradePackWorkspaceBySlugForCurrentUser(workspaceSlug);
    })();

  if (!resolvedProject) {
    notFound();
  }

  const drawingSets = await getTradePackWorkspaceDrawingSetsForCurrentUser(resolvedProject.id);
  const generatedTradePacks = drawingSets
    .filter((drawingSet) => isGeneratedTradePackDrawingSet(drawingSet))
    .map((drawingSet) => ({
      id: drawingSet.id,
      fileName: drawingSet.file_name,
      storagePath: drawingSet.storage_path,
      fileSizeBytes: drawingSet.file_size_bytes,
      uploadedAt: drawingSet.uploaded_at,
      tradeId: getGeneratedTradePackTradeId(drawingSet),
      tradeLabel: getGeneratedTradePackTradeLabel(drawingSet),
    }));

  return (
    <div className="min-w-0 flex-1">
      <ScopeBuilderWorkbench
        projectId={resolvedProject.id}
        organizationId={resolvedProject.organization_id}
        initialTradeId={readSearchParam(query.tradeId)}
        initialStoragePath={readSearchParam(query.storagePath)}
        initialFileName={readSearchParam(query.fileName)}
        initialDrawingSetId={readSearchParam(query.drawingSetId)}
        initialGeneratedTradePacks={generatedTradePacks}
        initialStoredRuns={[]}
      />
    </div>
  );
}
