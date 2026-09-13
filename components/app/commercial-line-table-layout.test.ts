import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_LINE_COLUMN_WIDTHS,
  COMMERCIAL_LINE_GRID_WITH_SOURCE,
  COMMERCIAL_LINE_GRID_WITHOUT_SOURCE,
  COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITH_SOURCE,
  COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITHOUT_SOURCE,
} from "@/components/app/commercial-line-table-layout";

const purchaseOrderSource = readFileSync(resolve(
  process.cwd(),
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx",
), "utf8");
const variationSource = readFileSync(resolve(
  process.cwd(),
  "app/app/(workspace)/projects/[projectId]/preconstruction/variations/[variationId]/page.tsx",
), "utf8");

describe("commercial line table layout", () => {
  it("provides safe shared monetary tracks while preserving the fixed source and action widths", () => {
    expect(COMMERCIAL_LINE_COLUMN_WIDTHS).toEqual({
      description: "minmax(240px, 1fr)",
      source: "140px",
      item: "120px",
      quantity: "72px",
      unit: "64px",
      price: "144px",
      amount: "168px",
      action: "44px",
    });
    expect(COMMERCIAL_LINE_GRID_WITH_SOURCE).toBe(
      "minmax(240px, 1fr) 140px 120px 72px 64px 144px 168px 44px",
    );
    expect(COMMERCIAL_LINE_GRID_WITHOUT_SOURCE).toBe(
      "minmax(240px, 1fr) 120px 72px 64px 144px 168px 44px",
    );
    expect(COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITH_SOURCE).toBe("min-w-[1004px]");
    expect(COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITHOUT_SOURCE).toBe("min-w-[860px]");
  });

  it("keeps Purchase Orders and Variations on the same grid token", () => {
    expect(purchaseOrderSource).toContain("gridTemplateColumns={COMMERCIAL_LINE_GRID_WITH_SOURCE}");
    expect(purchaseOrderSource).toContain("minWidthClassName={COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITH_SOURCE}");
    expect(variationSource).toContain("gridTemplateColumns: COMMERCIAL_LINE_GRID_WITH_SOURCE");
    expect(variationSource).toContain("className={COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITH_SOURCE}");
  });

  it("preserves PO scrolling and adds the same horizontal overflow behavior to Variations", () => {
    expect(purchaseOrderSource).toContain("<CommercialLineItemsTable");
    expect(variationSource).toContain('<div className="overflow-x-auto">');
    expect(purchaseOrderSource).toContain("whitespace-nowrap text-right text-sm");
    expect(variationSource).toContain("whitespace-nowrap text-right text-sm");
    expect(variationSource).not.toContain("LINE_GRID_TEMPLATE");
  });
});
