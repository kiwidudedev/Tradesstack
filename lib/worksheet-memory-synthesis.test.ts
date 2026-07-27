import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorksheetMemorySemanticPool,
  WorksheetMemorySemanticPoolEvidenceItem,
} from "@/lib/worksheet-memory-semantic-pools";

const generateEditPlan = vi.fn();
const createAdminSupabaseClient = vi.fn();
const getWorksheetMemorySemanticPoolDetail = vi.fn();
const getWorksheetMemorySemanticPoolEvidence = vi.fn();
const enqueueOrganizationMemoryRetirementCheck = vi.fn();

vi.mock("@/lib/ai/providers/pricing-worksheet/registry", () => ({
  getPricingWorksheetAiProvider: () => ({
    generateEditPlan,
  }),
  getPricingWorksheetAnthropicModel: () => "claude-test",
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/lib/worksheet-memory-semantic-pools", () => ({
  getWorksheetMemorySemanticPoolDetail,
  getWorksheetMemorySemanticPoolEvidence,
}));

vi.mock("@/lib/organization-memory-retirement", () => ({
  enqueueOrganizationMemoryRetirementCheck,
}));

vi.mock("server-only", () => ({}));

function buildSemanticPool(overrides: Partial<WorksheetMemorySemanticPool> = {}): WorksheetMemorySemanticPool {
  return {
    id: overrides.id ?? "semantic-pool-1",
    organizationId: overrides.organizationId ?? "org-1",
    semanticSignature: overrides.semanticSignature ?? "semantic-signature-1",
    domainLabel: overrides.domainLabel ?? "Suspended Ceiling Grid Spacing Parameter Assumption",
    domainSummary: overrides.domainSummary ?? "Neutral evidence domain covering suspended ceiling spacing parameter edits.",
    groupingRationale: overrides.groupingRationale ?? "All evidence refers to the same underlying spacing parameter topic.",
    variantSummary: overrides.variantSummary ?? "Grid Spacing: 1200mm -> 600mm (2)",
    semanticFamily: null,
    semanticType: null,
    poolStatus: overrides.poolStatus ?? "active",
    maturityStatus: overrides.maturityStatus ?? "ready_for_synthesis",
    title: overrides.title ?? null,
    summary: overrides.summary ?? null,
    retrievalGuidance: null,
    scopePayload: {},
    poolValuePayload: {},
    evidenceSummary: {},
    contradictionSummary: {},
    supportCount: 2,
    contradictionCount: 0,
    ignoredCount: 0,
    includedCount: overrides.includedCount ?? 2,
    excludedCount: overrides.excludedCount ?? 0,
    adjacentCount: overrides.adjacentCount ?? 0,
    uncertainCount: overrides.uncertainCount ?? 0,
    worksheetCount: overrides.worksheetCount ?? 2,
    workbookCount: overrides.workbookCount ?? 2,
    projectCount: overrides.projectCount ?? 2,
    averageConfidence: overrides.averageConfidence ?? 0.86,
    firstSeenAt: overrides.firstSeenAt ?? "2026-06-06T10:00:00.000Z",
    lastSeenAt: overrides.lastSeenAt ?? "2026-06-06T12:00:00.000Z",
    lastGroupedAt: overrides.lastGroupedAt ?? "2026-06-06T12:10:00.000Z",
    sourceRevisionHash: overrides.sourceRevisionHash ?? "pool-rev-1",
    createdByRunId: null,
    lastUpdatedByRunId: null,
    createdAt: null,
    updatedAt: null,
  };
}

function buildEvidenceItem(
  sourceEventId: string,
  classificationRecordId: string,
  role: WorksheetMemorySemanticPoolEvidenceItem["evidenceRole"],
  overrides: Partial<WorksheetMemorySemanticPoolEvidenceItem> = {},
): WorksheetMemorySemanticPoolEvidenceItem {
  return {
    sourceEventId,
    evidenceRole: role,
    classificationRecordId,
    linkedByRunId: "run-semantic-1",
    eventType: overrides.eventType ?? "worksheet_assumption_changed",
    occurredAt: overrides.occurredAt ?? "2026-06-06T10:00:00.000Z",
    projectId: overrides.projectId ?? "project-1",
    opportunityId: overrides.opportunityId ?? "opp-1",
    metadata: {
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Sheet 1",
      worksheetName: "Suspended Ceilings",
      tradePackage: "Suspended Ceilings",
      ...(overrides.metadata ?? {}),
    },
    diffData: {
      rowLabel: "Inputs",
      itemLabel: "Grid Spacing",
      columnHeader: "Quantity",
      unit: "mm",
      oldValue: 1200,
      newValue: 600,
      captureCompletenessScore: 0.9,
      ...(overrides.diffData ?? {}),
    },
    classification: {
      overallConfidence: 0.86,
      reasoningSummary: "Repeated estimator spacing adjustment.",
      semanticFields: {
        pageType: { value: "estimate_inputs", confidence: 0.9 },
        itemCategory: { value: "ceiling_grid_layout", confidence: 0.85 },
        normalizedUnit: { value: "mm", confidence: 0.95 },
        costRole: { value: "input_assumption", confidence: 0.8 },
      },
      interpretationPayload: {
        interpretedChange: {
          plainEnglishSummary: "Estimator changed spacing from 1200mm to 600mm.",
          constructionMeaning: "Denser suspended ceiling grid.",
          pricingMeaning: "Likely affects quantities and labour.",
        },
        futureUse: {
          memoryType: "assumption_pattern",
        },
      },
      classifiedAt: "2026-06-06T10:01:00.000Z",
      ...(overrides.classification ?? {}),
    },
  };
}

function buildSemanticPoolEvidencePayload(overrides?: {
  included?: WorksheetMemorySemanticPoolEvidenceItem[];
  uncertain?: WorksheetMemorySemanticPoolEvidenceItem[];
  adjacent?: WorksheetMemorySemanticPoolEvidenceItem[];
  excluded?: WorksheetMemorySemanticPoolEvidenceItem[];
}) {
  const groupedEvidence = overrides?.included ?? [
    buildEvidenceItem("event-1", "classification-1", "included", {
      projectId: "project-1",
      diffData: { itemLabel: "Grid Spacing", oldValue: 1200, newValue: 600 },
    }),
    buildEvidenceItem("event-2", "classification-2", "included", {
      projectId: "project-2",
      metadata: { workbookId: "workbook-2" },
      diffData: { itemLabel: "Main Tee Spacing", oldValue: 1200, newValue: 600 },
    }),
  ];
  const uncertainEvidence = overrides?.uncertain ?? [];
  const adjacentEvidence = overrides?.adjacent ?? [];
  const excludedEvidence = overrides?.excluded ?? [];

  return {
    poolId: "semantic-pool-1",
    domainLabel: "Suspended Ceiling Grid Spacing Parameter Assumption",
    domainSummary: "Neutral evidence domain covering suspended ceiling spacing parameter edits.",
    groupingRationale: "All evidence refers to the same underlying spacing parameter topic.",
    variantSummary: "Grid Spacing: 1200mm -> 600mm (2)",
    roleCounts: {
      included: groupedEvidence.length,
      uncertain: uncertainEvidence.length,
      adjacent: adjacentEvidence.length,
      excluded: excludedEvidence.length,
    },
    groupedEvidence,
    uncertainEvidence,
    adjacentEvidence,
    excludedEvidence,
    evidence: [...groupedEvidence, ...uncertainEvidence, ...adjacentEvidence, ...excludedEvidence],
  };
}

function createState() {
  return {
    queueRows: [
      {
        id: "queue-1",
        organizationId: "org-1",
        semanticPoolId: "semantic-pool-1",
        semanticPoolSignature: "semantic-signature-1",
        sourceRevisionHash: "pool-rev-1",
        maturityStatus: "ready_for_synthesis",
        queueState: "claimed",
        attemptCount: 1,
        maxAttempts: 5,
        priority: 100,
        claimToken: "claim-1",
      },
    ],
    runs: new Map<string, Record<string, unknown>>(),
    memoryItems: new Map<string, Record<string, unknown>>(),
    memoryLinks: new Map<string, Record<string, unknown>>(),
    synthesisHistory: new Map<string, Record<string, unknown>>(),
    lifecycleHistory: new Map<string, Record<string, unknown>>(),
    confidenceHistory: new Map<string, Record<string, unknown>>(),
    failRawEventLinkUpsertOnce: false,
    failMemoryItemUpsertWithDuplicateOnce: false,
    linkUpsertCalls: [] as Array<{ onConflict: string; rows: Array<Record<string, unknown>> }>,
    finalizedInputs: [] as Array<Record<string, unknown>>,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  };
}

function createAdminClient(state: ReturnType<typeof createState>) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ fn, args });
    if (fn === "claim_worksheet_memory_synthesis_batch") {
      const semanticPoolId = typeof args.p_semantic_pool_id === "string" ? args.p_semantic_pool_id : null;
      return {
        data: semanticPoolId
          ? state.queueRows.filter((row) => row.semanticPoolId === semanticPoolId)
          : state.queueRows,
        error: null,
      };
    }

    if (fn === "finalize_worksheet_memory_synthesis_batch") {
      state.finalizedInputs = Array.isArray(args.p_inputs) ? args.p_inputs as Array<Record<string, unknown>> : [];
      return {
        data: {
          count: state.finalizedInputs.length,
          completedCount: state.finalizedInputs.filter((entry) => entry.queueState === "completed").length,
          retriedCount: state.finalizedInputs.filter((entry) => entry.queueState === "retry_scheduled").length,
          deadLetteredCount: state.finalizedInputs.filter((entry) => entry.queueState === "dead_lettered").length,
        },
        error: null,
      };
    }

    if (fn === "replace_organization_memory_provenance_links") {
      const organizationMemoryItemId = String(args.p_organization_memory_item_id);
      const organizationId = String(args.p_organization_id);
      const records = Array.isArray(args.p_records) ? args.p_records as Array<Record<string, unknown>> : [];
      state.linkUpsertCalls.push({
        onConflict: "replace_organization_memory_provenance_links",
        rows: records,
      });
      if (state.failRawEventLinkUpsertOnce) {
        state.failRawEventLinkUpsertOnce = false;
        return {
          data: null,
          error: { message: "replace provenance failed" },
        };
      }
      for (const [key, row] of Array.from(state.memoryLinks.entries())) {
        if (
          row.organization_memory_item_id === organizationMemoryItemId
          && row.organization_id === organizationId
          && (
            row.source_event_id
            || ["worksheet_memory_semantic_pool", "worksheet_event_classification", "organization_memory_item"].includes(String(row.source_entity_type ?? ""))
          )
        ) {
          state.memoryLinks.delete(key);
        }
      }
      for (const row of records) {
        const key = row.source_event_id
          ? `${row.organization_memory_item_id}:${row.link_type}:${row.source_event_id}`
          : `${row.organization_memory_item_id}:${row.link_type}:${row.source_entity_type}:${row.source_entity_id}`;
        state.memoryLinks.set(key, row);
      }
      return {
        data: {
          count: records.length,
          ids: records.map((row, index) => row.source_event_id ?? row.source_entity_id ?? `link-${index + 1}`),
        },
        error: null,
      };
    }

    throw new Error(`Unexpected rpc ${fn}`);
  });

  const from = (table: string) => {
    if (table === "worksheet_memory_synthesis_runs") {
      const builder = {
        insert: vi.fn((payload: Record<string, unknown>) => {
          state.runs.set(String(payload.id), payload);
          return Promise.resolve({ error: null });
        }),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn((column: string, value: unknown) => {
            const existing = state.runs.get(String(value)) ?? {};
            state.runs.set(String(value), { ...existing, ...payload });
            return Promise.resolve({ error: null });
          }),
        })),
      };
      return builder;
    }

    if (table === "organization_memory_synthesis_history") {
      const builder = {
        insert: vi.fn((payload: Record<string, unknown>) => {
          const key = [
            payload.organization_id,
            payload.synthesis_queue_row_id,
            payload.synthesis_run_id,
          ].join(":");
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => {
                if (state.synthesisHistory.has(key)) {
                  return Promise.resolve({
                    data: null,
                    error: { code: "23505", message: "duplicate key value violates unique constraint" },
                  });
                }
                state.synthesisHistory.set(key, {
                  id: payload.id ?? `history-${state.synthesisHistory.size + 1}`,
                  created_at: payload.created_at ?? "2026-06-06T10:02:00.000Z",
                  ...payload,
                });
                return Promise.resolve({
                  data: state.synthesisHistory.get(key),
                  error: null,
                });
              }),
            })),
          };
        }),
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn((count: number) => Promise.resolve({
          data: Array.from(state.synthesisHistory.values()).slice(0, count),
          error: null,
        })),
      };
      return builder;
    }

    if (table === "organization_memory_lifecycle_history") {
      const resolveRows = () => {
        let rows = Array.from(state.lifecycleHistory.values());
        rows = rows.filter((row) => {
          return Object.entries(builder._filters).every(([column, expected]) => row[column] === expected);
        });
        if (builder._orderColumn) {
          rows = rows.sort((left, right) => {
            const orderColumn = builder._orderColumn;
            const leftValue = String(left[orderColumn] ?? "");
            const rightValue = String(right[orderColumn] ?? "");
            return builder._ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
          });
        }
        return rows;
      };
      const builder = {
        insert: vi.fn((payload: Record<string, unknown>) => {
          const key = [
            payload.organization_id,
            payload.memory_id,
            payload.synthesis_history_id,
            payload.lifecycle_event_type,
          ].join(":");
          if (state.lifecycleHistory.has(key)) {
            return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
          }
          state.lifecycleHistory.set(key, {
            id: payload.id ?? `lifecycle-${state.lifecycleHistory.size + 1}`,
            created_at: payload.created_at ?? "2026-06-06T10:02:30.000Z",
            ...payload,
          });
          return Promise.resolve({ data: null, error: null });
        }),
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          builder._filters[column] = value;
          return builder;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          builder._orderColumn = column;
          builder._ascending = options?.ascending !== false;
          return builder;
        }),
        limit: vi.fn((count: number) => Promise.resolve({
          data: resolveRows().slice(0, count),
          error: null,
        })),
        then: vi.fn((onFulfilled?: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
          Promise.resolve({
            data: resolveRows(),
            error: null,
          }).then((value) => onFulfilled ? onFulfilled(value) : value),
        ),
        _filters: {} as Record<string, unknown>,
        _orderColumn: null as string | null,
        _ascending: true,
      };
      return builder;
    }

    if (table === "organization_memory_confidence_history") {
      const resolveRows = () => {
        let rows = Array.from(state.confidenceHistory.values());
        rows = rows.filter((row) => {
          return Object.entries(builder._filters).every(([column, expected]) => row[column] === expected);
        });
        if (builder._orderColumn) {
          rows = rows.sort((left, right) => {
            const orderColumn = builder._orderColumn;
            const leftValue = String(left[orderColumn] ?? "");
            const rightValue = String(right[orderColumn] ?? "");
            return builder._ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
          });
        }
        return rows;
      };
      const builder = {
        insert: vi.fn((payload: Record<string, unknown>) => {
          const lifecycleHistoryId = String(payload.lifecycle_history_id ?? "");
          const key = lifecycleHistoryId.length > 0
            ? [
                payload.organization_id,
                payload.memory_id,
                lifecycleHistoryId,
                payload.reason_type,
              ].join(":")
            : `${payload.organization_id}:${payload.memory_id}:${payload.reason_type}:${state.confidenceHistory.size + 1}`;
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => {
                if (state.confidenceHistory.has(key)) {
                  return Promise.resolve({
                    data: null,
                    error: { code: "23505", message: "duplicate key value violates unique constraint" },
                  });
                }
                state.confidenceHistory.set(key, {
                  id: payload.id ?? `confidence-${state.confidenceHistory.size + 1}`,
                  created_at: payload.created_at ?? "2026-06-06T10:03:00.000Z",
                  ...payload,
                });
                return Promise.resolve({
                  data: state.confidenceHistory.get(key),
                  error: null,
                });
              }),
            })),
          };
        }),
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          builder._filters[column] = value;
          return builder;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          builder._orderColumn = column;
          builder._ascending = options?.ascending !== false;
          return builder;
        }),
        limit: vi.fn((count: number) => Promise.resolve({
          data: resolveRows().slice(0, count),
          error: null,
        })),
        then: vi.fn((onFulfilled?: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
          Promise.resolve({
            data: resolveRows(),
            error: null,
          }).then((value) => onFulfilled ? onFulfilled(value) : value),
        ),
        _filters: {} as Record<string, unknown>,
        _orderColumn: null as string | null,
        _ascending: true,
      };
      return builder;
    }

    if (table === "organization_memory_items") {
      const resolveFilteredRows = () => {
        const rows = Array.from(state.memoryItems.values()).filter((row) => {
          return Object.entries(builder._filters).every(([column, expected]) => row[column] === expected);
        });
        return Promise.resolve({
          data: rows,
          error: null,
        });
      };
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          builder._filters[column] = value;
          return builder;
        }),
        order: vi.fn(() => builder),
        then: vi.fn((onFulfilled?: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
          resolveFilteredRows().then((value) => onFulfilled ? onFulfilled(value) : value),
        ),
        limit: vi.fn((count: number) => {
          const rows = Array.from(state.memoryItems.values()).filter((row) => {
            return Object.entries(builder._filters).every(([column, expected]) => row[column] === expected);
          });
          return Promise.resolve({
            data: rows.slice(0, count),
            error: null,
          });
        }),
        single: vi.fn(() => {
          const row = Array.from(state.memoryItems.values()).find((record) => {
            return Object.entries(builder._filters).every(([column, expected]) => record[column] === expected);
          }) ?? null;
          return Promise.resolve({
            data: row,
            error: row ? null : { message: "Not found" },
          });
        }),
        upsert: vi.fn((payload: Record<string, unknown>) => {
          if (state.failMemoryItemUpsertWithDuplicateOnce) {
            state.failMemoryItemUpsertWithDuplicateOnce = false;
            return {
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: null,
                  error: {
                    code: "23505",
                    message: "duplicate key value violates unique constraint organization_memory_items_org_category_type_key_uidx",
                  },
                })),
              })),
            };
          }
          const id = String(payload.id ?? `memory-${state.memoryItems.size + 1}`);
          const existing = state.memoryItems.get(id) ?? Array.from(state.memoryItems.values()).find((row) =>
            row.organization_id === payload.organization_id
            && row.memory_category === payload.memory_category
            && row.memory_type === payload.memory_type
            && row.memory_key === payload.memory_key,
          );
          const next = {
            ...(existing ?? {}),
            ...payload,
            id,
          };
          state.memoryItems.set(id, next);
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: next,
                error: null,
              })),
            })),
          };
        }),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn((column: string, value: unknown) => ({
            eq: vi.fn((nextColumn: string, nextValue: unknown) => ({
              select: vi.fn(() => ({
                single: vi.fn(() => {
                  const row = Array.from(state.memoryItems.values()).find((record) =>
                    record[column] === value && record[nextColumn] === nextValue,
                  );
                  if (!row) {
                    return Promise.resolve({ data: null, error: { message: "Not found" } });
                  }
                  const next = { ...row, ...payload };
                  state.memoryItems.set(String(next.id), next);
                  return Promise.resolve({ data: next, error: null });
                }),
              })),
            })),
            in: vi.fn((inColumn: string, values: string[]) => ({
              select: vi.fn(() => {
                const updated: Array<Record<string, unknown>> = [];
                for (const [id, row] of state.memoryItems.entries()) {
                  if (row[column] === value && values.includes(String(row[inColumn]))) {
                    const next = { ...row, ...payload };
                    state.memoryItems.set(id, next);
                    updated.push(next);
                  }
                }
                return Promise.resolve({ data: updated, error: null });
              }),
            })),
          })),
        })),
        _filters: {} as Record<string, unknown>,
      };
      return builder;
    }

    if (table === "organization_memory_links") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          builder._filters[column] = value;
          return builder;
        }),
        then: vi.fn((onFulfilled?: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) => {
          const rows = Array.from(state.memoryLinks.values()).filter((row) =>
            Object.entries(builder._filters).every(([column, expected]) => row[column] === expected)
          );
          return Promise.resolve({
            data: rows,
            error: null,
          }).then((value) => onFulfilled ? onFulfilled(value) : value);
        }),
        _filters: {} as Record<string, unknown>,
      };
      return builder;
    }

    if (table === "worksheet_memory_semantic_pools" || table === "worksheet_memory_semantic_pool_events") {
      throw new Error(`${table} should not be mutated by synthesis`);
    }

    throw new Error(`Unexpected table ${table}`);
  };

  return { rpc, from };
}

describe("worksheet memory synthesis", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates an organization memory item from a mature semantic pool and links provenance", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Suspended ceilings often tighten grid spacing to 600mm",
        summary: "Across multiple worksheets, estimators repeatedly tightened suspended ceiling spacing from 1200mm to 600mm.",
        confidence: 0.84,
        scope: {
          tradePackage: "Suspended Ceilings",
          itemLabel: "Grid Spacing",
        },
        memoryValue: {
          preferredTransition: "1200_to_600",
        },
        retrievalGuidance: "Use as a cautious worksheet pricing hint for suspended ceilings.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Repeated cross-project evidence supports a cautious company pricing memory.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.createdMemoryCount).toBe(1);
    expect(result.updatedMemoryCount).toBe(0);
    expect(result.reusedMemoryCount).toBe(0);
    expect(result.reconciledMemoryCount).toBe(0);
    expect(result.deactivatedDuplicateMemoryCount).toBe(0);
    expect(result.noMemoryCount).toBe(0);
    expect(Array.from(state.memoryItems.values())).toHaveLength(1);
    const memory = Array.from(state.memoryItems.values())[0];
    expect(memory.memory_category).toBe("worksheet_pricing");
    expect(memory.memory_signature).toBeTruthy();
    expect(memory.memory_domain_signature).toBeTruthy();
    expect(memory.source_revision_hash).toBe("pool-rev-1");
    expect(memory.memory_key).toBe(memory.memory_signature);
    expect(memory.superseded_at ?? null).toBeNull();
    expect(memory.superseded_lifecycle_history_id ?? null).toBeNull();
    expect(memory.superseded_by_synthesis_history_id ?? null).toBeNull();
    expect(memory.supersession_basis_hash ?? null).toBeNull();
    expect(memory.supersession_reason_summary ?? null).toBeNull();
    expect(memory.reinforcement_count).toBe(0);
    expect(memory.last_reinforced_at ?? null).toBeNull();
    expect(memory.base_confidence_score).toBe(0.84);
    expect(memory.confidence_calculation_version).toBe(1);
    expect(memory.last_confidence_history_id).toBeTruthy();
    expect(memory.last_confidence_calculated_at).toBeTruthy();
    expect(memory.confidence_reason_summary).toContain("Initial memory confidence set");
    expect(memory.evidence_summary).toMatchObject({
      synthesisQueueRowId: "queue-1",
      synthesisDecision: "create_memory",
      includedCount: 2,
      uncertainCount: 0,
      adjacentCount: 0,
      excludedCount: 0,
      supportingEvidenceCount: 2,
    });
    expect(typeof (memory.evidence_summary as Record<string, unknown>).synthesisRunId).toBe("string");
    expect(state.synthesisHistory.size).toBe(1);
    const history = Array.from(state.synthesisHistory.values())[0];
    expect(history?.synthesis_decision).toBe("create_memory");
    expect(history?.persistence_outcome).toBe("created");
    expect(history?.memory_id).toBe(memory.id);
    expect(history?.provider).toBe("anthropic");
    expect(history?.model).toBe("claude-test");
    expect(history?.evidence_snapshot).toMatchObject({
      semanticPoolEventIds: ["event-1", "event-2"],
      evidenceCounts: {
        includedCount: 2,
        supportingEvidenceCount: 2,
      },
      selectedEvidenceByRole: {
        supportingEvidenceEventIds: ["event-1", "event-2"],
        supportingClassificationRecordIds: ["classification-1", "classification-2"],
      },
    });
    expect(history?.before_memory_snapshot).toBeNull();
    expect(history?.after_memory_snapshot).toMatchObject({
      memoryType: "assumption_pattern",
      sourceSemanticPoolId: "semantic-pool-1",
      memoryDomainSignature: memory.memory_domain_signature,
    });
    expect(state.lifecycleHistory.size).toBe(1);
    const lifecycle = Array.from(state.lifecycleHistory.values())[0];
    expect(lifecycle?.lifecycle_event_type).toBe("memory_created");
    expect(lifecycle?.event_origin_type).toBe("synthesis");
    expect(lifecycle?.memory_id).toBe(memory.id);
    expect(lifecycle?.synthesis_history_id).toBe(history?.id);
    expect(lifecycle?.before_memory_snapshot).toBeNull();
    expect(lifecycle?.after_memory_snapshot).toMatchObject({
      memoryType: "assumption_pattern",
      sourceRevisionHash: "pool-rev-1",
      memoryDomainSignature: memory.memory_domain_signature,
    });
    expect(state.confidenceHistory.size).toBe(1);
    const confidenceHistory = Array.from(state.confidenceHistory.values())[0];
    expect(confidenceHistory?.reason_type).toBe("memory_created");
    expect(confidenceHistory?.confidence_before ?? null).toBeNull();
    expect(confidenceHistory?.confidence_after).toBe(0.84);
    expect(confidenceHistory?.lifecycle_history_id).toBe(lifecycle?.id);
    expect(confidenceHistory?.synthesis_history_id).toBe(history?.id);
    const links = Array.from(state.memoryLinks.values());
    expect(links.some((row) => row.source_entity_type === "worksheet_memory_semantic_pool" && row.source_entity_id === "semantic-pool-1")).toBe(true);
    expect(links.filter((row) => row.source_event_id).map((row) => row.source_event_id).sort()).toEqual(["event-1", "event-2"]);
    expect(links.filter((row) => row.source_entity_type === "worksheet_event_classification").map((row) => row.source_entity_id).sort()).toEqual([
      "classification-1",
      "classification-2",
    ]);
    const systemPrompt = generateEditPlan.mock.calls[0]?.[0]?.systemPrompt as string;
    expect(systemPrompt).toContain("The semantic pool already groups related evidence. Do not regroup it.");
    expect(state.linkUpsertCalls.map((call) => call.onConflict)).toEqual([
      "replace_organization_memory_provenance_links",
    ]);
  });

  it("derives snapshot evidence counts from persisted semantic-pool membership instead of stale semantic pool row counts", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool({
      includedCount: 0,
      uncertainCount: 0,
      adjacentCount: 0,
      excludedCount: 0,
    }));
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-2", "classification-2", "included"),
        buildEvidenceItem("event-3", "classification-3", "included"),
      ],
      uncertain: [buildEvidenceItem("event-uncertain", "classification-uncertain", "uncertain")],
      adjacent: [buildEvidenceItem("event-adjacent", "classification-adjacent", "adjacent")],
      excluded: [buildEvidenceItem("event-excluded", "classification-excluded", "excluded")],
    }));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Counts should follow packet membership",
        summary: "Uses exact packet membership counts instead of stale semantic row counters.",
        confidence: 0.81,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: ["event-uncertain"],
        adjacentEvidenceEventIds: ["event-adjacent"],
        excludedEvidenceEventIds: ["event-excluded"],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Packet membership is authoritative for snapshot counts.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    const memory = Array.from(state.memoryItems.values())[0];
    expect(memory.evidence_summary).toMatchObject({
      includedCount: 3,
      uncertainCount: 1,
      adjacentCount: 1,
      excludedCount: 1,
      supportingEvidenceCount: 2,
      uncertainEvidenceCount: 1,
      adjacentEvidenceCount: 1,
      excludedEvidenceCount: 1,
    });
  });

  it("accepts Anthropic-safe stringified scope and memoryValue fields for strong positive pools", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool({
      id: "semantic-pool-strong",
      semanticSignature: "semantic-signature-strong",
      sourceRevisionHash: "pool-rev-strong",
      includedCount: 3,
      worksheetCount: 3,
      workbookCount: 3,
      projectCount: 3,
      averageConfidence: 0.88,
    }));
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included", {
          projectId: "project-1",
          diffData: { itemLabel: "Perimeter Waste Factor", oldValue: 12, newValue: 10, unit: "%" },
        }),
        buildEvidenceItem("event-2", "classification-2", "included", {
          projectId: "project-2",
          metadata: { workbookId: "workbook-2" },
          diffData: { itemLabel: "Perimeter Waste Factor", oldValue: 12, newValue: 10, unit: "%" },
        }),
        buildEvidenceItem("event-3", "classification-3", "included", {
          projectId: "project-3",
          metadata: { workbookId: "workbook-3", sheetId: "sheet-3" },
          diffData: { itemLabel: "Perimeter Waste Factor", oldValue: 12, newValue: 10, unit: "%" },
        }),
      ],
    }));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Perimeter waste factor is often reduced from 12% to 10%",
        summary: "Repeated cross-project evidence supports a cautious worksheet pricing memory.",
        confidence: 0.87,
        scope: JSON.stringify({
          tradePackage: "Suspended Ceilings",
          itemLabel: "Perimeter Waste Factor",
        }),
        memoryValue: JSON.stringify({
          preferredTransition: "12_to_10",
          dominantDirection: "decrease",
        }),
        retrievalGuidance: "Use as a cautious worksheet pricing hint.",
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Repeated cross-project evidence supports one durable worksheet memory.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.createdMemoryCount).toBe(1);
    expect(result.updatedMemoryCount).toBe(0);
    expect(result.reusedMemoryCount).toBe(0);
    expect(result.reconciledMemoryCount).toBe(0);
    const memory = Array.from(state.memoryItems.values())[0];
    expect(memory.memory_signature).toBeTruthy();
    expect(memory.source_revision_hash).toBe("pool-rev-strong");
    expect(memory.memory_value).toMatchObject({
      preferredTransition: "12_to_10",
      dominantDirection: "decrease",
      scope: {
        tradePackage: "Suspended Ceilings",
        itemLabel: "Perimeter Waste Factor",
      },
      retrievalGuidance: "Use as a cautious worksheet pricing hint.",
    });
  });

  it("enqueues and claims only the requested semantic pool in targeted mode", async () => {
    const state = createState();
    state.queueRows = [
      state.queueRows[0],
      {
        ...state.queueRows[0],
        id: "queue-2",
        semanticPoolId: "semantic-pool-2",
        semanticPoolSignature: "semantic-signature-2",
        sourceRevisionHash: "pool-rev-2",
        claimToken: "claim-2",
      },
    ];
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "no_memory",
        reasoningSummary: "Targeted run should process only the requested pool.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
      limit: 1,
    });

    expect(result.claimedJobCount).toBe(1);
    expect(generateEditPlan).toHaveBeenCalledTimes(1);
    expect(state.finalizedInputs).toHaveLength(1);
    expect(state.finalizedInputs[0]?.id).toBe("queue-1");
    const claimCall = state.rpcCalls.find((call) => call.fn === "claim_worksheet_memory_synthesis_batch");
    expect(claimCall?.args.p_semantic_pool_id).toBe("semantic-pool-1");
  });

  it("writes nothing when Anthropic returns no_memory for weak or mixed evidence", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool({
      uncertainCount: 1,
      includedCount: 1,
      projectCount: 1,
    }));
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [buildEvidenceItem("event-1", "classification-1", "included")],
      uncertain: [buildEvidenceItem("event-uncertain", "classification-uncertain", "uncertain", {
        diffData: { oldValue: 600, newValue: 1200 },
      })],
    }));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "no_memory",
        reasoningSummary: "Evidence is mixed and too unstable to form durable company memory.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.noMemoryCount).toBe(1);
    expect(result.createdMemoryCount).toBe(0);
    expect(result.updatedMemoryCount).toBe(0);
    expect(result.reusedMemoryCount).toBe(0);
    expect(result.reconciledMemoryCount).toBe(0);
    expect(result.organizationMemoryWriteCount).toBe(0);
    expect(state.memoryItems.size).toBe(0);
    expect(state.memoryLinks.size).toBe(0);
    expect(state.synthesisHistory.size).toBe(1);
    expect(state.lifecycleHistory.size).toBe(0);
    expect(state.confidenceHistory.size).toBe(0);
    const history = Array.from(state.synthesisHistory.values())[0];
    expect(history?.persistence_outcome).toBe("none");
    expect(history?.memory_id).toBeNull();
    expect(history?.after_memory_snapshot).toBeNull();
  });

  it.each([
    {
      label: "adjacent-only",
      payload: buildSemanticPoolEvidencePayload({
        included: [],
        adjacent: [buildEvidenceItem("event-adjacent", "classification-adjacent", "adjacent")],
      }),
    },
    {
      label: "uncertain-only",
      payload: buildSemanticPoolEvidencePayload({
        included: [],
        uncertain: [buildEvidenceItem("event-uncertain", "classification-uncertain", "uncertain")],
      }),
    },
    {
      label: "excluded-only",
      payload: buildSemanticPoolEvidencePayload({
        included: [],
        excluded: [buildEvidenceItem("event-excluded", "classification-excluded", "excluded")],
      }),
    },
    {
      label: "zero-included mixed non-supporting",
      payload: buildSemanticPoolEvidencePayload({
        included: [],
        uncertain: [buildEvidenceItem("event-uncertain", "classification-uncertain", "uncertain")],
        adjacent: [buildEvidenceItem("event-adjacent", "classification-adjacent", "adjacent")],
        excluded: [buildEvidenceItem("event-excluded", "classification-excluded", "excluded")],
      }),
    },
  ])("treats $label pools as truthful no_memory without dead-lettering", async ({ payload }) => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool({
      includedCount: 0,
      uncertainCount: payload.roleCounts.uncertain,
      adjacentCount: payload.roleCounts.adjacent,
      excludedCount: payload.roleCounts.excluded,
    }));
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(payload);

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.noMemoryCount).toBe(1);
    expect(result.deadLetteredJobCount).toBe(0);
    expect(result.completedJobCount).toBe(1);
    expect(result.createdMemoryCount).toBe(0);
    expect(result.reinforcedMemoryCount).toBe(0);
    expect(result.organizationMemoryWriteCount).toBe(0);
    expect(generateEditPlan).not.toHaveBeenCalled();
    expect(state.memoryItems.size).toBe(0);
    expect(state.lifecycleHistory.size).toBe(0);
    expect(state.confidenceHistory.size).toBe(0);
    expect(state.finalizedInputs[0]).toMatchObject({
      id: "queue-1",
      queueState: "completed",
    });
    const history = Array.from(state.synthesisHistory.values())[0];
    expect(history?.synthesis_decision).toBe("no_memory");
    expect(history?.persistence_outcome).toBe("none");
    expect(history?.reasoning_summary).toBe("no_included_evidence: No included evidence available for synthesis.");
  });

  it("does not duplicate memory or links on repeated runs for the same pool revision", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    generateEditPlan
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          decision: "create_memory",
          memoryCategory: "worksheet_pricing",
          memoryType: "assumption_pattern",
          title: "Suspended ceilings often tighten grid spacing to 600mm",
          summary: "Repeated suspended ceiling spacing adjustments support a cautious memory.",
          confidence: 0.84,
          scope: { tradePackage: "Suspended Ceilings" },
          memoryValue: { preferredTransition: "1200_to_600" },
          retrievalGuidance: "Use carefully.",
          supportingEvidenceEventIds: ["event-1", "event-2"],
          uncertainEvidenceEventIds: [],
          adjacentEvidenceEventIds: [],
          excludedEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          reasoningSummary: "Repeated evidence supports a single durable memory.",
        },
      })
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          decision: "create_memory",
          memoryCategory: "worksheet_pricing",
          memoryType: "parameter_default_change",
          title: "Grid spacing default revised",
          summary: "Equivalent conclusion with different wording should reuse the same memory.",
          confidence: 0.86,
          scope: { tradePackage: "Suspended Ceilings" },
          memoryValue: { preferredTransition: "1200_to_600", defaultState: "600mm" },
          retrievalGuidance: "Use carefully.",
          supportingEvidenceEventIds: ["event-1", "event-2"],
          uncertainEvidenceEventIds: [],
          adjacentEvidenceEventIds: [],
          excludedEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          reasoningSummary: "Same pool revision with wording drift should update, not fork.",
        },
      });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const first = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });
    const second = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(first.createdMemoryCount).toBe(1);
    expect(second.createdMemoryCount).toBe(0);
    expect(second.reusedMemoryCount).toBe(1);
    expect(second.updatedMemoryCount).toBe(0);
    expect(second.reconciledMemoryCount).toBe(0);
    expect(second.reinforcedMemoryCount).toBe(0);
    expect(state.synthesisHistory.size).toBe(2);
    expect(state.lifecycleHistory.size).toBe(2);
    expect(state.confidenceHistory.size).toBe(1);
    const historyRows = Array.from(state.synthesisHistory.values());
    expect(historyRows[0]?.persistence_outcome).toBe("created");
    expect(historyRows[1]?.persistence_outcome).toBe("reused");
    const lifecycleRows = Array.from(state.lifecycleHistory.values());
    expect(lifecycleRows[0]?.lifecycle_event_type).toBe("memory_created");
    expect(lifecycleRows[1]?.lifecycle_event_type).toBe("memory_reused");
    expect(state.memoryItems.size).toBe(1);
    const memory = Array.from(state.memoryItems.values())[0];
    expect(memory.memory_type).toBe("parameter_default_change");
    expect(memory.source_semantic_pool_id).toBe("semantic-pool-1");
    expect(memory.reinforcement_count).toBe(0);
    expect(memory.contradiction_count).toBe(0);
    expect(memory.last_reinforced_at ?? null).toBeNull();
    expect(memory.last_contradicted_at ?? null).toBeNull();
    expect(memory.last_contradicted_synthesis_history_id ?? null).toBeNull();
    expect(memory.last_contradicted_lifecycle_history_id ?? null).toBeNull();
    expect(memory.last_contradicted_source_revision_hash ?? null).toBeNull();
    expect(memory.contradiction_basis_hash ?? null).toBeNull();
    expect(memory.contradicted_supporting_classification_count).toBe(0);
    expect(memory.contradiction_strength_score ?? null).toBeNull();
    expect(memory.last_confidence_history_id).toBeTruthy();
    expect(state.memoryLinks.size).toBe(5);
  });

  it("reports duplicate active memory cleanup separately from the reused canonical memory write", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    state.memoryItems.set("memory-1", {
      id: "memory-1",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: "stable-1",
      memory_signature: "stable-1",
      source_semantic_pool_id: "semantic-pool-1",
      title: "Original active memory",
      summary: "Original summary",
      memory_value: {},
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 1,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "pool-rev-1",
    });
    state.memoryItems.set("memory-2", {
      id: "memory-2",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "drifted_type",
      memory_key: "stable-2",
      memory_signature: "stable-2",
      source_semantic_pool_id: "semantic-pool-1",
      title: "Duplicate active memory",
      summary: "Duplicate summary",
      memory_value: {},
      evidence_summary: {},
      confidence_score: 0.72,
      reinforcement_count: 1,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:05:00.000Z",
      last_derived_at: "2026-06-05T10:05:00.000Z",
      source_revision_hash: "pool-rev-1",
    });
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Canonical memory",
        summary: "Should reuse the first active memory and deactivate the duplicate.",
        confidence: 0.85,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Duplicate active memories should be collapsed during the reused write.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.createdMemoryCount).toBe(0);
    expect(result.reusedMemoryCount).toBe(1);
    expect(result.updatedMemoryCount).toBe(0);
    expect(result.deactivatedDuplicateMemoryCount).toBe(1);
    const history = Array.from(state.synthesisHistory.values())[0];
    expect(history?.persistence_outcome).toBe("reused");
    expect(history?.duplicate_deactivation_snapshot).toMatchObject({
      duplicateCount: 1,
      duplicateMemoryIds: ["memory-2"],
    });
    expect(state.memoryItems.get("memory-1")?.is_active).toBe(true);
    expect(state.memoryItems.get("memory-2")?.is_active).toBe(false);
    const lifecycle = Array.from(state.lifecycleHistory.values())[0];
    expect(lifecycle?.lifecycle_event_type).toBe("memory_reused");
  });

  it("reconciles stale provenance links when the same memory is resynthesized with changed evidence roles", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence
      .mockResolvedValueOnce(buildSemanticPoolEvidencePayload({
        included: [buildEvidenceItem("event-1", "classification-1", "included")],
        uncertain: [buildEvidenceItem("event-2", "classification-2", "uncertain")],
      }))
      .mockResolvedValueOnce(buildSemanticPoolEvidencePayload({
        included: [buildEvidenceItem("event-1", "classification-1", "included")],
        adjacent: [buildEvidenceItem("event-2", "classification-2", "adjacent")],
      }));
    generateEditPlan
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          decision: "create_memory",
          memoryCategory: "worksheet_pricing",
          memoryType: "assumption_pattern",
          title: "Reconciling memory",
          summary: "First synthesis run.",
          confidence: 0.8,
          scope: { tradePackage: "Suspended Ceilings" },
          memoryValue: { preferredTransition: "1200_to_600" },
          retrievalGuidance: "Use carefully.",
          supportingEvidenceEventIds: ["event-1"],
          uncertainEvidenceEventIds: ["event-2"],
          adjacentEvidenceEventIds: [],
          excludedEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          reasoningSummary: "First run.",
        },
      })
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          decision: "create_memory",
          memoryCategory: "worksheet_pricing",
          memoryType: "assumption_pattern",
          title: "Reconciling memory",
          summary: "Second synthesis run.",
          confidence: 0.8,
          scope: { tradePackage: "Suspended Ceilings" },
          memoryValue: { preferredTransition: "1200_to_600" },
          retrievalGuidance: "Use carefully.",
          supportingEvidenceEventIds: ["event-1"],
          uncertainEvidenceEventIds: [],
          adjacentEvidenceEventIds: ["event-2"],
          excludedEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          reasoningSummary: "Second run changed the non-supporting role.",
        },
      });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const first = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });
    const second = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(first.createdMemoryCount).toBe(1);
    expect(second.createdMemoryCount).toBe(0);
    expect(second.reusedMemoryCount).toBe(1);
    const links = Array.from(state.memoryLinks.values()).filter((row) => row.source_event_id);
    expect(links).toHaveLength(2);
    expect(links.find((row) => row.source_event_id === "event-1")?.link_type).toBe("supporting");
    expect(links.find((row) => row.source_event_id === "event-2")?.link_type).toBe("adjacent");
    expect(links.some((row) => row.source_event_id === "event-2" && row.link_type === "uncertain")).toBe(false);
  });

  it("reuses the same memory across revisions for one semantic pool and replaces stale links", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail
      .mockResolvedValueOnce(buildSemanticPool({
        sourceRevisionHash: "pool-rev-1",
        includedCount: 2,
      }))
      .mockResolvedValueOnce(buildSemanticPool({
        sourceRevisionHash: "pool-rev-1",
        includedCount: 2,
      }))
      .mockResolvedValueOnce(buildSemanticPool({
        sourceRevisionHash: "pool-rev-2",
        includedCount: 1,
        adjacentCount: 1,
      }))
      .mockResolvedValueOnce(buildSemanticPool({
        sourceRevisionHash: "pool-rev-2",
        includedCount: 1,
        adjacentCount: 1,
      }));
    getWorksheetMemorySemanticPoolEvidence
      .mockResolvedValueOnce(buildSemanticPoolEvidencePayload({
        included: [
          buildEvidenceItem("event-1", "classification-1", "included"),
          buildEvidenceItem("event-2", "classification-2", "included"),
        ],
      }))
      .mockResolvedValueOnce(buildSemanticPoolEvidencePayload({
        included: [buildEvidenceItem("event-1", "classification-1", "included")],
        adjacent: [buildEvidenceItem("event-2", "classification-2", "adjacent")],
      }));
    generateEditPlan
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          decision: "create_memory",
          memoryCategory: "worksheet_pricing",
          memoryType: "assumption_pattern",
          title: "Original pool memory",
          summary: "Original revision.",
          confidence: 0.8,
          scope: { tradePackage: "Suspended Ceilings" },
          memoryValue: { preferredTransition: "1200_to_600" },
          retrievalGuidance: "Use carefully.",
          supportingEvidenceEventIds: ["event-1", "event-2"],
          uncertainEvidenceEventIds: [],
          adjacentEvidenceEventIds: [],
          excludedEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          reasoningSummary: "Original revision.",
        },
      })
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          decision: "create_memory",
          memoryCategory: "worksheet_pricing",
          memoryType: "parameter_default_change",
          title: "Updated pool memory",
          summary: "New revision.",
          confidence: 0.82,
          scope: { tradePackage: "Suspended Ceilings" },
          memoryValue: { preferredTransition: "1200_to_600", defaultState: "600mm" },
          retrievalGuidance: "Use carefully.",
          supportingEvidenceEventIds: ["event-1"],
          uncertainEvidenceEventIds: [],
          adjacentEvidenceEventIds: ["event-2"],
          excludedEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          reasoningSummary: "New revision should update the same memory.",
        },
      });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const first = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });
    const originalMemoryId = Array.from(state.memoryItems.values())[0]?.id;
    state.queueRows = [
      {
        ...state.queueRows[0],
        sourceRevisionHash: "pool-rev-2",
      },
    ];
    const second = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(first.createdMemoryCount).toBe(1);
    expect(second.createdMemoryCount).toBe(0);
    expect(second.updatedMemoryCount).toBe(1);
    expect(second.reconciledMemoryCount).toBe(1);
    expect(second.reusedMemoryCount).toBe(0);
    const historyRows = Array.from(state.synthesisHistory.values());
    expect(historyRows).toHaveLength(2);
    expect(historyRows[1]?.persistence_outcome).toBe("updated");
    expect(historyRows[1]?.before_memory_snapshot).toMatchObject({
      sourceRevisionHash: "pool-rev-1",
    });
    expect(historyRows[1]?.after_memory_snapshot).toMatchObject({
      sourceRevisionHash: "pool-rev-2",
    });
    expect(state.memoryItems.size).toBe(1);
    const lifecycleRows = Array.from(state.lifecycleHistory.values());
    expect(lifecycleRows).toHaveLength(2);
    expect(lifecycleRows[0]?.lifecycle_event_type).toBe("memory_created");
    expect(lifecycleRows[1]?.lifecycle_event_type).toBe("memory_reconciled");
    expect(lifecycleRows[1]?.synthesis_history_id).toBe(historyRows[1]?.id);
    expect(lifecycleRows[1]?.before_memory_snapshot).toMatchObject({
      sourceRevisionHash: "pool-rev-1",
    });
    expect(lifecycleRows[1]?.after_memory_snapshot).toMatchObject({
      sourceRevisionHash: "pool-rev-2",
    });
    const memory = Array.from(state.memoryItems.values())[0];
    expect(memory.id).toBe(originalMemoryId);
    expect(memory.source_revision_hash).toBe("pool-rev-2");
    expect(memory.memory_type).toBe("parameter_default_change");
    expect(memory.evidence_summary).toMatchObject({
      supportingEvidenceCount: 1,
      adjacentEvidenceCount: 1,
      includedCount: 1,
      adjacentCount: 1,
      semanticPoolRevisionHash: "pool-rev-2",
    });
    const links = Array.from(state.memoryLinks.values()).filter((row) => row.organization_memory_item_id === originalMemoryId);
    expect(links.find((row) => row.source_event_id === "event-1")?.link_type).toBe("supporting");
    expect(links.find((row) => row.source_event_id === "event-2")?.link_type).toBe("adjacent");
    expect(links.some((row) => row.source_event_id === "event-2" && row.link_type === "supporting")).toBe(false);
    expect(links.find((row) => row.source_entity_type === "worksheet_event_classification" && row.source_entity_id === "classification-2")?.link_type).toBe("adjacent");
  });

  it("preserves uncertain evidence separately from contradiction", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [buildEvidenceItem("event-2", "classification-2", "included")],
      uncertain: [buildEvidenceItem("event-1", "classification-1", "uncertain")],
    }));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Memory with mixed evidence roles",
        summary: "Same event was reported in multiple evidence arrays.",
        confidence: 0.72,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { variant: "mixed" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-2"],
        uncertainEvidenceEventIds: ["event-1"],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Uncertain evidence should remain uncertain instead of becoming contradiction.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    const links = Array.from(state.memoryLinks.values()).filter((row) => row.source_event_id);
    expect(links).toHaveLength(2);
    expect(links.find((row) => row.source_event_id === "event-1")?.link_type).toBe("uncertain");
    expect(links.find((row) => row.source_event_id === "event-2")?.link_type).toBe("supporting");
    const memory = Array.from(state.memoryItems.values())[0];
    expect(memory.contradiction_count).toBe(0);
    expect(memory.evidence_summary).toMatchObject({
      includedCount: 1,
      uncertainCount: 1,
      uncertainEvidenceCount: 1,
      contradictoryEvidenceCount: 0,
    });
  });

  it("rejects role drift instead of silently promoting adjacent or excluded evidence to support", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [buildEvidenceItem("event-1", "classification-1", "included")],
      adjacent: [buildEvidenceItem("event-adjacent", "classification-adjacent", "adjacent")],
      excluded: [buildEvidenceItem("event-excluded", "classification-excluded", "excluded")],
    }));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Role drift memory",
        summary: "This should be rejected.",
        confidence: 0.8,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { invalid: true },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-adjacent", "event-excluded"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "This tries to relabel non-included evidence as support.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.noMemoryCount).toBe(1);
    expect(result.organizationMemoryWriteCount).toBe(0);
    expect(state.memoryItems.size).toBe(0);
    expect(state.memoryLinks.size).toBe(0);
  });

  it("downgrades unsupported contradictory evidence requests to no_memory", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [buildEvidenceItem("event-1", "classification-1", "included")],
      uncertain: [buildEvidenceItem("event-uncertain", "classification-uncertain", "uncertain")],
    }));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Contradictory memory",
        summary: "This should be downgraded.",
        confidence: 0.8,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { invalid: true },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1"],
        uncertainEvidenceEventIds: ["event-uncertain"],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: ["event-uncertain"],
        reasoningSummary: "Stage 7 does not provide contradictory evidence ids yet.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.noMemoryCount).toBe(1);
    expect(state.memoryItems.size).toBe(0);
    expect(state.memoryLinks.size).toBe(0);
  });

  it("preserves adjacent and excluded evidence distinctly in memory provenance", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [buildEvidenceItem("event-1", "classification-1", "included")],
      adjacent: [buildEvidenceItem("event-adjacent", "classification-adjacent", "adjacent")],
      excluded: [buildEvidenceItem("event-excluded", "classification-excluded", "excluded")],
    }));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Preserved non-supporting evidence",
        summary: "Adjacent and excluded evidence should remain non-supporting.",
        confidence: 0.76,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: ["event-adjacent"],
        excludedEvidenceEventIds: ["event-excluded"],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "The conclusion should keep non-supporting evidence separate.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    const links = Array.from(state.memoryLinks.values()).filter((row) => row.source_event_id);
    expect(links.find((row) => row.source_event_id === "event-1")?.link_type).toBe("supporting");
    expect(links.find((row) => row.source_event_id === "event-adjacent")?.link_type).toBe("adjacent");
    expect(links.find((row) => row.source_event_id === "event-excluded")?.link_type).toBe("excluded");
    const memory = Array.from(state.memoryItems.values())[0];
    expect(memory.evidence_summary).toMatchObject({
      includedCount: 1,
      adjacentCount: 1,
      excludedCount: 1,
      supportingEvidenceCount: 1,
      adjacentEvidenceCount: 1,
      excludedEvidenceCount: 1,
    });
  });

  it("deduplicates provenance link batches before upsert", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-2", "classification-2", "included"),
      ],
    }));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Deduped memory",
        summary: "Duplicate ids should not duplicate provenance rows.",
        confidence: 0.8,
        scope: JSON.stringify({ tradePackage: "Suspended Ceilings" }),
        memoryValue: JSON.stringify({ preferredTransition: "1200_to_600" }),
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Duplicate ids should collapse before upsert.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    const replaceCall = state.linkUpsertCalls.find((call) => call.onConflict === "replace_organization_memory_provenance_links");
    expect(replaceCall?.rows?.filter((row) => row.source_event_id)).toHaveLength(2);
    expect(replaceCall?.rows?.filter((row) => row.source_entity_type === "worksheet_event_classification")).toHaveLength(2);
  });

  it("recovers from a partial memory insert by reusing the existing memory row and filling missing provenance links", async () => {
    const state = createState();
    state.failRawEventLinkUpsertOnce = true;
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool({
      sourceRevisionHash: "pool-rev-partial",
    }));
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    generateEditPlan
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          decision: "create_memory",
          memoryCategory: "worksheet_pricing",
          memoryType: "assumption_pattern",
          title: "Recoverable memory",
          summary: "The first attempt inserts the memory row and the retry fills provenance.",
          confidence: 0.84,
          scope: JSON.stringify({ tradePackage: "Suspended Ceilings", itemLabel: "Grid Spacing" }),
          memoryValue: JSON.stringify({ preferredTransition: "1200_to_600" }),
          retrievalGuidance: "Use carefully.",
          supportingEvidenceEventIds: ["event-1", "event-2"],
          uncertainEvidenceEventIds: [],
          adjacentEvidenceEventIds: [],
          excludedEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          reasoningSummary: "Retry should reuse the same memory signature and complete provenance.",
        },
      })
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          decision: "create_memory",
          memoryCategory: "worksheet_pricing",
          memoryType: "assumption_pattern",
          title: "Recoverable memory rerun wording",
          summary: "The retry uses slightly different wording but should still reuse the same row for the same pool revision.",
          confidence: 0.86,
          scope: JSON.stringify({ tradePackage: "Suspended Ceilings", itemLabel: "Grid Spacing", variant: "rerun" }),
          memoryValue: JSON.stringify({ preferredTransition: "1200_to_600", rerunVariant: true }),
          retrievalGuidance: "Use carefully on rerun.",
          supportingEvidenceEventIds: ["event-1", "event-2"],
          uncertainEvidenceEventIds: [],
          adjacentEvidenceEventIds: [],
          excludedEvidenceEventIds: [],
          contradictoryEvidenceEventIds: [],
          reasoningSummary: "Same pool revision should reuse the existing active memory row even if wording drifts.",
        },
      });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const first = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });
    expect(first.retriedJobCount).toBe(1);
    expect(state.memoryItems.size).toBe(1);
    expect(state.memoryLinks.size).toBe(0);
    expect(state.finalizedInputs[0]?.queueState).toBe("retry_scheduled");

    const createdMemory = Array.from(state.memoryItems.values())[0];
    const createdId = createdMemory?.id;

    const second = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });
    expect(second.completedJobCount).toBe(1);
    expect(second.createdMemoryCount).toBe(0);
    expect(second.reusedMemoryCount).toBe(1);
    expect(second.updatedMemoryCount).toBe(0);
    expect(state.memoryItems.size).toBe(1);
    expect(Array.from(state.memoryItems.values())[0]?.id).toBe(createdId);
    expect(state.memoryLinks.size).toBe(5);
    expect(state.finalizedInputs[0]?.queueState).toBe("completed");
    expect(state.synthesisHistory.size).toBe(2);
  });

  it("derives a stable memory domain signature from org, scope, and domain shape instead of wording", async () => {
    const { worksheetMemorySynthesisTestUtils } = await import("./worksheet-memory-synthesis");

    const base = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-1",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: "pricing_pattern",
      semanticType: "spacing_preference",
      scope: { tradePackage: "Suspended Ceilings", itemLabel: "Grid Spacing" },
      semanticScope: { normalizedTradePackage: "suspended ceilings" },
      memoryValue: {
        preferredSupplier: "ABC Interiors",
        scope: { tradePackage: "Suspended Ceilings" },
        retrievalGuidance: "Use carefully.",
      },
      semanticPoolValue: {
        preferredSupplier: "ABC Interiors",
      },
    });
    const wordingDrift = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-1",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: "pricing_pattern",
      semanticType: "spacing_preference",
      scope: { tradePackage: "Suspended Ceilings", itemLabel: "Grid Spacing" },
      semanticScope: { normalizedTradePackage: "suspended ceilings" },
      memoryValue: {
        preferredSupplier: "XYZ Interiors",
        scope: { tradePackage: "Suspended Ceilings" },
        retrievalGuidance: "Different wording should not matter.",
      },
      semanticPoolValue: {
        preferredSupplier: "XYZ Interiors",
      },
    });
    const changedScope = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-1",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: "pricing_pattern",
      semanticType: "spacing_preference",
      scope: { tradePackage: "Partitions", itemLabel: "Grid Spacing" },
      semanticScope: { normalizedTradePackage: "partitions" },
      memoryValue: {
        preferredSupplier: "ABC Interiors",
      },
      semanticPoolValue: {
        preferredSupplier: "ABC Interiors",
      },
    });
    const otherOrg = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-2",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: "pricing_pattern",
      semanticType: "spacing_preference",
      scope: { tradePackage: "Suspended Ceilings", itemLabel: "Grid Spacing" },
      semanticScope: { normalizedTradePackage: "suspended ceilings" },
      memoryValue: {
        preferredSupplier: "ABC Interiors",
      },
      semanticPoolValue: {
        preferredSupplier: "ABC Interiors",
      },
    });

    expect(base).toBe(wordingDrift);
    expect(base).not.toBe(changedScope);
    expect(base).not.toBe(otherOrg);
  });

  it("reinforces an existing similar memory instead of duplicating it", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: {
        preferredTransition: "1200_to_600",
        scope: { tradePackage: "Suspended Ceilings" },
      },
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 2,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      last_reinforced_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "reinforce_existing_memory",
        targetMemoryId: "memory-existing",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "Existing memory is reinforced by more worksheet evidence.",
        confidence: 0.88,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "This should reinforce the existing memory instead of duplicating it.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.reinforcedMemoryCount).toBe(1);
    expect(result.updatedMemoryCount).toBe(1);
    expect(result.reconciledMemoryCount).toBe(0);
    expect(state.memoryItems.size).toBe(1);
    const memory = state.memoryItems.get("memory-existing");
    expect(memory?.summary).toContain("reinforced");
    expect(memory?.source_revision_hash).toBe("pool-rev-1");
    expect(memory?.reinforcement_count).toBe(3);
    expect(memory?.last_reinforced_at).not.toBe("2026-06-05T10:00:00.000Z");
    expect(memory?.last_reinforced_source_revision_hash).toBe("pool-rev-1");
    expect(memory?.reinforcement_basis_hash).toBeTruthy();
    expect(memory?.reinforced_supporting_classification_count).toBe(2);
    expect(memory?.confidence_score).toBeGreaterThan(0.7);
    expect(memory?.confidence_score).toBeLessThanOrEqual(0.92);
    expect(memory?.last_confidence_history_id).toBeTruthy();
    expect(memory?.last_confidence_calculated_at).toBeTruthy();
    expect(memory?.confidence_reason_summary).toContain("Reinforcement recalculated confidence");
    const lifecycleRows = Array.from(state.lifecycleHistory.values());
    expect(lifecycleRows[0]?.lifecycle_event_type).toBe("memory_updated");
    expect(lifecycleRows[0]?.memory_id).toBe("memory-existing");
    expect(lifecycleRows[1]?.lifecycle_event_type).toBe("memory_reinforced");
    expect(lifecycleRows[1]?.lifecycle_metadata).toMatchObject({
      netNewSupportingClassificationRecordIds: ["classification-1", "classification-2"],
      netNewSupportingEventIds: ["event-1", "event-2"],
    });
    expect(Array.from(state.confidenceHistory.values())).toHaveLength(1);
    const confidenceHistory = Array.from(state.confidenceHistory.values())[0];
    expect(confidenceHistory?.reason_type).toBe("reinforcement");
    expect(confidenceHistory?.lifecycle_history_id).toBe(lifecycleRows[1]?.id);
    expect(confidenceHistory?.synthesis_history_id).toBeTruthy();
    expect(confidenceHistory?.confidence_after).toBe(memory?.confidence_score);
  });

  it("reuses the canonical same-pool memory even when that row is inactive", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });

    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Legacy inactive memory",
      summary: "This row was superseded earlier but still owns the stable identity.",
      memory_value: { preferredTransition: "1200_to_600" },
      evidence_summary: {},
      confidence_score: 0.61,
      reinforcement_count: 1,
      contradiction_count: 0,
      is_active: false,
      superseded_by_memory_id: "memory-replacement",
      superseded_at: "2026-06-06T09:00:00.000Z",
      source_revision_hash: "older-rev",
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Legacy inactive memory",
        summary: "Stage 8 should reuse the canonical same-pool row instead of inserting a duplicate.",
        confidence: 0.84,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "The same semantic pool should reconcile onto the original row even if inactive.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.createdMemoryCount).toBe(0);
    expect(result.updatedMemoryCount).toBe(1);
    expect(state.memoryItems.size).toBe(1);
    const memory = state.memoryItems.get("memory-existing");
    expect(memory?.is_active).toBe(true);
    expect(memory?.superseded_by_memory_id ?? null).toBeNull();
    expect(memory?.superseded_at ?? null).toBeNull();
    expect(memory?.source_revision_hash).toBe("pool-rev-1");
  });

  it("recovers from duplicate-key insert collisions by updating the canonical unique-identity row", async () => {
    const state = createState();
    state.failMemoryItemUpsertWithDuplicateOnce = true;
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const semanticPool = buildSemanticPool({
      id: "semantic-pool-new",
      sourceRevisionHash: "pool-rev-new",
    });
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(semanticPool);
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue({
      ...buildSemanticPoolEvidencePayload(),
      poolId: "semantic-pool-new",
    });

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-new",
    });

    state.memoryItems.set("memory-canonical", {
      id: "memory-canonical",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-legacy",
      title: "Canonical legacy memory",
      summary: "Earlier memory with the same unique identity.",
      memory_value: { preferredTransition: "1200_to_600" },
      evidence_summary: {},
      confidence_score: 0.73,
      reinforcement_count: 0,
      contradiction_count: 0,
      is_active: false,
      source_revision_hash: "pool-rev-legacy",
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Canonical legacy memory",
        summary: "Duplicate-key recovery should update the canonical row instead of failing the job.",
        confidence: 0.84,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "A transient insert race should recover into an update.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.deadLetteredJobCount).toBe(0);
    expect(result.createdMemoryCount).toBe(0);
    expect(result.updatedMemoryCount).toBe(1);
    expect(state.memoryItems.size).toBe(1);
    const memory = state.memoryItems.get("memory-canonical");
    expect(memory?.is_active).toBe(true);
    expect(memory?.source_semantic_pool_id).toBe("semantic-pool-new");
    expect(memory?.source_revision_hash).toBe("pool-rev-new");
  });

  it("does not implicitly reinforce a changed-revision reconcile write", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-2", "classification-2", "included"),
        buildEvidenceItem("event-3", "classification-3", "included"),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    const semanticPool = buildSemanticPool();
    const domainSignature = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-1",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: semanticPool.semanticFamily,
      semanticType: semanticPool.semanticType,
      scope: { tradePackage: "Suspended Ceilings" },
      semanticScope: semanticPool.scopePayload,
      memoryValue: { preferredTransition: "1200_to_600" },
      semanticPoolValue: semanticPool.poolValuePayload,
    });

    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      memory_domain_signature: domainSignature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: {},
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 4,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      last_reinforced_at: "2026-06-07T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "Changed revision should reconcile without counting as reinforcement.",
        confidence: 0.9,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Changed semantic revision updates the memory, but is not a reinforcement event.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.createdMemoryCount).toBe(0);
    expect(result.reusedMemoryCount).toBe(0);
    expect(result.updatedMemoryCount).toBe(1);
    expect(result.reconciledMemoryCount).toBe(1);
    expect(result.reinforcedMemoryCount).toBe(0);
    const memory = state.memoryItems.get("memory-existing");
    expect(memory?.confidence_score).toBe(0.7);
    expect(memory?.memory_domain_signature).toBe(domainSignature);
    expect(memory?.reinforcement_count).toBe(4);
    expect(memory?.contradiction_count).toBe(0);
    expect(memory?.last_reinforced_at).toBe("2026-06-07T10:00:00.000Z");
    expect(memory?.last_contradicted_at ?? null).toBeNull();
    expect(memory?.last_contradicted_synthesis_history_id ?? null).toBeNull();
    expect(memory?.last_contradicted_lifecycle_history_id ?? null).toBeNull();
    expect(memory?.last_contradicted_source_revision_hash ?? null).toBeNull();
    expect(memory?.contradiction_basis_hash ?? null).toBeNull();
    expect(memory?.contradicted_supporting_classification_count ?? 0).toBe(0);
    expect(memory?.contradiction_strength_score ?? null).toBeNull();
    expect(memory?.last_confidence_history_id ?? null).toBeNull();
    expect(state.confidenceHistory.size).toBe(0);
    const lifecycle = Array.from(state.lifecycleHistory.values())[0];
    expect(lifecycle?.lifecycle_event_type).toBe("memory_reconciled");
  });

  it("does not reinforce when supporting classifications were already credited by a prior reinforcement event", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });

    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: {
        preferredTransition: "1200_to_600",
        scope: { tradePackage: "Suspended Ceilings" },
      },
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 1,
      contradiction_count: 0,
      reinforced_supporting_classification_count: 2,
      last_reinforced_at: "2026-06-06T10:00:00.000Z",
      last_reinforced_source_revision_hash: "older-rev",
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });
    state.lifecycleHistory.set("org-1:memory-existing:history-prior:memory_reinforced", {
      id: "lifecycle-prior",
      organization_id: "org-1",
      memory_id: "memory-existing",
      lifecycle_event_type: "memory_reinforced",
      source_semantic_pool_id: "semantic-pool-1",
      source_revision_hash: "older-rev",
      synthesis_history_id: "history-prior",
      synthesis_queue_row_id: "queue-prior",
      synthesis_run_id: "run-prior",
      before_memory_snapshot: {},
      after_memory_snapshot: {},
      lifecycle_metadata: {
        reinforcementBasisHash: "basis-prior",
        netNewSupportingClassificationRecordIds: ["classification-1", "classification-2"],
        netNewSupportingEventIds: ["event-1", "event-2"],
      },
      reason_summary: "Prior reinforcement",
      schema_version: 1,
      created_at: "2026-06-06T10:05:00.000Z",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "reinforce_existing_memory",
        targetMemoryId: "memory-existing",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "Same supporting evidence should not reinforce twice.",
        confidence: 0.88,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "No net-new supporting classifications remain.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.reinforcedMemoryCount).toBe(0);
    const memory = state.memoryItems.get("memory-existing");
    expect(memory?.reinforcement_count).toBe(1);
    expect(memory?.last_confidence_history_id ?? null).toBeNull();
    expect(state.confidenceHistory.size).toBe(0);
    expect(Array.from(state.lifecycleHistory.values()).filter((row) => row.lifecycle_event_type === "memory_reinforced")).toHaveLength(1);
  });

  it("does not reinforce when only uncertain, adjacent, or excluded evidence is selected", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [],
      uncertain: [buildEvidenceItem("event-u", "classification-u", "uncertain")],
      adjacent: [buildEvidenceItem("event-a", "classification-a", "adjacent")],
      excluded: [buildEvidenceItem("event-e", "classification-e", "excluded")],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 0,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "No supporting evidence means no reinforcement.",
        confidence: 0.8,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: [],
        uncertainEvidenceEventIds: ["event-u"],
        adjacentEvidenceEventIds: ["event-a"],
        excludedEvidenceEventIds: ["event-e"],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Only non-supporting evidence was selected.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.reinforcedMemoryCount).toBe(0);
    expect(state.memoryItems.get("memory-existing")?.confidence_score).toBe(0.7);
    expect(state.confidenceHistory.size).toBe(0);
    expect(Array.from(state.lifecycleHistory.values()).some((row) => row.lifecycle_event_type === "memory_reinforced")).toBe(false);
  });

  it("blocks reinforcement when contradiction evidence is present", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [buildEvidenceItem("event-1", "classification-1", "included")],
      uncertain: [],
      adjacent: [],
      excluded: [],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 0,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "reinforce_existing_memory",
        targetMemoryId: "memory-existing",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "Contradiction evidence should block reinforcement.",
        confidence: 0.82,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: ["event-1"],
        reasoningSummary: "Contradiction blocks reinforcement.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.reinforcedMemoryCount).toBe(0);
    expect(state.memoryItems.get("memory-existing")?.reinforcement_count).toBe(0);
  });

  it("blocks reinforcement when the memory meaning changes materially", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 0,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "Material scope shift should block reinforcement.",
        confidence: 0.88,
        scope: { tradePackage: "Painting" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Different scope should be treated as meaning drift.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.reinforcedMemoryCount).toBe(0);
    expect(Array.from(state.lifecycleHistory.values()).some((row) => row.lifecycle_event_type === "memory_reinforced")).toBe(false);
  });

  it("emits a contradiction lifecycle row when net-new conflicting evidence crosses the threshold", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included", {
          projectId: "project-1",
          metadata: { workbookId: "workbook-1", sheetId: "sheet-1" },
        }),
        buildEvidenceItem("event-2", "classification-2", "included", {
          projectId: "project-2",
          metadata: { workbookId: "workbook-2", sheetId: "sheet-2" },
          diffData: { itemLabel: "Alternative Supplier", oldValue: "ABC", newValue: "XYZ" },
        }),
        buildEvidenceItem("event-3", "classification-3", "included", {
          projectId: "project-3",
          metadata: { workbookId: "workbook-3", sheetId: "sheet-3" },
          diffData: { itemLabel: "Alternative Supplier", oldValue: "ABC", newValue: "XYZ" },
        }),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Preferred supplier is ABC",
      summary: "Existing supplier preference memory.",
      memory_value: { preferredSupplier: "ABC", scope: { tradePackage: "Suspended Ceilings" } },
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 0,
      contradiction_count: 0,
      contradicted_supporting_classification_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Preferred supplier is ABC",
        summary: "The core memory still exists, but new evidence conflicts with it.",
        confidence: 0.84,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredSupplier: "ABC", scope: { tradePackage: "Suspended Ceilings" } },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: ["event-2", "event-3"],
        reasoningSummary: "Repeated alternative supplier selections now conflict with the existing memory.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.updatedMemoryCount).toBe(1);
    expect(result.reconciledMemoryCount).toBe(1);
    expect(result.contradictedMemoryCount).toBe(1);
    expect(result.reinforcedMemoryCount).toBe(0);
    const lifecycleRows = Array.from(state.lifecycleHistory.values());
    expect(lifecycleRows.some((row) => row.lifecycle_event_type === "memory_reinforced")).toBe(false);
    const contradictionRow = lifecycleRows.find((row) => row.lifecycle_event_type === "memory_contradicted");
    expect(contradictionRow).toBeTruthy();
    expect(contradictionRow?.memory_id).toBe("memory-existing");
    expect(contradictionRow?.synthesis_history_id).toBeTruthy();
    expect(contradictionRow?.before_memory_snapshot).toBeTruthy();
    expect(contradictionRow?.after_memory_snapshot).toBeTruthy();
    expect(contradictionRow?.lifecycle_metadata).toMatchObject({
      contradictingClassificationRecordIds: ["classification-2", "classification-3"],
      contradictingEventIds: ["event-2", "event-3"],
      conflictType: "cross_context_behavior_conflict",
      conflictMagnitude: "moderate",
    });
    expect(typeof contradictionRow?.lifecycle_metadata?.contradictionBasisHash).toBe("string");
    expect(contradictionRow?.lifecycle_metadata?.contradictionStrength).toBeGreaterThanOrEqual(0.5);
    const memory = state.memoryItems.get("memory-existing");
    expect(memory?.contradiction_count).toBe(1);
    expect(memory?.last_contradicted_at).toBeTruthy();
    expect(memory?.last_contradicted_synthesis_history_id).toBeTruthy();
    expect(memory?.last_contradicted_lifecycle_history_id).toBe(contradictionRow?.id);
    expect(memory?.last_contradicted_source_revision_hash).toBe("pool-rev-1");
    expect(memory?.contradicted_supporting_classification_count).toBe(2);
    expect(memory?.contradiction_strength_score).toBeGreaterThanOrEqual(0.5);
    expect(memory?.reinforcement_count).toBe(0);
    expect(memory?.confidence_score).toBeLessThan(0.7);
    expect(memory?.confidence_score).toBeGreaterThanOrEqual(0.15);
    expect(memory?.last_confidence_history_id).toBeTruthy();
    expect(memory?.last_confidence_calculated_at).toBeTruthy();
    expect(String(memory?.confidence_reason_summary ?? "")).toContain("Contradiction recalculated confidence");
    const contradictionHistoryRows = Array.from(state.confidenceHistory.values()).filter((row) => row.reason_type === "contradiction");
    expect(contradictionHistoryRows).toHaveLength(1);
    expect(contradictionHistoryRows[0]?.lifecycle_history_id).toBe(contradictionRow?.id);
    expect(contradictionHistoryRows[0]?.synthesis_history_id).toBe(contradictionRow?.synthesis_history_id);
    expect(Number(contradictionHistoryRows[0]?.confidence_before)).toBe(0.7);
    expect(Number(contradictionHistoryRows[0]?.confidence_after)).toBeLessThan(0.7);
    expect(Number(contradictionHistoryRows[0]?.confidence_delta)).toBeLessThan(0);
    expect(contradictionHistoryRows[0]?.contributor_snapshot).toMatchObject({
      contradictionBasisHash: contradictionRow?.lifecycle_metadata?.contradictionBasisHash,
      contradictingClassificationRecordIds: ["classification-2", "classification-3"],
      contradictingEventIds: ["event-2", "event-3"],
    });
    expect(enqueueOrganizationMemoryRetirementCheck).toHaveBeenCalledWith({
      organizationId: "org-1",
      memoryId: "memory-existing",
    });
  });

  it("does not emit a contradiction event for weak single-classification conflicts", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-2", "classification-2", "included"),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 0,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "One conflicting row is not enough to count as contradiction.",
        confidence: 0.82,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: ["event-2"],
        reasoningSummary: "A single conflicting row should not trigger contradiction.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.contradictedMemoryCount).toBe(0);
    expect(Array.from(state.lifecycleHistory.values()).some((row) => row.lifecycle_event_type === "memory_contradicted")).toBe(false);
    expect(state.memoryItems.get("memory-existing")?.contradiction_count).toBe(0);
    expect(state.memoryItems.get("memory-existing")?.last_contradicted_at ?? null).toBeNull();
    expect(state.memoryItems.get("memory-existing")?.confidence_score).toBe(0.7);
    expect(Array.from(state.confidenceHistory.values()).filter((row) => row.reason_type === "contradiction")).toHaveLength(0);
  });

  it("does not emit the same contradiction twice when duplicate work is replayed", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included", {
          projectId: "project-1",
          metadata: { workbookId: "workbook-1", sheetId: "sheet-1" },
        }),
        buildEvidenceItem("event-2", "classification-2", "included", {
          projectId: "project-2",
          metadata: { workbookId: "workbook-2", sheetId: "sheet-2" },
        }),
        buildEvidenceItem("event-3", "classification-3", "included", {
          projectId: "project-3",
          metadata: { workbookId: "workbook-3", sheetId: "sheet-3" },
        }),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 0,
      contradiction_count: 0,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "Repeated conflicting evidence should not create duplicate contradiction rows.",
        confidence: 0.82,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: ["event-2", "event-3"],
        reasoningSummary: "The same contradiction basis should only be credited once.",
      },
    });

    const first = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });
    expect(first.contradictedMemoryCount).toBe(1);
    const firstContradictionRow = Array.from(state.lifecycleHistory.values()).find((row) => row.lifecycle_event_type === "memory_contradicted");
    expect(firstContradictionRow).toBeTruthy();

    const memory = state.memoryItems.get("memory-existing");
    state.memoryItems.set("memory-existing", {
      ...memory,
      source_revision_hash: "older-rev",
      last_contradicted_source_revision_hash: "even-older-rev",
    });

    const second = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });
    expect(second.contradictedMemoryCount).toBe(0);
    const contradictionRows = Array.from(state.lifecycleHistory.values()).filter((row) => row.lifecycle_event_type === "memory_contradicted");
    expect(contradictionRows).toHaveLength(1);
    expect(state.memoryItems.get("memory-existing")?.contradiction_count).toBe(1);
    const contradictionConfidenceRows = Array.from(state.confidenceHistory.values()).filter((row) => row.reason_type === "contradiction");
    expect(contradictionConfidenceRows).toHaveLength(1);
    const confidenceAfterFirst = Number(contradictionConfidenceRows[0]?.confidence_after);
    expect(state.memoryItems.get("memory-existing")?.confidence_score).toBe(confidenceAfterFirst);
  });

  it("does not reduce contradiction confidence below the configured floor", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included", {
          projectId: "project-1",
          metadata: { workbookId: "workbook-1", sheetId: "sheet-1" },
        }),
        buildEvidenceItem("event-2", "classification-2", "included", {
          projectId: "project-2",
          metadata: { workbookId: "workbook-2", sheetId: "sheet-2" },
        }),
        buildEvidenceItem("event-3", "classification-3", "included", {
          projectId: "project-3",
          metadata: { workbookId: "workbook-3", sheetId: "sheet-3" },
        }),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const signature = worksheetMemorySynthesisTestUtils.buildSemanticPoolMemoryIdentitySignature({
      organizationId: "org-1",
      semanticPoolId: "semantic-pool-1",
    });
    state.memoryItems.set("memory-existing", {
      id: "memory-existing",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: signature,
      memory_signature: signature,
      source_semantic_pool_id: "semantic-pool-1",
      title: "Existing memory",
      summary: "Existing summary",
      memory_value: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
      evidence_summary: {},
      confidence_score: 0.16,
      reinforcement_count: 0,
      contradiction_count: 9,
      contradicted_supporting_classification_count: 12,
      contradiction_strength_score: 0.95,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Existing memory",
        summary: "Strong contradiction should respect the floor.",
        confidence: 0.82,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600", scope: { tradePackage: "Suspended Ceilings" } },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: ["event-2", "event-3"],
        reasoningSummary: "A strong contradiction still cannot push confidence below the floor.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.contradictedMemoryCount).toBe(1);
    const memory = state.memoryItems.get("memory-existing");
    expect(memory?.confidence_score).toBe(0.15);
    const contradictionHistoryRow = Array.from(state.confidenceHistory.values()).find((row) => row.reason_type === "contradiction");
    expect(contradictionHistoryRow?.calculation_inputs).toMatchObject({
      floor: 0.15,
      confidenceBefore: 0.16,
      confidenceAfter: 0.15,
    });
  });

  it("deterministically supersedes a weaker active memory in the same domain", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const semanticPool = buildSemanticPool();
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(semanticPool);
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-2", "classification-2", "included"),
        buildEvidenceItem("event-3", "classification-3", "included", {
          projectId: "project-3",
          metadata: { workbookId: "workbook-3", sheetId: "sheet-3" },
        }),
        buildEvidenceItem("event-4", "classification-4", "included", {
          projectId: "project-4",
          metadata: { workbookId: "workbook-4", sheetId: "sheet-4" },
        }),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const domainSignature = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-1",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: semanticPool.semanticFamily,
      semanticType: semanticPool.semanticType,
      scope: { tradePackage: "Suspended Ceilings" },
      semanticScope: semanticPool.scopePayload,
      memoryValue: { dominantTransition: "1200_to_600_with_variants" },
      semanticPoolValue: semanticPool.poolValuePayload,
    });

    state.memoryItems.set("memory-old", {
      id: "memory-old",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: "old-key",
      memory_signature: "old-signature",
      memory_domain_signature: domainSignature,
      source_semantic_pool_id: "semantic-pool-old",
      title: "Old spacing memory",
      summary: "Old summary",
      memory_value: { dominantTransition: "1200_to_600_with_variants" },
      evidence_summary: { supportingEvidenceCount: 1 },
      confidence_score: 0.33,
      reinforcement_count: 0,
      contradiction_count: 2,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });
    state.memoryItems.set("memory-other-org", {
      id: "memory-other-org",
      organization_id: "org-2",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: "other-key",
      memory_signature: "other-signature",
      memory_domain_signature: domainSignature,
      source_semantic_pool_id: "semantic-pool-other-org",
      title: "Other org memory",
      summary: "Should not be touched.",
      memory_value: { dominantTransition: "1200_to_600_with_variants" },
      evidence_summary: { supportingEvidenceCount: 1 },
      confidence_score: 0.2,
      reinforcement_count: 0,
      contradiction_count: 5,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "other-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Revised suspended ceiling spacing memory",
        summary: "Newer evidence suggests the older spacing memory should be replaced.",
        confidence: 0.81,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { dominantTransition: "1200_to_600_with_variants" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3", "event-4"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "The newer multi-variant pool supersedes the older narrower memory.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.createdMemoryCount).toBe(1);
    expect(result.supersededMemoryCount).toBe(1);
    const replacement = Array.from(state.memoryItems.values()).find((row) =>
      row.id !== "memory-old" && row.organization_id === "org-1"
    );
    const superseded = state.memoryItems.get("memory-old");
    expect(superseded?.is_active).toBe(false);
    expect(superseded?.superseded_by_memory_id).toBe(replacement?.id);
    expect(superseded?.superseded_at).toBeTruthy();
    expect(superseded?.superseded_lifecycle_history_id).toBeTruthy();
    expect(superseded?.superseded_by_synthesis_history_id).toBeTruthy();
    expect(superseded?.supersession_basis_hash).toBeTruthy();
    expect(superseded?.supersession_reason_summary).toContain("Incumbent contradiction count 2 met the supersession threshold");
    expect(replacement?.is_active).toBe(true);
    expect(replacement?.confidence_score).toBe(0.81);
    expect(Array.from(state.memoryLinks.values()).some((row) => row.link_type === "supersession" && row.source_entity_id === "memory-old")).toBe(true);
    const supersessionLifecycle = Array.from(state.lifecycleHistory.values()).find((row) => row.lifecycle_event_type === "memory_superseded");
    expect(supersessionLifecycle?.memory_id).toBe("memory-old");
    expect(supersessionLifecycle?.synthesis_history_id).toBe(superseded?.superseded_by_synthesis_history_id);
    expect(supersessionLifecycle?.lifecycle_metadata).toMatchObject({
      replacementMemoryId: replacement?.id,
      replacementSourceSemanticPoolId: "semantic-pool-1",
      reasonType: "contradiction_threshold",
      domainSignature,
    });
    expect(state.memoryItems.get("memory-other-org")?.is_active).toBe(true);
  });

  it("does not supersede when the replacement confidence delta is too small", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const semanticPool = buildSemanticPool();
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(semanticPool);
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-2", "classification-2", "included"),
        buildEvidenceItem("event-3", "classification-3", "included"),
        buildEvidenceItem("event-4", "classification-4", "included"),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const domainSignature = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-1",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: semanticPool.semanticFamily,
      semanticType: semanticPool.semanticType,
      scope: { tradePackage: "Suspended Ceilings" },
      semanticScope: semanticPool.scopePayload,
      memoryValue: { dominantTransition: "1200_to_600_with_variants" },
      semanticPoolValue: semanticPool.poolValuePayload,
    });

    state.memoryItems.set("memory-old", {
      id: "memory-old",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: "old-key",
      memory_signature: "old-signature",
      memory_domain_signature: domainSignature,
      source_semantic_pool_id: "semantic-pool-old",
      title: "Old spacing memory",
      summary: "Old summary",
      memory_value: { dominantTransition: "1200_to_600_with_variants" },
      evidence_summary: { supportingEvidenceCount: 2 },
      confidence_score: 0.74,
      reinforcement_count: 1,
      contradiction_count: 2,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Replacement candidate",
        summary: "Confidence improvement is too small to supersede.",
        confidence: 0.81,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { dominantTransition: "1200_to_600_with_variants" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3", "event-4"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Not enough separation from the incumbent.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.supersededMemoryCount).toBe(0);
    expect(state.memoryItems.get("memory-old")?.is_active).toBe(true);
    expect(Array.from(state.lifecycleHistory.values()).some((row) => row.lifecycle_event_type === "memory_superseded")).toBe(false);
  });

  it("does not supersede when the replacement lacks reinforcement or supporting evidence strength", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const semanticPool = buildSemanticPool();
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(semanticPool);
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-2", "classification-2", "included"),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const domainSignature = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-1",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: semanticPool.semanticFamily,
      semanticType: semanticPool.semanticType,
      scope: { tradePackage: "Suspended Ceilings" },
      semanticScope: semanticPool.scopePayload,
      memoryValue: { dominantTransition: "1200_to_600_with_variants" },
      semanticPoolValue: semanticPool.poolValuePayload,
    });

    state.memoryItems.set("memory-old", {
      id: "memory-old",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: "old-key",
      memory_signature: "old-signature",
      memory_domain_signature: domainSignature,
      source_semantic_pool_id: "semantic-pool-old",
      title: "Old spacing memory",
      summary: "Old summary",
      memory_value: { dominantTransition: "1200_to_600_with_variants" },
      evidence_summary: { supportingEvidenceCount: 1 },
      confidence_score: 0.2,
      reinforcement_count: 0,
      contradiction_count: 3,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Too weak to supersede",
        summary: "The candidate lacks enough supporting evidence strength.",
        confidence: 0.92,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { dominantTransition: "1200_to_600_with_variants" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "High confidence alone should not supersede without reinforcement or evidence depth.",
      },
    });

    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(result.supersededMemoryCount).toBe(0);
    expect(state.memoryItems.get("memory-old")?.is_active).toBe(true);
    expect(Array.from(state.memoryLinks.values()).some((row) => row.link_type === "supersession")).toBe(false);
  });

  it("does not emit duplicate supersession rows when the same domain is replayed", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const semanticPool = buildSemanticPool();
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(semanticPool);
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload({
      included: [
        buildEvidenceItem("event-1", "classification-1", "included"),
        buildEvidenceItem("event-2", "classification-2", "included"),
        buildEvidenceItem("event-3", "classification-3", "included"),
        buildEvidenceItem("event-4", "classification-4", "included"),
      ],
    }));

    const { worksheetMemorySynthesisTestUtils, runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const domainSignature = worksheetMemorySynthesisTestUtils.buildMemoryDomainSignature({
      organizationId: "org-1",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      semanticFamily: semanticPool.semanticFamily,
      semanticType: semanticPool.semanticType,
      scope: { tradePackage: "Suspended Ceilings" },
      semanticScope: semanticPool.scopePayload,
      memoryValue: { dominantTransition: "1200_to_600_with_variants" },
      semanticPoolValue: semanticPool.poolValuePayload,
    });

    state.memoryItems.set("memory-old", {
      id: "memory-old",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: "old-key",
      memory_signature: "old-signature",
      memory_domain_signature: domainSignature,
      source_semantic_pool_id: "semantic-pool-old",
      title: "Old spacing memory",
      summary: "Old summary",
      memory_value: { dominantTransition: "1200_to_600_with_variants" },
      evidence_summary: { supportingEvidenceCount: 1 },
      confidence_score: 0.33,
      reinforcement_count: 0,
      contradiction_count: 2,
      is_active: true,
      first_derived_at: "2026-06-05T10:00:00.000Z",
      last_derived_at: "2026-06-05T10:00:00.000Z",
      source_revision_hash: "older-rev",
    });

    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Replacement candidate",
        summary: "Replay should not duplicate the supersession event.",
        confidence: 0.81,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { dominantTransition: "1200_to_600_with_variants" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3", "event-4"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Replay should reuse the replacement and leave supersession singular.",
      },
    });

    const first = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });
    const second = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    expect(first.supersededMemoryCount).toBe(1);
    expect(second.supersededMemoryCount).toBe(0);
    expect(Array.from(state.lifecycleHistory.values()).filter((row) => row.lifecycle_event_type === "memory_superseded")).toHaveLength(1);
    expect(Array.from(state.memoryLinks.values()).filter((row) => row.link_type === "supersession")).toHaveLength(1);
  });

  it("retries and dead-letters failed jobs based on attempts", async () => {
    const state = createState();
    state.queueRows = [
      {
        ...state.queueRows[0],
        id: "queue-retry",
        claimToken: "claim-retry",
        attemptCount: 1,
      },
      {
        ...state.queueRows[0],
        id: "queue-dead",
        claimToken: "claim-dead",
        attemptCount: 5,
        maxAttempts: 5,
      },
    ];
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    generateEditPlan.mockRejectedValue(new Error("Provider timeout"));

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 2 });

    expect(result.retriedJobCount).toBe(1);
    expect(result.deadLetteredJobCount).toBe(1);
    expect(state.finalizedInputs.find((entry) => entry.id === "queue-retry")?.queueState).toBe("retry_scheduled");
    expect(state.finalizedInputs.find((entry) => entry.id === "queue-dead")?.queueState).toBe("dead_lettered");
  });

  it("keeps broad runs eligible for multi-pool enqueue and claim behavior", async () => {
    const state = createState();
    state.queueRows = [
      state.queueRows[0],
      {
        ...state.queueRows[0],
        id: "queue-2",
        semanticPoolId: "semantic-pool-2",
        semanticPoolSignature: "semantic-signature-2",
        sourceRevisionHash: "pool-rev-2",
        claimToken: "claim-2",
      },
    ];
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "no_memory",
        reasoningSummary: "Broad run can still process all eligible pools.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    const result = await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 2 });

    expect(result.claimedJobCount).toBe(2);
    expect(generateEditPlan).toHaveBeenCalledTimes(2);
    const claimCall = state.rpcCalls.find((call) => call.fn === "claim_worksheet_memory_synthesis_batch");
    expect(claimCall?.args.p_semantic_pool_id ?? null).toBeNull();
  });

  it("keeps evidence and memory context scoped to a single organization", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    state.memoryItems.set("memory-other-org", {
      id: "memory-other-org",
      organization_id: "org-2",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: "other-key",
      memory_signature: "other-signature",
      source_semantic_pool_id: "semantic-pool-other",
      title: "Other org memory",
      summary: "Should never be sent",
      memory_value: {},
      evidence_summary: {},
      confidence_score: 0.7,
      reinforcement_count: 1,
      contradiction_count: 0,
      is_active: true,
    });
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Scoped memory",
        summary: "Org scoped.",
        confidence: 0.8,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Only same-org context should be used.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1 });

    const userPrompt = generateEditPlan.mock.calls[0]?.[0]?.userPrompt as string;
    expect(userPrompt).not.toContain("Other org memory");
  });

  it("prefers relevant worksheet memory neighbors over unrelated recent memories", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    getWorksheetMemorySemanticPoolDetail.mockResolvedValue(buildSemanticPool());
    getWorksheetMemorySemanticPoolEvidence.mockResolvedValue(buildSemanticPoolEvidencePayload());
    state.memoryItems.set("memory-unrelated", {
      id: "memory-unrelated",
      organization_id: "org-1",
      memory_category: "worksheet_workflow",
      memory_type: "page_flow_pattern",
      memory_key: "workflow-key",
      memory_signature: "workflow-signature",
      source_semantic_pool_id: "semantic-pool-unrelated",
      title: "Recent workflow memory",
      summary: "Unrelated workflow behavior.",
      memory_value: { scope: { tradePackage: "Painting" } },
      evidence_summary: {},
      confidence_score: 0.6,
      reinforcement_count: 1,
      contradiction_count: 0,
      is_active: true,
      updated_at: "2026-06-08T12:00:00.000Z",
    });
    state.memoryItems.set("memory-relevant", {
      id: "memory-relevant",
      organization_id: "org-1",
      memory_category: "worksheet_pricing",
      memory_type: "assumption_pattern",
      memory_key: "pricing-key",
      memory_signature: "pricing-signature",
      source_semantic_pool_id: "semantic-pool-relevant",
      title: "Suspended ceiling grid spacing memory",
      summary: "Prior memory about suspended ceiling grid spacing.",
      memory_value: { scope: { tradePackage: "Suspended Ceilings", itemLabel: "Grid Spacing" } },
      evidence_summary: { semanticPoolSignature: "older-neighbor" },
      confidence_score: 0.8,
      reinforcement_count: 3,
      contradiction_count: 0,
      is_active: true,
      updated_at: "2026-06-01T12:00:00.000Z",
    });
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        decision: "create_memory",
        memoryCategory: "worksheet_pricing",
        memoryType: "assumption_pattern",
        title: "Scoped memory",
        summary: "Org scoped.",
        confidence: 0.8,
        scope: { tradePackage: "Suspended Ceilings" },
        memoryValue: { preferredTransition: "1200_to_600" },
        retrievalGuidance: "Use carefully.",
        supportingEvidenceEventIds: ["event-1", "event-2"],
        uncertainEvidenceEventIds: [],
        adjacentEvidenceEventIds: [],
        excludedEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        reasoningSummary: "Only relevant worksheet memory should be considered first.",
      },
    });

    const { runWorksheetMemorySynthesisWorker } = await import("./worksheet-memory-synthesis");
    await runWorksheetMemorySynthesisWorker({ organizationId: "org-1", limit: 1, maxExistingMemories: 1 });

    const userPrompt = generateEditPlan.mock.calls[0]?.[0]?.userPrompt as string;
    expect(userPrompt).toContain("Suspended ceiling grid spacing memory");
    expect(userPrompt).not.toContain("Recent workflow memory");
  });
});
