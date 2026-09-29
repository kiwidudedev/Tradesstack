import { describe, expect, it } from "vitest";
import { SUPPLIER_PAYMENT_TERMS_TYPES, SupplierValidationError, normalizeSupplierWebsite, validateSupplierWriteInput, type SupplierReference } from "./index";

describe("@tradesstack/suppliers", () => {
  it("exports the characterized payment-term vocabulary", () => {
    expect(SUPPLIER_PAYMENT_TERMS_TYPES).toEqual(["days_after_bill_date", "days_after_bill_month", "of_current_month", "of_following_month"]);
  });
  it("preserves validation behavior", () => {
    expect(validateSupplierWriteInput({ name: "  Supplier  ", countryCode: "nz" })).toMatchObject({ name: "Supplier", countryCode: "NZ", isActive: true });
    expect(() => validateSupplierWriteInput({ name: "Supplier", paymentTermsType: "days_after_bill_date" })).toThrow(SupplierValidationError);
    expect(validateSupplierWriteInput({ name: "Supplier", paymentTermsType: "of_current_month", paymentTermsDay: 31.5 })).toMatchObject({ paymentTermsDay: null });
  });
  it("is pure and deterministic", () => {
    const input = { name: " Supplier " };
    const result = validateSupplierWriteInput(input);
    expect(input).toEqual({ name: " Supplier " });
    expect(normalizeSupplierWebsite(" supplier.example ")).toBe("https://supplier.example");
    expect(validateSupplierWriteInput(input)).toEqual(result);
  });

  it("exposes a minimal serializable Supplier reference shape", () => {
    const reference: SupplierReference = {
      id: "supplier-1",
      displayName: "Supplier One",
      isActive: true,
    };
    expect(JSON.parse(JSON.stringify(reference))).toEqual(reference);
  });
});
