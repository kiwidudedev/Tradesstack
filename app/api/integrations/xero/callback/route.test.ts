import { beforeEach, describe, expect, it, vi } from "vitest";

const completeXeroOAuthCallback = vi.fn();
const getCurrentXeroCallbackUserId = vi.fn();
const enqueueOrganizationXeroSync = vi.fn();
const runXeroSyncWorker = vi.fn();

vi.mock("@/lib/xero/service", () => ({
  completeXeroOAuthCallback,
  getCurrentXeroCallbackUserId,
}));

vi.mock("@/lib/xero/sync", () => ({
  enqueueOrganizationXeroSync,
  runXeroSyncWorker,
}));

describe("GET /api/integrations/xero/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires a signed-in user before completing the callback", async () => {
    getCurrentXeroCallbackUserId.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/integrations/xero/callback?code=abc&state=def"),
    );

    expect(completeXeroOAuthCallback).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "error=Sign+in+again+before+completing+the+Xero+connection.",
    );
  });

  it("binds the callback completion to the current signed-in user", async () => {
    getCurrentXeroCallbackUserId.mockResolvedValue("user-1");
    completeXeroOAuthCallback.mockResolvedValue({
      organizationId: "org-1",
      redirectPath: "/app/settings/integrations",
      connection: {
        id: "conn-1",
        connected_by_user_id: "user-1",
      },
      autoSelectedTenant: null,
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/integrations/xero/callback?code=abc&state=def"),
    );

    expect(completeXeroOAuthCallback).toHaveBeenCalledWith({
      code: "abc",
      state: "def",
      currentUserId: "user-1",
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "message=Xero+connected.+Select+the+tenant+to+finish+setup.",
    );
  });
});
