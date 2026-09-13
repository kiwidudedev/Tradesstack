import { describe, expect, it } from "vitest";
import {
  isTakeoffMeasurementIncludedInPdfExport,
  isTakeoffMeasurementVisibleInLiveWorkspace,
} from "@/lib/takeoff/measurement-visibility";

describe("Takeoff live and PDF-export measurement visibility", () => {
  const pbArea = {
    id: "measurement-pb",
    status: "active",
    measurement_kind: "area",
  };

  it("keeps an export-hidden persisted area operationally visible", () => {
    const exportHiddenIds = new Set([pbArea.id]);

    expect(isTakeoffMeasurementVisibleInLiveWorkspace(pbArea)).toBe(true);
    expect(isTakeoffMeasurementIncludedInPdfExport(pbArea, exportHiddenIds)).toBe(false);
  });

  it.each(["line", "area", "count"])(
    "keeps an export-hidden %s measurement live while excluding it from PDF export",
    (measurementKind) => {
      const measurement = {
        ...pbArea,
        id: `measurement-${measurementKind}`,
        measurement_kind: measurementKind,
      };
      const exportHiddenIds = new Set([measurement.id]);

      expect(isTakeoffMeasurementVisibleInLiveWorkspace(measurement)).toBe(true);
      expect(isTakeoffMeasurementIncludedInPdfExport(measurement, exportHiddenIds)).toBe(false);
    },
  );

  it("excludes deleted and invalid measurements from both paths", () => {
    expect(isTakeoffMeasurementVisibleInLiveWorkspace({ ...pbArea, status: "deleted" })).toBe(false);
    expect(isTakeoffMeasurementIncludedInPdfExport({ ...pbArea, status: "deleted" }, new Set())).toBe(false);
    expect(isTakeoffMeasurementVisibleInLiveWorkspace({ ...pbArea, measurement_kind: "calibration" })).toBe(false);
  });
});
