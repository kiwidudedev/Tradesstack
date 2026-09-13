import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, rpc, createServerSupabaseClient } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

import { createDocumentFolderAction } from "@/lib/documents/workspace-actions";

describe("shared document workspace actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: null, error: null });
    createServerSupabaseClient.mockResolvedValue({ rpc });
  });

  it("revalidates only the Project Files route for a Project mutation", async () => {
    await expect(createDocumentFolderAction({
      entity: {
        kind: "project",
        id: "e2000000-0000-4000-8000-000000000001",
        slug: "metro-project",
      },
      workspaceId: "e2000000-0000-4000-8000-000000000002",
      parentNodeId: null,
      displayName: "Plans",
    })).resolves.toEqual({ ok: true });

    expect(revalidatePath).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith(
      "/app/projects/metro-project/files",
    );
    expect(revalidatePath).not.toHaveBeenCalledWith(
      expect.stringContaining("opportunities"),
    );
  });
});
