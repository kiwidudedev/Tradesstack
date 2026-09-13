import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ interMedium: { className: "inter-medium" } }));

import { PurchaseOrderImportQuoteDrawer } from "@/components/app/PurchaseOrderImportQuoteDrawer";
import { PurchaseOrderImportVariationDrawer } from "@/components/app/PurchaseOrderImportVariationDrawer";

const line = {
  id: "source-line-1",
  sourceCostItemId: "source-cost-item-1",
  sourceSection: "Materials",
  section: "Materials" as const,
  description: "Timber framing",
  quantity: 4,
  unit: "lm",
  rate: 25,
};

describe("Purchase Order source import drawers", () => {
  it("renders the accepted Quote context, source columns, duplicate state, and 700px overlay", () => {
    const markup = renderToStaticMarkup(
      <PurchaseOrderImportQuoteDrawer
        source={{
          id: "quote-1",
          quoteNumber: "Q-101",
          quoteTitle: "Main contract",
          revisionNumber: 3,
          status: "Accepted",
          lines: [line],
        }}
        selectedLineIds={new Set()}
        alreadyImportedSourceCostItemIds={new Set([line.sourceCostItemId])}
        isLoading={false}
        error={null}
        onToggleLine={vi.fn()}
        onImportSelected={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain("Import From Quote");
    expect(markup).toContain("Q-101 · Main contract");
    expect(markup).toContain("Revision 3");
    expect(markup).toContain("Accepted");
    expect(markup).toContain("Timber framing");
    expect(markup).toContain("Already imported");
    expect(markup).toContain("disabled");
    expect(markup).toContain("w-[min(100vw,700px)] md:w-[700px]");
    expect(markup).toContain("Import Selected Quote Lines");
  });

  it("renders only the supplied Approved Variation choices and selectable line table", () => {
    const markup = renderToStaticMarkup(
      <PurchaseOrderImportVariationDrawer
        variations={[{
          id: "variation-1",
          variationNumber: "V-002",
          variationTitle: "Client changes",
          status: "Approved",
        }]}
        selectedVariationId="variation-1"
        lines={[line]}
        selectedLineIds={new Set([line.id])}
        alreadyImportedSourceCostItemIds={new Set()}
        isLoadingVariations={false}
        isLoadingLines={false}
        error={null}
        onVariationChange={vi.fn()}
        onToggleLine={vi.fn()}
        onImportSelected={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain("Import From Variation");
    expect(markup).toContain("V-002 - Client changes");
    expect(markup).toContain("Approved");
    expect(markup).toContain("Timber framing");
    expect(markup).toContain("checked");
    expect(markup).toContain("Import Selected Variation Lines");
  });
});
