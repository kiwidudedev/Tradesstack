import type { PhysicalEvidence, PhysicalQuantity } from "@/lib/materials/physical-quantity/types";
import { massToKilograms, normalizeMaterialUnitAlias } from "@/lib/materials/physical-quantity/units";

function collect(evidence: PhysicalEvidence[], pattern: RegExp, build: (value: number, unit: string, evidenceRef: string) => PhysicalQuantity | null) {
  const result: PhysicalQuantity[] = [];
  for (const item of evidence) {
    for (const match of item.text.matchAll(pattern)) {
      const quantity = build(Number(match[1]), match[2] ?? "", item.id);
      if (quantity && Number.isFinite(quantity.value) && quantity.value > 0) result.push(quantity);
    }
  }
  return result;
}

export function parsePhysicalQuantities(evidence: PhysicalEvidence[]) {
  const areas = collect(evidence, /(\d+(?:\.\d+)?)\s*(m2|m²|sqm|sq\s*m|square\s+met(?:re|er)s?)/gi,
    (value, _unit, evidenceRef) => ({ value, unit: "m2", dimension: "area", evidenceRef }));
  const volumes = collect(evidence, /(\d+(?:\.\d+)?)\s*(m3|m³|cubic\s+met(?:re|er)s?)/gi,
    (value, _unit, evidenceRef) => ({ value, unit: "m3", dimension: "volume", evidenceRef }));
  const masses = collect(evidence, /(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|tonnes?|tons?|t)\b/gi,
    (value, unit, evidenceRef) => {
      const normalized = massToKilograms(value, unit);
      return normalized === null ? null : { value: normalized, unit: "kg", dimension: "mass", evidenceRef };
    });
  const lengths = collect(evidence, /(\d+(?:\.\d+)?)\s*(mm|cm|m|metres?|meters?)\b/gi,
    (value, unit, evidenceRef) => {
      const normalizedUnit = normalizeMaterialUnitAlias(unit.startsWith("met") ? "m" : unit);
      const factor = normalizedUnit === "mm" ? 0.001 : normalizedUnit === "cm" ? 0.01 : 1;
      return { value: value * factor, unit: "m", dimension: "length", evidenceRef };
    });
  const counts = collect(evidence,
    /(\d+(?:\.\d+)?)\s*(each|items?|pcs?|pieces?|units?|sheets?|shts?|boxes?|packs?|rolls?|bags?|pallets?|cartons?)\b/gi,
    (value, unit, evidenceRef) => ({ value, unit: normalizeMaterialUnitAlias(unit), dimension: "count", evidenceRef }));
  return { areas, volumes, masses, lengths, counts };
}
