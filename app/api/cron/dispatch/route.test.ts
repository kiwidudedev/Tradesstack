import { beforeEach, describe, expect, it, vi } from "vitest";

describe("client scheduler dispatch route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "retention-rolling-drafts");
  });

  it("rejects missing and invalid scheduler secrets before parsing jobs", async () => {
    const { GET } = await import("./route");
    const missing = await GET(new Request("https://alpha.example/api/cron/dispatch?job=retention-rolling-drafts"));
    expect(missing.status).toBe(401);

    const wrong = await GET(new Request("https://alpha.example/api/cron/dispatch?job=retention-rolling-drafts", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(wrong.status).toBe(401);
  });

  it("fails closed when the scheduler secret is absent", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("./route");
    const response = await GET(new Request("https://alpha.example/api/cron/dispatch?job=retention-rolling-drafts"));
    expect(response.status).toBe(500);
  });

  it("rejects an unallowlisted job without invoking a target", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("./route");
    const response = await GET(new Request("https://alpha.example/api/cron/dispatch?job=takeoff-render-jobs", {
      headers: { authorization: "Bearer synthetic-cron-secret" },
    }));
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });

  it("returns a safe skip when the selected background job is disabled", async () => {
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "");
    const fetcher = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("./route");
    const response = await GET(new Request("https://alpha.example/api/cron/dispatch?job=retention-rolling-drafts", {
      headers: { authorization: "Bearer synthetic-cron-secret" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ skipped: true, job: "retention-rolling-drafts" });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });

  it("forwards one enabled job to its static target and returns only safe status metadata", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ completedCount: 2, internal: "not-forwarded" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "https://alpha.example/api/cron/dispatch?job=retention-rolling-drafts",
      {
        headers: {
          authorization: "Bearer synthetic-cron-secret",
          "x-tradesstack-dispatch-id": "dispatch-route-1",
        },
      },
    ));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: 200,
      job: "retention-rolling-drafts",
      dispatchId: "dispatch-route-1",
      targetStatus: 200,
      skipped: false,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0][0])).toBe("https://alpha.example/api/cron/retention-rolling-drafts/run");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({
        authorization: "Bearer synthetic-cron-secret",
        "x-tradesstack-dispatch-id": "dispatch-route-1",
      }),
    });
    fetcher.mockRestore();
  });

  it("propagates a target failure as a scheduler failure without leaking target details", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ error: "private database detail" }),
      { status: 500, headers: { "content-type": "application/json" } },
    ));
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "https://alpha.example/api/cron/dispatch?job=retention-rolling-drafts",
      { headers: { authorization: "Bearer synthetic-cron-secret" } },
    ));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      status: 502,
      job: "retention-rolling-drafts",
      dispatchId: expect.any(String),
      error: "Scheduled job target failed.",
    });
    fetcher.mockRestore();
  });
});
