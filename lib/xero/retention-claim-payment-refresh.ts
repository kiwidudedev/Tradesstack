import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  allocatePaidRetentionByLargestRemainder,
  projectGrossPaidToRetentionBasis,
} from "@/lib/retention/phase10-payment-attribution";
import { getXeroInvoice, XeroRequestError } from "@/lib/xero/client";
import { normalizeXeroSalesInvoicePaymentState } from "@/lib/xero/payment-claim-sales-invoice-refresh";
import { getFreshXeroAccessToken } from "@/lib/xero/service";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 10 RPCs and tables intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export class RetentionClaimPaymentRefreshError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "RetentionClaimPaymentRefreshError";
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

function cents(value: number) {
  return Math.round(value * 100);
}

export async function refreshRetentionClaimPaymentFromXero(params: {
  organizationId: string;
  accountingDocumentId: string;
  workerJobId: string;
  actorUserId: string | null;
}) {
  const admin = db(await createAdminSupabaseClient());
  const documentResult = await admin.from("organization_accounting_documents")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .maybeSingle();
  if (documentResult.error || !documentResult.data) {
    throw new RetentionClaimPaymentRefreshError(
      "document_not_found",
      "Retention Claim accounting document not found.",
    );
  }
  const document = documentResult.data as Row;
  const invoiceId = text(document.external_document_id);
  if (
    document.provider !== "xero"
    || document.local_document_type !== "retention_claim"
    || !text(document.retention_claim_id)
    || !invoiceId
  ) {
    throw new RetentionClaimPaymentRefreshError(
      "invalid_document",
      "The accounting document is not a linked Retention Claim invoice.",
    );
  }

  const [snapshotResult, claimResult, allocationsResult, latestResult] =
    await Promise.all([
      admin.from("retention_claim_accounting_snapshots").select("*")
        .eq("organization_id", params.organizationId)
        .eq("accounting_document_id", params.accountingDocumentId)
        .maybeSingle(),
      admin.from("retention_claims").select("*")
        .eq("organization_id", params.organizationId)
        .eq("id", document.retention_claim_id).maybeSingle(),
      admin.from("retention_claim_allocations").select("*")
        .eq("organization_id", params.organizationId)
        .eq("retention_claim_id", document.retention_claim_id)
        .order("allocation_sequence"),
      admin.from("retention_claim_payment_reconciliations")
        .select("id")
        .eq("organization_id", params.organizationId)
        .eq("retention_claim_id", document.retention_claim_id)
        .order("reconciliation_sequence", { ascending: false })
        .limit(1),
    ]);
  const queryError =
    snapshotResult.error
    ?? claimResult.error
    ?? allocationsResult.error
    ?? latestResult.error;
  if (queryError) throw new Error(queryError.message);
  if (!snapshotResult.data || !claimResult.data) {
    throw new RetentionClaimPaymentRefreshError(
      "evidence_not_found",
      "Immutable Retention Claim accounting evidence was not found.",
    );
  }
  const snapshot = snapshotResult.data as Row;
  const claim = claimResult.data as Row;
  if (claim.status !== "submitted") {
    throw new RetentionClaimPaymentRefreshError(
      "claim_not_submitted",
      "Only submitted Retention Claims can reconcile payments.",
    );
  }

  const token = await getFreshXeroAccessToken(params.organizationId);
  if (
    token.connection.id !== document.accounting_connection_id
    || token.connection.tenant_id !== document.tenant_id
    || token.connection.id !== snapshot.connection_id_snapshot
    || token.connection.tenant_id !== snapshot.tenant_id_snapshot
  ) {
    throw new RetentionClaimPaymentRefreshError(
      "connection_mismatch",
      "The connected Xero tenant does not match immutable accounting evidence.",
    );
  }

  let invoices;
  try {
    invoices = await getXeroInvoice(
      token.tokenSet.access_token,
      String(document.tenant_id),
      invoiceId,
    );
  } catch (error) {
    if (error instanceof XeroRequestError && error.status === 404) {
      throw new RetentionClaimPaymentRefreshError(
        "invoice_missing",
        "The linked Retention Claim Xero invoice could not be found.",
      );
    }
    throw error;
  }
  const invoice = invoices[0];
  if (
    !invoice
    || invoice.InvoiceID !== invoiceId
    || invoice.Type !== "ACCREC"
    || invoice.InvoiceNumber !== snapshot.invoice_number_snapshot
    || invoice.InvoiceNumber !== document.external_document_number
  ) {
    throw new RetentionClaimPaymentRefreshError(
      "invoice_identity_mismatch",
      "Xero returned a different Retention Claim invoice identity.",
    );
  }

  const provider = normalizeXeroSalesInvoicePaymentState(invoice);
  let attentionCode: string | null = null;
  let attentionMessage: string | null = null;
  if (provider.rawStatus === "VOIDED" || provider.rawStatus === "DELETED") {
    attentionCode = "invoice_voided_or_deleted";
    attentionMessage =
      "The Retention Claim Xero invoice is voided or deleted. Manual reconciliation is required.";
  } else if (cents(provider.amountCredited) > 0) {
    attentionCode = "credit_detected";
    attentionMessage =
      "Xero credit was detected. Phase 10 does not automatically allocate credits; manual reconciliation is required.";
  } else if (
    cents(provider.total) !== cents(Number(snapshot.total_snapshot))
    || cents(provider.total) !== cents(Number(document.amount_exported))
  ) {
    attentionCode = "invoice_total_divergence";
    attentionMessage =
      "The Xero invoice total differs from immutable Phase 9 accounting evidence.";
  } else if (
    cents(provider.amountPaid) > cents(provider.total)
    || cents(provider.amountPaid + provider.amountDue) !==
      cents(provider.total)
  ) {
    attentionCode = "paid_over_allocation";
    attentionMessage =
      "Xero payment totals cannot be safely allocated. Manual reconciliation is required.";
  } else if (provider.paymentProjection === "attention_required") {
    attentionCode = "provider_payment_state_invalid";
    attentionMessage =
      "Xero returned a payment state that cannot be safely reconciled.";
  }

  let paidAmount: number | null = null;
  let attributions: ReturnType<
    typeof allocatePaidRetentionByLargestRemainder
  > = [];
  let paymentStatus:
    | "unpaid"
    | "partially_paid"
    | "paid"
    | "attention_required" = "attention_required";
  if (!attentionCode) {
    paidAmount = projectGrossPaidToRetentionBasis({
      subtotalExclTax: Number(snapshot.subtotal_excl_tax_snapshot),
      invoiceTotal: provider.total,
      amountPaid: provider.amountPaid,
    });
    attributions = allocatePaidRetentionByLargestRemainder({
      paidAmount,
      subtotalExclTax: Number(snapshot.subtotal_excl_tax_snapshot),
      allocations: (allocationsResult.data ?? []).map((row: Row) => ({
        allocationId: String(row.id),
        originatingPaymentClaimId:
          String(row.originating_payment_claim_id),
        sequence: Number(row.allocation_sequence),
        allocationAmount: Number(row.allocation_amount),
      })),
    });
    const subtotal = Number(snapshot.subtotal_excl_tax_snapshot);
    paymentStatus = paidAmount === 0
      ? "unpaid"
      : paidAmount === subtotal
        ? "paid"
        : "partially_paid";
  }

  const applied = await admin.rpc(
    "record_retention_claim_payment_reconciliation",
    {
      p_retention_claim_id: document.retention_claim_id,
      p_source: "xero",
      p_actor_user_id: params.actorUserId,
      p_expected_previous_reconciliation_id:
        latestResult.data?.[0]?.id ?? null,
      p_payment_status: paymentStatus,
      p_projection_applied: !attentionCode,
      p_paid_amount_excl_tax: paidAmount,
      p_invoice_total_gross: provider.total,
      p_amount_paid_gross: provider.amountPaid,
      p_amount_due_gross: provider.amountDue,
      p_amount_credited_gross: provider.amountCredited,
      p_raw_provider_status: provider.rawStatus,
      p_normalized_provider_status: provider.normalizedStatus,
      p_fully_paid_at: provider.fullyPaidAt,
      p_provider_updated_at: provider.providerUpdatedAt,
      p_accounting_document_id: document.id,
      p_accounting_snapshot_id: snapshot.id,
      p_external_document_id: invoiceId,
      p_attention_code: attentionCode,
      p_attention_message: attentionMessage,
      p_attributions: attributions,
      p_correlation_id: params.workerJobId,
    },
  );
  if (applied.error) throw new Error(applied.error.message);
  const result = applied.data as {
    succeeded?: boolean;
    errorCode?: string;
    reconciliationId?: string;
  };
  if (!result?.succeeded) {
    throw new RetentionClaimPaymentRefreshError(
      result?.errorCode ?? "reconciliation_rejected",
      `Retention Claim payment reconciliation was rejected (${result?.errorCode ?? "unknown"}).`,
      result?.errorCode === "concurrent_reconciliation",
    );
  }
  return {
    reconciliationId: result.reconciliationId,
    retentionClaimId: String(document.retention_claim_id),
    paymentStatus,
    projectionApplied: !attentionCode,
    paidAmountExclTax: paidAmount,
    amountPaidGross: provider.amountPaid,
    amountDueGross: provider.amountDue,
    attentionCode,
  };
}

export async function recordRetentionClaimPaymentRefreshError(params: {
  organizationId: string;
  accountingDocumentId: string;
  error: unknown;
}) {
  const admin = db(await createAdminSupabaseClient());
  const message = params.error instanceof Error
    ? params.error.message
    : "Unable to refresh the Retention Claim Xero payment state.";
  await admin.from("organization_accounting_documents").update({
    last_status_sync_error: message,
  })
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .eq("local_document_type", "retention_claim");
  return message;
}
