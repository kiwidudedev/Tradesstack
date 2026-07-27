import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDefaultWorksheetData, normalizeWorksheetData } from "./opportunity-pricing-worksheet-defaults";
import type { Json } from "./supabase/types";
import {
  buildWorksheetLearningArtifacts,
  enqueueWorksheetMutationEvidenceV2Outbox,
  buildWorksheetCorrectionEventInput,
  preparePricingWorksheetIntelligenceEventForPersistence,
} from "./pricing-worksheet-intelligence";
import {
  flushPendingWorksheetLearningWrites,
  queuePendingWorksheetLearningWrite,
} from "./pricing-worksheet-learning-persistence";

const createAdminSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

function buildWorksheetCell(value: string | number) {
  const isNumber = typeof value === "number";
  return {
    value,
    type: isNumber ? "number" : "text",
    formula: typeof value === "string" && value.startsWith("=") ? value : null,
    computedValue: value,
    displayValue: String(value),
    metadata: {},
  } as const;
}

function buildStableHeaderWorksheet() {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Suspended Ceilings",
    rowCount: 10,
    columnCount: 11,
  });

  worksheet.cells.A1 = buildWorksheetCell("Section");
  worksheet.cells.B1 = buildWorksheetCell("Item");
  worksheet.cells.C1 = buildWorksheetCell("Description");
  worksheet.cells.D1 = buildWorksheetCell("Unit");
  worksheet.cells.E1 = buildWorksheetCell("Quantity");
  worksheet.cells.F1 = buildWorksheetCell("Material Rate");
  worksheet.cells.G1 = buildWorksheetCell("Labour Hours");
  worksheet.cells.H1 = buildWorksheetCell("Labour Rate");
  worksheet.cells.I1 = buildWorksheetCell("Margin");
  worksheet.cells.J1 = buildWorksheetCell("Total");
  worksheet.cells.K1 = buildWorksheetCell("Notes");

  worksheet.cells.A4 = buildWorksheetCell("Inputs");
  worksheet.cells.B4 = buildWorksheetCell("Grid Spacing");
  worksheet.cells.C4 = buildWorksheetCell("Main tee spacing – typically 600mm or 1200mm");
  worksheet.cells.D4 = buildWorksheetCell("mm");
  worksheet.cells.E4 = buildWorksheetCell(1200);

  worksheet.cells.A8 = buildWorksheetCell("Component Quantities");
  worksheet.cells.B8 = buildWorksheetCell("Main Tees (3600mm)");
  worksheet.cells.C8 = buildWorksheetCell("Rondo DONN 24mm main tee – qty based on grid spacing and area");
  worksheet.cells.D8 = buildWorksheetCell("lm");
  worksheet.cells.E8 = buildWorksheetCell("=IFERROR(ROUNDUP((100/(E4/1000))*1.1,1),\"\")");

  return worksheet;
}

function buildMutationArtifacts(clientMutationId = "mutation-1") {
  const previousWorksheet = buildStableHeaderWorksheet();
  const nextWorksheet = normalizeWorksheetData(previousWorksheet as unknown as Json);
  nextWorksheet.cells.E4 = {
    ...nextWorksheet.cells.E4!,
    value: 600,
    computedValue: 600,
    displayValue: "600",
  };

  const artifacts = buildWorksheetLearningArtifacts({
    organizationId: "org-1",
    userId: "user-1",
    projectId: "project-1",
    opportunityId: "opp-1",
    workbookId: "workbook-1",
    sheetId: "sheet-1",
    sheetName: "Suspended Ceilings",
    worksheetId: "workbook-1",
    worksheetName: "Suspended Ceilings",
    tradePackage: "Ceilings",
    source: "manual",
    previousWorksheet,
    nextWorksheet,
    clientMutationId,
    occurredAt: "2026-06-05T00:00:00.000Z",
  });

  return {
    previousWorksheet,
    nextWorksheet,
    artifacts,
  };
}

function buildOutboxRow(overrides: Record<string, unknown> = {}) {
  const { previousWorksheet, nextWorksheet } = buildMutationArtifacts(
    typeof overrides.client_mutation_id === "string" ? overrides.client_mutation_id : "mutation-1",
  );

  return {
    id: "outbox-1",
    organization_id: "org-1",
    project_id: "project-1",
    opportunity_id: "opp-1",
    workbook_id: "workbook-1",
    workbook_name: null,
    sheet_id: "sheet-1",
    sheet_name: "Suspended Ceilings",
    worksheet_id: "workbook-1",
    worksheet_name: "Suspended Ceilings",
    trade_package: "Ceilings",
    user_id: "user-1",
    source: "manual",
    client_mutation_id: "mutation-1",
    occurred_at: "2026-06-05T00:00:00.000Z",
    previous_worksheet: previousWorksheet,
    next_worksheet: nextWorksheet,
    processing_status: "pending",
    attempt_count: 0,
    max_attempts: 5,
    claim_token: null,
    claim_expires_at: null,
    retry_after: null,
    ...overrides,
  };
}

function buildAdminClient(state: {
  outboxRows: Array<Record<string, unknown>>;
  persistedEvents: Array<Record<string, unknown>>;
}) {
  return {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "claim_worksheet_mutation_evidence_v2_outbox_batch") {
        const limit = typeof args.p_limit === "number" ? args.p_limit : 25;
        const now = Date.parse("2026-06-05T00:00:00.000Z");
        const eligible = state.outboxRows
          .filter((row) => {
            const status = row.processing_status;
            const retryAfter = typeof row.retry_after === "string" ? Date.parse(row.retry_after) : null;
            const claimExpiresAt = typeof row.claim_expires_at === "string" ? Date.parse(row.claim_expires_at) : null;
            return status === "pending"
              || (status === "retry_scheduled" && (retryAfter === null || retryAfter <= now))
              || (status === "claimed" && claimExpiresAt !== null && claimExpiresAt <= now);
          })
          .slice(0, limit);

        const claimed = eligible.map((row, index) => {
          row.processing_status = "claimed";
          row.attempt_count = (typeof row.attempt_count === "number" ? row.attempt_count : 0) + 1;
          row.claim_token = `claim-${index + 1}-${row.id}`;
          row.claim_expires_at = "2026-06-05T00:10:00.000Z";
          return { ...row };
        });

        return { data: claimed, error: null };
      }

      if (fn === "write_worksheet_mutation_outbox_intelligence_events") {
        const events = Array.isArray(args.p_events) ? args.p_events as Array<Record<string, unknown>> : [];
        const insertedIds: string[] = [];

        for (const event of events) {
          const key = [
            event.organizationId,
            event.module,
            event.eventType,
            event.sourceRequestId,
          ].join(":");
          const existing = state.persistedEvents.find((entry) => entry.__key === key);
          if (existing) {
            insertedIds.push(String(existing.id));
            continue;
          }

          const nextId = `event-${state.persistedEvents.length + 1}`;
          state.persistedEvents.push({
            ...event,
            id: nextId,
            __key: key,
          });
          insertedIds.push(nextId);
        }

        return {
          data: {
            count: insertedIds.length,
            ids: insertedIds,
          },
          error: null,
        };
      }

      if (fn === "finalize_worksheet_mutation_evidence_v2_outbox_batch") {
        const inputs = Array.isArray(args.p_inputs) ? args.p_inputs as Array<Record<string, unknown>> : [];
        let completedCount = 0;
        let retriedCount = 0;
        let deadLetteredCount = 0;
        const ids: string[] = [];

        for (const input of inputs) {
          const row = state.outboxRows.find((entry) => entry.id === input.id && entry.claim_token === input.claimToken);
          if (!row) {
            continue;
          }

          const status = input.processingStatus;
          if (status === "completed") {
            row.processing_status = "completed";
            row.claim_token = null;
            row.claim_expires_at = null;
            completedCount += 1;
          } else if (status === "retry_scheduled") {
            row.processing_status = "retry_scheduled";
            row.retry_after = input.retryAfter ?? null;
            row.claim_token = null;
            row.claim_expires_at = null;
            retriedCount += 1;
          } else if (status === "dead_lettered") {
            row.processing_status = "dead_lettered";
            row.claim_token = null;
            row.claim_expires_at = null;
            deadLetteredCount += 1;
          }

          row.last_error_code = input.errorCode ?? null;
          row.last_error_message = input.errorMessage ?? null;
          ids.push(String(row.id));
        }

        return {
          data: {
            count: ids.length,
            ids,
            completedCount,
            retriedCount,
            deadLetteredCount,
          },
          error: null,
        };
      }

      throw new Error(`Unexpected RPC: ${fn}`);
    }),
  };
}

describe("worksheet mutation Evidence V2 outbox worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates one outbox row for the same mutation id on replay", async () => {
    const state = new Map<string, Record<string, unknown>>();
    const browserClient = {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        if (fn !== "enqueue_worksheet_mutation_evidence_v2_outbox") {
          throw new Error(`Unexpected RPC ${fn}`);
        }

        const input = args.p_input as Record<string, unknown>;
        const key = `${input.organizationId}:${input.clientMutationId}`;
        const existing = state.get(key);
        if (existing) {
          return { data: { id: existing.id, inserted: false }, error: null };
        }

        const row = { id: `outbox-${state.size + 1}`, ...input };
        state.set(key, row);
        return { data: { id: row.id, inserted: true }, error: null };
      }),
    };

    const { previousWorksheet, nextWorksheet } = buildMutationArtifacts("mutation-replay");

    await enqueueWorksheetMutationEvidenceV2Outbox(browserClient as never, {
      organizationId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Suspended Ceilings",
      worksheetId: "workbook-1",
      worksheetName: "Suspended Ceilings",
      tradePackage: "Ceilings",
      source: "manual",
      clientMutationId: "mutation-replay",
      occurredAt: "2026-06-05T00:00:00.000Z",
      previousWorksheet,
      nextWorksheet,
    });

    await enqueueWorksheetMutationEvidenceV2Outbox(browserClient as never, {
      organizationId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Suspended Ceilings",
      worksheetId: "workbook-1",
      worksheetName: "Suspended Ceilings",
      tradePackage: "Ceilings",
      source: "manual",
      clientMutationId: "mutation-replay",
      occurredAt: "2026-06-05T00:00:00.000Z",
      previousWorksheet,
      nextWorksheet,
    });

    expect(state.size).toBe(1);
  });

  it("queues learning writes locally until save succeeds, then flushes them with the persisted sheet id", async () => {
    const { previousWorksheet, nextWorksheet } = buildMutationArtifacts("mutation-flush");
    const correctionEvent = buildWorksheetCorrectionEventInput({
      organizationId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      opportunityId: "opp-1",
      workbookId: "workbook-draft",
      sheetId: "sheet-draft",
      sheetName: "Draft Sheet",
      aiInteractionId: "ai-1",
      correctionType: "manual_override",
      correctionLabel: "worksheet_ai_output_corrected",
      targetEntityId: "E4",
      correctedFieldName: "value",
      incorrectValue: 1200,
      correctedValue: 600,
      correctionReason: "Estimator corrected AI-generated worksheet output.",
      isTrainingEligible: true,
    });

    let queue = queuePendingWorksheetLearningWrite([], {
      clientMutationId: "mutation-flush",
      correctionEvents: [correctionEvent],
      enqueueOutbox: true,
      previousWorksheet,
      nextWorksheet,
      occurredAt: "2026-06-05T00:00:00.000Z",
    });

    const outboxCalls: Array<Record<string, unknown>> = [];
    const correctionCalls: Array<Record<string, unknown>> = [];
    const result = await flushPendingWorksheetLearningWrites({
      queue,
      workbookId: "workbook-saved",
      sheetId: "sheet-saved",
      sheetName: "Suspended Ceilings",
      enqueueOutbox: async (input) => {
        outboxCalls.push(input);
      },
      writeCorrectionEvent: async (input) => {
        correctionCalls.push(input);
      },
    });

    queue = result.remainingQueue;
    expect(queue).toHaveLength(0);
    expect(outboxCalls).toHaveLength(1);
    expect(outboxCalls[0]?.clientMutationId).toBe("mutation-flush");
    expect(correctionCalls).toHaveLength(1);
    expect(correctionCalls[0]?.metadata).toEqual(
      expect.objectContaining({
        workbookId: "workbook-saved",
        sheetId: "sheet-saved",
        sheetName: "Suspended Ceilings",
      }),
    );
  });

  it("keeps pending learning writes queued when the post-save outbox flush fails", async () => {
    const { previousWorksheet, nextWorksheet } = buildMutationArtifacts("mutation-failed-save");
    const queue = queuePendingWorksheetLearningWrite([], {
      clientMutationId: "mutation-failed-save",
      correctionEvents: [],
      enqueueOutbox: true,
      previousWorksheet,
      nextWorksheet,
      occurredAt: "2026-06-05T00:00:00.000Z",
    });

    const result = await flushPendingWorksheetLearningWrites({
      queue,
      workbookId: "workbook-saved",
      sheetId: "sheet-saved",
      sheetName: "Suspended Ceilings",
      enqueueOutbox: async () => {
        throw new Error("outbox write failed");
      },
      writeCorrectionEvent: async () => {},
    });

    expect(result.remainingQueue).toHaveLength(1);
    expect(result.outboxCount).toBe(0);
  });

  it("materializes the same Evidence V2 events as the old browser write path and keeps classification pending", async () => {
    const row = buildOutboxRow();
    const state = {
      outboxRows: [row],
      persistedEvents: [] as Array<Record<string, unknown>>,
    };
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const { runWorksheetMutationEvidenceV2OutboxWorker } = await import("./worksheet-mutation-evidence-v2-outbox");
    const result = await runWorksheetMutationEvidenceV2OutboxWorker({
      limit: 10,
    });

    const { artifacts } = buildMutationArtifacts();
    const expectedEvents = artifacts.intelligenceEvents.map(preparePricingWorksheetIntelligenceEventForPersistence);
    const actualEvents = state.persistedEvents.map((event) => {
      const { id: _id, __key: _key, ...rest } = event;
      return rest;
    });

    expect(result.claimedCount).toBe(1);
    expect(result.completedCount).toBe(1);
    expect(result.retriedCount).toBe(0);
    expect(result.deadLetteredCount).toBe(0);
    expect(actualEvents).toEqual(expectedEvents);
    expect(actualEvents[0]?.diffData).toMatchObject({
      classificationStatus: "pending",
      clientMutationId: "mutation-1",
    });
  });

  it("does not duplicate intelligence events on retry after a half-successful write", async () => {
    const row = buildOutboxRow({
      processing_status: "retry_scheduled",
      attempt_count: 1,
      retry_after: "2026-06-04T23:59:00.000Z",
    });
    const state = {
      outboxRows: [row],
      persistedEvents: [] as Array<Record<string, unknown>>,
    };
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const { artifacts } = buildMutationArtifacts();
    const preparedEvents = artifacts.intelligenceEvents.map(preparePricingWorksheetIntelligenceEventForPersistence);
    for (const event of preparedEvents) {
      state.persistedEvents.push({
        ...event,
        id: `event-${state.persistedEvents.length + 1}`,
        __key: [event.organizationId, event.module, event.eventType, event.sourceRequestId].join(":"),
      });
    }

    const { runWorksheetMutationEvidenceV2OutboxWorker } = await import("./worksheet-mutation-evidence-v2-outbox");
    const result = await runWorksheetMutationEvidenceV2OutboxWorker({
      limit: 10,
    });

    expect(result.completedCount).toBe(1);
    expect(state.persistedEvents).toHaveLength(preparedEvents.length);
  });

  it("dead-letters invalid worksheet snapshots", async () => {
    const state = {
      outboxRows: [
        buildOutboxRow({
          previous_worksheet: null,
        }),
      ],
      persistedEvents: [] as Array<Record<string, unknown>>,
    };
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const { runWorksheetMutationEvidenceV2OutboxWorker } = await import("./worksheet-mutation-evidence-v2-outbox");
    const result = await runWorksheetMutationEvidenceV2OutboxWorker({
      limit: 10,
    });

    expect(result.deadLetteredCount).toBe(1);
    expect(state.persistedEvents).toHaveLength(0);
    expect(state.outboxRows[0]?.processing_status).toBe("dead_lettered");
  });

  it("uses outbox enqueue instead of direct edit-event writes in the board mutation path", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/app/OpportunityPricingWorksheetBoard.tsx"),
      "utf8",
    );

    expect(source).toContain("enqueueWorksheetMutationEvidenceV2Outbox");
    expect(source).not.toContain("writePricingWorksheetIntelligenceEvents(supabase, artifacts.intelligenceEvents)");
  });
});
