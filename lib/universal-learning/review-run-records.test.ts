import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

describe("Universal Construction Learning review run records", () => {
  beforeEach(() => {
    createAdminSupabaseClient.mockReset();
  });

  it("writes run records with duplicate-safe upsert semantics", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    createAdminSupabaseClient.mockReturnValue({ from });

    const { writeUniversalLearningRunRecords } = await import("./review-run-records");
    await writeUniversalLearningRunRecords({
      reviewRunId: "run-1",
      records: [{
        containerType: "supplier_invoice_allocation",
        source: {
          table: "supplier_invoice_line_allocations",
          sourceId: "source-1",
          sourceVersion: 1,
        },
        organizationId: "org-1",
        projectId: "project-1",
        opportunityId: null,
        supplierId: "supplier-1",
        clientId: null,
        actorUserId: null,
        updatedAt: "2026-05-10T00:00:00.000Z",
        status: {},
        payload: {},
        linkedContext: {},
        routingContext: {},
        signalStrength: "normal",
      }],
    });

    expect(from).toHaveBeenCalledWith("learning_review_run_records");
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        review_run_id: "run-1",
        organization_id: "org-1",
        container_type: "supplier_invoice_allocation",
        source_table: "supplier_invoice_line_allocations",
        source_id: "source-1",
      }),
    ], {
      onConflict: "review_run_id,source_table,source_id",
      ignoreDuplicates: true,
    });
  });
});
