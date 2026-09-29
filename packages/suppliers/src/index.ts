export const SUPPLIER_PAYMENT_TERMS_TYPES = [
  "days_after_bill_date",
  "days_after_bill_month",
  "of_current_month",
  "of_following_month",
] as const;

export type SupplierPaymentTermsType = (typeof SUPPLIER_PAYMENT_TERMS_TYPES)[number];

/** Minimal provider-neutral Supplier identity used by cross-domain selectors and references. */
export type SupplierReference = {
  id: string;
  displayName: string;
  isActive: boolean;
};

export type SupplierWriteInput = {
  name: string;
  legalName?: string | null;
  primaryContactFirstName?: string | null;
  primaryContactLastName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  website?: string | null;
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  companyRegistrationNumber?: string | null;
  taxNumber?: string | null;
  taxNumberType?: string | null;
  defaultCurrencyCode?: string | null;
  defaultPaymentTerms?: string | null;
  paymentTermsType?: SupplierPaymentTermsType | null;
  paymentTermsDay?: number | null;
  isActive?: boolean;
};

export type SupplierValidationField =
  | "name" | "legalName" | "primaryContactFirstName" | "primaryContactLastName"
  | "primaryContactEmail" | "primaryContactPhone" | "website" | "address"
  | "addressLine1" | "addressLine2" | "city" | "region" | "postalCode"
  | "countryCode" | "companyRegistrationNumber" | "taxNumber" | "taxNumberType"
  | "defaultCurrencyCode" | "defaultPaymentTerms" | "paymentTermsType" | "paymentTermsDay";

export type SupplierValidationErrors = Partial<Record<SupplierValidationField, string>>;

export type ValidatedSupplierWriteInput = {
  name: string;
  legalName: string | null;
  primaryContactFirstName: string | null;
  primaryContactLastName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  website: string | null;
  address: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  companyRegistrationNumber: string | null;
  taxNumber: string | null;
  taxNumberType: string | null;
  defaultCurrencyCode: string | null;
  defaultPaymentTerms: string;
  paymentTermsType: SupplierPaymentTermsType | null;
  paymentTermsDay: number | null;
  isActive: boolean;
};

const MAX_LENGTH = {
  name: 255, legalName: 255, primaryContactFirstName: 255, primaryContactLastName: 255,
  email: 255, phone: 50, website: 255, address: 1000, addressLine: 255, city: 255,
  region: 255, postalCode: 64, countryCode: 2, companyRegistrationNumber: 64,
  taxNumber: 64, taxNumberType: 64, currencyCode: 3, defaultPaymentTerms: 255,
} as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;
const CURRENCY_CODE_PATTERN = /^[A-Za-z]{3}$/;

export class SupplierValidationError extends Error {
  fieldErrors: SupplierValidationErrors;
  constructor(fieldErrors: SupplierValidationErrors) {
    super("Supplier details need attention.");
    this.name = "SupplierValidationError";
    this.fieldErrors = fieldErrors;
  }
}

function trimOptionalString(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

function requireMaxLength(errors: SupplierValidationErrors, field: SupplierValidationField, value: string | null, maxLength: number, label: string) {
  if (value && value.length > maxLength) errors[field] = `${label} must be ${maxLength} characters or fewer.`;
}

export function normalizeSupplierWebsite(value: string | null | undefined) {
  const website = trimOptionalString(value);
  if (!website) return null;
  return /^[a-z][a-z\d+.-]*:\/\//i.test(website) ? website : `https://${website}`;
}

function validateWebsite(website: string | null) {
  if (!website) return true;
  try {
    const parsed = new URL(website);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch { return false; }
}

function normalizePaymentTermsType(value: SupplierWriteInput["paymentTermsType"]): SupplierPaymentTermsType | null {
  if (!value) return null;
  return SUPPLIER_PAYMENT_TERMS_TYPES.includes(value) ? value : null;
}

function normalizePaymentTermsDay(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number.isInteger(value) ? value : null;
}

export function validateSupplierWriteInput(input: SupplierWriteInput, options?: { fallbackIsActive?: boolean }): ValidatedSupplierWriteInput {
  const errors: SupplierValidationErrors = {};
  const name = String(input.name ?? "").trim();
  const legalName = trimOptionalString(input.legalName);
  const primaryContactFirstName = trimOptionalString(input.primaryContactFirstName);
  const primaryContactLastName = trimOptionalString(input.primaryContactLastName);
  const primaryContactEmail = trimOptionalString(input.primaryContactEmail);
  const primaryContactPhone = trimOptionalString(input.primaryContactPhone);
  const website = normalizeSupplierWebsite(input.website);
  const address = trimOptionalString(input.address);
  const addressLine1 = trimOptionalString(input.addressLine1);
  const addressLine2 = trimOptionalString(input.addressLine2);
  const city = trimOptionalString(input.city);
  const region = trimOptionalString(input.region);
  const postalCode = trimOptionalString(input.postalCode);
  const countryCode = trimOptionalString(input.countryCode)?.toUpperCase() ?? null;
  const companyRegistrationNumber = trimOptionalString(input.companyRegistrationNumber);
  const taxNumber = trimOptionalString(input.taxNumber);
  const taxNumberType = trimOptionalString(input.taxNumberType);
  const defaultCurrencyCode = trimOptionalString(input.defaultCurrencyCode)?.toUpperCase() ?? null;
  const defaultPaymentTerms = String(input.defaultPaymentTerms ?? "").trim();
  const paymentTermsType = normalizePaymentTermsType(input.paymentTermsType);
  const paymentTermsDay = normalizePaymentTermsDay(input.paymentTermsDay);
  const isActive = typeof input.isActive === "boolean" ? input.isActive : options?.fallbackIsActive ?? true;

  if (!name) errors.name = "Supplier name is required.";
  requireMaxLength(errors, "name", name, MAX_LENGTH.name, "Supplier name");
  requireMaxLength(errors, "legalName", legalName, MAX_LENGTH.legalName, "Legal name");
  requireMaxLength(errors, "primaryContactFirstName", primaryContactFirstName, MAX_LENGTH.primaryContactFirstName, "Primary contact first name");
  requireMaxLength(errors, "primaryContactLastName", primaryContactLastName, MAX_LENGTH.primaryContactLastName, "Primary contact last name");
  requireMaxLength(errors, "primaryContactEmail", primaryContactEmail, MAX_LENGTH.email, "Primary contact email");
  requireMaxLength(errors, "primaryContactPhone", primaryContactPhone, MAX_LENGTH.phone, "Primary contact phone");
  requireMaxLength(errors, "website", website, MAX_LENGTH.website, "Website");
  requireMaxLength(errors, "address", address, MAX_LENGTH.address, "Legacy address");
  requireMaxLength(errors, "addressLine1", addressLine1, MAX_LENGTH.addressLine, "Address line 1");
  requireMaxLength(errors, "addressLine2", addressLine2, MAX_LENGTH.addressLine, "Address line 2");
  requireMaxLength(errors, "city", city, MAX_LENGTH.city, "City");
  requireMaxLength(errors, "region", region, MAX_LENGTH.region, "Region");
  requireMaxLength(errors, "postalCode", postalCode, MAX_LENGTH.postalCode, "Postal code");
  requireMaxLength(errors, "companyRegistrationNumber", companyRegistrationNumber, MAX_LENGTH.companyRegistrationNumber, "Company registration number");
  requireMaxLength(errors, "taxNumber", taxNumber, MAX_LENGTH.taxNumber, "Tax number");
  requireMaxLength(errors, "taxNumberType", taxNumberType, MAX_LENGTH.taxNumberType, "Tax number type");
  requireMaxLength(errors, "defaultPaymentTerms", defaultPaymentTerms, MAX_LENGTH.defaultPaymentTerms, "Legacy payment terms");
  if (primaryContactEmail && !EMAIL_PATTERN.test(primaryContactEmail)) errors.primaryContactEmail = "Enter a valid email address.";
  if (website && !validateWebsite(website)) errors.website = "Website must be a valid http or https URL.";
  if (countryCode && !COUNTRY_CODE_PATTERN.test(countryCode)) errors.countryCode = "Country code must be a 2-letter code.";
  if (defaultCurrencyCode && !CURRENCY_CODE_PATTERN.test(defaultCurrencyCode)) errors.defaultCurrencyCode = "Currency must be a 3-letter ISO code.";
  if (paymentTermsType !== input.paymentTermsType && input.paymentTermsType) errors.paymentTermsType = "Choose a valid structured payment term.";
  if (!paymentTermsType && paymentTermsDay !== null) errors.paymentTermsDay = "Choose a payment term type before setting a payment day.";
  if (paymentTermsDay !== null && (paymentTermsDay < 0 || paymentTermsDay > 31)) errors.paymentTermsDay = "Payment day must be between 0 and 31.";
  if ((paymentTermsType === "days_after_bill_date" || paymentTermsType === "days_after_bill_month") && paymentTermsDay === null) errors.paymentTermsDay = "Enter the number of days for this payment term.";
  if (Object.keys(errors).length > 0) throw new SupplierValidationError(errors);
  return { name, legalName, primaryContactFirstName, primaryContactLastName, primaryContactEmail, primaryContactPhone, website, address, addressLine1, addressLine2, city, region, postalCode, countryCode, companyRegistrationNumber, taxNumber, taxNumberType, defaultCurrencyCode, defaultPaymentTerms, paymentTermsType, paymentTermsDay, isActive };
}
