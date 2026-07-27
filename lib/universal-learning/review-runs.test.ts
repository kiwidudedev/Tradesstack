import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

function createInsertQuery(result: unknown) {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

function createSelectQuery(result: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

describe("Universal Construction Learning review runs", () => {
  beforeEach(() => {
    createAdminSupabaseClient.mockReset();
  });

  it("reuses an existing review run on prompt-hash uniqueness collisions", async () => {
    const insertQuery = createInsertQuery({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const selectQuery = createSelectQuery({
      data: {
        id: "run-1",
        organization_id: "org-1",
        container_type: "supplier_invoice_allocation",
        scope_key: "organization",
        review_month: "2026-05-01",
        run_type: "monthly",
        run_status: "failed",
        prompt_hash: "hash-1",
      },
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(selectQuery);
    createAdminSupabaseClient.mockReturnValue({ from });

    const { createUniversalLearningReviewRun } = await import("./review-runs");
    const row = await createUniversalLearningReviewRun({
      organizationId: "org-1",
      containerType: "supplier_invoice_allocation",
      reviewMonth: "2026-05",
      runType: "monthly",
      scopeKey: "organization",
      promptHash: "hash-1",
      promptVersion: "ucl-v1",
      previousCursor: { updatedAt: null, id: null },
    });

    expect(row.id).toBe("run-1");
    expect(selectQuery.eq).toHaveBeenCalledWith("prompt_hash", "hash-1");
    expect(selectQuery.eq).toHaveBeenCalledWith("review_month", "2026-05-01");
  });

  it("throws normal insert errors", async () => {
    const insertQuery = createInsertQuery({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    createAdminSupabaseClient.mockReturnValue({ from: vi.fn(() => insertQuery) });

    const { createUniversalLearningReviewRun } = await import("./review-runs");
    await expect(createUniversalLearningReviewRun({
      organizationId: "org-1",
      containerType: "project_claim",
      reviewMonth: "2026-05",
      runType: "monthly",
      scopeKey: "organization",
      promptHash: "hash-1",
      promptVersion: "ucl-v1",
      previousCursor: { updatedAt: null, id: null },
    })).rejects.toThrow("permission denied");
  });

  it("stores composite cursor identities in review run history", async () => {
    const insertQuery = createInsertQuery({
      data: {
        id: "run-2",
        organization_id: "org-1",
        container_type: "project_quote",
        scope_key: "organization",
        review_month: "2026-06-01",
        run_type: "manual",
        run_status: "pending",
        prompt_hash: "hash-2",
      },
      error: null,
    });
    createAdminSupabaseClient.mockReturnValue({ from: vi.fn(() => insertQuery) });

    const { createUniversalLearningReviewRun } = await import("./review-runs");
    await createUniversalLearningReviewRun({
      organizationId: "org-1",
      containerType: "project_quote",
      reviewMonth: "2026-06",
      runType: "manual",
      scopeKey: "organization",
      promptHash: "hash-2",
      promptVersion: "ucl_response_v2",
      previousCursor: {
        updatedAt: "2026-06-25T01:02:03.000Z",
        id: "opportunity_quotes:5131d8a6-fbb5-401a-ba2e-dca21dd9f8d2",
      },
    });

    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      previous_cursor_id: "opportunity_quotes:5131d8a6-fbb5-401a-ba2e-dca21dd9f8d2",
    }));
  });
});
