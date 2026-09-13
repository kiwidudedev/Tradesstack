import { describe, expect, it } from "vitest";
import {
  resolveAccountingRoute,
  type OrganizationAccountingRouteMappingRow,
} from "@/lib/accounting/accounting-routes";

function mapping(overrides: Partial<OrganizationAccountingRouteMappingRow> = {}): OrganizationAccountingRouteMappingRow {
  return {
    id: "organization-mapping",
    organization_id: "organization-1",
    project_id: null,
    provider: "xero",
    accounting_route: "supplier_bill_expense",
    organization_cost_code_id: "account-a",
    is_active: true,
    created_at: "2026-08-24T00:00:00Z",
    updated_at: "2026-08-24T00:00:00Z",
    ...overrides,
  };
}

describe("named accounting route resolution", () => {
  it("prefers the project mapping over the organization default", () => {
    const result = resolveAccountingRoute({
      mappings: [
        mapping(),
        mapping({ id: "project-mapping", project_id: "project-1", organization_cost_code_id: "account-b" }),
      ],
      organizationId: "organization-1",
      provider: "xero",
      accountingRoute: "supplier_bill_expense",
      projectId: "project-1",
    });

    expect(result).toMatchObject({
      status: "resolved",
      accountingRouteMappingId: "project-mapping",
      organizationCostCodeId: "account-b",
      source: "project",
    });
  });

  it("falls back to the organization mapping but never to a construction code", () => {
    const result = resolveAccountingRoute({
      mappings: [mapping()],
      organizationId: "organization-1",
      provider: "XERO",
      accountingRoute: "supplier_bill_expense",
      projectId: "project-2",
    });

    expect(result.source).toBe("organization");
    expect(result.organizationCostCodeId).toBe("account-a");
    expect(result).not.toHaveProperty("tradesstackCostCode");
  });

  it("returns accounting setup required when the named route is absent", () => {
    expect(resolveAccountingRoute({
      mappings: [],
      organizationId: "organization-1",
      provider: "xero",
      accountingRoute: "payment_claim_revenue",
      projectId: null,
    })).toMatchObject({
      status: "needs_accounting_setup",
      accountingRouteMappingId: null,
      organizationCostCodeId: null,
      source: "missing",
    });
  });

  it("does not cross organization or provider boundaries", () => {
    const result = resolveAccountingRoute({
      mappings: [
        mapping({ organization_id: "organization-2" }),
        mapping({ id: "qbo", provider: "quickbooks" }),
      ],
      organizationId: "organization-1",
      provider: "xero",
      accountingRoute: "supplier_bill_expense",
    });
    expect(result.status).toBe("needs_accounting_setup");
  });

  it.each(["payment_claim_revenue", "retention_receivable"] as const)(
    "applies project precedence to %s",
    (accountingRoute) => {
      const result = resolveAccountingRoute({
        mappings: [
          mapping({ accounting_route: accountingRoute, organization_cost_code_id: "org-account" }),
          mapping({
            id: `${accountingRoute}-project`,
            accounting_route: accountingRoute,
            project_id: "project-1",
            organization_cost_code_id: "project-account",
          }),
        ],
        organizationId: "organization-1",
        provider: "xero",
        accountingRoute,
        projectId: "project-1",
      });

      expect(result).toMatchObject({ source: "project", organizationCostCodeId: "project-account" });
    },
  );
});
