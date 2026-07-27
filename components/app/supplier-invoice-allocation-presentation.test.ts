import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveSupplierInvoicePreviewThisInvoiceAmount,
  deriveSupplierInvoicePurchaseOrderLineAmounts,
  isActiveSupplierInvoicePurchaseOrderMatch,
} from "./supplier-invoice-allocation-presentation";

const workspaceSource = readFileSync(
  new URL("../../app/app/(workspace)/company/supplier-invoices/[invoiceId]/SupplierInvoiceDetailWorkspace.tsx", import.meta.url),
  "utf8"
);
const pageSource = readFileSync(
  new URL("../../app/app/(workspace)/company/supplier-invoices/[invoiceId]/page.tsx", import.meta.url),
  "utf8"
);

describe("Supplier Invoice direct PO-line allocation presentation", () => {
  it("keeps only accepted and adjusted matches selectable", () => {
    expect(isActiveSupplierInvoicePurchaseOrderMatch("accepted")).toBe(true);
    expect(isActiveSupplierInvoicePurchaseOrderMatch("adjusted")).toBe(true);
    expect(isActiveSupplierInvoicePurchaseOrderMatch("rejected")).toBe(false);
    expect(isActiveSupplierInvoicePurchaseOrderMatch("stale")).toBe(false);
  });

  it("separates previous and current values without double counting", () => {
    expect(
      deriveSupplierInvoicePurchaseOrderLineAmounts({
        poLineValue: 10_000,
        authoritativePreviouslyInvoiced: 1_000,
        currentInvoiceAllocationAmounts: [8_268.48],
      })
    ).toEqual({
      poLineValue: 10_000,
      previouslyInvoiced: 1_000,
      thisInvoice: 8_268.48,
      totalInvoiced: 9_268.48,
      remaining: 731.52,
      percentage: 92.6848,
      displayedPercentage: 92.6848,
      progressState: "incomplete",
    });
  });

  it("derives incomplete, complete, and over-invoiced line progress", () => {
    expect(deriveSupplierInvoicePurchaseOrderLineAmounts({ poLineValue: 100, authoritativePreviouslyInvoiced: 40, currentInvoiceAllocationAmounts: [10] }).progressState).toBe("incomplete");
    expect(deriveSupplierInvoicePurchaseOrderLineAmounts({ poLineValue: 100, authoritativePreviouslyInvoiced: 40, currentInvoiceAllocationAmounts: [60] }).progressState).toBe("complete");
    const over = deriveSupplierInvoicePurchaseOrderLineAmounts({ poLineValue: 100, authoritativePreviouslyInvoiced: 90, currentInvoiceAllocationAmounts: [20] });
    expect(over.progressState).toBe("over");
    expect(over.remaining).toBe(-10);
    expect(over.displayedPercentage).toBe(100);
  });

  it("moves the active source amount in preview without double counting it", () => {
    expect(deriveSupplierInvoicePreviewThisInvoiceAmount({
      persistedThisInvoice: 300,
      activeSourceAllocationAmount: 200,
      previewAmount: 200,
      isPreviewActive: true,
      isPreviewTarget: false,
    })).toBe(100);
    expect(deriveSupplierInvoicePreviewThisInvoiceAmount({
      persistedThisInvoice: 100,
      activeSourceAllocationAmount: 0,
      previewAmount: 200,
      isPreviewActive: true,
      isPreviewTarget: true,
    })).toBe(300);
  });

  it("passes every already-loaded matched PO line to the workspace", () => {
    expect(pageSource).toContain("matchedPurchaseOrderLines={matchedPurchaseOrderLines}");
    expect(pageSource).toContain("matchedPurchaseOrderProgress={matchedPurchaseOrderProgress}");
    expect(workspaceSource).toContain("matchedPurchaseOrderLines.filter(");
    expect(workspaceSource).toContain("purchase_order_id === purchaseOrder.id");
  });

  it("keeps the existing mutation paths and payload keys", () => {
    expect(workspaceSource).toContain("saveSupplierInvoiceDraftAllocationAction({");
    expect(workspaceSource).toContain("organizationId,\n        supplierInvoiceId: invoice.id,\n        invoiceLineId: params.invoiceLineId,\n        purchaseOrderLineItemId: params.purchaseOrderLineItemId");
    expect(workspaceSource).toContain("markSupplierInvoiceLineAllocationUnmatchedAction({");
    expect(workspaceSource).toContain("postSupplierInvoiceActualCostsAction({");
    expect(workspaceSource).toContain("reverseSupplierInvoiceActualCostEventAction({");
  });

  it("routes allocation through the Supplier Invoice-only modal", () => {
    expect(workspaceSource).toContain("<SupplierInvoiceAllocationModal");
    expect(workspaceSource).toContain("groups={allocationModalGroups}");
    expect(workspaceSource).toContain("return saveDraftAllocation({");
  });
});
