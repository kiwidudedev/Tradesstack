import { describe, expect, it } from "vitest";
import { calculateInfrastructureCost } from "@/lib/infrastructure/cost-model";

describe("Cloudflare infrastructure cost model", () => {
  it.each([
    [1, "small", 5.15],
    [10, "medium", 31.45],
    [10, "large", 130.35],
    [100, "large", 1365.15],
  ] as const)("calculates %s %s as $%s", (customers, scenario, expected) => {
    expect(calculateInfrastructureCost(customers, scenario).total).toBeCloseTo(expected, 2);
  });

  it("applies shared account allowances once", () => {
    const one = calculateInfrastructureCost(1, "medium").total;
    const five = calculateInfrastructureCost(5, "medium").total;
    expect(five).toBeLessThan(one * 5);
  });
});
