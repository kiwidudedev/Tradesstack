import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const listOrganizationMemories = vi.fn();
const getOrganizationMemoryDetail = vi.fn();
const getOrganizationMemoryProvenance = vi.fn();
const getOrganizationMemoryLinkedEvents = vi.fn();
const getOrganizationMemoryLinkedClassifications = vi.fn();
const getOrganizationMemoryHistory = vi.fn();
const listOrganizationMemorySynthesisHistory = vi.fn();
const listOrganizationMemoryLifecycleHistory = vi.fn();
const listOrganizationMemoryConfidenceHistory = vi.fn();
const listOrganizationMemoryRetirementHistory = vi.fn();
const repairOrganizationMemoryConfidenceMetadata = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/organization-memory-server", () => ({
  listOrganizationMemories,
  getOrganizationMemoryDetail,
  getOrganizationMemoryProvenance,
  getOrganizationMemoryLinkedEvents,
  getOrganizationMemoryLinkedClassifications,
  getOrganizationMemoryHistory,
  listOrganizationMemorySynthesisHistory,
  listOrganizationMemoryLifecycleHistory,
  listOrganizationMemoryConfidenceHistory,
  listOrganizationMemoryRetirementHistory,
  repairOrganizationMemoryConfidenceMetadata,
}));

describe("organization memory inspection routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires admin and organizationId for the memory list route", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./memories/route");
    const forbidden = await GET(new Request("http://localhost/api/internal/organization-memory/memories?organizationId=org-1"));
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    const missingOrg = await GET(new Request("http://localhost/api/internal/organization-memory/memories"));
    expect(missingOrg.status).toBe(400);
  });

  it("forwards list filters and pagination", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listOrganizationMemories.mockResolvedValue({ items: [] });

    const { GET } = await import("./memories/route");
    const response = await GET(
      new Request("http://localhost/api/internal/organization-memory/memories?organizationId=org-1&page=2&pageSize=15&q=waste&memoryCategory=worksheet_pricing&memoryType=assumption_pattern&isActive=true"),
    );

    expect(response.status).toBe(200);
    expect(listOrganizationMemories).toHaveBeenCalledWith({
      organizationId: "org-1",
      page: 2,
      pageSize: 15,
      query: "waste",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      isActive: true,
    });
  });

  it("returns 404 for cross-org or missing memory detail requests", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    getOrganizationMemoryDetail.mockResolvedValue(null);

    const route = await import("./memories/[memoryId]/route");
    const response = await route.GET(
      new Request("http://localhost/api/internal/organization-memory/memories/memory-1?organizationId=org-1"),
      { params: Promise.resolve({ memoryId: "memory-1" }) },
    );

    expect(response.status).toBe(404);
    expect(getOrganizationMemoryDetail).toHaveBeenCalledWith("org-1", "memory-1");
  });

  it("wires provenance, events, classifications, history, synthesis history, lifecycle history, and confidence history routes", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    getOrganizationMemoryProvenance.mockResolvedValue({ memoryId: "memory-1" });
    getOrganizationMemoryLinkedEvents.mockResolvedValue({ memoryId: "memory-1", events: [] });
    getOrganizationMemoryLinkedClassifications.mockResolvedValue({ memoryId: "memory-1", classifications: [] });
    getOrganizationMemoryHistory.mockResolvedValue({ memoryId: "memory-1" });
    listOrganizationMemorySynthesisHistory.mockResolvedValue({ records: [] });
    listOrganizationMemoryLifecycleHistory.mockResolvedValue({ records: [] });
    listOrganizationMemoryConfidenceHistory.mockResolvedValue({ records: [] });
    listOrganizationMemoryRetirementHistory.mockResolvedValue({ records: [] });

    const provenanceRoute = await import("./memories/[memoryId]/provenance/route");
    const provenanceResponse = await provenanceRoute.GET(
      new Request("http://localhost/api/internal/organization-memory/memories/memory-1/provenance?organizationId=org-1"),
      { params: Promise.resolve({ memoryId: "memory-1" }) },
    );
    expect(provenanceResponse.status).toBe(200);
    expect(getOrganizationMemoryProvenance).toHaveBeenCalledWith("org-1", "memory-1");

    const eventsRoute = await import("./memories/[memoryId]/events/route");
    const eventsResponse = await eventsRoute.GET(
      new Request("http://localhost/api/internal/organization-memory/memories/memory-1/events?organizationId=org-1"),
      { params: Promise.resolve({ memoryId: "memory-1" }) },
    );
    expect(eventsResponse.status).toBe(200);
    expect(getOrganizationMemoryLinkedEvents).toHaveBeenCalledWith("org-1", "memory-1");

    const classificationsRoute = await import("./memories/[memoryId]/classifications/route");
    const classificationsResponse = await classificationsRoute.GET(
      new Request("http://localhost/api/internal/organization-memory/memories/memory-1/classifications?organizationId=org-1"),
      { params: Promise.resolve({ memoryId: "memory-1" }) },
    );
    expect(classificationsResponse.status).toBe(200);
    expect(getOrganizationMemoryLinkedClassifications).toHaveBeenCalledWith("org-1", "memory-1");

    const historyRoute = await import("./memories/[memoryId]/history/route");
    const historyResponse = await historyRoute.GET(
      new Request("http://localhost/api/internal/organization-memory/memories/memory-1/history?organizationId=org-1"),
      { params: Promise.resolve({ memoryId: "memory-1" }) },
    );
    expect(historyResponse.status).toBe(200);
    expect(getOrganizationMemoryHistory).toHaveBeenCalledWith("org-1", "memory-1");

    const synthesisHistoryRoute = await import("./synthesis-history/route");
    const synthesisHistoryResponse = await synthesisHistoryRoute.GET(
      new Request("http://localhost/api/internal/organization-memory/synthesis-history?organizationId=org-1&semanticPoolId=pool-1&queueRowId=queue-1&limit=25"),
    );
    expect(synthesisHistoryResponse.status).toBe(200);
    expect(listOrganizationMemorySynthesisHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: null,
      semanticPoolId: "pool-1",
      queueRowId: "queue-1",
      limit: 25,
    });

    const lifecycleHistoryRoute = await import("./lifecycle-history/route");
    const lifecycleHistoryResponse = await lifecycleHistoryRoute.GET(
      new Request("http://localhost/api/internal/organization-memory/lifecycle-history?organizationId=org-1&memoryId=memory-1&semanticPoolId=pool-1&queueRowId=queue-1&synthesisHistoryId=history-1&limit=25"),
    );
    expect(lifecycleHistoryResponse.status).toBe(200);
    expect(listOrganizationMemoryLifecycleHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      semanticPoolId: "pool-1",
      queueRowId: "queue-1",
      synthesisHistoryId: "history-1",
      limit: 25,
    });

    const confidenceHistoryRoute = await import("./confidence-history/route");
    const confidenceHistoryResponse = await confidenceHistoryRoute.GET(
      new Request("http://localhost/api/internal/organization-memory/confidence-history?organizationId=org-1&memoryId=memory-1&semanticPoolId=pool-1&queueRowId=queue-1&lifecycleHistoryId=lifecycle-1&limit=25"),
    );
    expect(confidenceHistoryResponse.status).toBe(200);
    expect(listOrganizationMemoryConfidenceHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      semanticPoolId: "pool-1",
      queueRowId: "queue-1",
      lifecycleHistoryId: "lifecycle-1",
      limit: 25,
    });

    const retirementHistoryRoute = await import("./retirement-history/route");
    const retirementHistoryResponse = await retirementHistoryRoute.GET(
      new Request("http://localhost/api/internal/organization-memory/retirement-history?organizationId=org-1&memoryId=memory-1&limit=25"),
    );
    expect(retirementHistoryResponse.status).toBe(200);
    expect(listOrganizationMemoryRetirementHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      limit: 25,
    });
  });

  it("requires admin for the synthesis history route", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./synthesis-history/route");

    const response = await GET(
      new Request("http://localhost/api/internal/organization-memory/synthesis-history?organizationId=org-1"),
    );

    expect(response.status).toBe(403);
    expect(listOrganizationMemorySynthesisHistory).not.toHaveBeenCalled();
  });

  it("requires organizationId for the synthesis history route", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    const { GET } = await import("./synthesis-history/route");

    const response = await GET(
      new Request("http://localhost/api/internal/organization-memory/synthesis-history?memoryId=memory-1"),
    );

    expect(response.status).toBe(400);
    expect(listOrganizationMemorySynthesisHistory).not.toHaveBeenCalled();
  });

  it("normalizes synthesis history route filters and limit", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listOrganizationMemorySynthesisHistory.mockResolvedValue({ records: [] });
    const { GET } = await import("./synthesis-history/route");

    const response = await GET(
      new Request(
        "http://localhost/api/internal/organization-memory/synthesis-history?organizationId=org-1&memoryId=memory-1&semanticPoolId=pool-1&queueRowId=queue-1&limit=999",
      ),
    );

    expect(response.status).toBe(200);
    expect(listOrganizationMemorySynthesisHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      semanticPoolId: "pool-1",
      queueRowId: "queue-1",
      limit: 200,
    });
  });

  it("defaults the synthesis history route limit when invalid", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listOrganizationMemorySynthesisHistory.mockResolvedValue({ records: [] });
    const { GET } = await import("./synthesis-history/route");

    const response = await GET(
      new Request("http://localhost/api/internal/organization-memory/synthesis-history?organizationId=org-1&limit=not-a-number"),
    );

    expect(response.status).toBe(200);
    expect(listOrganizationMemorySynthesisHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: null,
      semanticPoolId: null,
      queueRowId: null,
      limit: 50,
    });
  });

  it("requires admin and organizationId for the lifecycle history route", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./lifecycle-history/route");

    const forbidden = await GET(
      new Request("http://localhost/api/internal/organization-memory/lifecycle-history?organizationId=org-1"),
    );
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    const missingOrg = await GET(
      new Request("http://localhost/api/internal/organization-memory/lifecycle-history?memoryId=memory-1"),
    );
    expect(missingOrg.status).toBe(400);
    expect(listOrganizationMemoryLifecycleHistory).not.toHaveBeenCalled();
  });

  it("normalizes lifecycle history route filters and limit", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listOrganizationMemoryLifecycleHistory.mockResolvedValue({ records: [] });
    const { GET } = await import("./lifecycle-history/route");

    const response = await GET(
      new Request(
        "http://localhost/api/internal/organization-memory/lifecycle-history?organizationId=org-1&memoryId=memory-1&semanticPoolId=pool-1&queueRowId=queue-1&synthesisHistoryId=history-1&limit=999",
      ),
    );

    expect(response.status).toBe(200);
    expect(listOrganizationMemoryLifecycleHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      semanticPoolId: "pool-1",
      queueRowId: "queue-1",
      synthesisHistoryId: "history-1",
      limit: 200,
    });
  });

  it("requires admin and organizationId for the confidence history route", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./confidence-history/route");

    const forbidden = await GET(
      new Request("http://localhost/api/internal/organization-memory/confidence-history?organizationId=org-1"),
    );
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    const missingOrg = await GET(
      new Request("http://localhost/api/internal/organization-memory/confidence-history?memoryId=memory-1"),
    );
    expect(missingOrg.status).toBe(400);
    expect(listOrganizationMemoryConfidenceHistory).not.toHaveBeenCalled();
  });

  it("normalizes confidence history route filters and limit", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listOrganizationMemoryConfidenceHistory.mockResolvedValue({ records: [] });
    const { GET } = await import("./confidence-history/route");

    const response = await GET(
      new Request(
        "http://localhost/api/internal/organization-memory/confidence-history?organizationId=org-1&memoryId=memory-1&semanticPoolId=pool-1&queueRowId=queue-1&lifecycleHistoryId=lifecycle-1&limit=999",
      ),
    );

    expect(response.status).toBe(200);
    expect(listOrganizationMemoryConfidenceHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      semanticPoolId: "pool-1",
      queueRowId: "queue-1",
      lifecycleHistoryId: "lifecycle-1",
      limit: 200,
    });
  });

  it("requires admin and organizationId for the confidence metadata repair route and forwards apply input", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { POST } = await import("./confidence-metadata/repair/route");

    const forbidden = await POST(new Request("http://localhost/api/internal/organization-memory/confidence-metadata/repair", {
      method: "POST",
      body: JSON.stringify({ organizationId: "org-1", apply: true }),
    }));
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    const missingOrg = await POST(new Request("http://localhost/api/internal/organization-memory/confidence-metadata/repair", {
      method: "POST",
      body: JSON.stringify({ apply: true }),
    }));
    expect(missingOrg.status).toBe(400);

    repairOrganizationMemoryConfidenceMetadata.mockResolvedValue({
      organizationId: "org-1",
      memoryId: "memory-1",
      apply: true,
      scannedCount: 1,
      updatedCount: 1,
      unchangedCount: 0,
      skippedNoHistoryCount: 0,
      records: [],
    });

    const allowed = await POST(new Request("http://localhost/api/internal/organization-memory/confidence-metadata/repair", {
      method: "POST",
      body: JSON.stringify({
        organizationId: "org-1",
        memoryId: "memory-1",
        apply: true,
        limit: 25,
      }),
    }));

    expect(allowed.status).toBe(200);
    expect(repairOrganizationMemoryConfidenceMetadata).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      apply: true,
      limit: 25,
    });
  });

  it("requires admin and organizationId for the retirement history route", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { GET } = await import("./retirement-history/route");

    const forbidden = await GET(
      new Request("http://localhost/api/internal/organization-memory/retirement-history?organizationId=org-1"),
    );
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    const missingOrg = await GET(
      new Request("http://localhost/api/internal/organization-memory/retirement-history?memoryId=memory-1"),
    );
    expect(missingOrg.status).toBe(400);
    expect(listOrganizationMemoryRetirementHistory).not.toHaveBeenCalled();
  });

  it("normalizes retirement history route filters and limit", async () => {
    hasPlatformAdminRole.mockResolvedValue(true);
    listOrganizationMemoryRetirementHistory.mockResolvedValue({ records: [] });
    const { GET } = await import("./retirement-history/route");

    const response = await GET(
      new Request(
        "http://localhost/api/internal/organization-memory/retirement-history?organizationId=org-1&memoryId=memory-1&limit=999",
      ),
    );

    expect(response.status).toBe(200);
    expect(listOrganizationMemoryRetirementHistory).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      limit: 200,
    });
  });
});
