import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSupplierBillTestRecord } from "@/lib/universal-learning/__test-utils__/supplier-bill";

const createDynamicAdminSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/universal-learning/supabase-dynamic-client", () => ({
  createDynamicAdminSupabaseClient,
}));

describe("Supplier Bill UCL container store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates the complete canonical record and sends only server-derived persistence data", async () => {
    const record = buildSupplierBillTestRecord();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        createdVersion: true,
        reusedVersion: false,
        currentUpdated: true,
        contentChanged: true,
        staleWriteRejected: false,
        versionId: "version-1",
        currentHash: record.payload.provenance.contentHash,
        versionCount: 1,
        payloadBytes: 5_000,
        contextStatus: "current",
      },
      error: null,
    });
    createDynamicAdminSupabaseClient.mockReturnValue({ rpc });
    const { persistSupplierBillUclContainer } = await import("./supplier-bill-container-store");

    const result = await persistSupplierBillUclContainer({
      queueId: "queue-1",
      leaseToken: "lease-1",
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
      record,
      contextStatus: "current",
      refreshReason: "supplier_bill_lines_changed",
    });

    expect(result).toMatchObject({ createdVersion: true, versionId: "version-1" });
    expect(rpc).toHaveBeenCalledWith(
      "persist_supplier_bill_ucl_container",
      expect.objectContaining({
        p_queue_id: "queue-1",
        p_lease_token: "lease-1",
        p_container_type: "supplier_invoice",
        p_schema_version: "supplier_bill.v2",
        p_payload_json: record,
        p_project_ids: record.payload.visibility.projectIds,
        p_supplier_id: record.supplierId,
        p_visibility_json: record.payload.visibility,
        p_payload_integrity_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_visibility_scope_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("never calls persistence for an invalid record or cross-organization identity", async () => {
    const record = buildSupplierBillTestRecord();
    const rpc = vi.fn();
    createDynamicAdminSupabaseClient.mockReturnValue({ rpc });
    const { persistSupplierBillUclContainer } = await import("./supplier-bill-container-store");

    await expect(persistSupplierBillUclContainer({
      queueId: "queue-1",
      leaseToken: "lease-1",
      organizationId: "other-org",
      sourceId: record.source.sourceId,
      record,
      contextStatus: "current",
      refreshReason: "supplier_bill_header_changed",
    })).rejects.toThrow("identity does not match");

    const invalidRecord = structuredClone(record);
    invalidRecord.payload.schemaVersion = "invalid" as "supplier_bill.v2";
    await expect(persistSupplierBillUclContainer({
      queueId: "queue-1",
      leaseToken: "lease-1",
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
      record: invalidRecord,
      contextStatus: "current",
      refreshReason: "supplier_bill_header_changed",
    })).rejects.toThrow("Invalid Supplier Bill UCL Container");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses stable payload and visibility integrity hashes", async () => {
    const record = buildSupplierBillTestRecord();
    const {
      buildSupplierBillStoredPayloadIntegrityHash,
      buildSupplierBillVisibilityScope,
    } = await import("./supplier-bill-container-store");
    const reordered = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
    const reversedEntries = Object.fromEntries(Object.entries(reordered).reverse());

    expect(buildSupplierBillStoredPayloadIntegrityHash(reversedEntries))
      .toBe(buildSupplierBillStoredPayloadIntegrityHash(record));
    expect(buildSupplierBillVisibilityScope(record).visibilityScopeHash)
      .toMatch(/^[0-9a-f]{64}$/);
  });

  it("deletes current context only through the lease-and-evidence RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        createdVersion: false,
        reusedVersion: false,
        currentUpdated: true,
        contentChanged: true,
        staleWriteRejected: false,
        versionId: null,
        currentHash: null,
        versionCount: 3,
        payloadBytes: null,
        contextStatus: "deleted",
      },
      error: null,
    });
    createDynamicAdminSupabaseClient.mockReturnValue({ rpc });
    const { deleteSupplierBillUclCurrentContainer } = await import("./supplier-bill-container-store");

    await deleteSupplierBillUclCurrentContainer({
      queueId: "queue-1",
      leaseToken: "lease-1",
      organizationId: "org-1",
      sourceId: "invoice-1",
      refreshReason: "supplier_bill_deleted",
      deletionEvidenceAt: "2026-07-28T00:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith("delete_supplier_bill_ucl_current_container", {
      p_queue_id: "queue-1",
      p_lease_token: "lease-1",
      p_organization_id: "org-1",
      p_source_id: "invoice-1",
      p_refresh_reason: "supplier_bill_deleted",
      p_deletion_evidence_at: "2026-07-28T00:00:00.000Z",
    });
  });
});
