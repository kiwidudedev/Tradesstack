import { describe, expect, it } from "vitest";
import {
  convertDocumentAreaToRealWorld,
  convertDocumentDistanceToRealWorld,
  getCalibrationScale,
} from "../pdf-coordinate-transform";
import {
  assertTakeoffUnitConsistency,
  convertTakeoffDisplayAreaToBase,
  convertTakeoffDisplayLengthToBase,
} from "./units";

describe("takeoff unit conversions", () => {
  it.each([
    ["m", 1, 1000],
    ["cm", 1, 10],
    ["mm", 4890, 4890],
    ["m", 4.89, 4890],
    ["ft", 1, 12],
  ] as const)("converts %s length to its canonical base", (displayUnit, input, expected) => {
    expect(convertTakeoffDisplayLengthToBase({ displayUnit, value: input })).toBe(expected);
  });

  it("squares the conversion factor for area", () => {
    expect(convertTakeoffDisplayAreaToBase({ displayUnit: "m", value: 1 })).toBe(1_000_000);
    expect(convertTakeoffDisplayAreaToBase({ displayUnit: "cm", value: 1 })).toBe(100);
  });

  it("rejects inconsistent display-unit and unit-system combinations", () => {
    expect(() => assertTakeoffUnitConsistency({ displayUnit: "m", unitSystem: "imperial" })).toThrow(
      "Calibration display unit and unit system do not match."
    );
  });

  it("gives equivalent canonical lengths for 4.89 m and 4890 mm", () => {
    const metres = convertTakeoffDisplayLengthToBase({ displayUnit: "m", value: 4.89 });
    const millimetres = convertTakeoffDisplayLengthToBase({ displayUnit: "mm", value: 4890 });
    expect(metres).toBe(millimetres);
    expect(metres / 218.64080995106474).toBeCloseTo(millimetres / 218.64080995106474, 12);
  });

  it("keeps metre linear and area measurements equivalent to canonical millimetres", () => {
    const pointA = { x: 0, y: 0 };
    const pointB = { x: 100, y: 0 };
    const metreScale = getCalibrationScale({ pointA, pointB, referenceLength: 4.89, displayUnit: "m" });
    const millimetreScale = getCalibrationScale({ pointA, pointB, referenceLength: 4890, displayUnit: "mm" });

    expect(convertDocumentDistanceToRealWorld(25, metreScale)).toBeCloseTo(1.2225, 12);
    expect(convertDocumentDistanceToRealWorld(25, millimetreScale)).toBeCloseTo(1222.5, 12);
    expect(convertDocumentAreaToRealWorld(2500, metreScale)).toBeCloseTo(5.978025, 12);
    expect(convertDocumentAreaToRealWorld(2500, millimetreScale)).toBeCloseTo(5_978_025, 6);
  });
});
