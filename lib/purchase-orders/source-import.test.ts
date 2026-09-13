import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderDraftLineFromSource,
  normalizePurchaseOrderImportSection,
  selectNewPurchaseOrderImportLines,
  type PurchaseOrderImportLine,
} from "@/lib/purchase-orders/source-import";

const quoteLine: PurchaseOrderImportLine = {
  id: "quote-line-1",
  sourceCostItemId: "quote-cost-item-1",
  sourceSection: "Materials",
  section: "Materials",
  description: "13mm plasterboard",
  quantity: 12,
  unit: "sheet",
  rate: 34.5,
};

describe("purchase order source import", () => {
  it("preserves compatible sections and applies the existing Labour fallback", () => {
    expect(normalizePurchaseOrderImportSection("Materials")).toBe("Materials");
    expect(normalizePurchaseOrderImportSection("Plant")).toBe("Plant");
    expect(normalizePurchaseOrderImportSection("Item")).toBe("Labour");
    expect(normalizePurchaseOrderImportSection("Preliminaries")).toBe("Labour");
  });

  it("copies the source fields and retains Cost Item lineage without a Commercial Item link", () => {
    const ids = ["po-line-1", "po-line-uid-1"];
    const line = buildPurchaseOrderDraftLineFromSource(quoteLine, () => ids.shift() ?? "unexpected");

    expect(line).toMatchObject({
      id: "po-line-1",
      lineUid: "po-line-uid-1",
      description: "13mm plasterboard",
      section: "Materials",
      quantity: 12,
      unit: "sheet",
      rate: 34.5,
      sourceCostItemId: "quote-cost-item-1",
      commercialItemLink: null,
      costItemId: null,
    });
    expect(line.quantity * line.rate).toBe(414);
  });

  it("supports multi-selection while defensively excluding existing source Cost Items", () => {
    const secondLine = {
      ...quoteLine,
      id: "quote-line-2",
      sourceCostItemId: "quote-cost-item-2",
    };

    expect(selectNewPurchaseOrderImportLines({
      lines: [quoteLine, secondLine],
      selectedLineIds: new Set([quoteLine.id, secondLine.id]),
      existingSourceCostItemIds: new Set([quoteLine.sourceCostItemId]),
    })).toEqual([secondLine]);
  });
});
