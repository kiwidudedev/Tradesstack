import { describe, expect, it } from "vitest";
import { formatMaterialMoney, resolveCompanyCurrency } from "@/lib/materials/normalization";

describe("formatMaterialMoney", () => {
  it("formats a valid currency code", () => {
    expect(formatMaterialMoney(8.13, "NZD")).toContain("8.13");
  });

  it.each(["", "N", "NZ", "not-a-currency"])(
    "does not throw while an editable currency is a partial value: %s",
    (currency) => {
      expect(() => formatMaterialMoney(8.13, currency)).not.toThrow();
      expect(formatMaterialMoney(8.13, currency)).toContain("8.13");
    },
  );

  it("uses the company currency while an editable currency is incomplete", () => {
    expect(formatMaterialMoney(8.13, "N", "AUD")).toBe(formatMaterialMoney(8.13, "AUD", "AUD"));
  });
});

describe("resolveCompanyCurrency", () => {
  it("derives NZD and AUD from the company location", () => {
    expect(resolveCompanyCurrency({ country: "New Zealand", defaultCurrency: "AUD" })).toBe("NZD");
    expect(resolveCompanyCurrency({ country: "Australia", defaultCurrency: "NZD" })).toBe("AUD");
  });

  it("uses the configured company currency when the location is not mapped", () => {
    expect(resolveCompanyCurrency({ country: "United Kingdom", defaultCurrency: "GBP" })).toBe("GBP");
  });
});
