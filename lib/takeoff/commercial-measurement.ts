import { normalizeCommercialQuantity } from "@/lib/commercial-items/precision";

export type CommercialTakeoffMeasurement = {
  id: string;
  measurement_kind: "line" | "area" | "count";
  status: "active" | "archived" | "deleted";
  name: string;
  description: string;
  display_value: number | null;
  display_unit: string | null;
  count_value: number | null;
};

export function isTakeoffMeasurementCommerciallyEligible(
  measurement: Pick<CommercialTakeoffMeasurement, "id" | "measurement_kind" | "status">,
) {
  return !measurement.id.startsWith("temp-")
    && measurement.status === "active"
    && ["line", "area", "count"].includes(measurement.measurement_kind);
}

export function getTakeoffCommercialQuantity(
  measurement: Pick<CommercialTakeoffMeasurement, "measurement_kind" | "count_value" | "display_value">,
) {
  const value = measurement.measurement_kind === "count"
    ? measurement.count_value ?? measurement.display_value
    : measurement.display_value;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("This measurement does not have a valid committed quantity.");
  }

  return normalizeCommercialQuantity(value);
}

export function getTakeoffCommercialDescription(
  measurement: Pick<CommercialTakeoffMeasurement, "description" | "name">,
) {
  return measurement.name.trim() || measurement.description?.trim() || "Measurement";
}
