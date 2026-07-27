import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPlatformAdminRole = vi.fn();
const runOrganizationMemoryRetirementWorker = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  hasPlatformAdminRole,
}));

vi.mock("@/lib/organization-memory-retirement", () => ({
  runOrganizationMemoryRetirementWorker,
}));

describe("organization memory retirement routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("requires admin for the internal run route and forwards worker input", async () => {
    hasPlatformAdminRole.mockResolvedValue(false);
    const { POST } = await import("./run/route");
    const forbidden = await POST(new Request("http://localhost/api/internal/organization-memory-retirement/run", {
      method: "POST",
      body: JSON.stringify({ organizationId: "org-1" }),
    }));
    expect(forbidden.status).toBe(403);

    hasPlatformAdminRole.mockResolvedValue(true);
    runOrganizationMemoryRetirementWorker.mockResolvedValue({
      runId: "retirement-run-1",
      claimedJobCount: 1,
      completedJobCount: 1,
      retiredMemoryCount: 1,
      noActionCount: 0,
      noActionReasonCounts: {},
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      durationMs: 123,
      batchSize: 4,
      organizationId: "org-1",
      memoryId: "memory-1",
      gracePeriodDays: 30,
    });

    const allowed = await POST(new Request("http://localhost/api/internal/organization-memory-retirement/run", {
      method: "POST",
      body: JSON.stringify({
        organizationId: "org-1",
        memoryId: "memory-1",
        batchSize: 4,
        gracePeriodDays: 45,
      }),
    }));

    expect(allowed.status).toBe(200);
    expect(runOrganizationMemoryRetirementWorker).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-1",
      limit: 4,
      gracePeriodDays: 45,
    });
    await expect(allowed.json()).resolves.toMatchObject({
      retiredMemoryCount: 1,
      batchSize: 4,
      organizationId: "org-1",
      memoryId: "memory-1",
      gracePeriodDays: 45,
    });
  });

  it("protects the cron route with the shared cron auth pattern", async () => {
    const { GET } = await import("../../cron/organization-memory-retirement/run/route");

    const missingSecret = await GET(new Request("http://localhost/api/cron/organization-memory-retirement/run"));
    expect(missingSecret.status).toBe(500);

    process.env.CRON_SECRET = "secret";
    const unauthorized = await GET(new Request("http://localhost/api/cron/organization-memory-retirement/run"));
    expect(unauthorized.status).toBe(401);

    runOrganizationMemoryRetirementWorker.mockResolvedValue({
      runId: "retirement-run-1",
      claimedJobCount: 1,
      completedJobCount: 1,
      retiredMemoryCount: 0,
      noActionCount: 1,
      noActionReasonCounts: { replacement_candidate_exists: 1 },
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      durationMs: 123,
      batchSize: 7,
      organizationId: "org-1",
      memoryId: null,
      gracePeriodDays: 30,
    });

    const authorized = await GET(new Request("http://localhost/api/cron/organization-memory-retirement/run?batchSize=7&organizationId=org-1&gracePeriodDays=21", {
      headers: {
        authorization: "Bearer secret",
      },
    }));

    expect(authorized.status).toBe(200);
    expect(runOrganizationMemoryRetirementWorker).toHaveBeenCalledWith({
      limit: 7,
      organizationId: "org-1",
      memoryId: null,
      gracePeriodDays: 21,
    });
    await expect(authorized.json()).resolves.toMatchObject({
      noActionCount: 1,
      batchSize: 7,
      organizationId: "org-1",
      gracePeriodDays: 21,
    });
  });
});
