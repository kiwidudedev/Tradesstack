import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  createXeroInvoices,
  findXeroInvoicesByNumber,
  getXeroInvoice,
  XeroRequestError,
} from "@/lib/xero/client";
import {
  hashRetentionClaimXeroPayload,
  type RetentionClaimXeroPayload,
} from "@/lib/xero/retention-claim-sales-invoice-payload";
import { hasXeroInvoiceScope, XERO_INVOICE_SCOPE_RECONNECT_MESSAGE } from "@/lib/xero/scopes";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 9 tables intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export class RetentionClaimXeroCreateError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "RetentionClaimXeroCreateError";
    this.code = code;
    this.isRetryable = retryable;
  }
}

function db(client: unknown) {
  return client as Admin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function money(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return Math.round(value * 100) / 100;
  }
  return null;
}

function validateInvoice(invoice: XeroInvoice, expectedNumber: string, expectedId?: string) {
  const row = invoice as Row;
  const id = text(row.InvoiceID) ?? text(row.invoiceID);
  const number = text(row.InvoiceNumber) ?? text(row.invoiceNumber);
  const type = text(row.Type) ?? text(row.type);
  const total = money(row, "Total", "total");
  const tax = money(row, "TotalTax", "totalTax");
  if (!id || number !== expectedNumber || type !== "ACCREC" || total === null || tax === null || (expectedId && id !== expectedId)) {
    throw new RetentionClaimXeroCreateError(
      "invalid_xero_invoice",
      "Xero returned an invoice that does not match the immutable Retention Claim request.",
    );
  }
  return {
    id,
    number,
    status: text(row.Status) ?? text(row.status) ?? "UNKNOWN",
    total,
    tax,
  };
}

function normalizedStatus(raw: string) {
  switch (raw.toUpperCase()) {
    case "DRAFT": return "draft";
    case "SUBMITTED": return "awaiting_approval";
    case "AUTHORISED": return "awaiting_payment";
    case "VOIDED": return "voided";
    case "DELETED": return "deleted";
    default: return "unknown";
  }
}

function uncertain(error: unknown) {
  return !(error instanceof XeroRequestError) || error.isRetryable || error.status === 408;
}

export async function createRetentionClaimXeroSalesInvoice(params: {
  organizationId: string;
  accountingDocumentId: string;
  accountingSnapshotId: string;
  queuedPayloadSha256: string;
  workerJobId: string;
}) {
  const admin = db(await createAdminSupabaseClient());
  const [documentResult, snapshotResult] = await Promise.all([
    admin.from("organization_accounting_documents").select("*")
      .eq("organization_id", params.organizationId)
      .eq("id", params.accountingDocumentId).maybeSingle(),
    admin.from("retention_claim_accounting_snapshots").select("*")
      .eq("organization_id", params.organizationId)
      .eq("id", params.accountingSnapshotId)
      .eq("accounting_document_id", params.accountingDocumentId).maybeSingle(),
  ]);
  if (documentResult.error || snapshotResult.error) {
    throw new Error(documentResult.error?.message ?? snapshotResult.error?.message);
  }
  const document = documentResult.data as Row | null;
  const snapshot = snapshotResult.data as Row | null;
  if (!document || !snapshot) {
    throw new RetentionClaimXeroCreateError("evidence_not_found", "Retention Claim accounting evidence was not found.");
  }
  if (
    document.provider !== "xero"
    || document.local_document_type !== "retention_claim"
    || !text(document.retention_claim_id)
    || document.project_claim_id != null
    || document.local_document_id != null
  ) {
    throw new RetentionClaimXeroCreateError("invalid_document", "The accounting document is not a Retention Claim.");
  }

  const payload = snapshot.payload_snapshot as RetentionClaimXeroPayload;
  const payloadHash = hashRetentionClaimXeroPayload(payload);
  if (
    payloadHash !== snapshot.payload_sha256
    || payloadHash !== params.queuedPayloadSha256
    || text(snapshot.idempotency_key) == null
  ) {
    throw new RetentionClaimXeroCreateError("stale_job", "The queued Retention Claim accounting evidence is invalid or stale.");
  }

  const token = await getFreshXeroAccessToken(params.organizationId);
  if (
    token.connection.id !== document.accounting_connection_id
    || token.connection.tenant_id !== document.tenant_id
    || token.connection.id !== snapshot.connection_id_snapshot
    || token.connection.tenant_id !== snapshot.tenant_id_snapshot
    || !hasXeroInvoiceScope(token.connection.scope)
  ) {
    throw new RetentionClaimXeroCreateError(
      "connection_mismatch",
      !hasXeroInvoiceScope(token.connection.scope)
        ? XERO_INVOICE_SCOPE_RECONNECT_MESSAGE
        : "The connected Xero tenant no longer matches the immutable Retention Claim accounting snapshot.",
    );
  }

  let invoice: XeroInvoice;
  let recovered = false;
  const existingId = text(document.external_document_id);
  if (existingId) {
    const rows = await getXeroInvoice(
      token.tokenSet.access_token,
      String(document.tenant_id),
      existingId,
    );
    if (!rows[0]) {
      throw new RetentionClaimXeroCreateError("invoice_missing", "The recorded Xero invoice could not be verified.");
    }
    invoice = rows[0];
    recovered = true;
  } else {
    try {
      const rows = await createXeroInvoices({
        accessToken: token.tokenSet.access_token,
        tenantId: String(document.tenant_id),
        invoices: [payload],
        idempotencyKey: String(snapshot.idempotency_key),
        fallbackMessage: "Unable to create the Retention Claim Xero Sales Invoice.",
      });
      if (!rows[0]) throw new RetentionClaimXeroCreateError("missing_invoice_identity", "Xero did not return an invoice.", true);
      invoice = rows[0];
    } catch (error) {
      if (!uncertain(error)) throw error;
      const matches = (await findXeroInvoicesByNumber({
        accessToken: token.tokenSet.access_token,
        tenantId: String(document.tenant_id),
        invoiceNumber: String(snapshot.invoice_number_snapshot),
        type: "ACCREC",
      })).filter((row) =>
        row.Type === "ACCREC"
        && row.InvoiceNumber === snapshot.invoice_number_snapshot
        && Boolean(row.InvoiceID)
      );
      if (matches.length !== 1) {
        throw new RetentionClaimXeroCreateError(
          matches.length > 1 ? "ambiguous_recovery" : "missing_invoice_identity",
          matches.length > 1
            ? "More than one Xero ACCREC invoice matched the Retention Claim number."
            : "The Xero create result is uncertain and no matching invoice is visible.",
          matches.length === 0,
        );
      }
      invoice = matches[0];
      recovered = true;
    }
  }

  const initial = validateInvoice(
    invoice,
    String(snapshot.invoice_number_snapshot),
    existingId ?? undefined,
  );
  const refreshed = existingId
    ? invoice
    : (await getXeroInvoice(
        token.tokenSet.access_token,
        String(document.tenant_id),
        initial.id,
      ))[0];
  if (!refreshed) {
    throw new RetentionClaimXeroCreateError("invalid_xero_invoice", "The created Xero invoice could not be verified.", true);
  }
  const verified = validateInvoice(
    refreshed,
    String(snapshot.invoice_number_snapshot),
    initial.id,
  );
  if (
    Math.round(verified.total * 100) !== Math.round(Number(snapshot.total_snapshot) * 100)
    || Math.round(verified.tax * 100) !== Math.round(Number(snapshot.tax_total_snapshot) * 100)
  ) {
    throw new RetentionClaimXeroCreateError("amount_mismatch", "The Xero invoice totals do not match immutable Retention Claim accounting evidence.");
  }

  const synchronizedAt = new Date().toISOString();
  let updateQuery = admin.from("organization_accounting_documents").update({
    external_document_id: verified.id,
    external_document_number: verified.number,
    amount_exported: verified.total,
    tax_exported: verified.tax,
    exported_at: synchronizedAt,
    raw_external_status: verified.status,
    normalized_external_status: normalizedStatus(verified.status),
    last_synced_hash: payloadHash,
    last_synced_at: synchronizedAt,
    export_status: "exported",
    last_error_code: null,
    last_error_message: null,
  })
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .eq("local_document_type", "retention_claim");
  updateQuery = existingId
    ? updateQuery.eq("external_document_id", existingId)
    : updateQuery.is("external_document_id", null);
  const update = await updateQuery
    .select("id").maybeSingle();
  if (update.error || !update.data) {
    throw new RetentionClaimXeroCreateError("concurrent_identity_change", "The Retention Claim accounting identity changed while the Xero result was persisted.");
  }

  const event = await admin.rpc("record_retention_claim_xero_event", {
    p_accounting_document_id: params.accountingDocumentId,
    p_event_type: "xero_invoice_created",
    p_actor_user_id: null,
    p_correlation_id: params.workerJobId,
    p_metadata: {
      invoiceId: verified.id,
      invoiceNumber: verified.number,
      payloadSha256: payloadHash,
      recovered,
    },
  });
  if (event.error) throw new Error(event.error.message);
  return {
    invoiceId: verified.id,
    invoiceNumber: verified.number,
    rawStatus: verified.status,
    normalizedStatus: normalizedStatus(verified.status),
    recovered,
    idempotencyKey: String(snapshot.idempotency_key),
  };
}

export async function recordRetentionClaimXeroCreateError(params: {
  organizationId: string;
  accountingDocumentId: string;
  workerJobId: string;
  error: unknown;
}) {
  const admin = db(await createAdminSupabaseClient());
  const code = params.error instanceof RetentionClaimXeroCreateError
    ? params.error.code
    : params.error instanceof XeroRequestError
      ? `xero_http_${params.error.status}`
      : "xero_sync_failed";
  const message = params.error instanceof Error
    ? params.error.message
    : "Unable to create the Retention Claim Xero invoice.";
  await admin.from("organization_accounting_documents").update({
    export_status: "failed",
    last_error_code: code,
    last_error_message: message,
  })
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .eq("local_document_type", "retention_claim");
  await admin.rpc("record_retention_claim_xero_event", {
    p_accounting_document_id: params.accountingDocumentId,
    p_event_type: "xero_sync_failed",
    p_actor_user_id: null,
    p_correlation_id: params.workerJobId,
    p_metadata: { code, message },
  }).catch(() => undefined);
  return message;
}
