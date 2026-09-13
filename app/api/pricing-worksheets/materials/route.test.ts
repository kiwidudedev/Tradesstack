import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getMember, searchMaterials } = vi.hoisted(() => ({
  getMember: vi.fn(),
  searchMaterials: vi.fn(),
}));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: getMember }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({ rpc: vi.fn() })) }));
vi.mock("@/lib/pricing-worksheet-material-picker-server", () => ({ searchPricingWorksheetMaterials: searchMaterials }));

import { GET } from "@/app/api/pricing-worksheets/materials/route";

describe("pricing worksheet Material picker route", () => {
  beforeEach(() => {
    getMember.mockReset();
    searchMaterials.mockReset();
  });

  it("rejects unauthenticated requests before querying Materials", async () => {
    getMember.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/pricing-worksheets/materials?workbookId=workbook-1"));
    expect(response.status).toBe(401);
    expect(searchMaterials).not.toHaveBeenCalled();
  });

  it("does not accept an organization id and delegates workbook-derived scope", async () => {
    getMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    searchMaterials.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false, evaluatedAt: "2026-08-16T00:00:00.000Z" });
    const response = await GET(new Request("http://localhost/api/pricing-worksheets/materials?workbookId=workbook-1&organizationId=forged-org&search=stud"));
    expect(response.status).toBe(200);
    expect(searchMaterials).toHaveBeenCalledWith(expect.objectContaining({ workbookId: "workbook-1", search: "stud" }));
    expect(searchMaterials.mock.calls[0][0]).not.toHaveProperty("organizationId");
  });

  it.each(["", " ", "a"])("keeps insufficient search %j a successful empty-page contract", async (search) => {
    getMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    const emptyPage = { items: [], page: 1, pageSize: 20, total: 0, hasMore: false, evaluatedAt: "2026-08-16T00:00:00.000Z" };
    searchMaterials.mockResolvedValue(emptyPage);

    const response = await GET(new Request(`http://localhost/api/pricing-worksheets/materials?workbookId=workbook-1&search=${encodeURIComponent(search)}&page=3`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(emptyPage);
    expect(searchMaterials).toHaveBeenCalledWith(expect.objectContaining({ search }));
  });

  it("maps permission and workbook-scope failures to forbidden", async () => {
    getMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    searchMaterials.mockRejectedValue(new Error("pricing_material_picker:materials_view_permission_required"));
    const response = await GET(new Request("http://localhost/api/pricing-worksheets/materials?workbookId=workbook-1"));
    expect(response.status).toBe(403);
  });
});
