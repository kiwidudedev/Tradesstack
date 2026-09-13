"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TakeoffPdfViewer } from "@/components/app/TakeoffPdfViewer";
import { TakeoffAddToQuotePanel } from "@/components/app/TakeoffAddToQuotePanel";
import { TakeoffAddToPurchaseOrderPanel } from "@/components/app/TakeoffAddToPurchaseOrderPanel";
import { TakeoffAddToVariationPanel } from "@/components/app/TakeoffAddToVariationPanel";
import type {
  TakeoffMeasurePageData,
  TakeoffMeasureViewerData,
} from "@/lib/takeoff/page-data-server";
import type { TakeoffActionResult } from "@/lib/takeoff/actions";
import { buildTakeoffHref, buildTakeoffOwnerApiQuery, buildTakeoffRegisterHref } from "@/lib/takeoff/navigation";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";
import { hasTakeoffPageMutationAdvanced } from "@/lib/takeoff/measurement-lifecycle";
import {
  reconcileCommittedTakeoffMeasurement,
  type TakeoffCommittedMeasurement,
} from "@/lib/takeoff/measurement-cache";
import {
  reconcileTakeoffDrawingSetSummaryMeasurement,
  type TakeoffDrawingSetSummaryMeasurement,
} from "@/lib/takeoff/measurement-summary";

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
  status: "active" | "archived" | "deleted";
  name: string;
  description: string;
  color_hex: string | null;
  display_value: number | null;
  display_unit: string | null;
  count_value: number | null;
  quantity?: number;
  measured_length_base?: number | null;
  measured_area_base?: number | null;
  measured_perimeter_base?: number | null;
  page_bbox_min_x?: number | null;
  page_bbox_min_y?: number | null;
  page_bbox_max_x?: number | null;
  page_bbox_max_y?: number | null;
  metadata?: unknown;
  version?: number;
  created_at?: string;
  updated_at?: string;
  points: TakeoffMeasurementPoint[];
  area_shapes: TakeoffAreaShape[];
  line_paths: TakeoffLinePath[];
}

type CachedTakeoffMeasurement = TakeoffMeasureViewerData["measurements"][number];
type WorkspaceCommittedMeasurement = TakeoffCommittedMeasurement<CachedTakeoffMeasurement> &
  Pick<
    CachedTakeoffMeasurement,
    | "id"
    | "status"
    | "measurement_kind"
    | "name"
    | "color_hex"
    | "display_value"
    | "display_unit"
  >;

interface TakeoffCalibration {
  id: string;
  base_unit: string;
  name: string;
  display_unit: string;
  reference_length_input: number;
  reference_length_base: number;
  scale_ratio: number;
  unit_system: string;
  is_active: boolean;
  superseded_by: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  point_a_x: number;
  point_a_y: number;
  point_b_x: number;
  point_b_y: number;
}

interface TakeoffCalibrationHistoryItem extends TakeoffCalibration {
  dependent_measurement_count: number;
}

interface DeleteTakeoffCalibrationResult {
  deletedCalibrationId: string;
  activeCalibration: TakeoffCalibration | null;
}

interface TakeoffMeasureWorkspaceProps {
  owner?: TakeoffRouteOwner;
  opportunityId?: string;
  title: string;
  drawingSetId: string;
  initialViewerData: TakeoffMeasureViewerData | null;
  initialSummaryMeasurements: TakeoffDrawingSetSummaryMeasurement[];
  canAddToPurchaseOrder?: boolean;
  canAddToVariation?: boolean;
  saveCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibration>>;
  setActiveCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibration | null>>;
  getCalibrationHistoryAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibrationHistoryItem[]>>;
  deleteCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<DeleteTakeoffCalibrationResult>>;
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
  data?: TakeoffMeasurePageData | TakeoffMeasureViewerData;
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
  if (!props.initialViewerData) return null;

  return <TakeoffMeasureWorkspaceWithViewer {...props} initialViewerData={props.initialViewerData} />;
}

function TakeoffMeasureWorkspaceWithViewer(
  props: TakeoffMeasureWorkspaceProps & {
    initialViewerData: TakeoffMeasureViewerData;
  }
) {
  const {
    owner: ownerProp,
    opportunityId,
    title,
    drawingSetId,
    initialViewerData,
    initialSummaryMeasurements,
    canAddToPurchaseOrder = false,
    canAddToVariation = false,
    saveCalibrationAction,
    setActiveCalibrationAction,
    getCalibrationHistoryAction,
    deleteCalibrationAction,
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
  const owner = useMemo<TakeoffRouteOwner>(
    () => ownerProp ?? { kind: "opportunity", slug: opportunityId ?? "" },
    [opportunityId, ownerProp],
  );
  const ownerApiQuery = useMemo(() => buildTakeoffOwnerApiQuery(owner), [owner]);

  const pdfUrlRef = useRef(initialViewerData.pdfUrl);
  const activeClientPageIdRef = useRef(initialViewerData.pageId);
  const serverPayloadRef = useRef<{
    drawingSetId: string;
    pageId: string;
  } | null>(null);
  const initialViewerDataRef = useRef<TakeoffMeasureViewerData | null>(null);
  const cacheRef = useRef(new Map<string, TakeoffMeasurePageData>());
  const pageSummaryMetadataRef = useRef(new Map<string, { pageNumber: number; pageLabel: string }>([
    [initialViewerData.pageId, {
      pageNumber: initialViewerData.pageNumber,
      pageLabel: initialViewerData.pageLabel,
    }],
  ]));
  const pageMutationRevisionRef = useRef(new Map<string, number>());
  const deletedMeasurementIdsRef = useRef<Record<string, Set<string>>>({});
  const inFlightRequestsRef = useRef(new Map<string, Promise<TakeoffMeasurePageData>>());
  const backgroundPageControllersRef = useRef(new Map<string, AbortController>());
  const activeRequestControllersRef = useRef(new Set<AbortController>());
  const requestIdRef = useRef(0);
  const [viewerData, setViewerData] = useState<TakeoffMeasureViewerData>(initialViewerData);
  const [summaryMeasurements, setSummaryMeasurements] = useState<TakeoffDrawingSetSummaryMeasurement[]>(
    initialSummaryMeasurements,
  );
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);
  const [pdfReloadKey, setPdfReloadKey] = useState(0);
  const [isPdfRetrying, setIsPdfRetrying] = useState(false);
  const [quoteMeasurementId, setQuoteMeasurementId] = useState<string | null>(null);
  const [purchaseOrderMeasurementId, setPurchaseOrderMeasurementId] = useState<string | null>(null);
  const [variationMeasurementId, setVariationMeasurementId] = useState<string | null>(null);
  const [quoteSuccessMessage, setQuoteSuccessMessage] = useState<string | null>(null);

  const currentHref = useMemo(
    () =>
      buildTakeoffHref(owner, "measure", {
        drawingSetId,
        pageId: viewerData.pageId,
      }),
    [drawingSetId, owner, viewerData.pageId]
  );
  const registerHref = useMemo(() => buildTakeoffRegisterHref(owner), [owner]);
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
      const href = buildTakeoffHref(owner, "measure", {
        drawingSetId,
        pageId,
      });

      if (mode === "replace") {
        window.history.replaceState({ pageId }, "", href);
        return;
      }

      window.history.pushState({ pageId }, "", href);
    },
    [drawingSetId, owner]
  );

  const fetchPageData = useCallback(
    async (pageId: string, externalSignal?: AbortSignal) => {
      const controller = new AbortController();
      activeRequestControllersRef.current.add(controller);
      const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
      const signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;
      let response: Response;
      try {
        response = await fetch(
        `/api/takeoff/measure-viewer?${ownerApiQuery}&drawingSetId=${encodeURIComponent(drawingSetId)}&pageId=${encodeURIComponent(pageId)}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        }
      );
      } catch (error) {
        if (signal.aborted) {
          throw new Error("The page request timed out. Please retry.");
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
        activeRequestControllersRef.current.delete(controller);
      }

      const payload = (await response.json()) as MeasurePageResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to load the requested measure page.");
      }

      return payload.data as TakeoffMeasurePageData;
    },
    [drawingSetId, ownerApiQuery]
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

      const revisionAtStart = pageMutationRevisionRef.current.get(pageId) ?? 0;
      const request = fetchPageData(pageId)
        .then((pageData) => {
          const filteredPageData = {
            ...pageData,
            measurements: filterDeletedMeasurements(pageId, pageData.measurements),
          };
          if (hasTakeoffPageMutationAdvanced(revisionAtStart, pageMutationRevisionRef.current.get(pageId) ?? 0)) {
            return cacheRef.current.get(pageId) ?? filteredPageData;
          }
          cacheRef.current.set(pageId, filteredPageData);
          return filteredPageData;
        })
        .finally(() => {
          inFlightRequestsRef.current.delete(pageId);
        });

      inFlightRequestsRef.current.set(pageId, request);
      return request;
    },
    [fetchPageData, filterDeletedMeasurements]
  );

  const primePage = useCallback(
    async (pageId: string | null) => {
      if (!pageId || cacheRef.current.has(pageId) || backgroundPageControllersRef.current.has(pageId)) {
        return;
      }

      const controller = new AbortController();
      backgroundPageControllersRef.current.set(pageId, controller);
      const revisionAtStart = pageMutationRevisionRef.current.get(pageId) ?? 0;
      try {
        const pageData = await fetchPageData(pageId, controller.signal);
        if (!controller.signal.aborted && !hasTakeoffPageMutationAdvanced(
          revisionAtStart,
          pageMutationRevisionRef.current.get(pageId) ?? 0
        )) {
          cacheRef.current.set(pageId, {
            ...pageData,
            measurements: filterDeletedMeasurements(pageId, pageData.measurements),
          });
        }
      } catch {
        // Ignore background preload failures. Explicit navigation handles errors visibly.
      } finally {
        backgroundPageControllersRef.current.delete(pageId);
      }
    },
    [fetchPageData, filterDeletedMeasurements]
  );

  const applyPageData = useCallback((pageData: TakeoffMeasurePageData) => {
    activeClientPageIdRef.current = pageData.pageId;
    pageSummaryMetadataRef.current.set(pageData.pageId, {
      pageNumber: pageData.pageNumber,
      pageLabel: pageData.pageLabel,
    });
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

  const patchCachedMeasurement = useCallback((
    pageId: string,
    measurement: WorkspaceCommittedMeasurement,
  ) => {
    pageMutationRevisionRef.current.set(pageId, (pageMutationRevisionRef.current.get(pageId) ?? 0) + 1);
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
      const existingIndex = currentMeasurements.findIndex((currentMeasurement) => currentMeasurement.id === measurement.id);

      if (measurement.status === "deleted") {
        if (existingIndex < 0) {
          return currentMeasurements;
        }

        return currentMeasurements.filter((currentMeasurement) => currentMeasurement.id !== measurement.id);
      }

      if (existingIndex < 0) {
        return [
          ...currentMeasurements,
          reconcileCommittedTakeoffMeasurement<(typeof currentMeasurements)[number]>(undefined, measurement),
        ];
      }

      const nextMeasurements = [...currentMeasurements];
      nextMeasurements[existingIndex] = reconcileCommittedTakeoffMeasurement<(typeof currentMeasurements)[number]>(
        currentMeasurements[existingIndex],
        measurement,
      );
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

    setSummaryMeasurements((current) => {
      const existing = current.find((item) => item.id === measurement.id);
      const measurementPage = pageSummaryMetadataRef.current.get(pageId);
      const now = new Date().toISOString();
      return reconcileTakeoffDrawingSetSummaryMeasurement(current, {
        id: measurement.id,
        pageId,
        pageNumber: measurementPage?.pageNumber ?? existing?.pageNumber ?? Number.MAX_SAFE_INTEGER,
        pageLabel: measurementPage?.pageLabel ?? existing?.pageLabel ?? "Page",
        name: measurement.name,
        measurementKind: measurement.measurement_kind,
        colorHex: measurement.color_hex,
        displayValue: measurement.display_value,
        displayUnit: measurement.display_unit,
        status: measurement.status,
        createdAt:
          typeof measurement.created_at === "string"
            ? measurement.created_at
            : existing?.createdAt ?? now,
      });
    });
  }, []);

  const patchCachedCalibration = useCallback(
    (pageId: string, calibration: TakeoffMeasureViewerData["activeCalibration"]) => {
      pageMutationRevisionRef.current.set(pageId, (pageMutationRevisionRef.current.get(pageId) ?? 0) + 1);
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

      backgroundPageControllersRef.current.forEach((controller) => controller.abort());
      backgroundPageControllersRef.current.clear();
      activeClientPageIdRef.current = pageId;
      const cached = cacheRef.current.get(pageId);
      if (cached) {
        applyPageData(cached);
        setPageLoadError(null);
        if (mode !== "none") {
          syncHistory(pageId, mode);
        }
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
    [applyPageData, getOrFetchPageData, syncHistory, viewerData.pageId]
  );

  const retrySourcePdf = useCallback(async () => {
    if (isPdfRetrying) {
      return;
    }
    setIsPdfRetrying(true);
    setPageLoadError(null);
    const controller = new AbortController();
    activeRequestControllersRef.current.add(controller);
    const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(
        `/api/takeoff/measure-viewer?${ownerApiQuery}&drawingSetId=${encodeURIComponent(drawingSetId)}&pageId=${encodeURIComponent(viewerData.pageId)}&refreshSource=1`,
        { credentials: "same-origin", cache: "no-store", signal: controller.signal }
      );
      const payload = (await response.json()) as MeasurePageResponse;
      const refreshed = payload.data as TakeoffMeasureViewerData | undefined;
      if (!response.ok || !payload.ok || !refreshed?.pdfUrl) {
        throw new Error(payload.error ?? "Unable to refresh the drawing PDF.");
      }
      pdfUrlRef.current = refreshed.pdfUrl;
      setViewerData((current) => ({ ...current, pdfUrl: refreshed.pdfUrl }));
      setPdfReloadKey((current) => current + 1);
    } catch (error) {
      setPageLoadError(controller.signal.aborted
        ? "The PDF refresh timed out. Please retry."
        : error instanceof Error ? error.message : "Unable to refresh the drawing PDF.");
    } finally {
      window.clearTimeout(timeoutId);
      activeRequestControllersRef.current.delete(controller);
      setIsPdfRetrying(false);
    }
  }, [drawingSetId, isPdfRetrying, ownerApiQuery, viewerData.pageId]);

  const primeAdjacentPagesAfterUsable = useCallback((usablePageId: string) => {
    if (usablePageId !== viewerData.pageId) {
      return;
    }
    backgroundPageControllersRef.current.forEach((controller) => controller.abort());
    backgroundPageControllersRef.current.clear();
    const run = () => {
      void primePage(viewerData.previousPageId);
      void primePage(viewerData.nextPageId);
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 750 });
    } else {
      globalThis.setTimeout(run, 250);
    }
  }, [primePage, viewerData.nextPageId, viewerData.pageId, viewerData.previousPageId]);

  useEffect(() => () => {
    backgroundPageControllersRef.current.forEach((controller) => controller.abort());
    backgroundPageControllersRef.current.clear();
    activeRequestControllersRef.current.forEach((controller) => controller.abort());
    activeRequestControllersRef.current.clear();
    inFlightRequestsRef.current.clear();
    cacheRef.current.clear();
    pageSummaryMetadataRef.current.clear();
  }, []);

  useEffect(() => {
    if (initialViewerDataRef.current === initialViewerData) {
      return;
    }
    initialViewerDataRef.current = initialViewerData;
    const previousServerPayload = serverPayloadRef.current;
    const hasSameServerPayload =
      previousServerPayload?.drawingSetId === drawingSetId &&
      previousServerPayload?.pageId === initialViewerData.pageId;
    const hasSameViewerSnapshot =
      viewerData.pageId === initialViewerData.pageId &&
      viewerData.pageNumber === initialViewerData.pageNumber &&
      viewerData.pageLabel === initialViewerData.pageLabel &&
      viewerData.pageWidthPts === initialViewerData.pageWidthPts &&
      viewerData.pageHeightPts === initialViewerData.pageHeightPts &&
      viewerData.rotationDegrees === initialViewerData.rotationDegrees &&
      viewerData.pageIndex === initialViewerData.pageIndex &&
      viewerData.totalPages === initialViewerData.totalPages &&
      viewerData.previousPageId === initialViewerData.previousPageId &&
      viewerData.nextPageId === initialViewerData.nextPageId &&
      viewerData.activeCalibration?.id === initialViewerData.activeCalibration?.id &&
      viewerData.measurementReadiness.activeCalibrationId === initialViewerData.measurementReadiness.activeCalibrationId &&
      viewerData.measurementReadiness.canCreateLine === initialViewerData.measurementReadiness.canCreateLine &&
      viewerData.measurementReadiness.canCreateArea === initialViewerData.measurementReadiness.canCreateArea &&
      viewerData.measurementReadiness.canCreateCount === initialViewerData.measurementReadiness.canCreateCount &&
      viewerData.measurementReadiness.message === initialViewerData.measurementReadiness.message &&
      viewerData.measurements === initialViewerData.measurements;

    if (hasSameServerPayload && hasSameViewerSnapshot) {
      return;
    }

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
    pageSummaryMetadataRef.current.set(initialViewerData.pageId, {
      pageNumber: initialViewerData.pageNumber,
      pageLabel: initialViewerData.pageLabel,
    });

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
  }, [drawingSetId, filterDeletedMeasurements, initialViewerData, viewerData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const currentDrawingSetId = url.searchParams.get("drawingSetId") ?? "";
    const currentPageId = url.searchParams.get("pageId") ?? "";
    const intendedDrawingSetId = drawingSetId;
    const intendedPageId = viewerData.pageId;

    if (currentDrawingSetId === intendedDrawingSetId && currentPageId === intendedPageId) {
      return;
    }

    window.history.replaceState({ pageId: viewerData.pageId }, "", currentHref);
  }, [currentHref, drawingSetId, viewerData.pageId]);

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
            summaryMeasurements={summaryMeasurements}
            measurementReadiness={viewerData.measurementReadiness}
            activeCalibration={viewerData.activeCalibration}
            drawingSetId={drawingSetId}
            pageId={viewerData.pageId}
            exitHref={registerHref}
            title={title}
            saveCalibrationAction={saveCalibrationAction}
            setActiveCalibrationAction={setActiveCalibrationAction}
            getCalibrationHistoryAction={getCalibrationHistoryAction}
            deleteCalibrationAction={deleteCalibrationAction}
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
            pdfReloadKey={pdfReloadKey}
            onRetryPdf={() => void retrySourcePdf()}
            onRetryPage={() => void loadPage(activeClientPageIdRef.current, "none")}
            onPageUsable={primeAdjacentPagesAfterUsable}
            onMeasurementCommitted={(pageId, measurement) => {
              patchCachedMeasurement(pageId, measurement);
            }}
            onCalibrationCommitted={(pageId, calibration) => {
              patchCachedCalibration(pageId, calibration as TakeoffMeasureViewerData["activeCalibration"]);
            }}
            onPageChange={(pageId) => {
              void loadPage(pageId, "push");
            }}
            onAddMeasurementToQuote={(measurementId) => {
              setPurchaseOrderMeasurementId(null);
              setVariationMeasurementId(null);
              setQuoteMeasurementId(measurementId);
            }}
            onAddMeasurementToPurchaseOrder={canAddToPurchaseOrder ? (measurementId) => {
              setQuoteMeasurementId(null);
              setVariationMeasurementId(null);
              setPurchaseOrderMeasurementId(measurementId);
            } : undefined}
            onAddMeasurementToVariation={canAddToVariation ? (measurementId) => {
              setQuoteMeasurementId(null);
              setPurchaseOrderMeasurementId(null);
              setVariationMeasurementId(measurementId);
            } : undefined}
          />
        </div>
      ) : (
        <MeasureWorkspaceStatus
          title="Drawing PDF Unavailable"
          body={pageLoadError ?? "The selected drawing set could not be opened for Measure right now. Reload the page or try another page in this set."}
          actionLabel={isPdfRetrying ? "Retrying…" : "Retry Drawing"}
          onAction={() => {
            void retrySourcePdf();
          }}
        />
      )}
      {quoteMeasurementId ? (
        <TakeoffAddToQuotePanel
          owner={owner}
          measurementId={quoteMeasurementId}
          onClose={() => setQuoteMeasurementId(null)}
          onSuccess={(message) => {
            setQuoteSuccessMessage(message);
            setQuoteMeasurementId(null);
            window.setTimeout(() => setQuoteSuccessMessage(null), 5000);
          }}
        />
      ) : null}
      {purchaseOrderMeasurementId ? (
        <TakeoffAddToPurchaseOrderPanel
          owner={owner}
          measurementId={purchaseOrderMeasurementId}
          onClose={() => setPurchaseOrderMeasurementId(null)}
          onSuccess={(message) => {
            setQuoteSuccessMessage(message);
            setPurchaseOrderMeasurementId(null);
            window.setTimeout(() => setQuoteSuccessMessage(null), 5000);
          }}
        />
      ) : null}
      {variationMeasurementId ? (
        <TakeoffAddToVariationPanel
          owner={owner}
          measurementId={variationMeasurementId}
          onClose={() => setVariationMeasurementId(null)}
          onSuccess={(message) => {
            setQuoteSuccessMessage(message);
            setVariationMeasurementId(null);
            window.setTimeout(() => setQuoteSuccessMessage(null), 5000);
          }}
        />
      ) : null}
      {quoteSuccessMessage ? (
        <div role="status" className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg">
          {quoteSuccessMessage}
        </div>
      ) : null}
    </div>
  );
}
