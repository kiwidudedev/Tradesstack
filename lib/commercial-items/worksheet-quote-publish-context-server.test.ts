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

import { resolveWorksheetQuotePublishContextForCurrentUser } from "@/lib/commercial-items/worksheet-quote-publish-context-server";

describe("worksheet quote publish context server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a nullable project attachment context for an opportunity", async () => {
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: { id: "opp-1", organization_id: "org-1", converted_project_id: "project-1" },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });

    const maybeSingleProject = vi.fn().mockResolvedValue({
      data: { id: "project-1", slug: "opp-1-tender", source_opportunity_id: "opp-1" },
      error: null,
    });
    const eqProjectId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleProject });
    const eqProjectOrg = vi.fn().mockReturnValue({ eq: eqProjectId });

    createServerSupabaseClient.mockResolvedValue({
      from: vi
        .fn()
        .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) })
        .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqProjectOrg }) }),
    });

    await expect(resolveWorksheetQuotePublishContextForCurrentUser({
      organizationId: "org-1",
      opportunityId: "opp-1",
    })).resolves.toEqual({
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      projectSlug: "opp-1-tender",
      createdWorkspace: false,
      repairedWorkspaceLineage: false,
    });
  });

  it("returns a null project attachment when the opportunity is still pre-award", async () => {
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: {
        id: "opp-1",
        organization_id: "org-1",
        converted_project_id: null,
      },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn().mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) }),
    });

    await expect(resolveWorksheetQuotePublishContextForCurrentUser({
      organizationId: "org-1",
      opportunityId: "opp-1",
    })).resolves.toEqual({
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
      projectSlug: null,
      createdWorkspace: false,
      repairedWorkspaceLineage: false,
    });
  });

  it("ignores workspace bridge projects before conversion and keeps pre-award publishing projectless", async () => {
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: {
        id: "opp-1",
        organization_id: "org-1",
        converted_project_id: null,
      },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });
    const from = vi.fn().mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) });

    createServerSupabaseClient.mockResolvedValue({ from });

    await expect(resolveWorksheetQuotePublishContextForCurrentUser({
      organizationId: "org-1",
      opportunityId: "opp-1",
    })).resolves.toMatchObject({
      projectId: null,
      projectSlug: null,
    });

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("rejects converted projects whose lineage points to another opportunity", async () => {
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: { id: "opp-1", organization_id: "org-1", converted_project_id: "project-1" },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });

    const maybeSingleProject = vi.fn().mockResolvedValue({
      data: { id: "project-1", slug: "wrong-project", source_opportunity_id: "opp-2" },
      error: null,
    });
    const eqProjectId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleProject });
    const eqProjectOrg = vi.fn().mockReturnValue({ eq: eqProjectId });

    createServerSupabaseClient.mockResolvedValue({
      from: vi
        .fn()
        .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) })
        .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqProjectOrg }) }),
    });

    await expect(resolveWorksheetQuotePublishContextForCurrentUser({
      organizationId: "org-1",
      opportunityId: "opp-1",
    })).rejects.toThrow("This quote belongs to a different opportunity.");
  });
});
