import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(new URL("./SupplierInvoiceAllocationModal.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(
  new URL("../../app/app/(workspace)/company/supplier-invoices/[invoiceId]/SupplierInvoiceDetailWorkspace.tsx", import.meta.url),
  "utf8"
);

describe("Supplier Invoice allocation modal", () => {
  it("is a read-only PO mirror with procurement labels and no PO editor controls", () => {
    expect(modalSource).toContain('{ key: "source", label: "Source" }');
    expect(modalSource).toContain('{ key: "item", label: "Item" }');
    expect(modalSource).toContain('{ key: "amount", label: "Amount"');
    expect(modalSource).toContain("PO Total Excl. GST");
    expect(modalSource).not.toContain("PurchaseOrderLineInvoiceProgress");
    expect(modalSource).toContain("Confirm Allocation");
    expect(modalSource).not.toContain("Paid");
    expect(modalSource).not.toContain("Outstanding");
    expect(modalSource).not.toContain("Add Item");
    expect(modalSource).not.toContain("Delete line");
    expect(modalSource).not.toContain("project_purchase_orders");
    expect(modalSource).not.toContain("project_purchase_order_line_items");
  });

  it("keeps the exact existing single-allocation mutation payload", () => {
    expect(workspaceSource).toContain("saveSupplierInvoiceDraftAllocationAction({");
    expect(workspaceSource).toContain(
      "organizationId,\n        supplierInvoiceId: invoice.id,\n        invoiceLineId: params.invoiceLineId,\n        purchaseOrderLineItemId: params.purchaseOrderLineItemId"
    );
    expect(modalSource).not.toContain("supabase");
    expect(modalSource).not.toContain("saveSupplierInvoiceDraftAllocationAction");
  });

  it("keeps no-PO behind an explicit confirmation", () => {
    expect(modalSource).toContain('setConfirmationMode("no-po")');
    expect(modalSource).toContain("Use no-PO workflow?");
    expect(modalSource).toContain("Confirm no-PO workflow");
  });
});
