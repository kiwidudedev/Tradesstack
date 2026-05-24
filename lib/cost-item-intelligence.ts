import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

type CostItemClassificationSource = "rules" | "user_confirmed" | "ai" | "imported" | null;

type CostItemClassificationSummary = {
  workType: string | null;
  costType: string | null;
  costCode: string | null;
  confidence: number | null;
  needsReview: boolean | null;
  classificationSource: CostItemClassificationSource;
};

type CostCodeMappingSummary = {
  ruleType: string;
  targetCostCodeId: string;
  targetCostCodeLabel: string | null;
  intelligenceCostCode: string | null;
  workType: string | null;
  costType: string | null;
  priority: number | null;
  isActive: boolean;
};

type CostItemIntelligenceEventType =
  | "cost_item_classification_assigned"
  | "cost_item_classification_corrected"
  | "cost_code_mapping_overridden"
  | "cost_code_mapping_confirmed"
  | "cost_item_review_resolved"
  | "cost_item_review_reopened"
  | "ai_cost_classification_accepted"
  | "ai_cost_classification_rejected"
  | "ai_cost_classification_edited";

type CostItemEventFamily = "correction" | "validation" | "ai_interaction" | "commercial_action";

type CostItemAction =
  | "assigned"
  | "corrected"
  | "overridden"
  | "confirmed"
  | "resolved"
  | "reopened"
  | "accepted"
  | "rejected"
  | "edited";

export type CostItemIntelligenceEventInput = {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  module: "cost_items" | "cost_code_mappings";
  eventFamily: CostItemEventFamily;
  eventType: CostItemIntelligenceEventType;
  action: CostItemAction;
  entityType: string;
  entityId: string;
  occurredAt?: string;
  beforeData?: Record<string, Json | null> | null;
  afterData?: Record<string, Json | null> | null;
  diffData?: Record<string, Json | null>;
  metadata?: Record<string, Json>;
  reason?: string | null;
};

export type CostItemAiInteractionInput = {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  subjectEntityId: string;
  confidence?: number | null;
  humanDisposition: "accepted" | "rejected" | "edited";
  humanFeedbackSummary?: string | null;
  outputStructured?: Json | null;
  editedOutput?: Json | null;
  linkedEventId?: string | null;
};

export type CostItemValidationCaseInput = {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  scopeEntityId: string;
  linkedEventId?: string | null;
  linkedAiInteractionId?: string | null;
  expectedValue?: Json | null;
  observedValue?: Json | null;
  details?: Record<string, Json>;
  approvalNote?: string | null;
};

export type CostItemCorrectionEventInput = {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  module?: "cost_items" | "cost_code_mappings";
  targetEntityType?: string;
  targetEntityId: string;
  correctionType:
    | "classification_fix"
    | "mapping_fix"
    | "manual_override";
  correctedFieldName?: string | null;
  incorrectValue?: Json | null;
  correctedValue?: Json | null;
  correctionReason?: string | null;
  feedbackLabel?: string | null;
  linkedEventId?: string | null;
  linkedAiInteractionId?: string | null;
  linkedValidationCaseId?: string | null;
  isTrainingEligible?: boolean;
};

export function summarizeCostItemClassification(input: {
  workType?: string | null;
  costType?: string | null;
  costCode?: string | null;
  confidence?: number | null;
  needsReview?: boolean | null;
  classificationSource?: string | null;
}): CostItemClassificationSummary {
  return {
    workType: input.workType ?? null,
    costType: input.costType ?? null,
    costCode: input.costCode ?? null,
    confidence: typeof input.confidence === "number" ? input.confidence : null,
    needsReview: typeof input.needsReview === "boolean" ? input.needsReview : null,
    classificationSource: (input.classificationSource ?? null) as CostItemClassificationSource,
  };
}

export function summarizeCostCodeMapping(input: {
  ruleType: string;
  targetCostCodeId: string;
  targetCostCodeLabel?: string | null;
  intelligenceCostCode?: string | null;
  workType?: string | null;
  costType?: string | null;
  priority?: number | null;
  isActive?: boolean;
}): CostCodeMappingSummary {
  return {
    ruleType: input.ruleType,
    targetCostCodeId: input.targetCostCodeId,
    targetCostCodeLabel: input.targetCostCodeLabel ?? null,
    intelligenceCostCode: input.intelligenceCostCode ?? null,
    workType: input.workType ?? null,
    costType: input.costType ?? null,
    priority: typeof input.priority === "number" ? input.priority : null,
    isActive: input.isActive ?? true,
  };
}

export function buildCostItemIntelligenceEvent(params: CostItemIntelligenceEventInput) {
  return {
    organizationId: params.organizationId,
    projectId: params.projectId ?? null,
    opportunityId: params.opportunityId ?? null,
    module: params.module,
    eventFamily: params.eventFamily,
    eventType: params.eventType,
    action: params.action,
    entityType: params.entityType,
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

export async function writeCostItemIntelligenceEvent(
  supabase: AppSupabaseClient,
  event: ReturnType<typeof buildCostItemIntelligenceEvent>
) {
  const { data, error } = await supabase.rpc("write_intelligence_event" as never, {
    p_input: event,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function writeCostItemIntelligenceEvents(
  supabase: AppSupabaseClient,
  events: Array<ReturnType<typeof buildCostItemIntelligenceEvent>>
) {
  const { error } = await supabase.rpc("write_intelligence_events" as never, {
    p_events: events,
  } as never);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createCostItemAiInteraction(
  supabase: AppSupabaseClient,
  input: CostItemAiInteractionInput
) {
  const { data, error } = await supabase.rpc("create_ai_interaction" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      module: "cost_items",
      interactionType: "classification",
      subjectEntityType: "cost_item",
      subjectEntityId: input.subjectEntityId,
      provider: "tradesstack",
      model: "cost-item-classifier",
      confidence: input.confidence ?? null,
      outputStructured: input.outputStructured ?? null,
      humanDisposition: input.humanDisposition,
      humanFeedbackSummary: input.humanFeedbackSummary ?? null,
      editedOutput: input.editedOutput ?? null,
      linkedEventId: input.linkedEventId ?? null,
      privacyClassification: "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function createCostItemValidationCase(
  supabase: AppSupabaseClient,
  input: CostItemValidationCaseInput
) {
  const { data, error } = await supabase.rpc("create_validation_case" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      module: "cost_items",
      scopeEntityType: "cost_item",
      scopeEntityId: input.scopeEntityId,
      linkedEventId: input.linkedEventId ?? null,
      linkedAiInteractionId: input.linkedAiInteractionId ?? null,
      ruleKey: "cost_item_review_required",
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

export async function writeCostItemCorrectionEvent(
  supabase: AppSupabaseClient,
  input: CostItemCorrectionEventInput
) {
  const { data, error } = await supabase.rpc("write_correction_event" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      module: input.module ?? "cost_items",
      correctionType: input.correctionType,
      targetEntityType: input.targetEntityType ?? "cost_item",
      targetEntityId: input.targetEntityId,
      linkedEventId: input.linkedEventId ?? null,
      linkedAiInteractionId: input.linkedAiInteractionId ?? null,
      linkedValidationCaseId: input.linkedValidationCaseId ?? null,
      correctedFieldName: input.correctedFieldName ?? null,
      incorrectValue: input.incorrectValue ?? null,
      correctedValue: input.correctedValue ?? null,
      correctionReason: input.correctionReason ?? null,
      feedbackLabel: input.feedbackLabel ?? null,
      isTrainingEligible: input.isTrainingEligible ?? true,
      privacyClassification: "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export function logCostItemIntelligenceFailure(action: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.warn("[cost-item-intelligence] write failed", {
    action,
    error: error instanceof Error ? error.message : error,
  });
}
