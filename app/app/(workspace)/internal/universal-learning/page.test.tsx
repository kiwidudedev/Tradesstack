import { describe, expect, it, vi, beforeEach } from "vitest";

const requirePlatformAdmin = vi.fn();
const getUniversalLearningOperationsDashboardData = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin,
}));

vi.mock("@/lib/universal-learning/operations-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/universal-learning/operations-server")>(
    "@/lib/universal-learning/operations-server",
  );
  return {
    ...actual,
    getUniversalLearningOperationsDashboardData,
  };
});

const emptyDashboard = {
  filters: {
    organizationId: null,
    containerType: null,
    reviewMonth: null,
    queueState: null,
    runStatus: null,
    reviewRunId: null,
    limit: 50,
  },
  queueRows: [],
  queueHealth: {
    pending: 0,
    claimed: 0,
    retryScheduled: 0,
    completed: 0,
    deadLettered: 0,
    other: 0,
    total: 0,
  },
  reviewRuns: [],
  reviewRunMetrics: {
    completed: 0,
    failed: 0,
    running: 0,
    other: 0,
    total: 0,
    selectedRecords: 0,
    memoryPackCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
  actionResults: [],
  provenance: {
    memories: [],
    links: [],
    memoryLinkCounts: [],
  },
  deadLetters: [],
  costSummary: [],
  memoryHealth: {
    totalMemories: 0,
    memoriesWithProvenance: 0,
    linklessMemories: 0,
    retiredMemories: 0,
    contradictedMemories: 0,
    sampledLinklessMemoryIds: [],
  },
  reviewDetail: null,
};

describe("Universal Learning operations page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires admin access and loads operations dashboard data", async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    getUniversalLearningOperationsDashboardData.mockResolvedValue(emptyDashboard);

    const { default: Page } = await import("./page");
    const element = await Page({
      searchParams: Promise.resolve({
        organizationId: "org-1",
        containerType: "project_quote",
      }),
    });

    expect(requirePlatformAdmin).toHaveBeenCalledWith("admin", "/app/dashboard");
    expect(getUniversalLearningOperationsDashboardData).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      containerType: "project_quote",
    }));
    expect(element).toBeTruthy();
  });
});
