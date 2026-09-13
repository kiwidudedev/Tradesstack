import {
  assertValidPaymentClaimUclBusinessRecord,
  type PaymentClaimUclBusinessRecord,
} from "@/lib/universal-learning/payment-claim-schema";
import { normalizeSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";
import type {
  UniversalLearningBusinessRecord,
  UniversalLearningCursor,
} from "@/lib/universal-learning/types";

export const PAYMENT_CLAIM_PROMPT_MAX_RECORDS_PER_PACKET = 12;
export const PAYMENT_CLAIM_PROMPT_MAX_BYTES = 24 * 1024;
export const PAYMENT_CLAIM_PROMPT_PACKET_MAX_BYTES = 128 * 1024;
export const PAYMENT_CLAIM_PROMPT_MAX_ESTIMATED_TOKENS = 6_144;

const MAX_PROMPT_SECTIONS = 20;
const MAX_PROMPT_LINES = 20;
const MAX_PROMPT_VARIATIONS = 20;
const MAX_PROMPT_RETENTION_REFERENCES = 12;
const MAX_PROMPT_DOCUMENTS = 12;
const MAX_PROMPT_PAYMENT_OBSERVATIONS = 12;
const MAX_PROMPT_WORKFLOW_EVENTS = 8;

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function estimatePaymentClaimPromptTokens(value: unknown) {
  return Math.ceil(bytes(value) / 4);
}

function compareCursor(left: UniversalLearningCursor, right: UniversalLearningCursor) {
  const leftAt = normalizeSupplierBillUclTimestamp(left.updatedAt, "Payment Claim left cursor") ?? "";
  const rightAt = normalizeSupplierBillUclTimestamp(right.updatedAt, "Payment Claim right cursor") ?? "";
  return leftAt.localeCompare(rightAt) || (left.id ?? "").localeCompare(right.id ?? "");
}

export function getPaymentClaimEffectiveCursor(
  record: UniversalLearningBusinessRecord,
): UniversalLearningCursor {
  return { updatedAt: record.updatedAt, id: record.source.sourceId };
}

export function comparePaymentClaimEffectiveCursor(
  left: UniversalLearningBusinessRecord,
  right: UniversalLearningBusinessRecord,
) {
  return compareCursor(
    getPaymentClaimEffectiveCursor(left),
    getPaymentClaimEffectiveCursor(right),
  );
}

function omitted(total: number, selected: number) {
  return Math.max(0, total - selected);
}

export function compactPaymentClaimBusinessRecordForPrompt(
  value: UniversalLearningBusinessRecord,
) {
  assertValidPaymentClaimUclBusinessRecord(value);
  const record = value as PaymentClaimUclBusinessRecord;
  const evidence = record.payload.sourceEvidence;

  const sections = evidence.sections.slice(0, MAX_PROMPT_SECTIONS);
  const claimLines = evidence.claimLines.slice(0, MAX_PROMPT_LINES).map((line) => ({
    ...line,
    description: line.description?.slice(0, 240) ?? null,
  }));
  const variations = evidence.variations.slice(0, MAX_PROMPT_VARIATIONS);
  const retentionReferences = evidence.retention.linkedRetentionClaims
    .slice(0, MAX_PROMPT_RETENTION_REFERENCES);
  const documents = evidence.supportingEvidence.documents.slice(0, MAX_PROMPT_DOCUMENTS);
  const paymentObservations = evidence.accountingAndPayment.observations
    .slice(0, MAX_PROMPT_PAYMENT_OBSERVATIONS);
  const workflowEvents = evidence.workflow.latestMaterialTransitions
    .slice(0, MAX_PROMPT_WORKFLOW_EVENTS);

  const promptOmittedCounts = {
    sections: omitted(record.payload.operationalContext.totalCounts.sections, sections.length),
    claimLines: omitted(record.payload.operationalContext.totalCounts.claimLines, claimLines.length),
    variations: omitted(record.payload.operationalContext.totalCounts.variations, variations.length),
    retentionReferences: omitted(
      record.payload.operationalContext.totalCounts.retentionReferences,
      retentionReferences.length,
    ),
    supportingDocuments: omitted(
      record.payload.operationalContext.totalCounts.supportingDocuments,
      documents.length,
    ),
    workflowEvents: omitted(
      record.payload.operationalContext.totalCounts.workflowEvents,
      workflowEvents.length,
    ),
    paymentObservations: omitted(
      record.payload.operationalContext.totalCounts.paymentObservations,
      paymentObservations.length,
    ),
  };

  const projection = {
    containerType: record.containerType,
    source: record.source,
    organizationId: record.organizationId,
    projectId: record.projectId,
    clientId: record.clientId,
    updatedAt: record.updatedAt,
    status: record.status,
    signalStrength: record.signalStrength,
    schemaVersion: record.payload.schemaVersion,
    claim: evidence.claim,
    project: evidence.project,
    client: evidence.client,
    contract: evidence.contract,
    financialSummary: evidence.financialSummary,
    sections,
    claimLines,
    variations,
    retention: {
      ...evidence.retention,
      linkedRetentionClaims: retentionReferences,
    },
    workflow: {
      ...evidence.workflow,
      latestMaterialTransitions: workflowEvents,
    },
    supportingEvidence: {
      ...evidence.supportingEvidence,
      documents,
    },
    accountingAndPayment: {
      observations: paymentObservations,
    },
    operationalContext: {
      ...record.payload.operationalContext,
      promptTruncated: Object.values(promptOmittedCounts).some((count) => count > 0),
      promptOmittedCounts,
    },
    lineage: record.payload.lineage,
    provenance: {
      canonicalOwnerUpdatedAt: record.payload.provenance.canonicalOwnerUpdatedAt,
      latestDependencyUpdatedAt: record.payload.provenance.latestDependencyUpdatedAt,
      builderVersion: record.payload.provenance.builderVersion,
      contentHash: record.payload.provenance.contentHash,
    },
    visibility: record.payload.visibility,
  };

  const promptBytes = bytes(projection);
  if (promptBytes > PAYMENT_CLAIM_PROMPT_MAX_BYTES) {
    throw new Error(
      `Payment Claim ${record.source.sourceId} prompt projection is ${promptBytes} bytes; limit is ${PAYMENT_CLAIM_PROMPT_MAX_BYTES}.`,
    );
  }

  return {
    projection,
    diagnostics: {
      sourceId: record.source.sourceId,
      schemaVersion: record.payload.schemaVersion,
      canonicalBytes: bytes(record),
      promptBytes,
      estimatedTokens: estimatePaymentClaimPromptTokens(projection),
      totalCounts: record.payload.operationalContext.totalCounts,
      promptOmittedCounts,
    },
  };
}

export function selectPaymentClaimRecordsForPrompt(input: {
  records: UniversalLearningBusinessRecord[];
  previousCursor: UniversalLearningCursor;
  sourceNextCursorCandidate: UniversalLearningCursor;
  maxRecords?: number;
}) {
  const ordered = [...input.records].sort(comparePaymentClaimEffectiveCursor);
  const maxRecords = Math.max(
    1,
    Math.min(
      input.maxRecords ?? PAYMENT_CLAIM_PROMPT_MAX_RECORDS_PER_PACKET,
      PAYMENT_CLAIM_PROMPT_MAX_RECORDS_PER_PACKET,
    ),
  );
  const selected: UniversalLearningBusinessRecord[] = [];
  const diagnostics: Array<ReturnType<
    typeof compactPaymentClaimBusinessRecordForPrompt
  >["diagnostics"]> = [];
  let packetBytes = 0;
  let deferredReason: "record_count_limit" | "packet_byte_limit" | null = null;

  for (const record of ordered) {
    if (selected.length >= maxRecords) {
      deferredReason = "record_count_limit";
      break;
    }
    const compacted = compactPaymentClaimBusinessRecordForPrompt(record);
    if (
      selected.length > 0
      && packetBytes + compacted.diagnostics.promptBytes > PAYMENT_CLAIM_PROMPT_PACKET_MAX_BYTES
    ) {
      deferredReason = "packet_byte_limit";
      break;
    }
    selected.push(record);
    diagnostics.push(compacted.diagnostics);
    packetBytes += compacted.diagnostics.promptBytes;
  }

  const nextCursorCandidate = selected.length > 0
    ? getPaymentClaimEffectiveCursor(selected[selected.length - 1])
    : input.previousCursor;
  const deferredRecords = ordered.slice(selected.length);
  for (const deferred of deferredRecords) {
    if (compareCursor(getPaymentClaimEffectiveCursor(deferred), nextCursorCandidate) <= 0) {
      throw new Error(
        `Payment Claim ${deferred.source.sourceId} is not strictly after the selected prompt cursor.`,
      );
    }
  }

  return {
    records: selected,
    nextCursorCandidate,
    sourceNextCursorCandidate: input.sourceNextCursorCandidate,
    deferredRecordCount: deferredRecords.length,
    deferredReason,
    packetBytes,
    estimatedTokens: diagnostics.reduce((sum, item) => sum + item.estimatedTokens, 0),
    diagnostics,
  };
}
