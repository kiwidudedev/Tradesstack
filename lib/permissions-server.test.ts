import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
const redirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

vi.mock("server-only", () => ({}));

describe("permissions server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns false for platform admin checks when no authenticated user is present", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      rpc: vi.fn(),
    });

    const { hasPlatformAdminRole, isPlatformAdmin } = await import("./permissions-server");

    await expect(hasPlatformAdminRole("admin")).resolves.toBe(false);
    await expect(isPlatformAdmin()).resolves.toBe(false);
  });

  it("returns false when auth lookup fails before platform admin RPC", async () => {
    const rpc = vi.fn();
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "auth failed" },
        }),
      },
      rpc,
    });

    const { hasPlatformAdminRole } = await import("./permissions-server");
    await expect(hasPlatformAdminRole("admin")).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("delegates to the platform admin RPC only for authenticated users", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: true,
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      rpc,
    });

    const { hasPlatformAdminRole } = await import("./permissions-server");
    await expect(hasPlatformAdminRole("admin")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("has_platform_admin_role", {
      required_role: "admin",
    });
  });

  it("loads multiple organisation permissions in one RPC and preserves results", async () => {
    const projects = await import("@/lib/projects-server");
    vi.mocked(projects.getCurrentOrganizationMember).mockResolvedValue({
      organization_id: "org-1",
    } as never);
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { permission_key: "accounting.sales_invoices.manage", is_allowed: true },
        { permission_key: "accounting.sales_invoices.view", is_allowed: false },
      ],
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({ rpc });

    const { getOrganizationPermissionsBatch } = await import("./permissions-server");
    await expect(getOrganizationPermissionsBatch({
      organizationId: "org-1",
      permissions: [
        "accounting.sales_invoices.view",
        "accounting.sales_invoices.manage",
        "accounting.sales_invoices.view",
      ],
    })).resolves.toEqual({
      "accounting.sales_invoices.manage": true,
      "accounting.sales_invoices.view": false,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "get_organization_permissions_batch",
      {
        p_organization_id: "org-1",
        p_permission_keys: [
          "accounting.sales_invoices.manage",
          "accounting.sales_invoices.view",
        ],
      },
    );
  });

  it("resolves the legacy permission entry point against the current organization", async () => {
    const projects = await import("@/lib/projects-server");
    vi.mocked(projects.getCurrentOrganizationMember).mockResolvedValue({
      organization_id: "org-1",
    } as never);
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    createServerSupabaseClient.mockResolvedValue({ rpc });

    const { hasPermission } = await import("./permissions-server");

    await expect(hasPermission("leads.clients.write")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("has_org_permission", {
      p_organization_id: "org-1",
      p_permission_key: "leads.clients.write",
    });
    expect(rpc).not.toHaveBeenCalledWith("has_permission", expect.anything());
  });

  it("preserves denied organization-scoped permissions", async () => {
    const projects = await import("@/lib/projects-server");
    vi.mocked(projects.getCurrentOrganizationMember).mockResolvedValue({
      organization_id: "org-1",
    } as never);
    createServerSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    });

    const { hasPermission } = await import("./permissions-server");

    await expect(hasPermission("leads.clients.write")).resolves.toBe(false);
  });
});
