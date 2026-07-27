import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentOrganizationMember,
  createServerSupabaseClient,
} = vi.hoisted(() => ({
  getCurrentOrganizationMember: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

import { resolveWorksheetPurchaseOrderPublishContextForCurrentUser } from "@/lib/commercial-items/worksheet-purchase-order-publish-context-server";

describe("worksheet purchase order publish context server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks pre-award opportunity worksheets before conversion", async () => {
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: { id: "opp-1", converted_project_id: null },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn().mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) }),
    });

    await expect(resolveWorksheetPurchaseOrderPublishContextForCurrentUser({
      owner: {
        ownerType: "opportunity",
        organizationId: "org-1",
        opportunityId: "opp-1",
        opportunitySlug: "opp-1",
        projectId: "workspace-bridge-project",
        projectSlug: "workspace-bridge",
        quoteId: null,
        variationId: null,
      },
    })).rejects.toThrow("Purchase Orders are available after this opportunity is converted to a project.");
  });

  it("resolves the converted project for an opportunity worksheet without using workspace_project_id", async () => {
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: { id: "opp-1", converted_project_id: "project-1" },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });

    const maybeSingleProject = vi.fn().mockResolvedValue({
      data: { id: "project-1", slug: "real-project", source_opportunity_id: "opp-1" },
      error: null,
    });
    const eqProjectId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleProject });
    const eqProjectOrg = vi.fn().mockReturnValue({ eq: eqProjectId });

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqProjectOrg }) });

    createServerSupabaseClient.mockResolvedValue({ from });

    await expect(resolveWorksheetPurchaseOrderPublishContextForCurrentUser({
      owner: {
        ownerType: "opportunity",
        organizationId: "org-1",
        opportunityId: "opp-1",
        opportunitySlug: "opp-1",
        projectId: "workspace-bridge-project",
        projectSlug: "workspace-bridge",
        quoteId: null,
        variationId: null,
      },
    })).resolves.toEqual({
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      projectSlug: "real-project",
      ownerType: "opportunity",
    });

    expect(eqProjectId).toHaveBeenCalledWith("id", "project-1");
  });

  it("resolves variation worksheet context directly from the real project", async () => {
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });

    const maybeSingleProject = vi.fn().mockResolvedValue({
      data: { id: "project-9", slug: "airport-fitout", source_opportunity_id: "opp-9" },
      error: null,
    });
    const eqProjectId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleProject });
    const eqProjectOrg = vi.fn().mockReturnValue({ eq: eqProjectId });

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn().mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqProjectOrg }) }),
    });

    await expect(resolveWorksheetPurchaseOrderPublishContextForCurrentUser({
      owner: {
        ownerType: "variation",
        organizationId: "org-1",
        opportunityId: "opp-9",
        opportunitySlug: null,
        projectId: "project-9",
        projectSlug: "airport-fitout",
        quoteId: null,
        variationId: "variation-9",
      },
    })).resolves.toEqual({
      organizationId: "org-1",
      opportunityId: "opp-9",
      projectId: "project-9",
      projectSlug: "airport-fitout",
      ownerType: "variation",
    });
  });
});
