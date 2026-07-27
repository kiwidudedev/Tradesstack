import "server-only";

import {
  buildAiRequestContextSummary,
  createAiLifecycleInteraction,
  recordAiInteractionValidation,
  requireOrganizationMemberForAi,
  retrieveOrganizationMemoryForAi,
  transitionAiLifecycleInteraction,
  validateOpportunityForOrganization,
} from "@/lib/ai-lifecycle-server";
import {
  buildPricingWorksheetEditAssistantPreview,
  getPricingWorksheetEditAssistantModelConfig,
  type PricingWorksheetAiAssistantProviderAudit,
  type PricingWorksheetAiFollowUpContext,
} from "@/lib/ai-pricing-worksheet-edit-assistant";
import { classifyPricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import { retrievePricingWorksheetOrganizationGuidance } from "@/lib/pricing-worksheet-organization-guidance";
import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { PricingWorksheetAiCompactContext } from "@/lib/pricing-worksheet-ai-context";
import { canManageCommercialData, type AppRole } from "@/lib/role-permissions";
import type { Json } from "@/lib/supabase/types";

type CurrentWorksheetSummary = {
  rowCount?: number;
  columnCount?: number;
  formulaCount?: number;
  populatedCellCount?: number;
  hasExistingContent?: boolean;
};

export type PricingWorksheetAiJobRequest = {
  organizationId: string;
  opportunityId?: string | null;
  workbookId?: string | null;
  worksheetId?: string | null;
  sheetId?: string | null;
  sheetName?: string | null;
  worksheetName?: string | null;
  tradePackage?: string | null;
  prompt?: string | null;
  currentWorksheetSummary?: CurrentWorksheetSummary | null;
  worksheetData: WorksheetData;
  worksheetContext: PricingWorksheetAiCompactContext;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
};

export type PricingWorksheetAiJobStatus =
  | "queued"
  | "running"
  | "researching"
  | "generating"
  | "validating"
  | "ready"
  | "failed"
  | "cancelled";

export type PricingWorksheetAiJobErrorCode =
  | "provider_timeout"
  | "provider_520"
  | "provider_quota"
  | "provider_schema_error"
  | "parser_error"
  | "validation_blocked"
  | "cancelled"
  | "provider_error";

type PricingWorksheetAiPreviewResponse = {
  aiInteractionId: string;
  workbookId: string | null;
  worksheetId: string | null;
  sheetId: string | null;
  sheetName: string;
  lifecycleState: string;
  validationStatus: string;
  preview: {
    worksheet: WorksheetData;
    compactOutput: Record<string, Json | undefined>;
    matchedMemory: Record<string, Json | undefined> | null;
    validationWarnings: Array<Record<string, Json | undefined>>;
    contextSummary: Record<string, Json | undefined>;
    classification?: Record<string, Json | undefined>;
    continuation?: Record<string, Json | undefined> | null;
    assistant?: Record<string, Json | undefined> | null;
    generationMeta?: {
      provider: string;
      model: string;
      fallbackUsed: boolean;
      fallbackReason: string | null;
    };
  };
};

type PricingWorksheetAiJobEnvelope = {
  version: 1;
  workflowKey: "pricing_worksheet_edit_assistant_job";
  status: PricingWorksheetAiJobStatus;
  progressLabel: string;
  retryable: boolean;
  classification: Record<string, Json | undefined>;
  request: Record<string, Json | undefined>;
  providerStatus: Record<string, Json | undefined>;
  error: {
    code: PricingWorksheetAiJobErrorCode;
    message: string;
    retryable: boolean;
  } | null;
  result: PricingWorksheetAiPreviewResponse | null;
  timestamps: Record<string, Json | undefined>;
};

type PricingWorksheetAiLifecycleProviderMeta = {
  provider: string | null;
  model: string | null;
};

type AiInteractionJobLookup = {
  from: (table: "ai_interactions") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          limit: (count: number) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                organization_id: string;
                opportunity_id: string | null;
                project_id: string | null;
                run_status: "queued" | "running" | "completed" | "failed" | "cancelled";
                lifecycle_state: string;
                validation_status: string | null;
                output_structured: Json | null;
              } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
};

const activeExecutions = new Set<string>();

function isRecord(value: unknown): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasWorksheetShape(value: unknown): value is WorksheetData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as WorksheetData).rows) &&
    Array.isArray((value as WorksheetData).columns)
  );
}

function hasContextShape(value: unknown): value is PricingWorksheetAiCompactContext {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PricingWorksheetAiCompactContext).worksheetName === "string" &&
    Array.isArray((value as PricingWorksheetAiCompactContext).headers) &&
    Array.isArray((value as PricingWorksheetAiCompactContext).rows)
  );
}

function resolveWorkbookId(input: {
  workbookId?: string | null;
  worksheetId?: string | null;
}) {
  return input.workbookId ?? input.worksheetId ?? null;
}

function resolveSheetName(input: {
  sheetName?: string | null;
  worksheetName?: string | null;
}) {
  return input.sheetName ?? input.worksheetName ?? "Pricing Worksheet";
}

export function normalizePricingWorksheetAiJobRequest(body: unknown): PricingWorksheetAiJobRequest {
  if (!isRecord(body)) {
    throw new Error("Invalid request payload.");
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId) {
    throw new Error("organizationId is required.");
  }

  if (!hasWorksheetShape(body.worksheetData)) {
    throw new Error("worksheetData is required.");
  }

  if (!hasContextShape(body.worksheetContext)) {
    throw new Error("worksheetContext is required.");
  }

  return {
    organizationId,
    opportunityId: typeof body.opportunityId === "string" && body.opportunityId.trim() ? body.opportunityId.trim() : null,
    workbookId: typeof body.workbookId === "string" && body.workbookId.trim() ? body.workbookId.trim() : null,
    worksheetId: typeof body.worksheetId === "string" && body.worksheetId.trim() ? body.worksheetId.trim() : null,
    sheetId: typeof body.sheetId === "string" && body.sheetId.trim() ? body.sheetId.trim() : null,
    sheetName: typeof body.sheetName === "string" && body.sheetName.trim() ? body.sheetName.trim() : null,
    worksheetName:
      typeof body.worksheetName === "string" && body.worksheetName.trim() ? body.worksheetName.trim() : "Pricing Worksheet",
    tradePackage: typeof body.tradePackage === "string" && body.tradePackage.trim() ? body.tradePackage.trim() : null,
    prompt: typeof body.prompt === "string" ? body.prompt.trim() : "",
    currentWorksheetSummary:
      isRecord(body.currentWorksheetSummary)
        ? {
            rowCount: typeof body.currentWorksheetSummary.rowCount === "number" ? body.currentWorksheetSummary.rowCount : 0,
            columnCount:
              typeof body.currentWorksheetSummary.columnCount === "number" ? body.currentWorksheetSummary.columnCount : 0,
            formulaCount:
              typeof body.currentWorksheetSummary.formulaCount === "number" ? body.currentWorksheetSummary.formulaCount : 0,
            populatedCellCount:
              typeof body.currentWorksheetSummary.populatedCellCount === "number"
                ? body.currentWorksheetSummary.populatedCellCount
                : 0,
            hasExistingContent: body.currentWorksheetSummary.hasExistingContent === true,
          }
        : null,
    worksheetData: body.worksheetData,
    worksheetContext: body.worksheetContext,
    followUpContext: isRecord(body.followUpContext) ? (body.followUpContext as PricingWorksheetAiFollowUpContext) : null,
  };
}

function getValidationTypeForIssue(code: string) {
  if (code.includes("formula") || code.includes("ref") || code.includes("cell") || code.includes("column")) {
    return "schema" as const;
  }

  if (code.includes("mode") || code.includes("operation")) {
    return "workflow_gate" as const;
  }

  return "ai_confidence" as const;
}

function confidenceToScore(value: "high" | "medium" | "low") {
  if (value === "high") {
    return 0.9;
  }

  if (value === "low") {
    return 0.35;
  }

  return 0.65;
}

function buildJobError(code: PricingWorksheetAiJobErrorCode, message: string, retryable: boolean) {
  return { code, message, retryable };
}

function isAnthropicSafeUnknownFallback(
  generationMeta: Awaited<ReturnType<typeof buildPricingWorksheetEditAssistantPreview>>["generationMeta"],
) {
  return generationMeta.fallbackUsed && generationMeta.fallbackReason === "anthropic_safe_unknown_fallback";
}

function classifyJobError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("timed out")) {
    return buildJobError("provider_timeout", message, true);
  }

  if (normalized.includes("status 520")) {
    return buildJobError("provider_520", message, true);
  }

  if (normalized.includes("quota") || normalized.includes("insufficient_quota") || normalized.includes("status 429")) {
    return buildJobError("provider_quota", "AI provider quota was exceeded. Check billing or model quota and try again.", false);
  }

  if (normalized.includes("schema_normalization_failed")) {
    return buildJobError("provider_schema_error", message, false);
  }

  if (normalized.includes("unreadable response") || normalized.includes("malformed_json") || normalized.includes("truncated_json")) {
    return buildJobError("parser_error", message, false);
  }

  if (normalized.includes("cancelled")) {
    return buildJobError("cancelled", "This Ask AI job was cancelled.", false);
  }

  return buildJobError("provider_error", message, true);
}

function buildInitialJobEnvelope(params: {
  request: PricingWorksheetAiJobRequest;
  classification: Record<string, Json | undefined>;
  requestedProvider: string;
  requestedModel: string;
}): PricingWorksheetAiJobEnvelope {
  return {
    version: 1,
    workflowKey: "pricing_worksheet_edit_assistant_job",
    status: "queued",
    progressLabel: "Queued",
    retryable: false,
    classification: params.classification,
    request: {
      workbookId: resolveWorkbookId(params.request),
      worksheetId: params.request.worksheetId ?? null,
      sheetId: params.request.sheetId ?? null,
      sheetName: resolveSheetName(params.request),
      worksheetName: params.request.worksheetName ?? "Pricing Worksheet",
      tradePackage: params.request.tradePackage ?? null,
      prompt: params.request.prompt ?? "",
      currentWorksheetSummary: (params.request.currentWorksheetSummary ?? null) as Json,
      worksheetData: params.request.worksheetData as unknown as Json,
      worksheetContext: params.request.worksheetContext as unknown as Json,
      followUpContext: (params.request.followUpContext ?? null) as Json,
    },
    providerStatus: {
      requestedProvider: params.requestedProvider,
      requestedModel: params.requestedModel,
    },
    error: null,
    result: null,
    timestamps: {
      queuedAt: new Date().toISOString(),
    },
  };
}

function buildPreviewResponse(params: {
  aiInteractionId: string;
  workbookId?: string | null;
  worksheetId?: string | null;
  sheetId?: string | null;
  sheetName: string;
  validationStatus: string;
  preview: Awaited<ReturnType<typeof buildPricingWorksheetEditAssistantPreview>>["preview"];
  generationMeta: Awaited<ReturnType<typeof buildPricingWorksheetEditAssistantPreview>>["generationMeta"];
}): PricingWorksheetAiPreviewResponse {
  return {
    aiInteractionId: params.aiInteractionId,
    workbookId: params.workbookId ?? params.worksheetId ?? null,
    worksheetId: params.worksheetId ?? params.workbookId ?? null,
    sheetId: params.sheetId ?? null,
    sheetName: params.sheetName,
    lifecycleState: "previewed",
    validationStatus: params.validationStatus,
    preview: {
      worksheet: params.preview.worksheet,
      compactOutput: params.preview.compactOutput as unknown as Record<string, Json | undefined>,
      matchedMemory: params.preview.matchedMemory as unknown as Record<string, Json | undefined> | null,
      validationWarnings: params.preview.validationWarnings as unknown as Array<Record<string, Json | undefined>>,
      contextSummary: params.preview.contextSummary as unknown as Record<string, Json | undefined>,
      classification: params.preview.classification as unknown as Record<string, Json | undefined>,
      continuation: params.preview.continuation as unknown as Record<string, Json | undefined> | null,
      generationMeta: params.generationMeta,
      assistant: {
        mode: params.preview.mode,
        proposalName: params.preview.proposalName,
        answer: params.preview.answer,
        summary: params.preview.summary,
        confidence: params.preview.confidence,
        operations: params.preview.operations.map((operation) => ({
          type: operation.type,
          rationale: operation.rationale ?? "",
        })),
        assumptions: params.preview.assumptions,
        warnings: params.preview.warnings,
        evidenceSources: params.preview.evidenceSources,
        reviewFindings: params.preview.reviewFindings,
        reviewSummary: params.preview.reviewSummary,
        suggestedEditGroups: params.preview.suggestedEditGroups,
        diffSummary: params.preview.diffSummary,
        diffPreview: params.preview.diffPreview,
      } as unknown as Record<string, Json | undefined>,
    },
  };
}

async function getAiInteractionJobRecord(params: {
  supabase: Awaited<ReturnType<typeof requireOrganizationMemberForAi>>["supabase"];
  organizationId: string;
  aiInteractionId: string;
}) {
  const { data, error } = await (params.supabase as unknown as AiInteractionJobLookup)
    .from("ai_interactions")
    .select("id, organization_id, opportunity_id, project_id, run_status, lifecycle_state, validation_status, output_structured")
    .eq("organization_id", params.organizationId)
    .eq("id", params.aiInteractionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("AI interaction not found.");
  }

  return data;
}

function readJobEnvelope(value: Json | null | undefined): PricingWorksheetAiJobEnvelope | null {
  if (!isRecord(value) || !isRecord(value.job)) {
    return null;
  }

  const job = value.job;
  if (
    typeof job.status !== "string" ||
    typeof job.progressLabel !== "string" ||
    !isRecord(job.request) ||
    !isRecord(job.classification) ||
    !isRecord(job.timestamps)
  ) {
    return null;
  }

  return {
    version: 1,
    workflowKey: "pricing_worksheet_edit_assistant_job",
    status: job.status as PricingWorksheetAiJobStatus,
    progressLabel: job.progressLabel,
    retryable: job.retryable === true,
    classification: job.classification,
    request: job.request,
    providerStatus: isRecord(job.providerStatus) ? job.providerStatus : {},
    error:
      isRecord(job.error) && typeof job.error.code === "string" && typeof job.error.message === "string"
        ? {
            code: job.error.code as PricingWorksheetAiJobErrorCode,
            message: job.error.message,
            retryable: job.error.retryable === true,
          }
        : null,
    result:
      isRecord(job.result) && typeof job.result.aiInteractionId === "string"
        ? (job.result as unknown as PricingWorksheetAiPreviewResponse)
        : null,
    timestamps: job.timestamps,
  };
}

function wrapJobEnvelope(job: PricingWorksheetAiJobEnvelope) {
  return {
    job,
  } as unknown as Record<string, Json>;
}

async function transitionJobState(params: {
  supabase: Awaited<ReturnType<typeof requireOrganizationMemberForAi>>["supabase"];
  organizationId: string;
  aiInteractionId: string;
  opportunityId?: string | null;
  projectId?: string | null;
  job: PricingWorksheetAiJobEnvelope;
  lifecycleState: "requested" | "generated" | "validated" | "previewed";
  runStatus: "queued" | "running" | "completed" | "failed" | "cancelled";
  validationStatus?: "pending" | "passed" | "warning" | "failed" | "overridden";
  confidence?: number | null;
  provider?: string | null;
  model?: string | null;
}) {
  await transitionAiLifecycleInteraction(params.supabase, {
    organizationId: params.organizationId,
    aiInteractionId: params.aiInteractionId,
    opportunityId: params.opportunityId ?? null,
    projectId: params.projectId ?? null,
    lifecycleState: params.lifecycleState,
    runStatus: params.runStatus,
    validationStatus: params.validationStatus ?? "pending",
    confidence: params.confidence ?? null,
    provider: params.provider ?? null,
    model: params.model ?? null,
    outputStructured: wrapJobEnvelope(params.job),
  });
}

function updateJobEnvelope(
  job: PricingWorksheetAiJobEnvelope,
  patch: Partial<PricingWorksheetAiJobEnvelope>,
): PricingWorksheetAiJobEnvelope {
  return {
    ...job,
    ...patch,
    providerStatus: {
      ...job.providerStatus,
      ...(patch.providerStatus ?? {}),
    },
    timestamps: {
      ...job.timestamps,
      ...(patch.timestamps ?? {}),
    },
  };
}

function getLifecycleProviderMeta(job: PricingWorksheetAiJobEnvelope): PricingWorksheetAiLifecycleProviderMeta {
  // The job envelope's providerStatus is the durable audit trail for requested vs actual provider/model.
  // We mirror the latest known values into ai_interactions top-level provider/model when transitioning state
  // so existing reporting can keep using those columns without losing the richer audit detail.
  const providerStatus = isRecord(job.providerStatus) ? job.providerStatus : {};
  const actualProvider =
    typeof providerStatus.actualProvider === "string" && providerStatus.actualProvider.trim().length > 0
      ? providerStatus.actualProvider
      : null;
  const actualModel =
    typeof providerStatus.actualModel === "string" && providerStatus.actualModel.trim().length > 0
      ? providerStatus.actualModel
      : null;
  const requestedProvider =
    typeof providerStatus.requestedProvider === "string" && providerStatus.requestedProvider.trim().length > 0
      ? providerStatus.requestedProvider
      : null;
  const requestedModel =
    typeof providerStatus.requestedModel === "string" && providerStatus.requestedModel.trim().length > 0
      ? providerStatus.requestedModel
      : null;

  return {
    provider: actualProvider ?? requestedProvider,
    model: actualModel ?? requestedModel,
  };
}

function buildProviderStatusPatch(providerAudit: PricingWorksheetAiAssistantProviderAudit) {
  return {
    requestedProvider: providerAudit.requestedProvider,
    requestedModel: providerAudit.requestedModel,
    actualProvider: providerAudit.actualProvider,
    actualModel: providerAudit.actualModel,
    webSearchEnabled: providerAudit.webSearchEnabled,
  } as Record<string, Json | undefined>;
}

async function assertJobNotCancelled(params: {
  supabase: Awaited<ReturnType<typeof requireOrganizationMemberForAi>>["supabase"];
  organizationId: string;
  aiInteractionId: string;
}) {
  const record = await getAiInteractionJobRecord(params);
  if (record.run_status === "cancelled") {
    throw new Error("Ask AI job cancelled.");
  }
  const envelope = readJobEnvelope(record.output_structured);
  if (envelope?.status === "cancelled") {
    throw new Error("Ask AI job cancelled.");
  }
}

async function runPricingWorksheetAiJob(params: {
  supabase: Awaited<ReturnType<typeof requireOrganizationMemberForAi>>["supabase"];
  memberRole: string;
  request: PricingWorksheetAiJobRequest;
  aiInteractionId: string;
  projectId: string | null;
  opportunityId: string | null;
  classification: ReturnType<typeof classifyPricingWorksheetConstructionIntent>;
  initialJob: PricingWorksheetAiJobEnvelope;
}) {
  let job = params.initialJob;
  const canMutateWorksheet = canManageCommercialData(params.memberRole as AppRole);

  await transitionJobState({
    supabase: params.supabase,
    organizationId: params.request.organizationId,
    aiInteractionId: params.aiInteractionId,
    projectId: params.projectId,
    opportunityId: params.opportunityId,
    lifecycleState: "requested",
    runStatus: "running",
    validationStatus: "pending",
    job: (job = updateJobEnvelope(job, {
      status: "running",
      progressLabel: "Running",
      timestamps: {
        startedAt: new Date().toISOString(),
      },
    })),
    ...getLifecycleProviderMeta(job),
  });

  await assertJobNotCancelled({
    supabase: params.supabase,
    organizationId: params.request.organizationId,
    aiInteractionId: params.aiInteractionId,
  });

  if (params.classification.requiresRetrieval) {
    await transitionJobState({
      supabase: params.supabase,
      organizationId: params.request.organizationId,
      aiInteractionId: params.aiInteractionId,
      projectId: params.projectId,
      opportunityId: params.opportunityId,
      lifecycleState: "requested",
      runStatus: "running",
      validationStatus: "pending",
      job: (job = updateJobEnvelope(job, {
        status: "researching",
        progressLabel: "Researching sources",
      })),
      ...getLifecycleProviderMeta(job),
    });
  }

  const memoryItems = await retrieveOrganizationMemoryForAi({
    organizationId: params.request.organizationId,
    projectId: params.projectId,
    opportunityId: params.opportunityId,
    workbookId: resolveWorkbookId(params.request),
    sheetId: params.request.sheetId ?? null,
    memoryCategories: ["worksheet_structure", "pricing_structure"],
    memoryTypes: ["pricing_worksheet_layout"],
    minimumConfidence: 0.35,
    limit: 12,
  });

  let organizationGuidance = null;
  try {
    organizationGuidance = await retrievePricingWorksheetOrganizationGuidance({
      organizationId: params.request.organizationId,
      projectId: params.projectId,
      opportunityId: params.opportunityId,
      prompt: params.request.prompt ?? "",
      worksheetContext: params.request.worksheetContext,
      classification: params.classification,
      memoryItems,
    });
  } catch {
    organizationGuidance = null;
  }

  await assertJobNotCancelled({
    supabase: params.supabase,
    organizationId: params.request.organizationId,
    aiInteractionId: params.aiInteractionId,
  });

  await transitionJobState({
    supabase: params.supabase,
    organizationId: params.request.organizationId,
    aiInteractionId: params.aiInteractionId,
    projectId: params.projectId,
    opportunityId: params.opportunityId,
    lifecycleState: "requested",
    runStatus: "running",
    validationStatus: "pending",
    job: (job = updateJobEnvelope(job, {
      status: "generating",
      progressLabel: "Generating worksheet",
      providerStatus: {
        phase: "primary_generation",
        webSearchEnabled: true,
      },
    })),
    ...getLifecycleProviderMeta(job),
  });

  let previewResult: Awaited<ReturnType<typeof buildPricingWorksheetEditAssistantPreview>>;
  let usedUnverifiedNoSearchFallback = false;
  let lastGenerationError: ReturnType<typeof classifyJobError> | null = null;

  try {
    previewResult = await buildPricingWorksheetEditAssistantPreview({
      prompt: params.request.prompt ?? "",
      worksheet: params.request.worksheetData,
      worksheetContext: params.request.worksheetContext,
      memoryItems,
      classification: params.classification,
      organizationGuidance,
      followUpContext: params.request.followUpContext ?? null,
      providerOptions: {
        webSearchEnabled: true,
      },
    });
  } catch (error) {
    lastGenerationError = classifyJobError(error);
    throw error;
  }

  job = updateJobEnvelope(job, {
    providerStatus: buildProviderStatusPatch(previewResult.providerAudit),
  });
  await transitionJobState({
    supabase: params.supabase,
    organizationId: params.request.organizationId,
    aiInteractionId: params.aiInteractionId,
    projectId: params.projectId,
    opportunityId: params.opportunityId,
    lifecycleState: "requested",
    runStatus: "running",
    validationStatus: "pending",
    job,
    ...getLifecycleProviderMeta(job),
  });

  if (
    previewResult.generationMeta.fallbackUsed &&
    params.classification.primaryIntent === "worksheet_generation" &&
    params.classification.requiresRetrieval
  ) {
    const primaryFailure = classifyJobError(new Error(previewResult.generationMeta.fallbackReason ?? "Provider request failed."));
    if (primaryFailure.code === "provider_timeout" || primaryFailure.code === "provider_520") {
      await transitionJobState({
        supabase: params.supabase,
        organizationId: params.request.organizationId,
        aiInteractionId: params.aiInteractionId,
        projectId: params.projectId,
        opportunityId: params.opportunityId,
        lifecycleState: "requested",
        runStatus: "running",
        validationStatus: "pending",
        job: (job = updateJobEnvelope(job, {
          status: "generating",
          progressLabel: "Source lookup stalled. Building compact worksheet from unverified assumptions",
          providerStatus: {
            phase: "no_search_fallback_generation",
            webSearchEnabled: false,
            primaryFailureCode: primaryFailure.code,
          },
        })),
        ...getLifecycleProviderMeta(job),
      });

      previewResult = await buildPricingWorksheetEditAssistantPreview({
        prompt: `${params.request.prompt ?? ""}\n\nSource lookup failed or stalled. Build the smallest useful worksheet using internal construction knowledge only. Mark assumptions as unverified and keep the proposal compact.`,
        worksheet: params.request.worksheetData,
        worksheetContext: params.request.worksheetContext,
        memoryItems,
        classification: params.classification,
        organizationGuidance,
        followUpContext: params.request.followUpContext ?? null,
        providerOptions: {
          webSearchEnabled: false,
        },
      });
      job = updateJobEnvelope(job, {
        providerStatus: buildProviderStatusPatch(previewResult.providerAudit),
      });
      await transitionJobState({
        supabase: params.supabase,
        organizationId: params.request.organizationId,
        aiInteractionId: params.aiInteractionId,
        projectId: params.projectId,
        opportunityId: params.opportunityId,
        lifecycleState: "requested",
        runStatus: "running",
        validationStatus: "pending",
        job,
        ...getLifecycleProviderMeta(job),
      });
      usedUnverifiedNoSearchFallback = !previewResult.generationMeta.fallbackUsed;
      lastGenerationError = primaryFailure;
    }
  }

  if (previewResult.generationMeta.fallbackUsed && !isAnthropicSafeUnknownFallback(previewResult.generationMeta)) {
    throw new Error(previewResult.generationMeta.fallbackReason ?? "AI worksheet job failed before a preview was ready.");
  }

  await assertJobNotCancelled({
    supabase: params.supabase,
    organizationId: params.request.organizationId,
    aiInteractionId: params.aiInteractionId,
  });

  await transitionJobState({
    supabase: params.supabase,
    organizationId: params.request.organizationId,
    aiInteractionId: params.aiInteractionId,
    projectId: params.projectId,
    opportunityId: params.opportunityId,
    lifecycleState: "generated",
    runStatus: "running",
    validationStatus: "pending",
    job: (job = updateJobEnvelope(job, {
      status: "validating",
      progressLabel: "Validating preview",
    })),
    ...getLifecycleProviderMeta(job),
  });

  const { preview, generationMeta, providerAudit } = previewResult;

  if (isAnthropicSafeUnknownFallback(generationMeta)) {
    preview.validationWarnings.push({
      ruleKey: "anthropic_safe_unknown_fallback",
      severity: "warning",
      result: "warning",
      message: "The assistant returned a safe answer instead of worksheet edits. Add more detail and retry if you want a previewable worksheet change.",
    });
  }

  if (usedUnverifiedNoSearchFallback) {
    preview.warnings.push("Source lookup failed, so this worksheet was generated without web search. Assumptions should be verified before apply.");
    preview.validationWarnings.push({
      ruleKey: "ai_generation_unverified_sources",
      severity: "warning",
      result: "warning",
      message: "Source lookup failed, so this worksheet was generated without web search. Assumptions should be verified before apply.",
    });
  }

  const hasMutatingOperations = preview.operations.some((operation) => operation.type !== "explain_formula");
  if (!canMutateWorksheet && hasMutatingOperations) {
    preview.validationIssues.push({
      code: "permission_mutation_requires_write",
      message: "You can review this AI suggestion, but worksheet edits require write permission to apply.",
      severity: "warning",
    });
    preview.validationWarnings.push({
      ruleKey: "permission_mutation_requires_write",
      severity: "warning",
      result: "warning",
      message: "You can review this AI suggestion, but worksheet edits require write permission to apply.",
    });
  }

  const validationStatus =
    preview.validationIssues.some((issue) => issue.severity === "error")
      ? "failed"
      : preview.validationIssues.length > 0 || generationMeta.fallbackUsed || usedUnverifiedNoSearchFallback
        ? "warning"
        : "passed";

  const previewResponse = buildPreviewResponse({
    aiInteractionId: params.aiInteractionId,
    workbookId: resolveWorkbookId(params.request),
    worksheetId: params.request.worksheetId ?? resolveWorkbookId(params.request),
    sheetId: params.request.sheetId ?? null,
    sheetName: resolveSheetName(params.request),
    validationStatus,
    preview,
    generationMeta,
  });

  const readyError = preview.validationIssues.some((issue) => issue.severity === "error")
    ? buildJobError(
        "validation_blocked",
        preview.validationIssues.find((issue) => issue.severity === "error")?.message ?? "Validation blocked this preview.",
        false,
      )
    : generationMeta.fallbackUsed && lastGenerationError
      ? lastGenerationError
      : null;

  if (preview.validationIssues.length === 0) {
    try {
      await recordAiInteractionValidation(params.supabase, {
        organizationId: params.request.organizationId,
        aiInteractionId: params.aiInteractionId,
        projectId: params.projectId,
        opportunityId: params.opportunityId,
        module: "pricing_worksheets",
        scopeEntityType: "pricing_worksheet_edit_plan",
        ruleKey: "ai_pricing_worksheet_edit_preview_ready",
        validationType: "workflow_gate",
        severity: "info",
        result: "passed",
        details: {
          responseMode: preview.mode,
          changedCellCount: preview.diffSummary.changedCells.length,
          insertedRowCount: preview.diffSummary.insertedRows.length,
          fallbackUsed: generationMeta.fallbackUsed,
        },
        validationStatus: "passed",
      });
    } catch {
      // Validation observability should not block a preview that is already ready.
    }
  } else {
    for (const issue of preview.validationIssues) {
      try {
        await recordAiInteractionValidation(params.supabase, {
          organizationId: params.request.organizationId,
          aiInteractionId: params.aiInteractionId,
          projectId: params.projectId,
          opportunityId: params.opportunityId,
          module: "pricing_worksheets",
          scopeEntityType: "pricing_worksheet_edit_plan",
          ruleKey: issue.code,
          validationType: getValidationTypeForIssue(issue.code),
          severity: issue.severity === "error" ? "error" : "warning",
          result: issue.severity === "error" ? "failed" : "warning",
          observedValue: issue.message,
          details: {
            message: issue.message,
          },
          validationStatus: issue.severity === "error" ? "failed" : "warning",
        });
      } catch {
        // Validation observability should not block a preview that is already ready.
      }
    }
  }

  await transitionJobState({
    supabase: params.supabase,
    organizationId: params.request.organizationId,
    aiInteractionId: params.aiInteractionId,
    projectId: params.projectId,
    opportunityId: params.opportunityId,
    lifecycleState: "previewed",
    runStatus: "completed",
    validationStatus,
    confidence: confidenceToScore(preview.compactOutput.confidence),
    job: (job = updateJobEnvelope(job, {
      status: "ready",
      progressLabel: "Ready",
      retryable: readyError?.retryable === true,
      error: readyError,
      result: previewResponse,
      timestamps: {
        completedAt: new Date().toISOString(),
      },
      providerStatus: {
        phase: "completed",
        ...buildProviderStatusPatch(providerAudit),
        usedUnverifiedNoSearchFallback,
        provider: generationMeta.provider,
        model: generationMeta.model,
      },
    })),
    ...getLifecycleProviderMeta(job),
  });
}

function schedulePricingWorksheetAiJobExecution(params: {
  supabase: Awaited<ReturnType<typeof requireOrganizationMemberForAi>>["supabase"];
  memberRole: string;
  request: PricingWorksheetAiJobRequest;
  aiInteractionId: string;
  projectId: string | null;
  opportunityId: string | null;
  classification: ReturnType<typeof classifyPricingWorksheetConstructionIntent>;
  initialJob: PricingWorksheetAiJobEnvelope;
}) {
  if (activeExecutions.has(params.aiInteractionId)) {
    return;
  }

  activeExecutions.add(params.aiInteractionId);
  setTimeout(() => {
    void runPricingWorksheetAiJob(params).catch(async (error) => {
      const jobError = classifyJobError(error);
      const currentRecord = await getAiInteractionJobRecord({
        supabase: params.supabase,
        organizationId: params.request.organizationId,
        aiInteractionId: params.aiInteractionId,
      }).catch(() => null);
      const currentJob = currentRecord ? readJobEnvelope(currentRecord.output_structured) ?? params.initialJob : params.initialJob;
      const failedJob = updateJobEnvelope(currentJob, {
        status: jobError.code === "cancelled" ? "cancelled" : "failed",
        progressLabel: jobError.code === "cancelled" ? "Cancelled" : "Failed",
        retryable: jobError.retryable,
        error: jobError,
        timestamps: {
          completedAt: new Date().toISOString(),
        },
        providerStatus: {
          phase: "failed",
        },
      });

      try {
        await transitionJobState({
          supabase: params.supabase,
          organizationId: params.request.organizationId,
          aiInteractionId: params.aiInteractionId,
          projectId: params.projectId,
          opportunityId: params.opportunityId,
          lifecycleState: "requested",
          runStatus: jobError.code === "cancelled" ? "cancelled" : "failed",
          validationStatus: jobError.code === "cancelled" ? "warning" : "failed",
          job: failedJob,
          ...getLifecycleProviderMeta(failedJob),
        });
      } finally {
        activeExecutions.delete(params.aiInteractionId);
      }
    }).finally(() => {
      activeExecutions.delete(params.aiInteractionId);
    });
  }, 0);
}

export async function createPricingWorksheetEditAssistantJob(request: PricingWorksheetAiJobRequest) {
  const { supabase, member } = await requireOrganizationMemberForAi(request.organizationId);
  const opportunity = request.opportunityId
    ? await validateOpportunityForOrganization(request.organizationId, request.opportunityId)
    : null;

  const existingWorksheetsResult = request.opportunityId
    ? await supabase
        .from("opportunity_pricing_worksheets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", request.organizationId)
        .eq("opportunity_id", request.opportunityId)
        .is("archived_at", null)
    : { count: 0, error: null };

  if (existingWorksheetsResult.error) {
    throw new Error(existingWorksheetsResult.error.message);
  }

  const classification = classifyPricingWorksheetConstructionIntent({
    userPrompt: request.prompt ?? "",
    worksheetTradePackage: request.tradePackage,
    worksheetName: request.worksheetName,
    worksheetContext: request.worksheetContext,
    selection: request.worksheetContext.visibleSelection,
  });

  const inputContextSummary = buildAiRequestContextSummary({
    organizationId: request.organizationId,
    projectId: opportunity?.workspace_project_id ?? null,
    opportunityId: request.opportunityId ?? null,
    module: "pricing_worksheets",
    workflowKey: "pricing_worksheet_edit_assistant_job",
    workbookId: resolveWorkbookId(request),
    worksheetId: request.worksheetId ?? resolveWorkbookId(request),
    sheetId: request.sheetId ?? null,
    sheetName: resolveSheetName(request),
    worksheetName: request.worksheetName ?? "Pricing Worksheet",
    tradePackage: request.tradePackage ?? null,
    relatedCounts: {
      existingWorksheetCount: existingWorksheetsResult.count ?? 0,
      promptLength: (request.prompt ?? "").length,
      currentWorksheetRowCount: request.currentWorksheetSummary?.rowCount ?? request.worksheetData.rows.length ?? 0,
      currentWorksheetFormulaCount: request.currentWorksheetSummary?.formulaCount ?? 0,
      currentWorksheetHasContent: request.currentWorksheetSummary?.hasExistingContent ?? true,
    },
    matchedMemoryIds: [],
  });

  const modelConfig = getPricingWorksheetEditAssistantModelConfig();
  const aiInteractionId = await createAiLifecycleInteraction(supabase, {
    organizationId: request.organizationId,
    projectId: opportunity?.workspace_project_id ?? null,
    opportunityId: request.opportunityId ?? null,
    module: "pricing_worksheets",
    interactionType: "reasoning",
    subjectEntityType: "pricing_worksheet_edit_plan",
    provider: modelConfig.provider,
    model: modelConfig.model,
    modelVersion: "2026-05-24",
      promptTemplateKey: "pricing_worksheet_edit_assistant_job_v1",
      promptText: request.prompt ?? `Help with worksheet "${request.worksheetName ?? "Pricing Worksheet"}".`,
      inputContextSummary: {
        ...inputContextSummary,
        workbookId: resolveWorkbookId(request),
        worksheetId: request.worksheetId ?? null,
        sheetId: request.sheetId ?? null,
        sheetName: resolveSheetName(request),
        worksheetContext: {
          headerCount: request.worksheetContext.headers.length,
        sectionCount: request.worksheetContext.sections.length,
        nearbyRowCount: request.worksheetContext.nearbyRows.length,
        selection: request.worksheetContext.visibleSelection,
      },
      constructionIntent: classification,
    },
    inputRefs: [],
    privacyClassification: "financial_sensitive",
  });

  const initialJob = buildInitialJobEnvelope({
    request,
    classification: classification as unknown as Record<string, Json | undefined>,
    requestedProvider: modelConfig.provider,
    requestedModel: modelConfig.model,
  });

  await transitionJobState({
    supabase,
    organizationId: request.organizationId,
    aiInteractionId,
    projectId: opportunity?.workspace_project_id ?? null,
    opportunityId: request.opportunityId ?? null,
    lifecycleState: "requested",
    runStatus: "queued",
    validationStatus: "pending",
    job: initialJob,
    ...getLifecycleProviderMeta(initialJob),
  });

  schedulePricingWorksheetAiJobExecution({
    supabase,
    memberRole: member.role,
    request,
    aiInteractionId,
    projectId: opportunity?.workspace_project_id ?? null,
    opportunityId: request.opportunityId ?? null,
    classification,
    initialJob,
  });

  return {
    aiInteractionId,
    status: initialJob.status,
    progressLabel: initialJob.progressLabel,
  };
}

export async function getPricingWorksheetEditAssistantJob(params: {
  organizationId: string;
  aiInteractionId: string;
}) {
  const { supabase } = await requireOrganizationMemberForAi(params.organizationId);
  const record = await getAiInteractionJobRecord({
    supabase,
    organizationId: params.organizationId,
    aiInteractionId: params.aiInteractionId,
  });
  const job = readJobEnvelope(record.output_structured);

  if (!job) {
    throw new Error("AI job payload is not available.");
  }

  return {
    aiInteractionId: record.id,
    jobId: record.id,
    workbookId:
      typeof job.request.workbookId === "string"
        ? job.request.workbookId
        : typeof job.request.worksheetId === "string"
          ? job.request.worksheetId
          : null,
    worksheetId: typeof job.request.worksheetId === "string" ? job.request.worksheetId : null,
    sheetId: typeof job.request.sheetId === "string" ? job.request.sheetId : null,
    sheetName:
      typeof job.request.sheetName === "string"
        ? job.request.sheetName
        : typeof job.request.worksheetName === "string"
          ? job.request.worksheetName
          : null,
    status: job.status,
    progressLabel: job.progressLabel,
    retryable: job.retryable,
    lifecycleState: record.lifecycle_state,
    validationStatus: record.validation_status ?? "pending",
    preview: job.result?.preview ?? null,
    error: job.error,
  };
}

export async function cancelPricingWorksheetEditAssistantJob(params: {
  organizationId: string;
  aiInteractionId: string;
}) {
  const { supabase } = await requireOrganizationMemberForAi(params.organizationId);
  const record = await getAiInteractionJobRecord({
    supabase,
    organizationId: params.organizationId,
    aiInteractionId: params.aiInteractionId,
  });
  const job = readJobEnvelope(record.output_structured);
  if (!job) {
    throw new Error("AI job payload is not available.");
  }

  const cancelledJob = updateJobEnvelope(job, {
    status: "cancelled",
    progressLabel: "Cancelled",
    retryable: false,
    error: buildJobError("cancelled", "This Ask AI job was cancelled.", false),
    timestamps: {
      completedAt: new Date().toISOString(),
    },
  });

  await transitionJobState({
    supabase,
    organizationId: params.organizationId,
    aiInteractionId: params.aiInteractionId,
    projectId: record.project_id,
    opportunityId: record.opportunity_id,
    lifecycleState: "requested",
    runStatus: "cancelled",
    validationStatus: "warning",
    job: cancelledJob,
  });

  return {
    aiInteractionId: params.aiInteractionId,
    status: cancelledJob.status,
    progressLabel: cancelledJob.progressLabel,
    error: cancelledJob.error,
  };
}
