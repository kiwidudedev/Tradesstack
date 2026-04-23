import type { TakeoffCalibration } from "@/lib/takeoff-server";

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

  if (params.baseUnit === "mm") {
    if (params.displayUnit === "mm") {
      return params.value;
    }

    if (params.displayUnit === "cm") {
      return params.value / 10;
    }

    if (params.displayUnit === "m") {
      return params.value / 1000;
    }
  }

  if (params.baseUnit === "in") {
    if (params.displayUnit === "in") {
      return params.value;
    }

    if (params.displayUnit === "ft") {
      return params.value / 12;
    }
  }

  return null;
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
