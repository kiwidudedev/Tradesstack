import type { DimensionTuple, PhysicalEvidence } from "@/lib/materials/physical-quantity/types";
import { lengthToMetres, normalizeMaterialUnitAlias } from "@/lib/materials/physical-quantity/units";

const COMPONENT = String.raw`\d+(?:\.\d+)?\s*(?:mm|cm|m)?`;
const TUPLE_PATTERN = new RegExp(`(${COMPONENT})\\s*[x×]\\s*(${COMPONENT})(?:\\s*[x×]\\s*(${COMPONENT}))?`, "gi");
const COMPONENT_PATTERN = /^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/i;

function parseComponent(value: string) {
  const match = value.trim().match(COMPONENT_PATTERN);
  if (!match) return null;
  return { value: Number(match[1]), unit: match[2] ? normalizeMaterialUnitAlias(match[2]) : null };
}

function ambiguousSharedUnit(values: number[], unit: string) {
  // Construction notation such as 90 x 45 x 6.0m commonly mixes a section
  // size with a length. Preserve the explicit 6m fact, but do not claim that
  // 90 and 45 are metres. Millimetre/centimetre suffixes remain syntactically
  // safe shared units, as do two-value tuples such as 3.0 x 1.2m.
  return values.length === 3 && unit === "m" && values.slice(0, -1).some((value) => value >= 10);
}

export function parseDimensionTuples(evidence: PhysicalEvidence[]): DimensionTuple[] {
  const tuples: DimensionTuple[] = [];
  for (const item of evidence) {
    for (const match of item.text.matchAll(TUPLE_PATTERN)) {
      const components = [match[1], match[2], match[3]].filter((value): value is string => Boolean(value)).map(parseComponent);
      if (components.some((component) => !component)) continue;
      const parsed = components as Array<{ value: number; unit: string | null }>;
      const values = parsed.map((component) => component.value);
      const originalUnits = parsed.map((component) => component.unit);
      let units = [...originalUnits];
      let propagation: DimensionTuple["propagation"] = units.every(Boolean) ? "explicit" : "none";
      let ambiguous = false;

      const trailingUnit = units.at(-1);
      if (trailingUnit && units.slice(0, -1).every((unit) => unit === null)) {
        ambiguous = ambiguousSharedUnit(values, trailingUnit);
        if (!ambiguous) {
          units = units.map(() => trailingUnit);
          propagation = "shared_trailing";
        }
      } else if (units.some(Boolean) && !units.every(Boolean)) {
        ambiguous = true;
      }

      const normalizedValues = !ambiguous && units.every(Boolean)
        ? units.map((unit, index) => lengthToMetres(values[index]!, unit!))
        : null;
      tuples.push({
        values,
        units: originalUnits,
        normalizedValues: normalizedValues?.every((value) => value !== null) ? normalizedValues as number[] : null,
        normalizedUnit: normalizedValues?.every((value) => value !== null) ? "m" : null,
        propagation,
        evidenceRef: item.id,
        sourceText: match[0],
        ambiguous,
      });
    }
  }
  return tuples;
}
