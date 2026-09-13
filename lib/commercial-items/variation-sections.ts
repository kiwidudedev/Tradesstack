export const VARIATION_COST_SECTIONS = [
  "Labour",
  "Materials",
  "Subcontractors",
  "Plant",
  "Margin",
] as const;

export type VariationCostSection = typeof VARIATION_COST_SECTIONS[number];

export const DEFAULT_VARIATION_COST_SECTION: VariationCostSection = "Labour";
