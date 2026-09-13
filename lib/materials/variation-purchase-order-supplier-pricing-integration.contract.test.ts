import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const variationPage = readFileSync(resolve(process.cwd(), "app/app/(workspace)/projects/[projectId]/preconstruction/variations/[variationId]/page.tsx"), "utf8");
const variationActions = readFileSync(resolve(process.cwd(), "app/app/(workspace)/projects/[projectId]/preconstruction/variations/[variationId]/actions.ts"), "utf8");
const poPage = readFileSync(resolve(process.cwd(), "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx"), "utf8");
const poActions = readFileSync(resolve(process.cwd(), "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/actions.ts"), "utf8");
const drawerShell = readFileSync(resolve(process.cwd(), "components/app/OrganizationSupplierPricingDrawer.tsx"), "utf8");
const poDrawer = readFileSync(resolve(process.cwd(), "components/app/PurchaseOrderSupplierPricingDrawer.tsx"), "utf8");
const variationQuoteLinkDrawerPath = resolve(process.cwd(), "components/app/VariationLinkQuotedItemDrawer.tsx");
const variationPoImportDrawer = readFileSync(resolve(process.cwd(), "components/app/VariationImportPurchaseOrderLinesDrawer.tsx"), "utf8");

describe("Variation supplier pricing integration contract", () => {
  it("requires both authoritative permissions and renders only the remaining Line Items actions", () => {
    expect(variationActions).toContain('permissions: ["materials.view", "variations.write"]');
    expect(variationPage).toContain("supplierPricingPermissions?.canViewMaterials === true");
    expect(variationPage).toContain("supplierPricingPermissions.canWriteVariation");
    expect(variationPage).toContain("ref={materialsTriggerRef}");
    expect(variationPage).toContain("Import PO Items");
    expect(variationPage).toContain("Materials");
    expect(variationPage).not.toContain("Link Quoted Item");
    expect(existsSync(variationQuoteLinkDrawerPath)).toBe(false);
  });

  it("repeats the guard, appends through the pure mapper, stays open, and restores focus only on close", () => {
    expect(variationPage).toContain("if (!activeVariation || !canUseMaterials)");
    expect(variationPage).toContain("buildVariationLineFromSupplierPrice(item)");
    expect(variationPage).toContain("costLines: [...variation.costLines, line]");
    expect(variationPage).toContain("window.requestAnimationFrame(() => trigger?.focus())");
    expect(variationPage).not.toContain("addSupplierMaterial(item);\n    closeMaterials()");
  });

  it("uses the shared two-decimal commercial price editor and preserves PO import plus historical Quote source display", () => {
    expect(variationPage).toContain("CommercialLinePrefixedNumberInput");
    expect(variationPage).toContain('line.sourceProjectQuoteNumber || line.sourcePurchaseOrderNumber || "Manual"');
    expect(variationPage).toContain("importSelectedPurchaseOrderLines");
    expect(variationPage).not.toContain("assignSelectedProjectQuoteLine");
    expect(variationPage).not.toContain("clearProjectQuoteLink");
  });

  it("keeps PO and Materials mutually exclusive without a Quote-link drawer state", () => {
    expect(variationPage).toContain('type VariationDrawerType = "purchase-order" | "materials" | null');
    expect(variationPage).toContain('setActiveVariationDrawer("purchase-order")');
    expect(variationPage).toContain('setActiveVariationDrawer("materials")');
    expect(variationPage).toContain('activeVariationDrawer === "purchase-order"');
    expect(variationPage).toContain('activeVariationDrawer === "materials"');
    expect(variationPage).not.toContain('"quote-link"');
    expect(variationPage).toContain("activeDrawerTriggerRef.current = trigger");
    expect(variationPage).toContain("window.requestAnimationFrame(() => trigger?.focus())");
    expect(variationPage).not.toContain("isQuoteLinkOpen");
    expect(variationPage).not.toContain("isPurchaseOrderImportOpen");
    expect(variationPage).not.toContain("isMaterialsOpen");
    expect(variationPage).not.toContain(">Import From Purchase Order</h3>");
  });

  it("keeps the PO import as a presentation-only overlay drawer", () => {
    expect(variationPoImportDrawer).toContain('variant="overlay"');
    expect(variationPoImportDrawer).toContain("WorksheetSidePanelHeader");
    expect(variationPoImportDrawer).toContain("WorksheetSidePanelBody");
    expect(variationPoImportDrawer).toContain("WorksheetSidePanelFooter");
    expect(variationPoImportDrawer).toContain('className="w-[min(100vw,700px)] md:w-[700px]"');
    expect(variationPoImportDrawer).toContain('event.key === "Escape"');
    expect(variationPoImportDrawer).toContain("overflow-x-auto");
    expect(variationPoImportDrawer).not.toContain("createBrowserSupabaseClient");
    expect(variationPoImportDrawer).not.toContain("save_project_variation_draft");
  });

  it("round-trips historical Quote provenance without recreating a manual linking path", () => {
    expect(variationPage).toContain("sourceProjectQuoteId: lineRow.source_project_quote_id ?? null");
    expect(variationPage).toContain("sourceProjectQuoteLineItemId: lineRow.source_project_quote_line_item_id ?? null");
    expect(variationPage).toContain('sourceProjectQuoteNumber: lineRow.source_project_quote_number ?? ""');
    expect(variationPage).toContain("sourceProjectQuoteId: line.sourceProjectQuoteId ?? null");
    expect(variationPage).toContain("sourceProjectQuoteLineItemId: line.sourceProjectQuoteLineItemId ?? null");
    expect(variationPage).toContain('sourceProjectQuoteNumber: line.sourceProjectQuoteNumber ?? ""');
    expect(variationPage).toContain('supabase.rpc("save_project_variation_draft"');
    expect(variationPage).not.toContain('from("project_quotes")');
    expect(variationPage).not.toContain('from("project_quote_line_items")');
  });
});

describe("Purchase Order supplier pricing integration contract", () => {
  it("requires both authoritative permissions and Material Supply type", () => {
    expect(poActions).toContain('permissions: ["materials.view", "purchase_orders.write"]');
    expect(poPage).toContain("supplierPricingPermissions?.canViewMaterials === true");
    expect(poPage).toContain("supplierPricingPermissions.canWritePurchaseOrder");
    expect(poPage).toContain("canUsePurchaseOrderSupplierPricing(activeVariation?.origin ?? \"\")");
  });

  it("repeats the type/permission guard and commits supplier plus line coherently", () => {
    expect(poPage).toContain("!canUsePurchaseOrderSupplierPricing(activeVariation.origin)");
    expect(poPage).toContain("buildPurchaseOrderSelectionFromSupplierPrice");
    expect(poPage).toContain("issuedToSupplierId: selection.supplierId");
    expect(poPage).toContain("issuedToLabel: selection.supplierLabel");
    expect(poPage).toContain("costLines: [...purchaseOrder.costLines, selection.line]");
  });

  it("keeps supplier contact untouched, source Manual, and formats Price to two decimals", () => {
    expect(poPage).not.toContain("supplierContact: selection");
    expect(poPage).toContain('return "Manual"');
    expect(poPage).toContain("CommercialLinePrefixedNumberInput");
  });

  it("disables mismatched result selection through the thin PO wrapper", () => {
    expect(poDrawer).toContain("purchaseOrderSupplierMismatchIssue");
    expect(poDrawer).toContain("getAdditionalSelectionIssue");
  });
});

describe("organization supplier drawer shell", () => {
  it("owns the organization API, shared browser, overlay and commercial display pair", () => {
    expect(drawerShell).toContain("/api/materials/supplier-pricing");
    expect(drawerShell).toContain("SharedSupplierPricingBrowser");
    expect(drawerShell).toContain('variant="overlay"');
    expect(drawerShell).toContain('event.key === "Escape"');
    expect(drawerShell).toContain("autoFocus");
    expect(drawerShell).toContain("resolution.rate");
    expect(drawerShell).toContain("resolution.unit");
  });
});
