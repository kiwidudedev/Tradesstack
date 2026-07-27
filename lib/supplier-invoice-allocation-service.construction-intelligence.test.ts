import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cost-construction-intelligence", () => ({
  buildCostConstructionIntelligenceIdempotencyKey: vi.fn(
    ({
      sourceType,
      sourceId,
      sourceLineId,
      revisionToken,
    }: {
      sourceType: string;
      sourceId: string;
      sourceLineId?: string | null;
      revisionToken?: string | null;
    }) =>
      [
        "cost-construction-intelligence",
        sourceType,
        sourceId,
        sourceLineId ?? "root",
        revisionToken ?? "current",
      ].join(":"),
  ),
  tryEnqueueCostConstructionIntelligenceEvent: vi.fn().mockResolvedValue(null),
}));

import {
  buildActualCostEventConstructionIntelligenceInput,
  buildSupplierInvoiceAllocationConstructionIntelligenceInput,
} from "@/lib/supplier-invoice-allocation-service";

describe("supplier invoice construction intelligence inputs", () => {
  it("includes supplier, rate, invoice number, and purchase order context for invoice allocations", () => {
    const input = buildSupplierInvoiceAllocationConstructionIntelligenceInput({
      allocation: {
        id: "allocation-1",
        organization_id: "org-1",
        project_id: "project-1",
        supplier_invoice_id: "invoice-1",
        supplier_invoice_line_id: "line-1",
        purchase_order_id: "po-1",
        purchase_order_line_item_id: "po-line-1",
        cost_item_id: "cost-item-1",
        source_cost_item_id: "source-cost-item-1",
        tradesstack_cost_code: "300",
        tradesstack_cost_code_label: "Subcontractors",
        accounting_mapping_id: "mapping-1",
        allocated_quantity: 10,
        allocated_amount: 1250,
        allocation_status: "allocated",
        approval_status: "approved",
        review_status: "auto_approved",
        approval_notes: null,
        created_at: "2026-06-21T00:00:00.000Z",
        updated_at: "2026-06-21T01:00:00.000Z",
      } as never,
      invoice: {
        id: "invoice-1",
        invoice_number: "INV-001",
      } as never,
      invoiceLine: {
        id: "line-1",
        description: "Supply and install partition framing package",
        unit_price: 125,
      } as never,
      supplierName: "ABC Interiors",
      purchaseOrder: {
        id: "po-1",
        purchase_order_number: "PO-1001",
        purchase_order_title: "Wall framing package",
        status: "approved",
      },
      purchaseOrderLine: {
        id: "po-line-1",
        unit: "m2",
        description: "Partition framing package",
      },
    });

    expect(input).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      sourceType: "supplier_invoice_line_allocation",
      sourceId: "allocation-1",
      sourceLineId: "line-1",
      tradesstackCostCode: "300",
      tradesstackCostCodeLabel: "Subcontractors",
      accountingMappingId: "mapping-1",
      supplierName: "ABC Interiors",
      description: "Supply and install partition framing package",
      quantity: 10,
      unit: "m2",
      rate: 125,
      amount: 1250,
      documentContext: {
        module: "supplier_invoices",
        documentType: "supplier_invoice_line_allocation",
        supplierInvoiceNumber: "INV-001",
        supplierInvoiceId: "invoice-1",
        supplierInvoiceLineId: "line-1",
        allocationStatus: "allocated",
        allocationSource: null,
        allocationGroupId: null,
        allocationSequence: null,
        approvalStatus: "approved",
        reviewStatus: "auto_approved",
        purchaseOrderId: "po-1",
        purchaseOrderNumber: "PO-1001",
        purchaseOrderTitle: "Wall framing package",
        purchaseOrderStatus: "approved",
      },
      eventPayload: {
        purchaseOrderId: "po-1",
        purchaseOrderLineItemId: "po-line-1",
        purchaseOrderLineDescription: "Partition framing package",
        costItemId: "cost-item-1",
        sourceCostItemId: "source-cost-item-1",
        invoiceLineDescription: "Supply and install partition framing package",
        invoiceLineRate: 125,
        invoiceLineQuantity: null,
      },
    });
    expect(input?.idempotencyKey).toBe(
      "cost-construction-intelligence:supplier_invoice_line_allocation:allocation-1:line-1:2026-06-21T01:00:00.000Z",
    );
  });

  it("keeps missing supplier, unit, and rate values null instead of inventing them", () => {
    const input = buildSupplierInvoiceAllocationConstructionIntelligenceInput({
      allocation: {
        id: "allocation-2",
        organization_id: "org-1",
        project_id: null,
        supplier_invoice_id: "invoice-2",
        supplier_invoice_line_id: "line-2",
        purchase_order_id: null,
        purchase_order_line_item_id: null,
        cost_item_id: null,
        source_cost_item_id: null,
        tradesstack_cost_code: "500",
        tradesstack_cost_code_label: "Overheads",
        accounting_mapping_id: null,
        allocated_quantity: null,
        allocated_amount: 89.5,
        allocation_status: "allocated",
        approval_status: "approved",
        review_status: "resolved",
        approval_notes: "Office consumables",
        created_at: "2026-06-21T00:00:00.000Z",
        updated_at: null,
      } as never,
      invoice: null,
      invoiceLine: {
        id: "line-2",
        description: "",
        unit_price: null,
      } as never,
      supplierName: null,
      purchaseOrder: null,
      purchaseOrderLine: null,
    });

    expect(input).toMatchObject({
      supplierName: null,
      quantity: null,
      unit: null,
      rate: null,
      description: "Office consumables",
      documentContext: {
        supplierInvoiceNumber: null,
        purchaseOrderId: null,
        purchaseOrderNumber: null,
      },
    });
  });

  it("includes derived supplier, rate, unit, and allocation context for actual cost events", () => {
    const input = buildActualCostEventConstructionIntelligenceInput({
      event: {
        id: "actual-cost-1",
        organization_id: "org-1",
        project_id: "project-1",
        supplier_invoice_id: "invoice-1",
        supplier_invoice_line_allocation_id: "allocation-1",
        source_invoice_allocation_id: "allocation-1",
        supplier_invoice_line_id: "line-1",
        source_invoice_line_id: "line-1",
        purchase_order_id: "po-1",
        purchase_order_line_item_id: "po-line-1",
        cost_item_id: "cost-item-1",
        event_status: "posted",
        posting_source: "supplier_invoice",
        source_type: "supplier_invoice_allocation",
        source_reference: "Supplier invoice INV-001 line 1",
        tradesstack_cost_code: "400",
        tradesstack_cost_code_label: "Plant & Equipment",
        accounting_mapping_id: "mapping-2",
        quantity: 4,
        amount: 300,
        total_amount: 300,
        created_at: "2026-06-21T02:00:00.000Z",
        updated_at: "2026-06-21T03:00:00.000Z",
      } as never,
      invoice: {
        id: "invoice-1",
        invoice_number: "INV-001",
      } as never,
      invoiceLine: {
        id: "line-1",
        description: "Scaffold hire weekly charge",
        unit_price: 75,
      } as never,
      allocation: {
        id: "allocation-1",
        allocated_quantity: 4,
        allocated_amount: 300,
      } as never,
      supplierName: "Safe Access Ltd",
      purchaseOrder: {
        id: "po-1",
        purchase_order_number: "PO-2002",
        purchase_order_title: "Access equipment hire",
        status: "approved",
      },
      purchaseOrderLine: {
        id: "po-line-1",
        unit: "week",
        description: "Scaffold hire",
      },
    });

    expect(input).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      sourceType: "project_actual_cost_event",
      sourceId: "actual-cost-1",
      sourceLineId: "line-1",
      tradesstackCostCode: "400",
      tradesstackCostCodeLabel: "Plant & Equipment",
      accountingMappingId: "mapping-2",
      supplierName: "Safe Access Ltd",
      description: "Scaffold hire weekly charge",
      quantity: 4,
      unit: "week",
      rate: 75,
      amount: 300,
      documentContext: {
        documentType: "project_actual_cost_event",
        module: "actual_costs",
        postingSource: "supplier_invoice",
        sourceType: "supplier_invoice_allocation",
        eventStatus: "posted",
        supplierInvoiceNumber: "INV-001",
        supplierInvoiceId: "invoice-1",
        supplierInvoiceAllocationId: "allocation-1",
        purchaseOrderId: "po-1",
        purchaseOrderNumber: "PO-2002",
        purchaseOrderTitle: "Access equipment hire",
        purchaseOrderStatus: "approved",
      },
      eventPayload: {
        sourceReference: "Supplier invoice INV-001 line 1",
        sourceInvoiceLineId: "line-1",
        sourceInvoiceAllocationId: "allocation-1",
        allocationId: "allocation-1",
        allocationQuantity: 4,
        allocationAmount: 300,
        purchaseOrderLineItemId: "po-line-1",
        purchaseOrderLineDescription: "Scaffold hire",
        costItemId: "cost-item-1",
        invoiceLineDescription: "Scaffold hire weekly charge",
        invoiceLineRate: 75,
      },
    });
    expect(input?.idempotencyKey).toBe(
      "cost-construction-intelligence:project_actual_cost_event:actual-cost-1:line-1:2026-06-21T03:00:00.000Z",
    );
  });

  it("uses nulls for missing actual-cost unit and rate while preserving routing and mapping fields", () => {
    const input = buildActualCostEventConstructionIntelligenceInput({
      event: {
        id: "actual-cost-2",
        organization_id: "org-1",
        project_id: null,
        supplier_invoice_id: null,
        supplier_invoice_line_allocation_id: null,
        source_invoice_allocation_id: null,
        supplier_invoice_line_id: null,
        source_invoice_line_id: null,
        purchase_order_id: null,
        purchase_order_line_item_id: null,
        cost_item_id: null,
        posting_source: "manual",
        source_type: "manual_adjustment",
        source_reference: "Manual overhead adjustment",
        tradesstack_cost_code: "800",
        tradesstack_cost_code_label: "Others",
        accounting_mapping_id: null,
        quantity: null,
        amount: 50,
        total_amount: null,
        created_at: "2026-06-21T02:00:00.000Z",
        updated_at: null,
      } as never,
      invoice: null,
      invoiceLine: null,
      allocation: null,
      supplierName: null,
      purchaseOrder: null,
      purchaseOrderLine: null,
    });

    expect(input).toMatchObject({
      tradesstackCostCode: "800",
      tradesstackCostCodeLabel: "Others",
      accountingMappingId: null,
      supplierName: null,
      quantity: null,
      unit: null,
      rate: null,
      description: "Manual overhead adjustment",
      amount: 50,
      documentContext: {
        sourceType: "manual_adjustment",
        supplierInvoiceNumber: null,
        purchaseOrderId: null,
      },
    });
  });
});
