import { redirect } from "next/navigation";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";
import { getTakeoffMeasurePageData } from "./takeoff-page-data";
import { getLatestActiveAreaMeasurementForOpportunitySlug, getTakeoffDrawingSetsForOpportunitySlug } from "@/lib/takeoff-server";

export default async function OpportunityTakeoffRedirectPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const latestAreaMeasurement = await getLatestActiveAreaMeasurementForOpportunitySlug(opportunityId);

  if (latestAreaMeasurement?.drawing_set_id && latestAreaMeasurement.page_id) {
    redirect(
      buildTakeoffHref(opportunityId, "measure", {
        drawingSetId: latestAreaMeasurement.drawing_set_id,
        pageId: latestAreaMeasurement.page_id,
      })
    );
  }

  const drawingSets = await getTakeoffDrawingSetsForOpportunitySlug(opportunityId);
  const latestDrawingSetId = drawingSets[0]?.id ?? null;

  if (!latestDrawingSetId) {
    redirect(buildTakeoffHref(opportunityId, "measure", {}));
  }

  const pageData = await getTakeoffMeasurePageData({
    opportunityId,
    drawingSetId: latestDrawingSetId,
  });

  redirect(
    buildTakeoffHref(opportunityId, "measure", {
      drawingSetId: latestDrawingSetId,
      pageId: pageData?.pageId ?? null,
    })
  );
}
