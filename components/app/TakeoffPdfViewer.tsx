"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  clamp,
  clampDocumentPointToBounds,
  convertDocumentAreaToRealWorld,
  convertDocumentDistanceToRealWorld,
  createPdfViewportTransform,
  documentPointsToNormalizedPoints,
  documentPointsToPath,
  getCalibrationScale,
  getDraftClosureSnapCandidate,
  getLineLabelPosition,
  getNearestPointHit,
  getNearestSegmentSnapCandidate,
  getNearestVertexSnapCandidate,
  getPointHit,
  getPolygonArea,
  getPolygonHit,
  getPolygonLabelPosition,
  getPolylineLength,
  getPolylineHit,
  getPolylineLabelPosition,
  getStableSnapCandidate,
  getSnapToleranceInDocumentSpace,
  getViewportRelativePoint,
  getZoomAdjustedViewportTolerance,
  isPointNearClosingTarget,
  type SnapCandidate,
  type Point2D,
  type Size2D,
  type ViewportOrigin,
} from "@/lib/pdf-coordinate-transform";
import type { TakeoffActionResult } from "@/lib/takeoff/actions";
import { leadsPanelClassName } from "@/components/app/LeadsPagePrimitives";
import { MeasureBottomToolbar } from "@/components/app/MeasureBottomToolbar";
import { Button } from "@/components/ui/button";

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

interface TakeoffPdfViewerProps {
  pdfUrl: string | null;
  initialZoom?: number;
  resetZoom?: number;
  viewportOrigin?: ViewportOrigin;
  pageNumber: number;
  pageLabel: string;
  pageIndex: number;
  totalPages: number;
  previousPageId: string | null;
  nextPageId: string | null;
  isPageLoading: boolean;
  pageLoadError: string | null;
  pageWidthPts: number;
  pageHeightPts: number;
  rotationDegrees: number;
  measurements: TakeoffMeasurement[];
  measurementReadiness: TakeoffMeasurementReadiness;
  activeCalibration: TakeoffCalibration | null;
  drawingSetId: string;
  pageId: string;
  saveCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibration>>;
  setActiveCalibrationAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffCalibration | null>>;
  createLineMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  createAreaMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  createCountMeasurementAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementDetailsAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementGeometryAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  updateMeasurementStatusAction: (formData: FormData) => Promise<TakeoffActionResult<TakeoffMeasurement>>;
  onPageChange: (pageId: string) => void;
  onPageDataChange?: (data: {
    pageId: string;
    measurements: TakeoffMeasurement[];
    measurementReadiness: TakeoffMeasurementReadiness;
    activeCalibration: TakeoffCalibration | null;
  }) => void;
}

interface PdfJsRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

interface PdfJsPageProxy {
  getViewport: (params: { scale: number; rotation?: number }) => { width: number; height: number };
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; background?: string }) => PdfJsRenderTask;
  cleanup?: () => void;
}

interface PdfJsDocumentProxy {
  getPage: (pageNumber: number) => Promise<PdfJsPageProxy>;
  destroy?: () => Promise<void> | void;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocumentProxy>;
  destroy?: () => Promise<void> | void;
}

interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (source: { url: string; withCredentials?: boolean }) => PdfJsLoadingTask;
}

type ToolMode = "select" | "calibrate" | "distance" | "polyline" | "area" | "count";
type SelectionState = { type: "calibration" } | { type: "measurement"; measurementId: string } | null;
type DraftTool = "calibrate" | "distance" | "polyline" | "area" | "count" | null;
type HitTarget =
  | { type: "calibration-point"; pointIndex: 0 | 1 }
  | { type: "calibration-segment" }
  | { type: "measurement-point"; measurementId: string; pointIndex: number }
  | { type: "measurement-segment"; measurementId: string };
interface DraftGeometryState {
  tool: DraftTool;
  points: Point2D[];
  hasChanges: boolean;
}
interface HoverState {
  rawDocumentPoint: Point2D | null;
  documentPoint: Point2D | null;
  hitTarget: HitTarget | null;
  snapCandidate: SnapCandidate | null;
}
interface HistoryCommand {
  id: string;
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}
interface SaveFeedbackState {
  kind: "idle" | "saving" | "saved" | "error";
  message: string;
  retryLabel?: string;
  retry?: (() => void) | null;
}
type InteractionState =
  | { kind: "idle" }
  | { kind: "pending-click"; pointerId: number; startX: number; startY: number; hitTarget: HitTarget | null }
  | { kind: "pan"; pointerId: number; lastX: number; lastY: number }
  | { kind: "edit"; pointerId: number; target: Extract<HitTarget, { type: "calibration-point" | "measurement-point" }>; dirty: boolean };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const ZOOM_SETTLE_MS = 360;
const HIT_TOLERANCE_PX = 16;
const SNAP_TOLERANCE_PX = 18;
const SNAP_STICKINESS_MULTIPLIER = 1.45;
const DEFAULT_DISTANCE_COLOR = "#F15A29";
const DEFAULT_AREA_COLOR = "#0F766E";
const DEFAULT_COUNT_COLOR = "#2563EB";
const HISTORY_LIMIT = 60;

interface DisplayMeasurement {
  id: string;
  name: string;
  description: string;
  measurementKind: "line" | "area" | "count";
  color: string;
  documentPoints: Point2D[];
  path: string;
  displayValue: number | null;
  displayUnit: string | null;
  label: string;
  labelAnchor: Point2D | null;
  isPolyline: boolean;
  countValue: number | null;
  tag: string | null;
}

function formatMeasurementValue(value: number | null, unit: string | null, fallback: string) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${rounded} ${unit}` : rounded;
}

function formatZoomLabel(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

function pointsAreEqual(left: Point2D, right: Point2D, tolerance = 0.01) {
  return Math.abs(left.x - right.x) <= tolerance && Math.abs(left.y - right.y) <= tolerance;
}

function getMeasurementLabelTopOffset(params: {
  isSelected: boolean;
  isHovered: boolean;
  measurementKind: "line" | "area" | "count";
}) {
  if (params.measurementKind === "count") {
    return params.isSelected ? -18 : params.isHovered ? -16 : -14;
  }

  if (params.isSelected) {
    return params.measurementKind === "area" ? -10 : -14;
  }

  if (params.isHovered) {
    return params.measurementKind === "area" ? -8 : -12;
  }

  return params.measurementKind === "area" ? -6 : -10;
}

function formatDraftToolLabel(tool: DraftTool) {
  if (tool === "count") {
    return "Count";
  }

  if (tool === "area") {
    return "Area";
  }

  if (tool === "polyline") {
    return "Polyline";
  }

  if (tool === "distance") {
    return "Distance";
  }

  if (tool === "calibrate") {
    return "Calibration";
  }

  return "Draft";
}

function getMeasurementFallbackLabel(measurementKind: "line" | "area", isPolyline: boolean) {
  if (measurementKind === "area") {
    return "Area";
  }

  if (measurementKind === "count") {
    return "Count";
  }

  return isPolyline ? "Polyline" : "Distance";
}

function cloneMeasurement(measurement: TakeoffMeasurement): TakeoffMeasurement {
  return {
    ...measurement,
    points: measurement.points.map((point) => ({ ...point })),
  };
}

function getPdfSourceKey(pdfUrl: string | null): string | null {
  if (!pdfUrl) {
    return null;
  }

  try {
    const parsed = new URL(pdfUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const [path] = pdfUrl.split("?");
    return path ?? pdfUrl;
  }
}

function getMeasurementTag(measurement: Pick<TakeoffMeasurement, "metadata">) {
  const rawValue =
    measurement.metadata && typeof measurement.metadata === "object"
      ? (measurement.metadata as Record<string, unknown>).tag
      : null;

  return typeof rawValue === "string" && rawValue.trim().length > 0 ? rawValue.trim() : null;
}

function serializeNormalizedPoints(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x}, ${point.y}`).join("\n");
}

function inferUnitSystem(displayUnit: string): "metric" | "imperial" {
  return displayUnit === "ft" || displayUnit === "in" ? "imperial" : "metric";
}

function MeasureEditorSidebar({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <aside className={`flex h-full w-[340px] shrink-0 flex-col overflow-hidden ${leadsPanelClassName} rounded-[18px]`}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {children}
      </div>
      {footer}
    </aside>
  );
}

function MeasureSidebarFooter({
  onCancel,
  onSave,
  saveDisabled,
  saveLabel,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  saveLabel: string;
}) {
  return (
    <div className="mt-auto border-t border-[#E2E8F1] bg-[#FBFEFE] px-4 py-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-10 flex-1 rounded-[10px] border-[#CBD5E1] bg-[#FBFEFE] text-[#475569] hover:bg-[#F8FAFC]"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="orange"
          onClick={onSave}
          disabled={saveDisabled}
          className="h-10 flex-1 rounded-[10px] bg-[#F15A29] text-white hover:bg-[#d94f22]"
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

function MeasureCanvasViewport({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-[18px] border border-[#E2E8F1] bg-[#EEF3F8] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
      {children}
    </div>
  );
}

async function loadPdfJsModule(): Promise<PdfJsModule> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  return pdfjs;
}

export function TakeoffPdfViewer({
  pdfUrl,
  initialZoom = 1,
  resetZoom = 1,
  viewportOrigin = "center",
  pageNumber,
  pageLabel,
  pageWidthPts,
  pageHeightPts,
  rotationDegrees,
  measurements,
  measurementReadiness,
  activeCalibration,
  drawingSetId,
  pageId,
  saveCalibrationAction,
  setActiveCalibrationAction,
  createLineMeasurementAction,
  createAreaMeasurementAction,
  createCountMeasurementAction,
  updateMeasurementDetailsAction,
  updateMeasurementGeometryAction,
  updateMeasurementStatusAction,
  pageIndex,
  totalPages,
  previousPageId,
  nextPageId,
  isPageLoading,
  pageLoadError,
  onPageChange,
  onPageDataChange,
}: TakeoffPdfViewerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
  const loadingTaskRef = useRef<PdfJsLoadingTask | null>(null);
  const documentRef = useRef<PdfJsDocumentProxy | null>(null);
  const loadedPdfSourceRef = useRef<string | null>(getPdfSourceKey(pdfUrl));
  const loadedDrawingSetIdRef = useRef<string | null>(drawingSetId);
  const settleTimeoutRef = useRef<number | null>(null);
  const transientZoomRef = useRef(1);
  const pendingCommittedZoomRef = useRef<number | null>(null);
  const isZoomGestureActiveRef = useRef(false);
  const latestRenderRequestRef = useRef(0);
  const renderedBitmapRef = useRef<{
    pageId: string;
    rotationDegrees: RotationDegrees;
    canvasWidth: number;
    canvasHeight: number;
    zoom: number;
    devicePixelRatio: number;
  } | null>(null);
  const defaultPanRef = useRef<Point2D>({ x: 0, y: 0 });
  const interactionRef = useRef<InteractionState>({ kind: "idle" });
  const activeSnapCandidateRef = useRef<SnapCandidate | null>(null);

  const [viewportSize, setViewportSize] = useState<Size2D>({ width: 0, height: 0 });
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const [pageProxy, setPageProxy] = useState<PdfJsPageProxy | null>(null);
  const [intrinsicPageSize, setIntrinsicPageSize] = useState<Size2D>({
    width: Math.max(pageWidthPts, 1),
    height: Math.max(pageHeightPts, 1),
  });
  const [committedZoom, setCommittedZoom] = useState(initialZoom);
  const [transientZoom, setTransientZoom] = useState(1);
  const [pendingCommittedZoom, setPendingCommittedZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSpacePanActive, setIsSpacePanActive] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [selection, setSelection] = useState<SelectionState>(null);
  const [hoverState, setHoverState] = useState<HoverState>({
    rawDocumentPoint: null,
    documentPoint: null,
    hitTarget: null,
    snapCandidate: null,
  });
  const [draftGeometry, setDraftGeometry] = useState<DraftGeometryState>({
    tool: null,
    points: [],
    hasChanges: false,
  });
  const [localMeasurements, setLocalMeasurements] = useState<TakeoffMeasurement[]>(measurements);
  const [localActiveCalibration, setLocalActiveCalibration] = useState<TakeoffCalibration | null>(activeCalibration);
  const [measurementPointOverrides, setMeasurementPointOverrides] = useState<Record<string, Point2D[]>>({});
  const [calibrationName, setCalibrationName] = useState("");
  const [calibrationLengthInput, setCalibrationLengthInput] = useState("");
  const [calibrationDisplayUnit, setCalibrationDisplayUnit] = useState("mm");
  const [calibrationUnitSystem, setCalibrationUnitSystem] = useState<"metric" | "imperial">("metric");
  const [measurementNameInput, setMeasurementNameInput] = useState("");
  const [measurementTagInput, setMeasurementTagInput] = useState("");
  const [measurementNoteInput, setMeasurementNoteInput] = useState("");
  const [filterType, setFilterType] = useState<"all" | "distance" | "area" | "count">("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"tag" | "type">("tag");
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedbackState>({
    kind: "idle",
    message: "",
    retry: null,
  });
  const [undoStack, setUndoStack] = useState<HistoryCommand[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryCommand[]>([]);
  const localMeasurementsRef = useRef(localMeasurements);
  const localActiveCalibrationRef = useRef(localActiveCalibration);
  const saveFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalMeasurements(measurements);
  }, [measurements]);

  useEffect(() => {
    setLocalActiveCalibration(activeCalibration);
  }, [activeCalibration]);

  useEffect(() => {
    localMeasurementsRef.current = localMeasurements;
  }, [localMeasurements]);

  useEffect(() => {
    localActiveCalibrationRef.current = localActiveCalibration;
  }, [localActiveCalibration]);

  useEffect(() => {
    pendingCommittedZoomRef.current = pendingCommittedZoom;
  }, [pendingCommittedZoom]);

  const documentPageSize = useMemo<Size2D>(
    () => ({
      width: Math.max(pageWidthPts, 1),
      height: Math.max(pageHeightPts, 1),
    }),
    [pageHeightPts, pageWidthPts]
  );

  const transform = useMemo(
    () =>
      createPdfViewportTransform({
        viewportSize,
        documentSize: intrinsicPageSize,
        committedZoom,
        transientZoom,
        pan,
        rotationDegrees,
        viewportOrigin,
        allowUnderfitPan: true,
        underfitPanViewportRatio: 0.2,
        allowExpandedOverflowBounds: true,
        overflowBiasMarginViewportRatio: 0.2,
      }),
    [committedZoom, intrinsicPageSize, pan, rotationDegrees, transientZoom, viewportOrigin, viewportSize]
  );
  const targetRenderZoom = pendingCommittedZoom ?? committedZoom;

  useEffect(() => {
    defaultPanRef.current = {
      x: transform.metrics.defaultPanX,
      y: transform.metrics.defaultPanY,
    };
  }, [transform.metrics.defaultPanX, transform.metrics.defaultPanY]);

  useEffect(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    const renderedPan = {
      x: transform.pan.x,
      y: transform.pan.y,
    };

    setPan((currentPan) => (pointsAreEqual(currentPan, renderedPan) ? currentPan : renderedPan));
  }, [
    committedZoom,
    transientZoom,
    transform.pan.x,
    transform.pan.y,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (!localActiveCalibration) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const savedCalibrationPoints = [
        transform.normalizedPointToDocumentPoint({ x: localActiveCalibration.point_a_x, y: localActiveCalibration.point_a_y }),
        transform.normalizedPointToDocumentPoint({ x: localActiveCalibration.point_b_x, y: localActiveCalibration.point_b_y }),
      ];

      setDraftGeometry((currentDraft) =>
        currentDraft.tool === "calibrate" && currentDraft.hasChanges
          ? currentDraft
          : { tool: "calibrate", points: savedCalibrationPoints, hasChanges: false }
      );
      setCalibrationName(localActiveCalibration.name);
      setCalibrationLengthInput(String(localActiveCalibration.reference_length_input));
      setCalibrationDisplayUnit(localActiveCalibration.display_unit);
      setCalibrationUnitSystem(inferUnitSystem(localActiveCalibration.display_unit));
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [localActiveCalibration, transform]);

  const savedMeasurements = useMemo<DisplayMeasurement[]>(
    () =>
      localMeasurements
        .filter(
          (measurement) =>
            measurement.status !== "deleted" &&
            (measurement.measurement_kind === "line" ||
              measurement.measurement_kind === "area" ||
              measurement.measurement_kind === "count")
        )
        .map((measurement) => {
          const documentPoints =
            measurementPointOverrides[measurement.id] ??
            measurement.points.map((point) => transform.normalizedPointToDocumentPoint(point));
          const isPolyline = measurement.measurement_kind === "line" && documentPoints.length > 2;
          const firstPoint = documentPoints[0] ?? null;
          const labelAnchor =
            measurement.measurement_kind === "count"
              ? firstPoint
              : measurement.measurement_kind === "area"
              ? getPolygonLabelPosition(documentPoints)
              : getPolylineLabelPosition(documentPoints, isPolyline ? 18 : 14);
          const fallbackLabel = getMeasurementFallbackLabel(measurement.measurement_kind, isPolyline);

          return {
            id: measurement.id,
            name: measurement.name,
            description: measurement.description,
            measurementKind: measurement.measurement_kind,
            color:
              measurement.color_hex?.trim() ||
              (measurement.measurement_kind === "area"
                ? DEFAULT_AREA_COLOR
                : measurement.measurement_kind === "count"
                  ? DEFAULT_COUNT_COLOR
                  : DEFAULT_DISTANCE_COLOR),
            documentPoints,
            path: documentPointsToPath(documentPoints),
            displayValue: measurement.display_value,
            displayUnit: measurement.display_unit,
            label: formatMeasurementValue(measurement.display_value, measurement.display_unit, fallbackLabel),
            labelAnchor,
            isPolyline,
            countValue: measurement.count_value,
            tag: getMeasurementTag(measurement),
          };
        }),
    [localMeasurements, measurementPointOverrides, transform]
  );

  useEffect(() => {
    if (selection?.type !== "measurement") {
      setMeasurementNameInput("");
      setMeasurementTagInput("");
      setMeasurementNoteInput("");
      return;
    }

    const selectedMeasurement = localMeasurements.find((measurement) => measurement.id === selection.measurementId);
    if (!selectedMeasurement) {
      return;
    }

    setMeasurementNameInput(selectedMeasurement.name);
    setMeasurementTagInput(getMeasurementTag(selectedMeasurement) ?? "");
    setMeasurementNoteInput(selectedMeasurement.description ?? "");
  }, [localMeasurements, selection]);

  const savedCalibrationPoints = useMemo(
    () =>
      localActiveCalibration
        ? [
            transform.normalizedPointToDocumentPoint({ x: localActiveCalibration.point_a_x, y: localActiveCalibration.point_a_y }),
            transform.normalizedPointToDocumentPoint({ x: localActiveCalibration.point_b_x, y: localActiveCalibration.point_b_y }),
          ]
        : [],
    [localActiveCalibration, transform]
  );

  const calibrationPointsForDisplay = useMemo(
    () => (draftGeometry.tool === "calibrate" && draftGeometry.points.length > 0 ? draftGeometry.points : savedCalibrationPoints),
    [draftGeometry.points, draftGeometry.tool, savedCalibrationPoints]
  );
  const measurementDraftPoints = useMemo(
    () => (draftGeometry.tool && draftGeometry.tool !== "calibrate" ? draftGeometry.points : []),
    [draftGeometry.points, draftGeometry.tool]
  );
  const hasUnsavedCalibrationGeometryChanges = draftGeometry.tool === "calibrate" && draftGeometry.hasChanges;
  const hasUnsavedCalibrationFormChanges =
    toolMode === "calibrate" &&
    ((localActiveCalibration?.name ?? "") !== calibrationName ||
      String(localActiveCalibration?.reference_length_input ?? "") !== calibrationLengthInput ||
      (localActiveCalibration?.display_unit ?? "mm") !== calibrationDisplayUnit ||
      inferUnitSystem(localActiveCalibration?.display_unit ?? "mm") !== calibrationUnitSystem);
  const hasUnsavedCalibrationChanges =
    (draftGeometry.tool === "calibrate" || toolMode === "calibrate") &&
    (hasUnsavedCalibrationGeometryChanges || hasUnsavedCalibrationFormChanges);
  const hasUnsavedMeasurementDraft =
    draftGeometry.tool !== null &&
    draftGeometry.tool !== "calibrate" &&
    draftGeometry.points.length > 0;

  const calibrationScale = useMemo(() => {
    if (calibrationPointsForDisplay.length < 2) {
      return null;
    }

    return getCalibrationScale({
      pointA: calibrationPointsForDisplay[0],
      pointB: calibrationPointsForDisplay[1],
      referenceLength: Number(calibrationLengthInput),
      displayUnit: calibrationDisplayUnit,
    });
  }, [calibrationDisplayUnit, calibrationLengthInput, calibrationPointsForDisplay]);

  const distanceDraftPreview = useMemo(() => {
    if (draftGeometry.tool !== "distance" || measurementDraftPoints.length === 0) {
      return null;
    }

    const previewPoints =
      measurementDraftPoints.length === 1 && hoverState.documentPoint
        ? [measurementDraftPoints[0], hoverState.documentPoint]
        : measurementDraftPoints;

    if (previewPoints.length < 2) {
      return null;
    }

    const length = getPolylineLength(previewPoints);
    const realWorld = convertDocumentDistanceToRealWorld(length, calibrationScale);

    return {
      points: previewPoints,
      path: documentPointsToPath(previewPoints),
      labelAnchor: getPolylineLabelPosition(previewPoints, 16),
      label: formatMeasurementValue(realWorld, calibrationScale?.displayUnit ?? null, "Distance"),
    };
  }, [calibrationScale, draftGeometry.tool, hoverState.documentPoint, measurementDraftPoints]);

  const polylineDraftPreview = useMemo(() => {
    if (draftGeometry.tool !== "polyline" || measurementDraftPoints.length === 0) {
      return null;
    }

    const previewPoints = hoverState.documentPoint
      ? [...measurementDraftPoints, hoverState.documentPoint]
      : measurementDraftPoints;

    if (previewPoints.length < 2) {
      return {
        points: previewPoints,
        path: documentPointsToPath(previewPoints),
        labelAnchor: null,
        label: "Polyline",
      };
    }

    const length = getPolylineLength(previewPoints);
    const realWorld = convertDocumentDistanceToRealWorld(length, calibrationScale);

    return {
      points: previewPoints,
      path: documentPointsToPath(previewPoints),
      labelAnchor: getPolylineLabelPosition(previewPoints, 18),
      label: formatMeasurementValue(realWorld, calibrationScale?.displayUnit ?? null, "Polyline"),
    };
  }, [calibrationScale, draftGeometry.tool, hoverState.documentPoint, measurementDraftPoints]);

  const areaDraftPreview = useMemo(() => {
    if (draftGeometry.tool !== "area" || measurementDraftPoints.length === 0) {
      return null;
    }

    const previewPoints = hoverState.documentPoint
      ? [...measurementDraftPoints, hoverState.documentPoint]
      : measurementDraftPoints;
    const canMeasureArea = previewPoints.length >= 3;
    const realWorldArea = canMeasureArea
      ? convertDocumentAreaToRealWorld(getPolygonArea(previewPoints), calibrationScale)
      : null;

    return {
      points: previewPoints,
      path: documentPointsToPath(previewPoints),
      labelAnchor: canMeasureArea ? getPolygonLabelPosition(previewPoints) : null,
      label: formatMeasurementValue(realWorldArea, calibrationScale ? `${calibrationScale.displayUnit}²` : null, "Area"),
      canFinish: measurementDraftPoints.length >= 3,
    };
  }, [calibrationScale, draftGeometry.tool, hoverState.documentPoint, measurementDraftPoints]);

  const countDraftPreview = useMemo(() => {
    if (toolMode !== "count" || !hoverState.documentPoint) {
      return null;
    }

    return {
      point: hoverState.documentPoint,
      labelAnchor: hoverState.documentPoint,
      label: "Count",
    };
  }, [hoverState.documentPoint, toolMode]);

  const countMeasurements = useMemo(
    () => savedMeasurements.filter((measurement) => measurement.measurementKind === "count"),
    [savedMeasurements]
  );

  const availableTags = useMemo(
    () =>
      Array.from(
        new Set(
          savedMeasurements
            .map((measurement) => measurement.tag)
            .filter((tag): tag is string => Boolean(tag))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [savedMeasurements]
  );

  const filteredMeasurements = useMemo(
    () =>
      savedMeasurements.filter((measurement) => {
        const matchesType =
          filterType === "all" ||
          (filterType === "distance" && measurement.measurementKind === "line") ||
          (filterType === "area" && measurement.measurementKind === "area") ||
          (filterType === "count" && measurement.measurementKind === "count");
        const matchesTag = filterTag === "all" || measurement.tag === filterTag;
        return matchesType && matchesTag;
      }),
    [filterTag, filterType, savedMeasurements]
  );

  const groupedMeasurements = useMemo(() => {
    const groups = new Map<string, DisplayMeasurement[]>();

    filteredMeasurements.forEach((measurement) => {
      const groupKey =
        groupBy === "tag"
          ? measurement.tag || "Uncategorized"
          : measurement.measurementKind === "line"
            ? measurement.isPolyline
              ? "Polyline / Distance"
              : "Distance"
            : measurement.measurementKind === "area"
              ? "Area"
              : "Count";

      const existingGroup = groups.get(groupKey) ?? [];
      existingGroup.push(measurement);
      groups.set(groupKey, existingGroup);
    });

    return Array.from(groups.entries()).map(([key, measurements]) => {
      const totals = measurements.reduce<Record<string, number>>((accumulator, measurement) => {
        const totalKey =
          measurement.measurementKind === "count"
            ? "count"
            : `${measurement.measurementKind}:${measurement.displayUnit ?? "unitless"}`;
        const increment =
          measurement.measurementKind === "count"
            ? Number(measurement.countValue ?? measurement.displayValue ?? 0)
            : Number(measurement.displayValue ?? 0);
        accumulator[totalKey] = (accumulator[totalKey] ?? 0) + increment;
        return accumulator;
      }, {});

      return {
        key,
        measurements,
        totals: Object.entries(totals).map(([totalKey, value]) => {
          if (totalKey === "count") {
            return `Count ${value.toFixed(0)}`;
          }

          const [kind, unit] = totalKey.split(":");
          const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
          return `${kind === "area" ? "Area" : "Length"} ${rounded}${unit && unit !== "unitless" ? ` ${unit}` : ""}`;
        }),
      };
    });
  }, [filteredMeasurements, groupBy]);

  const selectedMeasurement = useMemo(
    () =>
      selection?.type === "measurement"
        ? localMeasurements.find((measurement) => measurement.id === selection.measurementId) ?? null
        : null,
    [localMeasurements, selection]
  );

  const hasUnsavedMeasurementDetailChanges = useMemo(() => {
    if (!selectedMeasurement) {
      return false;
    }

    return (
      measurementNameInput.trim() !== selectedMeasurement.name ||
      measurementNoteInput.trim() !== (selectedMeasurement.description ?? "") ||
      measurementTagInput.trim() !== (getMeasurementTag(selectedMeasurement) ?? "")
    );
  }, [measurementNameInput, measurementNoteInput, measurementTagInput, selectedMeasurement]);

  const totalCountValue = useMemo(
    () => countMeasurements.reduce((total, measurement) => total + Number(measurement.countValue ?? measurement.displayValue ?? 0), 0),
    [countMeasurements]
  );
  const filteredTotals = useMemo(() => {
    const totals = filteredMeasurements.reduce<Record<string, number>>((accumulator, measurement) => {
      const totalKey =
        measurement.measurementKind === "count"
          ? "count"
          : `${measurement.measurementKind}:${measurement.displayUnit ?? "unitless"}`;
      const increment =
        measurement.measurementKind === "count"
          ? Number(measurement.countValue ?? measurement.displayValue ?? 0)
          : Number(measurement.displayValue ?? 0);
      accumulator[totalKey] = (accumulator[totalKey] ?? 0) + increment;
      return accumulator;
    }, {});

    return Object.entries(totals).map(([totalKey, value]) => {
      if (totalKey === "count") {
        return `Count ${value.toFixed(0)}`;
      }

      const [kind, unit] = totalKey.split(":");
      const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
      return `${kind === "area" ? "Area" : "Length"} ${rounded}${unit && unit !== "unitless" ? ` ${unit}` : ""}`;
    });
  }, [filteredMeasurements]);

  const effectiveMeasurementReadiness = useMemo(
    () =>
      localActiveCalibration
        ? {
            ...measurementReadiness,
            activeCalibrationId: localActiveCalibration.id,
            canCreateLine: true,
            canCreateArea: true,
            canCreateCount: true,
            message: "This page is ready for manual line, area, and count measurements.",
          }
        : measurementReadiness,
    [localActiveCalibration, measurementReadiness]
  );

  useEffect(() => {
    onPageDataChange?.({
      pageId,
      measurements: localMeasurements,
      measurementReadiness: effectiveMeasurementReadiness,
      activeCalibration: localActiveCalibration,
    });
  }, [
    effectiveMeasurementReadiness,
    localActiveCalibration,
    localMeasurements,
    onPageDataChange,
    pageId,
  ]);

  const isSaving = saveFeedback.kind === "saving";

  const clearSaveFeedback = useCallback(() => {
    if (saveFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(saveFeedbackTimeoutRef.current);
      saveFeedbackTimeoutRef.current = null;
    }

    setSaveFeedback({
      kind: "idle",
      message: "",
      retry: null,
    });
  }, []);

  const markSaveSuccess = useCallback((message: string) => {
    if (saveFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(saveFeedbackTimeoutRef.current);
    }

    setSaveFeedback({
      kind: "saved",
      message,
      retry: null,
    });

    saveFeedbackTimeoutRef.current = window.setTimeout(() => {
      setSaveFeedback({
        kind: "idle",
        message: "",
        retry: null,
      });
      saveFeedbackTimeoutRef.current = null;
    }, 1800);
  }, []);

  const markSaveError = useCallback((message: string, retry?: (() => void) | null, retryLabel = "Retry") => {
    if (saveFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(saveFeedbackTimeoutRef.current);
      saveFeedbackTimeoutRef.current = null;
    }

    setActionError(message);
    setSaveFeedback({
      kind: "error",
      message,
      retry: retry ?? null,
      retryLabel,
    });
  }, []);

  const runMutation = useCallback(
    async <T,>(params: {
      savingMessage: string;
      successMessage: string;
      retry?: (() => void) | null;
      retryLabel?: string;
      run: () => Promise<T>;
    }) => {
      if (saveFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(saveFeedbackTimeoutRef.current);
        saveFeedbackTimeoutRef.current = null;
      }

      setActionError(null);
      setSaveFeedback({
        kind: "saving",
        message: params.savingMessage,
        retry: null,
      });

      try {
        const result = await params.run();
        markSaveSuccess(params.successMessage);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save takeoff changes.";
        markSaveError(message, params.retry ?? null, params.retryLabel ?? "Retry");
        return null;
      }
    },
    [markSaveError, markSaveSuccess]
  );

  const pushHistoryCommand = useCallback((command: HistoryCommand) => {
    setUndoStack((current) => [...current, command].slice(-HISTORY_LIMIT));
    setRedoStack([]);
  }, []);

  const upsertLocalMeasurement = useCallback((nextMeasurement: TakeoffMeasurement) => {
    setLocalMeasurements((currentMeasurements) => {
      const existingIndex = currentMeasurements.findIndex((measurement) => measurement.id === nextMeasurement.id);
      if (existingIndex < 0) {
        return [...currentMeasurements, nextMeasurement];
      }

      const updatedMeasurements = [...currentMeasurements];
      updatedMeasurements[existingIndex] = nextMeasurement;
      return updatedMeasurements;
    });
    setMeasurementPointOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[nextMeasurement.id];
      return nextOverrides;
    });
  }, []);

  const replaceMeasurementStatusLocally = useCallback((nextMeasurement: TakeoffMeasurement) => {
    upsertLocalMeasurement(nextMeasurement);

    if (nextMeasurement.status === "deleted" && selection?.type === "measurement" && selection.measurementId === nextMeasurement.id) {
      setSelection(null);
    }
  }, [selection, upsertLocalMeasurement]);

  const getCurrentMeasurementById = useCallback((measurementId: string) => {
    return localMeasurementsRef.current.find((measurement) => measurement.id === measurementId) ?? null;
  }, []);

  const performSetActiveCalibration = useCallback(async (calibrationId: string | null) => {
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    if (calibrationId) {
      formData.set("calibrationId", calibrationId);
    }

    const result = await setActiveCalibrationAction(formData);
    if (!result.ok) {
      throw new Error(result.error ?? "Unable to update active calibration.");
    }

    const nextCalibration = result.data ?? null;
    setLocalActiveCalibration(nextCalibration);

    if (nextCalibration) {
      setDraftGeometry({
        tool: "calibrate",
        points: [
          transform.normalizedPointToDocumentPoint({ x: nextCalibration.point_a_x, y: nextCalibration.point_a_y }),
          transform.normalizedPointToDocumentPoint({ x: nextCalibration.point_b_x, y: nextCalibration.point_b_y }),
        ],
        hasChanges: false,
      });
      setCalibrationName(nextCalibration.name);
      setCalibrationLengthInput(String(nextCalibration.reference_length_input));
      setCalibrationDisplayUnit(nextCalibration.display_unit);
      setCalibrationUnitSystem(inferUnitSystem(nextCalibration.display_unit));
    } else {
      setDraftGeometry({ tool: "calibrate", points: [], hasChanges: false });
      setCalibrationName("");
      setCalibrationLengthInput("");
      setCalibrationDisplayUnit("mm");
      setCalibrationUnitSystem("metric");
    }

    return nextCalibration;
  }, [drawingSetId, pageId, transform]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
      setDevicePixelRatio(window.devicePixelRatio || 1);
    });

    resizeObserver.observe(viewportElement);

    const onWindowResize = () => {
      setDevicePixelRatio(window.devicePixelRatio || 1);
    };

    window.addEventListener("resize", onWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, []);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      return;
    }

    const preventNativeViewerZoom = (event: Event) => {
      event.preventDefault();
    };

    const preventWheelBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    viewportElement.addEventListener("wheel", preventWheelBrowserZoom, { passive: false });
    viewportElement.addEventListener("gesturestart", preventNativeViewerZoom as EventListener, { passive: false });
    viewportElement.addEventListener("gesturechange", preventNativeViewerZoom as EventListener, { passive: false });
    viewportElement.addEventListener("gestureend", preventNativeViewerZoom as EventListener, { passive: false });

    return () => {
      viewportElement.removeEventListener("wheel", preventWheelBrowserZoom);
      viewportElement.removeEventListener("gesturestart", preventNativeViewerZoom as EventListener);
      viewportElement.removeEventListener("gesturechange", preventNativeViewerZoom as EventListener);
      viewportElement.removeEventListener("gestureend", preventNativeViewerZoom as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const nextPdfSource = getPdfSourceKey(pdfUrl);
    const hasLoadedCurrentDocument =
      documentRef.current &&
      nextPdfSource &&
      loadedPdfSourceRef.current === nextPdfSource &&
      loadedDrawingSetIdRef.current === drawingSetId;

    if (hasLoadedCurrentDocument) {
      return;
    }

    async function loadDocument() {
      if (!pdfUrl) {
        setLoadState("error");
        setError("The selected drawing PDF could not be opened.");
        setPageProxy(null);
        loadedPdfSourceRef.current = null;
        loadedDrawingSetIdRef.current = drawingSetId;
        return;
      }

      renderTaskRef.current?.cancel();
      if (loadingTaskRef.current?.destroy) {
        await loadingTaskRef.current.destroy();
      }
      if (documentRef.current?.destroy) {
        await documentRef.current.destroy();
      }

      setLoadState("loading");
      setError(null);
      setPageProxy(null);

      try {
        const pdfjs = await loadPdfJsModule();
        if (cancelled) {
          return;
        }

        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
          withCredentials: false,
        });
        loadingTaskRef.current = loadingTask;
        const pdfDocument = await loadingTask.promise;
        if (cancelled) {
          await pdfDocument.destroy?.();
          return;
        }

        documentRef.current = pdfDocument;
        loadedPdfSourceRef.current = nextPdfSource;
        loadedDrawingSetIdRef.current = drawingSetId;
        setLoadState("ready");
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setLoadState("error");
        setError(loadError instanceof Error ? loadError.message : "Unable to load the selected drawing page.");
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
    };
  }, [drawingSetId, pdfUrl]);

  useEffect(() => {
    const pdfDocument = documentRef.current;
    if (!pdfDocument || loadState !== "ready") {
      return;
    }
    let cancelled = false;

    async function loadPage() {
      setError(null);
      setPageProxy(null);

      try {
        const resolvedPage = await pdfDocument.getPage(pageNumber);
        if (cancelled) {
          resolvedPage.cleanup?.();
          return;
        }

        const viewport = resolvedPage.getViewport({
          scale: 1,
          rotation: rotationDegrees,
        });

        setIntrinsicPageSize({
          width: Math.max(viewport.width, 1),
          height: Math.max(viewport.height, 1),
        });
        setPageProxy(resolvedPage);
      } catch (pageError) {
        if (cancelled) {
          return;
        }

        setLoadState("error");
        setError(pageError instanceof Error ? pageError.message : "Unable to load the selected drawing page.");
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [loadState, pageNumber, rotationDegrees]);

  useEffect(() => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
    }

    pendingCommittedZoomRef.current = null;
    isZoomGestureActiveRef.current = false;
    renderedBitmapRef.current = null;
    setPendingCommittedZoom(null);
    setCommittedZoom(resetZoom);
    setTransientZoom(1);
    transientZoomRef.current = 1;
    setPan(defaultPanRef.current);
    setDraftGeometry({ tool: null, points: [], hasChanges: false });
    setHoverState({ rawDocumentPoint: null, documentPoint: null, hitTarget: null, snapCandidate: null });
    activeSnapCandidateRef.current = null;
    setMeasurementPointOverrides({});
    setSelection(null);
    setToolMode("select");
    setActionError(null);
    clearSaveFeedback();
    setUndoStack([]);
    setRedoStack([]);
  }, [clearSaveFeedback, pageId, resetZoom]);

  useEffect(() => {
    const page = pageProxy;
    const visibleCanvas = canvasRef.current;
    if (!page || !visibleCanvas || loadState !== "ready") {
      return;
    }

    const bufferCanvas = document.createElement("canvas");
    const bufferContext = bufferCanvas.getContext("2d", { alpha: false });
    if (!bufferContext) {
      console.error("Unable to create a buffered 2D rendering surface for the takeoff viewer.");
      return;
    }

    renderTaskRef.current?.cancel();
    const targetCommittedScale = transform.metrics.fitScale * targetRenderZoom;
    const renderScale = targetCommittedScale * devicePixelRatio;
    const renderViewport = page.getViewport({
      scale: renderScale,
      rotation: rotationDegrees,
    });
    const nextCanvasWidth = Math.max(Math.floor(renderViewport.width), 1);
    const nextCanvasHeight = Math.max(Math.floor(renderViewport.height), 1);
    const requestId = latestRenderRequestRef.current + 1;
    const requestPendingCommittedZoom = pendingCommittedZoom;
    const renderedBitmap = renderedBitmapRef.current;

    if (
      renderedBitmap &&
      renderedBitmap.pageId === pageId &&
      renderedBitmap.rotationDegrees === rotationDegrees &&
      renderedBitmap.canvasWidth === nextCanvasWidth &&
      renderedBitmap.canvasHeight === nextCanvasHeight &&
      Math.abs(renderedBitmap.zoom - targetRenderZoom) < 0.001 &&
      Math.abs(renderedBitmap.devicePixelRatio - devicePixelRatio) < 0.001
    ) {
      if (
        requestPendingCommittedZoom !== null &&
        Math.abs(requestPendingCommittedZoom - targetRenderZoom) < 0.001 &&
        !isZoomGestureActiveRef.current
      ) {
        pendingCommittedZoomRef.current = null;
        setPendingCommittedZoom(null);
        setCommittedZoom(targetRenderZoom);
        transientZoomRef.current = 1;
        setTransientZoom(1);
      }
      return;
    }

    latestRenderRequestRef.current = requestId;

    bufferCanvas.width = nextCanvasWidth;
    bufferCanvas.height = nextCanvasHeight;

    bufferContext.setTransform(1, 0, 0, 1, 0, 0);
    bufferContext.clearRect(0, 0, nextCanvasWidth, nextCanvasHeight);

    const renderTask = page.render({
      canvasContext: bufferContext,
      viewport: renderViewport,
      background: "#ffffff",
    });

    renderTaskRef.current = renderTask;
    const renderStateFrame = window.requestAnimationFrame(() => {
      setIsRendering(true);
      setError(null);
    });

    renderTask.promise
      .then(() => {
        if (renderTaskRef.current === renderTask && latestRenderRequestRef.current === requestId) {
          const shouldPromotePendingZoom =
            requestPendingCommittedZoom !== null &&
            Math.abs(requestPendingCommittedZoom - targetRenderZoom) < 0.001 &&
            pendingCommittedZoomRef.current !== null &&
            Math.abs(pendingCommittedZoomRef.current - targetRenderZoom) < 0.001 &&
            !isZoomGestureActiveRef.current;

          if (requestPendingCommittedZoom !== null && !shouldPromotePendingZoom) {
            setIsRendering(false);
            return;
          }

          const nextVisibleContext = visibleCanvas.getContext("2d", { alpha: false });
          if (!nextVisibleContext) {
            console.error("Unable to promote the buffered PDF render into the visible canvas.");
            setIsRendering(false);
            return;
          }

          visibleCanvas.width = nextCanvasWidth;
          visibleCanvas.height = nextCanvasHeight;
          visibleCanvas.style.width = "";
          visibleCanvas.style.height = "";
          nextVisibleContext.setTransform(1, 0, 0, 1, 0, 0);
          nextVisibleContext.clearRect(0, 0, nextCanvasWidth, nextCanvasHeight);
          nextVisibleContext.drawImage(bufferCanvas, 0, 0);
          renderedBitmapRef.current = {
            pageId,
            rotationDegrees,
            canvasWidth: nextCanvasWidth,
            canvasHeight: nextCanvasHeight,
            zoom: targetRenderZoom,
            devicePixelRatio,
          };

          if (shouldPromotePendingZoom) {
            pendingCommittedZoomRef.current = null;
            setPendingCommittedZoom(null);
            setCommittedZoom(targetRenderZoom);
            transientZoomRef.current = 1;
            setTransientZoom(1);
          }

          setIsRendering(false);
        }
      })
      .catch((renderError: unknown) => {
        const cancelledRender =
          typeof renderError === "object" &&
          renderError !== null &&
          "name" in renderError &&
          renderError.name === "RenderingCancelledException";

        if (cancelledRender) {
          return;
        }

        setIsRendering(false);
        setLoadState("error");
        setError(renderError instanceof Error ? renderError.message : "Unable to render the selected drawing page.");
      });

    return () => {
      window.cancelAnimationFrame(renderStateFrame);
      renderTask.cancel();
    };
  }, [
    devicePixelRatio,
    loadState,
    pageId,
    pageProxy,
    pendingCommittedZoom,
    rotationDegrees,
    transform.metrics.fitScale,
    targetRenderZoom,
  ]);

  useEffect(
    () => () => {
      renderTaskRef.current?.cancel();
      if (settleTimeoutRef.current !== null) {
        window.clearTimeout(settleTimeoutRef.current);
      }
      if (saveFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(saveFeedbackTimeoutRef.current);
      }
      void loadingTaskRef.current?.destroy?.();
      void documentRef.current?.destroy?.();
    },
    []
  );

  function scheduleZoomCommit() {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
    }

    settleTimeoutRef.current = window.setTimeout(() => {
      const pendingTransientZoom = transientZoomRef.current;
      if (Math.abs(pendingTransientZoom - 1) < 0.001) {
        isZoomGestureActiveRef.current = false;
        transientZoomRef.current = 1;
        setTransientZoom(1);
        return;
      }

      isZoomGestureActiveRef.current = false;
      setPendingCommittedZoom(clamp(committedZoom * pendingTransientZoom, MIN_ZOOM, MAX_ZOOM));
    }, ZOOM_SETTLE_MS);
  }

  function getDocumentPointFromClientCoordinates(clientX: number, clientY: number) {
    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      return null;
    }

    return clampDocumentPointToBounds(
      transform.clientPointToDocumentPoint(
        { x: clientX, y: clientY },
        viewportElement.getBoundingClientRect()
      ),
      documentPageSize
    );
  }

  function getSnapResolution(params: {
    rawDocumentPoint: Point2D;
    mode: "place" | "edit";
    editingMeasurementId?: string;
    editingPointIndex?: number;
    editingCalibrationPointIndex?: number;
  }): { point: Point2D; candidate: SnapCandidate | null } {
    const viewportSnapTolerance = getZoomAdjustedViewportTolerance({
      baseTolerance: SNAP_TOLERANCE_PX,
      effectiveZoom: transform.metrics.effectiveZoom,
      minTolerance: 10,
      maxTolerance: 20,
    });
    const tolerance = getSnapToleranceInDocumentSpace({
      viewportTolerance: viewportSnapTolerance,
      viewportDistanceToDocumentDistance: transform.viewportDistanceToDocumentDistance,
    });
    const stickyTolerance = tolerance * SNAP_STICKINESS_MULTIPLIER;

    const vertexTargets: Point2D[] = [];
    const edgeCandidates: Array<SnapCandidate | null> = [];

    if (draftGeometry.tool === "polyline" || draftGeometry.tool === "area") {
      const draftPoints = draftGeometry.points;
      const draftClosureCandidate =
        draftGeometry.tool === "area"
          ? getDraftClosureSnapCandidate({
              point: params.rawDocumentPoint,
              firstPoint: draftPoints[0] ?? null,
              tolerance,
              currentPointCount: draftPoints.length,
              minimumPointsBeforeClose: 3,
            })
          : null;

      const draftVertexTargets = draftPoints.filter((_, index) => {
        if (params.mode !== "edit") {
          return true;
        }

        return index !== params.editingPointIndex;
      });
      vertexTargets.push(...draftVertexTargets);

      if (draftPoints.length >= 2) {
        edgeCandidates.push(
          getNearestSegmentSnapCandidate({
            point: params.rawDocumentPoint,
            polyline: draftPoints,
            tolerance,
            closed: draftGeometry.tool === "area" && draftPoints.length >= 3,
            priority: draftGeometry.tool === "area" ? 50 : 55,
          })
        );
      }

      const bestDraftCandidate = getStableSnapCandidate({
        candidates: [
        draftClosureCandidate,
        getNearestVertexSnapCandidate({
          point: params.rawDocumentPoint,
          targets: draftVertexTargets,
          tolerance,
          priority: 10,
        }),
        ...edgeCandidates,
        ],
        currentCandidate: params.mode === "edit" ? activeSnapCandidateRef.current : null,
        currentCandidateTolerance: stickyTolerance,
      });

      if (bestDraftCandidate) {
        return {
          point: clampDocumentPointToBounds(bestDraftCandidate.point, documentPageSize),
          candidate: bestDraftCandidate,
        };
      }
    }

    if (calibrationPointsForDisplay.length >= 2) {
      calibrationPointsForDisplay.forEach((point, index) => {
        if (params.mode === "edit" && params.editingCalibrationPointIndex === index) {
          return;
        }

        vertexTargets.push(point);
      });
    }

    savedMeasurements.forEach((measurement) => {
      measurement.documentPoints.forEach((point, index) => {
        if (
          params.mode === "edit" &&
          params.editingMeasurementId === measurement.id &&
          params.editingPointIndex === index
        ) {
          return;
        }

        vertexTargets.push(point);
      });

      if (measurement.documentPoints.length >= 2) {
        edgeCandidates.push(
          getNearestSegmentSnapCandidate({
            point: params.rawDocumentPoint,
            polyline: measurement.documentPoints,
            tolerance,
            closed: measurement.measurementKind === "area",
            priority: measurement.measurementKind === "area" ? 35 : 45,
          })
        );
      }
    });

    const bestCandidate = getStableSnapCandidate({
      candidates: [
        getNearestVertexSnapCandidate({
          point: params.rawDocumentPoint,
          targets: vertexTargets,
          tolerance,
          priority: 20,
        }),
        ...edgeCandidates,
      ],
      currentCandidate: params.mode === "edit" ? activeSnapCandidateRef.current : null,
      currentCandidateTolerance: stickyTolerance,
    });

    return {
      point: clampDocumentPointToBounds(bestCandidate?.point ?? params.rawDocumentPoint, documentPageSize),
      candidate: bestCandidate,
    };
  }

  function getHitTarget(documentPoint: Point2D): HitTarget | null {
    const tolerance = transform.viewportDistanceToDocumentDistance(HIT_TOLERANCE_PX);
    const candidates: Array<{ target: HitTarget; distance: number }> = [];

    if (calibrationPointsForDisplay.length >= 2) {
      calibrationPointsForDisplay.forEach((point, index) => {
        const hit = getPointHit({
          point: documentPoint,
          target: point,
          tolerance,
        });
        if (hit.hit && (index === 0 || index === 1)) {
          candidates.push({
            target: { type: "calibration-point", pointIndex: index },
            distance: hit.distance,
          });
        }
      });

      const segmentHit = getPolylineHit({
        point: documentPoint,
        polyline: calibrationPointsForDisplay,
        tolerance,
      });
      if (segmentHit.hit) {
        candidates.push({
          target: { type: "calibration-segment" },
          distance: segmentHit.distance,
        });
      }
    }

    savedMeasurements.forEach((measurement) => {
      const nearestPointHit = getNearestPointHit({
        point: documentPoint,
        targets: measurement.documentPoints,
        tolerance,
      });
      if (nearestPointHit.hit && nearestPointHit.index >= 0) {
        candidates.push({
          target: { type: "measurement-point", measurementId: measurement.id, pointIndex: nearestPointHit.index },
          distance: nearestPointHit.distance,
        });
      }

      const segmentHit =
        measurement.measurementKind === "area"
          ? getPolygonHit({
              point: documentPoint,
              polygon: measurement.documentPoints,
              tolerance,
            })
          : getPolylineHit({
              point: documentPoint,
              polyline: measurement.documentPoints,
              tolerance,
            });
      if (segmentHit.hit) {
        candidates.push({
          target: { type: "measurement-segment", measurementId: measurement.id },
          distance: segmentHit.distance,
        });
      }
    });

    candidates.sort((left, right) => left.distance - right.distance);
    return candidates[0]?.target ?? null;
  }

  function filterHitTargetForCurrentTool(hitTarget: HitTarget | null): HitTarget | null {
    if (!hitTarget) {
      return null;
    }

    if (toolMode === "distance" || toolMode === "polyline" || toolMode === "area" || toolMode === "count") {
      return null;
    }

    if (toolMode === "calibrate") {
      return hitTarget.type === "calibration-point" || hitTarget.type === "calibration-segment" ? hitTarget : null;
    }

    return hitTarget;
  }

  function applyWheelZoom(nextTransientZoom: number, pointerX: number, pointerY: number) {
    isZoomGestureActiveRef.current = true;
    setPan(
      transform.getFocalZoomPan({
        pointer: { x: pointerX, y: pointerY },
        currentPan: transform.pan,
        currentTransientZoom: transientZoomRef.current,
        nextTransientZoom,
      })
    );
    transientZoomRef.current = nextTransientZoom;
    setTransientZoom(nextTransientZoom);
    scheduleZoomCommit();
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();

    const viewportElement = viewportRef.current;
    if (!viewportElement || loadState !== "ready") {
      return;
    }

    const pointer = getViewportRelativePoint({
      clientX: event.clientX,
      clientY: event.clientY,
      viewportRect: viewportElement.getBoundingClientRect(),
    });
    const pointerTopLeft = transform.clientPointToViewportPoint(
      { x: event.clientX, y: event.clientY },
      viewportElement.getBoundingClientRect()
    );
    const zoomPointer =
      transform.viewportOrigin === "top-left"
        ? pointerTopLeft
        : pointer;
    const deltaZoom = Math.exp(-event.deltaY * 0.0015);
    const nextAbsoluteZoom = clamp(committedZoom * transientZoomRef.current * deltaZoom, MIN_ZOOM, MAX_ZOOM);
    const nextTransientZoom = nextAbsoluteZoom / committedZoom;

    applyWheelZoom(nextTransientZoom, zoomPointer.x, zoomPointer.y);
  }

  function zoomByStep(direction: 1 | -1) {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
    }

    const currentDisplayedZoom = committedZoom * transientZoomRef.current;
    const nextAbsoluteZoom = clamp(currentDisplayedZoom * (direction > 0 ? 1.2 : 1 / 1.2), MIN_ZOOM, MAX_ZOOM);
    const nextTransientZoom = nextAbsoluteZoom / committedZoom;

    isZoomGestureActiveRef.current = false;
    transientZoomRef.current = nextTransientZoom;
    setTransientZoom(nextTransientZoom);
    setPendingCommittedZoom(nextAbsoluteZoom);
  }

  function resetView() {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
    }

    pendingCommittedZoomRef.current = null;
    isZoomGestureActiveRef.current = false;
    setPendingCommittedZoom(null);
    setCommittedZoom(resetZoom);
    setTransientZoom(1);
    transientZoomRef.current = 1;
    setPan(defaultPanRef.current);
  }

  const beginToolMode = useCallback((nextTool: ToolMode) => {
    setToolMode(nextTool);

    if (nextTool === "select") {
      setDraftGeometry({ tool: null, points: [], hasChanges: false });
      return;
    }

    if (nextTool === "calibrate") {
      setSelection({ type: "calibration" });
      setDraftGeometry({
        tool: "calibrate",
        points: savedCalibrationPoints,
        hasChanges: false,
      });
      return;
    }

    setSelection(null);
    setDraftGeometry({
      tool: nextTool,
      points: [],
      hasChanges: false,
    });
  }, [savedCalibrationPoints]);

  const clearMeasurementDraft = useCallback(() => {
    activeSnapCandidateRef.current = null;
    setDraftGeometry((currentDraft) =>
      currentDraft.tool && currentDraft.tool !== "calibrate"
        ? { tool: currentDraft.tool, points: [], hasChanges: false }
        : currentDraft
    );
  }, []);

  const revertCalibrationDraft = useCallback(() => {
    activeSnapCandidateRef.current = null;
    setDraftGeometry({
      tool: "calibrate",
      points: savedCalibrationPoints,
      hasChanges: false,
    });
    setCalibrationName(localActiveCalibration?.name ?? "");
    setCalibrationLengthInput(localActiveCalibration ? String(localActiveCalibration.reference_length_input) : "");
    setCalibrationDisplayUnit(localActiveCalibration?.display_unit ?? "mm");
    setCalibrationUnitSystem(inferUnitSystem(localActiveCalibration?.display_unit ?? "mm"));
    setSelection({ type: "calibration" });
  }, [localActiveCalibration, savedCalibrationPoints]);

  const removeLastDraftPoint = useCallback(() => {
    setDraftGeometry((currentDraft) => {
      if (currentDraft.tool === null) {
        return currentDraft;
      }

      if (currentDraft.points.length === 0) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        points: currentDraft.points.slice(0, -1),
        hasChanges: currentDraft.tool === "calibrate" ? true : currentDraft.points.length > 1,
      };
    });
  }, []);

  const clearSelection = useCallback(() => {
    activeSnapCandidateRef.current = null;
    setSelection(null);
    setMeasurementPointOverrides({});
    if (toolMode === "select") {
      setDraftGeometry({ tool: null, points: [], hasChanges: false });
    }
  }, [toolMode]);

  const deleteSelectedMeasurement = useCallback(() => {
    if (selection?.type !== "measurement") {
      return;
    }

    const measurement = getCurrentMeasurementById(selection.measurementId);
    if (!measurement) {
      return;
    }

    const runDelete = async () => {
      const formData = new FormData();
      formData.set("drawingSetId", drawingSetId);
      formData.set("pageId", pageId);
      formData.set("measurementId", selection.measurementId);
      formData.set("action", "delete");
      const result = await updateMeasurementStatusAction(formData);
      if (!result.ok || !result.data) {
        throw new Error(result.error ?? "Unable to delete measurement.");
      }

      replaceMeasurementStatusLocally(result.data);
      setSelection(null);
      return result.data;
    };

    void runMutation({
      savingMessage: "Deleting measurement...",
      successMessage: "Measurement deleted.",
      run: async () => {
        const deletedMeasurement = await runDelete();
        pushHistoryCommand({
          id: `delete:${deletedMeasurement.id}:${Date.now()}`,
          label: `Delete ${measurement.measurement_kind}`,
          undo: async () => {
            const formData = new FormData();
            formData.set("drawingSetId", drawingSetId);
            formData.set("pageId", pageId);
            formData.set("measurementId", deletedMeasurement.id);
            formData.set("action", "restore");
            const restoreResult = await updateMeasurementStatusAction(formData);
            if (!restoreResult.ok || !restoreResult.data) {
              throw new Error(restoreResult.error ?? "Unable to restore measurement.");
            }

            replaceMeasurementStatusLocally(restoreResult.data);
          },
          redo: async () => {
            await runDelete();
          },
        });

        return deletedMeasurement;
      },
    });
  }, [
    drawingSetId,
    getCurrentMeasurementById,
    pageId,
    pushHistoryCommand,
    replaceMeasurementStatusLocally,
    runMutation,
    selection,
    updateMeasurementStatusAction,
  ]);

  const runUndo = useCallback(() => {
    const command = undoStack[undoStack.length - 1];
    if (!command || isSaving) {
      return;
    }

    void runMutation({
      savingMessage: `Undoing ${command.label.toLowerCase()}...`,
      successMessage: `Undid ${command.label.toLowerCase()}.`,
      run: async () => {
        await command.undo();
        setUndoStack((current) => current.slice(0, -1));
        setRedoStack((current) => [...current, command].slice(-HISTORY_LIMIT));
      },
    });
  }, [isSaving, runMutation, undoStack]);

  const runRedo = useCallback(() => {
    const command = redoStack[redoStack.length - 1];
    if (!command || isSaving) {
      return;
    }

    void runMutation({
      savingMessage: `Redoing ${command.label.toLowerCase()}...`,
      successMessage: `Redid ${command.label.toLowerCase()}.`,
      run: async () => {
        await command.redo();
        setRedoStack((current) => current.slice(0, -1));
        setUndoStack((current) => [...current, command].slice(-HISTORY_LIMIT));
      },
    });
  }, [isSaving, redoStack, runMutation]);

  const cancelCurrentInteraction = useCallback(() => {
    interactionRef.current = { kind: "idle" };
    activeSnapCandidateRef.current = null;
    setIsDragging(false);

    if (hasUnsavedMeasurementDraft) {
      clearMeasurementDraft();
      return;
    }

    if (hasUnsavedCalibrationChanges) {
      revertCalibrationDraft();
      return;
    }

    if (selection) {
      clearSelection();
      return;
    }

    if (toolMode !== "select") {
      beginToolMode("select");
    }
  }, [
    beginToolMode,
    clearMeasurementDraft,
    clearSelection,
    hasUnsavedCalibrationChanges,
    hasUnsavedMeasurementDraft,
    revertCalibrationDraft,
    selection,
    toolMode,
  ]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      );
    }

    function onKeyDown(event: KeyboardEvent) {
      const typingTarget = isTypingTarget(event.target);

      if (event.key === "Escape") {
        event.preventDefault();
        cancelCurrentInteraction();
        return;
      }

      if (event.code === "Space" && !typingTarget) {
        event.preventDefault();
        setIsSpacePanActive(true);
      }

      if (typingTarget) {
        return;
      }

      const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z";
      const isRedoShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"));

      if (isUndoShortcut) {
        event.preventDefault();
        runUndo();
        return;
      }

      if (isRedoShortcut) {
        event.preventDefault();
        runRedo();
        return;
      }

      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        beginToolMode("select");
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        beginToolMode("calibrate");
        return;
      }

      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        beginToolMode("distance");
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selection?.type === "measurement") {
        event.preventDefault();
        deleteSelectedMeasurement();
        return;
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        beginToolMode("polyline");
        return;
      }

      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        beginToolMode("area");
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        beginToolMode("count");
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && (hasUnsavedMeasurementDraft || hasUnsavedCalibrationChanges)) {
        event.preventDefault();
        removeLastDraftPoint();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space" && !isTypingTarget(event.target)) {
        setIsSpacePanActive(false);
      }
    }

    function clearSpacePan() {
      setIsSpacePanActive(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearSpacePan);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearSpacePan);
    };
  }, [
    beginToolMode,
    cancelCurrentInteraction,
    deleteSelectedMeasurement,
    hasUnsavedCalibrationChanges,
    hasUnsavedMeasurementDraft,
    removeLastDraftPoint,
    runRedo,
    runUndo,
    selection,
  ]);

  function submitCalibration(points: Point2D[]) {
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("name", calibrationName.trim() || "Scale calibration");
    formData.set("unitSystem", calibrationUnitSystem);
    formData.set("displayUnit", calibrationDisplayUnit);
    formData.set("referenceLengthInput", calibrationLengthInput || "0");
    formData.set("pointAX", String(normalizedPoints[0]?.x ?? -1));
    formData.set("pointAY", String(normalizedPoints[0]?.y ?? -1));
    formData.set("pointBX", String(normalizedPoints[1]?.x ?? -1));
    formData.set("pointBY", String(normalizedPoints[1]?.y ?? -1));
    formData.set("notes", "");
    const previousCalibration = localActiveCalibrationRef.current ? { ...localActiveCalibrationRef.current } : null;

    void runMutation({
      savingMessage: previousCalibration ? "Replacing calibration..." : "Saving calibration...",
      successMessage: previousCalibration ? "Calibration replaced." : "Calibration saved.",
      retry: () => {
        submitCalibration(points);
      },
      run: async () => {
        const result = await saveCalibrationAction(formData);
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? "Unable to save calibration.");
        }

        const nextCalibration = result.data;
        setLocalActiveCalibration(nextCalibration);
        setDraftGeometry({ tool: "calibrate", points, hasChanges: false });

        pushHistoryCommand({
          id: `calibration:${nextCalibration.id}:${Date.now()}`,
          label: previousCalibration ? "Replace calibration" : "Create calibration",
          undo: async () => {
            await performSetActiveCalibration(previousCalibration?.id ?? null);
          },
          redo: async () => {
            await performSetActiveCalibration(nextCalibration.id);
          },
        });

        return nextCalibration;
      },
    });
  }

  function submitDistance(points: Point2D[]) {
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set(
      "name",
      points.length > 2
        ? `Polyline ${savedMeasurements.filter((measurement) => measurement.measurementKind === "line" && measurement.isPolyline).length + 1}`
        : `Distance ${savedMeasurements.filter((measurement) => measurement.measurementKind === "line" && !measurement.isPolyline).length + 1}`
    );
    formData.set("description", "");
    formData.set("groupId", "");
    formData.set("colorHex", DEFAULT_DISTANCE_COLOR);
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    void runMutation({
      savingMessage: points.length > 2 ? "Saving polyline..." : "Saving distance...",
      successMessage: points.length > 2 ? "Polyline saved." : "Distance saved.",
      retry: () => {
        submitDistance(points);
      },
      run: async () => {
        const result = await createLineMeasurementAction(formData);
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? "Unable to create measurement.");
        }

        const nextMeasurement = cloneMeasurement(result.data);
        upsertLocalMeasurement(nextMeasurement);
        pushHistoryCommand({
          id: `create:${nextMeasurement.id}:${Date.now()}`,
          label: points.length > 2 ? "Create polyline" : "Create distance",
          undo: async () => {
            const statusFormData = new FormData();
            statusFormData.set("drawingSetId", drawingSetId);
            statusFormData.set("pageId", pageId);
            statusFormData.set("measurementId", nextMeasurement.id);
            statusFormData.set("action", "delete");
            const deleteResult = await updateMeasurementStatusAction(statusFormData);
            if (!deleteResult.ok || !deleteResult.data) {
              throw new Error(deleteResult.error ?? "Unable to delete measurement.");
            }

            replaceMeasurementStatusLocally(deleteResult.data);
          },
          redo: async () => {
            const statusFormData = new FormData();
            statusFormData.set("drawingSetId", drawingSetId);
            statusFormData.set("pageId", pageId);
            statusFormData.set("measurementId", nextMeasurement.id);
            statusFormData.set("action", "restore");
            const restoreResult = await updateMeasurementStatusAction(statusFormData);
            if (!restoreResult.ok || !restoreResult.data) {
              throw new Error(restoreResult.error ?? "Unable to restore measurement.");
            }

            replaceMeasurementStatusLocally(restoreResult.data);
          },
        });

        return nextMeasurement;
      },
    });
  }

  function submitArea(points: Point2D[]) {
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set(
      "name",
      `Area ${savedMeasurements.filter((measurement) => measurement.measurementKind === "area").length + 1}`
    );
    formData.set("description", "");
    formData.set("groupId", "");
    formData.set("colorHex", DEFAULT_AREA_COLOR);
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    void runMutation({
      savingMessage: "Saving area...",
      successMessage: "Area saved.",
      retry: () => {
        submitArea(points);
      },
      run: async () => {
        const result = await createAreaMeasurementAction(formData);
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? "Unable to create area measurement.");
        }

        const nextMeasurement = cloneMeasurement(result.data);
        upsertLocalMeasurement(nextMeasurement);
        pushHistoryCommand({
          id: `create:${nextMeasurement.id}:${Date.now()}`,
          label: "Create area",
          undo: async () => {
            const statusFormData = new FormData();
            statusFormData.set("drawingSetId", drawingSetId);
            statusFormData.set("pageId", pageId);
            statusFormData.set("measurementId", nextMeasurement.id);
            statusFormData.set("action", "delete");
            const deleteResult = await updateMeasurementStatusAction(statusFormData);
            if (!deleteResult.ok || !deleteResult.data) {
              throw new Error(deleteResult.error ?? "Unable to delete area.");
            }

            replaceMeasurementStatusLocally(deleteResult.data);
          },
          redo: async () => {
            const statusFormData = new FormData();
            statusFormData.set("drawingSetId", drawingSetId);
            statusFormData.set("pageId", pageId);
            statusFormData.set("measurementId", nextMeasurement.id);
            statusFormData.set("action", "restore");
            const restoreResult = await updateMeasurementStatusAction(statusFormData);
            if (!restoreResult.ok || !restoreResult.data) {
              throw new Error(restoreResult.error ?? "Unable to restore area.");
            }

            replaceMeasurementStatusLocally(restoreResult.data);
          },
        });

        return nextMeasurement;
      },
    });
  }

  function submitCount(point: Point2D) {
    const normalizedPoints = documentPointsToNormalizedPoints([point], documentPageSize);
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("name", `Count ${countMeasurements.length + 1}`);
    formData.set("description", "");
    formData.set("groupId", "");
    formData.set("colorHex", DEFAULT_COUNT_COLOR);
    formData.set("countValue", "1");
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    void runMutation({
      savingMessage: "Saving count...",
      successMessage: "Count saved.",
      retry: () => {
        submitCount(point);
      },
      run: async () => {
        const result = await createCountMeasurementAction(formData);
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? "Unable to create count measurement.");
        }

        const nextMeasurement = cloneMeasurement(result.data);
        upsertLocalMeasurement(nextMeasurement);
        pushHistoryCommand({
          id: `create:${nextMeasurement.id}:${Date.now()}`,
          label: "Create count",
          undo: async () => {
            const statusFormData = new FormData();
            statusFormData.set("drawingSetId", drawingSetId);
            statusFormData.set("pageId", pageId);
            statusFormData.set("measurementId", nextMeasurement.id);
            statusFormData.set("action", "delete");
            const deleteResult = await updateMeasurementStatusAction(statusFormData);
            if (!deleteResult.ok || !deleteResult.data) {
              throw new Error(deleteResult.error ?? "Unable to delete count.");
            }

            replaceMeasurementStatusLocally(deleteResult.data);
          },
          redo: async () => {
            const statusFormData = new FormData();
            statusFormData.set("drawingSetId", drawingSetId);
            statusFormData.set("pageId", pageId);
            statusFormData.set("measurementId", nextMeasurement.id);
            statusFormData.set("action", "restore");
            const restoreResult = await updateMeasurementStatusAction(statusFormData);
            if (!restoreResult.ok || !restoreResult.data) {
              throw new Error(restoreResult.error ?? "Unable to restore count.");
            }

            replaceMeasurementStatusLocally(restoreResult.data);
          },
        });

        return nextMeasurement;
      },
    });
  }

  function submitMeasurementUpdate(measurementId: string, points: Point2D[]) {
    const previousMeasurement = getCurrentMeasurementById(measurementId);
    if (!previousMeasurement) {
      return;
    }

    const previousSnapshot = cloneMeasurement(previousMeasurement);
    const previousNormalizedPoints = previousMeasurement.points.map((point) => ({ x: point.x, y: point.y }));
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const optimisticMeasurement: TakeoffMeasurement = {
      ...previousSnapshot,
      points: normalizedPoints.map((point, index) => ({
        ...(previousSnapshot.points[index] ?? {
          id: `${previousSnapshot.id}:${index}`,
          point_order: index,
          x: point.x,
          y: point.y,
        }),
        point_order: index,
        x: point.x,
        y: point.y,
      })),
    };
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("measurementId", measurementId);
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    upsertLocalMeasurement(optimisticMeasurement);

    void runMutation({
      savingMessage: "Saving geometry update...",
      successMessage: "Measurement updated.",
      retry: () => {
        submitMeasurementUpdate(measurementId, points);
      },
      run: async () => {
        try {
          const result = await updateMeasurementGeometryAction(formData);
          if (!result.ok || !result.data) {
            throw new Error(result.error ?? "Unable to update measurement geometry.");
          }

          const nextMeasurement = cloneMeasurement(result.data);
          upsertLocalMeasurement(nextMeasurement);
          pushHistoryCommand({
            id: `update:${measurementId}:${Date.now()}`,
            label: `Edit ${previousMeasurement.measurement_kind}`,
            undo: async () => {
              const undoFormData = new FormData();
              undoFormData.set("drawingSetId", drawingSetId);
              undoFormData.set("pageId", pageId);
              undoFormData.set("measurementId", measurementId);
              undoFormData.set(
                "points",
                serializeNormalizedPoints(previousNormalizedPoints)
              );
              const undoResult = await updateMeasurementGeometryAction(undoFormData);
              if (!undoResult.ok || !undoResult.data) {
                throw new Error(undoResult.error ?? "Unable to undo measurement update.");
              }

              upsertLocalMeasurement(undoResult.data);
            },
            redo: async () => {
              const redoFormData = new FormData();
              redoFormData.set("drawingSetId", drawingSetId);
              redoFormData.set("pageId", pageId);
              redoFormData.set("measurementId", measurementId);
              redoFormData.set(
                "points",
                serializeNormalizedPoints(normalizedPoints)
              );
              const redoResult = await updateMeasurementGeometryAction(redoFormData);
              if (!redoResult.ok || !redoResult.data) {
                throw new Error(redoResult.error ?? "Unable to redo measurement update.");
              }

              upsertLocalMeasurement(redoResult.data);
            },
          });

          return nextMeasurement;
        } catch (error) {
          upsertLocalMeasurement(previousSnapshot);
          throw error;
        }
      },
    });
  }

  function submitMeasurementDetails(measurementId: string) {
    const previousMeasurement = getCurrentMeasurementById(measurementId);
    if (!previousMeasurement) {
      return;
    }

    const previousSnapshot = cloneMeasurement(previousMeasurement);
    const nextName = measurementNameInput.trim() || previousMeasurement.name;
    const nextDescription = measurementNoteInput.trim();
    const nextTag = measurementTagInput.trim();
    const optimisticMeasurement: TakeoffMeasurement = {
      ...previousSnapshot,
      name: nextName || previousSnapshot.name,
      description: nextDescription,
      metadata: {
        ...(previousSnapshot.metadata && typeof previousSnapshot.metadata === "object" ? previousSnapshot.metadata : {}),
        tag: nextTag || null,
      },
    };
    const formData = new FormData();
    formData.set("measurementId", measurementId);
    formData.set("name", nextName);
    formData.set("description", nextDescription);
    formData.set("tag", nextTag);

    upsertLocalMeasurement(optimisticMeasurement);

    void runMutation({
      savingMessage: "Saving measurement details...",
      successMessage: "Measurement details saved.",
      retry: () => {
        submitMeasurementDetails(measurementId);
      },
      run: async () => {
        try {
          const result = await updateMeasurementDetailsAction(formData);
          if (!result.ok || !result.data) {
            throw new Error(result.error ?? "Unable to update measurement details.");
          }

          const nextMeasurement = cloneMeasurement(result.data);
          upsertLocalMeasurement(nextMeasurement);
          pushHistoryCommand({
            id: `details:${measurementId}:${Date.now()}`,
            label: "Update measurement details",
            undo: async () => {
              const undoFormData = new FormData();
              undoFormData.set("measurementId", measurementId);
              undoFormData.set("name", previousSnapshot.name);
              undoFormData.set("description", previousSnapshot.description ?? "");
              undoFormData.set("tag", getMeasurementTag(previousSnapshot) ?? "");
              const undoResult = await updateMeasurementDetailsAction(undoFormData);
              if (!undoResult.ok || !undoResult.data) {
                throw new Error(undoResult.error ?? "Unable to undo measurement details.");
              }

              upsertLocalMeasurement(undoResult.data);
            },
            redo: async () => {
              const redoFormData = new FormData();
              redoFormData.set("measurementId", measurementId);
              redoFormData.set("name", nextName);
              redoFormData.set("description", nextDescription);
              redoFormData.set("tag", nextTag);
              const redoResult = await updateMeasurementDetailsAction(redoFormData);
              if (!redoResult.ok || !redoResult.data) {
                throw new Error(redoResult.error ?? "Unable to redo measurement details.");
              }

              upsertLocalMeasurement(redoResult.data);
            },
          });

          return nextMeasurement;
        } catch (error) {
          upsertLocalMeasurement(previousSnapshot);
          throw error;
        }
      },
    });
  }

  function finishMeasurementDraft(tool: Exclude<DraftTool, "calibrate" | null>, points: Point2D[]) {
    if (tool === "area") {
      if (points.length >= 3) {
        submitArea(points);
        setDraftGeometry({ tool: "area", points: [], hasChanges: false });
      }
      return;
    }

    if (points.length >= 2) {
      submitDistance(points);
      setDraftGeometry({ tool, points: [], hasChanges: false });
    }
  }

  function handleCanvasClick(documentPoint: Point2D) {
    if (toolMode === "calibrate") {
      setSelection({ type: "calibration" });
      const currentPoints = draftGeometry.tool === "calibrate" ? draftGeometry.points : calibrationPointsForDisplay;
      setDraftGeometry({
        tool: "calibrate",
        points: currentPoints.length >= 2 ? [documentPoint] : [...currentPoints, documentPoint],
        hasChanges: true,
      });
      return;
    }

    if (toolMode === "distance") {
      if (!effectiveMeasurementReadiness.canCreateLine) {
        return;
      }

      setSelection(null);
      const currentPoints = draftGeometry.tool === "distance" ? draftGeometry.points : [];
      const nextPoints = currentPoints.length >= 2 ? [documentPoint] : [...currentPoints, documentPoint];
      if (nextPoints.length === 2) {
        submitDistance(nextPoints);
        setDraftGeometry({ tool: "distance", points: [], hasChanges: false });
        return;
      }
      setDraftGeometry({
        tool: "distance",
        points: nextPoints,
        hasChanges: nextPoints.length > 0,
      });
      return;
    }

    if (toolMode === "polyline") {
      if (!effectiveMeasurementReadiness.canCreateLine) {
        return;
      }

      setSelection(null);
      const currentPoints = draftGeometry.tool === "polyline" ? draftGeometry.points : [];
      setDraftGeometry({
        tool: "polyline",
        points: [...currentPoints, documentPoint],
        hasChanges: true,
      });
      return;
    }

    if (toolMode === "area") {
      if (!effectiveMeasurementReadiness.canCreateArea) {
        return;
      }

      setSelection(null);
      const currentPoints = draftGeometry.tool === "area" ? draftGeometry.points : [];
      const closeTolerance = transform.viewportDistanceToDocumentDistance(HIT_TOLERANCE_PX * 1.2);

      if (
        isPointNearClosingTarget({
          point: documentPoint,
          firstPoint: currentPoints[0] ?? null,
          tolerance: closeTolerance,
          currentPointCount: currentPoints.length,
          minimumPointsBeforeClose: 3,
        })
      ) {
        finishMeasurementDraft("area", currentPoints);
        return;
      }

      setDraftGeometry({
        tool: "area",
        points: [...currentPoints, documentPoint],
        hasChanges: true,
      });
      return;
    }

    if (toolMode === "count") {
      if (!effectiveMeasurementReadiness.canCreateCount) {
        return;
      }

      setSelection(null);
      submitCount(documentPoint);
      return;
    }

    setSelection(null);
  }

  function handleCanvasDoubleClick() {
    if (draftGeometry.tool === "polyline" && draftGeometry.points.length >= 2) {
      finishMeasurementDraft("polyline", draftGeometry.points);
      return;
    }

    if (draftGeometry.tool === "area" && draftGeometry.points.length >= 3) {
      finishMeasurementDraft("area", draftGeometry.points);
    }
  }

  function stopViewerEventPropagation(event: SyntheticEvent) {
    event.stopPropagation();
  }

  function clearHoverState() {
    activeSnapCandidateRef.current = null;
    setHoverState({ rawDocumentPoint: null, documentPoint: null, hitTarget: null, snapCandidate: null });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const shouldForcePan = event.button === 1 || isSpacePanActive;

    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    if (shouldForcePan) {
      event.preventDefault();
    }

    event.currentTarget.focus();

    if (shouldForcePan) {
      event.currentTarget.setPointerCapture(event.pointerId);
      interactionRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      setIsDragging(true);
      return;
    }

    const rawDocumentPoint = getDocumentPointFromClientCoordinates(event.clientX, event.clientY);
    if (!rawDocumentPoint) {
      return;
    }

    const hitTarget = filterHitTargetForCurrentTool(getHitTarget(rawDocumentPoint));
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      kind: "pending-click",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hitTarget,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const rawDocumentPoint = getDocumentPointFromClientCoordinates(event.clientX, event.clientY);
    const interaction = interactionRef.current;
    const shouldSnapForHover =
      toolMode !== "select" ||
      (interaction.kind === "edit" &&
        (interaction.target.type === "calibration-point" || interaction.target.type === "measurement-point"));
    const snapResolution =
      rawDocumentPoint && shouldSnapForHover
        ? getSnapResolution({
            rawDocumentPoint,
            mode: interaction.kind === "edit" ? "edit" : "place",
            editingMeasurementId:
              interaction.kind === "edit" && interaction.target.type === "measurement-point"
                ? interaction.target.measurementId
                : undefined,
            editingPointIndex:
              interaction.kind === "edit" && interaction.target.type === "measurement-point"
                ? interaction.target.pointIndex
                : undefined,
            editingCalibrationPointIndex:
              interaction.kind === "edit" && interaction.target.type === "calibration-point"
                ? interaction.target.pointIndex
                : undefined,
          })
        : null;

    if (rawDocumentPoint) {
      activeSnapCandidateRef.current = snapResolution?.candidate ?? null;
      setHoverState({
        rawDocumentPoint,
        documentPoint: snapResolution?.point ?? rawDocumentPoint,
        hitTarget: filterHitTargetForCurrentTool(getHitTarget(rawDocumentPoint)),
        snapCandidate: snapResolution?.candidate ?? null,
      });
    } else {
      activeSnapCandidateRef.current = null;
      setHoverState({
        rawDocumentPoint: null,
        documentPoint: null,
        hitTarget: null,
        snapCandidate: null,
      });
    }

    if (interaction.kind === "idle" || interaction.pointerId !== event.pointerId) {
      return;
    }

    if (interaction.kind === "pending-click") {
      const moved = Math.hypot(event.clientX - interaction.startX, event.clientY - interaction.startY) > 4;
      if (!moved) {
        return;
      }

      if (interaction.hitTarget?.type === "calibration-point" || interaction.hitTarget?.type === "measurement-point") {
        interactionRef.current = {
          kind: "edit",
          pointerId: event.pointerId,
          target: interaction.hitTarget,
          dirty: false,
        };
        setIsDragging(true);
        return;
      }

      interactionRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      setIsDragging(true);
      return;
    }

    if (interaction.kind === "pan") {
      const deltaX = event.clientX - interaction.lastX;
      const deltaY = event.clientY - interaction.lastY;
      interactionRef.current = {
        kind: "pan",
        pointerId: interaction.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      setPan(
        transform.clampPan({
          x: transform.pan.x + deltaX,
          y: transform.pan.y + deltaY,
        })
      );
      return;
    }

    if (interaction.kind === "edit" && rawDocumentPoint) {
      const resolvedPoint =
        snapResolution?.point ??
        rawDocumentPoint;
      activeSnapCandidateRef.current = snapResolution?.candidate ?? null;
      interactionRef.current = {
        ...interaction,
        dirty: true,
      };

      if (interaction.target.type === "calibration-point") {
        setSelection({ type: "calibration" });
        setDraftGeometry((currentDraft) => {
          const currentPoints = currentDraft.tool === "calibrate" ? currentDraft.points : calibrationPointsForDisplay;
          if (currentPoints.length < 2) {
            return currentDraft;
          }
          const nextPoints = [...currentPoints];
          nextPoints[interaction.target.pointIndex] = resolvedPoint;
          return {
            tool: "calibrate",
            points: nextPoints,
            hasChanges: true,
          };
        });
        return;
      }

      const measurementId = interaction.target.measurementId;
      setSelection({ type: "measurement", measurementId });
      setMeasurementPointOverrides((currentOverrides) => {
        const measurement = savedMeasurements.find((item) => item.id === measurementId);
        if (!measurement) {
          return currentOverrides;
        }
        const nextPoints = [...(currentOverrides[measurement.id] ?? measurement.documentPoints)];
        nextPoints[interaction.target.pointIndex] = resolvedPoint;
        return {
          ...currentOverrides,
          [measurement.id]: nextPoints,
        };
      });
    }
  }

  function stopPointerInteraction(event?: ReactPointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsDragging(false);
    interactionRef.current = { kind: "idle" };
    activeSnapCandidateRef.current = null;

    if (interaction.kind === "pending-click") {
      const viewportElement = viewportRef.current;
      if (!viewportElement || (event && interaction.pointerId !== event.pointerId)) {
        return;
      }

      const rawDocumentPoint = event ? getDocumentPointFromClientCoordinates(event.clientX, event.clientY) : null;
      if (!rawDocumentPoint) {
        return;
      }

      const resolvedDocumentPoint =
        toolMode === "select"
          ? rawDocumentPoint
          : getSnapResolution({
              rawDocumentPoint,
              mode: "place",
            }).point;

      if (interaction.hitTarget?.type === "calibration-point" || interaction.hitTarget?.type === "calibration-segment") {
        setSelection({ type: "calibration" });
        if (toolMode === "calibrate") {
          setDraftGeometry((currentDraft) =>
            currentDraft.tool === "calibrate"
              ? currentDraft
              : { tool: "calibrate", points: savedCalibrationPoints, hasChanges: false }
          );
        } else {
          setToolMode("select");
        }
        return;
      }

      if (interaction.hitTarget?.type === "measurement-point" || interaction.hitTarget?.type === "measurement-segment") {
      const measurementId = interaction.hitTarget.measurementId;
      setSelection({ type: "measurement", measurementId });
      setToolMode("select");
      return;
      }

      handleCanvasClick(resolvedDocumentPoint);
      return;
    }

    if (interaction.kind === "edit" && interaction.dirty) {
      if (interaction.target.type === "measurement-point") {
        const points = measurementPointOverrides[interaction.target.measurementId];
        if (points && points.length >= 2) {
          submitMeasurementUpdate(interaction.target.measurementId, points);
        }
      }
    }
  }

  const showUnavailableState = !pdfUrl || loadState === "error";
  const canvasCursor =
    isDragging
      ? "cursor-grabbing"
      : toolMode === "select" || isSpacePanActive
        ? "cursor-grab"
        : "cursor-crosshair";
  const draftStatusLabel =
    hasUnsavedCalibrationChanges || hasUnsavedMeasurementDraft ? `${formatDraftToolLabel(draftGeometry.tool)} draft` : null;
  const workspaceStatusLabel =
    loadState === "loading"
      ? "Loading source PDF..."
      : isRendering
        ? "Rendering crisp page..."
        : saveFeedback.kind !== "idle"
          ? saveFeedback.message
          : "All changes synced";
  const helperMessage =
    toolMode === "calibrate"
      ? "Place two known points on the drawing, then enter the real-world length in the inspector."
      : selection?.type === "measurement"
        ? "Drag anchors directly on the drawing to refine geometry. Use the inspector to rename, tag, or remove the selected item."
        : toolMode === "polyline"
          ? "Click to add each segment point, then finish from the inspector or double-click on the drawing."
          : toolMode === "area"
            ? "Click to place polygon corners. Finish from the inspector or close near the first point."
            : toolMode === "distance"
              ? "Click two points to place a calibrated distance. The drawing stays in document space while you measure."
                : toolMode === "count"
                  ? "Click anywhere on the drawing to place a count marker. Reposition later by dragging it."
                  : effectiveMeasurementReadiness.message;
  const sidebarSaveConfig = (() => {
    if (toolMode === "calibrate") {
      return {
        label: localActiveCalibration ? "Save Calibration" : "Create Calibration",
        disabled: calibrationPointsForDisplay.length < 2 || isSaving,
        onSave: () => submitCalibration(calibrationPointsForDisplay),
      };
    }

    if (toolMode === "polyline") {
      return {
        label: "Save Polyline",
        disabled: draftGeometry.tool !== "polyline" || draftGeometry.points.length < 2 || isSaving,
        onSave: () => finishMeasurementDraft("polyline", draftGeometry.points),
      };
    }

    if (toolMode === "area") {
      return {
        label: "Save Area",
        disabled: draftGeometry.tool !== "area" || draftGeometry.points.length < 3 || isSaving,
        onSave: () => finishMeasurementDraft("area", draftGeometry.points),
      };
    }

    if (selection?.type === "measurement") {
      return {
        label: "Save Details",
        disabled: !hasUnsavedMeasurementDetailChanges || isSaving || !selectedMeasurement,
        onSave: () => submitMeasurementDetails(selection.measurementId),
      };
    }

    return {
      label: "Save",
      disabled: true,
      onSave: () => undefined,
    };
  })();
  return (
    <div className="flex h-full min-h-0 w-full gap-4 bg-[#FBFEFE] p-4">
      <MeasureEditorSidebar
        footer={
          <MeasureSidebarFooter
            onCancel={cancelCurrentInteraction}
            onSave={sidebarSaveConfig.onSave}
            saveDisabled={sidebarSaveConfig.disabled}
            saveLabel={sidebarSaveConfig.label}
          />
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8A94A6]">Measure editor</p>
            <p className="text-[15px] font-semibold text-[#1D2433]">{pageLabel}</p>
            <p className="text-[13px] leading-[1.6] text-[#64748B]">{helperMessage}</p>
          </div>

          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              {(["select", "calibrate", "distance", "polyline", "area", "count"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={toolMode === mode ? "orange" : "outline"}
                  onClick={() => beginToolMode(mode)}
                  className={`h-10 rounded-[10px] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] ${
                    toolMode === mode
                      ? "bg-[#F15A29] text-white hover:bg-[#d94f22]"
                      : "border-[#D7E0EA] bg-white text-[#475569] hover:bg-[#F8FAFC]"
                  }`}
                >
                  {mode}
                </Button>
              ))}
            </div>
            <div className="rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569]">Workspace status</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{draftStatusLabel ?? "Synced"}</span>
              </div>
              <p className="mt-1 text-[12px] text-[#64748B]">{workspaceStatusLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelection({ type: "calibration" });
              beginToolMode("calibrate");
            }}
            className={`w-full rounded-[14px] border px-3 py-3 text-left transition-colors ${
              selection?.type === "calibration"
                ? "border-[#F15A29] bg-[#FFF4EE]"
                : hasUnsavedCalibrationChanges
                  ? "border-[#FDBA74] bg-[#FFF7ED]"
                  : "border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-[#1E293B]">Calibration</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                {hasUnsavedCalibrationChanges ? "Draft" : localActiveCalibration ? "Saved" : "Unset"}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[#64748B]">
              {localActiveCalibration
                ? `${localActiveCalibration.name} • ${localActiveCalibration.reference_length_input} ${localActiveCalibration.display_unit}`
                : "Place two known points to set the page scale."}
            </p>
          </button>

          <div className="space-y-2 rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8A94A6]">Takeoff items</p>
                <p className="mt-1 text-[13px] text-[#475569]">Canvas and list selection stay in sync.</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#64748B]">{toolMode}</span>
            </div>

            <div className="grid gap-2 rounded-[14px] border border-[#E2E8F0] bg-white p-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={filterType}
                  onChange={(event) => setFilterType(event.target.value as "all" | "distance" | "area" | "count")}
                  className="h-9 rounded-[10px] border border-[#D7E0EA] bg-white px-3 text-[12px] text-[#334155] outline-none"
                >
                  <option value="all">All types</option>
                  <option value="distance">Distance / Polyline</option>
                  <option value="area">Area</option>
                  <option value="count">Count</option>
                </select>
                <select
                  value={filterTag}
                  onChange={(event) => setFilterTag(event.target.value)}
                  className="h-9 rounded-[10px] border border-[#D7E0EA] bg-white px-3 text-[12px] text-[#334155] outline-none"
                >
                  <option value="all">All tags</option>
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={groupBy === "tag" ? "orange" : "outline"}
                  onClick={() => setGroupBy("tag")}
                  className={groupBy === "tag" ? "h-9 rounded-[10px] bg-[#F15A29] text-white hover:bg-[#d94f22]" : "h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[#475569] hover:bg-[#F8FAFC]"}
                >
                  Group by tag
                </Button>
                <Button
                  type="button"
                  variant={groupBy === "type" ? "orange" : "outline"}
                  onClick={() => setGroupBy("type")}
                  className={groupBy === "type" ? "h-9 rounded-[10px] bg-[#F15A29] text-white hover:bg-[#d94f22]" : "h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[#475569] hover:bg-[#F8FAFC]"}
                >
                  Group by type
                </Button>
              </div>
            </div>

            {savedMeasurements.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-[#D7E0EA] bg-white px-3 py-3 text-[12px] text-[#64748B]">
                No saved measurements yet. Choose `Distance`, `Polyline`, `Area`, or `Count` to start authoring on the drawing.
              </div>
            ) : filteredMeasurements.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-[#D7E0EA] bg-white px-3 py-3 text-[12px] text-[#64748B]">
                No measurements match the current filters.
              </div>
            ) : (
              groupedMeasurements.map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className="rounded-[12px] border border-[#E2E8F0] bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569]">{group.key}</span>
                      <span className="text-[11px] text-[#64748B]">{group.measurements.length} item{group.measurements.length === 1 ? "" : "s"}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#64748B]">{group.totals.join(" • ")}</p>
                  </div>
                  {group.measurements.map((measurement) => {
                    const isHovered =
                      (hoverState.hitTarget?.type === "measurement-segment" && hoverState.hitTarget.measurementId === measurement.id) ||
                      (hoverState.hitTarget?.type === "measurement-point" && hoverState.hitTarget.measurementId === measurement.id);

                    return (
                      <button
                        key={measurement.id}
                        type="button"
                        onClick={() => {
                          setSelection({ type: "measurement", measurementId: measurement.id });
                          setToolMode("select");
                        }}
                        className={`w-full rounded-[14px] border px-3 py-3 text-left transition-colors ${
                          selection?.type === "measurement" && selection.measurementId === measurement.id
                            ? "border-[#F15A29] bg-[#FFF4EE]"
                            : isHovered
                              ? "border-[#FDBA74] bg-[#FFF7ED]"
                              : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-semibold text-[#1E293B]">{measurement.name}</span>
                          <span className="text-[12px] font-semibold" style={{ color: measurement.color }}>
                            {measurement.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-[#64748B]">
                          {measurement.tag ? `${measurement.tag} • ` : ""}
                          {selection?.type === "measurement" && selection.measurementId === measurement.id
                            ? "Selected on canvas"
                            : measurement.measurementKind === "count"
                              ? "Click to focus and reposition the count marker."
                              : measurement.measurementKind === "area"
                                ? "Click to focus and edit polygon vertices."
                                : measurement.isPolyline
                                  ? "Click to focus and edit polyline vertices."
                                  : "Click to focus and edit endpoints."}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ))
            )}

            {countMeasurements.length > 0 ? (
              <div className="rounded-[14px] border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1D4ED8]">Count total</span>
                  <span className="text-[14px] font-semibold text-[#1E3A8A]">{totalCountValue}</span>
                </div>
                <p className="mt-1 text-[12px] text-[#475569]">All placed count markers on this sheet.</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8A94A6]">Measurement space</p>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#475569]">{effectiveMeasurementReadiness.message}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={runUndo} disabled={undoStack.length === 0 || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[#475569] hover:bg-[#F8FAFC]">
                Undo
              </Button>
              <Button type="button" variant="outline" onClick={runRedo} disabled={redoStack.length === 0 || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[#475569] hover:bg-[#F8FAFC]">
                Redo
              </Button>
              <span className="text-[12px] text-[#6B7C93]">{undoStack.length} undo • {redoStack.length} redo</span>
            </div>
            {actionError ? (
              <div className="rounded-[12px] border border-[#FECACA] bg-[#FFF1F2] px-3 py-2 text-[12px] text-[#9F1239]">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{actionError}</span>
                  {saveFeedback.kind === "error" && saveFeedback.retry ? (
                    <Button type="button" variant="outline" onClick={saveFeedback.retry} className="h-8 rounded-[8px] border-[#FDA4AF] bg-white px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9F1239]">
                      {saveFeedback.retryLabel ?? "Retry"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {toolMode === "calibrate" ? (
              <div className="grid gap-2">
                <input value={calibrationName} onChange={(event) => setCalibrationName(event.target.value)} placeholder="Calibration name" className="h-10 rounded-[10px] border border-[#D7E0EA] bg-white px-3 text-[13px] text-[#334155] outline-none" />
                <div className="grid grid-cols-[1fr,110px,110px] gap-2">
                  <input value={calibrationLengthInput} onChange={(event) => setCalibrationLengthInput(event.target.value)} inputMode="decimal" placeholder="Known length" className="h-10 rounded-[10px] border border-[#D7E0EA] bg-white px-3 text-[13px] text-[#334155] outline-none" />
                  <select
                    value={calibrationDisplayUnit}
                    onChange={(event) => {
                      setCalibrationDisplayUnit(event.target.value);
                      setCalibrationUnitSystem(inferUnitSystem(event.target.value));
                    }}
                    className="h-10 rounded-[10px] border border-[#D7E0EA] bg-white px-3 text-[13px] text-[#334155] outline-none"
                  >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                    <option value="in">in</option>
                    <option value="ft">ft</option>
                  </select>
                  <Button type="button" variant="orange" disabled={calibrationPointsForDisplay.length < 2 || isSaving} onClick={() => submitCalibration(calibrationPointsForDisplay)} className="h-10 rounded-[10px] bg-[#F15A29] text-[12px] font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#d94f22]">
                    {localActiveCalibration ? "Replace" : "Save"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={revertCalibrationDraft} disabled={!hasUnsavedCalibrationChanges || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569] hover:bg-[#F8FAFC]">
                    Revert
                  </Button>
                  <Button type="button" variant="outline" onClick={removeLastDraftPoint} disabled={calibrationPointsForDisplay.length === 0 || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569] hover:bg-[#F8FAFC]">
                    Remove point
                  </Button>
                </div>
                <p className="text-[12px] text-[#6B7C93]">Place two points, enter the known length, then save. Drag the anchors to refine the calibration. `Esc` reverts draft changes.</p>
              </div>
            ) : null}

            {toolMode === "distance" ? (
              <div className="grid gap-2">
                <p className="text-[12px] text-[#6B7C93]">Click two points on the drawing to create a calibrated distance measurement. This draft state is already modeled as a point array so it can expand into polyline/area tools next.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={removeLastDraftPoint} disabled={draftGeometry.tool !== "distance" || !hasUnsavedMeasurementDraft || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569] hover:bg-[#F8FAFC]">
                    Remove point
                  </Button>
                  <Button type="button" variant="outline" onClick={clearMeasurementDraft} disabled={draftGeometry.tool !== "distance" || !hasUnsavedMeasurementDraft || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569] hover:bg-[#F8FAFC]">
                    Clear draft
                  </Button>
                </div>
              </div>
            ) : null}

            {toolMode === "polyline" ? (
              <div className="grid gap-2">
                <p className="text-[12px] text-[#6B7C93]">Click to add each segment point. Double-click or press Finish to save the polyline. `Backspace` removes the last draft point.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={removeLastDraftPoint} disabled={draftGeometry.tool !== "polyline" || !hasUnsavedMeasurementDraft || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569] hover:bg-[#F8FAFC]">
                    Remove point
                  </Button>
                  <Button type="button" variant="outline" onClick={clearMeasurementDraft} disabled={draftGeometry.tool !== "polyline" || !hasUnsavedMeasurementDraft || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569] hover:bg-[#F8FAFC]">
                    Clear draft
                  </Button>
                  <Button type="button" variant="orange" onClick={() => finishMeasurementDraft("polyline", draftGeometry.points)} disabled={draftGeometry.tool !== "polyline" || draftGeometry.points.length < 2 || isSaving} className="h-9 rounded-[10px] bg-[#F15A29] text-[12px] font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#d94f22]">
                    Finish
                  </Button>
                </div>
              </div>
            ) : null}

            {toolMode === "area" ? (
              <div className="grid gap-2">
                <p className="text-[12px] text-[#6B7C93]">Click to place polygon corners. Finish explicitly or click back near the first anchor to close and save the area.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={removeLastDraftPoint} disabled={draftGeometry.tool !== "area" || !hasUnsavedMeasurementDraft || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569] hover:bg-[#F8FAFC]">
                    Remove point
                  </Button>
                  <Button type="button" variant="outline" onClick={clearMeasurementDraft} disabled={draftGeometry.tool !== "area" || !hasUnsavedMeasurementDraft || isSaving} className="h-9 rounded-[10px] border-[#D7E0EA] bg-white text-[12px] font-semibold uppercase tracking-[0.08em] text-[#475569] hover:bg-[#F8FAFC]">
                    Clear draft
                  </Button>
                  <Button type="button" variant="orange" onClick={() => finishMeasurementDraft("area", draftGeometry.points)} disabled={draftGeometry.tool !== "area" || draftGeometry.points.length < 3 || isSaving} className="h-9 rounded-[10px] bg-[#0F766E] text-[12px] font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#0d6b63]">
                    Finish
                  </Button>
                </div>
              </div>
            ) : null}

            {toolMode === "count" ? (
              <div className="grid gap-2">
                <p className="text-[12px] text-[#6B7C93]">Click anywhere on the drawing to place a count marker. Count markers are stored in document space and can be selected, repositioned, or deleted later.</p>
              </div>
            ) : null}

            {selection?.type === "measurement" ? (
              <div className="grid gap-2">
                <p className="text-[12px] text-[#6B7C93]">Selected measurement. Drag any visible anchor or marker to update geometry live. Press `Delete` to remove it.</p>
                <input value={measurementNameInput} onChange={(event) => setMeasurementNameInput(event.target.value)} placeholder="Measurement name" className="h-10 rounded-[10px] border border-[#D7E0EA] bg-white px-3 text-[13px] text-[#334155] outline-none" />
                <input value={measurementTagInput} onChange={(event) => setMeasurementTagInput(event.target.value)} placeholder="Tag / category" className="h-10 rounded-[10px] border border-[#D7E0EA] bg-white px-3 text-[13px] text-[#334155] outline-none" />
                <textarea value={measurementNoteInput} onChange={(event) => setMeasurementNoteInput(event.target.value)} placeholder="Notes" rows={3} className="rounded-[10px] border border-[#D7E0EA] bg-white px-3 py-2 text-[13px] text-[#334155] outline-none" />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="orange"
                    onClick={() => {
                      if (selection?.type === "measurement") {
                        submitMeasurementDetails(selection.measurementId);
                      }
                    }}
                    disabled={!hasUnsavedMeasurementDetailChanges || isSaving || !selectedMeasurement}
                    className="h-9 rounded-[10px] bg-[#F15A29] text-[12px] font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#d94f22]"
                  >
                    Save details
                  </Button>
                  <Button type="button" variant="outline" onClick={deleteSelectedMeasurement} disabled={isSaving} className="h-9 rounded-[10px] border-[#FECACA] bg-[#FFF1F2] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#BE123C] hover:bg-[#FFE4E6]">
                    Delete selected
                  </Button>
                </div>
              </div>
            ) : null}

            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#94A3B8]">Shortcuts: `V` select, hold `Space` to pan, `C` calibrate, `D` distance, `P` polyline, `A` area, `N` count, `Esc` cancel/reset</p>
          </div>
        </div>
      </MeasureEditorSidebar>

      <MeasureCanvasViewport>
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#EEF3F8]">
          <div className="relative flex-1 overflow-hidden">
            <div
              ref={viewportRef}
              tabIndex={0}
              className={`relative h-full min-h-0 w-full overflow-hidden bg-[linear-gradient(180deg,#F6F8FB_0%,#E8EEF5_100%)] ${canvasCursor}`}
              style={{ touchAction: "none", overscrollBehavior: "contain" }}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onDoubleClick={handleCanvasDoubleClick}
              onPointerLeave={clearHoverState}
              onPointerUp={stopPointerInteraction}
              onPointerCancel={stopPointerInteraction}
            >
              <div
                className={transform.viewportOrigin === "top-left" ? "absolute left-0 top-0 touch-none" : "absolute left-1/2 top-1/2 touch-none"}
                style={{
                  width: `${transform.metrics.committedCssWidth}px`,
                  height: `${transform.metrics.committedCssHeight}px`,
                  transform:
                    transform.viewportOrigin === "top-left"
                      ? `translate(${transform.metrics.boundedPanX}px, ${transform.metrics.boundedPanY}px)`
                      : `translate(calc(-50% + ${transform.metrics.boundedPanX}px), calc(-50% + ${transform.metrics.boundedPanY}px))`,
                }}
              >
                <div
                  className={`relative h-full w-full ${transform.viewportOrigin === "top-left" ? "origin-top-left" : "origin-center"}`}
                  style={{
                    transform: `scale(${transientZoom})`,
                    willChange: transientZoom !== 1 ? "transform" : undefined,
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 block h-full w-full select-none rounded-[6px] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.16)]"
                  />

                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                    viewBox={`0 0 ${documentPageSize.width} ${documentPageSize.height}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {calibrationPointsForDisplay.length >= 2 ? (
                      <g>
                        <line
                          x1={calibrationPointsForDisplay[0].x}
                          y1={calibrationPointsForDisplay[0].y}
                          x2={calibrationPointsForDisplay[1].x}
                          y2={calibrationPointsForDisplay[1].y}
                          stroke={hasUnsavedCalibrationChanges ? "#F15A29" : selection?.type === "calibration" ? "#0F766E" : "#14B8A6"}
                          strokeWidth="2.5"
                          strokeDasharray={hasUnsavedCalibrationChanges ? "7 5" : "10 7"}
                          vectorEffect="non-scaling-stroke"
                        />
                        {calibrationPointsForDisplay.map((point, index) => (
                          <circle
                            key={`calibration-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r={
                              hoverState.hitTarget?.type === "calibration-point" && hoverState.hitTarget.pointIndex === index
                                ? "9"
                                : selection?.type === "calibration"
                                  ? "8"
                                  : "7"
                            }
                            fill={hasUnsavedCalibrationChanges ? "#F15A29" : "#0F766E"}
                            stroke="#ffffff"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                    ) : null}

                    {toolMode === "calibrate" && calibrationPointsForDisplay.length === 1 && hoverState.documentPoint ? (
                      <line
                        x1={calibrationPointsForDisplay[0].x}
                        y1={calibrationPointsForDisplay[0].y}
                        x2={hoverState.documentPoint.x}
                        y2={hoverState.documentPoint.y}
                        stroke="#14B8A6"
                        strokeWidth="2"
                        strokeDasharray="8 6"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}

                    {savedMeasurements.map((measurement) => (
                      <g key={measurement.id}>
                        {measurement.measurementKind === "count" ? (
                          measurement.documentPoints[0] ? (
                            <>
                              <circle
                                cx={measurement.documentPoints[0].x}
                                cy={measurement.documentPoints[0].y}
                                r={
                                  selection?.type === "measurement" && selection.measurementId === measurement.id
                                    ? "10"
                                    : hoverState.hitTarget?.type === "measurement-point" && hoverState.hitTarget.measurementId === measurement.id
                                      ? "9"
                                      : "8"
                                }
                                fill={selection?.type === "measurement" && selection.measurementId === measurement.id ? "#1D4ED8" : measurement.color}
                                stroke="#ffffff"
                                strokeWidth="2.5"
                                vectorEffect="non-scaling-stroke"
                              />
                              <path
                                d={`M ${measurement.documentPoints[0].x - 4} ${measurement.documentPoints[0].y} H ${measurement.documentPoints[0].x + 4} M ${measurement.documentPoints[0].x} ${measurement.documentPoints[0].y - 4} V ${measurement.documentPoints[0].y + 4}`}
                                stroke="#ffffff"
                                strokeWidth="2"
                                strokeLinecap="round"
                                vectorEffect="non-scaling-stroke"
                              />
                            </>
                          ) : null
                        ) : measurement.measurementKind === "area" ? (
                          <polygon
                            points={measurement.path}
                            fill={selection?.type === "measurement" && selection.measurementId === measurement.id ? "rgba(15,118,110,0.18)" : "rgba(15,118,110,0.12)"}
                            stroke={
                              selection?.type === "measurement" && selection.measurementId === measurement.id
                                ? "#EA580C"
                                : hoverState.hitTarget?.type === "measurement-segment" && hoverState.hitTarget.measurementId === measurement.id
                                  ? "#FB923C"
                                  : measurement.color
                            }
                            strokeWidth={selection?.type === "measurement" && selection.measurementId === measurement.id ? "3.25" : "2.75"}
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : (
                          <polyline
                            points={measurement.path}
                            fill="none"
                            stroke={
                              selection?.type === "measurement" && selection.measurementId === measurement.id
                                ? "#EA580C"
                                : hoverState.hitTarget?.type === "measurement-segment" && hoverState.hitTarget.measurementId === measurement.id
                                  ? "#FB923C"
                                  : measurement.color
                            }
                            strokeWidth={selection?.type === "measurement" && selection.measurementId === measurement.id ? "3.25" : "2.75"}
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        {measurement.measurementKind === "count"
                          ? null
                          : measurement.documentPoints.map((point, index) => (
                              <circle
                                key={`${measurement.id}-${index}`}
                                cx={point.x}
                                cy={point.y}
                                r={
                                  hoverState.hitTarget?.type === "measurement-point" &&
                                  hoverState.hitTarget.measurementId === measurement.id &&
                                  hoverState.hitTarget.pointIndex === index
                                    ? "8"
                                    : selection?.type === "measurement" && selection.measurementId === measurement.id
                                      ? "7"
                                      : "6"
                                }
                                fill={selection?.type === "measurement" && selection.measurementId === measurement.id ? "#EA580C" : measurement.color}
                                stroke="#ffffff"
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                      </g>
                    ))}

                    {distanceDraftPreview ? (
                      <g>
                        <polyline
                          points={distanceDraftPreview.path}
                          fill="none"
                          stroke="#F15A29"
                          strokeWidth="2.5"
                          strokeDasharray="8 6"
                          vectorEffect="non-scaling-stroke"
                          strokeLinecap="round"
                        />
                        {distanceDraftPreview.points.map((point, index) => (
                          <circle key={`draft-distance-${index}`} cx={point.x} cy={point.y} r="5.5" fill="#F15A29" stroke="#ffffff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        ))}
                      </g>
                    ) : null}

                    {polylineDraftPreview ? (
                      <g>
                        <polyline
                          points={polylineDraftPreview.path}
                          fill="none"
                          stroke="#F15A29"
                          strokeWidth="2.5"
                          strokeDasharray="8 6"
                          vectorEffect="non-scaling-stroke"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {polylineDraftPreview.points.map((point, index) => (
                          <circle
                            key={`draft-polyline-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r={index === polylineDraftPreview.points.length - 1 && hoverState.documentPoint ? "5" : "5.5"}
                            fill="#F15A29"
                            stroke="#ffffff"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                    ) : null}

                    {areaDraftPreview ? (
                      <g>
                        {areaDraftPreview.points.length >= 2 ? (
                          <polygon
                            points={areaDraftPreview.path}
                            fill="rgba(15,118,110,0.12)"
                            stroke="#0F766E"
                            strokeWidth="2.5"
                            strokeDasharray="8 6"
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                          />
                        ) : null}
                        {areaDraftPreview.points.map((point, index) => (
                          <circle
                            key={`draft-area-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r={index === 0 && areaDraftPreview.canFinish ? "7" : "5.5"}
                            fill={index === 0 && areaDraftPreview.canFinish ? "#0F766E" : "#14B8A6"}
                            stroke="#ffffff"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                    ) : null}

                    {countDraftPreview ? (
                      <g>
                        <circle cx={countDraftPreview.point.x} cy={countDraftPreview.point.y} r="8" fill={DEFAULT_COUNT_COLOR} fillOpacity="0.88" stroke="#ffffff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                        <path
                          d={`M ${countDraftPreview.point.x - 4} ${countDraftPreview.point.y} H ${countDraftPreview.point.x + 4} M ${countDraftPreview.point.x} ${countDraftPreview.point.y - 4} V ${countDraftPreview.point.y + 4}`}
                          stroke="#ffffff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    ) : null}

                    {hoverState.snapCandidate && hoverState.documentPoint ? (
                      <g>
                        {hoverState.rawDocumentPoint &&
                        (Math.abs(hoverState.rawDocumentPoint.x - hoverState.documentPoint.x) > 0.001 ||
                          Math.abs(hoverState.rawDocumentPoint.y - hoverState.documentPoint.y) > 0.001) ? (
                          <line
                            x1={hoverState.rawDocumentPoint.x}
                            y1={hoverState.rawDocumentPoint.y}
                            x2={hoverState.documentPoint.x}
                            y2={hoverState.documentPoint.y}
                            stroke={hoverState.snapCandidate.kind === "draft-closure" ? "#0F766E" : "#F59E0B"}
                            strokeWidth="1.75"
                            strokeDasharray="4 4"
                            vectorEffect="non-scaling-stroke"
                          />
                        ) : null}
                        <circle
                          cx={hoverState.documentPoint.x}
                          cy={hoverState.documentPoint.y}
                          r={hoverState.snapCandidate.kind === "draft-closure" ? "10" : "8"}
                          fill="none"
                          stroke={hoverState.snapCandidate.kind === "draft-closure" ? "#0F766E" : "#F59E0B"}
                          strokeWidth="2.25"
                          vectorEffect="non-scaling-stroke"
                        />
                        <circle
                          cx={hoverState.documentPoint.x}
                          cy={hoverState.documentPoint.y}
                          r="3.5"
                          fill={hoverState.snapCandidate.kind === "draft-closure" ? "#0F766E" : "#F59E0B"}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    ) : null}
                  </svg>

                  <div className="pointer-events-none absolute inset-0">
                    {calibrationPointsForDisplay.length >= 2 ? (
                      (() => {
                        const labelDocumentPoint = getLineLabelPosition({
                          pointA: calibrationPointsForDisplay[0],
                          pointB: calibrationPointsForDisplay[1],
                          offsetDistance: 18,
                        });
                        const midpoint = transform.documentPointToCommittedStagePoint(labelDocumentPoint);
                        return (
                          <div
                            className="absolute -translate-x-1/2 -translate-y-full rounded-full border border-white/80 bg-white/95 px-2.5 py-1 text-[11px] font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-sm"
                            style={{ color: hasUnsavedCalibrationChanges ? "#C2410C" : "#0F766E", left: `${midpoint.x}px`, top: `${midpoint.y}px` }}
                          >
                            {calibrationScale
                              ? `${hasUnsavedCalibrationChanges ? "Draft: " : ""}${calibrationLengthInput || "0"} ${calibrationScale.displayUnit}`
                              : hasUnsavedCalibrationChanges
                                ? "Calibration draft"
                                : "Calibration"}
                          </div>
                        );
                      })()
                    ) : null}

                    {savedMeasurements.map((measurement) => {
                      if (!measurement.labelAnchor) {
                        return null;
                      }

                      const labelPoint = transform.documentPointToCommittedStagePoint(measurement.labelAnchor);
                      const isSelected = selection?.type === "measurement" && selection.measurementId === measurement.id;
                      const isHovered =
                        (hoverState.hitTarget?.type === "measurement-segment" && hoverState.hitTarget.measurementId === measurement.id) ||
                        (hoverState.hitTarget?.type === "measurement-point" && hoverState.hitTarget.measurementId === measurement.id);

                      return (
                        <div
                          key={`${measurement.id}-label`}
                          className={`absolute max-w-[15rem] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-sm ${
                            isSelected
                              ? "border-[#FED7AA] bg-[#FFF7ED]"
                              : isHovered
                                ? "border-[#FDE68A] bg-[#FFFBEB]"
                                : "border-white/85 bg-white/96"
                          }`}
                          style={{
                            color: isSelected ? "#C2410C" : isHovered ? "#92400E" : "#334155",
                            left: `${labelPoint.x}px`,
                            top: `${labelPoint.y + getMeasurementLabelTopOffset({
                              isSelected,
                              isHovered,
                              measurementKind: measurement.measurementKind,
                            })}px`,
                          }}
                        >
                          {measurement.name} • {measurement.label}
                        </div>
                      );
                    })}

                    {distanceDraftPreview && distanceDraftPreview.labelAnchor ? (
                      <div
                        className="absolute -translate-x-1/2 -translate-y-full rounded-full border border-white/85 bg-white/96 px-2.5 py-1 text-[11px] font-semibold text-[#F15A29] shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-sm"
                        style={{
                          left: `${transform.documentPointToCommittedStagePoint(distanceDraftPreview.labelAnchor).x}px`,
                          top: `${transform.documentPointToCommittedStagePoint(distanceDraftPreview.labelAnchor).y}px`,
                        }}
                      >
                        Draft • {distanceDraftPreview.label}
                      </div>
                    ) : null}

                    {polylineDraftPreview && polylineDraftPreview.labelAnchor ? (
                      <div
                        className="absolute -translate-x-1/2 -translate-y-full rounded-full border border-white/85 bg-white/96 px-2.5 py-1 text-[11px] font-semibold text-[#F15A29] shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-sm"
                        style={{
                          left: `${transform.documentPointToCommittedStagePoint(polylineDraftPreview.labelAnchor).x}px`,
                          top: `${transform.documentPointToCommittedStagePoint(polylineDraftPreview.labelAnchor).y}px`,
                        }}
                      >
                        Draft • {polylineDraftPreview.label}
                      </div>
                    ) : null}

                    {areaDraftPreview && areaDraftPreview.labelAnchor ? (
                      <div
                        className="absolute -translate-x-1/2 -translate-y-full rounded-full border border-white/85 bg-white/96 px-2.5 py-1 text-[11px] font-semibold text-[#0F766E] shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-sm"
                        style={{
                          left: `${transform.documentPointToCommittedStagePoint(areaDraftPreview.labelAnchor).x}px`,
                          top: `${transform.documentPointToCommittedStagePoint(areaDraftPreview.labelAnchor).y}px`,
                        }}
                      >
                        Draft • {areaDraftPreview.label}
                      </div>
                    ) : null}

                    {countDraftPreview && countDraftPreview.labelAnchor ? (
                      <div
                        className="absolute -translate-x-1/2 -translate-y-full rounded-full border border-white/85 bg-white/96 px-2.5 py-1 text-[11px] font-semibold text-[#1D4ED8] shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-sm"
                        style={{
                          left: `${transform.documentPointToCommittedStagePoint(countDraftPreview.labelAnchor).x}px`,
                          top: `${transform.documentPointToCommittedStagePoint(countDraftPreview.labelAnchor).y - 12}px`,
                        }}
                      >
                        Draft • Count
                      </div>
                    ) : null}

                    {hoverState.snapCandidate && hoverState.documentPoint ? (
                      <div
                        className="absolute -translate-x-1/2 rounded-full border border-white/85 bg-white/96 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#475569] shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-sm"
                        style={{
                          left: `${transform.documentPointToCommittedStagePoint(hoverState.documentPoint).x}px`,
                          top: `${transform.documentPointToCommittedStagePoint(hoverState.documentPoint).y + 14}px`,
                        }}
                      >
                        {hoverState.snapCandidate.kind === "draft-closure"
                          ? "Close shape"
                          : hoverState.snapCandidate.kind === "vertex"
                            ? "Snap vertex"
                            : "Snap edge"}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {showUnavailableState ? (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <div className="max-w-lg rounded-[16px] border border-white/80 bg-white/92 px-5 py-4 shadow-[0_18px_44px_rgba(15,23,42,0.10)] backdrop-blur-sm">
                    <p className="text-[15px] font-semibold text-[#1d2433]">{!pdfUrl ? "Viewer unavailable" : "Unable to load drawing"}</p>
                    <p className="mt-2 text-[14px] leading-[1.6] text-[#6B7C93]">{error ?? "The selected takeoff page could not be opened for Measure."}</p>
                  </div>
                </div>
              ) : null}

              {(loadState === "loading" || isRendering || saveFeedback.kind !== "idle") && !error ? (
                <div
                  className={`absolute right-5 z-30 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium shadow-[0_10px_28px_rgba(15,23,42,0.10)] backdrop-blur-sm ${
                    saveFeedback.kind === "error"
                      ? "border-[#FECACA] bg-[#FFF1F2]/95 text-[#9F1239]"
                      : saveFeedback.kind === "saved"
                        ? "border-[#BBF7D0] bg-[#F0FDF4]/95 text-[#166534]"
                      : "border-white/75 bg-white/90 text-[#475569]"
                  }`}
                  style={{ bottom: "calc(92px + env(safe-area-inset-bottom, 0px))" }}
                >
                  <span>{loadState === "loading" ? "Loading source PDF..." : isRendering ? "Rendering crisp page..." : saveFeedback.message}</span>
                  {saveFeedback.kind === "error" && saveFeedback.retry ? (
                    <button type="button" onClick={saveFeedback.retry} className="rounded-full border border-[#FDA4AF] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#9F1239]">
                      {saveFeedback.retryLabel ?? "Retry"}
                    </button>
                  ) : null}
                  </div>
              ) : null}

              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4"
                style={{ bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
                onPointerDown={stopViewerEventPropagation}
                onClick={stopViewerEventPropagation}
                onDoubleClick={stopViewerEventPropagation}
                onWheel={stopViewerEventPropagation}
              >
                <MeasureBottomToolbar
                  activeTool={toolMode}
                  disabledTools={{
                    distance: !effectiveMeasurementReadiness.canCreateLine,
                    polyline: !effectiveMeasurementReadiness.canCreateLine,
                    area: !effectiveMeasurementReadiness.canCreateArea,
                    count: !effectiveMeasurementReadiness.canCreateCount,
                  }}
                  onSelectTool={beginToolMode}
                />
              </div>

              <div
                className="absolute right-5 z-20 flex items-center gap-2 rounded-full border border-white/75 bg-white/92 px-2 py-2 shadow-[0_12px_34px_rgba(15,23,42,0.10)] backdrop-blur-sm"
                style={{ bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
                onPointerDown={stopViewerEventPropagation}
                onClick={stopViewerEventPropagation}
                onDoubleClick={stopViewerEventPropagation}
                onWheel={stopViewerEventPropagation}
              >
                <button
                  type="button"
                  onClick={() => zoomByStep(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E0EA] bg-white text-[18px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                  aria-label="Zoom out"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-[#D7E0EA] bg-white px-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => zoomByStep(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E0EA] bg-white text-[18px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </MeasureCanvasViewport>
    </div>
  );
}
