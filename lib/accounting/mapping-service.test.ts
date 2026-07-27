import { describe, expect, it } from "vitest";
import { saveOrganizationTradesstackAccountingMapping } from "@/lib/accounting/mapping-service";
import { coerceTradesstackFinancialRoutingCode } from "@/lib/tradesstack-financial-routing";

type ActiveRow = {
  id: string;
  organization_cost_code_id: string;
};

function createMappingSupabaseMock(options?: {
  initialActiveRows?: ActiveRow[];
  duplicateOnFirstInsert?: boolean;
}) {
  const activeRows = [...(options?.initialActiveRows ?? [])];
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  let duplicateOnFirstInsert = options?.duplicateOnFirstInsert ?? false;
  let nextId = activeRows.length + 1;

  const supabase = {
    from(table: "organization_tradesstack_accounting_mappings") {
      expect(table).toBe("organization_tradesstack_accounting_mappings");

      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        is() {
                          return {
                            order() {
                              return {
                                limit: async () => ({
                                  data: activeRows.length > 0 ? [activeRows[0]] : [],
                                  error: null,
                                }),
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          return {
            eq() {
              return {
                eq: async (_column: string, id: string) => {
                  updates.push({ id, values });
                  const row = activeRows.find((candidate) => candidate.id === id);
                  if (row && typeof values.organization_cost_code_id === "string") {
                    row.organization_cost_code_id = values.organization_cost_code_id;
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
        insert(values: Record<string, unknown>) {
          inserts.push(values);

          if (duplicateOnFirstInsert) {
            duplicateOnFirstInsert = false;
            activeRows[0] = {
              id: "mapping-concurrent",
              organization_cost_code_id: "code-existing",
            };
            return Promise.resolve({
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "organization_tradesstack_accounting_mappings_active_scope_uidx"',
              },
            });
          }

          activeRows[0] = {
            id: `mapping-${nextId}`,
            organization_cost_code_id: String(values.organization_cost_code_id),
          };
          nextId += 1;

          return Promise.resolve({
            data: null,
            error: null,
          });
        },
      };
    },
  };

  return {
    supabase,
    activeRows,
    inserts,
    updates,
  };
}

describe("saveOrganizationTradesstackAccountingMapping", () => {
  it("coerces numeric database routing codes back to string routing codes", () => {
    expect(coerceTradesstackFinancialRoutingCode(100)).toBe("100");
    expect(coerceTradesstackFinancialRoutingCode("100")).toBe("100");
    expect(coerceTradesstackFinancialRoutingCode(999)).toBeNull();
  });

  it("updates the same active mapping on repeated saves instead of inserting duplicates", async () => {
    const mock = createMappingSupabaseMock();

    await saveOrganizationTradesstackAccountingMapping({
      supabase: mock.supabase,
      organizationId: "org-1",
      provider: "xero",
      tradesstackCostCode: 100,
      organizationCostCodeId: "code-1",
    });

    const result = await saveOrganizationTradesstackAccountingMapping({
      supabase: mock.supabase,
      organizationId: "org-1",
      provider: "xero",
      tradesstackCostCode: 100,
      organizationCostCodeId: "code-2",
    });

    expect(result.status).toBe("updated");
    expect(mock.inserts).toHaveLength(1);
    expect(mock.updates).toHaveLength(1);
    expect(mock.updates[0]).toMatchObject({
      id: "mapping-1",
      values: {
        organization_cost_code_id: "code-2",
        is_active: true,
      },
    });
    expect(mock.activeRows).toEqual([
      {
        id: "mapping-1",
        organization_cost_code_id: "code-2",
      },
    ]);
  });

  it("recovers from the active-scope unique constraint by updating the winner row", async () => {
    const mock = createMappingSupabaseMock({
      duplicateOnFirstInsert: true,
    });

    const result = await saveOrganizationTradesstackAccountingMapping({
      supabase: mock.supabase,
      organizationId: "org-1",
      provider: "xero",
      tradesstackCostCode: 100,
      organizationCostCodeId: "code-new",
    });

    expect(result.status).toBe("updated");
    expect(mock.inserts).toHaveLength(1);
    expect(mock.updates).toHaveLength(1);
    expect(mock.updates[0]).toMatchObject({
      id: "mapping-concurrent",
      values: {
        organization_cost_code_id: "code-new",
        is_active: true,
      },
    });
    expect(mock.activeRows).toEqual([
      {
        id: "mapping-concurrent",
        organization_cost_code_id: "code-new",
      },
    ]);
  });
});
