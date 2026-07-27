import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const COST_CONSTRUCTION_INTELLIGENCE_CLASSIFICATION_VERSION = 2;
export const COST_CONSTRUCTION_INTELLIGENCE_PROMPT_VERSION = 3;
export const COST_CONSTRUCTION_INTELLIGENCE_OPENAI_MODEL_FALLBACK = "gpt-5.5";
export const EMPTY_COST_CONSTRUCTION_INTELLIGENCE: Record<string, never> = {};

export const COST_CONSTRUCTION_INTELLIGENCE_SOURCE_TYPES = [
  "cost_item",
  "organization_material",
  "supplier_invoice_line_allocation",
  "project_actual_cost_event",
] as const;

export type CostConstructionIntelligenceSourceType =
  (typeof COST_CONSTRUCTION_INTELLIGENCE_SOURCE_TYPES)[number];

export type CostConstructionIntelligenceReviewStatus =
  | "pending"
  | "claimed"
  | "completed"
  | "retry_scheduled"
  | "dead_lettered";

export type CostConstructionIntelligenceEventInput = {
  idempotencyKey: string;
  organizationId: string;
  projectId?: string | null;
  sourceType: CostConstructionIntelligenceSourceType;
  sourceId: string;
  sourceLineId?: string | null;
  tradesstackCostCode: string;
  tradesstackCostCodeLabel: string;
  accountingMappingId?: string | null;
  description: string;
  supplierId?: string | null;
  supplierName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  rate?: number | null;
  amount?: number | null;
  documentContext?: Record<string, Json | null>;
  eventPayload?: Record<string, Json | null>;
  classificationVersion?: number;
  maxAttempts?: number;
};

export type CostConstructionIntelligenceEventRow = {
  id: string;
  idempotencyKey: string;
  organizationId: string;
  projectId: string | null;
  sourceType: CostConstructionIntelligenceSourceType;
  sourceId: string;
  sourceLineId: string | null;
  tradesstackCostCode: string;
  tradesstackCostCodeLabel: string;
  accountingMappingId: string | null;
  description: string;
  supplierId: string | null;
  supplierNameSnapshot: string | null;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  documentContext: Record<string, Json | null>;
  eventPayload: Record<string, Json | null>;
  aiConstructionIntelligence: Json | null;
  classificationStatus: CostConstructionIntelligenceReviewStatus;
  classificationVersion: number;
  aiProvider: string | null;
  aiModel: string | null;
  aiPromptVersion: number | null;
  processedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CostConstructionIntelligenceQueueRow = {
  eventId: string;
  processingStatus: CostConstructionIntelligenceReviewStatus;
  attemptCount: number;
  maxAttempts: number;
  claimToken: string | null;
};

export type CostConstructionIntelligenceClassification = {
  trade: string | null;
  subtrade: string | null;
  work_package: string | null;
  system: string | null;
  assembly: string | null;
  component: string | null;
  product_family: string | null;
  product: string | null;
  manufacturer: string | null;
  brand: string | null;
  supplier: string | null;
  activity: string | null;
  install_method: string | null;
  application_area: string | null;
  location_context: string | null;
  project_context: string | null;
  likely_use: string | null;
  related_components: string[];
  exclusions_or_risks: string[];
  normalization_tokens: string[];
  confidence: number | null;
  reasoning: string | null;
  evidence: string[];
};

export type CostConstructionIntelligenceNormalization = {
  tokens: string[];
  productSignature: string | null;
  constructionSignature: string | null;
  groupingKeys: string[];
};

export type CostConstructionIntelligenceSnapshot = CostConstructionIntelligenceClassification & {
  classificationVersion: number;
  promptVersion: number;
  provider: string | null;
  model: string | null;
  classifiedAt: string;
  sourceType: CostConstructionIntelligenceSourceType;
  sourceEventId: string;
  documentContext: Record<string, Json | null>;
  normalization: CostConstructionIntelligenceNormalization;
};

export type CostConstructionIntelligenceQualityAssessment = {
  isAcceptable: boolean;
  coreFieldCount: number;
  reason: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CONSTRUCTION_INTELLIGENCE_NULL_TOKENS = new Set([
  "-",
  "/",
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "unclear",
  "unsure",
  "not applicable",
  "not known",
  "not specified",
  "unspecified",
]);

function toNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const withoutControlCharacters = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const trimmed = withoutControlCharacters.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const alphanumericOnly = trimmed.replace(/[\s\p{P}\p{S}]+/gu, "");
  if (alphanumericOnly.length === 0) {
    return null;
  }

  return CONSTRUCTION_INTELLIGENCE_NULL_TOKENS.has(trimmed.toLowerCase()) ? null : trimmed;
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampConfidence(value: unknown) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return null;
  }

  return Math.max(0, Math.min(1, numeric));
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toNullableString(entry))
    .filter((entry): entry is string => typeof entry === "string");
}

function slugifyToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function uniqueTokens(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }

    const normalized = slugifyToken(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

export function isCostConstructionIntelligenceSourceType(
  value: unknown,
): value is CostConstructionIntelligenceSourceType {
  return (
    typeof value === "string" &&
    (COST_CONSTRUCTION_INTELLIGENCE_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

export function buildCostConstructionIntelligenceIdempotencyKey(params: {
  sourceType: CostConstructionIntelligenceSourceType;
  sourceId: string;
  sourceLineId?: string | null;
  revisionToken?: string | null;
}) {
  return [
    "cost-construction-intelligence",
    params.sourceType,
    params.sourceId,
    params.sourceLineId?.trim() || "root",
    params.revisionToken?.trim() || "current",
  ].join(":");
}

export function buildCostConstructionIntelligenceSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "trade",
      "subtrade",
      "work_package",
      "system",
      "assembly",
      "component",
      "product_family",
      "product",
      "manufacturer",
      "brand",
      "supplier",
      "activity",
      "install_method",
      "application_area",
      "location_context",
      "project_context",
      "likely_use",
      "related_components",
      "exclusions_or_risks",
      "normalization_tokens",
      "confidence",
      "reasoning",
      "evidence",
    ],
    properties: {
      trade: { type: ["string", "null"] },
      subtrade: { type: ["string", "null"] },
      work_package: { type: ["string", "null"] },
      system: { type: ["string", "null"] },
      assembly: { type: ["string", "null"] },
      component: { type: ["string", "null"] },
      product_family: { type: ["string", "null"] },
      product: { type: ["string", "null"] },
      manufacturer: { type: ["string", "null"] },
      brand: { type: ["string", "null"] },
      supplier: { type: ["string", "null"] },
      activity: { type: ["string", "null"] },
      install_method: { type: ["string", "null"] },
      application_area: { type: ["string", "null"] },
      location_context: { type: ["string", "null"] },
      project_context: { type: ["string", "null"] },
      likely_use: { type: ["string", "null"] },
      related_components: {
        type: "array",
        items: { type: "string" },
      },
      exclusions_or_risks: {
        type: "array",
        items: { type: "string" },
      },
      normalization_tokens: {
        type: "array",
        items: { type: "string" },
      },
      confidence: { type: ["number", "null"] },
      reasoning: { type: ["string", "null"] },
      evidence: {
        type: "array",
        items: { type: "string" },
      },
    },
  } as const;
}

export function normalizeCostConstructionIntelligenceResult(
  value: unknown,
): CostConstructionIntelligenceClassification | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    trade: toNullableString(value.trade),
    subtrade: toNullableString(value.subtrade),
    work_package: toNullableString(value.work_package),
    system: toNullableString(value.system),
    assembly: toNullableString(value.assembly),
    component: toNullableString(value.component),
    product_family: toNullableString(value.product_family),
    product: toNullableString(value.product),
    manufacturer: toNullableString(value.manufacturer),
    brand: toNullableString(value.brand),
    supplier: toNullableString(value.supplier),
    activity: toNullableString(value.activity),
    install_method: toNullableString(value.install_method),
    application_area: toNullableString(value.application_area),
    location_context: toNullableString(value.location_context),
    project_context: toNullableString(value.project_context),
    likely_use: toNullableString(value.likely_use),
    related_components: toStringArray(value.related_components),
    exclusions_or_risks: toStringArray(value.exclusions_or_risks),
    normalization_tokens: uniqueTokens(toStringArray(value.normalization_tokens)),
    confidence: clampConfidence(value.confidence),
    reasoning: toNullableString(value.reasoning),
    evidence: toStringArray(value.evidence),
  };
}

export function countCostConstructionIntelligenceCoreFields(
  classification: Pick<
    CostConstructionIntelligenceClassification,
    "trade" | "system" | "product" | "activity" | "likely_use"
  >,
) {
  return [
    classification.trade,
    classification.system,
    classification.product,
    classification.activity,
    classification.likely_use,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).length;
}

export function assessCostConstructionIntelligenceQuality(params: {
  classification: CostConstructionIntelligenceClassification;
  description?: string | null;
  sourceType?: CostConstructionIntelligenceSourceType | null;
  tradesstackCostCode?: string | null;
}) {
  const coreFieldCount = countCostConstructionIntelligenceCoreFields(params.classification);
  const hasConfidence = typeof params.classification.confidence === "number";
  const hasReasoning = typeof params.classification.reasoning === "string";
  const hasEvidence = params.classification.evidence.length > 0;
  const description = params.description?.trim() ?? "";
  const routingCode = params.tradesstackCostCode?.trim() ?? null;
  const allowsSparseConstructionMeaning = routingCode === "600" || routingCode === "700";

  if (coreFieldCount === 0 && !hasConfidence) {
    return {
      isAcceptable: false,
      coreFieldCount,
      reason: "quality_failed_all_core_fields_null",
    } satisfies CostConstructionIntelligenceQualityAssessment;
  }

  if (allowsSparseConstructionMeaning) {
    return {
      isAcceptable: true,
      coreFieldCount,
      reason: null,
    } satisfies CostConstructionIntelligenceQualityAssessment;
  }

  const looksSubstantive =
    description.length >= 12 ||
    params.sourceType === "organization_material" ||
    params.sourceType === "cost_item" ||
    params.sourceType === "supplier_invoice_line_allocation" ||
    params.sourceType === "project_actual_cost_event";

  if (looksSubstantive && coreFieldCount === 0) {
    return {
      isAcceptable: false,
      coreFieldCount,
      reason: "quality_failed_missing_core_fields",
    } satisfies CostConstructionIntelligenceQualityAssessment;
  }

  if (looksSubstantive && coreFieldCount === 1 && !hasReasoning && !hasEvidence) {
    return {
      isAcceptable: false,
      coreFieldCount,
      reason: "quality_failed_too_thin",
    } satisfies CostConstructionIntelligenceQualityAssessment;
  }

  return {
    isAcceptable: true,
    coreFieldCount,
    reason: null,
  } satisfies CostConstructionIntelligenceQualityAssessment;
}

export function buildCostConstructionNormalization(
  classification: CostConstructionIntelligenceClassification,
): CostConstructionIntelligenceNormalization {
  const tokens = uniqueTokens([
    ...classification.normalization_tokens,
    classification.trade,
    classification.subtrade,
    classification.work_package,
    classification.system,
    classification.assembly,
    classification.component,
    classification.product_family,
    classification.product,
    classification.manufacturer,
    classification.brand,
    classification.supplier,
    classification.activity,
    classification.install_method,
    classification.application_area,
    classification.location_context,
    classification.project_context,
    classification.likely_use,
    ...classification.related_components,
  ]);

  const productSignature =
    uniqueTokens([
      classification.product,
      classification.brand,
      classification.manufacturer,
      classification.product_family,
      classification.component,
    ])[0] ?? null;

  const constructionSignatureParts = uniqueTokens([
    classification.trade,
    classification.subtrade,
    classification.system,
    classification.assembly,
    classification.component,
    productSignature,
    classification.activity,
    classification.application_area,
  ]);

  const constructionSignature =
    constructionSignatureParts.length > 0
      ? constructionSignatureParts.join("__")
      : null;

  const groupingKeys = uniqueTokens([
    [classification.trade, classification.system].filter(Boolean).join(" "),
    [classification.system, classification.component].filter(Boolean).join(" "),
    [classification.system, classification.product].filter(Boolean).join(" "),
    [classification.trade, classification.product_family].filter(Boolean).join(" "),
    [classification.supplier, classification.product].filter(Boolean).join(" "),
    [classification.activity, classification.product].filter(Boolean).join(" "),
  ]);

  return {
    tokens,
    productSignature,
    constructionSignature,
    groupingKeys,
  };
}

export function buildCostConstructionIntelligenceSnapshot(params: {
  classification: CostConstructionIntelligenceClassification;
  event: Pick<
    CostConstructionIntelligenceEventRow,
    "id" | "sourceType" | "documentContext" | "classificationVersion"
  >;
  provider: string | null;
  model: string | null;
  classifiedAt: string;
}) {
  const normalization = buildCostConstructionNormalization(params.classification);

  return {
    ...params.classification,
    classificationVersion: params.event.classificationVersion,
    promptVersion: COST_CONSTRUCTION_INTELLIGENCE_PROMPT_VERSION,
    provider: params.provider,
    model: params.model,
    classifiedAt: params.classifiedAt,
    sourceType: params.event.sourceType,
    sourceEventId: params.event.id,
    documentContext: params.event.documentContext,
    normalization,
  } satisfies CostConstructionIntelligenceSnapshot;
}

export async function enqueueCostConstructionIntelligenceEvent(
  input: CostConstructionIntelligenceEventInput,
) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("enqueue_cost_construction_intelligence_event" as never, {
    p_input: {
      ...input,
      classificationVersion:
        input.classificationVersion ?? COST_CONSTRUCTION_INTELLIGENCE_CLASSIFICATION_VERSION,
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (isObject(data) ? data : {}) as Record<string, unknown>;
  return {
    id: toNullableString(payload.id),
    inserted: payload.inserted === true,
  };
}

export async function tryEnqueueCostConstructionIntelligenceEvent(
  input: CostConstructionIntelligenceEventInput,
) {
  try {
    return await enqueueCostConstructionIntelligenceEvent(input);
  } catch (error) {
    logCostConstructionIntelligenceFailure("enqueue", error, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceLineId: input.sourceLineId ?? null,
    });
    return null;
  }
}

export function logCostConstructionIntelligenceFailure(
  action: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  console.error(`[cost-construction-intelligence:${action}] failed`, {
    ...context,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}
