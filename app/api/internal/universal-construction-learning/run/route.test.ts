import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runUniversalConstructionLearningReview = vi.fn();
const applyUniversalLearningMemoryActions = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/universal-learning/runner", () => ({
  runUniversalConstructionLearningReview,
}));

vi.mock("@/lib/universal-learning/memory-actions", () => ({
  applyUniversalLearningMemoryActions,
}));

describe("POST /api/internal/universal-construction-learning/run", () => {
  beforeEach(() => {
    hasPlatformAdminRole.mockReset();
    runUniversalConstructionLearningReview.mockReset();
    applyUniversalLearningMemoryActions.mockReset();
  });

  it("rejects non-admin requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", { method: "POST" }));

    expect(response.status).toBe(403);
  });

  it("runs monthly reviews for the requested containers", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runUniversalConstructionLearningReview.mockResolvedValue({
      reviewRunId: "review-run-1",
      appliedCount: 2,
      skipped: false,
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        reviewMonth: "2026-06",
        containerTypes: ["supplier_invoice_allocation", "project_actual_cost_event"],
      }),
    }));

    const json = await response.json();

    expect(response.status).toBe(200);
    expect(runUniversalConstructionLearningReview).toHaveBeenCalledTimes(2);
    expect(runUniversalConstructionLearningReview.mock.calls[0][0].selection).toMatchObject({
      organizationId: "org-1",
      containerType: "supplier_invoice_allocation",
      reviewMonth: "2026-06",
      runType: "monthly",
      scopeKey: "organization",
    });
    expect(json.results).toHaveLength(2);
  });

  it("requires organizationId", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewMonth: "2026-06",
      }),
    }));

    expect(response.status).toBe(400);
  });
});
