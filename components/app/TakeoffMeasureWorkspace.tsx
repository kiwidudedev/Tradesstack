"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TakeoffPdfViewer } from "@/components/app/TakeoffPdfViewer";
import type {
  TakeoffMeasurePageData,
  TakeoffMeasureViewerData,
} from "@/app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data";
import type { TakeoffActionResult } from "@/lib/takeoff/actions";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";

interface TakeoffMeasurementPoint {
  id: string;
  point_order: number;
  x: number;
  y: number;
}

interface TakeoffMeasurement {
  id: string;
  measurement_kind: "line" | "area" | "count";
  status: string;
  name: string;
  description: string;
  color_hex: string | null;
  display_value: number | null;
  display_unit: string | null;
  count_value: number | null;
  metadata?: Record<string, unknown> | null;
  points: TakeoffMeasurementPoint[];
}

interface TakeoffMeasurementReadiness {
  pageId: string;
  activeCalibrationId: string | null;
  canCreateLine: boolean;
  canCreateArea: boolean;
  canCreateCount: boolean;
  message: string;
}

interface TakeoffCalibration {
  id: string;
  name: string;
  display_unit: string;
  reference_length_input: number;
  point_a_x: number;
  point_a_y: number;
  point_b_x: number;
  point_b_y: number;
}

interface TakeoffMeasureWorkspaceProps {
  opportunityId: string;
  drawingSetId: string;
  initialViewerData: TakeoffMeasureViewerData;
  saveCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibration>>;
  setActiveCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibration | null>>;
  createLineMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  createAreaMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  createCountMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementDetailsAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementGeometryAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementStatusAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
}

interface MeasurePageResponse {
  ok: boolean;
  data?: TakeoffMeasurePageData;
  error?: string;
}

function areMeasurementListsEqual(left: TakeoffMeasurement[], right: TakeoffMeasurement[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((measurement, index) => {
    const nextMeasurement = right[index];
    if (!nextMeasurement) {
      return false;
    }

    if (
      measurement.id !== nextMeasurement.id ||
      measurement.status !== nextMeasurement.status ||
      measurement.name !== nextMeasurement.name ||
      measurement.description !== nextMeasurement.description ||
      measurement.color_hex !== nextMeasurement.color_hex ||
      measurement.display_value !== nextMeasurement.display_value ||
      measurement.display_unit !== nextMeasurement.display_unit ||
      measurement.count_value !== nextMeasurement.count_value ||
      JSON.stringify(measurement.metadata ?? null) !== JSON.stringify(nextMeasurement.metadata ?? null) ||
      measurement.points.length !== nextMeasurement.points.length
    ) {
      return false;
    }

    return measurement.points.every((point, pointIndex) => {
      const nextPoint = nextMeasurement.points[pointIndex];
      return Boolean(
        nextPoint &&
        point.id === nextPoint.id &&
        point.point_order === nextPoint.point_order &&
        point.x === nextPoint.x &&
        point.y === nextPoint.y
      );
    });
  });
}

function isReadinessEqual(left: TakeoffMeasurementReadiness, right: TakeoffMeasurementReadiness) {
  return (
    left.pageId === right.pageId &&
    left.activeCalibrationId === right.activeCalibrationId &&
    left.canCreateLine === right.canCreateLine &&
    left.canCreateArea === right.canCreateArea &&
    left.canCreateCount === right.canCreateCount &&
    left.message === right.message
  );
}

function isCalibrationEqual(left: TakeoffCalibration | null, right: TakeoffCalibration | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.name === right.name &&
    left.display_unit === right.display_unit &&
    left.reference_length_input === right.reference_length_input &&
    left.point_a_x === right.point_a_x &&
    left.point_a_y === right.point_a_y &&
    left.point_b_x === right.point_b_x &&
    left.point_b_y === right.point_b_y
  );
}

function MeasureWorkspaceStatus(params: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full min-h-[560px] w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(241,90,41,0.08),_transparent_28%),linear-gradient(180deg,#F6F8FB_0%,#E8EEF5_100%)] px-6">
      <div className="max-w-xl rounded-[18px] border border-white/75 bg-white/92 px-6 py-5 text-center shadow-[0_20px_52px_rgba(15,23,42,0.10)] backdrop-blur-sm">
        <p className="text-[18px] font-semibold text-[#1d2433]">{params.title}</p>
        <p className="mt-2 text-[14px] leading-[1.7] text-[#6B7C93]">{params.body}</p>
        {params.onAction && params.actionLabel ? (
          <button
            type="button"
            onClick={params.onAction}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-[10px] bg-[#F15A29] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#d94f22]"
          >
            {params.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TakeoffMeasureWorkspace(props: TakeoffMeasureWorkspaceProps) {
  const {
    opportunityId,
    drawingSetId,
    initialViewerData,
    saveCalibrationAction,
    setActiveCalibrationAction,
    createLineMeasurementAction,
    createAreaMeasurementAction,
    createCountMeasurementAction,
    updateMeasurementDetailsAction,
    updateMeasurementGeometryAction,
    updateMeasurementStatusAction,
  } = props;

  const pdfUrlRef = useRef(initialViewerData.pdfUrl);
  const serverPayloadRef = useRef<{
    drawingSetId: string;
    pageId: string;
  } | null>(null);
  const cacheRef = useRef(new Map<string, TakeoffMeasurePageData>());
  const requestIdRef = useRef(0);
  const [viewerData, setViewerData] = useState<TakeoffMeasureViewerData>(initialViewerData);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);

  const currentHref = useMemo(
    () =>
      buildTakeoffHref(opportunityId, "measure", {
        drawingSetId,
        pageId: viewerData.pageId,
      }),
    [drawingSetId, opportunityId, viewerData.pageId]
  );

  const syncHistory = useCallback(
    (pageId: string, mode: "push" | "replace") => {
      const href = buildTakeoffHref(opportunityId, "measure", {
        drawingSetId,
        pageId,
      });

      if (mode === "replace") {
        window.history.replaceState({ pageId }, "", href);
        return;
      }

      window.history.pushState({ pageId }, "", href);
    },
    [drawingSetId, opportunityId]
  );

  const fetchPageData = useCallback(
    async (pageId: string) => {
      const response = await fetch(
        `/api/takeoff/measure-viewer?opportunityId=${encodeURIComponent(opportunityId)}&drawingSetId=${encodeURIComponent(drawingSetId)}&pageId=${encodeURIComponent(pageId)}`,
        {
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as MeasurePageResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to load the requested measure page.");
      }

      return payload.data;
    },
    [drawingSetId, opportunityId]
  );

  const primePage = useCallback(
    async (pageId: string | null) => {
      if (!pageId || cacheRef.current.has(pageId)) {
        return;
      }

      try {
        const data = await fetchPageData(pageId);
        cacheRef.current.set(pageId, data);
      } catch {
        // Ignore background preload failures. Explicit navigation handles errors visibly.
      }
    },
    [fetchPageData]
  );

  const applyPageData = useCallback((pageData: TakeoffMeasurePageData) => {
    cacheRef.current.set(pageData.pageId, pageData);
    setViewerData((current) => ({
      ...pageData,
      pdfUrl: current.pdfUrl ?? pdfUrlRef.current,
    }));
  }, []);

  const handlePageDataChange = useCallback((pageData: {
    pageId: string;
    measurements: TakeoffMeasurement[];
    measurementReadiness: TakeoffMeasurementReadiness;
    activeCalibration: TakeoffCalibration | null;
  }) => {
    setViewerData((current) => {
      if (current.pageId !== pageData.pageId) {
        return current;
      }

      const nextPageData: TakeoffMeasurePageData = {
        pageId: current.pageId,
        pageNumber: current.pageNumber,
        pageLabel: current.pageLabel,
        pageWidthPts: current.pageWidthPts,
        pageHeightPts: current.pageHeightPts,
        rotationDegrees: current.rotationDegrees,
        pageIndex: current.pageIndex,
        totalPages: current.totalPages,
        previousPageId: current.previousPageId,
        nextPageId: current.nextPageId,
        measurements: pageData.measurements,
        measurementReadiness: pageData.measurementReadiness,
        activeCalibration: pageData.activeCalibration,
      };

      cacheRef.current.set(pageData.pageId, nextPageData);

      if (
        areMeasurementListsEqual(current.measurements, pageData.measurements) &&
        isReadinessEqual(current.measurementReadiness, pageData.measurementReadiness) &&
        isCalibrationEqual(current.activeCalibration, pageData.activeCalibration)
      ) {
        return current;
      }

      return {
        ...current,
        measurements: pageData.measurements,
        measurementReadiness: pageData.measurementReadiness,
        activeCalibration: pageData.activeCalibration,
      };
    });
  }, []);

  const loadPage = useCallback(
    async (pageId: string, mode: "push" | "replace" | "none" = "push") => {
      if (!pageId || pageId === viewerData.pageId) {
        if (mode === "replace") {
          syncHistory(pageId || viewerData.pageId, "replace");
        }
        return;
      }

      const cached = cacheRef.current.get(pageId);
      if (cached) {
        applyPageData(cached);
        setPageLoadError(null);
        if (mode !== "none") {
          syncHistory(pageId, mode);
        }
        void primePage(cached.previousPageId);
        void primePage(cached.nextPageId);
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsPageLoading(true);
      setPageLoadError(null);

      try {
        const pageData = await fetchPageData(pageId);
        if (requestIdRef.current !== requestId) {
          return;
        }

        applyPageData(pageData);
        if (mode !== "none") {
          syncHistory(pageData.pageId, mode);
        }
        void primePage(pageData.previousPageId);
        void primePage(pageData.nextPageId);
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setPageLoadError(error instanceof Error ? error.message : "Unable to load the requested measure page.");
      } finally {
        if (requestIdRef.current === requestId) {
          setIsPageLoading(false);
        }
      }
    },
    [applyPageData, fetchPageData, primePage, syncHistory, viewerData.pageId]
  );

  useEffect(() => {
    const nextPageData: TakeoffMeasurePageData = {
      pageId: initialViewerData.pageId,
      pageNumber: initialViewerData.pageNumber,
      pageLabel: initialViewerData.pageLabel,
      pageWidthPts: initialViewerData.pageWidthPts,
      pageHeightPts: initialViewerData.pageHeightPts,
      rotationDegrees: initialViewerData.rotationDegrees,
      pageIndex: initialViewerData.pageIndex,
      totalPages: initialViewerData.totalPages,
      previousPageId: initialViewerData.previousPageId,
      nextPageId: initialViewerData.nextPageId,
      measurements: initialViewerData.measurements,
      measurementReadiness: initialViewerData.measurementReadiness,
      activeCalibration: initialViewerData.activeCalibration,
    };

    cacheRef.current.set(initialViewerData.pageId, nextPageData);

    setViewerData((current) => {
      const previousServerPayload = serverPayloadRef.current;
      const isSameDrawingSet = previousServerPayload?.drawingSetId === drawingSetId;
      const isSamePage = current.pageId === initialViewerData.pageId;
      const preservedPdfUrl =
        isSameDrawingSet && isSamePage
          ? current.pdfUrl ?? pdfUrlRef.current ?? initialViewerData.pdfUrl
          : initialViewerData.pdfUrl ?? current.pdfUrl ?? pdfUrlRef.current;

      pdfUrlRef.current = preservedPdfUrl;
      serverPayloadRef.current = {
        drawingSetId,
        pageId: initialViewerData.pageId,
      };

      if (!isSameDrawingSet || !isSamePage) {
        return {
          ...initialViewerData,
          pdfUrl: preservedPdfUrl,
        };
      }

      return {
        ...current,
        measurements: initialViewerData.measurements,
        measurementReadiness: initialViewerData.measurementReadiness,
        activeCalibration: initialViewerData.activeCalibration,
        pdfUrl: preservedPdfUrl,
      };
    });
  }, [drawingSetId, initialViewerData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.location.pathname + window.location.search !== currentHref) {
      window.history.replaceState({ pageId: viewerData.pageId }, "", currentHref);
    }
  }, [currentHref, viewerData.pageId]);

  useEffect(() => {
    void primePage(viewerData.previousPageId);
    void primePage(viewerData.nextPageId);
  }, [primePage, viewerData.nextPageId, viewerData.previousPageId]);

  useEffect(() => {
    function handlePopState() {
      const pageId = new URL(window.location.href).searchParams.get("pageId");
      if (pageId && pageId !== viewerData.pageId) {
        void loadPage(pageId, "none");
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [loadPage, viewerData.pageId]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 bg-[#FBFEFE]">
      {viewerData.pdfUrl ? (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1">
          <TakeoffPdfViewer
            pdfUrl={viewerData.pdfUrl}
            initialZoom={1.2}
            resetZoom={1.2}
            viewportOrigin="top-left"
            pageNumber={viewerData.pageNumber}
            pageLabel={viewerData.pageLabel}
            pageWidthPts={viewerData.pageWidthPts}
            pageHeightPts={viewerData.pageHeightPts}
            rotationDegrees={viewerData.rotationDegrees}
            measurements={viewerData.measurements}
            measurementReadiness={viewerData.measurementReadiness}
            activeCalibration={viewerData.activeCalibration}
            drawingSetId={drawingSetId}
            pageId={viewerData.pageId}
            saveCalibrationAction={saveCalibrationAction}
            setActiveCalibrationAction={setActiveCalibrationAction}
            createLineMeasurementAction={createLineMeasurementAction}
            createAreaMeasurementAction={createAreaMeasurementAction}
            createCountMeasurementAction={createCountMeasurementAction}
            updateMeasurementDetailsAction={updateMeasurementDetailsAction}
            updateMeasurementGeometryAction={updateMeasurementGeometryAction}
            updateMeasurementStatusAction={updateMeasurementStatusAction}
            pageIndex={viewerData.pageIndex}
            totalPages={viewerData.totalPages}
            previousPageId={viewerData.previousPageId}
            nextPageId={viewerData.nextPageId}
            isPageLoading={isPageLoading}
            pageLoadError={pageLoadError}
            onPageChange={(pageId) => {
              void loadPage(pageId, "push");
            }}
            onPageDataChange={handlePageDataChange}
          />
        </div>
      ) : (
        <MeasureWorkspaceStatus
          title="Drawing PDF Unavailable"
          body="The selected drawing set could not be opened for Measure right now. Reload the page or try another page in this set."
          actionLabel="Retry Page"
          onAction={() => {
            void loadPage(viewerData.pageId, "none");
          }}
        />
      )}
    </div>
  );
}
