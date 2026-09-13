import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDocumentFolders: vi.fn(),
  client: { auth: { getUser: vi.fn() } },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => mocks.client),
}));
vi.mock("@/lib/documents/workspace-server", () => ({
  listDocumentFolders: mocks.listDocumentFolders,
}));

import { GET } from "./route";

const workspaceId = "e2000000-0000-4000-8000-000000000002";

describe("Move destination folder endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("requires an authenticated user before listing folders", async () => {
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(response.status).toBe(401);
    expect(mocks.listDocumentFolders).not.toHaveBeenCalled();
  });

  it("returns the RPC-authorized destination list without caching it", async () => {
    const folders = [{ nodeId: "folder-1", parentNodeId: null, displayName: "Plans" }];
    mocks.listDocumentFolders.mockResolvedValue(folders);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ folders });
    expect(mocks.listDocumentFolders).toHaveBeenCalledTimes(1);
    expect(mocks.listDocumentFolders).toHaveBeenCalledWith(mocks.client, workspaceId);
  });
});
