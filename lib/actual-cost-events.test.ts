import { describe, expect, it } from "vitest";
import { buildProjectActualCostEventPayload } from "@/lib/actual-cost-events";

describe("actual cost event payloads", () => {
  it("snapshots TradesStack routing and accounting mapping fields", () => {
    const payload = buildProjectActualCostEventPayload({
      organizationId: "org-1",
      createdByUserId: "user-1",
      supplierId: "supplier-1",
      invoice: {
        id: "invoice-1",
        invoice_date: "2026-06-21",
        invoice_number: "INV-001",
      },
      invoiceLine: {
        id: "line-1",
        quantity: 2,
        tax_amount: 30,
        line_total: 200,
      },
      allocation: {
        id: "allocation-1",
        supplier_invoice_id: "invoice-1",
        supplier_invoice_line_id: "line-1",
        purchase_order_id: "po-1",
        purchase_order_line_item_id: "po-line-1",
        project_id: "project-1",
        cost_item_id: "cost-item-1",
        source_cost_item_id: null,
        tradesstack_cost_code: 100,
        tradesstack_cost_code_label: "Materials",
        financial_routing_confidence: 0.93,
        financial_routing_source: "database_rule",
        organization_cost_code_id: "code-1",
        accounting_mapping_id: "mapping-1",
        allocated_amount: 200,
        allocated_quantity: 2,
      },
    });

    expect(payload?.tradesstack_cost_code).toBe(100);
    expect(payload?.tradesstack_cost_code_label).toBe("Materials");
    expect(payload?.accounting_mapping_id).toBe("mapping-1");
    expect(payload?.organization_cost_code_id).toBe("code-1");
    expect(payload?.financial_routing_confidence).toBe(0.93);
    expect(payload?.financial_routing_source).toBe("database_rule");
  });

  it("builds a factual actual cost payload with null construction routing", () => {
    const payload = buildProjectActualCostEventPayload({
      organizationId: "org-1",
      createdByUserId: "user-1",
      supplierId: "supplier-1",
      invoice: {
        id: "invoice-1",
        invoice_date: "2026-06-21",
        invoice_number: "INV-001",
      },
      invoiceLine: {
        id: "line-1",
        quantity: 2,
        tax_amount: 30,
        line_total: 200,
      },
      allocation: {
        id: "allocation-1",
        supplier_invoice_id: "invoice-1",
        supplier_invoice_line_id: "line-1",
        purchase_order_id: null,
        purchase_order_line_item_id: null,
        project_id: "project-1",
        cost_item_id: null,
        source_cost_item_id: null,
        tradesstack_cost_code: null,
        tradesstack_cost_code_label: null,
        financial_routing_confidence: null,
        financial_routing_source: null,
        organization_cost_code_id: null,
        accounting_mapping_id: null,
        allocated_amount: 200,
        allocated_quantity: 2,
      },
    });

    expect(payload).toMatchObject({
      project_id: "project-1",
      tradesstack_cost_code: null,
      tradesstack_cost_code_label: null,
      amount: 200,
      total_amount: 230,
    });
  });

  it("snapshots a named accounting route without a construction route", () => {
    const payload = buildProjectActualCostEventPayload({
      organizationId: "org-1",
      createdByUserId: "user-1",
      supplierId: "supplier-1",
      invoice: { id: "invoice-1", invoice_date: "2026-08-24", invoice_number: "INV-NEW" },
      invoiceLine: { id: "line-1", quantity: 1, tax_amount: 15, line_total: 100 },
      allocation: {
        id: "allocation-1",
        supplier_invoice_id: "invoice-1",
        supplier_invoice_line_id: "line-1",
        purchase_order_id: null,
        purchase_order_line_item_id: null,
        project_id: "project-1",
        cost_item_id: null,
        source_cost_item_id: null,
        tradesstack_cost_code: null,
        tradesstack_cost_code_label: null,
        financial_routing_confidence: null,
        financial_routing_source: null,
        organization_cost_code_id: "xero-account-1",
        accounting_mapping_id: null,
        accounting_route: "supplier_bill_expense",
        accounting_route_mapping_id: "named-mapping-1",
        allocated_amount: 100,
        allocated_quantity: 1,
      },
    });

    expect(payload).toMatchObject({
      accounting_route: "supplier_bill_expense",
      accounting_route_mapping_id: "named-mapping-1",
      tradesstack_cost_code: null,
    });
  });
});
