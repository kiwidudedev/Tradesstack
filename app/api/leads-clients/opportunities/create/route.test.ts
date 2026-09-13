import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/opportunity-creation-server", async () => {
  class OpportunityCreationFailure extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code: string,
    ) {
      super(message);
    }
  }
  return {
    createOpportunityForCurrentUser: vi.fn(),
    OpportunityCreationFailure,
  };
});

import {
  createOpportunityForCurrentUser,
  OpportunityCreationFailure,
} from "@/lib/opportunity-creation-server";
import { POST } from "./route";

describe("Opportunity creation API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the public creation contract to the authoritative service", async () => {
    vi.mocked(createOpportunityForCurrentUser).mockResolvedValue({
      opportunityId: crypto.randomUUID(),
      opportunitySlug: "stage-3",
      workspaceProjectId: crypto.randomUUID(),
      workspaceProjectSlug: "stage-3-tender",
      lifecycleId: crypto.randomUUID(),
      recordsCreated: true,
    });
    const input = {
      creationRequestId: crypto.randomUUID(),
      name: "Stage 3",
      clientId: crypto.randomUUID(),
    };

    const response = await POST(new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }));

    expect(response.status).toBe(200);
    expect(createOpportunityForCurrentUser).toHaveBeenCalledWith(input);
  });

  it("returns safe validation errors without database detail", async () => {
    vi.mocked(createOpportunityForCurrentUser).mockRejectedValue(
      new OpportunityCreationFailure("Please select a client.", 400, "client_required"),
    );
    const response = await POST(new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Please select a client.",
      code: "client_required",
    });
  });

  it("fails closed for malformed JSON and unexpected errors", async () => {
    const malformed = await POST(new Request("http://localhost/api/test", {
      method: "POST",
      body: "{",
    }));
    expect(malformed.status).toBe(400);

    vi.mocked(createOpportunityForCurrentUser).mockRejectedValue(
      new Error("sensitive internal detail"),
    );
    const unexpected = await POST(new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(unexpected.status).toBe(500);
    expect(await unexpected.json()).toEqual({
      error: "Unable to create opportunity.",
    });
  });
});
