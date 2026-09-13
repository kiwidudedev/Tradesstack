import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getMember: vi.fn(),
  hasPermission: vi.fn(),
  search: vi.fn(),
}));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocks.getMember }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: mocks.hasPermission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({ rpc: vi.fn() })) }));
vi.mock("@/lib/pricing-worksheet-material-picker-server", () => ({ searchOrganizationMaterials: mocks.search }));

import { GET } from "@/app/api/materials/supplier-pricing/route";

describe("organization supplier pricing route", () => {
  beforeEach(() => {
    mocks.getMember.mockReset();
    mocks.hasPermission.mockReset();
    mocks.search.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getMember.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/materials/supplier-pricing?search=gib"));
    expect(response.status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("requires materials.view before searching", async () => {
    mocks.getMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    mocks.hasPermission.mockResolvedValue(false);
    const response = await GET(new Request("http://localhost/api/materials/supplier-pricing?search=gib"));
    expect(response.status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("derives organization scope from membership and ignores spoofed client scope", async () => {
    mocks.getMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    mocks.hasPermission.mockResolvedValue(true);
    mocks.search.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false, evaluatedAt: "2026-08-27T00:00:00.000Z" });
    const response = await GET(new Request("http://localhost/api/materials/supplier-pricing?organizationId=org-2&search=gib&page=2"));
    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", search: "gib", page: 2 }));
  });
});
