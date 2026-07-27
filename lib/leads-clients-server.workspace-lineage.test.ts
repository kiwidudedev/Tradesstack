import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentOrganizationMember, createServerSupabaseClient } = vi.hoisted(() => ({
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
  createOpportunityForCurrentUser,
  getOrCreateOpportunityWorkspaceSlugForCurrentUser,
} from "@/lib/leads-clients-server";

describe("opportunity workspace lineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });
  });

  it("sets source_opportunity_id on new opportunity workspace projects", async () => {
    const projectInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "project-1", slug: "test-opportunity-tender" },
          error: null,
        }),
      }),
    });

    createServerSupabaseClient.mockResolvedValue({
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              like: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "opp-1",
                  name: "Test Opportunity",
                  slug: "test-opportunity",
                  location: "Auckland",
                  client_id: "client-1",
                  created_by: "user-1",
                  owner_user_id: "user-1",
                  workspace_project_id: null,
                },
                error: null,
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              like: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: projectInsert,
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
    });

    await createOpportunityForCurrentUser({ name: "Test Opportunity", clientId: "client-1", location: "Auckland" });

    expect(projectInsert).toHaveBeenCalledWith(expect.objectContaining({
      source_opportunity_id: "opp-1",
    }));
  });

  it("sets source_opportunity_id on lazily created workspace projects", async () => {
    const projectInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "project-1", slug: "test-opportunity-tender" },
          error: null,
        }),
      }),
    });

    createServerSupabaseClient.mockResolvedValue({
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "opp-1",
                    name: "Test Opportunity",
                    slug: "test-opportunity",
                    location: "Auckland",
                    client_id: "client-1",
                    created_by: "user-1",
                    owner_user_id: "user-1",
                    workspace_project_id: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              like: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: projectInsert,
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
    });

    await expect(getOrCreateOpportunityWorkspaceSlugForCurrentUser("test-opportunity")).resolves.toBe("test-opportunity-tender");

    expect(projectInsert).toHaveBeenCalledWith(expect.objectContaining({
      source_opportunity_id: "opp-1",
    }));
  });
});
