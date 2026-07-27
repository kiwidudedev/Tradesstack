import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const getUniversalLearningOperationsDashboardData = vi.fn();
const listUniversalLearningQueueRows = vi.fn();
const listUniversalLearningReviewRuns = vi.fn();
const getUniversalLearningReviewRunDetail = vi.fn();
const listUniversalLearningActionResults = vi.fn();
const getUniversalLearningProvenanceGraph = vi.fn();
const getUniversalLearningCostSummary = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/universal-learning/operations-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/universal-learning/operations-server")>(
    "@/lib/universal-learning/operations-server",
  );
  return {
    ...actual,
    getUniversalLearningOperationsDashboardData,
    listUniversalLearningQueueRows,
    listUniversalLearningReviewRuns,
    getUniversalLearningReviewRunDetail,
    listUniversalLearningActionResults,
    getUniversalLearningProvenanceGraph,
    getUniversalLearningCostSummary,
  };
});

describe("Universal Learning operations APIs", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects non-admin users", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./summary/route");

    const response = await GET(new Request("http://localhost"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden." });
    expect(getUniversalLearningOperationsDashboardData).not.toHaveBeenCalled();
  });

  it("returns operations summary for admins", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    getUniversalLearningOperationsDashboardData.mockResolvedValue({ queueHealth: { pending: 1 } });
    const { GET } = await import("./summary/route");

    const response = await GET(new Request("http://localhost?organizationId=org-1&containerType=project_quote"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getUniversalLearningOperationsDashboardData).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      containerType: "project_quote",
    }));
    expect(json.queueHealth.pending).toBe(1);
  });

  it("returns queue rows and dead letters", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listUniversalLearningQueueRows.mockResolvedValue([{ id: "queue-1" }]);
    const queueRoute = await import("./queue/route");
    const deadLetterRoute = await import("./dead-letters/route");

    const queueResponse = await queueRoute.GET(new Request("http://localhost?queueState=pending"));
    const deadLetterResponse = await deadLetterRoute.GET(new Request("http://localhost"));

    expect(queueResponse.status).toBe(200);
    expect(deadLetterResponse.status).toBe(200);
    expect(listUniversalLearningQueueRows).toHaveBeenCalledWith(expect.objectContaining({
      queueState: "pending",
    }));
    expect(listUniversalLearningQueueRows).toHaveBeenCalledWith(expect.any(Object), {
      deadLettersOnly: true,
    });
  });

  it("returns review runs and review details", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listUniversalLearningReviewRuns.mockResolvedValue([{ id: "run-1" }]);
    getUniversalLearningReviewRunDetail.mockResolvedValue({ run: { id: "run-1" } });
    const runsRoute = await import("./review-runs/route");
    const detailRoute = await import("./review-runs/[reviewRunId]/route");

    const runsResponse = await runsRoute.GET(new Request("http://localhost?runStatus=completed"));
    const detailResponse = await detailRoute.GET(new Request("http://localhost"), {
      params: Promise.resolve({ reviewRunId: "run-1" }),
    });

    expect(runsResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(listUniversalLearningReviewRuns).toHaveBeenCalledWith(expect.objectContaining({
      runStatus: "completed",
    }));
    expect(getUniversalLearningReviewRunDetail).toHaveBeenCalledWith("run-1");
  });

  it("returns action results, provenance graph, and cost summary", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listUniversalLearningActionResults.mockResolvedValue([{ id: "action-1" }]);
    getUniversalLearningProvenanceGraph.mockResolvedValue({ memories: [], links: [] });
    getUniversalLearningCostSummary.mockResolvedValue([{ totalTokens: 100 }]);
    const actionsRoute = await import("./action-results/route");
    const provenanceRoute = await import("./provenance/route");
    const costsRoute = await import("./cost-summary/route");

    const actionsResponse = await actionsRoute.GET(new Request("http://localhost?reviewRunId=run-1"));
    const provenanceResponse = await provenanceRoute.GET(new Request("http://localhost?reviewRunId=run-1"));
    const costsResponse = await costsRoute.GET(new Request("http://localhost?reviewMonth=2026-06"));

    expect(actionsResponse.status).toBe(200);
    expect(provenanceResponse.status).toBe(200);
    expect(costsResponse.status).toBe(200);
    expect(listUniversalLearningActionResults).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-1",
    }));
    expect(getUniversalLearningProvenanceGraph).toHaveBeenCalledWith({
      filters: expect.objectContaining({ reviewRunId: "run-1" }),
    });
    expect(getUniversalLearningCostSummary).toHaveBeenCalledWith(expect.objectContaining({
      reviewMonth: "2026-06",
    }));
  });
});
