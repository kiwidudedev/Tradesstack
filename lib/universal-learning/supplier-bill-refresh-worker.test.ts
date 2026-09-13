import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSupplierBillTestRecord } from "@/lib/universal-learning/__test-utils__/supplier-bill";

const buildUniversalLearningContainerRecords = vi.fn();
const claimSupplierBillUclRefreshBatch = vi.fn();
const finalizeSupplierBillUclRefresh = vi.fn();
const finalizeSupplierBillUclRefreshStale = vi.fn();
const createDynamicAdminSupabaseClient = vi.fn();
const persistSupplierBillUclContainer = vi.fn();
const deleteSupplierBillUclCurrentContainer = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/universal-learning/builders", () => ({
  buildUniversalLearningContainerRecords,
}));
vi.mock("@/lib/universal-learning/supplier-bill-refresh-queue", () => ({
  claimSupplierBillUclRefreshBatch,
  finalizeSupplierBillUclRefresh,
  finalizeSupplierBillUclRefreshStale,
}));
vi.mock("@/lib/universal-learning/supplier-bill-container-store", () => ({
  persistSupplierBillUclContainer,
  deleteSupplierBillUclCurrentContainer,
}));
vi.mock("@/lib/universal-learning/supabase-dynamic-client", () => ({
  createDynamicAdminSupabaseClient,
}));

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "queue-1",
    organizationId: "org-1",
    containerType: "supplier_invoice",
    sourceId: "invoice-1",
    reasonCode: "supplier_bill_lines_changed",
    priority: 50,
    queueState: "leased",
    attemptCount: 1,
    maxAttempts: 5,
    availableAt: "2026-07-28T00:00:00.000Z",
    leaseOwner: "worker-1",
    leaseToken: "lease-1",
    leaseExpiresAt: "2026-07-28T00:15:00.000Z",
    firstRequestedAt: "2026-07-28T00:00:00.000Z",
    lastRequestedAt: "2026-07-28T00:00:00.000Z",
    deletionEvidenceAt: null,
    contentHash: null,
    schemaVersion: null,
    builderVersion: null,
    ...overrides,
  };
}

function identityQuery(data: Record<string, unknown> | null, error: { message: string } | null = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
  };
  return query;
}

describe("Supplier Bill UCL refresh worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const record = buildSupplierBillTestRecord({
      updatedAt: "2026-07-28T01:00:00.000Z",
      lineCount: 2,
    });
    createDynamicAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => identityQuery({
        id: "invoice-1",
        organization_id: "org-1",
        status: "Captured",
        updated_at: "2026-07-28T01:00:00.000Z",
      })),
    });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [record],
      nextCursorCandidate: { updatedAt: record.updatedAt, id: record.source.sourceId },
      reviewScopeContext: {},
    });
    claimSupplierBillUclRefreshBatch.mockResolvedValue([queueRow()]);
    finalizeSupplierBillUclRefresh.mockResolvedValue(queueRow({ queueState: "completed" }));
    finalizeSupplierBillUclRefreshStale.mockResolvedValue(queueRow({ queueState: "completed" }));
    persistSupplierBillUclContainer.mockResolvedValue({
      createdVersion: true,
      reusedVersion: false,
      currentUpdated: true,
      contentChanged: true,
      staleWriteRejected: false,
      versionId: "version-1",
      currentHash: record.payload.provenance.contentHash,
      versionCount: 1,
      payloadBytes: 4_096,
      contextStatus: "current",
    });
    deleteSupplierBillUclCurrentContainer.mockResolvedValue({
      createdVersion: false,
      reusedVersion: false,
      currentUpdated: true,
      contentChanged: true,
      staleWriteRejected: false,
      versionId: null,
      currentHash: null,
      versionCount: 1,
      payloadBytes: null,
      contextStatus: "deleted",
    });
  });

  it("re-reads canonical data, reuses the targeted supplier_invoice builder and records changed metadata", async () => {
    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker({ workerId: "worker-1" });

    expect(buildUniversalLearningContainerRecords).toHaveBeenCalledWith({
      containerType: "supplier_invoice",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-07",
      },
      sourceIds: ["invoice-1"],
      limit: 1,
    });
    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith(expect.objectContaining({
      queueId: "queue-1",
      leaseToken: "lease-1",
      outcome: "changed",
      metadata: expect.objectContaining({
        schemaVersion: "supplier_bill.v2",
        builderVersion: "supplier_bill.contract.v2",
        contentHash: expect.any(String),
        payloadBytes: expect.any(Number),
      }),
    }));
    expect(persistSupplierBillUclContainer).toHaveBeenCalledWith(expect.objectContaining({
      queueId: "queue-1",
      leaseToken: "lease-1",
      organizationId: "org-1",
      sourceId: "invoice-1",
      contextStatus: "current",
    }));
    expect(result).toMatchObject({
      changedCount: 1,
      claimedCount: 1,
      versionCreatedCount: 1,
    });
  });

  it("completes an identical canonical hash as no_change", async () => {
    const record = buildSupplierBillTestRecord({
      updatedAt: "2026-07-28T01:00:00.000Z",
    });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [record],
      nextCursorCandidate: { updatedAt: record.updatedAt, id: record.source.sourceId },
      reviewScopeContext: {},
    });
    claimSupplierBillUclRefreshBatch.mockResolvedValue([
      queueRow({ contentHash: record.payload.provenance.contentHash }),
    ]);
    persistSupplierBillUclContainer.mockResolvedValue({
      createdVersion: false,
      reusedVersion: true,
      currentUpdated: true,
      contentChanged: false,
      staleWriteRejected: false,
      versionId: "version-1",
      currentHash: record.payload.provenance.contentHash,
      versionCount: 1,
      payloadBytes: 4_096,
      contextStatus: "current",
    });

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "no_change",
    }));
    expect(result.noChangeCount).toBe(1);
    expect(result.versionReusedCount).toBe(1);
  });

  it("retains a validated voided context instead of treating it as deleted", async () => {
    const record = buildSupplierBillTestRecord();
    record.payload.sourceEvidence.bill.canonicalStatus = "Voided";
    record.status.canonicalStatus = "Voided";
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [record],
      nextCursorCandidate: { updatedAt: record.updatedAt, id: record.source.sourceId },
      reviewScopeContext: {},
    });

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "voided",
      metadata: expect.objectContaining({ contentHash: expect.any(String) }),
    }));
    expect(persistSupplierBillUclContainer).toHaveBeenCalledWith(expect.objectContaining({
      contextStatus: "voided",
    }));
    expect(result.voidedCount).toBe(1);
  });

  it("tombstones only a missing source with atomic deletion evidence", async () => {
    createDynamicAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => identityQuery(null)),
    });
    claimSupplierBillUclRefreshBatch.mockResolvedValue([
      queueRow({
        reasonCode: "supplier_bill_deleted",
        deletionEvidenceAt: "2026-07-28T01:00:00.000Z",
      }),
    ]);

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(buildUniversalLearningContainerRecords).not.toHaveBeenCalled();
    expect(deleteSupplierBillUclCurrentContainer).toHaveBeenCalledWith(expect.objectContaining({
      deletionEvidenceAt: "2026-07-28T01:00:00.000Z",
    }));
    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith({
      queueId: "queue-1",
      leaseToken: "lease-1",
      outcome: "deleted",
    });
    expect(result.deletedCount).toBe(1);
  });

  it("fails closed when a source is missing without deletion evidence", async () => {
    createDynamicAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => identityQuery(null)),
    });

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "dead_letter",
      errorCode: "supplier_bill_source_missing_unconfirmed",
      errorSummary: "Canonical Supplier Bill was missing without atomic deletion evidence.",
    }));
    expect(result.deadLetteredCount).toBe(1);
  });

  it("fails closed on cross-organization identity", async () => {
    createDynamicAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => identityQuery({
        id: "invoice-1",
        organization_id: "org-2",
        status: "Captured",
        updated_at: "2026-07-28T01:00:00.000Z",
      })),
    });

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "dead_letter",
      errorCode: "supplier_bill_source_cross_organization",
    }));
    expect(result.deadLetteredCount).toBe(1);
  });

  it("retries transient dependency failures with bounded backoff", async () => {
    buildUniversalLearningContainerRecords.mockRejectedValue(new Error("temporary connection timeout"));

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "retry",
      retryAt: expect.any(String),
      errorCode: "supplier_bill_refresh_dependency_unavailable",
      errorSummary: "A temporary canonical dependency read failed.",
    }));
    expect(result.retriedCount).toBe(1);
  });

  it("uses bounded retry intervals and caps later attempts at one day", async () => {
    const { getSupplierBillRefreshRetryAt } = await import("./supplier-bill-refresh-worker");
    const now = new Date("2026-07-28T00:00:00.000Z");

    expect(getSupplierBillRefreshRetryAt(1, now)).toBe("2026-07-28T00:15:00.000Z");
    expect(getSupplierBillRefreshRetryAt(2, now)).toBe("2026-07-28T01:00:00.000Z");
    expect(getSupplierBillRefreshRetryAt(3, now)).toBe("2026-07-28T04:00:00.000Z");
    expect(getSupplierBillRefreshRetryAt(99, now)).toBe("2026-07-29T00:00:00.000Z");
  });

  it("dead-letters deterministic validation failure without storing raw record content", async () => {
    const record = buildSupplierBillTestRecord();
    record.clientId = "forbidden-client";
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [record],
      nextCursorCandidate: { updatedAt: record.updatedAt, id: record.source.sourceId },
      reviewScopeContext: {},
    });

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    const finalizeInput = finalizeSupplierBillUclRefresh.mock.calls[0][0];
    expect(finalizeInput).toMatchObject({
      outcome: "dead_letter",
      errorCode: "supplier_bill_ucl_validation_failed",
      errorSummary: "Supplier Bill UCL validation failed.",
    });
    expect(JSON.stringify(finalizeInput)).not.toContain("forbidden-client");
    expect(result.deadLetteredCount).toBe(1);
  });

  it("does not overwrite a newer coalesced request after losing its lease", async () => {
    finalizeSupplierBillUclRefresh.mockRejectedValue(
      new Error("Supplier Bill refresh lease is not owned by this worker."),
    );

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(result.supersededCount).toBe(1);
    expect(result.results[0].outcome).toBe("superseded");
  });

  it("stops before finalization when persistence rejects a superseded lease", async () => {
    persistSupplierBillUclContainer.mockRejectedValue(
      new Error("Supplier Bill UCL persistence lease is not owned by this worker."),
    );

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefresh).not.toHaveBeenCalled();
    expect(finalizeSupplierBillUclRefreshStale).not.toHaveBeenCalled();
    expect(result.supersededCount).toBe(1);
  });

  it("finalizes stale persistence without moving the current pointer", async () => {
    persistSupplierBillUclContainer.mockResolvedValue({
      createdVersion: false,
      reusedVersion: false,
      currentUpdated: false,
      contentChanged: false,
      staleWriteRejected: true,
      versionId: "newer-version",
      currentHash: "newer-hash",
      versionCount: null,
      payloadBytes: 4_096,
      contextStatus: "current",
    });

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefreshStale).toHaveBeenCalledWith({
      queueId: "queue-1",
      leaseToken: "lease-1",
    });
    expect(finalizeSupplierBillUclRefresh).not.toHaveBeenCalled();
    expect(result.staleCount).toBe(1);
  });

  it("does not finalize success when container persistence fails", async () => {
    persistSupplierBillUclContainer.mockRejectedValue(
      Object.assign(new Error("temporary connection timeout"), { code: "08006" }),
    );

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "retry",
    }));
    expect(result.retriedCount).toBe(1);
  });

  it("dead-letters deterministic persistence contract failures safely", async () => {
    persistSupplierBillUclContainer.mockRejectedValue(
      Object.assign(new Error("Invalid persistence metadata."), {
        code: "supplier_bill_ucl_persistence_hash_invalid",
      }),
    );

    const { runSupplierBillUclRefreshWorker } = await import("./supplier-bill-refresh-worker");
    const result = await runSupplierBillUclRefreshWorker();

    expect(finalizeSupplierBillUclRefresh).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "dead_letter",
      errorCode: "supplier_bill_ucl_persistence_hash_invalid",
      errorSummary: "Supplier Bill UCL validation failed.",
    }));
    expect(result.deadLetteredCount).toBe(1);
    expect(result.results[0].diagnosticCode).toBe("supplier_bill_ucl_persistence_failed");
  });

  it("has no model, memory-action, monthly cursor, prompt, search or embedding dependency", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib/universal-learning/supplier-bill-refresh-worker.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from ["'][^"']*(model|memory-actions|delta-cursors|prompt|embedding|search)/);
    expect(source).not.toContain("advanceUniversalLearningCursor");
    expect(source).not.toContain("callUniversalConstructionLearning");
  });
});
