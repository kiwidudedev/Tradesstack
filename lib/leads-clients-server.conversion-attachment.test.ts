import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentOrganizationMember,
  createServerSupabaseClient,
  createOrganizationProjectForCurrentUser,
} = vi.hoisted(() => ({
  getCurrentOrganizationMember: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createOrganizationProjectForCurrentUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));
vi.mock("@/lib/project-creation-server", () => ({
  createOrganizationProjectForCurrentUser,
}));

import { convertOpportunityToProjectForCurrentUser } from "@/lib/leads-clients-server";

function buildProjectQuotesTable() {
  return {
    select: vi.fn((columns: string) => {
      if (columns === "id") {
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "quote-1" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (columns === "quote_date") {
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { quote_date: "2026-07-08" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected project_quotes select: ${columns}`);
    }),
  };
}

describe("opportunity conversion canonical attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });
  });

  it("attaches canonical commercial history to an already-converted project before returning", async () => {
    const organizationOpportunitiesTable = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "opp-1",
                organization_id: "org-1",
                name: "Metro Ceilings Fitout",
                location: "Auckland",
                client_id: "client-1",
                quoted_at: null,
                workspace_project_id: "workspace-project-1",
                converted_project_id: "project-1",
              },
              error: null,
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };

    const organizationProjectsTable = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "project-1", slug: "metro-fitout" },
              error: null,
            }),
          }),
        }),
      }),
    };

    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          attached_quote_count: 1,
          attached_quote_line_count: 2,
          attached_commercial_item_count: 1,
        },
      ],
      error: null,
    });

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "organization_opportunities") {
          return organizationOpportunitiesTable;
        }
        if (table === "organization_projects") {
          return organizationProjectsTable;
        }
        if (table === "project_quotes") {
          return buildProjectQuotesTable();
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc,
    });

    const result = await convertOpportunityToProjectForCurrentUser("metro-fitout");

    expect(result).toEqual({ projectSlug: "metro-fitout" });
    expect(rpc).toHaveBeenCalledWith("attach_opportunity_commercial_history_to_project", {
      p_organization_id: "org-1",
      p_opportunity_id: "opp-1",
      p_project_id: "project-1",
    });
    expect(createOrganizationProjectForCurrentUser).not.toHaveBeenCalled();
  });

  it("attaches canonical commercial history to the newly created project during conversion", async () => {
    const organizationOpportunitiesTable = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "opp-1",
                organization_id: "org-1",
                name: "Metro Ceilings Fitout",
                location: "Auckland",
                client_id: "client-1",
                quoted_at: null,
                workspace_project_id: null,
                converted_project_id: null,
              },
              error: null,
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };

    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          attached_quote_count: 1,
          attached_quote_line_count: 1,
          attached_commercial_item_count: 1,
        },
      ],
      error: null,
    });

    createOrganizationProjectForCurrentUser.mockResolvedValue({
      id: "project-1",
      slug: "metro-fitout-project",
    });

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "organization_opportunities") {
          return organizationOpportunitiesTable;
        }
        if (table === "project_quotes") {
          return buildProjectQuotesTable();
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc,
    });

    const result = await convertOpportunityToProjectForCurrentUser("metro-fitout");

    expect(result).toEqual({ projectSlug: "metro-fitout-project" });
    expect(createOrganizationProjectForCurrentUser).toHaveBeenCalledWith(expect.objectContaining({
      sourceOpportunityId: "opp-1",
    }));
    expect(rpc).toHaveBeenCalledWith("attach_opportunity_commercial_history_to_project", {
      p_organization_id: "org-1",
      p_opportunity_id: "opp-1",
      p_project_id: "project-1",
    });
  });
});
