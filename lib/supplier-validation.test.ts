import { describe, expect, it } from "vitest";
import {
  SupplierValidationError,
  normalizeSupplierWebsite,
  validateSupplierWriteInput,
} from "@/lib/supplier-validation";

describe("supplier validation", () => {
  it("accepts a supplier with only the required fields", () => {
    expect(
      validateSupplierWriteInput({
        name: "Bunnings",
      }),
    ).toMatchObject({
      name: "Bunnings",
      isActive: true,
      paymentTermsType: null,
      paymentTermsDay: null,
    });
  });

  it("accepts structured supplier master data", () => {
    expect(
      validateSupplierWriteInput({
        name: "Sample Supplier",
        legalName: "Sample Supplier Ltd",
        primaryContactEmail: "supplier@example.test",
        website: "https://supplier.example.test",
        addressLine1: "11c Airbourne Road",
        city: "Auckland",
        countryCode: "nz",
        defaultCurrencyCode: "nzd",
        paymentTermsType: "of_following_month",
        paymentTermsDay: 20,
      }),
    ).toMatchObject({
      countryCode: "NZ",
      defaultCurrencyCode: "NZD",
      paymentTermsType: "of_following_month",
      paymentTermsDay: 20,
    });
  });

  it("defaults protocol-free supplier websites to https", () => {
    expect(
      validateSupplierWriteInput({
        name: "ITM",
        website: "www.itm.co.nz",
      }).website,
    ).toBe("https://www.itm.co.nz");

    expect(
      validateSupplierWriteInput({
        name: "Legacy supplier",
        website: "http://supplier.example.com",
      }).website,
    ).toBe("http://supplier.example.com");
  });

  it("rejects invalid email and website values server-side", () => {
    expect(() =>
      validateSupplierWriteInput({
        name: "Sample Supplier",
        primaryContactEmail: "invalid-email",
        website: "not a website",
      }),
    ).toThrow(SupplierValidationError);

    try {
      validateSupplierWriteInput({
        name: "Sample Supplier",
        primaryContactEmail: "invalid-email",
        website: "not a website",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SupplierValidationError);
      expect((error as SupplierValidationError).fieldErrors).toMatchObject({
        primaryContactEmail: "Enter a valid email address.",
        website: "Website must be a valid http or https URL.",
      });
    }
  });

  it("rejects invalid structured payment-term combinations", () => {
    expect(() =>
      validateSupplierWriteInput({
        name: "Sample Supplier",
        paymentTermsType: "days_after_bill_date",
      }),
    ).toThrow(SupplierValidationError);

    expect(() =>
      validateSupplierWriteInput({
        name: "Sample Supplier",
        paymentTermsDay: 12,
      }),
    ).toThrow(SupplierValidationError);
  });

  it("preserves the current blank, null, and default semantics", () => {
    expect(
      validateSupplierWriteInput({
        name: "  Sample Supplier  ",
        legalName: "   ",
        primaryContactEmail: null,
        addressLine1: "\t",
        defaultPaymentTerms: null,
        isActive: undefined,
      }),
    ).toMatchObject({
      name: "Sample Supplier",
      legalName: null,
      primaryContactEmail: null,
      addressLine1: null,
      defaultPaymentTerms: "",
      isActive: true,
    });
  });

  it("does not mutate the input and ignores unknown runtime properties", () => {
    const input = {
      name: " Supplier ",
      customClientField: "preserved only by the caller",
    } as Parameters<typeof validateSupplierWriteInput>[0] & { customClientField: string };
    const before = { ...input };

    expect(validateSupplierWriteInput(input)).toMatchObject({ name: "Supplier", paymentTermsDay: null });
    expect(input).toEqual(before);
    expect((validateSupplierWriteInput(input) as Record<string, unknown>).customClientField).toBeUndefined();
  });

  it("preserves current payment-day handling for non-integers and boundaries", () => {
    expect(
      validateSupplierWriteInput({ name: "Supplier", paymentTermsType: "of_current_month", paymentTermsDay: 0 }),
    ).toMatchObject({ paymentTermsDay: 0 });
    expect(
      validateSupplierWriteInput({ name: "Supplier", paymentTermsType: "of_current_month", paymentTermsDay: 31 }),
    ).toMatchObject({ paymentTermsDay: 31 });

    expect(
      validateSupplierWriteInput({ name: "Supplier", paymentTermsType: "of_current_month", paymentTermsDay: 31.5 }),
    ).toMatchObject({ paymentTermsDay: null });
    expect(() =>
      validateSupplierWriteInput({ name: "Supplier", paymentTermsType: "of_current_month", paymentTermsDay: -1 }),
    ).toThrow(SupplierValidationError);
    expect(() =>
      validateSupplierWriteInput({ name: "Supplier", paymentTermsType: "of_current_month", paymentTermsDay: Number.NaN }),
    ).not.toThrow();
  });

  it("keeps website normalization deterministic and protocol-specific", () => {
    expect(normalizeSupplierWebsite("  supplier.example  ")).toBe("https://supplier.example");
    expect(normalizeSupplierWebsite("HTTPS://SUPPLIER.EXAMPLE")).toBe("HTTPS://SUPPLIER.EXAMPLE");
    expect(normalizeSupplierWebsite(" ")).toBeNull();
    expect(normalizeSupplierWebsite(null)).toBeNull();
  });
});
