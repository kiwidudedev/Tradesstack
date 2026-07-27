import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin: vi.fn(),
}));

vi.mock("@/lib/worksheet-memory-derivation", () => ({
  runWorksheetMemoryDerivation: vi.fn(),
}));

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

function createState() {
  return {
    writes: [] as string[],
    tables: {
      organization_memory_items: [
        {
          id: "memory-1",
          organization_id: "org-1",
          memory_category: "worksheet_pricing",
          memory_type: "assumption_pattern",
          memory_key: "mem-key-1",
          title: "Perimeter Waste Factor revised to 10%",
          summary: "The organization uses a 10% waste factor.",
          memory_value: { area: "perimeter" },
          evidence_summary: {
            semanticPoolId: "pool-1",
            supportingEvidenceEventIds: ["event-1"],
            includedCount: 3,
            uncertainCount: 1,
            adjacentCount: 1,
            excludedCount: 0,
            supportingEvidenceCount: 1,
            uncertainEvidenceCount: 1,
            adjacentEvidenceCount: 1,
            excludedEvidenceCount: 0,
            synthesisQueueRowId: "queue-1",
            synthesisRunId: "run-1",
          },
          confidence_score: 0.86,
          is_active: true,
          memory_signature: "sig-1",
          memory_domain_signature: "domain-sig-1",
          source_revision_hash: "rev-1",
          retired_at: null,
          retired_lifecycle_history_id: null,
          retired_by_synthesis_history_id: null,
          retirement_basis_hash: null,
          retirement_reason_summary: null,
          superseded_by_memory_id: "memory-3",
          reinforcement_count: 3,
          contradiction_count: 1,
          confidence_calculation_version: 1,
          last_confidence_history_id: "confidence-1",
          last_confidence_calculated_at: "2026-06-18T14:15:00.000Z",
          base_confidence_score: 0.82,
          confidence_reason_summary: "Reinforcement recalculated confidence from 0.82 to 0.86.",
          derived_from_total_count: 4,
          first_derived_at: "2026-06-16T10:42:00.000Z",
          last_derived_at: "2026-06-18T14:15:00.000Z",
          last_reinforced_at: "2026-06-18T14:15:00.000Z",
          last_contradicted_synthesis_history_id: null,
          last_contradicted_lifecycle_history_id: null,
          last_contradicted_source_revision_hash: null,
          contradiction_basis_hash: null,
          contradicted_supporting_classification_count: 0,
          contradiction_strength_score: null,
          last_contradicted_at: null,
          created_at: "2026-06-16T10:42:00.000Z",
          updated_at: "2026-06-18T14:15:00.000Z",
        },
        {
          id: "memory-2",
          organization_id: "org-1",
          memory_category: "worksheet_pricing",
          memory_type: "assumption_pattern",
          memory_key: "mem-key-2",
          title: "Superseded predecessor",
          summary: "Older memory",
          memory_value: {},
          evidence_summary: {},
          confidence_score: 0.72,
          is_active: false,
          memory_signature: "sig-0",
          memory_domain_signature: "domain-sig-1",
          source_revision_hash: "rev-0",
          retired_at: null,
          retired_lifecycle_history_id: null,
          retired_by_synthesis_history_id: null,
          retirement_basis_hash: null,
          retirement_reason_summary: null,
          superseded_at: "2026-06-16T10:40:00.000Z",
          superseded_by_memory_id: "memory-1",
          superseded_lifecycle_history_id: "lifecycle-superseded-1",
          superseded_by_synthesis_history_id: "history-superseded-1",
          supersession_basis_hash: "supersession-basis-1",
          supersession_reason_summary: "Newer scoped evidence replaced the older memory.",
          reinforcement_count: 1,
          contradiction_count: 1,
          confidence_calculation_version: 1,
          last_confidence_history_id: "confidence-older",
          last_confidence_calculated_at: "2026-06-16T10:42:00.000Z",
          base_confidence_score: 0.7,
          confidence_reason_summary: "Older confidence history.",
          derived_from_total_count: 2,
          first_derived_at: "2026-06-15T10:42:00.000Z",
          last_derived_at: "2026-06-16T10:42:00.000Z",
          last_reinforced_at: "2026-06-16T10:42:00.000Z",
          last_contradicted_synthesis_history_id: "synthesis-contradiction-1",
          last_contradicted_lifecycle_history_id: "lifecycle-contradiction-1",
          last_contradicted_source_revision_hash: "rev-contradiction-1",
          contradiction_basis_hash: "contradiction-basis-1",
          contradicted_supporting_classification_count: 2,
          contradiction_strength_score: 0.45,
          last_contradicted_at: "2026-06-18T14:15:00.000Z",
          created_at: "2026-06-15T10:42:00.000Z",
          updated_at: "2026-06-16T10:42:00.000Z",
        },
        {
          id: "memory-3",
          organization_id: "org-1",
          memory_category: "worksheet_pricing",
          memory_type: "assumption_pattern",
          memory_key: "mem-key-3",
          title: "Replacement memory",
          summary: "Newest memory",
          memory_value: {},
          evidence_summary: {},
          confidence_score: 0.9,
          is_active: true,
          memory_signature: "sig-2",
          memory_domain_signature: "domain-sig-1",
          source_revision_hash: "rev-2",
          retired_at: null,
          retired_lifecycle_history_id: null,
          retired_by_synthesis_history_id: null,
          retirement_basis_hash: null,
          retirement_reason_summary: null,
          superseded_by_memory_id: null,
          reinforcement_count: 2,
          contradiction_count: 0,
          confidence_calculation_version: 1,
          last_confidence_history_id: "confidence-newest",
          last_confidence_calculated_at: "2026-06-19T10:42:00.000Z",
          base_confidence_score: 0.88,
          confidence_reason_summary: "Newest confidence history.",
          derived_from_total_count: 2,
          first_derived_at: "2026-06-19T10:42:00.000Z",
          last_derived_at: "2026-06-19T10:42:00.000Z",
          last_reinforced_at: "2026-06-19T10:42:00.000Z",
          last_contradicted_synthesis_history_id: null,
          last_contradicted_lifecycle_history_id: null,
          last_contradicted_source_revision_hash: null,
          contradiction_basis_hash: null,
          contradicted_supporting_classification_count: 0,
          contradiction_strength_score: null,
          last_contradicted_at: null,
          created_at: "2026-06-19T10:42:00.000Z",
          updated_at: "2026-06-19T10:42:00.000Z",
        },
        {
          id: "memory-4",
          organization_id: "org-1",
          memory_category: "worksheet_pricing",
          memory_type: "assumption_pattern",
          memory_key: "mem-key-4",
          title: "Retired supplier memory",
          summary: "Older supplier pattern retired with no replacement.",
          memory_value: {},
          evidence_summary: {},
          confidence_score: 0.22,
          is_active: false,
          memory_signature: "sig-4",
          memory_domain_signature: "domain-sig-retired",
          source_revision_hash: "rev-retired",
          retired_at: "2026-06-20T10:42:00.000Z",
          retired_lifecycle_history_id: "lifecycle-retired-1",
          retired_by_synthesis_history_id: null,
          retirement_basis_hash: "retirement-basis-1",
          retirement_reason_summary: "Memory retired after sustained contradiction and no eligible replacement.",
          superseded_by_memory_id: null,
          reinforcement_count: 0,
          contradiction_count: 2,
          confidence_calculation_version: 1,
          last_confidence_history_id: "confidence-retired",
          last_confidence_calculated_at: "2026-06-20T10:40:00.000Z",
          base_confidence_score: 0.29,
          confidence_reason_summary: "Contradiction reduced confidence before retirement.",
          derived_from_total_count: 3,
          first_derived_at: "2026-06-10T10:42:00.000Z",
          last_derived_at: "2026-06-18T10:42:00.000Z",
          last_reinforced_at: null,
          last_contradicted_synthesis_history_id: null,
          last_contradicted_lifecycle_history_id: "lifecycle-contradiction-retired-1",
          last_contradicted_source_revision_hash: "rev-retired-contradiction",
          contradiction_basis_hash: "contradiction-basis-retired-1",
          contradicted_supporting_classification_count: 2,
          contradiction_strength_score: 0.86,
          last_contradicted_at: "2026-04-01T10:42:00.000Z",
          created_at: "2026-06-10T10:42:00.000Z",
          updated_at: "2026-06-20T10:42:00.000Z",
        },
      ],
      organization_memory_links: [
        {
          id: "link-event-1",
          organization_memory_item_id: "memory-1",
          organization_id: "org-1",
          link_type: "supporting",
          source_event_id: "event-1",
          source_entity_type: null,
          source_entity_id: null,
          note: null,
          created_at: "2026-06-18T14:15:00.000Z",
        },
        {
          id: "link-class-1",
          organization_memory_item_id: "memory-1",
          organization_id: "org-1",
          link_type: "supporting",
          source_event_id: null,
          source_entity_type: "worksheet_event_classification",
          source_entity_id: "classification-1",
          note: "Worksheet classification provenance",
          created_at: "2026-06-18T14:15:00.000Z",
        },
        {
          id: "link-pool-1",
          organization_memory_item_id: "memory-1",
          organization_id: "org-1",
          link_type: "seed",
          source_event_id: null,
          source_entity_type: "worksheet_memory_semantic_pool",
          source_entity_id: "pool-1",
          note: "Semantic pool provenance",
          created_at: "2026-06-18T14:15:00.000Z",
        },
        {
          id: "link-memory-2",
          organization_memory_item_id: "memory-1",
          organization_id: "org-1",
          link_type: "supersession",
          source_event_id: null,
          source_entity_type: "organization_memory_item",
          source_entity_id: "memory-2",
          note: "Supersedes prior memory",
          confidence_delta: -0.2,
          created_at: "2026-06-18T14:15:00.000Z",
        },
        {
          id: "link-missing-event",
          organization_memory_item_id: "memory-1",
          organization_id: "org-1",
          link_type: "supporting",
          source_event_id: "event-missing",
          source_entity_type: null,
          source_entity_id: null,
          note: null,
          created_at: "2026-06-18T14:15:00.000Z",
        },
      ],
      worksheet_memory_semantic_pools: [
        {
          id: "pool-1",
          organization_id: "org-1",
          semantic_signature: "pool-sig-1",
          domain_label: "Perimeter waste factor",
          domain_summary: "Waste factor evidence cluster",
          grouping_rationale: "Same estimator assumption",
          variant_summary: "10% perimeter waste",
          maturity_status: "durable",
          pool_status: "active",
          included_count: 12,
          excluded_count: 0,
          adjacent_count: 1,
          uncertain_count: 0,
          project_count: 5,
          workbook_count: 4,
          worksheet_count: 7,
          average_confidence: 0.84,
          source_revision_hash: "rev-1",
          created_by_run_id: "semantic-run-1",
          last_updated_by_run_id: "semantic-run-2",
          created_at: "2026-06-16T10:11:00.000Z",
          updated_at: "2026-06-18T14:10:00.000Z",
        },
      ],
      intelligence_events: [
        {
          id: "event-1",
          organization_id: "org-1",
          event_type: "worksheet_assumption_changed",
          occurred_at: "2026-06-18T09:00:00.000Z",
          project_id: "project-1",
          opportunity_id: "opp-1",
          metadata: {
            workbookId: "workbook-1",
            sheetId: "sheet-1",
            sheetName: "External Walls",
            worksheetName: "Takeoff - Ext Walls",
          },
          diff_data: {
            rowLabel: "Inputs",
            itemLabel: "Waste Factor",
            columnHeader: "Value",
            oldValue: 0.12,
            newValue: 0.1,
          },
          source_request_id: "request-1",
        },
      ],
      worksheet_event_classifications: [
        {
          id: "classification-1",
          organization_id: "org-1",
          source_event_id: "event-1",
          classification_status: "classified",
          overall_confidence: 0.81,
          reasoning_summary: "Classifier identified a waste factor change.",
          semantic_fields: {
            itemCategory: { value: "waste_factor", confidence: 0.8 },
          },
          interpretation_payload: {
            interpretedChange: {
              plainEnglishSummary: "Waste factor reduced to 10%",
            },
          },
          classified_at: "2026-06-18T09:01:00.000Z",
        },
      ],
      worksheet_memory_synthesis_queue: [
        {
          id: "queue-1",
          organization_id: "org-1",
          semantic_pool_id: "pool-1",
          source_revision_hash: "rev-1",
          queue_state: "completed",
          attempt_count: 1,
          max_attempts: 5,
          priority: 100,
          available_at: "2026-06-18T09:10:00.000Z",
          retry_after: null,
          last_error_code: null,
          last_error_message: null,
          last_attempt_at: "2026-06-18T09:10:00.000Z",
          last_completed_at: "2026-06-18T09:12:00.000Z",
          created_at: "2026-06-18T09:09:00.000Z",
          updated_at: "2026-06-18T09:12:00.000Z",
        },
      ],
      worksheet_memory_synthesis_runs: [
        {
          id: "run-1",
          requested_organization_id: "org-1",
          claimed_job_count: 1,
          completed_job_count: 1,
          retried_job_count: 0,
          dead_lettered_job_count: 0,
          no_memory_count: 0,
          created_memory_count: 1,
          updated_memory_count: 0,
          reused_memory_count: 0,
          reconciled_memory_count: 0,
          deactivated_duplicate_memory_count: 0,
          reinforced_memory_count: 0,
          superseded_memory_count: 0,
          organization_memory_write_count: 1,
          provenance_link_count: 3,
          provider: "anthropic",
          model: "claude-test",
          duration_ms: 1234,
          created_at: "2026-06-18T09:08:00.000Z",
          updated_at: "2026-06-18T09:12:00.000Z",
        },
      ],
      organization_memory_synthesis_history: [
        {
          id: "history-1",
          organization_id: "org-1",
          memory_id: "memory-1",
          source_semantic_pool_id: "pool-1",
          source_revision_hash: "rev-1",
          synthesis_queue_row_id: "queue-1",
          synthesis_run_id: "run-1",
          synthesis_decision: "create_memory",
          persistence_outcome: "created",
          provider: "anthropic",
          model: "claude-test",
          prompt_version: "worksheet-memory-synthesis-v1",
          schema_version: 1,
          decision_schema_version: 1,
          evidence_snapshot: {
            semanticPoolEventIds: ["event-1"],
            classificationRecordIds: ["classification-1"],
            evidenceCounts: {
              includedCount: 3,
              supportingEvidenceCount: 1,
            },
          },
          before_memory_snapshot: null,
          after_memory_snapshot: {
            memoryType: "assumption_pattern",
            sourceRevisionHash: "rev-1",
          },
          duplicate_deactivation_snapshot: {
            duplicateCount: 0,
            duplicateMemoryIds: [],
          },
          reasoning_summary: "Durable perimeter waste factor assumption.",
          created_at: "2026-06-18T09:12:00.000Z",
        },
        {
          id: "history-cross-org",
          organization_id: "org-2",
          memory_id: "memory-x",
          source_semantic_pool_id: "pool-x",
          source_revision_hash: "rev-x",
          synthesis_queue_row_id: "queue-x",
          synthesis_run_id: "run-x",
          synthesis_decision: "no_memory",
          persistence_outcome: "none",
          provider: "anthropic",
          model: "claude-test",
          prompt_version: "worksheet-memory-synthesis-v1",
          schema_version: 1,
          decision_schema_version: 1,
          evidence_snapshot: {},
          before_memory_snapshot: null,
          after_memory_snapshot: null,
          duplicate_deactivation_snapshot: {},
          reasoning_summary: "Other org history",
          created_at: "2026-06-18T09:13:00.000Z",
        },
      ],
      organization_memory_lifecycle_history: [
        {
          id: "lifecycle-1",
          organization_id: "org-1",
          memory_id: "memory-1",
          lifecycle_event_type: "memory_created",
          event_origin_type: "synthesis",
          source_semantic_pool_id: "pool-1",
          source_revision_hash: "rev-1",
          synthesis_history_id: "history-1",
          synthesis_queue_row_id: "queue-1",
          synthesis_run_id: "run-1",
          before_memory_snapshot: null,
          after_memory_snapshot: {
            memoryType: "assumption_pattern",
            sourceRevisionHash: "rev-1",
          },
          reason_summary: "Created from durable perimeter waste factor evidence.",
          schema_version: 1,
          created_at: "2026-06-18T09:12:30.000Z",
        },
        {
          id: "lifecycle-cross-org",
          organization_id: "org-2",
          memory_id: "memory-x",
          lifecycle_event_type: "memory_reused",
          event_origin_type: "synthesis",
          source_semantic_pool_id: "pool-x",
          source_revision_hash: "rev-x",
          synthesis_history_id: "history-cross-org",
          synthesis_queue_row_id: "queue-x",
          synthesis_run_id: "run-x",
          before_memory_snapshot: {},
          after_memory_snapshot: {},
          reason_summary: "Other org lifecycle",
          schema_version: 1,
          created_at: "2026-06-18T09:13:30.000Z",
        },
        {
          id: "lifecycle-retired-1",
          organization_id: "org-1",
          memory_id: "memory-4",
          lifecycle_event_type: "memory_retired",
          event_origin_type: "retirement_evaluator",
          source_semantic_pool_id: null,
          source_revision_hash: null,
          synthesis_history_id: null,
          synthesis_queue_row_id: null,
          synthesis_run_id: null,
          before_memory_snapshot: {
            memoryType: "assumption_pattern",
            confidenceScore: 0.22,
            isActive: true,
          },
          after_memory_snapshot: {
            memoryType: "assumption_pattern",
            confidenceScore: 0.22,
            isActive: false,
            retiredAt: "2026-06-20T10:42:00.000Z",
          },
          lifecycle_metadata: {
            retirementBasisHash: "retirement-basis-1",
            retirementReasonType: "persistent_low_confidence_no_replacement",
            confidenceAtRetirement: 0.22,
            contradictionCount: 2,
            replacementCandidateSearchResult: {
              outcome: "no_eligible_replacement_found",
            },
          },
          reason_summary: "Memory retired after sustained contradiction and no eligible replacement.",
          schema_version: 1,
          created_at: "2026-06-20T10:42:00.000Z",
        },
      ],
      organization_memory_confidence_history: [
        {
          id: "confidence-1",
          organization_id: "org-1",
          memory_id: "memory-1",
          confidence_before: 0.82,
          confidence_after: 0.86,
          confidence_delta: 0.04,
          reason_type: "reinforcement",
          reason_summary: "Reinforcement recalculated confidence from 0.82 to 0.86.",
          calculation_version: 1,
          calculation_inputs: {
            calculationVersion: 1,
            reinforcementCount: 3,
            reinforcedSupportingClassificationCount: 4,
          },
          contributor_snapshot: {
            netNewSupportingClassificationRecordIds: ["classification-1"],
            netNewSupportingEventIds: ["event-1"],
          },
          lifecycle_history_id: "lifecycle-1",
          synthesis_history_id: "history-1",
          source_semantic_pool_id: "pool-1",
          source_revision_hash: "rev-1",
          synthesis_queue_row_id: "queue-1",
          synthesis_run_id: "run-1",
          is_recalculation: true,
          created_at: "2026-06-18T14:15:00.000Z",
        },
        {
          id: "confidence-cross-org",
          organization_id: "org-2",
          memory_id: "memory-x",
          confidence_before: 0.6,
          confidence_after: 0.7,
          confidence_delta: 0.1,
          reason_type: "memory_created",
          reason_summary: "Other org confidence history.",
          calculation_version: 1,
          calculation_inputs: {},
          contributor_snapshot: {},
          lifecycle_history_id: "lifecycle-cross-org",
          synthesis_history_id: "history-cross-org",
          source_semantic_pool_id: "pool-x",
          source_revision_hash: "rev-x",
          synthesis_queue_row_id: "queue-x",
          synthesis_run_id: "run-x",
          is_recalculation: false,
          created_at: "2026-06-18T09:14:00.000Z",
        },
      ],
      organization_memory_retirement_queue: [
        {
          id: "retirement-queue-1",
          organization_id: "org-1",
          memory_id: "memory-4",
          queue_state: "completed",
          attempt_count: 1,
          max_attempts: 5,
          priority: 180,
          available_at: "2026-06-20T10:40:00.000Z",
          retry_after: null,
          claimed_at: "2026-06-20T10:41:00.000Z",
          claim_expires_at: "2026-06-20T10:51:00.000Z",
          claimed_by: "retirement-worker-1",
          claim_token: "claim-1",
          last_error_code: null,
          last_error_message: null,
          last_no_action_reason: null,
          last_attempt_at: "2026-06-20T10:41:00.000Z",
          last_completed_at: "2026-06-20T10:42:00.000Z",
          created_at: "2026-06-20T10:40:00.000Z",
          updated_at: "2026-06-20T10:42:00.000Z",
        },
        {
          id: "retirement-queue-2",
          organization_id: "org-1",
          memory_id: "memory-1",
          queue_state: "completed",
          attempt_count: 1,
          max_attempts: 5,
          priority: 180,
          available_at: "2026-06-19T10:40:00.000Z",
          retry_after: null,
          claimed_at: "2026-06-19T10:41:00.000Z",
          claim_expires_at: "2026-06-19T10:51:00.000Z",
          claimed_by: "retirement-worker-1",
          claim_token: "claim-2",
          last_error_code: null,
          last_error_message: null,
          last_no_action_reason: "replacement_candidate_exists",
          last_attempt_at: "2026-06-19T10:41:00.000Z",
          last_completed_at: "2026-06-19T10:42:00.000Z",
          created_at: "2026-06-19T10:40:00.000Z",
          updated_at: "2026-06-19T10:42:00.000Z",
        },
        {
          id: "retirement-queue-cross-org",
          organization_id: "org-2",
          memory_id: "memory-x",
          queue_state: "completed",
          attempt_count: 1,
          max_attempts: 5,
          priority: 180,
          available_at: "2026-06-20T11:40:00.000Z",
          retry_after: null,
          claimed_at: "2026-06-20T11:41:00.000Z",
          claim_expires_at: "2026-06-20T11:51:00.000Z",
          claimed_by: "retirement-worker-x",
          claim_token: "claim-x",
          last_error_code: null,
          last_error_message: null,
          last_no_action_reason: "not_low_confidence",
          last_attempt_at: "2026-06-20T11:41:00.000Z",
          last_completed_at: "2026-06-20T11:42:00.000Z",
          created_at: "2026-06-20T11:40:00.000Z",
          updated_at: "2026-06-20T11:42:00.000Z",
        },
      ],
    } satisfies Record<string, MockRow[]>,
  };
}

function applyFilters(rows: MockRow[], filters: {
  eqs: Array<{ column: string; value: unknown }>;
  ins: Array<{ column: string; values: unknown[] }>;
  orClause: string | null;
}) {
  let result = [...rows];

  for (const filter of filters.eqs) {
    result = result.filter((row) => row[filter.column] === filter.value);
  }
  for (const filter of filters.ins) {
    result = result.filter((row) => filter.values.includes(row[filter.column]));
  }
  if (filters.orClause) {
    const match = /%([^%]+)%/.exec(filters.orClause);
    const query = match?.[1]?.toLowerCase() ?? "";
    result = result.filter((row) =>
      String(row.title ?? "").toLowerCase().includes(query)
      || String(row.summary ?? "").toLowerCase().includes(query)
    );
  }

  return result;
}

function createQueryBuilder(state: ReturnType<typeof createState>, table: keyof ReturnType<typeof createState>["tables"]) {
  const filters = {
    eqs: [] as Array<{ column: string; value: unknown }>,
    ins: [] as Array<{ column: string; values: unknown[] }>,
    orClause: null as string | null,
  };
  let maybeSingle = false;
  let orderBy: { column: string; ascending: boolean } | null = null;
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;
  let limitCount: number | null = null;
  let selectOptions: Record<string, unknown> | undefined;

  const builder = {
    select: (_columns: string, options?: Record<string, unknown>) => {
      selectOptions = options;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.eqs.push({ column, value });
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.ins.push({ column, values });
      return builder;
    },
    or: (clause: string) => {
      filters.orClause = clause;
      return builder;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      orderBy = { column, ascending: options?.ascending !== false };
      return builder;
    },
    range: (from: number, to: number) => {
      rangeStart = from;
      rangeEnd = to;
      return builder;
    },
    limit: (count: number) => {
      limitCount = count;
      return builder;
    },
    maybeSingle: async () => {
      maybeSingle = true;
      return builder.exec();
    },
    insert: async () => {
      state.writes.push(String(table));
      return { data: null, error: null };
    },
    update: () => {
      state.writes.push(String(table));
      return builder;
    },
    upsert: async () => {
      state.writes.push(String(table));
      return { data: null, error: null };
    },
    delete: async () => {
      state.writes.push(String(table));
      return { data: null, error: null };
    },
    exec: async () => {
      let rows = applyFilters(state.tables[table], filters);

      if (orderBy) {
        rows = rows.sort((left, right) => {
          const leftValue = String(left[orderBy?.column ?? ""] ?? "");
          const rightValue = String(right[orderBy?.column ?? ""] ?? "");
          return orderBy?.ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
        });
      }

      if (rangeStart !== null && rangeEnd !== null) {
        rows = rows.slice(rangeStart, rangeEnd + 1);
      }
      if (limitCount !== null) {
        rows = rows.slice(0, limitCount);
      }

      if (maybeSingle) {
        return { data: rows[0] ?? null, error: null };
      }

      if (selectOptions?.head) {
        return { data: null, error: null, count: applyFilters(state.tables[table], filters).length };
      }

      return { data: rows, error: null, count: applyFilters(state.tables[table], filters).length };
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      builder.exec().then(resolve, reject),
  };

  return builder;
}

function createAdminClient(state: ReturnType<typeof createState>) {
  return {
    from: (table: keyof ReturnType<typeof createState>["tables"]) => createQueryBuilder(state, table),
  };
}

describe("organization memory inspection helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("lists organization memories with pagination, filters, and provenance counts", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemories } = await import("./organization-memory-server");

    const result = await listOrganizationMemories({
      organizationId: "org-1",
      page: 1,
      pageSize: 10,
      query: "waste",
      memoryCategory: "worksheet_pricing",
      memoryType: "assumption_pattern",
      isActive: true,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("memory-1");
    expect(result.items[0]?.provenanceCounts.rawEventLinks).toBe(2);
    expect(result.items[0]?.provenanceCounts.classificationLinks).toBe(1);
    expect(result.items[0]?.provenanceCounts.semanticPoolLinks).toBe(1);
    expect(result.items[0]?.provenanceCounts.supersessionLinks).toBe(1);
  });

  it("resolves semantic pool, event, and classification provenance and flags missing rows", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { getOrganizationMemoryProvenance } = await import("./organization-memory-server");

    const result = await getOrganizationMemoryProvenance("org-1", "memory-1");

    expect(result?.semanticPoolLinks[0]?.semanticPool?.id).toBe("pool-1");
    expect(result?.rawEventLinks[0]?.event?.id).toBe("event-1");
    expect(result?.classificationLinks[0]?.classification?.id).toBe("classification-1");
    expect(result?.completeness.isComplete).toBe(false);
    expect(result?.completeness.missingRawEvents).toContain("event-missing");
  });

  it("returns compact linked raw events and linked classifications", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { getOrganizationMemoryLinkedEvents, getOrganizationMemoryLinkedClassifications } = await import("./organization-memory-server");

    const events = await getOrganizationMemoryLinkedEvents("org-1", "memory-1");
    const classifications = await getOrganizationMemoryLinkedClassifications("org-1", "memory-1");

    expect(events?.events[0]?.sourceRequestId).toBe("request-1");
    expect(events?.events[0]?.workbookId).toBe("workbook-1");
    expect(classifications?.classifications[0]?.classificationRecordId).toBe("classification-1");
    expect(classifications?.classifications[0]?.reasoningSummary).toContain("waste factor");
  });

  it("builds supersession history and exact synthesis queue matches without issuing writes", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { getOrganizationMemoryHistory } = await import("./organization-memory-server");

    const history = await getOrganizationMemoryHistory("org-1", "memory-1");

    expect(history?.supersedes[0]?.id).toBe("memory-2");
    expect(history?.supersededByChain[0]?.id).toBe("memory-3");
    expect(history?.relatedSynthesis.queueRecords[0]?.id).toBe("queue-1");
    expect(history?.relatedSynthesis.exactRunRecords[0]?.id).toBe("run-1");
    expect(history?.relatedSynthesis.immutableHistory[0]?.id).toBe("history-1");
    expect(history?.relatedSynthesis.immutableHistory[0]?.persistenceOutcome).toBe("created");
    expect(history?.relatedLifecycle.immutableHistory[0]?.id).toBe("lifecycle-1");
    expect(history?.relatedLifecycle.immutableHistory[0]?.eventOriginType).toBe("synthesis");
    expect(history?.relatedLifecycle.immutableHistory[0]?.synthesisHistoryId).toBe("history-1");
    expect(history?.relatedConfidence.immutableHistory[0]?.id).toBe("confidence-1");
    expect(history?.relatedConfidence.immutableHistory[0]?.reasonType).toBe("reinforcement");
    expect(history?.relatedRetirement.evaluations[0]).toMatchObject({
      id: "retirement-queue-2",
      evaluationOutcome: "no_action",
      lastNoActionReason: "replacement_candidate_exists",
      replacementCandidate: {
        id: "memory-3",
      },
    });
    expect(state.writes).toEqual([]);
  });

  it("labels exact supersession state as authoritative and legacy supersession timing as inferred", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { getOrganizationMemoryDetail, getOrganizationMemoryHistory } = await import("./organization-memory-server");

    const legacyDetail = await getOrganizationMemoryDetail("org-1", "memory-1");
    const legacyHistory = await getOrganizationMemoryHistory("org-1", "memory-1");
    const exactDetail = await getOrganizationMemoryDetail("org-1", "memory-2");
    const exactHistory = await getOrganizationMemoryHistory("org-1", "memory-2");

    expect(legacyDetail?.fieldNotes.find((note) => note.field === "supersession")).toMatchObject({
      authority: "inferred",
    });
    expect(legacyHistory?.lifecycleMoments.find((moment) => moment.label === "Superseded")).toMatchObject({
      authority: "inferred",
      lifecycleHistoryId: null,
    });
    expect(exactDetail?.fieldNotes.find((note) => note.field === "supersession")).toMatchObject({
      authority: "authoritative",
    });
    expect(exactHistory?.lifecycleMoments.find((moment) => moment.label === "Superseded")).toMatchObject({
      at: "2026-06-16T10:40:00.000Z",
      authority: "authoritative",
      lifecycleHistoryId: "lifecycle-superseded-1",
    });
    expect(exactHistory?.lifecycleMoments.find((moment) => moment.label === "Superseded")?.note).toContain(
      "lifecycle-superseded-1",
    );
  });

  it("keeps retirement fields null-safe and does not label non-retired memories as retired", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { getOrganizationMemoryDetail, getOrganizationMemoryHistory } = await import("./organization-memory-server");

    const detail = await getOrganizationMemoryDetail("org-1", "memory-1");
    const history = await getOrganizationMemoryHistory("org-1", "memory-1");

    expect(detail?.memory.retiredAt ?? null).toBeNull();
    expect(detail?.memory.retiredLifecycleHistoryId ?? null).toBeNull();
    expect(detail?.memory.retiredBySynthesisHistoryId ?? null).toBeNull();
    expect(detail?.memory.retirementBasisHash ?? null).toBeNull();
    expect(detail?.memory.retirementReasonSummary ?? null).toBeNull();
    expect(detail?.fieldNotes.some((note) => note.field === "retirement")).toBe(false);
    expect(history?.lifecycleMoments.find((moment) => moment.label === "Retired")).toMatchObject({
      at: null,
      authority: "authoritative",
    });
  });

  it("labels exact retirement state as authoritative when retirement fields and lifecycle history exist", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { getOrganizationMemoryDetail, getOrganizationMemoryHistory } = await import("./organization-memory-server");

    const detail = await getOrganizationMemoryDetail("org-1", "memory-4");
    const history = await getOrganizationMemoryHistory("org-1", "memory-4");

    expect(detail?.fieldNotes.find((note) => note.field === "retirement")).toMatchObject({
      authority: "authoritative",
    });
    expect(history?.lifecycleMoments.find((moment) => moment.label === "Retired")).toMatchObject({
      at: "2026-06-20T10:42:00.000Z",
      authority: "authoritative",
      lifecycleHistoryId: "lifecycle-retired-1",
    });
    expect(history?.relatedLifecycle.immutableHistory.find((entry) => entry.lifecycleEventType === "memory_retired")).toMatchObject({
      eventOriginType: "retirement_evaluator",
      synthesisHistoryId: null,
      sourceSemanticPoolId: null,
    });
    expect(history?.relatedRetirement.evaluations[0]).toMatchObject({
      id: "retirement-queue-1",
      evaluationOutcome: "retired",
      retiredLifecycleHistoryId: "lifecycle-retired-1",
    });
  });

  it("lists immutable synthesis history with org-scoped filtering for admin inspection", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemorySynthesisHistory } = await import("./organization-memory-server");

    const result = await listOrganizationMemorySynthesisHistory({
      organizationId: "org-1",
      semanticPoolId: "pool-1",
      limit: 10,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("history-1");
    expect(result.records[0]?.sourceSemanticPoolId).toBe("pool-1");
  });

  it("keeps synthesis history listing org-scoped even when foreign filters are supplied", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemorySynthesisHistory } = await import("./organization-memory-server");

    const byMemory = await listOrganizationMemorySynthesisHistory({
      organizationId: "org-1",
      memoryId: "memory-x",
      limit: 10,
    });
    const byPool = await listOrganizationMemorySynthesisHistory({
      organizationId: "org-1",
      semanticPoolId: "pool-x",
      limit: 10,
    });
    const byQueue = await listOrganizationMemorySynthesisHistory({
      organizationId: "org-1",
      queueRowId: "queue-x",
      limit: 10,
    });

    expect(byMemory.records).toEqual([]);
    expect(byPool.records).toEqual([]);
    expect(byQueue.records).toEqual([]);
  });

  it("lists immutable lifecycle history with org-scoped filtering for admin inspection", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemoryLifecycleHistory } = await import("./organization-memory-server");

    const result = await listOrganizationMemoryLifecycleHistory({
      organizationId: "org-1",
      memoryId: "memory-1",
      semanticPoolId: "pool-1",
      queueRowId: "queue-1",
      synthesisHistoryId: "history-1",
      limit: 10,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("lifecycle-1");
    expect(result.records[0]?.lifecycleEventType).toBe("memory_created");
    expect(result.records[0]?.synthesisHistoryId).toBe("history-1");
  });

  it("lists immutable confidence history with org-scoped filtering for admin inspection", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemoryConfidenceHistory } = await import("./organization-memory-server");

    const result = await listOrganizationMemoryConfidenceHistory({
      organizationId: "org-1",
      memoryId: "memory-1",
      semanticPoolId: "pool-1",
      queueRowId: "queue-1",
      lifecycleHistoryId: "lifecycle-1",
      limit: 10,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("confidence-1");
    expect(result.records[0]?.reasonType).toBe("reinforcement");
    expect(result.records[0]?.lifecycleHistoryId).toBe("lifecycle-1");
  });

  it("keeps lifecycle history listing org-scoped even when foreign filters are supplied", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemoryLifecycleHistory } = await import("./organization-memory-server");

    const byMemory = await listOrganizationMemoryLifecycleHistory({
      organizationId: "org-1",
      memoryId: "memory-x",
      limit: 10,
    });
    const byPool = await listOrganizationMemoryLifecycleHistory({
      organizationId: "org-1",
      semanticPoolId: "pool-x",
      limit: 10,
    });
    const byQueue = await listOrganizationMemoryLifecycleHistory({
      organizationId: "org-1",
      queueRowId: "queue-x",
      limit: 10,
    });
    const bySynthesisHistory = await listOrganizationMemoryLifecycleHistory({
      organizationId: "org-1",
      synthesisHistoryId: "history-cross-org",
      limit: 10,
    });

    expect(byMemory.records).toEqual([]);
    expect(byPool.records).toEqual([]);
    expect(byQueue.records).toEqual([]);
    expect(bySynthesisHistory.records).toEqual([]);
  });

  it("keeps confidence history listing org-scoped even when foreign filters are supplied", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemoryConfidenceHistory } = await import("./organization-memory-server");

    const byMemory = await listOrganizationMemoryConfidenceHistory({
      organizationId: "org-1",
      memoryId: "memory-x",
      limit: 10,
    });
    const byPool = await listOrganizationMemoryConfidenceHistory({
      organizationId: "org-1",
      semanticPoolId: "pool-x",
      limit: 10,
    });
    const byQueue = await listOrganizationMemoryConfidenceHistory({
      organizationId: "org-1",
      queueRowId: "queue-x",
      limit: 10,
    });
    const byLifecycle = await listOrganizationMemoryConfidenceHistory({
      organizationId: "org-1",
      lifecycleHistoryId: "lifecycle-cross-org",
      limit: 10,
    });

    expect(byMemory.records).toEqual([]);
    expect(byPool.records).toEqual([]);
    expect(byQueue.records).toEqual([]);
    expect(byLifecycle.records).toEqual([]);
  });

  it("lists retirement evaluation history with org-scoped filtering for admin inspection", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemoryRetirementHistory } = await import("./organization-memory-server");

    const result = await listOrganizationMemoryRetirementHistory({
      organizationId: "org-1",
      memoryId: "memory-1",
      limit: 10,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      id: "retirement-queue-2",
      evaluationOutcome: "no_action",
      lastNoActionReason: "replacement_candidate_exists",
      replacementCandidate: {
        id: "memory-3",
      },
    });
  });

  it("keeps retirement evaluation listing org-scoped even when foreign filters are supplied", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { listOrganizationMemoryRetirementHistory } = await import("./organization-memory-server");

    const byMemory = await listOrganizationMemoryRetirementHistory({
      organizationId: "org-1",
      memoryId: "memory-x",
      limit: 10,
    });

    expect(byMemory.records).toEqual([]);
  });

  it("returns authoritative evidence summary counts from the memory snapshot in detail views", async () => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue(createAdminClient(state));
    const { getOrganizationMemoryDetail, getOrganizationMemoryHistory } = await import("./organization-memory-server");

    const detail = await getOrganizationMemoryDetail("org-1", "memory-1");
    const history = await getOrganizationMemoryHistory("org-1", "memory-1");

    expect(detail?.evidenceSummary).toMatchObject({
      includedCount: 3,
      uncertainCount: 1,
      adjacentCount: 1,
      excludedCount: 0,
      supportingEvidenceCount: 1,
      uncertainEvidenceCount: 1,
      adjacentEvidenceCount: 1,
      excludedEvidenceCount: 0,
      synthesisQueueRowId: "queue-1",
      synthesisRunId: "run-1",
    });
    expect(detail?.fieldNotes.find((note) => note.field === "memory")?.authority).toBe("authoritative");
    expect(history?.relatedSynthesis.immutableHistory[0]?.promptVersion).toBe("worksheet-memory-synthesis-v1");
    expect(history?.fieldNotes.find((note) => note.field === "lifecycleHistory")?.authority).toBe("authoritative");
    expect(detail?.memory.baseConfidenceScore).toBe(0.82);
    expect(detail?.memory.lastContradictedSynthesisHistoryId ?? null).toBeNull();
    expect(detail?.memory.lastContradictedLifecycleHistoryId ?? null).toBeNull();
    expect(detail?.memory.lastContradictedSourceRevisionHash ?? null).toBeNull();
    expect(detail?.memory.contradictionBasisHash ?? null).toBeNull();
    expect(detail?.memory.contradictedSupportingClassificationCount).toBe(0);
    expect(detail?.memory.contradictionStrengthScore ?? null).toBeNull();
    expect(history?.relatedConfidence.immutableHistory[0]?.confidenceAfter).toBe(0.86);
    expect(history?.fieldNotes.find((note) => note.field === "confidenceHistory")?.authority).toBe("authoritative");
  });
});
