import type { TakeoffCalibration, TakeoffMeasurementWithPoints } from "@/lib/takeoff-server";
import { formatAreaPerimeterDisplay, formatCountValue, formatQuantityValue } from "@/lib/takeoff/measurement-display";

export interface QuantityTableRow {
  id: string;
  measurementId: string;
  drawingSetId: string;
  pageId: string;
  pageLabel: string;
  pageNumber: number;
  name: string;
  description: string | null;
  colorHex: string | null;
  typeLabel: "Area" | "Linear" | "Count";
  unitLabel: "m²" | "m" | "count";
  quantityValue: number | null;
  quantityDisplay: string;
  secondaryQuantityValue: number | null;
  secondaryUnitLabel: string | null;
  secondaryQuantityDisplay: string;
  status: "active" | "archived";
  viewHref: string;
}

function getMeasurementFallbackLabel(params: {
  measurementKind: "line" | "area" | "count";
}) {
  if (params.measurementKind === "area") {
    return "Area";
  }

  if (params.measurementKind === "count") {
    return "Count";
  }

  return "Linear";
}

export function mapTakeoffToQuantityRows(
  measurements: TakeoffMeasurementWithPoints[],
  activeCalibration: TakeoffCalibration | null,
  options: {
    drawingSetId: string;
    opportunityId: string;
    pageId: string;
    pageLabel: string;
    pageNumber: number;
  }
): QuantityTableRow[] {
  return measurements
    .filter(
      (measurement): measurement is TakeoffMeasurementWithPoints & { status: "active" | "archived" } =>
        measurement.measurement_kind === "line" ||
        measurement.measurement_kind === "area" ||
        measurement.measurement_kind === "count"
    )
    .map((measurement) => {
      const typeLabel =
        measurement.measurement_kind === "count"
          ? "Count"
          : measurement.measurement_kind === "area"
            ? "Area"
            : "Linear";
      const unitLabel =
        measurement.measurement_kind === "count"
          ? "count"
          : measurement.measurement_kind === "area"
            ? "m²"
            : "m";
      const quantityValue =
        measurement.measurement_kind === "count"
          ? (measurement.count_value ?? measurement.display_value ?? null)
          : measurement.display_value;
      const quantityDisplay =
        measurement.measurement_kind === "count"
          ? formatCountValue(quantityValue)
          : formatQuantityValue(measurement.display_value, measurement.display_unit?.trim() || null);
      const secondaryQuantityDisplay =
        measurement.measurement_kind === "area"
          ? formatAreaPerimeterDisplay({
              measuredPerimeterBase: measurement.measured_perimeter_base,
              activeCalibration,
            }) ?? "—"
          : "—";
      const secondaryQuantityValue =
        measurement.measurement_kind === "area" && activeCalibration && measurement.measured_perimeter_base !== null
          ? (
              activeCalibration.base_unit === "mm" && activeCalibration.display_unit === "m"
                ? measurement.measured_perimeter_base / 1000
                : activeCalibration.base_unit === "mm" && activeCalibration.display_unit === "cm"
                  ? measurement.measured_perimeter_base / 10
                  : activeCalibration.base_unit === "mm" && activeCalibration.display_unit === "mm"
                    ? measurement.measured_perimeter_base
                    : activeCalibration.base_unit === "in" && activeCalibration.display_unit === "ft"
                      ? measurement.measured_perimeter_base / 12
                      : activeCalibration.base_unit === "in" && activeCalibration.display_unit === "in"
                        ? measurement.measured_perimeter_base
                        : null
            )
          : null;
      const secondaryUnitLabel =
        measurement.measurement_kind === "area"
          ? activeCalibration?.display_unit ?? null
          : null;

      return {
        id: measurement.id,
        measurementId: measurement.id,
        drawingSetId: options.drawingSetId,
        pageId: options.pageId,
        pageLabel: options.pageLabel,
        pageNumber: options.pageNumber,
        name: measurement.name.trim() || getMeasurementFallbackLabel({
          measurementKind: measurement.measurement_kind,
        }),
        description: measurement.description.trim() || null,
        colorHex: measurement.color_hex?.trim() || null,
        typeLabel,
        unitLabel,
        quantityValue,
        quantityDisplay,
        secondaryQuantityValue,
        secondaryUnitLabel,
        secondaryQuantityDisplay,
        status: measurement.status === "archived" ? "archived" : "active",
        viewHref: `/app/leads-clients/opportunities/${options.opportunityId}/takeoff/measure?drawingSetId=${encodeURIComponent(options.drawingSetId)}&pageId=${encodeURIComponent(options.pageId)}&measurementId=${encodeURIComponent(measurement.id)}`,
      };
    });
}
