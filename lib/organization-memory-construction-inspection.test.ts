import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));
vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("@/lib/worksheet-memory-derivation", () => ({
  runWorksheetMemoryDerivation: vi.fn(),
}));

type Row = Record<string, unknown>;

function createState() {
  return {
    tables: {
      organization_memory_items: [
        {
          id: "memory-1",
          organization_id: "org-1",
          memory_category: "construction_decision",
          memory_type: "supplier_preference_pattern",
          memory_key: "supplier_preference_pattern:sig-1",
          title: "PlaceMakers for GIB",
          summary: "This company commonly buys GIB from PlaceMakers.",
          memory_value: {
            trade: "interiors",
            system: "plasterboard wall",
            product: "13mm GIB Standard",
            supplier: "PlaceMakers",
          },
          evidence_summary: {
            sourceType: "construction_memory_semantic_pool",
            semanticPoolId: "pool-1",
            synthesisQueueRowId: "queue-1",
            synthesisRunId: "run-1",
          },
          confidence_score: 0.84,
          is_active: true,
          memory_signature: "sig-1",
          memory_domain_signature: "domain-1",
          source_revision_hash: "rev-1",
          source_memory_pool_type: "construction_memory_semantic_pool",
          source_memory_pool_id: "pool-1",
          superseded_by_memory_id: null,
          reinforcement_count: 2,
          contradiction_count: 0,
          derived_from_total_count: 2,
          first_derived_at: "2026-06-21T00:00:00.000Z",
          last_derived_at: "2026-06-21T00:00:00.000Z",
          last_reinforced_at: "2026-06-21T00:00:00.000Z",
          created_at: "2026-06-21T00:00:00.000Z",
          updated_at: "2026-06-21T00:00:00.000Z",
        },
      ],
      organization_memory_links: [
        {
          id: "link-pool-1",
          organization_memory_item_id: "memory-1",
          organization_id: "org-1",
          link_type: "seed",
          source_entity_type: "construction_memory_semantic_pool",
          source_entity_id: "pool-1",
          source_event_id: null,
          created_at: "2026-06-21T00:00:00.000Z",
        },
        {
          id: "link-event-1",
          organization_memory_item_id: "memory-1",
          organization_id: "org-1",
          link_type: "supporting",
          source_entity_type: "cost_construction_intelligence_event",
          source_entity_id: "event-1",
          source_event_id: null,
          created_at: "2026-06-21T00:00:00.000Z",
        },
        {
          id: "link-evidence-1",
          organization_memory_item_id: "memory-1",
          organization_id: "org-1",
          link_type: "supporting",
          source_entity_type: "construction_memory_evidence_pool",
          source_entity_id: "evidence-pool-1",
          source_event_id: null,
          created_at: "2026-06-21T00:00:00.000Z",
        },
      ],
      construction_memory_evidence_pools: [
        {
          id: "evidence-pool-1",
          organization_id: "org-1",
          pool_signature: "pool-signature-1",
          pool_kind: "supplier_preference",
          maturity_status: "durable",
          event_count: 2,
          project_count: 2,
          supplier_count: 1,
          average_confidence: 0.84,
          target_context: {
            supplier: "PlaceMakers",
            product: "13mm GIB Standard",
          },
          last_seen_at: "2026-06-21T00:00:00.000Z",
        },
      ],
      construction_memory_semantic_pools: [
        {
          id: "pool-1",
          organization_id: "org-1",
          semantic_signature: "semantic-1",
          title: "13mm GIB Standard from PlaceMakers",
          summary: "Repeated supplier choice.",
          retrieval_guidance: "Use for interior plasterboard wall work.",
          semantic_type: "supplier_preference",
          maturity_status: "durable",
          pool_status: "active",
          support_count: 2,
          contradiction_count: 0,
          ignored_count: 0,
          project_count: 2,
          average_confidence: 0.84,
          source_revision_hash: "rev-1",
          created_by_run_id: "semantic-run-1",
          last_updated_by_run_id: "semantic-run-1",
          created_at: "2026-06-21T00:00:00.000Z",
          updated_at: "2026-06-21T00:00:00.000Z",
        },
      ],
      cost_construction_intelligence_events: [
        {
          id: "event-1",
          organization_id: "org-1",
          description: "13mm GIB Standard",
          project_id: "project-1",
          supplier_name_snapshot: "PlaceMakers",
          quantity: 100,
          unit: "m2",
          rate: 24,
          amount: 2400,
          document_context: { projectType: "apartment" },
          processed_at: "2026-06-21T00:00:00.000Z",
          created_at: "2026-06-21T00:00:00.000Z",
        },
      ],
      construction_memory_synthesis_queue: [
        {
          id: "queue-1",
          organization_id: "org-1",
          semantic_pool_id: "pool-1",
          source_revision_hash: "rev-1",
          created_at: "2026-06-21T00:00:00.000Z",
        },
      ],
      construction_memory_synthesis_runs: [
        {
          id: "run-1",
          requested_organization_id: "org-1",
          created_at: "2026-06-21T00:00:00.000Z",
          updated_at: "2026-06-21T00:00:00.000Z",
        },
      ],
      organization_memory_synthesis_history: [],
      organization_memory_lifecycle_history: [],
      organization_memory_confidence_history: [],
      organization_memory_retirement_queue: [],
      worksheet_memory_semantic_pools: [],
      intelligence_events: [],
      worksheet_event_classifications: [],
      worksheet_memory_synthesis_queue: [],
      worksheet_memory_synthesis_runs: [],
    } satisfies Record<string, Row[]>,
  };
}

function createQueryBuilder(state: ReturnType<typeof createState>, table: keyof ReturnType<typeof createState>["tables"]) {
  const filters: Array<(row: Row) => boolean> = [];
  let limitCount: number | null = null;

  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    order: () => builder,
    range: () => builder,
    limit: (count: number) => {
      limitCount = count;
      return builder;
    },
    maybeSingle: async () => {
      const rows = state.tables[table].filter((row) => filters.every((filter) => filter(row)));
      return { data: rows[0] ?? null, error: null };
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = state.tables[table].filter((row) => filters.every((filter) => filter(row)));
      return Promise.resolve({
        data: limitCount === null ? rows : rows.slice(0, limitCount),
        error: null,
        count: rows.length,
      }).then(resolve, reject);
    },
  };

  return builder;
}

describe("organization memory construction inspection", () => {
  beforeEach(() => {
    const state = createState();
    createAdminSupabaseClient.mockReturnValue({
      from: (table: keyof typeof state.tables) => createQueryBuilder(state, table),
      rpc: vi.fn(),
    });
  });

  it("surfaces construction provenance and inspection details through the shared APIs", async () => {
    const {
      getOrganizationMemoryDetail,
      getOrganizationMemoryLinkedEvents,
      getOrganizationMemoryProvenance,
    } = await import("./organization-memory-server");

    const linkedEvents = await getOrganizationMemoryLinkedEvents("org-1", "memory-1");
    expect(linkedEvents?.events[0]?.eventType).toBe("cost_construction_intelligence_event");
    expect(linkedEvents?.events[0]?.diffData).toMatchObject({
      description: "13mm GIB Standard",
      rate: 24,
    });

    const detail = await getOrganizationMemoryDetail("org-1", "memory-1");
    expect(detail?.semanticPoolSummary?.domainLabel).toContain("GIB");
    expect(detail?.memory.memoryCategory).toBe("construction_decision");

    const provenance = await getOrganizationMemoryProvenance("org-1", "memory-1");
    expect(provenance?.summary.evidencePoolCount).toBe(1);
    expect(provenance?.evidencePoolLinks[0]?.evidencePool?.poolKind).toBe("supplier_preference");
  });

  it("derives construction provenance from semantic pool lineage when direct links are missing", async () => {
    const state = createState();
    state.tables.organization_memory_links = [
      {
        id: "link-pool-1",
        organization_memory_item_id: "memory-1",
        organization_id: "org-1",
        link_type: "seed",
        source_entity_type: "construction_memory_semantic_pool",
        source_entity_id: "pool-1",
        source_event_id: null,
        created_at: "2026-06-21T00:00:00.000Z",
      },
    ];
    state.tables.construction_memory_evidence_pools[0] = {
      ...state.tables.construction_memory_evidence_pools[0],
      id: "11111111-1111-4111-8111-111111111111",
    };
    state.tables.construction_memory_semantic_pools[0] = {
      ...state.tables.construction_memory_semantic_pools[0],
      evidence_summary: {
        evidencePoolIds: ["11111111-1111-4111-8111-111111111111"],
        supportingEventIds: ["event-1"],
      },
    };

    createAdminSupabaseClient.mockReturnValue({
      from: (table: keyof typeof state.tables) => createQueryBuilder(state, table),
      rpc: vi.fn(),
    });

    const { getOrganizationMemoryProvenance } = await import("./organization-memory-server");
    const provenance = await getOrganizationMemoryProvenance("org-1", "memory-1");

    expect(provenance?.summary.semanticPoolCount).toBe(1);
    expect(provenance?.summary.evidencePoolCount).toBe(1);
    expect(provenance?.summary.rawEventCount).toBe(1);
    expect(provenance?.evidencePoolLinks[0]?.missing).toBe(false);
    expect(provenance?.rawEventLinks[0]?.event?.eventType).toBe("cost_construction_intelligence_event");
  });
});
