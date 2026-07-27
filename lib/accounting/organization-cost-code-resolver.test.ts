import { describe, expect, it } from "vitest";
import { resolveOrganizationAccountingCode } from "@/lib/accounting/organization-cost-code-resolver";

describe("organization cost code resolver", () => {
  it("returns needs_accounting_mapping when a TradesStack code is unmapped", () => {
    const resolution = resolveOrganizationAccountingCode({
      costCodes: [],
      mappings: [],
      input: {
        organizationId: "org-1",
        provider: "xero",
        tradesstackCostCode: "100",
      },
    });

    expect(resolution.status).toBe("needs_accounting_mapping");
    expect(resolution.reason).toBe("missing_accounting_mapping");
  });

  it("resolves the mapped external accounting code from the TradesStack routing code", () => {
    const resolution = resolveOrganizationAccountingCode({
      costCodes: [
        {
          id: "code-1",
          organization_id: "org-1",
          code: "4200",
          name: "Materials",
          external_code: "4200",
          external_provider: "xero",
          description: null,
          created_at: "2026-06-21T00:00:00.000Z",
          created_by: null,
          is_active: true,
          is_default: false,
          metadata: {},
          sort_order: 1,
          updated_at: "2026-06-21T00:00:00.000Z",
        },
      ],
      mappings: [
        {
          id: "mapping-1",
          organization_id: "org-1",
          provider: "xero",
          tradesstack_cost_code: "100",
          organization_cost_code_id: "code-1",
          project_id: null,
          is_active: true,
          created_at: "2026-06-21T00:00:00.000Z",
          updated_at: "2026-06-21T00:00:00.000Z",
          created_by_user_id: null,
        },
      ],
      input: {
        organizationId: "org-1",
        provider: "xero",
        tradesstackCostCode: "100",
      },
    });

    expect(resolution.status).toBe("resolved");
    expect(resolution.organizationCostCodeId).toBe("code-1");
    expect(resolution.accountingMappingId).toBe("mapping-1");
    expect(resolution.externalCode).toBe("4200");
  });
});
