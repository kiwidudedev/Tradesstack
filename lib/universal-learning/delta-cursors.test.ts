import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

describe("Universal Construction Learning delta cursors", () => {
  beforeEach(() => {
    createAdminSupabaseClient.mockReset();
  });

  it("reads composite multi-source cursor identities unchanged", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        last_cursor_updated_at: "2026-06-25T01:02:03.000Z",
        last_cursor_id: "opportunity_quotes:5131d8a6-fbb5-401a-ba2e-dca21dd9f8d2",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ eq, maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    createAdminSupabaseClient.mockReturnValue({ from });

    const { getUniversalLearningCursor } = await import("./delta-cursors");
    const cursor = await getUniversalLearningCursor({
      organizationId: "org-1",
      containerType: "project_quote",
      scopeKey: "organization",
    });

    expect(cursor).toEqual({
      updatedAt: "2026-06-25T01:02:03.000Z",
      id: "opportunity_quotes:5131d8a6-fbb5-401a-ba2e-dca21dd9f8d2",
    });
  });

  it("persists composite multi-source cursor identities unchanged", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    createAdminSupabaseClient.mockReturnValue({ from });

    const { advanceUniversalLearningCursor } = await import("./delta-cursors");
    await advanceUniversalLearningCursor({
      selection: {
        organizationId: "org-1",
        containerType: "project_quote",
        scopeKey: "organization",
        reviewMonth: "2026-06",
      },
      reviewRunId: "run-1",
      nextCursor: {
        updatedAt: "2026-06-25T01:02:03.000Z",
        id: "project_quotes:8e654c4f-fc00-4a96-8d9c-f3d4c7b2ce8c",
      },
      selectedRecordCount: 4,
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      last_cursor_id: "project_quotes:8e654c4f-fc00-4a96-8d9c-f3d4c7b2ce8c",
    }), {
      onConflict: "organization_id,container_type,scope_key",
    });
  });
});
