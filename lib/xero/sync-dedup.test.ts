import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

function createAdminClient(initialJobs: Array<Record<string, unknown>>) {
  const jobs = initialJobs;

  return {
    from() {
      let currentKind = "";
      let queueStates: string[] = [];

      const builder = {
        select() {
          return builder;
        },
        eq(field: string, value: unknown) {
          if (field === "job_kind") {
            currentKind = String(value);
          }
          return builder;
        },
        in(_field: string, value: string[]) {
          queueStates = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve({
            data: jobs
              .filter((job) => job.job_kind === currentKind && queueStates.includes(String(job.queue_state ?? "")))
              .slice(0, 1),
            error: null,
          });
        },
        insert(value: Record<string, unknown>) {
          const row = {
            id: `job-${jobs.length + 1}`,
            attempt_count: 0,
            max_attempts: 5,
            available_at: "2026-07-15T00:00:00.000Z",
            retry_after: null,
            claimed_at: null,
            claimed_by: null,
            claim_expires_at: null,
            last_completed_at: null,
            last_error: null,
            created_at: "2026-07-15T00:00:00.000Z",
            updated_at: "2026-07-15T00:00:00.000Z",
            queue_state: "pending",
            ...value,
          };
          jobs.push(row);
          return {
            select() {
              return {
                single: async () => ({
                  data: row,
                  error: null,
                }),
              };
            },
          };
        },
      };

      return builder;
    },
  };
}

describe("enqueueOrganizationXeroSync", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reuses active jobs instead of creating duplicate refresh jobs", async () => {
    createAdminSupabaseClient.mockResolvedValue(createAdminClient([]));

    const { enqueueOrganizationXeroSync } = await import("./sync");
    const first = await enqueueOrganizationXeroSync({
      organizationId: "org-1",
      connectionId: "conn-1",
      createdByUserId: "user-1",
      triggerSource: "manual_refresh",
      includeHealthCheck: true,
    });
    const second = await enqueueOrganizationXeroSync({
      organizationId: "org-1",
      connectionId: "conn-1",
      createdByUserId: "user-1",
      triggerSource: "manual_refresh",
      includeHealthCheck: true,
    });

    expect(first.createdCount).toBe(3);
    expect(first.jobs).toHaveLength(3);
    expect(second.createdCount).toBe(0);
    expect(second.jobs).toHaveLength(3);
  });
});
