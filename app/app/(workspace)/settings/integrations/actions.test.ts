import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
const revalidatePath = vi.fn();
const getCurrentOrganizationMember = vi.fn();
const hasOrganizationPermission = vi.fn();
const selectOrganizationXeroTenant = vi.fn();
const getOrganizationXeroConnection = vi.fn();
const disconnectOrganizationXero = vi.fn();
const enqueueOrganizationXeroSync = vi.fn();
const runXeroSyncWorker = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission }));
vi.mock("@/lib/xero/service", () => ({
  buildIntegrationRedirect: ({ message, error }: { message?: string; error?: string }) => {
    const query = new URLSearchParams();
    if (message) query.set("message", message);
    if (error) query.set("error", error);
    return `/app/settings/integrations?${query.toString()}`;
  },
  disconnectOrganizationXero,
  getOrganizationXeroConnection,
  selectOrganizationXeroTenant,
}));
vi.mock("@/lib/xero/sync", () => ({
  enqueueOrganizationXeroSync,
  runXeroSyncWorker,
}));

describe("Xero Integrations server actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });
    hasOrganizationPermission.mockResolvedValue(true);
    getOrganizationXeroConnection.mockResolvedValue({ id: "connection-1", status: "connected" });
    redirect.mockImplementation((destination: string) => {
      const error = new Error("NEXT_REDIRECT");
      Object.assign(error, { destination });
      throw error;
    });
  });

  it("preserves the successful already-queued redirect instead of converting it to NEXT_REDIRECT", async () => {
    enqueueOrganizationXeroSync.mockResolvedValue({ createdCount: 0, jobs: [] });
    const { refreshXeroReferenceDataAction } = await import("./actions");

    await expect(refreshXeroReferenceDataAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledTimes(1);
    const destination = String(redirect.mock.calls[0]?.[0]);
    expect(destination).toContain("message=Xero+reference+data+refresh+is+already+queued+or+in+progress.");
    expect(destination).not.toContain("error=NEXT_REDIRECT");
    expect(runXeroSyncWorker).not.toHaveBeenCalled();
  });

  it("maps a genuine reference refresh failure to controlled feedback", async () => {
    enqueueOrganizationXeroSync.mockRejectedValue(new Error("password=secret SQL failed"));
    const { refreshXeroReferenceDataAction } = await import("./actions");

    await expect(refreshXeroReferenceDataAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledTimes(1);
    const destination = String(redirect.mock.calls[0]?.[0]);
    expect(destination).toContain("error=Unable+to+refresh+Xero+reference+data.");
    expect(destination).not.toContain("password");
    expect(destination).not.toContain("SQL");
  });

  it("preserves the contacts already-queued redirect without running a worker", async () => {
    enqueueOrganizationXeroSync.mockResolvedValue({ createdCount: 0, jobs: [] });
    const { refreshXeroContactsAction } = await import("./actions");

    await expect(refreshXeroContactsAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(String(redirect.mock.calls[0]?.[0])).toContain(
      "message=Xero+contact+refresh+is+already+queued+or+in+progress.",
    );
    expect(runXeroSyncWorker).not.toHaveBeenCalled();
  });

  it("redirects once after tenant selection succeeds", async () => {
    selectOrganizationXeroTenant.mockResolvedValue(undefined);
    enqueueOrganizationXeroSync.mockResolvedValue({ createdCount: 4, jobs: [] });
    const { selectXeroTenantAction } = await import("./actions");
    const formData = new FormData();
    formData.set("tenant_id", "tenant-1");

    await expect(selectXeroTenantAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(String(redirect.mock.calls[0]?.[0])).toContain("message=Xero+tenant+selected.");
    expect(revalidatePath).toHaveBeenCalledWith("/app/settings/integrations");
  });

  it("redirects once after a confirmed disconnect succeeds", async () => {
    disconnectOrganizationXero.mockResolvedValue(undefined);
    const { disconnectXeroAction } = await import("./actions");
    const formData = new FormData();
    formData.set("disconnect_confirmation", "disconnect_xero");

    await expect(disconnectXeroAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(String(redirect.mock.calls[0]?.[0])).toContain("message=Xero+disconnected.");
  });
});
