import type { PhysicalEvidence } from "@/lib/materials/physical-quantity/types";
import { parseDimensionTuples } from "@/lib/materials/physical-quantity/parse-dimension-tuples";
import { parsePhysicalQuantities } from "@/lib/materials/physical-quantity/parse-physical-quantities";
import { normalizeMaterialUnitAlias, PACKAGING_UNITS } from "@/lib/materials/physical-quantity/units";

function matches(candidates: number[], ratio: number) {
  return candidates.some((candidate) => Math.abs(candidate - ratio) <= Math.max(0.000001, Math.abs(candidate) * 0.001));
}

export function physicalEvidenceSupportsRelationship(input: {
  requestedMaterialUnit: string;
  supplierQuantity: number;
  materialQuantity: number;
  evidence: PhysicalEvidence[];
}) {
  const target = normalizeMaterialUnitAlias(input.requestedMaterialUnit);
  const ratio = input.materialQuantity / input.supplierQuantity;
  const quantities = parsePhysicalQuantities(input.evidence);
  const tuples = parseDimensionTuples(input.evidence).filter((tuple) => !tuple.ambiguous && tuple.normalizedValues);

  if (target === "m2") {
    const tupleAreas = tuples.filter((tuple) => tuple.normalizedValues!.length === 2)
      .map((tuple) => tuple.normalizedValues!.reduce((product, value) => product * value, 1));
    return matches([...quantities.areas.map((quantity) => quantity.value), ...tupleAreas], ratio);
  }
  if (target === "m3") {
    const tupleVolumes = tuples.filter((tuple) => tuple.normalizedValues!.length === 3)
      .map((tuple) => tuple.normalizedValues!.reduce((product, value) => product * value, 1));
    return matches([...quantities.volumes.map((quantity) => quantity.value), ...tupleVolumes], ratio);
  }
  if (target === "m" || target === "lm") return matches(quantities.lengths.map((quantity) => quantity.value), ratio);
  if (target === "kg") return matches(quantities.masses.map((quantity) => quantity.value), ratio);
  if (PACKAGING_UNITS.has(target)) {
    return matches(quantities.counts.filter((quantity) => quantity.unit === target).map((quantity) => quantity.value), ratio);
  }
  return false;
}
