import { MeasureFullscreenShell } from "@/components/app/MeasureFullscreenShell";
import { TakeoffMeasureWorkspace } from "@/components/app/TakeoffMeasureWorkspace";
import { TakeoffPreparationWorkspace } from "@/components/app/TakeoffPreparationWorkspace";
import { TakeoffSourceDrawingUpload } from "@/components/app/TakeoffSourceDrawingUpload";
import type { TakeoffPageSearchParams } from "@/app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data";
import {
  getTakeoffMeasureViewerData,
  getTakeoffPageShellData,
} from "@/app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data";
import { createTakeoffPageActions } from "@/lib/takeoff/actions";
import { readSearchParam } from "@/lib/takeoff/navigation";

export default async function OpportunityTakeoffMeasurePage({
  params,
  searchParams,
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<TakeoffPageSearchParams>;
}) {
  const [{ opportunityId }, query] = await Promise.all([params, searchParams]);
  const { headerTitle, workspace, selectedDrawingSetId } = await getTakeoffPageShellData(opportunityId, query);
  const activeDrawingSetId = selectedDrawingSetId ?? "";
  const hasActiveDrawingSet = activeDrawingSetId.length > 0;
  const selectedPageId = readSearchParam(query.pageId);
  const shouldRetryPreview = readSearchParam(query.retryPreview) === "1";
  const actions = createTakeoffPageActions(opportunityId);
  const viewerData = hasActiveDrawingSet
    ? await getTakeoffMeasureViewerData({
        opportunityId,
        drawingSetId: activeDrawingSetId,
        pageId: selectedPageId,
        forcePreviewRetry: shouldRetryPreview,
        workspace,
      })
    : null;

  return (
    <MeasureFullscreenShell
      title={headerTitle}
      opportunityId={opportunityId}
    >
      {!hasActiveDrawingSet ? (
        <TakeoffSourceDrawingUpload
          opportunityId={opportunityId}
          organizationId={workspace.organizationId}
          projectId={workspace.projectId}
        />
      ) : viewerData ? (
        <TakeoffMeasureWorkspace
          opportunityId={opportunityId}
          drawingSetId={activeDrawingSetId}
          initialViewerData={viewerData}
          saveCalibrationAction={actions.saveCalibrationAction}
          setActiveCalibrationAction={actions.setActiveCalibrationAction}
          createLineMeasurementAction={actions.createLineMeasurementAction}
          createAreaMeasurementAction={actions.createAreaMeasurementAction}
          createCountMeasurementAction={actions.createCountMeasurementAction}
          updateMeasurementDetailsAction={actions.updateMeasurementDetailsAction}
          updateMeasurementGeometryAction={actions.updateMeasurementGeometryAction}
          updateMeasurementStatusAction={actions.updateMeasurementStatusAction}
        />
      ) : (
        <TakeoffPreparationWorkspace
          title="Preparing Measure Workspace"
          body="Takeoff page metadata is being prepared for this drawing set."
        />
      )}
    </MeasureFullscreenShell>
  );
}
