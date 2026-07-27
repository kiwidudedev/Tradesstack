import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAdminSupabaseClient = vi.fn();
const classifyLineItem = vi.fn();
const tryEnqueueCostConstructionIntelligenceEvent = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/lib/cost-items/classification/classifyLineItem", () => ({
  classifyLineItem,
}));

vi.mock("@/lib/cost-construction-intelligence", () => ({
  buildCostConstructionIntelligenceIdempotencyKey: vi.fn(() => "cci-key"),
  EMPTY_COST_CONSTRUCTION_INTELLIGENCE: {},
  tryEnqueueCostConstructionIntelligenceEvent,
}));

function createAdminStub() {
  const updatedRows: Array<{ id: string; values: Record<string, unknown> }> = [];
  const rows = [
    {
      id: "cost-item-1",
      organization_id: "org-1",
      project_id: "project-1",
      source_document_kind: "project_quote",
      source_document_id: "quote-1",
      parent_cost_item_id: null,
      title: "13mm GIB Standard",
      description: "13mm GIB Standard plasterboard sheets",
      status: "active",
      is_current: true,
      work_type: null,
      cost_type: null,
      cost_code: null,
      classification_confidence: null,
      needs_review: null,
      classification_source: null,
      tradesstack_cost_code: "100",
      tradesstack_cost_code_label: "Materials",
      accounting_mapping_id: "mapping-1",
      project_type: "Fitout",
      building_type: "Apartment",
      sector: "Commercial",
      location_region: "Auckland",
      item_type: "material",
      category: "Wall Linings",
      section: "Partitions",
      price_source: "quote",
      origin_kind: "worksheet",
      source_line_table: "project_quote_line_items",
      quantity: 24,
      unit: "sheet",
      unit_rate: 22.5,
      line_total: 540,
      updated_at: "2026-06-21T00:00:00.000Z",
      created_at: "2026-06-21T00:00:00.000Z",
      raw_description: null,
      normalized_description: null,
      original_classification: null,
      final_classification: null,
    },
  ];

  return {
    admin: {
      from(table: string) {
        if (table === "organization_cost_codes") {
          return {
            select() {
              return {
                eq() {
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        }

        if (table === "organization_tradesstack_accounting_mappings") {
          return {
            select() {
              return {
                eq() {
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        }

        if (table !== "cost_items") {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return {
                          order() {
                            return Promise.resolve({ data: rows, error: null });
                          },
                        };
                      },
                    };
                  },
                  order() {
                    return {
                      order() {
                        return Promise.resolve({ data: rows, error: null });
                      },
                    };
                  },
                };
              },
              in() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
          update(values: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                if (column !== "id") {
                  throw new Error(`Unexpected filter ${column}`);
                }
                updatedRows.push({ id: value, values });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    },
    updatedRows,
  };
}

describe("cost item construction intelligence enqueue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("emits a routed cost-item snapshot with project, quantity, rate, and accounting context", async () => {
    const adminStub = createAdminStub();
    createAdminSupabaseClient.mockReturnValue(adminStub.admin);
    classifyLineItem.mockReturnValue({
      workType: "Wall Linings",
      divisionName: "Partitions",
      costType: "MAT",
      costCode: "MAT-001",
      codePrefix: "MAT",
      confidence: 0.94,
      matchedKeywords: ["gib", "plasterboard"],
      normalizedDescription: "13mm gib standard plasterboard sheets",
      needsReview: false,
    });

    const { classifyCurrentCostItemsForDocument } = await import("@/lib/cost-items/classification-service");
    const result = await classifyCurrentCostItemsForDocument("project_quote", "quote-1");

    expect(result.classifiedCount).toBe(1);
    expect(adminStub.updatedRows).toHaveLength(1);
    expect(adminStub.updatedRows[0]?.values).toMatchObject({
      tradesstack_cost_code: "100",
      tradesstack_cost_code_label: "Materials",
      financial_routing_source: "rules",
      review_status: "needs_accounting_mapping",
      ai_construction_intelligence: {},
    });
    expect(result.results[0]).toMatchObject({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      reviewStatus: "needs_accounting_mapping",
    });
    expect(tryEnqueueCostConstructionIntelligenceEvent).toHaveBeenCalledTimes(1);
    expect(tryEnqueueCostConstructionIntelligenceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "cost_item",
        sourceId: "cost-item-1",
        organizationId: "org-1",
        projectId: "project-1",
        tradesstackCostCode: "100",
        tradesstackCostCodeLabel: "Materials",
        accountingMappingId: null,
        description: "13mm GIB Standard plasterboard sheets",
        quantity: 24,
        unit: "sheet",
        rate: 22.5,
        amount: 540,
        documentContext: {
          module: "cost_items",
          sourceDocumentKind: "project_quote",
          sourceDocumentId: "quote-1",
          sourceDocumentSubtype: "project_quote_line_items",
          title: "13mm GIB Standard",
          itemType: "material",
          category: "Wall Linings",
          section: "Partitions",
          priceSource: "quote",
          projectType: "Fitout",
          buildingType: "Apartment",
          sector: "Commercial",
          locationRegion: "Auckland",
        },
      }),
    );
  });
});
