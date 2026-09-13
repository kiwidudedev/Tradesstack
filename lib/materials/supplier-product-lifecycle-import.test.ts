import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateMaterialImportReviewDraft } from "@/lib/materials/validation";

const importService = readFileSync("lib/materials/import-service.ts", "utf8");
const reviewPanel = readFileSync(
  "app/app/(workspace)/company/materials/MaterialImportReviewPanel.tsx",
  "utf8",
);

const baseReview = {
  rowId: "row-1",
  action: "match_material" as const,
  matchedMaterialId: "material-1",
  reviewedName: "GIB Standard 13mm",
  supplierUnit: "m2",
  materialUnit: "m2",
  reviewedUnitCost: 10.48,
  reviewedCurrency: "NZD",
  reviewedSupplierDescription: "GIB Standard 13mm",
  selectedPriceKey: "manual",
};

describe("archived Supplier Product import handling", () => {
  it("requires an archived product id for explicit restore", () => {
    expect(() => validateMaterialImportReviewDraft({
      ...baseReview,
      archivedSupplierProductResolution: "restore",
    })).toThrow("Choose the archived supplier item to restore");
  });

  it("requires an explicit nondefault identity variant for a distinct product", () => {
    expect(() => validateMaterialImportReviewDraft({
      ...baseReview,
      archivedSupplierProductResolution: "create_distinct",
      identityVariant: "default",
    })).toThrow("Enter a distinct identity variant");
    expect(validateMaterialImportReviewDraft({
      ...baseReview,
      archivedSupplierProductResolution: "create_distinct",
      archivedSupplierProductId: "product-1",
      identityVariant: "alternate-pack",
    })).toMatchObject({ identityVariant: "alternate-pack" });
  });

  it("checks active identities first and blocks silent archived reuse", () => {
    expect(importService).toContain("const active = selectSupplierProductImportMatch");
    expect(importService).toContain("const archived = active ? null");
    expect(importService).toContain('"archived_supplier_product_match"');
    expect(importService).toContain("restoreSupplierProductAtomic");
    expect(importService).toContain("identityVariant: validated.identityVariant");
  });

  it("offers explicit restore, distinct identity, and another Material choices", () => {
    expect(reviewPanel).toContain("Archived supplier item found");
    expect(reviewPanel).toContain("Restore Supplier Item");
    expect(reviewPanel).toContain("Keep Archived / Create Distinct Item");
    expect(reviewPanel).toContain("Select Another Material");
    expect(reviewPanel).toContain("Distinct Identity Variant");
  });
});
