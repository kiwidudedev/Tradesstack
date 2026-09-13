import { redirect } from "next/navigation";
import { MeasureFullscreenShell } from "@/components/app/MeasureFullscreenShell";
import { TakeoffMeasureWorkspace } from "@/components/app/TakeoffMeasureWorkspace";
import { TakeoffPreparationWorkspace } from "@/components/app/TakeoffPreparationWorkspace";
import type { TakeoffPageSearchParams } from "@/lib/takeoff/page-data-server";
import {
  getTakeoffMeasureViewerData,
  getTakeoffPageShellData,
} from "@/lib/takeoff/page-data-server";
import { createTakeoffPageActions } from "@/lib/takeoff/actions";
import {
  getTakeoffDrawingSetSummaryMeasurements,
  getTakeoffMeasurePagesForOpportunitySlug,
} from "@/lib/takeoff-server";
import { buildTakeoffHref, buildTakeoffRegisterHref, readSearchParam } from "@/lib/takeoff/navigation";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";
import { hasOrganizationPermission } from "@/lib/permissions-server";

export async function TakeoffMeasureRoutePage({
  owner,
  searchParams,
}: {
  owner: TakeoffRouteOwner;
  searchParams: Promise<TakeoffPageSearchParams>;
}) {
  const query = await searchParams;
  const {
    headerTitle,
    workspace,
    requestedDrawingSetId,
    selectedDrawingSetId,
    drawingSets,
  } = await getTakeoffPageShellData(owner, query);
  if (owner.kind === "opportunity" && workspace.canonicalProject) {
    const projectOwner = { kind: "project" as const, slug: workspace.canonicalProject.slug };
    const requestedPageId = readSearchParam(query.pageId);
    const authorizedPages = selectedDrawingSetId && requestedPageId
      ? await getTakeoffMeasurePagesForOpportunitySlug(owner.slug, { drawingSetId: selectedDrawingSetId, resolvedWorkspace: workspace })
      : [];
    const canonicalPageId = authorizedPages.some((page) => page.id === requestedPageId) ? requestedPageId : null;
    redirect(selectedDrawingSetId
      ? buildTakeoffHref(projectOwner, "measure", { drawingSetId: selectedDrawingSetId, pageId: canonicalPageId })
      : buildTakeoffRegisterHref(projectOwner));
  }
  if (!requestedDrawingSetId || requestedDrawingSetId !== selectedDrawingSetId) {
    redirect(buildTakeoffRegisterHref(owner));
  }
  const activeDrawingSetId = selectedDrawingSetId;
  const activeDrawingSet = drawingSets.find((drawingSet) => drawingSet.id === activeDrawingSetId);
  if (!activeDrawingSet) {
    redirect(buildTakeoffRegisterHref(owner));
  }
  const selectedPageId = readSearchParam(query.pageId);
  const shouldRetryPreview = readSearchParam(query.retryPreview) === "1";
  const actions = createTakeoffPageActions(owner);
  const [viewerData, initialSummaryMeasurements, canWritePurchaseOrders, canWriteVariations] = await Promise.all([
    getTakeoffMeasureViewerData({
      owner,
      drawingSetId: activeDrawingSetId,
      pageId: selectedPageId,
      forcePreviewRetry: shouldRetryPreview,
      workspace,
      authorizedDrawingSet: activeDrawingSet,
    }),
    getTakeoffDrawingSetSummaryMeasurements({
      organizationId: workspace.organizationId,
      projectId: workspace.projectId,
      drawingSetId: activeDrawingSetId,
    }),
    hasOrganizationPermission(workspace.organizationId, "purchase_orders.write"),
    hasOrganizationPermission(workspace.organizationId, "variations.write"),
  ]);

  return (
    <MeasureFullscreenShell title={headerTitle} opportunityId={owner.slug}>
      <div className="flex min-h-0 min-w-0 flex-1" key={activeDrawingSetId}>
        {!viewerData ? (
          <TakeoffPreparationWorkspace title="Preparing Measure Workspace" owner={owner} drawingSetId={activeDrawingSetId} />
        ) : (
          <TakeoffMeasureWorkspace
            owner={owner}
            canAddToPurchaseOrder={Boolean(
              workspace.opportunityId
              && workspace.routeProjectId
              && canWritePurchaseOrders
              && (workspace.conversionMode === "promoted" || workspace.conversionMode === "legacy-reference")
            )}
            canAddToVariation={Boolean(
              workspace.opportunityId
              && workspace.routeProjectId
              && canWriteVariations
              && (workspace.conversionMode === "promoted" || workspace.conversionMode === "legacy-reference")
            )}
            title={headerTitle}
            drawingSetId={activeDrawingSetId}
            initialViewerData={viewerData}
            initialSummaryMeasurements={initialSummaryMeasurements}
            saveCalibrationAction={actions.saveCalibrationAction}
            setActiveCalibrationAction={actions.setActiveCalibrationAction}
            getCalibrationHistoryAction={actions.getCalibrationHistoryAction}
            deleteCalibrationAction={actions.deleteCalibrationAction}
            createLineMeasurementAction={actions.createLineMeasurementAction}
            createAreaMeasurementAction={actions.createAreaMeasurementAction}
            createCountMeasurementAction={actions.createCountMeasurementAction}
            appendAreaShapeMeasurementAction={actions.appendAreaShapeMeasurementAction}
            deleteAreaShapeMeasurementAction={actions.deleteAreaShapeMeasurementAction}
            appendCountItemMeasurementAction={actions.appendCountItemMeasurementAction}
            deleteCountItemMeasurementAction={actions.deleteCountItemMeasurementAction}
            appendLinePathMeasurementAction={actions.appendLinePathMeasurementAction}
            deleteLinePathMeasurementAction={actions.deleteLinePathMeasurementAction}
            updateAreaShapeGeometryAction={actions.updateAreaShapeGeometryAction}
            updateLinePathGeometryAction={actions.updateLinePathGeometryAction}
            updateMeasurementDetailsAction={actions.updateMeasurementDetailsAction}
            updateMeasurementGeometryAction={actions.updateMeasurementGeometryAction}
            updateMeasurementStatusAction={actions.updateMeasurementStatusAction}
          />
        )}
      </div>
    </MeasureFullscreenShell>
  );
}
