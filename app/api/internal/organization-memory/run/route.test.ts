import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runOrganizationMemoryDerivation = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/organization-memory-server", () => ({
  runOrganizationMemoryDerivation,
}));

describe("POST /api/internal/organization-memory/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/organization-memory/run", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden.",
    });
    expect(runOrganizationMemoryDerivation).not.toHaveBeenCalled();
  });

  it("keeps legacy worksheet derivation disabled by default", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runOrganizationMemoryDerivation.mockResolvedValue({
      ok: true,
      legacyWorksheetMemoryDerivationEnabled: false,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/organization-memory/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org-1",
          patternLimit: 250,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(runOrganizationMemoryDerivation).toHaveBeenCalledWith({
      organizationId: "org-1",
      patternLimit: 250,
      includeLegacyWorksheetMemoryDerivation: undefined,
    });
  });

  it("passes the explicit legacy flag only when requested", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runOrganizationMemoryDerivation.mockResolvedValue({
      ok: true,
      legacyWorksheetMemoryDerivationEnabled: true,
    });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/internal/organization-memory/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org-1",
          patternLimit: 250,
          includeLegacyWorksheetMemoryDerivation: true,
        }),
      }),
    );

    expect(runOrganizationMemoryDerivation).toHaveBeenCalledWith({
      organizationId: "org-1",
      patternLimit: 250,
      includeLegacyWorksheetMemoryDerivation: true,
    });
  });
});
