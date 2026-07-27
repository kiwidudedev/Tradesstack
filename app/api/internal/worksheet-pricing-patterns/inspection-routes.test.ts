import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const listWorksheetPricingPatternCandidates = vi.fn();
const getWorksheetPricingPatternCandidateDetail = vi.fn();
const getWorksheetPricingPatternCandidateEvidence = vi.fn();
const getWorksheetPricingPatternCandidateMetrics = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/worksheet-pricing-pattern-inspection", () => ({
  listWorksheetPricingPatternCandidates,
  getWorksheetPricingPatternCandidateDetail,
  getWorksheetPricingPatternCandidateEvidence,
  getWorksheetPricingPatternCandidateMetrics,
}));

describe("worksheet pricing pattern inspection routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires admin and organizationId for candidate list", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./candidates/route");
    const forbidden = await GET(new Request("http://localhost/api/internal/worksheet-pricing-patterns/candidates?organizationId=org-1"));
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    const missingOrg = await GET(new Request("http://localhost/api/internal/worksheet-pricing-patterns/candidates"));
    expect(missingOrg.status).toBe(400);
  });

  it("wires candidate detail, evidence, and metrics routes", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    getWorksheetPricingPatternCandidateDetail.mockResolvedValue({ id: "candidate-1" });
    getWorksheetPricingPatternCandidateEvidence.mockResolvedValue({ candidateId: "candidate-1", evidence: [] });
    getWorksheetPricingPatternCandidateMetrics.mockResolvedValue({ organizationId: "org-1", candidateStatusCounts: {} });

    const detailRoute = await import("./candidates/[candidateId]/route");
    const detailResponse = await detailRoute.GET(
      new Request("http://localhost/api/internal/worksheet-pricing-patterns/candidates/candidate-1?organizationId=org-1"),
      { params: Promise.resolve({ candidateId: "candidate-1" }) },
    );
    expect(detailResponse.status).toBe(200);
    expect(getWorksheetPricingPatternCandidateDetail).toHaveBeenCalledWith("candidate-1", "org-1");

    const evidenceRoute = await import("./candidates/[candidateId]/evidence/route");
    const evidenceResponse = await evidenceRoute.GET(
      new Request("http://localhost/api/internal/worksheet-pricing-patterns/candidates/candidate-1/evidence?organizationId=org-1"),
      { params: Promise.resolve({ candidateId: "candidate-1" }) },
    );
    expect(evidenceResponse.status).toBe(200);
    expect(getWorksheetPricingPatternCandidateEvidence).toHaveBeenCalledWith("candidate-1", "org-1");

    const metricsRoute = await import("./metrics/route");
    const metricsResponse = await metricsRoute.GET(
      new Request("http://localhost/api/internal/worksheet-pricing-patterns/metrics?organizationId=org-1"),
    );
    expect(metricsResponse.status).toBe(200);
    expect(getWorksheetPricingPatternCandidateMetrics).toHaveBeenCalledWith("org-1");
  });
});
