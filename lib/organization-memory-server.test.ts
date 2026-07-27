import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePlatformAdmin = vi.fn();
const createAdminSupabaseClient = vi.fn();
const runWorksheetMemoryDerivation = vi.fn();

vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/lib/worksheet-memory-derivation", () => ({
  runWorksheetMemoryDerivation,
}));

vi.mock("server-only", () => ({}));

function createRepairState() {
  return {
    memoryRows: [
      {
        id: "memory-1",
        organization_id: "org-1",
        confidence_score: 0.78,
        confidence_calculation_version: 1,
        last_confidence_history_id: null,
        last_confidence_calculated_at: null,
        base_confidence_score: null,
        confidence_reason_summary: null,
        memory_category: "worksheet_pricing",
        updated_at: "2026-06-12T08:00:00.000Z",
      },
      {
        id: "memory-2",
        organization_id: "org-1",
        confidence_score: 0.66,
        confidence_calculation_version: 1,
        last_confidence_history_id: null,
        last_confidence_calculated_at: null,
        base_confidence_score: null,
        confidence_reason_summary: null,
        memory_category: "worksheet_pricing",
        updated_at: "2026-06-12T07:00:00.000Z",
      },
    ] as Array<Record<string, unknown>>,
    confidenceHistoryRows: [
      {
        id: "confidence-created-1",
        organization_id: "org-1",
        memory_id: "memory-1",
        confidence_after: 0.75,
        calculation_version: 1,
        reason_summary: "Initial memory confidence set from Stage 8 create_memory decision at 0.75.",
        created_at: "2026-06-12T07:59:27.114005+00:00",
      },
    ] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
  };
}

function createRepairAdminClient(state: ReturnType<typeof createRepairState>) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    from: (table: string) => {
      if (table === "organization_memory_items") {
        const filters: Record<string, unknown> = {};
        let limitCount: number | null = null;
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return {
                eq: vi.fn((nextColumn: string, nextValue: unknown) => {
                  filters[nextColumn] = nextValue;
                  return {
                    order: vi.fn(() => ({
                      limit: vi.fn((count: number) => {
                        limitCount = count;
                        const rows = state.memoryRows
                          .filter((row) => Object.entries(filters).every(([key, expected]) => row[key] === expected))
                          .slice(0, limitCount ?? state.memoryRows.length);
                        return Promise.resolve({ data: rows, error: null });
                      }),
                    })),
                  };
                }),
                order: vi.fn(() => ({
                  limit: vi.fn((count: number) => {
                    limitCount = count;
                    const rows = state.memoryRows
                      .filter((row) => Object.entries(filters).every(([key, expected]) => row[key] === expected))
                      .slice(0, limitCount ?? state.memoryRows.length);
                    return Promise.resolve({ data: rows, error: null });
                  }),
                })),
              };
            }),
            order: vi.fn(() => ({
              limit: vi.fn((count: number) => {
                limitCount = count;
                return Promise.resolve({ data: state.memoryRows.slice(0, limitCount ?? state.memoryRows.length), error: null });
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn((column: string, value: unknown) => ({
              eq: vi.fn((nextColumn: string, nextValue: unknown) => {
                const row = state.memoryRows.find((entry) => entry[column] === value && entry[nextColumn] === nextValue);
                if (row) {
                  Object.assign(row, payload);
                  state.updates.push({ id: row.id, ...payload });
                }
                return Promise.resolve({ data: null, error: null });
              }),
            })),
          })),
        };
      }

      if (table === "organization_memory_confidence_history") {
        const filters: Record<string, unknown> = {};
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return {
                in: vi.fn((inColumn: string, values: unknown[]) => {
                  filters[inColumn] = values;
                  return {
                    order: vi.fn(() => {
                      const rows = state.confidenceHistoryRows.filter((row) =>
                        Object.entries(filters).every(([key, expected]) =>
                          Array.isArray(expected) ? expected.includes(row[key]) : row[key] === expected,
                        ),
                      );
                      return Promise.resolve({ data: rows, error: null });
                    }),
                  };
                }),
              };
            }),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("organization memory server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not run legacy worksheet memory derivation by default", async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    createAdminSupabaseClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: { ok: true },
        error: null,
      }),
    });

    const { runOrganizationMemoryDerivation } = await import("./organization-memory-server");
    const result = await runOrganizationMemoryDerivation({
      organizationId: "org-1",
      patternLimit: 100,
    });

    expect(runWorksheetMemoryDerivation).not.toHaveBeenCalled();
    expect(result.legacyWorksheetMemoryDerivationEnabled).toBe(false);
    expect(result.worksheetSemanticMemories).toBeNull();
  });

  it("runs legacy worksheet memory derivation only when explicitly enabled", async () => {
    requirePlatformAdmin.mockResolvedValue(undefined);
    createAdminSupabaseClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: { ok: true },
        error: null,
      }),
    });
    runWorksheetMemoryDerivation.mockResolvedValue({ persistedCount: 3 });

    const { runOrganizationMemoryDerivation } = await import("./organization-memory-server");
    const result = await runOrganizationMemoryDerivation({
      organizationId: "org-1",
      patternLimit: 100,
      includeLegacyWorksheetMemoryDerivation: true,
    });

    expect(runWorksheetMemoryDerivation).toHaveBeenCalledWith({
      organizationId: "org-1",
      limit: 100,
    });
    expect(result.legacyWorksheetMemoryDerivationEnabled).toBe(true);
    expect(result.worksheetSemanticMemories).toEqual({ persistedCount: 3 });
  });

  it("repairs current confidence metadata from the latest immutable confidence history when applied", async () => {
    const state = createRepairState();
    createAdminSupabaseClient.mockReturnValue(createRepairAdminClient(state));

    const { repairOrganizationMemoryConfidenceMetadata } = await import("./organization-memory-server");
    const result = await repairOrganizationMemoryConfidenceMetadata({
      organizationId: "org-1",
      apply: true,
    });

    expect(result.updatedCount).toBe(1);
    expect(result.skippedNoHistoryCount).toBe(1);
    expect(result.records[0]).toMatchObject({
      memoryId: "memory-1",
      status: "updated",
      latestConfidenceHistoryId: "confidence-created-1",
      confidenceBefore: 0.78,
      confidenceAfter: 0.75,
      baseConfidenceScoreBefore: null,
      baseConfidenceScoreAfter: 0.75,
    });
    expect(state.memoryRows[0]).toMatchObject({
      confidence_score: 0.75,
      base_confidence_score: 0.75,
      last_confidence_history_id: "confidence-created-1",
      confidence_reason_summary: "Initial memory confidence set from Stage 8 create_memory decision at 0.75.",
    });
  });

  it("leaves rows without confidence history unchanged and supports dry-run output", async () => {
    const state = createRepairState();
    createAdminSupabaseClient.mockReturnValue(createRepairAdminClient(state));

    const { repairOrganizationMemoryConfidenceMetadata } = await import("./organization-memory-server");
    const result = await repairOrganizationMemoryConfidenceMetadata({
      organizationId: "org-1",
      apply: false,
    });

    expect(result.updatedCount).toBe(1);
    expect(result.skippedNoHistoryCount).toBe(1);
    expect(state.updates).toHaveLength(0);
    expect(result.records.find((record) => record.memoryId === "memory-2")).toMatchObject({
      status: "no_history_unchanged",
      confidenceBefore: 0.66,
      confidenceAfter: 0.66,
    });
  });

  it("repairs confidence metadata idempotently on repeated apply runs", async () => {
    const state = createRepairState();
    createAdminSupabaseClient.mockReturnValue(createRepairAdminClient(state));

    const { repairOrganizationMemoryConfidenceMetadata } = await import("./organization-memory-server");
    const first = await repairOrganizationMemoryConfidenceMetadata({
      organizationId: "org-1",
      apply: true,
    });
    const second = await repairOrganizationMemoryConfidenceMetadata({
      organizationId: "org-1",
      apply: true,
    });

    expect(first.updatedCount).toBe(1);
    expect(second.updatedCount).toBe(0);
    expect(second.unchangedCount).toBe(1);
    expect(second.skippedNoHistoryCount).toBe(1);
    expect(state.updates).toHaveLength(1);
    expect(state.memoryRows[0]).toMatchObject({
      confidence_score: 0.75,
      base_confidence_score: 0.75,
      last_confidence_history_id: "confidence-created-1",
    });
  });
});
