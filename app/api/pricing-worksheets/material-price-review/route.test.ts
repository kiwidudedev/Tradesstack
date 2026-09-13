import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getMember, reviewPrices } = vi.hoisted(() => ({ getMember: vi.fn(), reviewPrices: vi.fn() }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: getMember }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({ rpc: vi.fn() })) }));
vi.mock("@/lib/pricing-worksheet-material-price-review-server", () => ({ reviewPricingWorksheetMaterialPrices: reviewPrices }));

import { POST } from "@/app/api/pricing-worksheets/material-price-review/route";

const workbookId = "77777777-7777-4777-8777-777777777777";
const empty = { items: [], summary: { priceUpdates: 0, needsReview: 0, current: 0, versionChangedSameTerms: 0 }, page: 1, pageSize: 20, total: 0, hasMore: false, evaluatedAt: "2026-08-16T00:00:00.000Z" };

describe("Material price review route", () => {
  beforeEach(() => { getMember.mockReset(); reviewPrices.mockReset(); });

  it("rejects unauthenticated and malformed requests", async () => {
    getMember.mockResolvedValue(null);
    expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ workbookId }) }))).status).toBe(401);
    getMember.mockResolvedValue({ organization_id: "org", user_id: "user" });
    expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ workbookId: "bad" }) }))).status).toBe(400);
  });

  it("ignores client organization scope and delegates the workbook-derived request", async () => {
    getMember.mockResolvedValue({ organization_id: "org", user_id: "user" });
    reviewPrices.mockResolvedValue(empty);
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ workbookId, organizationId: "forged", mode: "review" }) }));
    expect(response.status).toBe(200);
    expect(reviewPrices.mock.calls[0][0].request).not.toHaveProperty("organizationId");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("maps permission and stale-action failures", async () => {
    getMember.mockResolvedValue({ organization_id: "org", user_id: "user" });
    reviewPrices.mockRejectedValueOnce(new Error("pricing_material_review:materials_view_permission_required"));
    expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ workbookId }) }))).status).toBe(403);
    reviewPrices.mockRejectedValueOnce(new Error("pricing_material_review:stale_update"));
    const body = { workbookId, mode: "revalidate", targetBindingId: "66666666-6666-4666-8666-666666666666", expectedCurrentPriceId: "55555555-5555-4555-8555-555555555555" };
    expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }))).status).toBe(409);
  });
});
