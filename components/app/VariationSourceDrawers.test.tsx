import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({
  interMedium: { className: "inter-medium" },
}));

import { VariationImportPurchaseOrderLinesDrawer } from "@/components/app/VariationImportPurchaseOrderLinesDrawer";

const poDrawerSource = readFileSync(resolve(process.cwd(), "components/app/VariationImportPurchaseOrderLinesDrawer.tsx"), "utf8");

describe("Variation source drawers", () => {
  it("keeps imported PO lines disabled while allowing multi-selected new lines", () => {
    const markup = renderToStaticMarkup(
      <VariationImportPurchaseOrderLinesDrawer
        purchaseOrders={[{
          id: "po-1",
          purchase_order_number: "PO-001",
          purchase_order_title: "Timber supply",
          status: "Draft",
        }]}
        selectedPurchaseOrderId="po-1"
        purchaseOrderLines={[
          { id: "po-line-1", purchase_order_id: "po-1", section: "Materials", description: "Imported timber", quantity: 2, unit: "ea", rate: 30 },
          { id: "po-line-2", purchase_order_id: "po-1", section: "Plant", description: "Selected lift", quantity: 1, unit: "day", rate: 120 },
        ]}
        selectedLineIds={new Set(["po-line-2"])}
        alreadyImportedLineIds={new Set(["po-line-1"])}
        onPurchaseOrderChange={vi.fn()}
        onToggleLine={vi.fn()}
        onImportSelected={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain("Import From Purchase Order");
    expect(markup).toContain("PO-001 - Timber supply");
    expect(markup).toContain("Already imported into this variation");
    expect(markup).toMatch(/type="checkbox"[^>]*disabled/);
    expect(markup).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(markup).toContain("Import Selected PO Lines");
    expect(markup).not.toMatch(/data-testid="variation-import-po-confirm"[^>]*disabled/);
    expect(poDrawerSource).toContain("alreadyImportedLineIds.has(line.id)");
    expect(poDrawerSource).toContain("onClick={onImportSelected}");
  });

  it("uses the shared responsive overlay behavior without owning loaders or persistence", () => {
    expect(poDrawerSource).toContain('variant="overlay"');
    expect(poDrawerSource).toContain('className="w-[min(100vw,700px)] md:w-[700px]"');
    expect(poDrawerSource).toContain('event.key === "Escape"');
    expect(poDrawerSource).toContain("autoFocus");
    expect(poDrawerSource).toContain("overflow-x-auto");
    expect(poDrawerSource).not.toContain("supabase");
    expect(poDrawerSource).not.toContain("fetch(");
    expect(poDrawerSource).not.toContain("rpc(");
  });
});
