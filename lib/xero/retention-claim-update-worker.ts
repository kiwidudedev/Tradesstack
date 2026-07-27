import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import { parseXeroDate } from "@/lib/xero/bill-status";
import {
  getXeroInvoice,
  updateXeroSalesInvoice,
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
type Execution = {
  document: Row;
  revision: Row;
  previousRevision: Row;
  lines: Row[];
  attempt: Row;
};
type Admin = {
  // Master Retention RPCs intentionally precede generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

export class RetentionClaimUpdateWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "RetentionClaimUpdateWorkerError";
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
  payload: RetentionClaimXeroPayload,
  invoice: XeroInvoice,
) {
  return verifyRetentionClaimXeroInvoice({
    expected: payload,
    actual: invoice as Row,
    subtotalMinor: Number(revision.subtotal_minor),
    taxMinor: Number(revision.tax_minor),
    totalMinor: Number(revision.total_minor),
  });
}

function assertUnpaidAuthorised(invoice: XeroInvoice) {
  const row = invoice as Row;
  if (
    text(row, "Status", "status") !== "AUTHORISED"
    || amount(row, "AmountPaid", "amountPaid") !== 0
    || amount(row, "AmountCredited", "amountCredited") !== 0
    || list(row, "Payments", "payments").length !== 0
    || list(row, "CreditNotes", "creditNotes").length !== 0
  ) {
    throw new RetentionClaimUpdateWorkerError(
      "RETENTION_UPDATE_UNCERTAIN",
      "The existing Xero invoice is no longer authorised, unpaid, and uncredited.",
      false,
      true,
    );
  }
}

async function finishAttention(params: {
  execution: Execution;
  claimedAttempt: Row;
  workerId: string;
  code: string;
  message: string;
  evidence?: Row;
}) {
  await rpc("finalize_accounting_revision_attempt_phase2a", {
    p_attempt_id: params.claimedAttempt.id,
    p_worker_id: params.workerId,
    p_lease_token: params.claimedAttempt.lease_token,
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

export async function executeRetentionClaimUpdate(params: {
  accountingRevisionId: string;
  attemptId: string;
  workerId: string;
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
    throw new RetentionClaimUpdateWorkerError(
      "stale_lease",
      "The Retention update attempt is already owned or complete.",
    );
  }
  const execution = await rpc<Execution | null>(
    "get_master_retention_claim_execution",
    {
      p_revision_id: params.accountingRevisionId,
      p_attempt_id: params.attemptId,
    },
  );
  if (!execution?.previousRevision) {
    throw new RetentionClaimUpdateWorkerError(
      "missing_evidence",
      "Immutable cumulative Retention update evidence was not found.",
    );
  }
  const revision = execution.revision;
  const previous = execution.previousRevision;
  const document = execution.document;
  const invoiceId = text(previous, "external_document_id");
  const invoiceNumber = text(previous, "external_document_number");
  if (
    revision.revision_intent !== "direct_update"
    || execution.attempt.attempt_intent !== "update"
    || !["queued", "processing"].includes(String(revision.lifecycle_state))
    || revision.provider_document_type !== "ACCREC"
    || revision.requested_provider_status !== "AUTHORISED"
    || document.integration_contract !== "retention_claim_revision_v1"
    || document.active_accounting_revision_id !== previous.id
    || text(document, "external_document_id") !== invoiceId
    || text(document, "external_document_number") !== invoiceNumber
    || text(revision, "external_document_number") !== invoiceNumber
    || !invoiceId
  ) {
    throw new RetentionClaimUpdateWorkerError(
      "invalid_revision",
      "The queued cumulative Retention update is not executable.",
    );
  }
  const proposedPayload =
    revision.payload_snapshot as RetentionClaimXeroPayload;
  const previousPayload =
    previous.payload_snapshot as RetentionClaimXeroPayload;
  if (
    proposedPayload.Type !== "ACCREC"
    || proposedPayload.Status !== "AUTHORISED"
    || proposedPayload.InvoiceNumber !== invoiceNumber
    || !Array.isArray(proposedPayload.LineItems)
    || proposedPayload.LineItems.length !== execution.lines.length
  ) {
    throw new RetentionClaimUpdateWorkerError(
      "invalid_payload",
      "The immutable cumulative Retention payload is invalid.",
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
      throw new RetentionClaimUpdateWorkerError(
        "tenant_mismatch",
        hasXeroInvoiceScope(token.connection.scope)
          ? "The connected Xero tenant no longer matches this Retention revision."
          : XERO_INVOICE_SCOPE_RECONNECT_MESSAGE,
      );
    }

    const before = (await getXeroInvoice(
      token.tokenSet.access_token,
      String(revision.tenant_id),
      invoiceId,
    ))[0];
    if (
      !before
      || text(before as Row, "InvoiceID", "invoiceID") !== invoiceId
      || text(before as Row, "InvoiceNumber", "invoiceNumber") !== invoiceNumber
      || text(before as Row, "Type", "type") !== "ACCREC"
    ) {
      throw new RetentionClaimUpdateWorkerError(
        "RETENTION_UPDATE_UNCERTAIN",
        "The exact existing Xero Retention invoice could not be verified.",
        false,
        true,
      );
    }
    assertUnpaidAuthorised(before);
    const alreadyUpdated = exact(revision, proposedPayload, before).exact;
    const baseline = exact(previous, previousPayload, before);
    if (!alreadyUpdated && !baseline.exact) {
      throw new RetentionClaimUpdateWorkerError(
        "RETENTION_UPDATE_UNCERTAIN",
        "The current Xero invoice no longer matches the confirmed update baseline.",
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
        // A timeout is recovered only by reading the same InvoiceID. This
        // worker never searches by number and never creates an invoice.
        const recoveredInvoice = (await getXeroInvoice(
          token.tokenSet.access_token,
          String(revision.tenant_id),
          invoiceId,
        ))[0];
        if (!recoveredInvoice || !exact(
          revision,
          proposedPayload,
          recoveredInvoice,
        ).exact) {
          throw new RetentionClaimUpdateWorkerError(
            "RETENTION_UPDATE_UNCERTAIN",
            "Xero may have received the update, but the exact result is uncertain.",
            false,
            true,
          );
        }
        recovered = true;
      }
    }

    const authoritative = (await getXeroInvoice(
      token.tokenSet.access_token,
      String(revision.tenant_id),
      invoiceId,
    ))[0];
    if (!authoritative) {
      throw new RetentionClaimUpdateWorkerError(
        "RETENTION_UPDATE_VERIFICATION_FAILED",
        "The updated Xero invoice could not be retrieved for exact verification.",
        false,
        true,
      );
    }
    assertUnpaidAuthorised(authoritative);
    const verification = exact(revision, proposedPayload, authoritative);
    if (
      text(authoritative as Row, "InvoiceID", "invoiceID") !== invoiceId
      || text(authoritative as Row, "InvoiceNumber", "invoiceNumber")
        !== invoiceNumber
      || !verification.exact
    ) {
      throw new RetentionClaimUpdateWorkerError(
        "RETENTION_UPDATE_VERIFICATION_FAILED",
        "The same Xero invoice did not exactly match the confirmed cumulative revision.",
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
      "complete_master_retention_claim_push",
      {
        p_attempt_id: params.attemptId,
        p_worker_id: params.workerId,
        p_lease_token: claimedAttempt.lease_token,
        p_result: {
          externalDocumentId: invoiceId,
          externalDocumentNumber: invoiceNumber,
          providerUpdatedAt: parseXeroDate(
            (authoritative as Row).UpdatedDateUTC,
          ),
          settlementHash,
          recovered,
          rawObservation: authoritative,
        },
      },
    );
    if (!completed) {
      throw new RetentionClaimUpdateWorkerError(
        "RETENTION_UPDATE_COMPLETION_FAILED",
        "The Retention update lease expired before verified finalisation.",
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
        ? "RETENTION_UPDATE_RECOVERED"
        : "RETENTION_UPDATE_SUCCEEDED",
    };
  } catch (error) {
    const workerError = error instanceof RetentionClaimUpdateWorkerError
      ? error
      : new RetentionClaimUpdateWorkerError(
          error instanceof XeroRequestError
            ? error.isRetryable
              ? "RETENTION_UPDATE_UNCERTAIN"
              : "RETENTION_UPDATE_REJECTED"
            : "immutable_update_failure",
          error instanceof XeroRequestError
            ? "Xero did not safely accept the cumulative Retention update."
            : "The cumulative Retention update requires accounting attention.",
          false,
          error instanceof XeroRequestError && error.isRetryable,
        );
    await finishAttention({
      execution,
      claimedAttempt,
      workerId: params.workerId,
      code: workerError.code,
      message: workerError.message,
    });
    throw workerError;
  }
}
