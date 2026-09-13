import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClientMock = vi.fn();
const getCurrentOrganizationMemberMock = vi.fn();
const getOrganizationProjectBySlugForCurrentUserMock = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: getCurrentOrganizationMemberMock,
  getOrganizationProjectBySlugForCurrentUser: getOrganizationProjectBySlugForCurrentUserMock,
}));

type QueryResult = { data: unknown; error: { message: string } | null };

function createThenableQuery(result: QueryResult) {
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    in: () => query,
    order: () => query,
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };

  return query;
}

describe("project cost report financial routing", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClientMock.mockReset();
    getCurrentOrganizationMemberMock.mockReset();
    getOrganizationProjectBySlugForCurrentUserMock.mockReset();
    getCurrentOrganizationMemberMock.mockResolvedValue({ organization_id: "org-1" });
    getOrganizationProjectBySlugForCurrentUserMock.mockResolvedValue({
      id: "project-1",
      name: "Long Bay Apartment",
    });
  });

  it("builds live report rows from routing and accounting fields without legacy taxonomy", async () => {
    const rowsByTable = new Map<string, QueryResult[]>([
      [
        "project_quotes",
        [
          {
            data: [
              {
                id: "quote-1",
                quote_number: "Q-001",
                status: "Accepted",
                updated_at: "2026-06-21T00:00:00.000Z",
                created_at: "2026-06-20T00:00:00.000Z",
                subtotal: 200,
                margin_percent: 0,
                discount_amount: 0,
                contingency_amount: 0,
              },
            ],
            error: null,
          },
        ],
      ],
      [
        "project_actual_cost_events",
        [
          {
            data: [
              {
                id: "event-1",
                created_at: "2026-06-21T10:00:00.000Z",
                project_id: "project-1",
                event_date: "2026-06-21",
                amount: 150,
                tax_amount: 22.5,
                total_amount: 172.5,
                event_status: "posted",
                event_type: "posting",
                reverses_event_id: null,
                correction_root_event_id: null,
                reversal_reason: null,
                reversal_note: null,
                accounting_mapping_id: "mapping-1",
                organization_cost_code_id: "org-code-1",
                tradesstack_cost_code: "100",
                tradesstack_cost_code_label: "Materials",
                cost_item_id: "cost-item-1",
                source_cost_item_id: null,
                supplier_invoice_id: "invoice-1",
                supplier_id: "supplier-1",
                purchase_order_id: null,
                purchase_order_line_item_id: null,
                source_reference: "INV-001",
                ai_construction_intelligence: { trade: "Wall Linings" },
              },
            ],
            error: null,
          },
        ],
      ],
      [
        "cost_items",
        [
          {
            data: [
              {
                id: "cost-item-1",
                accounting_mapping_id: "mapping-1",
                tradesstack_cost_code: "100",
                tradesstack_cost_code_label: "Materials",
                line_total: 200,
                status: "active",
                is_current: true,
                is_optional: false,
                title: "13mm GIB Standard",
                description: "13mm GIB Standard",
                section: "Wall linings",
                quantity: 10,
                unit: "sheet",
                unit_rate: 20,
                ai_construction_intelligence: { product: "13mm GIB Standard" },
              },
            ],
            error: null,
          },
          { data: [], error: null },
          { data: [], error: null },
        ],
      ],
      ["project_variations", [{ data: [], error: null }]],
      ["project_purchase_orders", [{ data: [], error: null }, { data: [], error: null }]],
      ["project_purchase_order_line_items", [{ data: [], error: null }]],
      ["supplier_invoices", [{ data: [{ id: "invoice-1", invoice_number: "INV-001" }], error: null }]],
      ["organization_suppliers", [{ data: [{ id: "supplier-1", company_name: "GIB Supplies", name: null }], error: null }]],
      [
        "organization_tradesstack_accounting_mappings",
        [{ data: [{ id: "mapping-1", organization_cost_code_id: "org-code-1" }], error: null }],
      ],
      ["organization_cost_codes", [{ data: [{ id: "org-code-1", code: "4200", name: "Materials" }], error: null }]],
    ]);

    createServerSupabaseClientMock.mockResolvedValue({
      from(table: string) {
        const rows = rowsByTable.get(table);
        if (!rows || rows.length === 0) {
          throw new Error(`Unexpected table ${table}`);
        }

        return createThenableQuery(rows.shift()!);
      },
    });

    const { getProjectCostReport } = await import("@/lib/project-cost-report");
    const report = await getProjectCostReport("long-bay-apartment");

    expect(report?.rows).toHaveLength(1);
    expect(report?.rows[0]).toMatchObject({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      accountingMappingId: "mapping-1",
      mappedAccountingCode: "4200",
      mappedAccountingCodeLabel: "Materials",
      estimated: 200,
      actual: 150,
      classificationLabel: "100 Materials / 4200 Materials",
    });
  });

  it("treats legacy fields and ai metadata as fallback only when routing is present", async () => {
    const rowsByTable = new Map<string, QueryResult[]>([
      [
        "project_quotes",
        [
          {
            data: [
              {
                id: "quote-1",
                quote_number: "Q-001",
                status: "Accepted",
                updated_at: "2026-06-21T00:00:00.000Z",
                created_at: "2026-06-20T00:00:00.000Z",
                subtotal: 300,
                margin_percent: 0,
                discount_amount: 0,
                contingency_amount: 0,
              },
            ],
            error: null,
          },
        ],
      ],
      ["project_actual_cost_events", [{ data: [], error: null }]],
      [
        "cost_items",
        [
          {
            data: [
              {
                id: "cost-item-1",
                accounting_mapping_id: "mapping-1",
                tradesstack_cost_code: "100",
                tradesstack_cost_code_label: "Materials",
                line_total: 100,
                status: "active",
                is_current: true,
                is_optional: false,
                title: "Timber pack A",
                description: "Timber pack A",
                section: "Framing",
                quantity: 1,
                unit: "ea",
                unit_rate: 100,
                ai_construction_intelligence: { product: "Timber" },
              },
              {
                id: "cost-item-2",
                accounting_mapping_id: "mapping-1",
                tradesstack_cost_code: "100",
                tradesstack_cost_code_label: "Materials",
                line_total: 200,
                status: "active",
                is_current: true,
                is_optional: false,
                title: "Timber pack B",
                description: "Timber pack B",
                section: "Cladding",
                quantity: 1,
                unit: "ea",
                unit_rate: 200,
                ai_construction_intelligence: { product: "Cladding" },
              },
            ],
            error: null,
          },
          { data: [], error: null },
          { data: [], error: null },
        ],
      ],
      ["project_variations", [{ data: [], error: null }]],
      ["project_purchase_orders", [{ data: [], error: null }, { data: [], error: null }]],
      ["project_purchase_order_line_items", [{ data: [], error: null }]],
      ["supplier_invoices", [{ data: [], error: null }]],
      ["organization_suppliers", [{ data: [], error: null }]],
      [
        "organization_tradesstack_accounting_mappings",
        [{ data: [{ id: "mapping-1", organization_cost_code_id: "org-code-1" }], error: null }],
      ],
      ["organization_cost_codes", [{ data: [{ id: "org-code-1", code: "4200", name: "Materials" }], error: null }]],
    ]);

    createServerSupabaseClientMock.mockResolvedValue({
      from(table: string) {
        const rows = rowsByTable.get(table);
        if (!rows || rows.length === 0) {
          throw new Error(`Unexpected table ${table}`);
        }

        return createThenableQuery(rows.shift()!);
      },
    });

    const { getProjectCostReport } = await import("@/lib/project-cost-report");
    const report = await getProjectCostReport("long-bay-apartment");

    expect(report?.rows).toHaveLength(1);
    expect(report?.rows[0]).toMatchObject({
      tradesstackCostCode: "100",
      mappedAccountingCode: "4200",
      estimated: 300,
      classificationLabel: "100 Materials / 4200 Materials",
    });
  });
});
