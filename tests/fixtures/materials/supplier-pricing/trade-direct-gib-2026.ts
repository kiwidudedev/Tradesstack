export const TRADE_DIRECT_GIB_2026_SHA256 = "f263f45a21c0ca711ffa428e08f41a03c5092d0532f2ccae8111a779abc418af";

export const TRADE_DIRECT_GIB_2026_EXPECTED = [
  { name: "GIB Standard 10mm", unit: "m2", fis: 8.30, dts1: 8.74, dts2: 9.10 },
  { name: "GIB Standard 13mm", unit: "m2", fis: 10.48, dts1: 11.06, dts2: 11.53 },
  { name: "GIB Fyreline 10mm", unit: "m2", fis: 9.34, dts1: 9.82, dts2: 10.21 },
  { name: "GIB Fyreline 13mm", unit: "m2", fis: 12.82, dts1: 13.54, dts2: 14.12 },
  { name: "GIB Fyreline 16mm", unit: "m2", fis: 21.09, dts1: 22.11, dts2: 22.93 },
  { name: "GIB Fyreline 19mm", unit: "m2", fis: 24.80, dts1: 25.94, dts2: 26.85 },
  { name: "GIB Braceline 10mm", unit: "m2", fis: 12.06, dts1: 12.66, dts2: 13.15 },
  { name: "GIB Braceline 13mm", unit: "m2", fis: 14.66, dts1: 15.49, dts2: 16.15 },
  { name: "GIB Aqualine 10mm", unit: "m2", fis: 15.40, dts1: 15.92, dts2: 16.34 },
  { name: "GIB Aqualine 13mm", unit: "m2", fis: 21.14, dts1: 21.86, dts2: 22.44 },
] as const;

function rowEvidence(name: string) {
  const locator = "page:1";
  return [
    `supplierDescription|found|0.99|source-1|${locator}|${name}`,
    "supplierSku|missing|0|source-1||",
    `materialName|found|0.99|source-1|${locator}|${name}`,
    "materialDescription|missing|0|source-1||",
    `unit|found|0.99|source-1|${locator}|m2`,
    "packQuantity|missing|0|source-1||",
    "packUnit|missing|0|source-1||",
    `priceRecommendation|inferred|0.9|source-1|${locator}|FIS is the primary source column`,
  ];
}

function price(key: "fis" | "dts1" | "dts2", amount: number, name: string) {
  const label = key.toUpperCase();
  return {
    key,
    label: `${label} Price`,
    amount,
    currency: "NZD",
    effectiveFrom: "2026-03-01",
    validTo: "2026-11-01",
    evidence: [
      `label|found|0.99|source-1|page:1|${label} PRICE`,
      `amount|found|0.99|source-1|page:1|${name} ${amount.toFixed(2)}`,
      "currency|inferred|0.9|source-1|page:1|NZD supplier price list",
      "effectiveFrom|found|0.99|source-1|page:1|Effective 1 March 2026",
      "validTo|found|0.99|source-1|page:1|Valid to 1 November 2026",
    ],
  };
}

export function tradeDirectGib2026StructuredResponse() {
  return {
    contractVersion: "material_supplier_pricing_v1",
    docTitle: "Metro 2026 GIB Plasterboard full Pricing",
    docSupplier: "Trade Direct",
    docCurrency: "NZD",
    docEffectiveFrom: "2026-03-01",
    docValidTo: "2026-11-01",
    documentEvidence: [
      "docTitle|found|0.99|source-1|page:1|Metro 2026 GIB Plasterboard full Pricing",
      "docSupplier|inferred|0.9|source-1|page:1|Trade Direct",
      "docCurrency|inferred|0.9|source-1|page:1|NZD",
      "docEffectiveFrom|found|0.99|source-1|page:1|Effective 1 March 2026",
      "docValidTo|found|0.99|source-1|page:1|Valid to 1 November 2026",
    ],
    rows: TRADE_DIRECT_GIB_2026_EXPECTED.map((expected, index) => ({
      rowKey: `gib-${index + 1}`,
      supplierDescription: expected.name,
      supplierSku: "",
      materialName: expected.name,
      materialDescription: "",
      unit: expected.unit,
      packQuantity: 0,
      packUnit: "",
      evidence: rowEvidence(expected.name),
      prices: [
        price("fis", expected.fis, expected.name),
        price("dts1", expected.dts1, expected.name),
        price("dts2", expected.dts2, expected.name),
      ],
      recommendationKey: "fis",
      recommendationReason: "FIS is intentionally selected as the primary review price; DTS1 and DTS2 remain selectable alternatives.",
      recommendationConfidence: 0.9,
      warnings: [],
    })),
    warnings: [],
    method: "pdf",
    partial: false,
  };
}
