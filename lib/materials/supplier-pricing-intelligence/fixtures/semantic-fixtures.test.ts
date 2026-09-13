import { describe, expect, it } from "vitest";
import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";
import { MATERIAL_PRICING_SEMANTIC_FIXTURES } from "@/lib/materials/supplier-pricing-intelligence/fixtures/semantic-fixtures";
import { mapMaterialSupplierPricingToImportRows } from "@/lib/materials/supplier-pricing-intelligence/import-row-mapper";
import { validateMaterialSupplierPricingV1 } from "@/lib/materials/supplier-pricing-intelligence/validate";

const missingString = { value: null, state: "missing", confidence: null, evidence: [] } as const;
const missingNumber = { value: null, state: "missing", confidence: null, evidence: [] } as const;

function mockStructuredOutput(fixture: typeof MATERIAL_PRICING_SEMANTIC_FIXTURES[number], source: DocumentSourcePart) {
  const evidence = [{ sourcePartId: source.id, page: fixture.sourceKind === "pdf" ? 1 : null, sheet: fixture.sourceKind === "spreadsheet" ? "Sheet1" : null, cellRange: fixture.sourceKind === "spreadsheet" || fixture.sourceKind === "csv" ? "A1:D4" : null, excerpt: fixture.sourceText.slice(0, 100), boundingRegion: null }];
  const found = <T extends string | number>(value: T) => ({ value, state: "found" as const, confidence: 0.9, evidence });
  return {
    contractVersion: "material_supplier_pricing_v1",
    document: { title: found(fixture.id), extractedSupplierName: found("Fixture Supplier"), currency: found("NZD"), effectiveFrom: missingString, validTo: missingString },
    rows: Array.from({ length: fixture.expectedProductRows }, (_, rowIndex) => ({
      rowKey: `${fixture.id}-${rowIndex + 1}`,
      supplierDescription: found(`Fixture product ${rowIndex + 1}`), supplierSku: found(`SKU-${rowIndex + 1}`),
      proposedMaterialName: found(`Fixture material ${rowIndex + 1}`), proposedMaterialDescription: missingString,
      supplierUnit: found("ea"), packQuantity: missingNumber, packUnit: missingString,
      prices: Array.from({ length: fixture.expectedPriceCounts[rowIndex] ?? 0 }, (_, priceIndex) => ({
        priceKey: `price-${priceIndex + 1}`, label: found(`Price ${priceIndex + 1}`), amount: found(10 + priceIndex), currency: found("NZD"), effectiveFrom: missingString, validTo: missingString,
      })),
      priceRecommendation: { priceKey: null, reason: null, confidence: null, evidence: [] }, warnings: [],
    })),
    warnings: [], extractionMeta: { method: fixture.sourceKind, sourcePartCount: 1, rowCount: fixture.expectedProductRows, partial: false },
  };
}

describe("Material supplier pricing semantic fixture corpus", () => {
  it("covers at least 18 representative supplier-document semantics", () => {
    expect(MATERIAL_PRICING_SEMANTIC_FIXTURES).toHaveLength(18);
    expect(new Set(MATERIAL_PRICING_SEMANTIC_FIXTURES.map((fixture) => fixture.sourceKind))).toEqual(new Set(["pdf", "spreadsheet", "csv", "image"]));
    expect(MATERIAL_PRICING_SEMANTIC_FIXTURES.some((fixture) => fixture.id === "gib-fis-dts1")).toBe(true);
  });

  it.each(MATERIAL_PRICING_SEMANTIC_FIXTURES)("validates and maps $id without silently selecting multi-price rows", (fixture) => {
    const source: DocumentSourcePart = { id: `source-${fixture.id}`, kind: fixture.sourceKind, fileName: `${fixture.id}.txt`, mimeType: "text/plain", sizeBytes: fixture.sourceText.length, pageCount: fixture.sourceKind === "pdf" ? 1 : null, content: fixture.sourceText, metadata: {} };
    const canonical = validateMaterialSupplierPricingV1(mockStructuredOutput(fixture, source), [source]);
    expect(canonical.rows).toHaveLength(fixture.expectedProductRows);
    expect(canonical.rows.map((row) => row.prices.length)).toEqual(fixture.expectedPriceCounts);
    const mapped = mapMaterialSupplierPricingToImportRows({ canonical, runs: [] });
    for (const row of mapped.filter((_, index) => (fixture.expectedPriceCounts[index] ?? 0) > 1)) {
      expect(row.sourcePayload.selectedPriceKey).toBeNull();
    }
  });
});
