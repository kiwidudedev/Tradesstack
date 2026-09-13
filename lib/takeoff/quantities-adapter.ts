import type { TakeoffCalibration, TakeoffMeasurementWithPoints } from "@/lib/takeoff-server";
import { convertBaseLengthToDisplayValue, formatAreaPerimeterDisplay, formatCountValue, formatQuantityValue } from "@/lib/takeoff/measurement-display";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

export interface QuantityTableRow {
  id: string;
  measurementId: string;
  drawingSetId: string;
  drawingDisplayName: string;
  pageId: string;
  pageLabel: string;
  pageNumber: number;
  name: string;
  description: string | null;
  colorHex: string | null;
  typeLabel: "Area" | "Linear" | "Count";
  unitLabel: string;
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
  calibrationsById: ReadonlyMap<string, TakeoffCalibration>,
  options: {
    drawingSetId: string;
    drawingDisplayName?: string;
    opportunityId?: string;
    owner?: TakeoffRouteOwner;
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
      const measurementCalibration = measurement.calibration_id
        ? calibrationsById.get(measurement.calibration_id) ?? null
        : null;
      const displayCalibration = measurementCalibration ?? activeCalibration;
      const typeLabel =
        measurement.measurement_kind === "count"
          ? "Count"
          : measurement.measurement_kind === "area"
            ? "Area"
            : "Linear";
      const unitLabel = measurement.display_unit?.trim() || (measurement.measurement_kind === "count" ? "count" : "");
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
              activeCalibration: displayCalibration,
            }) ?? "—"
          : "—";
      const secondaryQuantityValue =
        measurement.measurement_kind === "area" && displayCalibration && measurement.measured_perimeter_base !== null
          ? convertBaseLengthToDisplayValue({
              baseUnit: displayCalibration.base_unit,
              displayUnit: displayCalibration.display_unit,
              value: measurement.measured_perimeter_base,
            })
          : null;
      const secondaryUnitLabel =
        measurement.measurement_kind === "area"
          ? displayCalibration?.display_unit ?? null
          : null;

      return {
        id: measurement.id,
        measurementId: measurement.id,
        drawingSetId: options.drawingSetId,
        drawingDisplayName: options.drawingDisplayName?.trim() || "Drawing set",
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
        viewHref: buildTakeoffHref(
          options.owner ?? { kind: "opportunity", slug: options.opportunityId ?? "" },
          "measure",
          { drawingSetId: options.drawingSetId, pageId: options.pageId },
        ) + `&measurementId=${encodeURIComponent(measurement.id)}`,
      };
    });
}
