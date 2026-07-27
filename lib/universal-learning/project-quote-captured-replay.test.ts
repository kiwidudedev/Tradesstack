import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUniversalLearningBoundaryContext } from "@/lib/universal-learning/boundary-guards";
import {
  buildModelVisiblePromptPacket,
  buildUniversalConstructionLearningPrompt,
} from "@/lib/universal-learning/prompt";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

type Row = Record<string, unknown>;
type TableData = Record<string, Row[]>;

function parseScalar(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === "null") {
    return null;
  }
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function applyOrFilter(rows: Row[], expression: string) {
  const match = expression.match(/^([^.,]+)\.gt\.([^,]+),and\(\1\.eq\.([^,]+),id\.gt\.([^)]+)\)$/);
  if (match) {
    const [, column, gtValueRaw, eqValueRaw, idValueRaw] = match;
    const gtValue = parseScalar(gtValueRaw);
    const eqValue = parseScalar(eqValueRaw);
    const idValue = parseScalar(idValueRaw);

    return rows.filter((row) => {
      const columnValue = typeof row[column] === "string" ? row[column] : null;
      const rowId = typeof row.id === "string" ? row.id : null;
      return (
        (columnValue !== null && String(columnValue) > String(gtValue))
        || (columnValue !== null && String(columnValue) === String(eqValue) && rowId !== null && String(rowId) > String(idValue))
      );
    });
  }

  const simpleMatch = expression.match(/^([^.,]+)\.gt\.(.+)$/);
  if (simpleMatch) {
    const [, column, valueRaw] = simpleMatch;
    const value = parseScalar(valueRaw);
    return rows.filter((row) => {
      const columnValue = typeof row[column] === "string" ? row[column] : null;
      return columnValue !== null && String(columnValue) > String(value);
    });
  }

  throw new Error(`Unsupported fake or() expression: ${expression}`);
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  private readonly table: string;
  private readonly data: TableData;
  private filters: Array<(row: Row) => boolean> = [];
  private sorts: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;

  constructor(table: string, data: TableData) {
    this.table = table;
    this.data = data;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push((row) => typeof row[column] === "string" && String(row[column]) >= String(value));
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push((row) => typeof row[column] === "string" && String(row[column]) < String(value));
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  or(expression: string) {
    this.filters.push((row) => applyOrFilter([row], expression).length > 0);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sorts.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private execute() {
    let rows = [...(this.data[this.table] ?? [])];
    for (const filter of this.filters) {
      rows = rows.filter(filter);
    }

    for (let index = this.sorts.length - 1; index >= 0; index -= 1) {
      const sort = this.sorts[index];
      rows.sort((left, right) => {
        const leftValue = left[sort.column];
        const rightValue = right[sort.column];
        const leftComparable = leftValue == null ? "" : String(leftValue);
        const rightComparable = rightValue == null ? "" : String(rightValue);
        const comparison = leftComparable.localeCompare(rightComparable);
        return sort.ascending ? comparison : comparison * -1;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function installFakeAdmin(data: TableData) {
  createAdminSupabaseClient.mockReturnValue({
    from(table: string) {
      return new FakeQuery(table, data);
    },
  });
}

describe("Project quote captured replay", () => {
  beforeEach(() => {
    createAdminSupabaseClient.mockReset();
  });

  it("builds a model-visible quote packet that is estimator-usable without classifier leakage", async () => {
    installFakeAdmin({
      project_quotes: [
        {
          id: "65000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "estimator-1",
          source_opportunity_id: "opportunity-1",
          source_opportunity_quote_id: "opportunity-quote-1",
          source_opportunity_quote_number: "OQ-202",
          quote_number: "Q-AKL-001-7",
          quote_title: "Refurbishment fitout revision 7",
          project_name: "Auckland Office Fitout",
          company_name: "Metro Property Group",
          client_name: "Mia Client",
          contact_person: "Mia Client",
          client_email: "mia@metro.test",
          client_phone: "0210000000",
          site_address: "22 Queen Street, Auckland",
          status: "Accepted",
          quote_date: "2026-06-18",
          expiry_date: "2026-07-18",
          validity_period: "30 days",
          lead_time: "3 weeks from site measure",
          payment_terms: "20th month following",
          scope_notes: "Supply and install partitions, doors, and suspended ceilings.",
          scope_exclusions: "Flooring, painting, and fire alarm changes excluded.",
          assumptions: "Work completed after-hours to suit tenant occupation.",
          clarifications: "Door hardware by others unless noted.",
          acceptance_notes: "Accepted after VE scope clarification.",
          optional_items_notes: "Optional glazed boardroom front priced separately.",
          terms_inclusions: "Labour, materials, supervision, small tools, waste removal.",
          terms_exclusions: "Permits, builder's work in connection, and specialist engineering.",
          subtotal: 28500,
          optional_subtotal: 6200,
          margin_percent: 16,
          margin_amount: 4560,
          contingency_amount: 1250,
          discount_amount: 500,
          gst_percent: 15,
          gst_amount: 5068.5,
          total_quote_price: 38878.5,
          updated_at: "2026-06-20T09:15:00.000Z",
        },
      ],
      project_quote_line_items: [
        {
          id: "65100000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          project_id: "project-1",
          quote_id: "65000000-0000-0000-0000-000000000001",
          section: "Materials",
          description: "Rondo grid ceiling package",
          quantity: 240,
          unit: "m2",
          rate: 52,
          total: 12480,
          is_optional: false,
          sort_order: 1,
          source_opportunity_quote_id: "opportunity-quote-1",
          source_opportunity_quote_line_item_id: "oq-line-1",
          source_opportunity_quote_number: "OQ-202",
          updated_at: "2026-06-20T09:15:00.000Z",
        },
        {
          id: "65100000-0000-0000-0000-000000000002",
          organization_id: "org-1",
          project_id: "project-1",
          quote_id: "65000000-0000-0000-0000-000000000001",
          section: "Labour",
          description: "Install ceilings and partitions",
          quantity: 180,
          unit: "hr",
          rate: 68,
          total: 12240,
          is_optional: false,
          sort_order: 2,
          source_opportunity_quote_id: "opportunity-quote-1",
          source_opportunity_quote_line_item_id: "oq-line-2",
          source_opportunity_quote_number: "OQ-202",
          updated_at: "2026-06-20T09:15:00.000Z",
        },
        {
          id: "65100000-0000-0000-0000-000000000003",
          organization_id: "org-1",
          project_id: "project-1",
          quote_id: "65000000-0000-0000-0000-000000000001",
          section: "Optional",
          description: "Glazed boardroom front",
          quantity: 1,
          unit: "sum",
          rate: 6200,
          total: 6200,
          is_optional: true,
          sort_order: 3,
          source_opportunity_quote_id: "opportunity-quote-1",
          source_opportunity_quote_line_item_id: "oq-line-3",
          source_opportunity_quote_number: "OQ-202",
          updated_at: "2026-06-20T09:15:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Auckland Office Fitout",
          project_code: "AKL-001",
          stage: "preconstruction",
          location: "22 Queen Street, Auckland",
          client_id: "client-1",
          source_opportunity_id: "opportunity-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Metro Property",
          company_name: "Metro Property Group",
          client_type: "commercial",
          client_status: "active",
          default_margin_percent: 15,
          email: "estimating@metro.test",
          phone: "0211111111",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_opportunities: [
        {
          id: "opportunity-1",
          organization_id: "org-1",
          name: "Corporate refurbishment tender",
          opportunity_code: "OP-202",
          stage: "quoted",
          estimated_value: 39500,
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const builderResult = await buildUniversalLearningContainerRecords({
      containerType: "project_quote",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    const prompt = buildUniversalConstructionLearningPrompt({
      reviewMeta: {
        reviewId: "review-quote-1",
        organizationId: "org-1",
        containerType: "project_quote",
        reviewMonth: "2026-06",
        reviewPeriodStart: "2026-06-01T00:00:00.000Z",
        reviewPeriodEnd: "2026-07-01T00:00:00.000Z",
        runType: "monthly",
        previousReviewCursor: { updatedAt: null, id: null },
        nextReviewCursorCandidate: builderResult.nextCursorCandidate,
        reviewIntent: "Monthly estimating review for project quotes. Learn how this company prices work, applies margin and contingency, structures inclusions and exclusions, packages labour and materials, and adapts quotes by client and project context.",
        maxLearnings: 12,
      },
      companyConstructionProfile: {
        rawProfile: "Metro Commercial Interiors\nAuckland\nCommercial interiors and refurbishment contractor",
        normalizedProfile: {
          companyName: "Metro Commercial Interiors",
          primaryRegion: "Auckland",
          workType: "commercial interiors",
          likelyProjectTypes: ["fitout", "refurbishment"],
        },
      },
      existingRelevantMemories: [
        {
          id: "memory-quote-1",
          memoryCategory: "construction_decision",
          memoryType: "project_quote_learning",
          title: "Quotes often separate optional VE items",
          summary: "The company often prices alternatives and options separately during fitout tenders.",
          confidenceScore: 0.72,
          derivedFromTotalCount: 5,
          memoryValue: {},
          evidenceSummary: {},
          updatedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
      reviewScopeContext: builderResult.reviewScopeContext,
      newBusinessActivity: builderResult.records,
      boundaryContext: getUniversalLearningBoundaryContext(),
    });

    const replay = {
      promptPacket: prompt.promptPacket,
      modelVisiblePacket: buildModelVisiblePromptPacket(prompt.promptPacket) as Record<string, unknown>,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
    };

    expect(replay.promptPacket.newBusinessActivity).toHaveLength(1);
    expect((replay.modelVisiblePacket.newBusinessActivity as Array<Record<string, unknown>>)).toHaveLength(1);
    expect(Object.keys((replay.modelVisiblePacket.newBusinessActivity as Array<Record<string, unknown>>)[0] ?? {}).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "routingContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(replay.modelVisiblePacket.newBusinessActivity)).not.toContain("classification_confidence");
    expect(JSON.stringify(replay.modelVisiblePacket.newBusinessActivity)).not.toContain("work_type");
    expect(JSON.stringify(replay.modelVisiblePacket.newBusinessActivity)).not.toContain("cost_type");
    expect(JSON.stringify(replay.modelVisiblePacket.newBusinessActivity)).not.toContain("linkedContext");
    expect(JSON.stringify(replay.modelVisiblePacket.newBusinessActivity)).toContain("Q-AKL-001-7");
    expect(JSON.stringify(replay.modelVisiblePacket.newBusinessActivity)).toContain("Glazed boardroom front");
    expect(JSON.stringify(replay.modelVisiblePacket.newBusinessActivity)).toContain("marginPercent");
    expect(JSON.stringify(replay.modelVisiblePacket.newBusinessActivity)).toContain("termsExclusions");
    expect(replay.promptPacket.newBusinessActivity[0]?.routingContext).toEqual({ readOnly: true });
    expect(replay.userPrompt).toContain("Use one flat learnings array.");
    expect(replay.userPrompt).toContain("project quotes");
    expect(replay.userPrompt).toContain("Monthly estimating review for project quotes");
    expect(replay.userPrompt).toContain("Refurbishment fitout revision 7");
    expect(replay.userPrompt).toContain("Glazed boardroom front");
    expect(replay.userPrompt).toContain("marginPercent");
  });
});
