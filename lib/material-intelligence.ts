import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

type MaterialClassificationSource = "rules" | "user_confirmed" | "ai" | "imported" | null;

export type MaterialClassificationSummary = {
  workType: string | null;
  costType: string | null;
  costCode: string | null;
  confidence: number | null;
  needsReview: boolean | null;
  classificationSource: MaterialClassificationSource;
  organizationCostCodeId?: string | null;
};

type MaterialIntelligenceEventType =
  | "material_classification_assigned"
  | "material_classification_corrected"
  | "material_review_reopened"
  | "material_review_resolved";

type MaterialEventFamily = "correction" | "validation" | "commercial_action";

type MaterialAction = "assigned" | "corrected" | "reopened" | "resolved";

export type MaterialIntelligenceEventInput = {
  organizationId: string;
  entityId: string;
  eventFamily: MaterialEventFamily;
  eventType: MaterialIntelligenceEventType;
  action: MaterialAction;
  occurredAt?: string;
  beforeData?: Record<string, Json | null> | null;
  afterData?: Record<string, Json | null> | null;
  diffData?: Record<string, Json | null>;
  metadata?: Record<string, Json>;
  reason?: string | null;
};

export function summarizeMaterialClassification(input: {
  workType?: string | null;
  costType?: string | null;
  costCode?: string | null;
  confidence?: number | null;
  needsReview?: boolean | null;
  classificationSource?: string | null;
  organizationCostCodeId?: string | null;
}): MaterialClassificationSummary {
  return {
    workType: input.workType ?? null,
    costType: input.costType ?? null,
    costCode: input.costCode ?? null,
    confidence: typeof input.confidence === "number" ? input.confidence : null,
    needsReview: typeof input.needsReview === "boolean" ? input.needsReview : null,
    classificationSource: (input.classificationSource ?? null) as MaterialClassificationSource,
    organizationCostCodeId: input.organizationCostCodeId ?? null,
  };
}

export function buildMaterialIntelligenceEvent(params: MaterialIntelligenceEventInput) {
  return {
    organizationId: params.organizationId,
    projectId: null,
    opportunityId: null,
    module: "materials",
    eventFamily: params.eventFamily,
    eventType: params.eventType,
    action: params.action,
    entityType: "organization_material",
    entityId: params.entityId,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
    diffData: params.diffData ?? {},
    reason: params.reason ?? null,
    metadata: params.metadata ?? {},
    privacyClassification: "financial_sensitive",
    visibilityScope: "organization",
    containsFinancialData: true,
    containsPersonalData: false,
    containsAttachmentContent: false,
    occurredAt: params.occurredAt,
  };
}

export async function writeMaterialIntelligenceEvents(
  supabase: AppSupabaseClient,
  events: Array<ReturnType<typeof buildMaterialIntelligenceEvent>>
) {
  const { error } = await supabase.rpc("write_intelligence_events" as never, {
    p_events: events,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createMaterialValidationCase(
  supabase: AppSupabaseClient,
  input: {
    organizationId: string;
    scopeEntityId: string;
    linkedEventId?: string | null;
    expectedValue?: Json | null;
    observedValue?: Json | null;
    details?: Record<string, Json>;
    approvalNote?: string | null;
  }
) {
  const { data, error } = await supabase.rpc("create_validation_case" as never, {
    p_input: {
      organizationId: input.organizationId,
      module: "materials",
      scopeEntityType: "organization_material",
      scopeEntityId: input.scopeEntityId,
      linkedEventId: input.linkedEventId ?? null,
      ruleKey: "material_classification_review_required",
      ruleVersion: "v1",
      validationType: "business_rule",
      severity: "warning",
      result: "failed",
      expectedValue: input.expectedValue ?? null,
      observedValue: input.observedValue ?? null,
      details: input.details ?? {},
      requiresApproval: false,
      approvalStatus: "not_required",
      approvalNote: input.approvalNote ?? null,
      privacyClassification: "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function writeMaterialCorrectionEvent(
  supabase: AppSupabaseClient,
  input: {
    organizationId: string;
    targetEntityId: string;
    correctedFieldName?: string | null;
    incorrectValue?: Json | null;
    correctedValue?: Json | null;
    correctionReason?: string | null;
    feedbackLabel?: string | null;
    linkedAiInteractionId?: string | null;
  }
) {
  const { data, error } = await supabase.rpc("write_correction_event" as never, {
    p_input: {
      organizationId: input.organizationId,
      module: "materials",
      correctionType: "classification_fix",
      targetEntityType: "organization_material",
      targetEntityId: input.targetEntityId,
      linkedAiInteractionId: input.linkedAiInteractionId ?? null,
      correctedFieldName: input.correctedFieldName ?? null,
      incorrectValue: input.incorrectValue ?? null,
      correctedValue: input.correctedValue ?? null,
      correctionReason: input.correctionReason ?? null,
      feedbackLabel: input.feedbackLabel ?? null,
      isTrainingEligible: true,
      privacyClassification: "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export function logMaterialIntelligenceFailure(action: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.warn("[material-intelligence] write failed", {
    action,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}
