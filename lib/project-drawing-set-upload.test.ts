import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseEnv } = vi.hoisted(() => ({
  getSupabaseEnv: vi.fn(() => ({ url: "https://alpha.supabase.co", anonKey: "anon" })),
}));

vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv }));
vi.mock("tus-js-client", () => ({
  Upload: class {
    constructor(_file: File, options: { onSuccess: () => void; onProgress: (sent: number, total: number) => void }) {
      this.options = options;
    }

    options: { onSuccess: () => void; onProgress: (sent: number, total: number) => void };

    findPreviousUploads() {
      return Promise.resolve([]);
    }

    start() {
      this.options.onProgress(1, 1);
      this.options.onSuccess();
    }
  },
}));

describe("uploadSourceDrawingSetToProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers a committed row when the insert response is ambiguous", async () => {
    const recoveredRow = { id: "drawing-1", storage_path: "org/project/object.pdf" };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error("response lost") }),
    };
    const recoveryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: recoveredRow, error: null }),
    };
    const remove = vi.fn();
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "token" } }, error: null }),
      },
      from: vi.fn()
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(recoveryChain),
      storage: { from: vi.fn(() => ({ remove })) },
    } as never;

    const { uploadSourceDrawingSetToProject } = await import("@/lib/project-drawing-set-upload");
    const result = await uploadSourceDrawingSetToProject({
      supabase,
      organizationId: "org",
      projectId: "project",
      file: new File(["pdf"], "object.pdf", { type: "application/pdf" }),
    });

    expect(result).toBe(recoveredRow);
    expect(recoveryChain.maybeSingle).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });
});
