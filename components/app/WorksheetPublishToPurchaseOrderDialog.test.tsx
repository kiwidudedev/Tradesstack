import { vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogContent: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogDescription: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogFooter: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogHeader: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogTitle: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorksheetPublishToPurchaseOrderDialog } from "@/components/app/WorksheetPublishToPurchaseOrderDialog";

describe("WorksheetPublishToPurchaseOrderDialog", () => {
  it("renders the simplified single-line purchase order confirmation UI", () => {
    const markup = renderToStaticMarkup(
      <WorksheetPublishToPurchaseOrderDialog
        open
        suppliers={[{ id: "supplier-1", label: "Acme" }]}
        draftPurchaseOrders={[
          {
            id: "po-1",
            purchaseOrderNumber: "PO-001",
            purchaseOrderTitle: "Draft PO",
            status: "Draft",
            supplierId: "supplier-1",
            supplierLabel: "Acme",
            updatedAt: "2026-07-11T00:00:00.000Z",
            lineItemCount: 2,
          },
        ]}
        lines={[
          {
            id: "line-1",
            description: "Board Supply Cost",
            quantity: "92",
            unit: "Sheets",
            rate: "30",
            total: "2760",
            purchaseOrderSection: "Materials",
          },
        ]}
        purchaseOrderTitle="Wall Framing Package"
        variationCode="26028-VAR-03"
        selectedSupplierId=""
        selectedTargetMode="new"
        selectedPurchaseOrderId=""
        sourceRangeLabel="A2:B4"
        selectedValues={["Sheets Required", "92", "Board Rate", "30", "Board Supply Cost", "2760"]}
        onOpenChange={() => undefined}
        onSupplierChange={() => undefined}
        onPurchaseOrderTitleChange={() => undefined}
        onTargetModeChange={() => undefined}
        onPurchaseOrderChange={() => undefined}
        onLineChange={() => undefined}
        onAddLine={() => undefined}
        onRemoveLine={() => undefined}
        onConfirm={() => undefined}
        isSubmitting={false}
      />,
    );

    expect(markup).toContain("Add to Purchase Order");
    expect(markup).toContain("Commercial line");
    expect(markup).toContain("Board Supply Cost");
    expect(markup).toContain("Wall Framing Package");
    expect(markup).toContain("Variation: 26028-VAR-03");
    expect(markup).toContain("Procurement section");
    expect(markup).toContain("Add another line");
    expect(markup).not.toContain("Line 1");
    expect(markup).not.toContain("High");
    expect(markup).not.toContain("Medium");
    expect(markup).not.toContain("A2:B4");
  });
});
