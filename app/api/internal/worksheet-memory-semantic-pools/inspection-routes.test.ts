import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const listWorksheetMemorySemanticPools = vi.fn();
const getWorksheetMemorySemanticPoolDetail = vi.fn();
const getWorksheetMemorySemanticPoolEvidence = vi.fn();
const getWorksheetMemorySemanticPoolMetrics = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/worksheet-memory-semantic-pools", () => ({
  listWorksheetMemorySemanticPools,
  getWorksheetMemorySemanticPoolDetail,
  getWorksheetMemorySemanticPoolEvidence,
  getWorksheetMemorySemanticPoolMetrics,
}));

describe("worksheet memory semantic pool inspection routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires admin and organizationId for pool list", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./pools/route");
    const forbidden = await GET(new Request("http://localhost/api/internal/worksheet-memory-semantic-pools/pools?organizationId=org-1"));
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    const missingOrg = await GET(new Request("http://localhost/api/internal/worksheet-memory-semantic-pools/pools"));
    expect(missingOrg.status).toBe(400);
  });

  it("wires pool detail, evidence, and metrics routes", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue({ id: "pool-1" });
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue({ poolId: "pool-1", evidence: [] });
    getWorksheetMemorySemanticPoolMetrics.mockResolvedValue({ organizationId: "org-1", queueStateCounts: {} });

    const detailRoute = await import("./pools/[poolId]/route");
    const detailResponse = await detailRoute.GET(
      new Request("http://localhost/api/internal/worksheet-memory-semantic-pools/pools/pool-1?organizationId=org-1"),
      { params: Promise.resolve({ poolId: "pool-1" }) },
    );
    expect(detailResponse.status).toBe(200);
    expect(getWorksheetMemorySemanticPoolDetail).toHaveBeenCalledWith("pool-1", "org-1");

    const evidenceRoute = await import("./pools/[poolId]/evidence/route");
    const evidenceResponse = await evidenceRoute.GET(
      new Request("http://localhost/api/internal/worksheet-memory-semantic-pools/pools/pool-1/evidence?organizationId=org-1"),
      { params: Promise.resolve({ poolId: "pool-1" }) },
    );
    expect(evidenceResponse.status).toBe(200);
    expect(getWorksheetMemorySemanticPoolEvidence).toHaveBeenCalledWith("pool-1", "org-1");

    const metricsRoute = await import("./metrics/route");
    const metricsResponse = await metricsRoute.GET(
      new Request("http://localhost/api/internal/worksheet-memory-semantic-pools/metrics?organizationId=org-1"),
    );
    expect(metricsResponse.status).toBe(200);
    expect(getWorksheetMemorySemanticPoolMetrics).toHaveBeenCalledWith("org-1");
  });
});
