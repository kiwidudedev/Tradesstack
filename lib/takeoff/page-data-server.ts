import "server-only";

import { notFound } from "next/navigation";
import { readSearchParam } from "@/lib/takeoff/navigation";
import {
  createSignedTakeoffDrawingSetUrlForOpportunity,
  getActiveTakeoffCalibrationForPage,
  getTakeoffAuthorizedContextForOwner,
  getTakeoffDrawingSetsForOpportunitySlug,
  getTakeoffMeasurementReadinessForPage,
  getTakeoffMeasurePagesForOpportunitySlug,
  getTakeoffMeasurementsForPage,
  type TakeoffCalibration,
  type TakeoffMeasurementReadiness,
  type TakeoffMeasurementWithPoints,
  type ResolvedTakeoffOpportunityWorkspace,
  type ProjectDrawingSet,
} from "@/lib/takeoff-server";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { selectScopedTakeoffPage } from "@/lib/takeoff/page-selection";
import { selectAuthorizedTakeoffDrawingSetId } from "@/lib/takeoff/drawing-selection";

function createTakeoffReadTrace(operation: string) {
  const startedAt = performance.now();
  const stages: Record<string, number> = {};
  return {
    async step<T>(stage: string, work: () => Promise<T>): Promise<T> {
      const stageStartedAt = performance.now();
      try {
        return await work();
      } finally {
        stages[stage] = Math.round((performance.now() - stageStartedAt) * 10) / 10;
      }
    },
    finish(details: Record<string, unknown>) {
      if (process.env.TAKEOFF_PERF_LOGS === "1") {
        console.info("[takeoff:read]", {
          operation,
          totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
          stages,
          ...details,
        });
      }
    },
  };
}

export interface TakeoffPageSearchParams {
  drawingSetId?: string | string[];
  pageId?: string | string[];
  calibrationStatus?: string | string[];
  measurementStatus?: string | string[];
  retryPreview?: string | string[];
  drawingScope?: string | string[];
}

export interface TakeoffMeasurePageData {
  pageId: string;
  pageNumber: number;
  pageLabel: string;
  pageWidthPts: number;
  pageHeightPts: number;
  rotationDegrees: number;
  pageIndex: number;
  totalPages: number;
  previousPageId: string | null;
  nextPageId: string | null;
  measurements: TakeoffMeasurementWithPoints[];
  measurementReadiness: TakeoffMeasurementReadiness;
  activeCalibration: TakeoffCalibration | null;
}

export interface TakeoffMeasureViewerData extends TakeoffMeasurePageData {
  pdfUrl: string | null;
}

export async function getTakeoffPageShellData(
  ownerInput: string | TakeoffRouteOwner,
  searchParams?: TakeoffPageSearchParams,
) {
  const owner: TakeoffRouteOwner = typeof ownerInput === "string"
    ? { kind: "opportunity", slug: ownerInput }
    : ownerInput;
  const context = await getTakeoffAuthorizedContextForOwner(owner);
  if (!context) {
    notFound();
  }
  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const requestedDrawingSetId = readSearchParam(searchParams?.drawingSetId);
  const drawingSets = await getTakeoffDrawingSetsForOpportunitySlug(owner.slug, {
    resolvedWorkspace: context.workspace,
    supabase,
  });
  const selectedDrawingSetId = selectAuthorizedTakeoffDrawingSetId(drawingSets, requestedDrawingSetId);

  return {
    headerTitle: context.workspace.opportunityName?.trim() || context.workspace.projectName,
    workspace: context.workspace,
    requestedDrawingSetId,
    selectedDrawingSetId,
    drawingSets,
  };
}

export async function getTakeoffMeasurePageData(params: {
  owner?: TakeoffRouteOwner;
  opportunityId?: string;
  drawingSetId: string;
  pageId?: string | null;
  forcePreviewRetry?: boolean;
  workspace?: ResolvedTakeoffOpportunityWorkspace;
}): Promise<TakeoffMeasurePageData | null> {
  const trace = createTakeoffReadTrace("measure-page-data");
  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const owner = params.owner ?? { kind: "opportunity" as const, slug: params.opportunityId ?? "" };
  const workspace = params.workspace ?? await trace.step("context", async () => {
    const context = await getTakeoffAuthorizedContextForOwner(owner);
    return context?.workspace ?? null;
  });

  if (!workspace) {
    return null;
  }

  const existingPages = await trace.step("pages", () => getTakeoffMeasurePagesForOpportunitySlug(owner.slug, {
    drawingSetId: params.drawingSetId,
    resolvedWorkspace: workspace,
    supabase,
  }));
  const initialPages = existingPages;
  const activePage = selectScopedTakeoffPage(initialPages, params.pageId);

  if (!activePage) {
    trace.finish({ drawingSetId: params.drawingSetId, outcome: "preparing", backendCallsMinimum: params.workspace ? 1 : 3 });
    return null;
  }

  const pageIndex = initialPages.findIndex((page) => page.id === activePage.id);
  const previousPage = pageIndex > 0 ? initialPages[pageIndex - 1] : null;
  const nextPage = pageIndex >= 0 && pageIndex < initialPages.length - 1 ? initialPages[pageIndex + 1] : null;
  const [measurements, activeCalibration] = await trace.step("measurement-payload", () => Promise.all([
    getTakeoffMeasurementsForPage(activePage.id, { supabase }),
    getActiveTakeoffCalibrationForPage(activePage.id, { supabase }),
  ]));
  const measurementReadiness = await trace.step("readiness", () => getTakeoffMeasurementReadinessForPage(activePage.id, {
    supabase,
    activeCalibration,
  }));

  const result = {
    pageId: activePage.id,
    pageNumber: activePage.page_number,
    pageLabel: activePage.page_label?.trim() || `Page ${activePage.page_number}`,
    pageWidthPts: activePage.page_width_pts,
    pageHeightPts: activePage.page_height_pts,
    rotationDegrees: activePage.rotation_degrees,
    pageIndex: Math.max(pageIndex, 0),
    totalPages: initialPages.length,
    previousPageId: previousPage?.id ?? null,
    nextPageId: nextPage?.id ?? null,
    measurements,
    measurementReadiness,
    activeCalibration,
  };
  trace.finish({
    drawingSetId: params.drawingSetId,
    pageId: activePage.id,
    measurementCount: measurements.length,
    backendCallsMinimum: params.workspace ? 4 : 6,
  });
  return result;
}

export async function getTakeoffMeasureViewerData(params: {
  owner?: TakeoffRouteOwner;
  opportunityId?: string;
  drawingSetId: string;
  pageId?: string | null;
  forcePreviewRetry?: boolean;
  workspace?: ResolvedTakeoffOpportunityWorkspace;
  authorizedDrawingSet?: ProjectDrawingSet;
}): Promise<TakeoffMeasureViewerData | null> {
  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const owner = params.owner ?? { kind: "opportunity" as const, slug: params.opportunityId ?? "" };
  const workspace = params.workspace ?? (await getTakeoffAuthorizedContextForOwner(owner))?.workspace ?? null;

  if (!workspace) {
    return null;
  }

  const [pageData, pdfUrl] = await Promise.all([
    getTakeoffMeasurePageData({
      owner: params.owner,
      opportunityId: params.opportunityId,
      drawingSetId: params.drawingSetId,
      pageId: params.pageId,
      forcePreviewRetry: params.forcePreviewRetry,
      workspace,
    }),
    createSignedTakeoffDrawingSetUrlForOpportunity({
      opportunitySlug: owner.slug,
      drawingSetId: params.drawingSetId,
      resolvedWorkspace: workspace,
      authorizedDrawingSet: params.authorizedDrawingSet,
      supabase,
    }),
  ]);

  if (!pageData) {
    return null;
  }

  return {
    pdfUrl,
    ...pageData,
  };
}
