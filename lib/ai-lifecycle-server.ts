import "server-only";

import { canManageCommercialData, type AppRole } from "@/lib/role-permissions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type OrganizationMemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type OrganizationMemoryItemQueryRow = {
  id: string;
  memory_category: string;
  memory_type: string;
  title: string;
  summary: string;
  confidence_score: number | null;
  derived_from_total_count: number | null;
  memory_value: Json | null;
  evidence_summary: Json | null;
  updated_at: string;
};
type OrganizationMemoryItemsQueryBuilder = {
  eq: (column: string, value: string | boolean) => OrganizationMemoryItemsQueryBuilder;
  gte: (column: string, value: number) => OrganizationMemoryItemsQueryBuilder;
  order: (column: string, options: { ascending: boolean }) => OrganizationMemoryItemsQueryBuilder;
  limit: (value: number) => Promise<{
    data: OrganizationMemoryItemQueryRow[] | null;
    error: { message: string } | null;
  }>;
  in: (column: string, values: string[]) => OrganizationMemoryItemsQueryBuilder;
};
type OrganizationMemoryItemsQuery = {
  from: (table: "organization_memory_items") => {
    select: (columns: string) => OrganizationMemoryItemsQueryBuilder;
  };
};

export type AiLifecycleState =
  | "requested"
  | "generated"
  | "validated"
  | "previewed"
  | "accepted"
  | "edited"
  | "rejected"
  | "superseded";

export type AiValidationStatus = "pending" | "passed" | "warning" | "failed" | "overridden";

export type AiMemoryItem = {
  id: string;
  memoryCategory: string;
  memoryType: string;
  title: string;
  summary: string;
  confidenceScore: number;
  derivedFromTotalCount: number;
  memoryValue: Record<string, Json | undefined>;
  evidenceSummary: Record<string, Json | undefined>;
  updatedAt: string;
  projectId: string | null;
  opportunityId: string | null;
};

export type AiValidationWarning = {
  ruleKey: string;
  severity: "info" | "warning" | "error" | "critical";
  result: "passed" | "failed" | "warning" | "overridden";
  message: string;
  expectedValue?: Json | null;
  observedValue?: Json | null;
  details?: Record<string, Json>;
};

export type AiRequestContextSummary = {
  organizationId: string;
  projectId: string | null;
  opportunityId: string | null;
  module: string;
  workflowKey: string;
  worksheetName?: string | null;
  tradePackage?: string | null;
  relatedCounts?: Record<string, Json>;
  matchedMemoryIds?: string[];
};

function toJsonRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Json | undefined>;
}

export async function requireOrganizationMemberForAi(
  organizationId: string,
  options?: { requireCommercialWrite?: boolean }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized.");
  }

  const { data: member, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, display_name, avatar_path, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error || !member) {
    throw new Error("Not authorized for this organization.");
  }

  if (options?.requireCommercialWrite && !canManageCommercialData(member.role as AppRole)) {
    throw new Error("You do not have permission to use this AI workflow.");
  }

  return {
    supabase,
    user,
    member: member as OrganizationMemberRow,
  };
}

export async function validateOpportunityForOrganization(
  organizationId: string,
  opportunityId: string
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_opportunities")
    .select("id, organization_id, workspace_project_id")
    .eq("organization_id", organizationId)
    .eq("id", opportunityId)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Opportunity not found.");
  }

  return data;
}

export async function retrieveOrganizationMemoryForAi(params: {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  memoryCategories?: string[];
  memoryTypes?: string[];
  minimumConfidence?: number;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  const minimumConfidence = params.minimumConfidence ?? 0.35;
  const fetchLimit = Math.max(params.limit ?? 25, 1);

  let query = (admin as unknown as OrganizationMemoryItemsQuery)
    .from("organization_memory_items")
    .select(
      "id, memory_category, memory_type, title, summary, confidence_score, derived_from_total_count, memory_value, evidence_summary, updated_at"
    )
    .eq("organization_id", params.organizationId)
    .eq("is_active", true)
    .gte("confidence_score", minimumConfidence)
    .order("confidence_score", { ascending: false })
    .order("updated_at", { ascending: false });

  if (params.memoryCategories && params.memoryCategories.length > 0) {
    query = query.in("memory_category", params.memoryCategories);
  }

  if (params.memoryTypes && params.memoryTypes.length > 0) {
    query = query.in("memory_type", params.memoryTypes);
  }

  const { data, error } = (await query.limit(fetchLimit * 4)) as {
    data: OrganizationMemoryItemQueryRow[] | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(error.message);
  }

  const scored = (data ?? [])
    .map((row) => {
      const memoryValue = toJsonRecord(row.memory_value as Json);
      const evidenceSummary = toJsonRecord(row.evidence_summary as Json);
      const projectId =
        typeof memoryValue.projectId === "string" && memoryValue.projectId.length > 0
          ? memoryValue.projectId
          : null;
      const opportunityId =
        typeof memoryValue.opportunityId === "string" && memoryValue.opportunityId.length > 0
          ? memoryValue.opportunityId
          : null;

      let score = Number(row.confidence_score ?? 0);
      if (projectId && projectId === (params.projectId ?? null)) {
        score += 0.12;
      }
      if (opportunityId && opportunityId === (params.opportunityId ?? null)) {
        score += 0.1;
      }

      return {
        id: row.id,
        memoryCategory: row.memory_category,
        memoryType: row.memory_type,
        title: row.title,
        summary: row.summary,
        confidenceScore: Number(row.confidence_score ?? 0),
        derivedFromTotalCount: Number(row.derived_from_total_count ?? 0),
        memoryValue,
        evidenceSummary,
        updatedAt: row.updated_at,
        projectId,
        opportunityId,
        score,
      };
    })
    .sort((left, right) => right.score - left.score || right.confidenceScore - left.confidenceScore)
    .slice(0, fetchLimit);

  return scored as AiMemoryItem[];
}

export async function createAiLifecycleInteraction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    projectId?: string | null;
    opportunityId?: string | null;
    module: string;
    interactionType:
      | "chat"
      | "classification"
      | "extraction"
      | "generation"
      | "matching"
      | "recommendation"
      | "change_detection"
      | "reasoning"
      | "autocomplete";
    subjectEntityType: string;
    subjectEntityId?: string | null;
    provider: string;
    model: string;
    modelVersion?: string | null;
    promptTemplateKey?: string | null;
    promptText?: string | null;
    inputContextSummary: Record<string, Json>;
    inputRefs?: Json[];
    privacyClassification?: string;
  }
) {
  const { data, error } = await supabase.rpc("create_ai_interaction" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      module: input.module,
      interactionType: input.interactionType,
      subjectEntityType: input.subjectEntityType,
      subjectEntityId: input.subjectEntityId ?? null,
      provider: input.provider,
      model: input.model,
      modelVersion: input.modelVersion ?? null,
      promptTemplateKey: input.promptTemplateKey ?? null,
      promptText: input.promptText ?? null,
      inputContextSummary: input.inputContextSummary,
      inputRefs: input.inputRefs ?? [],
      runStatus: "queued",
      lifecycleState: "requested",
      validationStatus: "pending",
      privacyClassification: input.privacyClassification ?? "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function transitionAiLifecycleInteraction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    aiInteractionId: string;
    projectId?: string | null;
    opportunityId?: string | null;
    lifecycleState: AiLifecycleState;
    runStatus?: "queued" | "running" | "completed" | "failed" | "cancelled";
    validationStatus?: AiValidationStatus;
    confidence?: number | null;
    outputStructured?: Json | null;
    outputText?: string | null;
    outputRefs?: Json[];
    usageInputTokens?: number | null;
    usageOutputTokens?: number | null;
    usageTotalTokens?: number | null;
    latencyMs?: number | null;
    humanDisposition?: "accepted" | "rejected" | "edited" | "partially_accepted" | "ignored" | null;
    humanFeedbackSummary?: string | null;
    editedOutput?: Json | null;
    supersededByInteractionId?: string | null;
  }
) {
  const { data, error } = await supabase.rpc("transition_ai_interaction_lifecycle" as never, {
    p_input: {
      organizationId: input.organizationId,
      aiInteractionId: input.aiInteractionId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      lifecycleState: input.lifecycleState,
      runStatus: input.runStatus ?? null,
      validationStatus: input.validationStatus ?? null,
      confidence: input.confidence ?? null,
      outputStructured: input.outputStructured ?? null,
      outputText: input.outputText ?? null,
      outputRefs: input.outputRefs ?? [],
      usageInputTokens: input.usageInputTokens ?? null,
      usageOutputTokens: input.usageOutputTokens ?? null,
      usageTotalTokens: input.usageTotalTokens ?? null,
      latencyMs: input.latencyMs ?? null,
      humanDisposition: input.humanDisposition ?? null,
      humanFeedbackSummary: input.humanFeedbackSummary ?? null,
      editedOutput: input.editedOutput ?? null,
      supersededByInteractionId: input.supersededByInteractionId ?? null,
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function recordAiInteractionValidation(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    aiInteractionId: string;
    projectId?: string | null;
    opportunityId?: string | null;
    module: string;
    scopeEntityType: string;
    scopeEntityId?: string | null;
    ruleKey: string;
    ruleVersion?: string;
    validationType:
      | "schema"
      | "business_rule"
      | "workflow_gate"
      | "financial_check"
      | "ai_confidence"
      | "duplicate_detection"
      | "permission_check"
      | "consistency_check";
    severity: "info" | "warning" | "error" | "critical";
    result: "passed" | "failed" | "warning" | "overridden";
    expectedValue?: Json | null;
    observedValue?: Json | null;
    details?: Record<string, Json>;
    requiresApproval?: boolean;
    approvalStatus?: "not_required" | "pending" | "approved" | "rejected";
    approvalNote?: string | null;
    privacyClassification?: string;
    validationStatus?: AiValidationStatus;
  }
) {
  const { data, error } = await supabase.rpc("record_ai_interaction_validation" as never, {
    p_input: {
      organizationId: input.organizationId,
      aiInteractionId: input.aiInteractionId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      module: input.module,
      scopeEntityType: input.scopeEntityType,
      scopeEntityId: input.scopeEntityId ?? null,
      ruleKey: input.ruleKey,
      ruleVersion: input.ruleVersion ?? "v1",
      validationType: input.validationType,
      severity: input.severity,
      result: input.result,
      expectedValue: input.expectedValue ?? null,
      observedValue: input.observedValue ?? null,
      details: input.details ?? {},
      requiresApproval: input.requiresApproval ?? false,
      approvalStatus: input.approvalStatus ?? "not_required",
      approvalNote: input.approvalNote ?? null,
      privacyClassification: input.privacyClassification ?? "commercial_sensitive",
      visibilityScope: "organization",
      validationStatus: input.validationStatus ?? (input.result === "passed" ? "passed" : "warning"),
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function reviewAiInteraction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    aiInteractionId: string;
    lifecycleState: "accepted" | "edited" | "rejected" | "superseded";
    humanDisposition?: "accepted" | "edited" | "rejected";
    humanFeedbackSummary?: string | null;
    editedOutput?: Json | null;
    supersededByInteractionId?: string | null;
    module?: string;
    correctionTargetEntityType?: string | null;
  }
) {
  await transitionAiLifecycleInteraction(supabase, {
    organizationId: input.organizationId,
    aiInteractionId: input.aiInteractionId,
    lifecycleState: input.lifecycleState,
    runStatus: "completed",
    humanDisposition:
      input.lifecycleState === "superseded" ? null : input.humanDisposition ?? input.lifecycleState,
    humanFeedbackSummary: input.humanFeedbackSummary ?? null,
    editedOutput: input.editedOutput ?? null,
    supersededByInteractionId: input.supersededByInteractionId ?? null,
  });

  if (input.lifecycleState === "edited" && input.editedOutput) {
    const { error } = await supabase.rpc("write_correction_event" as never, {
      p_input: {
        organizationId: input.organizationId,
        module: input.module ?? "ai_workflows",
        correctionType: "ai_output_edit",
        targetEntityType: input.correctionTargetEntityType ?? "ai_output_preview",
        targetEntityId: input.aiInteractionId,
        linkedAiInteractionId: input.aiInteractionId,
        correctedFieldName: "output_structured",
        incorrectValue: null,
        correctedValue: input.editedOutput,
        correctionReason:
          input.humanFeedbackSummary ?? "User edited an AI-generated preview before approval.",
        feedbackLabel: "ai_output_edited",
        isTrainingEligible: true,
        privacyClassification: "financial_sensitive",
        visibilityScope: "organization",
      },
    } as never);

    if (error) {
      throw new Error(error.message);
    }
  }

  return input.aiInteractionId;
}

export function summarizeAiValidationStatus(warnings: AiValidationWarning[]): AiValidationStatus {
  if (warnings.some((warning) => warning.result === "failed" || warning.severity === "critical")) {
    return "failed";
  }

  if (warnings.some((warning) => warning.result === "warning")) {
    return "warning";
  }

  return "passed";
}

export function buildAiRequestContextSummary(input: AiRequestContextSummary) {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    opportunityId: input.opportunityId ?? null,
    module: input.module,
    workflowKey: input.workflowKey,
    worksheetName: input.worksheetName ?? null,
    tradePackage: input.tradePackage ?? null,
    relatedCounts: input.relatedCounts ?? {},
    matchedMemoryIds: input.matchedMemoryIds ?? [],
  } satisfies Record<string, Json>;
}
