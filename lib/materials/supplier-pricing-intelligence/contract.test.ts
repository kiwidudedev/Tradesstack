import { describe, expect, it } from "vitest";
import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";
import { validateMaterialSupplierPricingV1 } from "@/lib/materials/supplier-pricing-intelligence/validate";
import { mapMaterialSupplierPricingToImportRows } from "@/lib/materials/supplier-pricing-intelligence/import-row-mapper";

const source: DocumentSourcePart = { id: "pdf-pages-1-2", kind: "pdf", fileName: "gib.pdf", mimeType: "application/pdf", sizeBytes: 10, pageCount: 2, content: new Uint8Array(), metadata: {} };
const ev = [{ sourcePartId: source.id, page: 1, sheet: null, cellRange: null, excerpt: "GIB Standard 10mm m2 FIS 12.30 DTS1 11.80", boundingRegion: null }];
const missing = { value: null, state: "missing", confidence: null, evidence: [] };
const found = (value: unknown) => ({ value, state: "found", confidence: 0.9, evidence: ev });

function fixture() {
  return {
    contractVersion: "material_supplier_pricing_v1",
    document: { title: found("GIB Prices"), extractedSupplierName: found("Trade Direct"), currency: found("NZD"), effectiveFrom: missing, validTo: missing },
    rows: [{
      rowKey: "gib-standard-10", supplierDescription: found("GIB Standard 10mm"), supplierSku: found("GB10"), proposedMaterialName: found("GIB Standard 10mm"), proposedMaterialDescription: missing,
      supplierUnit: found("m2"), packQuantity: missing, packUnit: missing,
      prices: [
        { priceKey: "fis", label: found("FIS"), amount: found(12.3), currency: found("NZD"), effectiveFrom: missing, validTo: missing },
        { priceKey: "dts1", label: found("DTS1"), amount: found(11.8), currency: found("NZD"), effectiveFrom: missing, validTo: missing },
      ],
      priceRecommendation: { priceKey: "dts1", reason: "Customer tier shown", confidence: 0.7, evidence: ev }, warnings: [],
    }],
    warnings: [], extractionMeta: { method: "pdf", sourcePartCount: 1, rowCount: 1, partial: false },
  };
}

describe("material_supplier_pricing_v1", () => {
  it("expands the compact strict provider wire shape into canonical field-state wrappers", () => {
    const wire = {
      contractVersion: "material_supplier_pricing_v1",
      docTitle: "GIB Prices", docSupplier: "Trade Direct", docCurrency: "NZD", docEffectiveFrom: "", docValidTo: "",
      documentEvidence: [`docTitle|found|0.9|${source.id}|page:1|GIB Prices`, `docCurrency|inferred|0.6|${source.id}|page:1|Prices shown in NZD`],
      rows: [{
        rowKey: "gib-10", supplierDescription: "GIB Standard 10mm", supplierSku: "GB10", materialName: "GIB Standard 10mm", materialDescription: "", unit: "m2", packQuantity: 0, packUnit: "",
        evidence: [`supplierSku|found|0.95|${source.id}|page:1|GB10`, `unit|found|0.9|${source.id}|page:1|m2`],
        prices: [{ key: "fis", label: "FIS", amount: 12.3, currency: "NZD", effectiveFrom: "", validTo: "", evidence: [`label|found|0.9|${source.id}|page:1|FIS`, `amount|found|0.95|${source.id}|page:1|12.30`] }],
        recommendationKey: "", recommendationReason: "", recommendationConfidence: 0, warnings: [],
      }],
      warnings: [], method: "pdf", partial: false,
    };
    const canonical = validateMaterialSupplierPricingV1(wire, [source]);
    expect(canonical.document.currency).toMatchObject({ value: "NZD", state: "inferred", confidence: 0.6 });
    expect(canonical.rows[0]?.supplierSku).toMatchObject({ value: "GB10", state: "found", confidence: 0.95 });
    expect(canonical.rows[0]?.prices[0]?.amount.value).toBe(12.3);
  });

  it("preserves SKU, unit, labels, amounts and evidence without selecting a persisted price", () => {
    const canonical = validateMaterialSupplierPricingV1(fixture(), [source]);
    expect(canonical.rows[0]?.supplierSku.value).toBe("GB10");
    expect(canonical.rows[0]?.supplierUnit.value).toBe("m2");
    expect(canonical.rows[0]?.prices.map((price) => [price.label.value, price.amount.value])).toEqual([["FIS", 12.3], ["DTS1", 11.8]]);
    const rows = mapMaterialSupplierPricingToImportRows({ canonical, runs: [] });
    expect(rows[0]?.extractedUnitCost).toBe(11.8);
    expect(rows[0]?.sourcePayload.priceOptions).toHaveLength(2);
    expect(rows[0]?.sourcePayload.selectedPriceKey).toBeNull();
  });

  it("rejects duplicate price keys, negative amounts, and unknown evidence", () => {
    const duplicate = fixture();
    duplicate.rows[0]!.prices[1]!.priceKey = "fis";
    expect(() => validateMaterialSupplierPricingV1(duplicate, [source])).toThrow(/duplicate priceKey/);
    const negative = fixture();
    negative.rows[0]!.prices[0]!.amount.value = -1;
    expect(() => validateMaterialSupplierPricingV1(negative, [source])).toThrow(/negative/);
    const unknown = fixture();
    unknown.rows[0]!.supplierSku.evidence[0]!.sourcePartId = "missing";
    expect(() => validateMaterialSupplierPricingV1(unknown, [source])).toThrow(/unknown source part/);
  });
});
