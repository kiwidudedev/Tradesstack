export type MaterialPricingSemanticFixture = {
  id: string;
  sourceKind: "pdf" | "spreadsheet" | "csv" | "image";
  sourceText: string;
  expectedProductRows: number;
  expectedPriceCounts: number[];
  note: string;
};

export const MATERIAL_PRICING_SEMANTIC_FIXTURES: MaterialPricingSemanticFixture[] = [
  { id: "gib-fis-dts1", sourceKind: "pdf", sourceText: "GIB Standard 10mm | GB10 | m2 | FIS 12.30 | DTS1 11.80", expectedProductRows: 1, expectedPriceCounts: [2], note: "Preserve both GIB price relationships; never collapse columns." },
  { id: "pdf-simple-list", sourceKind: "pdf", sourceText: "Timber H1.2 90x45 | SKU T9045 | lm | $4.85", expectedProductRows: 1, expectedPriceCounts: [1], note: "Simple born-digital PDF." },
  { id: "pdf-page-heading", sourceKind: "pdf", sourceText: "PLASTERBOARD\nTerms and conditions\nGIB Aqualine 13mm | AQ13 | sheet | 42.00", expectedProductRows: 1, expectedPriceCounts: [1], note: "Heading and terms are not products." },
  { id: "pdf-pack-price", sourceKind: "pdf", sourceText: "Framing nails 90mm | N90 | box 3000 | 189.00", expectedProductRows: 1, expectedPriceCounts: [1], note: "Retain pack quantity and basis." },
  { id: "pdf-effective-dates", sourceKind: "pdf", sourceText: "Valid 1 Aug 2026–31 Aug 2026\nCement 20kg | CEM20 | bag | 14.90", expectedProductRows: 1, expectedPriceCounts: [1], note: "Document and row effective dates." },
  { id: "pdf-repeated-header", sourceKind: "pdf", sourceText: "SKU DESCRIPTION UNIT PRICE\nA1 Adhesive 4L ea 35\nSKU DESCRIPTION UNIT PRICE\nB1 Sealer 4L ea 29", expectedProductRows: 2, expectedPriceCounts: [1, 1], note: "Repeated page header ignored." },
  { id: "pdf-standalone-price", sourceKind: "pdf", sourceText: "$19.95\nDELIVERY INFORMATION", expectedProductRows: 0, expectedPriceCounts: [], note: "Standalone price is not a product." },
  { id: "pdf-missing-unit", sourceKind: "pdf", sourceText: "Flexible flashing tape | FFT100 | 79.50", expectedProductRows: 1, expectedPriceCounts: [1], note: "Missing unit remains missing." },
  { id: "csv-basic", sourceKind: "csv", sourceText: "sku,description,unit,price\nS1,Screws 50mm,box,22.40", expectedProductRows: 1, expectedPriceCounts: [1], note: "Basic CSV." },
  { id: "csv-quoted-multiline", sourceKind: "csv", sourceText: "sku,description,price\nP1,\"Primer, interior\nlow VOC\",56.00", expectedProductRows: 1, expectedPriceCounts: [1], note: "Quoted comma and newline." },
  { id: "csv-multiple-prices", sourceKind: "csv", sourceText: "sku,description,list,trade\nB1,Board,32,27", expectedProductRows: 1, expectedPriceCounts: [2], note: "Every meaningful simultaneous price column." },
  { id: "csv-empty-lines", sourceKind: "csv", sourceText: "sku,description,price\n\n\nM1,Mortar,18", expectedProductRows: 1, expectedPriceCounts: [1], note: "Blank records ignored." },
  { id: "xlsx-merged-category", sourceKind: "spreadsheet", sourceText: "MERGED A1:D1 ROOFING\nA2=R1 B2=Underlay C2=roll D2=99", expectedProductRows: 1, expectedPriceCounts: [1], note: "Merged category heading is context, not a product." },
  { id: "xlsx-multi-sheet", sourceKind: "spreadsheet", sourceText: "SHEET Timber: T1,Pine,4.2\nSHEET Fixings: F1,Bolt,1.2", expectedProductRows: 2, expectedPriceCounts: [1, 1], note: "All worksheets retained." },
  { id: "xlsx-formula-display", sourceKind: "spreadsheet", sourceText: "A2=P1 B2=Panel C2 formula=COST*1.15 result=23.00", expectedProductRows: 1, expectedPriceCounts: [1], note: "Display result and formula provenance retained." },
  { id: "image-scanned-table", sourceKind: "image", sourceText: "[scan] SKU I1 Insulation R2.6 bale $88", expectedProductRows: 1, expectedPriceCounts: [1], note: "Scanned table via vision." },
  { id: "image-phone-photo", sourceKind: "image", sourceText: "[photo perspective] Sealant 300ml SKU SEAL3 each 12.50", expectedProductRows: 1, expectedPriceCounts: [1], note: "Phone photo via vision." },
  { id: "image-heic-price-list", sourceKind: "image", sourceText: "[HEIC] Drain coil 100mm 20m roll DC100 $145", expectedProductRows: 1, expectedPriceCounts: [1], note: "HEIC is transcoded before vision." },
];
