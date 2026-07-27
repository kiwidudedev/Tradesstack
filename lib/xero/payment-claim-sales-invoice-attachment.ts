import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { buildPaymentClaimPdfFileName } from "@/lib/exports/payment-claim-pdf";
import { generatePaymentClaimPdfBundleServer } from "@/lib/exports/payment-claim-pdf-server";
import {
  getXeroInvoice,
  putXeroInvoiceAttachment,
  XeroRequestError,
} from "@/lib/xero/client";
import { buildPaymentClaimXeroCurrentStateHashFromPayload } from "@/lib/xero/payment-claim-sales-invoice-hash";
import { buildPaymentClaimXeroPayloadFromResolvedSnapshot } from "@/lib/xero/payment-claim-sales-invoice-payload";
import { resolvePaymentClaimXeroReadinessContext } from "@/lib/xero/payment-claim-readiness";
import { hasXeroAttachmentScope, XERO_ATTACHMENT_SCOPE_RECONNECT_MESSAGE } from "@/lib/xero/scopes";
import { getFreshXeroAccessToken, getOrganizationXeroConnection } from "@/lib/xero/service";

type Row = Record<string, unknown>;
type UntypedAdmin = {
  // Stage 9 fields are intentionally ahead of generated client types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};
type ActiveJob = {
  id: string;
  job_kind: string;
  queue_state: string;
  request_payload: Record<string, unknown>;
};

export class XeroSalesInvoiceAttachmentError extends Error {
  readonly code:
    | "document_not_found"
    | "invalid_document"
    | "missing_invoice"
    | "connection_mismatch"
    | "missing_scope"
    | "invoice_identity_mismatch"
    | "claim_not_ready"
    | "claim_changes_unsynced"
    | "pdf_generation_failed"
    | "pdf_too_large"
    | "invalid_attachment_response"
    | "sync_in_progress"
    | "refresh_in_progress"
    | "unauthorized"
    | "enqueue_failed"
    | "provider_failure";
  readonly safeMessage: string;
  readonly isRetryable: boolean;

  constructor(
    code: XeroSalesInvoiceAttachmentError["code"],
    message: string,
    options?: { safeMessage?: string; isRetryable?: boolean },
  ) {
    super(message);
    this.name = "XeroSalesInvoiceAttachmentError";
    this.code = code;
    this.safeMessage = options?.safeMessage ?? message;
    this.isRetryable = options?.isRetryable ?? false;
  }
}

function db(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedAdmin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeError(error: unknown) {
  if (error instanceof XeroSalesInvoiceAttachmentError) return error.safeMessage;
  if (error instanceof XeroRequestError) {
    if (error.status === 401 || error.status === 403) return XERO_ATTACHMENT_SCOPE_RECONNECT_MESSAGE;
    if (error.status === 404) return "The linked Xero Sales Invoice could not be found for PDF attachment.";
    if (error.status === 429) return "Xero is temporarily rate limiting PDF attachments.";
  }
  return "Unable to attach the Payment Claim PDF in Xero right now.";
}

async function loadDocument(admin: UntypedAdmin, organizationId: string, documentId: string) {
  const result = await admin.from("organization_accounting_documents").select("*")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();
  if (result.error) throw new XeroSalesInvoiceAttachmentError("document_not_found", "Unable to load the accounting document.");
  if (!result.data) throw new XeroSalesInvoiceAttachmentError("document_not_found", "Accounting document not found.");
  return result.data as Row;
}

function validateDocument(document: Row) {
  const invoiceId = text(document.external_document_id);
  if (
    document.provider !== "xero"
    || document.local_document_type !== "project_claim"
    || document.local_document_id != null
    || document.current_version_id != null
    || !text(document.project_claim_id)
  ) {
    throw new XeroSalesInvoiceAttachmentError(
      "invalid_document",
      "The accounting document does not represent a Payment Claim Xero Sales Invoice.",
    );
  }
  if (!invoiceId) {
    throw new XeroSalesInvoiceAttachmentError("missing_invoice", "Sync the Payment Claim to Xero before attaching its PDF.");
  }
  return invoiceId;
}

async function setAttachmentState(params: {
  admin: UntypedAdmin;
  organizationId: string;
  document: Row;
  values: Row;
}) {
  const result = await params.admin.from("organization_accounting_documents")
    .update(params.values)
    .eq("organization_id", params.organizationId)
    .eq("id", params.document.id)
    .eq("provider", "xero")
    .eq("local_document_type", "project_claim")
    .eq("external_document_id", params.document.external_document_id)
    .eq("last_synced_hash", params.document.last_synced_hash)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) {
    throw new XeroSalesInvoiceAttachmentError(
      "claim_changes_unsynced",
      "The synchronized claim identity changed while its PDF attachment was being processed.",
      { safeMessage: "Sync claim changes first, then retry the PDF attachment." },
    );
  }
}

async function resolveFreshAttachmentState(params: {
  organizationId: string;
  document: Row;
}) {
  const claimId = text(params.document.project_claim_id)!;
  const resolution = await resolvePaymentClaimXeroReadinessContext({
    organizationId: params.organizationId,
    claimId,
  });
  if (!resolution.snapshot) {
    throw new XeroSalesInvoiceAttachmentError(
      "claim_not_ready",
      resolution.terminalReadiness.blockers[0]?.message ?? "Payment Claim is not ready for Xero attachment.",
    );
  }
  const snapshotDocument = resolution.snapshot.accountingDocuments.find(
    (candidate) => candidate.id === params.document.id,
  );
  if (!snapshotDocument) {
    throw new XeroSalesInvoiceAttachmentError("invalid_document", "The linked Payment Claim accounting document is invalid.");
  }
  const payloadResult = buildPaymentClaimXeroPayloadFromResolvedSnapshot(resolution.snapshot);
  const currentHash = buildPaymentClaimXeroCurrentStateHashFromPayload({
    snapshot: resolution.snapshot,
    payloadResult,
  }).hash;
  const lastSyncedHash = text(params.document.last_synced_hash);
  if (!lastSyncedHash || currentHash !== lastSyncedHash) {
    throw new XeroSalesInvoiceAttachmentError(
      "claim_changes_unsynced",
      "The current Payment Claim differs from its last synchronized Xero state.",
      { safeMessage: "Sync claim changes first, then attach the matching PDF." },
    );
  }
  if (
    params.document.amount_exported != null
    && Math.round(Number(params.document.amount_exported) * 100)
      !== Math.round(payloadResult.reconciliation.total * 100)
  ) {
    throw new XeroSalesInvoiceAttachmentError(
      "claim_changes_unsynced",
      "The current Payment Claim total differs from the last exported total.",
      { safeMessage: "Sync claim changes first, then attach the matching PDF." },
    );
  }
  return { snapshot: resolution.snapshot, payloadResult, currentHash };
}

export async function recordXeroSalesInvoiceAttachmentError(params: {
  organizationId: string;
  documentId: string;
  error: unknown;
}) {
  const admin = db(await createAdminSupabaseClient());
  const message = safeError(params.error);
  const code = params.error instanceof XeroSalesInvoiceAttachmentError
    ? params.error.code
    : params.error instanceof XeroRequestError
      ? `xero_http_${params.error.status}`
      : "attachment_failed";
  await admin.from("organization_accounting_documents").update({
    attachment_status: "failed",
    attachment_error_code: code,
    attachment_error_message: message,
  })
    .eq("organization_id", params.organizationId)
    .eq("id", params.documentId)
    .eq("provider", "xero")
    .eq("local_document_type", "project_claim");
  return message;
}

export async function attachPaymentClaimPdfToXeroSalesInvoice(params: {
  organizationId: string;
  accountingDocumentId: string;
  workerJobId: string;
}) {
  const admin = db(await createAdminSupabaseClient());
  const document = await loadDocument(admin, params.organizationId, params.accountingDocumentId);
  const invoiceId = validateDocument(document);
  const fresh = await resolveFreshAttachmentState({ organizationId: params.organizationId, document });
  const tokenState = await getFreshXeroAccessToken(params.organizationId);
  if (
    tokenState.connection.id !== document.accounting_connection_id
    || tokenState.connection.tenant_id !== document.tenant_id
  ) {
    throw new XeroSalesInvoiceAttachmentError(
      "connection_mismatch",
      "The current Xero connection or tenant does not match the linked Sales Invoice.",
    );
  }
  if (!hasXeroAttachmentScope(tokenState.connection.scope)) {
    throw new XeroSalesInvoiceAttachmentError(
      "missing_scope",
      XERO_ATTACHMENT_SCOPE_RECONNECT_MESSAGE,
      { safeMessage: XERO_ATTACHMENT_SCOPE_RECONNECT_MESSAGE },
    );
  }
  const invoices = await getXeroInvoice(tokenState.tokenSet.access_token, String(document.tenant_id), invoiceId);
  const invoice = invoices[0];
  if (
    !invoice
    || invoice.InvoiceID !== invoiceId
    || invoice.Type !== "ACCREC"
    || invoice.InvoiceNumber !== text(fresh.snapshot.claim.claim_number)
    || invoice.InvoiceNumber !== text(document.external_document_number)
  ) {
    throw new XeroSalesInvoiceAttachmentError(
      "invoice_identity_mismatch",
      "Xero returned an invoice that does not match the linked Payment Claim.",
    );
  }

  await setAttachmentState({
    admin,
    organizationId: params.organizationId,
    document,
    values: { attachment_status: "attaching", attachment_error_code: null, attachment_error_message: null },
  });

  let pdf;
  try {
    pdf = await generatePaymentClaimPdfBundleServer({
      organizationId: params.organizationId,
      claimId: text(document.project_claim_id)!,
    });
  } catch (error) {
    throw new XeroSalesInvoiceAttachmentError(
      "pdf_generation_failed",
      error instanceof Error ? error.message : "Payment Claim PDF generation failed.",
      { safeMessage: error instanceof Error ? error.message : "Unable to generate the Payment Claim PDF bundle." },
    );
  }
  const bytes = Uint8Array.from(pdf.bytes);
  if (bytes.byteLength === 0 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new XeroSalesInvoiceAttachmentError("pdf_generation_failed", "The generated Payment Claim bundle is not a valid PDF.");
  }
  if (bytes.byteLength > 10 * 1024 * 1024) {
    throw new XeroSalesInvoiceAttachmentError("pdf_too_large", "The Payment Claim PDF exceeds Xero's attachment limit.");
  }
  const fileName = buildPaymentClaimPdfFileName(text(fresh.snapshot.claim.claim_number) ?? "");
  const attachments = await putXeroInvoiceAttachment({
    accessToken: tokenState.tokenSet.access_token,
    tenantId: String(document.tenant_id),
    invoiceId,
    fileName,
    bytes,
    includeOnline: true,
  });
  const attachment = attachments.find((candidate) => candidate.FileName === fileName);
  const expectedUrlIdentity = `/Invoices/${invoiceId}/Attachments/`;
  if (!attachment || !text(attachment.Url)?.includes(expectedUrlIdentity)) {
    throw new XeroSalesInvoiceAttachmentError(
      "invalid_attachment_response",
      "Xero did not confirm the expected Payment Claim attachment identity.",
    );
  }
  const uploadedAt = new Date().toISOString();
  await setAttachmentState({
    admin,
    organizationId: params.organizationId,
    document,
    values: {
      attachment_status: "attached",
      attachment_filename: fileName,
      attachment_synced_hash: fresh.currentHash,
      attachment_uploaded_at: uploadedAt,
      attachment_error_code: null,
      attachment_error_message: null,
    },
  });
  return {
    documentId: String(document.id),
    invoiceId,
    fileName,
    syncedHash: fresh.currentHash,
    uploadedAt,
    byteLength: bytes.byteLength,
    statutoryDocumentsIncluded: pdf.statutoryDocumentsIncluded.map((entry) => entry.id),
    attachmentId: text(attachment.AttachmentID),
    workerJobId: params.workerJobId,
  };
}

async function activeJobs(admin: UntypedAdmin, organizationId: string, documentId: string) {
  const result = await admin.from("organization_accounting_sync_jobs")
    .select("id, job_kind, queue_state, request_payload")
    .eq("organization_id", organizationId)
    .eq("provider", "xero")
    .in("job_kind", ["xero.sales_invoice.sync", "xero.sales_invoice.refresh", "xero.sales_invoice.attachment"])
    .in("queue_state", ["pending", "claimed", "retry_scheduled"])
    .order("created_at", { ascending: false });
  if (result.error) throw new XeroSalesInvoiceAttachmentError("enqueue_failed", "Unable to inspect active Xero Sales Invoice jobs.");
  return ((result.data ?? []) as ActiveJob[]).filter(
    (job) => job.request_payload.accountingDocumentId === documentId,
  );
}

export async function enqueueXeroSalesInvoiceAttachment(params: {
  organizationId: string;
  accountingDocumentId: string;
  createdByUserId: string | null;
  triggerSource: "user_export" | "user_retry";
}) {
  const admin = db(await createAdminSupabaseClient());
  const document = await loadDocument(admin, params.organizationId, params.accountingDocumentId);
  validateDocument(document);
  await resolveFreshAttachmentState({ organizationId: params.organizationId, document });
  const connection = await getOrganizationXeroConnection(params.organizationId);
  if (
    !connection
    || connection.status !== "connected"
    || connection.id !== document.accounting_connection_id
    || connection.tenant_id !== document.tenant_id
  ) {
    throw new XeroSalesInvoiceAttachmentError("connection_mismatch", "The current Xero connection does not match the linked Sales Invoice.");
  }
  if (!hasXeroAttachmentScope(connection.scope)) {
    throw new XeroSalesInvoiceAttachmentError("missing_scope", XERO_ATTACHMENT_SCOPE_RECONNECT_MESSAGE);
  }
  const active = await activeJobs(admin, params.organizationId, params.accountingDocumentId);
  if (active.some((job) => job.job_kind === "xero.sales_invoice.sync")) {
    throw new XeroSalesInvoiceAttachmentError("sync_in_progress", "Wait for Sales Invoice synchronization to finish before attaching the PDF.");
  }
  if (active.some((job) => job.job_kind === "xero.sales_invoice.refresh")) {
    throw new XeroSalesInvoiceAttachmentError("refresh_in_progress", "Wait for Sales Invoice refresh to finish before attaching the PDF.");
  }
  const existing = active.find((job) => job.job_kind === "xero.sales_invoice.attachment");
  if (existing) {
    return { jobId: existing.id, documentId: params.accountingDocumentId, created: false, queueState: existing.queue_state };
  }
  const inserted = await admin.from("organization_accounting_sync_jobs").insert({
    organization_id: params.organizationId,
    provider: "xero",
    connection_id: document.accounting_connection_id,
    job_kind: "xero.sales_invoice.attachment",
    trigger_source: params.triggerSource,
    queue_state: "pending",
    request_payload: { accountingDocumentId: params.accountingDocumentId },
    result_summary: {},
    idempotency_key: null,
    max_attempts: 3,
    created_by_user_id: params.createdByUserId,
  }).select("id, queue_state").single();
  if (!inserted.error && inserted.data) {
    await admin.from("organization_accounting_documents").update({
      attachment_status: "queued",
      attachment_error_code: null,
      attachment_error_message: null,
    }).eq("organization_id", params.organizationId).eq("id", params.accountingDocumentId);
    return { jobId: String(inserted.data.id), documentId: params.accountingDocumentId, created: true, queueState: String(inserted.data.queue_state) };
  }
  const raced = await activeJobs(admin, params.organizationId, params.accountingDocumentId);
  const racedAttachment = raced.find((job) => job.job_kind === "xero.sales_invoice.attachment");
  if (racedAttachment) {
    return { jobId: racedAttachment.id, documentId: params.accountingDocumentId, created: false, queueState: racedAttachment.queue_state };
  }
  if (raced.some((job) => job.job_kind === "xero.sales_invoice.sync")) {
    throw new XeroSalesInvoiceAttachmentError("sync_in_progress", "Sales Invoice synchronization started before the PDF could be queued.");
  }
  throw new XeroSalesInvoiceAttachmentError("enqueue_failed", "Unable to queue the Payment Claim PDF attachment.");
}

export async function enqueuePaymentClaimXeroAttachmentForCurrentUser(params: {
  claimId: string;
  intent: "attach" | "retry_attachment";
}) {
  const member = await getCurrentOrganizationMember();
  if (!member || !await hasOrganizationPermission(member.organization_id, "accounting.sales_invoices.manage")) {
    throw new XeroSalesInvoiceAttachmentError("unauthorized", "You do not have permission to attach Payment Claim PDFs in Xero.");
  }
  const admin = db(await createAdminSupabaseClient());
  const result = await admin.from("organization_accounting_documents").select("id")
    .eq("organization_id", member.organization_id)
    .eq("provider", "xero")
    .eq("local_document_type", "project_claim")
    .eq("project_claim_id", params.claimId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new XeroSalesInvoiceAttachmentError("document_not_found", "The linked Xero Sales Invoice was not found.");
  }
  return enqueueXeroSalesInvoiceAttachment({
    organizationId: member.organization_id,
    accountingDocumentId: String(result.data.id),
    createdByUserId: member.user_id,
    triggerSource: params.intent === "retry_attachment" ? "user_retry" : "user_export",
  });
}
