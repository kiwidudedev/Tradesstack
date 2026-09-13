import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ConversionFailure extends Error {
    databaseCode: string | null;
    details: string | null;
    hint: string | null;
    operation: string;
    opportunityId: string | null;
    acceptedQuoteId: string;
    organizationId: string;

    constructor(params: {
      message: string;
      databaseCode?: string | null;
      details?: string | null;
      hint?: string | null;
    }) {
      super(params.message);
      this.databaseCode = params.databaseCode ?? null;
      this.details = params.details ?? null;
      this.hint = params.hint ?? null;
      this.operation = "convert_accepted_opportunity_to_project";
      this.opportunityId = "opportunity-1";
      this.acceptedQuoteId = "quote-1";
      this.organizationId = "organization-1";
    }
  }

  return {
    ConversionFailure,
    convert: vi.fn(),
    release: vi.fn(),
    guard: vi.fn(),
    createServerClient: vi.fn(),
  };
});

vi.mock("@/lib/leads-clients-server", () => ({
  OpportunityConversionFailure: mocks.ConversionFailure,
  convertOpportunityToProjectForCurrentUser: mocks.convert,
}));
vi.mock("@/lib/security/abuse-guard", () => ({
  enforceRouteGuard: mocks.guard,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerClient,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request(
    "http://localhost/api/leads-clients/opportunities/metro-ceilings-fitout/convert",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "correlation-1",
      },
      body: JSON.stringify(body),
    },
  );
}

const context = {
  params: Promise.resolve({ opportunitySlug: "metro-ceilings-fitout" }),
};

describe("Opportunity conversion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    });
    mocks.guard.mockResolvedValue({
      ok: true,
      release: mocks.release,
    });
  });

  it("requires the exact accepted quote ID", async () => {
    const response = await POST(request({}), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "Select and save an accepted quote before converting this opportunity.",
      correlationId: "correlation-1",
    });
    expect(mocks.convert).not.toHaveBeenCalled();
  });

  it("returns an actionable 409 without leaking raw commercial conflict details", async () => {
    mocks.convert.mockRejectedValue(new mocks.ConversionFailure({
      message: "Commercial history is attached to an unrelated Project 123",
      databaseCode: "TS409",
      details: "sensitive database detail",
    }));

    const response = await POST(request({ acceptedQuoteId: "quote-1" }), context);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      error: "Commercial history is linked to another project and cannot be moved automatically.",
      correlationId: "correlation-1",
    });
    expect(JSON.stringify(payload)).not.toContain("sensitive");
    expect(JSON.stringify(payload)).not.toContain("Project 123");
  });

  it("maps invalid or non-Accepted quotes to 422", async () => {
    mocks.convert.mockRejectedValue(new mocks.ConversionFailure({
      message: "Quote must be Accepted before conversion",
      databaseCode: "TS422",
    }));

    const response = await POST(request({ acceptedQuoteId: "quote-1" }), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "The selected quote is not eligible to convert this opportunity.",
      correlationId: "correlation-1",
    });
  });

  it("returns a committed conversion with retryable file-migration state", async () => {
    mocks.convert.mockResolvedValue({
      projectId: "project-1",
      projectSlug: "metro-ceilings-fitout",
      projectCreated: false,
      legacyTenderDataMigrationStatus: "retry_required",
    });

    const response = await POST(request({ acceptedQuoteId: "quote-1" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      projectId: "project-1",
      projectSlug: "metro-ceilings-fitout",
      projectCreated: false,
      fileMigrationStatus: "retry_required",
      legacyTenderDataMigrationStatus: "retry_required",
      correlationId: "correlation-1",
    });
    expect(mocks.convert).toHaveBeenCalledWith(
      "metro-ceilings-fitout",
      "quote-1",
      "correlation-1",
    );
  });

  it("keeps unexpected database messages out of HTTP 500 responses", async () => {
    mocks.convert.mockRejectedValue(new Error("secret raw database failure"));

    const response = await POST(request({ acceptedQuoteId: "quote-1" }), context);
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: "Unable to convert opportunity.",
      correlationId: "correlation-1",
    });
  });
});
