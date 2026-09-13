import type { OrganizationMaterialRow } from "@/lib/materials/types";
import type {
  MaterialUnitConversionContext,
  MaterialUnitConversionEvidence,
} from "@/lib/materials/unit-conversion/contract";

const DIMENSION_METADATA_KEYS = new Set([
  "area", "dimensions", "dimension", "height", "length", "mass",
  "pack_count", "pack_quantity", "pack_size", "thickness", "volume", "weight", "width",
]);

function text(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function addEvidence(
  result: MaterialUnitConversionEvidence[],
  evidence: MaterialUnitConversionEvidence,
) {
  const normalizedText = evidence.text.trim();
  if (!normalizedText || result.some((entry) => entry.id === evidence.id)) return;
  result.push({ ...evidence, text: normalizedText.slice(0, 1000) });
}

function addAllowlistedObjectEvidence(
  result: MaterialUnitConversionEvidence[],
  prefix: string,
  value: unknown,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, raw] of Object.entries(value)) {
    if (!DIMENSION_METADATA_KEYS.has(key.toLowerCase())) continue;
    const valueText = text(raw) ?? (Array.isArray(raw) ? raw.map(text).filter(Boolean).join(", ") : null);
    if (!valueText) continue;
    addEvidence(result, {
      id: `${prefix}.${key}`,
      source: "selected_material_context",
      text: valueText,
    });
  }
}

export function addSelectedMaterialEvidence(
  context: MaterialUnitConversionContext,
  material: OrganizationMaterialRow | null,
): MaterialUnitConversionContext {
  if (!material) return context;
  const evidence = [...context.evidence];
  addEvidence(evidence, {
    id: "selected_material.name",
    source: "selected_material_context",
    text: material.name,
  });
  if (material.description) {
    addEvidence(evidence, {
      id: "selected_material.description",
      source: "selected_material_context",
      text: material.description,
    });
  }
  addEvidence(evidence, {
    id: "selected_material.default_unit",
    source: "selected_material_context",
    text: material.default_unit,
  });
  if (material.category) {
    addEvidence(evidence, {
      id: "selected_material.category",
      source: "selected_material_context",
      text: material.category,
    });
  }
  addAllowlistedObjectEvidence(evidence, "selected_material.metadata", material.metadata);
  addAllowlistedObjectEvidence(
    evidence,
    "selected_material.construction_intelligence",
    material.ai_construction_intelligence,
  );
  return { ...context, evidence };
}
