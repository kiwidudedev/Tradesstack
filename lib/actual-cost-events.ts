import type { Database } from "@/lib/supabase/types";

export type SupplierInvoiceRow = Database["public"]["Tables"]["supplier_invoices"]["Row"];
export type SupplierInvoiceLineRow =
  Database["public"]["Tables"]["supplier_invoice_lines"]["Row"];
export type SupplierInvoiceLineAllocationRow =
  Database["public"]["Tables"]["supplier_invoice_line_allocations"]["Row"];
export type ProjectActualCostEventRow =
  Database["public"]["Tables"]["project_actual_cost_events"]["Row"];
export type ProjectActualCostEventInsert =
  Database["public"]["Tables"]["project_actual_cost_events"]["Insert"];

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function summarizeApprovedUnpostedAllocations(params: {
  allocations: Array<
    Pick<SupplierInvoiceLineAllocationRow, "id" | "approval_status" | "allocated_amount">
  >;
  postedAllocationIds: Set<string>;
}) {
  return params.allocations.reduce(
    (summary, allocation) => {
      const isApproved = allocation.approval_status === "approved";
      const isPosted = params.postedAllocationIds.has(allocation.id);

      if (!isApproved || isPosted) {
        return summary;
      }

      const amount = Number(allocation.allocated_amount ?? 0);
      summary.count += 1;
      summary.amount = roundMoney(summary.amount + amount);
      return summary;
    },
    {
      count: 0,
      amount: 0,
    }
  );
}

export function buildProjectActualCostEventPayload(params: {
  organizationId: string;
  createdByUserId: string | null;
  supplierId: string | null;
  invoice: Pick<SupplierInvoiceRow, "id" | "invoice_date" | "invoice_number">;
  invoiceLine: Pick<SupplierInvoiceLineRow, "id" | "quantity" | "tax_amount" | "line_total">;
  allocation: Pick<
    SupplierInvoiceLineAllocationRow,
    | "id"
    | "supplier_invoice_id"
    | "supplier_invoice_line_id"
    | "purchase_order_id"
    | "purchase_order_line_item_id"
    | "project_id"
    | "cost_item_id"
    | "source_cost_item_id"
    | "work_type"
    | "cost_type"
    | "internal_cost_code"
    | "organization_cost_code_id"
    | "allocated_amount"
    | "allocated_quantity"
  >;
  taxAmount?: number | null;
}): ProjectActualCostEventInsert | null {
  const amount = Number(params.allocation.allocated_amount ?? 0);
  const projectId = params.allocation.project_id;

  if (!projectId) {
    return null;
  }

  const explicitTaxAmount = params.taxAmount;
  const invoiceLineTaxAmount = Number(params.invoiceLine.tax_amount ?? 0);
  const invoiceLineTotal = Number(params.invoiceLine.line_total ?? 0);
  const proportionalTaxAmount =
    invoiceLineTotal > 0
      ? roundMoney(invoiceLineTaxAmount * Math.max(0, Math.min(1, amount / invoiceLineTotal)))
      : 0;
  const taxAmount = roundMoney(
    typeof explicitTaxAmount === "number" && Number.isFinite(explicitTaxAmount)
      ? explicitTaxAmount
      : proportionalTaxAmount
  );
  const totalAmount = roundMoney(amount + taxAmount);

  return {
    organization_id: params.organizationId,
    supplier_invoice_id: params.invoice.id,
    supplier_invoice_line_id: params.invoiceLine.id,
    supplier_invoice_line_allocation_id: params.allocation.id,
    purchase_order_id: params.allocation.purchase_order_id,
    purchase_order_line_item_id: params.allocation.purchase_order_line_item_id,
    project_id: projectId,
    supplier_id: params.supplierId,
    cost_item_id: params.allocation.cost_item_id,
    source_cost_item_id: params.allocation.source_cost_item_id,
    work_type: params.allocation.work_type,
    cost_type: params.allocation.cost_type,
    internal_cost_code: params.allocation.internal_cost_code,
    organization_cost_code_id: params.allocation.organization_cost_code_id,
    amount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    quantity: params.allocation.allocated_quantity ?? params.invoiceLine.quantity ?? null,
    event_date: params.invoice.invoice_date ?? new Date().toISOString().slice(0, 10),
    event_status: "posted",
    posting_source: "supplier_invoice_allocation",
    source_invoice_line_id: params.invoiceLine.id,
    source_invoice_allocation_id: params.allocation.id,
    source_type: "supplier_invoice",
    source_reference: params.invoice.invoice_number ?? "",
    created_by_user_id: params.createdByUserId,
  };
}
