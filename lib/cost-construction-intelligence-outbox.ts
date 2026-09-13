import "server-only";

import {
  getPricingWorksheetAiProvider,
  getPricingWorksheetAiProviderName,
  getPricingWorksheetAnthropicModel,
  getPricingWorksheetOpenAiModel,
} from "@/lib/ai/providers/pricing-worksheet/registry";
import { buildOrganizationAiContext } from "@/lib/organization-ai-context";
import { isPricingWorksheetProviderError } from "@/lib/ai/providers/pricing-worksheet/types";
import {
  assessCostConstructionIntelligenceQuality,
  buildCostConstructionIntelligenceSchema,
  buildCostConstructionIntelligenceSnapshot,
  COST_CONSTRUCTION_INTELLIGENCE_CLASSIFICATION_VERSION,
  COST_CONSTRUCTION_INTELLIGENCE_OPENAI_MODEL_FALLBACK,
  COST_CONSTRUCTION_INTELLIGENCE_PROMPT_VERSION,
  type CostConstructionIntelligenceEventRow,
  type CostConstructionIntelligenceQueueRow,
  type CostConstructionIntelligenceReviewStatus,
  logCostConstructionIntelligenceFailure,
  normalizeCostConstructionIntelligenceResult,
} from "@/lib/cost-construction-intelligence";
import { enqueueConstructionMemoryEvidenceEvent } from "@/lib/construction-memory-evidence-pools";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const DEFAULT_BATCH_LIMIT = 12;
const DEFAULT_LEASE_SECONDS = 600;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
const DEFAULT_WORKER_ID = "cost-construction-intelligence-worker";

type FinalizeInput = {
  eventId: string;
  claimToken?: string | null;
  processingStatus: Extract<
    CostConstructionIntelligenceReviewStatus,
    "completed" | "retry_scheduled" | "dead_lettered"
  >;
  retryAfter?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type RunCostConstructionIntelligenceWorkerInput = {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
  now?: string;
};

export type RunCostConstructionIntelligenceWorkerResult = {
  claimedCount: number;
  processedCount: number;
  completedCount: number;
  retriedCount: number;
  deadLetteredCount: number;
  durationMs: number;
  provider: string | null;
  model: string | null;
};

type AdminLike = ReturnType<typeof createAdminSupabaseClient>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toRecord(value: unknown) {
  return isObject(value) ? (value as Record<string, Json | null>) : {};
}

function isRetryableWorkerError(value: unknown): value is { code?: string; retryable?: boolean } {
  return isObject(value);
}

function parseClaimedEvent(value: Record<string, unknown>): CostConstructionIntelligenceEventRow | null {
  const id = toNullableString(value.id);
  const organizationId = toNullableString(value.organization_id);
  const sourceType = toNullableString(value.source_type);
  const sourceId = toNullableString(value.source_id);
  const tradesstackCostCode = toNullableString(value.tradesstack_cost_code);
  const tradesstackCostCodeLabel = toNullableString(value.tradesstack_cost_code_label);
  const description = typeof value.description === "string" ? value.description : "";
  const createdAt = toNullableString(value.created_at);
  const updatedAt = toNullableString(value.updated_at);

  if (
    !id ||
    !organizationId ||
    !sourceType ||
    !sourceId ||
    !tradesstackCostCode ||
    !tradesstackCostCodeLabel ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    idempotencyKey: toNullableString(value.idempotency_key) ?? id,
    organizationId,
    projectId: toNullableString(value.project_id),
    sourceType: sourceType as CostConstructionIntelligenceEventRow["sourceType"],
    sourceId,
    sourceLineId: toNullableString(value.source_line_id),
    tradesstackCostCode,
    tradesstackCostCodeLabel,
    accountingMappingId: toNullableString(value.accounting_mapping_id),
    description,
    supplierId: toNullableString(value.supplier_id),
    supplierNameSnapshot: toNullableString(value.supplier_name_snapshot),
    quantity: toNullableNumber(value.quantity),
    unit: toNullableString(value.unit),
    rate: toNullableNumber(value.rate),
    amount: toNullableNumber(value.amount),
    documentContext: toRecord(value.document_context),
    eventPayload: toRecord(value.event_payload),
    aiConstructionIntelligence: (value.ai_construction_intelligence ?? null) as Json | null,
    classificationStatus: (toNullableString(value.classification_status) ??
      "pending") as CostConstructionIntelligenceReviewStatus,
    classificationVersion:
      typeof value.classification_version === "number"
        ? value.classification_version
        : COST_CONSTRUCTION_INTELLIGENCE_CLASSIFICATION_VERSION,
    aiProvider: toNullableString(value.ai_provider),
    aiModel: toNullableString(value.ai_model),
    aiPromptVersion: typeof value.ai_prompt_version === "number" ? value.ai_prompt_version : null,
    processedAt: toNullableString(value.processed_at),
    errorCode: toNullableString(value.error_code),
    errorMessage: toNullableString(value.error_message),
    createdAt,
    updatedAt,
  };
}

function buildRetryAfter(attemptCount: number, now: string) {
  const multiplier = Math.max(0, attemptCount - 1);
  const retryDelayMinutes = Math.min(5 * 2 ** multiplier, 24 * 60);
  return new Date(Date.parse(now) + retryDelayMinutes * 60 * 1000).toISOString();
}

function buildAiVisibleEventPayload(event: CostConstructionIntelligenceEventRow) {
  const payload = { ...event.eventPayload };
  delete payload.originalClassification;
  delete payload.finalClassification;
  delete payload.tradeLabel;
  delete payload.workType;
  delete payload.costType;
  delete payload.costCode;
  delete payload.internalCostCode;
  delete payload.intelligenceCostCode;
  return payload;
}

function buildAiVisibleDocumentContext(event: CostConstructionIntelligenceEventRow) {
  const context = { ...event.documentContext };
  delete context.tradeLabel;
  delete context.workType;
  delete context.costType;
  delete context.costCode;
  delete context.internalCostCode;
  delete context.intelligenceCostCode;
  return context;
}

function buildConstructionFewShotExamples() {
  return [
    {
      input: {
        description: "13mm GIB Standard plasterboard sheets for internal partitions",
        tradesstackCostCodeLabel: "Materials",
        supplierName: "PlaceMakers",
        unit: "sheet",
        rate: 18.5,
      },
      output: {
        trade: "Wall Linings",
        system: "Plasterboard Linings",
        product: "13mm GIB Standard plasterboard sheets",
        activity: "Supply",
        likely_use: "Internal wall lining and partition walls",
        evidence: ["13mm", "GIB Standard", "plasterboard sheets", "internal partitions"],
      },
    },
    {
      input: {
        description: "Rondo 64mm steel studs",
        tradesstackCostCodeLabel: "Materials",
      },
      output: {
        trade: "Wall Framing",
        system: "Light gauge steel wall framing",
        product: "Rondo 64mm steel stud",
        activity: "Supply",
        likely_use: "Plasterboard wall framing",
        evidence: ["Rondo", "64mm", "steel studs"],
      },
    },
    {
      input: {
        description: "Coloursteel cladding sheets",
        tradesstackCostCodeLabel: "Materials",
      },
      output: {
        trade: "Cladding",
        system: "Metal cladding",
        product: "Coloursteel cladding sheet",
        activity: "Supply",
        likely_use: "Exterior facade or roof cladding",
        evidence: ["Coloursteel", "cladding sheets"],
      },
    },
    {
      input: {
        description: "100 x 25mm Hardieboard",
        tradesstackCostCodeLabel: "Materials",
        documentContext: {
          upstreamTradeHint: "Multilayer board flooring",
        },
      },
      output: {
        trade: "Cladding",
        system: "Fibre cement cladding or lining board",
        product: "100 x 25mm Hardieboard",
        activity: "Supply",
        likely_use: "Fibre cement board for external cladding or lining; exact assembly needs confirmation",
        evidence: ["Hardieboard", "100 x 25mm", "weak upstream hint only"],
      },
    },
    {
      input: {
        description: "Scaffold hire weekly charge",
        tradesstackCostCodeLabel: "Plant & Equipment",
      },
      output: {
        trade: "Temporary Access",
        system: "Scaffolding",
        product: "Scaffold hire",
        activity: "Hire",
        likely_use: "Temporary access and working platform",
        evidence: ["scaffold", "hire", "weekly charge"],
      },
    },
    {
      input: {
        description: "Subcontract supply and install partition package",
        tradesstackCostCodeLabel: "Subcontractors",
      },
      output: {
        trade: "Wall Linings",
        system: "Partition wall package",
        product: "Partition supply and install package",
        activity: "Supply and install",
        likely_use: "Partition wall package delivery",
        evidence: ["subcontract", "supply and install", "partition package"],
      },
    },
  ];
}

export function buildCostConstructionIntelligenceWorkerPrompts(
  event: CostConstructionIntelligenceEventRow,
  options?: {
    organizationConstructionContext?: string | null;
  },
) {
  const context = {
    sourceEventId: event.id,
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    sourceLineId: event.sourceLineId,
    projectId: event.projectId,
    tradesstackCostCode: event.tradesstackCostCode,
    tradesstackCostCodeLabel: event.tradesstackCostCodeLabel,
    accountingMappingId: event.accountingMappingId,
    accountingMappingState: event.accountingMappingId ? "mapped" : "unmapped",
    description: event.description,
    supplierId: event.supplierId,
    supplierName: event.supplierNameSnapshot,
    quantity: event.quantity,
    unit: event.unit,
    rate: event.rate,
    amount: event.amount,
    documentContext: buildAiVisibleDocumentContext(event),
    eventPayload: buildAiVisibleEventPayload(event),
  };

  return {
    systemPrompt:
      [
        "You are a senior construction estimator and project manager.",
        "Your job is to extract reusable construction knowledge from a record that has already been financially routed.",
        "Do not classify accounting.",
        "Do not classify cost codes.",
        "Never change or suggest TradesStack routing codes.",
        "Never infer accounting codes, export mappings, posting actions, or report grouping.",
        "The financial routing is already complete and is provided only as background context.",
        "Focus on what the record tells us about construction:",
        "trade, subtrade, work package, building system, assembly, component, product, product family, manufacturer or brand, activity, install method, likely use, related components, risks or exclusions, and project or location context.",
        "Think like a senior estimator building company knowledge for future pricing, procurement, variations, productivity, and project delivery.",
        "Use the natural-language description as the primary evidence.",
        "Use supplier, quantity, unit, rate, amount, and financial routing only as supporting context.",
        "Ignore weak or conflicting legacy taxonomy labels unless they clearly match the description.",
        "If upstream labels conflict with the description, prefer the description and concrete product wording.",
        "Return the best evidence-based construction interpretation.",
        "Use null where something is genuinely unknown.",
        "Do not use Unknown, N/A, or vague filler values.",
        "For simple records, still extract useful knowledge.",
        "For example, 13mm GIB Standard plasterboard sheet should identify wall linings, plasterboard system, product, and likely use.",
        "Install GIB plasterboard should identify installation activity and likely trade and system.",
        "Rondo Keylock grid should identify suspended ceiling grid system.",
        "Scaffold hire should identify temporary access or scaffolding hire.",
        "Payment Claim should identify payment claim activity, but leave construction product and system fields null.",
      ].join(" "),
    userPrompt: [
      "Extract construction knowledge from this record.",
      "",
      "The record has already been financially routed. The routing code is context only and must not be changed.",
      "",
      "Question:",
      "What construction knowledge can TradesStack learn from this record for future estimating, procurement, productivity, variations, and AI assistance?",
      "",
      "Prioritise:",
      "1. The item description",
      "2. Product names / brands / dimensions",
      "3. Activity words such as supply, install, hire, claim, retention",
      "4. Supplier or document context",
      "5. Quantity / unit / rate only as supporting evidence",
      "",
      "Do not answer accounting questions.",
      "Do not infer cost codes.",
      "Do not restate the routing category as the construction meaning.",
      "",
      options?.organizationConstructionContext ?? null,
      options?.organizationConstructionContext ? "" : null,
      "Return structured construction intelligence only.",
      "",
      "Few-shot examples:",
      JSON.stringify(buildConstructionFewShotExamples(), null, 2),
      "",
      JSON.stringify(context, null, 2),
    ].filter((value): value is string => typeof value === "string").join("\n"),
  };
}

type ReusableDuplicateSnapshot = {
  snapshot: Record<string, unknown>;
  provider: string | null;
  model: string | null;
};

async function loadReusableDuplicateMaterialSnapshot(params: {
  admin: AdminLike;
  event: CostConstructionIntelligenceEventRow;
}): Promise<ReusableDuplicateSnapshot | null> {
  if (params.event.sourceType !== "organization_material") {
    return null;
  }

  const table = params.admin.from("cost_construction_intelligence_events");

  const { data, error } = await table
    .select("ai_construction_intelligence, ai_provider, ai_model")
    .eq("organization_id", params.event.organizationId)
    .eq("source_type", params.event.sourceType)
    .eq("description", params.event.description)
    .eq("tradesstack_cost_code", params.event.tradesstackCostCode)
    .eq("classification_status", "completed")
    .neq("id", params.event.id)
    .order("processed_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!isObject(row) || !isObject(row.ai_construction_intelligence)) {
    return null;
  }

  return {
    snapshot: row.ai_construction_intelligence as Record<string, unknown>,
    provider: toNullableString(row.ai_provider),
    model: toNullableString(row.ai_model),
  };
}

export function resolveCostConstructionIntelligenceProviderSelection() {
  const providerName = getPricingWorksheetAiProviderName();
  const provider = getPricingWorksheetAiProvider(providerName);
  const model =
    providerName === "anthropic"
      ? getPricingWorksheetAnthropicModel()
      : getPricingWorksheetOpenAiModel() || COST_CONSTRUCTION_INTELLIGENCE_OPENAI_MODEL_FALLBACK;

  return {
    providerName,
    provider,
    model,
  };
}

async function claimCostConstructionIntelligenceBatch(params: {
  admin: AdminLike;
  limit: number;
  organizationId?: string | null;
  workerId: string;
  leaseSeconds: number;
}) {
  const { data, error } = await params.admin.rpc("claim_cost_construction_intelligence_batch" as never, {
    p_limit: Math.max(params.limit, 1),
    p_organization_id: params.organizationId ?? null,
    p_worker_id: params.workerId,
    p_lease_seconds: Math.max(params.leaseSeconds, 30),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => parseClaimedEvent((row ?? {}) as Record<string, unknown>))
    .filter((row): row is CostConstructionIntelligenceEventRow => row !== null);
}

async function loadQueueStateByEventIds(admin: AdminLike, eventIds: string[]) {
  if (eventIds.length === 0) {
    return new Map<string, CostConstructionIntelligenceQueueRow>();
  }

  const table = admin.from("cost_construction_intelligence_queue" as never) as unknown as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };

  const { data, error } = await table
    .select("event_id, processing_status, attempt_count, max_attempts, claim_token")
    .in("event_id", eventIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    (data ?? []).flatMap((row) => {
      const eventId = toNullableString(row.event_id);
      if (!eventId) {
        return [];
      }

      return [
        [
          eventId,
          {
            eventId,
            processingStatus: (toNullableString(row.processing_status) ??
              "pending") as CostConstructionIntelligenceReviewStatus,
            attemptCount: typeof row.attempt_count === "number" ? row.attempt_count : 0,
            maxAttempts: typeof row.max_attempts === "number" ? row.max_attempts : 5,
            claimToken: toNullableString(row.claim_token),
          } satisfies CostConstructionIntelligenceQueueRow,
        ],
      ];
    }),
  );
}

async function persistEventResult(params: {
  admin: AdminLike;
  eventId: string;
  classificationStatus: "completed" | "retry_scheduled" | "dead_lettered";
  aiConstructionIntelligence?: Json | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiPromptVersion?: number | null;
  processedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const table = params.admin.from("cost_construction_intelligence_events" as never) as unknown as {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };

  const { error } = await table
    .update({
      classification_status: params.classificationStatus,
      ai_construction_intelligence: params.aiConstructionIntelligence ?? null,
      ai_provider: params.aiProvider ?? null,
      ai_model: params.aiModel ?? null,
      ai_prompt_version: params.aiPromptVersion ?? null,
      processed_at: params.processedAt ?? null,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.eventId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateSourceRowIntelligence(params: {
  admin: AdminLike;
  event: CostConstructionIntelligenceEventRow;
  snapshot: Json;
}) {
  const patch = { ai_construction_intelligence: params.snapshot };

  if (params.event.sourceType === "cost_item") {
    const { error } = await params.admin.from("cost_items").update(patch).eq("id", params.event.sourceId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  if (params.event.sourceType === "organization_material") {
    const { error } = await params.admin
      .from("organization_materials")
      .update(patch)
      .eq("id", params.event.sourceId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  if (params.event.sourceType === "supplier_invoice_line_allocation") {
    const { error } = await params.admin
      .from("supplier_invoice_line_allocations")
      .update(patch)
      .eq("id", params.event.sourceId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  if (params.event.sourceType === "project_actual_cost_event") {
    const { error } = await params.admin
      .from("project_actual_cost_events")
      .update(patch)
      .eq("id", params.event.sourceId);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function finalizeCostConstructionIntelligenceBatch(admin: AdminLike, inputs: FinalizeInput[]) {
  if (inputs.length === 0) {
    return {
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
    };
  }

  const { data, error } = await admin.rpc("finalize_cost_construction_intelligence_batch" as never, {
    p_inputs: inputs,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (isObject(data) ? data : {}) as Record<string, unknown>;
  return {
    completedCount:
      typeof payload.completedCount === "number" ? payload.completedCount : 0,
    retriedCount: typeof payload.retriedCount === "number" ? payload.retriedCount : 0,
    deadLetteredCount:
      typeof payload.deadLetteredCount === "number" ? payload.deadLetteredCount : 0,
  };
}

export async function runCostConstructionIntelligenceWorker(
  input: RunCostConstructionIntelligenceWorkerInput = {},
) {
  const startedAt = Date.now();
  const now = input.now ?? new Date().toISOString();
  const admin = createAdminSupabaseClient();
  const providerSelection = resolveCostConstructionIntelligenceProviderSelection();
  const provider = providerSelection.provider;
  const model = providerSelection.model;
  const claimedEvents = await claimCostConstructionIntelligenceBatch({
    admin,
    limit: Math.max(input.limit ?? DEFAULT_BATCH_LIMIT, 1),
    organizationId: input.organizationId ?? null,
    workerId: input.workerId ?? DEFAULT_WORKER_ID,
    leaseSeconds: Math.max(input.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 30),
  });

  const queueStateByEventId = await loadQueueStateByEventIds(
    admin,
    claimedEvents.map((event) => event.id),
  );

  const finalizeInputs: FinalizeInput[] = [];

  for (const event of claimedEvents) {
    const queueState = queueStateByEventId.get(event.id);

    try {
      const duplicateSnapshot = await loadReusableDuplicateMaterialSnapshot({
        admin,
        event,
      });
      if (duplicateSnapshot) {
        const duplicateClassification = normalizeCostConstructionIntelligenceResult(
          duplicateSnapshot.snapshot,
        );
        if (duplicateClassification) {
          const duplicateQuality = assessCostConstructionIntelligenceQuality({
            classification: duplicateClassification,
            description: event.description,
            sourceType: event.sourceType,
            tradesstackCostCode: event.tradesstackCostCode,
          });

          if (duplicateQuality.isAcceptable) {
            const classifiedAt = new Date().toISOString();
            const snapshot = buildCostConstructionIntelligenceSnapshot({
              classification: duplicateClassification,
              event,
              provider: duplicateSnapshot.provider,
              model: duplicateSnapshot.model,
              classifiedAt,
            });

            await updateSourceRowIntelligence({
              admin,
              event,
              snapshot: snapshot as unknown as Json,
            });

            await persistEventResult({
              admin,
              eventId: event.id,
              classificationStatus: "completed",
              aiConstructionIntelligence: snapshot as unknown as Json,
              aiProvider: duplicateSnapshot.provider,
              aiModel: duplicateSnapshot.model,
              aiPromptVersion: COST_CONSTRUCTION_INTELLIGENCE_PROMPT_VERSION,
              processedAt: classifiedAt,
              errorCode: null,
              errorMessage: null,
            });
            await enqueueConstructionMemoryEvidenceEvent({
              organizationId: event.organizationId,
              sourceEventId: event.id,
            });

            finalizeInputs.push({
              eventId: event.id,
              claimToken: queueState?.claimToken ?? null,
              processingStatus: "completed",
            });
            continue;
          }
        }
      }

      const organizationAiContext = await buildOrganizationAiContext({
        organizationId: event.organizationId,
      });
      const prompts = buildCostConstructionIntelligenceWorkerPrompts(event, {
        organizationConstructionContext: organizationAiContext.organizationConstructionContext,
      });
      const response = await provider.generateEditPlan({
        systemPrompt: prompts.systemPrompt,
        userPrompt: prompts.userPrompt,
        schema: buildCostConstructionIntelligenceSchema(),
        model,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
        enableWebSearch: false,
        metadata: {
          schemaKind: "cost_construction_intelligence",
          engine: "cost_construction_intelligence",
        },
      });

      const normalized = normalizeCostConstructionIntelligenceResult(response.parsedJson);
      if (!normalized) {
        throw new Error("AI provider did not return a valid construction intelligence object.");
      }

      const quality = assessCostConstructionIntelligenceQuality({
        classification: normalized,
        description: event.description,
        sourceType: event.sourceType,
        tradesstackCostCode: event.tradesstackCostCode,
      });
      if (!quality.isAcceptable) {
        throw Object.assign(
          new Error(quality.reason ?? "Construction intelligence quality check failed."),
          {
            code: quality.reason ?? "quality_failed",
            retryable: false,
          },
        );
      }

      const classifiedAt = new Date().toISOString();
      const snapshot = buildCostConstructionIntelligenceSnapshot({
        classification: normalized,
        event,
        provider: response.provider,
        model: response.model,
        classifiedAt,
      });

      await updateSourceRowIntelligence({
        admin,
        event,
        snapshot: snapshot as unknown as Json,
      });

      await persistEventResult({
        admin,
        eventId: event.id,
        classificationStatus: "completed",
        aiConstructionIntelligence: snapshot as unknown as Json,
        aiProvider: response.provider,
        aiModel: response.model,
        aiPromptVersion: COST_CONSTRUCTION_INTELLIGENCE_PROMPT_VERSION,
        processedAt: classifiedAt,
        errorCode: null,
        errorMessage: null,
      });
      await enqueueConstructionMemoryEvidenceEvent({
        organizationId: event.organizationId,
        sourceEventId: event.id,
      });

      finalizeInputs.push({
        eventId: event.id,
        claimToken: queueState?.claimToken ?? null,
        processingStatus: "completed",
      });
    } catch (error) {
      const retryable = isPricingWorksheetProviderError(error)
        ? error.retryable
        : isRetryableWorkerError(error) && typeof error.retryable === "boolean"
          ? error.retryable
          : true;
      const errorCode = isPricingWorksheetProviderError(error)
        ? error.code
        : isRetryableWorkerError(error) && typeof error.code === "string"
          ? error.code
          : "worker_failed";
      const errorMessage = error instanceof Error ? error.message : "Unknown worker failure.";
      const attemptCount = queueState?.attemptCount ?? 1;
      const maxAttempts = queueState?.maxAttempts ?? 5;
      const shouldRetry = retryable && attemptCount < maxAttempts;

      await persistEventResult({
        admin,
        eventId: event.id,
        classificationStatus: shouldRetry ? "retry_scheduled" : "dead_lettered",
        aiConstructionIntelligence: null,
        processedAt: null,
        errorCode,
        errorMessage,
      });

      finalizeInputs.push({
        eventId: event.id,
        claimToken: queueState?.claimToken ?? null,
        processingStatus: shouldRetry ? "retry_scheduled" : "dead_lettered",
        retryAfter: shouldRetry ? buildRetryAfter(attemptCount, now) : null,
        errorCode,
        errorMessage,
      });

      logCostConstructionIntelligenceFailure("worker-process", error, {
        eventId: event.id,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
      });
    }
  }

  const finalized = await finalizeCostConstructionIntelligenceBatch(admin, finalizeInputs);

  return {
    claimedCount: claimedEvents.length,
    processedCount: finalizeInputs.length,
    completedCount: finalized.completedCount,
    retriedCount: finalized.retriedCount,
    deadLetteredCount: finalized.deadLetteredCount,
    durationMs: Date.now() - startedAt,
    provider: provider.name,
    model,
  } satisfies RunCostConstructionIntelligenceWorkerResult;
}
