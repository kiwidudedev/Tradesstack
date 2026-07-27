import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import {
  createXeroInvoices,
  findXeroInvoicesByNumber,
  getXeroInvoice,
  putXeroInvoiceAttachment,
  XeroRequestError,
} from "@/lib/xero/client";
import {
  matchesInitialPushRecoveryCandidate,
  verifyInitialPushXeroInvoice,
} from "@/lib/xero/payment-claim-initial-push-contract";
import { parseXeroDate } from "@/lib/xero/bill-status";
import { hasXeroInvoiceScope, XERO_INVOICE_SCOPE_RECONNECT_MESSAGE } from "@/lib/xero/scopes";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { PaymentClaimXeroSalesInvoicePayload } from "@/lib/xero/payment-claim-sales-invoice-payload";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 2B functions intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

export class PaymentClaimInitialPushWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "PaymentClaimInitialPushWorkerError";
  }
}

function admin() {
  return createAdminSupabaseClient() as unknown as Admin;
}

function text(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isUncertain(error: unknown) {
  return !(error instanceof XeroRequestError)
    || error.isRetryable
    || error.status === 408;
}

async function rpc<T>(name: string, input: Record<string, unknown>) {
  const result = await admin().rpc(name, input);
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

async function loadExecution(revisionId: string, attemptId: string) {
  const result = await rpc<Record<string, unknown> | null>(
    "get_payment_claim_initial_push_execution_phase2b",
    { p_revision_id: revisionId, p_attempt_id: attemptId },
  );
  if (!result) throw new PaymentClaimInitialPushWorkerError("missing_evidence", "Immutable initial-push evidence was not found.");
  return result as {
    document: Row;
    revision: Row;
    lines: Row[];
    attachment: Row;
    pdfBase64: string;
    attempt: Row;
  };
}

async function claimAttempt(attemptId: string, workerId: string) {
  const attempt = await rpc<Row | null>("claim_accounting_revision_attempt_phase2b", {
    p_attempt_id: attemptId,
    p_worker_id: workerId,
    p_lease_seconds: 180,
  });
  if (!attempt?.lease_token) {
    throw new PaymentClaimInitialPushWorkerError("stale_lease", "The immutable accounting attempt is already owned or complete.");
  }
  return attempt;
}

async function finishAttention(params: {
  execution: Awaited<ReturnType<typeof loadExecution>>;
  attempt: Row;
  workerId: string;
  code: string;
  message: string;
  observation?: Row | null;
}) {
  if (params.observation) {
    await rpc("record_payment_claim_initial_push_observation_phase2b", {
      p_revision_id: params.execution.revision.id,
      p_observation: params.observation,
      p_reason: params.code,
    });
  }
  await rpc("finalize_accounting_revision_attempt_phase2a", {
    p_attempt_id: params.attempt.id,
    p_worker_id: params.workerId,
    p_lease_token: params.attempt.lease_token,
    p_terminal_state: "attention_required",
    p_outcome_code: params.code,
    p_outcome_message: params.message,
    p_response_evidence: params.observation ?? { code: params.code },
  });
  await rpc("transition_accounting_revision_lifecycle_phase2a", {
    p_revision_id: params.execution.revision.id,
    p_target_state: "attention_required",
    p_failure_code: params.code,
    p_failure_message: params.message,
  });
}

export async function executePaymentClaimInitialPush(params: {
  accountingRevisionId: string;
  attemptId: string;
  workerId: string;
}) {
  const attempt = await claimAttempt(params.attemptId, params.workerId);
  const execution = await loadExecution(params.accountingRevisionId, params.attemptId);
  const revision = execution.revision;
  const document = execution.document;
  if (
    revision.lifecycle_state !== "queued"
    || revision.revision_intent !== "initial_push"
    || revision.provider_document_type !== "ACCREC"
    || revision.requested_provider_status !== "AUTHORISED"
    || document.integration_contract !== "payment_claim_revision_v1"
    || text(document, "external_document_id")
    || text(execution.attempt, "id") !== params.attemptId
    || text(execution.attempt, "attempt_intent") !== "create"
  ) {
    throw new PaymentClaimInitialPushWorkerError("invalid_revision", "The queued revision is not an executable initial push.");
  }
  const payload = revision.payload_snapshot as PaymentClaimXeroSalesInvoicePayload;
  if (
    payload.Type !== "ACCREC"
    || payload.Status !== "AUTHORISED"
    || payload.InvoiceNumber !== revision.external_document_number
    || !Array.isArray(payload.LineItems)
    || payload.LineItems.length !== execution.lines.length
  ) {
    throw new PaymentClaimInitialPushWorkerError("invalid_payload", "Immutable Xero payload evidence failed validation.");
  }
  const token = await getFreshXeroAccessToken(String(revision.organization_id));
  if (
    token.connection.id !== revision.connection_id
    || token.connection.tenant_id !== revision.tenant_id
    || !hasXeroInvoiceScope(token.connection.scope)
  ) {
    throw new PaymentClaimInitialPushWorkerError(
      "tenant_mismatch",
      hasXeroInvoiceScope(token.connection.scope)
        ? "The connected Xero tenant no longer matches the immutable revision."
        : XERO_INVOICE_SCOPE_RECONNECT_MESSAGE,
    );
  }

  let invoice: XeroInvoice;
  let recovered = false;
  try {
    const created = await createXeroInvoices({
      accessToken: token.tokenSet.access_token,
      tenantId: String(revision.tenant_id),
      invoices: [payload],
      idempotencyKey: String(execution.attempt.idempotency_key),
      fallbackMessage: "Unable to create the authorised Xero Sales Invoice.",
    });
    if (!created[0]?.InvoiceID) {
      throw new PaymentClaimInitialPushWorkerError(
        "incomplete_create_response",
        "Xero returned an incomplete create response.",
        false,
        true,
      );
    }
    invoice = created[0];
  } catch (error) {
    if (!isUncertain(error)) throw error;
    const candidates = await findXeroInvoicesByNumber({
      accessToken: token.tokenSet.access_token,
      tenantId: String(revision.tenant_id),
      invoiceNumber: String(revision.external_document_number),
      type: "ACCREC",
    });
    const matches = candidates.filter((candidate) =>
      matchesInitialPushRecoveryCandidate({
        expected: payload,
        candidate: candidate as Row,
        expectedTotals: {
          subtotalMinor: Number(revision.subtotal_minor),
          taxMinor: Number(revision.tax_minor),
          totalMinor: Number(revision.total_minor),
        },
      }),
    );
    if (matches.length !== 1) {
      const code = matches.length > 1 ? "ambiguous_create_recovery" : "create_outcome_uncertain";
      const message = matches.length > 1
        ? "More than one Xero invoice matched the immutable Payment Claim number."
        : "Xero may have created this invoice, but the result is not yet safely identifiable.";
      await finishAttention({ execution, attempt, workerId: params.workerId, code, message });
      throw new PaymentClaimInitialPushWorkerError(code, message, false, true);
    }
    invoice = matches[0];
    recovered = true;
  }

  const invoiceId = text(invoice as Row, "InvoiceID", "invoiceID");
  const fetched = await getXeroInvoice(
    token.tokenSet.access_token,
    String(revision.tenant_id),
    invoiceId,
  );
  const authoritative = fetched[0] as XeroInvoice | undefined;
  if (!authoritative) {
    const message = "The created Xero invoice could not be retrieved for complete verification.";
    await finishAttention({ execution, attempt, workerId: params.workerId, code: "verification_unavailable", message });
    throw new PaymentClaimInitialPushWorkerError("verification_unavailable", message, false, true);
  }
  const verification = verifyInitialPushXeroInvoice({
    expected: payload,
    actual: authoritative as Row,
    expectedTotals: {
      subtotalMinor: Number(revision.subtotal_minor),
      taxMinor: Number(revision.tax_minor),
      totalMinor: Number(revision.total_minor),
    },
  });
  if (!verification.exact) {
    const message = "The returned Xero invoice does not exactly match the confirmed accounting revision.";
    await finishAttention({
      execution,
      attempt,
      workerId: params.workerId,
      code: "provider_content_mismatch",
      message,
      observation: authoritative as Row,
    });
    throw new PaymentClaimInitialPushWorkerError("provider_content_mismatch", message, false, true);
  }
  const settlementHash = hashAccountingEvidence({
    amountPaid: (authoritative as Row).AmountPaid ?? 0,
    amountCredited: (authoritative as Row).AmountCredited ?? 0,
    payments: (authoritative as Row).Payments ?? [],
    creditNotes: (authoritative as Row).CreditNotes ?? [],
  });
  const completed = await rpc<boolean>("complete_payment_claim_initial_push_phase2b", {
    p_attempt_id: params.attemptId,
    p_worker_id: params.workerId,
    p_lease_token: attempt.lease_token,
    p_result: {
      externalDocumentId: invoiceId,
      externalDocumentNumber: revision.external_document_number,
      providerUpdatedAt: parseXeroDate((authoritative as Row).UpdatedDateUTC),
      settlementHash,
      rawObservation: authoritative,
    },
  });
  if (!completed) {
    throw new PaymentClaimInitialPushWorkerError("stale_lease", "The worker lease expired before verified finalisation.");
  }
  return {
    accountingRevisionId: revision.id,
    invoiceId,
    invoiceNumber: revision.external_document_number,
    status: "AUTHORISED" as const,
    recovered,
    exact: true,
  };
}

export async function executePaymentClaimInitialPushAttachment(params: {
  accountingRevisionId: string;
  attemptId: string;
  workerId: string;
}) {
  const attempt = await claimAttempt(params.attemptId, params.workerId);
  const execution = await loadExecution(params.accountingRevisionId, params.attemptId);
  const bytes = Uint8Array.from(Buffer.from(execution.pdfBase64, "base64"));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (
    execution.revision.lifecycle_state !== "succeeded"
    || execution.attempt.attempt_intent !== "attach"
    || !text(execution.document, "external_document_id")
    || hash !== execution.attachment.content_sha256
    || hash !== execution.revision.pdf_hash
    || bytes.byteLength !== Number(execution.attachment.byte_size)
    || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new PaymentClaimInitialPushWorkerError("attachment_evidence_mismatch", "Immutable PDF evidence failed verification.");
  }
  const token = await getFreshXeroAccessToken(String(execution.revision.organization_id));
  if (token.connection.tenant_id !== execution.revision.tenant_id) {
    throw new PaymentClaimInitialPushWorkerError("tenant_mismatch", "The Xero tenant no longer matches the immutable revision.");
  }
  // A retry can reclaim an expired attempt after the first upload call lost its
  // response. In that case the immutable attachment is already "uploading";
  // keep the state and repeat the idempotent upload instead of attempting an
  // invalid uploading -> uploading transition.
  if (execution.attachment.upload_state !== "uploading") {
    await rpc("transition_accounting_attachment_phase2a", {
      p_attachment_id: execution.attachment.id,
      p_target_state: "uploading",
      p_provider_attachment_id: null,
      p_failure_code: null,
      p_failure_message: null,
    });
  }
  const uploaded = await putXeroInvoiceAttachment({
    accessToken: token.tokenSet.access_token,
    tenantId: String(execution.revision.tenant_id),
    invoiceId: text(execution.document, "external_document_id"),
    fileName: String(execution.attachment.filename),
    bytes,
    includeOnline: true,
  });
  const found = uploaded.find((item) => item.FileName === execution.attachment.filename);
  if (!found) throw new PaymentClaimInitialPushWorkerError("attachment_response_mismatch", "Xero did not confirm the immutable PDF attachment.", true);
  await rpc("transition_accounting_attachment_phase2a", {
    p_attachment_id: execution.attachment.id,
    p_target_state: "uploaded",
    p_provider_attachment_id: found.AttachmentID ?? found.Url ?? execution.attachment.filename,
    p_failure_code: null,
    p_failure_message: null,
  });
  const finalized = await rpc<boolean>("finalize_accounting_revision_attempt_phase2a", {
    p_attempt_id: params.attemptId,
    p_worker_id: params.workerId,
    p_lease_token: attempt.lease_token,
    p_terminal_state: "succeeded",
    p_outcome_code: "immutable_pdf_attached",
    p_outcome_message: "Exact immutable revision PDF attached.",
    p_response_evidence: { attachmentId: found.AttachmentID ?? null, filename: execution.attachment.filename, sha256: hash },
  });
  if (!finalized) throw new PaymentClaimInitialPushWorkerError("stale_lease", "The attachment lease expired before finalisation.");
  return { attachmentId: found.AttachmentID ?? null, filename: execution.attachment.filename, sha256: hash };
}
