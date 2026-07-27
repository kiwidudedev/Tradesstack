import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

function buildInspectionAdminClient(initial?: {
  candidates?: Array<Record<string, unknown>>;
  candidateEvidence?: Array<Record<string, unknown>>;
  intelligenceEvents?: Array<Record<string, unknown>>;
  classifications?: Array<Record<string, unknown>>;
}) {
  const state = {
    candidates: [...(initial?.candidates ?? [])],
    candidateEvidence: [...(initial?.candidateEvidence ?? [])],
    intelligenceEvents: [...(initial?.intelligenceEvents ?? [])],
    classifications: [...(initial?.classifications ?? [])],
  };

  const applyFilters = (
    rows: Array<Record<string, unknown>>,
    filters: Array<(row: Record<string, unknown>) => boolean>,
  ) => rows.filter((row) => filters.every((filter) => filter(row)));

  const makeBuilder = (rowsRef: () => Array<Record<string, unknown>>) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let orderedField: string | null = null;
    let orderedAscending = true;
    let maxRows: number | null = null;

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
      order(field: string, options?: { ascending?: boolean }) {
        orderedField = field;
        orderedAscending = options?.ascending ?? true;
        return builder;
      },
      limit(value: number) {
        maxRows = value;
        return builder;
      },
      async single() {
        let rows = applyFilters(rowsRef(), filters);
        if (orderedField) {
          rows = [...rows].sort((left, right) => {
            const leftValue = left[orderedField!];
            const rightValue = right[orderedField!];
            const compare = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
            return orderedAscending ? compare : -compare;
          });
        }
        if (maxRows !== null) {
          rows = rows.slice(0, maxRows);
        }
        if (rows.length === 0) {
          return {
            data: null,
            error: { code: "PGRST116", message: "No rows found" },
          };
        }
        return {
          data: rows[0],
          error: null,
        };
      },
      then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
        let rows = applyFilters(rowsRef(), filters);
        if (orderedField) {
          rows = [...rows].sort((left, right) => {
            const leftValue = left[orderedField!];
            const rightValue = right[orderedField!];
            const compare = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
            return orderedAscending ? compare : -compare;
          });
        }
        if (maxRows !== null) {
          rows = rows.slice(0, maxRows);
        }
        return Promise.resolve(resolve({ data: rows, error: null }));
      },
    };

    return builder;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "worksheet_pricing_pattern_shadow_candidates") {
        return {
          select: vi.fn().mockImplementation(() => makeBuilder(() => state.candidates)),
        };
      }
      if (table === "worksheet_pricing_pattern_shadow_candidate_evidence") {
        return {
          select: vi.fn().mockImplementation(() => makeBuilder(() => state.candidateEvidence)),
        };
      }
      if (table === "intelligence_events") {
        return {
          select: vi.fn().mockImplementation(() => makeBuilder(() => state.intelligenceEvents)),
        };
      }
      if (table === "worksheet_event_classifications") {
        return {
          select: vi.fn().mockImplementation(() => makeBuilder(() => state.classifications)),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("worksheet pricing pattern inspection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("lists candidates scoped to organization and filters by status/family/strength", async () => {
    createAdminSupabaseClient.mockReturnValue(buildInspectionAdminClient({
      candidates: [
        {
          id: "candidate-1",
          organization_id: "org-1",
          candidate_status: "active",
          pattern_family: "formula_pattern",
          pattern_type: "formula_dependency_pattern",
          current_strength: "weak",
          confidence: 0.7,
          support_count: 3,
          contradiction_count: 0,
          ignored_count: 0,
          updated_at: "2026-06-05T00:00:00.000Z",
        },
        {
          id: "candidate-2",
          organization_id: "org-1",
          candidate_status: "contested",
          pattern_family: "allowance_pattern",
          pattern_type: "material_waste_factor_adjustment",
          current_strength: "reinforced",
          confidence: 0.8,
          support_count: 5,
          contradiction_count: 1,
          ignored_count: 0,
          updated_at: "2026-06-06T00:00:00.000Z",
        },
        {
          id: "candidate-3",
          organization_id: "org-2",
          candidate_status: "active",
          pattern_family: "formula_pattern",
          pattern_type: "formula_dependency_pattern",
          current_strength: "weak",
          confidence: 0.9,
          support_count: 4,
          contradiction_count: 0,
          ignored_count: 0,
          updated_at: "2026-06-07T00:00:00.000Z",
        },
      ],
    }));

    const { listWorksheetPricingPatternCandidates } = await import("./worksheet-pricing-pattern-inspection");
    const result = await listWorksheetPricingPatternCandidates({
      organizationId: "org-1",
      status: "contested",
      family: "allowance_pattern",
      strength: "reinforced",
    });

    expect(result.organizationId).toBe("org-1");
    expect(result.count).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      id: "candidate-2",
      candidateStatus: "contested",
      patternFamily: "allowance_pattern",
      currentStrength: "reinforced",
    });
  });

  it("returns null for candidate detail when organization does not match", async () => {
    createAdminSupabaseClient.mockReturnValue(buildInspectionAdminClient({
      candidates: [{
        id: "candidate-1",
        organization_id: "org-1",
        candidate_status: "active",
        pattern_family: "formula_pattern",
        current_strength: "weak",
      }],
    }));

    const { getWorksheetPricingPatternCandidateDetail } = await import("./worksheet-pricing-pattern-inspection");
    const result = await getWorksheetPricingPatternCandidateDetail("candidate-1", "org-2");

    expect(result).toBeNull();
  });

  it("returns evidence joined only to same-org events and classifications", async () => {
    createAdminSupabaseClient.mockReturnValue(buildInspectionAdminClient({
      candidates: [{
        id: "candidate-1",
        organization_id: "org-1",
        candidate_status: "active",
        pattern_family: "formula_pattern",
        current_strength: "weak",
        support_diversity: {},
      }],
      candidateEvidence: [
        {
          candidate_id: "candidate-1",
          source_event_id: "event-1",
          evidence_role: "supporting",
          linked_by_run_id: "run-1",
        },
        {
          candidate_id: "candidate-1",
          source_event_id: "event-2",
          evidence_role: "contradictory",
          linked_by_run_id: "run-1",
        },
      ],
      intelligenceEvents: [
        {
          id: "event-1",
          organization_id: "org-1",
          event_type: "worksheet_formula_edited",
          occurred_at: "2026-06-05T00:00:00.000Z",
          project_id: "project-1",
          opportunity_id: "opp-1",
          metadata: { worksheetName: "Sheet A" },
          diff_data: { itemLabel: "Main Tees" },
        },
      ],
      classifications: [
        {
          source_event_id: "event-1",
          organization_id: "org-1",
          classification_status: "classified",
          overall_confidence: 0.7,
          reasoning_summary: "reason",
          semantic_fields: { pageType: { value: "components" } },
          interpretation_payload: { interpretedChange: { plainEnglishSummary: "summary" } },
          classified_at: "2026-06-05T01:00:00.000Z",
        },
        {
          source_event_id: "event-2",
          organization_id: "org-2",
          classification_status: "classified",
          overall_confidence: 0.9,
          reasoning_summary: "foreign",
          semantic_fields: {},
          interpretation_payload: {},
          classified_at: "2026-06-05T01:00:00.000Z",
        },
      ],
    }));

    const { getWorksheetPricingPatternCandidateEvidence } = await import("./worksheet-pricing-pattern-inspection");
    const result = await getWorksheetPricingPatternCandidateEvidence("candidate-1", "org-1");

    expect(result?.evidence).toHaveLength(1);
    expect(result?.evidence[0]).toMatchObject({
      sourceEventId: "event-1",
      evidenceRole: "supporting",
      eventType: "worksheet_formula_edited",
      classification: expect.objectContaining({
        overallConfidence: 0.7,
      }),
    });
  });

  it("returns org-scoped metrics and empty counts for an empty organization", async () => {
    createAdminSupabaseClient.mockReturnValue(buildInspectionAdminClient({
      candidates: [
        {
          id: "candidate-1",
          organization_id: "org-1",
          candidate_status: "active",
          pattern_family: "formula_pattern",
          current_strength: "weak",
          confidence: 0.7,
          support_count: 3,
          contradiction_count: 0,
          ignored_count: 0,
        },
        {
          id: "candidate-2",
          organization_id: "org-1",
          candidate_status: "contested",
          pattern_family: "allowance_pattern",
          current_strength: "reinforced",
          confidence: 0.9,
          support_count: 5,
          contradiction_count: 2,
          ignored_count: 0,
        },
      ],
    }));

    const { getWorksheetPricingPatternCandidateMetrics } = await import("./worksheet-pricing-pattern-inspection");
    const org1 = await getWorksheetPricingPatternCandidateMetrics("org-1");
    const org2 = await getWorksheetPricingPatternCandidateMetrics("org-2");

    expect(org1.candidateStatusCounts.active).toBe(1);
    expect(org1.candidateStatusCounts.contested).toBe(1);
    expect(org1.familyDistribution.formula_pattern).toBe(1);
    expect(org1.strengthDistribution.reinforced).toBe(1);
    expect(org1.highContradictionCount).toBe(1);
    expect(org2.candidateStatusCounts.active).toBe(0);
    expect(org2.familyDistribution).toEqual({});
    expect(org2.averageConfidence).toBeNull();
  });
});
