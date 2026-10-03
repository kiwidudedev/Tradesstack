import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLIENT_SCHEDULER_JOB_DEFINITIONS,
  buildClientSchedulerInvocation,
  invokeClientSchedulerJob,
  parseClientDispatcherRequest,
  schedulerJobIsEnabled,
} from "./client-dispatcher";

describe("client scheduler dispatcher contract", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes a static allowlist and excludes the Takeoff token boundary", () => {
    expect(CLIENT_SCHEDULER_JOB_DEFINITIONS["document-storage-cleanup"]).toMatchObject({
      path: "/api/cron/document-storage-cleanup/run",
      method: "GET",
    });
    expect("takeoff-render-jobs" in CLIENT_SCHEDULER_JOB_DEFINITIONS).toBe(false);
    expect(Object.keys(CLIENT_SCHEDULER_JOB_DEFINITIONS)).not.toContain("xero-sync");
  });

  it("accepts provider-neutral GET and POST scheduler envelopes", async () => {
    const getRequest = await parseClientDispatcherRequest(new Request(
      "https://alpha.example/api/cron/dispatch?job=document-storage-cleanup",
      { method: "GET", headers: { "x-tradesstack-dispatch-id": "dispatch-1" } },
    ));
    expect(getRequest).toEqual({ job: "document-storage-cleanup", dispatchId: "dispatch-1" });

    const postRequest = await parseClientDispatcherRequest(new Request(
      "https://alpha.example/api/cron/dispatch",
      {
        method: "POST",
        body: JSON.stringify({ job: "retention-rolling-drafts", dispatchId: "dispatch-2" }),
        headers: { "content-type": "application/json" },
      },
    ));
    expect(postRequest).toEqual({ job: "retention-rolling-drafts", dispatchId: "dispatch-2" });
  });

  it("rejects arbitrary jobs and malformed JSON", async () => {
    await expect(parseClientDispatcherRequest(new Request(
      "https://alpha.example/api/cron/dispatch?job=../takeoff/render-jobs/run",
    ))).resolves.toEqual({ error: "Unsupported scheduler job.", status: 404 });

    await expect(parseClientDispatcherRequest(new Request(
      "https://alpha.example/api/cron/dispatch",
      { method: "POST", body: "not-json", headers: { "content-type": "application/json" } },
    ))).resolves.toEqual({ error: "Request body must be valid JSON.", status: 400 });
  });

  it("uses the existing background-job enablement gate", () => {
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "retention-rolling-drafts");
    expect(schedulerJobIsEnabled("retention-rolling-drafts")).toBe(true);
    expect(schedulerJobIsEnabled("document-storage-cleanup")).toBe(false);
  });

  it("invokes one bounded target with the existing secret and dispatch identity", async () => {
    const invocation = buildClientSchedulerInvocation({
      origin: "https://alpha.example",
      secret: "synthetic-cron-secret",
      request: { job: "retention-rolling-drafts", dispatchId: "dispatch-3" },
    });
    expect(String(invocation.url)).toBe("https://alpha.example/api/cron/retention-rolling-drafts/run");
    expect(invocation.init.method).toBe("GET");

    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ completedCount: 1 }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const result = await invokeClientSchedulerJob({
      origin: "https://alpha.example",
      secret: "synthetic-cron-secret",
      request: { job: "retention-rolling-drafts", dispatchId: "dispatch-3" },
      fetcher,
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      job: "retention-rolling-drafts",
      dispatchId: "dispatch-3",
      targetStatus: 200,
      skipped: false,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [target, init] = fetcher.mock.calls[0];
    expect(String(target)).toBe("https://alpha.example/api/cron/retention-rolling-drafts/run");
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        authorization: "Bearer synthetic-cron-secret",
        "x-tradesstack-dispatch-id": "dispatch-3",
        "x-tradesstack-dispatch-job": "retention-rolling-drafts",
      },
    });
  });

  it("turns target failures into scheduler failures without forwarding target data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: "internal database detail must not escape" }),
      { status: 500, headers: { "content-type": "application/json" } },
    ));
    await expect(invokeClientSchedulerJob({
      origin: "https://alpha.example",
      secret: "synthetic-cron-secret",
      request: { job: "document-storage-cleanup", dispatchId: "dispatch-4" },
      fetcher,
    })).resolves.toEqual({
      ok: false,
      status: 502,
      job: "document-storage-cleanup",
      dispatchId: "dispatch-4",
      error: "Scheduled job target failed.",
    });
  });
});
