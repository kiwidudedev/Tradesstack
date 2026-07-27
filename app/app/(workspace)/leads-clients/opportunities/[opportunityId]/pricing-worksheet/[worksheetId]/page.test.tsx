import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getOpportunityWorkspaceData: vi.fn(),
  registerPage: vi.fn(() => null),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock("@/lib/opportunity-workspace-server", () => ({
  getOpportunityWorkspaceData: mocks.getOpportunityWorkspaceData,
}));

vi.mock("../page", () => ({
  default: mocks.registerPage,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

import OpportunityPricingWorksheetEditorPage from "./page";

describe("pricing worksheet deep route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOpportunityWorkspaceData.mockResolvedValue({
      organizationId: "org-1",
      opportunityId: "opp-db-1",
      slug: "long-bay-apartment",
      name: "Long Bay Apartment",
      clientId: null,
      clientName: "Unassigned",
      ownerUserId: null,
      ownerName: "Unassigned",
      workspaceProjectId: null,
      latestQuoteSummary: null,
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "workbook-legacy-123" },
                  error: null,
                })),
              })),
            })),
          })),
        })),
      })),
    });
  });

  it("aliases the deep worksheet url back to the canonical register page", async () => {
    const element = await OpportunityPricingWorksheetEditorPage({
      params: Promise.resolve({ opportunityId: "long-bay-apartment", worksheetId: "workbook-legacy-123" }),
    });

    expect(element.type).toBe(mocks.registerPage);
    expect(mocks.registerPage).not.toHaveBeenCalled();
  });

  it("resolves the slug-backed route to the database opportunity id before checking workbook access", async () => {
    const eqOpportunityId = vi.fn(() => ({
      is: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { id: "workbook-legacy-123" },
          error: null,
        })),
      })),
    }));
    const eqWorksheetId = vi.fn(() => ({
      eq: eqOpportunityId,
    }));

    mocks.createServerSupabaseClient.mockResolvedValueOnce({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: eqWorksheetId,
        })),
      })),
    });

    await OpportunityPricingWorksheetEditorPage({
      params: Promise.resolve({ opportunityId: "long-bay-apartment", worksheetId: "workbook-legacy-123" }),
    });

    expect(mocks.getOpportunityWorkspaceData).toHaveBeenCalledWith("long-bay-apartment");
    expect(eqOpportunityId).toHaveBeenCalledWith("opportunity_id", "opp-db-1");
  });

  it("keeps existing worksheet urls valid by resolving them through the canonical register page", async () => {
    const element = await OpportunityPricingWorksheetEditorPage({
      params: Promise.resolve({ opportunityId: "long-bay-apartment", worksheetId: "workbook-legacy-123" }),
    });

    expect(element.type).toBe(mocks.registerPage);
    expect(JSON.stringify(element)).not.toContain("StandalonePricingWorksheetBoard");
  });

  it("fails closed when the workbook is archived or missing", async () => {
    mocks.createServerSupabaseClient.mockResolvedValueOnce({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: null,
                  error: null,
                })),
              })),
            })),
          })),
        })),
      })),
    });

    await expect(
      OpportunityPricingWorksheetEditorPage({
        params: Promise.resolve({ opportunityId: "long-bay-apartment", worksheetId: "workbook-archived" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});
