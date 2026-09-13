import { beforeEach, describe, expect, it, vi } from "vitest";

const completeXeroOAuthCallback = vi.fn();
const getCurrentXeroCallbackUserId = vi.fn();
const recordXeroOAuthCallbackFailure = vi.fn();
const enqueueOrganizationXeroSync = vi.fn();

class XeroOAuthFlowError extends Error {
  constructor(public code: string, public correlationId: string) {
    super(code);
  }
}

vi.mock("@/lib/xero/service", () => ({
  completeXeroOAuthCallback,
  getCurrentXeroCallbackUserId,
  recordXeroOAuthCallbackFailure,
  XeroOAuthFlowError,
}));

vi.mock("@/lib/xero/sync", () => ({
  enqueueOrganizationXeroSync,
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
      "error_code=xero_callback_session_missing",
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
      correlationId: "correlation-1",
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
      "message=Xero+authorization+completed.+Select+the+tenant+to+finish+setup.",
    );
    expect(response.headers.get("location")).toContain("correlation_id=correlation-1");
    expect(response.headers.get("location")).not.toContain("NEXT_REDIRECT");
  });

  it("records access denial without exchanging tokens", async () => {
    getCurrentXeroCallbackUserId.mockResolvedValue("user-1");
    recordXeroOAuthCallbackFailure.mockResolvedValue({ correlationId: "correlation-2" });

    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/integrations/xero/callback?error=access_denied&state=def",
    ));

    expect(recordXeroOAuthCallbackFailure).toHaveBeenCalledWith({
      state: "def",
      currentUserId: "user-1",
      code: "xero_callback_access_denied",
    });
    expect(completeXeroOAuthCallback).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("error_code=xero_callback_access_denied");
  });

  it("queues only reference jobs after a one-tenant callback", async () => {
    getCurrentXeroCallbackUserId.mockResolvedValue("user-1");
    completeXeroOAuthCallback.mockResolvedValue({
      organizationId: "org-1",
      connection: { id: "conn-1", connected_by_user_id: "user-1" },
      autoSelectedTenant: { tenantId: "tenant-1" },
      correlationId: "correlation-3",
    });
    enqueueOrganizationXeroSync.mockResolvedValue({ jobs: [], createdCount: 4 });

    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/integrations/xero/callback?code=abc&state=def",
    ));

    expect(enqueueOrganizationXeroSync).toHaveBeenCalledWith({
      organizationId: "org-1",
      connectionId: "conn-1",
      createdByUserId: "user-1",
      triggerSource: "oauth_callback",
      includeHealthCheck: true,
      includeContacts: true,
    });
    expect(response.headers.get("location")).toContain("queued+for+background+refresh");
    expect(response.headers.get("location")).toContain("correlation_id=correlation-3");
    expect(response.headers.get("location")).not.toContain("NEXT_REDIRECT");
  });

  it("returns only a controlled callback code and correlation reference", async () => {
    getCurrentXeroCallbackUserId.mockResolvedValue("user-1");
    completeXeroOAuthCallback.mockRejectedValue(
      new XeroOAuthFlowError("xero_callback_token_exchange_failed", "correlation-4"),
    );
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/integrations/xero/callback?code=secret-code&state=secret-state",
    ));
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("error_code=xero_callback_token_exchange_failed");
    expect(location).toContain("correlation_id=correlation-4");
    expect(location).not.toContain("secret-code");
    expect(location).not.toContain("secret-state");
  });
});
