import { beforeEach, describe, expect, it, vi } from "vitest";

const processNextTakeoffRenderJob = vi.fn();

vi.mock("@/lib/takeoff-server", () => ({
  processNextTakeoffRenderJob,
}));

describe("takeoff render worker route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
    vi.stubEnv("TAKEOFF_RENDER_WORKER_TOKEN", "synthetic-worker-token");
    processNextTakeoffRenderJob.mockResolvedValue({ job: null, pagesRendered: 0 });
  });

  it("rejects unauthenticated and browser-authenticated requests without the worker token", async () => {
    const { POST } = await import("./route");

    const missing = await POST(new Request("http://localhost/api/takeoff/render-jobs/run", { method: "POST" }));
    expect(missing.status).toBe(401);

    const wrong = await POST(new Request("http://localhost/api/takeoff/render-jobs/run", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token", cookie: "sb-session=synthetic-user-session" },
    }));
    expect(wrong.status).toBe(401);
    expect(processNextTakeoffRenderJob).not.toHaveBeenCalled();
  });

  it("allows only the dedicated worker token to process jobs", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/takeoff/render-jobs/run?limit=1", {
      method: "POST",
      headers: { authorization: "Bearer synthetic-worker-token" },
    }));

    expect(response.status).toBe(200);
    expect(processNextTakeoffRenderJob).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ ok: true, processedCount: 0, status: "idle" });
  });
});
