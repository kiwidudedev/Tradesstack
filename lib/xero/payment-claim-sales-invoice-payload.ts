import "server-only";

import {
  evaluatePaymentClaimXeroReadinessSnapshot,
  resolvePaymentClaimXeroDependencies,
  resolvePaymentClaimXeroReadinessContext,
  type PaymentClaimXeroReadinessSnapshot,
} from "@/lib/xero/payment-claim-readiness";

export type PaymentClaimXeroPayloadErrorCode =
  | "not_ready"
  | "invalid_persisted_financial_value"
  | "missing_persisted_invoice_field"
  | "subtotal_mismatch"
  | "gst_mismatch"
  | "total_mismatch";

export type PaymentClaimXeroPayloadDiagnostics = {
  organizationId: string | null;
  claimId: string | null;
  accountTaxType: string | null;
  selectedTaxType: string | null;
  selectedTaxRateId: string | null;
  selectedEffectiveRate: number | null;
};

export class PaymentClaimXeroPayloadError extends Error {
  readonly code: PaymentClaimXeroPayloadErrorCode;
  readonly diagnostics: PaymentClaimXeroPayloadDiagnostics | null;

  constructor(
    code: PaymentClaimXeroPayloadErrorCode,
    message: string,
    diagnostics: PaymentClaimXeroPayloadDiagnostics | null = null,
  ) {
    super(message);
    this.name = "PaymentClaimXeroPayloadError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export type PaymentClaimXeroSalesInvoicePayload = {
  Type: "ACCREC";
  Contact: { ContactID: string };
  InvoiceNumber: string;
  Reference: string;
  Date: string;
  DueDate: string;
  CurrencyCode: string;
  LineAmountTypes: "Exclusive";
  Status: "AUTHORISED";
  LineItems: Array<{
    Description: string;
    Quantity: 1;
    UnitAmount: number;
    AccountCode: string;
    TaxType: string;
  }>;
};

export type PaymentClaimXeroPayloadResult = {
  payload: PaymentClaimXeroSalesInvoicePayload;
  reconciliation: {
    revenueAmount: number;
    signedRetentionAmount: number;
    subtotal: number;
    gst: number;
    total: number;
  };
};

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PaymentClaimXeroPayloadError(
      "missing_persisted_invoice_field",
      `Persisted ${field} is required to build the Xero Sales Invoice payload.`,
    );
  }
  return value.trim();
}

function requiredDate(value: unknown, field: string) {
  const result = requiredText(value, field);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== result
  ) {
    throw new PaymentClaimXeroPayloadError(
      "missing_persisted_invoice_field",
      `Persisted ${field} must be a valid ISO date.`,
    );
  }
  return result;
}

function decimalString(value: unknown, field: string) {
  if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value))) {
    throw new PaymentClaimXeroPayloadError(
      "invalid_persisted_financial_value",
      `Persisted ${field} must be a finite decimal value.`,
    );
  }
  const raw = String(value).trim();
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return raw;
  if (typeof value === "number") {
    const expanded = value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    if (/^-?\d+(?:\.\d+)?$/.test(expanded)) return expanded;
  }
  throw new PaymentClaimXeroPayloadError(
    "invalid_persisted_financial_value",
    `Persisted ${field} must be a plain decimal value.`,
  );
}

function toCents(value: unknown, field: string) {
  const raw = decimalString(value, field);
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  if (/[^0]/.test(fraction.slice(2))) {
    throw new PaymentClaimXeroPayloadError(
      "invalid_persisted_financial_value",
      `Persisted ${field} cannot contain fractions smaller than one cent.`,
    );
  }
  const cents = BigInt(whole) * BigInt(100) + BigInt(`${fraction}00`.slice(0, 2));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PaymentClaimXeroPayloadError(
      "invalid_persisted_financial_value",
      `Persisted ${field} exceeds the supported monetary range.`,
    );
  }
  return Number(negative ? -cents : cents);
}

function centsToAmount(cents: number) {
  return cents / 100;
}

function applyBasisPoints(cents: number, basisPoints: number) {
  const numerator = BigInt(cents) * BigInt(basisPoints);
  const negative = numerator < BigInt(0);
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + BigInt(5_000)) / BigInt(10_000);
  return Number(negative ? -rounded : rounded);
}

function assertNonNegative(cents: number, field: string) {
  if (cents < 0) {
    throw new PaymentClaimXeroPayloadError(
      "invalid_persisted_financial_value",
      `Persisted ${field} cannot be negative.`,
    );
  }
}

export function buildPaymentClaimXeroPayloadFromResolvedSnapshot(
  snapshot: PaymentClaimXeroReadinessSnapshot,
): PaymentClaimXeroPayloadResult {
  const resolved = resolvePaymentClaimXeroDependencies(snapshot);
  const taxDiagnostics = (): PaymentClaimXeroPayloadDiagnostics => ({
    organizationId: typeof snapshot.organization.id === "string" ? snapshot.organization.id : null,
    claimId: typeof snapshot.claim.id === "string" ? snapshot.claim.id : null,
    accountTaxType: resolved.revenueTaxResolution.status === "resolved"
      ? resolved.revenueTaxResolution.externalTaxType
      : resolved.revenueTaxResolution.accountTaxType,
    selectedTaxType: typeof resolved.revenueTaxRate?.tax_type === "string"
      ? resolved.revenueTaxRate.tax_type
      : null,
    selectedTaxRateId: typeof resolved.revenueTaxRate?.id === "string"
      ? resolved.revenueTaxRate.id
      : null,
    selectedEffectiveRate: Number.isFinite(Number(resolved.revenueTaxRate?.effective_rate))
      ? Number(resolved.revenueTaxRate?.effective_rate)
      : null,
  });
  const readiness = evaluatePaymentClaimXeroReadinessSnapshot(snapshot);
  const nonGstReadinessBlocker = readiness.blockers.find(
    (blocker) => blocker.code !== "sales_tax_rate_gst_mismatch",
  );
  if (nonGstReadinessBlocker) {
    throw new PaymentClaimXeroPayloadError(
      "not_ready",
      nonGstReadinessBlocker.message,
      taxDiagnostics(),
    );
  }

  if (
    !resolved.importedContact
    || !resolved.salesMapping
    || !resolved.salesAccount
    || !resolved.revenueTaxRate
    || (resolved.retentionRequired && (!resolved.retentionMapping || !resolved.retentionAccount))
  ) {
    throw new PaymentClaimXeroPayloadError(
      "not_ready",
      "Resolved Xero accounting dependencies are incomplete.",
      taxDiagnostics(),
    );
  }

  const claim = snapshot.claim;
  const claimNumber = requiredText(claim.claim_number, "Payment Claim number");
  const claimTitle = requiredText(claim.claim_title, "Payment Claim title");
  const projectName = requiredText(snapshot.project.name, "project name");
  const invoiceDate = requiredDate(claim.claim_date, "Payment Claim date");
  const dueDate = requiredDate(claim.due_date, "Payment Claim due date");
  const contactId = requiredText(resolved.importedContact.contact_id, "client Xero ContactID");
  const salesAccountCode = requiredText(resolved.salesAccount.external_code, "Payment Claims Xero AccountCode");
  const retentionAccountCode = resolved.retentionAccount
    ? requiredText(resolved.retentionAccount.external_code, "Retention Receivable Xero AccountCode")
    : null;
  const taxType = requiredText(resolved.revenueTaxRate.tax_type, "synchronized revenue TaxType");

  const revenueCents = toCents(claim.claim_amount, "claim_amount");
  const retentionWithheldCents = toCents(claim.retention_withheld_amount, "retention_withheld_amount");
  const retentionReleasedCents = toCents(claim.retention_released_amount, "retention_released_amount");
  const persistedSubtotalCents = toCents(claim.net_claim_excl_gst, "net_claim_excl_gst");
  const persistedGstCents = toCents(claim.gst_amount, "gst_amount");
  const persistedTotalCents = toCents(claim.total_payable, "total_payable");
  assertNonNegative(revenueCents, "claim_amount");
  assertNonNegative(retentionWithheldCents, "retention_withheld_amount");
  assertNonNegative(retentionReleasedCents, "retention_released_amount");
  assertNonNegative(persistedSubtotalCents, "net_claim_excl_gst");
  assertNonNegative(persistedGstCents, "gst_amount");
  assertNonNegative(persistedTotalCents, "total_payable");

  const signedRetentionCents = retentionReleasedCents - retentionWithheldCents;
  const subtotalCents = revenueCents + signedRetentionCents;
  if (subtotalCents !== persistedSubtotalCents) {
    throw new PaymentClaimXeroPayloadError(
      "subtotal_mismatch",
      "Persisted claim revenue and retention do not reconcile to net_claim_excl_gst.",
    );
  }

  const effectiveRateBasisPoints = Math.round(Number(resolved.revenueTaxRate.effective_rate) * 100);
  if (
    !Number.isInteger(effectiveRateBasisPoints)
    || effectiveRateBasisPoints < 0
  ) {
    throw new PaymentClaimXeroPayloadError("not_ready", "The resolved synchronized revenue TaxType is invalid.");
  }
  const revenueTaxCents = applyBasisPoints(revenueCents, effectiveRateBasisPoints);
  const retentionTaxCents = signedRetentionCents === 0
    ? 0
    : applyBasisPoints(signedRetentionCents, effectiveRateBasisPoints);
  const calculatedTaxCents = revenueTaxCents + retentionTaxCents;
  if (Math.abs(calculatedTaxCents - persistedGstCents) > 1) {
    throw new PaymentClaimXeroPayloadError(
      "gst_mismatch",
      "The synchronized Xero TaxType does not reconcile to persisted gst_amount within one cent.",
      taxDiagnostics(),
    );
  }
  if (persistedSubtotalCents + persistedGstCents !== persistedTotalCents) {
    throw new PaymentClaimXeroPayloadError(
      "total_mismatch",
      "Persisted net_claim_excl_gst and gst_amount do not reconcile to total_payable.",
    );
  }

  const lineItems: PaymentClaimXeroSalesInvoicePayload["LineItems"] = [{
    Description: `Payment Claim ${claimNumber} — ${claimTitle}`,
    Quantity: 1,
    UnitAmount: centsToAmount(revenueCents),
    AccountCode: salesAccountCode,
    TaxType: taxType,
  }];
  if (signedRetentionCents !== 0) {
    lineItems.push({
      Description: `${signedRetentionCents < 0 ? "Retention withheld" : "Retention released"} — Payment Claim ${claimNumber}`,
      Quantity: 1,
      UnitAmount: centsToAmount(signedRetentionCents),
      AccountCode: retentionAccountCode!,
      TaxType: taxType,
    });
  }

  return {
    payload: {
      Type: "ACCREC",
      Contact: { ContactID: contactId },
      InvoiceNumber: claimNumber,
      Reference: `${projectName} | Claim ${claimNumber}`,
      Date: invoiceDate,
      DueDate: dueDate,
      CurrencyCode: requiredText(
        snapshot.organization.default_currency,
        "organization currency",
      ).toUpperCase(),
      LineAmountTypes: "Exclusive",
      Status: "AUTHORISED",
      LineItems: lineItems,
    },
    reconciliation: {
      revenueAmount: centsToAmount(revenueCents),
      signedRetentionAmount: centsToAmount(signedRetentionCents),
      subtotal: centsToAmount(subtotalCents),
      gst: centsToAmount(persistedGstCents),
      total: centsToAmount(persistedTotalCents),
    },
  };
}

export async function buildPaymentClaimXeroPayload(params: {
  organizationId: string;
  claimId: string;
}): Promise<PaymentClaimXeroPayloadResult> {
  const resolution = await resolvePaymentClaimXeroReadinessContext(params);
  if (!resolution.snapshot) {
    throw new PaymentClaimXeroPayloadError("not_ready", "Payment Claim is not ready to synchronize to Xero.");
  }
  return buildPaymentClaimXeroPayloadFromResolvedSnapshot(resolution.snapshot);
}
