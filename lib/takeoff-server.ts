import { assertJsonValue } from "@/lib/json-contract";
import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { PROJECT_DRAWING_SETS_BUCKET, toTakeoffPagePreviewStoragePath } from "@/lib/drawing-sets";
import { getCurrentOrganizationMember, getProjectDrawingSetsForCurrentUser } from "@/lib/projects-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import {
  buildTakeoffIntelligenceEvent,
  logTakeoffIntelligenceDebug,
  logTakeoffIntelligenceFailure,
  summarizeTakeoffCalibration,
  summarizeTakeoffMeasurement,
  writeTakeoffCorrectionEvent,
  writeTakeoffIntelligenceEvent,
} from "@/lib/takeoff-intelligence";
import { resolveTakeoffMeasurementStatusTransition } from "@/lib/takeoff/measurement-lifecycle";
import type { TakeoffDrawingSetSummaryMeasurement } from "@/lib/takeoff/measurement-summary";
import { getAuthorizedTakeoffContext, resolveAuthorizedTakeoffContext } from "@/lib/takeoff-owner-server";
import { parseTakeoffOwnerKey, type TakeoffRouteOwner } from "@/lib/takeoff/owner";
import {
  DEFAULT_TAKEOFF_PAGE_PREPARATION_MAX_BYTES,
  DEFAULT_TAKEOFF_PAGE_PREPARATION_MAX_PAGES,
  validateTakeoffPdfPreparationBounds,
} from "@/lib/takeoff/page-preparation";
import {
  assertTakeoffUnitConsistency,
  convertTakeoffBaseAreaToDisplay,
  convertTakeoffBaseLengthToDisplay,
  convertTakeoffDisplayLengthToBase,
  getTakeoffBaseUnit,
  isTakeoffDisplayUnit,
  type TakeoffBaseUnit,
  type TakeoffDisplayUnit,
  type TakeoffUnitSystem,
} from "@/lib/takeoff/units";

const takeoffPageSelect =
  "id, organization_id, project_id, opportunity_id, drawing_set_id, page_number, page_label, page_width_pts, page_height_pts, rotation_degrees, source_revision, preview_storage_path, preview_status, preview_error, preview_generated_at, preview_render_version, preview_width_px, preview_height_px, preview_mime_type, preview_bytes, metadata, created_by, created_at, updated_at";
const takeoffCalibrationSelect =
  "id, organization_id, project_id, opportunity_id, page_id, name, scale_ratio, unit_system, base_unit, display_unit, reference_length_input, reference_length_base, point_a_x, point_a_y, point_b_x, point_b_y, is_active, superseded_by, notes, metadata, created_by, created_at, updated_at";
const takeoffMeasurementSelect =
  "id, organization_id, project_id, opportunity_id, drawing_set_id, page_id, calibration_id, group_id, measurement_kind, status, source, name, description, color_hex, quantity, count_value, measured_length_base, measured_area_base, measured_perimeter_base, display_value, display_unit, page_bbox_min_x, page_bbox_min_y, page_bbox_max_x, page_bbox_max_y, ai_confidence, ai_model, ai_run_id, external_ref, metadata, version, created_by, updated_by, archived_by, created_at, updated_at, archived_at";
const takeoffViewerMeasurementSelect =
  "id, drawing_set_id, page_id, calibration_id, group_id, measurement_kind, status, source, name, description, color_hex, quantity, count_value, measured_length_base, measured_area_base, measured_perimeter_base, display_value, display_unit, page_bbox_min_x, page_bbox_min_y, page_bbox_max_x, page_bbox_max_y, metadata, version, created_at, updated_at";
const takeoffDrawingSetSummaryMeasurementSelect =
  "id, page_id, measurement_kind, status, name, color_hex, display_value, display_unit, created_at, page:takeoff_pages!inner(page_number, page_label)";
const takeoffMeasurementPointSelect =
  "id, organization_id, measurement_id, point_order, x, y, created_at";
const takeoffMeasurementAreaShapeSelect =
  "id, organization_id, measurement_id, shape_order, measured_area_base, measured_perimeter_base, page_bbox_min_x, page_bbox_min_y, page_bbox_max_x, page_bbox_max_y, created_at, updated_at";
const takeoffMeasurementAreaShapePointSelect =
  "id, organization_id, area_shape_id, point_order, x, y, created_at";
const takeoffMeasurementLinePathSelect =
  "id, organization_id, measurement_id, path_order, measured_length_base, page_bbox_min_x, page_bbox_min_y, page_bbox_max_x, page_bbox_max_y, created_at, updated_at";
const takeoffMeasurementLinePathPointSelect =
  "id, organization_id, line_path_id, point_order, x, y, created_at";
const takeoffMeasurementGroupSelect =
  "id, organization_id, project_id, opportunity_id, parent_group_id, name, code, color_hex, sort_order, status, trade_id, trade_label, metadata, created_by, created_at, updated_at";
const projectDrawingSetSelect =
  "id, organization_id, project_id, uploaded_by, file_name, display_name, sort_order, archived_at, archived_by, source_type, source_revision, storage_path, file_size_bytes, mime_type, uploaded_at, created_at, updated_at";
export const TAKEOFF_PREVIEW_RENDER_VERSION = "swift-pdfkit-v4";
export const TAKEOFF_PAGE_METADATA_RENDER_VERSION = "pdf-lib-metadata-v1";
const TAKEOFF_PREVIEW_TARGET_PIXELS_PER_POINT = 3;
const TAKEOFF_PREVIEW_MAX_EDGE_PX = 6144;
const configuredPreparationMaxBytes = Number(process.env.TAKEOFF_PAGE_PREPARATION_MAX_BYTES);
const configuredPreparationMaxPages = Number(process.env.TAKEOFF_PAGE_PREPARATION_MAX_PAGES);
const TAKEOFF_PAGE_PREPARATION_MAX_BYTES = Number.isFinite(configuredPreparationMaxBytes) && configuredPreparationMaxBytes > 0
  ? configuredPreparationMaxBytes
  : DEFAULT_TAKEOFF_PAGE_PREPARATION_MAX_BYTES;
const TAKEOFF_PAGE_PREPARATION_MAX_PAGES = Number.isFinite(configuredPreparationMaxPages) && configuredPreparationMaxPages > 0
  ? configuredPreparationMaxPages
  : DEFAULT_TAKEOFF_PAGE_PREPARATION_MAX_PAGES;
const execFileAsync = promisify(execFile);

export type TakeoffPage = Database["public"]["Tables"]["takeoff_pages"]["Row"];
export type TakeoffPageSummary = Pick<TakeoffPage,
  "id" | "drawing_set_id" | "page_number" | "page_label" | "page_width_pts" | "page_height_pts" | "rotation_degrees"
>;
export type TakeoffCalibration = Database["public"]["Tables"]["takeoff_calibrations"]["Row"];
export type TakeoffMeasurement = Database["public"]["Tables"]["takeoff_measurements"]["Row"];
export type TakeoffMeasurementPoint = Database["public"]["Tables"]["takeoff_measurement_points"]["Row"];
export type TakeoffMeasurementAreaShape = Database["public"]["Tables"]["takeoff_measurement_area_shapes"]["Row"];
export type TakeoffMeasurementAreaShapePoint = Database["public"]["Tables"]["takeoff_measurement_area_shape_points"]["Row"];
export type TakeoffMeasurementLinePath = Database["public"]["Tables"]["takeoff_measurement_line_paths"]["Row"];
export type TakeoffMeasurementLinePathPoint = Database["public"]["Tables"]["takeoff_measurement_line_path_points"]["Row"];
export type TakeoffMeasurementGroup = Database["public"]["Tables"]["takeoff_measurement_groups"]["Row"];
type OrganizationMember = Awaited<ReturnType<typeof getCurrentOrganizationMember>>;
export type ProjectDrawingSet = Database["public"]["Tables"]["project_drawing_sets"]["Row"];
export type TakeoffDrawingPreparationStatus = "ready" | "preparing" | "failed";
export type TakeoffDrawingTab = {
  drawingSetId: string;
  displayName: string;
  sourceFilename: string;
  sortOrder: number;
  status: TakeoffDrawingPreparationStatus;
  uploadedAt: string;
  updatedAt: string;
};
export type TakeoffRenderJob = Database["public"]["Tables"]["takeoff_render_jobs"]["Row"];
export type { TakeoffUnitSystem } from "@/lib/takeoff/units";
export type TakeoffMeasurementKind = "line" | "area" | "count";
export type TakeoffPreviewStatus = Database["public"]["Tables"]["takeoff_pages"]["Row"]["preview_status"];
export type TakeoffRenderJobStatus = Database["public"]["Tables"]["takeoff_render_jobs"]["Row"]["status"];

function normalizeRotationDegrees(rotationDegrees: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(rotationDegrees) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }

  return 0;
}

function getTakeoffPageDisplayDimensions(params: {
  pageWidthPts: number;
  pageHeightPts: number;
  rotationDegrees: number;
}) {
  const normalizedRotation = normalizeRotationDegrees(params.rotationDegrees);
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;

  return {
    widthPts: isQuarterTurn ? params.pageHeightPts : params.pageWidthPts,
    heightPts: isQuarterTurn ? params.pageWidthPts : params.pageHeightPts,
    rotationDegrees: normalizedRotation,
  };
}

function getTakeoffPageRenderGeometry(page: Pick<TakeoffPage, "page_width_pts" | "page_height_pts" | "rotation_degrees" | "metadata">) {
  const metadata = page.metadata && typeof page.metadata === "object" && !Array.isArray(page.metadata) ? page.metadata : {};
  const rawWidthPts =
    typeof metadata.rawPageWidthPts === "number" && Number.isFinite(metadata.rawPageWidthPts)
      ? Number(metadata.rawPageWidthPts)
      : page.page_width_pts;
  const rawHeightPts =
    typeof metadata.rawPageHeightPts === "number" && Number.isFinite(metadata.rawPageHeightPts)
      ? Number(metadata.rawPageHeightPts)
      : page.page_height_pts;
  const displayDimensions = getTakeoffPageDisplayDimensions({
    pageWidthPts: rawWidthPts,
    pageHeightPts: rawHeightPts,
    rotationDegrees: page.rotation_degrees,
  });

  return {
    rawWidthPts,
    rawHeightPts,
    displayWidthPts: displayDimensions.widthPts,
    displayHeightPts: displayDimensions.heightPts,
    rotationDegrees: displayDimensions.rotationDegrees,
  };
}

class TakeoffWorkerError extends Error {
  stage: string;
  details?: Record<string, unknown>;

  constructor(message: string, params: { stage: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = "TakeoffWorkerError";
    this.stage = params.stage;
    this.details = params.details;
  }
}

export interface SaveTakeoffCalibrationInput {
  opportunitySlug: string;
  drawingSetId: string;
  pageId: string;
  name: string;
  unitSystem: TakeoffUnitSystem;
  displayUnit: string;
  referenceLengthInput: number;
  pointAX: number;
  pointAY: number;
  pointBX: number;
  pointBY: number;
  notes?: string;
}

export interface ResolvedTakeoffOpportunityWorkspace {
  organizationId: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  opportunityId: string | null;
  opportunitySlug: string;
  opportunityName?: string | null;
  routeProjectId?: string;
  conversionMode?: "workspace" | "promoted" | "legacy-reference" | "project";
  canonicalProject?: { id: string; slug: string } | null;
}

export interface TakeoffAuthorizedContext {
  member: NonNullable<OrganizationMember>;
  workspace: ResolvedTakeoffOpportunityWorkspace;
}

function resolvedWorkspaceFromOwnerContext(
  context: NonNullable<Awaited<ReturnType<typeof getAuthorizedTakeoffContext>>>,
): ResolvedTakeoffOpportunityWorkspace {
  return {
    organizationId: context.organizationId,
    projectId: context.dataProjectId,
    projectSlug: context.routeProjectSlug,
    projectName: context.displayName,
    opportunityId: context.lineageOpportunityId,
    opportunitySlug: context.routeOwner.kind === "opportunity" ? context.routeOwner.slug : "",
    opportunityName: context.routeOwner.kind === "opportunity" ? context.displayName : null,
    routeProjectId: context.routeProjectId,
    conversionMode: context.conversionMode,
    canonicalProject: context.canonicalProject,
  };
}

export interface TakeoffMeasurementWithPoints extends TakeoffMeasurement {
  points: TakeoffMeasurementPoint[];
  area_shapes: Array<TakeoffMeasurementAreaShape & {
    points: TakeoffMeasurementAreaShapePoint[];
  }>;
  line_paths: Array<TakeoffMeasurementLinePath & {
    points: TakeoffMeasurementLinePathPoint[];
  }>;
}

export interface TakeoffMeasurementReadiness {
  pageId: string;
  activeCalibrationId: string | null;
  canCreateLine: boolean;
  canCreateArea: boolean;
  canCreateCount: boolean;
  message: string;
}

export interface TakeoffCalibrationHistoryItem extends TakeoffCalibration {
  dependent_measurement_count: number;
}

export interface DeleteTakeoffCalibrationResult {
  deletedCalibrationId: string;
  activeCalibration: TakeoffCalibration | null;
}

export interface TakeoffPointInput {
  x: number;
  y: number;
}

export interface CreateTakeoffMeasurementInput {
  opportunitySlug: string;
  pageId: string;
  measurementKind: TakeoffMeasurementKind;
  name: string;
  description?: string;
  groupId?: string | null;
  colorHex?: string | null;
  points?: TakeoffPointInput[];
  countValue?: number | null;
}

export interface UpdateTakeoffMeasurementGeometryInput {
  opportunitySlug: string;
  measurementId: string;
  points: TakeoffPointInput[];
}

export interface UpdateTakeoffMeasurementChildGeometryInput {
  opportunitySlug: string;
  measurementId: string;
  childId: string;
  childKind: "area-shape" | "line-path";
  points: TakeoffPointInput[];
}

export interface AppendTakeoffAreaShapeInput {
  opportunitySlug: string;
  measurementId: string;
  points: TakeoffPointInput[];
  role?: AreaShapeRole;
}

export interface AppendTakeoffLinePathInput {
  opportunitySlug: string;
  measurementId: string;
  points: TakeoffPointInput[];
}

export interface DeleteTakeoffMeasurementChildInput {
  opportunitySlug: string;
  measurementId: string;
  childId: string;
  childKind: "count-item" | "area-shape" | "line-path";
}

export interface UpdateTakeoffMeasurementDetailsInput {
  opportunitySlug: string;
  measurementId: string;
  name?: string;
  description?: string;
  tag?: string | null;
  colorHex?: string | null;
}

export interface SetActiveTakeoffCalibrationInput {
  opportunitySlug: string;
  drawingSetId: string;
  pageId: string;
  calibrationId: string | null;
}

type TakeoffPerfTrace = {
  step<T>(label: string, work: () => PromiseLike<T>): Promise<T>;
  flush(meta?: Record<string, unknown>): void;
};

function createTakeoffPerfTrace(operation: string): TakeoffPerfTrace {
  const startedAt = Date.now();
  const timings: Record<string, number> = {};

  return {
    async step<T>(label: string, work: () => PromiseLike<T>): Promise<T> {
      const stepStartedAt = Date.now();
      try {
        return await work();
      } finally {
        timings[label] = (timings[label] ?? 0) + (Date.now() - stepStartedAt);
      }
    },
    flush(meta) {
      if (process.env.TAKEOFF_PERF_LOGS !== "1") {
        return;
      }

      console.info("[takeoff-perf]", {
        operation,
        totalMs: Date.now() - startedAt,
        timings,
        ...meta,
      });
    },
  };
}

function normalizeDisplayUnit(unitSystem: TakeoffUnitSystem, rawUnit: string): TakeoffDisplayUnit {
  return assertTakeoffUnitConsistency({ unitSystem, displayUnit: rawUnit });
}

function baseUnitForUnitSystem(unitSystem: TakeoffUnitSystem): TakeoffBaseUnit {
  return getTakeoffBaseUnit(unitSystem);
}

function convertDisplayLengthToBase(params: {
  unitSystem: TakeoffUnitSystem;
  displayUnit: TakeoffDisplayUnit;
  value: number;
}): number {
  const displayUnit = assertTakeoffUnitConsistency(params);
  return convertTakeoffDisplayLengthToBase({ displayUnit, value: params.value });
}

function assertNormalizedCoordinate(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }

  return value;
}

function computeCalibrationScaleRatio(params: {
  page: TakeoffPage;
  pointAX: number;
  pointAY: number;
  pointBX: number;
  pointBY: number;
  referenceLengthBase: number;
}): number {
  const { page, pointAX, pointAY, pointBX, pointBY, referenceLengthBase } = params;
  const widthPts = Number(page.page_width_pts);
  const heightPts = Number(page.page_height_pts);
  const deltaXPts = (pointBX - pointAX) * widthPts;
  const deltaYPts = (pointBY - pointAY) * heightPts;
  const pageDistancePts = Math.sqrt(deltaXPts ** 2 + deltaYPts ** 2);

  if (!Number.isFinite(pageDistancePts) || pageDistancePts <= 0) {
    throw new Error("Calibration points must define a measurable distance.");
  }

  return referenceLengthBase / pageDistancePts;
}

function normalizeOptionalColor(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return null;
  }

  if (!/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(normalized)) {
    throw new Error("Color must be a valid hex value like #F15A29.");
  }

  return normalized;
}

function normalizePoints(points: TakeoffPointInput[] | undefined, minimumPoints: number): TakeoffPointInput[] {
  const normalized = (points ?? []).map((point, index) => ({
    x: assertNormalizedCoordinate(Number(point.x), `Point ${index + 1} X`),
    y: assertNormalizedCoordinate(Number(point.y), `Point ${index + 1} Y`),
  }));

  if (normalized.length < minimumPoints) {
    throw new Error(`At least ${minimumPoints} point${minimumPoints === 1 ? "" : "s"} are required.`);
  }

  return normalized;
}

function computeMeasurementBoundingBox(points: TakeoffPointInput[]): {
  minX: number | null;
  minY: number | null;
  maxX: number | null;
  maxY: number | null;
} {
  if (points.length === 0) {
    return {
      minX: null,
      minY: null,
      maxX: null,
      maxY: null,
    };
  }

  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: points[0].x,
      minY: points[0].y,
      maxX: points[0].x,
      maxY: points[0].y,
    }
  );
}

function combineMeasurementBoundingBoxes(
  boundsList: Array<{
    minX: number | null;
    minY: number | null;
    maxX: number | null;
    maxY: number | null;
  }>
) {
  return boundsList.reduce(
    (combined, bounds) => {
      if (
        bounds.minX === null ||
        bounds.minY === null ||
        bounds.maxX === null ||
        bounds.maxY === null
      ) {
        return combined;
      }

      if (combined.minX === null) {
        return { ...bounds };
      }

      return {
        minX: Math.min(combined.minX, bounds.minX),
        minY: Math.min(combined.minY!, bounds.minY),
        maxX: Math.max(combined.maxX!, bounds.maxX),
        maxY: Math.max(combined.maxY!, bounds.maxY),
      };
    },
    {
      minX: null as number | null,
      minY: null as number | null,
      maxX: null as number | null,
      maxY: null as number | null,
    }
  );
}

async function replaceTakeoffMeasurementPoints(params: {
  organizationId: string;
  measurementId: string;
  points: TakeoffPointInput[];
  supabase: SupabaseClient<Database>;
}) {
  const deleteResult = await params.supabase
    .from("takeoff_measurement_points")
    .delete()
    .eq("measurement_id", params.measurementId);

  if (deleteResult.error) {
    throw new Error(deleteResult.error.message);
  }

  if (params.points.length === 0) {
    return;
  }

  const insertResult = await params.supabase.from("takeoff_measurement_points").insert(
    params.points.map((point, index) => ({
      organization_id: params.organizationId,
      measurement_id: params.measurementId,
      point_order: index,
      x: point.x,
      y: point.y,
    }))
  );

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }
}

async function hydrateTakeoffMeasurementWithChildren(params: {
  measurement: TakeoffMeasurement;
  supabase: SupabaseClient<Database>;
}): Promise<TakeoffMeasurementWithPoints> {
  const { measurement, supabase } = params;
  const points = await getTakeoffMeasurementPointsForMeasurement(measurement.id, { supabase });
  const areaShapes = measurement.measurement_kind === "area"
    ? (await getTakeoffAreaShapesForMeasurements([measurement.id], { supabase }))[measurement.id] ?? []
    : [];
  const linePaths = measurement.measurement_kind === "line"
    ? (await getTakeoffLinePathsForMeasurements([measurement.id], { supabase }))[measurement.id] ?? []
    : [];

  return {
    ...measurement,
    points,
    area_shapes: areaShapes,
    line_paths: linePaths,
  };
}

function convertNormalizedPointToPagePoint(params: {
  page: TakeoffPage;
  point: TakeoffPointInput;
}): { xPts: number; yPts: number } {
  return {
    xPts: Number(params.page.page_width_pts) * params.point.x,
    yPts: Number(params.page.page_height_pts) * params.point.y,
  };
}

function computePolylineLengthPts(page: TakeoffPage, points: TakeoffPointInput[]): number {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = convertNormalizedPointToPagePoint({ page, point: points[index - 1] });
    const current = convertNormalizedPointToPagePoint({ page, point: points[index] });
    length += Math.hypot(current.xPts - previous.xPts, current.yPts - previous.yPts);
  }

  return length;
}

function computePolygonAreaPts(page: TakeoffPage, points: TakeoffPointInput[]): number {
  let areaAccumulator = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = convertNormalizedPointToPagePoint({ page, point: points[index] });
    const next = convertNormalizedPointToPagePoint({
      page,
      point: points[(index + 1) % points.length],
    });
    areaAccumulator += current.xPts * next.yPts - next.xPts * current.yPts;
  }

  return Math.abs(areaAccumulator) / 2;
}

function computePolygonPerimeterPts(page: TakeoffPage, points: TakeoffPointInput[]): number {
  let perimeter = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = convertNormalizedPointToPagePoint({ page, point: points[index] });
    const next = convertNormalizedPointToPagePoint({
      page,
      point: points[(index + 1) % points.length],
    });
    perimeter += Math.hypot(next.xPts - current.xPts, next.yPts - current.yPts);
  }

  return perimeter;
}

function convertBaseLengthToDisplay(params: {
  baseUnit: string;
  displayUnit: string;
  value: number;
}): number {
  if ((params.baseUnit !== "mm" && params.baseUnit !== "in") || !isTakeoffDisplayUnit(params.displayUnit)) {
    throw new Error("Unable to convert measured length to display units.");
  }

  return convertTakeoffBaseLengthToDisplay({
    baseUnit: params.baseUnit,
    displayUnit: params.displayUnit,
    value: params.value,
  });
}

function convertBaseAreaToDisplay(params: {
  baseUnit: string;
  displayUnit: string;
  value: number;
}): number {
  if ((params.baseUnit !== "mm" && params.baseUnit !== "in") || !isTakeoffDisplayUnit(params.displayUnit)) {
    throw new Error("Unable to convert measured area to display units.");
  }

  return convertTakeoffBaseAreaToDisplay({
    baseUnit: params.baseUnit,
    displayUnit: params.displayUnit,
    value: params.value,
  });
}

function getCountItemValueFromMeasurement(params: {
  measurement: Pick<TakeoffMeasurement, "metadata" | "count_value" | "display_value">;
  pointCount: number;
}): number {
  const metadataValue =
    params.measurement.metadata &&
    typeof params.measurement.metadata === "object" &&
    typeof (params.measurement.metadata as Record<string, unknown>).countItemValue === "number"
      ? Number((params.measurement.metadata as Record<string, unknown>).countItemValue)
      : null;
  if (metadataValue !== null && Number.isFinite(metadataValue) && metadataValue > 0) {
    return metadataValue;
  }

  const totalValue = Number(params.measurement.count_value ?? params.measurement.display_value ?? 1);
  if (!Number.isFinite(totalValue) || totalValue <= 0) {
    return 1;
  }

  const safePointCount = Math.max(params.pointCount, 1);
  const derivedValue = totalValue / safePointCount;
  return Number.isFinite(derivedValue) && derivedValue > 0 ? derivedValue : 1;
}

type AreaShapeRole = "include" | "deduction";

function getMeasurementMetadataObject(
  metadata: TakeoffMeasurement["metadata"] | null | undefined
): Record<string, Json | undefined> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...metadata };
}

function getAreaShapeRolesFromMetadata(
  metadata: TakeoffMeasurement["metadata"] | null | undefined
): Record<string, AreaShapeRole> {
  const metadataObject = getMeasurementMetadataObject(metadata);
  const rawRoles = metadataObject.areaShapeRoles;
  if (!rawRoles || typeof rawRoles !== "object" || Array.isArray(rawRoles)) {
    return {};
  }

  return Object.entries(rawRoles).reduce<Record<string, AreaShapeRole>>((accumulator, [shapeId, role]) => {
    accumulator[shapeId] = role === "deduction" ? "deduction" : "include";
    return accumulator;
  }, {});
}

function getAreaShapeRole(
  metadata: TakeoffMeasurement["metadata"] | null | undefined,
  shapeId: string
): AreaShapeRole {
  return getAreaShapeRolesFromMetadata(metadata)[shapeId] ?? "include";
}

function buildCleanAreaShapeRoles(params: {
  metadata: TakeoffMeasurement["metadata"] | null | undefined;
  areaShapes: Array<Pick<TakeoffMeasurementAreaShape, "id">>;
  overrides?: Record<string, AreaShapeRole>;
}): Record<string, AreaShapeRole> {
  const existingRoles = getAreaShapeRolesFromMetadata(params.metadata);
  return params.areaShapes.reduce<Record<string, AreaShapeRole>>((accumulator, shape) => {
    accumulator[shape.id] = params.overrides?.[shape.id] ?? existingRoles[shape.id] ?? "include";
    return accumulator;
  }, {});
}

function buildAreaMeasurementMetadata(params: {
  metadata: TakeoffMeasurement["metadata"] | null | undefined;
  areaShapes: Array<Pick<TakeoffMeasurementAreaShape, "id">>;
  overrides?: Record<string, AreaShapeRole>;
}): Record<string, Json | undefined> {
  const metadataObject = getMeasurementMetadataObject(params.metadata);
  return {
    ...metadataObject,
    areaShapeRoles: buildCleanAreaShapeRoles(params),
  };
}

function computeSignedAreaTotals(params: {
  metadata: TakeoffMeasurement["metadata"] | null | undefined;
  areaShapes: Array<Pick<TakeoffMeasurementAreaShape, "id" | "measured_area_base" | "measured_perimeter_base">>;
}) {
  return params.areaShapes.reduce(
    (accumulator, shape) => {
      const role = getAreaShapeRole(params.metadata, shape.id);
      const measuredAreaBase = Number(shape.measured_area_base ?? 0);
      const measuredPerimeterBase = Number(shape.measured_perimeter_base ?? 0);
      accumulator.measuredAreaBase += role === "deduction" ? -measuredAreaBase : measuredAreaBase;
      accumulator.measuredPerimeterBase += measuredPerimeterBase;
      return accumulator;
    },
    {
      measuredAreaBase: 0,
      measuredPerimeterBase: 0,
    }
  );
}

function hasIncludedAreaShape(params: {
  metadata: TakeoffMeasurement["metadata"] | null | undefined;
  areaShapes: Array<Pick<TakeoffMeasurementAreaShape, "id">>;
}) {
  return params.areaShapes.some((shape) => getAreaShapeRole(params.metadata, shape.id) === "include");
}

function getCountPointOrderFromChildId(params: {
  measurementId: string;
  childId: string;
}): number | null {
  const childId = params.childId.trim();
  if (!childId) {
    return null;
  }

  const countPrefix = `${params.measurementId}:count:`;
  if (childId.startsWith(countPrefix)) {
    const pointOrder = Number(childId.slice(countPrefix.length));
    return Number.isInteger(pointOrder) && pointOrder >= 0 ? pointOrder : null;
  }

  const legacyPrefix = `${params.measurementId}:`;
  if (childId.startsWith(legacyPrefix)) {
    const pointOrder = Number(childId.slice(legacyPrefix.length));
    return Number.isInteger(pointOrder) && pointOrder >= 0 ? pointOrder : null;
  }

  return null;
}

async function getTakeoffMeasurementPointsForMeasurement(
  measurementId: string,
  options?: { supabase?: SupabaseClient<Database> }
): Promise<TakeoffMeasurementPoint[]> {
  const supabase = options?.supabase ?? await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("takeoff_measurement_points")
    .select(takeoffMeasurementPointSelect)
    .eq("measurement_id", measurementId)
    .order("point_order", { ascending: true });

  if (error) {
    return [];
  }

  return data ?? [];
}

async function getTakeoffAreaShapesForMeasurements(
  measurementIds: string[],
  options?: { supabase?: SupabaseClient<Database> }
): Promise<Record<string, TakeoffMeasurementWithPoints["area_shapes"]>> {
  if (measurementIds.length === 0) {
    return {};
  }

  const supabase = options?.supabase ?? await createServerSupabaseClient();
  const { data: shapeRows, error: shapeError } = await supabase
    .from("takeoff_measurement_area_shapes")
    .select(takeoffMeasurementAreaShapeSelect)
    .in("measurement_id", measurementIds)
    .order("shape_order", { ascending: true });

  if (shapeError) {
    console.error("Failed to load takeoff measurement area shapes", {
      measurementIds,
      message: shapeError.message,
      code: shapeError.code,
      details: shapeError.details,
      hint: shapeError.hint,
    });
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`Failed to load takeoff measurement area shapes: ${shapeError.message}`);
    }
    return {};
  }

  if (!shapeRows || shapeRows.length === 0) {
    return {};
  }

  const areaShapeIds = shapeRows.map((shape) => shape.id);
  const { data: pointRows, error: pointError } = await supabase
    .from("takeoff_measurement_area_shape_points")
    .select(takeoffMeasurementAreaShapePointSelect)
    .in("area_shape_id", areaShapeIds)
    .order("point_order", { ascending: true });

  if (pointError) {
    console.error("Failed to load takeoff measurement area shape points", {
      measurementIds,
      areaShapeIds,
      message: pointError.message,
      code: pointError.code,
      details: pointError.details,
      hint: pointError.hint,
    });
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`Failed to load takeoff measurement area shape points: ${pointError.message}`);
    }
  }

  const pointsByShapeId = new Map<string, TakeoffMeasurementAreaShapePoint[]>();
  if (!pointError && pointRows) {
    pointRows.forEach((point) => {
      const existing = pointsByShapeId.get(point.area_shape_id) ?? [];
      existing.push(point as TakeoffMeasurementAreaShapePoint);
      pointsByShapeId.set(point.area_shape_id, existing);
    });
  }

  return shapeRows.reduce<Record<string, TakeoffMeasurementWithPoints["area_shapes"]>>((accumulator, shape) => {
    const measurementShapes = accumulator[shape.measurement_id] ?? [];
    measurementShapes.push({
      ...(shape as TakeoffMeasurementAreaShape),
      points: pointsByShapeId.get(shape.id) ?? [],
    });
    accumulator[shape.measurement_id] = measurementShapes;
    return accumulator;
  }, {});
}

async function getTakeoffLinePathsForMeasurements(
  measurementIds: string[],
  options?: { supabase?: SupabaseClient<Database> }
): Promise<Record<string, TakeoffMeasurementWithPoints["line_paths"]>> {
  if (measurementIds.length === 0) {
    return {};
  }

  const supabase = options?.supabase ?? await createServerSupabaseClient();
  const { data: pathRows, error: pathError } = await supabase
    .from("takeoff_measurement_line_paths")
    .select(takeoffMeasurementLinePathSelect)
    .in("measurement_id", measurementIds)
    .order("path_order", { ascending: true });

  if (pathError) {
    console.error("Failed to load takeoff measurement line paths", {
      measurementIds,
      message: pathError.message,
      code: pathError.code,
      details: pathError.details,
      hint: pathError.hint,
    });
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`Failed to load takeoff measurement line paths: ${pathError.message}`);
    }
    return {};
  }

  if (!pathRows || pathRows.length === 0) {
    return {};
  }

  const linePathIds = pathRows.map((path) => path.id);
  const { data: pointRows, error: pointError } = await supabase
    .from("takeoff_measurement_line_path_points")
    .select(takeoffMeasurementLinePathPointSelect)
    .in("line_path_id", linePathIds)
    .order("point_order", { ascending: true });

  if (pointError) {
    console.error("Failed to load takeoff measurement line path points", {
      measurementIds,
      linePathIds,
      message: pointError.message,
      code: pointError.code,
      details: pointError.details,
      hint: pointError.hint,
    });
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`Failed to load takeoff measurement line path points: ${pointError.message}`);
    }
  }

  const pointsByPathId = new Map<string, TakeoffMeasurementLinePathPoint[]>();
  if (!pointError && pointRows) {
    pointRows.forEach((point) => {
      const existing = pointsByPathId.get(point.line_path_id) ?? [];
      existing.push(point as TakeoffMeasurementLinePathPoint);
      pointsByPathId.set(point.line_path_id, existing);
    });
  }

  return pathRows.reduce<Record<string, TakeoffMeasurementWithPoints["line_paths"]>>((accumulator, path) => {
    const measurementPaths = accumulator[path.measurement_id] ?? [];
    measurementPaths.push({
      ...(path as TakeoffMeasurementLinePath),
      points: pointsByPathId.get(path.id) ?? [],
    });
    accumulator[path.measurement_id] = measurementPaths;
    return accumulator;
  }, {});
}

async function writeTakeoffMeasurementEvent(params: {
  organizationId: string;
  projectId: string;
  opportunityId: string | null;
  measurement: TakeoffMeasurement;
  points: TakeoffMeasurementPoint[];
  areaShapes?: TakeoffMeasurementWithPoints["area_shapes"];
  linePaths?: TakeoffMeasurementWithPoints["line_paths"];
  eventType: "created" | "updated" | "archived" | "deleted" | "restored";
  actorUserId: string;
  changeReason: string;
  diff: Record<string, unknown>;
  supabase?: SupabaseClient<Database>;
}) {
  const supabase = params.supabase ?? await createServerSupabaseClient();
  const snapshot = {
    measurement: params.measurement,
    points: params.points,
    area_shapes: params.areaShapes ?? [],
    line_paths: params.linePaths ?? [],
  };

  assertJsonValue(params.diff);
  const { error } = await supabase.from("takeoff_measurement_events").insert({
    organization_id: params.organizationId,
    project_id: params.projectId,
    opportunity_id: params.opportunityId,
    measurement_id: params.measurement.id,
    event_type: params.eventType,
    version: params.measurement.version,
    actor_user_id: params.actorUserId,
    change_reason: params.changeReason,
    snapshot,
    diff: params.diff,
    metadata: {},
  });

  if (error) {
    throw new Error(error.message);
  }
}

function buildTakeoffMeasurementIntelligenceMetadata(params: {
  measurement: TakeoffMeasurement;
  pointCount: number;
  areaShapeCount?: number;
  linePathCount?: number;
  reason?: string;
  childKind?: string | null;
}) {
  return {
    drawingSetId: params.measurement.drawing_set_id,
    pageId: params.measurement.page_id,
    calibrationId: params.measurement.calibration_id,
    groupId: params.measurement.group_id,
    measurementKind: params.measurement.measurement_kind,
    pointCount: params.pointCount,
    areaShapeCount: params.areaShapeCount ?? 0,
    linePathCount: params.linePathCount ?? 0,
    childKind: params.childKind ?? null,
    reason: params.reason ?? null,
  } satisfies Record<string, Json>;
}

async function recordTakeoffMeasurementIntelligence(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  projectId: string;
  opportunityId: string | null;
  measurement: TakeoffMeasurement;
  eventType:
    | "takeoff_measurement_created"
    | "takeoff_measurement_updated"
    | "takeoff_measurement_corrected"
    | "takeoff_measurement_archived"
    | "takeoff_measurement_deleted"
    | "takeoff_measurement_restored";
  eventFamily: "entity_lifecycle" | "commercial_action" | "correction";
  action: "created" | "updated" | "corrected" | "archived" | "deleted" | "restored";
  pointCount: number;
  areaShapeCount?: number;
  linePathCount?: number;
  beforeData?: Record<string, Json | null> | null;
  afterData?: Record<string, Json | null> | null;
  diffData?: Record<string, Json | null>;
  reason?: string | null;
  childKind?: string | null;
}) {
  try {
    if (!params.organizationId || !params.projectId || !params.measurement.id) {
      logTakeoffIntelligenceDebug("measurement_context_missing", {
        eventType: params.eventType,
        organizationId: params.organizationId,
        projectId: params.projectId,
        opportunityId: params.opportunityId,
        measurementId: params.measurement.id,
      });
      return null;
    }

    const intelligenceSupabase = await createServerSupabaseClient();
    const eventPayload = buildTakeoffIntelligenceEvent({
      organizationId: params.organizationId,
      projectId: params.projectId,
      opportunityId: params.opportunityId,
      eventFamily: params.eventFamily,
      eventType: params.eventType,
      action: params.action,
      entityType: "takeoff_measurement",
      entityId: params.measurement.id,
      beforeData: params.beforeData ?? null,
      afterData:
        params.afterData ??
        summarizeTakeoffMeasurement({
          measurement: params.measurement,
          pointCount: params.pointCount,
          areaShapeCount: params.areaShapeCount,
          linePathCount: params.linePathCount,
        }),
      diffData: params.diffData ?? {},
      reason: params.reason ?? null,
      metadata: buildTakeoffMeasurementIntelligenceMetadata({
        measurement: params.measurement,
        pointCount: params.pointCount,
        areaShapeCount: params.areaShapeCount,
        linePathCount: params.linePathCount,
        reason: params.reason ?? undefined,
        childKind: params.childKind ?? undefined,
      }),
      sourceChannel: "web",
    });

    logTakeoffIntelligenceDebug("measurement_event_called", {
      eventType: params.eventType,
      entityId: params.measurement.id,
      module: eventPayload.module,
      organizationId: params.organizationId,
      projectId: params.projectId,
      opportunityId: params.opportunityId,
    });

    const eventId = await writeTakeoffIntelligenceEvent(
      intelligenceSupabase,
      eventPayload
    );

    logTakeoffIntelligenceDebug("measurement_event_written", {
      eventType: params.eventType,
      entityId: params.measurement.id,
      eventId,
    });

    if (params.eventType !== "takeoff_measurement_corrected") {
      return eventId;
    }

    await writeTakeoffCorrectionEvent(intelligenceSupabase, {
      organizationId: params.organizationId,
      projectId: params.projectId,
      opportunityId: params.opportunityId,
      correctionType: "measurement_fix",
      targetEntityType: "takeoff_measurement",
      targetEntityId: params.measurement.id,
      correctedFieldName: params.childKind ? `${params.childKind}_geometry` : "measurement_geometry",
      incorrectValue: params.beforeData ?? null,
      correctedValue: params.afterData ??
        summarizeTakeoffMeasurement({
          measurement: params.measurement,
          pointCount: params.pointCount,
          areaShapeCount: params.areaShapeCount,
          linePathCount: params.linePathCount,
        }),
      correctionReason: params.reason ?? null,
      feedbackLabel: "takeoff_measurement_corrected",
      linkedEventId: eventId,
      isTrainingEligible: true,
    });

    logTakeoffIntelligenceDebug("measurement_correction_written", {
      eventType: params.eventType,
      entityId: params.measurement.id,
      eventId,
    });

    return eventId;
  } catch (error) {
    logTakeoffIntelligenceFailure(params.eventType, error);
    return null;
  }
}

async function recordTakeoffCalibrationIntelligence(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  projectId: string;
  opportunityId: string | null;
  calibration: TakeoffCalibration;
  eventType: "takeoff_calibration_created" | "takeoff_calibration_corrected";
  beforeData?: Record<string, Json | null> | null;
  afterData?: Record<string, Json | null> | null;
  diffData?: Record<string, Json | null>;
  reason?: string | null;
  writeCorrection?: boolean;
}) {
  try {
    if (!params.organizationId || !params.projectId || !params.calibration.id) {
      logTakeoffIntelligenceDebug("calibration_context_missing", {
        eventType: params.eventType,
        organizationId: params.organizationId,
        projectId: params.projectId,
        opportunityId: params.opportunityId,
        calibrationId: params.calibration.id,
      });
      return null;
    }

    const intelligenceSupabase = await createServerSupabaseClient();
    const eventPayload = buildTakeoffIntelligenceEvent({
      organizationId: params.organizationId,
      projectId: params.projectId,
      opportunityId: params.opportunityId,
      eventFamily: params.eventType === "takeoff_calibration_created" ? "entity_lifecycle" : "correction",
      eventType: params.eventType,
      action: params.eventType === "takeoff_calibration_created" ? "created" : "corrected",
      entityType: "takeoff_calibration",
      entityId: params.calibration.id,
      beforeData: params.beforeData ?? null,
      afterData: params.afterData ?? summarizeTakeoffCalibration(params.calibration),
      diffData: params.diffData ?? {},
      reason: params.reason ?? null,
      metadata: {
        pageId: params.calibration.page_id,
        scaleRatio: params.calibration.scale_ratio,
        unitSystem: params.calibration.unit_system,
        displayUnit: params.calibration.display_unit,
        isActive: params.calibration.is_active,
      } satisfies Record<string, Json>,
      sourceChannel: "web",
    });

    logTakeoffIntelligenceDebug("calibration_event_called", {
      eventType: params.eventType,
      entityId: params.calibration.id,
      module: eventPayload.module,
      organizationId: params.organizationId,
      projectId: params.projectId,
      opportunityId: params.opportunityId,
    });

    const eventId = await writeTakeoffIntelligenceEvent(
      intelligenceSupabase,
      eventPayload
    );

    logTakeoffIntelligenceDebug("calibration_event_written", {
      eventType: params.eventType,
      entityId: params.calibration.id,
      eventId,
    });

    if (!params.writeCorrection) {
      return eventId;
    }

    await writeTakeoffCorrectionEvent(intelligenceSupabase, {
      organizationId: params.organizationId,
      projectId: params.projectId,
      opportunityId: params.opportunityId,
      correctionType: "manual_override",
      targetEntityType: "takeoff_calibration",
      targetEntityId: params.calibration.id,
      correctedFieldName: "scale_ratio",
      incorrectValue: params.beforeData ?? null,
      correctedValue: params.afterData ?? summarizeTakeoffCalibration(params.calibration),
      correctionReason: params.reason ?? null,
      feedbackLabel: "takeoff_calibration_corrected",
      linkedEventId: eventId,
      isTrainingEligible: true,
    });

    logTakeoffIntelligenceDebug("calibration_correction_written", {
      eventType: params.eventType,
      entityId: params.calibration.id,
      eventId,
    });

    return eventId;
  } catch (error) {
    logTakeoffIntelligenceFailure(params.eventType, error);
    return null;
  }
}

async function getTakeoffDrawingSetForWorkspace(params: {
  supabase?: SupabaseClient<Database>;
  organizationId: string;
  projectId: string;
  drawingSetId: string;
}): Promise<ProjectDrawingSet | null> {
  const supabase = params.supabase ?? await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("project_drawing_sets")
    .select(projectDrawingSetSelect)
    .eq("organization_id", params.organizationId)
    .eq("project_id", params.projectId)
    .eq("id", params.drawingSetId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

export async function resolveTakeoffWorkspaceForOpportunitySlug(
  opportunitySlug: string,
  options?: {
    supabase?: SupabaseClient<Database>;
    member?: OrganizationMember | null;
  }
): Promise<ResolvedTakeoffOpportunityWorkspace | null> {
  const member = options?.member ?? await getCurrentOrganizationMember();
  if (!member) return null;
  const supabase = options?.supabase ?? await createServerSupabaseClient();
  const context = await resolveAuthorizedTakeoffContext({
    owner: { kind: "opportunity", slug: opportunitySlug },
    member,
    supabase,
  });
  return context ? resolvedWorkspaceFromOwnerContext(context) : null;
}

export const getTakeoffAuthorizedContext = cache(
  async (opportunitySlug: string): Promise<TakeoffAuthorizedContext | null> => {
    const member = await getCurrentOrganizationMember();
    if (!member) {
      return null;
    }

    const context = await resolveAuthorizedTakeoffContext({ owner: { kind: "opportunity", slug: opportunitySlug }, member });
    const workspace = context ? resolvedWorkspaceFromOwnerContext(context) : null;
    if (!workspace || workspace.organizationId !== member.organization_id) {
      return null;
    }

    return { member, workspace };
  }
);

export const getTakeoffAuthorizedContextForOwner = cache(
  async (owner: TakeoffRouteOwner): Promise<TakeoffAuthorizedContext | null> => {
    const member = await getCurrentOrganizationMember();
    if (!member) return null;
    const context = await resolveAuthorizedTakeoffContext({ owner, member });
    if (!context || context.organizationId !== member.organization_id) return null;
    return { member, workspace: resolvedWorkspaceFromOwnerContext(context) };
  },
);

export async function getTakeoffDrawingSetsForOpportunitySlug(
  opportunitySlug: string,
  options?: {
    resolvedWorkspace?: ResolvedTakeoffOpportunityWorkspace;
    supabase?: SupabaseClient<Database>;
  }
): Promise<ProjectDrawingSet[]> {
  const resolved = options?.resolvedWorkspace ?? await resolveTakeoffWorkspaceForOpportunitySlug(opportunitySlug, {
    supabase: options?.supabase,
  });
  if (!resolved) {
    return [];
  }

  if (!options?.resolvedWorkspace && !options?.supabase) {
    const drawingSets = await getProjectDrawingSetsForCurrentUser(resolved.projectId);
    return drawingSets
      .filter((drawingSet) => drawingSet.source_type === "source" && !drawingSet.archived_at)
      .sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at));
  }

  const supabase = options.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const { data, error } = await supabase
    .from("project_drawing_sets")
    .select(projectDrawingSetSelect)
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("source_type", "source")
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error("Unable to load Takeoff drawing sets.");
  }

  return data ?? [];
}

export async function getTakeoffDrawingTabsForOpportunitySlug(
  opportunitySlug: string,
  options?: {
    drawingSets?: ProjectDrawingSet[];
    resolvedWorkspace?: ResolvedTakeoffOpportunityWorkspace;
    supabase?: SupabaseClient<Database>;
  },
): Promise<TakeoffDrawingTab[]> {
  const resolved = options?.resolvedWorkspace ?? await resolveTakeoffWorkspaceForOpportunitySlug(opportunitySlug, {
    supabase: options?.supabase,
  });
  if (!resolved) return [];

  const supabase = options?.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const drawingSets = options?.drawingSets ?? await getTakeoffDrawingSetsForOpportunitySlug(opportunitySlug, {
    resolvedWorkspace: resolved,
    supabase,
  });
  if (drawingSets.length === 0) return [];

  const drawingSetIds = drawingSets.map((drawingSet) => drawingSet.id);
  const [pagesResult, jobsResult] = await Promise.all([
    supabase
      .from("takeoff_pages")
      .select("drawing_set_id")
      .eq("organization_id", resolved.organizationId)
      .eq("project_id", resolved.projectId)
      .in("drawing_set_id", drawingSetIds),
    supabase
      .from("takeoff_render_jobs")
      .select("drawing_set_id, status, created_at")
      .eq("organization_id", resolved.organizationId)
      .eq("project_id", resolved.projectId)
      .eq("job_type", "page_metadata")
      .in("drawing_set_id", drawingSetIds)
      .order("created_at", { ascending: false }),
  ]);
  if (pagesResult.error || jobsResult.error) {
    throw new Error("Unable to load Takeoff drawing status.");
  }

  const readyDrawingSetIds = new Set((pagesResult.data ?? []).map((page) => page.drawing_set_id));
  const latestJobStatusByDrawingSetId = new Map<string, Database["public"]["Enums"]["takeoff_render_job_status"]>();
  (jobsResult.data ?? []).forEach((job) => {
    if (!latestJobStatusByDrawingSetId.has(job.drawing_set_id)) {
      latestJobStatusByDrawingSetId.set(job.drawing_set_id, job.status);
    }
  });

  return drawingSets.map((drawingSet) => {
    const latestJobStatus = latestJobStatusByDrawingSetId.get(drawingSet.id);
    const status: TakeoffDrawingPreparationStatus = readyDrawingSetIds.has(drawingSet.id)
      ? "ready"
      : latestJobStatus === "failed"
        ? "failed"
        : "preparing";
    return {
      drawingSetId: drawingSet.id,
      displayName: drawingSet.display_name,
      sourceFilename: drawingSet.file_name,
      sortOrder: drawingSet.sort_order,
      status,
      uploadedAt: drawingSet.uploaded_at,
      updatedAt: drawingSet.updated_at,
    };
  });
}

export async function renameTakeoffDrawingSetForOpportunity(params: {
  opportunitySlug: string;
  drawingSetId: string;
  displayName: string;
}): Promise<ProjectDrawingSet> {
  const displayName = params.displayName.trim();
  if (!displayName || displayName.length > 120) {
    throw new Error("Drawing set name must be between 1 and 120 characters.");
  }
  const { member, resolved, supabase } = await createValidatedTakeoffMutationContext(params.opportunitySlug);
  const drawingSet = await getTakeoffDrawingSetForWorkspace({
    supabase,
    organizationId: resolved.organizationId,
    projectId: resolved.projectId,
    drawingSetId: params.drawingSetId,
  });
  if (!drawingSet || drawingSet.source_type !== "source" || drawingSet.archived_at) {
    throw new Error("The selected Takeoff drawing set could not be renamed.");
  }
  if (drawingSet.uploaded_by !== member.user_id && member.role !== "admin" && member.role !== "owner") {
    throw new Error("You do not have permission to rename this drawing set.");
  }
  const { data, error } = await supabase
    .from("project_drawing_sets")
    .update({ display_name: displayName })
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("source_type", "source")
    .is("archived_at", null)
    .eq("id", params.drawingSetId)
    .select(projectDrawingSetSelect)
    .maybeSingle();
  if (error || !data) throw new Error("The selected Takeoff drawing set could not be renamed.");
  return data;
}

export async function archiveTakeoffDrawingSetForOpportunity(params: {
  opportunitySlug: string;
  drawingSetId: string;
}): Promise<{ archivedDrawingSetId: string }> {
  const { member, resolved, supabase } = await createValidatedTakeoffMutationContext(params.opportunitySlug);
  const drawingSet = await getTakeoffDrawingSetForWorkspace({
    supabase,
    organizationId: resolved.organizationId,
    projectId: resolved.projectId,
    drawingSetId: params.drawingSetId,
  });
  if (!drawingSet || drawingSet.source_type !== "source" || drawingSet.archived_at) {
    throw new Error("The selected Takeoff drawing set could not be archived.");
  }
  if (drawingSet.uploaded_by !== member.user_id && member.role !== "admin" && member.role !== "owner") {
    throw new Error("You do not have permission to archive this drawing set.");
  }
  const { data, error } = await supabase
    .from("project_drawing_sets")
    .update({ archived_at: new Date().toISOString(), archived_by: member.user_id })
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("id", drawingSet.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Unable to archive this drawing set.");
  return { archivedDrawingSetId: data.id };
}

async function createValidatedTakeoffMutationContext(ownerKey: string) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new Error("You must be signed in to update takeoff data.");
  }

  const validationSupabase = await createServerSupabaseClient();
  const owner = parseTakeoffOwnerKey(ownerKey);
  const ownerContext = await resolveAuthorizedTakeoffContext({ owner, supabase: validationSupabase, member });
  if (owner.kind === "opportunity" && ownerContext?.canonicalProject) {
    throw new Error(`This Opportunity has converted. Continue Takeoff from /app/projects/${ownerContext.canonicalProject.slug}/takeoff.`);
  }
  const resolved = ownerContext ? resolvedWorkspaceFromOwnerContext(ownerContext) : null;

  if (!resolved || resolved.organizationId !== member.organization_id) {
    throw new Error("Unable to resolve the takeoff workspace.");
  }

  return {
    member,
    resolved,
    supabase: createAdminSupabaseClient(),
  };
}

export async function createSignedTakeoffDrawingSetUrlForOpportunity(params: {
  opportunitySlug: string;
  drawingSetId: string;
  expiresInSeconds?: number;
  resolvedWorkspace?: ResolvedTakeoffOpportunityWorkspace;
  supabase?: SupabaseClient<Database>;
  authorizedDrawingSet?: ProjectDrawingSet;
}): Promise<string | null> {
  const resolved =
    params.resolvedWorkspace ??
    await resolveTakeoffWorkspaceForOpportunitySlug(params.opportunitySlug, {
      supabase: params.supabase,
    });
  if (!resolved) {
    return null;
  }

  const suppliedDrawingSet = params.authorizedDrawingSet;
  const suppliedDrawingSetIsAuthorized = Boolean(
    suppliedDrawingSet &&
    suppliedDrawingSet.id === params.drawingSetId &&
    suppliedDrawingSet.organization_id === resolved.organizationId &&
    suppliedDrawingSet.project_id === resolved.projectId &&
    suppliedDrawingSet.source_type === "source" &&
    !suppliedDrawingSet.archived_at
  );

  if (suppliedDrawingSet && !suppliedDrawingSetIsAuthorized) {
    return null;
  }

  const drawingSet = suppliedDrawingSetIsAuthorized
    ? suppliedDrawingSet ?? null
    : await getTakeoffDrawingSetForWorkspace({
        supabase: params.supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        drawingSetId: params.drawingSetId,
      });

  if (!drawingSet) {
    return null;
  }

  const supabase = params.supabase ?? await createServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from(PROJECT_DRAWING_SETS_BUCKET)
    .createSignedUrl(drawingSet.storage_path, params.expiresInSeconds ?? 60 * 60);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function getTakeoffPagesForProject(
  projectId: string,
  options?: { drawingSetId?: string }
): Promise<TakeoffPage[]> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("takeoff_pages")
    .select(takeoffPageSelect)
    .eq("organization_id", member.organization_id)
    .eq("project_id", projectId)
    .order("page_number", { ascending: true });

  if (options?.drawingSetId) {
    query = query.eq("drawing_set_id", options.drawingSetId);
  }

  const { data, error } = await query;
  if (error) {
    return [];
  }

  return data ?? [];
}

export async function getTakeoffPagesForOpportunitySlug(
  opportunitySlug: string,
  options?: {
    drawingSetId?: string;
    resolvedWorkspace?: ResolvedTakeoffOpportunityWorkspace;
    supabase?: SupabaseClient<Database>;
  }
): Promise<TakeoffPage[]> {
  const resolved =
    options?.resolvedWorkspace ??
    await resolveTakeoffWorkspaceForOpportunitySlug(opportunitySlug, {
      supabase: options?.supabase,
    });
  if (!resolved) {
    return [];
  }

  const supabase = options?.supabase ?? await createServerSupabaseClient();
  let query = supabase
    .from("takeoff_pages")
    .select(takeoffPageSelect)
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .order("page_number", { ascending: true });

  if (options?.drawingSetId) {
    query = query.eq("drawing_set_id", options.drawingSetId);
  }

  const { data, error } = await query;
  if (error) {
    return [];
  }

  return data ?? [];
}

export async function getTakeoffMeasurePagesForOpportunitySlug(
  opportunitySlug: string,
  options: {
    drawingSetId: string;
    resolvedWorkspace?: ResolvedTakeoffOpportunityWorkspace;
    supabase?: SupabaseClient<Database>;
  }
): Promise<TakeoffPageSummary[]> {
  const resolved = options.resolvedWorkspace ?? await resolveTakeoffWorkspaceForOpportunitySlug(opportunitySlug, {
    supabase: options.supabase,
  });
  if (!resolved) {
    return [];
  }
  const supabase = options.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const { data, error } = await supabase
    .from("takeoff_pages")
    .select("id, drawing_set_id, page_number, page_label, page_width_pts, page_height_pts, rotation_degrees")
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("drawing_set_id", options.drawingSetId)
    .order("page_number", { ascending: true });
  if (error) {
    throw new Error("Unable to load Takeoff pages.");
  }
  return data ?? [];
}

export async function getTakeoffMeasurePagesForDrawingSetsForOpportunitySlug(
  opportunitySlug: string,
  options: {
    drawingSetIds: string[];
    resolvedWorkspace?: ResolvedTakeoffOpportunityWorkspace;
    supabase?: SupabaseClient<Database>;
  },
): Promise<TakeoffPageSummary[]> {
  if (options.drawingSetIds.length === 0) return [];
  const resolved = options.resolvedWorkspace ?? await resolveTakeoffWorkspaceForOpportunitySlug(opportunitySlug, {
    supabase: options.supabase,
  });
  if (!resolved) return [];
  const supabase = options.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const { data, error } = await supabase
    .from("takeoff_pages")
    .select("id, drawing_set_id, page_number, page_label, page_width_pts, page_height_pts, rotation_degrees")
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .in("drawing_set_id", options.drawingSetIds)
    .order("page_number", { ascending: true });
  if (error) throw new Error("Unable to load Takeoff pages.");
  return data ?? [];
}

async function renderAndStoreTakeoffPagePreviews(params: {
  supabase: SupabaseClient<Database>;
  resolved: ResolvedTakeoffOpportunityWorkspace;
  drawingSet: ProjectDrawingSet;
  pages: TakeoffPage[];
  sourcePdfBytes?: Uint8Array;
}): Promise<void> {
  const pagesNeedingPreviews = params.pages;
  if (pagesNeedingPreviews.length === 0) {
    return;
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "tradesstack-takeoff-preview-"));
  const sourcePdfPath = join(tempDirectory, "source.pdf");
  const manifestPath = join(tempDirectory, "manifest.json");
  const outputDirectory = join(tempDirectory, "pages");
  const sourcePdfBytes =
    params.sourcePdfBytes
      ? Buffer.from(params.sourcePdfBytes)
      : await (async () => {
          const downloadResult = await params.supabase.storage
            .from(PROJECT_DRAWING_SETS_BUCKET)
            .download(params.drawingSet.storage_path);

          if (downloadResult.error || !downloadResult.data) {
            throw new Error(downloadResult.error?.message ?? "Unable to load the selected drawing set.");
          }

          return Buffer.from(await downloadResult.data.arrayBuffer());
        })();

  try {
    await writeFile(sourcePdfPath, sourcePdfBytes);

    const manifest = {
      pdfPath: sourcePdfPath,
      maxEdgePx: TAKEOFF_PREVIEW_MAX_EDGE_PX,
      targetPixelsPerPoint: TAKEOFF_PREVIEW_TARGET_PIXELS_PER_POINT,
      pages: pagesNeedingPreviews.map((page) => {
        const geometry = getTakeoffPageRenderGeometry(page);
        return {
          pageNumber: page.page_number,
          widthPts: geometry.rawWidthPts,
          heightPts: geometry.rawHeightPts,
          rotationDegrees: geometry.rotationDegrees,
          outputWidthPts: geometry.displayWidthPts,
          outputHeightPts: geometry.displayHeightPts,
          outputPath: join(outputDirectory, `page-${String(page.page_number).padStart(4, "0")}.png`),
        };
      }),
    };

    await writeFile(manifestPath, JSON.stringify(manifest));
    console.info("[takeoff-worker] Starting Swift preview renderer", {
      drawingSetId: params.drawingSet.id,
      pageNumbers: pagesNeedingPreviews.map((page) => page.page_number),
      outputDirectory,
    });
    try {
      await execFileAsync("swift", [join(process.cwd(), "scripts/render_takeoff_pdf_previews.swift"), manifestPath], {
        maxBuffer: 1024 * 1024 * 8,
        env: {
          ...process.env,
          SWIFT_MODULECACHE_PATH: join(tempDirectory, "swift-module-cache"),
          CLANG_MODULE_CACHE_PATH: join(tempDirectory, "swift-module-cache"),
        },
      });
    } catch (error) {
      const execError = error as Error & { stdout?: string; stderr?: string };
      throw new TakeoffWorkerError("Swift preview renderer failed.", {
        stage: "swift-render",
        details: {
          scriptPath: join(process.cwd(), "scripts/render_takeoff_pdf_previews.swift"),
          stdout: execError.stdout ?? null,
          stderr: execError.stderr ?? null,
        },
      });
    }
    console.info("[takeoff-worker] Swift preview renderer completed", {
      drawingSetId: params.drawingSet.id,
      pageNumbers: pagesNeedingPreviews.map((page) => page.page_number),
    });

    for (const page of pagesNeedingPreviews) {
      const previewStoragePath = toTakeoffPagePreviewStoragePath({
        organizationId: params.resolved.organizationId,
        projectId: params.resolved.projectId,
        drawingSetId: params.drawingSet.id,
        pageNumber: page.page_number,
      });
      const outputPath = join(outputDirectory, `page-${String(page.page_number).padStart(4, "0")}.png`);
      const previewBytes = await readFile(outputPath);
      const { widthPx, heightPx } = computeTakeoffPreviewDimensions(getTakeoffPageRenderGeometry(page));
      const uploadResult = await params.supabase.storage.from(PROJECT_DRAWING_SETS_BUCKET).upload(previewStoragePath, previewBytes, {
        contentType: "image/png",
        upsert: true,
      });

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }

      console.info("[takeoff-worker] Uploaded preview asset", {
        drawingSetId: params.drawingSet.id,
        pageId: page.id,
        pageNumber: page.page_number,
        previewStoragePath,
        bytes: previewBytes.byteLength,
      });

      const updateResult = await params.supabase
        .from("takeoff_pages")
        .update({
          preview_storage_path: previewStoragePath,
          preview_status: "ready",
          preview_error: null,
          preview_generated_at: new Date().toISOString(),
          preview_render_version: TAKEOFF_PREVIEW_RENDER_VERSION,
          preview_width_px: widthPx,
          preview_height_px: heightPx,
          preview_mime_type: "image/png",
          preview_bytes: previewBytes.byteLength,
          source_revision: getTakeoffDrawingSetSourceRevision(params.drawingSet),
        })
        .eq("id", page.id)
        .eq("organization_id", params.resolved.organizationId)
        .eq("project_id", params.resolved.projectId);

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }

      console.info("[takeoff-worker] Marked takeoff page preview ready", {
        drawingSetId: params.drawingSet.id,
        pageId: page.id,
        pageNumber: page.page_number,
        previewStoragePath,
      });
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function getTakeoffDrawingSetSourceRevision(drawingSet: ProjectDrawingSet): string {
  return drawingSet.source_revision;
}

function computeTakeoffPreviewDimensions(params: {
  displayWidthPts: number;
  displayHeightPts: number;
}): { widthPx: number; heightPx: number } {
  const longestEdgePts = Math.max(params.displayWidthPts, params.displayHeightPts, 1);
  const boundedPixelsPerPoint = Math.min(
    TAKEOFF_PREVIEW_TARGET_PIXELS_PER_POINT,
    TAKEOFF_PREVIEW_MAX_EDGE_PX / longestEdgePts
  );
  const renderScale = Math.max(1, boundedPixelsPerPoint);
  return {
    widthPx: Math.max(1, Math.round(params.displayWidthPts * renderScale)),
    heightPx: Math.max(1, Math.round(params.displayHeightPts * renderScale)),
  };
}

function shouldRegenerateTakeoffPagePreview(params: {
  page: TakeoffPage;
  sourceRevision: string;
  forceRetry?: boolean;
}): boolean {
  const { page, sourceRevision, forceRetry = false } = params;
  const isCurrentRevision = page.source_revision === sourceRevision;
  const isCurrentRenderVersion = page.preview_render_version === TAKEOFF_PREVIEW_RENDER_VERSION;

  if (page.preview_status === "failed" && !forceRetry && isCurrentRevision && isCurrentRenderVersion) {
    return false;
  }

  if (page.preview_status === "processing" && isCurrentRevision && isCurrentRenderVersion) {
    return false;
  }

  if (!page.preview_storage_path) {
    return true;
  }

  if (!isCurrentRevision) {
    return true;
  }

  if (!isCurrentRenderVersion) {
    return true;
  }

  if (page.preview_status === "failed" && forceRetry) {
    return true;
  }

  return false;
}

async function markTakeoffPagesPendingForPreview(params: {
  supabase: SupabaseClient<Database>;
  pages: TakeoffPage[];
  sourceRevision: string;
}) {
  if (params.pages.length === 0) {
    return;
  }

  const pageIds = params.pages.map((page) => page.id);
  const updateResult = await params.supabase
    .from("takeoff_pages")
    .update({
      preview_storage_path: null,
      preview_status: "pending",
      preview_error: null,
      preview_generated_at: null,
      preview_render_version: TAKEOFF_PREVIEW_RENDER_VERSION,
      preview_width_px: null,
      preview_height_px: null,
      preview_mime_type: null,
      preview_bytes: null,
      source_revision: params.sourceRevision,
    })
    .in("id", pageIds);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }
}

async function getTakeoffPagesForDrawingSetWithClient(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  projectId: string;
  drawingSetId: string;
}): Promise<TakeoffPage[]> {
  const { data, error } = await params.supabase
    .from("takeoff_pages")
    .select(takeoffPageSelect)
    .eq("organization_id", params.organizationId)
    .eq("project_id", params.projectId)
    .eq("drawing_set_id", params.drawingSetId)
    .order("page_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function createTakeoffPageMetadataRows(params: {
  supabase: SupabaseClient<Database>;
  resolved: ResolvedTakeoffOpportunityWorkspace;
  drawingSet: ProjectDrawingSet;
  createdBy: string;
}): Promise<TakeoffPage[]> {
  const existingPages = await getTakeoffPagesForDrawingSetWithClient({
    supabase: params.supabase,
    organizationId: params.resolved.organizationId,
    projectId: params.resolved.projectId,
    drawingSetId: params.drawingSet.id,
  });
  if (existingPages.length > 0) {
    return existingPages;
  }

  validateTakeoffPdfPreparationBounds({
    byteLength: params.drawingSet.file_size_bytes ?? 0,
    maxBytes: TAKEOFF_PAGE_PREPARATION_MAX_BYTES,
    maxPages: TAKEOFF_PAGE_PREPARATION_MAX_PAGES,
  });

  const downloadResult = await params.supabase.storage
    .from(PROJECT_DRAWING_SETS_BUCKET)
    .download(params.drawingSet.storage_path);
  if (downloadResult.error || !downloadResult.data) {
    throw new Error(downloadResult.error?.message ?? "Unable to load the selected drawing set.");
  }
  validateTakeoffPdfPreparationBounds({
    byteLength: downloadResult.data.size,
    maxBytes: TAKEOFF_PAGE_PREPARATION_MAX_BYTES,
    maxPages: TAKEOFF_PAGE_PREPARATION_MAX_PAGES,
  });

  const pdfBytes = new Uint8Array(await downloadResult.data.arrayBuffer());
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const pdfPages = pdf.getPages();
  validateTakeoffPdfPreparationBounds({
    byteLength: pdfBytes.byteLength,
    pageCount: pdfPages.length,
    maxBytes: TAKEOFF_PAGE_PREPARATION_MAX_BYTES,
    maxPages: TAKEOFF_PAGE_PREPARATION_MAX_PAGES,
  });

  const rows: Database["public"]["Tables"]["takeoff_pages"]["Insert"][] = pdfPages.map((page, index) => {
    const pageSize = page.getSize();
    const geometry = getTakeoffPageDisplayDimensions({
      pageWidthPts: pageSize.width,
      pageHeightPts: pageSize.height,
      rotationDegrees: page.getRotation().angle,
    });
    return {
      organization_id: params.resolved.organizationId,
      project_id: params.resolved.projectId,
      opportunity_id: params.resolved.opportunityId,
      drawing_set_id: params.drawingSet.id,
      page_number: index + 1,
      page_label: null,
      page_width_pts: geometry.widthPts,
      page_height_pts: geometry.heightPts,
      rotation_degrees: geometry.rotationDegrees,
      source_revision: getTakeoffDrawingSetSourceRevision(params.drawingSet),
      preview_storage_path: null,
      preview_status: "pending",
      preview_error: null,
      preview_generated_at: null,
      preview_render_version: TAKEOFF_PREVIEW_RENDER_VERSION,
      preview_width_px: null,
      preview_height_px: null,
      preview_mime_type: null,
      preview_bytes: null,
      metadata: {
        sourceFileName: params.drawingSet.file_name,
        rawPageWidthPts: pageSize.width,
        rawPageHeightPts: pageSize.height,
      },
      created_by: params.createdBy,
    };
  });

  const insertResult = await params.supabase
    .from("takeoff_pages")
    .insert(rows as never, {
      onConflict: "organization_id,drawing_set_id,page_number",
      ignoreDuplicates: true,
    } as never);
  if (insertResult.error) {
    const fallbackPages = await getTakeoffPagesForDrawingSetWithClient({
      supabase: params.supabase,
      organizationId: params.resolved.organizationId,
      projectId: params.resolved.projectId,
      drawingSetId: params.drawingSet.id,
    });
    if (fallbackPages.length === 0) {
      throw new Error(insertResult.error.message);
    }
    return fallbackPages;
  }

  return getTakeoffPagesForDrawingSetWithClient({
    supabase: params.supabase,
    organizationId: params.resolved.organizationId,
    projectId: params.resolved.projectId,
    drawingSetId: params.drawingSet.id,
  });
}

async function enqueueTakeoffPagePreviewRenderJob(params: {
  supabase: SupabaseClient<Database>;
  resolved: ResolvedTakeoffOpportunityWorkspace;
  drawingSet: ProjectDrawingSet;
  requestedBy: string | null;
  pageIds: string[];
}): Promise<TakeoffRenderJob | null> {
  if (params.pageIds.length === 0) {
    console.info("[takeoff-worker] Skipping enqueue because no page ids were requested", {
      drawingSetId: params.drawingSet.id,
    });
    return null;
  }

  const sourceRevision = getTakeoffDrawingSetSourceRevision(params.drawingSet);
  const existingResult = await params.supabase
    .from("takeoff_render_jobs")
    .select("*")
    .eq("organization_id", params.resolved.organizationId)
    .eq("project_id", params.resolved.projectId)
    .eq("drawing_set_id", params.drawingSet.id)
    .eq("job_type", "page_preview")
    .eq("source_revision", sourceRevision)
    .eq("render_version", TAKEOFF_PREVIEW_RENDER_VERSION)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingResult.error) {
    console.error("[takeoff-worker] Failed checking for existing render job", {
      drawingSetId: params.drawingSet.id,
      sourceRevision,
      renderVersion: TAKEOFF_PREVIEW_RENDER_VERSION,
      error: existingResult.error.message,
    });
    throw new Error(existingResult.error.message);
  }

  if (existingResult.data) {
    console.info("[takeoff-worker] Reusing existing render job", {
      drawingSetId: params.drawingSet.id,
      jobId: existingResult.data.id,
      status: existingResult.data.status,
      pageCount: params.pageIds.length,
    });
    return existingResult.data;
  }

  const insertResult = await params.supabase
    .from("takeoff_render_jobs")
    .insert({
      organization_id: params.resolved.organizationId,
      project_id: params.resolved.projectId,
      opportunity_id: params.resolved.opportunityId,
      drawing_set_id: params.drawingSet.id,
      job_type: "page_preview",
      status: "pending",
      attempt_count: 0,
      last_error: null,
      requested_by: params.requestedBy,
      source_revision: sourceRevision,
      render_version: TAKEOFF_PREVIEW_RENDER_VERSION,
      payload: {
        pageIds: params.pageIds,
      },
    })
    .select("*")
    .single();

  if (!insertResult.error && insertResult.data) {
    console.info("[takeoff-worker] Enqueued render job", {
      drawingSetId: params.drawingSet.id,
      jobId: insertResult.data.id,
      pageCount: params.pageIds.length,
    });
    return insertResult.data;
  }

  if (insertResult.error) {
    console.error("[takeoff-worker] Render job insert failed", {
      drawingSetId: params.drawingSet.id,
      sourceRevision,
      renderVersion: TAKEOFF_PREVIEW_RENDER_VERSION,
      pageCount: params.pageIds.length,
      requestedBy: params.requestedBy,
      error: insertResult.error.message,
      details: {
        code: insertResult.error.code,
        details: insertResult.error.details,
        hint: insertResult.error.hint,
      },
    });
  }

  const duplicateResult = await params.supabase
    .from("takeoff_render_jobs")
    .select("*")
    .eq("organization_id", params.resolved.organizationId)
    .eq("project_id", params.resolved.projectId)
    .eq("drawing_set_id", params.drawingSet.id)
    .eq("job_type", "page_preview")
    .eq("source_revision", sourceRevision)
    .eq("render_version", TAKEOFF_PREVIEW_RENDER_VERSION)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (duplicateResult.error) {
    console.error("[takeoff-worker] Duplicate render job lookup failed after insert failure", {
      drawingSetId: params.drawingSet.id,
      sourceRevision,
      renderVersion: TAKEOFF_PREVIEW_RENDER_VERSION,
      error: duplicateResult.error.message,
    });
    throw new Error(insertResult.error?.message ?? duplicateResult.error.message);
  }

  if (duplicateResult.data) {
    console.info("[takeoff-worker] Found duplicate render job after insert failure", {
      drawingSetId: params.drawingSet.id,
      jobId: duplicateResult.data.id,
      status: duplicateResult.data.status,
    });
    return duplicateResult.data;
  }

  throw new Error(
    insertResult.error?.message ??
      "Takeoff render job insertion failed and no duplicate job was found."
  );
}

export interface TakeoffPagePreparationState {
  status: "not_started" | "pending" | "processing" | "ready" | "failed";
  jobId: string | null;
  pageCount: number;
  error: string | null;
}

export async function enqueueTakeoffPageMetadataPreparation(params: {
  opportunitySlug: string;
  drawingSetId: string;
}): Promise<TakeoffPagePreparationState> {
  const owner = parseTakeoffOwnerKey(params.opportunitySlug);
  const context = await getTakeoffAuthorizedContextForOwner(owner);
  if (!context) {
    throw new Error("Unable to resolve the Takeoff workspace.");
  }
  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const drawingSet = await getTakeoffDrawingSetForWorkspace({
    supabase,
    organizationId: context.workspace.organizationId,
    projectId: context.workspace.projectId,
    drawingSetId: params.drawingSetId,
  });
  if (!drawingSet) {
    throw new Error("The selected drawing set could not be found.");
  }

  const pages = await getTakeoffPagesForDrawingSetWithClient({
    supabase,
    organizationId: context.workspace.organizationId,
    projectId: context.workspace.projectId,
    drawingSetId: drawingSet.id,
  });
  if (pages.length > 0) {
    return { status: "ready", jobId: null, pageCount: pages.length, error: null };
  }

  const sourceRevision = getTakeoffDrawingSetSourceRevision(drawingSet);
  const insertResult = await supabase
    .from("takeoff_render_jobs")
    .insert({
      organization_id: context.workspace.organizationId,
      project_id: context.workspace.projectId,
      opportunity_id: context.workspace.opportunityId,
      drawing_set_id: drawingSet.id,
      job_type: "page_metadata",
      status: "pending",
      attempt_count: 0,
      last_error: null,
      requested_by: context.member.user_id,
      source_revision: sourceRevision,
      render_version: TAKEOFF_PAGE_METADATA_RENDER_VERSION,
      payload: {},
    })
    .select("*")
    .single();

  if (!insertResult.error && insertResult.data) {
    return { status: "pending", jobId: insertResult.data.id, pageCount: 0, error: null };
  }

  const existingResult = await supabase
    .from("takeoff_render_jobs")
    .select("*")
    .eq("organization_id", context.workspace.organizationId)
    .eq("project_id", context.workspace.projectId)
    .eq("drawing_set_id", drawingSet.id)
    .eq("job_type", "page_metadata")
    .eq("source_revision", sourceRevision)
    .eq("render_version", TAKEOFF_PAGE_METADATA_RENDER_VERSION)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingResult.error || !existingResult.data) {
    throw new Error("Unable to queue Takeoff page preparation.");
  }

  return {
    status: existingResult.data.status === "processing" ? "processing" : "pending",
    jobId: existingResult.data.id,
    pageCount: 0,
    error: null,
  };
}

export async function getTakeoffPageMetadataPreparationState(params: {
  opportunitySlug: string;
  drawingSetId: string;
}): Promise<TakeoffPagePreparationState> {
  const owner = parseTakeoffOwnerKey(params.opportunitySlug);
  const context = await getTakeoffAuthorizedContextForOwner(owner);
  if (!context) {
    throw new Error("Unable to resolve the Takeoff workspace.");
  }
  const supabase = await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const pages = await getTakeoffPagesForDrawingSetWithClient({
    supabase,
    organizationId: context.workspace.organizationId,
    projectId: context.workspace.projectId,
    drawingSetId: params.drawingSetId,
  });
  if (pages.length > 0) {
    return { status: "ready", jobId: null, pageCount: pages.length, error: null };
  }

  const { data, error } = await supabase
    .from("takeoff_render_jobs")
    .select("id, status, last_error")
    .eq("organization_id", context.workspace.organizationId)
    .eq("project_id", context.workspace.projectId)
    .eq("drawing_set_id", params.drawingSetId)
    .eq("job_type", "page_metadata")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error("Unable to read Takeoff preparation status.");
  }
  if (!data) {
    return { status: "not_started", jobId: null, pageCount: 0, error: null };
  }

  return {
    status: data.status === "completed" ? "ready" : data.status,
    jobId: data.id,
    pageCount: 0,
    error: data.status === "failed"
      ? (/exceeds the .* Takeoff preparation limit/i.test(data.last_error ?? "")
          ? (data.last_error ?? "Takeoff page preparation failed.").replace(/^\[[^\]]+\]\s*/, "")
          : "Measure could not prepare this PDF. Retry the drawing or contact support.")
      : null,
  };
}

async function queueMissingTakeoffPagePreviews(params: {
  supabase: SupabaseClient<Database>;
  resolved: ResolvedTakeoffOpportunityWorkspace;
  drawingSet: ProjectDrawingSet;
  pages: TakeoffPage[];
  requestedBy: string | null;
  forceRetry?: boolean;
  limitToPageIds?: string[] | null;
}) {
  const scopedPages =
    params.limitToPageIds && params.limitToPageIds.length > 0
      ? params.pages.filter((page) => params.limitToPageIds?.includes(page.id))
      : params.pages;
  const sourceRevision = getTakeoffDrawingSetSourceRevision(params.drawingSet);
  const stalePages = scopedPages.filter((page) =>
    shouldRegenerateTakeoffPagePreview({
      page,
      sourceRevision,
      forceRetry: params.forceRetry,
    })
  );

  if (stalePages.length === 0) {
    console.info("[takeoff-worker] No stale pages needed preview enqueue", {
      drawingSetId: params.drawingSet.id,
      pageCount: scopedPages.length,
      forceRetry: params.forceRetry ?? false,
    });
    return;
  }

  console.info("[takeoff-worker] Queueing missing takeoff page previews", {
    drawingSetId: params.drawingSet.id,
    stalePageIds: stalePages.map((page) => page.id),
    stalePageNumbers: stalePages.map((page) => page.page_number),
    sourceRevision,
    forceRetry: params.forceRetry ?? false,
  });

  await markTakeoffPagesPendingForPreview({
    supabase: params.supabase,
    pages: stalePages,
    sourceRevision,
  });

  await enqueueTakeoffPagePreviewRenderJob({
    supabase: params.supabase,
    resolved: params.resolved,
    drawingSet: params.drawingSet,
    requestedBy: params.requestedBy,
    pageIds: stalePages.map((page) => page.id),
  });
}

export async function createSignedTakeoffPagePreviewUrlForOpportunity(params: {
  opportunitySlug: string;
  pageId: string;
  expiresInSeconds?: number;
}): Promise<string | null> {
  const resolved = await resolveTakeoffWorkspaceForOpportunitySlug(params.opportunitySlug);
  if (!resolved) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data: page, error } = await supabase
    .from("takeoff_pages")
    .select(takeoffPageSelect)
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("id", params.pageId)
    .maybeSingle();

  if (error || !page?.preview_storage_path || page.preview_status !== "ready") {
    return null;
  }

  const signedResult = await supabase.storage
    .from(PROJECT_DRAWING_SETS_BUCKET)
    .createSignedUrl(page.preview_storage_path, params.expiresInSeconds ?? 60 * 60);

  if (signedResult.error || !signedResult.data?.signedUrl) {
    return null;
  }

  return signedResult.data.signedUrl;
}

export async function getTakeoffPagePreviewState(params: {
  pageId: string;
}): Promise<Pick<
  TakeoffPage,
  | "id"
  | "drawing_set_id"
  | "preview_status"
  | "preview_error"
  | "preview_storage_path"
  | "preview_generated_at"
  | "preview_render_version"
> | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("takeoff_pages")
    .select("id, drawing_set_id, preview_status, preview_error, preview_storage_path, preview_generated_at, preview_render_version")
    .eq("id", params.pageId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

export async function ensureTakeoffPagesForOpportunityDrawingSet(
  opportunitySlug: string,
  drawingSetId: string,
  options?: { forcePreviewRetry?: boolean; queuePageIds?: string[] | null; skipPreviewQueue?: boolean }
): Promise<TakeoffPage[]> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return [];
  }

  const resolved = await resolveTakeoffWorkspaceForOpportunitySlug(opportunitySlug);
  if (!resolved) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const drawingSet = await getTakeoffDrawingSetForWorkspace({
    organizationId: resolved.organizationId,
    projectId: resolved.projectId,
    drawingSetId,
  });

  if (!drawingSet) {
    throw new Error("The selected drawing set could not be found.");
  }

  const mimeType = (drawingSet.mime_type ?? "").toLowerCase();
  const isPdf = mimeType.includes("pdf") || /\.pdf$/i.test(drawingSet.file_name ?? "");
  if (!isPdf) {
    throw new Error("Only PDF drawing sets can be prepared for takeoff.");
  }

  const existingPages = await getTakeoffPagesForOpportunitySlug(opportunitySlug, { drawingSetId });
  if (existingPages.length > 0) {
    const geometryNormalizationRows = existingPages
      .map((page) => {
        if (page.preview_render_version === TAKEOFF_PREVIEW_RENDER_VERSION) {
          return null;
        }

        const geometry = getTakeoffPageRenderGeometry(page);
        if (geometry.displayWidthPts === page.page_width_pts && geometry.displayHeightPts === page.page_height_pts) {
          return null;
        }

        return {
          id: page.id,
          page_width_pts: geometry.displayWidthPts,
          page_height_pts: geometry.displayHeightPts,
          metadata: {
            ...(page.metadata && typeof page.metadata === "object" && !Array.isArray(page.metadata) ? page.metadata : {}),
            rawPageWidthPts: geometry.rawWidthPts,
            rawPageHeightPts: geometry.rawHeightPts,
          },
        };
      })
      .filter((row) => row !== null);

    for (const row of geometryNormalizationRows) {
      if (!row) {
        continue;
      }

      const geometryUpdateResult = await supabase
        .from("takeoff_pages")
        .update({
          page_width_pts: row.page_width_pts,
          page_height_pts: row.page_height_pts,
          metadata: row.metadata,
        })
        .eq("id", row.id);

      if (geometryUpdateResult.error) {
        throw new Error(geometryUpdateResult.error.message);
      }
    }

    const normalizedPages =
      geometryNormalizationRows.length > 0
        ? await getTakeoffPagesForOpportunitySlug(opportunitySlug, { drawingSetId })
        : existingPages;
    if (!options?.skipPreviewQueue) {
      await queueMissingTakeoffPagePreviews({
        supabase,
        resolved,
        drawingSet,
        pages: normalizedPages,
        requestedBy: member.user_id,
        forceRetry: options?.forcePreviewRetry,
        limitToPageIds: options?.queuePageIds ?? null,
      });
    }
    return getTakeoffPagesForOpportunitySlug(opportunitySlug, { drawingSetId });
  }

  const insertedPages = await createTakeoffPageMetadataRows({
    supabase,
    resolved,
    drawingSet,
    createdBy: member.user_id,
  });
  if (!options?.skipPreviewQueue) {
    await queueMissingTakeoffPagePreviews({
      supabase,
      resolved,
      drawingSet,
      pages: insertedPages,
      requestedBy: member.user_id,
      forceRetry: options?.forcePreviewRetry,
      limitToPageIds: options?.queuePageIds ?? null,
    });
  }

  return getTakeoffPagesForOpportunitySlug(opportunitySlug, { drawingSetId });
}

export async function claimNextTakeoffRenderJob(): Promise<TakeoffRenderJob | null> {
  let supabase: ReturnType<typeof createAdminSupabaseClient>;
  try {
    supabase = createAdminSupabaseClient();
  } catch (error) {
    throw new TakeoffWorkerError(
      error instanceof Error ? error.message : "Unable to create the admin Supabase client for takeoff worker jobs.",
      {
        stage: "admin-client",
      }
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nextJobResult = await supabase
      .from("takeoff_render_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextJobResult.error) {
      throw new TakeoffWorkerError(nextJobResult.error.message, {
        stage: "claim-select",
      });
    }

    const nextJob = nextJobResult.data;
    if (!nextJob) {
      console.info("[takeoff-worker] No pending render jobs available to claim");
      return null;
    }

    const claimResult = await supabase
      .from("takeoff_render_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        finished_at: null,
        last_error: null,
        attempt_count: nextJob.attempt_count + 1,
      })
      .eq("id", nextJob.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (claimResult.error) {
      console.warn("[takeoff-worker] Failed claiming render job; retrying", {
        jobId: nextJob.id,
        attempt,
        error: claimResult.error.message,
      });
      continue;
    }

    if (claimResult.data) {
      console.info("[takeoff-worker] Claimed render job", {
        jobId: claimResult.data.id,
        drawingSetId: claimResult.data.drawing_set_id,
        attemptCount: claimResult.data.attempt_count,
      });
      return claimResult.data;
    }
  }

  return null;
}

export async function processNextTakeoffRenderJob(): Promise<{
  job: TakeoffRenderJob | null;
  pagesRendered: number;
}> {
  const job = await claimNextTakeoffRenderJob();
  if (!job) {
    return {
      job: null,
      pagesRendered: 0,
    };
  }

  let supabase: ReturnType<typeof createAdminSupabaseClient>;
  try {
    supabase = createAdminSupabaseClient();
  } catch (error) {
    throw new TakeoffWorkerError(
      error instanceof Error ? error.message : "Unable to create the admin Supabase client for takeoff worker processing.",
      {
        stage: "admin-client",
        details: {
          jobId: job.id,
        },
      }
    );
  }
  let pagesToRender: TakeoffPage[] = [];

  try {
    const drawingSet = await getTakeoffDrawingSetForWorkspace({
      supabase,
      organizationId: job.organization_id,
      projectId: job.project_id,
      drawingSetId: job.drawing_set_id,
    });

    if (!drawingSet) {
      throw new TakeoffWorkerError("The render job drawing set could not be found.", {
        stage: "load-drawing-set",
        details: {
          jobId: job.id,
          drawingSetId: job.drawing_set_id,
        },
      });
    }

    if (job.job_type === "page_metadata") {
      const resolvedWorkspace: ResolvedTakeoffOpportunityWorkspace = {
        organizationId: job.organization_id,
        projectId: job.project_id,
        projectSlug: "",
        projectName: "",
        opportunityId: job.opportunity_id,
        opportunitySlug: "",
      };
      const preparedPages = await createTakeoffPageMetadataRows({
        supabase,
        resolved: resolvedWorkspace,
        drawingSet,
        createdBy: job.requested_by ?? drawingSet.uploaded_by,
      });
      await queueMissingTakeoffPagePreviews({
        supabase,
        resolved: resolvedWorkspace,
        drawingSet,
        pages: preparedPages,
        requestedBy: job.requested_by,
      });
      const completeResult = await supabase
        .from("takeoff_render_jobs")
        .update({
          status: "completed",
          last_error: null,
          finished_at: new Date().toISOString(),
          payload: { pageCount: preparedPages.length },
        })
        .eq("id", job.id);
      if (completeResult.error) {
        throw new TakeoffWorkerError(completeResult.error.message, {
          stage: "complete-page-metadata",
          details: { jobId: job.id },
        });
      }
      return { job, pagesRendered: 0 };
    }

    const sourceRevision = getTakeoffDrawingSetSourceRevision(drawingSet);
    const allPages = await getTakeoffPagesForDrawingSetWithClient({
      supabase,
      organizationId: job.organization_id,
      projectId: job.project_id,
      drawingSetId: job.drawing_set_id,
    });
    const jobPayload = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? job.payload
      : {};
    const payloadPageIds = Array.isArray(jobPayload.pageIds)
      ? jobPayload.pageIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const candidatePages = payloadPageIds.length > 0
      ? allPages.filter((page) => payloadPageIds.includes(page.id))
      : allPages;

    pagesToRender = candidatePages.filter((page) =>
      shouldRegenerateTakeoffPagePreview({
        page,
        sourceRevision,
        forceRetry: true,
      })
    );

    if (pagesToRender.length === 0) {
      const completeResult = await supabase
        .from("takeoff_render_jobs")
        .update({
          status: "completed",
          last_error: null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (completeResult.error) {
        throw new Error(completeResult.error.message);
      }

      return {
        job,
        pagesRendered: 0,
      };
    }

    const processingResult = await supabase
      .from("takeoff_pages")
      .update({
        preview_status: "processing",
        preview_error: null,
      })
      .in("id", pagesToRender.map((page) => page.id));

    if (processingResult.error) {
      throw new TakeoffWorkerError(processingResult.error.message, {
        stage: "mark-processing",
        details: {
          jobId: job.id,
        },
      });
    }

    console.info("[takeoff-worker] Marked takeoff pages processing for render job", {
      jobId: job.id,
      drawingSetId: job.drawing_set_id,
      pageIds: pagesToRender.map((page) => page.id),
      pageNumbers: pagesToRender.map((page) => page.page_number),
    });

    const downloadResult = await supabase.storage
      .from(PROJECT_DRAWING_SETS_BUCKET)
      .download(drawingSet.storage_path);

    if (downloadResult.error || !downloadResult.data) {
      throw new TakeoffWorkerError(downloadResult.error?.message ?? "Unable to load the selected drawing set.", {
        stage: "download-source-pdf",
        details: {
          jobId: job.id,
          drawingSetId: drawingSet.id,
          storagePath: drawingSet.storage_path,
        },
      });
    }

    const sourcePdfBytes = new Uint8Array(await downloadResult.data.arrayBuffer());
    console.info("[takeoff-worker] Downloaded source PDF for render job", {
      jobId: job.id,
      drawingSetId: job.drawing_set_id,
      byteLength: sourcePdfBytes.byteLength,
      pageCount: pagesToRender.length,
    });
    await renderAndStoreTakeoffPagePreviews({
      supabase,
      resolved: {
        organizationId: job.organization_id,
        projectId: job.project_id,
        projectSlug: "",
        projectName: "",
        opportunityId: job.opportunity_id,
        opportunitySlug: "",
      },
      drawingSet,
      pages: pagesToRender,
      sourcePdfBytes,
    });
    console.info("[takeoff-worker] Completed preview rendering and upload for render job", {
      jobId: job.id,
      drawingSetId: job.drawing_set_id,
      pageCount: pagesToRender.length,
    });

    const completeResult = await supabase
      .from("takeoff_render_jobs")
      .update({
        status: "completed",
        last_error: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (completeResult.error) {
      throw new Error(completeResult.error.message);
    }

    console.info("[takeoff-worker] Marked render job completed", {
      jobId: job.id,
      drawingSetId: job.drawing_set_id,
    });

    return {
      job,
      pagesRendered: pagesToRender.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Takeoff page preview rendering failed.";
    const stage =
      error instanceof TakeoffWorkerError
        ? error.stage
        : "unknown";
    const details =
      error instanceof TakeoffWorkerError
        ? error.details
        : undefined;

    if (pagesToRender.length > 0) {
      await supabase
        .from("takeoff_pages")
        .update({
          preview_status: "failed",
          preview_error: message,
        })
        .in("id", pagesToRender.map((page) => page.id));
    }

    await supabase
      .from("takeoff_render_jobs")
      .update({
        status: "failed",
        last_error: `[${stage}] ${message}`,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.error("[takeoff-worker] Job processing failed", {
      jobId: job.id,
      stage,
      message,
      details,
    });

    throw error;
  }
}

export async function getActiveTakeoffCalibrationForPage(
  pageId: string,
  options?: { supabase?: SupabaseClient<Database> }
): Promise<TakeoffCalibration | null> {
  const supabase = options?.supabase ?? await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("takeoff_calibrations")
    .select(takeoffCalibrationSelect)
    .eq("page_id", pageId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

export async function getTakeoffCalibrationsForMeasurements(
  measurements: Array<Pick<TakeoffMeasurement, "calibration_id">>,
  options?: { supabase?: SupabaseClient<Database> }
): Promise<Map<string, TakeoffCalibration>> {
  const calibrationIds = Array.from(new Set(
    measurements.map((measurement) => measurement.calibration_id).filter((id): id is string => Boolean(id))
  ));
  if (calibrationIds.length === 0) {
    return new Map();
  }

  const supabase = options?.supabase ?? await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("takeoff_calibrations")
    .select(takeoffCalibrationSelect)
    .in("id", calibrationIds);
  if (error) {
    throw new Error("Unable to load measurement calibrations.");
  }

  return new Map((data ?? []).map((calibration) => [calibration.id, calibration]));
}

export async function getTakeoffMeasurementReadinessForPage(
  pageId: string,
  options?: {
    supabase?: SupabaseClient<Database>;
    activeCalibration?: TakeoffCalibration | null;
  }
): Promise<TakeoffMeasurementReadiness> {
  const activeCalibration =
    options && "activeCalibration" in options
      ? options.activeCalibration ?? null
      : await getActiveTakeoffCalibrationForPage(pageId, { supabase: options?.supabase });

  if (!activeCalibration) {
    return {
      pageId,
      activeCalibrationId: null,
      canCreateLine: false,
      canCreateArea: false,
      canCreateCount: true,
      message: "Set an active calibration before creating manual line or area measurements. Count measurements are ready now.",
    };
  }

  return {
    pageId,
    activeCalibrationId: activeCalibration.id,
    canCreateLine: true,
    canCreateArea: true,
    canCreateCount: true,
    message: "This page is ready for manual line, area, and count measurements.",
  };
}

export async function assertManualTakeoffMeasurementRequirement(params: {
  pageId: string;
  measurementKind: TakeoffMeasurementKind;
}) {
  if (params.measurementKind === "count") {
    return;
  }

  const activeCalibration = await getActiveTakeoffCalibrationForPage(params.pageId);
  if (!activeCalibration) {
    throw new Error("Manual line and area measurements require an active calibration.");
  }
}

export async function getTakeoffCalibrationHistoryForPage(
  pageId: string,
  options?: { limit?: number }
): Promise<TakeoffCalibration[]> {
  const supabase = await createServerSupabaseClient();
  const limit = options?.limit ?? 8;
  const { data, error } = await supabase
    .from("takeoff_calibrations")
    .select(takeoffCalibrationSelect)
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data ?? [];
}

export async function getTakeoffCalibrationHistoryForOpportunityPage(params: {
  opportunitySlug: string;
  drawingSetId: string;
  pageId: string;
}): Promise<TakeoffCalibrationHistoryItem[]> {
  const { resolved, supabase } = await createValidatedTakeoffMutationContext(params.opportunitySlug);
  const { data: page, error: pageError } = await supabase
    .from("takeoff_pages")
    .select("id")
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("drawing_set_id", params.drawingSetId)
    .eq("id", params.pageId)
    .maybeSingle();

  if (pageError || !page) {
    throw new Error("The selected takeoff page could not be found.");
  }

  const { data: calibrations, error: calibrationError } = await supabase
    .from("takeoff_calibrations")
    .select(takeoffCalibrationSelect)
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("page_id", page.id)
    .order("created_at", { ascending: false });

  if (calibrationError) {
    throw new Error("Unable to load calibration history.");
  }

  const calibrationIds = (calibrations ?? []).map((calibration) => calibration.id);
  if (calibrationIds.length === 0) {
    return [];
  }

  const { data: dependencies, error: dependencyError } = await supabase
    .from("takeoff_measurements")
    .select("calibration_id")
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("drawing_set_id", params.drawingSetId)
    .eq("page_id", page.id)
    .in("calibration_id", calibrationIds);

  if (dependencyError) {
    throw new Error("Unable to load calibration dependencies.");
  }

  const counts = new Map<string, number>();
  (dependencies ?? []).forEach((measurement) => {
    if (measurement.calibration_id) {
      counts.set(measurement.calibration_id, (counts.get(measurement.calibration_id) ?? 0) + 1);
    }
  });

  return (calibrations ?? []).map((calibration) => ({
    ...calibration,
    dependent_measurement_count: counts.get(calibration.id) ?? 0,
  }));
}

export async function deleteUnusedTakeoffCalibrationForOpportunityPage(params: {
  opportunitySlug: string;
  drawingSetId: string;
  pageId: string;
  calibrationId: string;
}): Promise<DeleteTakeoffCalibrationResult> {
  const { resolved, supabase } = await createValidatedTakeoffMutationContext(params.opportunitySlug);
  const { data: page, error: pageError } = await supabase
    .from("takeoff_pages")
    .select("id")
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("drawing_set_id", params.drawingSetId)
    .eq("id", params.pageId)
    .maybeSingle();

  if (pageError || !page) {
    throw new Error("The selected takeoff page could not be found.");
  }

  const { data: calibration, error: calibrationError } = await supabase
    .from("takeoff_calibrations")
    .select(takeoffCalibrationSelect)
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("page_id", page.id)
    .eq("id", params.calibrationId)
    .maybeSingle();

  if (calibrationError || !calibration) {
    throw new Error("The selected calibration could not be found.");
  }

  const { count, error: dependencyError } = await supabase
    .from("takeoff_measurements")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("drawing_set_id", params.drawingSetId)
    .eq("page_id", page.id)
    .eq("calibration_id", calibration.id);

  if (dependencyError) {
    throw new Error("Unable to verify calibration dependencies.");
  }
  if ((count ?? 0) > 0) {
    throw new Error(`This calibration is used by ${count} measurement${count === 1 ? "" : "s"} and cannot be deleted.`);
  }

  const deleteResult = await supabase
    .from("takeoff_calibrations")
    .delete()
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("page_id", page.id)
    .eq("id", calibration.id);

  if (deleteResult.error) {
    throw new Error("Unable to delete calibration. Please try again.");
  }

  const activeCalibration = calibration.is_active
    ? null
    : await getActiveTakeoffCalibrationForPage(page.id, { supabase });

  return { deletedCalibrationId: calibration.id, activeCalibration };
}

export async function getTakeoffMeasurementGroupsForProject(
  projectId: string
): Promise<TakeoffMeasurementGroup[]> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("takeoff_measurement_groups")
    .select(takeoffMeasurementGroupSelect)
    .eq("organization_id", member.organization_id)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return [];
  }

  return data ?? [];
}

export async function getTakeoffMeasurementsForPage(
  pageId: string,
  options?: { supabase?: SupabaseClient<Database> }
): Promise<TakeoffMeasurementWithPoints[]> {
  const supabase = options?.supabase ?? await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("takeoff_measurements")
    .select(`${takeoffViewerMeasurementSelect}, takeoff_measurement_points(${takeoffMeasurementPointSelect})`)
    .eq("page_id", pageId)
    .in("status", ["active", "archived"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Unable to load Takeoff measurements.");
  }

  const [areaShapesByMeasurementId, linePathsByMeasurementId] = await Promise.all([
    getTakeoffAreaShapesForMeasurements(
      (data ?? []).filter((row) => row.measurement_kind === "area").map((row) => row.id),
      { supabase }
    ),
    getTakeoffLinePathsForMeasurements(
      (data ?? []).filter((row) => row.measurement_kind === "line").map((row) => row.id),
      { supabase }
    ),
  ]);

  return (data ?? []).map((row) => {
    const points = Array.isArray(row.takeoff_measurement_points)
      ? [...row.takeoff_measurement_points].sort((left, right) => left.point_order - right.point_order)
      : [];

    return {
      ...(row as unknown as TakeoffMeasurement),
      points,
      area_shapes: areaShapesByMeasurementId[row.id] ?? [],
      line_paths: linePathsByMeasurementId[row.id] ?? [],
    };
  });
}

export async function getTakeoffDrawingSetSummaryMeasurements(params: {
  organizationId: string;
  projectId: string;
  drawingSetId: string;
  supabase?: SupabaseClient<Database>;
}): Promise<TakeoffDrawingSetSummaryMeasurement[]> {
  const supabase = params.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const { data, error } = await supabase
    .from("takeoff_measurements")
    .select(takeoffDrawingSetSummaryMeasurementSelect)
    .eq("organization_id", params.organizationId)
    .eq("project_id", params.projectId)
    .eq("drawing_set_id", params.drawingSetId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Unable to load the Takeoff drawing-set summary.");
  }

  return (data ?? [])
    .map((row) => {
      const page = Array.isArray(row.page) ? row.page[0] : row.page;
      return {
        id: row.id,
        pageId: row.page_id,
        pageNumber: page?.page_number ?? Number.MAX_SAFE_INTEGER,
        pageLabel: page?.page_label?.trim() || (page?.page_number ? `Page ${page.page_number}` : "Page"),
        name: row.name,
        measurementKind: row.measurement_kind,
        colorHex: row.color_hex,
        displayValue: row.display_value,
        displayUnit: row.display_unit,
        status: row.status,
        createdAt: row.created_at,
      } satisfies TakeoffDrawingSetSummaryMeasurement;
    })
    .sort((left, right) =>
      left.pageNumber - right.pageNumber ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
    );
}

export async function getTakeoffMeasurementsForPages(
  pageIds: string[],
  options?: { supabase?: SupabaseClient<Database> }
): Promise<Map<string, TakeoffMeasurementWithPoints[]>> {
  const result = new Map(pageIds.map((pageId) => [pageId, [] as TakeoffMeasurementWithPoints[]]));
  if (pageIds.length === 0) {
    return result;
  }
  const supabase = options?.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const { data, error } = await supabase
    .from("takeoff_measurements")
    .select(`${takeoffViewerMeasurementSelect}, takeoff_measurement_points(${takeoffMeasurementPointSelect})`)
    .in("page_id", pageIds)
    .in("status", ["active", "archived"])
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error("Unable to load Takeoff measurements.");
  }

  const rows = data ?? [];
  const [areaShapesByMeasurementId, linePathsByMeasurementId] = await Promise.all([
    getTakeoffAreaShapesForMeasurements(rows.filter((row) => row.measurement_kind === "area").map((row) => row.id), { supabase }),
    getTakeoffLinePathsForMeasurements(rows.filter((row) => row.measurement_kind === "line").map((row) => row.id), { supabase }),
  ]);
  rows.forEach((row) => {
    const measurements = result.get(row.page_id);
    if (!measurements) {
      return;
    }
    measurements.push({
      ...(row as unknown as TakeoffMeasurement),
      points: Array.isArray(row.takeoff_measurement_points)
        ? [...row.takeoff_measurement_points].sort((left, right) => left.point_order - right.point_order)
        : [],
      area_shapes: areaShapesByMeasurementId[row.id] ?? [],
      line_paths: linePathsByMeasurementId[row.id] ?? [],
    });
  });
  return result;
}

export async function getActiveTakeoffCalibrationsForPages(
  pageIds: string[],
  options?: { supabase?: SupabaseClient<Database> }
): Promise<Map<string, TakeoffCalibration>> {
  if (pageIds.length === 0) {
    return new Map();
  }
  const supabase = options?.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const { data, error } = await supabase
    .from("takeoff_calibrations")
    .select(takeoffCalibrationSelect)
    .in("page_id", pageIds)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("Unable to load active Takeoff calibrations.");
  }
  const result = new Map<string, TakeoffCalibration>();
  (data ?? []).forEach((calibration) => {
    if (!result.has(calibration.page_id)) {
      result.set(calibration.page_id, calibration);
    }
  });
  return result;
}

export async function getLatestActiveAreaMeasurementForOpportunitySlug(
  opportunitySlug: string,
  options?: {
    resolvedWorkspace?: ResolvedTakeoffOpportunityWorkspace;
    supabase?: SupabaseClient<Database>;
  }
): Promise<Pick<TakeoffMeasurement, "id" | "drawing_set_id" | "page_id"> | null> {
  const resolved =
    options?.resolvedWorkspace ??
    await resolveTakeoffWorkspaceForOpportunitySlug(opportunitySlug, {
      supabase: options?.supabase,
    });
  if (!resolved) {
    return null;
  }

  const supabase = options?.supabase ?? await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("takeoff_measurements")
    .select("id, drawing_set_id, page_id")
    .eq("organization_id", resolved.organizationId)
    .eq("project_id", resolved.projectId)
    .eq("measurement_kind", "area")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

export async function saveTakeoffCalibrationForOpportunityPage(
  input: SaveTakeoffCalibrationInput
): Promise<TakeoffCalibration> {
  const perf = createTakeoffPerfTrace("saveTakeoffCalibrationForOpportunityPage");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: page, error: pageError } = await perf.step("pageLookup", () =>
      supabase
        .from("takeoff_pages")
        .select(takeoffPageSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("drawing_set_id", input.drawingSetId)
        .eq("id", input.pageId)
        .maybeSingle()
    );

    if (pageError || !page) {
      throw new Error("The selected takeoff page could not be found.");
    }

    const currentActiveCalibration = await perf.step("currentActiveCalibrationLookup", () =>
      getActiveTakeoffCalibrationForPage(page.id, { supabase })
    );

    const unitSystem = input.unitSystem === "imperial" ? "imperial" : "metric";
    const displayUnit = normalizeDisplayUnit(unitSystem, input.displayUnit);
    const baseUnit = baseUnitForUnitSystem(unitSystem);
    const pointAX = assertNormalizedCoordinate(input.pointAX, "Point A X");
    const pointAY = assertNormalizedCoordinate(input.pointAY, "Point A Y");
    const pointBX = assertNormalizedCoordinate(input.pointBX, "Point B X");
    const pointBY = assertNormalizedCoordinate(input.pointBY, "Point B Y");
    const referenceLengthInput = Number(input.referenceLengthInput);
    const referenceLengthBase = convertDisplayLengthToBase({
      unitSystem,
      displayUnit,
      value: referenceLengthInput,
    });
    const scaleRatio = computeCalibrationScaleRatio({
      page,
      pointAX,
      pointAY,
      pointBX,
      pointBY,
      referenceLengthBase,
    });
    const name = input.name.trim() || `Calibration ${new Date().toLocaleDateString("en-NZ")}`;
    const notes = input.notes?.trim() ?? "";
    const newCalibrationId = crypto.randomUUID();
    const insertPayload = {
      id: newCalibrationId,
      organization_id: resolved.organizationId,
      project_id: resolved.projectId,
      opportunity_id: resolved.opportunityId,
      page_id: page.id,
      name,
      scale_ratio: scaleRatio,
      unit_system: unitSystem,
      base_unit: baseUnit,
      display_unit: displayUnit,
      reference_length_input: referenceLengthInput,
      reference_length_base: referenceLengthBase,
      point_a_x: pointAX,
      point_a_y: pointAY,
      point_b_x: pointBX,
      point_b_y: pointBY,
      is_active: true,
      superseded_by: null,
      notes,
      metadata: {},
      created_by: member.user_id,
    };

    const calibrationRpcClient = supabase as SupabaseClient<Database> & {
      rpc: (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const saveResult = await perf.step("saveCalibrationRpc", async () =>
      calibrationRpcClient.rpc("save_takeoff_calibration_fast", {
        arg_id: insertPayload.id,
        arg_organization_id: insertPayload.organization_id,
        arg_project_id: insertPayload.project_id,
        arg_opportunity_id: insertPayload.opportunity_id,
        arg_page_id: insertPayload.page_id,
        arg_name: insertPayload.name,
        arg_scale_ratio: insertPayload.scale_ratio,
        arg_unit_system: insertPayload.unit_system,
        arg_base_unit: insertPayload.base_unit,
        arg_display_unit: insertPayload.display_unit,
        arg_reference_length_input: insertPayload.reference_length_input,
        arg_reference_length_base: insertPayload.reference_length_base,
        arg_point_a_x: insertPayload.point_a_x,
        arg_point_a_y: insertPayload.point_a_y,
        arg_point_b_x: insertPayload.point_b_x,
        arg_point_b_y: insertPayload.point_b_y,
        arg_notes: insertPayload.notes,
        arg_created_by: insertPayload.created_by,
      })
    );

    const savedCalibration = Array.isArray(saveResult.data) ? saveResult.data[0] : saveResult.data;

    if (saveResult.error || !savedCalibration) {
      throw new Error(saveResult.error?.message ?? "Unable to save the new calibration.");
    }

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffCalibrationIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        calibration: savedCalibration as TakeoffCalibration,
        eventType: currentActiveCalibration ? "takeoff_calibration_corrected" : "takeoff_calibration_created",
        beforeData: currentActiveCalibration ? summarizeTakeoffCalibration(currentActiveCalibration) : null,
        afterData: summarizeTakeoffCalibration(savedCalibration as TakeoffCalibration),
        diffData: {
          previousCalibrationId: currentActiveCalibration?.id ?? null,
          nextCalibrationId: (savedCalibration as TakeoffCalibration).id,
          pageId: page.id,
        },
        reason: currentActiveCalibration
          ? "Takeoff calibration updated with a new active scale."
          : "Takeoff calibration created.",
        writeCorrection: Boolean(currentActiveCalibration),
      })
    );

    return savedCalibration as TakeoffCalibration;
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      pageId: input.pageId,
    });
  }
}

export async function setActiveTakeoffCalibrationForOpportunityPage(
  input: SetActiveTakeoffCalibrationInput
): Promise<TakeoffCalibration | null> {
  const perf = createTakeoffPerfTrace("setActiveTakeoffCalibrationForOpportunityPage");
  try {
    const { resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: page, error: pageError } = await perf.step("pageLookup", () =>
      supabase
        .from("takeoff_pages")
        .select(takeoffPageSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("drawing_set_id", input.drawingSetId)
        .eq("id", input.pageId)
        .maybeSingle()
    );

    if (pageError || !page) {
      throw new Error("The selected takeoff page could not be found.");
    }

    const currentActiveCalibration = await perf.step("activeCalibrationLookup", () =>
      getActiveTakeoffCalibrationForPage(page.id, { supabase })
    );

    if (input.calibrationId) {
      const { data: targetCalibration, error: targetCalibrationError } = await perf.step("targetCalibrationLookup", () =>
        supabase
          .from("takeoff_calibrations")
          .select(takeoffCalibrationSelect)
          .eq("organization_id", resolved.organizationId)
          .eq("project_id", resolved.projectId)
          .eq("page_id", page.id)
          .eq("id", input.calibrationId as string)
          .maybeSingle()
      );

      if (targetCalibrationError || !targetCalibration) {
        throw new Error("The selected calibration could not be found.");
      }

      if (currentActiveCalibration?.id === targetCalibration.id) {
        return targetCalibration;
      }

      if (currentActiveCalibration) {
        const deactivateCurrentResult = await perf.step("deactivateCurrentCalibration", () =>
          supabase
            .from("takeoff_calibrations")
            .update({
              is_active: false,
              superseded_by: targetCalibration.id,
            })
            .eq("organization_id", resolved.organizationId)
            .eq("project_id", resolved.projectId)
            .eq("id", currentActiveCalibration.id)
            .eq("page_id", page.id)
        );

        if (deactivateCurrentResult.error) {
          throw new Error(deactivateCurrentResult.error.message);
        }
      }

      const activateTargetResult = await perf.step("activateTargetCalibration", () =>
        supabase
          .from("takeoff_calibrations")
          .update({
            is_active: true,
            superseded_by: null,
          })
          .eq("organization_id", resolved.organizationId)
          .eq("project_id", resolved.projectId)
          .eq("id", targetCalibration.id)
          .eq("page_id", page.id)
          .select(takeoffCalibrationSelect)
          .single()
      );

      if (activateTargetResult.error || !activateTargetResult.data) {
        throw new Error(activateTargetResult.error?.message ?? "Unable to activate the selected calibration.");
      }

      await perf.step("writeIntelligenceEvent", () =>
        recordTakeoffCalibrationIntelligence({
          supabase,
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          calibration: activateTargetResult.data,
          eventType: "takeoff_calibration_corrected",
          beforeData: currentActiveCalibration ? summarizeTakeoffCalibration(currentActiveCalibration) : null,
          afterData: summarizeTakeoffCalibration(activateTargetResult.data),
          diffData: {
            pageId: page.id,
            previousCalibrationId: currentActiveCalibration?.id ?? null,
            nextCalibrationId: activateTargetResult.data.id,
          },
          reason: "Active takeoff calibration changed.",
          writeCorrection: true,
        })
      );

      return activateTargetResult.data;
    }

    if (!currentActiveCalibration) {
      return null;
    }

    const deactivateCurrentResult = await perf.step("clearActiveCalibration", () =>
      supabase
        .from("takeoff_calibrations")
        .update({
          is_active: false,
        })
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", currentActiveCalibration.id)
        .eq("page_id", page.id)
    );

    if (deactivateCurrentResult.error) {
      throw new Error(deactivateCurrentResult.error.message);
    }

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffCalibrationIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        calibration: currentActiveCalibration,
        eventType: "takeoff_calibration_corrected",
        beforeData: summarizeTakeoffCalibration(currentActiveCalibration),
        afterData: null,
        diffData: {
          pageId: page.id,
          previousCalibrationId: currentActiveCalibration.id,
          nextCalibrationId: null,
        },
        reason: "Active takeoff calibration cleared.",
        writeCorrection: true,
      })
    );

    return null;
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      pageId: input.pageId,
      calibrationId: input.calibrationId,
    });
  }
}

async function createTakeoffMeasurementForOpportunityPage(
  input: CreateTakeoffMeasurementInput
): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("createTakeoffMeasurementForOpportunityPage");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: page, error: pageError } = await perf.step("pageLookup", () =>
      supabase
        .from("takeoff_pages")
        .select(takeoffPageSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", input.pageId)
        .maybeSingle()
    );

    if (pageError || !page) {
      throw new Error("The selected takeoff page could not be found.");
    }

    const activeCalibration = await perf.step("activeCalibrationLookup", () =>
      getActiveTakeoffCalibrationForPage(page.id, { supabase })
    );
    const name = input.name.trim() || `${input.measurementKind} measurement`;
    const description = input.description?.trim() ?? "";
    const colorHex = normalizeOptionalColor(input.colorHex);
    const groupId = input.groupId?.trim() || null;

    let points: TakeoffPointInput[] = [];
    let measuredLengthBase: number | null = null;
    let measuredAreaBase: number | null = null;
    let measuredPerimeterBase: number | null = null;
    let displayValue: number | null = null;
    let displayUnit: string | null = null;
    let countValue: number | null = null;

    if (input.measurementKind === "line") {
      if (!activeCalibration) {
        throw new Error("Manual line measurements require an active calibration.");
      }

      points = normalizePoints(input.points, 2);
      const lengthPts = computePolylineLengthPts(page, points);
      measuredLengthBase = lengthPts * Number(activeCalibration.scale_ratio);
      displayValue = convertBaseLengthToDisplay({
        baseUnit: activeCalibration.base_unit,
        displayUnit: activeCalibration.display_unit,
        value: measuredLengthBase,
      });
      displayUnit = activeCalibration.display_unit;
    }

    if (input.measurementKind === "area") {
      if (!activeCalibration) {
        throw new Error("Manual area measurements require an active calibration.");
      }

      points = normalizePoints(input.points, 3);
      const areaPts = computePolygonAreaPts(page, points);
      const perimeterPts = computePolygonPerimeterPts(page, points);
      const scaleRatio = Number(activeCalibration.scale_ratio);
      measuredAreaBase = areaPts * scaleRatio * scaleRatio;
      measuredPerimeterBase = perimeterPts * scaleRatio;
      displayValue = convertBaseAreaToDisplay({
        baseUnit: activeCalibration.base_unit,
        displayUnit: activeCalibration.display_unit,
        value: measuredAreaBase,
      });
      displayUnit = `${activeCalibration.display_unit}²`;
    }

    if (input.measurementKind === "count") {
      points = normalizePoints(input.points, 1);
      countValue = Number(input.countValue ?? 0);
      if (!Number.isInteger(countValue) || countValue < 0) {
        throw new Error("Count value must be a whole number of 0 or more.");
      }
      displayValue = countValue;
      displayUnit = "count";
    }

    const bounds = computeMeasurementBoundingBox(points);
    const insertPayload: Database["public"]["Tables"]["takeoff_measurements"]["Insert"] = {
      organization_id: resolved.organizationId,
      project_id: resolved.projectId,
      opportunity_id: resolved.opportunityId,
      drawing_set_id: page.drawing_set_id,
      page_id: page.id,
      calibration_id: input.measurementKind === "count" ? null : activeCalibration?.id ?? null,
      group_id: groupId,
      measurement_kind: input.measurementKind,
      status: "active",
      source: "manual",
      name,
      description,
      color_hex: colorHex,
      quantity: 1,
      count_value: countValue,
      measured_length_base: measuredLengthBase,
      measured_area_base: measuredAreaBase,
      measured_perimeter_base: measuredPerimeterBase,
      display_value: displayValue,
      display_unit: displayUnit,
      page_bbox_min_x: bounds.minX,
      page_bbox_min_y: bounds.minY,
      page_bbox_max_x: bounds.maxX,
      page_bbox_max_y: bounds.maxY,
      ai_confidence: null,
      ai_model: null,
      ai_run_id: null,
      external_ref: null,
      metadata: input.measurementKind === "count" ? { countItemValue: countValue ?? 1 } : {},
      version: 1,
      created_by: member.user_id,
      updated_by: null,
      archived_by: null,
      archived_at: null,
    };

    const insertResult = await perf.step("insertMeasurement", () =>
      supabase
        .from("takeoff_measurements")
        .insert(insertPayload)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (insertResult.error || !insertResult.data) {
      throw new Error(insertResult.error?.message ?? "Unable to create measurement.");
    }

    const measurement = insertResult.data;
    const savedPoints: TakeoffMeasurementPoint[] = points.map((point, index) => ({
      id: `${measurement.id}:${index}`,
      organization_id: resolved.organizationId,
      measurement_id: measurement.id,
      point_order: index,
      x: point.x,
      y: point.y,
      created_at: measurement.created_at,
    }));

    if (points.length > 0) {
      const pointRows: Database["public"]["Tables"]["takeoff_measurement_points"]["Insert"][] = points.map((point, index) => ({
        organization_id: resolved.organizationId,
        measurement_id: measurement.id,
        point_order: index,
        x: point.x,
        y: point.y,
      }));

      const pointInsertResult = await perf.step("insertMeasurementPoints", () =>
        supabase.from("takeoff_measurement_points").insert(pointRows)
      );
      if (pointInsertResult.error) {
        throw new Error(pointInsertResult.error.message);
      }
    }

    let areaShapes: TakeoffMeasurementWithPoints["area_shapes"] = [];
    let linePaths: TakeoffMeasurementWithPoints["line_paths"] = [];
    let nextMeasurement = measurement;
    if (input.measurementKind === "line" && points.length > 2) {
      const lineBounds = computeMeasurementBoundingBox(points);
      const linePathInsert = await perf.step("insertLinePath", () =>
        supabase
          .from("takeoff_measurement_line_paths")
          .insert({
            organization_id: resolved.organizationId,
            measurement_id: measurement.id,
            path_order: 0,
            measured_length_base: measuredLengthBase ?? 0,
            page_bbox_min_x: lineBounds.minX,
            page_bbox_min_y: lineBounds.minY,
            page_bbox_max_x: lineBounds.maxX,
            page_bbox_max_y: lineBounds.maxY,
          })
          .select(takeoffMeasurementLinePathSelect)
          .single()
      );

      if (linePathInsert.error || !linePathInsert.data) {
        throw new Error(linePathInsert.error?.message ?? "Unable to create line path.");
      }

      const savedLinePathPoints: TakeoffMeasurementLinePathPoint[] = points.map((point, index) => ({
        id: `${linePathInsert.data.id}:${index}`,
        organization_id: resolved.organizationId,
        line_path_id: linePathInsert.data.id,
        point_order: index,
        x: point.x,
        y: point.y,
        created_at: measurement.created_at,
      }));

      if (savedLinePathPoints.length > 0) {
        const linePathPointInsert = await perf.step("insertLinePathPoints", () =>
          supabase.from("takeoff_measurement_line_path_points").insert(
            savedLinePathPoints.map((point) => ({
              organization_id: point.organization_id,
              line_path_id: point.line_path_id,
              point_order: point.point_order,
              x: point.x,
              y: point.y,
            }))
          )
        );
        if (linePathPointInsert.error) {
          throw new Error(linePathPointInsert.error.message);
        }
      }

      linePaths = [
        {
          ...(linePathInsert.data as TakeoffMeasurementLinePath),
          points: savedLinePathPoints,
        },
      ];
    }

    if (input.measurementKind === "area") {
      const areaBounds = computeMeasurementBoundingBox(points);
      const areaShapeInsert = await perf.step("insertAreaShape", () =>
        supabase
          .from("takeoff_measurement_area_shapes")
          .insert({
            organization_id: resolved.organizationId,
            measurement_id: measurement.id,
            shape_order: 0,
            measured_area_base: measuredAreaBase ?? 0,
            measured_perimeter_base: measuredPerimeterBase ?? 0,
            page_bbox_min_x: areaBounds.minX,
            page_bbox_min_y: areaBounds.minY,
            page_bbox_max_x: areaBounds.maxX,
            page_bbox_max_y: areaBounds.maxY,
          })
          .select(takeoffMeasurementAreaShapeSelect)
          .single()
      );

      if (areaShapeInsert.error || !areaShapeInsert.data) {
        throw new Error(areaShapeInsert.error?.message ?? "Unable to create area shape.");
      }

      const savedAreaShapePoints: TakeoffMeasurementAreaShapePoint[] = points.map((point, index) => ({
        id: `${areaShapeInsert.data.id}:${index}`,
        organization_id: resolved.organizationId,
        area_shape_id: areaShapeInsert.data.id,
        point_order: index,
        x: point.x,
        y: point.y,
        created_at: measurement.created_at,
      }));

      if (savedAreaShapePoints.length > 0) {
        const areaShapePointInsert = await perf.step("insertAreaShapePoints", () =>
          supabase.from("takeoff_measurement_area_shape_points").insert(
            savedAreaShapePoints.map((point) => ({
              organization_id: point.organization_id,
              area_shape_id: point.area_shape_id,
              point_order: point.point_order,
              x: point.x,
              y: point.y,
            }))
          )
        );
        if (areaShapePointInsert.error) {
          throw new Error(areaShapePointInsert.error.message);
        }
      }

      areaShapes = [
        {
          ...(areaShapeInsert.data as TakeoffMeasurementAreaShape),
          points: savedAreaShapePoints,
        },
      ];

      const metadataUpdateResult = await perf.step("updateAreaMeasurementMetadata", () =>
        supabase
          .from("takeoff_measurements")
          .update({
            metadata: buildAreaMeasurementMetadata({
              metadata: measurement.metadata,
              areaShapes,
            }),
          })
          .eq("id", measurement.id)
          .select(takeoffMeasurementSelect)
          .single()
      );

      if (metadataUpdateResult.error || !metadataUpdateResult.data) {
        throw new Error(metadataUpdateResult.error?.message ?? "Unable to finalize area measurement metadata.");
      }

      nextMeasurement = metadataUpdateResult.data;
    }

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: nextMeasurement,
        points: savedPoints,
        areaShapes,
        linePaths,
        eventType: "created",
        actorUserId: member.user_id,
        changeReason: `Manual ${input.measurementKind} measurement created`,
        diff: {
          status: "active",
          measurement_kind: input.measurementKind,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: nextMeasurement,
        eventType: "takeoff_measurement_created",
        eventFamily: "entity_lifecycle",
        action: "created",
        pointCount: savedPoints.length,
        areaShapeCount: areaShapes.length,
        linePathCount: linePaths.length,
        afterData: summarizeTakeoffMeasurement({
          measurement: nextMeasurement,
          pointCount: savedPoints.length,
          areaShapeCount: areaShapes.length,
          linePathCount: linePaths.length,
        }),
        diffData: {
          measurementKind: input.measurementKind,
          pageId: page.id,
          drawingSetId: page.drawing_set_id,
        },
        reason: `Manual ${input.measurementKind} takeoff measurement created.`,
      })
    );

    return {
      ...nextMeasurement,
      points: savedPoints,
      area_shapes: areaShapes,
      line_paths: linePaths,
    };
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      pageId: input.pageId,
      measurementKind: input.measurementKind,
    });
  }
}

export async function createLineTakeoffMeasurementForOpportunityPage(
  input: Omit<CreateTakeoffMeasurementInput, "measurementKind" | "countValue"> & { points: TakeoffPointInput[] }
) {
  return createTakeoffMeasurementForOpportunityPage({
    ...input,
    measurementKind: "line",
  });
}

export async function createAreaTakeoffMeasurementForOpportunityPage(
  input: Omit<CreateTakeoffMeasurementInput, "measurementKind" | "countValue"> & { points: TakeoffPointInput[] }
) {
  return createTakeoffMeasurementForOpportunityPage({
    ...input,
    measurementKind: "area",
  });
}

export async function createCountTakeoffMeasurementForOpportunityPage(
  input: Omit<CreateTakeoffMeasurementInput, "measurementKind"> & { countValue: number; points?: TakeoffPointInput[] }
) {
  return createTakeoffMeasurementForOpportunityPage({
    ...input,
    measurementKind: "count",
  });
}

export async function appendAreaShapeToMeasurementForOpportunity(
  input: AppendTakeoffAreaShapeInput
): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("appendAreaShapeToMeasurementForOpportunity");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: measurement, error: measurementError } = await perf.step("measurementLookup", () =>
      supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", input.measurementId)
        .maybeSingle()
    );

    if (measurementError || !measurement) {
      throw new Error("The selected measurement could not be found.");
    }

    if (measurement.measurement_kind !== "area") {
      throw new Error("Only area measurements can accept additional area shapes.");
    }

    if (measurement.status === "deleted") {
      throw new Error("Deleted measurements cannot be updated.");
    }

    const { data: page, error: pageError } = await perf.step("pageLookup", () =>
      supabase
        .from("takeoff_pages")
        .select(takeoffPageSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", measurement.page_id)
        .maybeSingle()
    );

    if (pageError || !page) {
      throw new Error("The selected takeoff page could not be found.");
    }

    const activeCalibration = await perf.step("activeCalibrationLookup", () =>
      getActiveTakeoffCalibrationForPage(page.id, { supabase })
    );
    if (!activeCalibration) {
      throw new Error("Manual area measurements require an active calibration.");
    }

    const points = normalizePoints(input.points, 3);
    const areaPts = computePolygonAreaPts(page, points);
    const perimeterPts = computePolygonPerimeterPts(page, points);
    const measuredAreaBase = areaPts * Number(activeCalibration.scale_ratio) * Number(activeCalibration.scale_ratio);
    const measuredPerimeterBase = perimeterPts * Number(activeCalibration.scale_ratio);
    const shapeBounds = computeMeasurementBoundingBox(points);
    const existingAreaShapes = await perf.step("areaShapeLookup", () =>
      getTakeoffAreaShapesForMeasurements([measurement.id], { supabase })
    );
    const measurementAreaShapes = existingAreaShapes[measurement.id] ?? [];
    const nextShapeOrder = measurementAreaShapes.length;

    const insertShapeResult = await perf.step("insertAreaShape", () =>
      supabase
        .from("takeoff_measurement_area_shapes")
        .insert({
          organization_id: resolved.organizationId,
          measurement_id: measurement.id,
          shape_order: nextShapeOrder,
          measured_area_base: measuredAreaBase,
          measured_perimeter_base: measuredPerimeterBase,
          page_bbox_min_x: shapeBounds.minX,
          page_bbox_min_y: shapeBounds.minY,
          page_bbox_max_x: shapeBounds.maxX,
          page_bbox_max_y: shapeBounds.maxY,
        })
        .select(takeoffMeasurementAreaShapeSelect)
        .single()
    );

    if (insertShapeResult.error || !insertShapeResult.data) {
      throw new Error(insertShapeResult.error?.message ?? "Unable to add area shape.");
    }

    const shapePointRows: Database["public"]["Tables"]["takeoff_measurement_area_shape_points"]["Insert"][] = points.map((point, index) => ({
      organization_id: resolved.organizationId,
      area_shape_id: insertShapeResult.data.id,
      point_order: index,
      x: point.x,
      y: point.y,
    }));

    if (shapePointRows.length > 0) {
      const insertShapePointsResult = await perf.step("insertAreaShapePoints", () =>
        supabase.from("takeoff_measurement_area_shape_points").insert(shapePointRows)
      );
      if (insertShapePointsResult.error) {
        throw new Error(insertShapePointsResult.error.message);
      }
    }

    const nextAreaShapes = [
      ...measurementAreaShapes,
      {
        ...(insertShapeResult.data as TakeoffMeasurementAreaShape),
        points: points.map((point, index) => ({
          id: `${insertShapeResult.data.id}:${index}`,
          organization_id: resolved.organizationId,
          area_shape_id: insertShapeResult.data.id,
          point_order: index,
          x: point.x,
          y: point.y,
          created_at: insertShapeResult.data.created_at,
        })),
      },
    ];
    const combinedBounds = combineMeasurementBoundingBoxes(
      nextAreaShapes.map((shape) => ({
        minX: shape.page_bbox_min_x,
        minY: shape.page_bbox_min_y,
        maxX: shape.page_bbox_max_x,
        maxY: shape.page_bbox_max_y,
      }))
    );
    const nextMetadata = buildAreaMeasurementMetadata({
      metadata: measurement.metadata,
      areaShapes: nextAreaShapes,
      overrides: {
        [insertShapeResult.data.id]: input.role === "deduction" ? "deduction" : "include",
      },
    });
    const totals = computeSignedAreaTotals({
      metadata: nextMetadata,
      areaShapes: nextAreaShapes,
    });
    const displayValue = convertBaseAreaToDisplay({
      baseUnit: activeCalibration.base_unit,
      displayUnit: activeCalibration.display_unit,
      value: totals.measuredAreaBase,
    });

    const updateResult = await perf.step("updateMeasurement", () =>
      supabase
        .from("takeoff_measurements")
        .update({
          calibration_id: activeCalibration.id,
          measured_area_base: totals.measuredAreaBase,
          measured_perimeter_base: totals.measuredPerimeterBase,
          display_value: displayValue,
          display_unit: `${activeCalibration.display_unit}²`,
          page_bbox_min_x: combinedBounds.minX,
          page_bbox_min_y: combinedBounds.minY,
          page_bbox_max_x: combinedBounds.maxX,
          page_bbox_max_y: combinedBounds.maxY,
          metadata: nextMetadata,
          version: measurement.version + 1,
          updated_by: member.user_id,
        })
        .eq("id", measurement.id)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (updateResult.error || !updateResult.data) {
      throw new Error(updateResult.error?.message ?? "Unable to update area totals.");
    }

    const parentPoints = await perf.step("parentPointsLookup", () =>
      getTakeoffMeasurementPointsForMeasurement(measurement.id, { supabase })
    );

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        points: parentPoints,
        areaShapes: nextAreaShapes,
        eventType: "updated",
        actorUserId: member.user_id,
        changeReason: input.role === "deduction" ? "Deduction shape added to existing measurement" : "Area shape added to existing measurement",
        diff: {
          measurement_kind: "area",
          appended_shape_role: input.role === "deduction" ? "deduction" : "include",
          appended_shape_points: points,
          previous_shape_count: measurementAreaShapes.length,
          next_shape_count: nextAreaShapes.length,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        eventType: "takeoff_measurement_corrected",
        eventFamily: "correction",
        action: "corrected",
        pointCount: parentPoints.length,
        areaShapeCount: nextAreaShapes.length,
        linePathCount: 0,
        beforeData: summarizeTakeoffMeasurement({
          measurement,
          pointCount: parentPoints.length,
          areaShapeCount: measurementAreaShapes.length,
          linePathCount: 0,
        }),
        afterData: summarizeTakeoffMeasurement({
          measurement: updateResult.data,
          pointCount: parentPoints.length,
          areaShapeCount: nextAreaShapes.length,
          linePathCount: 0,
        }),
        diffData: {
          childKind: "area-shape",
          previousChildCount: measurementAreaShapes.length,
          nextChildCount: nextAreaShapes.length,
          quantityDelta:
            Number(updateResult.data.display_value ?? 0) - Number(measurement.display_value ?? 0),
        },
        reason: input.role === "deduction"
          ? "Deduction area shape appended to the takeoff measurement."
          : "Area shape appended to the takeoff measurement.",
        childKind: "area-shape",
      })
    );

    return {
      ...updateResult.data,
      points: parentPoints,
      area_shapes: nextAreaShapes,
      line_paths: [],
    };
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      measurementId: input.measurementId,
    });
  }
}

export async function appendLinePathToMeasurementForOpportunity(
  input: AppendTakeoffLinePathInput
): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("appendLinePathToMeasurementForOpportunity");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: measurement, error: measurementError } = await perf.step("measurementLookup", () =>
      supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", input.measurementId)
        .maybeSingle()
    );

    if (measurementError || !measurement) {
      throw new Error("The selected measurement could not be found.");
    }

    if (measurement.measurement_kind !== "line") {
      throw new Error("Only polyline measurements can accept additional paths.");
    }

    if (measurement.status === "deleted") {
      throw new Error("Deleted measurements cannot be updated.");
    }

    const { data: page, error: pageError } = await perf.step("pageLookup", () =>
      supabase
        .from("takeoff_pages")
        .select(takeoffPageSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", measurement.page_id)
        .maybeSingle()
    );

    if (pageError || !page) {
      throw new Error("The selected takeoff page could not be found.");
    }

    const activeCalibration = await perf.step("activeCalibrationLookup", () =>
      getActiveTakeoffCalibrationForPage(page.id, { supabase })
    );
    if (!activeCalibration) {
      throw new Error("Manual line measurements require an active calibration.");
    }

    const points = normalizePoints(input.points, 2);
    const measuredLengthBase = computePolylineLengthPts(page, points) * Number(activeCalibration.scale_ratio);
    const pathBounds = computeMeasurementBoundingBox(points);
    const existingLinePaths = await perf.step("linePathLookup", () =>
      getTakeoffLinePathsForMeasurements([measurement.id], { supabase })
    );
    const measurementLinePaths = existingLinePaths[measurement.id] ?? [];
    const nextPathOrder = measurementLinePaths.length;

    const insertPathResult = await perf.step("insertLinePath", () =>
      supabase
        .from("takeoff_measurement_line_paths")
        .insert({
          organization_id: resolved.organizationId,
          measurement_id: measurement.id,
          path_order: nextPathOrder,
          measured_length_base: measuredLengthBase,
          page_bbox_min_x: pathBounds.minX,
          page_bbox_min_y: pathBounds.minY,
          page_bbox_max_x: pathBounds.maxX,
          page_bbox_max_y: pathBounds.maxY,
        })
        .select(takeoffMeasurementLinePathSelect)
        .single()
    );

    if (insertPathResult.error || !insertPathResult.data) {
      throw new Error(insertPathResult.error?.message ?? "Unable to add polyline path.");
    }

    const pathPointRows: Database["public"]["Tables"]["takeoff_measurement_line_path_points"]["Insert"][] = points.map((point, index) => ({
      organization_id: resolved.organizationId,
      line_path_id: insertPathResult.data.id,
      point_order: index,
      x: point.x,
      y: point.y,
    }));

    if (pathPointRows.length > 0) {
      const insertPathPointsResult = await perf.step("insertLinePathPoints", () =>
        supabase.from("takeoff_measurement_line_path_points").insert(pathPointRows)
      );
      if (insertPathPointsResult.error) {
        throw new Error(insertPathPointsResult.error.message);
      }
    }

    const nextLinePaths = [
      ...measurementLinePaths,
      {
        ...(insertPathResult.data as TakeoffMeasurementLinePath),
        points: points.map((point, index) => ({
          id: `${insertPathResult.data.id}:${index}`,
          organization_id: resolved.organizationId,
          line_path_id: insertPathResult.data.id,
          point_order: index,
          x: point.x,
          y: point.y,
          created_at: insertPathResult.data.created_at,
        })),
      },
    ];
    const combinedBounds = combineMeasurementBoundingBoxes(
      nextLinePaths.map((path) => ({
        minX: path.page_bbox_min_x,
        minY: path.page_bbox_min_y,
        maxX: path.page_bbox_max_x,
        maxY: path.page_bbox_max_y,
      }))
    );
    const totalMeasuredLengthBase = nextLinePaths.reduce((total, path) => total + Number(path.measured_length_base ?? 0), 0);
    const displayValue = convertBaseLengthToDisplay({
      baseUnit: activeCalibration.base_unit,
      displayUnit: activeCalibration.display_unit,
      value: totalMeasuredLengthBase,
    });

    const updateResult = await perf.step("updateMeasurement", () =>
      supabase
        .from("takeoff_measurements")
        .update({
          calibration_id: activeCalibration.id,
          measured_length_base: totalMeasuredLengthBase,
          display_value: displayValue,
          display_unit: activeCalibration.display_unit,
          page_bbox_min_x: combinedBounds.minX,
          page_bbox_min_y: combinedBounds.minY,
          page_bbox_max_x: combinedBounds.maxX,
          page_bbox_max_y: combinedBounds.maxY,
          version: measurement.version + 1,
          updated_by: member.user_id,
        })
        .eq("id", measurement.id)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (updateResult.error || !updateResult.data) {
      throw new Error(updateResult.error?.message ?? "Unable to update polyline totals.");
    }

    const parentPoints = await perf.step("parentPointsLookup", () =>
      getTakeoffMeasurementPointsForMeasurement(measurement.id, { supabase })
    );

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        points: parentPoints,
        areaShapes: [],
        linePaths: nextLinePaths,
        eventType: "updated",
        actorUserId: member.user_id,
        changeReason: "Polyline path added to existing measurement",
        diff: {
          measurement_kind: "line",
          appended_path_points: points,
          previous_path_count: measurementLinePaths.length,
          next_path_count: nextLinePaths.length,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        eventType: "takeoff_measurement_corrected",
        eventFamily: "correction",
        action: "corrected",
        pointCount: parentPoints.length,
        areaShapeCount: 0,
        linePathCount: nextLinePaths.length,
        beforeData: summarizeTakeoffMeasurement({
          measurement,
          pointCount: parentPoints.length,
          areaShapeCount: 0,
          linePathCount: measurementLinePaths.length,
        }),
        afterData: summarizeTakeoffMeasurement({
          measurement: updateResult.data,
          pointCount: parentPoints.length,
          areaShapeCount: 0,
          linePathCount: nextLinePaths.length,
        }),
        diffData: {
          childKind: "line-path",
          previousChildCount: measurementLinePaths.length,
          nextChildCount: nextLinePaths.length,
          quantityDelta:
            Number(updateResult.data.display_value ?? 0) - Number(measurement.display_value ?? 0),
        },
        reason: "Polyline path appended to the takeoff measurement.",
        childKind: "line-path",
      })
    );

    return {
      ...updateResult.data,
      points: parentPoints,
      area_shapes: [],
      line_paths: nextLinePaths,
    };
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      measurementId: input.measurementId,
    });
  }
}

export async function appendCountItemToMeasurementForOpportunity(
  input: { opportunitySlug: string; measurementId: string; points: TakeoffPointInput[] }
): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("appendCountItemToMeasurementForOpportunity");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: measurement, error: measurementError } = await perf.step("measurementLookup", () =>
      supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", input.measurementId)
        .maybeSingle()
    );

    if (measurementError || !measurement) {
      throw new Error("The selected measurement could not be found.");
    }

    if (measurement.measurement_kind !== "count") {
      throw new Error("Only count measurements can accept additional count items.");
    }

    if (measurement.status === "deleted") {
      throw new Error("Deleted measurements cannot be updated.");
    }

    const existingPoints = await perf.step("existingPointsLookup", () =>
      getTakeoffMeasurementPointsForMeasurement(measurement.id, { supabase })
    );
    const nextPoint = normalizePoints(input.points, 1)[0]!;
    const countItemValue = getCountItemValueFromMeasurement({
      measurement,
      pointCount: existingPoints.length,
    });
    const nextCountValue = countItemValue * (existingPoints.length + 1);
    const bounds = computeMeasurementBoundingBox([
      ...existingPoints.map((point) => ({ x: point.x, y: point.y })),
      nextPoint,
    ]);

    const insertPointResult = await perf.step("insertCountPoint", () =>
      supabase
        .from("takeoff_measurement_points")
        .insert({
          organization_id: resolved.organizationId,
          measurement_id: measurement.id,
          point_order: existingPoints.length,
          x: nextPoint.x,
          y: nextPoint.y,
        })
    );
    if (insertPointResult.error) {
      throw new Error(insertPointResult.error.message);
    }

    const nextMetadata = {
      ...(measurement.metadata && typeof measurement.metadata === "object" ? measurement.metadata : {}),
      countItemValue,
    };
    const updateResult = await perf.step("updateMeasurement", () =>
      supabase
        .from("takeoff_measurements")
        .update({
          count_value: nextCountValue,
          display_value: nextCountValue,
          display_unit: "count",
          page_bbox_min_x: bounds.minX,
          page_bbox_min_y: bounds.minY,
          page_bbox_max_x: bounds.maxX,
          page_bbox_max_y: bounds.maxY,
          metadata: nextMetadata,
          version: measurement.version + 1,
          updated_by: member.user_id,
        })
        .eq("id", measurement.id)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (updateResult.error || !updateResult.data) {
      throw new Error(updateResult.error?.message ?? "Unable to update count total.");
    }

    const savedPoints = await perf.step("savedPointsLookup", () =>
      getTakeoffMeasurementPointsForMeasurement(measurement.id, { supabase })
    );

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        points: savedPoints,
        areaShapes: [],
        eventType: "updated",
        actorUserId: member.user_id,
        changeReason: "Count item added to existing measurement",
        diff: {
          measurement_kind: "count",
          appended_count_point: nextPoint,
          previous_item_count: existingPoints.length,
          next_item_count: savedPoints.length,
          count_item_value: countItemValue,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        eventType: "takeoff_measurement_corrected",
        eventFamily: "correction",
        action: "corrected",
        pointCount: savedPoints.length,
        areaShapeCount: 0,
        linePathCount: 0,
        beforeData: summarizeTakeoffMeasurement({
          measurement,
          pointCount: existingPoints.length,
          areaShapeCount: 0,
          linePathCount: 0,
        }),
        afterData: summarizeTakeoffMeasurement({
          measurement: updateResult.data,
          pointCount: savedPoints.length,
          areaShapeCount: 0,
          linePathCount: 0,
        }),
        diffData: {
          childKind: "count-item",
          previousChildCount: existingPoints.length,
          nextChildCount: savedPoints.length,
          countItemValue,
        },
        reason: "Count item appended to the takeoff measurement.",
        childKind: "count-item",
      })
    );

    return {
      ...updateResult.data,
      points: savedPoints,
      area_shapes: [],
      line_paths: [],
    };
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      measurementId: input.measurementId,
    });
  }
}

export async function updateTakeoffMeasurementGeometryForOpportunity(
  input: UpdateTakeoffMeasurementGeometryInput
): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("updateTakeoffMeasurementGeometryForOpportunity");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: measurement, error: measurementError } = await perf.step("measurementLookup", () =>
      supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", input.measurementId)
        .maybeSingle()
    );

    if (measurementError || !measurement) {
      throw new Error("The selected measurement could not be found.");
    }

    if (measurement.measurement_kind !== "line" && measurement.measurement_kind !== "area" && measurement.measurement_kind !== "count") {
      throw new Error("Only line, area, and count measurements can be updated with this geometry action.");
    }

    if (measurement.status === "deleted") {
      throw new Error("Deleted measurements cannot be edited.");
    }

    const { data: page, error: pageError } = await perf.step("pageLookup", () =>
      supabase
        .from("takeoff_pages")
        .select(takeoffPageSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", measurement.page_id)
        .maybeSingle()
    );

    if (pageError || !page) {
      throw new Error("The selected takeoff page could not be found.");
    }

    const activeCalibration = measurement.measurement_kind === "count"
      ? null
      : await perf.step("activeCalibrationLookup", () => getActiveTakeoffCalibrationForPage(page.id, { supabase }));
    if (!activeCalibration && measurement.measurement_kind !== "count") {
      throw new Error(
        measurement.measurement_kind === "area"
          ? "Manual area measurements require an active calibration."
          : "Manual line measurements require an active calibration."
      );
    }

    const previousPoints = await perf.step("previousPointsLookup", () =>
      getTakeoffMeasurementPointsForMeasurement(measurement.id, { supabase })
    );
    const previousAreaShapes = measurement.measurement_kind === "area"
      ? (await perf.step("previousAreaShapesLookup", () =>
          getTakeoffAreaShapesForMeasurements([measurement.id], { supabase })
        ))[measurement.id] ?? []
      : [];
    const previousLinePaths = measurement.measurement_kind === "line"
      ? (await perf.step("previousLinePathsLookup", () =>
          getTakeoffLinePathsForMeasurements([measurement.id], { supabase })
        ))[measurement.id] ?? []
      : [];
    if (measurement.measurement_kind === "area" && previousAreaShapes.length > 1) {
      throw new Error("Area quantities with multiple saved shapes cannot be edited as a single polygon.");
    }
    if (measurement.measurement_kind === "line" && previousLinePaths.length > 1) {
      throw new Error("Polyline measurements with multiple saved paths cannot be edited as a single path.");
    }
    const minimumPoints = measurement.measurement_kind === "count" ? 1 : measurement.measurement_kind === "area" ? 3 : 2;
    const points = normalizePoints(input.points, minimumPoints);
    let measuredLengthBase: number | null = null;
    let measuredAreaBase: number | null = null;
    let measuredPerimeterBase: number | null = null;
    let displayValue: number | null = null;
    let displayUnit: string | null = null;
    let calibrationId: string | null = null;
    let countValue: number | null = null;

    if (measurement.measurement_kind === "count") {
      countValue = Number(measurement.count_value ?? measurement.display_value ?? 1);
      displayValue = countValue;
      displayUnit = "count";
    } else if (measurement.measurement_kind === "area") {
      const areaPts = computePolygonAreaPts(page, points);
      const perimeterPts = computePolygonPerimeterPts(page, points);
      measuredAreaBase = areaPts * Number(activeCalibration!.scale_ratio) * Number(activeCalibration!.scale_ratio);
      measuredPerimeterBase = perimeterPts * Number(activeCalibration!.scale_ratio);
      displayValue = convertBaseAreaToDisplay({
        baseUnit: activeCalibration!.base_unit,
        displayUnit: activeCalibration!.display_unit,
        value: measuredAreaBase,
      });
      displayUnit = `${activeCalibration!.display_unit}²`;
      calibrationId = activeCalibration!.id;
    } else {
      const lengthPts = computePolylineLengthPts(page, points);
      measuredLengthBase = lengthPts * Number(activeCalibration!.scale_ratio);
      displayValue = convertBaseLengthToDisplay({
        baseUnit: activeCalibration!.base_unit,
        displayUnit: activeCalibration!.display_unit,
        value: measuredLengthBase,
      });
      displayUnit = activeCalibration!.display_unit;
      calibrationId = activeCalibration!.id;
    }

    const bounds = computeMeasurementBoundingBox(points);

    const updatePayload: Database["public"]["Tables"]["takeoff_measurements"]["Update"] = {
      calibration_id: calibrationId,
      measured_length_base: measuredLengthBase,
      measured_area_base: measuredAreaBase,
      measured_perimeter_base: measuredPerimeterBase,
      display_value: displayValue,
      display_unit: displayUnit,
      count_value: countValue,
      page_bbox_min_x: bounds.minX,
      page_bbox_min_y: bounds.minY,
      page_bbox_max_x: bounds.maxX,
      page_bbox_max_y: bounds.maxY,
      version: measurement.version + 1,
      updated_by: member.user_id,
    };

    const updateResult = await perf.step("updateMeasurement", () =>
      supabase
        .from("takeoff_measurements")
        .update(updatePayload)
        .eq("id", measurement.id)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (updateResult.error || !updateResult.data) {
      throw new Error(updateResult.error?.message ?? "Unable to update measurement geometry.");
    }

    const deletePointsResult = await perf.step("deleteExistingPoints", () =>
      supabase
        .from("takeoff_measurement_points")
        .delete()
        .eq("measurement_id", measurement.id)
    );

    if (deletePointsResult.error) {
      throw new Error(deletePointsResult.error.message);
    }

    const pointRows: Database["public"]["Tables"]["takeoff_measurement_points"]["Insert"][] = points.map((point, index) => ({
      organization_id: resolved.organizationId,
      measurement_id: measurement.id,
      point_order: index,
      x: point.x,
      y: point.y,
    }));

    if (pointRows.length > 0) {
      const insertPointsResult = await perf.step("insertMeasurementPoints", () =>
        supabase.from("takeoff_measurement_points").insert(pointRows)
      );
      if (insertPointsResult.error) {
        throw new Error(insertPointsResult.error.message);
      }
    }

    let nextAreaShapes = previousAreaShapes;
    let nextLinePaths = previousLinePaths;
    if (measurement.measurement_kind === "area") {
      const areaShapeBounds = computeMeasurementBoundingBox(points);
      const matchingShape = previousAreaShapes[0] ?? null;

      if (matchingShape) {
        const updateAreaShapeResult = await perf.step("updateAreaShape", () =>
          supabase
            .from("takeoff_measurement_area_shapes")
            .update({
              measured_area_base: measuredAreaBase ?? 0,
              measured_perimeter_base: measuredPerimeterBase ?? 0,
              page_bbox_min_x: areaShapeBounds.minX,
              page_bbox_min_y: areaShapeBounds.minY,
              page_bbox_max_x: areaShapeBounds.maxX,
              page_bbox_max_y: areaShapeBounds.maxY,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchingShape.id)
            .select(takeoffMeasurementAreaShapeSelect)
            .single()
        );
        if (updateAreaShapeResult.error || !updateAreaShapeResult.data) {
          throw new Error(updateAreaShapeResult.error?.message ?? "Unable to update area shape.");
        }

        const deleteAreaShapePointsResult = await perf.step("deleteAreaShapePoints", () =>
          supabase
            .from("takeoff_measurement_area_shape_points")
            .delete()
            .eq("area_shape_id", matchingShape.id)
        );
        if (deleteAreaShapePointsResult.error) {
          throw new Error(deleteAreaShapePointsResult.error.message);
        }

        if (pointRows.length > 0) {
          const insertAreaShapePointsResult = await perf.step("insertAreaShapePoints", () =>
            supabase.from("takeoff_measurement_area_shape_points").insert(
              points.map((point, index) => ({
                organization_id: resolved.organizationId,
                area_shape_id: matchingShape.id,
                point_order: index,
                x: point.x,
                y: point.y,
              }))
            )
          );
          if (insertAreaShapePointsResult.error) {
            throw new Error(insertAreaShapePointsResult.error.message);
          }
        }

        nextAreaShapes = [
          {
            ...(updateAreaShapeResult.data as TakeoffMeasurementAreaShape),
            points: points.map((point, index) => ({
              id: matchingShape.points[index]?.id ?? `${matchingShape.id}:${index}`,
              organization_id: resolved.organizationId,
              area_shape_id: matchingShape.id,
              point_order: index,
              x: point.x,
              y: point.y,
              created_at: matchingShape.points[index]?.created_at ?? updateAreaShapeResult.data.created_at,
            })),
          },
        ];
      }
    } else if (measurement.measurement_kind === "line" && previousLinePaths.length > 0) {
      const linePathBounds = computeMeasurementBoundingBox(points);
      const matchingPath = previousLinePaths[0] ?? null;

      if (matchingPath) {
        const updateLinePathResult = await perf.step("updateLinePath", () =>
          supabase
            .from("takeoff_measurement_line_paths")
            .update({
              measured_length_base: measuredLengthBase ?? 0,
              page_bbox_min_x: linePathBounds.minX,
              page_bbox_min_y: linePathBounds.minY,
              page_bbox_max_x: linePathBounds.maxX,
              page_bbox_max_y: linePathBounds.maxY,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchingPath.id)
            .select(takeoffMeasurementLinePathSelect)
            .single()
        );
        if (updateLinePathResult.error || !updateLinePathResult.data) {
          throw new Error(updateLinePathResult.error?.message ?? "Unable to update polyline path.");
        }

        const deleteLinePathPointsResult = await perf.step("deleteLinePathPoints", () =>
          supabase
            .from("takeoff_measurement_line_path_points")
            .delete()
            .eq("line_path_id", matchingPath.id)
        );
        if (deleteLinePathPointsResult.error) {
          throw new Error(deleteLinePathPointsResult.error.message);
        }

        if (pointRows.length > 0) {
          const insertLinePathPointsResult = await perf.step("insertLinePathPoints", () =>
            supabase.from("takeoff_measurement_line_path_points").insert(
              points.map((point, index) => ({
                organization_id: resolved.organizationId,
                line_path_id: matchingPath.id,
                point_order: index,
                x: point.x,
                y: point.y,
              }))
            )
          );
          if (insertLinePathPointsResult.error) {
            throw new Error(insertLinePathPointsResult.error.message);
          }
        }

        nextLinePaths = [
          {
            ...(updateLinePathResult.data as TakeoffMeasurementLinePath),
            points: points.map((point, index) => ({
              id: matchingPath.points[index]?.id ?? `${matchingPath.id}:${index}`,
              organization_id: resolved.organizationId,
              line_path_id: matchingPath.id,
              point_order: index,
              x: point.x,
              y: point.y,
              created_at: matchingPath.points[index]?.created_at ?? updateLinePathResult.data.created_at,
            })),
          },
        ];
      }
    }

    if (measurement.measurement_kind === "area") {
      const nextMetadata = buildAreaMeasurementMetadata({
        metadata: measurement.metadata,
        areaShapes: nextAreaShapes,
      });
      const totals = computeSignedAreaTotals({
        metadata: nextMetadata,
        areaShapes: nextAreaShapes,
      });

      updatePayload.measured_area_base = totals.measuredAreaBase;
      updatePayload.measured_perimeter_base = totals.measuredPerimeterBase;
      updatePayload.display_value = convertBaseAreaToDisplay({
        baseUnit: activeCalibration!.base_unit,
        displayUnit: activeCalibration!.display_unit,
        value: totals.measuredAreaBase,
      });
      updatePayload.display_unit = `${activeCalibration!.display_unit}²`;
      updatePayload.metadata = nextMetadata;
    }

    const savedPoints: TakeoffMeasurementPoint[] = points.map((point, index) => ({
      id: previousPoints[index]?.id ?? `${measurement.id}:${index}`,
      organization_id: resolved.organizationId,
      measurement_id: measurement.id,
      point_order: index,
      x: point.x,
      y: point.y,
      created_at: previousPoints[index]?.created_at ?? updateResult.data.created_at,
    }));

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        points: savedPoints,
        areaShapes: nextAreaShapes,
        linePaths: nextLinePaths,
        eventType: "updated",
        actorUserId: member.user_id,
        changeReason: `${measurement.measurement_kind === "area" ? "Area" : measurement.measurement_kind === "count" ? "Count" : "Line"} measurement geometry updated`,
        diff: {
          previous_points: previousPoints.map((point) => ({ x: point.x, y: point.y })),
          next_points: points,
          calibration_id: calibrationId,
          measurement_kind: measurement.measurement_kind,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        eventType: "takeoff_measurement_corrected",
        eventFamily: "correction",
        action: "corrected",
        pointCount: savedPoints.length,
        areaShapeCount: nextAreaShapes.length,
        linePathCount: nextLinePaths.length,
        beforeData: summarizeTakeoffMeasurement({
          measurement,
          pointCount: previousPoints.length,
          areaShapeCount: previousAreaShapes.length,
          linePathCount: previousLinePaths.length,
        }),
        afterData: summarizeTakeoffMeasurement({
          measurement: updateResult.data,
          pointCount: savedPoints.length,
          areaShapeCount: nextAreaShapes.length,
          linePathCount: nextLinePaths.length,
        }),
        diffData: {
          pageId: measurement.page_id,
          previousCalibrationId: measurement.calibration_id,
          nextCalibrationId: updateResult.data.calibration_id,
          quantityDelta:
            Number(updateResult.data.display_value ?? 0) - Number(measurement.display_value ?? 0),
        },
        reason: "Takeoff measurement geometry corrected.",
      })
    );

    return {
      ...updateResult.data,
      points: savedPoints,
      area_shapes: nextAreaShapes,
      line_paths: nextLinePaths,
    };
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      measurementId: input.measurementId,
    });
  }
}

export async function updateTakeoffMeasurementChildGeometryForOpportunity(
  input: UpdateTakeoffMeasurementChildGeometryInput
): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("updateTakeoffMeasurementChildGeometryForOpportunity");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: measurement, error: measurementError } = await perf.step("measurementLookup", () =>
      supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", input.measurementId)
        .maybeSingle()
    );

    if (measurementError || !measurement) {
      throw new Error("The selected measurement could not be found.");
    }

    if (measurement.status === "deleted") {
      throw new Error("Deleted measurements cannot be edited.");
    }

    if (
      (input.childKind === "area-shape" && measurement.measurement_kind !== "area") ||
      (input.childKind === "line-path" && measurement.measurement_kind !== "line")
    ) {
      throw new Error("The selected child does not match the measurement type.");
    }

    const { data: page, error: pageError } = await perf.step("pageLookup", () =>
      supabase
        .from("takeoff_pages")
        .select(takeoffPageSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", measurement.page_id)
        .maybeSingle()
    );

    if (pageError || !page) {
      throw new Error("The selected takeoff page could not be found.");
    }

    const activeCalibration = await perf.step("activeCalibrationLookup", () =>
      getActiveTakeoffCalibrationForPage(page.id, { supabase })
    );
    if (!activeCalibration) {
      throw new Error(
        input.childKind === "area-shape"
          ? "Manual area measurements require an active calibration."
          : "Manual line measurements require an active calibration."
      );
    }

    const normalizedPoints = normalizePoints(input.points, input.childKind === "area-shape" ? 3 : 2);
    const previousSnapshot = await perf.step("previousSnapshot", () =>
      hydrateTakeoffMeasurementWithChildren({
        measurement,
        supabase,
      })
    );

    if (input.childKind === "area-shape") {
      const existingShapes = previousSnapshot.area_shapes;
      const targetShape = existingShapes.find((shape) => shape.id === input.childId);
      if (!targetShape) {
        throw new Error("The selected area child could not be found.");
      }

      const nextMeasuredAreaBase =
        computePolygonAreaPts(page, normalizedPoints) *
        Number(activeCalibration.scale_ratio) *
        Number(activeCalibration.scale_ratio);
      const nextMeasuredPerimeterBase =
        computePolygonPerimeterPts(page, normalizedPoints) *
        Number(activeCalibration.scale_ratio);
      const nextBounds = computeMeasurementBoundingBox(normalizedPoints);

      const updateShapeResult = await perf.step("updateAreaShape", () =>
        supabase
          .from("takeoff_measurement_area_shapes")
          .update({
            measured_area_base: nextMeasuredAreaBase,
            measured_perimeter_base: nextMeasuredPerimeterBase,
            page_bbox_min_x: nextBounds.minX,
            page_bbox_min_y: nextBounds.minY,
            page_bbox_max_x: nextBounds.maxX,
            page_bbox_max_y: nextBounds.maxY,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetShape.id)
          .select(takeoffMeasurementAreaShapeSelect)
          .single()
      );

      if (updateShapeResult.error || !updateShapeResult.data) {
        throw new Error(updateShapeResult.error?.message ?? "Unable to update area shape.");
      }

      const deleteShapePointsResult = await perf.step("deleteAreaShapePoints", () =>
        supabase
          .from("takeoff_measurement_area_shape_points")
          .delete()
          .eq("area_shape_id", targetShape.id)
      );

      if (deleteShapePointsResult.error) {
        throw new Error(deleteShapePointsResult.error.message);
      }

      const insertShapePointsResult = await perf.step("insertAreaShapePoints", () =>
        supabase.from("takeoff_measurement_area_shape_points").insert(
          normalizedPoints.map((point, index) => ({
            organization_id: resolved.organizationId,
            area_shape_id: targetShape.id,
            point_order: index,
            x: point.x,
            y: point.y,
          }))
        )
      );

      if (insertShapePointsResult.error) {
        throw new Error(insertShapePointsResult.error.message);
      }

      const nextShapes = existingShapes.map((shape) =>
        shape.id === targetShape.id
          ? {
              ...(updateShapeResult.data as TakeoffMeasurementAreaShape),
              points: normalizedPoints.map((point, index) => ({
                id: targetShape.points[index]?.id ?? `${targetShape.id}:${index}`,
                organization_id: resolved.organizationId,
                area_shape_id: targetShape.id,
                point_order: index,
                x: point.x,
                y: point.y,
                created_at: targetShape.points[index]?.created_at ?? updateShapeResult.data.created_at,
              })),
            }
          : shape
      );
      const combinedBounds = combineMeasurementBoundingBoxes(
        nextShapes.map((shape) => ({
          minX: shape.page_bbox_min_x,
          minY: shape.page_bbox_min_y,
          maxX: shape.page_bbox_max_x,
          maxY: shape.page_bbox_max_y,
        }))
      );
      const nextMetadata = buildAreaMeasurementMetadata({
        metadata: measurement.metadata,
        areaShapes: nextShapes,
      });
      const totals = computeSignedAreaTotals({
        metadata: nextMetadata,
        areaShapes: nextShapes,
      });
      const displayValue = convertBaseAreaToDisplay({
        baseUnit: activeCalibration.base_unit,
        displayUnit: activeCalibration.display_unit,
        value: totals.measuredAreaBase,
      });
      const nextParentPoints = nextShapes[0]?.points.map((point) => ({ x: point.x, y: point.y })) ?? [];

      const updateMeasurementResult = await perf.step("updateMeasurement", () =>
        supabase
          .from("takeoff_measurements")
        .update({
          calibration_id: activeCalibration.id,
          measured_area_base: totals.measuredAreaBase,
          measured_perimeter_base: totals.measuredPerimeterBase,
          display_value: displayValue,
          display_unit: `${activeCalibration.display_unit}²`,
          page_bbox_min_x: combinedBounds.minX,
          page_bbox_min_y: combinedBounds.minY,
          page_bbox_max_x: combinedBounds.maxX,
          page_bbox_max_y: combinedBounds.maxY,
          metadata: nextMetadata,
          version: measurement.version + 1,
          updated_by: member.user_id,
        })
          .eq("id", measurement.id)
          .select(takeoffMeasurementSelect)
          .single()
      );

      if (updateMeasurementResult.error || !updateMeasurementResult.data) {
        throw new Error(updateMeasurementResult.error?.message ?? "Unable to update area totals.");
      }

      await perf.step("replaceParentPoints", () =>
        replaceTakeoffMeasurementPoints({
          organizationId: resolved.organizationId,
          measurementId: measurement.id,
          points: nextParentPoints,
          supabase,
        })
      );

      const nextMeasurement = await perf.step("hydrateNextMeasurement", () =>
        hydrateTakeoffMeasurementWithChildren({
          measurement: updateMeasurementResult.data,
          supabase,
        })
      );

      await perf.step("writeEvent", () =>
        writeTakeoffMeasurementEvent({
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updateMeasurementResult.data,
          points: nextMeasurement.points,
          areaShapes: nextMeasurement.area_shapes,
          linePaths: [],
          eventType: "updated",
          actorUserId: member.user_id,
          changeReason: "Area child geometry updated",
          diff: {
            measurement_kind: "area",
            child_kind: "area-shape",
            child_id: input.childId,
            previous_points: targetShape.points.map((point) => ({ x: point.x, y: point.y })),
            next_points: normalizedPoints,
          },
          supabase,
        })
      );

      await perf.step("writeIntelligenceEvent", () =>
        recordTakeoffMeasurementIntelligence({
          supabase,
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updateMeasurementResult.data,
          eventType: "takeoff_measurement_corrected",
          eventFamily: "correction",
          action: "corrected",
          pointCount: nextMeasurement.points.length,
          areaShapeCount: nextMeasurement.area_shapes.length,
          linePathCount: 0,
          beforeData: summarizeTakeoffMeasurement({
            measurement,
            pointCount: previousSnapshot.points.length,
            areaShapeCount: previousSnapshot.area_shapes.length,
            linePathCount: previousSnapshot.line_paths.length,
          }),
          afterData: summarizeTakeoffMeasurement({
            measurement: updateMeasurementResult.data,
            pointCount: nextMeasurement.points.length,
            areaShapeCount: nextMeasurement.area_shapes.length,
            linePathCount: 0,
          }),
          diffData: {
            childKind: "area-shape",
            childId: input.childId,
            quantityDelta:
              Number(updateMeasurementResult.data.display_value ?? 0) - Number(measurement.display_value ?? 0),
          },
          reason: "Takeoff area child geometry corrected.",
          childKind: "area-shape",
        })
      );

      return nextMeasurement;
    }

    const existingPaths = previousSnapshot.line_paths;
    const targetPath = existingPaths.find((path) => path.id === input.childId);
    if (!targetPath) {
      throw new Error("The selected polyline child could not be found.");
    }

    const nextMeasuredLengthBase = computePolylineLengthPts(page, normalizedPoints) * Number(activeCalibration.scale_ratio);
    const nextBounds = computeMeasurementBoundingBox(normalizedPoints);

    const updatePathResult = await perf.step("updateLinePath", () =>
      supabase
        .from("takeoff_measurement_line_paths")
        .update({
          measured_length_base: nextMeasuredLengthBase,
          page_bbox_min_x: nextBounds.minX,
          page_bbox_min_y: nextBounds.minY,
          page_bbox_max_x: nextBounds.maxX,
          page_bbox_max_y: nextBounds.maxY,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetPath.id)
        .select(takeoffMeasurementLinePathSelect)
        .single()
    );

    if (updatePathResult.error || !updatePathResult.data) {
      throw new Error(updatePathResult.error?.message ?? "Unable to update polyline path.");
    }

    const deletePathPointsResult = await perf.step("deleteLinePathPoints", () =>
      supabase
        .from("takeoff_measurement_line_path_points")
        .delete()
        .eq("line_path_id", targetPath.id)
    );

    if (deletePathPointsResult.error) {
      throw new Error(deletePathPointsResult.error.message);
    }

    const insertPathPointsResult = await perf.step("insertLinePathPoints", () =>
      supabase.from("takeoff_measurement_line_path_points").insert(
        normalizedPoints.map((point, index) => ({
          organization_id: resolved.organizationId,
          line_path_id: targetPath.id,
          point_order: index,
          x: point.x,
          y: point.y,
        }))
      )
    );

    if (insertPathPointsResult.error) {
      throw new Error(insertPathPointsResult.error.message);
    }

    const nextPaths = existingPaths.map((path) =>
      path.id === targetPath.id
        ? {
            ...(updatePathResult.data as TakeoffMeasurementLinePath),
            points: normalizedPoints.map((point, index) => ({
              id: targetPath.points[index]?.id ?? `${targetPath.id}:${index}`,
              organization_id: resolved.organizationId,
              line_path_id: targetPath.id,
              point_order: index,
              x: point.x,
              y: point.y,
              created_at: targetPath.points[index]?.created_at ?? updatePathResult.data.created_at,
            })),
          }
        : path
    );
    const combinedBounds = combineMeasurementBoundingBoxes(
      nextPaths.map((path) => ({
        minX: path.page_bbox_min_x,
        minY: path.page_bbox_min_y,
        maxX: path.page_bbox_max_x,
        maxY: path.page_bbox_max_y,
      }))
    );
    const totalMeasuredLengthBase = nextPaths.reduce((total, path) => total + Number(path.measured_length_base ?? 0), 0);
    const displayValue = convertBaseLengthToDisplay({
      baseUnit: activeCalibration.base_unit,
      displayUnit: activeCalibration.display_unit,
      value: totalMeasuredLengthBase,
    });
    const nextParentPoints = nextPaths[0]?.points.map((point) => ({ x: point.x, y: point.y })) ?? [];

    const updateMeasurementResult = await perf.step("updateMeasurement", () =>
      supabase
        .from("takeoff_measurements")
        .update({
          calibration_id: activeCalibration.id,
          measured_length_base: totalMeasuredLengthBase,
          display_value: displayValue,
          display_unit: activeCalibration.display_unit,
          page_bbox_min_x: combinedBounds.minX,
          page_bbox_min_y: combinedBounds.minY,
          page_bbox_max_x: combinedBounds.maxX,
          page_bbox_max_y: combinedBounds.maxY,
          version: measurement.version + 1,
          updated_by: member.user_id,
        })
        .eq("id", measurement.id)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (updateMeasurementResult.error || !updateMeasurementResult.data) {
      throw new Error(updateMeasurementResult.error?.message ?? "Unable to update polyline totals.");
    }

    await perf.step("replaceParentPoints", () =>
      replaceTakeoffMeasurementPoints({
        organizationId: resolved.organizationId,
        measurementId: measurement.id,
        points: nextParentPoints,
        supabase,
      })
    );

    const nextMeasurement = await perf.step("hydrateNextMeasurement", () =>
      hydrateTakeoffMeasurementWithChildren({
        measurement: updateMeasurementResult.data,
        supabase,
      })
    );

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateMeasurementResult.data,
        points: nextMeasurement.points,
        areaShapes: [],
        linePaths: nextMeasurement.line_paths,
        eventType: "updated",
        actorUserId: member.user_id,
        changeReason: "Polyline child geometry updated",
        diff: {
          measurement_kind: "line",
          child_kind: "line-path",
          child_id: input.childId,
          previous_points: targetPath.points.map((point) => ({ x: point.x, y: point.y })),
          next_points: normalizedPoints,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateMeasurementResult.data,
        eventType: "takeoff_measurement_corrected",
        eventFamily: "correction",
        action: "corrected",
        pointCount: nextMeasurement.points.length,
        areaShapeCount: 0,
        linePathCount: nextMeasurement.line_paths.length,
        beforeData: summarizeTakeoffMeasurement({
          measurement,
          pointCount: previousSnapshot.points.length,
          areaShapeCount: previousSnapshot.area_shapes.length,
          linePathCount: previousSnapshot.line_paths.length,
        }),
        afterData: summarizeTakeoffMeasurement({
          measurement: updateMeasurementResult.data,
          pointCount: nextMeasurement.points.length,
          areaShapeCount: 0,
          linePathCount: nextMeasurement.line_paths.length,
        }),
        diffData: {
          childKind: "line-path",
          childId: input.childId,
          quantityDelta:
            Number(updateMeasurementResult.data.display_value ?? 0) - Number(measurement.display_value ?? 0),
        },
        reason: "Takeoff polyline child geometry corrected.",
        childKind: "line-path",
      })
    );

    return nextMeasurement;
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      measurementId: input.measurementId,
      childId: input.childId,
      childKind: input.childKind,
    });
  }
}

export async function deleteTakeoffMeasurementChildForOpportunity(
  input: DeleteTakeoffMeasurementChildInput
): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("deleteTakeoffMeasurementChildForOpportunity");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: measurement, error: measurementError } = await perf.step("measurementLookup", () =>
      supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", input.measurementId)
        .maybeSingle()
    );

    if (measurementError || !measurement) {
      throw new Error("The selected measurement could not be found.");
    }

    if (measurement.status === "deleted") {
      throw new Error("Deleted measurements cannot be updated.");
    }

    const previousSnapshot = await perf.step("previousSnapshot", () =>
      hydrateTakeoffMeasurementWithChildren({
        measurement,
        supabase,
      })
    );

    if (input.childKind === "count-item") {
      if (measurement.measurement_kind !== "count") {
        throw new Error("The selected child does not match the measurement type.");
      }

      const existingPoints = previousSnapshot.points;
      const targetPoint =
        existingPoints.find((point) => point.id === input.childId) ??
        (() => {
          const fallbackPointOrder = getCountPointOrderFromChildId({
            measurementId: measurement.id,
            childId: input.childId,
          });

          if (fallbackPointOrder === null) {
            return null;
          }

          return existingPoints.find((point) => point.point_order === fallbackPointOrder) ?? null;
        })();
      if (!targetPoint) {
        throw new Error("The selected count child could not be found.");
      }

      if (existingPoints.length === 1) {
        const updateMeasurementResult = await perf.step("deleteParentMeasurement", () =>
          supabase
            .from("takeoff_measurements")
            .update({
              status: "deleted",
              version: measurement.version + 1,
              updated_by: member.user_id,
              archived_by: member.user_id,
              archived_at: new Date().toISOString(),
            })
            .eq("id", measurement.id)
            .select(takeoffMeasurementSelect)
            .single()
        );

        if (updateMeasurementResult.error || !updateMeasurementResult.data) {
          throw new Error(updateMeasurementResult.error?.message ?? "Unable to delete measurement.");
        }

        await perf.step("writeEvent", () =>
          writeTakeoffMeasurementEvent({
            organizationId: resolved.organizationId,
            projectId: resolved.projectId,
            opportunityId: resolved.opportunityId,
            measurement: updateMeasurementResult.data,
            points: [],
            areaShapes: [],
            linePaths: [],
            eventType: "deleted",
            actorUserId: member.user_id,
            changeReason: "Last count child deleted, measurement removed",
            diff: {
              measurement_kind: "count",
              child_kind: "count-item",
              child_id: input.childId,
              deleted_last_child: true,
            },
            supabase,
          })
        );

        await perf.step("writeIntelligenceEvent", () =>
          recordTakeoffMeasurementIntelligence({
            supabase,
            organizationId: resolved.organizationId,
            projectId: resolved.projectId,
            opportunityId: resolved.opportunityId,
            measurement: updateMeasurementResult.data,
            eventType: "takeoff_measurement_deleted",
            eventFamily: "entity_lifecycle",
            action: "deleted",
            pointCount: 0,
            areaShapeCount: 0,
            linePathCount: 0,
            beforeData: summarizeTakeoffMeasurement({
              measurement,
              pointCount: existingPoints.length,
              areaShapeCount: 0,
              linePathCount: 0,
            }),
            afterData: summarizeTakeoffMeasurement({
              measurement: updateMeasurementResult.data,
              pointCount: 0,
              areaShapeCount: 0,
              linePathCount: 0,
            }),
            diffData: {
              childKind: "count-item",
              childId: input.childId,
              deletedLastChild: true,
            },
            reason: "Last count point removed, deleting the takeoff measurement.",
            childKind: "count-item",
          })
        );

        return {
          ...updateMeasurementResult.data,
          points: [],
          area_shapes: [],
          line_paths: [],
        };
      }

      const deletePointResult = await perf.step("deleteCountPoint", () =>
        supabase
          .from("takeoff_measurement_points")
          .delete()
          .eq("id", input.childId)
      );

      if (deletePointResult.error) {
        throw new Error(deletePointResult.error.message);
      }

      const remainingPoints = existingPoints.filter((point) => point.id !== input.childId);

      await perf.step("reorderCountPoints", async () => {
        for (const [index, point] of remainingPoints.entries()) {
          if (point.point_order === index) {
            continue;
          }

          const reorderResult = await supabase
            .from("takeoff_measurement_points")
            .update({
              point_order: index,
            })
            .eq("id", point.id);

          if (reorderResult.error) {
            throw new Error(reorderResult.error.message);
          }
        }
      });

      const countItemValue = getCountItemValueFromMeasurement({
        measurement,
        pointCount: existingPoints.length,
      });
      const nextCountValue = countItemValue * remainingPoints.length;
      const nextBounds = computeMeasurementBoundingBox(
        remainingPoints.map((point) => ({ x: point.x, y: point.y }))
      );
      const nextMetadata = {
        ...(measurement.metadata && typeof measurement.metadata === "object" ? measurement.metadata : {}),
        countItemValue,
      };

      const updateMeasurementResult = await perf.step("updateMeasurement", () =>
        supabase
          .from("takeoff_measurements")
          .update({
            count_value: nextCountValue,
            display_value: nextCountValue,
            display_unit: "count",
            page_bbox_min_x: nextBounds.minX,
            page_bbox_min_y: nextBounds.minY,
            page_bbox_max_x: nextBounds.maxX,
            page_bbox_max_y: nextBounds.maxY,
            metadata: nextMetadata,
            version: measurement.version + 1,
            updated_by: member.user_id,
          })
          .eq("id", measurement.id)
          .select(takeoffMeasurementSelect)
          .single()
      );

      if (updateMeasurementResult.error || !updateMeasurementResult.data) {
        throw new Error(updateMeasurementResult.error?.message ?? "Unable to update count total.");
      }

      const nextMeasurement = await perf.step("hydrateNextMeasurement", () =>
        hydrateTakeoffMeasurementWithChildren({
          measurement: updateMeasurementResult.data,
          supabase,
        })
      );

      await perf.step("writeEvent", () =>
        writeTakeoffMeasurementEvent({
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updateMeasurementResult.data,
          points: nextMeasurement.points,
          areaShapes: [],
          linePaths: [],
          eventType: "updated",
          actorUserId: member.user_id,
          changeReason: "Count child deleted",
          diff: {
            measurement_kind: "count",
            child_kind: "count-item",
            child_id: input.childId,
            previous_child_count: existingPoints.length,
            next_child_count: nextMeasurement.points.length,
            count_item_value: countItemValue,
          },
          supabase,
        })
      );

      await perf.step("writeIntelligenceEvent", () =>
        recordTakeoffMeasurementIntelligence({
          supabase,
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updateMeasurementResult.data,
          eventType: "takeoff_measurement_corrected",
          eventFamily: "correction",
          action: "corrected",
          pointCount: nextMeasurement.points.length,
          areaShapeCount: 0,
          linePathCount: 0,
          beforeData: summarizeTakeoffMeasurement({
            measurement,
            pointCount: existingPoints.length,
            areaShapeCount: 0,
            linePathCount: 0,
          }),
          afterData: summarizeTakeoffMeasurement({
            measurement: updateMeasurementResult.data,
            pointCount: nextMeasurement.points.length,
            areaShapeCount: 0,
            linePathCount: 0,
          }),
          diffData: {
            childKind: "count-item",
            childId: input.childId,
            previousChildCount: existingPoints.length,
            nextChildCount: nextMeasurement.points.length,
          },
          reason: "Count point removed from the takeoff measurement.",
          childKind: "count-item",
        })
      );

      return nextMeasurement;
    }

    if (input.childKind === "area-shape") {
      if (measurement.measurement_kind !== "area") {
        throw new Error("The selected child does not match the measurement type.");
      }

      const existingShapes = previousSnapshot.area_shapes;
      const targetShape = existingShapes.find((shape) => shape.id === input.childId);
      if (!targetShape) {
        throw new Error("The selected area child could not be found.");
      }

      if (existingShapes.length === 1) {
        const updateMeasurementResult = await perf.step("deleteParentMeasurement", () =>
          supabase
            .from("takeoff_measurements")
            .update({
              status: "deleted",
              version: measurement.version + 1,
              updated_by: member.user_id,
              archived_by: member.user_id,
              archived_at: new Date().toISOString(),
            })
            .eq("id", measurement.id)
            .select(takeoffMeasurementSelect)
            .single()
        );

        if (updateMeasurementResult.error || !updateMeasurementResult.data) {
          throw new Error(updateMeasurementResult.error?.message ?? "Unable to delete measurement.");
        }

        await perf.step("writeEvent", () =>
          writeTakeoffMeasurementEvent({
            organizationId: resolved.organizationId,
            projectId: resolved.projectId,
            opportunityId: resolved.opportunityId,
            measurement: updateMeasurementResult.data,
            points: [],
            areaShapes: [],
            linePaths: [],
            eventType: "deleted",
            actorUserId: member.user_id,
            changeReason: "Last area child deleted, measurement removed",
            diff: {
              measurement_kind: "area",
              child_kind: "area-shape",
              child_id: input.childId,
              deleted_last_child: true,
            },
            supabase,
          })
        );

        await perf.step("writeIntelligenceEvent", () =>
          recordTakeoffMeasurementIntelligence({
            supabase,
            organizationId: resolved.organizationId,
            projectId: resolved.projectId,
            opportunityId: resolved.opportunityId,
            measurement: updateMeasurementResult.data,
            eventType: "takeoff_measurement_deleted",
            eventFamily: "entity_lifecycle",
            action: "deleted",
            pointCount: 0,
            areaShapeCount: 0,
            linePathCount: 0,
            beforeData: summarizeTakeoffMeasurement({
              measurement,
              pointCount: previousSnapshot.points.length,
              areaShapeCount: existingShapes.length,
              linePathCount: 0,
            }),
            afterData: summarizeTakeoffMeasurement({
              measurement: updateMeasurementResult.data,
              pointCount: 0,
              areaShapeCount: 0,
              linePathCount: 0,
            }),
            diffData: {
              childKind: "area-shape",
              childId: input.childId,
              deletedLastChild: true,
            },
            reason: "Last area shape removed, deleting the takeoff measurement.",
            childKind: "area-shape",
          })
        );

        return {
          ...updateMeasurementResult.data,
          points: [],
          area_shapes: [],
          line_paths: [],
        };
      }

      const deleteShapeResult = await perf.step("deleteAreaShape", () =>
        supabase
          .from("takeoff_measurement_area_shapes")
          .delete()
          .eq("id", input.childId)
      );

      if (deleteShapeResult.error) {
        throw new Error(deleteShapeResult.error.message);
      }

      const remainingShapes = existingShapes
        .filter((shape) => shape.id !== input.childId)
        .sort((left, right) => left.shape_order - right.shape_order);

      for (const [index, shape] of remainingShapes.entries()) {
        if (shape.shape_order === index) {
          continue;
        }

        const reorderResult = await perf.step(`reorderAreaShape:${shape.id}`, () =>
          supabase
            .from("takeoff_measurement_area_shapes")
            .update({
              shape_order: index,
              updated_at: new Date().toISOString(),
            })
            .eq("id", shape.id)
        );

        if (reorderResult.error) {
          throw new Error(reorderResult.error.message);
        }
      }

      const combinedBounds = combineMeasurementBoundingBoxes(
        remainingShapes.map((shape) => ({
          minX: shape.page_bbox_min_x,
          minY: shape.page_bbox_min_y,
          maxX: shape.page_bbox_max_x,
          maxY: shape.page_bbox_max_y,
        }))
      );
      const nextMetadata = buildAreaMeasurementMetadata({
        metadata: measurement.metadata,
        areaShapes: remainingShapes,
      });
      const shouldDeleteMeasurement =
        remainingShapes.length === 0 ||
        !hasIncludedAreaShape({
          metadata: nextMetadata,
          areaShapes: remainingShapes,
        });

      if (shouldDeleteMeasurement) {
        const updateMeasurementResult = await perf.step("deleteParentMeasurementWithoutIncludeShape", () =>
          supabase
            .from("takeoff_measurements")
            .update({
              status: "deleted",
              version: measurement.version + 1,
              updated_by: member.user_id,
              archived_by: member.user_id,
              archived_at: new Date().toISOString(),
            })
            .eq("id", measurement.id)
            .select(takeoffMeasurementSelect)
            .single()
        );

        if (updateMeasurementResult.error || !updateMeasurementResult.data) {
          throw new Error(updateMeasurementResult.error?.message ?? "Unable to delete measurement.");
        }

        await perf.step("writeDeleteEvent", () =>
          writeTakeoffMeasurementEvent({
            organizationId: resolved.organizationId,
            projectId: resolved.projectId,
            opportunityId: resolved.opportunityId,
            measurement: updateMeasurementResult.data,
            points: [],
            areaShapes: [],
            linePaths: [],
            eventType: "deleted",
            actorUserId: member.user_id,
            changeReason: "Area child deleted, no include shapes remain",
            diff: {
              measurement_kind: "area",
              child_kind: "area-shape",
              child_id: input.childId,
              deleted_last_include_shape: true,
            },
            supabase,
          })
        );

        await perf.step("writeIntelligenceEvent", () =>
          recordTakeoffMeasurementIntelligence({
            supabase,
            organizationId: resolved.organizationId,
            projectId: resolved.projectId,
            opportunityId: resolved.opportunityId,
            measurement: updateMeasurementResult.data,
            eventType: "takeoff_measurement_deleted",
            eventFamily: "entity_lifecycle",
            action: "deleted",
            pointCount: 0,
            areaShapeCount: 0,
            linePathCount: 0,
            beforeData: summarizeTakeoffMeasurement({
              measurement,
              pointCount: previousSnapshot.points.length,
              areaShapeCount: existingShapes.length,
              linePathCount: 0,
            }),
            afterData: summarizeTakeoffMeasurement({
              measurement: updateMeasurementResult.data,
              pointCount: 0,
              areaShapeCount: 0,
              linePathCount: 0,
            }),
            diffData: {
              childKind: "area-shape",
              childId: input.childId,
              deletedLastIncludeShape: true,
            },
            reason: "Area shape removed and no included shapes remain.",
            childKind: "area-shape",
          })
        );

        return {
          ...updateMeasurementResult.data,
          points: [],
          area_shapes: [],
          line_paths: [],
        };
      }

      const totals = computeSignedAreaTotals({
        metadata: nextMetadata,
        areaShapes: remainingShapes,
      });
      const { data: page, error: pageError } = await perf.step("pageLookup", () =>
        supabase
          .from("takeoff_pages")
          .select(takeoffPageSelect)
          .eq("organization_id", resolved.organizationId)
          .eq("project_id", resolved.projectId)
          .eq("id", measurement.page_id)
          .maybeSingle()
      );

      if (pageError || !page) {
        throw new Error("The selected takeoff page could not be found.");
      }

      const activeCalibration = await perf.step("activeCalibrationLookup", () =>
        getActiveTakeoffCalibrationForPage(page.id, { supabase })
      );
      if (!activeCalibration) {
        throw new Error("Manual area measurements require an active calibration.");
      }

      const displayValue = convertBaseAreaToDisplay({
        baseUnit: activeCalibration.base_unit,
        displayUnit: activeCalibration.display_unit,
        value: totals.measuredAreaBase,
      });
      const nextParentPoints = remainingShapes[0]?.points.map((point) => ({ x: point.x, y: point.y })) ?? [];

      const updateMeasurementResult = await perf.step("updateMeasurement", () =>
        supabase
          .from("takeoff_measurements")
        .update({
          calibration_id: activeCalibration.id,
          measured_area_base: totals.measuredAreaBase,
          measured_perimeter_base: totals.measuredPerimeterBase,
          display_value: displayValue,
          display_unit: `${activeCalibration.display_unit}²`,
          page_bbox_min_x: combinedBounds.minX,
          page_bbox_min_y: combinedBounds.minY,
          page_bbox_max_x: combinedBounds.maxX,
          page_bbox_max_y: combinedBounds.maxY,
          metadata: nextMetadata,
          version: measurement.version + 1,
          updated_by: member.user_id,
        })
          .eq("id", measurement.id)
          .select(takeoffMeasurementSelect)
          .single()
      );

      if (updateMeasurementResult.error || !updateMeasurementResult.data) {
        throw new Error(updateMeasurementResult.error?.message ?? "Unable to update area totals.");
      }

      await perf.step("replaceParentPoints", () =>
        replaceTakeoffMeasurementPoints({
          organizationId: resolved.organizationId,
          measurementId: measurement.id,
          points: nextParentPoints,
          supabase,
        })
      );

      const nextMeasurement = await perf.step("hydrateNextMeasurement", () =>
        hydrateTakeoffMeasurementWithChildren({
          measurement: updateMeasurementResult.data,
          supabase,
        })
      );

      await perf.step("writeEvent", () =>
        writeTakeoffMeasurementEvent({
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updateMeasurementResult.data,
          points: nextMeasurement.points,
          areaShapes: nextMeasurement.area_shapes,
          linePaths: [],
          eventType: "updated",
          actorUserId: member.user_id,
          changeReason: "Area child deleted",
          diff: {
            measurement_kind: "area",
            child_kind: "area-shape",
            child_id: input.childId,
            previous_child_count: existingShapes.length,
            next_child_count: nextMeasurement.area_shapes.length,
          },
          supabase,
        })
      );

      await perf.step("writeIntelligenceEvent", () =>
        recordTakeoffMeasurementIntelligence({
          supabase,
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updateMeasurementResult.data,
          eventType: "takeoff_measurement_corrected",
          eventFamily: "correction",
          action: "corrected",
          pointCount: nextMeasurement.points.length,
          areaShapeCount: nextMeasurement.area_shapes.length,
          linePathCount: 0,
          beforeData: summarizeTakeoffMeasurement({
            measurement,
            pointCount: previousSnapshot.points.length,
            areaShapeCount: existingShapes.length,
            linePathCount: 0,
          }),
          afterData: summarizeTakeoffMeasurement({
            measurement: updateMeasurementResult.data,
            pointCount: nextMeasurement.points.length,
            areaShapeCount: nextMeasurement.area_shapes.length,
            linePathCount: 0,
          }),
          diffData: {
            childKind: "area-shape",
            childId: input.childId,
            previousChildCount: existingShapes.length,
            nextChildCount: nextMeasurement.area_shapes.length,
          },
          reason: "Area shape removed from the takeoff measurement.",
          childKind: "area-shape",
        })
      );

      return nextMeasurement;
    }

    if (measurement.measurement_kind !== "line") {
      throw new Error("The selected child does not match the measurement type.");
    }

    const existingPaths = previousSnapshot.line_paths;
    const targetPath = existingPaths.find((path) => path.id === input.childId);
    if (!targetPath) {
      throw new Error("The selected polyline child could not be found.");
    }

    if (existingPaths.length === 1) {
      const updateMeasurementResult = await perf.step("deleteParentMeasurement", () =>
        supabase
          .from("takeoff_measurements")
          .update({
            status: "deleted",
            version: measurement.version + 1,
            updated_by: member.user_id,
            archived_by: member.user_id,
            archived_at: new Date().toISOString(),
          })
          .eq("id", measurement.id)
          .select(takeoffMeasurementSelect)
          .single()
      );

      if (updateMeasurementResult.error || !updateMeasurementResult.data) {
        throw new Error(updateMeasurementResult.error?.message ?? "Unable to delete measurement.");
      }

      await perf.step("writeEvent", () =>
        writeTakeoffMeasurementEvent({
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updateMeasurementResult.data,
          points: [],
          areaShapes: [],
          linePaths: [],
          eventType: "deleted",
          actorUserId: member.user_id,
          changeReason: "Last polyline child deleted, measurement removed",
          diff: {
            measurement_kind: "line",
            child_kind: "line-path",
            child_id: input.childId,
            deleted_last_child: true,
          },
          supabase,
        })
      );

      await perf.step("writeIntelligenceEvent", () =>
        recordTakeoffMeasurementIntelligence({
          supabase,
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updateMeasurementResult.data,
          eventType: "takeoff_measurement_deleted",
          eventFamily: "entity_lifecycle",
          action: "deleted",
          pointCount: 0,
          areaShapeCount: 0,
          linePathCount: 0,
          beforeData: summarizeTakeoffMeasurement({
            measurement,
            pointCount: previousSnapshot.points.length,
            areaShapeCount: 0,
            linePathCount: existingPaths.length,
          }),
          afterData: summarizeTakeoffMeasurement({
            measurement: updateMeasurementResult.data,
            pointCount: 0,
            areaShapeCount: 0,
            linePathCount: 0,
          }),
          diffData: {
            childKind: "line-path",
            childId: input.childId,
            deletedLastChild: true,
          },
          reason: "Last polyline path removed, deleting the takeoff measurement.",
          childKind: "line-path",
        })
      );

      return {
        ...updateMeasurementResult.data,
        points: [],
        area_shapes: [],
        line_paths: [],
      };
    }

    const deletePathResult = await perf.step("deleteLinePath", () =>
      supabase
        .from("takeoff_measurement_line_paths")
        .delete()
        .eq("id", input.childId)
    );

    if (deletePathResult.error) {
      throw new Error(deletePathResult.error.message);
    }

    const remainingPaths = existingPaths
      .filter((path) => path.id !== input.childId)
      .sort((left, right) => left.path_order - right.path_order);

    for (const [index, path] of remainingPaths.entries()) {
      if (path.path_order === index) {
        continue;
      }

      const reorderResult = await perf.step(`reorderLinePath:${path.id}`, () =>
        supabase
          .from("takeoff_measurement_line_paths")
          .update({
            path_order: index,
            updated_at: new Date().toISOString(),
          })
          .eq("id", path.id)
      );

      if (reorderResult.error) {
        throw new Error(reorderResult.error.message);
      }
    }

    const combinedBounds = combineMeasurementBoundingBoxes(
      remainingPaths.map((path) => ({
        minX: path.page_bbox_min_x,
        minY: path.page_bbox_min_y,
        maxX: path.page_bbox_max_x,
        maxY: path.page_bbox_max_y,
      }))
    );
    const totalMeasuredLengthBase = remainingPaths.reduce((total, path) => total + Number(path.measured_length_base ?? 0), 0);
    const { data: page, error: pageError } = await perf.step("pageLookup", () =>
      supabase
        .from("takeoff_pages")
        .select(takeoffPageSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", measurement.page_id)
        .maybeSingle()
    );

    if (pageError || !page) {
      throw new Error("The selected takeoff page could not be found.");
    }

    const activeCalibration = await perf.step("activeCalibrationLookup", () =>
      getActiveTakeoffCalibrationForPage(page.id, { supabase })
    );
    if (!activeCalibration) {
      throw new Error("Manual line measurements require an active calibration.");
    }

    const displayValue = convertBaseLengthToDisplay({
      baseUnit: activeCalibration.base_unit,
      displayUnit: activeCalibration.display_unit,
      value: totalMeasuredLengthBase,
    });
    const nextParentPoints = remainingPaths[0]?.points.map((point) => ({ x: point.x, y: point.y })) ?? [];

    const updateMeasurementResult = await perf.step("updateMeasurement", () =>
      supabase
        .from("takeoff_measurements")
        .update({
          calibration_id: activeCalibration.id,
          measured_length_base: totalMeasuredLengthBase,
          display_value: displayValue,
          display_unit: activeCalibration.display_unit,
          page_bbox_min_x: combinedBounds.minX,
          page_bbox_min_y: combinedBounds.minY,
          page_bbox_max_x: combinedBounds.maxX,
          page_bbox_max_y: combinedBounds.maxY,
          version: measurement.version + 1,
          updated_by: member.user_id,
        })
        .eq("id", measurement.id)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (updateMeasurementResult.error || !updateMeasurementResult.data) {
      throw new Error(updateMeasurementResult.error?.message ?? "Unable to update polyline totals.");
    }

    await perf.step("replaceParentPoints", () =>
      replaceTakeoffMeasurementPoints({
        organizationId: resolved.organizationId,
        measurementId: measurement.id,
        points: nextParentPoints,
        supabase,
      })
    );

    const nextMeasurement = await perf.step("hydrateNextMeasurement", () =>
      hydrateTakeoffMeasurementWithChildren({
        measurement: updateMeasurementResult.data,
        supabase,
      })
    );

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateMeasurementResult.data,
        points: nextMeasurement.points,
        areaShapes: [],
        linePaths: nextMeasurement.line_paths,
        eventType: "updated",
        actorUserId: member.user_id,
        changeReason: "Polyline child deleted",
        diff: {
          measurement_kind: "line",
          child_kind: "line-path",
          child_id: input.childId,
          previous_child_count: existingPaths.length,
          next_child_count: nextMeasurement.line_paths.length,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateMeasurementResult.data,
        eventType: "takeoff_measurement_corrected",
        eventFamily: "correction",
        action: "corrected",
        pointCount: nextMeasurement.points.length,
        areaShapeCount: 0,
        linePathCount: nextMeasurement.line_paths.length,
        beforeData: summarizeTakeoffMeasurement({
          measurement,
          pointCount: previousSnapshot.points.length,
          areaShapeCount: 0,
          linePathCount: existingPaths.length,
        }),
        afterData: summarizeTakeoffMeasurement({
          measurement: updateMeasurementResult.data,
          pointCount: nextMeasurement.points.length,
          areaShapeCount: 0,
          linePathCount: nextMeasurement.line_paths.length,
        }),
        diffData: {
          childKind: "line-path",
          childId: input.childId,
          previousChildCount: existingPaths.length,
          nextChildCount: nextMeasurement.line_paths.length,
        },
        reason: "Polyline path removed from the takeoff measurement.",
        childKind: "line-path",
      })
    );

    return nextMeasurement;
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      measurementId: input.measurementId,
      childId: input.childId,
      childKind: input.childKind,
    });
  }
}

export async function updateTakeoffMeasurementDetailsForOpportunity(
  input: UpdateTakeoffMeasurementDetailsInput
): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("updateTakeoffMeasurementDetailsForOpportunity");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(input.opportunitySlug)
    );
    const { data: measurement, error: measurementError } = await perf.step("measurementLookup", () =>
      supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("id", input.measurementId)
        .maybeSingle()
    );

    if (measurementError || !measurement) {
      throw new Error("The selected measurement could not be found.");
    }

    if (measurement.status === "deleted") {
      throw new Error("Deleted measurements cannot be renamed or tagged.");
    }

    const nextName = (input.name ?? measurement.name).trim();
    const nextDescription = (input.description ?? measurement.description ?? "").trim();
    const nextTag = (input.tag ?? "").trim();
    const nextColorHex =
      input.colorHex === undefined
        ? measurement.color_hex
        : normalizeOptionalColor(input.colorHex);
    const nextMetadata = {
      ...(measurement.metadata && typeof measurement.metadata === "object" ? measurement.metadata : {}),
      tag: nextTag || null,
    };

    const updatePayload: Database["public"]["Tables"]["takeoff_measurements"]["Update"] = {
      name: nextName || measurement.name,
      description: nextDescription,
      color_hex: nextColorHex,
      metadata: nextMetadata,
      version: measurement.version + 1,
      updated_by: member.user_id,
    };

    const updateResult = await perf.step("updateMeasurementDetails", () =>
      supabase
        .from("takeoff_measurements")
        .update(updatePayload)
        .eq("id", measurement.id)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (updateResult.error || !updateResult.data) {
      throw new Error(updateResult.error?.message ?? "Unable to update measurement details.");
    }

    const points = await perf.step("pointsLookup", () =>
      getTakeoffMeasurementPointsForMeasurement(measurement.id, { supabase })
    );
    const areaShapes = updateResult.data.measurement_kind === "area"
      ? (await perf.step("areaShapesLookup", () =>
          getTakeoffAreaShapesForMeasurements([measurement.id], { supabase })
        ))[measurement.id] ?? []
      : [];
    const linePaths = updateResult.data.measurement_kind === "line"
      ? (await perf.step("linePathsLookup", () =>
          getTakeoffLinePathsForMeasurements([measurement.id], { supabase })
        ))[measurement.id] ?? []
      : [];

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        points,
        areaShapes,
        linePaths,
        eventType: "updated",
        actorUserId: member.user_id,
        changeReason: "Measurement details updated",
        diff: {
          previous_name: measurement.name,
          next_name: updateResult.data.name,
          previous_description: measurement.description,
          next_description: updateResult.data.description,
          previous_color_hex: measurement.color_hex,
          next_color_hex: updateResult.data.color_hex,
          previous_tag: typeof measurement.metadata === "object" && measurement.metadata ? (measurement.metadata as Record<string, unknown>).tag ?? null : null,
          next_tag: nextTag || null,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updateResult.data,
        eventType: "takeoff_measurement_updated",
        eventFamily: "commercial_action",
        action: "updated",
        pointCount: points.length,
        areaShapeCount: areaShapes.length,
        linePathCount: linePaths.length,
        beforeData: summarizeTakeoffMeasurement({
          measurement,
          pointCount: points.length,
          areaShapeCount: areaShapes.length,
          linePathCount: linePaths.length,
        }),
        afterData: summarizeTakeoffMeasurement({
          measurement: updateResult.data,
          pointCount: points.length,
          areaShapeCount: areaShapes.length,
          linePathCount: linePaths.length,
        }),
        diffData: {
          previousName: measurement.name,
          nextName: updateResult.data.name,
          previousTag:
            typeof measurement.metadata === "object" && measurement.metadata
              ? (() => {
                  const rawTag = (measurement.metadata as Record<string, unknown>).tag;
                  return typeof rawTag === "string" || typeof rawTag === "number" || typeof rawTag === "boolean"
                    ? rawTag
                    : null;
                })()
              : null,
          nextTag: nextTag || null,
        },
        reason: "Takeoff measurement details updated.",
      })
    );

    return {
      ...updateResult.data,
      points,
      area_shapes: areaShapes,
      line_paths: linePaths,
    };
  } finally {
    perf.flush({
      opportunitySlug: input.opportunitySlug,
      measurementId: input.measurementId,
    });
  }
}

export async function updateTakeoffMeasurementStatusForOpportunity(params: {
  opportunitySlug: string;
  drawingSetId: string;
  pageId: string;
  measurementId: string;
  action: "archive" | "delete" | "restore";
}): Promise<TakeoffMeasurementWithPoints> {
  const perf = createTakeoffPerfTrace("updateTakeoffMeasurementStatusForOpportunity");
  try {
    const { member, resolved, supabase } = await perf.step("context", () =>
      createValidatedTakeoffMutationContext(params.opportunitySlug)
    );
    const { data: measurement, error: measurementError } = await perf.step("measurementLookup", () =>
      supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("drawing_set_id", params.drawingSetId)
        .eq("page_id", params.pageId)
        .eq("id", params.measurementId)
        .maybeSingle()
    );

    if (measurementError || !measurement) {
      throw new Error("The selected measurement could not be found.");
    }

    const transition = resolveTakeoffMeasurementStatusTransition(measurement.status, params.action);
    const nextStatus = transition.nextStatus;
    if (!transition.shouldMutate) {
      if (nextStatus === "deleted") {
        return {
          ...measurement,
          points: [],
          area_shapes: [],
          line_paths: [],
        };
      }

      return hydrateTakeoffMeasurementWithChildren({ measurement, supabase });
    }
    const nextVersion = measurement.version + 1;
    const updatePayload: Database["public"]["Tables"]["takeoff_measurements"]["Update"] = {
      status: nextStatus,
      version: nextVersion,
      updated_by: member.user_id,
      archived_by: nextStatus === "active" ? null : member.user_id,
      archived_at: nextStatus === "active" ? null : new Date().toISOString(),
    };

    const updateResult = await perf.step("updateMeasurementStatus", () =>
      supabase
        .from("takeoff_measurements")
        .update(updatePayload)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("drawing_set_id", params.drawingSetId)
        .eq("page_id", params.pageId)
        .eq("id", measurement.id)
        .eq("status", measurement.status)
        .select(takeoffMeasurementSelect)
        .single()
    );

    if (updateResult.error || !updateResult.data) {
      const { data: concurrentMeasurement } = await supabase
        .from("takeoff_measurements")
        .select(takeoffMeasurementSelect)
        .eq("organization_id", resolved.organizationId)
        .eq("project_id", resolved.projectId)
        .eq("drawing_set_id", params.drawingSetId)
        .eq("page_id", params.pageId)
        .eq("id", measurement.id)
        .maybeSingle();
      if (concurrentMeasurement?.status === nextStatus) {
        if (nextStatus === "deleted") {
          return { ...concurrentMeasurement, points: [], area_shapes: [], line_paths: [] };
        }
        return hydrateTakeoffMeasurementWithChildren({ measurement: concurrentMeasurement, supabase });
      }
      throw new Error("Unable to update measurement status.");
    }

    const updatedMeasurement = updateResult.data;
    const eventType = params.action === "archive"
      ? "archived"
      : params.action === "delete"
        ? "deleted"
        : "restored";

    if (params.action === "delete") {
      void writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updatedMeasurement,
        points: [],
        eventType,
        actorUserId: member.user_id,
        changeReason: `Measurement ${params.action}d`,
        diff: {
          previous_status: measurement.status,
          next_status: updatedMeasurement.status,
        },
        supabase,
      }).catch((error) => {
        console.error("Failed to record takeoff measurement delete event", {
          measurementId: updatedMeasurement.id,
          error,
        });
      });

      await perf.step("writeIntelligenceEvent", () =>
        recordTakeoffMeasurementIntelligence({
          supabase,
          organizationId: resolved.organizationId,
          projectId: resolved.projectId,
          opportunityId: resolved.opportunityId,
          measurement: updatedMeasurement,
          eventType: "takeoff_measurement_deleted",
          eventFamily: "entity_lifecycle",
          action: "deleted",
          pointCount: 0,
          areaShapeCount: 0,
          linePathCount: 0,
          beforeData: summarizeTakeoffMeasurement({
            measurement,
            pointCount: 0,
            areaShapeCount: 0,
            linePathCount: 0,
          }),
          afterData: summarizeTakeoffMeasurement({
            measurement: updatedMeasurement,
            pointCount: 0,
            areaShapeCount: 0,
            linePathCount: 0,
          }),
          diffData: {
            previousStatus: measurement.status,
            nextStatus: updatedMeasurement.status,
          },
          reason: "Takeoff measurement deleted.",
        })
      );

      return {
        ...updatedMeasurement,
        points: [],
        area_shapes: [],
        line_paths: [],
      };
    }

    const points = await perf.step("pointsLookup", () =>
      getTakeoffMeasurementPointsForMeasurement(updatedMeasurement.id, { supabase })
    );
    const areaShapes = updatedMeasurement.measurement_kind === "area"
      ? (await perf.step("areaShapesLookup", () =>
          getTakeoffAreaShapesForMeasurements([updatedMeasurement.id], { supabase })
        ))[updatedMeasurement.id] ?? []
      : [];
    const linePaths = updatedMeasurement.measurement_kind === "line"
      ? (await perf.step("linePathsLookup", () =>
          getTakeoffLinePathsForMeasurements([updatedMeasurement.id], { supabase })
        ))[updatedMeasurement.id] ?? []
      : [];

    await perf.step("writeEvent", () =>
      writeTakeoffMeasurementEvent({
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updatedMeasurement,
        points,
        areaShapes,
        linePaths,
        eventType,
        actorUserId: member.user_id,
        changeReason: `Measurement ${params.action}d`,
        diff: {
          previous_status: measurement.status,
          next_status: updatedMeasurement.status,
        },
        supabase,
      })
    );

    await perf.step("writeIntelligenceEvent", () =>
      recordTakeoffMeasurementIntelligence({
        supabase,
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        opportunityId: resolved.opportunityId,
        measurement: updatedMeasurement,
        eventType: params.action === "archive"
          ? "takeoff_measurement_archived"
          : "takeoff_measurement_restored",
        eventFamily: "entity_lifecycle",
        action: params.action === "archive" ? "archived" : "restored",
        pointCount: points.length,
        areaShapeCount: areaShapes.length,
        linePathCount: linePaths.length,
        beforeData: summarizeTakeoffMeasurement({
          measurement,
          pointCount: points.length,
          areaShapeCount: areaShapes.length,
          linePathCount: linePaths.length,
        }),
        afterData: summarizeTakeoffMeasurement({
          measurement: updatedMeasurement,
          pointCount: points.length,
          areaShapeCount: areaShapes.length,
          linePathCount: linePaths.length,
        }),
        diffData: {
          previousStatus: measurement.status,
          nextStatus: updatedMeasurement.status,
        },
        reason: params.action === "archive"
          ? "Takeoff measurement archived."
          : "Takeoff measurement restored.",
      })
    );

    return {
      ...updatedMeasurement,
      points,
      area_shapes: areaShapes,
      line_paths: linePaths,
    };
  } finally {
    perf.flush({
      opportunitySlug: params.opportunitySlug,
      measurementId: params.measurementId,
      action: params.action,
    });
  }
}
