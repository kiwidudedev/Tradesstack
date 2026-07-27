import "server-only";

import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { parseXeroDate } from "@/lib/xero/bill-status";
import {
  getXeroInvoice,
  updateXeroSalesInvoice,
  XeroRequestError,
} from "@/lib/xero/client";
import {
  verifyInitialPushXeroInvoice,
} from "@/lib/xero/payment-claim-initial-push-contract";
import type {
  PaymentClaimXeroSalesInvoicePayload,
} from "@/lib/xero/payment-claim-sales-invoice-payload";
import {
  hasXeroInvoiceScope,
  XERO_INVOICE_SCOPE_RECONNECT_MESSAGE,
} from "@/lib/xero/scopes";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type Execution = {
  document: Row;
  revision: Row;
  previousRevision: Row;
  lines: Row[];
  attempt: Row;
};
type Admin = {
  // The forward-only accounting update RPCs precede generated database types.
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export class PaymentClaimAccountingUpdateWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "PaymentClaimAccountingUpdateWorkerError";
  }
}

function admin() {
  return createAdminSupabaseClient() as unknown as Admin;
}

async function rpc<T>(name: string, input: Record<string, unknown>) {
  const result = await admin().rpc(name, input);
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
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

function amount(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function exact(
  revision: Row,
  payload: PaymentClaimXeroSalesInvoicePayload,
  invoice: XeroInvoice,
) {
  return verifyInitialPushXeroInvoice({
    expected: payload,
    actual: invoice as Row,
    expectedTotals: {
      subtotalMinor: Number(revision.subtotal_minor),
      taxMinor: Number(revision.tax_minor),
      totalMinor: Number(revision.total_minor),
    },
  });
}

function structurallyExact(
  revision: Row,
  payload: PaymentClaimXeroSalesInvoicePayload,
  invoice: XeroInvoice,
) {
  const normalized = {
    ...invoice,
    Status: "AUTHORISED",
    AmountPaid: 0,
    AmountCredited: 0,
    Payments: [],
    CreditNotes: [],
  } as unknown as XeroInvoice;
  return exact(revision, payload, normalized);
}

function assertSameInvoiceIdentity(params: {
  invoice: XeroInvoice;
  invoiceId: string;
  invoiceNumber: string;
}) {
  const row = params.invoice as Row;
  if (
    text(row, "InvoiceID", "invoiceID") !== params.invoiceId
    || text(row, "InvoiceNumber", "invoiceNumber") !== params.invoiceNumber
    || text(row, "Type", "type") !== "ACCREC"
  ) {
    throw new PaymentClaimAccountingUpdateWorkerError(
      "PAYMENT_CLAIM_UPDATE_UNCERTAIN",
      "The exact Xero Payment Claim invoice identity changed.",
      false,
      true,
    );
  }
}

function isUnpaidAuthorised(invoice: XeroInvoice) {
  const row = invoice as Row;
  return text(row, "Status", "status") === "AUTHORISED"
    && amount(row, "AmountPaid", "amountPaid") === 0
    && amount(row, "AmountCredited", "amountCredited") === 0
    && list(row, "Payments", "payments").length === 0
    && list(row, "CreditNotes", "creditNotes").length === 0;
}

async function persistBlockedObservation(params: {
  revision: Row;
  previous: Row;
  document: Row;
  invoice: XeroInvoice;
  predecessorStructurallyExact: boolean;
  attemptId: string;
}) {
  const invoice = params.invoice as Row;
  const paidMinor = Math.round(amount(invoice, "AmountPaid", "amountPaid") * 100);
  const creditedMinor = Math.round(
    amount(invoice, "AmountCredited", "amountCredited") * 100,
  );
  const dueMinor = Math.round(amount(invoice, "AmountDue", "amountDue") * 100);
  const rawStatus = text(invoice, "Status", "status") || "UNKNOWN";
  await rpc("record_accounting_remote_observation_phase2a", {
    p_input: {
      organizationId: params.revision.organization_id,
      accountingDocumentId: params.document.id,
      accountingRevisionId: params.previous.id,
      provider: "xero",
      tenantId: params.previous.tenant_id ?? params.revision.tenant_id,
      externalDocumentId: params.previous.external_document_id,
      providerUpdatedAt: parseXeroDate(invoice.UpdatedDateUTC),
      rawStatus,
      normalizedStatus: rawStatus.toLowerCase(),
      normalizedInvoiceStatus: rawStatus.toLowerCase(),
      normalizedPaymentStatus: paidMinor > 0
        ? dueMinor > 0 ? "partially_paid" : "paid"
        : creditedMinor > 0 ? "attention_required" : "unpaid",
      contentHash: params.predecessorStructurallyExact
        ? params.previous.provider_content_hash
        : hashAccountingEvidence(invoice),
      settlementHash: hashAccountingEvidence({
        amountPaid: amount(invoice, "AmountPaid", "amountPaid"),
        amountCredited: amount(invoice, "AmountCredited", "amountCredited"),
        payments: list(invoice, "Payments", "payments"),
        creditNotes: list(invoice, "CreditNotes", "creditNotes"),
      }),
      amountPaidMinor: paidMinor,
      amountDueMinor: dueMinor,
      amountCreditedMinor: creditedMinor,
      rawObservation: invoice,
      correlationId: params.attemptId,
    },
  }).catch(() => null);
}

async function finishAttention(params: {
  execution: Execution;
  claimedAttempt: Row;
  workerId: string;
  code: string;
  message: string;
}) {
  await rpc("finalize_accounting_revision_attempt_phase2a", {
    p_attempt_id: params.claimedAttempt.id,
    p_worker_id: params.workerId,
    p_lease_token: params.claimedAttempt.lease_token,
    p_terminal_state: "attention_required",
    p_outcome_code: params.code,
    p_outcome_message: params.message,
    p_response_evidence: { code: params.code },
  }).catch(() => false);
  await rpc("transition_accounting_revision_lifecycle_phase2a", {
    p_revision_id: params.execution.revision.id,
    p_target_state: "attention_required",
    p_failure_code: params.code,
    p_failure_message: params.message,
  }).catch(() => false);
}

export async function executePaymentClaimAccountingUpdate(params: {
  accountingRevisionId: string;
  attemptId: string;
  workerId: string;
  jobId: string;
}) {
  const claimedAttempt = await rpc<Row | null>(
    "claim_accounting_revision_attempt_phase2b",
    {
      p_attempt_id: params.attemptId,
      p_worker_id: params.workerId,
      p_lease_seconds: 180,
    },
  );
  if (!claimedAttempt?.lease_token) {
    throw new PaymentClaimAccountingUpdateWorkerError(
      "stale_lease",
      "The immutable Payment Claim update attempt is already owned or complete.",
    );
  }
  const execution = await rpc<Execution | null>(
    "get_payment_claim_accounting_update_execution",
    {
      p_revision_id: params.accountingRevisionId,
      p_attempt_id: params.attemptId,
    },
  );
  if (!execution?.previousRevision) {
    throw new PaymentClaimAccountingUpdateWorkerError(
      "missing_evidence",
      "Immutable Payment Claim update evidence was not found.",
    );
  }

  const { revision, previousRevision: previous, document } = execution;
  const invoiceId = text(previous, "external_document_id");
  const invoiceNumber = text(previous, "external_document_number");
  if (
    revision.revision_intent !== "direct_update"
    || revision.resolution_strategy !== "update_existing"
    || execution.attempt.attempt_intent !== "update"
    || !["queued", "processing"].includes(String(revision.lifecycle_state))
    || revision.provider_document_type !== "ACCREC"
    || revision.requested_provider_status !== "AUTHORISED"
    || document.integration_contract !== "payment_claim_revision_v1"
    || document.active_accounting_revision_id !== previous.id
    || text(document, "external_document_id") !== invoiceId
    || text(document, "external_document_number") !== invoiceNumber
    || text(revision, "external_document_number") !== invoiceNumber
    || !invoiceId
  ) {
    throw new PaymentClaimAccountingUpdateWorkerError(
      "invalid_revision",
      "The queued immutable Payment Claim update is not executable.",
    );
  }

  const proposedPayload =
    revision.payload_snapshot as PaymentClaimXeroSalesInvoicePayload;
  const previousPayload =
    previous.payload_snapshot as PaymentClaimXeroSalesInvoicePayload;
  if (
    proposedPayload.Type !== "ACCREC"
    || proposedPayload.Status !== "AUTHORISED"
    || proposedPayload.InvoiceNumber !== invoiceNumber
    || !Array.isArray(proposedPayload.LineItems)
    || proposedPayload.LineItems.length !== execution.lines.length
  ) {
    throw new PaymentClaimAccountingUpdateWorkerError(
      "invalid_payload",
      "The immutable Payment Claim update payload is invalid.",
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
    const token = await getFreshXeroAccessToken(
      String(revision.organization_id),
    );
    if (
      token.connection.id !== revision.connection_id
      || token.connection.tenant_id !== revision.tenant_id
      || !hasXeroInvoiceScope(token.connection.scope)
    ) {
      throw new PaymentClaimAccountingUpdateWorkerError(
        "tenant_mismatch",
        hasXeroInvoiceScope(token.connection.scope)
          ? "The connected Xero tenant no longer matches this Payment Claim revision."
          : XERO_INVOICE_SCOPE_RECONNECT_MESSAGE,
      );
    }

    const before = (await getXeroInvoice(
      token.tokenSet.access_token,
      String(revision.tenant_id),
      invoiceId,
    ))[0];
    if (!before) {
      throw new PaymentClaimAccountingUpdateWorkerError(
        "PAYMENT_CLAIM_UPDATE_UNCERTAIN",
        "The exact existing Xero Payment Claim invoice could not be retrieved.",
        false,
        true,
      );
    }
    assertSameInvoiceIdentity({ invoice: before, invoiceId, invoiceNumber });

    const alreadyUpdated = exact(revision, proposedPayload, before).exact;
    const baseline = structurallyExact(previous, previousPayload, before);
    if (!alreadyUpdated && (!baseline.exact || !isUnpaidAuthorised(before))) {
      await persistBlockedObservation({
        revision,
        previous,
        document,
        invoice: before,
        predecessorStructurallyExact: baseline.exact,
        attemptId: params.attemptId,
      });
      throw new PaymentClaimAccountingUpdateWorkerError(
        "PAYMENT_CLAIM_UPDATE_UNCERTAIN",
        baseline.exact
          ? "The Xero invoice is no longer authorised, unpaid, and uncredited."
          : "The Xero invoice no longer matches the immutable predecessor revision.",
        false,
        true,
      );
    }

    let recovered = alreadyUpdated;
    if (!alreadyUpdated) {
      try {
        await updateXeroSalesInvoice({
          accessToken: token.tokenSet.access_token,
          tenantId: String(revision.tenant_id),
          invoiceId,
          invoice: proposedPayload,
          idempotencyKey: String(execution.attempt.idempotency_key),
        });
      } catch (error) {
        if (
          !(error instanceof XeroRequestError)
          || (!error.isRetryable && error.status !== 408)
        ) {
          throw error;
        }
        // Ambiguous writes are recovered exclusively by reading the same
        // InvoiceID. This worker never searches by number or creates an invoice.
        const recoveredInvoice = (await getXeroInvoice(
          token.tokenSet.access_token,
          String(revision.tenant_id),
          invoiceId,
        ))[0];
        if (!recoveredInvoice) {
          throw new PaymentClaimAccountingUpdateWorkerError(
            "PAYMENT_CLAIM_UPDATE_UNCERTAIN",
            "Xero may have received the update, but the exact result is uncertain.",
            false,
            true,
          );
        }
        assertSameInvoiceIdentity({
          invoice: recoveredInvoice,
          invoiceId,
          invoiceNumber,
        });
        if (exact(revision, proposedPayload, recoveredInvoice).exact) {
          recovered = true;
        } else if (
          structurallyExact(previous, previousPayload, recoveredInvoice).exact
          && isUnpaidAuthorised(recoveredInvoice)
        ) {
          // The authoritative read proves the first request did not change the
          // predecessor. Retry the exact same InvoiceID with the same
          // idempotency key; this can never create a second invoice.
          await updateXeroSalesInvoice({
            accessToken: token.tokenSet.access_token,
            tenantId: String(revision.tenant_id),
            invoiceId,
            invoice: proposedPayload,
            idempotencyKey: String(execution.attempt.idempotency_key),
          });
        } else {
          await persistBlockedObservation({
            revision,
            previous,
            document,
            invoice: recoveredInvoice,
            predecessorStructurallyExact: structurallyExact(
              previous,
              previousPayload,
              recoveredInvoice,
            ).exact,
            attemptId: params.attemptId,
          });
          throw new PaymentClaimAccountingUpdateWorkerError(
            "PAYMENT_CLAIM_UPDATE_UNCERTAIN",
            "The timed-out Xero update matches neither safe immutable state.",
            false,
            true,
          );
        }
      }
    }

    const authoritative = (await getXeroInvoice(
      token.tokenSet.access_token,
      String(revision.tenant_id),
      invoiceId,
    ))[0];
    if (!authoritative) {
      throw new PaymentClaimAccountingUpdateWorkerError(
        "PAYMENT_CLAIM_UPDATE_VERIFICATION_FAILED",
        "The updated Xero invoice could not be retrieved for exact verification.",
        false,
        true,
      );
    }
    assertSameInvoiceIdentity({
      invoice: authoritative,
      invoiceId,
      invoiceNumber,
    });
    if (!isUnpaidAuthorised(authoritative)) {
      throw new PaymentClaimAccountingUpdateWorkerError(
        "PAYMENT_CLAIM_UPDATE_VERIFICATION_FAILED",
        "The updated Xero invoice is no longer authorised, unpaid, and uncredited.",
        false,
        true,
      );
    }
    const verification = exact(revision, proposedPayload, authoritative);
    if (!verification.exact) {
      throw new PaymentClaimAccountingUpdateWorkerError(
        "PAYMENT_CLAIM_UPDATE_VERIFICATION_FAILED",
        `The same Xero invoice failed exact verification: ${verification.reasons.join(", ")}.`,
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
    let completed: boolean;
    try {
      completed = await rpc<boolean>(
        "complete_payment_claim_accounting_update",
        {
          p_attempt_id: params.attemptId,
          p_worker_id: params.workerId,
          p_lease_token: claimedAttempt.lease_token,
          p_result: {
            jobId: params.jobId,
            externalDocumentId: invoiceId,
            externalDocumentNumber: invoiceNumber,
            subtotalMinor: revision.subtotal_minor,
            taxMinor: revision.tax_minor,
            totalMinor: revision.total_minor,
            providerUpdatedAt: parseXeroDate(
              (authoritative as Row).UpdatedDateUTC,
            ),
            settlementHash,
            recovered,
            rawObservation: authoritative,
          },
        },
      );
    } catch {
      throw new PaymentClaimAccountingUpdateWorkerError(
        "PAYMENT_CLAIM_UPDATE_COMPLETION_FAILED",
        "The verified Xero update could not yet be completed locally.",
        true,
      );
    }
    if (!completed) {
      throw new PaymentClaimAccountingUpdateWorkerError(
        "PAYMENT_CLAIM_UPDATE_COMPLETION_FAILED",
        "The Payment Claim update lease expired before verified finalisation.",
        true,
      );
    }
    return {
      accountingRevisionId: revision.id,
      invoiceId,
      invoiceNumber,
      status: "AUTHORISED" as const,
      recovered,
      exact: true,
      code: recovered
        ? "PAYMENT_CLAIM_UPDATE_RECOVERED"
        : "PAYMENT_CLAIM_UPDATE_SUCCEEDED",
    };
  } catch (error) {
    const workerError = error instanceof PaymentClaimAccountingUpdateWorkerError
      ? error
      : new PaymentClaimAccountingUpdateWorkerError(
          error instanceof XeroRequestError
            ? error.isRetryable
              ? "PAYMENT_CLAIM_UPDATE_UNCERTAIN"
              : "PAYMENT_CLAIM_UPDATE_REJECTED"
            : "immutable_update_failure",
          error instanceof XeroRequestError
            ? "Xero did not safely accept the immutable Payment Claim update."
            : "The immutable Payment Claim update requires accounting attention.",
          false,
          error instanceof XeroRequestError && error.isRetryable,
        );
    if (!workerError.retryable || workerError.uncertain) {
      await finishAttention({
        execution,
        claimedAttempt,
        workerId: params.workerId,
        code: workerError.code,
        message: workerError.message,
      });
    }
    throw workerError;
  }
}
