import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClientMock = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

describe("classification review queue", () => {
  beforeEach(() => {
    createServerSupabaseClientMock.mockReset();
  });

  it("returns broad financial routing review rows instead of taxonomy review rows", async () => {
    const selectedColumnsByTable = new Map<string, string>();
    const costItems = [
      {
        id: "cost-item-1",
        organization_id: "org-1",
        project_id: "project-1",
        source_document_kind: "project_quote",
        title: "Wall framing supply",
        description: "Wall framing supply",
        line_total: 1200,
        tradesstack_cost_code: "100",
        tradesstack_cost_code_label: "Materials",
        financial_routing_confidence: 0.42,
        financial_routing_source: "rules",
        accounting_mapping_id: "mapping-1",
        review_status: "needs_routing_review",
        review_reason: "ambiguous_context",
        original_classification: null,
        final_classification: null,
      },
    ];
    const materials = [
      {
        id: "material-1",
        organization_id: "org-1",
        name: "100 x 50 H1.2 SG8 Timber",
        description: "Structural timber",
        tradesstack_cost_code: "100",
        tradesstack_cost_code_label: "Materials",
        financial_routing_confidence: 0.31,
        financial_routing_source: "material_library",
        accounting_mapping_id: "mapping-1",
        organization_cost_code_id: "org-code-1",
        review_status: "high_value_review",
        review_reason: "high_value_material",
        original_classification: null,
        final_classification: null,
        updated_at: "2026-06-15T00:00:00.000Z",
      },
    ];
    const projects = [{ id: "project-1", name: "Long Bay Apartment" }];
    const costCodes = [{ id: "org-code-1", code: "4200", name: "Materials" }];

    const buildQuery = (table: string) => ({
      select: (columns: string) => {
        selectedColumnsByTable.set(table, columns);
        return ({
        eq: () => {
          if (table === "cost_items") {
            const query = {
              eq: () => query,
              neq: () => query,
              order: () => ({
                limit: async () => ({ data: costItems, error: null }),
              }),
            };
            return query;
          }

          if (table === "organization_materials") {
            const query = {
              eq: () => query,
              order: () => ({
                limit: async () => ({ data: materials, error: null }),
              }),
            };
            return query;
          }

          if (table === "organization_tradesstack_accounting_mappings") {
            return {
              in: async () => ({
                data: [{ id: "mapping-1", organization_cost_code_id: "org-code-1" }],
                error: null,
              }),
            };
          }

          throw new Error(`Unexpected eq chain for ${table}`);
        },
        in: async () => {
          if (table === "organization_projects") {
            return { data: projects, error: null };
          }
          if (table === "organization_cost_codes") {
            return { data: costCodes, error: null };
          }
          return { data: [], error: null };
        },
        });
      },
    });

    createServerSupabaseClientMock.mockResolvedValue({
      from: (table: string) => buildQuery(table),
    });

    const { listClassificationReviewRows } = await import("@/lib/classification-review");
    const rows = await listClassificationReviewRows("org-1");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      entityType: "organization_material",
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      reviewStatus: "high_value_review",
      accountingStatus: "resolved",
    });
    expect(rows[1]).toMatchObject({
      entityType: "cost_item",
      entityId: "cost-item-1",
      projectName: "Long Bay Apartment",
      reviewStatus: "needs_routing_review",
      accountingStatus: "resolved",
      mappedOrganizationCostCodeLabel: "4200 - Materials",
    });
    expect(selectedColumnsByTable.get("cost_items")).not.toContain("organization_cost_code_id");
  });

  it("skips material review rows when new routing columns are not present yet", async () => {
    const costItems = [
      {
        id: "cost-item-1",
        organization_id: "org-1",
        project_id: "project-1",
        source_document_kind: "project_quote",
        title: "Wall framing supply",
        description: "Wall framing supply",
        line_total: 1200,
        tradesstack_cost_code: "100",
        tradesstack_cost_code_label: "Materials",
        financial_routing_confidence: 0.42,
        financial_routing_source: "rules",
        accounting_mapping_id: null,
        organization_cost_code_id: null,
        review_status: "needs_routing_review",
        review_reason: "ambiguous_context",
        original_classification: null,
        final_classification: null,
      },
    ];
    const projects = [{ id: "project-1", name: "Long Bay Apartment" }];

    const buildQuery = (table: string) => ({
      select: () => ({
        eq: () => {
          if (table === "cost_items") {
            const query = {
              eq: () => query,
              neq: () => query,
              order: () => ({
                limit: async () => ({ data: costItems, error: null }),
              }),
            };
            return query;
          }

          if (table === "organization_materials") {
            const query = {
              eq: () => query,
              order: () => ({
                limit: async () => ({
                  data: null,
                  error: { message: "column organization_materials.tradesstack_cost_code does not exist" },
                }),
              }),
            };
            return query;
          }

          throw new Error(`Unexpected eq chain for ${table}`);
        },
        in: async () => {
          if (table === "organization_projects") {
            return { data: projects, error: null };
          }
          return { data: [], error: null };
        },
      }),
    });

    createServerSupabaseClientMock.mockResolvedValue({
      from: (table: string) => buildQuery(table),
    });

    const { listClassificationReviewRows } = await import("@/lib/classification-review");
    const rows = await listClassificationReviewRows("org-1");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityType: "cost_item",
      tradesstackCostCode: "100",
      reviewStatus: "needs_routing_review",
    });
  });
});
