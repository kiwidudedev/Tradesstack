import type { MaterialUnitConversionContext } from "@/lib/materials/unit-conversion/contract";

export function buildMaterialUnitConversionInstructions(context: MaterialUnitConversionContext) {
  return {
    systemInstruction: [
      "You interpret a product-specific supplier-unit to Material-unit relationship for TradesStack.",
      "Return only the strict material_unit_conversion_v2 structure.",
      "Preserve the supplied supplierUnit and requestedMaterialUnit exactly as supplied.",
      "A convertible result expresses supplierQuantity supplierUnit = materialQuantity requestedMaterialUnit.",
      "You may use facts explicitly present in supplier_source, selected_material_context, and user_supplied_context evidence.",
      "You may normalize units and mathematically derive length, area, count, or mass relationships from explicitly supplied facts.",
      "Never assume standard dimensions, common sheet sizes, pack sizes, densities, weights, lengths, widths, areas, or quantities that are not supplied.",
      "For convertible, cite only evidenceRefs actually used and provide a concise evidenceSummary without chain-of-thought.",
      "Copy evidenceRefs exactly from the supplied evidence IDs; never invent, paraphrase, or derive an evidence ID.",
      "Set basis from the cited evidence sources: one source uses its exact source name, while multiple source types use combined_context.",
      "Return convertedUnitCost using the exact arithmetic result rather than rounding to display precision.",
      "For needs_information, name the missing physical fact, keep missingInformation non-empty, and return null supplierQuantity, materialQuantity, and convertedUnitCost.",
      "If the relationship is incompatible or unsafe, return not_convertible.",
      "Do not choose database records, persist anything, make an approval decision, or expose private reasoning.",
    ].join("\n"),
    userInstruction: JSON.stringify({
      task: "Propose a supplier-product-specific unit conversion for user review.",
      ...context,
    }),
  };
}
