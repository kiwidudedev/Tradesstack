import { beforeEach, describe, expect, it, vi } from "vitest";

const retrieveOrganizationMemoryForAi = vi.fn();

vi.mock("@/lib/ai-lifecycle-server", () => ({
  retrieveOrganizationMemoryForAi,
}));

describe("Universal learning memory pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prioritizes same-domain memories and de-prioritizes unrelated commercial memories for takeoff", async () => {
    retrieveOrganizationMemoryForAi.mockResolvedValue([
      {
        id: "memory-quote",
        memoryCategory: "construction_decision",
        memoryType: "project_quote_learning",
        title: "Quote memory",
        summary: "Adjacent estimating memory",
        confidenceScore: 0.95,
        derivedFromTotalCount: 5,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
      {
        id: "memory-takeoff",
        memoryCategory: "construction_decision",
        memoryType: "takeoff_measurement_learning",
        title: "Takeoff memory",
        summary: "Same-container measurement memory",
        confidenceScore: 0.6,
        derivedFromTotalCount: 2,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-05T00:00:00.000Z",
      },
      {
        id: "memory-invoice",
        memoryCategory: "construction_decision",
        memoryType: "supplier_invoice_learning",
        title: "Invoice memory",
        summary: "Unrelated procurement memory",
        confidenceScore: 0.99,
        derivedFromTotalCount: 12,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-06T00:00:00.000Z",
      },
    ]);

    const { buildUniversalLearningMemoryPack } = await import("./memory-pack");
    const result = await buildUniversalLearningMemoryPack({
      organizationId: "org-1",
      currentContainerType: "takeoff_measurement",
      limit: 10,
    });

    expect(retrieveOrganizationMemoryForAi).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      memoryCategories: ["construction_decision"],
      limit: 10,
    }));
    expect(result.map((item) => item.id)).toEqual([
      "memory-takeoff",
      "memory-quote",
    ]);
  });

  it("retains unrelated memories only when entity scope is present and ranks them behind same-domain items", async () => {
    retrieveOrganizationMemoryForAi.mockResolvedValue([
      {
        id: "memory-allocation",
        memoryCategory: "construction_decision",
        memoryType: "supplier_invoice_allocation_learning",
        title: "Allocation memory",
        summary: "Same-domain cost attribution memory",
        confidenceScore: 0.8,
        derivedFromTotalCount: 3,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
      {
        id: "memory-po",
        memoryCategory: "construction_decision",
        memoryType: "project_purchase_order_learning",
        title: "PO memory",
        summary: "Adjacent procurement memory",
        confidenceScore: 0.82,
        derivedFromTotalCount: 8,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-03T00:00:00.000Z",
      },
      {
        id: "memory-claim",
        memoryCategory: "construction_decision",
        memoryType: "project_claim_learning",
        title: "Claim memory",
        summary: "Unrelated but same-entity commercial memory",
        confidenceScore: 0.97,
        derivedFromTotalCount: 10,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
    ]);

    const { buildUniversalLearningMemoryPack } = await import("./memory-pack");
    const result = await buildUniversalLearningMemoryPack({
      organizationId: "org-1",
      currentContainerType: "project_actual_cost_event",
      projectId: "project-1",
      limit: 10,
    });

    expect(result.map((item) => item.id)).toEqual([
      "memory-allocation",
      "memory-claim",
      "memory-po",
    ]);
  });
});
