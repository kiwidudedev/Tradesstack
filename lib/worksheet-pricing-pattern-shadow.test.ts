import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassifiedWorksheetMemoryEvent } from "./worksheet-memory-derivation";

const getPricingWorksheetAiProvider = vi.fn();
const getPricingWorksheetAnthropicModel = vi.fn();
const createAdminSupabaseClient = vi.fn();
const listClassifiedWorksheetMemoryEvents = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/providers/pricing-worksheet/registry", () => ({
  getPricingWorksheetAiProvider,
  getPricingWorksheetAnthropicModel,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));
vi.mock("@/lib/worksheet-memory-derivation", () => ({
  listClassifiedWorksheetMemoryEvents,
}));

function buildEvent(overrides: Record<string, unknown> = {}): ClassifiedWorksheetMemoryEvent {
  const base = {
    eventId: "event-1",
    organizationId: "org-1",
    projectId: null,
    opportunityId: null,
    eventType: "worksheet_formula_edited",
    occurredAt: "2026-06-05T00:00:00.000Z",
    metadata: {
      workbookId: null,
      sheetId: null,
      sheetName: "Suspended Ceilings",
      worksheetName: "Suspended Ceilings",
      tradePackage: "Ceilings",
    },
    diffData: {
      rowLabel: "Component Quantities",
      itemLabel: "Main Tees",
      columnHeader: "Quantity",
      unit: "lm",
      oldValue: null,
      newValue: null,
      oldFormula: "=E3/E4",
      newFormula: "=E3/E4*(1+E6/100)",
      captureCompletenessScore: 0.92,
      rowSnapshotCompleteness: 0.88,
    },
    classificationStatus: "classified" as const,
    classificationVersion: 1,
    classificationSource: "llm",
    classificationProvider: "anthropic",
    classificationModel: "claude-sonnet-4-6",
    classificationModelVersion: "1",
    overallConfidence: 0.84,
    reasoningSummary: "Repeated quantity formula change.",
    semanticFields: {
      costRole: { value: "amount_driver", confidence: 0.75 },
      cellRole: { value: "formula_input", confidence: 0.82 },
      pageType: { value: "component_quantities", confidence: 0.8 },
      sectionType: { value: "components", confidence: 0.77 },
      itemCategory: { value: "ceiling_grid_component", confidence: 0.74 },
      measurementBasis: { value: "linear", confidence: 0.72 },
      normalizedUnit: { value: "lm", confidence: 0.93 },
      normalizedTradePackage: { value: "ceilings", confidence: 0.86 },
      workCategory: { value: null, confidence: 0.2 },
      systemCategory: { value: null, confidence: 0.2 },
      assemblyCategory: { value: null, confidence: 0.2 },
    },
    interpretationSchemaVersion: 2,
    interpretationPayload: {
      interpretedChange: {
        whatChanged: "Estimator updated a quantity formula to include a waste factor.",
        plainEnglishSummary: "Updated quantity formula to include waste.",
        businessMeaning: "This changes a repeatable pricing formula pattern.",
        pricingMeaning: "Future AI should consider waste-linked quantity formulas in similar rows.",
        futureUse: {
          memoryCandidate: true,
          memoryType: "formula_pattern",
          retrievalGuidance: "Use on similar quantity formulas.",
        },
      },
    },
    futureUseSummary: {
      memoryCandidate: true,
      memoryType: "formula_pattern",
      retrievalGuidance: "Use on similar quantity formulas.",
    },
    confidenceDetail: {
      overall: 0.84,
      context: 0.79,
      futureUse: 0.78,
    },
    classifiedAt: "2026-06-05T00:05:00.000Z",
  } as ClassifiedWorksheetMemoryEvent;

  const merged = {
    ...base,
    ...overrides,
    metadata: {
      ...base.metadata,
      ...(overrides.metadata as Record<string, unknown> | undefined),
    },
    diffData: {
      ...base.diffData,
      ...(overrides.diffData as Record<string, unknown> | undefined),
    },
    semanticFields: {
      ...base.semanticFields,
      ...(overrides.semanticFields as Record<string, unknown> | undefined),
    },
  };

  return merged as ClassifiedWorksheetMemoryEvent;
}

function buildProviderResponse(proposals: Array<Record<string, unknown>>) {
  return {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-6",
    rawProviderResponse: {},
    parsedJson: {
      proposals,
    },
    outputText: "",
    evidence: [],
    citations: [],
    warnings: [],
    usage: undefined,
    webSearchUsed: false,
    effectiveWebSearchEnabled: false,
  };
}

function buildEmptyScope() {
  return {
    tradePackage: null,
    pageType: null,
    worksheetNameHint: null,
    itemCategory: null,
    normalizedUnit: null,
    costRole: null,
    sectionType: null,
  };
}

function buildAdminClient() {
  const runInsert = vi.fn().mockResolvedValue({
    data: { id: "run-1" },
    error: null,
  });
  const proposalInsert = vi.fn().mockResolvedValue({
    error: null,
  });

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "worksheet_pricing_pattern_shadow_runs") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: runInsert,
            }),
          }),
        };
      }

      if (table === "worksheet_pricing_pattern_shadow_proposals") {
        return {
          insert: proposalInsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    _runInsert: runInsert,
    _proposalInsert: proposalInsert,
  };
}

function buildIncrementalAdminClient(initial?: {
  processingRows?: Array<Record<string, unknown>>;
  candidates?: Array<Record<string, unknown>>;
  candidateEvidence?: Array<Record<string, unknown>>;
}) {
  const state = {
    processingRows: [...(initial?.processingRows ?? [])],
    candidates: [...(initial?.candidates ?? [])],
    candidateEvidence: [...(initial?.candidateEvidence ?? [])],
    runs: [] as Array<Record<string, unknown>>,
    proposals: [] as Array<Record<string, unknown>>,
  };

  const applyFilters = (rows: Array<Record<string, unknown>>, filters: Array<(row: Record<string, unknown>) => boolean>) =>
    rows.filter((row) => filters.every((filter) => filter(row)));

  const makeSelectBuilder = (rowsRef: () => Array<Record<string, unknown>>) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const builder = {
      eq(field: string, value: unknown) {
        filters.push((row) => row[field] === value);
        return builder;
      },
      neq(field: string, value: unknown) {
        filters.push((row) => row[field] !== value);
        return builder;
      },
      in(field: string, values: unknown[]) {
        filters.push((row) => values.includes(row[field]));
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      single() {
        return Promise.resolve({
          data: applyFilters(rowsRef(), filters)[0] ?? null,
          error: null,
        });
      },
      then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
        return Promise.resolve(resolve({
          data: applyFilters(rowsRef(), filters),
          error: null,
        }));
      },
    };
    return builder;
  };

  const updateRows = (
    rows: Array<Record<string, unknown>>,
    payload: Record<string, unknown>,
    match: (row: Record<string, unknown>) => boolean,
  ) => {
    const updated: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      if (match(row)) {
        Object.assign(row, payload);
        updated.push({ ...row });
      }
    }
    return updated;
  };

  const nowIso = () => new Date().toISOString();
  let claimCounter = 0;

  return {
    rpc: vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn === "enqueue_worksheet_pricing_pattern_evidence_processing") {
        const payload = Array.isArray(args.p_inputs) ? args.p_inputs as Array<Record<string, unknown>> : [];
        for (const row of payload) {
          const existing = state.processingRows.find(
            (entry) =>
              entry.source_event_id === row.sourceEventId
              && entry.classification_version === row.classificationVersion,
          );
          if (existing) {
            existing.organization_id = row.organizationId;
            existing.classification_record_id = row.classificationRecordId ?? existing.classification_record_id ?? null;
            existing.classification_attempt_number = Math.max(
              Number(existing.classification_attempt_number ?? 1),
              Number(row.classificationAttemptNumber ?? 1),
            );
            existing.updated_at = nowIso();
            continue;
          }

          state.processingRows.push({
            id: `processing-${state.processingRows.length + 1}`,
            organization_id: row.organizationId,
            source_event_id: row.sourceEventId,
            classification_record_id: row.classificationRecordId ?? null,
            classification_version: row.classificationVersion,
            classification_attempt_number: row.classificationAttemptNumber ?? 1,
            processing_status: "pending",
            processing_run_id: null,
            attempt_count: 0,
            max_attempts: 5,
            claimed_at: null,
            claim_expires_at: null,
            claimed_by: null,
            claim_token: null,
            processed_at: null,
            failed_at: null,
            retry_after: null,
            error_code: null,
            error_message: null,
            last_error_code: null,
            last_error_message: null,
            created_at: nowIso(),
            updated_at: nowIso(),
          });
        }

        return Promise.resolve({
          data: {
            count: payload.length,
            ids: state.processingRows.map((row) => row.id),
          },
          error: null,
        });
      }

      if (fn === "claim_worksheet_pricing_pattern_evidence_processing_batch") {
        const sourceEventIds = Array.isArray(args.p_source_event_ids) ? args.p_source_event_ids as unknown[] : [];
        const organizationId = args.p_organization_id;
        const limit = Math.max(Number(args.p_limit ?? 100), 1);
        const runId = args.p_processing_run_id;
        if (runId && !state.runs.some((row) => row.id === runId)) {
          return Promise.resolve({
            data: null,
            error: {
              message: "insert or update on table worksheet_pricing_pattern_evidence_processing violates foreign key constraint worksheet_pricing_pattern_evidence_processing_run_id_fkey",
            },
          });
        }

        const claimed = state.processingRows
          .filter((row) => !organizationId || row.organization_id === organizationId)
          .filter((row) => sourceEventIds.length === 0 || sourceEventIds.includes(row.source_event_id))
          .filter((row) => Number(row.attempt_count ?? 0) < Number(row.max_attempts ?? 5))
          .filter((row) => {
            if (row.processing_status === "pending") {
              return true;
            }
            if (row.processing_status === "retry_scheduled") {
              return !row.retry_after || Date.parse(String(row.retry_after)) <= Date.now();
            }
            if (row.processing_status === "claimed") {
              return !row.claim_expires_at || Date.parse(String(row.claim_expires_at)) <= Date.now();
            }
            return false;
          })
          .sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")))
          .slice(0, limit);

        const claimedData = claimed.map((row) => {
          claimCounter += 1;
          row.processing_status = "claimed";
          row.attempt_count = Number(row.attempt_count ?? 0) + 1;
          row.processing_run_id = runId ?? row.processing_run_id ?? null;
          row.claimed_at = nowIso();
          row.claim_expires_at = new Date(Date.now() + Math.max(Number(args.p_lease_seconds ?? 600), 30) * 1000).toISOString();
          row.claimed_by = args.p_worker_id ?? "worksheet-pricing-pattern-shadow-runner";
          row.claim_token = `claim-${claimCounter}`;
          row.updated_at = nowIso();

          return {
            rowId: row.id,
            organization_id: row.organization_id,
            source_event_id: row.source_event_id,
            classification_record_id: row.classification_record_id ?? null,
            classification_version: row.classification_version,
            classification_attempt_number: row.classification_attempt_number ?? 1,
            processing_status: row.processing_status,
            processing_run_id: row.processing_run_id,
            attempt_count: row.attempt_count,
            max_attempts: row.max_attempts ?? 5,
            claimed_at: row.claimed_at,
            claim_expires_at: row.claim_expires_at,
            claimed_by: row.claimed_by,
            claim_token: row.claim_token,
            processed_at: row.processed_at ?? null,
            failed_at: row.failed_at ?? null,
            retry_after: row.retry_after ?? null,
            error_code: row.error_code ?? null,
            error_message: row.error_message ?? null,
            last_error_code: row.last_error_code ?? null,
            last_error_message: row.last_error_message ?? null,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        });

        return Promise.resolve({ data: claimedData, error: null });
      }

      if (fn === "finalize_worksheet_pricing_pattern_evidence_processing_batch") {
        const payload = Array.isArray(args.p_inputs) ? args.p_inputs as Array<Record<string, unknown>> : [];
        let processedCount = 0;
        let retriedCount = 0;
        let deadLetteredCount = 0;
        for (const row of payload) {
          const existing = state.processingRows.find(
            (entry) =>
              entry.source_event_id === row.sourceEventId
              && entry.organization_id === row.organizationId
              && entry.classification_version === row.classificationVersion
              && entry.claim_token === row.claimToken
              && Number(entry.attempt_count ?? 0) === Number(row.attemptCount ?? 0),
          );
          if (!existing) {
            return Promise.resolve({
              data: null,
              error: { message: "Worksheet pricing pattern evidence processing claim not found." },
            });
          }

          if (row.processingStatus === "processed") {
            Object.assign(existing, {
              processing_status: "processed",
              processed_at: row.processedAt ?? nowIso(),
              failed_at: null,
              retry_after: null,
              error_code: null,
              error_message: null,
              claimed_at: null,
              claim_expires_at: null,
              claimed_by: null,
              claim_token: null,
              last_error_code: null,
              last_error_message: null,
              updated_at: nowIso(),
            });
            processedCount += 1;
          } else {
            const exhausted = Number(existing.attempt_count ?? 0) >= Number(existing.max_attempts ?? 5) || row.processingStatus === "dead_lettered";
            Object.assign(existing, {
              processing_status: exhausted ? "dead_lettered" : "retry_scheduled",
              failed_at: row.failedAt ?? nowIso(),
              retry_after: exhausted ? (row.retryAfter ?? existing.retry_after ?? null) : (row.retryAfter ?? nowIso()),
              error_code: row.errorCode ?? "processing_failed",
              error_message: row.errorMessage ?? "Worksheet pricing pattern processing failed.",
              claimed_at: null,
              claim_expires_at: null,
              claimed_by: null,
              claim_token: null,
              last_error_code: row.errorCode ?? "processing_failed",
              last_error_message: row.errorMessage ?? "Worksheet pricing pattern processing failed.",
              updated_at: nowIso(),
            });
            if (exhausted) {
              deadLetteredCount += 1;
            } else {
              retriedCount += 1;
            }
          }
        }

        return Promise.resolve({
          data: {
            count: payload.length,
            ids: payload.map((row) => {
              const existing = state.processingRows.find(
                (entry) =>
                  entry.source_event_id === row.sourceEventId
                  && entry.classification_version === row.classificationVersion,
              );
              return existing?.id ?? null;
            }),
            processedCount,
            retriedCount,
            deadLetteredCount,
          },
          error: null,
        });
      }

      if (fn === "upsert_worksheet_pricing_pattern_shadow_candidate") {
        const payload = ((args?.p_input ?? {}) as Record<string, unknown>);
        const existing = state.candidates
          .filter((row) => row.organization_id === payload.organization_id)
          .filter((row) => row.candidate_signature === payload.candidate_signature)
          .filter((row) => row.candidate_status !== "retired")
          .sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) || String(left.id ?? "").localeCompare(String(right.id ?? "")))[0] ?? null;

        if (existing) {
          return Promise.resolve({
            data: {
              candidate: existing,
              inserted: false,
            },
            error: null,
          });
        }

        const row = {
          id: payload.id ?? `candidate-${state.candidates.length + 1}`,
          created_at: payload.created_at ?? nowIso(),
          updated_at: payload.updated_at ?? nowIso(),
          ...payload,
        };
        state.candidates.push(row);
        return Promise.resolve({
          data: {
            candidate: row,
            inserted: true,
          },
          error: null,
        });
      }

      throw new Error(`Unexpected rpc ${fn}`);
    }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "worksheet_pricing_pattern_evidence_processing") {
        return {
          insert: vi.fn().mockImplementation((payload: Array<Record<string, unknown>>) => {
            for (const row of payload) {
              const existing = state.processingRows.find(
                (entry) =>
                  entry.source_event_id === row.source_event_id
                  && entry.classification_version === row.classification_version,
              );
              if (existing) {
                continue;
              } else {
                state.processingRows.push({
                  id: row.id ?? `processing-${state.processingRows.length + 1}`,
                  created_at: row.created_at ?? new Date().toISOString(),
                  updated_at: row.updated_at ?? new Date().toISOString(),
                  ...row,
                });
              }
            }
            return Promise.resolve({ error: null });
          }),
          select: vi.fn().mockImplementation(() => makeSelectBuilder(() => state.processingRows)),
          update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            const builder = {
              in(field: string, values: unknown[]) {
                if (
                  payload.processing_run_id
                  && !state.runs.some((run) => run.id === payload.processing_run_id)
                ) {
                  return Promise.resolve({
                    error: {
                      message: "insert or update on table worksheet_pricing_pattern_evidence_processing violates foreign key constraint worksheet_pricing_pattern_evidence_processing_run_id_fkey",
                    },
                  });
                }
                updateRows(state.processingRows, payload, (row) => values.includes(row[field]));
                return Promise.resolve({ error: null });
              },
            };
            return builder;
          }),
        };
      }

      if (table === "worksheet_pricing_pattern_shadow_candidates") {
        return {
          select: vi.fn().mockImplementation(() => makeSelectBuilder(() => state.candidates)),
          insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(() => {
                const row = {
                  id: payload.id ?? `candidate-${state.candidates.length + 1}`,
                  created_at: payload.created_at ?? new Date().toISOString(),
                  updated_at: payload.updated_at ?? new Date().toISOString(),
                  ...payload,
                };
                state.candidates.push(row);
                return Promise.resolve({ data: row, error: null });
              }),
            }),
          })),
          update: vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
            eq: vi.fn().mockImplementation((field: string, value: unknown) => ({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockImplementation(() => {
                  const updated = updateRows(state.candidates, payload, (row) => row[field] === value)[0] ?? null;
                  return Promise.resolve({ data: updated, error: null });
                }),
              }),
            })),
          })),
        };
      }

      if (table === "worksheet_pricing_pattern_shadow_candidate_evidence") {
        return {
          select: vi.fn().mockImplementation(() => makeSelectBuilder(() => state.candidateEvidence)),
          upsert: vi.fn().mockImplementation((payload: Array<Record<string, unknown>>) => {
            for (const row of payload) {
              const existing = state.candidateEvidence.find(
                (entry) => entry.candidate_id === row.candidate_id && entry.source_event_id === row.source_event_id,
              );
              if (existing) {
                Object.assign(existing, row);
              } else {
                state.candidateEvidence.push({
                  id: row.id ?? `candidate-evidence-${state.candidateEvidence.length + 1}`,
                  created_at: row.created_at ?? new Date().toISOString(),
                  ...row,
                });
              }
            }
            return Promise.resolve({ error: null });
          }),
        };
      }

      if (table === "worksheet_pricing_pattern_shadow_runs") {
        return {
          insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(() => {
                const row = { id: payload.id ?? `run-${state.runs.length + 1}`, ...payload };
                state.runs.push(row);
                return Promise.resolve({ data: { id: row.id }, error: null });
              }),
            }),
          })),
          update: vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
            eq: vi.fn().mockImplementation((field: string, value: unknown) => {
              updateRows(state.runs, payload, (row) => row[field] === value);
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }

      if (table === "worksheet_pricing_pattern_shadow_proposals") {
        return {
          insert: vi.fn().mockImplementation((payload: Array<Record<string, unknown>>) => {
            state.proposals.push(...payload);
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    state,
  };
}

describe("worksheet pricing pattern shadow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getPricingWorksheetAnthropicModel.mockReturnValue("claude-sonnet-4-6");
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "no_pattern",
        patternFamily: null,
        patternType: null,
        title: null,
        summary: "No reusable pattern found.",
        retrievalGuidance: null,
        confidence: null,
        scope: buildEmptyScope(),
        patternValueSummary: null,
        patternSignals: [],
        supportingEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });
  });

  it("does not mix organizations in the same Anthropic batch", async () => {
    const generateEditPlan = vi.fn()
      .mockResolvedValueOnce(buildProviderResponse([{
        proposalKind: "no_pattern",
        patternFamily: null,
        patternType: null,
        title: null,
        summary: "No reusable pattern found.",
        retrievalGuidance: null,
        confidence: null,
        scope: buildEmptyScope(),
        patternValueSummary: null,
        patternSignals: [],
        supportingEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }]))
      .mockResolvedValueOnce(buildProviderResponse([{
        proposalKind: "no_pattern",
        patternFamily: null,
        patternType: null,
        title: null,
        summary: "No reusable pattern found.",
        retrievalGuidance: null,
        confidence: null,
        scope: buildEmptyScope(),
        patternValueSummary: null,
        patternSignals: [],
        supportingEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }]));

    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan,
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "org1-a", organizationId: "org-1", projectId: "org1-project-1", metadata: { worksheetName: "Org1 Sheet A", workbookId: "org1-workbook-a", sessionId: "o1s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
        buildEvent({ eventId: "org1-b", organizationId: "org-1", projectId: "org1-project-2", metadata: { worksheetName: "Org1 Sheet B", workbookId: "org1-workbook-b", sessionId: "o1s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
        buildEvent({ eventId: "org1-c", organizationId: "org-1", projectId: "org1-project-3", metadata: { worksheetName: "Org1 Sheet C", workbookId: "org1-workbook-c", sessionId: "o1s2" }, occurredAt: "2026-06-06T00:02:00.000Z" }),
        buildEvent({ eventId: "org2-a", organizationId: "org-2", projectId: "org2-project-1", metadata: { worksheetName: "Org2 Sheet A", workbookId: "org2-workbook-a", sessionId: "o2s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
        buildEvent({ eventId: "org2-b", organizationId: "org-2", projectId: "org2-project-2", metadata: { worksheetName: "Org2 Sheet B", workbookId: "org2-workbook-b", sessionId: "o2s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
        buildEvent({ eventId: "org2-c", organizationId: "org-2", projectId: "org2-project-3", metadata: { worksheetName: "Org2 Sheet C", workbookId: "org2-workbook-c", sessionId: "o2s2" }, occurredAt: "2026-06-06T00:02:00.000Z" }),
      ],
      batchSize: 3,
    });

    expect(generateEditPlan).toHaveBeenCalledTimes(2);
    expect(generateEditPlan.mock.calls[0]?.[0]?.metadata).toMatchObject({ organizationId: "org-1" });
    expect(generateEditPlan.mock.calls[1]?.[0]?.metadata).toMatchObject({ organizationId: "org-2" });
  });

  it("skips two events from one worksheet instance before Anthropic", async () => {
    const generateEditPlan = vi.fn();
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan,
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Inputs", workbookId: "workbook-a", sheetId: "sheet-a" } }),
        buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Inputs", workbookId: "workbook-b", sheetId: "sheet-a" }, occurredAt: "2026-06-05T00:01:00.000Z" }),
      ],
      batchSize: 2,
    });

    expect(generateEditPlan).not.toHaveBeenCalled();
    expect(result.skippedPoolCount).toBe(1);
    expect(result.skippedPoolReasons.single_worksheet_behavior).toBe(1);
  });

  it("treats two worksheet instances across two projects on the same day as weak eligible", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({
        eventId: "event-1",
        projectId: "project-1",
        metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sessionId: "s1" },
        occurredAt: "2026-06-05T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-2",
        projectId: "project-2",
        metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sessionId: "s1" },
        occurredAt: "2026-06-05T00:01:00.000Z",
      }),
    ]);
    const eligibility = worksheetPricingPatternShadowTestUtils.computePatternPoolEligibility(diversity);

    expect(eligibility).toEqual({
      eligible: true,
      reason: "eligible",
      strengthCeiling: "weak",
    });
  });

  it("treats three worksheet instances across three projects on the same day as weak eligible", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Inputs", workbookId: "workbook-1", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
      buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Inputs", workbookId: "workbook-2", sessionId: "s1" }, occurredAt: "2026-06-05T00:01:00.000Z" }),
      buildEvent({ eventId: "event-3", projectId: "project-3", metadata: { worksheetName: "Inputs", workbookId: "workbook-3", sessionId: "s1" }, occurredAt: "2026-06-05T00:02:00.000Z" }),
    ]);
    const eligibility = worksheetPricingPatternShadowTestUtils.computePatternPoolEligibility(diversity);

    expect(eligibility).toEqual({
      eligible: true,
      reason: "eligible",
      strengthCeiling: "weak",
    });
  });

  it("counts copied worksheets with the same worksheetName but different workbookIds as distinct", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({
        eventId: "event-1",
        projectId: "project-1",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-1", sessionId: "s1" },
        occurredAt: "2026-06-05T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-2",
        projectId: "project-2",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-2", sessionId: "s2" },
        occurredAt: "2026-06-06T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-3",
        projectId: "project-3",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-3", sessionId: "s3" },
        occurredAt: "2026-06-07T00:00:00.000Z",
      }),
    ]);

    expect(diversity.worksheetCount).toBe(3);
    expect(diversity.workbookCount).toBe(3);
    expect(diversity.projectCount).toBe(3);
  });

  it("counts copied worksheets with the same worksheetName but different projectIds as distinct", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({
        eventId: "event-1",
        projectId: "project-1",
        metadata: { worksheetName: "Inputs", sessionId: "s1" },
        occurredAt: "2026-06-05T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-2",
        projectId: "project-2",
        metadata: { worksheetName: "Inputs", sessionId: "s2" },
        occurredAt: "2026-06-06T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-3",
        projectId: "project-3",
        metadata: { worksheetName: "Inputs", sessionId: "s3" },
        occurredAt: "2026-06-07T00:00:00.000Z",
      }),
    ]);

    expect(diversity.worksheetCount).toBe(3);
    expect(diversity.projectCount).toBe(3);
  });

  it("still counts the same workbookId and worksheetName as one worksheet instance", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({
        eventId: "event-1",
        projectId: "project-1",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-1", sessionId: "s1" },
        occurredAt: "2026-06-05T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-2",
        projectId: "project-1",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-1", sessionId: "s2" },
        occurredAt: "2026-06-06T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-3",
        projectId: "project-1",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-1", sessionId: "s3" },
        occurredAt: "2026-06-07T00:00:00.000Z",
      }),
    ]);

    expect(diversity.worksheetCount).toBe(1);
    expect(diversity.workbookCount).toBe(1);
  });

  it("lets copied worksheets across jobs pass the diversity gate when workbook or project context differs", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({
        eventId: "event-1",
        projectId: "project-1",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-1", sessionId: "s1" },
        occurredAt: "2026-06-05T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-2",
        projectId: "project-2",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-2", sessionId: "s2" },
        occurredAt: "2026-06-06T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "event-3",
        projectId: "project-3",
        metadata: { worksheetName: "Inputs", workbookId: "workbook-3", sessionId: "s3" },
        occurredAt: "2026-06-07T00:00:00.000Z",
      }),
    ]);
    const eligibility = worksheetPricingPatternShadowTestUtils.computePatternPoolEligibility(diversity);

    expect(diversity.worksheetCount).toBe(3);
    expect(eligibility).toEqual({
      eligible: true,
      reason: "eligible",
      strengthCeiling: "weak",
    });
  });

  it("rejects two events from the same worksheet instance across two projects", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Inputs", workbookId: "workbook-a", sheetId: "sheet-a" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
      buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Inputs", workbookId: "workbook-b", sheetId: "sheet-a" }, occurredAt: "2026-06-05T00:01:00.000Z" }),
    ]);
    const eligibility = worksheetPricingPatternShadowTestUtils.computePatternPoolEligibility(diversity);

    expect(eligibility).toEqual({
      eligible: false,
      reason: "single_worksheet_behavior",
      strengthCeiling: "none",
    });
  });

  it("rejects two worksheet instances from the same project as insufficient cross-context diversity", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
      buildEvent({ eventId: "event-2", projectId: "project-1", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b" }, occurredAt: "2026-06-05T00:01:00.000Z" }),
    ]);
    const eligibility = worksheetPricingPatternShadowTestUtils.computePatternPoolEligibility(diversity);

    expect(eligibility).toEqual({
      eligible: false,
      reason: "insufficient_cross_context_diversity",
      strengthCeiling: "none",
    });
  });

  it("allows reinforced ceiling for five events across three worksheets", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
      buildEvent({ eventId: "event-2", projectId: "project-1", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b" }, occurredAt: "2026-06-05T00:01:00.000Z" }),
      buildEvent({ eventId: "event-3", projectId: "project-2", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sheetId: "sheet-c" }, occurredAt: "2026-06-05T00:02:00.000Z" }),
      buildEvent({ eventId: "event-4", projectId: "project-2", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a" }, occurredAt: "2026-06-05T00:03:00.000Z" }),
      buildEvent({ eventId: "event-5", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b" }, occurredAt: "2026-06-05T00:04:00.000Z" }),
    ]);
    const eligibility = worksheetPricingPatternShadowTestUtils.computePatternPoolEligibility(diversity);

    expect(eligibility).toEqual({
      eligible: true,
      reason: "eligible",
      strengthCeiling: "reinforced",
    });
  });

  it("allows durable ceiling for eight events across four worksheets and two projects", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const diversity = worksheetPricingPatternShadowTestUtils.computePatternPoolDiversity([
      buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a" }, occurredAt: "2026-06-01T00:00:00.000Z" }),
      buildEvent({ eventId: "event-2", projectId: "project-1", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b" }, occurredAt: "2026-06-01T00:01:00.000Z" }),
      buildEvent({ eventId: "event-3", projectId: "project-2", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sheetId: "sheet-c" }, occurredAt: "2026-06-01T00:02:00.000Z" }),
      buildEvent({ eventId: "event-4", projectId: "project-3", metadata: { worksheetName: "Sheet D", workbookId: "workbook-d", sheetId: "sheet-d" }, occurredAt: "2026-06-01T00:03:00.000Z" }),
      buildEvent({ eventId: "event-5", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a" }, occurredAt: "2026-06-01T00:04:00.000Z" }),
      buildEvent({ eventId: "event-6", projectId: "project-1", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b" }, occurredAt: "2026-06-01T00:05:00.000Z" }),
      buildEvent({ eventId: "event-7", projectId: "project-2", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sheetId: "sheet-c" }, occurredAt: "2026-06-01T00:06:00.000Z" }),
      buildEvent({ eventId: "event-8", projectId: "project-3", metadata: { worksheetName: "Sheet D", workbookId: "workbook-d", sheetId: "sheet-d" }, occurredAt: "2026-06-01T00:07:00.000Z" }),
    ]);
    const eligibility = worksheetPricingPatternShadowTestUtils.computePatternPoolEligibility(diversity);

    expect(eligibility).toEqual({
      eligible: true,
      reason: "eligible",
      strengthCeiling: "durable",
    });
  });

  it("sends workflowStage and organizationId metadata on shadow proposal batches", async () => {
    const generateEditPlan = vi.fn().mockResolvedValue(buildProviderResponse([{
      proposalKind: "no_pattern",
      patternFamily: null,
      patternType: null,
      title: null,
      summary: "No reusable pattern found.",
      retrievalGuidance: null,
      confidence: null,
      scope: buildEmptyScope(),
      patternValueSummary: null,
      patternSignals: [],
      supportingEvidenceEventIds: [],
      contradictoryEvidenceEventIds: [],
      contradictionReason: null,
      dominantAlternativePatternType: null,
    }]));

    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan,
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", organizationId: "org-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
        buildEvent({ eventId: "event-2", organizationId: "org-1", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", organizationId: "org-1", projectId: "project-3", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sessionId: "s2" }, occurredAt: "2026-06-06T00:02:00.000Z" }),
      ],
      batchSize: 3,
    });

    expect(generateEditPlan).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        workflowStage: "worksheet_pricing_pattern_shadow_proposals",
        organizationId: "org-1",
      }),
    }));
    const prompt = generateEditPlan.mock.calls[0]?.[0]?.userPrompt as string;
    expect(prompt).toContain("supportingEvidenceEventIds from at least 2 worksheet instances and at least 2 projects");
    expect(prompt).toContain("Do not propose a pattern from a single support event.");
    expect(prompt).toContain("If proposalKind = no_pattern, supportingEvidenceEventIds must be []");
    expect(prompt).toContain("If two events show the same specific pricing behavior across 2 worksheet instances and 2 projects, return a weak pattern");
  });

  it("normalizes no_pattern proposals with model-supplied support ids to an empty support set", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const normalized = worksheetPricingPatternShadowTestUtils.normalizeRawPatternProposal({
      proposalKind: "no_pattern",
      patternFamily: "formula_pattern",
      patternType: "formula_dependency_pattern",
      title: "Should be cleared",
      summary: "No reusable pattern found.",
      retrievalGuidance: "Should be cleared",
      confidence: 0.7,
      scope: buildEmptyScope(),
      patternValueSummary: "Should be cleared",
      patternSignals: ["waste"],
      supportingEvidenceEventIds: ["event-1", "event-2"],
      contradictoryEvidenceEventIds: ["event-3"],
      contradictionReason: "Should be cleared",
      dominantAlternativePatternType: "other_pattern",
    });

    expect(normalized).toMatchObject({
      proposalKind: "no_pattern",
      patternFamily: null,
      patternType: null,
      retrievalGuidance: null,
      confidence: null,
      patternValueSummary: null,
      patternSignals: [],
      supportingEvidenceEventIds: [],
      contradictoryEvidenceEventIds: [],
      contradictionReason: null,
      dominantAlternativePatternType: null,
    });
  });

  it("no longer flags invalid_no_pattern_payload when the model returns no_pattern with support ids", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "no_pattern",
        patternFamily: "formula_pattern",
        patternType: "formula_dependency_pattern",
        title: "Should be ignored",
        summary: "No reusable pattern found.",
        retrievalGuidance: "Should be ignored",
        confidence: 0.72,
        scope: buildEmptyScope(),
        patternValueSummary: "Should be ignored",
        patternSignals: ["waste"],
        supportingEvidenceEventIds: ["event-1", "event-2"],
        contradictoryEvidenceEventIds: ["event-3"],
        contradictionReason: "Should be ignored",
        dominantAlternativePatternType: "other_pattern",
      }])),
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a" } }),
        buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b" }, occurredAt: "2026-06-05T00:01:00.000Z" }),
      ],
      batchSize: 2,
    });

    expect(result.noPatternCount).toBe(1);
    expect(result.rejectedByGate).toBe(0);
    expect(result.proposals[0]).toMatchObject({
      gateStatus: "no_pattern",
      supportingEvidenceEventIds: [],
      contradictoryEvidenceEventIds: [],
      rejectionReasons: [],
    });
  });

  it("rejects proposals with insufficient supporting evidence ids", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "formula_pattern",
        patternType: "formula_dependency_pattern",
        title: "Quantity formulas usually include waste",
        summary: "Repeated quantity formulas include waste inputs.",
        retrievalGuidance: "Use in similar quantity rows.",
        confidence: 0.88,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Sheet A",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        patternValueSummary: "Repeated quantity formulas include waste inputs.",
        patternSignals: ["include_waste_input", "quantity_formula"],
        supportingEvidenceEventIds: ["event-1"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
        buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b", sessionId: "s2" }, occurredAt: "2026-06-06T00:02:00.000Z" }),
      ],
      batchSize: 3,
    });

    expect(result.acceptedByGate).toBe(0);
    expect(result.rejectedByGate).toBe(1);
    expect(result.proposals[0]?.rejectionReasons).toContain("evidence_count_below_threshold");
  });

  it("accepts same-organization evidence into a shadow proposal", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "formula_pattern",
        patternType: "formula_dependency_pattern",
        title: "Quantity formulas usually include waste",
        summary: "Repeated quantity formulas include waste-linked inputs in similar worksheet rows.",
        retrievalGuidance: "Use cautiously in similar quantity rows.",
        confidence: 0.82,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Sheet A",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        patternValueSummary: "Repeated quantity formulas include waste-linked inputs.",
        patternSignals: ["include_waste_input", "quantity", "allowance"],
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
        buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", projectId: "project-3", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sessionId: "s2" }, occurredAt: "2026-06-06T00:02:00.000Z" }),
      ],
      batchSize: 3,
    });

    expect(result.acceptedByGate).toBe(1);
    expect(result.rejectedByGate).toBe(0);
    expect(result.proposals[0]).toMatchObject({
      gateStatus: "accepted",
      patternFamily: "formula_pattern",
      proposalKind: "pattern",
      proposedStrength: "weak",
      supportingEvidenceEventIds: ["event-1", "event-2", "event-3"],
      validation: expect.objectContaining({
        poolEligibilityReason: "eligible",
        poolStrengthCeiling: "weak",
        supportEligibilityReason: "eligible",
        supportStrengthCeiling: "weak",
      }),
    });
    expect(result.proposals[0]?.evidenceSummary.poolDiversity).toMatchObject({
      evidenceCount: 3,
      worksheetCount: 3,
    });
    expect(result.proposals[0]?.evidenceSummary.supportDiversity).toMatchObject({
      evidenceCount: 3,
      worksheetCount: 3,
    });
  });

  it("accepts a weak pattern from two matching events across two worksheets and two projects", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "allowance_pattern",
        patternType: "material_waste_factor_adjustment",
        title: "Observed repeated adjustment",
        summary: "Observed repeated adjustment in waste allowance rows.",
        retrievalGuidance: "Use cautiously in similar allowance rows.",
        confidence: 0.62,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Sheet A",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        patternValueSummary: "Waste allowance adjusted upward.",
        patternSignals: ["allowance_adjustment"],
        supportingEvidenceEventIds: ["event-1", "event-2"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a" } }),
        buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b" }, occurredAt: "2026-06-05T00:01:00.000Z" }),
      ],
      batchSize: 2,
    });

    expect(result.acceptedByGate).toBe(1);
    expect(result.rejectedByGate).toBe(0);
    expect(result.proposals[0]).toMatchObject({
      gateStatus: "accepted",
      proposedStrength: "weak",
      supportingEvidenceEventIds: ["event-1", "event-2"],
    });
  });

  it("keeps conflicting two-event evidence as no_pattern safely", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "no_pattern",
        patternFamily: null,
        patternType: null,
        title: null,
        summary: "No reusable pattern found.",
        retrievalGuidance: null,
        confidence: null,
        scope: buildEmptyScope(),
        patternValueSummary: null,
        patternSignals: [],
        supportingEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", diffData: { newValue: 10 }, metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a" } }),
        buildEvent({ eventId: "event-2", projectId: "project-2", diffData: { newValue: 15 }, metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b" }, occurredAt: "2026-06-05T00:01:00.000Z" }),
      ],
      batchSize: 2,
    });

    expect(result.noPatternCount).toBe(1);
    expect(result.acceptedByGate).toBe(0);
    expect(result.rejectedByGate).toBe(0);
    expect(result.proposals[0]).toMatchObject({
      gateStatus: "no_pattern",
      supportingEvidenceEventIds: [],
      contradictoryEvidenceEventIds: [],
    });
  });

  it("rejects a diverse pool when supporting evidence collapses to one worksheet", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "allowance_pattern",
        patternType: "material_waste_factor_adjustment",
        title: "Observed repeated adjustment",
        summary: "Observed repeated adjustment in grid waste allowance.",
        retrievalGuidance: "Observed repeated adjustment in similar grid waste rows.",
        confidence: 0.7,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Sheet A",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        patternValueSummary: "Grid waste was adjusted upward.",
        patternSignals: ["waste_adjustment"],
        supportingEvidenceEventIds: ["event-1", "event-2"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
        buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", projectId: "project-3", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b", sessionId: "s3" }, occurredAt: "2026-06-07T00:02:00.000Z" }),
      ],
      batchSize: 3,
    });

    expect(result.acceptedByGate).toBe(0);
    expect(result.rejectedByGate).toBe(1);
    expect(result.proposals[0]?.rejectionReasons).toContain("support_diversity_below_threshold");
    expect(result.proposals[0]?.validation.supportDiversity).toMatchObject({
      evidenceCount: 2,
      worksheetCount: 1,
    });
    expect(result.proposals[0]?.validation.poolDiversity).toMatchObject({
      evidenceCount: 3,
      worksheetCount: 2,
    });
  });

  it("stores supportDiversity separately from poolDiversity", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "formula_pattern",
        patternType: "formula_dependency_pattern",
        title: "Observed repeated adjustment",
        summary: "Observed repeated adjustment in similar worksheet rows.",
        retrievalGuidance: "Observed repeated adjustment in similar quantity rows.",
        confidence: 0.7,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Sheet A",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        patternValueSummary: "Formula behavior repeated.",
        patternSignals: ["formula_adjustment"],
        supportingEvidenceEventIds: ["event-1", "event-2"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sheetId: "sheet-a", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
        buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sheetId: "sheet-b", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", projectId: "project-3", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sheetId: "sheet-c", sessionId: "s3" }, occurredAt: "2026-06-07T00:02:00.000Z" }),
        buildEvent({ eventId: "event-4", projectId: "project-3", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sheetId: "sheet-c", sessionId: "s3" }, occurredAt: "2026-06-07T00:03:00.000Z" }),
        buildEvent({ eventId: "event-5", projectId: "project-3", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sheetId: "sheet-c", sessionId: "s4" }, occurredAt: "2026-06-08T00:03:00.000Z" }),
      ],
      batchSize: 5,
    });

    expect(result.proposals[0]?.validation.poolDiversity).toMatchObject({
      evidenceCount: 5,
      worksheetCount: 3,
    });
    expect(result.proposals[0]?.validation.supportDiversity).toMatchObject({
      evidenceCount: 2,
      worksheetCount: 2,
    });
  });

  it("softens weak pattern wording", async () => {
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "allowance_pattern",
        patternType: "material_waste_factor_adjustment",
        title: "Company usually defaults to 15%",
        summary: "This company usually defaults to a 15% waste factor and default to a higher allowance.",
        retrievalGuidance: "Default to 15% when this company usually prices similar work.",
        confidence: 0.63,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Sheet A",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        patternValueSummary: "Allowance adjusted upward.",
        patternSignals: ["allowance_adjustment"],
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternProposalsShadowMode } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternProposalsShadowMode({
      events: [
        buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
        buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", projectId: "project-3", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sessionId: "s2" }, occurredAt: "2026-06-06T00:02:00.000Z" }),
      ],
      batchSize: 3,
    });

    expect(result.proposals[0]?.proposedStrength).toBe("weak");
    expect(result.proposals[0]?.summary).not.toContain("company usually");
    expect(result.proposals[0]?.summary).not.toContain("default to");
    expect(result.proposals[0]?.retrievalGuidance).not.toContain("company usually");
    expect(result.proposals[0]?.retrievalGuidance).not.toContain("default to");
  });

  it("persists only shadow runs and shadow proposals", async () => {
    const admin = buildAdminClient();
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
      buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
      buildEvent({ eventId: "event-3", projectId: "project-3", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sessionId: "s2" }, occurredAt: "2026-06-06T00:02:00.000Z" }),
    ]);
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "formula_pattern",
        patternType: "formula_dependency_pattern",
        title: "Quantity formulas usually include waste",
        summary: "Repeated quantity formulas include waste-linked inputs in similar worksheet rows.",
        retrievalGuidance: "Use cautiously in similar quantity rows.",
        confidence: 0.82,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Sheet A",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        patternValueSummary: "Repeated quantity formulas include waste-linked inputs.",
        patternSignals: ["include_waste_input"],
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternShadowDerivation } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternShadowDerivation({
      organizationId: "org-1",
      limit: 50,
    });

    expect(listClassifiedWorksheetMemoryEvents).toHaveBeenCalledWith({
      organizationId: "org-1",
      limit: 50,
    });
    expect(result.runId).toBe("run-1");
    expect(admin._runInsert).toHaveBeenCalledTimes(1);
    expect(admin._proposalInsert).toHaveBeenCalledTimes(1);
    expect(admin._proposalInsert.mock.calls[0]?.[0]?.[0]).toMatchObject({
      run_id: "run-1",
      pattern_family: "formula_pattern",
    });
  });

  it("counts no_pattern in run metrics but does not persist it by default", async () => {
    const admin = buildAdminClient();
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({ eventId: "event-1", projectId: "project-1", metadata: { worksheetName: "Sheet A", workbookId: "workbook-a", sessionId: "s1" }, occurredAt: "2026-06-05T00:00:00.000Z" }),
      buildEvent({ eventId: "event-2", projectId: "project-2", metadata: { worksheetName: "Sheet B", workbookId: "workbook-b", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
      buildEvent({ eventId: "event-3", projectId: "project-3", metadata: { worksheetName: "Sheet C", workbookId: "workbook-c", sessionId: "s2" }, occurredAt: "2026-06-06T00:02:00.000Z" }),
    ]);
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "no_pattern",
        patternFamily: null,
        patternType: null,
        title: null,
        summary: "No reusable pattern found.",
        retrievalGuidance: null,
        confidence: null,
        scope: buildEmptyScope(),
        patternValueSummary: null,
        patternSignals: [],
        supportingEvidenceEventIds: [],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternShadowDerivation } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternShadowDerivation({
      organizationId: "org-1",
      limit: 50,
    });

    expect(result.noPatternCount).toBe(1);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.gateStatus).toBe("no_pattern");
    expect(admin._runInsert).toHaveBeenCalledTimes(1);
    expect(admin._proposalInsert).not.toHaveBeenCalled();
  });

  it("creates processing records for newly classified events and does not reprocess processed rows", async () => {
    const admin = buildIncrementalAdminClient({
      processingRows: [{
        id: "processing-1",
        organization_id: "org-1",
        source_event_id: "event-processed",
        classification_version: 1,
        classification_attempt_number: 1,
        processing_status: "processed",
      }],
    });
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({ eventId: "event-new", metadata: { worksheetName: "Sheet A" } }),
      buildEvent({ eventId: "event-processed", metadata: { worksheetName: "Sheet B" }, occurredAt: "2026-06-06T00:00:00.000Z" }),
    ]);
    const generateEditPlan = vi.fn();
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan,
    });

    const { runWorksheetPricingPatternShadowIncremental } = await import("./worksheet-pricing-pattern-shadow");
    await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });

    expect(admin.state.processingRows.some((row) => row.source_event_id === "event-new")).toBe(true);
    expect(admin.state.runs).toHaveLength(1);
    expect(generateEditPlan).not.toHaveBeenCalled();
  });

  it("leaves processed, claimed, and retry-scheduled rows unchanged during enqueue", async () => {
    const admin = buildIncrementalAdminClient({
      processingRows: [
        {
          id: "processing-processed",
          organization_id: "org-1",
          source_event_id: "event-processed",
          classification_version: 1,
          classification_attempt_number: 1,
          processing_status: "processed",
          processed_at: "2026-06-05T01:00:00.000Z",
          processing_run_id: "run-old",
        },
        {
          id: "processing-claimed",
          organization_id: "org-1",
          source_event_id: "event-claimed",
          classification_version: 1,
          classification_attempt_number: 1,
          processing_status: "claimed",
          processing_run_id: "run-live",
          attempt_count: 1,
          claim_token: "claim-live",
          claim_expires_at: "2099-01-01T00:10:00.000Z",
        },
        {
          id: "processing-retry",
          organization_id: "org-1",
          source_event_id: "event-retry",
          classification_version: 1,
          classification_attempt_number: 1,
          processing_status: "retry_scheduled",
          attempt_count: 1,
          failed_at: "2026-06-05T02:00:00.000Z",
          retry_after: "2099-01-01T00:00:00.000Z",
          error_code: "transient_failure",
          error_message: "try again later",
        },
      ],
    });
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({ eventId: "event-processed", metadata: { worksheetName: "Sheet A" } }),
      buildEvent({ eventId: "event-claimed", metadata: { worksheetName: "Sheet B" }, occurredAt: "2026-06-06T00:00:00.000Z" }),
      buildEvent({ eventId: "event-retry", metadata: { worksheetName: "Sheet C" }, occurredAt: "2026-06-07T00:00:00.000Z" }),
      buildEvent({ eventId: "event-new", metadata: { worksheetName: "Sheet D" }, occurredAt: "2026-06-08T00:00:00.000Z" }),
    ]);
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn(),
    });

    const { runWorksheetPricingPatternShadowIncremental } = await import("./worksheet-pricing-pattern-shadow");
    await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });

    expect(admin.state.processingRows.find((row) => row.source_event_id === "event-processed")).toMatchObject({
      processing_status: "processed",
      processed_at: "2026-06-05T01:00:00.000Z",
      processing_run_id: "run-old",
    });
    expect(admin.state.processingRows.find((row) => row.source_event_id === "event-claimed")).toMatchObject({
      processing_status: "claimed",
      processing_run_id: "run-live",
    });
    expect(admin.state.processingRows.find((row) => row.source_event_id === "event-retry")).toMatchObject({
      processing_status: "retry_scheduled",
      retry_after: "2099-01-01T00:00:00.000Z",
      error_code: "transient_failure",
    });
    expect(admin.state.processingRows.find((row) => row.source_event_id === "event-new")).toBeTruthy();
  });

  it("reinforces existing candidates incrementally without double-linking on rerun", async () => {
    const admin = buildIncrementalAdminClient({
      candidates: [{
        id: "candidate-1",
        organization_id: "org-1",
        candidate_status: "active",
        pattern_family: "formula_pattern",
        pattern_type: "formula_dependency_pattern",
        current_strength: "weak",
        confidence: 0.72,
        title: "Observed repeated adjustment",
        summary: "Observed repeated adjustment in formula rows.",
        retrieval_guidance: null,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Suspended Ceilings",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        pattern_value: {
          summary: "Formula includes waste.",
          signals: ["waste", "quantity"],
        },
        support_count: 1,
        contradiction_count: 0,
        ignored_count: 0,
        support_diversity: {
          evidenceCount: 1,
          worksheetCount: 1,
          workbookCount: 1,
          projectCount: 1,
          sessionCount: 1,
          estimatorCount: null,
          dateSpanDays: 0,
          worksheetKeys: ["Suspended Ceilings"],
          workbookIds: ["workbook-1"],
          projectIds: ["project-1"],
          sessionIds: ["s0"],
          estimatorIds: [],
          occurredAtMin: "2026-06-04T00:00:00.000Z",
          occurredAtMax: "2026-06-04T00:00:00.000Z",
        },
        contradiction_diversity: null,
      }],
      candidateEvidence: [{
        id: "link-1",
        candidate_id: "candidate-1",
        source_event_id: "historical-1",
        evidence_role: "supporting",
      }],
    });
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({
        eventId: "event-new",
        organizationId: "org-1",
        projectId: "project-1",
        metadata: {
          workbookId: "workbook-1",
          worksheetName: "Suspended Ceilings",
          tradePackage: "Ceilings",
          sessionId: "s1",
        },
      }),
    ]);
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn(),
    });

    const { runWorksheetPricingPatternShadowIncremental } = await import("./worksheet-pricing-pattern-shadow");
    const first = await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });
    const second = await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });

    const candidate = admin.state.candidates.find((row) => row.id === "candidate-1");
    expect(first.processedEventCount).toBe(1);
    expect(second.processedEventCount).toBe(0);
    expect(candidate?.support_count).toBe(2);
    expect(admin.state.candidateEvidence.filter((row) => row.candidate_id === "candidate-1" && row.source_event_id === "event-new")).toHaveLength(1);
  });

  it("uses one active candidate for the same semantic proposal across reruns", async () => {
    const admin = buildIncrementalAdminClient();
    createAdminSupabaseClient.mockReturnValue(admin);
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const supportA = buildEvent({
      eventId: "support-a",
      organizationId: "org-1",
      projectId: "project-1",
      metadata: { worksheetName: "Partition Sheet A", workbookId: "workbook-a", sheetId: "sheet-a", tradePackage: "Partitions", sessionId: "s1" },
      semanticFields: {
        ...buildEvent().semanticFields,
        pageType: { value: "assumptions", confidence: 0.8 },
        sectionType: { value: "inputs", confidence: 0.8 },
        itemCategory: { value: "stud_wall_component", confidence: 0.8 },
        normalizedUnit: { value: "m2", confidence: 0.8 },
        costRole: { value: "quantity_driver", confidence: 0.8 },
      },
    });
    const supportB = buildEvent({
      eventId: "support-b",
      organizationId: "org-1",
      projectId: "project-2",
      metadata: { worksheetName: "Partition Sheet B", workbookId: "workbook-b", sheetId: "sheet-b", tradePackage: "Partitions", sessionId: "s2" },
      semanticFields: supportA.semanticFields,
      occurredAt: "2026-06-06T00:00:00.000Z",
    });
    const proposal = {
      proposalId: "proposal-1",
      batchId: "org-1:pricing-pattern-batch:1",
      organizationId: "org-1",
      gateStatus: "accepted" as const,
      proposalKind: "pattern" as const,
      patternFamily: "formula_pattern" as const,
      patternType: "formula_dependency_pattern",
      title: "Observed repeated adjustment",
      summary: "Observed repeated adjustment in similar worksheet rows.",
      retrievalGuidance: null,
      confidence: 0.71,
      proposedStrength: "weak" as const,
      scope: {
        tradePackage: "Partitions",
        pageType: "assumptions",
        worksheetNameHint: "Partition Sheet A",
        itemCategory: "stud_wall_component",
        normalizedUnit: "m2",
        costRole: "quantity_driver",
        sectionType: "inputs",
      },
      patternValue: {
        summary: "Formula includes waste inputs.",
        signals: ["waste", "quantity"],
      },
      supportingEvidenceEventIds: ["support-a", "support-b"],
      contradictoryEvidenceEventIds: [],
      ignoredEvidenceEventIds: [],
      evidenceSummary: {},
      contradictionSummary: {},
      validation: {},
      rejectionReasons: [],
    };

    const first = await worksheetPricingPatternShadowTestUtils.createCandidatesFromAcceptedProposals({
      runId: "run-1",
      proposals: [proposal],
      eventsById: new Map([["support-a", supportA], ["support-b", supportB]]),
    });
    const second = await worksheetPricingPatternShadowTestUtils.createCandidatesFromAcceptedProposals({
      runId: "run-2",
      proposals: [proposal],
      eventsById: new Map([["support-a", supportA], ["support-b", supportB]]),
    });

    expect(first.insertedCount).toBe(1);
    expect(second.insertedCount).toBe(0);
    expect(admin.state.candidates).toHaveLength(1);
    expect(admin.state.candidateEvidence.filter((row) => row.source_event_id === "support-a")).toHaveLength(1);
    expect(admin.state.candidateEvidence.filter((row) => row.source_event_id === "support-b")).toHaveLength(1);
  });

  it("builds the same candidate signature for equivalent full-scan and incremental proposals", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");

    const fullScanSignatures = worksheetPricingPatternShadowTestUtils.buildShadowCandidateSignatures({
      organizationId: "org-1",
      patternFamily: "formula_pattern",
      patternType: "formula_dependency_pattern",
      scope: {
        tradePackage: "Partitions",
        pageType: "Assumptions",
        worksheetNameHint: "Partition Sheet A",
        itemCategory: "Stud_Wall_Component",
        normalizedUnit: "m2",
        costRole: "Quantity Driver",
        sectionType: "inputs",
      },
      patternValue: {
        summary: " Formula includes waste inputs. ",
        signals: ["quantity", "waste", "quantity"],
      },
    });
    const incrementalSignatures = worksheetPricingPatternShadowTestUtils.buildShadowCandidateSignatures({
      organizationId: "org-1",
      patternFamily: "FORMULA_PATTERN" as never,
      patternType: "formula_dependency_pattern",
      scope: {
        tradePackage: "partitions",
        pageType: "assumptions",
        worksheetNameHint: "Partition  Sheet A",
        itemCategory: "stud_wall_component",
        normalizedUnit: "M2",
        costRole: "quantity   driver",
        sectionType: "inputs",
      },
      patternValue: {
        summary: "formula includes waste inputs.",
        signals: ["waste", "quantity"],
      },
    });

    expect(fullScanSignatures.scopeSignature).toBe(incrementalSignatures.scopeSignature);
    expect(fullScanSignatures.patternValueSignature).toBe(incrementalSignatures.patternValueSignature);
    expect(fullScanSignatures.candidateSignature).toBe(incrementalSignatures.candidateSignature);
  });

  it("keeps same semantic candidates separate across organizations", async () => {
    const admin = buildIncrementalAdminClient();
    createAdminSupabaseClient.mockReturnValue(admin);
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");

    const org1SupportA = buildEvent({ eventId: "org1-a", organizationId: "org-1", projectId: "project-1" });
    const org1SupportB = buildEvent({ eventId: "org1-b", organizationId: "org-1", projectId: "project-2", occurredAt: "2026-06-06T00:00:00.000Z" });
    const org2SupportA = buildEvent({ eventId: "org2-a", organizationId: "org-2", projectId: "project-1" });
    const org2SupportB = buildEvent({ eventId: "org2-b", organizationId: "org-2", projectId: "project-2", occurredAt: "2026-06-06T00:00:00.000Z" });

    const baseProposal = {
      gateStatus: "accepted" as const,
      proposalKind: "pattern" as const,
      patternFamily: "formula_pattern" as const,
      patternType: "formula_dependency_pattern",
      title: "Observed repeated adjustment",
      summary: "Observed repeated adjustment in similar worksheet rows.",
      retrievalGuidance: null,
      confidence: 0.71,
      proposedStrength: "weak" as const,
      scope: {
        tradePackage: "Ceilings",
        pageType: "component_quantities",
        worksheetNameHint: "Suspended Ceilings",
        itemCategory: "ceiling_grid_component",
        normalizedUnit: "lm",
        costRole: "amount_driver",
        sectionType: "components",
      },
      patternValue: {
        summary: "Formula includes waste inputs.",
        signals: ["waste", "quantity"],
      },
      contradictoryEvidenceEventIds: [],
      ignoredEvidenceEventIds: [],
      evidenceSummary: {},
      contradictionSummary: {},
      validation: {},
      rejectionReasons: [],
    };

    await worksheetPricingPatternShadowTestUtils.createCandidatesFromAcceptedProposals({
      runId: "run-org1",
      proposals: [{
        ...baseProposal,
        proposalId: "proposal-org1",
        batchId: "org-1:pricing-pattern-batch:1",
        organizationId: "org-1",
        supportingEvidenceEventIds: ["org1-a", "org1-b"],
      }],
      eventsById: new Map([["org1-a", org1SupportA], ["org1-b", org1SupportB]]),
    });
    await worksheetPricingPatternShadowTestUtils.createCandidatesFromAcceptedProposals({
      runId: "run-org2",
      proposals: [{
        ...baseProposal,
        proposalId: "proposal-org2",
        batchId: "org-2:pricing-pattern-batch:1",
        organizationId: "org-2",
        supportingEvidenceEventIds: ["org2-a", "org2-b"],
      }],
      eventsById: new Map([["org2-a", org2SupportA], ["org2-b", org2SupportB]]),
    });

    expect(admin.state.candidates.filter((row) => row.pattern_type === "formula_dependency_pattern")).toHaveLength(2);
    expect(new Set(admin.state.candidates.map((row) => row.organization_id))).toEqual(new Set(["org-1", "org-2"]));
  });

  it("allows a new active candidate when the old candidate with the same signature is retired", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const signatures = worksheetPricingPatternShadowTestUtils.buildShadowCandidateSignatures({
      organizationId: "org-1",
      patternFamily: "formula_pattern",
      patternType: "formula_dependency_pattern",
      scope: {
        tradePackage: "Partitions",
        pageType: "assumptions",
        worksheetNameHint: "Partition Sheet A",
        itemCategory: "stud_wall_component",
        normalizedUnit: "m2",
        costRole: "quantity_driver",
        sectionType: "inputs",
      },
      patternValue: {
        summary: "Formula includes waste inputs.",
        signals: ["waste", "quantity"],
      },
    });
    const admin = buildIncrementalAdminClient({
      candidates: [{
        id: "candidate-retired",
        organization_id: "org-1",
        candidate_status: "retired",
        pattern_family: "formula_pattern",
        pattern_type: "formula_dependency_pattern",
        current_strength: "weak",
        confidence: 0.7,
        title: "Old retired candidate",
        summary: "Old retired candidate",
        retrieval_guidance: null,
        scope: {
          tradePackage: "Partitions",
          pageType: "assumptions",
          worksheetNameHint: "Partition Sheet A",
          itemCategory: "stud_wall_component",
          normalizedUnit: "m2",
          costRole: "quantity_driver",
          sectionType: "inputs",
        },
        pattern_value: {
          summary: "Formula includes waste inputs.",
          signals: ["waste", "quantity"],
        },
        scope_signature: signatures.scopeSignature,
        pattern_value_signature: signatures.patternValueSignature,
        candidate_signature: signatures.candidateSignature,
        signature_uniqueness_enabled: true,
        support_count: 1,
        contradiction_count: 0,
        ignored_count: 0,
        support_diversity: {},
        contradiction_diversity: null,
      }],
    });
    createAdminSupabaseClient.mockReturnValue(admin);

    const supportA = buildEvent({ eventId: "support-retired-a", organizationId: "org-1", projectId: "project-1" });
    const supportB = buildEvent({ eventId: "support-retired-b", organizationId: "org-1", projectId: "project-2", occurredAt: "2026-06-06T00:00:00.000Z" });
    const proposal = {
      proposalId: "proposal-retired",
      batchId: "org-1:pricing-pattern-batch:1",
      organizationId: "org-1",
      gateStatus: "accepted" as const,
      proposalKind: "pattern" as const,
      patternFamily: "formula_pattern" as const,
      patternType: "formula_dependency_pattern",
      title: "Observed repeated adjustment",
      summary: "Observed repeated adjustment in similar worksheet rows.",
      retrievalGuidance: null,
      confidence: 0.71,
      proposedStrength: "weak" as const,
      scope: {
        tradePackage: "Partitions",
        pageType: "assumptions",
        worksheetNameHint: "Partition Sheet A",
        itemCategory: "stud_wall_component",
        normalizedUnit: "m2",
        costRole: "quantity_driver",
        sectionType: "inputs",
      },
      patternValue: {
        summary: "Formula includes waste inputs.",
        signals: ["waste", "quantity"],
      },
      supportingEvidenceEventIds: ["support-retired-a", "support-retired-b"],
      contradictoryEvidenceEventIds: [],
      ignoredEvidenceEventIds: [],
      evidenceSummary: {},
      contradictionSummary: {},
      validation: {},
      rejectionReasons: [],
    };

    const created = await worksheetPricingPatternShadowTestUtils.createCandidatesFromAcceptedProposals({
      runId: "run-new",
      proposals: [proposal],
      eventsById: new Map([["support-retired-a", supportA], ["support-retired-b", supportB]]),
    });

    expect(created.insertedCount).toBe(1);
    expect(admin.state.candidates.filter((row) => row.organization_id === "org-1" && row.candidate_signature === signatures.candidateSignature)).toHaveLength(2);
    expect(admin.state.candidates.filter((row) => row.candidate_status !== "retired" && row.candidate_signature === signatures.candidateSignature)).toHaveLength(1);
  });

  it("prevents cross-org candidate matching", async () => {
    const admin = buildIncrementalAdminClient({
      candidates: [{
        id: "candidate-foreign",
        organization_id: "org-2",
        candidate_status: "active",
        pattern_family: "formula_pattern",
        pattern_type: "formula_dependency_pattern",
        current_strength: "weak",
        confidence: 0.72,
        title: "Observed repeated adjustment",
        summary: "Observed repeated adjustment in formula rows.",
        retrieval_guidance: null,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Suspended Ceilings",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        pattern_value: { summary: "Formula includes waste.", signals: ["waste"] },
        support_count: 1,
        contradiction_count: 0,
        ignored_count: 0,
        support_diversity: {},
        contradiction_diversity: null,
      }],
    });
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({ eventId: "event-org1", organizationId: "org-1", metadata: { sessionId: "s1", worksheetName: "Suspended Ceilings" } }),
    ]);
    const generateEditPlan = vi.fn();
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan,
    });

    const { runWorksheetPricingPatternShadowIncremental } = await import("./worksheet-pricing-pattern-shadow");
    await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });

    expect(admin.state.candidateEvidence.filter((row) => row.candidate_id === "candidate-foreign")).toHaveLength(0);
  });

  it("can contradict existing candidates and leave unrelated evidence unchanged", async () => {
    const admin = buildIncrementalAdminClient({
      candidates: [{
        id: "candidate-1",
        organization_id: "org-1",
        candidate_status: "active",
        pattern_family: "formula_pattern",
        pattern_type: "formula_dependency_pattern",
        current_strength: "weak",
        confidence: 0.72,
        title: "Observed repeated adjustment",
        summary: "Observed repeated adjustment in formula rows.",
        retrieval_guidance: null,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Suspended Ceilings",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        pattern_value: { summary: "Spacing formula", signals: ["spacing"] },
        support_count: 2,
        contradiction_count: 0,
        ignored_count: 0,
        support_diversity: {},
        contradiction_diversity: null,
      }],
    });
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({ eventId: "event-contradict", organizationId: "org-1", metadata: { sessionId: "s1", worksheetName: "Suspended Ceilings" } }),
      buildEvent({
        eventId: "event-unrelated",
        organizationId: "org-1",
        metadata: { worksheetName: "Other Sheet", tradePackage: "Partitions", sessionId: "s2" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "assumptions", confidence: 0.8 },
          sectionType: { value: "inputs", confidence: 0.8 },
          itemCategory: { value: "stud_wall", confidence: 0.8 },
          normalizedUnit: { value: "m2", confidence: 0.8 },
          costRole: { value: "quantity_driver", confidence: 0.8 },
        },
      }),
    ]);
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn(),
    });

    const { runWorksheetPricingPatternShadowIncremental } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });

    const candidate = admin.state.candidates.find((row) => row.id === "candidate-1");
    expect(candidate?.contradiction_count).toBe(1);
    expect(admin.state.candidateEvidence.filter((row) => row.source_event_id === "event-unrelated")).toHaveLength(0);
    expect(result.processedEventCount).toBe(2);
  });

  it("retries retry-scheduled processing rows safely and only sends unmatched new evidence to Anthropic", async () => {
    const admin = buildIncrementalAdminClient();
    createAdminSupabaseClient.mockReturnValue(admin);
    const events = [
      buildEvent({ eventId: "matched-event", organizationId: "org-1", projectId: "project-matched", metadata: { worksheetName: "Suspended Ceilings", workbookId: "matched-workbook", sessionId: "s1" } }),
      buildEvent({
        eventId: "unmatched-1",
        organizationId: "org-1",
        projectId: "project-1",
        metadata: { worksheetName: "Partition Sheet A", workbookId: "workbook-a", sheetId: "sheet-a", tradePackage: "Partitions", sessionId: "s2" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "assumptions", confidence: 0.8 },
          sectionType: { value: "inputs", confidence: 0.8 },
          itemCategory: { value: "stud_wall_component", confidence: 0.8 },
          normalizedUnit: { value: "m2", confidence: 0.8 },
          costRole: { value: "quantity_driver", confidence: 0.8 },
        },
        occurredAt: "2026-06-06T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "unmatched-2",
        organizationId: "org-1",
        projectId: "project-2",
        metadata: { worksheetName: "Partition Sheet B", workbookId: "workbook-b", sheetId: "sheet-b", tradePackage: "Partitions", sessionId: "s3" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "assumptions", confidence: 0.8 },
          sectionType: { value: "inputs", confidence: 0.8 },
          itemCategory: { value: "stud_wall_component", confidence: 0.8 },
          normalizedUnit: { value: "m2", confidence: 0.8 },
          costRole: { value: "quantity_driver", confidence: 0.8 },
        },
        occurredAt: "2026-06-07T00:00:00.000Z",
      }),
      buildEvent({
        eventId: "unmatched-3",
        organizationId: "org-1",
        projectId: "project-3",
        metadata: { worksheetName: "Partition Sheet C", workbookId: "workbook-c", sheetId: "sheet-c", tradePackage: "Partitions", sessionId: "s3" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "assumptions", confidence: 0.8 },
          sectionType: { value: "inputs", confidence: 0.8 },
          itemCategory: { value: "stud_wall_component", confidence: 0.8 },
          normalizedUnit: { value: "m2", confidence: 0.8 },
          costRole: { value: "quantity_driver", confidence: 0.8 },
        },
        occurredAt: "2026-06-07T00:01:00.000Z",
      }),
    ];
    listClassifiedWorksheetMemoryEvents.mockResolvedValue(events);
    admin.state.candidates.push({
      id: "candidate-1",
      organization_id: "org-1",
      candidate_status: "active",
      pattern_family: "formula_pattern",
      pattern_type: "formula_dependency_pattern",
      current_strength: "weak",
      confidence: 0.72,
      title: "Observed repeated adjustment",
      summary: "Observed repeated adjustment in formula rows.",
      retrieval_guidance: null,
      scope: {
        tradePackage: "Ceilings",
        pageType: "component_quantities",
        worksheetNameHint: "Suspended Ceilings",
        itemCategory: "ceiling_grid_component",
        normalizedUnit: "lm",
        costRole: "amount_driver",
        sectionType: "components",
      },
      pattern_value: { summary: "Formula includes waste.", signals: ["waste"] },
      support_count: 1,
      contradiction_count: 0,
      ignored_count: 0,
      support_diversity: {},
      contradiction_diversity: null,
    });

    const generateEditPlan = vi.fn()
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "formula_pattern",
        patternType: "formula_dependency_pattern",
        title: "Observed repeated adjustment",
        summary: "Observed repeated adjustment in similar worksheet rows.",
        retrievalGuidance: null,
        confidence: 0.7,
        scope: {
          tradePackage: "Partitions",
          pageType: "assumptions",
          worksheetNameHint: "Partition Sheet A",
          itemCategory: "stud_wall_component",
          normalizedUnit: "m2",
          costRole: "quantity_driver",
          sectionType: "inputs",
        },
        patternValueSummary: "Formula includes waste inputs.",
        patternSignals: ["waste"],
        supportingEvidenceEventIds: ["unmatched-1", "unmatched-2", "unmatched-3"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }]));
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan,
    });

    const { runWorksheetPricingPatternShadowIncremental } = await import("./worksheet-pricing-pattern-shadow");
    await expect(runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 })).rejects.toThrow("provider down");
    expect(admin.state.processingRows.filter((row) => row.processing_status === "retry_scheduled")).toHaveLength(4);
    expect(admin.state.processingRows.every((row) => typeof row.retry_after === "string" && Date.parse(String(row.retry_after)) > Date.now())).toBe(true);
    expect(admin.state.runs).toHaveLength(1);
    expect(admin.state.runs[0]?.failed_event_count ?? admin.state.runs[0]?.fetched_event_count).toBeTruthy();

    const immediateRerun = await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });
    expect(immediateRerun.processedEventCount).toBe(0);
    expect(generateEditPlan).toHaveBeenCalledTimes(1);

    for (const row of admin.state.processingRows) {
      row.retry_after = "2000-01-01T00:00:00.000Z";
    }

    const result = await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });

    expect(result.failedEventCount).toBe(0);
    expect(admin.state.processingRows.filter((row) => row.processing_status === "processed")).toHaveLength(4);
    const prompt = generateEditPlan.mock.calls[1]?.[0]?.userPrompt as string;
    expect(prompt).toContain("unmatched-1");
    expect(prompt).toContain("unmatched-2");
    expect(prompt).not.toContain("matched-event");
    expect(prompt).not.toContain("historical-1");
  });

  it("reclaims expired claims and dead-letters rows after max attempts", async () => {
    const admin = buildIncrementalAdminClient({
      processingRows: [{
        id: "processing-1",
        organization_id: "org-1",
        source_event_id: "event-dead-1",
        classification_record_id: "classification-1",
        classification_version: 1,
        classification_attempt_number: 1,
        processing_status: "claimed",
        processing_run_id: "run-stale",
        attempt_count: 4,
        max_attempts: 5,
        claimed_at: "2026-06-05T00:00:00.000Z",
        claim_expires_at: "2000-01-01T00:00:00.000Z",
        claimed_by: "stale-worker",
        claim_token: "stale-claim",
        retry_after: null,
        created_at: "2026-06-05T00:00:00.000Z",
        updated_at: "2026-06-05T00:00:00.000Z",
      }],
    });
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({
        eventId: "event-dead-1",
        organizationId: "org-1",
        projectId: "project-1",
        metadata: { worksheetName: "Partition Sheet A", workbookId: "workbook-a", sheetId: "sheet-a", tradePackage: "Partitions", sessionId: "s1" },
      }),
      buildEvent({
        eventId: "event-dead-2",
        organizationId: "org-1",
        projectId: "project-2",
        metadata: { worksheetName: "Partition Sheet B", workbookId: "workbook-b", sheetId: "sheet-b", tradePackage: "Partitions", sessionId: "s2" },
        semanticFields: {
          ...buildEvent().semanticFields,
          pageType: { value: "assumptions", confidence: 0.8 },
          sectionType: { value: "inputs", confidence: 0.8 },
          itemCategory: { value: "stud_wall_component", confidence: 0.8 },
          normalizedUnit: { value: "m2", confidence: 0.8 },
          costRole: { value: "quantity_driver", confidence: 0.8 },
        },
        occurredAt: "2026-06-06T00:00:00.000Z",
      }),
    ]);
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockRejectedValue(new Error("still broken")),
    });

    const { runWorksheetPricingPatternShadowIncremental } = await import("./worksheet-pricing-pattern-shadow");
    await expect(runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 })).rejects.toThrow("still broken");

    expect(admin.state.processingRows.find((row) => row.source_event_id === "event-dead-1")).toMatchObject({
      processing_status: "dead_lettered",
      attempt_count: 5,
      claim_token: null,
    });
  });

  it("inserts the run row before processing rows reference it and updates final metrics", async () => {
    const admin = buildIncrementalAdminClient();
    createAdminSupabaseClient.mockReturnValue(admin);
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildEvent({ eventId: "event-1", organizationId: "org-1", metadata: { worksheetName: "Sheet A", sessionId: "s1" } }),
      buildEvent({ eventId: "event-2", organizationId: "org-1", metadata: { worksheetName: "Sheet B", sessionId: "s2" }, occurredAt: "2026-06-06T00:00:00.000Z" }),
      buildEvent({ eventId: "event-3", organizationId: "org-1", metadata: { worksheetName: "Sheet B", sessionId: "s2" }, occurredAt: "2026-06-06T00:01:00.000Z" }),
    ]);
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      generateEditPlan: vi.fn().mockResolvedValue(buildProviderResponse([{
        proposalKind: "pattern",
        patternFamily: "formula_pattern",
        patternType: "formula_dependency_pattern",
        title: "Observed repeated adjustment",
        summary: "Observed repeated adjustment in similar worksheet rows.",
        retrievalGuidance: null,
        confidence: 0.7,
        scope: {
          tradePackage: "Ceilings",
          pageType: "component_quantities",
          worksheetNameHint: "Sheet A",
          itemCategory: "ceiling_grid_component",
          normalizedUnit: "lm",
          costRole: "amount_driver",
          sectionType: "components",
        },
        patternValueSummary: "Formula includes waste inputs.",
        patternSignals: ["waste"],
        supportingEvidenceEventIds: ["event-1", "event-2", "event-3"],
        contradictoryEvidenceEventIds: [],
        contradictionReason: null,
        dominantAlternativePatternType: null,
      }])),
    });

    const { runWorksheetPricingPatternShadowIncremental } = await import("./worksheet-pricing-pattern-shadow");
    const result = await runWorksheetPricingPatternShadowIncremental({ organizationId: "org-1", limit: 10 });

    expect(result.runId).toBeTruthy();
    expect(admin.state.runs).toHaveLength(1);
    expect(admin.state.processingRows.every((row) => row.processing_run_id === result.runId)).toBe(true);
    expect(admin.state.runs[0]?.proposals_returned).toBe(result.proposalsReturned);
    expect(admin.state.runs[0]?.accepted_by_gate_count).toBe(result.acceptedByGate);
    expect(admin.state.runs[0]?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("builds a bounded shadow proposal schema without free-form objects", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const schema = worksheetPricingPatternShadowTestUtils.buildWorksheetPricingPatternProposalSchema();
    const proposalItemProperties = ((((schema.properties as Record<string, unknown>).proposals as Record<string, unknown>).items as Record<string, unknown>).properties as Record<string, unknown>);
    const scopeSchema = proposalItemProperties.scope as Record<string, unknown>;

    expect(proposalItemProperties.patternValue).toBeUndefined();
    expect(proposalItemProperties.patternValueSummary).toBeTruthy();
    expect(proposalItemProperties.patternSignals).toBeTruthy();
    expect(scopeSchema.additionalProperties).toBe(false);
    expect(JSON.stringify(schema)).not.toContain("\"additionalProperties\":true");
  });

  it("builds PatternEventV1 without futureUseSummary, confidenceDetail, or worksheet ids", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const event = worksheetPricingPatternShadowTestUtils.buildCompactWorksheetPricingPatternEvent(buildEvent());
    const json = JSON.stringify(event);

    expect(event).toMatchObject({
      eventId: "event-1",
      eventType: "worksheet_formula_edited",
      context: expect.objectContaining({
        tradePackage: "Ceilings",
        worksheetName: "Suspended Ceilings",
      }),
      anchor: expect.objectContaining({
        itemLabel: "Main Tees",
        rowLabel: "Component Quantities",
      }),
      change: expect.objectContaining({
        formulaChanged: true,
      }),
      patternSignals: expect.objectContaining({
        memoryType: "formula_pattern",
      }),
      quality: expect.objectContaining({
        overallConfidence: 0.84,
      }),
    });
    expect(json).not.toContain("futureUseSummary");
    expect(json).not.toContain("confidenceDetail");
    expect(json).not.toContain("workbookId");
    expect(json).not.toContain("sheetId");
    expect(json).not.toContain("\"sheetName\":");
    expect(json).not.toContain("normalizedTradePackage");
  });

  it("caps PatternEventV1 formula snippets", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const longFormula = `=${"A1+".repeat(40)}A1`;
    const event = worksheetPricingPatternShadowTestUtils.buildCompactWorksheetPricingPatternEvent(buildEvent({
      diffData: {
        ...buildEvent().diffData,
        oldFormula: longFormula,
        newFormula: longFormula,
      },
    }));

    expect((event.change.oldFormulaSnippet ?? "").length).toBeLessThanOrEqual(80);
    expect((event.change.newFormulaSnippet ?? "").length).toBeLessThanOrEqual(80);
  });

  it("PatternEventV1 is materially smaller than the legacy compact event shape", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const source = buildEvent();
    const current = worksheetPricingPatternShadowTestUtils.buildCompactWorksheetPricingPatternEvent(source);
    const legacy = {
      eventId: source.eventId,
      organizationId: source.organizationId,
      eventType: source.eventType,
      occurredAt: source.occurredAt,
      worksheet: {
        workbookId: source.metadata.workbookId,
        sheetId: source.metadata.sheetId,
        sheetName: source.metadata.sheetName,
        worksheetName: source.metadata.worksheetName,
        tradePackage: source.metadata.tradePackage,
      },
      scope: {
        tradePackage: source.metadata.tradePackage,
        pageType: source.semanticFields.pageType?.value ?? null,
        sectionType: source.semanticFields.sectionType?.value ?? null,
        itemCategory: source.semanticFields.itemCategory?.value ?? null,
        normalizedUnit: source.semanticFields.normalizedUnit?.value ?? null,
        normalizedTradePackage: source.semanticFields.normalizedTradePackage?.value ?? null,
        costRole: source.semanticFields.costRole?.value ?? null,
      },
      worksheetDiff: {
        rowLabel: source.diffData.rowLabel,
        itemLabel: source.diffData.itemLabel,
        columnHeader: source.diffData.columnHeader,
        unit: source.diffData.unit,
        oldValue: source.diffData.oldValue,
        newValue: source.diffData.newValue,
        oldFormula: source.diffData.oldFormula,
        newFormula: source.diffData.newFormula,
      },
      interpretation: {
        whatChanged: "Estimator updated a quantity formula to include a waste factor.",
        plainEnglishSummary: "Updated quantity formula to include waste.",
        businessMeaning: "This changes a repeatable pricing formula pattern.",
        pricingMeaning: "Future AI should consider waste-linked quantity formulas in similar rows.",
        futureUse: {
          memoryCandidate: true,
          memoryType: "formula_pattern",
          retrievalGuidance: "Use on similar quantity formulas.",
        },
      },
      futureUseSummary: source.futureUseSummary,
      confidenceDetail: source.confidenceDetail,
      captureQuality: {
        captureCompletenessScore: source.diffData.captureCompletenessScore,
        rowSnapshotCompleteness: source.diffData.rowSnapshotCompleteness,
        missingCriticalContext: false,
      },
    };

    const currentBytes = Buffer.byteLength(JSON.stringify(current), "utf8");
    const legacyBytes = Buffer.byteLength(JSON.stringify(legacy), "utf8");

    expect(currentBytes).toBeLessThan(legacyBytes);
    expect(currentBytes).toBeLessThanOrEqual(900);
  });

  it("builds a 4-event prompt far smaller than 14.9KB", async () => {
    const { worksheetPricingPatternShadowTestUtils } = await import("./worksheet-pricing-pattern-shadow");
    const prompt = worksheetPricingPatternShadowTestUtils.buildWorksheetPricingPatternProposalUserPrompt({
      batchId: "org-1:pricing-pattern-batch:1",
      organizationId: "org-1",
      events: [
        buildEvent({ eventId: "event-1" }),
        buildEvent({ eventId: "event-2", occurredAt: "2026-06-05T00:01:00.000Z" }),
        buildEvent({ eventId: "event-3", occurredAt: "2026-06-05T00:02:00.000Z" }),
        buildEvent({ eventId: "event-4", occurredAt: "2026-06-05T00:03:00.000Z" }),
      ],
    });

    const bytes = Buffer.byteLength(prompt, "utf8");
    expect(bytes).toBeLessThan(9_000);
    expect(prompt).not.toContain("futureUseSummary");
    expect(prompt).not.toContain("confidenceDetail");
    expect(prompt).not.toContain("workbookId");
    expect(prompt).not.toContain("sheetId");
    expect(prompt).not.toContain("\"sheetName\":");
  });
});
