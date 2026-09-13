export const MATERIAL_UNIT_CONVERSION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion", "status", "supplierUnit", "requestedMaterialUnit",
    "supplierQuantity", "materialQuantity", "convertedUnitCost", "currency",
    "basis", "evidenceRefs", "evidenceSummary", "explanation",
    "missingInformation", "confidence",
  ],
  properties: {
    contractVersion: { type: "string", enum: ["material_unit_conversion_v2"] },
    status: { type: "string", enum: ["convertible", "needs_information", "not_convertible"] },
    supplierUnit: { type: "string" },
    requestedMaterialUnit: { type: "string" },
    supplierQuantity: { anyOf: [{ type: "number" }, { type: "null" }] },
    materialQuantity: { anyOf: [{ type: "number" }, { type: "null" }] },
    convertedUnitCost: { anyOf: [{ type: "number" }, { type: "null" }] },
    currency: { anyOf: [{ type: "string" }, { type: "null" }] },
    basis: {
      anyOf: [
        { type: "string", enum: ["supplier_source", "selected_material_context", "user_supplied_context", "combined_context"] },
        { type: "null" },
      ],
    },
    evidenceRefs: { type: "array", items: { type: "string" } },
    evidenceSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
    explanation: { anyOf: [{ type: "string" }, { type: "null" }] },
    missingInformation: { type: "array", items: { type: "string" } },
    confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
  },
};
