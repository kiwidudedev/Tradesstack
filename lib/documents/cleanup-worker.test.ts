import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, remove, from, createAdminSupabaseClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));

import {
  classifyDocumentCleanupError,
  runDocumentCleanupWorker,
} from "@/lib/documents/cleanup-worker";

const purgeJob = {
  job_id: "e6000000-0000-4000-8000-000000000001",
  claim_token: "e6000000-0000-4000-8000-000000000002",
  organization_id: "e6000000-0000-4000-8000-000000000003",
  workspace_id: "e6000000-0000-4000-8000-000000000004",
  cleanup_batch_id: "e6000000-0000-4000-8000-000000000005",
  job_type: "version_purge",
  storage_bucket: "organization-documents",
  storage_key: "opaque/purge/key",
  byte_size: 100,
  attempt_count: 1,
  max_attempts: 5,
};
const orphanJob = {
  ...purgeJob,
  job_id: "e6000000-0000-4000-8000-000000000006",
  claim_token: "e6000000-0000-4000-8000-000000000007",
  cleanup_batch_id: null,
  job_type: "orphan_reconciliation",
  storage_key: "opaque/orphan/key",
};

describe("document cleanup worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReturnValue({ remove });
    remove.mockResolvedValue({ data: [], error: null });
    createAdminSupabaseClient.mockReturnValue({ rpc, storage: { from } });
    rpc.mockImplementation((name: string) => {
      if (name === "abandon_expired_document_uploads") {
        return Promise.resolve({ data: 2, error: null });
      }
      if (name === "reconcile_document_storage_catalog") {
        return Promise.resolve({
          data: {
            databaseWithoutObjectCount: 1,
            metadataMismatchCount: 0,
            orphanObjectCount: 1,
          },
          error: null,
        });
      }
      if (name === "claim_document_storage_cleanup_jobs") {
        return Promise.resolve({ data: [purgeJob, orphanJob], error: null });
      }
      if (name === "document_cleanup_storage_object_exists") {
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "complete_document_storage_cleanup_job") {
        return Promise.resolve({ data: "completed", error: null });
      }
      if (name === "fail_document_storage_cleanup_job") {
        return Promise.resolve({ data: "retry_scheduled", error: null });
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
  });

  it("deletes purge objects once and never deletes reconciliation-only orphans", async () => {
    const result = await runDocumentCleanupWorker({
      limit: 10,
      workerId: "test-worker",
      leaseSeconds: 60,
    });
    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("organization-documents");
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(["opaque/purge/key"]);
    expect(result).toMatchObject({
      expiredUploadCount: 2,
      claimedCount: 2,
      completedCount: 2,
      reviewedOrphanCount: 1,
      skippedDeleteCount: 1,
    });
  });

  it("skips a duplicate delete when the catalog says the object is already absent", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "abandon_expired_document_uploads") {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === "reconcile_document_storage_catalog") {
        return Promise.resolve({ data: {}, error: null });
      }
      if (name === "claim_document_storage_cleanup_jobs") {
        return Promise.resolve({ data: [purgeJob], error: null });
      }
      if (name === "document_cleanup_storage_object_exists") {
        return Promise.resolve({ data: false, error: null });
      }
      return Promise.resolve({ data: "completed", error: null });
    });
    const result = await runDocumentCleanupWorker();
    expect(remove).not.toHaveBeenCalled();
    expect(result.skippedDeleteCount).toBe(1);
  });

  it("records retryable deletion failures without leaking Storage errors", async () => {
    remove.mockResolvedValue({
      data: null,
      error: { message: "network timeout with sensitive endpoint" },
    });
    const result = await runDocumentCleanupWorker();
    expect(result.retriedCount).toBe(1);
    expect(rpc).toHaveBeenCalledWith(
      "fail_document_storage_cleanup_job",
      expect.objectContaining({
        p_error_code: "storage_temporarily_unavailable",
        p_error_message: "Storage was temporarily unavailable.",
      }),
    );
  });

  it("classifies operational failures into bounded diagnostics", () => {
    expect(classifyDocumentCleanupError(new Error("network timeout"))).toEqual({
      code: "storage_temporarily_unavailable",
      message: "Storage was temporarily unavailable.",
    });
    expect(classifyDocumentCleanupError(new Error("lease expired"))).toEqual({
      code: "cleanup_lease_lost",
      message: "Cleanup lease was no longer owned.",
    });
  });
});
