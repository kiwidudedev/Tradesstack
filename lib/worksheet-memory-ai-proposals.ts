import "server-only";

import { getPricingWorksheetAiProvider, getPricingWorksheetAnthropicModel } from "@/lib/ai/providers/pricing-worksheet/registry";
import type { PricingWorksheetProviderResponse } from "@/lib/ai/providers/pricing-worksheet/types";
import type {
  ClassifiedWorksheetMemoryEvent,
  WorksheetMemoryCategory,
} from "@/lib/worksheet-memory-derivation";
import type { Json } from "@/lib/supabase/types";

export type WorksheetMemoryProposalFamily =
  | "assumption_preference"
  | "rate_preference"
  | "formula_preference"
  | "worksheet_structure_pattern"
  | "worksheet_workflow_pattern";

export type WorksheetMemoryShadowRejectionReason =
  | "confidence_below_threshold"
  | "contradiction_level_too_high"
  | "duplicate_evidence_ids"
  | "evidence_count_below_threshold"
  | "evidence_ids_missing"
  | "evidence_org_mismatch"
  | "invalid_memory_family"
  | "invalid_no_memory_payload"
  | "proposal_payload_invalid"
  | "supporting_and_contradictory_overlap";

export type WorksheetMemoryShadowGateStatus = "accepted" | "rejected" | "no_memory";

export type WorksheetMemoryShadowProposal = {
  batchId: string;
  organizationId: string;
  gateStatus: WorksheetMemoryShadowGateStatus;
  proposalKind: WorksheetMemoryProposalFamily | "no_memory";
  memoryCategory: WorksheetMemoryCategory | null;
  memoryFamily: WorksheetMemoryProposalFamily | null;
  title: string | null;
  summary: string | null;
  confidence: number | null;
  evidenceEventIds: string[];
  contradictoryEventIds: string[];
  retrievalGuidance: string | null;
  memoryValue: Record<string, Json | null>;
  rejectionReasons: WorksheetMemoryShadowRejectionReason[];
};

export type WorksheetMemoryAiShadowSummary = {
  poolsBuilt: number;
  proposalsReturned: number;
  acceptedByGate: number;
  rejectedByGate: number;
  rejectionReasons: Record<string, number>;
  proposals: WorksheetMemoryShadowProposal[];
  provider: "anthropic";
  model: string;
};

export type RunWorksheetMemoryAiProposalsShadowModeInput = {
  events: ClassifiedWorksheetMemoryEvent[];
  batchSize?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  minimumEvidenceCount?: number;
  minimumConfidence?: number;
  maximumContradictionRatio?: number;
};

type CompactWorksheetInterpretationEvent = {
  eventId: string;
  organizationId: string;
  eventType: string;
  occurredAt: string;
  workbookPageContext: {
    workbookId: string | null;
    sheetId: string | null;
    sheetName: string | null;
    worksheetName: string | null;
    tradePackage: string | null;
  };
  worksheetDiff: {
    rowLabel: string | null;
    itemLabel: string | null;
    columnHeader: string | null;
    unit: string | null;
    oldValue: Json | null;
    newValue: Json | null;
    oldFormula: string | null;
    newFormula: string | null;
  };
  semanticFields: Record<string, Json | null>;
  interpretation: Record<string, Json | null>;
  futureUseSummary: Record<string, Json | null>;
  confidenceDetail: Record<string, Json | null>;
};

type WorksheetMemoryProposalBatch = {
  batchId: string;
  organizationId: string;
  events: ClassifiedWorksheetMemoryEvent[];
};

type RawWorksheetMemoryProposal = {
  proposalKind: string | null;
  memoryCategory: string | null;
  memoryFamily: string | null;
  title: string | null;
  summary: string | null;
  confidence: number | null;
  evidenceEventIds: string[];
  contradictoryEventIds: string[];
  retrievalGuidance: string | null;
  memoryValue: Record<string, Json | null>;
};

const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;
const DEFAULT_MINIMUM_EVIDENCE_COUNT = 3;
const DEFAULT_MINIMUM_CONFIDENCE = 0.65;
const DEFAULT_MAXIMUM_CONTRADICTION_RATIO = 0.5;
const ALLOWED_MEMORY_FAMILIES: WorksheetMemoryProposalFamily[] = [
  "assumption_preference",
  "rate_preference",
  "formula_preference",
  "worksheet_structure_pattern",
  "worksheet_workflow_pattern",
];
const MEMORY_FAMILY_CATEGORY_MAP: Record<WorksheetMemoryProposalFamily, WorksheetMemoryCategory> = {
  assumption_preference: "worksheet_pricing",
  rate_preference: "worksheet_pricing",
  formula_preference: "worksheet_formula",
  worksheet_structure_pattern: "worksheet_structure",
  worksheet_workflow_pattern: "worksheet_workflow",
};

function isJsonRecord(value: unknown): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, Number(value)));
}

function compactJsonValue(value: Json | undefined): Json | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((entry) => compactJsonValue(entry as Json | undefined)) as Json;
  }

  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).slice(0, 12).map(([key, entry]) => [key, compactJsonValue(entry)]),
    ) as Json;
  }

  return null;
}

function compactJsonRecord(value: unknown) {
  if (!isJsonRecord(value)) {
    return {} as Record<string, Json | null>;
  }

  return Object.fromEntries(
    Object.entries(value).slice(0, 16).map(([key, entry]) => [key, compactJsonValue(entry)]),
  ) as Record<string, Json | null>;
}

function buildCompactWorksheetInterpretationEvent(event: ClassifiedWorksheetMemoryEvent): CompactWorksheetInterpretationEvent {
  const interpretationPayload = compactJsonRecord(event.interpretationPayload);
  const interpretedChange =
    isJsonRecord(interpretationPayload.interpretedChange)
      ? compactJsonRecord(interpretationPayload.interpretedChange)
      : {};

  return {
    eventId: event.eventId,
    organizationId: event.organizationId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    workbookPageContext: {
      workbookId: toNullableString(event.metadata.workbookId),
      sheetId: toNullableString(event.metadata.sheetId),
      sheetName: toNullableString(event.metadata.sheetName),
      worksheetName: toNullableString(event.metadata.worksheetName),
      tradePackage: toNullableString(event.metadata.tradePackage),
    },
    worksheetDiff: {
      rowLabel: toNullableString(event.diffData.rowLabel),
      itemLabel: toNullableString(event.diffData.itemLabel),
      columnHeader: toNullableString(event.diffData.columnHeader),
      unit: toNullableString(event.diffData.unit),
      oldValue: compactJsonValue(event.diffData.oldValue as Json | undefined),
      newValue: compactJsonValue(event.diffData.newValue as Json | undefined),
      oldFormula: toNullableString(event.diffData.oldFormula),
      newFormula: toNullableString(event.diffData.newFormula),
    },
    semanticFields: compactJsonRecord(event.semanticFields),
    interpretation: interpretedChange,
    futureUseSummary: compactJsonRecord(event.futureUseSummary),
    confidenceDetail: compactJsonRecord(event.confidenceDetail),
  };
}

function buildWorksheetMemoryProposalSystemPrompt() {
  return [
    "You are evaluating interpreted worksheet events in shadow mode for durable organization memory proposals.",
    "Anthropic owns semantic meaning and semantic sameness.",
    "Determine whether multiple interpreted events represent the same business, estimating, pricing, worksheet, formula, workflow, or construction concept.",
    "Use only the supplied interpreted events.",
    "Do not assume backend synonyms, label dictionaries, or domain normalization.",
    "Return no_memory when evidence is weak, mixed, contradictory, or does not support a durable memory.",
    "Do not invent engineering rationale, compliance rationale, or business motive explanations not supported by the interpreted events.",
    "Focus on repeated estimator behavior and repeated worksheet behavior.",
    "Use only these memory families when proposing a memory: assumption_preference, rate_preference, formula_preference, worksheet_structure_pattern, worksheet_workflow_pattern.",
    "Return valid JSON only.",
  ].join("\n");
}

function buildWorksheetMemoryProposalUserPrompt(batch: WorksheetMemoryProposalBatch) {
  return [
    "Shadow mode only. Do not assume any memory will be persisted.",
    "Review the interpreted worksheet events below.",
    "Decide whether any subset of the events represents a repeated durable memory candidate.",
    "If no durable memory is supported, return a single proposal with proposalKind = no_memory.",
    "For accepted memory proposals, include only supporting evidence IDs and any contradictory evidence IDs you think matter.",
    "Do not try to explain what the backend should do. Only return your semantic judgement and the structured proposal payload.",
    `Organization ID: ${batch.organizationId}`,
    `Event count: ${batch.events.length}`,
    `Events:\n${JSON.stringify(batch.events.map(buildCompactWorksheetInterpretationEvent))}`,
  ].join("\n\n");
}

function buildWorksheetMemoryProposalSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "proposalKind",
            "memoryCategory",
            "memoryFamily",
            "title",
            "summary",
            "confidence",
            "evidenceEventIds",
            "contradictoryEventIds",
            "retrievalGuidance",
            "memoryValue",
          ],
          properties: {
            proposalKind: { type: "string" },
            memoryCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
            memoryFamily: { anyOf: [{ type: "string" }, { type: "null" }] },
            title: { anyOf: [{ type: "string" }, { type: "null" }] },
            summary: { anyOf: [{ type: "string" }, { type: "null" }] },
            confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
            evidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
            contradictoryEventIds: {
              type: "array",
              items: { type: "string" },
            },
            retrievalGuidance: { anyOf: [{ type: "string" }, { type: "null" }] },
            memoryValue: { type: "object" },
          },
        },
      },
    },
  } as Record<string, unknown>;
}

function buildBatchesByOrganization(
  events: ClassifiedWorksheetMemoryEvent[],
  batchSize: number,
) {
  const grouped = new Map<string, ClassifiedWorksheetMemoryEvent[]>();
  for (const event of events) {
    if (event.classificationStatus !== "classified") {
      continue;
    }

    const existing = grouped.get(event.organizationId) ?? [];
    existing.push(event);
    grouped.set(event.organizationId, existing);
  }

  const batches: WorksheetMemoryProposalBatch[] = [];
  grouped.forEach((groupEvents, organizationId) => {
    const sorted = [...groupEvents].sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId),
    );

    for (let index = 0; index < sorted.length; index += batchSize) {
      const batchEvents = sorted.slice(index, index + batchSize);
      batches.push({
        batchId: `${organizationId}:batch:${Math.floor(index / batchSize) + 1}`,
        organizationId,
        events: batchEvents,
      });
    }
  });

  return batches.sort((left, right) => left.batchId.localeCompare(right.batchId));
}

function normalizeRawProposal(value: unknown): RawWorksheetMemoryProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    proposalKind: toNullableString(record.proposalKind),
    memoryCategory: toNullableString(record.memoryCategory),
    memoryFamily: toNullableString(record.memoryFamily),
    title: toNullableString(record.title),
    summary: toNullableString(record.summary),
    confidence: clampConfidence(record.confidence),
    evidenceEventIds: Array.isArray(record.evidenceEventIds)
      ? record.evidenceEventIds
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [],
    contradictoryEventIds: Array.isArray(record.contradictoryEventIds)
      ? record.contradictoryEventIds
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [],
    retrievalGuidance: toNullableString(record.retrievalGuidance),
    memoryValue: compactJsonRecord(record.memoryValue),
  };
}

function normalizeProviderProposals(
  response: PricingWorksheetProviderResponse,
) {
  const proposals = isJsonRecord(response.parsedJson) && Array.isArray(response.parsedJson.proposals)
    ? response.parsedJson.proposals.map(normalizeRawProposal).filter((proposal): proposal is RawWorksheetMemoryProposal => proposal !== null)
    : [];

  return proposals;
}

function mapMemoryCategory(
  family: WorksheetMemoryProposalFamily,
  category: string | null,
) {
  const expectedCategory = MEMORY_FAMILY_CATEGORY_MAP[family];
  if (!category) {
    return expectedCategory;
  }

  return category === expectedCategory ? expectedCategory : null;
}

function validateShadowProposal(params: {
  batch: WorksheetMemoryProposalBatch;
  proposal: RawWorksheetMemoryProposal;
  minimumEvidenceCount: number;
  minimumConfidence: number;
  maximumContradictionRatio: number;
}) {
  const reasons: WorksheetMemoryShadowRejectionReason[] = [];
  const eventIds = new Set(params.batch.events.map((event) => event.eventId));
  const eventOrganizations = new Map(params.batch.events.map((event) => [event.eventId, event.organizationId]));
  const uniqueEvidenceIds = Array.from(new Set(params.proposal.evidenceEventIds));
  const uniqueContradictoryIds = Array.from(new Set(params.proposal.contradictoryEventIds));
  const overlap = uniqueEvidenceIds.filter((eventId) => uniqueContradictoryIds.includes(eventId));
  const noMemory = params.proposal.proposalKind === "no_memory";

  if (noMemory) {
    if (uniqueEvidenceIds.length > 0 || uniqueContradictoryIds.length > 0 || params.proposal.memoryFamily || params.proposal.memoryCategory) {
      reasons.push("invalid_no_memory_payload");
    }

    return {
      gateStatus: "no_memory" as const,
      proposalKind: "no_memory" as const,
      memoryCategory: null,
      memoryFamily: null,
      rejectionReasons: reasons,
    };
  }

  if (uniqueEvidenceIds.length !== params.proposal.evidenceEventIds.length) {
    reasons.push("duplicate_evidence_ids");
  }

  if (uniqueEvidenceIds.length < params.minimumEvidenceCount) {
    reasons.push("evidence_count_below_threshold");
  }

  if ((params.proposal.confidence ?? 0) < params.minimumConfidence) {
    reasons.push("confidence_below_threshold");
  }

  if (overlap.length > 0) {
    reasons.push("supporting_and_contradictory_overlap");
  }

  const allReferencedIds = [...uniqueEvidenceIds, ...uniqueContradictoryIds];
  if (allReferencedIds.some((eventId) => !eventIds.has(eventId))) {
    reasons.push("evidence_ids_missing");
  }

  if (allReferencedIds.some((eventId) => eventOrganizations.get(eventId) !== params.batch.organizationId)) {
    reasons.push("evidence_org_mismatch");
  }

  const memoryFamily = ALLOWED_MEMORY_FAMILIES.includes(params.proposal.memoryFamily as WorksheetMemoryProposalFamily)
    ? (params.proposal.memoryFamily as WorksheetMemoryProposalFamily)
    : null;
  if (!memoryFamily) {
    reasons.push("invalid_memory_family");
  }

  const memoryCategory = memoryFamily ? mapMemoryCategory(memoryFamily, params.proposal.memoryCategory) : null;
  if (!memoryCategory) {
    reasons.push("proposal_payload_invalid");
  }

  if (!params.proposal.title || !params.proposal.summary || params.proposal.confidence === null) {
    reasons.push("proposal_payload_invalid");
  }

  if (!isJsonRecord(params.proposal.memoryValue)) {
    reasons.push("proposal_payload_invalid");
  }

  const contradictionRatio = uniqueEvidenceIds.length === 0
    ? 0
    : uniqueContradictoryIds.length / uniqueEvidenceIds.length;
  if (contradictionRatio > params.maximumContradictionRatio) {
    reasons.push("contradiction_level_too_high");
  }

  return {
    gateStatus: reasons.length === 0 ? "accepted" as const : "rejected" as const,
    proposalKind: (memoryFamily ?? "no_memory") as WorksheetMemoryProposalFamily | "no_memory",
    memoryCategory,
    memoryFamily,
    rejectionReasons: Array.from(new Set(reasons)),
  };
}

async function callAnthropicWorksheetMemoryProposalBatch(
  batch: WorksheetMemoryProposalBatch,
  params: {
    timeoutMs: number;
    maxOutputTokens: number;
  },
) {
  const provider = getPricingWorksheetAiProvider("anthropic");
  const providerResult = await provider.generateEditPlan({
    systemPrompt: buildWorksheetMemoryProposalSystemPrompt(),
    userPrompt: buildWorksheetMemoryProposalUserPrompt(batch),
    schema: buildWorksheetMemoryProposalSchema(),
    model: getPricingWorksheetAnthropicModel(),
    timeoutMs: params.timeoutMs,
    maxOutputTokens: params.maxOutputTokens,
    enableWebSearch: false,
    metadata: {
      workflowStage: "worksheet_memory_shadow_proposals",
      batchId: batch.batchId,
      organizationId: batch.organizationId,
      shadowMode: true,
    },
  });

  return {
    providerResult,
    proposals: normalizeProviderProposals(providerResult),
  };
}

export async function runWorksheetMemoryAiProposalsShadowMode(
  input: RunWorksheetMemoryAiProposalsShadowModeInput,
) {
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE));
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputTokens = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const minimumEvidenceCount = input.minimumEvidenceCount ?? DEFAULT_MINIMUM_EVIDENCE_COUNT;
  const minimumConfidence = input.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE;
  const maximumContradictionRatio = input.maximumContradictionRatio ?? DEFAULT_MAXIMUM_CONTRADICTION_RATIO;
  const providerModel = getPricingWorksheetAnthropicModel();
  const batches = buildBatchesByOrganization(input.events, batchSize);
  const proposals: WorksheetMemoryShadowProposal[] = [];
  const rejectionReasons: Record<string, number> = {};

  for (const batch of batches) {
    const result = await callAnthropicWorksheetMemoryProposalBatch(batch, {
      timeoutMs,
      maxOutputTokens,
    });

    const batchProposals = result.proposals.length > 0
      ? result.proposals
      : [{
          proposalKind: "no_memory",
          memoryCategory: null,
          memoryFamily: null,
          title: null,
          summary: "No structured memory proposals returned.",
          confidence: null,
          evidenceEventIds: [],
          contradictoryEventIds: [],
          retrievalGuidance: null,
          memoryValue: {},
        } satisfies RawWorksheetMemoryProposal];

    for (const proposal of batchProposals) {
      const validation = validateShadowProposal({
        batch,
        proposal,
        minimumEvidenceCount,
        minimumConfidence,
        maximumContradictionRatio,
      });
      for (const reason of validation.rejectionReasons) {
        rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
      }

      proposals.push({
        batchId: batch.batchId,
        organizationId: batch.organizationId,
        gateStatus: validation.gateStatus,
        proposalKind: validation.proposalKind,
        memoryCategory: validation.memoryCategory,
        memoryFamily: validation.memoryFamily,
        title: proposal.title,
        summary: proposal.summary,
        confidence: proposal.confidence,
        evidenceEventIds: Array.from(new Set(proposal.evidenceEventIds)),
        contradictoryEventIds: Array.from(new Set(proposal.contradictoryEventIds)),
        retrievalGuidance: proposal.retrievalGuidance,
        memoryValue: proposal.memoryValue,
        rejectionReasons: validation.rejectionReasons,
      });
    }

    void result.providerResult;
  }

  const summary = {
    poolsBuilt: batches.length,
    proposalsReturned: proposals.length,
    acceptedByGate: proposals.filter((proposal) => proposal.gateStatus === "accepted").length,
    rejectedByGate: proposals.filter((proposal) => proposal.gateStatus === "rejected").length,
    rejectionReasons,
    proposals,
    provider: "anthropic" as const,
    model: providerModel,
  } satisfies WorksheetMemoryAiShadowSummary;

  console.info("[worksheet-memory-ai-proposals]", {
    poolsBuilt: summary.poolsBuilt,
    proposalsReturned: summary.proposalsReturned,
    acceptedByGate: summary.acceptedByGate,
    rejectedByGate: summary.rejectedByGate,
    rejectionReasons: summary.rejectionReasons,
    provider: summary.provider,
    model: summary.model,
  });

  return summary;
}

export const worksheetMemoryAiProposalTestUtils = {
  buildBatchesByOrganization,
  buildCompactWorksheetInterpretationEvent,
  buildWorksheetMemoryProposalSchema,
  buildWorksheetMemoryProposalSystemPrompt,
  buildWorksheetMemoryProposalUserPrompt,
  validateShadowProposal,
};
