import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import {
  createXeroInvoices,
  findXeroInvoicesByNumber,
  getXeroInvoice,
  XeroRequestError,
} from "@/lib/xero/client";
import {
  matchesInitialPushRecoveryCandidate,
  verifyInitialPushXeroInvoice,
} from "@/lib/xero/payment-claim-initial-push-contract";
import { parseXeroDate } from "@/lib/xero/bill-status";
import { hasXeroInvoiceScope } from "@/lib/xero/scopes";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import { resolvePaymentClaimAccountingOperation } from "@/lib/xero/payment-claim-accounting-decision";
import type { PaymentClaimXeroSalesInvoicePayload } from "@/lib/xero/payment-claim-sales-invoice-payload";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 2C functions intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export class PaymentClaimReplacementWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "PaymentClaimReplacementWorkerError";
  }
}

function db() {
  return createAdminSupabaseClient() as unknown as Admin;
}

function text(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function moneyMinor(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : -1;
}

async function rpc<T>(name: string, input: Record<string, unknown>) {
  const result = await db().rpc(name, input);
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

function isUncertain(error: unknown) {
  return !(error instanceof XeroRequestError) || error.isRetryable || error.status === 408;
}

async function finishAttention(params: {
  revision: Row;
  document: Row;
  attempt: Row;
  workerId: string;
  code: string;
  message: string;
  observation?: Row;
}) {
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
    p_revision_id: params.revision.id,
    p_target_state: "attention_required",
    p_failure_code: params.code,
    p_failure_message: params.message,
  });
  await db().from("organization_accounting_events").insert({
    organization_id: params.revision.organization_id,
    accounting_document_id: params.document.id,
    accounting_revision_id: params.revision.id,
    accounting_attempt_id: params.attempt.id,
    event_type: "replacement_failed",
    event_evidence: { code: params.code, message: params.message },
  });
}

export async function executePaymentClaimReplacement(params: {
  accountingRevisionId: string;
  attemptId: string;
  workerId: string;
}) {
  const attempt = await rpc<Row | null>("claim_accounting_revision_attempt_phase2b", {
    p_attempt_id: params.attemptId,
    p_worker_id: params.workerId,
    p_lease_seconds: 180,
  });
  if (!attempt?.lease_token) {
    throw new PaymentClaimReplacementWorkerError("stale_lease", "The immutable replacement attempt is already owned or complete.");
  }
  const execution = await rpc<Record<string, unknown> | null>(
    "get_payment_claim_initial_push_execution_phase2b",
    { p_revision_id: params.accountingRevisionId, p_attempt_id: params.attemptId },
  ) as {
    document: Row;
    revision: Row;
    lines: Row[];
    attachment: Row;
    pdfBase64: string;
    attempt: Row;
  } | null;
  if (!execution) throw new PaymentClaimReplacementWorkerError("missing_evidence", "Immutable replacement evidence was not found.");
  const { revision, document } = execution;
  const admin = db();
  const [previousResult, projectionResult, missingConfirmationResult] = await Promise.all([
    admin.from("organization_accounting_document_revisions").select("*")
      .eq("id", revision.previous_revision_id).maybeSingle(),
    admin.from("organization_accounting_projections").select("*")
      .eq("accounting_document_id", document.id)
      .eq("accounting_revision_id", revision.previous_revision_id)
      .maybeSingle(),
    admin.from("organization_accounting_events").select("id")
      .eq("organization_id", revision.organization_id)
      .eq("accounting_document_id", document.id)
      .eq("accounting_revision_id", revision.previous_revision_id)
      .eq("event_type", "provider_missing_confirmed")
      .limit(1),
  ]);
  if (
    previousResult.error
    || projectionResult.error
    || missingConfirmationResult.error
    || !previousResult.data
    || !projectionResult.data
  ) {
    throw new PaymentClaimReplacementWorkerError("missing_predecessor_evidence", "Replacement predecessor evidence is unavailable.");
  }
  const previous = previousResult.data as Row;
  const projection = projectionResult.data as Row;
  const observationResult = projection.remote_observation_id
    ? await admin.from("organization_accounting_remote_observations")
        .select("raw_observation")
        .eq("organization_id", revision.organization_id)
        .eq("id", projection.remote_observation_id)
        .maybeSingle()
    : { data: null, error: null };
  if (observationResult.error) {
    throw new PaymentClaimReplacementWorkerError(
      "missing_predecessor_observation",
      "The latest immutable Xero observation could not be loaded.",
    );
  }
  const rawObservation = (
    observationResult.data?.raw_observation
    && typeof observationResult.data.raw_observation === "object"
    && !Array.isArray(observationResult.data.raw_observation)
  ) ? observationResult.data.raw_observation as Row : {};
  if (
    revision.lifecycle_state !== "queued"
    || revision.revision_intent !== "replacement"
    || revision.resolution_strategy !== "replacement"
    || execution.attempt.attempt_intent !== "replace"
    || document.active_accounting_revision_id !== previous.id
    || document.external_document_id !== previous.external_document_id
  ) {
    throw new PaymentClaimReplacementWorkerError("invalid_revision", "The queued revision is not an executable replacement.");
  }
  const payload = revision.payload_snapshot as PaymentClaimXeroSalesInvoicePayload;
  if (
    payload.Type !== "ACCREC" || payload.Status !== "AUTHORISED"
    || payload.InvoiceNumber !== revision.external_document_number
    || !Array.isArray(payload.LineItems) || payload.LineItems.length !== execution.lines.length
  ) {
    throw new PaymentClaimReplacementWorkerError("invalid_payload", "Immutable replacement payload evidence failed validation.");
  }
  const token = await getFreshXeroAccessToken(String(revision.organization_id));
  if (
    token.connection.id !== revision.connection_id
    || token.connection.tenant_id !== revision.tenant_id
    || !hasXeroInvoiceScope(token.connection.scope)
  ) {
    throw new PaymentClaimReplacementWorkerError("tenant_mismatch", "The Xero tenant or invoice scope no longer matches the immutable replacement.");
  }

  let predecessorInvoice: XeroInvoice | null = null;
  let predecessorState: "voided" | "deleted" | "paid" | "partially_paid" | "authorised" | "missing_confirmed" | "unknown";
  try {
    predecessorInvoice = (await getXeroInvoice(
      token.tokenSet.access_token,
      String(previous.tenant_id),
      text(previous, "external_document_id"),
    ))[0] ?? null;
    const status = text((predecessorInvoice ?? {}) as Row, "Status", "status").toUpperCase();
    const paidMinor = moneyMinor((predecessorInvoice as Row | null)?.AmountPaid);
    const dueMinor = moneyMinor((predecessorInvoice as Row | null)?.AmountDue);
    predecessorState = status === "VOIDED"
      ? "voided"
      : status === "DELETED"
        ? "deleted"
        : paidMinor > 0 && dueMinor > 0
          ? "partially_paid"
          : paidMinor > 0
            ? "paid"
            : status === "AUTHORISED"
              ? "authorised"
              : "unknown";
  } catch (error) {
    if (
      error instanceof XeroRequestError
      && error.status === 404
      && (missingConfirmationResult.data ?? []).length > 0
    ) {
      predecessorState = "missing_confirmed";
    } else {
      throw error;
    }
  }
  const predecessorRow = (predecessorInvoice ?? rawObservation) as Row;
  const previousPayload = previous.payload_snapshot as PaymentClaimXeroSalesInvoicePayload;
  const structural = predecessorInvoice
    ? verifyInitialPushXeroInvoice({
        expected: previousPayload,
        actual: {
          ...predecessorRow,
          Status: previousPayload.Status,
          AmountPaid: 0,
          AmountCredited: 0,
          AmountDue: Number(previous.total_minor) / 100,
          Payments: [],
          CreditNotes: [],
        },
        expectedTotals: {
          subtotalMinor: Number(previous.subtotal_minor),
          taxMinor: Number(previous.tax_minor),
          totalMinor: Number(previous.total_minor),
        },
      })
    : { exact: true, reasons: [] };
  const decision = resolvePaymentClaimAccountingOperation({
    featureEnabled: true,
    hasPushPermission: true,
    readinessReady: true,
    hasActiveWork: false,
    hasStableDocument: true,
    hasActiveRevision: true,
    activeRevisionIntent: previous.revision_intent === "replacement" ? "replacement" : "initial_push",
    activeInvoiceId: text(previous, "external_document_id"),
    activeInvoiceNumber: text(previous, "external_document_number"),
    replacementNumber: text(revision, "external_document_number"),
    connectionMatches: document.accounting_connection_id === revision.connection_id,
    tenantMatches: document.tenant_id === revision.tenant_id,
    hasInvoiceScope: hasXeroInvoiceScope(token.connection.scope),
    providerAvailable: true,
    providerState: predecessorState,
    amountPaidMinor: moneyMinor(predecessorRow.AmountPaid),
    amountDueMinor: moneyMinor(predecessorRow.AmountDue),
    amountCreditedMinor: moneyMinor(predecessorRow.AmountCredited),
    hasPayments: Array.isArray(predecessorRow.Payments) && predecessorRow.Payments.length > 0,
    hasCredits: Array.isArray(predecessorRow.CreditNotes) && predecessorRow.CreditNotes.length > 0,
    financialDivergence: moneyMinor(predecessorRow.AmountPaid) < 0
      || moneyMinor(predecessorRow.AmountDue) < 0
      || moneyMinor(predecessorRow.AmountCredited) < 0,
    contentDivergence: !structural.exact,
    claimChangedAfterExport: false,
  });
  if (decision.operation !== "REPLACEMENT_EXPORT") {
    const message = decision.blockers[0]?.message
      ?? "The previous Xero invoice is not eligible for replacement.";
    await finishAttention({
      revision,
      document,
      attempt,
      workerId: params.workerId,
      code: decision.blockers[0]?.code ?? "replacement_blocked",
      message,
      observation: predecessorRow,
    });
    await admin.from("organization_accounting_events").insert({
      organization_id: revision.organization_id,
      accounting_document_id: document.id,
      accounting_revision_id: revision.id,
      accounting_attempt_id: attempt.id,
      event_type: "blocked",
      event_evidence: {
        operation: "REPLACEMENT_EXPORT",
        code: decision.blockers[0]?.code ?? "replacement_blocked",
        message,
      },
    });
    throw new PaymentClaimReplacementWorkerError("replacement_blocked", message);
  }
  await admin.from("organization_accounting_events").insert({
    organization_id: revision.organization_id,
    accounting_document_id: document.id,
    accounting_revision_id: revision.id,
    accounting_attempt_id: attempt.id,
    event_type: "replacement_started",
    event_evidence: { previousRevisionId: previous.id },
  });

  let invoice: XeroInvoice;
  let recovered = false;
  const existingCandidates = await findXeroInvoicesByNumber({
    accessToken: token.tokenSet.access_token,
    tenantId: String(revision.tenant_id),
    invoiceNumber: String(revision.external_document_number),
    type: "ACCREC",
  });
  const existingMatches = existingCandidates.filter((candidate) =>
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
  if (existingMatches.length > 1) {
    const message = "More than one Xero invoice matched the immutable replacement number.";
    await finishAttention({
      revision,
      document,
      attempt,
      workerId: params.workerId,
      code: "ambiguous_replacement_recovery",
      message,
    });
    throw new PaymentClaimReplacementWorkerError(
      "ambiguous_replacement_recovery",
      message,
      false,
      true,
    );
  }
  if (existingMatches.length === 1) {
    invoice = existingMatches[0];
    recovered = true;
  } else {
    try {
      const created = await createXeroInvoices({
        accessToken: token.tokenSet.access_token,
        tenantId: String(revision.tenant_id),
        invoices: [payload],
        idempotencyKey: String(execution.attempt.idempotency_key),
        fallbackMessage: "Unable to create the authorised Xero replacement Sales Invoice.",
      });
      if (!created[0]?.InvoiceID) {
        throw new PaymentClaimReplacementWorkerError("incomplete_create_response", "Xero returned an incomplete replacement response.", false, true);
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
      const matches = candidates.filter((candidate) => matchesInitialPushRecoveryCandidate({
        expected: payload,
        candidate: candidate as Row,
        expectedTotals: {
          subtotalMinor: Number(revision.subtotal_minor),
          taxMinor: Number(revision.tax_minor),
          totalMinor: Number(revision.total_minor),
        },
      }));
    if (matches.length !== 1) {
      const code = matches.length > 1 ? "ambiguous_replacement_recovery" : "replacement_outcome_uncertain";
      const message = matches.length > 1
        ? "More than one Xero invoice matched the immutable replacement number."
        : "Xero may have created the replacement, but the result is not safely identifiable.";
      await finishAttention({ revision, document, attempt, workerId: params.workerId, code, message });
      throw new PaymentClaimReplacementWorkerError(code, message, false, true);
    }
    invoice = matches[0];
    recovered = true;
    }
  }
  const invoiceId = text(invoice as Row, "InvoiceID", "invoiceID");
  const authoritative = (await getXeroInvoice(
    token.tokenSet.access_token,
    String(revision.tenant_id),
    invoiceId,
  ))[0];
  const verification = authoritative && verifyInitialPushXeroInvoice({
    expected: payload,
    actual: authoritative as Row,
    expectedTotals: {
      subtotalMinor: Number(revision.subtotal_minor),
      taxMinor: Number(revision.tax_minor),
      totalMinor: Number(revision.total_minor),
    },
  });
  if (!authoritative || !verification?.exact) {
    const message = "The returned Xero replacement does not exactly match the confirmed accounting revision.";
    await finishAttention({
      revision, document, attempt, workerId: params.workerId,
      code: "provider_content_mismatch", message,
      observation: authoritative as Row | undefined,
    });
    throw new PaymentClaimReplacementWorkerError("provider_content_mismatch", message, false, true);
  }
  const settlementHash = hashAccountingEvidence({
    amountPaid: (authoritative as Row).AmountPaid ?? 0,
    amountCredited: (authoritative as Row).AmountCredited ?? 0,
    payments: (authoritative as Row).Payments ?? [],
    creditNotes: (authoritative as Row).CreditNotes ?? [],
  });
  const completed = await rpc<boolean>("complete_payment_claim_replacement_phase2c", {
    p_attempt_id: params.attemptId,
    p_worker_id: params.workerId,
    p_lease_token: attempt.lease_token,
    p_result: {
      externalDocumentId: invoiceId,
      externalDocumentNumber: revision.external_document_number,
      providerUpdatedAt: parseXeroDate((authoritative as Row).UpdatedDateUTC),
      settlementHash,
      rawObservation: authoritative,
      recovered,
    },
  });
  if (!completed) throw new PaymentClaimReplacementWorkerError("stale_lease", "The worker lease expired before replacement finalisation.");
  return {
    accountingRevisionId: revision.id,
    invoiceId,
    invoiceNumber: revision.external_document_number,
    status: "AUTHORISED" as const,
    recovered,
    exact: true,
  };
}
