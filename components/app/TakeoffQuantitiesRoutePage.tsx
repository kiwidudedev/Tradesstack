import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { TakeoffQuantitiesFilters } from "@/components/app/TakeoffQuantitiesFilters";
import type { QuantitiesExcelExportContext } from "@/lib/exports/quantities-excel";
import { mapTakeoffToQuantityRows } from "@/lib/takeoff/quantities-adapter";
import { buildTakeoffHref, readSearchParam } from "@/lib/takeoff/navigation";
import {
  getActiveTakeoffCalibrationForPage,
  getActiveTakeoffCalibrationsForPages,
  getTakeoffMeasurementsForPage,
  getTakeoffMeasurementsForPages,
  getTakeoffCalibrationsForMeasurements,
  getTakeoffMeasurePagesForOpportunitySlug,
  getTakeoffMeasurePagesForDrawingSetsForOpportunitySlug,
} from "@/lib/takeoff-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TakeoffPageSearchParams } from "@/lib/takeoff/page-data-server";
import { getTakeoffPageShellData } from "@/lib/takeoff/page-data-server";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

async function loadAllQuantitiesRows(params: {
  owner: TakeoffRouteOwner;
  drawingSets: Array<{ id: string; display_name: string }>;
  workspace: Awaited<ReturnType<typeof getTakeoffPageShellData>>["workspace"];
}) {
  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const drawingSetIds = params.drawingSets.map((drawingSet) => drawingSet.id);
  const pages = await getTakeoffMeasurePagesForDrawingSetsForOpportunitySlug(params.owner.slug, {
    drawingSetIds,
    resolvedWorkspace: params.workspace,
    supabase,
  });

  if (pages.length === 0) {
    return {
      pages,
      rows: null as ReturnType<typeof mapTakeoffToQuantityRows> | null,
      loadErrorMessage: "The selected takeoff drawing set could not be loaded for Quantities.",
    };
  }

  const pageIds = pages.map((page) => page.id);
  const [measurementsByPage, activeCalibrationsByPage] = await Promise.all([
    getTakeoffMeasurementsForPages(pageIds, { supabase }),
    getActiveTakeoffCalibrationsForPages(pageIds, { supabase }),
  ]);
  const allMeasurements = Array.from(measurementsByPage.values()).flat();
  const calibrationsById = await getTakeoffCalibrationsForMeasurements(allMeasurements, { supabase });
  const pagesByDrawingSetId = new Map<string, typeof pages>();
  pages.forEach((page) => pagesByDrawingSetId.set(page.drawing_set_id, [...(pagesByDrawingSetId.get(page.drawing_set_id) ?? []), page]));
  const pageRows = params.drawingSets.flatMap((drawingSet) =>
    (pagesByDrawingSetId.get(drawingSet.id) ?? []).map((page) => mapTakeoffToQuantityRows(
      measurementsByPage.get(page.id) ?? [],
      activeCalibrationsByPage.get(page.id) ?? null,
      calibrationsById,
      {
        drawingSetId: drawingSet.id,
        drawingDisplayName: drawingSet.display_name,
        owner: params.owner,
        pageId: page.id,
        pageLabel: page.page_label?.trim() || `Page ${page.page_number}`,
        pageNumber: page.page_number,
      },
    )),
  );

  return {
    pages,
    rows: pageRows.flat(),
    loadErrorMessage: null,
  };
}

export async function TakeoffQuantitiesRoutePage({
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
    drawingSets: availableDrawingSets,
  } = await getTakeoffPageShellData(owner, query);
  const isAllDrawingsScope = readSearchParam(query.drawingScope) === "all";
  if (owner.kind === "opportunity" && workspace.canonicalProject) {
    const requestedPageId = readSearchParam(query.pageId);
    const authorizedPages = selectedDrawingSetId && requestedPageId
      ? await getTakeoffMeasurePagesForOpportunitySlug(owner.slug, { drawingSetId: selectedDrawingSetId, resolvedWorkspace: workspace })
      : [];
    const canonicalPageId = authorizedPages.some((page) => page.id === requestedPageId) ? requestedPageId : null;
    redirect(buildTakeoffHref({ kind: "project", slug: workspace.canonicalProject.slug }, "quantities", {
      drawingSetId: selectedDrawingSetId,
      pageId: canonicalPageId,
      drawingScope: isAllDrawingsScope ? "all" : null,
    }));
  }
  if (requestedDrawingSetId && requestedDrawingSetId !== selectedDrawingSetId) {
    redirect(buildTakeoffHref(owner, "quantities", {
      drawingSetId: selectedDrawingSetId,
      drawingScope: isAllDrawingsScope ? "all" : null,
    }));
  }
  const selectedPageId = readSearchParam(query.pageId);
  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const resolvedDrawingSetId = selectedDrawingSetId ?? availableDrawingSets[0]?.id ?? null;
  const activeDrawingSet = availableDrawingSets.find((drawingSet) => drawingSet.id === resolvedDrawingSetId) ?? null;
  const exportDateIso = new Date().toISOString().slice(0, 10);
  const { data: organizationRow } = await supabase
    .from("organizations")
    .select("name, logo_path, brand_primary_color")
    .eq("id", workspace.organizationId)
    .maybeSingle();
  const organizationRecord = organizationRow as {
    name?: string | null;
    logo_path?: string | null;
    brand_primary_color?: string | null;
  } | null;
  const organizationLogoUrl = organizationRecord?.logo_path
    ? supabase.storage.from("organization-logos").getPublicUrl(organizationRecord.logo_path).data.publicUrl
    : null;
  const exportContext: QuantitiesExcelExportContext = {
    organizationName: organizationRecord?.name?.trim() || "Tradesstack",
    organizationLogoUrl,
    organizationBrandPrimaryColor: organizationRecord?.brand_primary_color?.trim() || null,
    projectName: workspace.projectName?.trim() || headerTitle,
    drawingSetName: isAllDrawingsScope ? null : activeDrawingSet?.display_name?.trim() || null,
    drawingScope: isAllDrawingsScope ? "all" : "current",
    exportDateIso,
  };

  let content: ReactNode;

  if (!resolvedDrawingSetId) {
    content = (
      <div className="min-w-0 flex-1 rounded-[14px] border-[1.3px] border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-[15px] font-medium text-[var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        No takeoff drawing set is available yet.
      </div>
    );
  } else {
    let rows: ReturnType<typeof mapTakeoffToQuantityRows> | null = null;
    let loadErrorMessage: string | null = null;
    let currentPageOnly = false;
    let isHydratingAllPages = false;
    let isFullDatasetLoaded = true;
    let hydrationResult:
      | Promise<{
          rows: ReturnType<typeof mapTakeoffToQuantityRows>;
          error: string | null;
        }>
      | null = null;

    try {
      if (isAllDrawingsScope) {
        const fullDataset = await loadAllQuantitiesRows({ owner, drawingSets: availableDrawingSets, workspace });
        rows = fullDataset.rows;
        loadErrorMessage = fullDataset.loadErrorMessage;
      } else if (selectedPageId) {
        const pages = await getTakeoffMeasurePagesForOpportunitySlug(owner.slug, {
          drawingSetId: resolvedDrawingSetId,
          resolvedWorkspace: workspace,
          supabase,
        });
        const currentPage = pages.find((page) => page.id === selectedPageId) ?? null;
        if (currentPage) {
          const [measurements, activeCalibration] = await Promise.all([
            getTakeoffMeasurementsForPage(currentPage.id, { supabase }),
            getActiveTakeoffCalibrationForPage(currentPage.id, { supabase }),
          ]);
          const calibrationsById = await getTakeoffCalibrationsForMeasurements(measurements, { supabase });
          rows = mapTakeoffToQuantityRows(measurements, activeCalibration, calibrationsById, {
            drawingSetId: resolvedDrawingSetId,
            drawingDisplayName: activeDrawingSet?.display_name,
            owner,
            pageId: currentPage.id,
            pageLabel: currentPage.page_label?.trim() || `Page ${currentPage.page_number}`,
            pageNumber: currentPage.page_number,
          });
          currentPageOnly = true;
          isHydratingAllPages = true;
          isFullDatasetLoaded = false;
          hydrationResult = loadAllQuantitiesRows({ owner, drawingSets: activeDrawingSet ? [activeDrawingSet] : [], workspace })
            .then((fullDataset) => ({ rows: fullDataset.rows ?? [], error: fullDataset.loadErrorMessage }))
            .catch((hydrationError) => ({
              rows: [],
              error: hydrationError instanceof Error ? hydrationError.message : "Unable to load the remaining quantity rows.",
            }));
        } else {
          const fullDataset = await loadAllQuantitiesRows({ owner, drawingSets: activeDrawingSet ? [activeDrawingSet] : [], workspace });
          rows = fullDataset.rows;
          loadErrorMessage = fullDataset.loadErrorMessage;
        }
      } else {
        const fullDataset = await loadAllQuantitiesRows({ owner, drawingSets: activeDrawingSet ? [activeDrawingSet] : [], workspace });
        rows = fullDataset.rows;
        loadErrorMessage = fullDataset.loadErrorMessage;
      }
    } catch (error) {
      if (selectedPageId && !isAllDrawingsScope) {
        try {
          const fullDataset = await loadAllQuantitiesRows({ owner, drawingSets: activeDrawingSet ? [activeDrawingSet] : [], workspace });
          rows = fullDataset.rows;
          loadErrorMessage = fullDataset.loadErrorMessage;
          currentPageOnly = false;
          isHydratingAllPages = false;
          isFullDatasetLoaded = true;
          hydrationResult = null;
        } catch (fallbackError) {
          loadErrorMessage = fallbackError instanceof Error ? fallbackError.message : "The Quantities page could not be loaded right now.";
        }
      } else {
        loadErrorMessage = error instanceof Error ? error.message : "The Quantities page could not be loaded right now.";
      }
    }

    if (loadErrorMessage) {
      content = <div className="min-w-0 flex-1 rounded-[14px] border-[1.3px] border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-[15px] font-medium text-[var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">{loadErrorMessage}</div>;
    } else {
      content = (
        <div className="min-w-0 flex-1">
          <TakeoffQuantitiesFilters
            rows={rows ?? []}
            exportContext={exportContext}
            owner={owner}
            drawingScope={isAllDrawingsScope ? "all" : "current"}
            activeDrawingSetId={resolvedDrawingSetId}
            availableDrawingSets={availableDrawingSets.map((drawingSet) => ({ id: drawingSet.id, displayName: drawingSet.display_name }))}
            currentPageOnly={currentPageOnly}
            isHydratingAllPages={isHydratingAllPages}
            isFullDatasetLoaded={isFullDatasetLoaded}
            hydrationResult={hydrationResult}
          />
        </div>
      );
    }
  }

  return content;
}
