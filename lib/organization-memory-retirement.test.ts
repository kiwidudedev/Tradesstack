import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("server-only", () => ({}));

function createState() {
  return {
    queueRows: [
      {
        id: "retirement-queue-1",
        organizationId: "org-1",
        memoryId: "memory-1",
        queueState: "claimed",
        attemptCount: 1,
        maxAttempts: 5,
        priority: 180,
        claimToken: "retirement-claim-1",
      },
    ] as Array<Record<string, unknown>>,
    memoryRows: new Map<string, Record<string, unknown>>([
      ["memory-1", {
        id: "memory-1",
        organization_id: "org-1",
        memory_category: "worksheet_pricing",
        memory_type: "assumption_pattern",
        title: "Preferred supplier is ABC",
        summary: "Historic supplier preference memory.",
        confidence_score: 0.21,
        base_confidence_score: 0.26,
        contradiction_count: 2,
        contradiction_strength_score: 0.86,
        reinforcement_count: 0,
        reinforced_supporting_classification_count: 0,
        is_active: true,
        is_user_confirmed: false,
        memory_domain_signature: "domain-1",
        source_revision_hash: "rev-1",
        source_semantic_pool_id: "semantic-pool-1",
        last_reinforced_at: null,
        last_contradicted_at: "2026-04-01T00:00:00.000Z",
        retired_at: null,
        retired_lifecycle_history_id: null,
        retired_by_synthesis_history_id: null,
        retirement_basis_hash: null,
        retirement_reason_summary: null,
        superseded_at: null,
        superseded_by_memory_id: null,
      }],
    ]),
    lifecycleRows: [] as Array<Record<string, unknown>>,
    finalizedInputs: [] as Array<Record<string, unknown>>,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  };
}

function createAdminClient(state: ReturnType<typeof createState>) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ fn, args });
    if (fn === "claim_organization_memory_retirement_batch") {
      return {
        data: state.queueRows,
        error: null,
      };
    }
    if (fn === "finalize_organization_memory_retirement_batch") {
      state.finalizedInputs = Array.isArray(args.p_inputs) ? args.p_inputs as Array<Record<string, unknown>> : [];
      return {
        data: {
          completedCount: state.finalizedInputs.filter((entry) => entry.queueState === "completed").length,
          retriedCount: state.finalizedInputs.filter((entry) => entry.queueState === "retry_scheduled").length,
          deadLetteredCount: state.finalizedInputs.filter((entry) => entry.queueState === "dead_lettered").length,
        },
        error: null,
      };
    }
    if (fn === "enqueue_organization_memory_retirement_queue") {
      return { data: { count: 1 }, error: null };
    }
    throw new Error(`Unexpected rpc ${fn}`);
  });

  return {
    rpc,
    from: (table: string) => {
      if (table === "organization_memory_items") {
        const filters: Array<{ column: string; value: unknown }> = [];
        let updatePayload: Record<string, unknown> | null = null;
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value });
            return builder;
          }),
          maybeSingle: vi.fn(async () => {
            const row = Array.from(state.memoryRows.values()).find((candidate) =>
              filters.every((filter) => candidate[filter.column] === filter.value),
            );
            return { data: row ?? null, error: null };
          }),
          single: vi.fn(async () => {
            const row = Array.from(state.memoryRows.values()).find((candidate) =>
              filters.every((filter) => candidate[filter.column] === filter.value),
            );
            return { data: row ?? null, error: null };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatePayload = payload;
            return builder;
          }),
          order: vi.fn(() => builder),
          then: vi.fn((resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) => {
            const rows = Array.from(state.memoryRows.values()).filter((candidate) =>
              filters.every((filter) => candidate[filter.column] === filter.value),
            );
            return Promise.resolve(resolve({ data: rows, error: null }));
          }),
        };

        const originalSingle = builder.single;
        builder.single = vi.fn(async () => {
          if (updatePayload) {
            const row = Array.from(state.memoryRows.values()).find((candidate) =>
              filters.every((filter) => candidate[filter.column] === filter.value),
            );
            if (row) {
              Object.assign(row, updatePayload);
            }
            return { data: row ?? null, error: null };
          }
          return originalSingle();
        });

        return builder;
      }

      if (table === "organization_memory_lifecycle_history") {
        const filters: Array<{ column: string; value: unknown }> = [];
        let orderAscending = true;
        const resolveRows = (count?: number) => {
          const rows = state.lifecycleRows
            .filter((candidate) => filters.every((filter) => candidate[filter.column] === filter.value))
            .sort((left, right) => orderAscending
              ? String(left.created_at).localeCompare(String(right.created_at))
              : String(right.created_at).localeCompare(String(left.created_at)));
          return typeof count === "number" ? rows.slice(0, count) : rows;
        };
        const builder = {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            const duplicate = state.lifecycleRows.find((row) => {
              const metadata = row.lifecycle_metadata as Record<string, unknown> | undefined;
              const payloadMetadata = payload.lifecycle_metadata as Record<string, unknown> | undefined;
              return row.organization_id === payload.organization_id
                && row.memory_id === payload.memory_id
                && row.lifecycle_event_type === payload.lifecycle_event_type
                && metadata?.retirementBasisHash === payloadMetadata?.retirementBasisHash;
            });
            if (duplicate) {
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            state.lifecycleRows.push({
              created_at: payload.created_at ?? "2026-06-13T00:00:00.000Z",
              ...payload,
            });
            return { data: null, error: null };
          }),
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value });
            return builder;
          }),
          order: vi.fn((_column: string, options?: { ascending?: boolean }) => {
            orderAscending = options?.ascending !== false;
            return builder;
          }),
          limit: vi.fn(async (count: number) => ({
            data: resolveRows(count),
            error: null,
          })),
        };
        return builder;
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("organization memory retirement worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("retires an eligible memory without changing confidence", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { runOrganizationMemoryRetirementWorker } = await import("./organization-memory-retirement");

    const result = await runOrganizationMemoryRetirementWorker({
      organizationId: "org-1",
      limit: 1,
      gracePeriodDays: 30,
    });

    expect(result.retiredMemoryCount).toBe(1);
    expect(result.noActionCount).toBe(0);
    expect(state.finalizedInputs[0]?.queueState).toBe("completed");
    const memory = state.memoryRows.get("memory-1");
    expect(memory?.is_active).toBe(false);
    expect(memory?.retired_at).toBeTruthy();
    expect(memory?.retired_lifecycle_history_id).toBeTruthy();
    expect(memory?.retirement_basis_hash).toBeTruthy();
    expect(memory?.retirement_reason_summary).toContain("No eligible replacement memory was found");
    expect(memory?.confidence_score).toBe(0.21);
    expect(memory?.superseded_by_memory_id ?? null).toBeNull();
    expect(state.lifecycleRows).toHaveLength(1);
    expect(state.lifecycleRows[0]?.lifecycle_event_type).toBe("memory_retired");
    expect(state.lifecycleRows[0]?.event_origin_type).toBe("retirement_evaluator");
    expect(state.lifecycleRows[0]?.synthesis_history_id ?? null).toBeNull();
    expect(state.lifecycleRows[0]?.synthesis_queue_row_id ?? null).toBeNull();
    expect(state.lifecycleRows[0]?.synthesis_run_id ?? null).toBeNull();
  });

  it("does not retire when a stronger replacement exists in the same domain", async () => {
    const state = createState();
    state.memoryRows.set("memory-2", {
      id: "memory-2",
      organization_id: "org-1",
      is_active: true,
      is_user_confirmed: false,
      memory_domain_signature: "domain-1",
      confidence_score: 0.81,
      reinforcement_count: 2,
      reinforced_supporting_classification_count: 4,
      retired_at: null,
      superseded_at: null,
      superseded_by_memory_id: null,
    });
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { runOrganizationMemoryRetirementWorker } = await import("./organization-memory-retirement");

    const result = await runOrganizationMemoryRetirementWorker({ organizationId: "org-1", limit: 1 });

    expect(result.retiredMemoryCount).toBe(0);
    expect(result.noActionCount).toBe(1);
    expect(result.noActionReasonCounts.replacement_candidate_exists).toBe(1);
    expect(state.lifecycleRows).toHaveLength(0);
    expect(state.memoryRows.get("memory-1")?.is_active).toBe(true);
  });

  it("blocks retirement during the grace period", async () => {
    const state = createState();
    state.memoryRows.get("memory-1")!.last_contradicted_at = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { runOrganizationMemoryRetirementWorker } = await import("./organization-memory-retirement");

    const result = await runOrganizationMemoryRetirementWorker({ organizationId: "org-1", limit: 1, gracePeriodDays: 30 });

    expect(result.retiredMemoryCount).toBe(0);
    expect(result.noActionReasonCounts.grace_period_not_elapsed).toBe(1);
    expect(state.memoryRows.get("memory-1")?.is_active).toBe(true);
  });

  it("blocks retirement when reinforcement is newer than the last contradiction", async () => {
    const state = createState();
    state.memoryRows.get("memory-1")!.last_reinforced_at = "2026-05-01T00:00:00.000Z";
    state.memoryRows.get("memory-1")!.last_contradicted_at = "2026-04-01T00:00:00.000Z";
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { runOrganizationMemoryRetirementWorker } = await import("./organization-memory-retirement");

    const result = await runOrganizationMemoryRetirementWorker({ organizationId: "org-1", limit: 1 });

    expect(result.retiredMemoryCount).toBe(0);
    expect(result.noActionReasonCounts.recently_reinforced).toBe(1);
  });

  it("does not retire user-confirmed or already superseded memories", async () => {
    const state = createState();
    state.memoryRows.get("memory-1")!.is_user_confirmed = true;
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { runOrganizationMemoryRetirementWorker } = await import("./organization-memory-retirement");

    const confirmed = await runOrganizationMemoryRetirementWorker({ organizationId: "org-1", limit: 1 });
    expect(confirmed.noActionReasonCounts.user_confirmed).toBe(1);

    state.memoryRows.get("memory-1")!.is_user_confirmed = false;
    state.memoryRows.get("memory-1")!.superseded_by_memory_id = "memory-replacement";
    const superseded = await runOrganizationMemoryRetirementWorker({ organizationId: "org-1", limit: 1 });
    expect(superseded.noActionReasonCounts.already_superseded).toBe(1);
  });

  it("is idempotent across reruns with the same retirement basis", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { runOrganizationMemoryRetirementWorker } = await import("./organization-memory-retirement");

    const first = await runOrganizationMemoryRetirementWorker({ organizationId: "org-1", limit: 1 });
    expect(first.retiredMemoryCount).toBe(1);

    state.queueRows = [{
      ...state.queueRows[0],
      attemptCount: 2,
      claimToken: "retirement-claim-2",
    }];
    const second = await runOrganizationMemoryRetirementWorker({ organizationId: "org-1", limit: 1 });

    expect(second.retiredMemoryCount).toBe(0);
    expect(second.noActionReasonCounts.already_inactive ?? second.noActionReasonCounts.already_retired ?? 0).toBeGreaterThan(0);
    expect(state.lifecycleRows.filter((row) => row.lifecycle_event_type === "memory_retired")).toHaveLength(1);
  });
});
