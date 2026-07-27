import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassifiedWorksheetMemoryEvent } from "@/lib/worksheet-memory-derivation";

const generateEditPlan = vi.fn();
const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/ai/providers/pricing-worksheet/registry", () => ({
  getPricingWorksheetAiProvider: () => ({
    generateEditPlan,
  }),
  getPricingWorksheetAnthropicModel: () => "claude-test",
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

function buildClassifiedEvent(
  overrides: Partial<ClassifiedWorksheetMemoryEvent> & { eventId: string; organizationId: string },
) {
  return {
    eventId: overrides.eventId,
    organizationId: overrides.organizationId,
    classificationRecordId: overrides.classificationRecordId ?? `classification-${overrides.eventId}`,
    classificationAttemptNumber: overrides.classificationAttemptNumber ?? 1,
    projectId: overrides.projectId ?? "project-1",
    opportunityId: overrides.opportunityId ?? "opp-1",
    eventType: overrides.eventType ?? "worksheet_assumption_changed",
    occurredAt: overrides.occurredAt ?? "2026-06-06T10:00:00.000Z",
    metadata: {
      workbookId: overrides.metadata?.workbookId ?? "workbook-1",
      sheetId: overrides.metadata?.sheetId ?? "sheet-1",
      sheetName: overrides.metadata?.sheetName ?? "Sheet 1",
      worksheetName: overrides.metadata?.worksheetName ?? "Suspended Ceilings",
      tradePackage: overrides.metadata?.tradePackage ?? "Suspended Ceilings",
      ...(overrides.metadata ?? {}),
    },
    diffData: {
      rowLabel: overrides.diffData?.rowLabel ?? "Inputs",
      itemLabel: overrides.diffData?.itemLabel ?? "Grid Spacing",
      columnHeader: overrides.diffData?.columnHeader ?? "Quantity",
      unit: overrides.diffData?.unit ?? "mm",
      oldValue: overrides.diffData?.oldValue ?? 1200,
      newValue: overrides.diffData?.newValue ?? 600,
      captureCompletenessScore: 0.9,
      ...(overrides.diffData ?? {}),
    },
    classificationStatus: overrides.classificationStatus ?? "classified",
    classificationVersion: overrides.classificationVersion ?? 1,
    classificationSource: overrides.classificationSource ?? "anthropic",
    classificationProvider: overrides.classificationProvider ?? "anthropic",
    classificationModel: overrides.classificationModel ?? "claude-test",
    classificationModelVersion: overrides.classificationModelVersion ?? "1",
    overallConfidence: overrides.overallConfidence ?? 0.85,
    reasoningSummary: overrides.reasoningSummary ?? "Repeated ceiling spacing adjustment.",
    semanticFields: {
      pageType: { value: "estimate_inputs", confidence: 0.8 },
      itemCategory: { value: "ceiling_grid_layout", confidence: 0.8 },
      normalizedUnit: { value: "mm", confidence: 0.9 },
      costRole: { value: "input_assumption", confidence: 0.8 },
      normalizedTradePackage: { value: "suspended_ceilings", confidence: 0.9 },
      ...(overrides.semanticFields ?? {}),
    },
    interpretationSchemaVersion: overrides.interpretationSchemaVersion ?? 1,
    interpretationPayload: {
      interpretedChange: {
        plainEnglishSummary: overrides.diffData?.itemLabel === "Main Tee Spacing"
          ? "Estimator reduced main tee spacing from 1200mm to 600mm."
          : "Estimator reduced grid spacing from 1200mm to 600mm.",
        constructionMeaning: "Denser suspended ceiling grid layout.",
        pricingMeaning: "Likely affects downstream material and labour quantities.",
        memoryType: "assumption_parameter",
      },
      ...(overrides.interpretationPayload ?? {}),
    },
    interpretationPromptVersion: overrides.interpretationPromptVersion ?? 1,
    contextSources: overrides.contextSources ?? {},
    constructionIntelligenceInputs: overrides.constructionIntelligenceInputs ?? {},
    futureUseSummary: {
      memoryType: "assumption_parameter",
      retrievalGuidance: "Consider repeated spacing adjustments in future suspended ceiling estimates.",
      ...(overrides.futureUseSummary ?? {}),
    },
    confidenceDetail: overrides.confidenceDetail ?? {},
    classifiedAt: overrides.classifiedAt ?? "2026-06-06T10:01:00.000Z",
  } satisfies ClassifiedWorksheetMemoryEvent;
}

function buildEventRow(event: ClassifiedWorksheetMemoryEvent): MockRow {
  return {
    id: event.eventId,
    organization_id: event.organizationId,
    project_id: event.projectId,
    opportunity_id: event.opportunityId,
    event_type: event.eventType,
    occurred_at: event.occurredAt,
    metadata: event.metadata,
    diff_data: event.diffData,
  };
}

function buildClassificationRow(event: ClassifiedWorksheetMemoryEvent, overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: event.classificationRecordId,
    organization_id: event.organizationId,
    source_event_id: event.eventId,
    classification_version: event.classificationVersion,
    attempt_number: event.classificationAttemptNumber,
    classification_source: event.classificationSource,
    classification_provider: event.classificationProvider,
    classification_model: event.classificationModel,
    classification_model_version: event.classificationModelVersion,
    overall_confidence: event.overallConfidence,
    reasoning_summary: event.reasoningSummary,
    semantic_fields: event.semanticFields,
    interpretation_schema_version: event.interpretationSchemaVersion,
    interpretation_payload: event.interpretationPayload,
    interpretation_prompt_version: event.interpretationPromptVersion,
    context_sources: event.contextSources,
    construction_intelligence_inputs: event.constructionIntelligenceInputs,
    future_use_summary: event.futureUseSummary,
    confidence_detail: event.confidenceDetail,
    classified_at: event.classifiedAt,
    ...overrides,
  };
}

function buildSeedPoolRow(overrides: Partial<MockRow> & { id: string }): MockRow {
  const scopeContext = (overrides.scope_context as MockRow | undefined) ?? {};
  const targetContext = (overrides.target_context as MockRow | undefined) ?? {};
  return {
    id: overrides.id,
    organization_id: overrides.organization_id ?? "org-1",
    pool_signature: overrides.pool_signature ?? `signature-${overrides.id}`,
    scope_signature: overrides.scope_signature ?? `scope-${overrides.id}`,
    target_signature: overrides.target_signature ?? `target-${overrides.id}`,
    pool_kind: overrides.pool_kind ?? "assumption_transition",
    event_type: overrides.event_type ?? "worksheet_assumption_changed",
    scope_context: {
      tradePackage: "Suspended Ceilings",
      normalizedTradePackage: "suspended_ceilings",
      pageType: "worksheet_inputs",
      sectionType: "worksheet_inputs",
      itemCategory: "assumption",
      normalizedUnit: "%",
      costRole: "input_assumption",
      itemLabel: "Grid Spacing",
      rowLabel: "Inputs",
      columnHeader: "Quantity",
      ...scopeContext,
    },
    target_context: {
      kind: "assumption_transition",
      oldValue: 1200,
      newValue: 600,
      ...targetContext,
    },
    evidence_count: overrides.evidence_count ?? 2,
    worksheet_count: overrides.worksheet_count ?? 2,
    workbook_count: overrides.workbook_count ?? 2,
    project_count: overrides.project_count ?? 2,
    support_count: overrides.support_count ?? 2,
    contradiction_count: overrides.contradiction_count ?? 0,
    ignored_count: overrides.ignored_count ?? 0,
    included_count: overrides.included_count ?? 2,
    excluded_count: overrides.excluded_count ?? 0,
    adjacent_count: overrides.adjacent_count ?? 0,
    uncertain_count: overrides.uncertain_count ?? 0,
    average_confidence: overrides.average_confidence ?? 0.85,
    first_seen_at: overrides.first_seen_at ?? "2026-06-05T10:00:00.000Z",
    last_seen_at: overrides.last_seen_at ?? "2026-06-06T10:00:00.000Z",
    pool_revision_hash: overrides.pool_revision_hash ?? `rev-${overrides.id}`,
    maturity_status: overrides.maturity_status ?? "ready_for_synthesis",
    updated_at: overrides.updated_at ?? "2026-06-06T10:05:00.000Z",
  };
}

function createState() {
  const semanticPools = new Map<string, MockRow>();
  const semanticPoolEvents = new Map<string, MockRow>();
  const semanticPoolRuns = new Map<string, MockRow>();
  const synthesisQueueRows = new Map<string, MockRow>();
  const organizationMemoryItems: MockRow[] = [];

  const seedPools: MockRow[] = [
    buildSeedPoolRow({
      id: "seed-pool-1",
      pool_signature: "seed-signature-1",
      scope_signature: "scope-seed-1",
      target_signature: "target-seed-1",
      scope_context: {
        pageType: "estimate_inputs",
        itemCategory: "ceiling_grid_layout",
        normalizedUnit: "mm",
        itemLabel: "Grid Spacing",
      },
      target_context: { kind: "assumption_transition", oldValue: 1200, newValue: 600 },
      pool_revision_hash: "rev-1",
    }),
    buildSeedPoolRow({
      id: "seed-pool-2",
      pool_signature: "seed-signature-2",
      scope_signature: "scope-seed-2",
      target_signature: "target-seed-2",
      scope_context: {
        pageType: "estimate_inputs",
        itemCategory: "ceiling_grid_layout",
        normalizedUnit: "mm",
        itemLabel: "Main Tee Spacing",
      },
      target_context: { kind: "assumption_transition", oldValue: 1200, newValue: 600 },
      pool_revision_hash: "rev-2",
    }),
  ];

  const seedPoolEvents: MockRow[] = [
    {
      pool_id: "seed-pool-1",
      organization_id: "org-1",
      source_event_id: "event-grid",
      classification_record_id: "classification-event-grid-v1",
      evidence_role: "included",
      occurred_at: "2026-06-06T10:00:00.000Z",
    },
    {
      pool_id: "seed-pool-2",
      organization_id: "org-1",
      source_event_id: "event-main-tee",
      classification_record_id: "classification-event-main-tee-v1",
      evidence_role: "included",
      occurred_at: "2026-06-06T10:05:00.000Z",
    },
  ];

  const eventGrid = buildClassifiedEvent({
    eventId: "event-grid",
    organizationId: "org-1",
    classificationRecordId: "classification-event-grid-v1",
    projectId: "project-1",
    diffData: { itemLabel: "Grid Spacing" },
    reasoningSummary: "Original grid spacing classification.",
  });
  const eventMainTee = buildClassifiedEvent({
    eventId: "event-main-tee",
    organizationId: "org-1",
    classificationRecordId: "classification-event-main-tee-v1",
    projectId: "project-2",
    occurredAt: "2026-06-06T10:05:00.000Z",
    diffData: { itemLabel: "Main Tee Spacing" },
    reasoningSummary: "Original main tee spacing classification.",
  });
  const eventOtherOrg = buildClassifiedEvent({
    eventId: "event-other-org",
    organizationId: "org-2",
    classificationRecordId: "classification-event-other-org-v1",
    projectId: "project-x",
    reasoningSummary: "Other org classification.",
  });

  const intelligenceEvents: MockRow[] = [
    buildEventRow(eventGrid),
    buildEventRow(eventMainTee),
    buildEventRow(eventOtherOrg),
  ];
  const classificationRows: MockRow[] = [
    buildClassificationRow(eventGrid),
    buildClassificationRow(eventMainTee),
    buildClassificationRow(eventOtherOrg),
    buildClassificationRow(eventGrid, {
      id: "classification-event-grid-v2",
      reasoning_summary: "Newer reclassification that Stage 7 must not substitute.",
    }),
  ];

  return {
    semanticPools,
    semanticPoolEvents,
    semanticPoolRuns,
    synthesisQueueRows,
    organizationMemoryItems,
    seedPools,
    seedPoolEvents,
    intelligenceEvents,
    classificationRows,
  };
}

function buildAdminClient(state: ReturnType<typeof createState>) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "claim_worksheet_memory_semantic_pool_batch") {
      const firstSeedPool = state.seedPools[0] ?? {};
      return {
        data: [
          {
            id: "queue-1",
            organizationId: "org-1",
            seedPoolId: String(firstSeedPool.id ?? "seed-pool-1"),
            seedPoolSignature: String(firstSeedPool.pool_signature ?? "seed-signature-1"),
            seedPoolRevisionHash: String(firstSeedPool.pool_revision_hash ?? "rev-1"),
            seedMaturityStatus: String(firstSeedPool.maturity_status ?? "ready_for_synthesis"),
            queueState: "claimed",
            attemptCount: 1,
            maxAttempts: 5,
            priority: 100,
            claimToken: "claim-1",
          },
        ],
        error: null,
      };
    }

    if (fn === "finalize_worksheet_memory_semantic_pool_batch") {
      const payload = Array.isArray(args.p_inputs) ? args.p_inputs : [];
      return {
        data: {
          count: payload.length,
          completedCount: payload.filter((entry) => entry.queueState === "completed").length,
          retriedCount: payload.filter((entry) => entry.queueState === "retry_scheduled").length,
          deadLetteredCount: payload.filter((entry) => entry.queueState === "dead_lettered").length,
        },
        error: null,
      };
    }

    if (fn === "replace_worksheet_memory_semantic_pool_events") {
      const semanticPoolId = String(args.p_semantic_pool_id);
      const organizationId = String(args.p_organization_id);
      for (const key of Array.from(state.semanticPoolEvents.keys())) {
        const existing = state.semanticPoolEvents.get(key);
        if (!existing) {
          continue;
        }
        if (existing.semantic_pool_id === semanticPoolId && existing.organization_id === organizationId) {
          state.semanticPoolEvents.delete(key);
        }
      }
      const payload = Array.isArray(args.p_records) ? args.p_records : [];
      for (const record of payload) {
        const row = record as MockRow;
        const key = `${row.semantic_pool_id}:${row.source_event_id}`;
        state.semanticPoolEvents.set(key, {
          ...row,
          linked_at: "2026-06-06T10:10:00.000Z",
        });
      }
      return {
        data: {
          count: payload.length,
          ids: payload.map((record) => `${(record as MockRow).semantic_pool_id}:${(record as MockRow).source_event_id}`),
        },
        error: null,
      };
    }

    if (fn === "enqueue_worksheet_memory_synthesis_queue") {
      const organizationId = String(args.p_organization_id ?? "");
      const semanticPoolId = String(args.p_semantic_pool_id ?? "");
      const semanticPool = Array.from(state.semanticPools.values()).find((row) =>
        row.id === semanticPoolId && row.organization_id === organizationId);
      const sourceRevisionHash = String(semanticPool?.source_revision_hash ?? "");
      const key = `${organizationId}:${semanticPoolId}:${sourceRevisionHash}`;
      const alreadyPresent = state.synthesisQueueRows.has(key);
      if (!alreadyPresent) {
        state.synthesisQueueRows.set(key, {
          id: `synthesis-${state.synthesisQueueRows.size + 1}`,
          organization_id: organizationId,
          semantic_pool_id: semanticPoolId,
          source_revision_hash: sourceRevisionHash,
        });
      }
      return {
        data: {
          count: alreadyPresent ? 0 : 1,
        },
        error: null,
      };
    }

    throw new Error(`Unexpected rpc ${fn}`);
  });

  const from = (table: string) => {
    if (table === "worksheet_memory_evidence_pools") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "id") {
            builder._id = value;
          }
          if (column === "organization_id") {
            builder._organizationId = value;
          }
          if (column === "pool_kind") {
            builder._poolKind = value;
          }
          if (column === "event_type") {
            builder._eventType = value;
          }
          return builder;
        }),
        in: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn((count: number) => {
          builder._limit = count;
          return Promise.resolve({
            data: state.seedPools
              .filter((row) => !builder._organizationId || row.organization_id === builder._organizationId)
              .filter((row) => !builder._id || row.id === builder._id)
              .filter((row) => !builder._poolKind || row.pool_kind === builder._poolKind)
              .filter((row) => !builder._eventType || row.event_type === builder._eventType)
              .slice(0, builder._limit ?? state.seedPools.length),
            error: null,
          });
        }),
        single: vi.fn(() => Promise.resolve({
          data: state.seedPools.find((row) => row.id === builder._id && row.organization_id === builder._organizationId) ?? null,
          error: null,
        })),
        _id: null as unknown,
        _organizationId: null as unknown,
        _poolKind: null as unknown,
        _eventType: null as unknown,
        _limit: null as number | null,
      };
      return builder;
    }

    if (table === "worksheet_memory_evidence_pool_events") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "organization_id") {
            builder._organizationId = value;
          }
          return builder;
        }),
        in: vi.fn((column: string, values: string[]) => {
          if (column === "pool_id") {
            builder._poolIds = values;
          }
          return builder;
        }),
        order: vi.fn(() => Promise.resolve({
          data: state.seedPoolEvents.filter((row) =>
            (!builder._organizationId || row.organization_id === builder._organizationId)
            && (!builder._poolIds || builder._poolIds.includes(String(row.pool_id)))),
          error: null,
        })),
        _organizationId: null as unknown,
        _poolIds: null as string[] | null,
      };
      return builder;
    }

    if (table === "intelligence_events") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "organization_id") {
            builder._organizationId = value;
          }
          if (builder._ids) {
            return Promise.resolve({
              data: state.intelligenceEvents.filter((row) =>
                (!builder._organizationId || row.organization_id === builder._organizationId)
                && (!builder._ids || builder._ids.includes(String(row.id)))),
              error: null,
            });
          }
          return builder;
        }),
        in: vi.fn((column: string, values: string[]) => {
          if (column === "id") {
            builder._ids = values;
          }
          if (builder._organizationId) {
            return Promise.resolve({
              data: state.intelligenceEvents.filter((row) =>
                (!builder._organizationId || row.organization_id === builder._organizationId)
                && (!builder._ids || builder._ids.includes(String(row.id)))),
              error: null,
            });
          }
          return builder;
        }),
        _organizationId: null as unknown,
        _ids: null as string[] | null,
      };
      return builder;
    }

    if (table === "worksheet_event_classifications") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "organization_id") {
            builder._organizationId = value;
          }
          if (builder._ids) {
            return Promise.resolve({
              data: state.classificationRows.filter((row) =>
                (!builder._organizationId || row.organization_id === builder._organizationId)
                && (!builder._ids || builder._ids.includes(String(row.id)))),
              error: null,
            });
          }
          return builder;
        }),
        in: vi.fn((column: string, values: string[]) => {
          if (column === "id") {
            builder._ids = values;
          }
          if (builder._organizationId) {
            return Promise.resolve({
              data: state.classificationRows.filter((row) =>
                (!builder._organizationId || row.organization_id === builder._organizationId)
                && (!builder._ids || builder._ids.includes(String(row.id)))),
              error: null,
            });
          }
          return builder;
        }),
        _organizationId: null as unknown,
        _ids: null as string[] | null,
      };
      return builder;
    }

    if (table === "worksheet_memory_semantic_pool_runs") {
      const builder = {
        insert: vi.fn((payload: MockRow) => {
          state.semanticPoolRuns.set(String(payload.id ?? "run-1"), payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { id: payload.id ?? "run-1" },
                error: null,
              })),
            })),
          };
        }),
        update: vi.fn((payload: MockRow) => ({
          eq: vi.fn((column: string, value: unknown) => {
            const existing = state.semanticPoolRuns.get(String(value)) ?? {};
            state.semanticPoolRuns.set(String(value), { ...existing, ...payload });
            return Promise.resolve({ error: null });
          }),
        })),
      };
      return builder;
    }

    if (table === "worksheet_memory_semantic_pools") {
      const builder = {
        upsert: vi.fn((payload: MockRow) => {
          const key = `${payload.organization_id}:${payload.semantic_signature}`;
          const next = {
            id: (state.semanticPools.get(key)?.id as string | undefined) ?? `semantic-pool-${state.semanticPools.size + 1}`,
            ...state.semanticPools.get(key),
            ...payload,
          };
          state.semanticPools.set(key, next);
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: next,
                error: null,
              })),
            })),
          };
        }),
        update: vi.fn((payload: MockRow) => ({
          eq: vi.fn((column: string, value: unknown) => {
            const record = Array.from(state.semanticPools.values()).find((row) => row.id === value) ?? {};
            const key = `${record.organization_id}:${record.semantic_signature}`;
            const next = { ...record, ...payload };
            state.semanticPools.set(key, next);
            return {
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: next,
                  error: null,
                })),
              })),
            };
          }),
        })),
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "organization_id") {
            builder._organizationId = value;
          }
          if (column === "id") {
            builder._id = value;
          }
          return builder;
        }),
        in: vi.fn((column: string, values: string[]) => {
          if (column === "id") {
            builder._ids = values;
          }
          return Promise.resolve({
            data: Array.from(state.semanticPools.values()).filter((row) =>
              (!builder._organizationId || row.organization_id === builder._organizationId)
              && (!builder._ids || builder._ids.includes(String(row.id)))),
            error: null,
          });
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => Promise.resolve({
          data: Array.from(state.semanticPools.values()).filter((row) =>
            !builder._organizationId || row.organization_id === builder._organizationId),
          error: null,
        })),
        single: vi.fn(() => Promise.resolve({
          data: Array.from(state.semanticPools.values()).find((row) =>
            row.id === builder._id && row.organization_id === builder._organizationId) ?? null,
          error: null,
        })),
        _organizationId: null as unknown,
        _id: null as unknown,
        _ids: null as string[] | null,
      };
      return builder;
    }

    if (table === "worksheet_memory_semantic_pool_events") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "semantic_pool_id") {
            builder._poolId = value;
          }
          if (column === "organization_id") {
            builder._organizationId = value;
          }
          return builder;
        }),
        in: vi.fn((column: string, values: string[]) => {
          if (column === "source_event_id") {
            builder._sourceEventIds = values;
          }
          return Promise.resolve({
            data: Array.from(state.semanticPoolEvents.values()).filter((row) =>
              (!builder._organizationId || row.organization_id === builder._organizationId)
              && (!builder._sourceEventIds || builder._sourceEventIds.includes(String(row.source_event_id)))),
            error: null,
          });
        }),
        order: vi.fn(() => Promise.resolve({
          data: Array.from(state.semanticPoolEvents.values()).filter((row) =>
            (!builder._poolId || row.semantic_pool_id === builder._poolId)
            && (!builder._organizationId || row.organization_id === builder._organizationId)
            && (!builder._sourceEventIds || builder._sourceEventIds.includes(String(row.source_event_id)))),
          error: null,
        })),
        then: (resolve: (value: { data: MockRow[]; error: null }) => unknown) => resolve({
          data: Array.from(state.semanticPoolEvents.values()).filter((row) =>
            (!builder._poolId || row.semantic_pool_id === builder._poolId)
            && (!builder._organizationId || row.organization_id === builder._organizationId)
            && (!builder._sourceEventIds || builder._sourceEventIds.includes(String(row.source_event_id)))),
          error: null,
        }),
        _poolId: null as unknown,
        _organizationId: null as unknown,
        _sourceEventIds: null as string[] | null,
      };
      return builder;
    }

    if (table === "organization_memory_items") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "organization_id") {
            builder._organizationId = value;
          }
          if (column === "is_active") {
            builder._isActive = value;
          }
          return builder;
        }),
        in: vi.fn((column: string, values: string[]) => {
          if (column === "source_semantic_pool_id") {
            builder._sourceSemanticPoolIds = values;
          }
          return Promise.resolve({
            data: state.organizationMemoryItems.filter((row) =>
              (!builder._organizationId || row.organization_id === builder._organizationId)
              && (builder._isActive === undefined || row.is_active === builder._isActive)
              && (!builder._sourceSemanticPoolIds || builder._sourceSemanticPoolIds.includes(String(row.source_semantic_pool_id)))),
            error: null,
          });
        }),
        _organizationId: null as unknown,
        _isActive: undefined as unknown,
        _sourceSemanticPoolIds: null as string[] | null,
      };
      return builder;
    }

    throw new Error(`Unexpected table ${table}`);
  };

  return { rpc, from };
}

describe("worksheet memory semantic pools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a deterministic behaviour bucket for a structurally proven repeated worksheet behaviour and enqueues Stage 8", async () => {
    const state = createState();
    state.seedPools.splice(0, state.seedPools.length,
      buildSeedPoolRow({
        id: "seed-pool-structural-strong",
        pool_signature: "seed-signature-structural-strong",
        scope_signature: "scope-structural-strong",
        target_signature: "target-structural-strong",
        pool_kind: "assumption_transition",
        event_type: "worksheet_assumption_changed",
        scope_context: {
          tradePackage: "Suspended Ceilings",
          normalizedTradePackage: "suspended_ceilings",
          pageType: "worksheet_inputs",
          sectionType: "worksheet_inputs",
          itemCategory: "assumption",
          normalizedUnit: "mm",
          costRole: "input_assumption",
          itemLabel: "Grid Spacing",
          rowLabel: "Inputs",
          columnHeader: "Quantity",
          structuralIdentityStrong: true,
          structuralIdentityStrengthScore: 8,
          structuralSignaturePayload: {
            workbookDomain: "suspended ceilings",
            worksheetDomain: "suspended ceilings",
            sectionPath: ["inputs"],
            rowLabel: "inputs",
            itemLabel: "grid spacing",
            description: "grid spacing",
            columnRole: "quantity",
            columnHeader: "quantity",
            normalizedUnit: "mm",
            valueType: "number",
            priorValueType: "number",
            transitionKind: "assumption_transition",
            pricingTupleShape: ["quantity", "unit"],
            relatedRowShape: ["{\"rowLabel\":\"totals\",\"itemLabel\":\"ceiling area\",\"unit\":\"m2\"}"],
          },
        },
        target_context: { kind: "assumption_transition", oldValue: 1200, newValue: 600 },
        evidence_count: 4,
        worksheet_count: 3,
        workbook_count: 3,
        project_count: 2,
        support_count: 4,
        contradiction_count: 0,
        ignored_count: 0,
        pool_revision_hash: "rev-structural-strong",
        maturity_status: "ready_for_synthesis",
      }),
    );
    state.seedPoolEvents.splice(0, state.seedPoolEvents.length,
      {
        pool_id: "seed-pool-structural-strong",
        organization_id: "org-1",
        source_event_id: "event-grid",
        classification_record_id: "classification-event-grid-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:00:00.000Z",
      },
      {
        pool_id: "seed-pool-structural-strong",
        organization_id: "org-1",
        source_event_id: "event-main-tee",
        classification_record_id: "classification-event-main-tee-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:05:00.000Z",
      },
    );

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    expect(generateEditPlan).not.toHaveBeenCalled();
    expect(result.semanticPoolCount).toBe(1);
    expect(result.noPoolCount).toBe(0);

    const storedPools = Array.from(state.semanticPools.values());
    expect(storedPools).toHaveLength(1);
    const storedPool = storedPools[0]!;
    expect(storedPool.domain_label).toBe("Repeated worksheet parameter: Grid Spacing");
    expect(String(storedPool.domain_summary)).toContain("Neutral bucket for repeated worksheet behaviour");
    expect(String(storedPool.grouping_rationale)).toContain("Deterministic Stage 7 behaviour bucket created");
    expect(storedPool.source_revision_hash).toBeTruthy();

    const evidenceSummary = storedPool.evidence_summary as Record<string, unknown>;
    expect(evidenceSummary.deterministicCreation).toBe(true);

    const links = Array.from(state.semanticPoolEvents.values())
      .filter((row) => row.semantic_pool_id === storedPool.id)
      .sort((left, right) => String(left.source_event_id).localeCompare(String(right.source_event_id)));
    expect(links).toHaveLength(2);
    expect(links.map((row) => row.classification_record_id)).toEqual([
      "classification-event-grid-v1",
      "classification-event-main-tee-v1",
    ]);

    const synthesisQueueRows = Array.from(state.synthesisQueueRows.values());
    expect(synthesisQueueRows).toHaveLength(1);
    expect(synthesisQueueRows[0]).toMatchObject({
      organization_id: "org-1",
      semantic_pool_id: storedPool.id,
      source_revision_hash: storedPool.source_revision_hash,
    });
    expect(state.organizationMemoryItems).toHaveLength(0);

    const runRow = Array.from(state.semanticPoolRuns.values())[0] ?? {};
    const diagnosticSummary = runRow.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      outcome: "semantic_pool",
      deterministicMode: "deterministic_bucket",
      stage8QueueInsertCount: 1,
      includedClassificationRecordIds: ["classification-event-grid-v1", "classification-event-main-tee-v1"],
    });
  });

  it("keeps deterministic Stage 7 idempotent on duplicate reruns and does not touch Stage 8 twice for the same revision", async () => {
    const state = createState();
    state.seedPools.splice(0, state.seedPools.length,
      buildSeedPoolRow({
        id: "seed-pool-structural-strong",
        pool_signature: "seed-signature-structural-strong",
        scope_signature: "scope-structural-strong",
        target_signature: "target-structural-strong",
        scope_context: {
          itemLabel: "Grid Spacing",
          structuralIdentityStrong: true,
          structuralIdentityStrengthScore: 8,
          structuralSignaturePayload: {
            workbookDomain: "suspended ceilings",
            worksheetDomain: "suspended ceilings",
            sectionPath: ["inputs"],
            rowLabel: "inputs",
            itemLabel: "grid spacing",
            description: "grid spacing",
            columnRole: "quantity",
            columnHeader: "quantity",
            normalizedUnit: "mm",
            valueType: "number",
            priorValueType: "number",
            transitionKind: "assumption_transition",
          },
        },
        target_context: { kind: "assumption_transition", oldValue: 1200, newValue: 600 },
        evidence_count: 4,
        worksheet_count: 3,
        workbook_count: 3,
        project_count: 2,
        pool_revision_hash: "rev-structural-strong",
      }),
    );
    state.seedPoolEvents.splice(0, state.seedPoolEvents.length,
      {
        pool_id: "seed-pool-structural-strong",
        organization_id: "org-1",
        source_event_id: "event-grid",
        classification_record_id: "classification-event-grid-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:00:00.000Z",
      },
      {
        pool_id: "seed-pool-structural-strong",
        organization_id: "org-1",
        source_event_id: "event-main-tee",
        classification_record_id: "classification-event-main-tee-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:05:00.000Z",
      },
    );
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const first = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });
    const second = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    expect(first.semanticPoolCount).toBe(1);
    expect(second.semanticPoolCount).toBe(0);
    expect(generateEditPlan).not.toHaveBeenCalled();
    expect(Array.from(state.semanticPools.values())).toHaveLength(1);
    expect(Array.from(state.synthesisQueueRows.values())).toHaveLength(1);

    const runRows = Array.from(state.semanticPoolRuns.values());
    const secondRun = runRows[runRows.length - 1] ?? {};
    const diagnosticSummary = secondRun.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      deterministicMode: "deterministic_bucket",
      stage8QueueInsertCount: 0,
    });
    expect(state.organizationMemoryItems).toHaveLength(0);
  });

  it("refreshes deterministic bucket wording when membership expands on an existing canonical bucket", async () => {
    const state = createState();
    const extraA = buildClassifiedEvent({
      eventId: "event-grid-extra-a",
      organizationId: "org-1",
      classificationRecordId: "classification-event-grid-extra-a-v1",
      projectId: "project-3",
      occurredAt: "2026-06-06T10:06:00.000Z",
      metadata: {
        workbookId: "workbook-3",
        sheetId: "sheet-3",
        sheetName: "Suspended Ceilings Copy",
        worksheetName: "Suspended Ceilings Copy",
        tradePackage: "Suspended Ceilings",
      },
      diffData: { itemLabel: "Grid Spacing" },
      reasoningSummary: "Third structural repeat.",
    });
    const extraB = buildClassifiedEvent({
      eventId: "event-grid-extra-b",
      organizationId: "org-1",
      classificationRecordId: "classification-event-grid-extra-b-v1",
      projectId: "project-4",
      occurredAt: "2026-06-06T10:07:00.000Z",
      metadata: {
        workbookId: "workbook-4",
        sheetId: "sheet-4",
        sheetName: "Suspended Ceilings v2",
        worksheetName: "Suspended Ceilings v2",
        tradePackage: "Suspended Ceilings",
      },
      diffData: { itemLabel: "Grid Spacing" },
      reasoningSummary: "Fourth structural repeat.",
    });
    state.intelligenceEvents.push(buildEventRow(extraA), buildEventRow(extraB));
    state.classificationRows.push(buildClassificationRow(extraA), buildClassificationRow(extraB));
    const mainTeeEventRow = state.intelligenceEvents.find((row) => row.id === "event-main-tee");
    if (mainTeeEventRow && typeof mainTeeEventRow.metadata === "object" && mainTeeEventRow.metadata) {
      (mainTeeEventRow.metadata as Record<string, unknown>).workbookId = "workbook-2";
      (mainTeeEventRow.metadata as Record<string, unknown>).sheetId = "sheet-2";
      (mainTeeEventRow.metadata as Record<string, unknown>).sheetName = "Suspended Ceilings Alt";
      (mainTeeEventRow.metadata as Record<string, unknown>).worksheetName = "Suspended Ceilings Alt";
    }
    const mainTeeClassificationRow = state.classificationRows.find((row) => row.id === "classification-event-main-tee-v1");
    if (mainTeeClassificationRow && typeof mainTeeClassificationRow.interpretation_payload === "object") {
      mainTeeClassificationRow.source_event_id = "event-main-tee";
    }
    state.seedPools.splice(0, state.seedPools.length,
      buildSeedPoolRow({
        id: "seed-pool-structural-strong",
        pool_signature: "seed-signature-structural-strong",
        scope_signature: "scope-structural-strong",
        target_signature: "target-structural-strong",
        scope_context: {
          tradePackage: "Suspended Ceilings",
          normalizedTradePackage: "suspended_ceilings",
          pageType: "worksheet_inputs",
          sectionType: "worksheet_inputs",
          itemCategory: "assumption",
          normalizedUnit: "mm",
          costRole: "input_assumption",
          itemLabel: "Grid Spacing",
          rowLabel: "Inputs",
          columnHeader: "Quantity",
          structuralIdentityStrong: true,
          structuralIdentityStrengthScore: 8,
          structuralSignaturePayload: {
            workbookDomain: "suspended ceilings",
            worksheetDomain: "suspended ceilings",
            sectionPath: ["inputs"],
            rowLabel: "inputs",
            itemLabel: "grid spacing",
            description: "grid spacing",
            columnRole: "quantity",
            columnHeader: "quantity",
            normalizedUnit: "mm",
            valueType: "number",
            priorValueType: "number",
            transitionKind: "assumption_transition",
            pricingTupleShape: ["quantity", "unit"],
            relatedRowShape: ["{\"rowLabel\":\"totals\",\"itemLabel\":\"ceiling area\",\"unit\":\"m2\"}"],
          },
        },
        target_context: { kind: "assumption_transition", oldValue: 1200, newValue: 600 },
        evidence_count: 4,
        worksheet_count: 4,
        workbook_count: 4,
        project_count: 4,
        support_count: 4,
        contradiction_count: 0,
        ignored_count: 0,
        pool_revision_hash: "rev-structural-strong-4",
        maturity_status: "ready_for_synthesis",
      }),
    );
    state.seedPoolEvents.splice(0, state.seedPoolEvents.length,
      {
        pool_id: "seed-pool-structural-strong",
        organization_id: "org-1",
        source_event_id: "event-grid",
        classification_record_id: "classification-event-grid-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:00:00.000Z",
      },
      {
        pool_id: "seed-pool-structural-strong",
        organization_id: "org-1",
        source_event_id: "event-main-tee",
        classification_record_id: "classification-event-main-tee-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:05:00.000Z",
      },
      {
        pool_id: "seed-pool-structural-strong",
        organization_id: "org-1",
        source_event_id: "event-grid-extra-a",
        classification_record_id: "classification-event-grid-extra-a-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:06:00.000Z",
      },
      {
        pool_id: "seed-pool-structural-strong",
        organization_id: "org-1",
        source_event_id: "event-grid-extra-b",
        classification_record_id: "classification-event-grid-extra-b-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:07:00.000Z",
      },
    );
    state.semanticPools.set("org-1:semantic-existing-grid", {
      id: "semantic-existing-grid",
      organization_id: "org-1",
      semantic_signature: "semantic-existing-grid",
      domain_label: "Repeated worksheet parameter: Grid Spacing",
      domain_summary: "Neutral bucket for repeated worksheet behaviour around Grid Spacing using 3 workbooks.",
      grouping_rationale: "Deterministic Stage 7 behaviour bucket created from strong Stage 6 structural proof. maturity=ready_for_synthesis evidenceCount=3 worksheetCount=3 workbookCount=3 projectCount=3",
      variant_summary: "Grid Spacing: 1200 -> 600 (3)",
      title: "Repeated worksheet parameter: Grid Spacing",
      summary: "Neutral bucket for repeated worksheet behaviour around Grid Spacing using 3 workbooks.",
      pool_status: "active",
      maturity_status: "ready_for_synthesis",
      source_revision_hash: "semantic-rev-1",
      support_count: 3,
      contradiction_count: 0,
      ignored_count: 0,
      included_count: 3,
      excluded_count: 0,
      adjacent_count: 0,
      uncertain_count: 0,
      worksheet_count: 3,
      workbook_count: 3,
      project_count: 3,
      average_confidence: 0.85,
      first_seen_at: "2026-06-05T10:00:00.000Z",
      last_seen_at: "2026-06-06T10:06:00.000Z",
      last_grouped_at: "2026-06-06T10:06:00.000Z",
      created_by_run_id: "run-old",
      last_updated_by_run_id: "run-old",
      created_at: "2026-06-05T10:00:00.000Z",
      updated_at: "2026-06-06T10:06:00.000Z",
      evidence_summary: {
        groupedCount: 3,
        includedCount: 3,
        worksheetCount: 3,
        workbookCount: 3,
        projectCount: 3,
        deterministicCreation: true,
        deterministicReason: "Deterministic Stage 7 behaviour bucket created from strong Stage 6 structural proof. maturity=ready_for_synthesis evidenceCount=3 worksheetCount=3 workbookCount=3 projectCount=3",
      },
      contradiction_summary: {},
      scope_payload: {},
      pool_value_payload: {},
    });
    state.semanticPoolEvents.set("semantic-existing-grid:event-grid", {
      semantic_pool_id: "semantic-existing-grid",
      organization_id: "org-1",
      source_event_id: "event-grid",
      classification_record_id: "classification-event-grid-v1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-05T10:00:00.000Z",
      occurred_at: "2026-06-05T10:00:00.000Z",
    });
    state.semanticPoolEvents.set("semantic-existing-grid:event-main-tee", {
      semantic_pool_id: "semantic-existing-grid",
      organization_id: "org-1",
      source_event_id: "event-main-tee",
      classification_record_id: "classification-event-main-tee-v1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-05T10:05:00.000Z",
      occurred_at: "2026-06-05T10:05:00.000Z",
    });
    state.semanticPoolEvents.set("semantic-existing-grid:event-grid-extra-a", {
      semantic_pool_id: "semantic-existing-grid",
      organization_id: "org-1",
      source_event_id: "event-grid-extra-a",
      classification_record_id: "classification-event-grid-extra-a-v1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-05T10:06:00.000Z",
      occurred_at: "2026-06-05T10:06:00.000Z",
    });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    expect(generateEditPlan).not.toHaveBeenCalled();
    expect(result.semanticPoolCount).toBe(1);
    const updatedPool = Array.from(state.semanticPools.values())[0]!;
    expect(updatedPool.id).toBe("semantic-existing-grid");
    expect(updatedPool.source_revision_hash).not.toBe("semantic-rev-1");
    expect(updatedPool.workbook_count).toBe(4);
    expect(updatedPool.worksheet_count).toBe(4);
    expect(updatedPool.support_count).toBe(4);
    expect(updatedPool.grouping_rationale).toContain("evidenceCount=4");
    expect(updatedPool.grouping_rationale).toContain("workbookCount=4");
    expect(updatedPool.domain_summary).toContain("repeated worksheet behaviour");
    expect(updatedPool.summary).toBe(updatedPool.domain_summary);
    const evidenceSummary = updatedPool.evidence_summary as Record<string, unknown>;
    expect(evidenceSummary.workbookCount).toBe(4);
    expect(evidenceSummary.groupedCount).toBe(4);
    expect(String(evidenceSummary.deterministicReason)).toContain("evidenceCount=4");
    expect(String(evidenceSummary.deterministicReason)).toContain("workbookCount=4");

    const updatedLinks = Array.from(state.semanticPoolEvents.values())
      .filter((row) => row.semantic_pool_id === "semantic-existing-grid")
      .sort((left, right) => String(left.source_event_id).localeCompare(String(right.source_event_id)));
    expect(updatedLinks).toHaveLength(4);
    expect(updatedLinks.map((row) => row.classification_record_id).sort()).toEqual([
      "classification-event-grid-extra-a-v1",
      "classification-event-grid-extra-b-v1",
      "classification-event-grid-v1",
      "classification-event-main-tee-v1",
    ].sort());
  });

  it("falls back to the provider path when a structurally strong packet is mixed or contradictory", async () => {
    const state = createState();
    state.seedPools.splice(0, state.seedPools.length,
      buildSeedPoolRow({
        id: "seed-pool-mixed-a",
        pool_signature: "seed-signature-mixed-a",
        scope_signature: "scope-mixed",
        target_signature: "target-mixed-a",
        scope_context: {
          itemLabel: "Perimeter Waste Factor",
          structuralIdentityStrong: true,
          structuralIdentityStrengthScore: 8,
          structuralSignaturePayload: {
            workbookDomain: "suspended ceilings",
            worksheetDomain: "suspended ceilings",
            sectionPath: ["inputs"],
            rowLabel: "inputs",
            itemLabel: "perimeter waste factor",
            description: "perimeter waste factor",
            columnRole: "assumption",
            columnHeader: "assumption",
            normalizedUnit: "%",
            valueType: "number",
            priorValueType: "number",
            transitionKind: "assumption_transition",
          },
        },
        target_context: { kind: "assumption_transition", oldValue: 10, newValue: 12 },
        evidence_count: 4,
        worksheet_count: 3,
        workbook_count: 3,
        project_count: 2,
      }),
      buildSeedPoolRow({
        id: "seed-pool-mixed-b",
        pool_signature: "seed-signature-mixed-b",
        scope_signature: "scope-mixed",
        target_signature: "target-mixed-b",
        scope_context: {
          itemLabel: "Perimeter Waste Factor",
          structuralIdentityStrong: true,
          structuralIdentityStrengthScore: 8,
          structuralSignaturePayload: {
            workbookDomain: "suspended ceilings",
            worksheetDomain: "suspended ceilings",
            sectionPath: ["inputs"],
            rowLabel: "inputs",
            itemLabel: "perimeter waste factor",
            description: "perimeter waste factor",
            columnRole: "assumption",
            columnHeader: "assumption",
            normalizedUnit: "%",
            valueType: "number",
            priorValueType: "number",
            transitionKind: "assumption_transition",
          },
        },
        target_context: { kind: "assumption_transition", oldValue: 12, newValue: 10 },
        evidence_count: 4,
        worksheet_count: 3,
        workbook_count: 3,
        project_count: 2,
      }),
    );
    state.seedPoolEvents.splice(0, state.seedPoolEvents.length,
      {
        pool_id: "seed-pool-mixed-a",
        organization_id: "org-1",
        source_event_id: "event-grid",
        classification_record_id: "classification-event-grid-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:00:00.000Z",
      },
      {
        pool_id: "seed-pool-mixed-b",
        organization_id: "org-1",
        source_event_id: "event-main-tee",
        classification_record_id: "classification-event-main-tee-v1",
        evidence_role: "included",
        occurred_at: "2026-06-06T10:05:00.000Z",
      },
    );

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "no_pool",
            domainLabel: null,
            domainSummary: null,
            groupingRationale: null,
            variantSummary: null,
            confidence: null,
            noPoolReasonCode: "mixed_behaviours",
            noPoolReasonSummary: "The candidate evidence mixed multiple worksheet behaviours.",
            reasonSummary: "The packet was mixed and remained unsafe for deterministic grouping.",
            includedEvidenceEventIds: [],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1, maxSeedPoolCount: 6 });

    expect(generateEditPlan).toHaveBeenCalledTimes(1);
    expect(result.semanticPoolCount).toBe(0);
    expect(result.noPoolCount).toBe(1);

    const runRow = Array.from(state.semanticPoolRuns.values())[0] ?? {};
    const diagnosticSummary = runRow.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      deterministicMode: "provider",
      deterministicReason: "Candidate evidence contained contradictory or opposite-direction behaviour.",
      outcome: "no_pool",
    });
  });

  it("does not run semantic grouping when no persisted Stage 6 seed pools are claimable", async () => {
    createAdminSupabaseClient.mockReturnValue({
      rpc: vi.fn(async (fn: string) => {
        if (fn === "claim_worksheet_memory_semantic_pool_batch") {
          return {
            data: [],
            error: null,
          };
        }

        throw new Error(`Unexpected rpc ${fn}`);
      }),
      from: vi.fn((table: string) => {
        if (table === "worksheet_memory_semantic_pool_runs") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { id: "run-1" },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }

        throw new Error("Stage 7 should not read Stage 6 tables when no seed pools were claimed");
      }),
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 5 });

    expect(result.claimedJobCount).toBe(0);
    expect(result.semanticPoolCount).toBe(0);
    expect(result.candidateEventCount).toBe(0);
    expect(generateEditPlan).not.toHaveBeenCalled();
  });

  it("uses exact Stage 6-linked classification ids for grouping, persistence, and inspection", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "evidence_domain",
            domainLabel: "Suspended ceiling grid spacing assumption changes",
            domainSummary: "Classified worksheet evidence concerning changes to suspended ceiling grid spacing assumptions.",
            groupingRationale: "Both events refer to the same worksheet parameter domain even though the labels differ slightly.",
            variantSummary: "Grid Spacing: 1200mm -> 600mm (2)",
            confidence: 0.83,
            includedEvidenceEventIds: ["event-grid", "event-main-tee"],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { getWorksheetMemorySemanticPoolEvidence, runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    expect(result.semanticPoolCount).toBe(1);
    expect(result.noPoolCount).toBe(0);
    expect(generateEditPlan).toHaveBeenCalledTimes(1);
    const systemPrompt = generateEditPlan.mock.calls[0]?.[0]?.systemPrompt as string;
    const userPrompt = generateEditPlan.mock.calls[0]?.[0]?.userPrompt as string;
    const schema = generateEditPlan.mock.calls[0]?.[0]?.schema as Record<string, unknown>;
    expect(userPrompt).toContain("Grid Spacing");
    expect(userPrompt).toContain("Main Tee Spacing");
    expect(userPrompt).not.toContain("event-other-org");
    expect(userPrompt).not.toContain("workbookId");
    expect(userPrompt).not.toContain("sheetId");
    expect(systemPrompt).toContain("Do not infer company preference");
    expect(systemPrompt).toContain("Do not write retrieval guidance");
    expect(systemPrompt).toContain("Evidence that is already represented is not automatically no_pool.");
    expect(systemPrompt).toContain("Stage 7 only decides whether evidence records belong to a coherent neutral semantic evidence domain.");
    expect(systemPrompt).toContain("Repeated estimating assumptions can form neutral semantic domains");
    expect(JSON.stringify(schema)).not.toContain("retrievalGuidance");
    expect(JSON.stringify(schema)).toContain("noPoolReasonCode");

    const storedPools = Array.from(state.semanticPools.values());
    expect(storedPools).toHaveLength(1);
    const storedPool = storedPools[0]!;
    expect(storedPool.domain_label).toBe("Suspended ceiling grid spacing assumption changes");
    expect(storedPool.domain_summary).not.toContain("preference");
    expect(storedPool.variant_summary).toContain("1200mm -> 600mm");
    expect(storedPool.retrieval_guidance).toBeNull();

    const storedLinks = Array.from(state.semanticPoolEvents.values());
    expect(storedLinks).toHaveLength(2);
    expect(storedLinks.map((row) => row.classification_record_id).sort()).toEqual([
      "classification-event-grid-v1",
      "classification-event-main-tee-v1",
    ]);
    expect(Array.from(state.synthesisQueueRows.values())).toHaveLength(1);
    expect(Array.from(state.synthesisQueueRows.values())[0]).toMatchObject({
      organization_id: "org-1",
      semantic_pool_id: storedPool.id,
    });

    const evidence = await getWorksheetMemorySemanticPoolEvidence(String(storedPool.id), "org-1");
    expect(evidence?.evidence).toHaveLength(2);
    const gridEvidence = evidence?.evidence.find((entry) => entry.sourceEventId === "event-grid");
    expect(gridEvidence?.classificationRecordId).toBe("classification-event-grid-v1");
    expect(gridEvidence?.classification?.reasoningSummary).toBe("Original grid spacing classification.");
  });

  it("includes bounded Stage 6 structural-coherence context in the semantic grouping packet", async () => {
    const state = createState();
    state.seedPools[0] = buildSeedPoolRow({
      id: "seed-pool-1",
      pool_signature: "seed-signature-1",
      scope_signature: "scope-seed-1",
      target_signature: "target-productivity-1",
      scope_context: {
        normalizedTradePackage: "suspended_ceilings",
        pageType: "worksheet_inputs",
        itemCategory: "assumption",
        normalizedUnit: "hours_per_square_metre",
        costRole: "labour_quantity",
        itemLabel: "Productivity",
        rowLabel: "Labour",
        columnHeader: "Quantity",
        structuralIdentityStrong: true,
        structuralIdentityStrengthScore: 8,
        structuralSignaturePayload: {
          workbookDomain: "suspended ceilings",
          worksheetDomain: "suspended ceilings",
          sectionPath: ["inputs", "labour"],
          rowLabel: "labour",
          itemLabel: "productivity",
          columnRole: "quantity",
          columnHeader: "quantity",
          normalizedUnit: "hr/m2",
          pricingTupleShape: ["quantity", "unit"],
          relatedRowShape: [
            "{\"rowLabel\":\"labour\",\"itemLabel\":\"labour hours\",\"unit\":\"hrs\"}",
            "{\"rowLabel\":\"labour\",\"itemLabel\":\"labour cost\",\"unit\":\"$\"}",
          ],
          valueType: "number",
          transitionKind: "assumption_transition",
        },
      },
      target_context: { kind: "assumption_transition", oldValue: 0.35, newValue: 0.36 },
      evidence_count: 4,
      worksheet_count: 3,
      workbook_count: 3,
      project_count: 2,
      contradiction_count: 1,
      pool_revision_hash: "rev-productivity-1",
    });
    state.seedPools.splice(1, 1);
    state.seedPoolEvents.splice(1, 1);
    state.classificationRows = state.classificationRows.filter((row) => row.id !== "classification-event-main-tee-v1");
    state.intelligenceEvents = state.intelligenceEvents.filter((row) => row.id !== "event-main-tee");

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "no_pool",
            domainLabel: null,
            domainSummary: null,
            groupingRationale: null,
            variantSummary: null,
            confidence: null,
            noPoolReasonCode: "missing_context",
            noPoolReasonSummary: "The packet still lacked enough independent downstream context.",
            reasonSummary: "Missing downstream context overrode the strong worksheet-derived structural identity.",
            includedEvidenceEventIds: [],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    const userPrompt = generateEditPlan.mock.calls[0]?.[0]?.userPrompt as string;
    expect(userPrompt).toContain("structuralCoherence");
    expect(userPrompt).toContain("structuralIdentityStrong");
    expect(userPrompt).toContain("structuralIdentityStrengthScore");
    expect(userPrompt).toContain("target-productivity-1");
    expect(userPrompt).toContain("workbookCount");
    expect(userPrompt).toContain("pricingTupleShapeSummary");
    expect(userPrompt).toContain("downstreamRoleSummary");
    expect(userPrompt).toContain("Stage 7 only decides neutral semantic evidence-domain grouping");
    expect(userPrompt).toContain("Creating or reinforcing a semantic pool is not a claim");
    expect(userPrompt).not.toContain("workbookId");
    expect(userPrompt).not.toContain("sheetId");
  });

  it("places a generic semanticCandidateSummary before event records without hardcoded audit terms", async () => {
    const state = createState();
    state.seedPools[0] = buildSeedPoolRow({
      id: "seed-pool-1",
      pool_signature: "seed-signature-1",
      scope_signature: "scope-seed-1",
      target_signature: "target-access-factor-1",
      scope_context: {
        tradePackage: "Thermal Panels",
        normalizedTradePackage: "thermal_panels",
        pageType: "worksheet_inputs",
        itemCategory: "access_assumption",
        normalizedUnit: "factor",
        costRole: "quantity_multiplier",
        itemLabel: "Access Factor",
        rowLabel: "Install Inputs",
        columnHeader: "Factor",
        structuralIdentityStrong: true,
        structuralIdentityStrengthScore: 8,
        structuralSignaturePayload: {
          workbookDomain: "thermal panels",
          worksheetDomain: "thermal panels",
          sectionPath: ["inputs", "install assumptions"],
          rowLabel: "install inputs",
          itemLabel: "access factor",
          description: "access factor",
          columnRole: "factor",
          columnHeader: "factor",
          normalizedUnit: "factor",
          pricingTupleShape: ["quantity", "multiplier"],
          relatedRowShape: [
            "{\"rowLabel\":\"install\",\"itemLabel\":\"install hours\",\"unit\":\"hrs\"}",
            "{\"rowLabel\":\"install\",\"itemLabel\":\"install cost\",\"unit\":\"$\"}",
          ],
          valueType: "number",
          transitionKind: "assumption_transition",
        },
      },
      target_context: { kind: "assumption_transition", oldValue: 1.1, newValue: 1.2 },
      evidence_count: 3,
      worksheet_count: 2,
      workbook_count: 2,
      project_count: 2,
      contradiction_count: 1,
      pool_revision_hash: "rev-access-factor-1",
    });
    state.seedPools.splice(1, 1);
    state.seedPoolEvents.splice(1, 1);
    state.intelligenceEvents[0] = buildEventRow(buildClassifiedEvent({
      eventId: "event-grid",
      organizationId: "org-1",
      classificationRecordId: "classification-event-grid-v1",
      metadata: { worksheetName: "Thermal Panels", sheetName: "Thermal Panels", tradePackage: "Thermal Panels" },
      diffData: { rowLabel: "Install Inputs", itemLabel: "Access Factor", columnHeader: "Factor", unit: "factor", oldValue: 1.1, newValue: 1.2 },
    }));
    state.classificationRows[0] = buildClassificationRow(buildClassifiedEvent({
      eventId: "event-grid",
      organizationId: "org-1",
      classificationRecordId: "classification-event-grid-v1",
      metadata: { worksheetName: "Thermal Panels", sheetName: "Thermal Panels", tradePackage: "Thermal Panels" },
      diffData: { rowLabel: "Install Inputs", itemLabel: "Access Factor", columnHeader: "Factor", unit: "factor", oldValue: 1.1, newValue: 1.2 },
      semanticFields: {
        pageType: { value: "worksheet_inputs", confidence: 0.8 },
        itemCategory: { value: "access_assumption", confidence: 0.8 },
        normalizedUnit: { value: "factor", confidence: 0.9 },
        costRole: { value: "quantity_multiplier", confidence: 0.8 },
        normalizedTradePackage: { value: "thermal_panels", confidence: 0.9 },
      },
    }));

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "no_pool",
            domainLabel: null,
            domainSummary: null,
            groupingRationale: null,
            variantSummary: null,
            confidence: null,
            noPoolReasonCode: "weak_reusability",
            noPoolReasonSummary: "The access factor evidence remained too narrow.",
            reasonSummary: "Weak reusability overrode the structurally coherent candidate.",
            includedEvidenceEventIds: [],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    const userPrompt = generateEditPlan.mock.calls[0]?.[0]?.userPrompt as string;
    const summaryIndex = userPrompt.indexOf("Semantic candidate summary:");
    const eventIndex = userPrompt.indexOf("Classified events:");
    expect(summaryIndex).toBeGreaterThan(-1);
    expect(eventIndex).toBeGreaterThan(summaryIndex);
    expect(userPrompt).toContain("thermal panels quantity multiplier access assumption access factor");
    expect(userPrompt).toContain("\"inputName\":\"access factor\"");
    expect(userPrompt).toContain("\"unit\":\"factor\"");
    expect(userPrompt).toContain("\"repeatedTransition\":\"1.1 -> 1.2 repeated 3 times\"");
    expect(userPrompt).toContain("\"evidenceSpread\":\"3 events across 2 worksheets, 2 workbooks, 2 projects\"");
    expect(userPrompt).toContain("install hours");
    expect(userPrompt).toContain("\"pricingTupleShapeSummary\":\"quantity + multiplier\"");
  });

  it("reconciles semantic membership on rerun and keeps counts aligned with the active links", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          pools: [
            {
              proposalKind: "evidence_domain",
              domainLabel: "Suspended ceiling grid spacing assumption changes",
              domainSummary: "Classified worksheet evidence concerning changes to suspended ceiling grid spacing assumptions.",
              groupingRationale: "Both events belong together.",
              variantSummary: "Grid Spacing: 1200mm -> 600mm (2)",
              confidence: 0.83,
              includedEvidenceEventIds: ["event-grid", "event-main-tee"],
              excludedEvidenceEventIds: [],
              adjacentEvidenceEventIds: [],
              uncertainEvidenceEventIds: [],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          pools: [
            {
              proposalKind: "evidence_domain",
              domainLabel: "Same wording should update existing pool",
              domainSummary: "Updated wording, smaller active membership.",
              groupingRationale: "Only one event still clearly belongs here.",
              variantSummary: "Grid Spacing: 1200mm -> 600mm (1)",
              confidence: 0.7,
              includedEvidenceEventIds: ["event-grid"],
              excludedEvidenceEventIds: ["event-main-tee"],
              adjacentEvidenceEventIds: [],
              uncertainEvidenceEventIds: [],
            },
          ],
        },
      });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const first = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });
    const firstPool = Array.from(state.semanticPools.values())[0]!;
    const firstRevisionHash = String(firstPool.source_revision_hash);
    const firstSignature = String(firstPool.semantic_signature);

    expect(first.semanticPoolCount).toBe(1);
    expect(Array.from(state.semanticPoolEvents.values())).toHaveLength(2);

    const second = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });
    const pools = Array.from(state.semanticPools.values());
    expect(second.semanticPoolCount).toBe(1);
    expect(pools).toHaveLength(2);
    expect(pools.some((pool) => String(pool.semantic_signature) === firstSignature)).toBe(true);
    expect(pools.some((pool) => String(pool.source_revision_hash) === firstRevisionHash)).toBe(true);
    const changedPool = pools.find((pool) => String(pool.semantic_signature) !== firstSignature)!;
    expect(String(changedPool.source_revision_hash)).not.toBe(firstRevisionHash);

    const links = Array.from(state.semanticPoolEvents.values())
      .filter((row) => row.semantic_pool_id === changedPool.id)
      .sort((left, right) =>
      String(left.source_event_id).localeCompare(String(right.source_event_id)),
      );
    expect(links).toHaveLength(2);
    expect(links[0]?.source_event_id).toBe("event-grid");
    expect(links[0]?.evidence_role).toBe("included");
    expect(links[1]?.source_event_id).toBe("event-main-tee");
    expect(links[1]?.evidence_role).toBe("excluded");

    expect(changedPool.included_count).toBe(1);
    expect(changedPool.excluded_count).toBe(1);
    expect(changedPool.support_count).toBe(1);
    expect(changedPool.ignored_count).toBe(1);
  });

  it("replaces stale links when the same stable grouping is rerun with wording drift", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          pools: [
            {
              proposalKind: "evidence_domain",
              domainLabel: "Grid spacing changes",
              domainSummary: "First wording",
              groupingRationale: "Same grouping",
              variantSummary: "First wording",
              confidence: 0.8,
              includedEvidenceEventIds: ["event-grid", "event-main-tee"],
              excludedEvidenceEventIds: [],
              adjacentEvidenceEventIds: [],
              uncertainEvidenceEventIds: [],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        provider: "anthropic",
        model: "claude-test",
        parsedJson: {
          pools: [
            {
              proposalKind: "evidence_domain",
              domainLabel: "Suspended ceiling spacing parameter shifts",
              domainSummary: "Different wording",
              groupingRationale: "Same grouping",
              variantSummary: "Different wording",
              confidence: 0.8,
              includedEvidenceEventIds: ["event-grid", "event-main-tee"],
              excludedEvidenceEventIds: [],
              adjacentEvidenceEventIds: [],
              uncertainEvidenceEventIds: [],
            },
          ],
        },
      });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });
    const stablePool = Array.from(state.semanticPools.values())[0]!;
    state.semanticPoolEvents.set(`stale:${stablePool.id}:event-stale`, {
      semantic_pool_id: stablePool.id,
      organization_id: "org-1",
      source_event_id: "event-stale",
      classification_record_id: "classification-stale",
      evidence_role: "uncertain",
      linked_by_run_id: "old-run",
    });

    await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    const links = Array.from(state.semanticPoolEvents.values())
      .filter((row) => row.semantic_pool_id === stablePool.id)
      .sort((left, right) => String(left.source_event_id).localeCompare(String(right.source_event_id)));
    expect(Array.from(state.semanticPools.values())).toHaveLength(1);
    expect(links).toHaveLength(2);
    expect(links.map((row) => row.source_event_id)).toEqual(["event-grid", "event-main-tee"]);
  });

  it("keeps semantic identity stable across wording drift but changes revisions when membership changes", async () => {
    const { buildSemanticPoolSignature, validateSemanticPoolProposal } = await import("./worksheet-memory-semantic-pools");
    const eventGrid = buildClassifiedEvent({
      eventId: "event-grid",
      organizationId: "org-1",
      classificationRecordId: "classification-event-grid-v1",
    });
    const eventMainTee = buildClassifiedEvent({
      eventId: "event-main-tee",
      organizationId: "org-1",
      classificationRecordId: "classification-event-main-tee-v1",
      occurredAt: "2026-06-06T10:05:00.000Z",
      diffData: { itemLabel: "Main Tee Spacing" },
    });
    const batch = {
      batchId: "batch-1",
      organizationId: "org-1",
      seedQueueRowId: "queue-1",
      seedPoolId: "seed-pool-1",
      seedPoolSignature: "seed-signature-1",
      seedPoolRevisionHash: "seed-rev-1",
      seedPoolMaturityStatus: "ready_for_synthesis",
      stagingPools: [],
      oppositeDirectionPools: [],
      selectedPoolIds: ["seed-pool-1", "seed-pool-2"],
      sourceLinks: [
        {
          organizationId: "org-1",
          stage6PoolId: "seed-pool-1",
          stage6PoolSignature: "seed-signature-1",
          stage6PoolRevisionHash: "rev-1",
          sourceEventId: "event-grid",
          classificationRecordId: "classification-event-grid-v1",
          occurredAt: eventGrid.occurredAt,
        },
        {
          organizationId: "org-1",
          stage6PoolId: "seed-pool-2",
          stage6PoolSignature: "seed-signature-2",
          stage6PoolRevisionHash: "rev-2",
          sourceEventId: "event-main-tee",
          classificationRecordId: "classification-event-main-tee-v1",
          occurredAt: eventMainTee.occurredAt,
        },
      ],
      events: [eventGrid, eventMainTee],
      existingDomainContext: {
        relatedSemanticPools: [],
        activeMemories: [],
        canonicalTargetSemanticPoolId: null,
        canonicalTargetSelectionReason: null,
        collapsedAlternativeSemanticPoolIds: [],
        collapsedAlternativeMemoryIds: [],
        targetEquivalenceKey: null,
        providerSawCanonicalTargetsOnly: true,
      },
    };

    const wordingA = validateSemanticPoolProposal(batch, {
      proposalKind: "evidence_domain",
      domainLabel: "Grid spacing changes",
      domainSummary: "First wording",
      groupingRationale: "Same evidence domain",
      variantSummary: "First wording",
      confidence: 0.8,
      includedEvidenceEventIds: ["event-grid", "event-main-tee"],
      excludedEvidenceEventIds: [],
      adjacentEvidenceEventIds: [],
      uncertainEvidenceEventIds: [],
    });
    const wordingB = validateSemanticPoolProposal(batch, {
      proposalKind: "evidence_domain",
      domainLabel: "Suspended ceiling spacing parameter shifts",
      domainSummary: "Different wording",
      groupingRationale: "Equivalent grouping",
      variantSummary: "Different wording",
      confidence: 0.8,
      includedEvidenceEventIds: ["event-grid", "event-main-tee"],
      excludedEvidenceEventIds: [],
      adjacentEvidenceEventIds: [],
      uncertainEvidenceEventIds: [],
    });
    const changedMembership = validateSemanticPoolProposal(batch, {
      proposalKind: "evidence_domain",
      domainLabel: "Suspended ceiling spacing parameter shifts",
      domainSummary: "Different wording",
      groupingRationale: "Changed grouping",
      variantSummary: "Different wording",
      confidence: 0.8,
      includedEvidenceEventIds: ["event-grid"],
      excludedEvidenceEventIds: ["event-main-tee"],
      adjacentEvidenceEventIds: [],
      uncertainEvidenceEventIds: [],
    });

    expect(wordingA.semanticSignature).toBe(wordingB.semanticSignature);
    expect(wordingA.sourceRevisionHash).toBe(wordingB.sourceRevisionHash);
    expect(changedMembership.semanticSignature).not.toBe(wordingA.semanticSignature);
    expect(changedMembership.sourceRevisionHash).not.toBe(wordingA.sourceRevisionHash);
    expect(buildSemanticPoolSignature).toBeTypeOf("function");
  });

  it("can honestly return no_pool without writing semantic pools", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "no_pool",
            domainLabel: null,
            domainSummary: null,
            groupingRationale: null,
            variantSummary: null,
            confidence: null,
            includedEvidenceEventIds: [],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    expect(result.semanticPoolCount).toBe(0);
    expect(result.noPoolCount).toBe(1);
    expect(Array.from(state.semanticPools.values())).toHaveLength(0);
    expect(Array.from(state.semanticPoolEvents.values())).toHaveLength(0);
    expect(Array.from(state.synthesisQueueRows.values())).toHaveLength(0);
  });

  it("extracts compact event interpretation fallbacks from nested persisted classification payloads", async () => {
    const { buildCompactWorksheetSemanticGroupingEvent } = await import("./worksheet-memory-semantic-pools");
    const event = buildClassifiedEvent({
      eventId: "event-nested",
      organizationId: "org-1",
      interpretationPayload: {
        interpretedChange: {
          observed: {
            plainEnglishSummary: "Estimator changed the access factor input.",
            changeSummary: "Access factor changed from 1.1 to 1.2.",
          },
          interpretation: {
            constructionContext: "Access constraints increase install effort.",
          },
          futureUse: {
            memoryType: "access_assumption",
          },
          pricingMeaning: "May increase downstream install cost.",
        },
      },
      futureUseSummary: {
        memoryType: "fallback_memory_type",
      },
    });

    const compact = buildCompactWorksheetSemanticGroupingEvent(event);

    expect(compact.interpretation).toMatchObject({
      plainEnglishSummary: "Estimator changed the access factor input.",
      constructionMeaning: "Access constraints increase install effort.",
      pricingMeaning: "May increase downstream install cost.",
      memoryType: "access_assumption",
    });
  });

  it("does not invent compact event interpretation values when persisted fields are missing", async () => {
    const { buildCompactWorksheetSemanticGroupingEvent } = await import("./worksheet-memory-semantic-pools");
    const event = buildClassifiedEvent({
      eventId: "event-empty",
      organizationId: "org-1",
      interpretationPayload: {
        interpretedChange: {},
      },
      futureUseSummary: {
        memoryType: null,
        retrievalGuidance: null,
      },
    });

    const compact = buildCompactWorksheetSemanticGroupingEvent(event);

    expect(compact.interpretation.plainEnglishSummary).toBeNull();
    expect(compact.interpretation.constructionMeaning).toBeNull();
    expect(compact.interpretation.memoryType).toBeNull();
  });

  it("records a specific no_pool reason code and structural override explanation when Stage 6 identity is strong", async () => {
    const state = createState();
    state.seedPools[0] = buildSeedPoolRow({
      id: "seed-pool-1",
      contradiction_count: 1,
      scope_context: {
        structuralIdentityStrong: true,
        structuralIdentityStrengthScore: 8,
        structuralSignaturePayload: {
          workbookDomain: "worksheet domain",
          worksheetDomain: "worksheet domain",
          sectionPath: ["inputs"],
          rowLabel: "row",
          itemLabel: "parameter",
          columnRole: "quantity",
          pricingTupleShape: ["quantity", "unit"],
          relatedRowShape: ["{\"itemLabel\":\"dependent total\"}"],
        },
      },
    });
    state.seedPools.splice(1, 1);
    state.seedPoolEvents.splice(1, 1);
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "no_pool",
            domainLabel: null,
            domainSummary: null,
            groupingRationale: null,
            variantSummary: null,
            confidence: null,
            noPoolReasonCode: "other",
            noPoolReasonSummary: "The candidate evidence did not form a coherent neutral evidence domain.",
            reasonSummary: "The candidate evidence did not form a coherent neutral evidence domain.",
            includedEvidenceEventIds: [],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    const runRow = Array.from(state.semanticPoolRuns.values())[0] ?? {};
    const diagnosticSummary = runRow.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      outcome: "no_pool",
      noPoolReasonCode: "other",
      semanticCandidateSummaryPresent: true,
      rejectedDespiteStructuralIdentityStrong: true,
      noPoolReasonSummary: "No pool was selected despite strong Stage 6 structural identity.",
      reasonSummary: "No pool was selected despite strong Stage 6 structural identity; the provider did not supply a specific override beyond the selected noPoolReasonCode.",
    });
    expect(Array.from(state.synthesisQueueRows.values())).toHaveLength(0);
  });

  it("excludes unrelated candidate pools, keeps opposite-direction pools out of the evidence batch, and includes related semantic context", async () => {
    const state = createState();
    const wasteSeed = buildClassifiedEvent({
      eventId: "event-waste-seed",
      organizationId: "org-1",
      classificationRecordId: "classification-waste-seed-v1",
      projectId: "project-waste-1",
      diffData: { itemLabel: "Perimeter Waste Factor", columnHeader: "Assumption", unit: "%", oldValue: 10, newValue: 12 },
      semanticFields: {
        pageType: { value: "worksheet_inputs", confidence: 0.9 },
        itemCategory: { value: "waste_factor", confidence: 0.9 },
        normalizedUnit: { value: "%", confidence: 0.9 },
        costRole: { value: "material_waste_contingency", confidence: 0.9 },
        normalizedTradePackage: { value: "suspended_ceilings", confidence: 0.9 },
      },
    });
    const wasteRepeat = buildClassifiedEvent({
      eventId: "event-waste-repeat",
      organizationId: "org-1",
      classificationRecordId: "classification-waste-repeat-v1",
      projectId: "project-waste-2",
      occurredAt: "2026-06-06T10:05:00.000Z",
      diffData: { itemLabel: "Perimeter Waste Factor", columnHeader: "Assumption", unit: "%", oldValue: 10, newValue: 12 },
      semanticFields: wasteSeed.semanticFields,
    });
    const wasteOpposite = buildClassifiedEvent({
      eventId: "event-waste-opposite",
      organizationId: "org-1",
      classificationRecordId: "classification-waste-opposite-v1",
      projectId: "project-waste-3",
      occurredAt: "2026-06-06T10:10:00.000Z",
      diffData: { itemLabel: "Perimeter Waste Factor", columnHeader: "Assumption", unit: "%", oldValue: 12, newValue: 10 },
      semanticFields: wasteSeed.semanticFields,
    });
    const gridSpacing = buildClassifiedEvent({
      eventId: "event-grid-noise",
      organizationId: "org-1",
      classificationRecordId: "classification-grid-noise-v1",
      projectId: "project-grid-1",
      occurredAt: "2026-06-06T10:15:00.000Z",
      diffData: { itemLabel: "Grid Spacing", columnHeader: "Assumption", unit: "%", oldValue: 10, newValue: 12 },
      semanticFields: {
        pageType: { value: "worksheet_inputs", confidence: 0.9 },
        itemCategory: { value: "assumption", confidence: 0.9 },
        normalizedUnit: { value: "%", confidence: 0.9 },
        costRole: { value: "input_assumption", confidence: 0.9 },
        normalizedTradePackage: { value: "suspended_ceilings", confidence: 0.9 },
      },
    });

    state.seedPools.splice(0, state.seedPools.length,
      buildSeedPoolRow({
        id: "seed-pool-waste-up-1",
        pool_signature: "seed-signature-waste-up-1",
        scope_signature: "scope-waste",
        target_signature: "target-waste-up",
        scope_context: {
          itemCategory: "waste_factor",
          normalizedUnit: "%",
          costRole: "material_waste_contingency",
          itemLabel: "Perimeter Waste Factor",
          columnHeader: "Assumption",
        },
        target_context: { kind: "assumption_transition", oldValue: 10, newValue: 12 },
        pool_revision_hash: "rev-waste-up-1",
      }),
      buildSeedPoolRow({
        id: "seed-pool-waste-up-2",
        pool_signature: "seed-signature-waste-up-2",
        scope_signature: "scope-waste",
        target_signature: "target-waste-up-2",
        scope_context: {
          itemCategory: "waste_factor",
          normalizedUnit: "%",
          costRole: "material_waste_contingency",
          itemLabel: "Perimeter Waste Factor",
          columnHeader: "Assumption",
        },
        target_context: { kind: "assumption_transition", oldValue: 10, newValue: 12 },
        pool_revision_hash: "rev-waste-up-2",
      }),
      buildSeedPoolRow({
        id: "seed-pool-waste-down",
        pool_signature: "seed-signature-waste-down",
        scope_signature: "scope-waste",
        target_signature: "target-waste-down",
        scope_context: {
          itemCategory: "waste_factor",
          normalizedUnit: "%",
          costRole: "material_waste_contingency",
          itemLabel: "Perimeter Waste Factor",
          columnHeader: "Assumption",
        },
        target_context: { kind: "assumption_transition", oldValue: 12, newValue: 10 },
        pool_revision_hash: "rev-waste-down",
      }),
      buildSeedPoolRow({
        id: "seed-pool-grid-noise",
        pool_signature: "seed-signature-grid-noise",
        scope_signature: "scope-grid",
        target_signature: "target-grid-noise",
        scope_context: {
          itemCategory: "assumption",
          normalizedUnit: "%",
          costRole: "input_assumption",
          itemLabel: "Grid Spacing",
          columnHeader: "Assumption",
        },
        target_context: { kind: "assumption_transition", oldValue: 10, newValue: 12 },
        pool_revision_hash: "rev-grid-noise",
      }),
    );
    state.seedPoolEvents.splice(0, state.seedPoolEvents.length,
      {
        pool_id: "seed-pool-waste-up-1",
        organization_id: "org-1",
        source_event_id: "event-waste-seed",
        classification_record_id: "classification-waste-seed-v1",
        evidence_role: "included",
        occurred_at: wasteSeed.occurredAt,
      },
      {
        pool_id: "seed-pool-waste-up-2",
        organization_id: "org-1",
        source_event_id: "event-waste-repeat",
        classification_record_id: "classification-waste-repeat-v1",
        evidence_role: "included",
        occurred_at: wasteRepeat.occurredAt,
      },
      {
        pool_id: "seed-pool-waste-down",
        organization_id: "org-1",
        source_event_id: "event-waste-opposite",
        classification_record_id: "classification-waste-opposite-v1",
        evidence_role: "included",
        occurred_at: wasteOpposite.occurredAt,
      },
      {
        pool_id: "seed-pool-grid-noise",
        organization_id: "org-1",
        source_event_id: "event-grid-noise",
        classification_record_id: "classification-grid-noise-v1",
        evidence_role: "included",
        occurred_at: gridSpacing.occurredAt,
      },
    );
    state.intelligenceEvents.splice(0, state.intelligenceEvents.length,
      buildEventRow(wasteSeed),
      buildEventRow(wasteRepeat),
      buildEventRow(wasteOpposite),
      buildEventRow(gridSpacing),
    );
    state.classificationRows.splice(0, state.classificationRows.length,
      buildClassificationRow(wasteSeed),
      buildClassificationRow(wasteRepeat),
      buildClassificationRow(wasteOpposite),
      buildClassificationRow(gridSpacing),
    );

    state.semanticPools.set("org-1:semantic-existing-waste", {
      id: "semantic-existing-waste",
      organization_id: "org-1",
      semantic_signature: "semantic-existing-waste",
      domain_label: "Perimeter waste factor assumptions",
      domain_summary: "Existing context-sensitive perimeter waste factor domain.",
      variant_summary: "10% -> 12%; 12% -> 10%",
      pool_status: "active",
      maturity_status: "durable",
      source_revision_hash: "semantic-rev-1",
      support_count: 4,
      contradiction_count: 1,
      worksheet_count: 3,
      workbook_count: 3,
      project_count: 3,
      average_confidence: 0.9,
      first_seen_at: "2026-06-01T10:00:00.000Z",
      last_seen_at: "2026-06-06T10:00:00.000Z",
      evidence_summary: {},
      contradiction_summary: {},
      scope_payload: {},
      pool_value_payload: {},
    });
    state.semanticPoolEvents.set("semantic-existing-waste:event-waste-repeat", {
      semantic_pool_id: "semantic-existing-waste",
      organization_id: "org-1",
      source_event_id: "event-waste-repeat",
      classification_record_id: "classification-waste-repeat-v1",
      evidence_role: "included",
    });
    state.organizationMemoryItems.push(
      {
        id: "memory-waste-1",
        organization_id: "org-1",
        title: "Perimeter waste factor is context-sensitive",
        memory_category: "estimating_assumption",
        memory_type: "waste_factor_benchmark",
        memory_key: "suspended_ceilings.perimeter_waste_factor",
        memory_domain_signature: "domain-waste",
        confidence_score: 0.91,
        reinforcement_count: 4,
        contradiction_count: 1,
        is_active: true,
        source_semantic_pool_id: "semantic-existing-waste",
      },
      {
        id: "memory-grid-unrelated",
        organization_id: "org-1",
        title: "Grid spacing benchmark",
        memory_category: "estimating_assumption",
        memory_type: "layout_benchmark",
        memory_key: "suspended_ceilings.grid_spacing",
        memory_domain_signature: "domain-grid",
        confidence_score: 0.8,
        reinforcement_count: 2,
        contradiction_count: 0,
        is_active: true,
        source_semantic_pool_id: "semantic-unrelated-grid",
      },
    );

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "no_pool",
            domainLabel: null,
            domainSummary: null,
            groupingRationale: null,
            variantSummary: null,
            confidence: null,
            noPoolReasonSummary: "This evidence appears to fit an existing context-sensitive waste-factor domain rather than forming a new neutral grouping from the selected batch alone.",
            includedEvidenceEventIds: [],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1, batchEventLimit: 10, maxSeedPoolCount: 6 });

    expect(result.noPoolCount).toBe(1);
    expect(result.candidateEventCount).toBe(2);

    const userPrompt = generateEditPlan.mock.calls[0]?.[0]?.userPrompt as string;
    expect(userPrompt).toContain("Perimeter Waste Factor");
    expect(userPrompt).toContain("Existing semantic pool context");
    expect(userPrompt).toContain("Perimeter waste factor assumptions");
    expect(userPrompt).toContain("Perimeter waste factor is context-sensitive");
    expect(userPrompt).toContain("Opposite-direction context");
    expect(userPrompt).toContain("Existing semantic pool context is ranked strongest-first");
    expect(userPrompt).not.toContain("Grid Spacing");

    const runRow = Array.from(state.semanticPoolRuns.values())[0] ?? {};
    const diagnosticSummary = runRow.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs).toHaveLength(1);
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      queueRowId: "queue-1",
      seedPoolId: "seed-pool-waste-up-1",
      candidatePoolIds: ["seed-pool-waste-up-1", "seed-pool-waste-up-2"],
      oppositeDirectionPoolIds: ["seed-pool-waste-down"],
      candidateEventCount: 2,
      outcome: "no_pool",
      noPoolReasonSummary: "This evidence appears to fit an existing context-sensitive waste-factor domain rather than forming a new neutral grouping from the selected batch alone.",
    });
  });

  it("collapses duplicate-equivalent semantic targets to the strongest canonical target before provider selection", async () => {
    const state = createState();
    const wasteSeed = buildClassifiedEvent({
      eventId: "event-waste-seed",
      organizationId: "org-1",
      classificationRecordId: "classification-waste-seed-v1",
      projectId: "project-waste-1",
      diffData: { itemLabel: "Perimeter Waste Factor", columnHeader: "Assumption", unit: "%", oldValue: 10, newValue: 12 },
      semanticFields: {
        pageType: { value: "worksheet_inputs", confidence: 0.9 },
        itemCategory: { value: "waste_factor", confidence: 0.9 },
        normalizedUnit: { value: "%", confidence: 0.9 },
        costRole: { value: "material_waste_contingency", confidence: 0.9 },
        normalizedTradePackage: { value: "suspended_ceilings", confidence: 0.9 },
      },
    });
    const wasteRepeat = buildClassifiedEvent({
      eventId: "event-waste-repeat",
      organizationId: "org-1",
      classificationRecordId: "classification-waste-repeat-v1",
      projectId: "project-waste-2",
      occurredAt: "2026-06-06T10:05:00.000Z",
      diffData: { itemLabel: "Perimeter Waste Factor", columnHeader: "Assumption", unit: "%", oldValue: 10, newValue: 12 },
      semanticFields: wasteSeed.semanticFields,
    });

    state.seedPools.splice(0, state.seedPools.length,
      buildSeedPoolRow({
        id: "seed-pool-waste-up-1",
        pool_signature: "seed-signature-waste-up-1",
        scope_signature: "scope-waste",
        target_signature: "target-waste-up",
        scope_context: {
          itemCategory: "waste_factor",
          normalizedUnit: "%",
          costRole: "material_waste_contingency",
          itemLabel: "Perimeter Waste Factor",
          columnHeader: "Assumption",
        },
        target_context: { kind: "assumption_transition", oldValue: 10, newValue: 12 },
        pool_revision_hash: "rev-waste-up-1",
      }),
      buildSeedPoolRow({
        id: "seed-pool-waste-up-2",
        pool_signature: "seed-signature-waste-up-2",
        scope_signature: "scope-waste",
        target_signature: "target-waste-up-2",
        scope_context: {
          itemCategory: "waste_factor",
          normalizedUnit: "%",
          costRole: "material_waste_contingency",
          itemLabel: "Perimeter Waste Factor",
          columnHeader: "Assumption",
        },
        target_context: { kind: "assumption_transition", oldValue: 10, newValue: 12 },
        pool_revision_hash: "rev-waste-up-2",
      }),
    );
    state.seedPoolEvents.splice(0, state.seedPoolEvents.length,
      {
        pool_id: "seed-pool-waste-up-1",
        organization_id: "org-1",
        source_event_id: "event-waste-seed",
        classification_record_id: "classification-waste-seed-v1",
        evidence_role: "included",
        occurred_at: wasteSeed.occurredAt,
      },
      {
        pool_id: "seed-pool-waste-up-2",
        organization_id: "org-1",
        source_event_id: "event-waste-repeat",
        classification_record_id: "classification-waste-repeat-v1",
        evidence_role: "included",
        occurred_at: wasteRepeat.occurredAt,
      },
    );
    state.intelligenceEvents.splice(0, state.intelligenceEvents.length,
      buildEventRow(wasteSeed),
      buildEventRow(wasteRepeat),
    );
    state.classificationRows.splice(0, state.classificationRows.length,
      buildClassificationRow(wasteSeed),
      buildClassificationRow(wasteRepeat),
    );

    state.semanticPools.set("org-1:semantic-waste-strong", {
      id: "semantic-waste-strong",
      organization_id: "org-1",
      semantic_signature: "semantic-waste-strong",
      semantic_family: "estimating_assumption",
      semantic_type: "waste_factor_benchmark",
      domain_label: "Perimeter waste factor assumptions",
      domain_summary: "Existing context-sensitive perimeter waste factor domain.",
      grouping_rationale: "Repeated estimating behavior.",
      variant_summary: "10% -> 12%; 12% -> 10%",
      pool_status: "active",
      maturity_status: "durable",
      source_revision_hash: "semantic-rev-strong",
      support_count: 4,
      contradiction_count: 0,
      ignored_count: 0,
      included_count: 4,
      excluded_count: 0,
      adjacent_count: 0,
      uncertain_count: 0,
      worksheet_count: 4,
      workbook_count: 4,
      project_count: 4,
      average_confidence: 0.92,
      first_seen_at: "2026-06-01T10:00:00.000Z",
      last_seen_at: "2026-06-06T10:00:00.000Z",
      evidence_summary: {},
      contradiction_summary: {},
      scope_payload: {},
      pool_value_payload: {
        tradePackage: "suspended_ceilings",
        assumptionName: "Perimeter Waste Factor",
        previousValue: 12,
        currentValue: 10,
      },
    });
    state.semanticPools.set("org-1:semantic-waste-weak", {
      id: "semantic-waste-weak",
      organization_id: "org-1",
      semantic_signature: "semantic-waste-weak",
      semantic_family: "estimating_assumption",
      semantic_type: "waste_factor_benchmark",
      domain_label: "Perimeter waste factor assumptions",
      domain_summary: "Existing context-sensitive perimeter waste factor domain.",
      grouping_rationale: "Repeated estimating behavior.",
      variant_summary: "10% -> 12%; 12% -> 10%",
      pool_status: "active",
      maturity_status: "durable",
      source_revision_hash: "semantic-rev-weak",
      support_count: 2,
      contradiction_count: 0,
      ignored_count: 0,
      included_count: 2,
      excluded_count: 0,
      adjacent_count: 0,
      uncertain_count: 0,
      worksheet_count: 2,
      workbook_count: 2,
      project_count: 2,
      average_confidence: 0.9,
      first_seen_at: "2026-06-01T10:00:00.000Z",
      last_seen_at: "2026-06-05T10:00:00.000Z",
      evidence_summary: {},
      contradiction_summary: {},
      scope_payload: {},
      pool_value_payload: {
        tradePackage: "suspended_ceilings",
        assumptionName: "Perimeter Waste Factor",
        previousValue: 12,
        currentValue: 10,
      },
    });
    state.semanticPoolEvents.set("semantic-waste-strong:event-old-1", {
      semantic_pool_id: "semantic-waste-strong",
      organization_id: "org-1",
      source_event_id: "event-old-1",
      classification_record_id: "classification-old-1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-01T10:00:00.000Z",
    });
    state.semanticPoolEvents.set("semantic-waste-strong:event-waste-seed", {
      semantic_pool_id: "semantic-waste-strong",
      organization_id: "org-1",
      source_event_id: "event-waste-seed",
      classification_record_id: "classification-waste-seed-v1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-05T10:00:00.000Z",
    });
    state.semanticPoolEvents.set("semantic-waste-weak:event-old-2", {
      semantic_pool_id: "semantic-waste-weak",
      organization_id: "org-1",
      source_event_id: "event-old-2",
      classification_record_id: "classification-old-2",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-01T10:00:00.000Z",
    });
    state.semanticPoolEvents.set("semantic-waste-weak:event-waste-repeat", {
      semantic_pool_id: "semantic-waste-weak",
      organization_id: "org-1",
      source_event_id: "event-waste-repeat",
      classification_record_id: "classification-waste-repeat-v1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-05T10:00:00.000Z",
    });
    state.organizationMemoryItems.push(
      {
        id: "memory-waste-strong",
        organization_id: "org-1",
        title: "Perimeter waste factor is context-sensitive",
        memory_category: "estimating_assumption",
        memory_type: "waste_factor_benchmark",
        memory_key: "memory-waste-strong",
        memory_domain_signature: "domain-waste",
        confidence_score: 0.91,
        reinforcement_count: 4,
        contradiction_count: 0,
        is_active: true,
        source_semantic_pool_id: "semantic-waste-strong",
      },
      {
        id: "memory-waste-weak",
        organization_id: "org-1",
        title: "Perimeter waste factor is context-sensitive",
        memory_category: "estimating_assumption",
        memory_type: "waste_factor_benchmark",
        memory_key: "memory-waste-weak",
        memory_domain_signature: "domain-waste",
        confidence_score: 0.89,
        reinforcement_count: 2,
        contradiction_count: 0,
        is_active: true,
        source_semantic_pool_id: "semantic-waste-weak",
      },
    );

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "reinforce_existing_semantic_pool",
            targetSemanticPoolId: "semantic-waste-strong",
            domainLabel: "Perimeter waste factor assumptions",
            domainSummary: "Existing context-sensitive perimeter waste factor domain.",
            groupingRationale: "The evidence reinforces the strongest existing semantic domain rather than creating a duplicate.",
            variantSummary: "10% -> 12%",
            confidence: 0.88,
            reasonSummary: "The batch adds net-new support to the strongest ranked existing semantic target.",
            includedEvidenceEventIds: ["event-waste-seed", "event-waste-repeat"],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1, batchEventLimit: 10, maxSeedPoolCount: 6 });

    expect(result.semanticPoolCount).toBe(1);
    const userPrompt = generateEditPlan.mock.calls[0]?.[0]?.userPrompt as string;
    expect(userPrompt).toContain('Canonical target semantic pool id: semantic-waste-strong');
    expect(userPrompt).toContain('"semanticPoolId":"semantic-waste-strong"');
    expect(userPrompt).not.toContain('"semanticPoolId":"semantic-waste-weak"');
    expect(userPrompt).toContain('"collapsedAlternativeSemanticPoolIds":["semantic-waste-weak"]');
    expect(userPrompt).toContain('"collapsedAlternativeMemoryIds":["memory-waste-weak"]');
    expect(userPrompt).toContain('Provider saw canonical targets only: true');

    const runRow = Array.from(state.semanticPoolRuns.values())[0] ?? {};
    const diagnosticSummary = runRow.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      canonicalTargetSemanticPoolId: "semantic-waste-strong",
      collapsedAlternativeSemanticPoolIds: ["semantic-waste-weak"],
      collapsedAlternativeMemoryIds: ["memory-waste-weak"],
      providerSawCanonicalTargetsOnly: true,
      outcome: "reinforce_existing_semantic_pool",
      targetSemanticPoolId: "semantic-waste-strong",
    });

    const synthesisQueueRows = Array.from(state.synthesisQueueRows.values());
    expect(synthesisQueueRows).toHaveLength(1);
    expect(synthesisQueueRows[0]).toMatchObject({
      semantic_pool_id: "semantic-waste-strong",
    });
  });

  it("revises an existing semantic pool and enqueues Stage 8 when evidence reinforces that domain", async () => {
    const state = createState();
    const existingPool = {
      id: "semantic-existing-grid",
      organization_id: "org-1",
      semantic_signature: "semantic-existing-grid",
      domain_label: "Grid spacing assumptions",
      domain_summary: "Existing semantic domain for repeated grid spacing changes.",
      grouping_rationale: "Repeated estimating behavior.",
      variant_summary: "Grid Spacing: 1200mm -> 600mm (1)",
      pool_status: "active",
      maturity_status: "ready_for_synthesis",
      source_revision_hash: "semantic-rev-1",
      support_count: 1,
      contradiction_count: 0,
      ignored_count: 0,
      included_count: 1,
      excluded_count: 0,
      adjacent_count: 0,
      uncertain_count: 0,
      worksheet_count: 1,
      workbook_count: 1,
      project_count: 1,
      average_confidence: 0.85,
      first_seen_at: "2026-06-05T10:00:00.000Z",
      last_seen_at: "2026-06-05T10:00:00.000Z",
      last_grouped_at: "2026-06-05T10:00:00.000Z",
      created_by_run_id: "run-old",
      last_updated_by_run_id: "run-old",
      created_at: "2026-06-05T10:00:00.000Z",
      updated_at: "2026-06-05T10:00:00.000Z",
      evidence_summary: {},
      contradiction_summary: {},
      scope_payload: {},
      pool_value_payload: {},
    };
    state.semanticPools.set("org-1:semantic-existing-grid", existingPool);
    state.semanticPoolEvents.set("semantic-existing-grid:event-grid", {
      semantic_pool_id: "semantic-existing-grid",
      organization_id: "org-1",
      source_event_id: "event-grid",
      classification_record_id: "classification-event-grid-v1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-05T10:00:00.000Z",
      occurred_at: "2026-06-05T10:00:00.000Z",
    });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "reinforce_existing_semantic_pool",
            targetSemanticPoolId: "semantic-existing-grid",
            domainLabel: "Grid spacing assumptions",
            domainSummary: "Existing semantic domain for repeated grid spacing changes.",
            groupingRationale: "The new evidence reinforces the same semantic domain rather than defining a new one.",
            variantSummary: "Grid Spacing: 1200mm -> 600mm (2)",
            confidence: 0.88,
            reasonSummary: "The candidate packet clearly adds net-new support to the existing grid spacing domain.",
            includedEvidenceEventIds: ["event-grid", "event-main-tee"],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    expect(result.semanticPoolCount).toBe(1);
    expect(Array.from(state.semanticPools.values())).toHaveLength(1);

    const updatedPool = Array.from(state.semanticPools.values())[0]!;
    expect(updatedPool.id).toBe("semantic-existing-grid");
    expect(updatedPool.source_revision_hash).not.toBe("semantic-rev-1");
    expect(updatedPool.included_count).toBe(2);

    const updatedLinks = Array.from(state.semanticPoolEvents.values())
      .filter((row) => row.semantic_pool_id === "semantic-existing-grid")
      .sort((left, right) => String(left.source_event_id).localeCompare(String(right.source_event_id)));
    expect(updatedLinks).toHaveLength(2);
    expect(updatedLinks.map((row) => row.classification_record_id)).toEqual([
      "classification-event-grid-v1",
      "classification-event-main-tee-v1",
    ]);

    const synthesisQueueRows = Array.from(state.synthesisQueueRows.values());
    expect(synthesisQueueRows).toHaveLength(1);
    expect(synthesisQueueRows[0]).toMatchObject({
      organization_id: "org-1",
      semantic_pool_id: "semantic-existing-grid",
      source_revision_hash: updatedPool.source_revision_hash,
    });

    const runRow = Array.from(state.semanticPoolRuns.values())[0] ?? {};
    const diagnosticSummary = runRow.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      outcome: "reinforce_existing_semantic_pool",
      targetSemanticPoolId: "semantic-existing-grid",
      includedEvidenceEventIds: ["event-grid", "event-main-tee"],
      includedClassificationRecordIds: ["classification-event-grid-v1", "classification-event-main-tee-v1"],
      stage8QueueInsertCount: 1,
      reasonSummary: "The candidate packet clearly adds net-new support to the existing grid spacing domain.",
    });
  });

  it("downgrades existing-pool reinforcement to no_pool when the candidate evidence is already fully credited", async () => {
    const state = createState();
    const existingPool = {
      id: "semantic-existing-grid",
      organization_id: "org-1",
      semantic_signature: "semantic-existing-grid",
      domain_label: "Grid spacing assumptions",
      domain_summary: "Existing semantic domain for repeated grid spacing changes.",
      grouping_rationale: "Repeated estimating behavior.",
      variant_summary: "Grid Spacing: 1200mm -> 600mm (2)",
      pool_status: "active",
      maturity_status: "ready_for_synthesis",
      source_revision_hash: "semantic-rev-1",
      support_count: 2,
      contradiction_count: 0,
      ignored_count: 0,
      included_count: 2,
      excluded_count: 0,
      adjacent_count: 0,
      uncertain_count: 0,
      worksheet_count: 2,
      workbook_count: 1,
      project_count: 2,
      average_confidence: 0.85,
      first_seen_at: "2026-06-05T10:00:00.000Z",
      last_seen_at: "2026-06-05T10:00:00.000Z",
      last_grouped_at: "2026-06-05T10:00:00.000Z",
      created_by_run_id: "run-old",
      last_updated_by_run_id: "run-old",
      created_at: "2026-06-05T10:00:00.000Z",
      updated_at: "2026-06-05T10:00:00.000Z",
      evidence_summary: {},
      contradiction_summary: {},
      scope_payload: {},
      pool_value_payload: {},
    };
    state.semanticPools.set("org-1:semantic-existing-grid", existingPool);
    state.semanticPoolEvents.set("semantic-existing-grid:event-grid", {
      semantic_pool_id: "semantic-existing-grid",
      organization_id: "org-1",
      source_event_id: "event-grid",
      classification_record_id: "classification-event-grid-v1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-05T10:00:00.000Z",
      occurred_at: "2026-06-05T10:00:00.000Z",
    });
    state.semanticPoolEvents.set("semantic-existing-grid:event-main-tee", {
      semantic_pool_id: "semantic-existing-grid",
      organization_id: "org-1",
      source_event_id: "event-main-tee",
      classification_record_id: "classification-event-main-tee-v1",
      evidence_role: "included",
      linked_by_run_id: "run-old",
      linked_at: "2026-06-05T10:05:00.000Z",
      occurred_at: "2026-06-05T10:05:00.000Z",
    });

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "reinforce_existing_semantic_pool",
            targetSemanticPoolId: "semantic-existing-grid",
            domainLabel: "Grid spacing assumptions",
            domainSummary: "Existing semantic domain for repeated grid spacing changes.",
            groupingRationale: "This appears to match the same existing domain.",
            variantSummary: "Grid Spacing: 1200mm -> 600mm (2)",
            confidence: 0.81,
            reasonSummary: "The batch matches the same domain.",
            includedEvidenceEventIds: ["event-grid", "event-main-tee"],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    expect(result.semanticPoolCount).toBe(0);
    expect(result.noPoolCount).toBe(1);
    expect(Array.from(state.synthesisQueueRows.values())).toHaveLength(0);

    const runRow = Array.from(state.semanticPoolRuns.values())[0] ?? {};
    const diagnosticSummary = runRow.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      outcome: "no_pool",
      targetSemanticPoolId: "semantic-existing-grid",
      noPoolReasonSummary: "Stage 7 reinforcement had no net-new classified support for the target semantic pool.",
      stage8QueueInsertCount: 0,
    });
  });

  it("finalizes retryable provider timeouts immediately with retry scheduling", async () => {
    const state = createState();
    const admin = buildAdminClient(state);
    createAdminSupabaseClient.mockReturnValue(admin);
    generateEditPlan.mockRejectedValue(Object.assign(new Error("Upstream request timed out."), {
      code: "provider_timeout",
      provider: "anthropic",
      model: "claude-test",
      status: null,
      retryable: true,
      rawError: {},
    }));

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    const result = await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    expect(result.semanticPoolCount).toBe(0);
    expect(result.retriedJobCount).toBe(1);
    expect(result.deadLetteredJobCount).toBe(0);

    const finalizeCall = admin.rpc.mock.calls.find((call) => call[0] === "finalize_worksheet_memory_semantic_pool_batch");
    expect(finalizeCall).toBeTruthy();
    const payload = Array.isArray(finalizeCall?.[1]?.p_inputs) ? finalizeCall?.[1]?.p_inputs : [];
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      id: "queue-1",
      claimToken: "claim-1",
      queueState: "retry_scheduled",
      errorCode: "provider_timeout",
      errorMessage: "Upstream request timed out.",
    });
    expect(typeof payload[0]?.retryAfter).toBe("string");
  });

  it("preserves no_pool reasonSummary for diagnostics when the provider explains why reinforcement was not safe", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));
    generateEditPlan.mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      parsedJson: {
        pools: [
          {
            proposalKind: "no_pool",
            domainLabel: null,
            domainSummary: null,
            groupingRationale: null,
            variantSummary: null,
            confidence: null,
            noPoolReasonSummary: "The candidate evidence appears related but no single existing target was safe to reinforce.",
            reasonSummary: "ambiguous_target_between_equivalent_existing_pools",
            includedEvidenceEventIds: [],
            excludedEvidenceEventIds: [],
            adjacentEvidenceEventIds: [],
            uncertainEvidenceEventIds: [],
          },
        ],
      },
    });

    const { runWorksheetMemorySemanticPoolWorker } = await import("./worksheet-memory-semantic-pools");
    await runWorksheetMemorySemanticPoolWorker({ organizationId: "org-1", limit: 1 });

    const runRow = Array.from(state.semanticPoolRuns.values())[0] ?? {};
    const diagnosticSummary = runRow.diagnostic_summary as { jobs?: Array<Record<string, unknown>> } | undefined;
    expect(diagnosticSummary?.jobs?.[0]).toMatchObject({
      outcome: "no_pool",
      noPoolReasonSummary: "The candidate evidence appears related but no single existing target was safe to reinforce.",
      reasonSummary: "ambiguous_target_between_equivalent_existing_pools",
    });
  });
});
