import {
  ACCOUNTING_CANONICAL_SCHEMA_VERSION,
  hashAccountingEvidence,
  hashAccountingLines,
  sha256Hex,
} from "@/lib/accounting/accounting-evidence";
import type { PaymentClaimXeroSalesInvoicePayload } from "@/lib/xero/payment-claim-sales-invoice-payload";

export const PAYMENT_CLAIM_INITIAL_PUSH_JOB = "xero.payment_claim.initial_push";
export const PAYMENT_CLAIM_INITIAL_PUSH_ATTACHMENT_JOB =
  "xero.payment_claim.initial_push.attachment";
export const PAYMENT_CLAIM_ACCOUNTING_UPDATE_JOB =
  "xero.payment_claim.accounting_update";
export const PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION =
  "accounting.sales_invoices.push";
export const PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA =
  `${ACCOUNTING_CANONICAL_SCHEMA_VERSION}:payment-claim-initial-push-v1`;

export type InitialPushLineEvidence = {
  sequence: number;
  lineKind: "claim" | "retention";
  sourceLineType: "payment_claim";
  sourceLineId: string | null;
  originatingPaymentClaimId: string;
  description: string;
  quantity: number;
  unitAmountMinor: number;
  lineAmountMinor: number;
  taxMinor: number;
  totalMinor: number;
  accountSnapshot: Record<string, unknown>;
  taxSnapshot: Record<string, unknown>;
  trackingSnapshot: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
};

export type PaymentClaimInitialPushProposal = {
  operation: "INITIAL_EXPORT" | "REPLACEMENT_EXPORT" | "ACCOUNTING_UPDATE";
  previousRevisionId: string | null;
  previousInvoiceId: string | null;
  previousInvoiceNumber: string | null;
  previousObservationId: string | null;
  predecessorObservationHash: string | null;
  confirmationTitle: string;
  confirmationMessage: string;
  proposalId: string;
  expiresAt: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  claimId: string;
  accountingDocumentId: string | null;
  claimNumber: string;
  claimTitle: string;
  invoiceNumber: string;
  sourceOptimisticRevision: string;
  connectionId: string;
  tenantId: string;
  xeroOrganizationName: string;
  contactId: string;
  contactName: string;
  reference: string;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  lineAmountType: "Exclusive";
  providerDocumentType: "ACCREC";
  requestedProviderStatus: "AUTHORISED";
  lines: InitialPushLineEvidence[];
  revenueAmountMinor: number;
  retentionMovementMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  sourceEvidence: Record<string, unknown>;
  commercialSnapshot: Record<string, unknown>;
  contactSnapshot: Record<string, unknown>;
  routingSnapshot: Record<string, unknown>;
  taxSnapshot: Record<string, unknown>;
  payloadTemplate: PaymentClaimXeroSalesInvoicePayload;
  sourceEvidenceHash: string;
  commercialHash: string;
  linesHash: string;
  readinessHash: string;
  dependencyHash: string;
  payloadHash: string;
  previewHash: string;
  pdfModelHash: string | null;
  pdfHash: string | null;
  pdfByteSize: number;
  pdfBase64: string | null;
  statutoryDocumentsIncluded: string[];
};

export function initialPushProposalMatchesToken(params: {
  proposal: Pick<PaymentClaimInitialPushProposal, "projectId" | "previewHash">;
  token: { projectId: string; previewHash: string };
}) {
  return params.proposal.projectId === params.token.projectId
    && params.proposal.previewHash === params.token.previewHash;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function lineTaxMinor(lineAmountMinor: number, invoiceTaxMinor: number, subtotalMinor: number) {
  if (subtotalMinor === 0) return 0;
  return Math.round((lineAmountMinor * invoiceTaxMinor) / subtotalMinor);
}

export function buildInitialPushLineEvidence(params: {
  claimId: string;
  payload: PaymentClaimXeroSalesInvoicePayload;
  taxMinor: number;
  subtotalMinor: number;
}): InitialPushLineEvidence[] {
  let allocatedTax = 0;
  return params.payload.LineItems.map((line, index) => {
    const amountMinor = cents(line.UnitAmount * line.Quantity);
    const taxMinor = index === params.payload.LineItems.length - 1
      ? params.taxMinor - allocatedTax
      : lineTaxMinor(amountMinor, params.taxMinor, params.subtotalMinor);
    allocatedTax += taxMinor;
    return {
      sequence: index + 1,
      lineKind: index === 0 ? "claim" : "retention",
      sourceLineType: "payment_claim",
      sourceLineId: null,
      originatingPaymentClaimId: params.claimId,
      description: line.Description,
      quantity: line.Quantity,
      unitAmountMinor: cents(line.UnitAmount),
      lineAmountMinor: amountMinor,
      taxMinor,
      totalMinor: amountMinor + taxMinor,
      accountSnapshot: { accountCode: line.AccountCode },
      taxSnapshot: { taxType: line.TaxType },
      trackingSnapshot: {},
      sourceSnapshot: { claimId: params.claimId, payloadLineIndex: index },
    };
  });
}

export function calculateInitialPushHashes(params: {
  sourceEvidence: Record<string, unknown>;
  commercialSnapshot: Record<string, unknown>;
  lines: InitialPushLineEvidence[];
  readinessEvidence: Record<string, unknown>;
  payloadTemplate: PaymentClaimXeroSalesInvoicePayload;
  pdfBytes: Uint8Array | null;
}) {
  const sourceEvidenceHash = hashAccountingEvidence(
    params.sourceEvidence,
    PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
  );
  const commercialHash = hashAccountingEvidence(
    params.commercialSnapshot,
    PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
  );
  const linesHash = hashAccountingLines(params.lines);
  const readinessHash = hashAccountingEvidence(
    params.readinessEvidence,
    PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
  );
  const payloadHash = hashAccountingEvidence(
    params.payloadTemplate,
    PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
  );
  const pdfHash = params.pdfBytes ? sha256Hex(params.pdfBytes) : null;
  const previewHash = hashAccountingEvidence({
    sourceEvidenceHash,
    commercialHash,
    linesHash,
    readinessHash,
    payloadHash,
    pdfHash,
  }, PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA);
  return {
    sourceEvidenceHash,
    commercialHash,
    linesHash,
    readinessHash,
    dependencyHash: readinessHash,
    payloadHash,
    pdfHash,
    previewHash,
  };
}

type XeroRow = Record<string, unknown>;

function value(row: XeroRow, ...keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function text(row: XeroRow, ...keys: string[]) {
  const found = value(row, ...keys);
  return typeof found === "string" ? found.trim() : "";
}

function moneyMinor(row: XeroRow, ...keys: string[]) {
  const found = Number(value(row, ...keys));
  return Number.isFinite(found) ? Math.round(found * 100) : null;
}

function normalizedDate(input: unknown) {
  if (typeof input !== "string") return "";
  const iso = input.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const xero = input.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  return xero ? new Date(Number(xero[1])).toISOString().slice(0, 10) : "";
}

export function matchesInitialPushRecoveryCandidate(params: {
  expected: PaymentClaimXeroSalesInvoicePayload;
  candidate: XeroRow;
  expectedTotals: { subtotalMinor: number; taxMinor: number; totalMinor: number };
}) {
  const contact = value(params.candidate, "Contact", "contact") as XeroRow | null;
  return text(params.candidate, "Type", "type") === "ACCREC"
    && text(params.candidate, "InvoiceNumber", "invoiceNumber") === params.expected.InvoiceNumber
    && text(contact ?? {}, "ContactID", "contactID") === params.expected.Contact.ContactID
    && moneyMinor(params.candidate, "SubTotal", "subTotal") === params.expectedTotals.subtotalMinor
    && moneyMinor(params.candidate, "TotalTax", "totalTax") === params.expectedTotals.taxMinor
    && moneyMinor(params.candidate, "Total", "total") === params.expectedTotals.totalMinor
    && Boolean(text(params.candidate, "InvoiceID", "invoiceID"));
}

export function verifyInitialPushXeroInvoice(params: {
  expected: PaymentClaimXeroSalesInvoicePayload;
  actual: XeroRow;
  expectedTotals: { subtotalMinor: number; taxMinor: number; totalMinor: number };
}) {
  const reasons: string[] = [];
  const expected = params.expected;
  const actual = params.actual;
  const contact = value(actual, "Contact", "contact") as XeroRow | null;
  const lines = value(actual, "LineItems", "lineItems");
  const actualLines = Array.isArray(lines) ? lines as XeroRow[] : [];

  if (!text(actual, "InvoiceID", "invoiceID")) reasons.push("missing_invoice_id");
  if (text(actual, "Type", "type") !== "ACCREC") reasons.push("wrong_type");
  if (text(actual, "Status", "status") !== "AUTHORISED") reasons.push("wrong_status");
  if (text(actual, "InvoiceNumber", "invoiceNumber") !== expected.InvoiceNumber) reasons.push("wrong_number");
  if (text(contact ?? {}, "ContactID", "contactID") !== expected.Contact.ContactID) reasons.push("wrong_contact");
  if (text(actual, "Reference", "reference") !== expected.Reference) reasons.push("wrong_reference");
  if (normalizedDate(value(actual, "Date", "date")) !== expected.Date) reasons.push("wrong_date");
  if (normalizedDate(value(actual, "DueDate", "dueDate")) !== expected.DueDate) reasons.push("wrong_due_date");
  if (text(actual, "CurrencyCode", "currencyCode") !== expected.CurrencyCode) reasons.push("wrong_currency");
  if (text(actual, "LineAmountTypes", "lineAmountTypes") !== expected.LineAmountTypes) reasons.push("wrong_line_amount_type");
  if (actualLines.length !== expected.LineItems.length) reasons.push("wrong_line_count");

  expected.LineItems.forEach((line, index) => {
    const found = actualLines[index] ?? {};
    if (text(found, "Description", "description") !== line.Description) reasons.push(`line_${index + 1}_description`);
    if (Number(value(found, "Quantity", "quantity")) !== line.Quantity) reasons.push(`line_${index + 1}_quantity`);
    if (moneyMinor(found, "UnitAmount", "unitAmount") !== cents(line.UnitAmount)) reasons.push(`line_${index + 1}_unit_amount`);
    if (moneyMinor(found, "LineAmount", "lineAmount") !== cents(line.UnitAmount * line.Quantity)) reasons.push(`line_${index + 1}_line_amount`);
    if (text(found, "AccountCode", "accountCode") !== line.AccountCode) reasons.push(`line_${index + 1}_account`);
    if (text(found, "TaxType", "taxType") !== line.TaxType) reasons.push(`line_${index + 1}_tax_type`);
  });

  if (moneyMinor(actual, "SubTotal", "subTotal") !== params.expectedTotals.subtotalMinor) reasons.push("wrong_subtotal");
  if (moneyMinor(actual, "TotalTax", "totalTax") !== params.expectedTotals.taxMinor) reasons.push("wrong_tax");
  if (moneyMinor(actual, "Total", "total") !== params.expectedTotals.totalMinor) reasons.push("wrong_total");
  if (moneyMinor(actual, "AmountPaid", "amountPaid") !== 0) reasons.push("amount_paid_not_zero");
  if (moneyMinor(actual, "AmountCredited", "amountCredited") !== 0) reasons.push("amount_credited_not_zero");
  const payments = value(actual, "Payments", "payments");
  const credits = value(actual, "CreditNotes", "creditNotes");
  if (Array.isArray(payments) && payments.length > 0) reasons.push("payments_present");
  if (Array.isArray(credits) && credits.length > 0) reasons.push("credits_present");

  return { exact: reasons.length === 0, reasons };
}
