import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(
  process.cwd(),
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx",
), "utf8");
const actionSource = readFileSync(resolve(
  process.cwd(),
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/actions.ts",
), "utf8");
const serviceSource = readFileSync(resolve(process.cwd(), "lib/purchase-orders/service.ts"), "utf8");

describe("Purchase Order source import integration contract", () => {
  it("gates the toolbar to Draft POs and uses one mutually exclusive drawer state", () => {
    expect(pageSource).toContain('type PurchaseOrderDrawerType = "quote" | "variation" | "materials" | null;');
    expect(pageSource).toContain('activeVariation?.status === "Draft"');
    expect(pageSource).toContain("Import From Quote");
    expect(pageSource).toContain("Import From Variation");
    expect(pageSource).toContain('setActivePurchaseOrderDrawer("quote")');
    expect(pageSource).toContain('setActivePurchaseOrderDrawer("variation")');
    expect(pageSource).toContain('setActivePurchaseOrderDrawer("materials")');
  });

  it("loads only the authoritative accepted Quote and excludes optional lines", () => {
    expect(actionSource).toContain('"resolve_project_contractual_baseline_v1"');
    expect(actionSource).toContain('.eq("id", baseline.quote_id)');
    expect(actionSource).toContain('.eq("status", "Accepted")');
    expect(actionSource).toContain('.eq("is_optional", false)');
    expect(actionSource).toContain('.eq("source_document_kind", "project_quote")');
    expect(actionSource).toContain('.eq("is_current", true)');
  });

  it("loads only Approved Variations and excludes Margin and PO-originated lines", () => {
    expect(actionSource).toContain('.eq("status", "Approved")');
    expect(actionSource).toContain('.neq("section", "Margin")');
    expect(actionSource).toContain('.is("source_purchase_order_line_item_id", null)');
    expect(actionSource).toContain('.eq("source_document_kind", "project_variation")');
  });

  it("imports locally, clears selection, stays open, and preserves the existing Save RPC", () => {
    const importCallback = pageSource.slice(
      pageSource.indexOf("const importSourceLines"),
      pageSource.indexOf("const addSupplierMaterial"),
    );
    expect(importCallback).toContain('updateActiveVariation("costLines"');
    expect(importCallback).toContain("setSelectedQuoteImportLineIds(new Set())");
    expect(importCallback).toContain("setSelectedVariationImportLineIds(new Set())");
    expect(importCallback).not.toContain("setActivePurchaseOrderDrawer(null)");
    expect(importCallback).not.toContain("save_project_purchase_order_draft");
    expect(pageSource).toContain("savePurchaseOrderDraft(supabase");
    expect(serviceSource).toContain('client.rpc("save_project_purchase_order_draft"');
    expect(pageSource).toContain("expectedUpdatedAt: activeVariation.updatedAt");
  });

  it("retains source Cost Item identity and does not create Commercial Item links", () => {
    expect(actionSource).toContain("sourceCostItemId,");
    expect(pageSource).toContain("existingSourceCostItemIds: importedSourceCostItemIds");
    expect(pageSource).toContain("buildPurchaseOrderDraftLineFromSource(line)");
  });
});
