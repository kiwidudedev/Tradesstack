import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createOpportunityForCurrentUser,
  getOpportunityCreationActivationMode,
  opportunityCreationStrategy,
} from "@/lib/opportunity-creation-server";

const member = {
  organization_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
};

describe("authoritative Opportunity creation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPPORTUNITY_CREATION_MODE;
    vi.mocked(getCurrentOrganizationMember).mockResolvedValue(member as never);
  });

  it("makes lifecycle creation activation explicit and fails closed when required", async () => {
    process.env.OPPORTUNITY_CREATION_MODE = "atomic-required";
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "Opportunity lifecycle creation is not enabled",
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);

    expect(getOpportunityCreationActivationMode()).toBe("atomic-required");
    await expect(createOpportunityForCurrentUser({
      creationRequestId: crypto.randomUUID(),
      name: "Stage 3 activation guard",
      clientId: crypto.randomUUID(),
    })).rejects.toMatchObject({
      status: 503,
      code: "atomic_creation_not_activated",
    });
  });

  it("recognizes the current lifecycle-default activation error for compatibility fallback", async () => {
    process.env.OPPORTUNITY_CREATION_MODE = "atomic-required";
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "TS409",
        message: "Opportunity lifecycle default creation is not enabled",
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);

    await expect(createOpportunityForCurrentUser({
      creationRequestId: crypto.randomUUID(),
      name: "Current activation guard",
      clientId: crypto.randomUUID(),
    })).rejects.toMatchObject({
      status: 503,
      code: "atomic_creation_not_activated",
    });
  });

  it("always invokes the trusted control-selected atomic RPC without a browser strategy", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        opportunity_id: "33333333-3333-4333-8333-333333333333",
        opportunity_slug: "stage-3",
        workspace_project_id: "44444444-4444-4444-8444-444444444444",
        workspace_project_slug: "stage-3-tender",
        lifecycle_id: "55555555-5555-4555-8555-555555555555",
        records_created: true,
      }],
      error: null,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);

    const result = await createOpportunityForCurrentUser({
      creationRequestId: "66666666-6666-4666-8666-666666666666",
      name: " Stage 3 ",
      clientId: "77777777-7777-4777-8777-777777777777",
      location: " Auckland ",
      estimatedValue: 1234,
    });

    expect(opportunityCreationStrategy).toBe("control-selected");
    expect(rpc).toHaveBeenCalledWith(
      "create_opportunity_workspace_with_tender_clients_v1",
      expect.objectContaining({
        p_creation_request_id: "66666666-6666-4666-8666-666666666666",
        p_name: "Stage 3",
        p_client_id: "77777777-7777-4777-8777-777777777777",
        p_tender_client_ids: [],
      }),
    );
    expect(result.recordsCreated).toBe(true);
  });

  it("preserves the Supabase client method binding when invoking the atomic RPC", async () => {
    const supabase = {
      bindingMarker: "supabase-client",
      rpc: vi.fn(function (this: { bindingMarker?: string }) {
        if (this.bindingMarker !== "supabase-client") {
          throw new TypeError("Cannot read properties of undefined (reading 'rest')");
        }
        return Promise.resolve({
          data: [{
            opportunity_id: "33333333-3333-4333-8333-333333333333",
            opportunity_slug: "bound-rpc",
            workspace_project_id: "44444444-4444-4444-8444-444444444444",
            workspace_project_slug: "bound-rpc-tender",
            lifecycle_id: "55555555-5555-4555-8555-555555555555",
            records_created: true,
          }],
          error: null,
        });
      }),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase as never);

    await expect(createOpportunityForCurrentUser({
      creationRequestId: "66666666-6666-4666-8666-666666666666",
      name: "Bound RPC",
      clientId: "77777777-7777-4777-8777-777777777777",
    })).resolves.toMatchObject({ opportunitySlug: "bound-rpc" });
  });

  it("normalizes the Langton Road multi-client payload without losing its database types", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        opportunity_id: "33333333-3333-4333-8333-333333333333",
        opportunity_slug: "langton-road",
        workspace_project_id: "44444444-4444-4444-8444-444444444444",
        workspace_project_slug: "langton-road-tender",
        lifecycle_id: "55555555-5555-4555-8555-555555555555",
        records_created: true,
      }],
      error: null,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
    const fletcher = "77777777-7777-4777-8777-777777777777";
    const harbour = "88888888-8888-4888-8888-888888888888";
    const thirdClient = "99999999-9999-4999-8999-999999999999";

    await createOpportunityForCurrentUser({
      creationRequestId: "66666666-6666-4666-8666-666666666666",
      name: "Langton Road",
      location: "Auckland",
      clientId: fletcher,
      tenderClientIds: [fletcher, harbour, thirdClient, fletcher],
      ownerUserId: member.user_id,
      dueDate: "2026-08-23",
      estimatedValue: 500000,
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_opportunity_workspace_with_tender_clients_v1",
      expect.objectContaining({
        p_client_id: fletcher,
        p_tender_client_ids: [fletcher, harbour, thirdClient],
        p_owner_user_id: member.user_id,
        p_location: "Auckland",
        p_due_date: "2026-08-23",
        p_estimated_value: 500000,
      }),
    );
  });

  it("preserves an idempotent retry response from the database", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        opportunity_id: "33333333-3333-4333-8333-333333333333",
        opportunity_slug: "stage-3",
        workspace_project_id: "44444444-4444-4444-8444-444444444444",
        workspace_project_slug: "stage-3-tender",
        lifecycle_id: "55555555-5555-4555-8555-555555555555",
        records_created: false,
      }],
      error: null,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);

    const result = await createOpportunityForCurrentUser({
      creationRequestId: "66666666-6666-4666-8666-666666666666",
      name: "Stage 3",
      clientId: "77777777-7777-4777-8777-777777777777",
    });

    expect(result.recordsCreated).toBe(false);
    expect(result.opportunityId).toBe("33333333-3333-4333-8333-333333333333");
    expect(result.workspaceProjectId).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("preserves tender-client recipients when the legacy fallback is selected", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "Opportunity lifecycle creation is not enabled" },
      })
      .mockResolvedValueOnce({ data: null, error: null });
    let opportunityFromCalls = 0;
    let projectFromCalls = 0;
    const supabase = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "organization_opportunities") {
          opportunityFromCalls += 1;
          if (opportunityFromCalls === 1) {
            return {
              select: () => ({
                eq: () => ({
                  like: async () => ({ data: [], error: null }),
                }),
              }),
            };
          }
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "33333333-3333-4333-8333-333333333333", slug: "legacy-stage-3" },
                  error: null,
                }),
              }),
            }),
          };
        }
        projectFromCalls += 1;
        if (projectFromCalls === 1) {
          return {
            select: () => ({
              eq: () => ({
                like: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "44444444-4444-4444-8444-444444444444" }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => ({ error: null }),
              }),
            }),
          }),
        };
      }),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase as never);

    await createOpportunityForCurrentUser({
      creationRequestId: "66666666-6666-4666-8666-666666666666",
      name: "Legacy Stage 3",
      clientId: "77777777-7777-4777-8777-777777777777",
      tenderClientIds: ["88888888-8888-4888-8888-888888888888", "77777777-7777-4777-8777-777777777777"],
    });

    expect(rpc).toHaveBeenNthCalledWith(2, "sync_opportunity_tender_clients_v1", {
      p_organization_id: member.organization_id,
      p_opportunity_id: "33333333-3333-4333-8333-333333333333",
      p_client_ids: [
        "88888888-8888-4888-8888-888888888888",
        "77777777-7777-4777-8777-777777777777",
      ],
      p_primary_client_id: "77777777-7777-4777-8777-777777777777",
    });
  });

  it("maps every new-client and form field into the atomic request", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        opportunity_id: crypto.randomUUID(),
        opportunity_slug: "new-client-stage-3",
        workspace_project_id: crypto.randomUUID(),
        workspace_project_slug: "new-client-stage-3-tender",
        lifecycle_id: crypto.randomUUID(),
        records_created: true,
      }],
      error: null,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);

    await createOpportunityForCurrentUser({
      creationRequestId: crypto.randomUUID(),
      name: "New client Stage 3",
      newClient: {
        contactName: " Client Contact ",
        companyName: " Client Company ",
        email: " contact@example.test ",
        phone: " 021 555 1234 ",
      },
      ownerUserId: "88888888-8888-4888-8888-888888888888",
      location: " Wellington ",
      dueDate: "2026-08-31",
      estimatedValue: 9876.5,
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_opportunity_workspace_with_tender_clients_v1",
      expect.objectContaining({
        p_client_id: null,
        p_new_client: {
          name: "Client Contact",
          company_name: "Client Company",
          email: "contact@example.test",
          phone: "021 555 1234",
        },
        p_owner_user_id: "88888888-8888-4888-8888-888888888888",
        p_location: "Wellington",
        p_due_date: "2026-08-31",
        p_estimated_value: 9876.5,
      }),
    );
  });

  it("maps database permission failures to the existing safe outcome", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "internal permission detail" },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);

    await expect(
      createOpportunityForCurrentUser({
        creationRequestId: crypto.randomUUID(),
        name: "Stage 3",
        clientId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "permission_denied",
      message: "You do not have permission to create opportunities.",
    });
  });

  it("rejects unauthenticated and browser-invalid submissions before mutation", async () => {
    vi.mocked(getCurrentOrganizationMember).mockResolvedValueOnce(null);
    await expect(
      createOpportunityForCurrentUser({
        creationRequestId: crypto.randomUUID(),
        name: "Stage 3",
        clientId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 401, code: "authentication_required" });

    await expect(
      createOpportunityForCurrentUser({
        creationRequestId: "not-a-uuid",
        name: "Stage 3",
        clientId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_request_identity",
    });
  });
});
