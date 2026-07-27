import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getXeroInvoice,
  updateXeroSalesInvoice,
  XeroRequestError,
} from "@/lib/xero/client";
import { buildPaymentClaimXeroCurrentStateHashFromPayload } from "@/lib/xero/payment-claim-sales-invoice-hash";
import {
  buildPaymentClaimXeroPayloadFromResolvedSnapshot,
  PaymentClaimXeroPayloadError,
} from "@/lib/xero/payment-claim-sales-invoice-payload";
import {
  evaluatePaymentClaimXeroReadinessSnapshot,
  resolvePaymentClaimXeroReadinessContext,
} from "@/lib/xero/payment-claim-readiness";
import { hasXeroInvoiceScope, XERO_INVOICE_SCOPE_RECONNECT_MESSAGE } from "@/lib/xero/scopes";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type UntypedAdmin = {
  // Stage 1 polymorphic fields are not present in every generated client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type ExistingXeroSalesInvoiceUpdateErrorCode =
  | "document_not_found"
  | "invalid_document"
  | "create_required"
  | "not_ready"
  | "stale_job"
  | "connection_mismatch"
  | "invoice_missing_in_xero"
  | "invoice_identity_mismatch"
  | "invoice_partially_paid"
  | "invoice_fully_paid"
  | "invoice_voided_or_deleted"
  | "invoice_locked"
  | "xero_retrieval_failed"
  | "xero_update_rejected"
  | "invalid_xero_invoice";

export class ExistingXeroSalesInvoiceUpdateError extends Error {
  readonly code: ExistingXeroSalesInvoiceUpdateErrorCode;
  readonly isRetryable: boolean;

  constructor(
    code: ExistingXeroSalesInvoiceUpdateErrorCode,
    message: string,
    options?: { isRetryable?: boolean },
  ) {
    super(message);
    this.name = "ExistingXeroSalesInvoiceUpdateError";
    this.code = code;
    this.isRetryable = options?.isRetryable ?? false;
  }
}

export type ExistingXeroSalesInvoiceUpdateResult = {
  invoiceId: string;
  invoiceNumber: string;
  rawStatus: string;
  normalizedStatus: string;
  currentHash: string;
  idempotencyKey: string;
};

function adminDb(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedAdmin;
}

function readString(value: Row, ...keys: string[]) {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return null;
}

function readMoney(value: Row, ...keys: string[]) {
  for (const key of keys) {
    const numeric = Number(value[key]);
    if (Number.isFinite(numeric)) return Math.round(numeric * 100);
  }
  return null;
}

function normalizeProviderStatus(rawStatus: string) {
  switch (rawStatus.toUpperCase()) {
    case "DRAFT": return "draft";
    case "SUBMITTED": return "awaiting_approval";
    case "AUTHORISED": return "awaiting_payment";
    case "PAID": return "paid";
    case "VOIDED": return "voided";
    case "DELETED": return "deleted";
    default: return "unknown";
  }
}

export function buildExistingXeroSalesInvoiceUpdateIdempotencyKey(params: {
  invoiceId: string;
  currentHash: string;
}) {
  return createHash("sha256")
    .update(`xero:accrec:update:${params.invoiceId}:${params.currentHash}`)
    .digest("hex");
}

async function persistAttention(params: {
  db: UntypedAdmin;
  organizationId: string;
  documentId: string;
  invoiceId: string;
  code: ExistingXeroSalesInvoiceUpdateErrorCode;
  message: string;
}) {
  const result = await params.db
    .from("organization_accounting_documents")
    .update({
      export_status: "attention_required",
      last_error_code: params.code,
      last_error_message: params.message,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.documentId)
    .eq("external_document_id", params.invoiceId)
    .select("id")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
}

function validateInvoiceIdentity(params: {
  invoice: XeroInvoice;
  invoiceId: string;
  invoiceNumber: string;
}) {
  const row = params.invoice as Row;
  if (
    readString(row, "InvoiceID", "invoiceID") !== params.invoiceId
    || readString(row, "InvoiceNumber", "invoiceNumber") !== params.invoiceNumber
    || readString(row, "Type", "type") !== "ACCREC"
  ) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "invoice_identity_mismatch",
      "The linked Xero invoice identity does not match this Payment Claim.",
    );
  }
  return row;
}

function assertProviderAllowsFinancialUpdate(invoice: Row) {
  const status = (readString(invoice, "Status", "status") ?? "UNKNOWN").toUpperCase();
  if (status === "VOIDED" || status === "DELETED") {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "invoice_voided_or_deleted",
      "The linked Xero invoice is voided or deleted and will not be recreated.",
    );
  }
  if (status === "PAID") {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "invoice_fully_paid",
      "The linked Xero invoice is fully paid and cannot receive a financial update.",
    );
  }
  const amountPaidCents = readMoney(invoice, "AmountPaid", "amountPaid");
  if (amountPaidCents !== null && amountPaidCents > 0) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "invoice_partially_paid",
      "The linked Xero invoice is partially paid and cannot receive a financial update.",
    );
  }
  if (!["DRAFT", "SUBMITTED", "AUTHORISED"].includes(status)) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "xero_update_rejected",
      "The linked Xero invoice is not in an updateable unpaid state.",
    );
  }
}

function validateReturnedAccountingState(params: {
  invoice: XeroInvoice;
  invoiceId: string;
  invoiceNumber: string;
  contactId: string;
  expectedSubtotalCents: number;
  expectedTaxCents: number;
  expectedTotalCents: number;
  expectedStatus: string;
}) {
  const row = validateInvoiceIdentity(params);
  const contact = row.Contact && typeof row.Contact === "object" ? row.Contact as Row : {};
  const subtotalCents = readMoney(row, "SubTotal", "subTotal");
  const taxCents = readMoney(row, "TotalTax", "totalTax");
  const totalCents = readMoney(row, "Total", "total");
  const rawStatus = readString(row, "Status", "status");
  if (
    readString(contact, "ContactID", "contactID") !== params.contactId
    || subtotalCents !== params.expectedSubtotalCents
    || taxCents === null
    || Math.abs(taxCents - params.expectedTaxCents) > 1
    || totalCents !== params.expectedTotalCents
    || rawStatus !== params.expectedStatus
  ) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "invalid_xero_invoice",
      "The refreshed Xero invoice does not match the authoritative Payment Claim state.",
    );
  }
  return {
    rawStatus,
    normalizedStatus: normalizeProviderStatus(rawStatus),
    total: totalCents / 100,
    tax: taxCents / 100,
  };
}

export async function updateExistingXeroSalesInvoice(params: {
  organizationId: string;
  accountingDocumentId: string;
  queuedHash: string;
  workerJobId: string;
}): Promise<ExistingXeroSalesInvoiceUpdateResult> {
  const db = adminDb(await createAdminSupabaseClient());
  const documentResult = await db
    .from("organization_accounting_documents")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .maybeSingle();
  if (documentResult.error) throw new Error(documentResult.error.message);
  const document = documentResult.data as Row | null;
  if (!document) {
    throw new ExistingXeroSalesInvoiceUpdateError("document_not_found", "Accounting document not found.");
  }
  if (
    document.provider !== "xero"
    || document.local_document_type !== "project_claim"
    || !readString(document, "project_claim_id")
    || document.local_document_id != null
    || document.current_version_id != null
  ) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "invalid_document",
      "The accounting document does not represent a Payment Claim.",
    );
  }
  const invoiceId = readString(document, "external_document_id");
  if (!invoiceId) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "create_required",
      "This Payment Claim has no Xero InvoiceID and must use the initial create path.",
    );
  }

  const resolution = await resolvePaymentClaimXeroReadinessContext({
    organizationId: params.organizationId,
    claimId: readString(document, "project_claim_id")!,
  });
  if (!resolution.snapshot || !evaluatePaymentClaimXeroReadinessSnapshot(resolution.snapshot).ready) {
    throw new ExistingXeroSalesInvoiceUpdateError("not_ready", "Payment Claim is not ready for Xero.");
  }
  if (resolution.snapshot.accountingDocuments[0]?.id !== params.accountingDocumentId) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "invalid_document",
      "The resolved current accounting document does not match the queued Payment Claim document.",
    );
  }

  let payloadResult;
  try {
    payloadResult = buildPaymentClaimXeroPayloadFromResolvedSnapshot(resolution.snapshot);
  } catch (error) {
    if (error instanceof PaymentClaimXeroPayloadError) {
      throw new ExistingXeroSalesInvoiceUpdateError("not_ready", error.message);
    }
    throw error;
  }
  const { hash: currentHash } = buildPaymentClaimXeroCurrentStateHashFromPayload({
    snapshot: resolution.snapshot,
    payloadResult,
  });
  if (!params.queuedHash.trim() || params.queuedHash !== currentHash) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "stale_job",
      "The queued Payment Claim state is stale; no Xero update was attempted.",
    );
  }

  const tokenState = await getFreshXeroAccessToken(params.organizationId);
  if (
    tokenState.connection.id !== document.accounting_connection_id
    || tokenState.connection.tenant_id !== document.tenant_id
    || !hasXeroInvoiceScope(tokenState.connection.scope)
  ) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "connection_mismatch",
      !hasXeroInvoiceScope(tokenState.connection.scope)
        ? XERO_INVOICE_SCOPE_RECONNECT_MESSAGE
        : "The Xero connection or tenant no longer matches the accounting document.",
    );
  }

  const accessToken = tokenState.tokenSet.access_token;
  const tenantId = document.tenant_id as string;
  let beforeRows: XeroInvoice[];
  try {
    beforeRows = await getXeroInvoice(accessToken, tenantId, invoiceId);
  } catch (error) {
    const missing = error instanceof XeroRequestError && error.status === 404;
    const code: ExistingXeroSalesInvoiceUpdateErrorCode = missing
      ? "invoice_missing_in_xero"
      : "xero_retrieval_failed";
    const message = missing
      ? "The stored Xero InvoiceID no longer exists; no replacement invoice was created."
      : "The linked Xero invoice could not be retrieved before update.";
    await persistAttention({
      db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
      invoiceId, code, message,
    });
    throw new ExistingXeroSalesInvoiceUpdateError(
      code,
      message,
      { isRetryable: missing ? false : error instanceof XeroRequestError ? error.isRetryable : true },
    );
  }
  if (!beforeRows[0]) {
    const error = new ExistingXeroSalesInvoiceUpdateError(
      "invoice_missing_in_xero",
      "The stored Xero InvoiceID no longer exists; no replacement invoice was created.",
    );
    await persistAttention({
      db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
      invoiceId, code: error.code, message: error.message,
    });
    throw error;
  }

  try {
    const currentInvoice = validateInvoiceIdentity({
      invoice: beforeRows[0], invoiceId, invoiceNumber: payloadResult.payload.InvoiceNumber,
    });
    assertProviderAllowsFinancialUpdate(currentInvoice);
  } catch (error) {
    if (error instanceof ExistingXeroSalesInvoiceUpdateError) {
      await persistAttention({
        db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
        invoiceId, code: error.code, message: error.message,
      });
    }
    throw error;
  }

  const idempotencyKey = buildExistingXeroSalesInvoiceUpdateIdempotencyKey({ invoiceId, currentHash });
  let updateRows: XeroInvoice[];
  try {
    updateRows = await updateXeroSalesInvoice({
      accessToken,
      tenantId,
      invoiceId,
      invoice: payloadResult.payload,
      idempotencyKey,
    });
  } catch (error) {
    const locked = error instanceof Error && /lock(?:ed)? period/i.test(error.message);
    const code: ExistingXeroSalesInvoiceUpdateErrorCode = locked ? "invoice_locked" : "xero_update_rejected";
    const message = locked
      ? "Xero rejected the update because the invoice is in a locked period."
      : "Xero rejected the linked Sales Invoice update.";
    await persistAttention({
      db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
      invoiceId, code, message,
    });
    throw new ExistingXeroSalesInvoiceUpdateError(code, message, {
      isRetryable: error instanceof XeroRequestError ? error.isRetryable : true,
    });
  }
  if (!updateRows[0]) {
    const message = "Xero did not return the updated Sales Invoice identity.";
    await persistAttention({
      db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
      invoiceId, code: "invalid_xero_invoice", message,
    });
    throw new ExistingXeroSalesInvoiceUpdateError("invalid_xero_invoice", message, { isRetryable: true });
  }
  try {
    const updateResponse = updateRows[0] as Row;
    if (updateResponse.HasErrors === true || updateResponse.hasErrors === true) {
      throw new ExistingXeroSalesInvoiceUpdateError(
        "xero_update_rejected",
        "Xero rejected the linked Sales Invoice update.",
      );
    }
    validateInvoiceIdentity({
      invoice: updateRows[0], invoiceId, invoiceNumber: payloadResult.payload.InvoiceNumber,
    });
  } catch (error) {
    if (error instanceof ExistingXeroSalesInvoiceUpdateError) {
      await persistAttention({
        db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
        invoiceId, code: error.code, message: error.message,
      });
    }
    throw error;
  }

  let refreshedRows: XeroInvoice[];
  try {
    refreshedRows = await getXeroInvoice(accessToken, tenantId, invoiceId);
  } catch (error) {
    const message = "The updated Xero invoice could not be verified.";
    await persistAttention({
      db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
      invoiceId, code: "xero_retrieval_failed", message,
    });
    throw new ExistingXeroSalesInvoiceUpdateError(
      "xero_retrieval_failed",
      message,
      { isRetryable: error instanceof XeroRequestError ? error.isRetryable : true },
    );
  }
  if (!refreshedRows[0]) {
    const message = "The updated Xero invoice could not be verified.";
    await persistAttention({
      db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
      invoiceId, code: "invalid_xero_invoice", message,
    });
    throw new ExistingXeroSalesInvoiceUpdateError("invalid_xero_invoice", message, { isRetryable: true });
  }

  let refreshedState;
  try {
    refreshedState = validateReturnedAccountingState({
      invoice: refreshedRows[0],
      invoiceId,
      invoiceNumber: payloadResult.payload.InvoiceNumber,
      contactId: payloadResult.payload.Contact.ContactID,
      expectedSubtotalCents: Math.round(payloadResult.reconciliation.subtotal * 100),
      expectedTaxCents: Math.round(payloadResult.reconciliation.gst * 100),
      expectedTotalCents: Math.round(payloadResult.reconciliation.total * 100),
      expectedStatus: payloadResult.payload.Status,
    });
  } catch (error) {
    if (error instanceof ExistingXeroSalesInvoiceUpdateError) {
      await persistAttention({
        db, organizationId: params.organizationId, documentId: params.accountingDocumentId,
        invoiceId, code: error.code, message: error.message,
      });
    }
    throw error;
  }

  const synchronizedAt = new Date().toISOString();
  const persistence = await db
    .from("organization_accounting_documents")
    .update({
      external_document_number: payloadResult.payload.InvoiceNumber,
      amount_exported: refreshedState.total,
      tax_exported: refreshedState.tax,
      exported_at: synchronizedAt,
      raw_external_status: refreshedState.rawStatus,
      normalized_external_status: refreshedState.normalizedStatus,
      last_synced_at: synchronizedAt,
      last_synced_hash: currentHash,
      export_status: "exported",
      last_error_code: null,
      last_error_message: null,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .eq("external_document_id", invoiceId)
    .select("id")
    .maybeSingle();
  if (persistence.error) throw new Error(persistence.error.message);
  if (!persistence.data) {
    throw new ExistingXeroSalesInvoiceUpdateError(
      "invoice_identity_mismatch",
      "The accounting document InvoiceID changed while the update was being persisted.",
    );
  }

  return {
    invoiceId,
    invoiceNumber: payloadResult.payload.InvoiceNumber,
    rawStatus: refreshedState.rawStatus,
    normalizedStatus: refreshedState.normalizedStatus,
    currentHash,
    idempotencyKey,
  };
}
