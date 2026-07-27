import { describe, expect, it } from "vitest";
import { SupplierValidationError, validateSupplierWriteInput } from "@/lib/supplier-validation";

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
});
