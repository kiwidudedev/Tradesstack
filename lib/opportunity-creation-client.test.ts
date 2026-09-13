import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearStableOpportunityCreationRequestId,
  getStableOpportunityCreationRequestId,
  submitAuthoritativeOpportunityCreation,
} from "@/lib/opportunity-creation-client";

function installBrowserStorage() {
  const values = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
  vi.stubGlobal("window", { sessionStorage });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authoritative Opportunity creation browser contract", () => {
  it("keeps one request identity per surface until explicit completion", () => {
    installBrowserStorage();

    const first = getStableOpportunityCreationRequestId("dialog");
    expect(getStableOpportunityCreationRequestId("dialog")).toBe(first);
    expect(getStableOpportunityCreationRequestId("full-page")).not.toBe(first);

    clearStableOpportunityCreationRequestId("dialog");
    expect(getStableOpportunityCreationRequestId("dialog")).not.toBe(first);
  });

  it("sends no browser-selectable lifecycle strategy", async () => {
    const response = {
      opportunityId: crypto.randomUUID(),
      opportunitySlug: "stage-3-opportunity",
      workspaceProjectId: crypto.randomUUID(),
      workspaceProjectSlug: "stage-3-opportunity-tender",
      lifecycleId: crypto.randomUUID(),
      recordsCreated: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitAuthoritativeOpportunityCreation({
        creationRequestId: crypto.randomUUID(),
        name: "Stage 3 Opportunity",
        clientId: crypto.randomUUID(),
      }),
    ).resolves.toEqual(response);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("strategy");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leads-clients/opportunities/create",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces failures without clearing the stable request identity", async () => {
    installBrowserStorage();
    const requestId = getStableOpportunityCreationRequestId("dialog");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Unable to create opportunity." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      submitAuthoritativeOpportunityCreation({
        creationRequestId: requestId,
        name: "Retry me",
        clientId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("Unable to create opportunity.");
    expect(getStableOpportunityCreationRequestId("dialog")).toBe(requestId);
  });
});
