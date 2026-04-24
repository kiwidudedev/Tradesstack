import type { ReactNode } from "react";
import { TakeoffQuantitiesFilters } from "@/components/app/TakeoffQuantitiesFilters";
import { OpportunityWorkspaceShell } from "@/components/app/OpportunityWorkspaceShell";
import type { QuantitiesExcelExportContext } from "@/lib/exports/quantities-excel";
import { mapTakeoffToQuantityRows } from "@/lib/takeoff/quantities-adapter";
import {
  getActiveTakeoffCalibrationForPage,
  getTakeoffDrawingSetsForOpportunitySlug,
  getTakeoffMeasurementsForPage,
  getTakeoffPagesForOpportunitySlug,
} from "@/lib/takeoff-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TakeoffPageSearchParams } from "../takeoff-page-data";
import { getTakeoffPageShellData } from "../takeoff-page-data";

export default async function OpportunityTakeoffQuantitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<TakeoffPageSearchParams>;
}) {
  const [{ opportunityId }, query] = await Promise.all([params, searchParams]);
  const { headerTitle, workspace, selectedDrawingSetId } = await getTakeoffPageShellData(opportunityId, query);
  const fallbackDrawingSets = selectedDrawingSetId ? [] : await getTakeoffDrawingSetsForOpportunitySlug(opportunityId);
  const resolvedDrawingSetId = selectedDrawingSetId ?? fallbackDrawingSets[0]?.id ?? null;
  const availableDrawingSets = selectedDrawingSetId ? await getTakeoffDrawingSetsForOpportunitySlug(opportunityId) : fallbackDrawingSets;
  const activeDrawingSet = availableDrawingSets.find((drawingSet) => drawingSet.id === resolvedDrawingSetId) ?? null;
  const exportDateIso = new Date().toISOString().slice(0, 10);
  const supabase = await createServerSupabaseClient();
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
    drawingSetName: activeDrawingSet?.file_name?.trim() || null,
    exportDateIso,
  };

  let content: ReactNode;

  if (!resolvedDrawingSetId) {
    content = (
      <div className="min-w-0 flex-1 rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] px-5 py-6 text-[15px] font-medium text-[#4B5D79] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        No takeoff drawing set is available for this opportunity yet.
      </div>
    );
  } else {
    let rows: ReturnType<typeof mapTakeoffToQuantityRows> | null = null;
    let loadErrorMessage: string | null = null;

    try {
      const pages = await getTakeoffPagesForOpportunitySlug(opportunityId, {
        drawingSetId: resolvedDrawingSetId,
        resolvedWorkspace: workspace,
      });

      if (pages.length === 0) {
        loadErrorMessage = "The selected takeoff drawing set could not be loaded for Quantities.";
      } else {
        const pageRows = await Promise.all(
          pages.map(async (page) => {
            const [measurements, activeCalibration] = await Promise.all([
              getTakeoffMeasurementsForPage(page.id),
              getActiveTakeoffCalibrationForPage(page.id),
            ]);

            return mapTakeoffToQuantityRows(measurements, activeCalibration, {
              drawingSetId: resolvedDrawingSetId,
              opportunityId,
              pageId: page.id,
              pageLabel: page.page_label?.trim() || `Page ${page.page_number}`,
              pageNumber: page.page_number,
            });
          })
        );
        rows = pageRows.flat();
      }
    } catch (error) {
      loadErrorMessage = error instanceof Error ? error.message : "The Quantities page could not be loaded right now.";
    }

    if (loadErrorMessage) {
      content = (
        <div className="min-w-0 flex-1 rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] px-5 py-6 text-[15px] font-medium text-[#4B5D79] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
          {loadErrorMessage}
        </div>
      );
    } else {
      content = (
        <div className="min-w-0 flex-1">
          <TakeoffQuantitiesFilters rows={rows ?? []} exportContext={exportContext} />
        </div>
      );
    }
  }

  return (
    <OpportunityWorkspaceShell title={headerTitle} opportunityId={opportunityId} activeTab="takeoff">
      {content}
    </OpportunityWorkspaceShell>
  );
}
