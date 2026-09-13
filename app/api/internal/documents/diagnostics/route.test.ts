import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, rpc, createServerSupabaseClient } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

import { GET } from "@/app/api/internal/documents/diagnostics/route";

const WORKSPACE_ID = "e6000000-0000-4000-8000-000000000010";

describe("document diagnostics endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser },
      rpc,
    });
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValue({
      data: {
        pendingUploads: 2,
        deadLetterJobs: 0,
        usedBytes: 100,
        quotaBytes: 1000,
      },
      error: null,
    });
  });

  it("requires authentication and a valid workspace identifier", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const unauthorized = await GET(new Request(
      `http://localhost/api/internal/documents/diagnostics?workspaceId=${WORKSPACE_ID}`,
    ));
    expect(unauthorized.status).toBe(401);

    const invalid = await GET(new Request(
      "http://localhost/api/internal/documents/diagnostics?workspaceId=forged",
    ));
    expect(invalid.status).toBe(400);
  });

  it("returns only the database-authorized aggregate", async () => {
    const response = await GET(new Request(
      `http://localhost/api/internal/documents/diagnostics?workspaceId=${WORKSPACE_ID}`,
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pendingUploads: 2,
      deadLetterJobs: 0,
      usedBytes: 100,
      quotaBytes: 1000,
    });
    expect(rpc).toHaveBeenCalledWith("get_document_storage_diagnostics", {
      p_workspace_id: WORKSPACE_ID,
    });
  });

  it("maps non-monitor access to a generic denial", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Document workspace not found or access denied." },
    });
    const response = await GET(new Request(
      `http://localhost/api/internal/documents/diagnostics?workspaceId=${WORKSPACE_ID}`,
    ));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Document diagnostics are unavailable or access was denied.",
    });
  });
});
