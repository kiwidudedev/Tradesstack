export type TakeoffUnitSystem = "metric" | "imperial";
export type TakeoffBaseUnit = "mm" | "in";
export type TakeoffDisplayUnit = "mm" | "cm" | "m" | "in" | "ft";
export type TakeoffAreaDisplayUnit = `${TakeoffDisplayUnit}²`;

const UNIT_DEFINITIONS: Record<
  TakeoffDisplayUnit,
  { unitSystem: TakeoffUnitSystem; baseUnit: TakeoffBaseUnit; lengthToBaseFactor: number }
> = {
  mm: { unitSystem: "metric", baseUnit: "mm", lengthToBaseFactor: 1 },
  cm: { unitSystem: "metric", baseUnit: "mm", lengthToBaseFactor: 10 },
  m: { unitSystem: "metric", baseUnit: "mm", lengthToBaseFactor: 1000 },
  in: { unitSystem: "imperial", baseUnit: "in", lengthToBaseFactor: 1 },
  ft: { unitSystem: "imperial", baseUnit: "in", lengthToBaseFactor: 12 },
};

export const TAKEOFF_DISPLAY_UNITS = Object.freeze(
  Object.keys(UNIT_DEFINITIONS) as TakeoffDisplayUnit[]
);

export function isTakeoffDisplayUnit(value: string): value is TakeoffDisplayUnit {
  return Object.prototype.hasOwnProperty.call(UNIT_DEFINITIONS, value);
}

export function getTakeoffUnitDefinition(displayUnit: TakeoffDisplayUnit) {
  return UNIT_DEFINITIONS[displayUnit];
}

export function inferTakeoffUnitSystem(displayUnit: TakeoffDisplayUnit): TakeoffUnitSystem {
  return UNIT_DEFINITIONS[displayUnit].unitSystem;
}

export function getTakeoffBaseUnit(unitSystem: TakeoffUnitSystem): TakeoffBaseUnit {
  return unitSystem === "metric" ? "mm" : "in";
}

export function assertTakeoffUnitConsistency(params: {
  displayUnit: string;
  unitSystem: TakeoffUnitSystem;
}): TakeoffDisplayUnit {
  const normalized = params.displayUnit.trim().toLowerCase();
  if (!isTakeoffDisplayUnit(normalized)) {
    throw new Error("Choose a valid calibration display unit.");
  }

  if (UNIT_DEFINITIONS[normalized].unitSystem !== params.unitSystem) {
    throw new Error("Calibration display unit and unit system do not match.");
  }

  return normalized;
}

export function convertTakeoffDisplayLengthToBase(params: {
  displayUnit: TakeoffDisplayUnit;
  value: number;
}): number {
  if (!Number.isFinite(params.value) || params.value <= 0) {
    throw new Error("Reference length must be greater than zero.");
  }

  return params.value * UNIT_DEFINITIONS[params.displayUnit].lengthToBaseFactor;
}

export function convertTakeoffBaseLengthToDisplay(params: {
  baseUnit: TakeoffBaseUnit;
  displayUnit: TakeoffDisplayUnit;
  value: number;
}): number {
  const definition = UNIT_DEFINITIONS[params.displayUnit];
  if (definition.baseUnit !== params.baseUnit) {
    throw new Error("Unable to convert length across unit systems.");
  }

  return params.value / definition.lengthToBaseFactor;
}

export function convertTakeoffDisplayAreaToBase(params: {
  displayUnit: TakeoffDisplayUnit;
  value: number;
}): number {
  const factor = UNIT_DEFINITIONS[params.displayUnit].lengthToBaseFactor;
  return params.value * factor * factor;
}

export function convertTakeoffBaseAreaToDisplay(params: {
  baseUnit: TakeoffBaseUnit;
  displayUnit: TakeoffDisplayUnit;
  value: number;
}): number {
  const definition = UNIT_DEFINITIONS[params.displayUnit];
  if (definition.baseUnit !== params.baseUnit) {
    throw new Error("Unable to convert area across unit systems.");
  }

  return params.value / (definition.lengthToBaseFactor * definition.lengthToBaseFactor);
}

export function parseTakeoffMeasurementDisplayUnit(unit: string | null): {
  displayUnit: TakeoffDisplayUnit;
  dimension: "length" | "area";
} | null {
  const normalized = unit?.trim().toLowerCase() ?? "";
  const isArea = normalized.endsWith("²") || normalized.endsWith("2");
  const linearUnit = isArea ? normalized.replace(/(?:²|2)$/, "") : normalized;
  if (!isTakeoffDisplayUnit(linearUnit)) {
    return null;
  }

  return { displayUnit: linearUnit, dimension: isArea ? "area" : "length" };
}
