import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getMember, searchMeasures } = vi.hoisted(() => ({ getMember: vi.fn(), searchMeasures: vi.fn() }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: getMember }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/pricing-worksheet-measure-picker-server", () => ({ searchPricingWorksheetMeasures: searchMeasures }));

import { GET } from "@/app/api/pricing-worksheets/measures/route";

describe("pricing worksheet Measures route", () => {
  beforeEach(() => { getMember.mockReset(); searchMeasures.mockReset(); });

  it("rejects unauthenticated requests before querying Takeoff", async () => {
    getMember.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/pricing-worksheets/measures?workbookId=workbook-1"));
    expect(response.status).toBe(401);
    expect(searchMeasures).not.toHaveBeenCalled();
  });

  it("ignores client scope claims and delegates organization scope from membership", async () => {
    getMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    searchMeasures.mockResolvedValue({ items: [], page: 1, pageSize: 30, total: 0, hasMore: false, workspaceStatus: "ready" });
    const response = await GET(new Request("http://localhost/api/pricing-worksheets/measures?workbookId=workbook-1&organizationId=forged&projectId=forged"));
    expect(response.status).toBe(200);
    expect(searchMeasures).toHaveBeenCalledWith(expect.objectContaining({ workbookId: "workbook-1", organizationId: "org-1" }));
    expect(searchMeasures.mock.calls[0][0]).not.toHaveProperty("projectId");
  });

  it("maps invalid workbook/project scopes to forbidden", async () => {
    getMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    searchMeasures.mockRejectedValue(new Error("pricing_measure_picker:invalid_project_scope"));
    const response = await GET(new Request("http://localhost/api/pricing-worksheets/measures?workbookId=workbook-1"));
    expect(response.status).toBe(403);
  });
});
