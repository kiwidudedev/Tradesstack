import type { Database } from "@/lib/supabase/types";
import {
  getSupplierValidationIssuesForReadiness,
  type SupplierPaymentTermsType,
} from "@/lib/supplier-validation";

export type OrganizationSupplierRow = Database["public"]["Tables"]["organization_suppliers"]["Row"];

export type SupplierDuplicateWarning = {
  id: string;
  message: string;
  severity: "warning" | "caution";
  field:
    | "name"
    | "legalName"
    | "email"
    | "phone"
    | "companyRegistrationNumber"
    | "taxNumber"
    | "website";
};

export function getSupplierDisplayName(supplier: Pick<OrganizationSupplierRow, "company_name" | "name">) {
  return supplier.company_name?.trim() || supplier.name?.trim() || "";
}

export function normalizeSupplierLookupValue(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSupplierPhoneLookupValue(value: string | null | undefined) {
  return (value ?? "").replace(/[^\d+]/g, "");
}

function normalizeSupplierWebsiteLookupValue(value: string | null | undefined) {
  return normalizeSupplierLookupValue(value).replace(/\/+$/, "");
}

export function getSupplierPrimaryEmail(
  supplier: Pick<OrganizationSupplierRow, "primary_contact_email" | "email">,
) {
  return supplier.primary_contact_email?.trim() || supplier.email?.trim() || "";
}

export function getSupplierPrimaryPhone(
  supplier: Pick<OrganizationSupplierRow, "primary_contact_phone" | "phone">,
) {
  return supplier.primary_contact_phone?.trim() || supplier.phone?.trim() || "";
}

export function getSupplierStructuredAddress(
  supplier: Pick<
    OrganizationSupplierRow,
    "address_line_1" | "address_line_2" | "city" | "region" | "postal_code" | "country_code"
  >,
) {
  return [
    supplier.address_line_1,
    supplier.address_line_2,
    supplier.city,
    supplier.region,
    supplier.postal_code,
    supplier.country_code,
  ]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
}

export function getSupplierAddressDisplay(
  supplier: Pick<
    OrganizationSupplierRow,
    | "address"
    | "address_line_1"
    | "address_line_2"
    | "city"
    | "region"
    | "postal_code"
    | "country_code"
  >,
) {
  const structured = getSupplierStructuredAddress(supplier);
  if (structured.length > 0) {
    return structured.join("\n");
  }

  return supplier.address?.trim() || "";
}

export function formatSupplierPaymentTerms(
  supplier: Pick<
    OrganizationSupplierRow,
    "default_payment_terms" | "payment_terms_type" | "payment_terms_day"
  >,
) {
  const type = supplier.payment_terms_type as SupplierPaymentTermsType | null;
  const day = supplier.payment_terms_day;

  if (!type) {
    return supplier.default_payment_terms || "";
  }

  switch (type) {
    case "days_after_bill_date":
      return `${day ?? 0} day${day === 1 ? "" : "s"} after bill date`;
    case "days_after_bill_month":
      return `${day ?? 0} day${day === 1 ? "" : "s"} after bill month`;
    case "of_current_month":
      return day === null ? "End of current month" : `${day}${getOrdinalSuffix(day)} of current month`;
    case "of_following_month":
      return day === null ? "End of following month" : `${day}${getOrdinalSuffix(day)} of following month`;
    default:
      return supplier.default_payment_terms || "";
  }
}

function getOrdinalSuffix(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }

  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export type SupplierReadinessState =
  | "basic"
  | "procurement_ready"
  | "xero_contact_ready"
  | "needs_attention";

export type SupplierReadinessAssessment = {
  state: SupplierReadinessState;
  missingFields: string[];
  invalidFields: string[];
};

export function getSupplierReadiness(
  supplier: Pick<
    OrganizationSupplierRow,
    | "name"
    | "company_name"
    | "legal_name"
    | "email"
    | "phone"
    | "primary_contact_email"
    | "primary_contact_phone"
    | "website"
    | "country_code"
    | "default_currency_code"
    | "payment_terms_type"
    | "payment_terms_day"
    | "address_line_1"
    | "city"
    | "is_active"
  >,
): SupplierReadinessAssessment {
  const missingFields: string[] = [];
  const primaryEmail = getSupplierPrimaryEmail(supplier);
  const primaryPhone = getSupplierPrimaryPhone(supplier);
  const hasLegalOrDisplayName = Boolean(
    supplier.legal_name?.trim() || getSupplierDisplayName(supplier),
  );
  const hasContactMethod = Boolean(primaryEmail || primaryPhone);
  const hasStructuredAddress = Boolean(supplier.address_line_1?.trim() || supplier.city?.trim());
  const invalidFields = getSupplierValidationIssuesForReadiness({
    primary_contact_email: supplier.primary_contact_email,
    website: supplier.website,
    country_code: supplier.country_code,
    default_currency_code: supplier.default_currency_code,
    payment_terms_type: supplier.payment_terms_type,
    payment_terms_day: supplier.payment_terms_day,
  });

  if (!hasContactMethod) {
    missingFields.push("Primary contact email or phone");
  }
  if (!supplier.is_active) {
    missingFields.push("Supplier is inactive");
  }
  if (!hasStructuredAddress) {
    missingFields.push("Structured address");
  }

  if (invalidFields.length > 0) {
    return {
      state: "needs_attention",
      missingFields,
      invalidFields,
    };
  }

  if (hasLegalOrDisplayName && hasContactMethod) {
    return {
      state: "xero_contact_ready",
      missingFields,
      invalidFields,
    };
  }

  if (getSupplierDisplayName(supplier) && hasContactMethod && supplier.is_active) {
    return {
      state: "procurement_ready",
      missingFields,
      invalidFields,
    };
  }

  return {
    state: "basic",
    missingFields,
    invalidFields,
  };
}

export function getSupplierDuplicateWarnings(params: {
  suppliers: OrganizationSupplierRow[];
  supplierId?: string | null;
  name: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyRegistrationNumber?: string | null;
  taxNumber?: string | null;
  website?: string | null;
}) {
  const {
    suppliers,
    supplierId = null,
    name,
    legalName = null,
    email = null,
    phone = null,
    companyRegistrationNumber = null,
    taxNumber = null,
    website = null,
  } = params;
  const normalizedName = normalizeSupplierLookupValue(name);
  const normalizedLegalName = normalizeSupplierLookupValue(legalName);
  const normalizedEmail = normalizeSupplierLookupValue(email);
  const normalizedPhone = normalizeSupplierPhoneLookupValue(phone);
  const normalizedCompanyRegistrationNumber = normalizeSupplierLookupValue(companyRegistrationNumber);
  const normalizedTaxNumber = normalizeSupplierLookupValue(taxNumber);
  const normalizedWebsite = normalizeSupplierWebsiteLookupValue(website);

  const warnings: SupplierDuplicateWarning[] = [];
  if (
    !normalizedName &&
    !normalizedLegalName &&
    !normalizedEmail &&
    !normalizedPhone &&
    !normalizedCompanyRegistrationNumber &&
    !normalizedTaxNumber &&
    !normalizedWebsite
  ) {
    return warnings;
  }

  for (const supplier of suppliers) {
    if (supplier.id === supplierId) {
      continue;
    }

    const existingName = normalizeSupplierLookupValue(getSupplierDisplayName(supplier));
    const existingLegalName = normalizeSupplierLookupValue(supplier.legal_name);
    const existingEmail = normalizeSupplierLookupValue(supplier.email);
    const existingPhone = normalizeSupplierPhoneLookupValue(
      supplier.primary_contact_phone ?? supplier.phone,
    );
    const existingCompanyRegistrationNumber = normalizeSupplierLookupValue(
      supplier.company_registration_number,
    );
    const existingTaxNumber = normalizeSupplierLookupValue(supplier.tax_number);
    const existingWebsite = normalizeSupplierWebsiteLookupValue(supplier.website);

    if (normalizedName && existingName && existingName === normalizedName) {
      warnings.push({
        id: `name-${supplier.id}`,
        message: `A supplier named "${getSupplierDisplayName(supplier)}" already exists.`,
        severity: "warning",
        field: "name",
      });
    }

    if (normalizedLegalName && existingLegalName && existingLegalName === normalizedLegalName) {
      warnings.push({
        id: `legal-name-${supplier.id}`,
        message: `A supplier with legal name "${supplier.legal_name}" already exists.`,
        severity: "warning",
        field: "legalName",
      });
    }

    if (normalizedEmail && existingEmail && existingEmail === normalizedEmail) {
      warnings.push({
        id: `email-${supplier.id}`,
        message: `A supplier using ${supplier.email} already exists.`,
        severity: "caution",
        field: "email",
      });
    }

    if (normalizedPhone && existingPhone && existingPhone === normalizedPhone) {
      warnings.push({
        id: `phone-${supplier.id}`,
        message: `A supplier using ${getSupplierPrimaryPhone(supplier)} already exists.`,
        severity: "caution",
        field: "phone",
      });
    }

    if (
      normalizedCompanyRegistrationNumber &&
      existingCompanyRegistrationNumber &&
      existingCompanyRegistrationNumber === normalizedCompanyRegistrationNumber
    ) {
      warnings.push({
        id: `company-registration-${supplier.id}`,
        message: `A supplier with registration number "${supplier.company_registration_number}" already exists.`,
        severity: "warning",
        field: "companyRegistrationNumber",
      });
    }

    if (normalizedTaxNumber && existingTaxNumber && existingTaxNumber === normalizedTaxNumber) {
      warnings.push({
        id: `tax-number-${supplier.id}`,
        message: `A supplier with tax number "${supplier.tax_number}" already exists.`,
        severity: "warning",
        field: "taxNumber",
      });
    }

    if (normalizedWebsite && existingWebsite && existingWebsite === normalizedWebsite) {
      warnings.push({
        id: `website-${supplier.id}`,
        message: `A supplier using ${supplier.website} already exists.`,
        severity: "caution",
        field: "website",
      });
    }
  }

  return warnings;
}
