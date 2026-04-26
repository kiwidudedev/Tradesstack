"use client";

import { flushSync } from "react-dom";
import Link from "next/link";
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
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Hash,
  Lightbulb,
  Settings2,
} from "lucide-react";
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
import { MeasureBottomToolbar } from "@/components/app/MeasureBottomToolbar";
import {
  ConfigurableTool,
  MeasureToolSetupState,
  MeasurementColorSelector,
  TakeoffMeasureToolDialog,
  measurementColorOptions,
} from "@/components/app/TakeoffMeasureToolDialog";
import {
  inputClassName,
  labelClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "@/components/app/TradesstackDialogPrimitives";
import { Input } from "@/components/ui/input";
import { downloadTakeoffPdf } from "@/lib/exports/takeoff-pdf-download";
import {
  buildTakeoffPdfExportFileName,
  exportTakeoffPageToPdf,
} from "@/lib/exports/takeoff-pdf-export";
import type {
  ExportTakeoffCalibration,
  ExportTakeoffLegendRow,
  ExportTakeoffMeasurement,
  ExportTakeoffRotation,
} from "@/lib/exports/takeoff-pdf-export-types";
import { ibmPlexSans } from "@/lib/fonts";

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
  base_unit: string;
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
  title: string;
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
  exitHref: string;
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
  onMeasurementCommitted?: (pageId: string, measurement: TakeoffMeasurement) => void;
  onCalibrationCommitted?: (pageId: string, calibration: TakeoffCalibration | null) => void;
  onPageChange: (pageId: string) => void;
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
type MeasurementChildKind = "count-item" | "area-shape" | "line-path";
type AreaShapeRole = "include" | "deduction";
type MeasurementChildSelection = {
  measurementId: string;
  childId: string;
  kind: MeasurementChildKind;
};
type DraftTool = "calibrate" | "distance" | "polyline" | "area" | "count" | null;
type HitTarget =
  | { type: "calibration-point"; pointIndex: 0 | 1 }
  | { type: "calibration-segment" }
  | { type: "measurement-point"; measurementId: string; pointIndex: number; childId?: string; childKind?: MeasurementChildKind }
  | { type: "measurement-segment"; measurementId: string; childId?: string; childKind?: MeasurementChildKind };
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

interface SummaryContextMenuState {
  measurementId: string;
  measurementKind: "line" | "area" | "count";
  measurementName: string;
  measurementDescription: string;
  measurementColor: string;
  isHiddenFromExportLegend: boolean;
  canAddDeduction: boolean;
  x: number;
  y: number;
}
interface SummaryMeasurementEditState {
  measurementId: string;
  x: number;
  y: number;
  name: string;
  description: string;
  colorHex: string;
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
interface PendingCountAppendItem {
  id: string;
  point: { x: number; y: number };
}
interface PendingPolylineAppendPath {
  id: string;
  points: Array<{ x: number; y: number }>;
  measuredLength: number;
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
const SELECTION_HIT_TOLERANCE_PX = 28;
const SNAP_TOLERANCE_PX = 18;
const SNAP_STICKINESS_MULTIPLIER = 1.45;
const DEFAULT_DISTANCE_COLOR = "#F15A29";
const DEFAULT_AREA_COLOR = "#0F766E";
const DEFAULT_COUNT_COLOR = "#2563EB";
const HISTORY_LIMIT = 60;
const DEFAULT_CALIBRATION_NAME = "Scale calibration";

const INITIAL_TOOL_SETUP: MeasureToolSetupState = {
  calibrate: {
    name: DEFAULT_CALIBRATION_NAME,
    referenceLengthInput: "",
    displayUnit: "mm",
    unitSystem: "metric",
  },
  distance: {
    name: "Distance",
    description: "",
    colorHex: DEFAULT_DISTANCE_COLOR,
    countValue: 1,
  },
  polyline: {
    name: "Linear",
    description: "",
    colorHex: DEFAULT_DISTANCE_COLOR,
    countValue: 1,
  },
  area: {
    name: "Area",
    description: "",
    colorHex: DEFAULT_AREA_COLOR,
    countValue: 1,
  },
  count: {
    name: "Count",
    description: "",
    colorHex: DEFAULT_COUNT_COLOR,
    countValue: 1,
  },
};

interface DisplayMeasurement {
  id: string;
  renderKey: string;
  name: string;
  description: string;
  measurementKind: "line" | "area" | "count";
  color: string;
  documentPoints: Point2D[];
  countPointIds: string[];
  path: string;
  measuredPerimeterBase: number | null;
  areaShapes: Array<{
    id: string;
    role: AreaShapeRole;
    documentPoints: Point2D[];
    path: string;
    area: number;
  }>;
  linePaths: Array<{
    id: string;
    documentPoints: Point2D[];
    path: string;
    length: number;
  }>;
  displayValue: number | null;
  displayUnit: string | null;
  label: string;
  labelAnchor: Point2D | null;
  isPolyline: boolean;
  countValue: number | null;
  tag: string | null;
  canEditGeometry: boolean;
}

function formatMeasurementValue(value: number | null, unit: string | null, fallback: string) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${rounded} ${unit}` : rounded;
}

function convertBaseLengthToDisplayValue(params: {
  baseUnit: string;
  displayUnit: string;
  value: number;
}): number | null {
  if (params.baseUnit === "mm") {
    if (params.displayUnit === "mm") {
      return params.value;
    }

    if (params.displayUnit === "cm") {
      return params.value / 10;
    }

    if (params.displayUnit === "m") {
      return params.value / 1000;
    }
  }

  if (params.baseUnit === "in") {
    if (params.displayUnit === "in") {
      return params.value;
    }

    if (params.displayUnit === "ft") {
      return params.value / 12;
    }
  }

  return null;
}

function convertBaseAreaToDisplayValue(params: {
  baseUnit: string;
  displayUnit: string;
  value: number;
}): number | null {
  if (params.baseUnit === "mm") {
    if (params.displayUnit === "mm") {
      return params.value;
    }

    if (params.displayUnit === "cm") {
      return params.value / 100;
    }

    if (params.displayUnit === "m") {
      return params.value / 1_000_000;
    }
  }

  if (params.baseUnit === "in") {
    if (params.displayUnit === "in") {
      return params.value;
    }

    if (params.displayUnit === "ft") {
      return params.value / 144;
    }
  }

  return null;
}

function convertDisplayAreaToBaseValue(params: {
  baseUnit: string;
  displayUnit: string;
  value: number;
}): number | null {
  if (params.baseUnit === "mm") {
    if (params.displayUnit === "mm") {
      return params.value;
    }

    if (params.displayUnit === "cm") {
      return params.value * 100;
    }

    if (params.displayUnit === "m") {
      return params.value * 1_000_000;
    }
  }

  if (params.baseUnit === "in") {
    if (params.displayUnit === "in") {
      return params.value;
    }

    if (params.displayUnit === "ft") {
      return params.value * 144;
    }
  }

  return null;
}

function convertDisplayLengthToBaseValue(params: {
  baseUnit: string;
  displayUnit: string;
  value: number;
}): number | null {
  if (params.baseUnit === "mm") {
    if (params.displayUnit === "mm") {
      return params.value;
    }

    if (params.displayUnit === "cm") {
      return params.value * 10;
    }

    if (params.displayUnit === "m") {
      return params.value * 1000;
    }
  }

  if (params.baseUnit === "in") {
    if (params.displayUnit === "in") {
      return params.value;
    }

    if (params.displayUnit === "ft") {
      return params.value * 12;
    }
  }

  return null;
}

function hexToRgba(hexColor: string, alpha: number): string {
  const normalized = hexColor.trim();
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) {
    return hexColor;
  }

  const hex = match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return `rgba(${red},${green},${blue},${alpha})`;
}

function getPolygonPerimeter(points: Point2D[]): number {
  if (points.length < 2) {
    return 0;
  }

  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const currentPoint = points[index];
    const nextPoint = points[(index + 1) % points.length];
    if (!currentPoint || !nextPoint) {
      continue;
    }

    perimeter += Math.hypot(nextPoint.x - currentPoint.x, nextPoint.y - currentPoint.y);
  }

  return perimeter;
}

function getMeasuredPerimeterBaseFromDocumentPoints(
  points: Point2D[],
  calibrationScale: ReturnType<typeof getCalibrationScale> | null,
  activeCalibration: TakeoffCalibration | null
): number | null {
  if (!calibrationScale || !activeCalibration) {
    return null;
  }

  const displayValue = convertDocumentDistanceToRealWorld(getPolygonPerimeter(points), calibrationScale);
  if (displayValue === null) {
    return null;
  }

  return convertDisplayLengthToBaseValue({
    baseUnit: activeCalibration.base_unit,
    displayUnit: activeCalibration.display_unit,
    value: displayValue,
  });
}

function getTakeoffSummaryDescription(measurement: DisplayMeasurement) {
  const trimmedName = measurement.name.trim();
  if (trimmedName) {
    return trimmedName;
  }

  if (measurement.measurementKind === "area") {
    return "Area";
  }

  if (measurement.measurementKind === "count") {
    return "Count";
  }

  return measurement.isPolyline ? "Polyline" : "Distance";
}

function formatZoomLabel(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

function getCountLabelPosition(points: Point2D[]): Point2D | null {
  if (points.length === 0) {
    return null;
  }

  const totals = points.reduce(
    (current, point) => ({
      x: current.x + point.x,
      y: current.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: totals.x / points.length,
    y: totals.y / points.length,
  };
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

function getMeasurementFallbackLabel(measurementKind: "line" | "area" | "count", isPolyline: boolean) {
  if (measurementKind === "area") {
    return "Area";
  }

  if (measurementKind === "count") {
    return "Count";
  }

  return isPolyline ? "Polyline" : "Distance";
}

function buildExportLegendRows(params: {
  measurements: DisplayMeasurement[];
}): ExportTakeoffLegendRow[] {
  return params.measurements
    .map((measurement) => ({
      id: measurement.id,
      colorHex: measurement.color,
      name: measurement.name.trim() || "Measurement",
      totalQuantity:
        measurement.measurementKind === "count"
          ? Number(measurement.countValue ?? measurement.displayValue ?? 0)
          : Number(measurement.displayValue ?? 0),
      unit: measurement.measurementKind === "count" ? measurement.displayUnit ?? "count" : measurement.displayUnit,
    }));
}

function getMeasurementMetadataObject(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...metadata };
}

function getAreaShapeRolesFromMeasurement(measurement: Pick<TakeoffMeasurement, "metadata">): Record<string, AreaShapeRole> {
  const metadataObject = getMeasurementMetadataObject(measurement.metadata);
  const rawRoles = metadataObject.areaShapeRoles;
  if (!rawRoles || typeof rawRoles !== "object" || Array.isArray(rawRoles)) {
    return {};
  }

  return Object.entries(rawRoles).reduce<Record<string, AreaShapeRole>>((accumulator, [shapeId, role]) => {
    accumulator[shapeId] = role === "deduction" ? "deduction" : "include";
    return accumulator;
  }, {});
}

function buildCleanAreaShapeRoles(params: {
  measurement: Pick<TakeoffMeasurement, "metadata">;
  areaShapes: Array<Pick<TakeoffAreaShape, "id">>;
  overrides?: Record<string, AreaShapeRole>;
}): Record<string, AreaShapeRole> {
  const existingRoles = getAreaShapeRolesFromMeasurement(params.measurement);
  return params.areaShapes.reduce<Record<string, AreaShapeRole>>((accumulator, shape) => {
    accumulator[shape.id] = params.overrides?.[shape.id] ?? existingRoles[shape.id] ?? "include";
    return accumulator;
  }, {});
}

function buildAreaMeasurementMetadata(params: {
  measurement: Pick<TakeoffMeasurement, "metadata">;
  areaShapes: Array<Pick<TakeoffAreaShape, "id">>;
  overrides?: Record<string, AreaShapeRole>;
}): Record<string, unknown> {
  return {
    ...getMeasurementMetadataObject(params.measurement.metadata),
    areaShapeRoles: buildCleanAreaShapeRoles(params),
  };
}

function computeSignedAreaTotals(params: {
  measurement: Pick<TakeoffMeasurement, "metadata">;
  areaShapes: Array<Pick<TakeoffAreaShape, "id" | "measured_area_base" | "measured_perimeter_base">>;
}) {
  const roles = getAreaShapeRolesFromMeasurement(params.measurement);
  return params.areaShapes.reduce(
    (accumulator, shape) => {
      const role = roles[shape.id] ?? "include";
      const measuredAreaValue = Number(shape.measured_area_base ?? 0);
      const measuredPerimeterBase = Number(shape.measured_perimeter_base ?? 0);
      accumulator.measuredAreaValue += role === "deduction" ? -measuredAreaValue : measuredAreaValue;
      accumulator.measuredPerimeterBase += measuredPerimeterBase;
      return accumulator;
    },
    {
      measuredAreaValue: 0,
      measuredPerimeterBase: 0,
    }
  );
}

function hasIncludedAreaShape(params: {
  measurement: Pick<TakeoffMeasurement, "metadata">;
  areaShapes: Array<Pick<TakeoffAreaShape, "id">>;
}) {
  const roles = getAreaShapeRolesFromMeasurement(params.measurement);
  return params.areaShapes.some((shape) => (roles[shape.id] ?? "include") === "include");
}

function normalizeAreaMeasurementRoles(measurement: TakeoffMeasurement): TakeoffMeasurement {
  if (measurement.measurement_kind !== "area") {
    return measurement;
  }

  return {
    ...measurement,
    metadata: buildAreaMeasurementMetadata({
      measurement,
      areaShapes: measurement.area_shapes,
    }),
  };
}

function buildClosedPolygonSvgPath(points: Point2D[]): string {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint, ...remainingPoints] = points;
  if (!firstPoint) {
    return "";
  }

  const segments = [`M ${firstPoint.x} ${firstPoint.y}`];
  remainingPoints.forEach((point) => {
    segments.push(`L ${point.x} ${point.y}`);
  });
  segments.push("Z");

  return segments.join(" ");
}

function buildAreaCutoutSvgPath(
  areaShapes: Array<{
    documentPoints: Point2D[];
  }>
) {
  return areaShapes
    .map((shape) => buildClosedPolygonSvgPath(shape.documentPoints))
    .filter((path) => path.length > 0)
    .join(" ");
}

function getViewerAreaShapeFillColor(params: {
  measurementColor: string;
  isAppendTarget: boolean;
  isSelectedMeasurement: boolean;
}) {
  if (params.isAppendTarget) {
    return hexToRgba(params.measurementColor, 0.12);
  }

  if (params.isSelectedMeasurement) {
    return hexToRgba(params.measurementColor, 0.18);
  }

  return hexToRgba(params.measurementColor, 0.12);
}

function cloneMeasurement(measurement: TakeoffMeasurement): TakeoffMeasurement {
  return {
    ...measurement,
    points: measurement.points.map((point) => ({ ...point })),
    area_shapes: measurement.area_shapes.map((shape) => ({
      ...shape,
      points: shape.points.map((point) => ({ ...point })),
    })),
    line_paths: measurement.line_paths.map((path) => ({
      ...path,
      points: path.points.map((point) => ({ ...point })),
    })),
  };
}

function isMeasurementIncludedInPdfExport(
  measurement: Pick<TakeoffMeasurement, "id" | "status" | "measurement_kind">,
  hiddenMeasurementIds: Set<string>
) {
  return (
    measurement.status !== "deleted" &&
    (measurement.measurement_kind === "line" ||
      measurement.measurement_kind === "area" ||
      measurement.measurement_kind === "count") &&
    !hiddenMeasurementIds.has(measurement.id)
  );
}

function getMeasurementGeometryOverrideKey(measurementId: string, child?: { kind: MeasurementChildKind; childId: string }) {
  if (!child) {
    return measurementId;
  }

  return `${measurementId}:${child.kind}:${child.childId}`;
}

function getAreaShapePointCount(measurement: Pick<TakeoffMeasurement, "area_shapes">) {
  return measurement.area_shapes.reduce((total, shape) => total + shape.points.length, 0);
}

function getLinePathPointCount(measurement: Pick<TakeoffMeasurement, "line_paths">) {
  return measurement.line_paths.reduce((total, path) => total + path.points.length, 0);
}

function mergeMeasurementPreservingRicherGeometry(
  localMeasurement: TakeoffMeasurement,
  incomingMeasurement: TakeoffMeasurement
): TakeoffMeasurement {
  if (localMeasurement.status === "deleted" && incomingMeasurement.status !== "deleted") {
    return cloneMeasurement(localMeasurement);
  }

  if (
    localMeasurement.measurement_kind !== incomingMeasurement.measurement_kind ||
    incomingMeasurement.status === "deleted"
  ) {
    return cloneMeasurement(incomingMeasurement);
  }

  const nextMeasurement = cloneMeasurement(incomingMeasurement);

  if (incomingMeasurement.measurement_kind === "area") {
    const incomingAreaRoleOverrides = getAreaShapeRolesFromMeasurement(incomingMeasurement);
    const localShapeCount = localMeasurement.area_shapes.length;
    const incomingShapeCount = incomingMeasurement.area_shapes.length;
    const shouldPreserveLocalShapes =
      localShapeCount > incomingShapeCount ||
      (localShapeCount > 0 &&
        incomingShapeCount > 0 &&
        getAreaShapePointCount(localMeasurement) > getAreaShapePointCount(incomingMeasurement)) ||
      (localShapeCount > 0 && incomingShapeCount === 0);

    if (shouldPreserveLocalShapes) {
      return normalizeAreaMeasurementRoles(cloneMeasurement(localMeasurement));
    }

    return {
      ...nextMeasurement,
      metadata: buildAreaMeasurementMetadata({
        measurement: localMeasurement,
        areaShapes: nextMeasurement.area_shapes,
        overrides: incomingAreaRoleOverrides,
      }),
    };
  }

  if (incomingMeasurement.measurement_kind === "line") {
    const localPathCount = localMeasurement.line_paths.length;
    const incomingPathCount = incomingMeasurement.line_paths.length;
    const shouldPreserveLocalPaths =
      localPathCount > incomingPathCount ||
      (localPathCount > 0 &&
        incomingPathCount > 0 &&
        getLinePathPointCount(localMeasurement) > getLinePathPointCount(incomingMeasurement)) ||
      (localPathCount > 0 && incomingPathCount === 0);

    if (shouldPreserveLocalPaths) {
      return cloneMeasurement(localMeasurement);
    }
  }

  if (incomingMeasurement.measurement_kind === "count" && localMeasurement.points.length > incomingMeasurement.points.length) {
    return cloneMeasurement(localMeasurement);
  }

  return nextMeasurement;
}

function mergeMeasurementsPreservingRicherGeometry(
  currentLocalMeasurements: TakeoffMeasurement[],
  incomingMeasurements: TakeoffMeasurement[]
) {
  const localMeasurementsById = new Map(
    currentLocalMeasurements.map((measurement) => [measurement.id, measurement] as const)
  );

  return incomingMeasurements.map((incomingMeasurement) => {
    const localMeasurement = localMeasurementsById.get(incomingMeasurement.id);
    if (!localMeasurement) {
      return cloneMeasurement(incomingMeasurement);
    }

    return mergeMeasurementPreservingRicherGeometry(localMeasurement, incomingMeasurement);
  });
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

function getCountItemValue(measurement: Pick<TakeoffMeasurement, "metadata" | "count_value" | "display_value" | "points">) {
  const rawValue =
    measurement.metadata && typeof measurement.metadata === "object"
      ? (measurement.metadata as Record<string, unknown>).countItemValue
      : null;
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 0) {
    return rawValue;
  }

  const totalValue = Number(measurement.count_value ?? measurement.display_value ?? 1);
  if (!Number.isFinite(totalValue) || totalValue <= 0) {
    return 1;
  }

  const pointCount = Math.max(measurement.points.length, 1);
  const derivedValue = totalValue / pointCount;
  return Number.isFinite(derivedValue) && derivedValue > 0 ? derivedValue : 1;
}

function applyPendingCountAppendItems(
  measurement: TakeoffMeasurement,
  pendingItems: PendingCountAppendItem[]
): TakeoffMeasurement {
  if (pendingItems.length === 0) {
    return measurement;
  }

  const nextMeasurement = cloneMeasurement(measurement);
  const countItemValue = getCountItemValue(nextMeasurement);
  pendingItems.forEach((item) => {
    const currentTotal = nextMeasurement.count_value ?? nextMeasurement.display_value ?? 0;
    const nextPointOrder = nextMeasurement.points.length;
    nextMeasurement.display_value = currentTotal + countItemValue;
    nextMeasurement.display_unit = "count";
    nextMeasurement.count_value = currentTotal + countItemValue;
    nextMeasurement.metadata = {
      ...(nextMeasurement.metadata && typeof nextMeasurement.metadata === "object" ? nextMeasurement.metadata : {}),
      countItemValue,
    };
    nextMeasurement.points.push({
      id: `${nextMeasurement.id}:${nextPointOrder}`,
      point_order: nextPointOrder,
      x: item.point.x,
      y: item.point.y,
    });
  });

  return nextMeasurement;
}

function applyPendingPolylineAppendPaths(
  measurement: TakeoffMeasurement,
  pendingPaths: PendingPolylineAppendPath[],
  calibrationScale: ReturnType<typeof getCalibrationScale> | null
): TakeoffMeasurement {
  if (pendingPaths.length === 0) {
    return measurement;
  }

  const nextMeasurement = cloneMeasurement(measurement);
  pendingPaths.forEach((pendingPath) => {
    const nextPathOrder = nextMeasurement.line_paths.length;
    nextMeasurement.display_value = (nextMeasurement.display_value ?? 0) + pendingPath.measuredLength;
    nextMeasurement.display_unit = calibrationScale?.displayUnit ?? nextMeasurement.display_unit;
    nextMeasurement.line_paths.push({
      id: `${nextMeasurement.id}:path:${nextPathOrder}`,
      measurement_id: nextMeasurement.id,
      path_order: nextPathOrder,
      measured_length_base: 0,
      page_bbox_min_x: null,
      page_bbox_min_y: null,
      page_bbox_max_x: null,
      page_bbox_max_y: null,
      points: pendingPath.points.map((point, index) => ({
        id: `${nextMeasurement.id}:path:${nextPathOrder}:${index}`,
        line_path_id: `${nextMeasurement.id}:path:${nextPathOrder}`,
        point_order: index,
        x: point.x,
        y: point.y,
      })),
    });
  });

  return nextMeasurement;
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
  isCollapsed,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
  isCollapsed: boolean;
}) {
  return (
    <aside
      id="takeoff-measure-sidebar"
      className={`flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-150 ${
        isCollapsed ? "w-0 border-0 rounded-none shadow-none" : "w-[340px]"
      }`}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
      {footer}
    </aside>
  );
}

function MeasureSidebarFooter({
  backHref,
  onCancel,
}: {
  backHref: string;
  onCancel: () => void;
}) {
  return (
    <div className="mt-auto border-t border-[#E2E8F1] bg-[#FBFEFE] px-4 py-4">
      <Link
        href={backHref}
        onClick={onCancel}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Quantities</span>
      </Link>
    </div>
  );
}

function MeasureCanvasViewport({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden rounded-[18px] border border-[#E2E8F1] bg-[#EEF3F8] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
      {children}
    </div>
  );
}

function MeasureSidebarHeader({
  pageLabel,
  pageNumber,
  calibrationState,
}: {
  pageLabel: string;
  pageNumber: number;
  calibrationState: {
    label: string;
    toneClassName: string;
    helperText: string;
  };
}) {
  return (
    <section className="rounded-[14px] border border-[#E2E8F1] bg-[#FBFEFE] px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8A94A6]">Measurement summary</p>
          <p className="mt-1 truncate text-[16px] font-semibold tracking-[-0.02em] text-[#0F172A]">{pageLabel}</p>
          <p className="mt-1 text-[12px] text-[#64748B]">Page {pageNumber}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${calibrationState.toneClassName}`}>
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
          {calibrationState.label}
        </span>
      </div>
      <p className="mt-3 text-[12px] leading-[1.6] text-[#64748B]">{calibrationState.helperText}</p>
    </section>
  );
}

function MeasureMeasurementSummaryCard({
  totalMeasurements,
  totalCountValue,
  hasCounts,
}: {
  totalMeasurements: number;
  totalCountValue: number;
  hasCounts: boolean;
}) {
  return (
    <section className="rounded-[14px] border border-[#E2E8F1] bg-[#F8FAFC] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8A94A6]">Completed measurements</p>
          <p className="mt-1 text-[13px] text-[#475569]">A quick summary of saved takeoff items on this page.</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#E2E8F1] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
          {totalMeasurements} total
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-[12px] border border-[#E2E8F1] bg-white px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A94A6]">Measurements</p>
          <p className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-[#0F172A]">{totalMeasurements}</p>
        </div>
        <div className="rounded-[12px] border border-[#E2E8F1] bg-white px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A94A6]">Count total</p>
          <p className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-[#0F172A]">{hasCounts ? totalCountValue : "—"}</p>
        </div>
      </div>
    </section>
  );
}

function MeasureMeasurementRow({
  measurement,
  isSelected,
  isHovered,
  onClick,
}: {
  measurement: DisplayMeasurement;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
}) {
  const typeLabel =
    measurement.measurementKind === "count"
      ? "Count"
      : measurement.measurementKind === "area"
        ? "Area"
        : measurement.isPolyline
          ? "Polyline"
          : "Distance";
  const TypeIcon = measurement.measurementKind === "count" ? Hash : measurement.measurementKind === "area" ? CircleDot : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-[10px] border px-3 py-3 text-left transition-colors ${
        isSelected
          ? "border-[#F4B59E] bg-[#FFF4EE] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          : isHovered
            ? "border-[#FBD0BA] bg-[#FFF8F4]"
            : "border-[#E2E8F1] bg-white hover:bg-[#F8FAFC]"
      }`}
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#E2E8F1] bg-[#F8FAFC]" style={{ color: measurement.color }}>
        <TypeIcon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-[#0F172A]">{measurement.name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
              <span className="inline-flex items-center rounded-full border border-[#E2E8F1] bg-[#F8FAFC] px-2 py-0.5 font-medium text-[#475569]">
                {typeLabel}
              </span>
              {measurement.tag ? <span>{measurement.tag}</span> : null}
              {isSelected ? (
                <span className="inline-flex items-center rounded-full border border-[#F4B59E] bg-[#FFF1E8] px-2 py-0.5 font-medium text-[#C2410C]">
                  Selected
                </span>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 text-right text-[12px] font-semibold text-[#1E293B]">{measurement.label}</span>
        </span>
      </span>
    </button>
  );
}

function MeasureMeasurementGroupCard({
  title,
  itemCount,
  totals,
  children,
}: {
  title: string;
  itemCount: number;
  totals: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[#E2E8F1] bg-[#F8FAFC] p-3">
      <div className="rounded-[12px] border border-[#E2E8F1] bg-[#FBFEFE] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-[#0F172A]">{title}</p>
          <span className="inline-flex items-center rounded-full border border-[#E2E8F1] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>
        {totals.length > 0 ? <p className="mt-1 text-[12px] text-[#64748B]">{totals.join(" • ")}</p> : null}
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function MeasureSidebarInspector({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[#E2E8F1] bg-[#F8FAFC] p-3">
      <div className="rounded-[12px] border border-[#E2E8F1] bg-[#FBFEFE] px-3 py-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8A94A6]">Inspector</p>
        <p className="mt-1 text-[13px] text-[#475569]">Tools, edits, and live measurement controls.</p>
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
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
  title,
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
  exitHref,
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
  onMeasurementCommitted,
  onCalibrationCommitted,
  pageIndex,
  totalPages,
  previousPageId,
  nextPageId,
  isPageLoading,
  pageLoadError,
  onPageChange,
}: TakeoffPdfViewerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
  const loadingTaskRef = useRef<PdfJsLoadingTask | null>(null);
  const documentRef = useRef<PdfJsDocumentProxy | null>(null);
  const pageProxyCacheRef = useRef(new Map<number, PdfJsPageProxy>());
  const inFlightPageProxyRequestsRef = useRef(new Map<number, Promise<PdfJsPageProxy>>());
  const loadedPdfSourceRef = useRef<string | null>(getPdfSourceKey(pdfUrl));
  const loadedDrawingSetIdRef = useRef<string | null>(drawingSetId);
  const settleTimeoutRef = useRef<number | null>(null);
  const transientZoomRef = useRef(1);
  const pendingCommittedZoomRef = useRef<number | null>(null);
  const isZoomGestureActiveRef = useRef(false);
  const finishMeasurementDraftRef = useRef<((tool: Exclude<DraftTool, "calibrate" | null>, points: Point2D[]) => void) | null>(null);
  const appendSaveTargetMeasurementIdRef = useRef<string | null>(null);
  const latestRenderRequestRef = useRef(0);
  const renderedBitmapRef = useRef<{
    pageId: string;
    rotationDegrees: number;
    canvasWidth: number;
    canvasHeight: number;
    zoom: number;
    devicePixelRatio: number;
  } | null>(null);
  const defaultPanRef = useRef<Point2D>({ x: 0, y: 0 });
  const pendingViewportInitializationRef = useRef(true);
  const interactionRef = useRef<InteractionState>({ kind: "idle" });
  const activeSnapCandidateRef = useRef<SnapCandidate | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsCardRef = useRef<HTMLDivElement | null>(null);

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
  const [isPageBitmapReady, setIsPageBitmapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [activeSetupTool, setActiveSetupTool] = useState<ConfigurableTool | null>(null);
  const [isToolDialogOpen, setIsToolDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionState>(null);
  const [selectedChild, setSelectedChild] = useState<MeasurementChildSelection | null>(null);
  const [summaryContextMenu, setSummaryContextMenu] = useState<SummaryContextMenuState | null>(null);
  const [summaryMeasurementEdit, setSummaryMeasurementEdit] = useState<SummaryMeasurementEditState | null>(null);
  const [isSummaryMeasurementEditSaving, setIsSummaryMeasurementEditSaving] = useState(false);
  const [measurementsShowingPerimeter, setMeasurementsShowingPerimeter] = useState<Set<string>>(() => new Set());
  // Legacy name, but this now drives both PDF export visibility and live canvas visibility.
  const [hiddenFromExportLegendMeasurementIds, setHiddenFromExportLegendMeasurementIds] = useState<Set<string>>(() => new Set());
  const [appendMeasurementId, setAppendMeasurementId] = useState<string | null>(null);
  const [appendAreaMode, setAppendAreaMode] = useState<AreaShapeRole>("include");
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
  const draftGeometryRef = useRef<DraftGeometryState>({
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
  const [toolSetup, setToolSetup] = useState<MeasureToolSetupState>(INITIAL_TOOL_SETUP);
  const [filterType, setFilterType] = useState<"all" | "distance" | "area" | "count">("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"tag" | "type">("tag");
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedbackState>({
    kind: "idle",
    message: "",
    retry: null,
  });
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryCommand[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryCommand[]>([]);
  const localMeasurementsRef = useRef(localMeasurements);
  const localActiveCalibrationRef = useRef(localActiveCalibration);
  const measurementsWithAreaShapesRef = useRef<Set<string>>(new Set());
  const measurementsWithLinePathsRef = useRef<Set<string>>(new Set());
  const polylineAppendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingPolylineAppendPathsRef = useRef<Record<string, PendingPolylineAppendPath[]>>({});
  const countAppendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingCountAppendItemsRef = useRef<Record<string, PendingCountAppendItem[]>>({});
  const measurementRenderKeysRef = useRef<Record<string, string>>({});
  const saveFeedbackTimeoutRef = useRef<number | null>(null);
  const previousNavigationContextRef = useRef<{ drawingSetId: string; pageId: string } | null>(null);
  const getMeasurementRenderKey = useCallback((measurementId: string) => {
    const existingKey = measurementRenderKeysRef.current[measurementId];
    if (existingKey) {
      return existingKey;
    }

    const nextKey = crypto.randomUUID();
    measurementRenderKeysRef.current[measurementId] = nextKey;
    return nextKey;
  }, []);

  useEffect(() => {
    setLocalMeasurements((currentMeasurements) =>
      mergeMeasurementsPreservingRicherGeometry(currentMeasurements, measurements)
    );
  }, [measurements]);

  useEffect(() => {
    setLocalActiveCalibration(activeCalibration ?? null);
  }, [activeCalibration, pageId]);

  useEffect(() => {
    if (!summaryContextMenu) {
      return;
    }

    const handleClose = () => {
      setSummaryContextMenu(null);
    };

    window.addEventListener("pointerdown", handleClose);
    window.addEventListener("scroll", handleClose, true);

    return () => {
      window.removeEventListener("pointerdown", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [summaryContextMenu]);

  useEffect(() => {
    if (!summaryMeasurementEdit) {
      setIsSummaryMeasurementEditSaving(false);
      return;
    }

    const handleClose = () => {
      if (isSummaryMeasurementEditSaving) {
        return;
      }
      setSummaryMeasurementEdit(null);
    };

    window.addEventListener("pointerdown", handleClose);
    window.addEventListener("scroll", handleClose, true);

    return () => {
      window.removeEventListener("pointerdown", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [isSummaryMeasurementEditSaving, summaryMeasurementEdit]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handleClose = (event: PointerEvent) => {
      const target = event.target;

      if (
        (settingsButtonRef.current && target instanceof Node && settingsButtonRef.current.contains(target)) ||
        (settingsCardRef.current && target instanceof Node && settingsCardRef.current.contains(target))
      ) {
        return;
      }

      setIsSettingsOpen(false);
    };

    window.addEventListener("pointerdown", handleClose);

    return () => {
      window.removeEventListener("pointerdown", handleClose);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    localMeasurementsRef.current = localMeasurements;
  }, [localMeasurements]);

  useEffect(() => {
    setHiddenFromExportLegendMeasurementIds((current) => {
      const activeMeasurementIds = new Set(
        localMeasurements
          .filter((measurement) => measurement.status !== "deleted")
          .map((measurement) => measurement.id)
      );
      const next = new Set<string>();

      current.forEach((measurementId) => {
        if (activeMeasurementIds.has(measurementId)) {
          next.add(measurementId);
        }
      });

      return next.size === current.size ? current : next;
    });
  }, [localMeasurements]);

  useEffect(() => {
    draftGeometryRef.current = draftGeometry;
  }, [draftGeometry]);

  useEffect(() => {
    measurementsWithAreaShapesRef.current = new Set();
    measurementsWithLinePathsRef.current = new Set();
  }, [pageId]);

  useEffect(() => {
    localMeasurements.forEach((measurement) => {
      if (measurement.measurement_kind === "area" && measurement.area_shapes.length > 0) {
        measurementsWithAreaShapesRef.current.add(measurement.id);
      }
      if (measurement.measurement_kind === "line" && measurement.line_paths.length > 0) {
        measurementsWithLinePathsRef.current.add(measurement.id);
      }
    });
  }, [localMeasurements]);

  useEffect(() => {
    localActiveCalibrationRef.current = localActiveCalibration;
  }, [localActiveCalibration]);

  useEffect(() => {
    setToolSetup((current) => ({
      ...current,
      calibrate: localActiveCalibration
        ? {
            name: localActiveCalibration.name || DEFAULT_CALIBRATION_NAME,
            referenceLengthInput: String(localActiveCalibration.reference_length_input),
            displayUnit: localActiveCalibration.display_unit,
            unitSystem: inferUnitSystem(localActiveCalibration.display_unit),
          }
        : {
            ...INITIAL_TOOL_SETUP.calibrate,
          },
    }));
  }, [localActiveCalibration, pageId]);

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
  const hasValidViewportSize = viewportSize.width > 0 && viewportSize.height > 0;

  useEffect(() => {
    if (!hasValidViewportSize) {
      return;
    }

    defaultPanRef.current = {
      x: transform.metrics.defaultPanX,
      y: transform.metrics.defaultPanY,
    };
  }, [hasValidViewportSize, transform.metrics.defaultPanX, transform.metrics.defaultPanY]);

  useEffect(() => {
    if (!hasValidViewportSize) {
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
    hasValidViewportSize,
    transform.pan.x,
    transform.pan.y,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (!hasValidViewportSize || !pendingViewportInitializationRef.current) {
      return;
    }

    pendingViewportInitializationRef.current = false;
    setPan((currentPan) => (pointsAreEqual(currentPan, defaultPanRef.current) ? currentPan : defaultPanRef.current));
  }, [hasValidViewportSize]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!localActiveCalibration) {
        setDraftGeometry((currentDraft) =>
          currentDraft.tool === "calibrate"
            ? { tool: "calibrate", points: [], hasChanges: false }
            : currentDraft
        );
        setCalibrationName("");
        setCalibrationLengthInput("");
        setCalibrationDisplayUnit("mm");
        setCalibrationUnitSystem("metric");
        setSelection((currentSelection) => (currentSelection?.type === "calibration" ? null : currentSelection));
        return;
      }

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
  }, [localActiveCalibration, pageId, transform]);

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
          const baseDocumentPoints =
            measurementPointOverrides[getMeasurementGeometryOverrideKey(measurement.id)] ??
            measurement.points.map((point) => transform.normalizedPointToDocumentPoint(point));
          const hasKnownAreaShapes = measurementsWithAreaShapesRef.current.has(measurement.id);
          const hasKnownLinePaths = measurementsWithLinePathsRef.current.has(measurement.id);
          const areaShapes =
            measurement.measurement_kind === "area"
              ? (measurement.area_shapes.length > 0 ? measurement.area_shapes : !hasKnownAreaShapes && measurement.points.length > 0
                  ? [{
                      id: `${measurement.id}:shape-0`,
                      measurement_id: measurement.id,
                      shape_order: 0,
                      measured_area_base: measurement.display_value ?? 0,
                      measured_perimeter_base: measurement.measured_perimeter_base ?? 0,
                      page_bbox_min_x: null,
                      page_bbox_min_y: null,
                      page_bbox_max_x: null,
                      page_bbox_max_y: null,
                      points: measurement.points.map((point) => ({
                        id: `${measurement.id}:${point.point_order}`,
                        area_shape_id: `${measurement.id}:shape-0`,
                        point_order: point.point_order,
                        x: point.x,
                        y: point.y,
                      })),
                    }]
                  : [])
                  .map((shape, index) => {
                    const overrideKey = getMeasurementGeometryOverrideKey(measurement.id, {
                      kind: "area-shape",
                      childId: shape.id,
                    });
                    const documentPoints =
                      measurementPointOverrides[overrideKey]
                        ? measurementPointOverrides[overrideKey]
                        : shape.points.map((point) => transform.normalizedPointToDocumentPoint(point));

                    const role = getAreaShapeRolesFromMeasurement(measurement)[shape.id] ?? "include";

                    return {
                      id: shape.id,
                      role,
                      documentPoints,
                      path: documentPointsToPath(documentPoints),
                      area: getPolygonArea(documentPoints),
                    };
                  })
              : [];
          const linePaths =
            measurement.measurement_kind === "line"
              ? (measurement.line_paths.length > 0 ? measurement.line_paths : !hasKnownLinePaths && measurement.points.length > 2
                  ? [{
                      id: `${measurement.id}:path-0`,
                      measurement_id: measurement.id,
                      path_order: 0,
                      measured_length_base: measurement.display_value ?? 0,
                      page_bbox_min_x: null,
                      page_bbox_min_y: null,
                      page_bbox_max_x: null,
                      page_bbox_max_y: null,
                      points: measurement.points.map((point) => ({
                        id: `${measurement.id}:${point.point_order}`,
                        line_path_id: `${measurement.id}:path-0`,
                        point_order: point.point_order,
                        x: point.x,
                        y: point.y,
                      })),
                    }]
                  : [])
                  .map((path, index) => {
                    const overrideKey = getMeasurementGeometryOverrideKey(measurement.id, {
                      kind: "line-path",
                      childId: path.id,
                    });
                    const documentPoints =
                      measurementPointOverrides[overrideKey]
                        ? measurementPointOverrides[overrideKey]
                        : path.points.map((point) => transform.normalizedPointToDocumentPoint(point));

                    return {
                      id: path.id,
                      documentPoints,
                      path: documentPointsToPath(documentPoints),
                      length: getPolylineLength(documentPoints),
                    };
                  })
              : [];
          const documentPoints =
            measurement.measurement_kind === "area"
              ? areaShapes[0]?.documentPoints ?? baseDocumentPoints
              : measurement.measurement_kind === "line"
                ? linePaths[0]?.documentPoints ?? baseDocumentPoints
              : baseDocumentPoints;
          const isPolyline = measurement.measurement_kind === "line" && (linePaths.length > 0 || documentPoints.length > 2);
          const firstPoint = documentPoints[0] ?? null;
          const labelShape =
            measurement.measurement_kind === "area"
              ? areaShapes
                  .filter((shape) => shape.role === "include")
                  .reduce<typeof areaShapes[number] | null>(
                  (largestShape, shape) => (!largestShape || shape.area > largestShape.area ? shape : largestShape),
                  null
                )
              : null;
          const labelPath =
            measurement.measurement_kind === "line" && linePaths.length > 0
              ? linePaths.reduce<typeof linePaths[number] | null>(
                  (longestPath, path) => (!longestPath || path.length > longestPath.length ? path : longestPath),
                  null
                )
              : null;
          const labelAnchor =
            measurement.measurement_kind === "count"
              ? getCountLabelPosition(documentPoints)
              : measurement.measurement_kind === "area"
              ? labelShape
                ? getPolygonLabelPosition(labelShape.documentPoints)
                : null
              : getPolylineLabelPosition(labelPath?.documentPoints ?? documentPoints, isPolyline ? 18 : 14);
          const fallbackLabel = getMeasurementFallbackLabel(measurement.measurement_kind, isPolyline);

          return {
            id: measurement.id,
            renderKey:
              measurement.measurement_kind === "count" ? getMeasurementRenderKey(measurement.id) : measurement.id,
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
            countPointIds: measurement.points.map((point) => point.id),
            path: documentPointsToPath(documentPoints),
            measuredPerimeterBase: measurement.measured_perimeter_base ?? null,
            areaShapes,
            linePaths,
            displayValue: measurement.display_value,
            displayUnit: measurement.display_unit,
            label: formatMeasurementValue(measurement.display_value, measurement.display_unit, fallbackLabel),
            labelAnchor,
            isPolyline,
            countValue: measurement.count_value,
            tag: getMeasurementTag(measurement),
            canEditGeometry:
              measurement.measurement_kind === "area"
                ? areaShapes.length > 0
                : measurement.measurement_kind === "line"
                  ? linePaths.length > 0 || !isPolyline
                : true,
          };
        }),
    [getMeasurementRenderKey, localMeasurements, measurementPointOverrides, transform]
  );
  const canvasVisibleMeasurements = useMemo(
    () =>
      savedMeasurements.filter(
        (measurement) => !hiddenFromExportLegendMeasurementIds.has(measurement.id)
      ),
    [hiddenFromExportLegendMeasurementIds, savedMeasurements]
  );
  useEffect(() => {
    if (hiddenFromExportLegendMeasurementIds.size === 0) {
      return;
    }

    const hiddenSelectionMeasurementId =
      selection?.type === "measurement" &&
      hiddenFromExportLegendMeasurementIds.has(selection.measurementId)
        ? selection.measurementId
        : null;
    const hiddenAppendMeasurementId =
      appendMeasurementId && hiddenFromExportLegendMeasurementIds.has(appendMeasurementId)
        ? appendMeasurementId
        : null;

    if (hiddenSelectionMeasurementId) {
      setSelection(null);
    }

    if (
      selectedChild &&
      hiddenFromExportLegendMeasurementIds.has(selectedChild.measurementId)
    ) {
      setSelectedChild(null);
    }

    if (hiddenAppendMeasurementId) {
      appendSaveTargetMeasurementIdRef.current = null;
      setAppendMeasurementId(null);
      setAppendAreaMode("include");
      setToolMode("select");
      setDraftGeometry({ tool: null, points: [], hasChanges: false });
    }

    if (hiddenSelectionMeasurementId || hiddenAppendMeasurementId) {
      setMeasurementPointOverrides((currentOverrides) => {
        const nextOverrides = Object.fromEntries(
          Object.entries(currentOverrides).filter(([overrideKey]) => {
            if (hiddenSelectionMeasurementId) {
              return (
                overrideKey !== hiddenSelectionMeasurementId &&
                !overrideKey.startsWith(`${hiddenSelectionMeasurementId}:`)
              );
            }

            if (hiddenAppendMeasurementId) {
              return (
                overrideKey !== hiddenAppendMeasurementId &&
                !overrideKey.startsWith(`${hiddenAppendMeasurementId}:`)
              );
            }

            return true;
          })
        );

        return Object.keys(nextOverrides).length === Object.keys(currentOverrides).length
          ? currentOverrides
          : nextOverrides;
      });
    }

    if (
      interactionRef.current.kind === "edit" &&
      hiddenFromExportLegendMeasurementIds.has(interactionRef.current.target.measurementId)
    ) {
      interactionRef.current = { kind: "idle" };
      setIsDragging(false);
    }

    setHoverState((currentHoverState) => {
      if (
        currentHoverState.hitTarget &&
        "measurementId" in currentHoverState.hitTarget &&
        hiddenFromExportLegendMeasurementIds.has(currentHoverState.hitTarget.measurementId)
      ) {
        return {
          ...currentHoverState,
          hitTarget: null,
          snapCandidate: null,
        };
      }

      return currentHoverState;
    });
  }, [
    appendMeasurementId,
    hiddenFromExportLegendMeasurementIds,
    selectedChild,
    selection,
  ]);
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

  useEffect(() => {
    if (!summaryMeasurementEdit) {
      return;
    }

    const measurement = localMeasurements.find((currentMeasurement) => currentMeasurement.id === summaryMeasurementEdit.measurementId);
    if (!measurement || measurement.status === "deleted") {
      setSummaryMeasurementEdit(null);
    }
  }, [localMeasurements, summaryMeasurementEdit]);

  useEffect(() => {
    if (selection?.type !== "measurement") {
      setSelectedChild(null);
      return;
    }

    setSelectedChild((currentChild) => {
      if (!currentChild || currentChild.measurementId === selection.measurementId) {
        return currentChild;
      }

      return null;
    });
  }, [selection]);

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
      color: toolSetup.distance.colorHex || DEFAULT_DISTANCE_COLOR,
      points: previewPoints,
      path: documentPointsToPath(previewPoints),
      labelAnchor: getPolylineLabelPosition(previewPoints, 16),
      label: formatMeasurementValue(realWorld, calibrationScale?.displayUnit ?? null, "Distance"),
    };
  }, [calibrationScale, draftGeometry.tool, hoverState.documentPoint, measurementDraftPoints, toolSetup.distance.colorHex]);

  const polylineDraftPreview = useMemo(() => {
    if (draftGeometry.tool !== "polyline" || measurementDraftPoints.length === 0) {
      return null;
    }

    const previewPoints = hoverState.documentPoint
      ? [...measurementDraftPoints, hoverState.documentPoint]
      : measurementDraftPoints;

    if (previewPoints.length < 2) {
      return {
        color: toolSetup.polyline.colorHex || DEFAULT_DISTANCE_COLOR,
        points: previewPoints,
        path: documentPointsToPath(previewPoints),
        labelAnchor: null,
        label: "Linear",
      };
    }

    const length = getPolylineLength(previewPoints);
    const realWorld = convertDocumentDistanceToRealWorld(length, calibrationScale);

    return {
      color: toolSetup.polyline.colorHex || DEFAULT_DISTANCE_COLOR,
      points: previewPoints,
      path: documentPointsToPath(previewPoints),
      labelAnchor: getPolylineLabelPosition(previewPoints, 18),
      label: formatMeasurementValue(realWorld, calibrationScale?.displayUnit ?? null, "Polyline"),
    };
  }, [calibrationScale, draftGeometry.tool, hoverState.documentPoint, measurementDraftPoints, toolSetup.polyline.colorHex]);

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
      role: appendAreaMode,
      color: toolSetup.area.colorHex || DEFAULT_AREA_COLOR,
      points: previewPoints,
      path: documentPointsToPath(previewPoints),
      labelAnchor: canMeasureArea ? getPolygonLabelPosition(previewPoints) : null,
      label: formatMeasurementValue(
        realWorldArea,
        calibrationScale ? `${calibrationScale.displayUnit}²` : null,
        appendAreaMode === "deduction" ? "Deduction" : "Area"
      ),
      canFinish: measurementDraftPoints.length >= 3,
    };
  }, [appendAreaMode, calibrationScale, draftGeometry.tool, hoverState.documentPoint, measurementDraftPoints, toolSetup.area.colorHex]);

  const countDraftPreview = useMemo(() => {
    if (toolMode !== "count" || !hoverState.documentPoint) {
      return null;
    }

    return {
      color: toolSetup.count.colorHex || DEFAULT_COUNT_COLOR,
      point: hoverState.documentPoint,
      labelAnchor: hoverState.documentPoint,
      label: "Count",
    };
  }, [hoverState.documentPoint, toolMode, toolSetup.count.colorHex]);

  const countMeasurements = useMemo(
    () => savedMeasurements.filter((measurement) => measurement.measurementKind === "count"),
    [savedMeasurements]
  );
  const pdfExportMeasurements = useMemo(
    () =>
      localMeasurements.filter((measurement) =>
        isMeasurementIncludedInPdfExport(measurement, hiddenFromExportLegendMeasurementIds)
      ),
    [hiddenFromExportLegendMeasurementIds, localMeasurements]
  );
  const exportMeasurements = useMemo<ExportTakeoffMeasurement[]>(
    () =>
      pdfExportMeasurements
        .map((measurement) => {
          const displayMeasurement = savedMeasurements.find(
            (savedMeasurement) => savedMeasurement.id === measurement.id
          );
          const isPolyline =
            measurement.measurement_kind === "line" &&
            (measurement.line_paths.length > 0 || measurement.points.length > 2);
          const fallbackLabel = getMeasurementFallbackLabel(
            measurement.measurement_kind,
            isPolyline
          );

          return {
            id: measurement.id,
            kind: measurement.measurement_kind,
            colorHex:
              measurement.color_hex?.trim() ||
              (measurement.measurement_kind === "area"
                ? DEFAULT_AREA_COLOR
                : measurement.measurement_kind === "count"
                  ? DEFAULT_COUNT_COLOR
                  : DEFAULT_DISTANCE_COLOR),
            name: measurement.name,
            description: measurement.description,
            label:
              displayMeasurement?.label ??
              formatMeasurementValue(
                measurement.display_value,
                measurement.display_unit,
                fallbackLabel
              ),
            points: measurement.points.map((point) => ({
              x: point.x,
              y: point.y,
            })),
            areaShapes: measurement.area_shapes.map((shape) => ({
              id: shape.id,
              role: getAreaShapeRolesFromMeasurement(measurement)[shape.id] ?? "include",
              points: shape.points.map((point) => ({
                x: point.x,
                y: point.y,
              })),
            })),
            linePaths: measurement.line_paths.map((path) => ({
              id: path.id,
              points: path.points.map((point) => ({
                x: point.x,
                y: point.y,
              })),
            })),
          };
        }),
    [pdfExportMeasurements, savedMeasurements]
  );
  const exportCalibration = useMemo<ExportTakeoffCalibration | null>(
    () =>
      localActiveCalibration
        ? {
            name: localActiveCalibration.name,
            displayUnit: localActiveCalibration.display_unit,
            referenceLengthInput: localActiveCalibration.reference_length_input,
            pointA: {
              x: localActiveCalibration.point_a_x,
              y: localActiveCalibration.point_a_y,
            },
            pointB: {
              x: localActiveCalibration.point_b_x,
              y: localActiveCalibration.point_b_y,
            },
          }
        : null,
    [localActiveCalibration]
  );
  const exportRotation = useMemo<ExportTakeoffRotation>(
    () =>
      rotationDegrees === 90 || rotationDegrees === 180 || rotationDegrees === 270
        ? rotationDegrees
        : 0,
    [rotationDegrees]
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
  const summaryMeasurementEditTarget = useMemo(
    () =>
      summaryMeasurementEdit
        ? localMeasurements.find((measurement) => measurement.id === summaryMeasurementEdit.measurementId) ?? null
        : null,
    [localMeasurements, summaryMeasurementEdit]
  );
  const selectedMeasurementChild = useMemo(
    () =>
      selectedChild && selection?.type === "measurement" && selection.measurementId === selectedChild.measurementId
        ? selectedChild
        : null,
    [selectedChild, selection]
  );
  const appendMeasurement = useMemo(
    () => (appendMeasurementId ? savedMeasurements.find((measurement) => measurement.id === appendMeasurementId) ?? null : null),
    [appendMeasurementId, savedMeasurements]
  );
  const activeAppendMeasurementId = useMemo(
    () =>
      appendMeasurementId &&
      appendMeasurement &&
      (toolMode === "area" || toolMode === "polyline" || toolMode === "count")
        ? appendMeasurementId
        : null,
    [appendMeasurement, appendMeasurementId, toolMode]
  );
  const getAreaPerimeterLabel = useCallback(
    (measurement: DisplayMeasurement) => {
      if (
        measurement.measurementKind !== "area" ||
        measurement.measuredPerimeterBase === null ||
        !localActiveCalibration
      ) {
        return null;
      }

      const displayValue = convertBaseLengthToDisplayValue({
        baseUnit: localActiveCalibration.base_unit,
        displayUnit: localActiveCalibration.display_unit,
        value: measurement.measuredPerimeterBase,
      });

      if (displayValue === null) {
        return null;
      }

      return formatMeasurementValue(displayValue, localActiveCalibration.display_unit, "Perimeter");
    },
    [localActiveCalibration]
  );
  const openSummaryContextMenu = useCallback(
    (measurement: DisplayMeasurement, x: number, y: number) => {
      setSummaryMeasurementEdit(null);
      setSummaryContextMenu({
        measurementId: measurement.id,
        measurementKind: measurement.measurementKind,
        measurementName: measurement.name,
        measurementDescription: measurement.description,
        measurementColor: measurement.color,
        isHiddenFromExportLegend: hiddenFromExportLegendMeasurementIds.has(measurement.id),
        canAddDeduction: measurement.measurementKind === "area",
        x,
        y,
      });
    },
    [hiddenFromExportLegendMeasurementIds]
  );
  const handleSummaryMeasurementContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, measurement: DisplayMeasurement) => {
      event.preventDefault();
      event.stopPropagation();
      openSummaryContextMenu(measurement, event.clientX, event.clientY);
    },
    [openSummaryContextMenu]
  );
  const handleCanvasContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== "select") {
      return;
    }

    const rawDocumentPoint = getDocumentPointFromClientCoordinates(event.clientX, event.clientY);
    if (!rawDocumentPoint) {
      return;
    }

    const hitTarget = getHitTarget(rawDocumentPoint);
    if (
      hitTarget?.type !== "measurement-point" &&
      hitTarget?.type !== "measurement-segment"
    ) {
      return;
    }

    const measurement = savedMeasurements.find((item) => item.id === hitTarget.measurementId);
    if (!measurement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelection({ type: "measurement", measurementId: measurement.id });
    setSelectedChild(
      hitTarget.childId && hitTarget.childKind
        ? {
            measurementId: measurement.id,
            childId: hitTarget.childId,
            kind: hitTarget.childKind,
          }
        : null
    );
    openSummaryContextMenu(measurement, event.clientX, event.clientY);
  }, [getDocumentPointFromClientCoordinates, getHitTarget, openSummaryContextMenu, savedMeasurements, toolMode]);
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
  const hasSummaryMeasurementEditChanges = useMemo(() => {
    if (!summaryMeasurementEdit || !summaryMeasurementEditTarget) {
      return false;
    }

    const currentColorHex =
      summaryMeasurementEditTarget.color_hex?.trim() ||
      (summaryMeasurementEditTarget.measurement_kind === "area"
        ? DEFAULT_AREA_COLOR
        : summaryMeasurementEditTarget.measurement_kind === "count"
          ? DEFAULT_COUNT_COLOR
          : DEFAULT_DISTANCE_COLOR);

    return (
      summaryMeasurementEdit.name.trim().length > 0 &&
      (summaryMeasurementEdit.name.trim() !== summaryMeasurementEditTarget.name ||
        summaryMeasurementEdit.description.trim() !== (summaryMeasurementEditTarget.description ?? "") ||
        summaryMeasurementEdit.colorHex.trim() !== currentColorHex)
    );
  }, [summaryMeasurementEdit, summaryMeasurementEditTarget]);

  const exportLegendRows = useMemo<ExportTakeoffLegendRow[]>(
    () =>
      buildExportLegendRows({
        measurements: savedMeasurements.filter((measurement) =>
          isMeasurementIncludedInPdfExport(
            {
              id: measurement.id,
              status: "active",
              measurement_kind: measurement.measurementKind,
            },
            hiddenFromExportLegendMeasurementIds
          )
        ),
      }),
    [hiddenFromExportLegendMeasurementIds, savedMeasurements]
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

  const isSaving = saveFeedback.kind === "saving";

  useEffect(() => {
    if (appendMeasurementId && activeAppendMeasurementId === null) {
      setAppendMeasurementId(null);
      setAppendAreaMode("include");
    }
  }, [activeAppendMeasurementId, appendMeasurementId]);

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
  const handleExportPdf = useCallback(async () => {
    if (!pdfUrl || isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);

    try {
      const pdfBytes = await exportTakeoffPageToPdf({
        pdfUrl,
        pageNumber,
        pageWidth: pageWidthPts,
        pageHeight: pageHeightPts,
        rotation: exportRotation,
        measurements: exportMeasurements,
        legendRows: exportLegendRows,
        calibration: exportCalibration,
        projectName: title,
        pageName: pageLabel,
      });
      const fileName = buildTakeoffPdfExportFileName({
        projectName: title,
        pageName: pageLabel,
      });
      downloadTakeoffPdf(pdfBytes, fileName);
    } catch (error) {
      console.error("Unable to export takeoff PDF.", error);
      window.alert(error instanceof Error ? error.message : "Unable to export PDF.");
    } finally {
      setIsExportingPdf(false);
    }
  }, [
    exportCalibration,
    exportLegendRows,
    exportMeasurements,
    exportRotation,
    isExportingPdf,
    pageHeightPts,
    pageLabel,
    pageNumber,
    pageWidthPts,
    pdfUrl,
    title,
  ]);

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
      showSavingMessage?: boolean;
      showSuccessMessage?: boolean;
      run: () => Promise<T>;
    }) => {
      if (saveFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(saveFeedbackTimeoutRef.current);
        saveFeedbackTimeoutRef.current = null;
      }

      setActionError(null);
      if (params.showSavingMessage !== false) {
        setSaveFeedback({
          kind: "saving",
          message: params.savingMessage,
          retry: null,
        });
      } else {
        setSaveFeedback({
          kind: "idle",
          message: "",
          retry: null,
        });
      }

      try {
        const result = await params.run();
        if (params.showSuccessMessage !== false) {
          markSaveSuccess(params.successMessage);
        } else {
          setSaveFeedback({
            kind: "idle",
            message: "",
            retry: null,
          });
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save takeoff changes.";
        markSaveError(message, params.retry ?? null, params.retryLabel ?? "Retry");
        return null;
      }
    },
    [markSaveError, markSaveSuccess]
  );

  const getOrLoadPdfPage = useCallback((targetPageNumber: number) => {
    const cachedPage = pageProxyCacheRef.current.get(targetPageNumber);
    if (cachedPage) {
      return Promise.resolve(cachedPage);
    }

    const inFlightRequest = inFlightPageProxyRequestsRef.current.get(targetPageNumber);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    const pdfDocument = documentRef.current;
    if (!pdfDocument) {
      return Promise.reject(new Error("PDF document is not ready."));
    }

    const request = pdfDocument
      .getPage(targetPageNumber)
      .then((resolvedPage) => {
        pageProxyCacheRef.current.set(targetPageNumber, resolvedPage);
        return resolvedPage;
      })
      .finally(() => {
        inFlightPageProxyRequestsRef.current.delete(targetPageNumber);
      });

    inFlightPageProxyRequestsRef.current.set(targetPageNumber, request);
    return request;
  }, []);

  const pushHistoryCommand = useCallback((command: HistoryCommand) => {
    setUndoStack((current) => [...current, command].slice(-HISTORY_LIMIT));
    setRedoStack([]);
  }, []);

  const upsertLocalMeasurement = useCallback((nextMeasurement: TakeoffMeasurement) => {
    getMeasurementRenderKey(nextMeasurement.id);
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
      const nextOverrides: Record<string, Point2D[]> = {};
      Object.entries(currentOverrides).forEach(([key, value]) => {
        if (key === nextMeasurement.id || key.startsWith(`${nextMeasurement.id}:`)) {
          return;
        }
        nextOverrides[key] = value;
      });
      return nextOverrides;
    });
  }, [getMeasurementRenderKey]);

  const removeLocalMeasurement = useCallback((measurementId: string) => {
    delete measurementRenderKeysRef.current[measurementId];
    setLocalMeasurements((currentMeasurements) =>
      currentMeasurements.filter((measurement) => measurement.id !== measurementId)
    );
    setMeasurementPointOverrides((currentOverrides) => {
      const nextOverrides: Record<string, Point2D[]> = {};
      let didChange = false;
      Object.entries(currentOverrides).forEach(([key, value]) => {
        if (key === measurementId || key.startsWith(`${measurementId}:`)) {
          didChange = true;
          return;
        }
        nextOverrides[key] = value;
      });
      return didChange ? nextOverrides : currentOverrides;
    });
  }, []);

  const replaceLocalMeasurementId = useCallback((previousId: string, nextMeasurement: TakeoffMeasurement) => {
    const preservedRenderKey = measurementRenderKeysRef.current[previousId] ?? getMeasurementRenderKey(previousId);
    measurementRenderKeysRef.current[nextMeasurement.id] = preservedRenderKey;
    delete measurementRenderKeysRef.current[previousId];
    setLocalMeasurements((currentMeasurements) => {
      const existingIndex = currentMeasurements.findIndex((measurement) => measurement.id === previousId);
      if (existingIndex < 0) {
        return [...currentMeasurements, nextMeasurement];
      }

      const nextMeasurements = [...currentMeasurements];
      nextMeasurements[existingIndex] = nextMeasurement;
      return nextMeasurements;
    });
    setMeasurementPointOverrides((currentOverrides) => {
      const nextOverrides: Record<string, Point2D[]> = {};
      Object.entries(currentOverrides).forEach(([key, value]) => {
        if (
          key === previousId ||
          key.startsWith(`${previousId}:`) ||
          key === nextMeasurement.id ||
          key.startsWith(`${nextMeasurement.id}:`)
        ) {
          return;
        }
        nextOverrides[key] = value;
      });
      return nextOverrides;
    });
  }, [getMeasurementRenderKey]);

  const replaceMeasurementStatusLocally = useCallback((nextMeasurement: TakeoffMeasurement) => {
    upsertLocalMeasurement(nextMeasurement);

    if (nextMeasurement.status === "deleted" && selection?.type === "measurement" && selection.measurementId === nextMeasurement.id) {
      setSelection(null);
      setSelectedChild(null);
    }
    if (nextMeasurement.status === "deleted" && appendMeasurementId === nextMeasurement.id) {
      appendSaveTargetMeasurementIdRef.current = null;
      setAppendMeasurementId(null);
      setAppendAreaMode("include");
    }
  }, [appendMeasurementId, selection, upsertLocalMeasurement]);

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
      setIsPageBitmapReady(false);
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
        pageProxyCacheRef.current.clear();
        inFlightPageProxyRequestsRef.current.clear();
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
      setIsPageBitmapReady(false);
      setPageProxy(null);

      try {
        const resolvedPage = await getOrLoadPdfPage(pageNumber);
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
  }, [getOrLoadPdfPage, loadState, pageNumber, rotationDegrees]);

  useEffect(() => {
    if (loadState !== "ready" || !documentRef.current) {
      return;
    }

    const pageNumbersToPrime = [
      previousPageId ? pageNumber - 1 : null,
      nextPageId ? pageNumber + 1 : null,
    ].filter((value): value is number => value !== null && value >= 1);

    pageNumbersToPrime.forEach((targetPageNumber) => {
      void getOrLoadPdfPage(targetPageNumber).catch(() => {
        // Ignore background priming failures. The active page load path handles errors visibly.
      });
    });
  }, [getOrLoadPdfPage, loadState, nextPageId, pageNumber, previousPageId]);

  useEffect(() => {
    const previousNavigationContext = previousNavigationContextRef.current;
    const isInitialRender = previousNavigationContext === null;
    const isSameDrawingSet = previousNavigationContext?.drawingSetId === drawingSetId;

    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
    }

    pendingCommittedZoomRef.current = null;
    isZoomGestureActiveRef.current = false;
    renderedBitmapRef.current = null;
    setIsPageBitmapReady(false);
    setPendingCommittedZoom(null);
    setTransientZoom(1);
    transientZoomRef.current = 1;
    setDraftGeometry({ tool: null, points: [], hasChanges: false });
    setHoverState({ rawDocumentPoint: null, documentPoint: null, hitTarget: null, snapCandidate: null });
    activeSnapCandidateRef.current = null;
    setMeasurementPointOverrides({});
    appendSaveTargetMeasurementIdRef.current = null;
    setAppendMeasurementId(null);
    setAppendAreaMode("include");
    setSelection(null);
    setActionError(null);
    clearSaveFeedback();
    setUndoStack([]);
    setRedoStack([]);

    if (isInitialRender || !isSameDrawingSet) {
      pendingViewportInitializationRef.current = true;
      setCommittedZoom(resetZoom);
      if (hasValidViewportSize) {
        setPan(defaultPanRef.current);
        pendingViewportInitializationRef.current = false;
      }
      setToolMode("select");
      setActiveSetupTool(null);
      setIsToolDialogOpen(false);
    }

    previousNavigationContextRef.current = { drawingSetId, pageId };
  }, [clearSaveFeedback, drawingSetId, hasValidViewportSize, pageId, resetZoom]);

  useEffect(() => {
    const page = pageProxy;
    const visibleCanvas = canvasRef.current;
    if (!page || !visibleCanvas || loadState !== "ready" || !hasValidViewportSize) {
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
        transientZoomRef.current = 1;
        flushSync(() => {
          setPendingCommittedZoom(null);
          setCommittedZoom(targetRenderZoom);
          setTransientZoom(1);
        });
      }
      setIsPageBitmapReady(true);
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
          setIsPageBitmapReady(true);

          if (shouldPromotePendingZoom) {
            pendingCommittedZoomRef.current = null;
            transientZoomRef.current = 1;
            flushSync(() => {
              setPendingCommittedZoom(null);
              setCommittedZoom(targetRenderZoom);
              setTransientZoom(1);
            });
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
    hasValidViewportSize,
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
    editingChildId?: string;
    editingChildKind?: MeasurementChildKind;
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
    const editingMeasurement =
      params.editingMeasurementId
        ? savedMeasurements.find((measurement) => measurement.id === params.editingMeasurementId) ?? null
        : null;
    const shouldDisableMeasurementVertexSnap =
      draftGeometry.tool === "polyline" ||
      draftGeometry.tool === "area" ||
      params.editingChildKind === "area-shape" ||
      params.editingChildKind === "line-path" ||
      (editingMeasurement?.measurementKind === "line" && editingMeasurement.isPolyline) ||
      editingMeasurement?.measurementKind === "area";

    const vertexTargets: Point2D[] = [];
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

      const bestDraftCandidate = getStableSnapCandidate({
        candidates: [
          draftClosureCandidate,
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

    if (!shouldDisableMeasurementVertexSnap) {
      canvasVisibleMeasurements.forEach((measurement) => {
        measurement.documentPoints.forEach((point, index) => {
          if (
            params.mode === "edit" &&
            params.editingMeasurementId === measurement.id &&
            params.editingPointIndex === index &&
            !params.editingChildId
          ) {
            return;
          }

          vertexTargets.push(point);
        });

        measurement.areaShapes.forEach((shape) => {
          shape.documentPoints.forEach((point, index) => {
            if (
              params.mode === "edit" &&
              params.editingMeasurementId === measurement.id &&
              params.editingChildId === shape.id &&
              params.editingChildKind === "area-shape" &&
              params.editingPointIndex === index
            ) {
              return;
            }

            vertexTargets.push(point);
          });
        });

        measurement.linePaths.forEach((path) => {
          path.documentPoints.forEach((point, index) => {
            if (
              params.mode === "edit" &&
              params.editingMeasurementId === measurement.id &&
              params.editingChildId === path.id &&
              params.editingChildKind === "line-path" &&
              params.editingPointIndex === index
            ) {
              return;
            }

            vertexTargets.push(point);
          });
        });
      });
    }

    const bestCandidate = getStableSnapCandidate({
      candidates: [
        getNearestVertexSnapCandidate({
          point: params.rawDocumentPoint,
          targets: vertexTargets,
          tolerance,
          priority: 20,
        }),
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
    const tolerance = transform.viewportDistanceToDocumentDistance(SELECTION_HIT_TOLERANCE_PX);
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

    canvasVisibleMeasurements.forEach((measurement) => {
      if (measurement.measurementKind === "area") {
        measurement.areaShapes.forEach((shape) => {
          const nearestPointHit = getNearestPointHit({
            point: documentPoint,
            targets: shape.documentPoints,
            tolerance,
          });
          if (nearestPointHit.hit && nearestPointHit.index >= 0) {
            candidates.push({
              target: {
                type: "measurement-point",
                measurementId: measurement.id,
                pointIndex: nearestPointHit.index,
                childId: shape.id,
                childKind: "area-shape",
              },
              distance: nearestPointHit.distance,
            });
          }

          const segmentHit = getPolygonHit({
            point: documentPoint,
            polygon: shape.documentPoints,
            tolerance,
          });
          if (segmentHit.hit) {
            candidates.push({
              target: { type: "measurement-segment", measurementId: measurement.id, childId: shape.id, childKind: "area-shape" },
              distance: segmentHit.distance,
            });
          }
        });
        return;
      }

      if (measurement.measurementKind === "count") {
        const nearestPointHit = getNearestPointHit({
          point: documentPoint,
          targets: measurement.documentPoints,
          tolerance,
        });
        if (nearestPointHit.hit && nearestPointHit.index >= 0) {
          candidates.push({
            target: {
              type: "measurement-point",
              measurementId: measurement.id,
              pointIndex: nearestPointHit.index,
              childId: measurement.countPointIds[nearestPointHit.index] ?? `${measurement.id}:count:${nearestPointHit.index}`,
              childKind: "count-item",
            },
            distance: nearestPointHit.distance,
          });
        }
        return;
      }

      if (measurement.linePaths.length === 0 && measurement.canEditGeometry) {
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
      }

      const segmentTargets =
        measurement.linePaths.length > 0
          ? measurement.linePaths.map((path) => ({
              childId: path.id,
              childKind: "line-path" as const,
              polyline: path.documentPoints,
            }))
          : [
              {
                childId: undefined,
                childKind: undefined,
                polyline: measurement.documentPoints,
              },
            ];
      segmentTargets.forEach(({ childId, childKind, polyline }) => {
        if (childId && childKind) {
          const nearestPointHit = getNearestPointHit({
            point: documentPoint,
            targets: polyline,
            tolerance,
          });
          if (nearestPointHit.hit && nearestPointHit.index >= 0) {
            candidates.push({
              target: {
                type: "measurement-point",
                measurementId: measurement.id,
                pointIndex: nearestPointHit.index,
                childId,
                childKind,
              },
              distance: nearestPointHit.distance,
            });
          }
        }

        const segmentHit = getPolylineHit({
          point: documentPoint,
          polyline,
          tolerance,
        });
        if (segmentHit.hit) {
          candidates.push({
            target: { type: "measurement-segment", measurementId: measurement.id, childId, childKind },
            distance: segmentHit.distance,
          });
        }
      });
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

  const openToolSetupDialog = useCallback((tool: ConfigurableTool) => {
    if (tool === "polyline") {
      setToolSetup((current) =>
        current.polyline.name === "Polyline"
          ? {
              ...current,
              polyline: {
                ...current.polyline,
                name: "Linear",
              },
            }
          : current
      );
    }
    setActiveSetupTool(tool);
    setIsToolDialogOpen(true);
  }, []);

  const beginToolMode = useCallback((nextTool: ToolMode) => {
    appendSaveTargetMeasurementIdRef.current = null;
    setAppendMeasurementId(null);
    setAppendAreaMode("include");
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

  const isMeasurementAppendSupported = useCallback((measurement: DisplayMeasurement) => {
    if (measurement.measurementKind === "area") {
      return true;
    }

    if (measurement.measurementKind === "count") {
      return true;
    }

    return measurement.measurementKind === "line" && measurement.isPolyline;
  }, []);

  const startAppendMeasurement = useCallback((measurementId: string, options?: { areaMode?: AreaShapeRole }) => {
    const measurement = savedMeasurements.find((item) => item.id === measurementId);
    if (!measurement || !isMeasurementAppendSupported(measurement)) {
      return;
    }

    const nextTool =
      measurement.measurementKind === "area"
        ? "area"
        : measurement.measurementKind === "count"
          ? "count"
          : "polyline";
    appendSaveTargetMeasurementIdRef.current = measurement.id;
    setAppendMeasurementId(measurement.id);
    setAppendAreaMode(measurement.measurementKind === "area" ? options?.areaMode ?? "include" : "include");
    setSelection({ type: "measurement", measurementId: measurement.id });
    setSelectedChild(null);
    setToolMode(nextTool);
    setMeasurementPointOverrides({});
    setDraftGeometry({
      tool: nextTool,
      points: [],
      hasChanges: false,
    });
    setActionError(null);
    clearSaveFeedback();
    setSummaryContextMenu(null);
  }, [clearSaveFeedback, isMeasurementAppendSupported, savedMeasurements]);
  const handleAddDeduction = useCallback((measurementId: string) => {
    startAppendMeasurement(measurementId, { areaMode: "deduction" });
    setSummaryContextMenu(null);
  }, [startAppendMeasurement]);

  const handleSummaryMeasurementClick = useCallback((measurementId: string) => {
    const measurement = savedMeasurements.find((item) => item.id === measurementId);
    if (!measurement) {
      return;
    }

    if (measurement.measurementKind === "count") {
      const isAlreadyAppending = appendMeasurementId === measurementId && toolMode === "count";

      if (isAlreadyAppending) {
        return;
      }

      startAppendMeasurement(measurementId);
      return;
    }

    if (isMeasurementAppendSupported(measurement)) {
      startAppendMeasurement(measurementId);
      return;
    }

    appendSaveTargetMeasurementIdRef.current = null;
    setAppendMeasurementId(null);
    setAppendAreaMode("include");
    setSelection({ type: "measurement", measurementId });
    setSelectedChild(null);
    setToolMode("select");
    setMeasurementPointOverrides({});
    setDraftGeometry({ tool: null, points: [], hasChanges: false });
    setActionError(null);
    clearSaveFeedback();
  }, [appendMeasurementId, clearSaveFeedback, isMeasurementAppendSupported, savedMeasurements, selection, startAppendMeasurement, toolMode]);

  const handleToolSetupConfirm = useCallback((values: MeasureToolSetupState[ConfigurableTool]) => {
    if (!activeSetupTool) {
      return;
    }

    if (activeSetupTool === "calibrate") {
      const calibrateValues = values as MeasureToolSetupState["calibrate"];
      setToolSetup((current) => ({
        ...current,
        calibrate: calibrateValues,
      }));
      setCalibrationName(calibrateValues.name || DEFAULT_CALIBRATION_NAME);
      setCalibrationLengthInput(calibrateValues.referenceLengthInput);
      setCalibrationDisplayUnit(calibrateValues.displayUnit);
      setCalibrationUnitSystem(calibrateValues.unitSystem);
    } else if (activeSetupTool === "distance") {
      setToolSetup((current) => ({
        ...current,
        distance: values as MeasureToolSetupState["distance"],
      }));
    } else if (activeSetupTool === "polyline") {
      setToolSetup((current) => ({
        ...current,
        polyline: values as MeasureToolSetupState["polyline"],
      }));
    } else if (activeSetupTool === "area") {
      setToolSetup((current) => ({
        ...current,
        area: values as MeasureToolSetupState["area"],
      }));
    } else {
      setToolSetup((current) => ({
        ...current,
        count: values as MeasureToolSetupState["count"],
      }));
    }

    beginToolMode(activeSetupTool);
    setIsToolDialogOpen(false);
    setActiveSetupTool(null);
  }, [activeSetupTool, beginToolMode]);

  const handleToolDialogOpenChange = useCallback((nextOpen: boolean) => {
    setIsToolDialogOpen(nextOpen);
    if (!nextOpen) {
      setActiveSetupTool(null);
    }
  }, []);

  const handleToolbarToolSelect = useCallback((tool: ToolMode) => {
    if (tool === "calibrate" && localActiveCalibration) {
      return;
    }

    if (tool === "select") {
      beginToolMode(tool);
      return;
    }

    if (
      tool === "count" &&
      selection?.type === "measurement" &&
      selectedMeasurement?.measurement_kind === "count"
    ) {
      startAppendMeasurement(selection.measurementId);
      return;
    }

    openToolSetupDialog(tool);
  }, [beginToolMode, localActiveCalibration, openToolSetupDialog, selectedMeasurement, selection, startAppendMeasurement]);

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
    appendSaveTargetMeasurementIdRef.current = null;
    setAppendMeasurementId(null);
    setAppendAreaMode("include");
    setSelection(null);
    setSelectedChild(null);
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

    if (
      selectedMeasurementChild &&
      selectedMeasurementChild.measurementId === selection.measurementId &&
      (
        selectedMeasurementChild.kind === "count-item" ||
        selectedMeasurementChild.kind === "area-shape" ||
        selectedMeasurementChild.kind === "line-path"
      )
    ) {
      const previousSnapshot = cloneMeasurement(measurement);
      const nextMeasurement =
        selectedMeasurementChild.kind === "count-item"
          ? {
              ...previousSnapshot,
              points: previousSnapshot.points.filter((point) => point.id !== selectedMeasurementChild.childId),
              count_value: Math.max(
                0,
                Number(previousSnapshot.count_value ?? previousSnapshot.display_value ?? 0) - getCountItemValue(previousSnapshot)
              ),
              display_value: Math.max(
                0,
                Number(previousSnapshot.display_value ?? previousSnapshot.count_value ?? 0) - getCountItemValue(previousSnapshot)
              ),
              display_unit: "count",
            }
          : selectedMeasurementChild.kind === "area-shape"
          ? (() => {
              const remainingShapes = previousSnapshot.area_shapes.filter(
                (shape) => shape.id !== selectedMeasurementChild.childId
              );
              const nextMetadata = buildAreaMeasurementMetadata({
                measurement: previousSnapshot,
                areaShapes: remainingShapes,
              });
              const shouldDeleteMeasurement =
                remainingShapes.length === 0 ||
                !hasIncludedAreaShape({
                  measurement: {
                    ...previousSnapshot,
                    metadata: nextMetadata,
                  },
                  areaShapes: remainingShapes,
                });

              if (shouldDeleteMeasurement) {
                return {
                  ...previousSnapshot,
                  status: "deleted" as const,
                };
              }

              const optimisticDisplayAreaShapes = remainingShapes.map((shape) => ({
                ...shape,
                measured_area_base:
                  localActiveCalibration
                    ? (convertBaseAreaToDisplayValue({
                        baseUnit: localActiveCalibration.base_unit,
                        displayUnit: localActiveCalibration.display_unit,
                        value: Number(shape.measured_area_base ?? 0),
                      }) ?? 0)
                    : Number(shape.measured_area_base ?? 0),
              }));
              const optimisticTotals = computeSignedAreaTotals({
                measurement: {
                  ...previousSnapshot,
                  metadata: nextMetadata,
                },
                areaShapes: optimisticDisplayAreaShapes,
              });
              return {
                ...previousSnapshot,
                display_value: optimisticTotals.measuredAreaValue,
                measured_perimeter_base: optimisticTotals.measuredPerimeterBase,
                metadata: nextMetadata,
                area_shapes: remainingShapes,
              };
            })()
          : {
              ...previousSnapshot,
              line_paths: previousSnapshot.line_paths.filter((path) => path.id !== selectedMeasurementChild.childId),
            };

      if (
        (selectedMeasurementChild.kind === "count-item" && nextMeasurement.points.length === 0) ||
        (selectedMeasurementChild.kind === "area-shape" && nextMeasurement.status === "deleted") ||
        (selectedMeasurementChild.kind === "line-path" && nextMeasurement.line_paths.length === 0)
      ) {
        replaceMeasurementStatusLocally({
          ...previousSnapshot,
          status: "deleted",
        });
      } else {
        upsertLocalMeasurement(nextMeasurement);
      }

      setSelectedChild(null);

      const runDeleteChild = async () => {
        const formData = new FormData();
        formData.set("drawingSetId", drawingSetId);
        formData.set("pageId", pageId);
        formData.set("measurementId", selection.measurementId);
        formData.set("childId", selectedMeasurementChild.childId);
        const result =
          selectedMeasurementChild.kind === "count-item"
            ? await deleteCountItemMeasurementAction(formData)
            : selectedMeasurementChild.kind === "area-shape"
            ? await deleteAreaShapeMeasurementAction(formData)
            : await deleteLinePathMeasurementAction(formData);
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? "Unable to delete measurement child.");
        }
        onMeasurementCommitted?.(pageId, result.data);
        return result.data;
      };

      void runMutation({
        savingMessage: "Deleting selected part...",
        successMessage: "Selected part deleted.",
        showSavingMessage: false,
        showSuccessMessage: false,
        run: async () => {
          try {
            const deletedMeasurement = await runDeleteChild();
            if (deletedMeasurement.status !== "deleted") {
              upsertLocalMeasurement(deletedMeasurement);
              setSelection({ type: "measurement", measurementId: deletedMeasurement.id });
            } else {
              setSelection(null);
            }
            return deletedMeasurement;
          } catch (error) {
            upsertLocalMeasurement(previousSnapshot);
            setSelection({ type: "measurement", measurementId: previousSnapshot.id });
            setSelectedChild(selectedMeasurementChild);
            throw error;
          }
        },
      });
      return;
    }

    const previousSnapshot = cloneMeasurement(measurement);
    replaceMeasurementStatusLocally({
      ...previousSnapshot,
      status: "deleted",
    });
    setSelection(null);
    setSelectedChild(null);

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
      onMeasurementCommitted?.(pageId, result.data);
      return result.data;
    };

    void runMutation({
      savingMessage: "Deleting measurement...",
      successMessage: "Measurement deleted.",
      showSavingMessage: false,
      showSuccessMessage: false,
      run: async () => {
        try {
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
              onMeasurementCommitted?.(pageId, restoreResult.data);
            },
            redo: async () => {
              replaceMeasurementStatusLocally({
                ...previousSnapshot,
                status: "deleted",
              });
              await runDelete();
            },
          });

          return deletedMeasurement;
        } catch (error) {
          upsertLocalMeasurement(previousSnapshot);
          setSelection({ type: "measurement", measurementId: previousSnapshot.id });
          throw error;
        }
      },
    });
  }, [
    drawingSetId,
    getCurrentMeasurementById,
    localActiveCalibration,
    onMeasurementCommitted,
    pageId,
    pushHistoryCommand,
    replaceMeasurementStatusLocally,
    runMutation,
    selection,
    selectedMeasurementChild,
    deleteCountItemMeasurementAction,
    deleteAreaShapeMeasurementAction,
    deleteLinePathMeasurementAction,
    upsertLocalMeasurement,
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

    if (appendMeasurementId) {
      appendSaveTargetMeasurementIdRef.current = null;
      setAppendMeasurementId(null);
      setAppendAreaMode("include");
      setToolMode("select");
      setDraftGeometry({ tool: null, points: [], hasChanges: false });
      setMeasurementPointOverrides({});
      return;
    }

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
    appendMeasurementId,
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

      if (event.key === "Escape" && isSettingsOpen) {
        event.preventDefault();
        setIsSettingsOpen(false);
        return;
      }

      if (isToolDialogOpen) {
        if (event.code === "Space" && !typingTarget) {
          event.preventDefault();
        }
        return;
      }

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
        if (!localActiveCalibration) {
          beginToolMode("calibrate");
        }
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

      if (event.key === "Enter") {
        if (draftGeometry.tool === "polyline" && draftGeometry.points.length >= 2) {
          event.preventDefault();
          finishMeasurementDraftRef.current?.("polyline", draftGeometry.points);
          return;
        }

        if (draftGeometry.tool === "area" && draftGeometry.points.length >= 3) {
          event.preventDefault();
          finishMeasurementDraftRef.current?.("area", draftGeometry.points);
          return;
        }
      }

      if ((event.key === "Backspace" || event.key === "Delete") && (hasUnsavedMeasurementDraft || hasUnsavedCalibrationChanges)) {
        event.preventDefault();
        removeLastDraftPoint();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (isToolDialogOpen) {
        return;
      }

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
    isToolDialogOpen,
    isSettingsOpen,
    localActiveCalibration,
    removeLastDraftPoint,
    runRedo,
    runUndo,
    selection,
  ]);

  function submitCalibration(points: Point2D[]) {
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const calibrationSetup = toolSetup.calibrate;
    const resolvedCalibrationName = calibrationName.trim() || calibrationSetup.name || DEFAULT_CALIBRATION_NAME;
    const resolvedCalibrationLength = calibrationLengthInput || calibrationSetup.referenceLengthInput || "0";
    const resolvedCalibrationDisplayUnit = calibrationDisplayUnit || calibrationSetup.displayUnit;
    const resolvedCalibrationUnitSystem = calibrationUnitSystem || calibrationSetup.unitSystem;
    const successMessage = `Scale set to ${resolvedCalibrationLength} ${resolvedCalibrationDisplayUnit}`;
    const parsedReferenceLength = Number(resolvedCalibrationLength);
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("name", resolvedCalibrationName);
    formData.set("unitSystem", resolvedCalibrationUnitSystem);
    formData.set("displayUnit", resolvedCalibrationDisplayUnit);
    formData.set("referenceLengthInput", resolvedCalibrationLength);
    formData.set("pointAX", String(normalizedPoints[0]?.x ?? -1));
    formData.set("pointAY", String(normalizedPoints[0]?.y ?? -1));
    formData.set("pointBX", String(normalizedPoints[1]?.x ?? -1));
    formData.set("pointBY", String(normalizedPoints[1]?.y ?? -1));
    formData.set("notes", "");
    const previousCalibration = localActiveCalibrationRef.current ? { ...localActiveCalibrationRef.current } : null;
    const optimisticCalibration: TakeoffCalibration = {
      id: previousCalibration?.id ?? `optimistic-calibration-${crypto.randomUUID()}`,
      base_unit: resolvedCalibrationUnitSystem === "imperial" ? "in" : "mm",
      name: resolvedCalibrationName,
      display_unit: resolvedCalibrationDisplayUnit,
      reference_length_input: Number.isFinite(parsedReferenceLength) ? parsedReferenceLength : 0,
      point_a_x: normalizedPoints[0]?.x ?? 0,
      point_a_y: normalizedPoints[0]?.y ?? 0,
      point_b_x: normalizedPoints[1]?.x ?? 0,
      point_b_y: normalizedPoints[1]?.y ?? 0,
    };

    setActionError(null);
    setLocalActiveCalibration(optimisticCalibration);
    onCalibrationCommitted?.(pageId, optimisticCalibration);
    setDraftGeometry({ tool: null, points: [], hasChanges: false });
    setSelection(null);
    setToolMode("select");
    markSaveSuccess(successMessage);

    void (async () => {
      try {
        const result = await saveCalibrationAction(formData);
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? "Unable to save calibration.");
        }

        const nextCalibration = result.data;
        setLocalActiveCalibration(nextCalibration);
        onCalibrationCommitted?.(pageId, nextCalibration);

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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save calibration.";
        setLocalActiveCalibration(previousCalibration);
        onCalibrationCommitted?.(pageId, previousCalibration);
        markSaveError(message, () => {
          submitCalibration(points);
        });
      }
    })();
  }

  function submitDistance(points: Point2D[]) {
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const tempMeasurementId = `temp-${crypto.randomUUID()}`;
    const isPolyline = points.length > 2;
    const measurementSetup = isPolyline ? toolSetup.polyline : toolSetup.distance;
    const fallbackName = isPolyline
      ? `Linear ${savedMeasurements.filter((measurement) => measurement.measurementKind === "line" && measurement.isPolyline).length + 1}`
      : `Distance ${savedMeasurements.filter((measurement) => measurement.measurementKind === "line" && !measurement.isPolyline).length + 1}`;
    const resolvedName = measurementSetup.name.trim() || fallbackName;
    const resolvedDescription = measurementSetup.description.trim();
    const resolvedColor = measurementSetup.colorHex || DEFAULT_DISTANCE_COLOR;
    const optimisticMeasurement: TakeoffMeasurement = {
      id: tempMeasurementId,
      measurement_kind: "line",
      status: "active",
      name: resolvedName,
      description: resolvedDescription,
      color_hex: resolvedColor,
      display_value: convertDocumentDistanceToRealWorld(getPolylineLength(points), calibrationScale),
      display_unit: calibrationScale?.displayUnit ?? null,
      count_value: null,
      metadata: {},
      points: normalizedPoints.map((point, index) => ({
        id: `${tempMeasurementId}:${index}`,
        point_order: index,
        x: point.x,
        y: point.y,
      })),
      area_shapes: [],
      line_paths: isPolyline
        ? [
            {
              id: `${tempMeasurementId}:path-0`,
              measurement_id: tempMeasurementId,
              path_order: 0,
              measured_length_base: 0,
              page_bbox_min_x: null,
              page_bbox_min_y: null,
              page_bbox_max_x: null,
              page_bbox_max_y: null,
              points: normalizedPoints.map((point, index) => ({
                id: `${tempMeasurementId}:path-0:${index}`,
                line_path_id: `${tempMeasurementId}:path-0`,
                point_order: index,
                x: point.x,
                y: point.y,
              })),
            },
          ]
        : [],
    };
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("name", resolvedName);
    formData.set("description", resolvedDescription);
    formData.set("groupId", "");
    formData.set("colorHex", resolvedColor);
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    upsertLocalMeasurement(optimisticMeasurement);

    void runMutation({
      savingMessage: points.length > 2 ? "Saving polyline..." : "Saving distance...",
      successMessage: points.length > 2 ? "Polyline saved." : "Distance saved.",
      showSavingMessage: false,
      showSuccessMessage: false,
      retry: () => {
        submitDistance(points);
      },
      run: async () => {
        try {
          const result = await createLineMeasurementAction(formData);
          if (!result.ok || !result.data) {
            throw new Error(result.error ?? "Unable to create measurement.");
          }

          const nextMeasurement = cloneMeasurement(result.data);
          replaceLocalMeasurementId(tempMeasurementId, nextMeasurement);
          onMeasurementCommitted?.(pageId, nextMeasurement);
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
              onMeasurementCommitted?.(pageId, deleteResult.data);
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
              onMeasurementCommitted?.(pageId, restoreResult.data);
            },
          });

          return nextMeasurement;
        } catch (error) {
          removeLocalMeasurement(tempMeasurementId);
          throw error;
        }
      },
    });
  }

  function submitAppendPolylinePath(measurementId: string, points: Point2D[]) {
    const previousMeasurement = getCurrentMeasurementById(measurementId);
    if (!previousMeasurement || previousMeasurement.measurement_kind !== "line") {
      return;
    }

    const previousSnapshot = cloneMeasurement(previousMeasurement);
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const pendingPathId = crypto.randomUUID();
    const measuredLength = convertDocumentDistanceToRealWorld(getPolylineLength(points), calibrationScale) ?? 0;
    const tempPathId = `temp-line-path-${pendingPathId}`;
    const optimisticMeasurement: TakeoffMeasurement = {
      ...previousSnapshot,
      display_value: (previousSnapshot.display_value ?? 0) + measuredLength,
      display_unit: calibrationScale?.displayUnit ?? previousSnapshot.display_unit,
      line_paths: [
        ...previousSnapshot.line_paths,
        {
          id: tempPathId,
          measurement_id: previousSnapshot.id,
          path_order: previousSnapshot.line_paths.length,
          measured_length_base: 0,
          page_bbox_min_x: null,
          page_bbox_min_y: null,
          page_bbox_max_x: null,
          page_bbox_max_y: null,
          points: normalizedPoints.map((point, index) => ({
            id: `${tempPathId}:${index}`,
            line_path_id: tempPathId,
            point_order: index,
            x: point.x,
            y: point.y,
          })),
        },
      ],
    };
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("measurementId", measurementId);
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    const existingPendingPaths = pendingPolylineAppendPathsRef.current[measurementId] ?? [];
    pendingPolylineAppendPathsRef.current[measurementId] = [
      ...existingPendingPaths,
      {
        id: pendingPathId,
        points: normalizedPoints,
        measuredLength,
      },
    ];

    upsertLocalMeasurement(optimisticMeasurement);

    polylineAppendQueueRef.current = polylineAppendQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const currentPendingPaths = pendingPolylineAppendPathsRef.current[measurementId] ?? [];
        if (!currentPendingPaths.some((path) => path.id === pendingPathId)) {
          return;
        }

        const result = await runMutation({
          savingMessage: "Adding polyline...",
          successMessage: "Polyline added.",
          showSavingMessage: false,
          showSuccessMessage: false,
          retry: () => {
            submitAppendPolylinePath(measurementId, points);
          },
          run: async () => {
            const appendResult = await appendLinePathMeasurementAction(formData);
            if (!appendResult.ok || !appendResult.data) {
              throw new Error(appendResult.error ?? "Unable to add polyline path.");
            }

            return cloneMeasurement(appendResult.data);
          },
        });

        if (!result) {
          delete pendingPolylineAppendPathsRef.current[measurementId];
          upsertLocalMeasurement(previousSnapshot);
          return;
        }

        const remainingPendingPaths = (pendingPolylineAppendPathsRef.current[measurementId] ?? []).filter((path) => path.id !== pendingPathId);
        if (remainingPendingPaths.length > 0) {
          pendingPolylineAppendPathsRef.current[measurementId] = remainingPendingPaths;
        } else {
          delete pendingPolylineAppendPathsRef.current[measurementId];
        }

        const mergedMeasurement = applyPendingPolylineAppendPaths(result, remainingPendingPaths, calibrationScale);
        upsertLocalMeasurement(mergedMeasurement);
        onMeasurementCommitted?.(pageId, result);
      });
  }

  function submitArea(points: Point2D[]) {
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const tempMeasurementId = `temp-${crypto.randomUUID()}`;
    const areaSetup = toolSetup.area;
    const resolvedName = areaSetup.name.trim() || `Area ${savedMeasurements.filter((measurement) => measurement.measurementKind === "area").length + 1}`;
    const resolvedDescription = areaSetup.description.trim();
    const resolvedColor = areaSetup.colorHex || DEFAULT_AREA_COLOR;
    const optimisticMeasuredPerimeterBase = getMeasuredPerimeterBaseFromDocumentPoints(
      points,
      calibrationScale,
      localActiveCalibration
    );
    const optimisticMeasurement: TakeoffMeasurement = {
      id: tempMeasurementId,
      measurement_kind: "area",
      status: "active",
      name: resolvedName,
      description: resolvedDescription,
      color_hex: resolvedColor,
      display_value: convertDocumentAreaToRealWorld(getPolygonArea(points), calibrationScale),
      display_unit: calibrationScale ? `${calibrationScale.displayUnit}²` : null,
      count_value: null,
      measured_perimeter_base: optimisticMeasuredPerimeterBase,
      metadata: {},
      points: normalizedPoints.map((point, index) => ({
        id: `${tempMeasurementId}:${index}`,
        point_order: index,
        x: point.x,
        y: point.y,
      })),
      area_shapes: [
        {
          id: `${tempMeasurementId}:shape-0`,
          measurement_id: tempMeasurementId,
          shape_order: 0,
          measured_area_base: 0,
          measured_perimeter_base: optimisticMeasuredPerimeterBase ?? 0,
          page_bbox_min_x: null,
          page_bbox_min_y: null,
          page_bbox_max_x: null,
          page_bbox_max_y: null,
          points: normalizedPoints.map((point, index) => ({
            id: `${tempMeasurementId}:shape-0:${index}`,
            area_shape_id: `${tempMeasurementId}:shape-0`,
            point_order: index,
            x: point.x,
            y: point.y,
          })),
        },
      ],
      line_paths: [],
    };
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("name", resolvedName);
    formData.set("description", resolvedDescription);
    formData.set("groupId", "");
    formData.set("colorHex", resolvedColor);
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    flushSync(() => {
      upsertLocalMeasurement(optimisticMeasurement);
    });

    void runMutation({
      savingMessage: "Saving area...",
      successMessage: "Area saved.",
      showSavingMessage: false,
      showSuccessMessage: false,
      retry: () => {
        submitArea(points);
      },
      run: async () => {
        try {
          const result = await createAreaMeasurementAction(formData);
          if (!result.ok || !result.data) {
            throw new Error(result.error ?? "Unable to create area measurement.");
          }

          const nextMeasurement = cloneMeasurement(result.data);
          replaceLocalMeasurementId(tempMeasurementId, nextMeasurement);
          onMeasurementCommitted?.(pageId, nextMeasurement);
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
              onMeasurementCommitted?.(pageId, deleteResult.data);
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
              onMeasurementCommitted?.(pageId, restoreResult.data);
            },
          });

          return nextMeasurement;
        } catch (error) {
          removeLocalMeasurement(tempMeasurementId);
          throw error;
        }
      },
    });
  }

  function submitAppendAreaShape(measurementId: string, points: Point2D[], role: AreaShapeRole) {
    const previousMeasurement = getCurrentMeasurementById(measurementId);
    if (!previousMeasurement || previousMeasurement.measurement_kind !== "area") {
      return;
    }

    const previousSnapshot = cloneMeasurement(previousMeasurement);
    const normalizedPoints = documentPointsToNormalizedPoints(points, documentPageSize);
    const tempShapeId = `temp-shape-${crypto.randomUUID()}`;
    const optimisticAreaValue = convertDocumentAreaToRealWorld(getPolygonArea(points), calibrationScale) ?? 0;
    const optimisticMeasuredPerimeterBase = getMeasuredPerimeterBaseFromDocumentPoints(
      points,
      calibrationScale,
      localActiveCalibration
    );
    const nextAreaShapes = [
      ...previousSnapshot.area_shapes,
      {
        id: tempShapeId,
        measurement_id: previousSnapshot.id,
        shape_order: previousSnapshot.area_shapes.length,
        measured_area_base: optimisticAreaValue,
        measured_perimeter_base: optimisticMeasuredPerimeterBase ?? 0,
        page_bbox_min_x: null,
        page_bbox_min_y: null,
        page_bbox_max_x: null,
        page_bbox_max_y: null,
        points: normalizedPoints.map((point, index) => ({
          id: `${tempShapeId}:${index}`,
          area_shape_id: tempShapeId,
          point_order: index,
          x: point.x,
          y: point.y,
        })),
      },
    ];
    const nextMetadata = buildAreaMeasurementMetadata({
      measurement: previousSnapshot,
      areaShapes: nextAreaShapes,
      overrides: {
        [tempShapeId]: role,
      },
    });
    const optimisticDisplayAreaShapes = nextAreaShapes.map((shape) => ({
      ...shape,
      measured_area_base:
        shape.id === tempShapeId
          ? optimisticAreaValue
          : localActiveCalibration
            ? (convertBaseAreaToDisplayValue({
                baseUnit: localActiveCalibration.base_unit,
                displayUnit: localActiveCalibration.display_unit,
                value: Number(shape.measured_area_base ?? 0),
              }) ?? 0)
            : Number(shape.measured_area_base ?? 0),
    }));
    const optimisticTotals = computeSignedAreaTotals({
      measurement: {
        ...previousSnapshot,
        metadata: nextMetadata,
      },
      areaShapes: optimisticDisplayAreaShapes,
    });
    const optimisticMeasurement: TakeoffMeasurement = {
      ...previousSnapshot,
      display_value: optimisticTotals.measuredAreaValue,
      display_unit: calibrationScale ? `${calibrationScale.displayUnit}²` : previousSnapshot.display_unit,
      measured_perimeter_base: optimisticTotals.measuredPerimeterBase,
      metadata: nextMetadata,
      area_shapes: nextAreaShapes,
    };
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("measurementId", measurementId);
    formData.set("points", serializeNormalizedPoints(normalizedPoints));
    formData.set("role", role);

    upsertLocalMeasurement(optimisticMeasurement);

    void runMutation({
      savingMessage: "Adding area...",
      successMessage: role === "deduction" ? "Deduction added." : "Area added.",
      showSavingMessage: false,
      showSuccessMessage: false,
      retry: () => {
        submitAppendAreaShape(measurementId, points, role);
      },
      run: async () => {
        try {
          const result = await appendAreaShapeMeasurementAction(formData);
          if (!result.ok || !result.data) {
            throw new Error(result.error ?? "Unable to add area shape.");
          }

          const nextMeasurement = cloneMeasurement(result.data);
          upsertLocalMeasurement(nextMeasurement);
          onMeasurementCommitted?.(pageId, nextMeasurement);
          return nextMeasurement;
        } catch (error) {
          upsertLocalMeasurement(previousSnapshot);
          throw error;
        }
      },
    });
  }

  function submitCount(point: Point2D) {
    const normalizedPoints = documentPointsToNormalizedPoints([point], documentPageSize);
    const tempMeasurementId = `temp-${crypto.randomUUID()}`;
    const countSetup = toolSetup.count;
    const resolvedName = countSetup.name.trim() || `Count ${countMeasurements.length + 1}`;
    const resolvedDescription = countSetup.description.trim();
    const resolvedColor = countSetup.colorHex || DEFAULT_COUNT_COLOR;
    const resolvedCountValue = countSetup.countValue || 1;
    const optimisticMeasurement: TakeoffMeasurement = {
      id: tempMeasurementId,
      measurement_kind: "count",
      status: "active",
      name: resolvedName,
      description: resolvedDescription,
      color_hex: resolvedColor,
      display_value: resolvedCountValue,
      display_unit: "count",
      count_value: resolvedCountValue,
      metadata: {
        countItemValue: resolvedCountValue,
      },
      points: normalizedPoints.map((nextPoint, index) => ({
        id: `${tempMeasurementId}:${index}`,
        point_order: index,
        x: nextPoint.x,
        y: nextPoint.y,
      })),
      area_shapes: [],
      line_paths: [],
    };
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("name", resolvedName);
    formData.set("description", resolvedDescription);
    formData.set("groupId", "");
    formData.set("colorHex", resolvedColor);
    formData.set("countValue", String(resolvedCountValue));
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    flushSync(() => {
      upsertLocalMeasurement(optimisticMeasurement);
    });

    void runMutation({
      savingMessage: "Saving count...",
      successMessage: "Count saved.",
      showSavingMessage: false,
      showSuccessMessage: false,
      retry: () => {
        submitCount(point);
      },
      run: async () => {
        try {
          const result = await createCountMeasurementAction(formData);
          if (!result.ok || !result.data) {
            throw new Error(result.error ?? "Unable to create count measurement.");
          }

          const nextMeasurement = cloneMeasurement(result.data);
          replaceLocalMeasurementId(tempMeasurementId, nextMeasurement);
          onMeasurementCommitted?.(pageId, nextMeasurement);
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
              onMeasurementCommitted?.(pageId, deleteResult.data);
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
              onMeasurementCommitted?.(pageId, restoreResult.data);
            },
          });

          return nextMeasurement;
        } catch (error) {
          removeLocalMeasurement(tempMeasurementId);
          throw error;
        }
      },
    });
  }

  function submitAppendCountItem(measurementId: string, point: Point2D) {
    const previousMeasurement = getCurrentMeasurementById(measurementId);
    if (!previousMeasurement || previousMeasurement.measurement_kind !== "count") {
      return;
    }

    const previousSnapshot = cloneMeasurement(previousMeasurement);
    const normalizedPoint = documentPointsToNormalizedPoints([point], documentPageSize)[0]!;
    const pendingItemId = crypto.randomUUID();
    const countItemValue = getCountItemValue(previousSnapshot);
    const nextPointOrder = previousSnapshot.points.length;
    const optimisticMeasurement: TakeoffMeasurement = {
      ...previousSnapshot,
      display_value: (previousSnapshot.display_value ?? 0) + countItemValue,
      display_unit: "count",
      count_value: (previousSnapshot.count_value ?? previousSnapshot.display_value ?? 0) + countItemValue,
      metadata: {
        ...(previousSnapshot.metadata && typeof previousSnapshot.metadata === "object" ? previousSnapshot.metadata : {}),
        countItemValue,
      },
      points: [
        ...previousSnapshot.points,
        {
          id: `${previousSnapshot.id}:${nextPointOrder}`,
          point_order: nextPointOrder,
          x: normalizedPoint.x,
          y: normalizedPoint.y,
        },
      ],
    };
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("measurementId", measurementId);
    formData.set("points", serializeNormalizedPoints([normalizedPoint]));

    const existingPendingItems = pendingCountAppendItemsRef.current[measurementId] ?? [];
    pendingCountAppendItemsRef.current[measurementId] = [
      ...existingPendingItems,
      {
        id: pendingItemId,
        point: normalizedPoint,
      },
    ];

    flushSync(() => {
      upsertLocalMeasurement(optimisticMeasurement);
    });

    countAppendQueueRef.current = countAppendQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const currentPendingItems = pendingCountAppendItemsRef.current[measurementId] ?? [];
        if (!currentPendingItems.some((item) => item.id === pendingItemId)) {
          return;
        }

        const result = await runMutation({
          savingMessage: "Adding count...",
          successMessage: "Count added.",
          showSavingMessage: false,
          showSuccessMessage: false,
          retry: () => {
            submitAppendCountItem(measurementId, point);
          },
          run: async () => {
            const appendResult = await appendCountItemMeasurementAction(formData);
            if (!appendResult.ok || !appendResult.data) {
              throw new Error(appendResult.error ?? "Unable to add count item.");
            }

            return cloneMeasurement(appendResult.data);
          },
        });

        if (!result) {
          delete pendingCountAppendItemsRef.current[measurementId];
          upsertLocalMeasurement(previousSnapshot);
          return;
        }

        const remainingPendingItems = (pendingCountAppendItemsRef.current[measurementId] ?? []).filter((item) => item.id !== pendingItemId);
        if (remainingPendingItems.length > 0) {
          pendingCountAppendItemsRef.current[measurementId] = remainingPendingItems;
        } else {
          delete pendingCountAppendItemsRef.current[measurementId];
        }

        const mergedMeasurement = applyPendingCountAppendItems(result, remainingPendingItems);
        upsertLocalMeasurement(mergedMeasurement);
        onMeasurementCommitted?.(pageId, result);
      });
  }

  function submitMeasurementUpdate(params: {
    measurementId: string;
    childId?: string;
    childKind?: MeasurementChildKind;
    points: Point2D[];
  }) {
    const previousMeasurement = getCurrentMeasurementById(params.measurementId);
    if (!previousMeasurement) {
      return;
    }

    const previousSnapshot = cloneMeasurement(previousMeasurement);
    const normalizedPoints = documentPointsToNormalizedPoints(params.points, documentPageSize);
    const optimisticAreaShapes =
      previousSnapshot.measurement_kind === "area" && previousSnapshot.area_shapes.length > 0
        ? previousSnapshot.area_shapes.map((shape) => {
            if (!(shape.id === params.childId || (!params.childId && previousSnapshot.area_shapes.length === 1))) {
              return shape;
            }

            const nextShapePoints = normalizedPoints.map((point, index) => ({
              ...(shape.points[index] ?? {
                id: `${shape.id}:${index}`,
                area_shape_id: shape.id,
                point_order: index,
                x: point.x,
                y: point.y,
              }),
              point_order: index,
              x: point.x,
              y: point.y,
            }));
            const nextDocumentPoints = nextShapePoints.map((point) =>
              transform.normalizedPointToDocumentPoint({ x: point.x, y: point.y })
            );
            const nextMeasuredPerimeterBase = getMeasuredPerimeterBaseFromDocumentPoints(
              nextDocumentPoints,
              calibrationScale,
              localActiveCalibration
            );
            const nextDisplayAreaValue =
              convertDocumentAreaToRealWorld(getPolygonArea(nextDocumentPoints), calibrationScale) ?? 0;
            const nextMeasuredAreaBase =
              localActiveCalibration
                ? (convertDisplayAreaToBaseValue({
                    baseUnit: localActiveCalibration.base_unit,
                    displayUnit: localActiveCalibration.display_unit,
                    value: nextDisplayAreaValue,
                  }) ?? Number(shape.measured_area_base ?? 0))
                : Number(shape.measured_area_base ?? 0);

            return {
              ...shape,
              measured_area_base: nextMeasuredAreaBase,
              measured_perimeter_base: nextMeasuredPerimeterBase ?? shape.measured_perimeter_base ?? 0,
              points: nextShapePoints,
            };
          })
        : previousSnapshot.area_shapes;
    const nextAreaMetadata =
      previousSnapshot.measurement_kind === "area"
        ? buildAreaMeasurementMetadata({
            measurement: previousSnapshot,
            areaShapes: optimisticAreaShapes,
          })
        : previousSnapshot.metadata;
    const optimisticDisplayAreaShapes =
      previousSnapshot.measurement_kind === "area"
        ? optimisticAreaShapes.map((shape) => ({
            ...shape,
            measured_area_base:
              localActiveCalibration
                ? (convertBaseAreaToDisplayValue({
                    baseUnit: localActiveCalibration.base_unit,
                    displayUnit: localActiveCalibration.display_unit,
                    value: Number(shape.measured_area_base ?? 0),
                  }) ?? 0)
                : Number(shape.measured_area_base ?? 0),
          }))
        : [];
    const optimisticAreaTotals =
      previousSnapshot.measurement_kind === "area"
        ? computeSignedAreaTotals({
            measurement: {
              ...previousSnapshot,
              metadata: nextAreaMetadata,
            },
            areaShapes: optimisticDisplayAreaShapes,
          })
        : null;
    const optimisticMeasurement: TakeoffMeasurement = {
      ...previousSnapshot,
      points:
        !params.childId
          ? normalizedPoints.map((point, index) => ({
              ...(previousSnapshot.points[index] ?? {
                id: `${previousSnapshot.id}:${index}`,
                point_order: index,
                x: point.x,
                y: point.y,
              }),
              point_order: index,
              x: point.x,
              y: point.y,
            }))
          : previousSnapshot.points,
      display_value:
        previousSnapshot.measurement_kind === "area"
          ? optimisticAreaTotals?.measuredAreaValue ?? previousSnapshot.display_value
          : previousSnapshot.display_value,
      measured_perimeter_base:
        previousSnapshot.measurement_kind === "area"
          ? optimisticAreaTotals?.measuredPerimeterBase ?? previousSnapshot.measured_perimeter_base
          : previousSnapshot.measured_perimeter_base,
      metadata: nextAreaMetadata,
      area_shapes: optimisticAreaShapes,
      line_paths:
        previousSnapshot.measurement_kind === "line" && previousSnapshot.line_paths.length > 0
          ? previousSnapshot.line_paths.map((path) =>
              path.id === params.childId || (!params.childId && previousSnapshot.line_paths.length === 1)
                ? {
                    ...path,
                    points: normalizedPoints.map((point, index) => ({
                      ...(path.points[index] ?? {
                        id: `${path.id}:${index}`,
                        line_path_id: path.id,
                        point_order: index,
                        x: point.x,
                        y: point.y,
                      }),
                      point_order: index,
                      x: point.x,
                      y: point.y,
                    })),
                  }
                : path
            )
          : previousSnapshot.line_paths,
    };
    const formData = new FormData();
    formData.set("drawingSetId", drawingSetId);
    formData.set("pageId", pageId);
    formData.set("measurementId", params.measurementId);
    if (params.childId) {
      formData.set("childId", params.childId);
    }
    formData.set("points", serializeNormalizedPoints(normalizedPoints));

    upsertLocalMeasurement(optimisticMeasurement);

    void runMutation({
      savingMessage: "Saving geometry update...",
      successMessage: "Measurement updated.",
      showSavingMessage: false,
      showSuccessMessage: false,
      retry: () => {
        submitMeasurementUpdate(params);
      },
      run: async () => {
        try {
          const result =
            params.childKind === "area-shape"
              ? await updateAreaShapeGeometryAction(formData)
              : params.childKind === "line-path"
                ? await updateLinePathGeometryAction(formData)
                : await updateMeasurementGeometryAction(formData);
          if (!result.ok || !result.data) {
            throw new Error(result.error ?? "Unable to update measurement geometry.");
          }

          const nextMeasurement = cloneMeasurement(result.data);
          upsertLocalMeasurement(nextMeasurement);

          return nextMeasurement;
        } catch (error) {
          upsertLocalMeasurement(previousSnapshot);
          throw error;
        }
      },
    });
  }

  function submitMeasurementDetails(
    measurementId: string,
    overrides?: {
      name?: string;
      description?: string;
      tag?: string;
      colorHex?: string;
    },
    options?: {
      onSuccess?: () => void;
      onSettled?: () => void;
    }
  ) {
    const previousMeasurement = getCurrentMeasurementById(measurementId);
    if (!previousMeasurement) {
      return;
    }

    const previousSnapshot = cloneMeasurement(previousMeasurement);
    const nextName = (overrides?.name?.trim() ?? measurementNameInput.trim()) || previousMeasurement.name;
    const nextDescription = overrides?.description?.trim() ?? measurementNoteInput.trim();
    const nextTag = overrides?.tag?.trim() ?? measurementTagInput.trim();
    const nextColorHex =
      overrides?.colorHex?.trim() ||
      previousSnapshot.color_hex ||
      (previousSnapshot.measurement_kind === "area"
        ? DEFAULT_AREA_COLOR
        : previousSnapshot.measurement_kind === "count"
          ? DEFAULT_COUNT_COLOR
          : DEFAULT_DISTANCE_COLOR);
    const optimisticMeasurement: TakeoffMeasurement = {
      ...previousSnapshot,
      name: nextName || previousSnapshot.name,
      description: nextDescription,
      color_hex: nextColorHex,
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
    formData.set("colorHex", nextColorHex);

    upsertLocalMeasurement(optimisticMeasurement);

    return runMutation({
      savingMessage: "Saving measurement details...",
      successMessage: "Measurement details saved.",
      retry: () => {
        void submitMeasurementDetails(measurementId, overrides, options);
      },
      showSavingMessage: false,
      showSuccessMessage: false,
      run: async () => {
        try {
          const result = await updateMeasurementDetailsAction(formData);
          if (!result.ok || !result.data) {
            throw new Error(result.error ?? "Unable to update measurement details.");
          }

          const nextMeasurement = cloneMeasurement(result.data);
          upsertLocalMeasurement(nextMeasurement);
          onMeasurementCommitted?.(pageId, nextMeasurement);
          pushHistoryCommand({
            id: `details:${measurementId}:${Date.now()}`,
            label: "Update measurement details",
            undo: async () => {
              const undoFormData = new FormData();
              undoFormData.set("measurementId", measurementId);
              undoFormData.set("name", previousSnapshot.name);
              undoFormData.set("description", previousSnapshot.description ?? "");
              undoFormData.set("tag", getMeasurementTag(previousSnapshot) ?? "");
              undoFormData.set("colorHex", previousSnapshot.color_hex ?? "");
              const undoResult = await updateMeasurementDetailsAction(undoFormData);
              if (!undoResult.ok || !undoResult.data) {
                throw new Error(undoResult.error ?? "Unable to undo measurement details.");
              }

              upsertLocalMeasurement(undoResult.data);
              onMeasurementCommitted?.(pageId, undoResult.data);
            },
            redo: async () => {
              const redoFormData = new FormData();
              redoFormData.set("measurementId", measurementId);
              redoFormData.set("name", nextName);
              redoFormData.set("description", nextDescription);
              redoFormData.set("tag", nextTag);
              redoFormData.set("colorHex", nextColorHex);
              const redoResult = await updateMeasurementDetailsAction(redoFormData);
              if (!redoResult.ok || !redoResult.data) {
                throw new Error(redoResult.error ?? "Unable to redo measurement details.");
              }

              upsertLocalMeasurement(redoResult.data);
              onMeasurementCommitted?.(pageId, redoResult.data);
            },
          });

          return nextMeasurement;
        } catch (error) {
          upsertLocalMeasurement(previousSnapshot);
          throw error;
        }
      },
    }).then((result) => {
      if (result) {
        options?.onSuccess?.();
        return true;
      }

      return false;
    }).finally(() => {
      options?.onSettled?.();
    });
  }

  function submitSummaryMeasurementEdit() {
    if (!summaryMeasurementEdit || isSummaryMeasurementEditSaving) {
      return;
    }

    const pendingEdit = summaryMeasurementEdit;
    setSummaryMeasurementEdit(null);
    void submitMeasurementDetails(
      pendingEdit.measurementId,
      {
        name: pendingEdit.name,
        description: pendingEdit.description,
        colorHex: pendingEdit.colorHex,
      },
      {
        onSettled: () => {
          setIsSummaryMeasurementEditSaving(false);
        },
      }
    );
  }

  function finishMeasurementDraft(tool: Exclude<DraftTool, "calibrate" | null>, points: Point2D[]) {
    const appendTargetMeasurementId = appendSaveTargetMeasurementIdRef.current ?? activeAppendMeasurementId;

    if (appendTargetMeasurementId && !draftGeometry.hasChanges) {
      return;
    }

    if (tool === "area") {
      const resolvedAreaPoints = (() => {
        const committedPoints = points;
        const hoverPoint = hoverState.documentPoint;
        const lastCommittedPoint = committedPoints[committedPoints.length - 1] ?? null;

        if (!hoverPoint || !lastCommittedPoint || committedPoints.length < 2) {
          return committedPoints;
        }

        const hoverDistanceFromLastCommitted = Math.hypot(
          hoverPoint.x - lastCommittedPoint.x,
          hoverPoint.y - lastCommittedPoint.y
        );

        if (hoverDistanceFromLastCommitted <= 0.001) {
          return committedPoints;
        }

        const nextPoints = [...committedPoints, hoverPoint];
        return nextPoints.length >= 3 ? nextPoints : committedPoints;
      })();

      if (resolvedAreaPoints.length >= 3) {
        if (appendTargetMeasurementId) {
          submitAppendAreaShape(appendTargetMeasurementId, resolvedAreaPoints, appendAreaMode);
          appendSaveTargetMeasurementIdRef.current = null;
          setAppendMeasurementId(null);
          setAppendAreaMode("include");
          setSelection({ type: "measurement", measurementId: appendTargetMeasurementId });
          setToolMode("select");
        } else {
          submitArea(resolvedAreaPoints);
        }
        setDraftGeometry({ tool: "area", points: [], hasChanges: false });
      }
      return;
    }

    if (points.length >= 2) {
      if (appendTargetMeasurementId) {
        if (tool === "polyline") {
          submitAppendPolylinePath(appendTargetMeasurementId, points);
          setSelection({ type: "measurement", measurementId: appendTargetMeasurementId });
          setDraftGeometry({ tool: "polyline", points: [], hasChanges: false });
          return;
        }

        submitMeasurementUpdate({
          measurementId: appendTargetMeasurementId,
          points,
        });
        appendSaveTargetMeasurementIdRef.current = null;
        setAppendMeasurementId(null);
        setAppendAreaMode("include");
        setSelection({ type: "measurement", measurementId: appendTargetMeasurementId });
        setToolMode("select");
      } else {
        submitDistance(points);
      }
      setDraftGeometry({ tool, points: [], hasChanges: false });
    }
  }

  finishMeasurementDraftRef.current = finishMeasurementDraft;

  function handleCanvasClick(documentPoint: Point2D) {
    if (toolMode === "calibrate") {
      if (isSaving) {
        return;
      }

      setSelection({ type: "calibration" });
      const currentPoints = draftGeometry.tool === "calibrate" ? draftGeometry.points : calibrationPointsForDisplay;
      const nextPoints = currentPoints.length >= 2 ? [documentPoint] : [...currentPoints, documentPoint];

      if (nextPoints.length === 2) {
        setDraftGeometry({
          tool: "calibrate",
          points: nextPoints,
          hasChanges: true,
        });
        submitCalibration(nextPoints);
        return;
      }

      setDraftGeometry({
        tool: "calibrate",
        points: nextPoints,
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

      if (!appendMeasurementId) {
        setSelection(null);
      }
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

      if (!appendMeasurementId) {
        setSelection(null);
      }
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

      if (appendMeasurementId) {
        submitAppendCountItem(appendMeasurementId, documentPoint);
        setSelection({ type: "measurement", measurementId: appendMeasurementId });
        return;
      }

      setSelection(null);
      setHoverState((current) => ({
        ...current,
        documentPoint: null,
        hitTarget: null,
      }));
      submitCount(documentPoint);
      return;
    }

    setSelection(null);
  }

  function handleCanvasDoubleClick() {
    const currentDraftGeometry = draftGeometryRef.current;

    if (currentDraftGeometry.tool === "polyline" && currentDraftGeometry.points.length >= 2) {
      finishMeasurementDraft("polyline", currentDraftGeometry.points);
      return;
    }

    if (currentDraftGeometry.tool === "area" && currentDraftGeometry.points.length >= 3) {
      finishMeasurementDraft("area", currentDraftGeometry.points);
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
            editingChildId:
              interaction.kind === "edit" && interaction.target.type === "measurement-point"
                ? interaction.target.childId
                : undefined,
            editingChildKind:
              interaction.kind === "edit" && interaction.target.type === "measurement-point"
                ? interaction.target.childKind
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
        appendSaveTargetMeasurementIdRef.current = null;
        setAppendMeasurementId(null);
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

      const target = interaction.target;
      if (target.type !== "measurement-point") {
        return;
      }

      const measurementId = target.measurementId;
      setAppendMeasurementId((current) => {
        const nextValue = current === measurementId ? current : null;
        appendSaveTargetMeasurementIdRef.current = nextValue;
        return nextValue;
      });
      setSelection({ type: "measurement", measurementId });
      setSelectedChild(
        target.childId && target.childKind
          ? {
              measurementId,
              childId: target.childId,
              kind: target.childKind,
            }
          : null
      );
      setMeasurementPointOverrides((currentOverrides) => {
        const measurement = savedMeasurements.find((item) => item.id === measurementId);
        if (!measurement) {
          return currentOverrides;
        }
        const overrideKey = getMeasurementGeometryOverrideKey(
          measurementId,
          target.childId && target.childKind
            ? {
                kind: target.childKind,
                childId: target.childId,
              }
            : undefined
        );
        const sourcePoints =
          target.childKind === "area-shape"
            ? measurement.areaShapes.find((shape) => shape.id === target.childId)?.documentPoints ?? measurement.documentPoints
            : target.childKind === "line-path"
              ? measurement.linePaths.find((path) => path.id === target.childId)?.documentPoints ?? measurement.documentPoints
              : measurement.documentPoints;
        const nextPoints = [...(currentOverrides[overrideKey] ?? sourcePoints)];
        nextPoints[target.pointIndex] = resolvedPoint;
        return {
          ...currentOverrides,
          [overrideKey]: nextPoints,
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
        appendSaveTargetMeasurementIdRef.current = null;
        setAppendMeasurementId(null);
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
        setAppendMeasurementId((current) => {
          const nextValue = current === measurementId ? current : null;
          appendSaveTargetMeasurementIdRef.current = nextValue;
          return nextValue;
        });
        setSelection({ type: "measurement", measurementId });
        setSelectedChild(
          interaction.hitTarget.childId && interaction.hitTarget.childKind
            ? {
                measurementId,
                childId: interaction.hitTarget.childId,
                kind: interaction.hitTarget.childKind,
              }
            : null
        );
        setToolMode("select");
        return;
      }

      handleCanvasClick(resolvedDocumentPoint);
      return;
    }

    if (interaction.kind === "edit" && interaction.dirty) {
      if (interaction.target.type === "measurement-point") {
        const overrideKey = getMeasurementGeometryOverrideKey(
          interaction.target.measurementId,
          interaction.target.childId && interaction.target.childKind
            ? {
                kind: interaction.target.childKind,
                childId: interaction.target.childId,
              }
            : undefined
        );
        const points = measurementPointOverrides[overrideKey];
        if (points && points.length >= 2) {
          submitMeasurementUpdate({
            measurementId: interaction.target.measurementId,
            childId: interaction.target.childId,
            childKind: interaction.target.childKind,
            points,
          });
        }
      }
    }
  }

  const isSelectedMeasurementId = useCallback(
    (measurementId: string) => selection?.type === "measurement" && selection.measurementId === measurementId,
    [selection]
  );
  const isSelectedChildPart = useCallback(
    (measurementId: string, kind: MeasurementChildKind, childId: string) =>
      selectedMeasurementChild?.measurementId === measurementId &&
      selectedMeasurementChild.kind === kind &&
      selectedMeasurementChild.childId === childId,
    [selectedMeasurementChild]
  );
  const isHoveredChildPart = useCallback(
    (measurementId: string, kind: MeasurementChildKind, childId: string) =>
      (hoverState.hitTarget?.type === "measurement-point" || hoverState.hitTarget?.type === "measurement-segment") &&
      hoverState.hitTarget.measurementId === measurementId &&
      hoverState.hitTarget.childKind === kind &&
      hoverState.hitTarget.childId === childId,
    [hoverState.hitTarget]
  );

  const showUnavailableState = !pdfUrl || loadState === "error";
  const isPdfVisualReady = loadState === "ready" && pageProxy !== null && isPageBitmapReady;
  const canvasCursor =
    isDragging
      ? "cursor-grabbing"
      : toolMode === "area" && activeAppendMeasurementId !== null && appendAreaMode === "deduction"
        ? "cursor-cell"
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
      ? "Click two known points on the drawing to set the page scale."
      : activeAppendMeasurementId
        ? toolMode === "count"
          ? "Adding to existing count — click to place"
          : toolMode === "area" && appendAreaMode === "deduction"
            ? "Adding deduction to existing measurement — press Enter to finish"
            : "Adding to existing measurement — press Enter to finish"
        : selectedMeasurementChild && (selectedMeasurementChild.kind === "area-shape" || selectedMeasurementChild.kind === "line-path")
          ? "Selected child part highlighted. Drag its vertices to edit or press Delete to remove only that part."
        : selection?.type === "measurement"
        ? "Select a child part on the markup to edit or delete it independently. Parent details stay on the summary item."
        : toolMode === "polyline"
          ? "Click points, then double-click or press Enter to finish"
          : toolMode === "area"
            ? "Click corners, then close the shape, double-click, or press Enter to finish"
            : toolMode === "distance"
              ? "Click two points to save"
                : toolMode === "count"
                  ? "Click to place count"
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
        label: activeAppendMeasurementId ? "Save Added Polyline" : "Save Polyline",
        disabled:
          draftGeometry.tool !== "polyline" ||
          draftGeometry.points.length < 2 ||
          (activeAppendMeasurementId !== null && !draftGeometry.hasChanges) ||
          isSaving,
        onSave: () => finishMeasurementDraft("polyline", draftGeometry.points),
      };
    }

    if (toolMode === "area") {
      return {
        label: activeAppendMeasurementId ? (appendAreaMode === "deduction" ? "Save Deduction" : "Save Added Area") : "Save Area",
        disabled:
          draftGeometry.tool !== "area" ||
          draftGeometry.points.length < 3 ||
          (activeAppendMeasurementId !== null && !draftGeometry.hasChanges) ||
          isSaving,
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
  const calibrationStatusConfig = hasUnsavedCalibrationChanges
    ? {
        label: "Draft",
        toneClassName: "border-[#FDBA74] bg-[#FFF7ED] text-[#C2410C]",
        helperText: localActiveCalibration
          ? `${localActiveCalibration.name} • ${localActiveCalibration.reference_length_input} ${localActiveCalibration.display_unit}`
          : "Place two known points to set the page scale.",
      }
    : localActiveCalibration
      ? {
          label: "Calibrated",
          toneClassName: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
          helperText: `${localActiveCalibration.name} • ${localActiveCalibration.reference_length_input} ${localActiveCalibration.display_unit}`,
        }
      : {
          label: "Unset",
          toneClassName: "border-[#E2E8F1] bg-white text-[#64748B]",
          helperText: "Place two known points to set the page scale.",
        };
  return (
    <>
      <div className="flex h-full min-h-0 w-full bg-[#FBFEFE] p-4">
      <MeasureEditorSidebar
        isCollapsed={isSidebarCollapsed}
        footer={
          <MeasureSidebarFooter
            backHref={exitHref}
            onCancel={cancelCurrentInteraction}
          />
        }
      >
        <div className="min-h-full px-4 py-4">
          <div className="space-y-5">
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#334155]">
                Takeoff
              </p>
              <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-slate-900">Summary</h1>
            </div>

            <section className="min-w-0 overflow-hidden rounded-[14px] border border-slate-200 bg-white">
              {savedMeasurements.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {savedMeasurements.map((measurement) => {
                    const isAppending = appendMeasurementId === measurement.id;
                    const isSelected = selection?.type === "measurement" && selection.measurementId === measurement.id;

                    return (
                      <div
                        key={measurement.renderKey}
                        className={`${
                          isAppending ? "bg-[#FFF7ED]" : isSelected ? "bg-[#F8FAFC]" : "bg-white"
                        } transition-colors`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSummaryMeasurementClick(measurement.id)}
                          onContextMenu={(event) => handleSummaryMeasurementContextMenu(event, measurement)}
                          className={`flex w-full items-center justify-between gap-4 px-5 py-[18px] text-left transition-colors ${
                            isAppending
                              ? "hover:bg-[#FFEDD5]"
                              : isSelected
                                ? "hover:bg-[#F1F5F9]"
                                : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="min-w-0 flex-1 py-0.5">
                            <div className="flex items-center gap-3">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: measurement.color }}
                                aria-label={`${getTakeoffSummaryDescription(measurement)} colour`}
                                title={measurement.color}
                              />
                              <span className={`${ibmPlexSans.className} truncate text-sm font-medium text-slate-800`}>
                                {getTakeoffSummaryDescription(measurement)}
                              </span>
                            </div>
                            {isAppending ? (
                              <p className="mt-1.5 pl-[20px] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#C2410C]">
                                Adding
                              </p>
                            ) : isSelected ? (
                              <p className="mt-1.5 pl-[20px] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                                {selectedMeasurementChild?.measurementId === measurement.id ? "Child Selected" : "Selected"}
                              </p>
                            ) : null}
                          </div>

                          <div className="min-w-0 shrink-0 py-0.5 text-right">
                            <p className={`${ibmPlexSans.className} text-sm font-semibold text-slate-900`}>
                              {measurement.label}
                            </p>
                            {measurement.measurementKind === "area" && measurementsShowingPerimeter.has(measurement.id) ? (
                              <p className="mt-1.5 text-[11px] font-semibold text-[#64748B]">
                                {getAreaPerimeterLabel(measurement) ?? "Perimeter unavailable"}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-6 text-center text-sm font-medium text-[#4B5D79]">
                  No takeoff items saved yet.
                </div>
              )}
            </section>
          </div>
          {summaryContextMenu ? (
            <div
              className="fixed z-40 min-w-[11rem] rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
              style={{ left: `${summaryContextMenu.x}px`, top: `${summaryContextMenu.y}px` }}
              onPointerDown={stopViewerEventPropagation}
              onClick={stopViewerEventPropagation}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                onClick={() => {
                  setSummaryMeasurementEdit({
                    measurementId: summaryContextMenu.measurementId,
                    x: summaryContextMenu.x + 12,
                    y: summaryContextMenu.y + 12,
                    name: summaryContextMenu.measurementName,
                    description: summaryContextMenu.measurementDescription,
                    colorHex: summaryContextMenu.measurementColor,
                  });
                  setSummaryContextMenu(null);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                onClick={() => {
                  setHiddenFromExportLegendMeasurementIds((current) => {
                    const next = new Set(current);
                    if (summaryContextMenu.isHiddenFromExportLegend) {
                      next.delete(summaryContextMenu.measurementId);
                    } else {
                      next.add(summaryContextMenu.measurementId);
                    }
                    return next;
                  });
                  setSummaryContextMenu(null);
                }}
              >
                <span className="flex items-center gap-2">
                  <Lightbulb
                    className={`h-4 w-4 ${
                      summaryContextMenu.isHiddenFromExportLegend ? "text-[#94A3B8]" : "text-[#F59E0B]"
                    }`}
                  />
                  <span>
                    {summaryContextMenu.isHiddenFromExportLegend ? "Show in PDF export" : "Hide from PDF export"}
                  </span>
                </span>
              </button>
              {summaryContextMenu.canAddDeduction ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                  onClick={() => handleAddDeduction(summaryContextMenu.measurementId)}
                >
                  Add deduction
                </button>
              ) : null}
              {summaryContextMenu.measurementKind === "area" ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                onClick={() => {
                  setMeasurementsShowingPerimeter((current) => {
                    const next = new Set(current);
                    if (next.has(summaryContextMenu.measurementId)) {
                      next.delete(summaryContextMenu.measurementId);
                    } else {
                      next.add(summaryContextMenu.measurementId);
                    }
                    return next;
                  });
                  setSummaryContextMenu(null);
                }}
              >
                {measurementsShowingPerimeter.has(summaryContextMenu.measurementId) ? "Hide perimeter" : "Show perimeter"}
              </button>
              ) : null}
            </div>
          ) : null}
          {summaryMeasurementEdit ? (
            <div
              className="fixed z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
              style={{ left: `${summaryMeasurementEdit.x}px`, top: `${summaryMeasurementEdit.y}px` }}
              onPointerDown={stopViewerEventPropagation}
              onClick={stopViewerEventPropagation}
              onDoubleClick={stopViewerEventPropagation}
              onWheel={stopViewerEventPropagation}
            >
              <div className="space-y-3.5 px-5 pb-4 pt-5">
                <div>
                  <p className="text-[14px] font-semibold text-[#0F172A]">Edit measurement</p>
                  <p className="mt-1 text-[12px] text-[#64748B]">Update the saved name, description and colour for this takeoff item.</p>
                </div>
                <div>
                  <label htmlFor="summary-measurement-name" className={labelClassName}>
                    Name <span className="text-[#FF4C14]">*</span>
                  </label>
                  <Input
                    id="summary-measurement-name"
                    value={summaryMeasurementEdit.name}
                    disabled={isSummaryMeasurementEditSaving}
                    onChange={(event) =>
                      setSummaryMeasurementEdit((current) =>
                        current
                          ? {
                              ...current,
                              name: event.target.value,
                            }
                          : current
                      )
                    }
                    className={inputClassName}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="summary-measurement-description" className={labelClassName}>
                    Description
                  </label>
                  <textarea
                    id="summary-measurement-description"
                    rows={2}
                    value={summaryMeasurementEdit.description}
                    disabled={isSummaryMeasurementEditSaving}
                    onChange={(event) =>
                      setSummaryMeasurementEdit((current) =>
                        current
                          ? {
                              ...current,
                              description: event.target.value,
                            }
                          : current
                      )
                    }
                    placeholder="Add description"
                    className={`${inputClassName} h-auto min-h-[4.75rem] resize-none py-2.5 leading-[1.5]`}
                  />
                </div>
                <div>
                  <label className={labelClassName}>Colour</label>
                  <MeasurementColorSelector
                    value={summaryMeasurementEdit.colorHex}
                    disabled={isSummaryMeasurementEditSaving}
                    onChange={(hex) => {
                      setSummaryMeasurementEdit((current) =>
                        current
                          ? {
                              ...current,
                              colorHex: hex,
                            }
                          : current
                      );
                    }}
                    options={measurementColorOptions}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#E2E8F1] bg-white px-5 py-4">
                <button
                  type="button"
                  disabled={isSummaryMeasurementEditSaving}
                  onClick={() => setSummaryMeasurementEdit(null)}
                  className={secondaryButtonClassName}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitSummaryMeasurementEdit}
                  disabled={!hasSummaryMeasurementEditChanges || isSaving || isSummaryMeasurementEditSaving}
                  className={primaryButtonClassName}
                >
                  {isSummaryMeasurementEditSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </MeasureEditorSidebar>

      <MeasureCanvasViewport>
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          aria-controls="takeoff-measure-sidebar"
          aria-expanded={!isSidebarCollapsed}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute left-0 top-1/2 z-30 inline-flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#CBD5E1] bg-white/94 text-[#334155] shadow-[0_10px_28px_rgba(15,23,42,0.10)] backdrop-blur-sm transition-colors hover:bg-white"
        >
          <span className={`inline-flex translate-x-[5px] items-center justify-center ${isSidebarCollapsed ? "rotate-180" : ""}`}>
            <ArrowLeft className="h-4 w-4 shrink-0 text-[#1E293B]" strokeWidth={2.2} />
          </span>
        </button>
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
              onContextMenu={handleCanvasContextMenu}
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
                    className={`absolute inset-0 block h-full w-full select-none rounded-[6px] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.16)] transition-opacity ${
                      isPdfVisualReady ? "opacity-100" : "opacity-0"
                    }`}
                  />

                  {isPdfVisualReady ? (
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

                    {canvasVisibleMeasurements.map((measurement) => (
                      <g key={measurement.renderKey}>
                        {measurement.measurementKind === "count" ? (
                          measurement.documentPoints.length > 0 ? (
                            <>
                              {measurement.documentPoints.map((point, index) => {
                                const pointId = measurement.countPointIds[index] ?? `${measurement.id}:count:${index}`;

                                return (
                                  <circle
                                    key={pointId}
                                    cx={point.x}
                                    cy={point.y}
                                    r={
                                      activeAppendMeasurementId === measurement.id
                                        ? "11"
                                        : selection?.type === "measurement" && selection.measurementId === measurement.id
                                          ? "10"
                                          : hoverState.hitTarget?.type === "measurement-point" &&
                                              hoverState.hitTarget.measurementId === measurement.id &&
                                              hoverState.hitTarget.pointIndex === index
                                            ? "9"
                                            : "8"
                                    }
                                    fill={
                                      activeAppendMeasurementId === measurement.id
                                        ? "#C2410C"
                                        : selection?.type === "measurement" && selection.measurementId === measurement.id
                                          ? "#1D4ED8"
                                          : measurement.color
                                    }
                                    stroke="#ffffff"
                                    strokeWidth="2.5"
                                    vectorEffect="non-scaling-stroke"
                                  />
                                );
                              })}
                            </>
                          ) : null
                        ) : measurement.measurementKind === "area" ? (
                          <>
                            {(() => {
                              const includeShapes = measurement.areaShapes.filter((shape) => shape.role === "include");
                              const shouldPreviewDeductionCutout =
                                activeAppendMeasurementId === measurement.id &&
                                areaDraftPreview?.role === "deduction" &&
                                areaDraftPreview.points.length >= 3;
                              const cutoutShapes = includeShapes.length > 0 ? measurement.areaShapes : includeShapes;
                              const effectiveCutoutShapes = shouldPreviewDeductionCutout
                                ? [
                                    ...cutoutShapes,
                                    {
                                      documentPoints: areaDraftPreview.points,
                                    },
                                  ]
                                : cutoutShapes;
                              const cutoutPath = buildAreaCutoutSvgPath(effectiveCutoutShapes);

                              return cutoutPath ? (
                                <path
                                  d={cutoutPath}
                                  fill={getViewerAreaShapeFillColor({
                                    measurementColor: measurement.color,
                                    isAppendTarget: activeAppendMeasurementId === measurement.id,
                                    isSelectedMeasurement: isSelectedMeasurementId(measurement.id),
                                  })}
                                  fillRule="evenodd"
                                  vectorEffect="non-scaling-stroke"
                                />
                              ) : null;
                            })()}
                            {measurement.areaShapes
                              .filter((shape) => shape.role === "include")
                              .map((shape) => (
                                <polygon
                                  key={shape.id}
                                  points={shape.path}
                                  fill="none"
                                  stroke={
                                    activeAppendMeasurementId === measurement.id
                                      ? "#C2410C"
                                      : isSelectedChildPart(measurement.id, "area-shape", shape.id)
                                        ? "#C2410C"
                                      : isSelectedMeasurementId(measurement.id)
                                        ? "#EA580C"
                                      : isHoveredChildPart(measurement.id, "area-shape", shape.id)
                                        ? "#FB923C"
                                        : measurement.color
                                  }
                                  strokeWidth={
                                    activeAppendMeasurementId === measurement.id
                                      ? "3.25"
                                      : isSelectedChildPart(measurement.id, "area-shape", shape.id)
                                        ? "3.5"
                                      : isSelectedMeasurementId(measurement.id)
                                        ? "3.25"
                                        : "2.75"
                                  }
                                  vectorEffect="non-scaling-stroke"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              ))}
                            {measurement.areaShapes
                              .filter((shape) => shape.role === "deduction")
                              .map((shape) => {
                                const isHoveredDeduction = isHoveredChildPart(measurement.id, "area-shape", shape.id);
                                const isSelectedDeduction = isSelectedChildPart(measurement.id, "area-shape", shape.id);

                                return (
                                  <polygon
                                    key={shape.id}
                                    points={shape.path}
                                    fill="none"
                                    stroke={measurement.color}
                                    strokeOpacity={isSelectedDeduction ? "1" : "0.75"}
                                    strokeWidth={isSelectedDeduction ? "2.5" : isHoveredDeduction ? "2" : "1.5"}
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                );
                              })}
                          </>
                        ) : (
                          (measurement.linePaths.length > 0
                            ? measurement.linePaths
                            : [{ id: `${measurement.id}:line`, path: measurement.path, documentPoints: measurement.documentPoints }]).map((path) => (
                            <polyline
                              key={path.id}
                              points={path.path}
                              fill="none"
                              stroke={
                                activeAppendMeasurementId === measurement.id
                                  ? "#C2410C"
                                  : isSelectedChildPart(measurement.id, "line-path", path.id)
                                    ? "#C2410C"
                                  : isSelectedMeasurementId(measurement.id)
                                  ? "#EA580C"
                                  : isHoveredChildPart(measurement.id, "line-path", path.id)
                                    ? "#FB923C"
                                    : measurement.color
                              }
                              strokeWidth={
                                activeAppendMeasurementId === measurement.id
                                  ? "4"
                                  : isSelectedChildPart(measurement.id, "line-path", path.id)
                                    ? "3.75"
                                  : isSelectedMeasurementId(measurement.id)
                                    ? "3.25"
                                    : "2.75"
                              }
                              strokeDasharray={activeAppendMeasurementId === measurement.id ? "10 6" : undefined}
                              vectorEffect="non-scaling-stroke"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ))
                        )}
                      </g>
                    ))}

                    {distanceDraftPreview ? (
                      <g>
                        <polyline
                          points={distanceDraftPreview.path}
                          fill="none"
                          stroke={distanceDraftPreview.color}
                          strokeWidth="2.5"
                          strokeDasharray="8 6"
                          vectorEffect="non-scaling-stroke"
                          strokeLinecap="round"
                        />
                      </g>
                    ) : null}

                    {polylineDraftPreview ? (
                      <g>
                        <polyline
                          points={polylineDraftPreview.path}
                          fill="none"
                          stroke={polylineDraftPreview.color}
                          strokeWidth="2.5"
                          strokeDasharray="8 6"
                          vectorEffect="non-scaling-stroke"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    ) : null}

                    {areaDraftPreview ? (
                      <g>
                        {areaDraftPreview.points.length >= 2 ? (
                          <polygon
                            points={areaDraftPreview.path}
                            fill={
                              areaDraftPreview.role === "deduction"
                                ? hexToRgba(areaDraftPreview.color, 0.05)
                                : hexToRgba(areaDraftPreview.color, 0.12)
                            }
                            stroke={areaDraftPreview.role === "deduction" ? "#9A3412" : areaDraftPreview.color}
                            strokeWidth="2.5"
                            strokeDasharray={areaDraftPreview.role === "deduction" ? "4 4" : "8 6"}
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                          />
                        ) : null}
                      </g>
                    ) : null}

                    {countDraftPreview ? (
                      <g>
                        <circle cx={countDraftPreview.point.x} cy={countDraftPreview.point.y} r="8" fill={countDraftPreview.color} fillOpacity="0.88" stroke="#ffffff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
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
                  ) : null}

                  {isPdfVisualReady ? (
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

                    {canvasVisibleMeasurements.map((measurement) => {
                      if (!measurement.labelAnchor) {
                        return null;
                      }

                      const labelPoint = transform.documentPointToCommittedStagePoint(measurement.labelAnchor);
                      const isAppendTarget = activeAppendMeasurementId === measurement.id;
                      const isSelected = isAppendTarget || (selection?.type === "measurement" && selection.measurementId === measurement.id);
                      const isSelectedChild = selectedMeasurementChild?.measurementId === measurement.id;
                      const hoveredHitTarget = hoverState.hitTarget;
                      const isHovered =
                        hoveredHitTarget !== null &&
                        "measurementId" in hoveredHitTarget &&
                        hoveredHitTarget.measurementId === measurement.id;
                      const isEditing =
                        interactionRef.current.kind === "edit" &&
                        interactionRef.current.target.type === "measurement-point" &&
                        interactionRef.current.target.measurementId === measurement.id;
                      const shouldShowLabel = isAppendTarget || isSelected || isSelectedChild || isHovered || isEditing;

                      if (!shouldShowLabel) {
                        return null;
                      }

                      return (
                        <div
                          key={`${measurement.renderKey}-label`}
                          className={`absolute max-w-[15rem] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-sm ${
                            isAppendTarget
                              ? "border-[#FDBA74] bg-[#FFF7ED]"
                              : isSelected
                              ? "border-[#FED7AA] bg-[#FFF7ED]"
                              : isHovered
                                ? "border-[#FDE68A] bg-[#FFFBEB]"
                                : "border-white/85 bg-white/96"
                          }`}
                          style={{
                            color: isAppendTarget ? "#C2410C" : isSelected ? "#C2410C" : isHovered ? "#92400E" : "#334155",
                            left: `${labelPoint.x}px`,
                            top: `${labelPoint.y + getMeasurementLabelTopOffset({
                              isSelected,
                              isHovered,
                              measurementKind: measurement.measurementKind,
                            })}px`,
                          }}
                        >
                          {isAppendTarget ? "Adding • " : ""}{measurement.name} • {measurement.label}
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

                    {activeAppendMeasurementId ? (
                      <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full border border-[#FDBA74] bg-[#FFF7ED]/96 px-3 py-1.5 text-[11px] font-semibold text-[#C2410C] shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-sm">
                        {helperMessage}
                      </div>
                    ) : null}
                  </div>
                  ) : null}
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
                    calibrate: Boolean(localActiveCalibration),
                    distance: !effectiveMeasurementReadiness.canCreateLine,
                    polyline: !effectiveMeasurementReadiness.canCreateLine,
                    area: !effectiveMeasurementReadiness.canCreateArea,
                    count: !effectiveMeasurementReadiness.canCreateCount,
                  }}
                  onSelectTool={handleToolbarToolSelect}
                />
              </div>

              <div
                className="absolute right-5 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2 rounded-[28px] border border-white/75 bg-white/92 px-2 py-2 shadow-[0_12px_34px_rgba(15,23,42,0.10)] backdrop-blur-sm"
                onPointerDown={stopViewerEventPropagation}
                onClick={stopViewerEventPropagation}
                onDoubleClick={stopViewerEventPropagation}
                onWheel={stopViewerEventPropagation}
              >
                <div className="relative flex items-center">
                  {isSettingsOpen ? (
                    <div
                      ref={settingsCardRef}
                      className="absolute right-[calc(100%+12px)] top-0 z-30 w-[220px] rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                      onPointerDown={stopViewerEventPropagation}
                      onClick={stopViewerEventPropagation}
                      onDoubleClick={stopViewerEventPropagation}
                      onWheel={stopViewerEventPropagation}
                    >
                      <div className="space-y-3 px-5 pb-4 pt-5">
                        <div>
                          <p className="text-[14px] font-semibold text-[#0F172A]">Settings</p>
                          <p className="mt-1 text-[12px] text-[#64748B]">Quick actions for this takeoff page.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleExportPdf}
                          disabled={!pdfUrl || isExportingPdf}
                          className={`inline-flex h-10 w-full items-center justify-center rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                            !pdfUrl || isExportingPdf
                              ? "border-[#E2E8F1] bg-white text-[#94A3B8]"
                              : "border-[#D7E0EA] bg-white text-[#334155] hover:bg-[#F8FAFC]"
                          }`}
                        >
                          {isExportingPdf ? "Exporting..." : "Export PDF"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <button
                    ref={settingsButtonRef}
                    type="button"
                    onClick={() => setIsSettingsOpen((current) => !current)}
                    aria-label="Open settings"
                    aria-expanded={isSettingsOpen}
                    aria-haspopup="dialog"
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-[#334155] transition-colors ${
                      isSettingsOpen
                        ? "border-[#D7E0EA] bg-[#F8FAFC]"
                        : "border-[#D7E0EA] bg-white hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <Settings2 className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </div>
                <div className="py-1">
                  <div className="h-px w-5 rounded-full bg-[#E2E8F1]" aria-hidden="true" />
                </div>
                <div className="flex flex-col items-center gap-2">
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
                    onClick={() => zoomByStep(1)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E0EA] bg-white text-[18px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
                <div className="py-1">
                  <div className="h-px w-5 rounded-full bg-[#E2E8F1]" aria-hidden="true" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (previousPageId) {
                        onPageChange(previousPageId);
                      }
                    }}
                    disabled={!previousPageId}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-[#334155] transition-colors ${
                      previousPageId
                        ? "border-[#D7E0EA] bg-white hover:bg-[#F8FAFC]"
                        : "border-[#E2E8F1] bg-white text-[#94A3B8]"
                    }`}
                    aria-label="Previous page"
                  >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (nextPageId) {
                        onPageChange(nextPageId);
                      }
                    }}
                    disabled={!nextPageId}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-[#334155] transition-colors ${
                      nextPageId
                        ? "border-[#D7E0EA] bg-white hover:bg-[#F8FAFC]"
                        : "border-[#E2E8F1] bg-white text-[#94A3B8]"
                    }`}
                    aria-label="Next page"
                  >
                    <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4"
          style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
          onPointerDown={stopViewerEventPropagation}
          onClick={stopViewerEventPropagation}
          onDoubleClick={stopViewerEventPropagation}
          onWheel={stopViewerEventPropagation}
        >
          <div className="pointer-events-auto w-full max-w-[400px]">
            <TakeoffMeasureToolDialog
              open={isToolDialogOpen}
              tool={activeSetupTool}
              initialValues={toolSetup}
              onOpenChange={handleToolDialogOpenChange}
              onConfirm={handleToolSetupConfirm}
            />
          </div>
        </div>
      </MeasureCanvasViewport>
      </div>
    </>
  );
}
