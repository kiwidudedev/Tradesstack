import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

describe("ai lifecycle server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("prefers exact sheet memory matches but falls back safely to workbook and opportunity memory", async () => {
    const rows = [
      {
        id: "memory-org",
        memory_category: "worksheet_structure",
        memory_type: "pricing_worksheet_layout",
        title: "Org fallback",
        summary: "Org memory",
        confidence_score: 0.7,
        derived_from_total_count: 3,
        memory_value: {},
        evidence_summary: {},
        updated_at: "2026-05-31T00:00:00Z",
      },
      {
        id: "memory-workbook",
        memory_category: "worksheet_structure",
        memory_type: "pricing_worksheet_layout",
        title: "Workbook match",
        summary: "Workbook memory",
        confidence_score: 0.7,
        derived_from_total_count: 3,
        memory_value: {
          workbookId: "workbook-123",
          opportunityId: "opp-123",
        },
        evidence_summary: {},
        updated_at: "2026-05-31T00:00:00Z",
      },
      {
        id: "memory-sheet",
        memory_category: "worksheet_structure",
        memory_type: "pricing_worksheet_layout",
        title: "Sheet match",
        summary: "Sheet memory",
        confidence_score: 0.7,
        derived_from_total_count: 3,
        memory_value: {
          workbookId: "workbook-123",
          sheetId: "sheet-123",
          opportunityId: "opp-123",
        },
        evidence_summary: {},
        updated_at: "2026-05-31T00:00:00Z",
      },
      {
        id: "memory-other-sheet",
        memory_category: "worksheet_structure",
        memory_type: "pricing_worksheet_layout",
        title: "Other sheet",
        summary: "Other sheet memory",
        confidence_score: 0.9,
        derived_from_total_count: 6,
        memory_value: {
          workbookId: "workbook-123",
          sheetId: "sheet-999",
          opportunityId: "opp-123",
        },
        evidence_summary: {},
        updated_at: "2026-05-31T00:00:00Z",
      },
    ];

    const queryBuilder = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
    };
    queryBuilder.eq.mockReturnValue(queryBuilder);
    queryBuilder.gte.mockReturnValue(queryBuilder);
    queryBuilder.order.mockReturnValue(queryBuilder);
    queryBuilder.in.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockResolvedValue({
      data: rows,
      error: null,
    });

    createAdminSupabaseClient.mockReturnValue({
      from: () => ({
        select: () => queryBuilder,
      }),
    });

    const { buildAiRequestContextSummary, retrieveOrganizationMemoryForAi } = await import("./ai-lifecycle-server");

    const summary = buildAiRequestContextSummary({
      organizationId: "org-123",
      projectId: "project-123",
      opportunityId: "opp-123",
      module: "pricing_worksheets",
      workflowKey: "pricing_worksheet_edit_assistant_job",
      workbookId: "workbook-123",
      worksheetId: "workbook-123",
      sheetId: "sheet-123",
      sheetName: "Page 2",
      worksheetName: "Page 2",
    });

    expect(summary).toMatchObject({
      workbookId: "workbook-123",
      worksheetId: "workbook-123",
      sheetId: "sheet-123",
      sheetName: "Page 2",
    });

    const memory = await retrieveOrganizationMemoryForAi({
      organizationId: "org-123",
      projectId: "project-123",
      opportunityId: "opp-123",
      workbookId: "workbook-123",
      sheetId: "sheet-123",
      memoryCategories: ["worksheet_structure"],
      memoryTypes: ["pricing_worksheet_layout"],
      limit: 4,
    });

    expect(memory.map((item) => item.id)).toEqual([
      "memory-sheet",
      "memory-workbook",
      "memory-other-sheet",
      "memory-org",
    ]);
    expect(memory[0]).toMatchObject({
      workbookId: "workbook-123",
      sheetId: "sheet-123",
    });
  });

  it("boosts construction memories that match trade, system, and product context", async () => {
    const rows = [
      {
        id: "memory-gib",
        memory_category: "construction_decision",
        memory_type: "supplier_preference_pattern",
        title: "PlaceMakers for GIB",
        summary: "Use PlaceMakers for GIB.",
        confidence_score: 0.72,
        derived_from_total_count: 4,
        memory_value: {
          trade: "interiors",
          system: "plasterboard wall",
          product: "13mm gib standard",
          supplier: "placemakers",
        },
        evidence_summary: {},
        updated_at: "2026-06-21T00:00:00Z",
      },
      {
        id: "memory-ceiling",
        memory_category: "construction_decision",
        memory_type: "product_system_pattern",
        title: "Rondo Keylock for ceilings",
        summary: "Use Rondo Keylock for ceilings.",
        confidence_score: 0.83,
        derived_from_total_count: 6,
        memory_value: {
          trade: "ceilings",
          system: "suspended ceiling",
          product: "rondo keylock grid",
          supplier: "placemakers",
        },
        evidence_summary: {},
        updated_at: "2026-06-21T00:00:00Z",
      },
    ];

    const queryBuilder = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
    };
    queryBuilder.eq.mockReturnValue(queryBuilder);
    queryBuilder.gte.mockReturnValue(queryBuilder);
    queryBuilder.order.mockReturnValue(queryBuilder);
    queryBuilder.in.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockResolvedValue({
      data: rows,
      error: null,
    });

    const linkQueryBuilder = {
      eq: vi.fn(),
      in: vi.fn(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { organization_memory_item_id: "memory-gib" },
            { organization_memory_item_id: "memory-ceiling" },
          ],
          error: null,
        }).then(resolve, reject),
    };
    linkQueryBuilder.eq.mockReturnValue(linkQueryBuilder);
    linkQueryBuilder.in.mockReturnValue(linkQueryBuilder);

    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => ({
        select: () => table === "organization_memory_items" ? queryBuilder : linkQueryBuilder,
      }),
    });

    const { retrieveOrganizationMemoryForAi } = await import("./ai-lifecycle-server");
    const memory = await retrieveOrganizationMemoryForAi({
      organizationId: "org-123",
      trade: "interiors",
      system: "plasterboard wall",
      product: "13mm GIB Standard",
      supplier: "PlaceMakers",
      memoryCategories: ["construction_decision"],
      limit: 2,
    });

    expect(memory.map((item) => item.id)).toEqual(["memory-gib", "memory-ceiling"]);
  });

  it("matches construction memories on normalized text instead of exact product strings only", async () => {
    const rows = [
      {
        id: "memory-gib",
        memory_category: "construction_decision",
        memory_type: "supplier_preference_pattern",
        title: "PlaceMakers for GIB",
        summary: "This company commonly buys plasterboard from PlaceMakers.",
        confidence_score: 0.74,
        derived_from_total_count: 4,
        memory_value: {
          trade: "interiors",
          system: "plasterboard wall",
          product: "13mm gib standard",
          productSignature: "13mm_gib_standard_plasterboard_sheet",
          supplier: "placemakers",
        },
        evidence_summary: {},
        updated_at: "2026-06-21T00:00:00Z",
      },
    ];

    const queryBuilder = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
    };
    queryBuilder.eq.mockReturnValue(queryBuilder);
    queryBuilder.gte.mockReturnValue(queryBuilder);
    queryBuilder.order.mockReturnValue(queryBuilder);
    queryBuilder.in.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockResolvedValue({
      data: rows,
      error: null,
    });

    const linkQueryBuilder = {
      eq: vi.fn(),
      in: vi.fn(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { organization_memory_item_id: "memory-gib" },
          ],
          error: null,
        }).then(resolve, reject),
    };
    linkQueryBuilder.eq.mockReturnValue(linkQueryBuilder);
    linkQueryBuilder.in.mockReturnValue(linkQueryBuilder);

    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => ({
        select: () => table === "organization_memory_items" ? queryBuilder : linkQueryBuilder,
      }),
    });

    const { retrieveOrganizationMemoryForAi } = await import("./ai-lifecycle-server");
    const memory = await retrieveOrganizationMemoryForAi({
      organizationId: "org-123",
      product: "13mm GIB Standard plasterboard sheet",
      supplier: "PlaceMakers",
      memoryCategories: ["construction_decision"],
      limit: 2,
    });

    expect(memory.map((item) => item.id)).toEqual(["memory-gib"]);
  });

  it("does not rank supplier-only construction memories above product/system memories for product queries", async () => {
    const rows = [
      {
        id: "memory-supplier-only",
        memory_category: "construction_decision",
        memory_type: "supplier_preference_pattern",
        title: "PlaceMakers Test Supplier",
        summary: "Preferred supplier.",
        confidence_score: 0.92,
        derived_from_total_count: 21,
        memory_value: {
          supplier: "PlaceMakers Test Supplier",
        },
        evidence_summary: {},
        source_memory_pool_type: "construction_memory_semantic_pool",
        source_memory_pool_id: "pool-supplier",
        updated_at: "2026-06-21T00:00:00Z",
      },
      {
        id: "memory-product",
        memory_category: "construction_decision",
        memory_type: "product_system_pattern",
        title: "13mm GIB Standard in plasterboard linings",
        summary: "This company commonly uses 13mm GIB Standard for plasterboard linings.",
        confidence_score: 0.84,
        derived_from_total_count: 8,
        memory_value: {
          trade: "wall linings",
          system: "plasterboard linings",
          product: "13mm GIB Standard",
          productSignature: "13mm_gib_standard_plasterboard_sheet",
        },
        evidence_summary: {},
        source_memory_pool_type: "construction_memory_semantic_pool",
        source_memory_pool_id: "pool-product",
        updated_at: "2026-06-21T00:00:00Z",
      },
    ];

    const queryBuilder = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
    };
    queryBuilder.eq.mockReturnValue(queryBuilder);
    queryBuilder.gte.mockReturnValue(queryBuilder);
    queryBuilder.order.mockReturnValue(queryBuilder);
    queryBuilder.in.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockResolvedValue({
      data: rows,
      error: null,
    });

    const linkQueryBuilder = {
      eq: vi.fn(),
      in: vi.fn(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { organization_memory_item_id: "memory-supplier-only" },
            { organization_memory_item_id: "memory-product" },
          ],
          error: null,
        }).then(resolve, reject),
    };
    linkQueryBuilder.eq.mockReturnValue(linkQueryBuilder);
    linkQueryBuilder.in.mockReturnValue(linkQueryBuilder);

    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => ({
        select: () => table === "organization_memory_items" ? queryBuilder : linkQueryBuilder,
      }),
    });

    const { retrieveOrganizationMemoryForAi } = await import("./ai-lifecycle-server");
    const memory = await retrieveOrganizationMemoryForAi({
      organizationId: "org-123",
      product: "13mm GIB Standard",
      memoryCategories: ["construction_decision"],
      limit: 2,
    });

    expect(memory.map((item) => item.id)).toEqual(["memory-product"]);
  });

  it("skips linkless construction memories during retrieval", async () => {
    const rows = [
      {
        id: "memory-linkless",
        memory_category: "construction_decision",
        memory_type: "product_system_pattern",
        title: "13mm GIB Standard in plasterboard linings",
        summary: "This company commonly uses 13mm GIB Standard for plasterboard linings.",
        confidence_score: 0.9,
        derived_from_total_count: 8,
        memory_value: {
          system: "plasterboard linings",
          product: "13mm GIB Standard",
        },
        evidence_summary: {},
        source_memory_pool_type: "construction_memory_semantic_pool",
        source_memory_pool_id: "pool-product",
        updated_at: "2026-06-21T00:00:00Z",
      },
      {
        id: "memory-linked",
        memory_category: "construction_decision",
        memory_type: "procurement_preference_pattern",
        title: "PlaceMakers procurement preference",
        summary: "This company repeats the same procurement preference.",
        confidence_score: 0.82,
        derived_from_total_count: 8,
        memory_value: {
          supplier: "PlaceMakers Test Supplier",
          product: "13mm GIB Standard",
        },
        evidence_summary: {},
        source_memory_pool_type: "construction_memory_semantic_pool",
        source_memory_pool_id: "pool-procurement",
        updated_at: "2026-06-21T00:00:00Z",
      },
    ];

    const queryBuilder = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
    };
    queryBuilder.eq.mockReturnValue(queryBuilder);
    queryBuilder.gte.mockReturnValue(queryBuilder);
    queryBuilder.order.mockReturnValue(queryBuilder);
    queryBuilder.in.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockResolvedValue({
      data: rows,
      error: null,
    });

    const linkQueryBuilder = {
      eq: vi.fn(),
      in: vi.fn(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { organization_memory_item_id: "memory-linked" },
          ],
          error: null,
        }).then(resolve, reject),
    };
    linkQueryBuilder.eq.mockReturnValue(linkQueryBuilder);
    linkQueryBuilder.in.mockReturnValue(linkQueryBuilder);

    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => ({
        select: () => table === "organization_memory_items" ? queryBuilder : linkQueryBuilder,
      }),
    });

    const { retrieveOrganizationMemoryForAi } = await import("./ai-lifecycle-server");
    const memory = await retrieveOrganizationMemoryForAi({
      organizationId: "org-123",
      product: "13mm GIB Standard",
      memoryCategories: ["construction_decision"],
      limit: 5,
    });

    expect(memory.map((item) => item.id)).toEqual(["memory-linked"]);
  });

  it("does not let generic pricing or project-type memories outrank product/system memories for product-led queries", async () => {
    const rows = [
      {
        id: "memory-project-type",
        memory_category: "construction_decision",
        memory_type: "project_type_pattern",
        title: "Fitout pattern",
        summary: "This company repeats a construction decision pattern for fitout work.",
        confidence_score: 0.9,
        derived_from_total_count: 14,
        memory_value: {
          projectType: "fitout",
        },
        evidence_summary: {},
        updated_at: "2026-06-21T00:00:00Z",
      },
      {
        id: "memory-pricing",
        memory_category: "construction_decision",
        memory_type: "pricing_pattern",
        title: "Plasterboard pricing",
        summary: "This company repeats a pricing pattern for plasterboard work.",
        confidence_score: 0.88,
        derived_from_total_count: 10,
        memory_value: {
          trade: "wall linings",
          system: "plasterboard linings",
        },
        evidence_summary: {},
        updated_at: "2026-06-21T00:00:00Z",
      },
      {
        id: "memory-product-system",
        memory_category: "construction_decision",
        memory_type: "product_system_pattern",
        title: "13mm GIB Standard in plasterboard linings",
        summary: "This company commonly uses 13mm GIB Standard for plasterboard linings.",
        confidence_score: 0.8,
        derived_from_total_count: 8,
        memory_value: {
          trade: "wall linings",
          system: "plasterboard linings",
          product: "13mm GIB Standard",
          productSignature: "13mm_gib_standard_plasterboard_sheet",
        },
        evidence_summary: {},
        updated_at: "2026-06-21T00:00:00Z",
      },
    ];

    const queryBuilder = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
    };
    queryBuilder.eq.mockReturnValue(queryBuilder);
    queryBuilder.gte.mockReturnValue(queryBuilder);
    queryBuilder.order.mockReturnValue(queryBuilder);
    queryBuilder.in.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockResolvedValue({
      data: rows,
      error: null,
    });

    const linkQueryBuilder = {
      eq: vi.fn(),
      in: vi.fn(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: rows.map((row) => ({ organization_memory_item_id: row.id })),
          error: null,
        }).then(resolve, reject),
    };
    linkQueryBuilder.eq.mockReturnValue(linkQueryBuilder);
    linkQueryBuilder.in.mockReturnValue(linkQueryBuilder);

    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => ({
        select: () => table === "organization_memory_items" ? queryBuilder : linkQueryBuilder,
      }),
    });

    const { retrieveOrganizationMemoryForAi } = await import("./ai-lifecycle-server");
    const memory = await retrieveOrganizationMemoryForAi({
      organizationId: "org-123",
      product: "13mm GIB Standard",
      system: "plasterboard linings",
      memoryCategories: ["construction_decision"],
      limit: 3,
    });

    expect(memory.map((item) => item.id)).toEqual([
      "memory-product-system",
      "memory-pricing",
    ]);
  });

  it("drops construction memories that have no matching product, trade, system, or activity dimension for product-led queries", async () => {
    const rows = [
      {
        id: "memory-supplier-only",
        memory_category: "construction_decision",
        memory_type: "procurement_preference_pattern",
        title: "PlaceMakers procurement preference",
        summary: "This company repeats the same procurement preference.",
        confidence_score: 0.92,
        derived_from_total_count: 21,
        memory_value: {
          supplier: "PlaceMakers Test Supplier",
        },
        evidence_summary: {},
        updated_at: "2026-06-21T00:00:00Z",
      },
      {
        id: "memory-project-type",
        memory_category: "construction_decision",
        memory_type: "project_type_pattern",
        title: "Fitout pattern",
        summary: "This company repeats a construction decision pattern for fitout work.",
        confidence_score: 0.92,
        derived_from_total_count: 14,
        memory_value: {
          projectType: "fitout",
        },
        evidence_summary: {},
        updated_at: "2026-06-21T00:00:00Z",
      },
    ];

    const queryBuilder = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
    };
    queryBuilder.eq.mockReturnValue(queryBuilder);
    queryBuilder.gte.mockReturnValue(queryBuilder);
    queryBuilder.order.mockReturnValue(queryBuilder);
    queryBuilder.in.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockResolvedValue({
      data: rows,
      error: null,
    });

    const linkQueryBuilder = {
      eq: vi.fn(),
      in: vi.fn(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: rows.map((row) => ({ organization_memory_item_id: row.id })),
          error: null,
        }).then(resolve, reject),
    };
    linkQueryBuilder.eq.mockReturnValue(linkQueryBuilder);
    linkQueryBuilder.in.mockReturnValue(linkQueryBuilder);

    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => ({
        select: () => table === "organization_memory_items" ? queryBuilder : linkQueryBuilder,
      }),
    });

    const { retrieveOrganizationMemoryForAi } = await import("./ai-lifecycle-server");
    const memory = await retrieveOrganizationMemoryForAi({
      organizationId: "org-123",
      product: "13mm GIB Standard",
      memoryCategories: ["construction_decision"],
      limit: 5,
    });

    expect(memory).toEqual([]);
  });
});
