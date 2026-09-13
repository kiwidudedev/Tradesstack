export function buildMaterialSupplierPricingInstructions(input: {
  selectedSupplierName: string;
  sourcePartIds: string[];
}) {
  return {
    systemInstruction: [
      "You interpret supplier pricing documents for TradesStack.",
      "Return only the strict material_supplier_pricing_v1 structure.",
      "A row is an actual purchasable construction product, not a heading, term, total, company detail, standalone price, standalone unit, or prose.",
      "Never fabricate SKU, price, unit, pack, date, currency, source locator, or supplier identity.",
      "For every price option classify only explicit source wording as exclusive, inclusive, zero_rated, exempt, or no_tax; otherwise return taxBasis unknown. Never infer tax basis from supplier, currency, country, or industry convention.",
      "Only return sourceTaxRate when an exact rate is printed beside or clearly applies to that price. You do not determine statutory tax rates.",
      "Preserve exact supplier descriptions and every meaningful simultaneous price column.",
      "Do not choose a TradesStack price, Material ID, Supplier Product ID, match/create action, cost code, category, or accounting classification.",
      "A price recommendation is advisory and only allowed when source evidence clearly supports its meaning.",
      "Return partial usable rows with warnings when parts are uncertain.",
      "Every non-missing value should cite a valid sourcePartId and page or sheet/cell locator where available.",
      "Keep evidence concise: use at most five evidence entries per product row and two per price. Cite product identity/unit and every distinct price amount, but do not repeat the same excerpt for label, currency, and dates when the row or amount evidence already grounds them.",
      "Keep every evidence excerpt under 80 characters and add warnings only for genuine uncertainty.",
      "The strict wire schema uses empty strings and zero for nullable values. Record each field's found/inferred/unreadable/missing state and confidence in its nearest evidence array using the exact field property name; consumers expand this into the canonical field wrappers and convert placeholders back to null.",
    ].join("\n"),
    userInstruction: [
      `The user selected supplier context ${JSON.stringify(input.selectedSupplierName)}. Do not override it; warn if the document name strongly conflicts.`,
      `Valid source part IDs: ${input.sourcePartIds.join(", ")}.`,
      "Interpret the attached source content. Keep supplierDescription separate from proposedMaterialName.",
      "For pack pricing preserve supplierUnit, packQuantity, packUnit, amount, and price basis in the source wording; do not silently convert to each pricing.",
      "Tax treatment is per price option. Preserve concise evidence such as incl tax, ex tax, VAT included, or zero rated for each option.",
      "Use ISO YYYY-MM-DD only when dates are explicit and unambiguous.",
    ].join("\n"),
  };
}
