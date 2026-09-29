import {
  SUPPLIER_PAYMENT_TERMS_TYPES,
  SupplierValidationError,
  normalizeSupplierWebsite,
  validateSupplierWriteInput,
  type SupplierPaymentTermsType,
  type SupplierReference,
  type SupplierWriteInput,
  type ValidatedSupplierWriteInput,
} from "@tradesstack/suppliers";

type ClientSupplierRecord = {
  clientKey: string;
  label: string;
  enabled: boolean;
  validatedWrite: ValidatedSupplierWriteInput;
};

const clientSupplierStore = new Map<string, ClientSupplierRecord>();

function mapClientRecordToSupplierReference(record: ClientSupplierRecord): SupplierReference {
  return {
    id: record.clientKey,
    displayName: record.label,
    isActive: record.enabled,
  };
}

export function runClientSupplierProof() {
  const paymentTermsType: SupplierPaymentTermsType = "days_after_bill_date";
  const input: SupplierWriteInput = {
    name: "Disposable Client Proof Supplier",
    website: "supplier.example",
    countryCode: "nz",
    defaultCurrencyCode: "nzd",
    paymentTermsType,
    paymentTermsDay: 14,
  };
  const validatedWrite = validateSupplierWriteInput(input);

  const record: ClientSupplierRecord = {
    clientKey: "client-proof-supplier-1",
    label: validatedWrite.name,
    enabled: validatedWrite.isActive,
    validatedWrite,
  };
  clientSupplierStore.set(record.clientKey, record);

  const stored = clientSupplierStore.get(record.clientKey);
  if (!stored) throw new Error("Client-owned Supplier record was not stored.");

  let invalidField: string | undefined;
  try {
    validateSupplierWriteInput({ name: "", primaryContactEmail: "not-an-email" });
  } catch (error) {
    if (!(error instanceof SupplierValidationError)) throw error;
    invalidField = error.fieldErrors.name;
  }

  if (!invalidField) throw new Error("Expected package validation error was not observed.");

  const reference = mapClientRecordToSupplierReference(stored);
  return {
    reference,
    normalizedWebsite: normalizeSupplierWebsite(input.website),
    paymentTerms: [...SUPPLIER_PAYMENT_TERMS_TYPES],
    validatedWrite,
    invalidField,
  };
}
