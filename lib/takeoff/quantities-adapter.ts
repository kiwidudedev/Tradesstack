import type { TakeoffCalibration, TakeoffMeasurementWithPoints } from "@/lib/takeoff-server";
import { formatAreaPerimeterDisplay, formatCountValue, formatQuantityValue } from "@/lib/takeoff/measurement-display";

export interface QuantityRow {
  id: string;
  measurementId: string;
  status: "active" | "archived";
  name: string;
  description: string;
  colorHex: string | null;
  measurementKind: "line" | "area" | "count";
  typeLabel: "Distance" | "Linear" | "Area" | "Count";
  itemCount: number;
  unit: string;
  totalValue: number | null;
  totalDisplay: string;
  secondaryDisplay: string | null;
  groupKey: "all";
  sortKey: string;
}

function getMeasurementFallbackLabel(params: {
  measurementKind: "line" | "area" | "count";
  isPolyline: boolean;
}) {
  if (params.measurementKind === "area") {
    return "Area";
  }

  if (params.measurementKind === "count") {
    return "Count";
  }

  return params.isPolyline ? "Linear" : "Distance";
}

export function mapTakeoffToQuantityRows(
  measurements: TakeoffMeasurementWithPoints[],
  activeCalibration: TakeoffCalibration | null,
  options?: {
    pageLabel?: string | null;
    includePageLabelInDescription?: boolean;
  }
): QuantityRow[] {
  return measurements
    .filter(
      (measurement): measurement is TakeoffMeasurementWithPoints & { status: "active" | "archived" } =>
        measurement.measurement_kind === "line" ||
        measurement.measurement_kind === "area" ||
        measurement.measurement_kind === "count"
    )
    .map((measurement, index) => {
      const isPolyline =
        measurement.measurement_kind === "line" &&
        (measurement.line_paths.length > 0 || measurement.points.length > 2);
      const typeLabel =
        measurement.measurement_kind === "count"
          ? "Count"
          : measurement.measurement_kind === "area"
            ? "Area"
            : isPolyline
              ? "Linear"
              : "Distance";
      const itemCount =
        measurement.measurement_kind === "count"
          ? measurement.points.length
          : measurement.measurement_kind === "area"
            ? measurement.area_shapes.length || 1
            : isPolyline
              ? measurement.line_paths.length || 1
              : 1;
      const unit = measurement.measurement_kind === "count" ? "count" : measurement.display_unit?.trim() || "—";
      const totalValue =
        measurement.measurement_kind === "count"
          ? (measurement.count_value ?? measurement.display_value ?? null)
          : measurement.display_value;
      const totalDisplay =
        measurement.measurement_kind === "count"
          ? formatCountValue(totalValue)
          : formatQuantityValue(totalValue, measurement.display_unit?.trim() || null);
      const secondaryDisplay =
        measurement.measurement_kind === "area"
          ? formatAreaPerimeterDisplay({
              measuredPerimeterBase: measurement.measured_perimeter_base,
              activeCalibration,
            })
          : null;

      return {
        id: measurement.id,
        measurementId: measurement.id,
        status: measurement.status === "archived" ? "archived" : "active",
        name: measurement.name.trim() || getMeasurementFallbackLabel({
          measurementKind: measurement.measurement_kind,
          isPolyline,
        }),
        description: [
          options?.includePageLabelInDescription && options?.pageLabel ? options.pageLabel.trim() : "",
          measurement.description.trim(),
        ]
          .filter((value) => value.length > 0)
          .join(" • "),
        colorHex: measurement.color_hex?.trim() || null,
        measurementKind: measurement.measurement_kind,
        typeLabel,
        itemCount,
        unit,
        totalValue,
        totalDisplay,
        secondaryDisplay,
        groupKey: "all",
        sortKey: String(index).padStart(6, "0"),
      };
    });
}
