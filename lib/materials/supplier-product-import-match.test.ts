import { describe, expect, it } from "vitest";
import { selectSupplierProductImportMatch } from "@/lib/materials/supplier-product-match";

const candidates = [
  { id: "sku-match", normalized_supplier_sku: "abc-1", normalized_supplier_description: "old description" },
  { id: "description-match", normalized_supplier_sku: null, normalized_supplier_description: "gib standard 10mm" },
];

describe("Supplier Product import matching", () => {
  it("prioritizes exact normalized SKU over description", () => {
    expect(selectSupplierProductImportMatch(candidates, { supplierSku: " ABC-1 ", supplierDescription: "GIB Standard 10mm" })?.id).toBe("sku-match");
  });

  it("uses exact description plus the already-scoped supplier/material/unit candidate set", () => {
    expect(selectSupplierProductImportMatch(candidates, { supplierSku: null, supplierDescription: " GIB   Standard 10mm " })?.id).toBe("description-match");
  });

  it("does not auto-match ambiguous or weak context", () => {
    const ambiguous = [...candidates, { id: "duplicate", normalized_supplier_sku: "abc-1", normalized_supplier_description: "other" }];
    expect(selectSupplierProductImportMatch(ambiguous, { supplierSku: "ABC-1", supplierDescription: null })).toBeNull();
    expect(selectSupplierProductImportMatch(candidates, { supplierSku: null, supplierDescription: "GIB" })).toBeNull();
  });
});
