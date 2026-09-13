import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentOrganizationMember = vi.fn();
const hasOrganizationPermission = vi.fn();
const createXeroAuthorizationAttempt = vi.fn();

class XeroOAuthFlowError extends Error {
  constructor(public code: string, public correlationId: string) {
    super(code);
  }
}

vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission }));
vi.mock("@/lib/xero/service", () => ({
  createXeroAuthorizationAttempt,
  XeroOAuthFlowError,
}));

describe("GET /api/integrations/xero/connect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });
    hasOrganizationPermission.mockResolvedValue(true);
  });

  it("redirects to the authorization URL after durable attempt creation", async () => {
    createXeroAuthorizationAttempt.mockResolvedValue({
      authorizeUrl: "https://login.xero.example/authorize",
      attemptId: "attempt-1",
      correlationId: "correlation-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/integrations/xero/connect"));

    expect(createXeroAuthorizationAttempt).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(response.headers.get("location")).toBe("https://login.xero.example/authorize");
  });

  it("redirects unauthenticated requests to sign in without creating an attempt", async () => {
    getCurrentOrganizationMember.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/integrations/xero/connect"));
    expect(response.headers.get("location")).toBe("http://localhost/sign-in");
    expect(createXeroAuthorizationAttempt).not.toHaveBeenCalled();
  });

  it("returns a safe permission error", async () => {
    hasOrganizationPermission.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/integrations/xero/connect"));
    expect(response.headers.get("location")).toContain("error_code=xero_connect_not_authorized");
    expect(createXeroAuthorizationAttempt).not.toHaveBeenCalled();
  });

  it("returns the controlled service failure and correlation ID", async () => {
    createXeroAuthorizationAttempt.mockRejectedValue(
      new XeroOAuthFlowError("xero_connect_configuration_error", "correlation-2"),
    );
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/integrations/xero/connect"));
    expect(response.headers.get("location")).toContain("error_code=xero_connect_configuration_error");
    expect(response.headers.get("location")).toContain("correlation_id=correlation-2");
  });
});
