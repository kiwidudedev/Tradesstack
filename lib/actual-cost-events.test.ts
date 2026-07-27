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
        tradesstack_cost_code: "100",
        tradesstack_cost_code_label: "Materials",
        work_type: null,
        cost_type: null,
        internal_cost_code: null,
        organization_cost_code_id: "code-1",
        accounting_mapping_id: "mapping-1",
        allocated_amount: 200,
        allocated_quantity: 2,
      },
    });

    expect(payload?.tradesstack_cost_code).toBe("100");
    expect(payload?.tradesstack_cost_code_label).toBe("Materials");
    expect(payload?.accounting_mapping_id).toBe("mapping-1");
    expect(payload?.organization_cost_code_id).toBe("code-1");
  });

  it("does not build an actual cost payload when routing is still missing", () => {
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
        work_type: null,
        cost_type: null,
        internal_cost_code: null,
        organization_cost_code_id: null,
        accounting_mapping_id: null,
        allocated_amount: 200,
        allocated_quantity: 2,
      },
    });

    expect(payload).toBeNull();
  });
});
