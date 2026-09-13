import { beforeEach, describe, expect, it, vi } from "vitest";

const scheduleUniversalLearningMonthlyReviews = vi.fn();

vi.mock("@/lib/universal-learning/scheduler", () => ({
  scheduleUniversalLearningMonthlyReviews,
}));

describe("GET /api/cron/universal-construction-learning/schedule", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    scheduleUniversalLearningMonthlyReviews.mockReset();
    vi.stubEnv("TRADESSTACK_ENABLED_BACKGROUND_JOBS", "universal-construction-learning/schedule,material-source-retention");
  });

  it("requires CRON_SECRET", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/universal-construction-learning/schedule"));
    expect(response.status).toBe(500);
  });

  it("rejects unauthorized cron requests", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/universal-construction-learning/schedule", {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(401);
  });

  it("runs the monthly scheduler with normalized filters", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    scheduleUniversalLearningMonthlyReviews.mockResolvedValue({
      reviewMonth: "2026-05",
      dryRun: true,
      evaluatedCount: 1,
      eligibleCount: 1,
      enqueuedCount: 0,
      decisions: [],
    });

    const { GET } = await import("./route");
    const response = await GET(new Request(
      "http://localhost/api/cron/universal-construction-learning/schedule?organizationId=org-1&containerType=supplier_invoice_allocation&reviewMonth=2026-05&dryRun=true",
      { headers: { authorization: "Bearer secret" } },
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(scheduleUniversalLearningMonthlyReviews).toHaveBeenCalledWith({
      organizationId: "org-1",
      containerType: "supplier_invoice_allocation",
      reviewMonth: "2026-05",
      dryRun: true,
    });
    expect(json.reviewMonth).toBe("2026-05");
  });
});
