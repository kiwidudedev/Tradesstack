import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { auth: { getUser: vi.fn() } },
  guard: vi.fn(),
  release: vi.fn(),
  createDocumentDownload: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => mocks.client),
}));
vi.mock("@/lib/security/abuse-guard", () => ({
  enforceDocumentDownloadGuard: mocks.guard,
}));
vi.mock("@/lib/documents/server", () => ({
  createDocumentDownload: mocks.createDocumentDownload,
}));

import { POST } from "./route";

const nodeId = "e2000000-0000-4000-8000-000000000003";

describe("document download route performance boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.release.mockResolvedValue(undefined);
    mocks.guard.mockImplementation(async ({ onTiming }) => {
      onTiming?.("guard-rpc", 3);
      onTiming?.("ip-rate-limit", 0.2);
      onTiming?.("user-rate-limit", 0.2);
      onTiming?.("concurrency-acquire", 0.2);
      return { ok: true, release: mocks.release };
    });
    mocks.createDocumentDownload.mockImplementation(async ({ onTiming }) => {
      onTiming?.("authorization", 1);
      onTiming?.("signed-url", 2);
      return { url: "http://storage.local/signed", expiresInSeconds: 60 };
    });
  });

  afterEach(() => {
    delete process.env.DOCUMENT_DOWNLOAD_TIMING;
    vi.restoreAllMocks();
  });

  it("uses the consolidated guard and still awaits release", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ nodeId }),
    });
    expect(response.status).toBe(200);
    expect(mocks.guard).toHaveBeenCalledTimes(1);
    expect(mocks.createDocumentDownload).toHaveBeenCalledWith(expect.objectContaining({
      supabase: mocks.client,
      nodeId,
    }));
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("emits safe component timing only when enabled", async () => {
    process.env.DOCUMENT_DOWNLOAD_TIMING = "1";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ nodeId }),
    });
    const timing = response.headers.get("server-timing");
    expect(timing).toContain("auth;dur=");
    expect(timing).toContain("guard-rpc;dur=3.0");
    expect(timing).toContain("authorization;dur=1.0");
    expect(timing).toContain("signed-url;dur=2.0");
    expect(timing).toContain("release;dur=");
    expect(timing).not.toContain("storage.local");
  });
});
