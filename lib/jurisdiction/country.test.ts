import { describe, expect, it } from "vitest";
import {
  isAustralianCountry,
  isNewZealandCountry,
  normalizeCountryCode,
  resolveTaxJurisdiction,
} from "@/lib/jurisdiction/country";

describe("country jurisdiction helpers", () => {
  it("normalizes explicit New Zealand country values", () => {
    expect(normalizeCountryCode("NZ")).toBe("NZ");
    expect(normalizeCountryCode(" nzl ")).toBe("NZL");
    expect(normalizeCountryCode(" New Zealand ")).toBe("NEW ZEALAND");
  });

  it("returns true for accepted New Zealand values", () => {
    expect(isNewZealandCountry("NZ")).toBe(true);
    expect(isNewZealandCountry("nz")).toBe(true);
    expect(isNewZealandCountry("NZL")).toBe(true);
    expect(isNewZealandCountry("New Zealand")).toBe(true);
    expect(isNewZealandCountry(" new zealand ")).toBe(true);
  });

  it("returns false for non New Zealand values", () => {
    expect(isNewZealandCountry("AU")).toBe(false);
    expect(isNewZealandCountry("Australia")).toBe(false);
    expect(isNewZealandCountry("United Kingdom")).toBe(false);
    expect(isNewZealandCountry("")).toBe(false);
    expect(isNewZealandCountry(null)).toBe(false);
    expect(isNewZealandCountry(undefined)).toBe(false);
    expect(isNewZealandCountry("Unknown")).toBe(false);
  });

  it("normalizes New Zealand and Australian jurisdiction aliases", () => {
    expect(resolveTaxJurisdiction("NZ")).toBe("NZ");
    expect(resolveTaxJurisdiction("nzl")).toBe("NZ");
    expect(resolveTaxJurisdiction(" New Zealand ")).toBe("NZ");
    expect(resolveTaxJurisdiction("AU")).toBe("AU");
    expect(resolveTaxJurisdiction("aus")).toBe("AU");
    expect(resolveTaxJurisdiction(" Australia ")).toBe("AU");
  });

  it("returns unsupported instead of guessing unknown jurisdictions", () => {
    expect(resolveTaxJurisdiction("United Kingdom")).toBe("unsupported");
    expect(resolveTaxJurisdiction("")).toBe("unsupported");
    expect(resolveTaxJurisdiction(null)).toBe("unsupported");
  });

  it("identifies Australian values without treating them as New Zealand", () => {
    expect(isAustralianCountry("AU")).toBe(true);
    expect(isAustralianCountry("AUS")).toBe(true);
    expect(isAustralianCountry("Australia")).toBe(true);
    expect(isAustralianCountry("NZ")).toBe(false);
  });
});
