import { describe, expect, it } from "vitest";
import { resolveAccountingRoute, type OrganizationAccountingRouteMappingRow } from "@/lib/accounting/accounting-routes";
import { buildProjectActualCostEventPayload } from "@/lib/actual-cost-events";
import { classifyMaterial } from "@/lib/materials/classification";
import { createUnmatchedSupplierInvoiceLineAllocationDraft } from "@/lib/supplier-invoice-allocations";

const routeMapping: OrganizationAccountingRouteMappingRow = {
  id: "supplier-route-project",
  organization_id: "org-1",
  project_id: "project-1",
  provider: "xero",
  accounting_route: "supplier_bill_expense",
  organization_cost_code_id: "xero-expense-account",
  is_active: true,
  created_at: "2026-08-24T00:00:00Z",
  updated_at: "2026-08-24T00:00:00Z",
};

describe("new-generation construction-route retirement", () => {
  it("keeps material and no-PO actual lineage factual while accounting uses a named route", () => {
    const material = classifyMaterial({ name: "Structural timber", description: "90x45 H1.2" });
    expect(material.financialRouting).toMatchObject({
      tradesstackCostCode: null,
      tradesstackCostCodeLabel: null,
      reviewStatus: null,
    });

    const accounting = resolveAccountingRoute({
      mappings: [routeMapping],
      organizationId: "org-1",
      provider: "xero",
      accountingRoute: "supplier_bill_expense",
      projectId: "project-1",
    });
    expect(accounting).toMatchObject({
      status: "resolved",
      accountingRouteMappingId: "supplier-route-project",
      organizationCostCodeId: "xero-expense-account",
    });

    const allocation = createUnmatchedSupplierInvoiceLineAllocationDraft({
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
      supplierInvoiceLineId: "invoice-line-1",
      projectId: "project-1",
      allocatedAmount: 100,
      allocatedQuantity: 1,
      organizationCostCodeId: accounting.organizationCostCodeId,
      accountingRouteMappingId: accounting.accountingRouteMappingId,
      taxResolution: { accountingTaxRateId: "tax-1", taxResolutionStatus: "resolved" },
    });
    expect(allocation).toMatchObject({
      purchase_order_id: null,
      tradesstack_cost_code: null,
      tradesstack_cost_code_label: null,
      accounting_route: "supplier_bill_expense",
      accounting_route_mapping_id: "supplier-route-project",
      organization_cost_code_id: "xero-expense-account",
      accounting_resolution_status: "resolved",
    });

    const actual = buildProjectActualCostEventPayload({
      organizationId: "org-1",
      createdByUserId: "user-1",
      supplierId: "supplier-1",
      invoice: { id: "invoice-1", invoice_date: "2026-08-24", invoice_number: "INV-1" },
      invoiceLine: { id: "invoice-line-1", quantity: 1, tax_amount: 15, line_total: 100 },
      allocation: { ...allocation, id: "allocation-1" },
    });
    expect(actual).toMatchObject({
      project_id: "project-1",
      source_invoice_allocation_id: "allocation-1",
      amount: 100,
      tax_amount: 15,
      total_amount: 115,
      tradesstack_cost_code: null,
      accounting_route: "supplier_bill_expense",
      accounting_route_mapping_id: "supplier-route-project",
    });
  });

  it("uses an explicit line account without creating a construction classification", () => {
    const allocation = createUnmatchedSupplierInvoiceLineAllocationDraft({
      organizationId: "org-1",
      supplierInvoiceId: "invoice-2",
      supplierInvoiceLineId: "invoice-line-2",
      projectId: "project-1",
      allocatedAmount: 50,
      accountOverrideOrganizationCostCodeId: "xero-explicit-account",
    });

    expect(allocation).toMatchObject({
      tradesstack_cost_code: null,
      accounting_mapping_id: null,
      accounting_route: "supplier_bill_expense",
      accounting_route_mapping_id: null,
      organization_cost_code_id: "xero-explicit-account",
      account_override_organization_cost_code_id: "xero-explicit-account",
      accounting_resolution_status: "resolved",
      review_reason: "explicit_line_account_override",
    });
  });
});
