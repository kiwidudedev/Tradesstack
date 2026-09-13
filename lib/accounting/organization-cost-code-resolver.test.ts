import { describe, expect, it } from "vitest";
import { resolveOrganizationAccountingCode } from "@/lib/accounting/organization-cost-code-resolver";
import type { OrganizationCostCodeRow, OrganizationTradesstackAccountingMappingRow } from "@/lib/accounting/types";
import { coerceTradesstackFinancialRoutingCode } from "@/lib/tradesstack-financial-routing";

function costCode(params: { id: string; organizationId: string; provider: string }): OrganizationCostCodeRow {
  return {
    id: params.id,
    organization_id: params.organizationId,
    code: params.id,
    name: params.id,
    external_code: params.id,
    external_provider: params.provider,
    description: null,
    created_at: "2026-06-21T00:00:00.000Z",
    created_by: null,
    is_active: true,
    is_default: false,
    metadata: {},
    sort_order: 1,
    updated_at: "2026-06-21T00:00:00.000Z",
  };
}

function mapping(params: {
  id: string;
  organizationId: string;
  provider: string;
  codeId: string;
  routingCode: number;
  projectId?: string | null;
}): OrganizationTradesstackAccountingMappingRow {
  return {
    id: params.id,
    organization_id: params.organizationId,
    provider: params.provider,
    tradesstack_cost_code: params.routingCode,
    organization_cost_code_id: params.codeId,
    project_id: params.projectId ?? null,
    is_active: true,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    created_by_user_id: null,
  };
}

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
          tradesstack_cost_code: 100,
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

  it.each([100, 200, 300, 400, 500, 600, 700, 800])(
    "resolves canonical routing code %s generically",
    (routingCode) => {
      const code = costCode({ id: `code-${routingCode}`, organizationId: "org-1", provider: "xero" });
      const resolution = resolveOrganizationAccountingCode({
        costCodes: [code],
        mappings: [
          mapping({
            id: `mapping-${routingCode}`,
            organizationId: "org-1",
            provider: "xero",
            codeId: code.id,
            routingCode,
          }),
        ],
        input: {
          organizationId: "org-1",
          provider: "xero",
          tradesstackCostCode: coerceTradesstackFinancialRoutingCode(routingCode),
        },
      });

      expect(resolution.status).toBe("resolved");
      expect(resolution.accountingMappingId).toBe(`mapping-${routingCode}`);
    }
  );

  it("isolates organization and provider mappings", () => {
    const orgACode = costCode({ id: "code-a", organizationId: "org-a", provider: "xero" });
    const orgBCode = costCode({ id: "code-b", organizationId: "org-b", provider: "xero" });
    const manualCode = costCode({ id: "code-manual", organizationId: "org-a", provider: "manual" });
    const resolution = resolveOrganizationAccountingCode({
      costCodes: [orgACode, orgBCode, manualCode],
      mappings: [
        mapping({ id: "mapping-b", organizationId: "org-b", provider: "xero", codeId: orgBCode.id, routingCode: 100 }),
        mapping({ id: "mapping-manual", organizationId: "org-a", provider: "manual", codeId: manualCode.id, routingCode: 100 }),
      ],
      input: { organizationId: "org-a", provider: "xero", tradesstackCostCode: "100" },
    });

    expect(resolution.status).toBe("needs_accounting_mapping");
  });

  it("prefers an exact project mapping over the organization default", () => {
    const defaultCode = costCode({ id: "code-default", organizationId: "org-1", provider: "xero" });
    const projectCode = costCode({ id: "code-project", organizationId: "org-1", provider: "xero" });
    const resolution = resolveOrganizationAccountingCode({
      costCodes: [defaultCode, projectCode],
      mappings: [
        mapping({ id: "mapping-default", organizationId: "org-1", provider: "xero", codeId: defaultCode.id, routingCode: 100 }),
        mapping({ id: "mapping-project", organizationId: "org-1", provider: "xero", codeId: projectCode.id, routingCode: 100, projectId: "project-1" }),
      ],
      input: { organizationId: "org-1", provider: "xero", tradesstackCostCode: "100", projectId: "project-1" },
    });

    expect(resolution.accountingMappingId).toBe("mapping-project");
    expect(resolution.organizationCostCodeId).toBe("code-project");
  });
});
