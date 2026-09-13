import { describe, expect, it } from "vitest";
import {
  normalizeCommercialMoney,
  normalizeCommercialQuantity,
  normalizeCommercialRate,
} from "@/lib/commercial-items/precision";

describe("commercial precision contract", () => {
  it("normalizes the reported half-cent worksheet result to money precision", () => {
    expect(normalizeCommercialMoney(46117.075000000004)).toBe(46117.08);
    expect(normalizeCommercialMoney(1.005)).toBe(1.01);
    expect(normalizeCommercialMoney(-1.005)).toBe(-1.01);
  });

  it("keeps quantity precision separate from rate and money precision", () => {
    expect(normalizeCommercialQuantity(1.23456)).toBe(1.235);
    expect(normalizeCommercialRate(1.235)).toBe(1.24);
    expect(normalizeCommercialMoney(1.235)).toBe(1.24);
  });
});
