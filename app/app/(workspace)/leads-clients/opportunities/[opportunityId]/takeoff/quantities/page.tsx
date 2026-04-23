import type { ReactNode } from "react";
import { OpportunityWorkspaceShell } from "@/components/app/OpportunityWorkspaceShell";
import { TakeoffQuantitiesTable } from "@/components/app/TakeoffQuantitiesTable";
import { mapTakeoffToQuantityRows } from "@/lib/takeoff/quantities-adapter";
import { readSearchParam } from "@/lib/takeoff/navigation";
import {
  getActiveTakeoffCalibrationForPage,
  getTakeoffDrawingSetsForOpportunitySlug,
  getTakeoffMeasurementsForPage,
  getTakeoffPagesForOpportunitySlug,
} from "@/lib/takeoff-server";
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
  const selectedPageId = readSearchParam(query.pageId);
  const fallbackDrawingSets = selectedDrawingSetId ? [] : await getTakeoffDrawingSetsForOpportunitySlug(opportunityId);
  const resolvedDrawingSetId = selectedDrawingSetId ?? fallbackDrawingSets[0]?.id ?? null;

  let content: ReactNode;

  if (!resolvedDrawingSetId) {
    content = (
      <div className="min-w-0 flex-1 rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] px-5 py-6 text-[15px] font-medium text-[#4B5D79] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        No takeoff drawing set is available for this opportunity yet.
      </div>
    );
  } else {
    try {
      const pages = await getTakeoffPagesForOpportunitySlug(opportunityId, {
        drawingSetId: resolvedDrawingSetId,
        resolvedWorkspace: workspace,
      });

      if (pages.length === 0) {
        content = (
          <div className="min-w-0 flex-1 rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] px-5 py-6 text-[15px] font-medium text-[#4B5D79] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            The selected takeoff drawing set could not be loaded for Quantities.
          </div>
        );
      } else {
        const pageRows = await Promise.all(
          pages.map(async (page) => {
            const [measurements, activeCalibration] = await Promise.all([
              getTakeoffMeasurementsForPage(page.id),
              getActiveTakeoffCalibrationForPage(page.id),
            ]);

            return mapTakeoffToQuantityRows(measurements, activeCalibration, {
              pageLabel: page.page_label?.trim() || `Page ${page.page_number}`,
              includePageLabelInDescription: pages.length > 1,
            });
          })
        );
        const rows = pageRows.flat();
        const activePage =
          pages.find((page) => page.id === selectedPageId) ??
          pages[0] ??
          null;

        content = (
          <div className="min-w-0 flex-1 space-y-4">
            <div className="min-w-0 rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] px-5 py-4 text-[#4B5D79] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7B8CA5]">Quantities</p>
                  <h3 className="mt-1 truncate text-[18px] font-semibold text-[#1D2433]">
                    {pages.length > 1 ? "All Pages" : activePage?.page_label?.trim() || `Page ${activePage?.page_number ?? 1}`}
                  </h3>
                </div>
                <p className="text-[13px] font-medium text-[#64748B]">
                  {pages.length > 1
                    ? `${pages.length} pages in drawing set`
                    : `Page ${activePage?.page_number ?? 1} of ${pages.length}`}
                </p>
              </div>
            </div>
            <TakeoffQuantitiesTable rows={rows} />
          </div>
        );
      }
    } catch (error) {
      content = (
        <div className="min-w-0 flex-1 rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] px-5 py-6 text-[15px] font-medium text-[#4B5D79] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
          {error instanceof Error ? error.message : "The Quantities page could not be loaded right now."}
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
