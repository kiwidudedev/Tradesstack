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

interface TakeoffAreaShapePoint {
  id: string;
  area_shape_id: string;
  point_order: number;
  x: number;
  y: number;
}

interface TakeoffAreaShape {
  id: string;
  measurement_id: string;
  shape_order: number;
  measured_area_base: number;
  measured_perimeter_base?: number;
  page_bbox_min_x: number | null;
  page_bbox_min_y: number | null;
  page_bbox_max_x: number | null;
  page_bbox_max_y: number | null;
  points: TakeoffAreaShapePoint[];
}

interface TakeoffLinePathPoint {
  id: string;
  line_path_id: string;
  point_order: number;
  x: number;
  y: number;
}

interface TakeoffLinePath {
  id: string;
  measurement_id: string;
  path_order: number;
  measured_length_base: number;
  page_bbox_min_x: number | null;
  page_bbox_min_y: number | null;
  page_bbox_max_x: number | null;
  page_bbox_max_y: number | null;
  points: TakeoffLinePathPoint[];
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
  measured_perimeter_base?: number | null;
  metadata?: Record<string, unknown> | null;
  points: TakeoffMeasurementPoint[];
  area_shapes: TakeoffAreaShape[];
  line_paths: TakeoffLinePath[];
}

interface TakeoffCalibration {
  id: string;
  base_unit: string;
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
  title: string;
  drawingSetId: string;
  initialViewerData: TakeoffMeasureViewerData;
  saveCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibration>>;
  setActiveCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibration | null>>;
  createLineMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  createAreaMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  createCountMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  appendAreaShapeMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  deleteAreaShapeMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  appendCountItemMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  deleteCountItemMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  appendLinePathMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  deleteLinePathMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateAreaShapeGeometryAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateLinePathGeometryAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementDetailsAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementGeometryAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementStatusAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
}

interface MeasurePageResponse {
  ok: boolean;
  data?: TakeoffMeasurePageData;
  error?: string;
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
    title,
    drawingSetId,
    initialViewerData,
    saveCalibrationAction,
    setActiveCalibrationAction,
    createLineMeasurementAction,
    createAreaMeasurementAction,
    createCountMeasurementAction,
    appendAreaShapeMeasurementAction,
    deleteAreaShapeMeasurementAction,
    appendCountItemMeasurementAction,
    deleteCountItemMeasurementAction,
    appendLinePathMeasurementAction,
    deleteLinePathMeasurementAction,
    updateAreaShapeGeometryAction,
    updateLinePathGeometryAction,
    updateMeasurementDetailsAction,
    updateMeasurementGeometryAction,
    updateMeasurementStatusAction,
  } = props;

  const pdfUrlRef = useRef(initialViewerData.pdfUrl);
  const activeClientPageIdRef = useRef(initialViewerData.pageId);
  const serverPayloadRef = useRef<{
    drawingSetId: string;
    pageId: string;
  } | null>(null);
  const cacheRef = useRef(new Map<string, TakeoffMeasurePageData>());
  const deletedMeasurementIdsRef = useRef<Record<string, Set<string>>>({});
  const inFlightRequestsRef = useRef(new Map<string, Promise<TakeoffMeasurePageData>>());
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
  const quantitiesHref = useMemo(
    () =>
      buildTakeoffHref(opportunityId, "quantities", {
        drawingSetId,
        pageId: viewerData.pageId,
      }),
    [drawingSetId, opportunityId, viewerData.pageId]
  );
  const filterDeletedMeasurements = useCallback(
    (pageId: string, measurements: TakeoffMeasurePageData["measurements"]) => {
      const deletedIds = deletedMeasurementIdsRef.current[pageId];
      if (!deletedIds || deletedIds.size === 0) {
        return measurements;
      }

      return measurements.filter((measurement) => !deletedIds.has(measurement.id));
    },
    []
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

  const getOrFetchPageData = useCallback(
    (pageId: string) => {
      const cached = cacheRef.current.get(pageId);
      if (cached) {
        return Promise.resolve(cached);
      }

      const inFlightRequest = inFlightRequestsRef.current.get(pageId);
      if (inFlightRequest) {
        return inFlightRequest;
      }

      const request = fetchPageData(pageId)
        .then((pageData) => {
          const filteredPageData = {
            ...pageData,
            measurements: filterDeletedMeasurements(pageId, pageData.measurements),
          };
          cacheRef.current.set(pageId, filteredPageData);
          return filteredPageData;
        })
        .finally(() => {
          inFlightRequestsRef.current.delete(pageId);
        });

      inFlightRequestsRef.current.set(pageId, request);
      return request;
    },
    [fetchPageData]
  );

  const primePage = useCallback(
    async (pageId: string | null) => {
      if (!pageId || cacheRef.current.has(pageId)) {
        return;
      }

      try {
        await getOrFetchPageData(pageId);
      } catch {
        // Ignore background preload failures. Explicit navigation handles errors visibly.
      }
    },
    [getOrFetchPageData]
  );

  const applyPageData = useCallback((pageData: TakeoffMeasurePageData) => {
    activeClientPageIdRef.current = pageData.pageId;
    const filteredPageData = {
      ...pageData,
      measurements: filterDeletedMeasurements(pageData.pageId, pageData.measurements),
    };
    cacheRef.current.set(pageData.pageId, filteredPageData);
    setViewerData((current) => ({
      ...filteredPageData,
      pdfUrl: current.pdfUrl ?? pdfUrlRef.current,
    }));
  }, [filterDeletedMeasurements]);

  const applyCalibrationReadiness = useCallback(
    (
      readiness: TakeoffMeasurePageData["measurementReadiness"],
      calibration: TakeoffMeasurePageData["activeCalibration"]
    ) => {
      if (!calibration) {
        return {
          ...readiness,
          activeCalibrationId: null,
          canCreateLine: false,
          canCreateArea: false,
          canCreateCount: true,
          message: "Set an active calibration before creating manual line or area measurements. Count measurements are ready now.",
        };
      }

      return {
        ...readiness,
        activeCalibrationId: calibration.id,
        canCreateLine: true,
        canCreateArea: true,
        canCreateCount: true,
        message: "This page is ready for manual line, area, and count measurements.",
      };
    },
    []
  );

  const patchCachedMeasurement = useCallback((pageId: string, measurement: TakeoffMeasureViewerData["measurements"][number]) => {
    const deletedIds =
      deletedMeasurementIdsRef.current[pageId] ??
      (deletedMeasurementIdsRef.current[pageId] = new Set<string>());
    if (measurement.status === "deleted") {
      deletedIds.add(measurement.id);
    } else {
      deletedIds.delete(measurement.id);
      if (deletedIds.size === 0) {
        delete deletedMeasurementIdsRef.current[pageId];
      }
    }

    const cachedPage = cacheRef.current.get(pageId);
    const patchMeasurements = (currentMeasurements: TakeoffMeasureViewerData["measurements"]) => {
      const nextMeasurement = measurement as (typeof currentMeasurements)[number];
      const existingIndex = currentMeasurements.findIndex((currentMeasurement) => currentMeasurement.id === measurement.id);

      if (measurement.status === "deleted") {
        if (existingIndex < 0) {
          return currentMeasurements;
        }

        return currentMeasurements.filter((currentMeasurement) => currentMeasurement.id !== measurement.id);
      }

      if (existingIndex < 0) {
        return [...currentMeasurements, nextMeasurement];
      }

      const nextMeasurements = [...currentMeasurements];
      nextMeasurements[existingIndex] = nextMeasurement;
      return nextMeasurements;
    };

    if (cachedPage) {
      cacheRef.current.set(pageId, {
        ...cachedPage,
        measurements: patchMeasurements(cachedPage.measurements),
      });
    }

    setViewerData((current) => {
      if (current.pageId !== pageId) {
        return current;
      }

      return {
        ...current,
        measurements: patchMeasurements(current.measurements),
      };
    });
  }, []);

  const patchCachedCalibration = useCallback(
    (pageId: string, calibration: TakeoffMeasureViewerData["activeCalibration"]) => {
      const cachedPage = cacheRef.current.get(pageId);
      if (cachedPage) {
        cacheRef.current.set(pageId, {
          ...cachedPage,
          activeCalibration: calibration,
          measurementReadiness: applyCalibrationReadiness(cachedPage.measurementReadiness, calibration),
        });
      }

      setViewerData((current) => {
        if (current.pageId !== pageId) {
          return current;
        }

        return {
          ...current,
          activeCalibration: calibration,
          measurementReadiness: applyCalibrationReadiness(current.measurementReadiness, calibration),
        };
      });
    },
    [applyCalibrationReadiness]
  );

  const loadPage = useCallback(
    async (pageId: string, mode: "push" | "replace" | "none" = "push") => {
      if (!pageId || pageId === viewerData.pageId) {
        if (mode === "replace") {
          syncHistory(pageId || viewerData.pageId, "replace");
        }
        return;
      }

      activeClientPageIdRef.current = pageId;
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
        const pageData = await getOrFetchPageData(pageId);
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
    [applyPageData, getOrFetchPageData, primePage, syncHistory, viewerData.pageId]
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
      measurements: filterDeletedMeasurements(initialViewerData.pageId, initialViewerData.measurements),
      measurementReadiness: initialViewerData.measurementReadiness,
      activeCalibration: initialViewerData.activeCalibration,
    };

    cacheRef.current.set(initialViewerData.pageId, nextPageData);

    setViewerData((current) => {
      const previousServerPayload = serverPayloadRef.current;
      const isFirstServerApply = previousServerPayload === null;
      const isSameDrawingSet = previousServerPayload?.drawingSetId === drawingSetId;
      const isActiveClientPage = activeClientPageIdRef.current === initialViewerData.pageId;
      const preservedPdfUrl =
        isSameDrawingSet && current.pageId === initialViewerData.pageId
          ? current.pdfUrl ?? pdfUrlRef.current ?? initialViewerData.pdfUrl
          : initialViewerData.pdfUrl ?? current.pdfUrl ?? pdfUrlRef.current;

      pdfUrlRef.current = preservedPdfUrl;
      serverPayloadRef.current = {
        drawingSetId,
        pageId: initialViewerData.pageId,
      };

      if (isFirstServerApply || !isSameDrawingSet) {
        activeClientPageIdRef.current = initialViewerData.pageId;
        return {
          ...initialViewerData,
          measurements: filterDeletedMeasurements(initialViewerData.pageId, initialViewerData.measurements),
          pdfUrl: preservedPdfUrl,
        };
      }

      if (!isActiveClientPage) {
        return current;
      }

      activeClientPageIdRef.current = initialViewerData.pageId;

      if (current.pageId !== initialViewerData.pageId) {
        return {
          ...initialViewerData,
          measurements: filterDeletedMeasurements(initialViewerData.pageId, initialViewerData.measurements),
          pdfUrl: preservedPdfUrl,
        };
      }

      return {
        ...current,
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
        measurements: filterDeletedMeasurements(initialViewerData.pageId, initialViewerData.measurements),
        measurementReadiness: initialViewerData.measurementReadiness,
        activeCalibration: initialViewerData.activeCalibration,
        pdfUrl: preservedPdfUrl,
      };
    });
  }, [drawingSetId, filterDeletedMeasurements, initialViewerData]);

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
            exitHref={quantitiesHref}
            title={title}
            saveCalibrationAction={saveCalibrationAction}
            setActiveCalibrationAction={setActiveCalibrationAction}
            createLineMeasurementAction={createLineMeasurementAction}
            createAreaMeasurementAction={createAreaMeasurementAction}
            createCountMeasurementAction={createCountMeasurementAction}
            appendAreaShapeMeasurementAction={appendAreaShapeMeasurementAction}
            deleteAreaShapeMeasurementAction={deleteAreaShapeMeasurementAction}
            appendCountItemMeasurementAction={appendCountItemMeasurementAction}
            deleteCountItemMeasurementAction={deleteCountItemMeasurementAction}
            appendLinePathMeasurementAction={appendLinePathMeasurementAction}
            deleteLinePathMeasurementAction={deleteLinePathMeasurementAction}
            updateAreaShapeGeometryAction={updateAreaShapeGeometryAction}
            updateLinePathGeometryAction={updateLinePathGeometryAction}
            updateMeasurementDetailsAction={updateMeasurementDetailsAction}
            updateMeasurementGeometryAction={updateMeasurementGeometryAction}
            updateMeasurementStatusAction={updateMeasurementStatusAction}
            pageIndex={viewerData.pageIndex}
            totalPages={viewerData.totalPages}
            previousPageId={viewerData.previousPageId}
            nextPageId={viewerData.nextPageId}
            isPageLoading={isPageLoading}
            pageLoadError={pageLoadError}
            onMeasurementCommitted={(pageId, measurement) => {
              patchCachedMeasurement(pageId, measurement as TakeoffMeasureViewerData["measurements"][number]);
            }}
            onCalibrationCommitted={(pageId, calibration) => {
              patchCachedCalibration(pageId, calibration as TakeoffMeasureViewerData["activeCalibration"]);
            }}
            onPageChange={(pageId) => {
              void loadPage(pageId, "push");
            }}
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
