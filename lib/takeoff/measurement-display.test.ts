import { describe, expect, it } from "vitest";
import {
  formatQuantityValue,
  resolveTakeoffMeasurementColor,
} from "@/lib/takeoff/measurement-display";

describe("Takeoff measurement presentation", () => {
  it.each([
    [7.1572, "m", "7.16 m"],
    [4.7544, "m", "4.75 m"],
    [7.1, "m", "7.1 m"],
    [7, "m", "7 m"],
    [100.35, "m", "100 m"],
  ] as const)("formats %s %s as %s", (value, unit, expected) => {
    expect(formatQuantityValue(value, unit)).toBe(expected);
  });

  it.each([
    ["line", "#F15A29"],
    ["area", "#0F766E"],
    ["count", "#2563EB"],
  ] as const)("uses the %s fallback colour", (kind, expected) => {
    expect(resolveTakeoffMeasurementColor(null, kind)).toBe(expected);
  });

  it("prefers a custom measurement colour and trims it", () => {
    expect(resolveTakeoffMeasurementColor("  #123ABC  ", "line")).toBe("#123ABC");
  });
});
