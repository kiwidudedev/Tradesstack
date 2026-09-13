import type { TakeoffCalibration } from "@/lib/takeoff-server";
import {
  convertTakeoffBaseLengthToDisplay,
  isTakeoffDisplayUnit,
} from "@/lib/takeoff/units";

export const DEFAULT_TAKEOFF_MEASUREMENT_COLORS = {
  line: "#F15A29",
  area: "#0F766E",
  count: "#2563EB",
} as const;

export function resolveTakeoffMeasurementColor(
  colorHex: string | null | undefined,
  kind: keyof typeof DEFAULT_TAKEOFF_MEASUREMENT_COLORS,
): string {
  return colorHex?.trim() || DEFAULT_TAKEOFF_MEASUREMENT_COLORS[kind];
}

function formatCompactDecimal(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatQuantityValue(value: number | null, unit: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not calculated";
  }

  const rounded = formatCompactDecimal(value);
  return unit ? `${rounded} ${unit}` : rounded;
}

export function formatCountValue(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0 count";
  }

  return `${Math.round(value)} count`;
}

export function convertBaseLengthToDisplayValue(params: {
  baseUnit: string;
  displayUnit: string;
  value: number;
}): number | null {
  if (!Number.isFinite(params.value)) {
    return null;
  }

  if ((params.baseUnit !== "mm" && params.baseUnit !== "in") || !isTakeoffDisplayUnit(params.displayUnit)) {
    return null;
  }

  try {
    return convertTakeoffBaseLengthToDisplay({
      baseUnit: params.baseUnit,
      displayUnit: params.displayUnit,
      value: params.value,
    });
  } catch {
    return null;
  }
}

export function formatAreaPerimeterDisplay(params: {
  measuredPerimeterBase: number | null;
  activeCalibration: TakeoffCalibration | null;
}): string | null {
  const { measuredPerimeterBase, activeCalibration } = params;
  if (measuredPerimeterBase === null || !activeCalibration) {
    return null;
  }

  const displayValue = convertBaseLengthToDisplayValue({
    baseUnit: activeCalibration.base_unit,
    displayUnit: activeCalibration.display_unit,
    value: measuredPerimeterBase,
  });

  if (displayValue === null) {
    return null;
  }

  return `Perimeter ${formatQuantityValue(displayValue, activeCalibration.display_unit)}`;
}
