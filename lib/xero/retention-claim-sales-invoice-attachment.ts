import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getXeroInvoice,
  putXeroInvoiceAttachment,
  XeroRequestError,
} from "@/lib/xero/client";
import { hasXeroAttachmentScope, XERO_ATTACHMENT_SCOPE_RECONNECT_MESSAGE } from "@/lib/xero/scopes";
import { getFreshXeroAccessToken } from "@/lib/xero/service";

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

export class RetentionClaimXeroAttachmentError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "RetentionClaimXeroAttachmentError";
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

export async function attachRetentionClaimPdfToXeroInvoice(params: {
  organizationId: string;
  accountingDocumentId: string;
  accountingSnapshotId: string;
  queuedPdfSha256: string;
  workerJobId: string;
}) {
  const adminClient = await createAdminSupabaseClient();
  const admin = db(adminClient);
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
    throw new RetentionClaimXeroAttachmentError("evidence_not_found", "Retention Claim attachment evidence was not found.");
  }
  const invoiceId = text(document.external_document_id);
  if (
    document.local_document_type !== "retention_claim"
    || document.provider !== "xero"
    || !invoiceId
    || text(document.last_synced_hash) !== text(snapshot.payload_sha256)
    || text(snapshot.retention_pdf_sha256) !== params.queuedPdfSha256
  ) {
    throw new RetentionClaimXeroAttachmentError("identity_mismatch", "The Retention Claim invoice or attachment identity is invalid.");
  }

  const retentionDocument = await admin.from("retention_claim_documents").select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", snapshot.retention_document_id)
    .eq("retention_claim_id", snapshot.retention_claim_id)
    .eq("source_evidence_hash", snapshot.retention_source_evidence_hash)
    .eq("pdf_sha256", snapshot.retention_pdf_sha256).maybeSingle();
  if (retentionDocument.error || !retentionDocument.data) {
    throw new RetentionClaimXeroAttachmentError("document_mismatch", "The immutable Phase 8 Retention Claim PDF evidence no longer matches.");
  }
  const pdf = retentionDocument.data as Row;

  const token = await getFreshXeroAccessToken(params.organizationId);
  if (
    token.connection.id !== document.accounting_connection_id
    || token.connection.tenant_id !== document.tenant_id
    || token.connection.id !== snapshot.connection_id_snapshot
    || token.connection.tenant_id !== snapshot.tenant_id_snapshot
  ) {
    throw new RetentionClaimXeroAttachmentError("connection_mismatch", "The connected Xero tenant does not match the immutable accounting snapshot.");
  }
  if (!hasXeroAttachmentScope(token.connection.scope)) {
    throw new RetentionClaimXeroAttachmentError("missing_scope", XERO_ATTACHMENT_SCOPE_RECONNECT_MESSAGE);
  }

  const xeroInvoice = (await getXeroInvoice(
    token.tokenSet.access_token,
    String(document.tenant_id),
    invoiceId,
  ))[0];
  if (
    !xeroInvoice
    || xeroInvoice.InvoiceID !== invoiceId
    || xeroInvoice.Type !== "ACCREC"
    || xeroInvoice.InvoiceNumber !== snapshot.invoice_number_snapshot
    || xeroInvoice.InvoiceNumber !== document.external_document_number
  ) {
    throw new RetentionClaimXeroAttachmentError("invoice_identity_mismatch", "Xero returned a different invoice identity.");
  }

  const state = await admin.from("organization_accounting_documents").update({
    attachment_status: "attaching",
    attachment_error_code: null,
    attachment_error_message: null,
  })
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .eq("external_document_id", invoiceId)
    .eq("last_synced_hash", snapshot.payload_sha256)
    .select("id").maybeSingle();
  if (state.error || !state.data) {
    throw new RetentionClaimXeroAttachmentError("concurrent_identity_change", "The Retention Claim invoice identity changed before attachment.");
  }

  const stored = await adminClient.storage
    .from(String(pdf.storage_bucket))
    .download(String(pdf.storage_path));
  if (stored.error || !stored.data) {
    throw new RetentionClaimXeroAttachmentError("storage_download_failed", "The immutable Retention Claim PDF could not be read.", true);
  }
  const bytes = new Uint8Array(await stored.data.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    sha256 !== snapshot.retention_pdf_sha256
    || sha256 !== pdf.pdf_sha256
    || bytes.byteLength !== Number(pdf.byte_length)
    || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new RetentionClaimXeroAttachmentError("content_verification_failed", "The stored Retention Claim PDF failed immutable content verification.");
  }
  if (bytes.byteLength > 10 * 1024 * 1024) {
    throw new RetentionClaimXeroAttachmentError("pdf_too_large", "The Retention Claim PDF exceeds Xero's attachment limit.");
  }

  const fileName = String(pdf.file_name);
  const attachments = await putXeroInvoiceAttachment({
    accessToken: token.tokenSet.access_token,
    tenantId: String(document.tenant_id),
    invoiceId,
    fileName,
    bytes,
    includeOnline: true,
  });
  const attachment = attachments.find((row) => row.FileName === fileName);
  if (!attachment || !text(attachment.Url)?.includes(`/Invoices/${invoiceId}/Attachments/`)) {
    throw new RetentionClaimXeroAttachmentError("invalid_attachment_response", "Xero did not confirm the expected Retention Claim PDF attachment.", true);
  }

  const uploadedAt = new Date().toISOString();
  const completed = await admin.from("organization_accounting_documents").update({
    attachment_status: "attached",
    attachment_filename: fileName,
    attachment_synced_hash: sha256,
    attachment_uploaded_at: uploadedAt,
    attachment_error_code: null,
    attachment_error_message: null,
  })
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .eq("external_document_id", invoiceId)
    .eq("last_synced_hash", snapshot.payload_sha256)
    .select("id").maybeSingle();
  if (completed.error || !completed.data) {
    throw new RetentionClaimXeroAttachmentError("concurrent_identity_change", "The Retention Claim invoice identity changed during attachment.");
  }
  const event = await admin.rpc("record_retention_claim_xero_event", {
    p_accounting_document_id: params.accountingDocumentId,
    p_event_type: "xero_attachment_attached",
    p_actor_user_id: null,
    p_correlation_id: params.workerJobId,
    p_metadata: {
      invoiceId,
      fileName,
      pdfSha256: sha256,
      byteLength: bytes.byteLength,
      attachmentId: text(attachment.AttachmentID),
    },
  });
  if (event.error) throw new Error(event.error.message);
  return {
    documentId: params.accountingDocumentId,
    invoiceId,
    fileName,
    pdfSha256: sha256,
    byteLength: bytes.byteLength,
    uploadedAt,
    attachmentId: text(attachment.AttachmentID),
  };
}

export async function recordRetentionClaimXeroAttachmentError(params: {
  organizationId: string;
  accountingDocumentId: string;
  workerJobId: string;
  error: unknown;
}) {
  const admin = db(await createAdminSupabaseClient());
  const code = params.error instanceof RetentionClaimXeroAttachmentError
    ? params.error.code
    : params.error instanceof XeroRequestError
      ? `xero_http_${params.error.status}`
      : "xero_attachment_failed";
  const message = params.error instanceof Error
    ? params.error.message
    : "Unable to attach the Retention Claim PDF.";
  await admin.from("organization_accounting_documents").update({
    attachment_status: "failed",
    attachment_error_code: code,
    attachment_error_message: message,
  })
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .eq("local_document_type", "retention_claim");
  await admin.rpc("record_retention_claim_xero_event", {
    p_accounting_document_id: params.accountingDocumentId,
    p_event_type: "xero_attachment_failed",
    p_actor_user_id: null,
    p_correlation_id: params.workerJobId,
    p_metadata: { code, message },
  }).catch(() => undefined);
  return message;
}

export async function queueRetentionClaimXeroAttachmentForWorker(params: {
  accountingDocumentId: string;
  actorUserId: string | null;
  correlationId: string;
}) {
  if (!params.actorUserId) {
    throw new RetentionClaimXeroAttachmentError("actor_missing", "The originating Retention Claim Xero actor is missing.");
  }
  const admin = db(await createAdminSupabaseClient());
  const result = await admin.rpc("queue_retention_claim_xero_attachment", {
    p_accounting_document_id: params.accountingDocumentId,
    p_actor_user_id: params.actorUserId,
    p_correlation_id: params.correlationId,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
