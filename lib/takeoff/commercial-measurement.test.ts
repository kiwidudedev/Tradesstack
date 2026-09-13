import { describe, expect, it } from "vitest";
import {
  getTakeoffCommercialDescription,
  getTakeoffCommercialQuantity,
  isTakeoffMeasurementCommerciallyEligible,
} from "@/lib/takeoff/commercial-measurement";

describe("Takeoff commercial measurement authority", () => {
  it.each([
    ["line", null, 33.0714, 33.071],
    ["area", null, 12.3456, 12.346],
    ["count", 7, 999, 7],
    ["count", null, 4, 4],
  ] as const)("uses canonical %s quantity", (measurement_kind, count_value, display_value, expected) => {
    expect(getTakeoffCommercialQuantity({ measurement_kind, count_value, display_value })).toBe(expected);
  });

  it("never accepts the legacy quantity field as an input", () => {
    expect(getTakeoffCommercialQuantity({ measurement_kind: "line", count_value: null, display_value: 8 })).toBe(8);
  });

  it("uses the trimmed measurement name even when Takeoff has a different description", () => {
    expect(getTakeoffCommercialDescription({ name: " Slab Edge ", description: "50mm NIB" })).toBe("Slab Edge");
    expect(getTakeoffCommercialDescription({ name: "External Walls", description: "13mm plasterboard" })).toBe("External Walls");
  });

  it("safely handles legacy blank names without changing name authority for valid rows", () => {
    expect(getTakeoffCommercialDescription({ name: " ", description: " Legacy description " })).toBe("Legacy description");
    expect(getTakeoffCommercialDescription({ name: " ", description: " " })).toBe("Measurement");
  });

  it("allows active committed parents and rejects temporary, archived, and deleted rows", () => {
    expect(isTakeoffMeasurementCommerciallyEligible({ id: "m1", measurement_kind: "line", status: "active" })).toBe(true);
    expect(isTakeoffMeasurementCommerciallyEligible({ id: "temp-1", measurement_kind: "area", status: "active" })).toBe(false);
    expect(isTakeoffMeasurementCommerciallyEligible({ id: "m2", measurement_kind: "count", status: "archived" })).toBe(false);
    expect(isTakeoffMeasurementCommerciallyEligible({ id: "m3", measurement_kind: "line", status: "deleted" })).toBe(false);
  });
});
