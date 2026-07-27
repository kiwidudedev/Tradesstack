import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import { parseXeroDate } from "@/lib/xero/bill-status";
import {
  createXeroInvoices,
  findXeroInvoicesByNumber,
  getXeroInvoice,
  putXeroInvoiceAttachment,
  XeroRequestError,
} from "@/lib/xero/client";
import {
  verifyRetentionClaimXeroInvoice,
} from "@/lib/xero/retention-claim-push-contract";
import { hasXeroInvoiceScope, XERO_INVOICE_SCOPE_RECONNECT_MESSAGE } from "@/lib/xero/scopes";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { RetentionClaimXeroPayload } from "@/lib/xero/retention-claim-sales-invoice-payload";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 2C RPCs intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

type Execution = {
  document: Row;
  revision: Row;
  previousRevision: Row | null;
  lines: Row[];
  attachment: Row | null;
  pdfBase64: string | null;
  attempt: Row;
};

export class RetentionClaimPushWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "RetentionClaimPushWorkerError";
  }
}

function admin() {
  return createAdminSupabaseClient() as unknown as Admin;
}

function text(row: Row | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function list(row: Row, ...keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return [];
}

async function rpc<T>(name: string, input: Record<string, unknown>) {
  const result = await admin().rpc(name, input);
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

async function loadExecution(revisionId: string, attemptId: string) {
  let result = await rpc<Execution | null>(
    "get_retention_claim_push_execution_phase2c",
    { p_revision_id: revisionId, p_attempt_id: attemptId },
  );
  if (!result) {
    result = await rpc<Execution | null>(
      "get_master_retention_claim_execution",
      { p_revision_id: revisionId, p_attempt_id: attemptId },
    );
  }
  if (!result) {
    throw new RetentionClaimPushWorkerError(
      "missing_evidence",
      "Immutable Retention Claim execution evidence was not found.",
    );
  }
  return result;
}

async function claimAttempt(attemptId: string, workerId: string) {
  const attempt = await rpc<Row | null>("claim_accounting_revision_attempt_phase2b", {
    p_attempt_id: attemptId,
    p_worker_id: workerId,
    p_lease_seconds: 180,
  });
  if (!attempt?.lease_token) {
    throw new RetentionClaimPushWorkerError(
      "stale_lease",
      "The immutable Retention Claim attempt is already owned or complete.",
    );
  }
  return attempt;
}

async function finishAttention(params: {
  execution: Execution;
  attempt: Row;
  workerId: string;
  code: string;
  message: string;
  evidence?: Row;
}) {
  await rpc("finalize_accounting_revision_attempt_phase2a", {
    p_attempt_id: params.attempt.id,
    p_worker_id: params.workerId,
    p_lease_token: params.attempt.lease_token,
    p_terminal_state: "attention_required",
    p_outcome_code: params.code,
    p_outcome_message: params.message,
    p_response_evidence: params.evidence ?? { code: params.code },
  }).catch(() => false);
  await rpc("transition_accounting_revision_lifecycle_phase2a", {
    p_revision_id: params.execution.revision.id,
    p_target_state: "attention_required",
    p_failure_code: params.code,
    p_failure_message: params.message,
  }).catch(() => false);
}

function exactCandidate(params: {
  revision: Row;
  payload: RetentionClaimXeroPayload;
  candidate: XeroInvoice;
}) {
  return verifyRetentionClaimXeroInvoice({
    expected: params.payload,
    actual: params.candidate as Row,
    subtotalMinor: Number(params.revision.subtotal_minor),
    taxMinor: Number(params.revision.tax_minor),
    totalMinor: Number(params.revision.total_minor),
  }).exact;
}

function predecessorIsSafelyVoided(
  previous: Row,
  invoice: XeroInvoice,
) {
  const row = invoice as Row;
  const payload = previous.payload_snapshot as RetentionClaimXeroPayload;
  const structural = verifyRetentionClaimXeroInvoice({
    expected: payload,
    actual: {
      ...row,
      Status: "AUTHORISED",
      AmountPaid: 0,
      AmountCredited: 0,
      Payments: [],
      CreditNotes: [],
    },
    subtotalMinor: Number(previous.subtotal_minor),
    taxMinor: Number(previous.tax_minor),
    totalMinor: Number(previous.total_minor),
  });
  return structural.exact
    && text(row, "InvoiceID", "invoiceID") === text(previous, "external_document_id")
    && text(row, "InvoiceNumber", "invoiceNumber") === text(previous, "external_document_number")
    && text(row, "Type", "type") === "ACCREC"
    && text(row, "Status", "status") === "VOIDED"
    && Number(row.AmountPaid ?? row.amountPaid ?? 0) === 0
    && Number(row.AmountCredited ?? row.amountCredited ?? 0) === 0
    && list(row, "Payments", "payments").length === 0
    && list(row, "CreditNotes", "creditNotes").length === 0;
}

export async function executeRetentionClaimPush(params: {
  accountingRevisionId: string;
  attemptId: string;
  workerId: string;
}) {
  const attempt = await claimAttempt(params.attemptId, params.workerId);
  const execution = await loadExecution(
    params.accountingRevisionId,
    params.attemptId,
  );
  const revision = execution.revision;
  const document = execution.document;
  const intent = text(revision, "revision_intent");
  const attemptIntent = text(execution.attempt, "attempt_intent");
  if (
    !["initial_push", "replacement"].includes(intent)
    || (intent === "initial_push" ? attemptIntent !== "create" : attemptIntent !== "replace")
    || !["queued", "processing"].includes(String(revision.lifecycle_state))
    || revision.provider_document_type !== "ACCREC"
    || revision.requested_provider_status !== "AUTHORISED"
    || document.integration_contract !== "retention_claim_revision_v1"
    || text(execution.attempt, "id") !== params.attemptId
    || (intent === "initial_push" && (
      text(document, "external_document_id")
      || document.active_accounting_revision_id
    ))
    || (intent === "replacement" && (
      !execution.previousRevision
      || document.active_accounting_revision_id !== execution.previousRevision.id
      || text(document, "external_document_id")
        !== text(execution.previousRevision, "external_document_id")
    ))
  ) {
    throw new RetentionClaimPushWorkerError(
      "invalid_revision",
      "The queued immutable Retention Claim revision is not executable.",
    );
  }
  const payload = revision.payload_snapshot as RetentionClaimXeroPayload;
  if (
    payload.Type !== "ACCREC"
    || payload.Status !== "AUTHORISED"
    || payload.InvoiceNumber !== revision.external_document_number
    || !Array.isArray(payload.LineItems)
    || payload.LineItems.length !== execution.lines.length
  ) {
    throw new RetentionClaimPushWorkerError(
      "invalid_payload",
      "Immutable Retention Claim Xero payload evidence failed validation.",
    );
  }
  if (revision.lifecycle_state === "queued") {
    await rpc("transition_accounting_revision_lifecycle_phase2a", {
      p_revision_id: revision.id,
      p_target_state: "processing",
      p_failure_code: null,
      p_failure_message: null,
    });
  }

  try {
  const token = await getFreshXeroAccessToken(String(revision.organization_id));
  if (
    token.connection.id !== revision.connection_id
    || token.connection.tenant_id !== revision.tenant_id
    || !hasXeroInvoiceScope(token.connection.scope)
  ) {
    throw new RetentionClaimPushWorkerError(
      "tenant_mismatch",
      hasXeroInvoiceScope(token.connection.scope)
        ? "The connected Xero tenant no longer matches the immutable Retention Claim revision."
        : XERO_INVOICE_SCOPE_RECONNECT_MESSAGE,
    );
  }

  if (intent === "replacement") {
    const previous = execution.previousRevision!;
    let predecessor: XeroInvoice | undefined;
    try {
      predecessor = (await getXeroInvoice(
        token.tokenSet.access_token,
        String(revision.tenant_id),
        text(previous, "external_document_id"),
      ))[0];
    } catch (error) {
      const message = "The previous Xero invoice could not be verified as voided and unsettled.";
      await finishAttention({
        execution,
        attempt,
        workerId: params.workerId,
        code: "predecessor_verification_unavailable",
        message,
      });
      throw new RetentionClaimPushWorkerError(
        "predecessor_verification_unavailable",
        message,
        error instanceof XeroRequestError && error.isRetryable,
        true,
      );
    }
    if (!predecessor || !predecessorIsSafelyVoided(previous, predecessor)) {
      const message = "The previous Xero invoice is no longer safely eligible for replacement.";
      await finishAttention({
        execution,
        attempt,
        workerId: params.workerId,
        code: "predecessor_not_voided_unsettled",
        message,
        evidence: predecessor as Row | undefined,
      });
      throw new RetentionClaimPushWorkerError(
        "predecessor_not_voided_unsettled",
        message,
        false,
        true,
      );
    }
  }

  // Search before every create. Any exact-number collision that does not
  // exactly match the confirmed immutable payload is unsafe to overwrite.
  let invoice: XeroInvoice | undefined;
  let recovered = false;
  let candidates: XeroInvoice[];
  try {
    candidates = await findXeroInvoicesByNumber({
      accessToken: token.tokenSet.access_token,
      tenantId: String(revision.tenant_id),
      invoiceNumber: String(revision.external_document_number),
      type: "ACCREC",
    });
  } catch (error) {
    const message = "Xero could not prove whether the Retention Claim invoice number already exists.";
    await finishAttention({
      execution,
      attempt,
      workerId: params.workerId,
      code: "precreate_search_unavailable",
      message,
    });
    throw new RetentionClaimPushWorkerError(
      "precreate_search_unavailable",
      message,
      error instanceof XeroRequestError && error.isRetryable,
      true,
    );
  }
  const exact = candidates.filter((candidate) =>
    exactCandidate({ revision, payload, candidate }),
  );
  if (candidates.length > 0) {
    if (candidates.length === 1 && exact.length === 1) {
      invoice = exact[0];
      recovered = true;
    } else {
      const message = candidates.length > 1
        ? "More than one Xero invoice uses the confirmed Retention Claim invoice number."
        : "The confirmed Retention Claim invoice number already belongs to different Xero content.";
      await finishAttention({
        execution,
        attempt,
        workerId: params.workerId,
        code: candidates.length > 1
          ? "ambiguous_create_recovery"
          : "duplicate_invoice_number",
        message,
      });
      throw new RetentionClaimPushWorkerError(
        candidates.length > 1
          ? "ambiguous_create_recovery"
          : "duplicate_invoice_number",
        message,
        false,
        true,
      );
    }
  }

  if (!invoice) {
    try {
      const created = await createXeroInvoices({
        accessToken: token.tokenSet.access_token,
        tenantId: String(revision.tenant_id),
        invoices: [payload],
        idempotencyKey: String(execution.attempt.idempotency_key),
        fallbackMessage: "Unable to create the authorised Retention Claim invoice.",
      });
      invoice = created[0];
      if (!invoice?.InvoiceID) {
        throw new RetentionClaimPushWorkerError(
          "incomplete_create_response",
          "Xero returned an incomplete Retention Claim create response.",
          false,
          true,
        );
      }
    } catch (error) {
      const uncertain = !(error instanceof XeroRequestError)
        || error.isRetryable
        || error.status === 408;
      if (!uncertain) throw error;
      const recovery = await findXeroInvoicesByNumber({
        accessToken: token.tokenSet.access_token,
        tenantId: String(revision.tenant_id),
        invoiceNumber: String(revision.external_document_number),
        type: "ACCREC",
      });
      const recoveryExact = recovery.filter((candidate) =>
        exactCandidate({ revision, payload, candidate }),
      );
      if (recovery.length !== 1 || recoveryExact.length !== 1) {
        const code = recovery.length > 1
          ? "ambiguous_create_recovery"
          : "create_outcome_uncertain";
        const message = recovery.length > 1
          ? "More than one Xero invoice matched the immutable Retention Claim number."
          : "Xero may have created this Retention Claim invoice, but the result is not safely identifiable.";
        await finishAttention({
          execution,
          attempt,
          workerId: params.workerId,
          code,
          message,
        });
        throw new RetentionClaimPushWorkerError(code, message, false, true);
      }
      invoice = recoveryExact[0];
      recovered = true;
    }
  }

  const invoiceId = text(invoice as Row, "InvoiceID", "invoiceID");
  const authoritative = (await getXeroInvoice(
    token.tokenSet.access_token,
    String(revision.tenant_id),
    invoiceId,
  ))[0];
  if (!authoritative) {
    const message = "The created Retention Claim invoice could not be retrieved for exact verification.";
    await finishAttention({
      execution,
      attempt,
      workerId: params.workerId,
      code: "verification_unavailable",
      message,
    });
    throw new RetentionClaimPushWorkerError(
      "verification_unavailable",
      message,
      false,
      true,
    );
  }
  const verification = verifyRetentionClaimXeroInvoice({
    expected: payload,
    actual: authoritative as Row,
    subtotalMinor: Number(revision.subtotal_minor),
    taxMinor: Number(revision.tax_minor),
    totalMinor: Number(revision.total_minor),
  });
  if (!verification.exact) {
    const message = "The returned Xero invoice does not exactly match the confirmed Retention Claim revision.";
    await finishAttention({
      execution,
      attempt,
      workerId: params.workerId,
      code: "provider_content_mismatch",
      message,
      evidence: {
        invoiceId,
        mismatchReasons: verification.reasons,
      },
    });
    throw new RetentionClaimPushWorkerError(
      "provider_content_mismatch",
      message,
      false,
      true,
    );
  }
  const settlementHash = hashAccountingEvidence({
    amountPaid: (authoritative as Row).AmountPaid ?? 0,
    amountCredited: (authoritative as Row).AmountCredited ?? 0,
    payments: (authoritative as Row).Payments ?? [],
    creditNotes: (authoritative as Row).CreditNotes ?? [],
  });
  const completed = await rpc<boolean>(
    execution.attachment
      ? "complete_retention_claim_push_phase2c"
      : "complete_master_retention_claim_push",
    {
    p_attempt_id: params.attemptId,
    p_worker_id: params.workerId,
    p_lease_token: attempt.lease_token,
    p_result: {
      externalDocumentId: invoiceId,
      externalDocumentNumber: revision.external_document_number,
      providerUpdatedAt: parseXeroDate((authoritative as Row).UpdatedDateUTC),
      settlementHash,
      recovered,
      rawObservation: authoritative,
    },
  });
  if (!completed) {
    throw new RetentionClaimPushWorkerError(
      "stale_lease",
      "The Retention Claim worker lease expired before verified finalisation.",
    );
  }
  return {
    accountingRevisionId: revision.id,
    invoiceId,
    invoiceNumber: revision.external_document_number,
    status: "AUTHORISED" as const,
    recovered,
    exact: true,
  };
  } catch (error) {
    const workerError = error instanceof RetentionClaimPushWorkerError
      ? error
      : new RetentionClaimPushWorkerError(
          error instanceof XeroRequestError
            ? "xero_validation_or_transport_failure"
            : "immutable_execution_failure",
          error instanceof XeroRequestError
            ? "Xero could not safely complete the confirmed Retention Claim invoice."
            : "The confirmed Retention Claim invoice requires accounting attention.",
          false,
          error instanceof XeroRequestError && error.isRetryable,
        );
    await finishAttention({
      execution,
      attempt,
      workerId: params.workerId,
      code: workerError.code,
      message: workerError.message,
    });
    throw new RetentionClaimPushWorkerError(
      workerError.code,
      workerError.message,
      false,
      workerError.uncertain,
    );
  }
}

export async function executeRetentionClaimPushAttachment(params: {
  accountingRevisionId: string;
  attemptId: string;
  workerId: string;
}) {
  const attempt = await claimAttempt(params.attemptId, params.workerId);
  const execution = await loadExecution(
    params.accountingRevisionId,
    params.attemptId,
  );
  if (!execution.attachment || !execution.pdfBase64) {
    throw new RetentionClaimPushWorkerError(
      "missing_attachment_evidence",
      "Historical Retention attachment evidence was not found.",
    );
  }
  const attachment = execution.attachment;
  const bytes = Uint8Array.from(Buffer.from(execution.pdfBase64, "base64"));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (
    execution.revision.lifecycle_state !== "succeeded"
    || execution.attempt.attempt_intent !== "attach"
    || !text(execution.document, "external_document_id")
    || hash !== attachment.content_sha256
    || hash !== execution.revision.pdf_hash
    || bytes.byteLength !== Number(attachment.byte_size)
    || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new RetentionClaimPushWorkerError(
      "attachment_evidence_mismatch",
      "Immutable Retention Claim PDF evidence failed verification.",
    );
  }
  const token = await getFreshXeroAccessToken(
    String(execution.revision.organization_id),
  );
  if (
    token.connection.id !== execution.revision.connection_id
    || token.connection.tenant_id !== execution.revision.tenant_id
  ) {
    throw new RetentionClaimPushWorkerError(
      "tenant_mismatch",
      "The Xero tenant no longer matches the immutable Retention Claim revision.",
    );
  }
  if (attachment.upload_state !== "uploading") {
    await rpc("transition_accounting_attachment_phase2a", {
      p_attachment_id: attachment.id,
      p_target_state: "uploading",
      p_provider_attachment_id: null,
      p_failure_code: null,
      p_failure_message: null,
    });
  }
  let found;
  try {
    const uploaded = await putXeroInvoiceAttachment({
      accessToken: token.tokenSet.access_token,
      tenantId: String(execution.revision.tenant_id),
      invoiceId: text(execution.document, "external_document_id"),
      fileName: String(attachment.filename),
      bytes,
      includeOnline: true,
    });
    found = uploaded.find(
      (item) => item.FileName === attachment.filename,
    );
    if (!found) throw new Error("Xero did not confirm the uploaded attachment.");
  } catch (error) {
    const code = "attachment_upload_failed";
    const message =
      "The Xero invoice was created, but its immutable PDF attachment requires attention.";
    await rpc("transition_accounting_attachment_phase2a", {
      p_attachment_id: attachment.id,
      p_target_state: "failed",
      p_provider_attachment_id: null,
      p_failure_code: code,
      p_failure_message: message,
    });
    await rpc("finalize_accounting_revision_attempt_phase2a", {
      p_attempt_id: params.attemptId,
      p_worker_id: params.workerId,
      p_lease_token: attempt.lease_token,
      p_terminal_state: "attention_required",
      p_outcome_code: code,
      p_outcome_message: message,
      p_response_evidence: {
        filename: attachment.filename,
        sha256: hash,
      },
    });
    throw new RetentionClaimPushWorkerError(
      code,
      message,
      false,
      error instanceof XeroRequestError && error.isRetryable,
    );
  }
  await rpc("transition_accounting_attachment_phase2a", {
    p_attachment_id: attachment.id,
    p_target_state: "uploaded",
    p_provider_attachment_id:
      found.AttachmentID ?? found.Url ?? attachment.filename,
    p_failure_code: null,
    p_failure_message: null,
  });
  const finalized = await rpc<boolean>(
    "finalize_accounting_revision_attempt_phase2a",
    {
      p_attempt_id: params.attemptId,
      p_worker_id: params.workerId,
      p_lease_token: attempt.lease_token,
      p_terminal_state: "succeeded",
      p_outcome_code: "immutable_pdf_attached",
      p_outcome_message: "Exact immutable Retention Claim revision PDF attached.",
      p_response_evidence: {
        attachmentId: found.AttachmentID ?? null,
        filename: attachment.filename,
        sha256: hash,
      },
    },
  );
  if (!finalized) {
    throw new RetentionClaimPushWorkerError(
      "stale_lease",
      "The Retention Claim attachment lease expired before finalisation.",
    );
  }
  return {
    attachmentId: found.AttachmentID ?? null,
    filename: attachment.filename,
    sha256: hash,
  };
}
