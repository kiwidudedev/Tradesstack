import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentOrganizationMember,
  createServerSupabaseClient,
  capturePromotionShadowBestEffort,
  finalizePromotionShadowBestEffort,
} = vi.hoisted(() => ({
  getCurrentOrganizationMember: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  capturePromotionShadowBestEffort: vi.fn(),
  finalizePromotionShadowBestEffort: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));
vi.mock("@/lib/opportunity-promotion-shadow-server", () => ({
  capturePromotionShadowBestEffort,
  finalizePromotionShadowBestEffort,
}));

import {
  OpportunityConversionFailure,
  convertOpportunityToProjectForCurrentUser,
} from "@/lib/leads-clients-server";

const opportunityId = "11111111-1111-4111-8111-111111111111";
const workspaceProjectId = "22222222-2222-4222-8222-222222222222";
const finalProjectId = "33333333-3333-4333-8333-333333333333";
const acceptedQuoteId = "44444444-4444-4444-8444-444444444444";

function opportunityQuery(data = {
  id: opportunityId,
  workspace_project_id: workspaceProjectId,
}) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  };
}

function emptyCloneTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  };
}

function buildClient(params?: {
  rpcError?: {
    code?: string;
    message: string;
    details?: string;
    hint?: string;
  };
  pricingRpcError?: {
    code?: string;
    message: string;
    details?: string;
    hint?: string;
  };
  projectCreated?: boolean;
  copyError?: { message: string } | null;
  drawingRows?: Array<Record<string, unknown>>;
}) {
  const metadataRpcPayloads: Array<Record<string, unknown>> = [];
  const rpc = vi.fn().mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name === "award_opportunity_by_lifecycle_v1") {
      if (params?.rpcError) {
        return Promise.resolve({ data: null, error: params.rpcError });
      }
      return Promise.resolve({
        data: [{
          project_id: finalProjectId,
          project_slug: "metro-ceilings-fitout",
          project_created: params?.projectCreated ?? true,
          storage_clone_required: true,
          lifecycle_strategy: "legacy_two_project_v1",
        }],
        error: null,
      });
    }
    if (name === "finalize_opportunity_award_pricing_v1") {
      return Promise.resolve({
        data: params?.pricingRpcError ? null : [{ manifest_id: "manifest-1" }],
        error: params?.pricingRpcError ?? null,
      });
    }
    metadataRpcPayloads.push(args);
    return Promise.resolve({ data: null, error: null });
  });
  const copy = vi.fn().mockResolvedValue({
    data: params?.copyError ? null : {},
    error: params?.copyError ?? null,
  });

  const drawingTable = params?.drawingRows
    ? {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: params.drawingRows,
              error: null,
            }),
          }),
        }),
      }
    : emptyCloneTable();

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "organization_opportunities") return opportunityQuery();
        if (table === "project_drawing_sets") return drawingTable;
        if (table === "trade_packs" || table === "scope_runs") return emptyCloneTable();
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc,
      storage: {
        from: vi.fn().mockReturnValue({ copy }),
      },
    },
    rpc,
    copy,
    metadataRpcPayloads,
  };
}

describe("atomic opportunity conversion service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });
    capturePromotionShadowBestEffort.mockResolvedValue(null);
    finalizePromotionShadowBestEffort.mockResolvedValue(null);
  });

  it("passes the exact accepted canonical quote ID to the atomic conversion RPC", async () => {
    const { client, rpc } = buildClient();
    createServerSupabaseClient.mockResolvedValue(client);

    const result = await convertOpportunityToProjectForCurrentUser(
      "metro-ceilings-fitout",
      acceptedQuoteId,
      "55555555-5555-4555-8555-555555555555",
    );

    expect(rpc).toHaveBeenCalledWith("award_opportunity_by_lifecycle_v1", {
      p_organization_id: "org-1",
      p_opportunity_id: opportunityId,
      p_accepted_quote_id: acceptedQuoteId,
      p_correlation_id: "55555555-5555-4555-8555-555555555555",
    });
    expect(result).toEqual({
      projectId: finalProjectId,
      projectSlug: "metro-ceilings-fitout",
      projectCreated: true,
      legacyTenderDataMigrationStatus: "complete",
    });
  });

  it("returns the same final Project on an idempotent retry", async () => {
    const { client, rpc } = buildClient({ projectCreated: false });
    createServerSupabaseClient.mockResolvedValue(client);

    const result = await convertOpportunityToProjectForCurrentUser(
      "metro-ceilings-fitout",
      acceptedQuoteId,
    );

    expect(result.projectId).toBe(finalProjectId);
    expect(result.projectCreated).toBe(false);
    expect(rpc).toHaveBeenCalledWith("finalize_opportunity_award_pricing_v1", {
      p_organization_id: "org-1",
      p_opportunity_id: opportunityId,
      p_project_id: finalProjectId,
      p_accepted_quote_id: acceptedQuoteId,
    });
  });

  it("preserves structured database error fields", async () => {
    const { client } = buildClient({
      rpcError: {
        code: "TS409",
        message: "Commercial history is attached to an unrelated Project",
        details: "project-9",
        hint: "Reconcile the Project lineage.",
      },
    });
    createServerSupabaseClient.mockResolvedValue(client);

    const failure = await convertOpportunityToProjectForCurrentUser(
      "metro-ceilings-fitout",
      acceptedQuoteId,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OpportunityConversionFailure);
    expect(failure).toMatchObject({
      databaseCode: "TS409",
      details: "project-9",
      hint: "Reconcile the Project lineage.",
      operation: "award_opportunity_by_lifecycle_v1",
      opportunityId,
      acceptedQuoteId,
    });
  });

  it("keeps ambiguous historical pricing behind the reconciliation guard", async () => {
    const { client } = buildClient({
      projectCreated: false,
      pricingRpcError: {
        code: "TS409",
        message: "Accepted quote pricing basis requires reconciliation before award",
      },
    });
    createServerSupabaseClient.mockResolvedValue(client);

    const failure = await convertOpportunityToProjectForCurrentUser(
      "metro-ceilings-fitout",
      acceptedQuoteId,
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      databaseCode: "TS409",
      operation: "finalize_opportunity_award_pricing_v1",
      opportunityId,
      acceptedQuoteId,
    });
  });

  it("keeps the committed conversion successful when storage copying fails", async () => {
    const { client } = buildClient({
      copyError: { message: "storage temporarily unavailable" },
      drawingRows: [{
        id: "55555555-5555-4555-8555-555555555555",
        uploaded_by: "user-1",
        file_name: "plans.pdf",
        storage_path: "org-1/workspace/plans.pdf",
        file_size_bytes: 100,
        mime_type: "application/pdf",
        uploaded_at: "2026-07-01T00:00:00.000Z",
      }],
    });
    createServerSupabaseClient.mockResolvedValue(client);

    const result = await convertOpportunityToProjectForCurrentUser(
      "metro-ceilings-fitout",
      acceptedQuoteId,
    );

    expect(result.projectId).toBe(finalProjectId);
    expect(result.legacyTenderDataMigrationStatus).toBe("retry_required");
  });

  it("keeps shadow telemetry outside the authoritative conversion result", async () => {
    capturePromotionShadowBestEffort.mockResolvedValue({
      runId: "shadow-run-1",
      captured: true,
      eligible: true,
      failureCodes: [],
    });
    finalizePromotionShadowBestEffort.mockResolvedValue({
      finalized: false,
      comparison_result: "comparison_error",
      mismatch_codes: ["comparison_failed"],
    });
    const { client } = buildClient();
    createServerSupabaseClient.mockResolvedValue(client);

    const result = await convertOpportunityToProjectForCurrentUser(
      "metro-ceilings-fitout",
      acceptedQuoteId,
      "correlation-1",
    );

    expect(result.projectId).toBe(finalProjectId);
    expect(finalizePromotionShadowBestEffort).toHaveBeenCalledWith({
      organizationId: "org-1",
      runId: "shadow-run-1",
      finalProjectId,
      actorUserId: "user-1",
    });
  });

  it("uses stable metadata identities so file-copy retries are idempotent", async () => {
    const sourceDrawing = {
      id: "55555555-5555-4555-8555-555555555555",
      uploaded_by: "user-1",
      file_name: "plans.pdf",
      storage_path: "org-1/workspace/plans.pdf",
      file_size_bytes: 100,
      mime_type: "application/pdf",
      uploaded_at: "2026-07-01T00:00:00.000Z",
    };
    const first = buildClient({ drawingRows: [sourceDrawing] });
    const second = buildClient({
      drawingRows: [sourceDrawing],
      copyError: { message: "The resource already exists" },
      projectCreated: false,
    });
    createServerSupabaseClient
      .mockResolvedValueOnce(first.client)
      .mockResolvedValueOnce(second.client);

    await convertOpportunityToProjectForCurrentUser("metro-ceilings-fitout", acceptedQuoteId);
    await convertOpportunityToProjectForCurrentUser("metro-ceilings-fitout", acceptedQuoteId);

    const firstRows = first.metadataRpcPayloads[0]?.p_drawing_sets as Array<{ id: string }>;
    const secondRows = second.metadataRpcPayloads[0]?.p_drawing_sets as Array<{ id: string }>;
    expect(firstRows[0]?.id).toBe(secondRows[0]?.id);
    expect(second.copy).toHaveBeenCalledTimes(1);
  });
});
