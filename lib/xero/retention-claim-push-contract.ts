import {
  ACCOUNTING_CANONICAL_SCHEMA_VERSION,
  hashAccountingEvidence,
  hashAccountingLines,
} from "@/lib/accounting/accounting-evidence";
import type {
  RetentionClaimXeroAccountingLine,
  RetentionClaimXeroPayload,
} from "@/lib/xero/retention-claim-sales-invoice-payload";

export const RETENTION_CLAIM_INITIAL_PUSH_JOB =
  "xero.retention_claim.initial_push";
export const RETENTION_CLAIM_REPLACEMENT_JOB =
  "xero.retention_claim.replacement";
export const RETENTION_CLAIM_UPDATE_JOB =
  "xero.retention_claim.update";
export const RETENTION_CLAIM_PUSH_PERMISSION =
  "retention.claims.xero.manage";
export const RETENTION_CLAIM_PUSH_SCHEMA =
  `${ACCOUNTING_CANONICAL_SCHEMA_VERSION}:master-retention-structured-v2`;

export type RetentionClaimRevisionLineEvidence = {
  sequence: number;
  lineKind: "retention";
  sourceLineType: "payment_claim_retention";
  sourceLineId: string;
  originatingPaymentClaimId: string;
  description: string;
  quantity: 1;
  unitAmountMinor: number;
  lineAmountMinor: number;
  taxMinor: number;
  totalMinor: number;
  accountSnapshot: Record<string, unknown>;
  taxSnapshot: Record<string, unknown>;
  trackingSnapshot: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
};

export type RetentionClaimPushProposal = {
  operation: "INITIAL_EXPORT" | "UPDATE_EXISTING_INVOICE" | "REPLACEMENT_EXPORT";
  proposalId: string;
  expiresAt: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  retentionClaimId: string;
  retentionClaimNumber: string;
  retentionClaimTitle: string;
  sourceOptimisticRevision: string;
  accountingDocumentId: string | null;
  previousRevisionId: string | null;
  previousInvoiceId: string | null;
  previousInvoiceNumber: string | null;
  previousInvoiceDate: string | null;
  previousDueDate: string | null;
  previousObservationId: string | null;
  predecessorObservationHash: string | null;
  connectionId: string;
  tenantId: string;
  xeroOrganizationName: string;
  contactId: string;
  contactName: string;
  invoiceNumber: string;
  reference: string;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  lineAmountType: "Exclusive";
  providerDocumentType: "ACCREC";
  requestedProviderStatus: "AUTHORISED";
  lines: RetentionClaimRevisionLineEvidence[];
  allocations: RetentionClaimXeroAccountingLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  previousSubtotalMinor: number;
  previousTaxMinor: number;
  previousTotalMinor: number;
  differenceMinor: number;
  newlyAddedOriginIds: string[];
  sourceEvidence: Record<string, unknown>;
  commercialSnapshot: Record<string, unknown>;
  contactSnapshot: Record<string, unknown>;
  routingSnapshot: Record<string, unknown>;
  taxSnapshot: Record<string, unknown>;
  ownershipSnapshot: Record<string, unknown>;
  payloadTemplate: RetentionClaimXeroPayload;
  sourceEvidenceHash: string;
  dependencyHash: string;
  commercialHash: string;
  linesHash: string;
  payloadHash: string;
  previewHash: string;
  retentionSourceEvidenceHash: string;
  confirmationTitle: string;
  confirmationMessage: string;
};

export function buildRetentionClaimRevisionLines(params: {
  payload: RetentionClaimXeroPayload;
  lines: RetentionClaimXeroAccountingLine[];
}): RetentionClaimRevisionLineEvidence[] {
  return params.lines.map((line, index) => {
    const payloadLine = params.payload.LineItems[index];
    if (!payloadLine) throw new Error("Retention Claim line evidence is incomplete.");
    return {
      sequence: line.sequence,
      lineKind: "retention",
      sourceLineType: "payment_claim_retention",
      sourceLineId: line.allocationId,
      originatingPaymentClaimId: line.originatingPaymentClaimId,
      description: line.description,
      quantity: 1,
      unitAmountMinor: Math.round(line.lineAmountExclTax * 100),
      lineAmountMinor: Math.round(line.lineAmountExclTax * 100),
      taxMinor: Math.round(line.taxAmount * 100),
      totalMinor: Math.round(line.grossAmount * 100),
      accountSnapshot: { accountCode: payloadLine.AccountCode },
      taxSnapshot: { taxType: payloadLine.TaxType },
      trackingSnapshot: {},
      sourceSnapshot: {
        allocationId: line.allocationId,
        originatingPaymentClaimId: line.originatingPaymentClaimId,
        originClaimNumber: line.originClaimNumber,
      },
    };
  });
}

export function calculateRetentionClaimPushHashes(params: {
  sourceEvidence: Record<string, unknown>;
  dependencies: Record<string, unknown>;
  commercialSnapshot: Record<string, unknown>;
  lines: RetentionClaimRevisionLineEvidence[];
  payload: RetentionClaimXeroPayload;
}) {
  const sourceEvidenceHash = hashAccountingEvidence(
    params.sourceEvidence,
    RETENTION_CLAIM_PUSH_SCHEMA,
  );
  const dependencyHash = hashAccountingEvidence(
    params.dependencies,
    RETENTION_CLAIM_PUSH_SCHEMA,
  );
  const commercialHash = hashAccountingEvidence(
    params.commercialSnapshot,
    RETENTION_CLAIM_PUSH_SCHEMA,
  );
  const linesHash = hashAccountingLines(params.lines);
  const payloadHash = hashAccountingEvidence(
    params.payload,
    RETENTION_CLAIM_PUSH_SCHEMA,
  );
  const previewHash = hashAccountingEvidence({
    sourceEvidenceHash,
    dependencyHash,
    commercialHash,
    linesHash,
    payloadHash,
  }, RETENTION_CLAIM_PUSH_SCHEMA);
  return {
    sourceEvidenceHash,
    dependencyHash,
    commercialHash,
    linesHash,
    payloadHash,
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

export function verifyRetentionClaimXeroInvoice(params: {
  expected: RetentionClaimXeroPayload;
  actual: XeroRow;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}) {
  const reasons: string[] = [];
  const actual = params.actual;
  const contact = value(actual, "Contact", "contact") as XeroRow | null;
  const linesValue = value(actual, "LineItems", "lineItems");
  const lines = Array.isArray(linesValue) ? linesValue as XeroRow[] : [];
  if (!text(actual, "InvoiceID", "invoiceID")) reasons.push("missing_invoice_id");
  if (text(actual, "Type", "type") !== "ACCREC") reasons.push("wrong_type");
  if (text(actual, "Status", "status") !== "AUTHORISED") reasons.push("wrong_status");
  if (text(actual, "InvoiceNumber", "invoiceNumber") !== params.expected.InvoiceNumber) reasons.push("wrong_number");
  if (text(contact ?? {}, "ContactID", "contactID") !== params.expected.Contact.ContactID) reasons.push("wrong_contact");
  if (text(actual, "Reference", "reference") !== params.expected.Reference) reasons.push("wrong_reference");
  if (normalizedDate(value(actual, "Date", "date")) !== params.expected.Date) reasons.push("wrong_date");
  if (normalizedDate(value(actual, "DueDate", "dueDate")) !== params.expected.DueDate) reasons.push("wrong_due_date");
  if (text(actual, "CurrencyCode", "currencyCode") !== "NZD") reasons.push("wrong_currency");
  if (text(actual, "LineAmountTypes", "lineAmountTypes") !== "Exclusive") reasons.push("wrong_line_amount_type");
  if (lines.length !== params.expected.LineItems.length) reasons.push("wrong_line_count");
  params.expected.LineItems.forEach((line, index) => {
    const found = lines[index] ?? {};
    if (text(found, "Description", "description") !== line.Description) reasons.push(`line_${index + 1}_description`);
    if (moneyMinor(found, "UnitAmount", "unitAmount") !== Math.round(line.UnitAmount * 100)) reasons.push(`line_${index + 1}_amount`);
    if (text(found, "AccountCode", "accountCode") !== line.AccountCode) reasons.push(`line_${index + 1}_account`);
    if (text(found, "TaxType", "taxType") !== line.TaxType) reasons.push(`line_${index + 1}_tax`);
  });
  if (moneyMinor(actual, "SubTotal", "subTotal") !== params.subtotalMinor) reasons.push("wrong_subtotal");
  if (moneyMinor(actual, "TotalTax", "totalTax") !== params.taxMinor) reasons.push("wrong_tax");
  if (moneyMinor(actual, "Total", "total") !== params.totalMinor) reasons.push("wrong_total");
  if (moneyMinor(actual, "AmountPaid", "amountPaid") !== 0) reasons.push("amount_paid_not_zero");
  if (moneyMinor(actual, "AmountCredited", "amountCredited") !== 0) reasons.push("amount_credited_not_zero");
  if (Array.isArray(value(actual, "Payments", "payments"))
    && (value(actual, "Payments", "payments") as unknown[]).length > 0) reasons.push("payments_present");
  if (Array.isArray(value(actual, "CreditNotes", "creditNotes"))
    && (value(actual, "CreditNotes", "creditNotes") as unknown[]).length > 0) reasons.push("credits_present");
  return { exact: reasons.length === 0, reasons };
}
