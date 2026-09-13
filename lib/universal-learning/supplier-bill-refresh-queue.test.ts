import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "queue-1",
    organizationId: "org-1",
    containerType: "supplier_invoice",
    sourceId: "invoice-1",
    reasonCode: "supplier_bill_manual_refresh",
    priority: 10,
    queueState: "pending",
    attemptCount: 0,
    maxAttempts: 5,
    availableAt: "2026-07-28T00:00:00.000Z",
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: null,
    firstRequestedAt: "2026-07-28T00:00:00.000Z",
    lastRequestedAt: "2026-07-28T00:00:00.000Z",
    deletionEvidenceAt: null,
    contentHash: null,
    schemaVersion: null,
    builderVersion: null,
    ...overrides,
  };
}

describe("Supplier Bill UCL refresh queue service", () => {
  beforeEach(() => {
    createAdminSupabaseClient.mockReset();
  });

  it("manual refresh sends only source identity and a bounded reason to the service RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: queueRow(), error: null });
    createAdminSupabaseClient.mockReturnValue({ rpc });
    const { enqueueManualSupplierBillUclRefresh } = await import("./supplier-bill-refresh-queue");

    const result = await enqueueManualSupplierBillUclRefresh("invoice-1");

    expect(rpc).toHaveBeenCalledWith("enqueue_supplier_bill_ucl_refresh", {
      p_source_id: "invoice-1",
      p_reason_code: "supplier_bill_manual_refresh",
      p_priority: 10,
    });
    expect(result.organizationId).toBe("org-1");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_organization_id");
  });

  it("rejects unsafe reason codes before making a database request", async () => {
    const rpc = vi.fn();
    createAdminSupabaseClient.mockReturnValue({ rpc });
    const { enqueueSupplierBillUclRefresh } = await import("./supplier-bill-refresh-queue");

    await expect(enqueueSupplierBillUclRefresh({
      sourceId: "invoice-1",
      reasonCode: "unsafe" as "supplier_bill_created",
    })).rejects.toThrow("Invalid Supplier Bill refresh reason code");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("claims with bounded worker scope and parses lease ownership", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [queueRow({
        queueState: "leased",
        leaseOwner: "worker-1",
        leaseToken: "lease-1",
      })],
      error: null,
    });
    createAdminSupabaseClient.mockReturnValue({ rpc });
    const { claimSupplierBillUclRefreshBatch } = await import("./supplier-bill-refresh-queue");

    const rows = await claimSupplierBillUclRefreshBatch({
      organizationId: "org-1",
      workerId: "worker-1",
      limit: 7,
      leaseSeconds: 300,
    });

    expect(rpc).toHaveBeenCalledWith("claim_supplier_bill_ucl_refresh_batch", {
      p_limit: 7,
      p_organization_id: "org-1",
      p_worker_id: "worker-1",
      p_lease_seconds: 300,
    });
    expect(rows[0]).toMatchObject({ leaseOwner: "worker-1", leaseToken: "lease-1" });
  });

  it("finalizes only bounded metadata and never sends a raw container", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: queueRow({ queueState: "completed", contentHash: "hash-1" }),
      error: null,
    });
    createAdminSupabaseClient.mockReturnValue({ rpc });
    const { finalizeSupplierBillUclRefresh } = await import("./supplier-bill-refresh-queue");

    await finalizeSupplierBillUclRefresh({
      queueId: "queue-1",
      leaseToken: "lease-1",
      outcome: "changed",
      metadata: {
        schemaVersion: "supplier_bill.v2",
        builderVersion: "supplier_bill.contract.v2",
        contentHash: "hash-1",
        canonicalUpdatedAt: "2026-07-28T00:00:00.000Z",
        latestDependencyUpdatedAt: "2026-07-28T00:01:00.000Z",
        payloadBytes: 1_234,
      },
    });

    const args = rpc.mock.calls[0][1];
    expect(args).not.toHaveProperty("payload");
    expect(args).not.toHaveProperty("record");
    expect(JSON.stringify(args)).not.toContain("line description");
    expect(args).toMatchObject({
      p_schema_version: "supplier_bill.v2",
      p_content_hash: "hash-1",
      p_payload_bytes: 1_234,
    });
  });

  it("finalizes stale work through the lease-owned stale RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: queueRow({ queueState: "completed" }),
      error: null,
    });
    createAdminSupabaseClient.mockReturnValue({ rpc });
    const { finalizeSupplierBillUclRefreshStale } = await import(
      "./supplier-bill-refresh-queue"
    );

    await finalizeSupplierBillUclRefreshStale({
      queueId: "queue-1",
      leaseToken: "lease-1",
    });

    expect(rpc).toHaveBeenCalledWith("finalize_supplier_bill_ucl_refresh_stale", {
      p_queue_id: "queue-1",
      p_lease_token: "lease-1",
    });
  });
});
