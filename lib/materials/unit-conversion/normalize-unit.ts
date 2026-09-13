import { normalizeMaterialUnitAlias } from "@/lib/materials/physical-quantity/units";

export function normalizeMaterialConversionUnit(value: string | null | undefined) {
  return normalizeMaterialUnitAlias(value);
}

export function materialConversionUnitsEqual(
  left: string | null | undefined,
  right: string | null | undefined
) {
  const normalizedLeft = normalizeMaterialConversionUnit(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeMaterialConversionUnit(right);
}
