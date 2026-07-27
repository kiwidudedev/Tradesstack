import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runWorksheetPricingPatternShadowDerivation = vi.fn();
const runWorksheetPricingPatternShadowIncremental = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/worksheet-pricing-pattern-shadow", () => ({
  runWorksheetPricingPatternShadowDerivation,
  runWorksheetPricingPatternShadowIncremental,
}));

describe("POST /api/internal/worksheet-pricing-patterns/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-pricing-patterns/run", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden.",
    });
    expect(runWorksheetPricingPatternShadowDerivation).not.toHaveBeenCalled();
  });

  it("returns shadow run summary and proposals", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetPricingPatternShadowIncremental.mockResolvedValue({
      runId: "run-1",
      fetchedCount: 12,
      poolsBuilt: 2,
      proposalsReturned: 2,
      acceptedByGate: 1,
      rejectedByGate: 1,
      noPatternCount: 0,
      familyDistribution: { formula_pattern: 1, pricing_preference: 1 },
      strengthDistribution: { weak: 1, reinforced: 1 },
      rejectionReasons: { evidence_count_below_threshold: 1 },
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      durationMs: 932,
      proposals: [{
        proposalId: "proposal-1",
        batchId: "org-1:pricing-pattern-batch:1",
        organizationId: "org-1",
        gateStatus: "accepted",
        proposalKind: "pattern",
        patternFamily: "formula_pattern",
        patternType: "formula_dependency_pattern",
        title: "Quantity formulas usually use spacing inputs",
        summary: "Repeated worksheet interpretations indicate a stable formula dependency pattern.",
        retrievalGuidance: null,
        confidence: 0.81,
        proposedStrength: "reinforced",
        scope: {},
        patternValue: {},
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3"],
        contradictoryEvidenceEventIds: [],
        ignoredEvidenceEventIds: [],
        evidenceSummary: {},
        contradictionSummary: {},
        validation: {},
        rejectionReasons: [],
      }],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/internal/worksheet-pricing-patterns/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "org-1",
          limit: 100,
          batchSize: 20,
          minimumEvidenceCount: 2,
        }),
      }),
    );

    expect(runWorksheetPricingPatternShadowIncremental).toHaveBeenCalledWith({
      organizationId: "org-1",
      limit: 100,
      batchSize: 20,
      timeoutMs: undefined,
      maxOutputTokens: undefined,
      minimumEvidenceCount: 2,
      minimumConfidence: undefined,
      maximumContradictionRatio: undefined,
    });
    expect(runWorksheetPricingPatternShadowDerivation).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId: "run-1",
      fetchedCount: 12,
      proposalsReturned: 2,
      proposals: [
        expect.objectContaining({
          patternFamily: "formula_pattern",
        }),
      ],
    });
  });

  it("caps limit and batch size", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetPricingPatternShadowIncremental.mockResolvedValue({
      runId: "run-2",
      fetchedCount: 0,
      poolsBuilt: 0,
      proposalsReturned: 0,
      acceptedByGate: 0,
      rejectedByGate: 0,
      noPatternCount: 0,
      familyDistribution: {},
      strengthDistribution: {},
      rejectionReasons: {},
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      durationMs: 5,
      proposals: [],
    });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/internal/worksheet-pricing-patterns/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: 999,
          batchSize: 999,
        }),
      }),
    );

    expect(runWorksheetPricingPatternShadowIncremental).toHaveBeenCalledWith({
      organizationId: null,
      limit: 500,
      batchSize: 100,
      timeoutMs: undefined,
      maxOutputTokens: undefined,
      minimumEvidenceCount: undefined,
      minimumConfidence: undefined,
      maximumContradictionRatio: undefined,
    });
  });

  it("defaults batch size to 2 when none is provided", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetPricingPatternShadowIncremental.mockResolvedValue({
      runId: "run-3",
      fetchedCount: 0,
      poolsBuilt: 0,
      proposalsReturned: 0,
      acceptedByGate: 0,
      rejectedByGate: 0,
      noPatternCount: 0,
      familyDistribution: {},
      strengthDistribution: {},
      rejectionReasons: {},
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      durationMs: 5,
      proposals: [],
    });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/internal/worksheet-pricing-patterns/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
      }),
    );

    expect(runWorksheetPricingPatternShadowIncremental).toHaveBeenCalledWith({
      organizationId: null,
      limit: 10,
      batchSize: 2,
      timeoutMs: undefined,
      maxOutputTokens: undefined,
      minimumEvidenceCount: undefined,
      minimumConfidence: undefined,
      maximumContradictionRatio: undefined,
    });
  });

  it("can still use full scan debug mode explicitly", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    runWorksheetPricingPatternShadowDerivation.mockResolvedValue({
      runId: "run-4",
      fetchedCount: 0,
      poolsBuilt: 0,
      proposalsReturned: 0,
      acceptedByGate: 0,
      rejectedByGate: 0,
      noPatternCount: 0,
      familyDistribution: {},
      strengthDistribution: {},
      rejectionReasons: {},
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      durationMs: 5,
      proposals: [],
    });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/internal/worksheet-pricing-patterns/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "full_scan",
        }),
      }),
    );

    expect(runWorksheetPricingPatternShadowDerivation).toHaveBeenCalled();
    expect(runWorksheetPricingPatternShadowIncremental).not.toHaveBeenCalled();
  });
});
