const encodedEvidence = {
  type: "array",
  items: { type: "string" },
  description: "Entries: field|state|confidence|sourcePartId|locator|short excerpt. State is found, inferred, unreadable, or missing.",
};

const encodedWarnings = {
  type: "array",
  items: { type: "string" },
  description: "Entries: severity|code|message. Severity is info, warning, or error.",
};

export const MATERIAL_SUPPLIER_PRICING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["contractVersion", "docTitle", "docSupplier", "docCurrency", "docEffectiveFrom", "docValidTo", "documentEvidence", "rows", "warnings", "method", "partial"],
  properties: {
    contractVersion: { type: "string", enum: ["material_supplier_pricing_v1"] },
    docTitle: { type: "string" }, docSupplier: { type: "string" }, docCurrency: { type: "string" },
    docEffectiveFrom: { type: "string" }, docValidTo: { type: "string" }, documentEvidence: encodedEvidence,
    rows: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["rowKey", "supplierDescription", "supplierSku", "materialName", "materialDescription", "unit", "packQuantity", "packUnit", "evidence", "prices", "recommendationKey", "recommendationReason", "recommendationConfidence", "warnings"],
        properties: {
          rowKey: { type: "string" }, supplierDescription: { type: "string" }, supplierSku: { type: "string" },
          materialName: { type: "string" }, materialDescription: { type: "string" }, unit: { type: "string" },
          packQuantity: { type: "number" }, packUnit: { type: "string" }, evidence: encodedEvidence,
          prices: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              required: ["key", "label", "amount", "currency", "effectiveFrom", "validTo", "taxBasis", "sourceTaxRate", "evidence"],
              properties: {
                key: { type: "string" }, label: { type: "string" }, amount: { type: "number" }, currency: { type: "string" },
                effectiveFrom: { type: "string" }, validTo: { type: "string" }, evidence: encodedEvidence,
                taxBasis: { type: "string", enum: ["exclusive", "inclusive", "zero_rated", "exempt", "no_tax", "unknown"] },
                sourceTaxRate: { type: "number", description: "Decimal rate explicitly printed by the source, otherwise zero with missing state in evidence." },
              },
            },
          },
          recommendationKey: { type: "string" }, recommendationReason: { type: "string" }, recommendationConfidence: { type: "number" },
          warnings: encodedWarnings,
        },
      },
    },
    warnings: encodedWarnings,
    method: { type: "string", enum: ["pdf", "spreadsheet", "csv", "image", "email"] },
    partial: { type: "boolean" },
  },
};
