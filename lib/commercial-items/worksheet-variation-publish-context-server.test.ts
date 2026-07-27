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

import {
  IMMUTABLE_VARIATION_MESSAGE,
  resolveWorksheetVariationPublishContextForCurrentUser,
} from "@/lib/commercial-items/worksheet-variation-publish-context-server";

describe("worksheet variation publish context server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the current variation context from a variation-owned worksheet", async () => {
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

    const maybeSingleVariation = vi.fn().mockResolvedValue({
      data: {
        id: "variation-9",
        project_id: "project-9",
        variation_number: "VAR-009",
        variation_title: "Client changes",
        status: "Draft",
      },
      error: null,
    });
    const eqVariationProject = vi.fn().mockReturnValue({ maybeSingle: maybeSingleVariation });
    const eqVariationId = vi.fn().mockReturnValue({ eq: eqVariationProject });
    const eqVariationOrg = vi.fn().mockReturnValue({ eq: eqVariationId });

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqProjectOrg }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqVariationOrg }) });

    createServerSupabaseClient.mockResolvedValue({ from });

    await expect(resolveWorksheetVariationPublishContextForCurrentUser({
      owner: {
        ownerType: "variation",
        organizationId: "org-1",
        opportunityId: "opp-9",
        opportunitySlug: null,
        projectId: "project-9",
        projectSlug: "airport-fitout",
        quoteId: null,
        variationId: "variation-9",
        variationCode: "VAR-009",
      },
    })).resolves.toEqual({
      organizationId: "org-1",
      opportunityId: "opp-9",
      projectId: "project-9",
      projectSlug: "airport-fitout",
      variationId: "variation-9",
      variationNumber: "VAR-009",
      variationTitle: "Client changes",
      variationStatus: "Draft",
      ownerType: "variation",
    });
  });

  it("blocks immutable variations", async () => {
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

    const maybeSingleVariation = vi.fn().mockResolvedValue({
      data: {
        id: "variation-9",
        project_id: "project-9",
        variation_number: "VAR-009",
        variation_title: "Client changes",
        status: "Approved",
      },
      error: null,
    });
    const eqVariationProject = vi.fn().mockReturnValue({ maybeSingle: maybeSingleVariation });
    const eqVariationId = vi.fn().mockReturnValue({ eq: eqVariationProject });
    const eqVariationOrg = vi.fn().mockReturnValue({ eq: eqVariationId });

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqProjectOrg }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqVariationOrg }) });

    createServerSupabaseClient.mockResolvedValue({ from });

    await expect(resolveWorksheetVariationPublishContextForCurrentUser({
      owner: {
        ownerType: "variation",
        organizationId: "org-1",
        opportunityId: "opp-9",
        opportunitySlug: null,
        projectId: "project-9",
        projectSlug: "airport-fitout",
        quoteId: null,
        variationId: "variation-9",
        variationCode: "VAR-009",
      },
    })).rejects.toThrow(IMMUTABLE_VARIATION_MESSAGE);
  });
});
