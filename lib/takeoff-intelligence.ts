import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

type TakeoffMeasurementLike = Pick<
  Database["public"]["Tables"]["takeoff_measurements"]["Row"],
  | "id"
  | "drawing_set_id"
  | "page_id"
  | "calibration_id"
  | "group_id"
  | "measurement_kind"
  | "status"
  | "source"
  | "name"
  | "display_value"
  | "display_unit"
  | "quantity"
  | "count_value"
  | "measured_length_base"
  | "measured_area_base"
  | "measured_perimeter_base"
  | "page_bbox_min_x"
  | "page_bbox_min_y"
  | "page_bbox_max_x"
  | "page_bbox_max_y"
  | "ai_confidence"
  | "ai_model"
  | "ai_run_id"
>;

type TakeoffCalibrationLike = Pick<
  Database["public"]["Tables"]["takeoff_calibrations"]["Row"],
  | "id"
  | "page_id"
  | "name"
  | "scale_ratio"
  | "unit_system"
  | "base_unit"
  | "display_unit"
  | "reference_length_input"
  | "reference_length_base"
  | "is_active"
  | "superseded_by"
>;

type TakeoffIntelligenceEventType =
  | "takeoff_measurement_created"
  | "takeoff_measurement_updated"
  | "takeoff_measurement_corrected"
  | "takeoff_measurement_archived"
  | "takeoff_measurement_deleted"
  | "takeoff_measurement_restored"
  | "takeoff_calibration_created"
  | "takeoff_calibration_corrected";

type TakeoffEventFamily = "entity_lifecycle" | "correction" | "commercial_action";

type TakeoffAction =
  | "created"
  | "updated"
  | "corrected"
  | "archived"
  | "deleted"
  | "restored";

export type TakeoffIntelligenceEventInput = {
  organizationId: string;
  projectId: string;
  opportunityId?: string | null;
  eventFamily: TakeoffEventFamily;
  eventType: TakeoffIntelligenceEventType;
  action: TakeoffAction;
  entityType: "takeoff_measurement" | "takeoff_calibration";
  entityId: string;
  beforeData?: Record<string, Json | null> | null;
  afterData?: Record<string, Json | null> | null;
  diffData?: Record<string, Json | null>;
  metadata?: Record<string, Json>;
  reason?: string | null;
  occurredAt?: string;
  sourceChannel?: "web" | "rpc";
};

export type TakeoffCorrectionEventInput = {
  organizationId: string;
  projectId: string;
  opportunityId?: string | null;
  correctionType: "measurement_fix" | "manual_override";
  targetEntityType: "takeoff_measurement" | "takeoff_calibration";
  targetEntityId: string;
  correctedFieldName?: string | null;
  incorrectValue?: Json | null;
  correctedValue?: Json | null;
  correctionReason?: string | null;
  feedbackLabel?: string | null;
  linkedEventId?: string | null;
  isTrainingEligible?: boolean;
};

export function summarizeTakeoffMeasurement(input: {
  measurement: TakeoffMeasurementLike;
  pointCount?: number;
  areaShapeCount?: number;
  linePathCount?: number;
}) {
  const pointCount = input.pointCount ?? 0;
  const areaShapeCount = input.areaShapeCount ?? 0;
  const linePathCount = input.linePathCount ?? 0;
  const childCount =
    input.measurement.measurement_kind === "area"
      ? areaShapeCount
      : input.measurement.measurement_kind === "line"
        ? linePathCount
        : pointCount;

  return {
    drawingSetId: input.measurement.drawing_set_id,
    pageId: input.measurement.page_id,
    calibrationId: input.measurement.calibration_id,
    groupId: input.measurement.group_id,
    measurementKind: input.measurement.measurement_kind,
    status: input.measurement.status,
    source: input.measurement.source,
    name: input.measurement.name,
    quantity: input.measurement.quantity,
    countValue: input.measurement.count_value,
    displayValue: input.measurement.display_value,
    displayUnit: input.measurement.display_unit,
    measuredLengthBase: input.measurement.measured_length_base,
    measuredAreaBase: input.measurement.measured_area_base,
    measuredPerimeterBase: input.measurement.measured_perimeter_base,
    pointCount,
    childCount,
    areaShapeCount,
    linePathCount,
    boundingBox: {
      minX: input.measurement.page_bbox_min_x,
      minY: input.measurement.page_bbox_min_y,
      maxX: input.measurement.page_bbox_max_x,
      maxY: input.measurement.page_bbox_max_y,
    },
    aiConfidence:
      typeof input.measurement.ai_confidence === "number" ? input.measurement.ai_confidence : null,
    aiModel: input.measurement.ai_model ?? null,
    aiRunId: input.measurement.ai_run_id ?? null,
  } satisfies Record<string, Json | null>;
}

export function summarizeTakeoffCalibration(calibration: TakeoffCalibrationLike) {
  return {
    pageId: calibration.page_id,
    name: calibration.name,
    scaleRatio: calibration.scale_ratio,
    unitSystem: calibration.unit_system,
    baseUnit: calibration.base_unit,
    displayUnit: calibration.display_unit,
    referenceLengthInput: calibration.reference_length_input,
    referenceLengthBase: calibration.reference_length_base,
    isActive: calibration.is_active,
    supersededBy: calibration.superseded_by,
  } satisfies Record<string, Json | null>;
}

export function buildTakeoffIntelligenceEvent(input: TakeoffIntelligenceEventInput) {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    opportunityId: input.opportunityId ?? null,
    module: "takeoff",
    eventFamily: input.eventFamily,
    eventType: input.eventType,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    sourceChannel: input.sourceChannel ?? "web",
    beforeData: input.beforeData ?? null,
    afterData: input.afterData ?? null,
    diffData: input.diffData ?? {},
    metadata: input.metadata ?? {},
    reason: input.reason ?? null,
    privacyClassification: "commercial_sensitive",
    visibilityScope: "organization",
    containsFinancialData: false,
    containsPersonalData: false,
    containsAttachmentContent: false,
    occurredAt: input.occurredAt,
  };
}

export async function writeTakeoffIntelligenceEvent(
  supabase: AppSupabaseClient,
  event: ReturnType<typeof buildTakeoffIntelligenceEvent>
) {
  const { data, error } = await supabase.rpc("write_intelligence_event" as never, {
    p_input: event,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function writeTakeoffIntelligenceEvents(
  supabase: AppSupabaseClient,
  events: Array<ReturnType<typeof buildTakeoffIntelligenceEvent>>
) {
  const { error } = await supabase.rpc("write_intelligence_events" as never, {
    p_events: events,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

export async function writeTakeoffCorrectionEvent(
  supabase: AppSupabaseClient,
  input: TakeoffCorrectionEventInput
) {
  const { data, error } = await supabase.rpc("write_correction_event" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      opportunityId: input.opportunityId ?? null,
      module: "takeoff",
      correctionType: input.correctionType,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      linkedEventId: input.linkedEventId ?? null,
      correctedFieldName: input.correctedFieldName ?? null,
      incorrectValue: input.incorrectValue ?? null,
      correctedValue: input.correctedValue ?? null,
      correctionReason: input.correctionReason ?? null,
      feedbackLabel: input.feedbackLabel ?? null,
      isTrainingEligible: input.isTrainingEligible ?? true,
      privacyClassification: "commercial_sensitive",
      visibilityScope: "organization",
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export function logTakeoffIntelligenceFailure(action: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.warn("[takeoff-intelligence] write failed", {
    action,
    error: error instanceof Error ? error.message : error,
  });
}

export function logTakeoffIntelligenceDebug(action: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info("[takeoff-intelligence] debug", {
    action,
    ...details,
  });
}
