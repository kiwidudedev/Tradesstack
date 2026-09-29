import type { Database } from "@/lib/supabase/types";
import {
  SupplierValidationError,
  validateSupplierWriteInput,
  type SupplierPaymentTermsType,
} from "@tradesstack/suppliers";

export * from "@tradesstack/suppliers";

// Compatibility-only persistence alias. The public package deliberately does not export database rows.
export type OrganizationSupplierRow = Database["public"]["Tables"]["organization_suppliers"]["Row"];

// Readiness is an application/database projection, not part of the portable write contract.
export function getSupplierValidationIssuesForReadiness(
  supplier: Pick<
    OrganizationSupplierRow,
    | "primary_contact_email"
    | "website"
    | "country_code"
    | "default_currency_code"
    | "payment_terms_type"
    | "payment_terms_day"
  >,
) {
  try {
    validateSupplierWriteInput({
      name: "Readiness check",
      primaryContactEmail: supplier.primary_contact_email,
      website: supplier.website,
      countryCode: supplier.country_code,
      defaultCurrencyCode: supplier.default_currency_code,
      paymentTermsType: (supplier.payment_terms_type as SupplierPaymentTermsType | null | undefined) ?? null,
      paymentTermsDay: supplier.payment_terms_day,
    });
  } catch (error) {
    if (error instanceof SupplierValidationError) return Object.values(error.fieldErrors);
    throw error;
  }

  return [];
}
