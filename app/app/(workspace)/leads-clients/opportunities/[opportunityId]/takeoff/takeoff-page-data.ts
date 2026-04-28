import { notFound } from "next/navigation";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";
import { readSearchParam } from "@/lib/takeoff/navigation";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  createSignedTakeoffDrawingSetUrlForOpportunity,
  ensureTakeoffPagesForOpportunityDrawingSet,
  getActiveTakeoffCalibrationForPage,
  getTakeoffMeasurementReadinessForPage,
  getTakeoffMeasurementsForPage,
  getTakeoffPagesForOpportunitySlug,
  type TakeoffCalibration,
  type TakeoffMeasurementReadiness,
  type TakeoffMeasurementWithPoints,
  type ResolvedTakeoffOpportunityWorkspace,
  resolveTakeoffWorkspaceForOpportunitySlug,
} from "@/lib/takeoff-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface TakeoffPageSearchParams {
  drawingSetId?: string | string[];
  pageId?: string | string[];
  calibrationStatus?: string | string[];
  measurementStatus?: string | string[];
  retryPreview?: string | string[];
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
  opportunityId: string,
  searchParams?: TakeoffPageSearchParams
) {
  const [member, sharedOpportunity] = await Promise.all([
    getCurrentOrganizationMember(),
    getOpportunityWorkspaceData(opportunityId),
  ]);
  const supabase = await createServerSupabaseClient();
  const workspace = await resolveTakeoffWorkspaceForOpportunitySlug(opportunityId, {
    supabase,
    member,
  });

  if (!workspace) {
    notFound();
  }

  return {
    headerTitle: sharedOpportunity?.name?.trim() || workspace.projectName,
    workspace,
    selectedDrawingSetId: readSearchParam(searchParams?.drawingSetId),
  };
}

export async function getTakeoffMeasurePageData(params: {
  opportunityId: string;
  drawingSetId: string;
  pageId?: string | null;
  forcePreviewRetry?: boolean;
  workspace?: ResolvedTakeoffOpportunityWorkspace;
}): Promise<TakeoffMeasurePageData | null> {
  const supabase = await createServerSupabaseClient();
  const workspace =
    params.workspace ??
    await resolveTakeoffWorkspaceForOpportunitySlug(params.opportunityId, {
      supabase,
    });

  if (!workspace) {
    return null;
  }

  const existingPages = await getTakeoffPagesForOpportunitySlug(params.opportunityId, {
    drawingSetId: params.drawingSetId,
    resolvedWorkspace: workspace,
    supabase,
  });
  const initialPages =
    existingPages.length > 0
      ? existingPages
      : await ensureTakeoffPagesForOpportunityDrawingSet(params.opportunityId, params.drawingSetId, {
          forcePreviewRetry: params.forcePreviewRetry,
          skipPreviewQueue: true,
        });
  const activePage =
    initialPages.find((page) => page.id === params.pageId) ??
    initialPages[0] ??
    null;

  if (!activePage) {
    return null;
  }

  const pageIndex = initialPages.findIndex((page) => page.id === activePage.id);
  const previousPage = pageIndex > 0 ? initialPages[pageIndex - 1] : null;
  const nextPage = pageIndex >= 0 && pageIndex < initialPages.length - 1 ? initialPages[pageIndex + 1] : null;
  const [measurements, activeCalibration] = await Promise.all([
    getTakeoffMeasurementsForPage(activePage.id, { supabase }),
    getActiveTakeoffCalibrationForPage(activePage.id, { supabase }),
  ]);
  const measurementReadiness = await getTakeoffMeasurementReadinessForPage(activePage.id, {
    supabase,
    activeCalibration,
  });

  return {
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
}

export async function getTakeoffMeasureViewerData(params: {
  opportunityId: string;
  drawingSetId: string;
  pageId?: string | null;
  forcePreviewRetry?: boolean;
  workspace?: ResolvedTakeoffOpportunityWorkspace;
}): Promise<TakeoffMeasureViewerData | null> {
  const supabase = await createServerSupabaseClient();
  const workspace =
    params.workspace ??
    await resolveTakeoffWorkspaceForOpportunitySlug(params.opportunityId, {
      supabase,
    });

  if (!workspace) {
    return null;
  }

  const [pdfUrl, pageData] = await Promise.all([
    createSignedTakeoffDrawingSetUrlForOpportunity({
      opportunitySlug: params.opportunityId,
      drawingSetId: params.drawingSetId,
      resolvedWorkspace: workspace,
      supabase,
    }),
    getTakeoffMeasurePageData({
      ...params,
      workspace,
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
