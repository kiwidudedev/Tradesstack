import "server-only";

import {
  buildWorksheetLearningArtifacts,
  preparePricingWorksheetIntelligenceEventForPersistence,
  type WorksheetLearningSource,
} from "@/lib/pricing-worksheet-intelligence";
import { normalizeWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const DEFAULT_BATCH_LIMIT = 25;
const DEFAULT_LEASE_SECONDS = 600;
const DEFAULT_WORKER_ID = "worksheet-mutation-evidence-v2-worker";

type WorksheetMutationEvidenceV2OutboxRow = {
  id: string;
  organizationId: string;
  projectId: string | null;
  opportunityId: string;
  workbookId: string;
  workbookName: string | null;
  sheetId: string;
  sheetName: string;
  worksheetId: string;
  worksheetName: string;
  tradePackage: string | null;
  userId: string | null;
  source: WorksheetLearningSource;
  clientMutationId: string;
  occurredAt: string;
  previousWorksheet: Json;
  nextWorksheet: Json;
  processingStatus: "pending" | "claimed" | "completed" | "retry_scheduled" | "dead_lettered";
  attemptCount: number;
  maxAttempts: number;
  claimToken: string | null;
  claimExpiresAt: string | null;
};

type WorksheetMutationEvidenceV2OutboxFinalizeInput = {
  id: string;
  claimToken: string;
  processingStatus: "completed" | "retry_scheduled" | "dead_lettered";
  retryAfter?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type RunWorksheetMutationEvidenceV2OutboxWorkerInput = {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
  now?: string;
};

export type RunWorksheetMutationEvidenceV2OutboxWorkerResult = {
  claimedCount: number;
  completedCount: number;
  retriedCount: number;
  deadLetteredCount: number;
  persistedEventCount: number;
  durationMs: number;
};

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseOutboxRow(value: Record<string, unknown>): WorksheetMutationEvidenceV2OutboxRow | null {
  const id = toNullableString(value.id);
  const organizationId = toNullableString(value.organization_id);
  const opportunityId = toNullableString(value.opportunity_id);
  const workbookId = toNullableString(value.workbook_id);
  const sheetId = toNullableString(value.sheet_id);
  const sheetName = toNullableString(value.sheet_name);
  const worksheetId = toNullableString(value.worksheet_id);
  const worksheetName = toNullableString(value.worksheet_name);
  const clientMutationId = toNullableString(value.client_mutation_id);
  const occurredAt = toNullableString(value.occurred_at);
  const processingStatus = toNullableString(value.processing_status) as WorksheetMutationEvidenceV2OutboxRow["processingStatus"] | null;
  const source = toNullableString(value.source) as WorksheetLearningSource | null;

  if (
    !id ||
    !organizationId ||
    !opportunityId ||
    !workbookId ||
    !sheetId ||
    !sheetName ||
    !worksheetId ||
    !worksheetName ||
    !clientMutationId ||
    !occurredAt ||
    !processingStatus ||
    !source
  ) {
    return null;
  }

  return {
    id,
    organizationId,
    projectId: toNullableString(value.project_id),
    opportunityId,
    workbookId,
    workbookName: toNullableString(value.workbook_name),
    sheetId,
    sheetName,
    worksheetId,
    worksheetName,
    tradePackage: toNullableString(value.trade_package),
    userId: toNullableString(value.user_id),
    source,
    clientMutationId,
    occurredAt,
    previousWorksheet: (value.previous_worksheet ?? null) as Json,
    nextWorksheet: (value.next_worksheet ?? null) as Json,
    processingStatus,
    attemptCount: typeof value.attempt_count === "number" ? value.attempt_count : 0,
    maxAttempts: typeof value.max_attempts === "number" ? value.max_attempts : 5,
    claimToken: toNullableString(value.claim_token),
    claimExpiresAt: toNullableString(value.claim_expires_at),
  };
}

function buildRetryAfter(attemptCount: number, now: string) {
  const multiplier = Math.max(0, attemptCount - 1);
  const retryDelayMinutes = Math.min(5 * 2 ** multiplier, 24 * 60);
  return new Date(Date.parse(now) + retryDelayMinutes * 60 * 1000).toISOString();
}

function isWorksheetSnapshotValid(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record.rows) && Array.isArray(record.columns) && typeof record.cells === "object" && record.cells !== null;
}

export async function claimWorksheetMutationEvidenceV2OutboxBatch(params?: {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_worksheet_mutation_evidence_v2_outbox_batch" as never, {
    p_limit: Math.max(params?.limit ?? DEFAULT_BATCH_LIMIT, 1),
    p_organization_id: params?.organizationId ?? null,
    p_worker_id: params?.workerId ?? DEFAULT_WORKER_ID,
    p_lease_seconds: Math.max(params?.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 30),
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : null;

  if (!rows) {
    return [] as WorksheetMutationEvidenceV2OutboxRow[];
  }

  return rows
    .map((row) => parseOutboxRow(row as Record<string, unknown>))
    .filter((row): row is WorksheetMutationEvidenceV2OutboxRow => row !== null);
}

export async function writeWorksheetMutationOutboxIntelligenceEvents(
  events: Array<ReturnType<typeof preparePricingWorksheetIntelligenceEventForPersistence>>
) {
  if (events.length === 0) {
    return {
      count: 0,
      ids: [] as string[],
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("write_worksheet_mutation_outbox_intelligence_events" as never, {
    p_events: events,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;

  return {
    count: typeof payload.count === "number" ? payload.count : events.length,
    ids: Array.isArray(payload.ids) ? payload.ids : [],
  };
}

export async function finalizeWorksheetMutationEvidenceV2OutboxBatch(
  inputs: WorksheetMutationEvidenceV2OutboxFinalizeInput[]
) {
  if (inputs.length === 0) {
    return {
      count: 0,
      ids: [] as string[],
      completedCount: 0,
      retriedCount: 0,
      deadLetteredCount: 0,
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("finalize_worksheet_mutation_evidence_v2_outbox_batch" as never, {
    p_inputs: inputs,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, unknown>;

  return {
    count: typeof payload.count === "number" ? payload.count : inputs.length,
    ids: Array.isArray(payload.ids) ? payload.ids : [],
    completedCount: typeof payload.completedCount === "number" ? payload.completedCount : 0,
    retriedCount: typeof payload.retriedCount === "number" ? payload.retriedCount : 0,
    deadLetteredCount: typeof payload.deadLetteredCount === "number" ? payload.deadLetteredCount : 0,
  };
}

function buildDeadLetterFinalizeInput(
  row: WorksheetMutationEvidenceV2OutboxRow,
  errorCode: string,
  errorMessage: string
) {
  return {
    id: row.id,
    claimToken: row.claimToken ?? "",
    processingStatus: "dead_lettered" as const,
    errorCode,
    errorMessage,
  };
}

function buildRetryFinalizeInput(
  row: WorksheetMutationEvidenceV2OutboxRow,
  now: string,
  errorCode: string,
  errorMessage: string
) {
  if (row.attemptCount >= row.maxAttempts) {
    return buildDeadLetterFinalizeInput(row, errorCode, errorMessage);
  }

  return {
    id: row.id,
    claimToken: row.claimToken ?? "",
    processingStatus: "retry_scheduled" as const,
    retryAfter: buildRetryAfter(row.attemptCount, now),
    errorCode,
    errorMessage,
  };
}

export async function runWorksheetMutationEvidenceV2OutboxWorker(
  params: RunWorksheetMutationEvidenceV2OutboxWorkerInput = {},
) {
  const startedAt = Date.now();
  const now = params.now ?? new Date().toISOString();
  const claimedRows = await claimWorksheetMutationEvidenceV2OutboxBatch({
    limit: params.limit,
    organizationId: params.organizationId ?? null,
    workerId: params.workerId ?? DEFAULT_WORKER_ID,
    leaseSeconds: params.leaseSeconds,
  });

  let persistedEventCount = 0;
  const finalizeInputs: WorksheetMutationEvidenceV2OutboxFinalizeInput[] = [];

  for (const row of claimedRows) {
    if (!row.claimToken) {
      finalizeInputs.push(buildDeadLetterFinalizeInput(
        row,
        "missing_claim_token",
        "Claimed worksheet mutation outbox row is missing a claim token.",
      ));
      continue;
    }

    if (!isWorksheetSnapshotValid(row.previousWorksheet)) {
      finalizeInputs.push(buildDeadLetterFinalizeInput(
        row,
        "invalid_previous_worksheet",
        "Worksheet mutation outbox row is missing a valid previousWorksheet snapshot.",
      ));
      continue;
    }

    if (!isWorksheetSnapshotValid(row.nextWorksheet)) {
      finalizeInputs.push(buildDeadLetterFinalizeInput(
        row,
        "invalid_next_worksheet",
        "Worksheet mutation outbox row is missing a valid nextWorksheet snapshot.",
      ));
      continue;
    }

    try {
      const artifacts = buildWorksheetLearningArtifacts({
        organizationId: row.organizationId,
        userId: row.userId,
        projectId: row.projectId,
        opportunityId: row.opportunityId,
        workbookId: row.workbookId,
        workbookName: row.workbookName,
        sheetId: row.sheetId,
        sheetName: row.sheetName,
        worksheetId: row.worksheetId,
        worksheetName: row.worksheetName,
        tradePackage: row.tradePackage,
        source: row.source,
        previousWorksheet: normalizeWorksheetData(row.previousWorksheet),
        nextWorksheet: normalizeWorksheetData(row.nextWorksheet),
        clientMutationId: row.clientMutationId,
        occurredAt: row.occurredAt,
      });

      const preparedEvents = artifacts.intelligenceEvents.map(preparePricingWorksheetIntelligenceEventForPersistence);
      const persisted = await writeWorksheetMutationOutboxIntelligenceEvents(preparedEvents);
      persistedEventCount += persisted.count;
      finalizeInputs.push({
        id: row.id,
        claimToken: row.claimToken,
        processingStatus: "completed",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worksheet mutation Evidence V2 processing failed.";
      finalizeInputs.push(buildRetryFinalizeInput(
        row,
        now,
        "worksheet_mutation_processing_failed",
        message,
      ));
    }
  }

  const finalized = await finalizeWorksheetMutationEvidenceV2OutboxBatch(finalizeInputs);

  return {
    claimedCount: claimedRows.length,
    completedCount: finalized.completedCount,
    retriedCount: finalized.retriedCount,
    deadLetteredCount: finalized.deadLetteredCount,
    persistedEventCount,
    durationMs: Date.now() - startedAt,
  } satisfies RunWorksheetMutationEvidenceV2OutboxWorkerResult;
}
