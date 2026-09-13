import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { parseXeroDate } from "@/lib/xero/bill-status";
import { getXeroInvoice, XeroRequestError } from "@/lib/xero/client";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { XeroInvoice } from "@/lib/xero/types";
import {
  deriveProjectClaimPaymentProjection,
  type ProjectClaimPaymentStatus,
} from "@/lib/xero/payment-claim-payment-projection";
import { XERO_SALES_INVOICE_MISSING_MESSAGE } from "@/lib/xero/payment-claim-sales-invoice-refresh-contract";
import {
  hashAccountingEvidence,
} from "@/lib/accounting/accounting-evidence";
import { verifyInitialPushXeroInvoice } from "@/lib/xero/payment-claim-initial-push-contract";
import type { PaymentClaimXeroSalesInvoicePayload } from "@/lib/xero/payment-claim-sales-invoice-payload";
import type { XeroActionTiming } from "@/lib/xero/action-performance";
import {
  createAccountingSyncRequestContextFromIdentity,
} from "@/lib/xero/accounting-sync-request-context";
import {
  isPaymentClaimInitialPushEnabled,
} from "@/lib/xero/payment-claim-initial-push-proposal";
import {
  PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
} from "@/lib/xero/payment-claim-initial-push-contract";
import {
  resolvePaymentClaimAccountingIdentity,
  type PaymentClaimAccountingIdentitySnapshot,
  type PaymentClaimRefreshBlockingReason,
} from "@/lib/xero/payment-claim-accounting-identity";

type Row = Record<string, unknown>;
type UntypedAdmin = {
  // Stage 1 polymorphic fields are not present in every generated client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // The atomic Xero-to-claim projection RPC is newer than generated client types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<any>;
};

export type XeroSalesInvoicePaymentProjection =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "attention_required";

export type NormalizedXeroSalesInvoicePaymentState = {
  rawStatus: string;
  normalizedStatus: "awaiting_payment" | "partially_paid" | "paid" | "voided" | "deleted" | "unknown";
  paymentProjection: XeroSalesInvoicePaymentProjection;
  total: number;
  amountPaid: number;
  amountDue: number;
  amountCredited: number;
  fullyPaidAt: string | null;
  providerUpdatedAt: string | null;
};

export class XeroSalesInvoiceRefreshError extends Error {
  readonly code:
    | "document_not_found"
    | "invalid_document"
    | "missing_invoice"
    | "connection_mismatch"
    | "invoice_identity_mismatch"
    | "invoice_number_mismatch"
    | "revision_mismatch"
    | "invalid_provider_response"
    | "total_divergence"
    | "provider_failure"
    | "unauthorized"
    | "sync_in_progress"
    | "attachment_in_progress"
    | "initial_push_in_progress"
    | "replacement_in_progress"
    | "accounting_update_in_progress"
    | "refresh_in_progress"
    | "tenant_mismatch"
    | "enqueue_failed";
  readonly safeMessage: string;
  readonly isRetryable: boolean;

  constructor(
    code: XeroSalesInvoiceRefreshError["code"],
    message: string,
    options?: { safeMessage?: string; isRetryable?: boolean },
  ) {
    super(message);
    this.name = "XeroSalesInvoiceRefreshError";
    this.code = code;
    this.safeMessage = options?.safeMessage ?? message;
    this.isRetryable = options?.isRetryable ?? false;
  }
}

function throwForIdentityResolution(
  identity: PaymentClaimAccountingIdentitySnapshot,
): asserts identity is PaymentClaimAccountingIdentitySnapshot & {
  document: Row;
  currentConnection: Row;
  invoiceId: string;
} {
  const reason = identity.refresh.blockingReason;
  if (!reason) return;
  const message = identity.refresh.message
    ?? "The Xero Sales Invoice cannot be refreshed right now.";
  const workflowCodes: Partial<Record<
    PaymentClaimRefreshBlockingReason,
    XeroSalesInvoiceRefreshError["code"]
  >> = {
    initial_push_in_progress: "initial_push_in_progress",
    replacement_in_progress: "replacement_in_progress",
    accounting_update_in_progress: "accounting_update_in_progress",
    sync_in_progress: "sync_in_progress",
    refresh_in_progress: "refresh_in_progress",
  };
  const workflowCode = workflowCodes[reason];
  if (workflowCode) {
    throw new XeroSalesInvoiceRefreshError(workflowCode, message);
  }
  if (reason === "missing_accounting_identity") {
    throw new XeroSalesInvoiceRefreshError(
      "document_not_found",
      "The Payment Claim accounting identity was not found.",
    );
  }
  if (reason === "missing_invoice_id") {
    throw new XeroSalesInvoiceRefreshError("missing_invoice", message);
  }
  if (reason === "missing_active_revision") {
    throw new XeroSalesInvoiceRefreshError("invalid_document", message);
  }
  if (reason === "invoice_number_mismatch") {
    throw new XeroSalesInvoiceRefreshError(
      "invoice_number_mismatch",
      message,
    );
  }
  if (reason === "revision_mismatch") {
    throw new XeroSalesInvoiceRefreshError(
      "revision_mismatch",
      message,
    );
  }
  if (reason === "invoice_id_mismatch") {
    throw new XeroSalesInvoiceRefreshError(
      "invoice_identity_mismatch",
      message,
    );
  }
  if (reason === "tenant_mismatch") {
    throw new XeroSalesInvoiceRefreshError("tenant_mismatch", message);
  }
  throw new XeroSalesInvoiceRefreshError("connection_mismatch", message);
}

function scheduledRefreshAlreadyQueued(params: {
  identity: PaymentClaimAccountingIdentitySnapshot;
  triggerSource: "manual_refresh" | "scheduled";
  documentId: string;
}) {
  if (
    params.triggerSource !== "scheduled"
    || params.identity.refresh.blockingReason !== "refresh_in_progress"
    || !params.identity.activeRefreshJob
  ) return null;
  return {
    jobId: String(params.identity.activeRefreshJob.id),
    documentId: params.documentId,
    currentStatus: String(params.identity.activeRefreshJob.queue_state),
    created: false,
  };
}

function db(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedAdmin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strictMoney(value: unknown, field: string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new XeroSalesInvoiceRefreshError(
      "invalid_provider_response",
      `Xero returned an invalid ${field}.`,
      { safeMessage: "Xero returned invalid Sales Invoice payment totals." },
    );
  }
  return Math.round(numeric * 100) / 100;
}

export function normalizeXeroSalesInvoicePaymentState(
  invoice: XeroInvoice,
): NormalizedXeroSalesInvoicePaymentState {
  const rawStatus = text(invoice.Status)?.toUpperCase() ?? "UNKNOWN";
  const total = strictMoney(invoice.Total, "invoice total");
  const amountPaid = strictMoney(invoice.AmountPaid, "amount paid");
  const amountDue = strictMoney(invoice.AmountDue, "amount due");
  const amountCredited = strictMoney(invoice.AmountCredited ?? 0, "amount credited");
  const fullyPaidAt = parseXeroDate(invoice.FullyPaidOnDate);
  const providerUpdatedAt = parseXeroDate(invoice.UpdatedDateUTC);

  if (rawStatus === "VOIDED" || rawStatus === "DELETED") {
    return {
      rawStatus,
      normalizedStatus: rawStatus === "VOIDED" ? "voided" : "deleted",
      paymentProjection: "attention_required",
      total,
      amountPaid,
      amountDue,
      amountCredited,
      fullyPaidAt,
      providerUpdatedAt,
    };
  }
  if (total > 0 && amountDue === 0 && (amountPaid > 0 || amountCredited > 0 || fullyPaidAt !== null)) {
    return {
      rawStatus,
      normalizedStatus: "paid",
      paymentProjection: "paid",
      total,
      amountPaid,
      amountDue,
      amountCredited,
      fullyPaidAt,
      providerUpdatedAt,
    };
  }
  if (amountPaid > 0 && amountDue > 0) {
    return {
      rawStatus,
      normalizedStatus: "partially_paid",
      paymentProjection: "partially_paid",
      total,
      amountPaid,
      amountDue,
      amountCredited,
      fullyPaidAt,
      providerUpdatedAt,
    };
  }
  if (amountPaid === 0 && amountDue > 0) {
    return {
      rawStatus,
      normalizedStatus: "awaiting_payment",
      paymentProjection: "unpaid",
      total,
      amountPaid,
      amountDue,
      amountCredited,
      fullyPaidAt,
      providerUpdatedAt,
    };
  }
  return {
    rawStatus,
    normalizedStatus: "unknown",
    paymentProjection: "attention_required",
    total,
    amountPaid,
    amountDue,
    amountCredited,
    fullyPaidAt,
    providerUpdatedAt,
  };
}

function safeRefreshError(error: unknown) {
  if (error instanceof XeroSalesInvoiceRefreshError) return error.safeMessage;
  if (error instanceof XeroRequestError) {
    if (error.status === 404) return "The linked Xero Sales Invoice could not be found.";
    if (error.status === 429) return "Xero is temporarily rate limiting Sales Invoice refreshes.";
    if (error.status === 401 || error.status === 403) {
      return "Xero authorization must be restored before the Sales Invoice can refresh.";
    }
  }
  return "Unable to refresh the Xero Sales Invoice right now.";
}

async function loadDocument(admin: UntypedAdmin, organizationId: string, documentId: string) {
  const result = await admin
    .from("organization_accounting_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();
  if (result.error) {
    throw new XeroSalesInvoiceRefreshError("document_not_found", "Unable to load the accounting document.");
  }
  if (!result.data) {
    throw new XeroSalesInvoiceRefreshError("document_not_found", "Accounting document not found.");
  }
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
    throw new XeroSalesInvoiceRefreshError(
      "invalid_document",
      "The accounting document does not represent a Payment Claim Sales Invoice.",
    );
  }
  if (!invoiceId) {
    throw new XeroSalesInvoiceRefreshError("missing_invoice", "The Payment Claim has no linked Xero InvoiceID.");
  }
  return invoiceId;
}

async function persistRefreshState(params: {
  admin: UntypedAdmin;
  organizationId: string;
  document: Row;
  claim: Row;
  state: NormalizedXeroSalesInvoicePaymentState;
  attentionMessage: string | null;
  projectedStatus: ProjectClaimPaymentStatus | null;
  projectedPaidAmount: number | null;
}) {
  const syncedAt = new Date().toISOString();
  const result = await params.admin.rpc("apply_xero_sales_invoice_payment_to_claim", {
    p_organization_id: params.organizationId,
    p_document_id: params.document.id,
    p_project_claim_id: params.claim.id,
    p_accounting_connection_id: params.document.accounting_connection_id,
    p_tenant_id: params.document.tenant_id,
    p_external_document_id: params.document.external_document_id,
    p_expected_claim_updated_at: params.claim.updated_at,
    p_raw_external_status: params.state.rawStatus,
    p_normalized_external_status: params.state.normalizedStatus,
    p_amount_paid: params.state.amountPaid,
    p_amount_due: params.state.amountDue,
    p_amount_credited: params.state.amountCredited,
    p_fully_paid_at: params.state.fullyPaidAt,
    p_provider_updated_at: params.state.providerUpdatedAt ?? params.document.provider_updated_at ?? null,
    p_status_synced_at: syncedAt,
    p_attention_message: params.attentionMessage,
    p_projected_claim_status: params.projectedStatus,
    p_projected_paid_amount: params.projectedPaidAmount,
  });
  const applied = Array.isArray(result.data) ? result.data[0] : result.data;
  if (result.error || !applied?.document_id || applied.claim_id !== params.claim.id) {
    throw new XeroSalesInvoiceRefreshError(
      "invalid_document",
      result.error?.message ?? "The accounting document identity changed during status refresh.",
      { safeMessage: "The Payment Claim changed while Xero payment status was refreshing. Refresh again." },
    );
  }
  return {
    syncedAt,
    claimStatus: text(applied.claim_status),
    claimPaidAmount: applied.claim_paid_amount == null ? null : Number(applied.claim_paid_amount),
    claimProjectionApplied: applied.claim_projection_applied === true,
  };
}

export async function recordXeroSalesInvoiceRefreshError(params: {
  organizationId: string;
  documentId: string;
  error: unknown;
}) {
  const admin = db(await createAdminSupabaseClient());
  const safeMessage = safeRefreshError(params.error);
  const document = await admin
    .from("organization_accounting_documents")
    .select("id, integration_contract, active_accounting_revision_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.documentId)
    .maybeSingle();
  if (
    !document.error
    && document.data?.integration_contract === "payment_claim_revision_v1"
    && document.data.active_accounting_revision_id
  ) {
    await admin.from("organization_accounting_events").insert({
      organization_id: params.organizationId,
      accounting_document_id: params.documentId,
      accounting_revision_id: document.data.active_accounting_revision_id,
      event_type: params.error instanceof XeroSalesInvoiceRefreshError
        && params.error.code === "missing_invoice"
        ? "provider_missing_observed"
        : "revision_refresh_failed",
      event_evidence: {
        code: params.error instanceof XeroSalesInvoiceRefreshError ? params.error.code : "provider_failure",
        message: safeMessage,
      },
    });
    return safeMessage;
  }
  await admin
    .from("organization_accounting_documents")
    .update({ last_status_sync_error: safeMessage })
    .eq("organization_id", params.organizationId)
    .eq("id", params.documentId)
    .eq("local_document_type", "project_claim")
    .select("id")
    .maybeSingle();
  return safeMessage;
}

export async function refreshXeroSalesInvoiceStatus(params: {
  organizationId: string;
  documentId: string;
  workerJobId: string;
}) {
  const admin = db(await createAdminSupabaseClient());
  const document = await loadDocument(admin, params.organizationId, params.documentId);
  const invoiceId = validateDocument(document);
  const revisionBacked = document.integration_contract === "payment_claim_revision_v1";
  const revisionResult = revisionBacked
    ? await admin
        .from("organization_accounting_document_revisions")
        .select("*")
        .eq("organization_id", params.organizationId)
        .eq("id", document.active_accounting_revision_id)
        .maybeSingle()
    : { data: null, error: null };
  if (revisionBacked && (revisionResult.error || !revisionResult.data)) {
    throw new XeroSalesInvoiceRefreshError("invalid_document", "The active immutable accounting revision was not found.");
  }
  const activeRevision = revisionResult.data as Row | null;
  const claimResult = await admin
    .from("project_claims")
    .select("id, organization_id, project_id, claim_number, status, due_date, claim_amount, paid_amount, total_payable, updated_at")
    .eq("organization_id", params.organizationId)
    .eq("id", document.project_claim_id)
    .maybeSingle();
  if (claimResult.error || !claimResult.data) {
    throw new XeroSalesInvoiceRefreshError("invoice_identity_mismatch", "The linked Payment Claim identity is invalid.");
  }

  const tokenState = await getFreshXeroAccessToken(params.organizationId);
  if (
    tokenState.connection.id !== document.accounting_connection_id
    || tokenState.connection.tenant_id !== document.tenant_id
  ) {
    throw new XeroSalesInvoiceRefreshError(
      "connection_mismatch",
      "The current Xero connection or tenant does not match the linked Sales Invoice.",
    );
  }

  let invoices: XeroInvoice[];
  try {
    invoices = await getXeroInvoice(
      tokenState.tokenSet.access_token,
      String(document.tenant_id),
      invoiceId,
    );
  } catch (error) {
    if (error instanceof XeroRequestError && error.status === 404) {
      throw new XeroSalesInvoiceRefreshError(
        "missing_invoice",
        XERO_SALES_INVOICE_MISSING_MESSAGE,
      );
    }
    throw error;
  }
  const invoice = invoices[0];
  if (!invoice) {
    throw new XeroSalesInvoiceRefreshError("missing_invoice", XERO_SALES_INVOICE_MISSING_MESSAGE);
  }
  if (
    invoice.InvoiceID !== invoiceId
    || invoice.Type !== "ACCREC"
    || invoice.InvoiceNumber !== (
      revisionBacked
        ? activeRevision?.external_document_number
        : claimResult.data.claim_number
    )
    || (text(document.external_document_number) && invoice.InvoiceNumber !== document.external_document_number)
  ) {
    throw new XeroSalesInvoiceRefreshError(
      "invoice_identity_mismatch",
      "Xero returned a Sales Invoice that does not match the linked Payment Claim.",
    );
  }

  const state = normalizeXeroSalesInvoicePaymentState(invoice);
  if (revisionBacked && activeRevision) {
    const payload = activeRevision.payload_snapshot as PaymentClaimXeroSalesInvoicePayload;
    const structuralInvoice = {
      ...invoice,
      Status: payload.Status,
      AmountPaid: 0,
      AmountCredited: 0,
      AmountDue: Number(activeRevision.total_minor) / 100,
      Payments: [],
      CreditNotes: [],
    };
    const structural = verifyInitialPushXeroInvoice({
      expected: payload,
      actual: structuralInvoice as Row,
      expectedTotals: {
        subtotalMinor: Number(activeRevision.subtotal_minor),
        taxMinor: Number(activeRevision.tax_minor),
        totalMinor: Number(activeRevision.total_minor),
      },
    });
    const settlementHash = hashAccountingEvidence({
      amountPaid: invoice.AmountPaid ?? 0,
      amountCredited: invoice.AmountCredited ?? 0,
      payments: invoice.Payments ?? [],
      creditNotes: (invoice as Row).CreditNotes ?? [],
    });
    const contentHash = structural.exact
      ? String(activeRevision.provider_content_hash)
      : hashAccountingEvidence({
          invoiceNumber: invoice.InvoiceNumber,
          contact: invoice.Contact,
          date: invoice.Date,
          dueDate: invoice.DueDate,
          lineItems: invoice.LineItems,
          subTotal: invoice.SubTotal,
          totalTax: invoice.TotalTax,
          total: invoice.Total,
        });
    const recorded = await admin.rpc("record_accounting_remote_observation_phase2a", {
      p_input: {
        organizationId: params.organizationId,
        accountingDocumentId: document.id,
        accountingRevisionId: activeRevision.id,
        provider: "xero",
        tenantId: activeRevision.tenant_id,
        externalDocumentId: activeRevision.external_document_id,
        providerUpdatedAt: state.providerUpdatedAt,
        rawStatus: state.rawStatus,
        normalizedStatus: state.normalizedStatus,
        normalizedInvoiceStatus: state.normalizedStatus === "awaiting_payment"
          ? "authorised" : state.normalizedStatus,
        normalizedPaymentStatus: state.paymentProjection,
        contentHash,
        settlementHash,
        amountPaidMinor: Math.round(state.amountPaid * 100),
        amountDueMinor: Math.round(state.amountDue * 100),
        amountCreditedMinor: Math.round(state.amountCredited * 100),
        rawObservation: invoice,
        correlationId: params.workerJobId,
      },
    });
    if (recorded.error) {
      throw new XeroSalesInvoiceRefreshError("invalid_document", "The immutable Xero observation could not be recorded.");
    }
    if (state.normalizedStatus === "voided" || state.normalizedStatus === "deleted") {
      await admin.from("organization_accounting_events").insert({
        organization_id: params.organizationId,
        accounting_document_id: document.id,
        accounting_revision_id: activeRevision.id,
        event_type: "void_confirmed",
        correlation_id: params.workerJobId,
        event_evidence: {
          externalDocumentId: activeRevision.external_document_id,
          externalDocumentNumber: activeRevision.external_document_number,
          amountPaidMinor: Math.round(state.amountPaid * 100),
          amountCreditedMinor: Math.round(state.amountCredited * 100),
        },
      });
    }
    return {
      documentId: document.id,
      externalDocumentId: invoiceId,
      rawStatus: state.rawStatus,
      normalizedStatus: state.normalizedStatus,
      paymentProjection: state.paymentProjection,
      amountPaid: state.amountPaid,
      amountDue: state.amountDue,
      amountCredited: state.amountCredited,
      fullyPaidAt: state.fullyPaidAt,
      providerUpdatedAt: state.providerUpdatedAt,
      syncedAt: new Date().toISOString(),
      attentionRequired: state.paymentProjection === "attention_required" || !structural.exact,
      totalDiverged: !structural.exact,
      claimStatus: text(claimResult.data.status),
      claimPaidAmount: Number(claimResult.data.paid_amount),
      claimProjectionApplied: false,
    };
  }
  const totalDiverged = document.amount_exported != null
    && Math.round(Number(document.amount_exported) * 100) !== Math.round(state.total * 100);
  const claimTotalDiverged = Math.round(Number(claimResult.data.total_payable) * 100) !== Math.round(state.total * 100);
  const attentionMessage = state.paymentProjection === "attention_required"
    ? state.rawStatus === "VOIDED" || state.rawStatus === "DELETED"
      ? "The linked Xero Sales Invoice is voided or deleted."
      : "Xero returned an invalid Sales Invoice payment state."
    : totalDiverged || claimTotalDiverged
      ? "The Xero Sales Invoice total no longer matches the last exported TradesStack total."
      : null;
  const claimProjection = deriveProjectClaimPaymentProjection({
    currentStatus: String(claimResult.data.status) as ProjectClaimPaymentStatus,
    dueDate: text(claimResult.data.due_date),
    claimAmount: Number(claimResult.data.claim_amount),
    totalPayable: Number(claimResult.data.total_payable),
    invoiceTotal: state.total,
    amountPaid: state.amountPaid,
    amountDue: state.amountDue,
    hasValidPaidEvidence: state.amountPaid > 0 || state.amountCredited > 0 || state.fullyPaidAt !== null,
    attentionRequired: Boolean(attentionMessage),
    asOfDate: new Date().toISOString().slice(0, 10),
  });
  const persisted = await persistRefreshState({
    admin,
    organizationId: params.organizationId,
    document,
    claim: claimResult.data,
    state,
    attentionMessage,
    projectedStatus: claimProjection.shouldApply ? claimProjection.status : null,
    projectedPaidAmount: claimProjection.shouldApply ? claimProjection.paidAmount : null,
  });

  return {
    documentId: String(document.id),
    externalDocumentId: invoiceId,
    rawStatus: state.rawStatus,
    normalizedStatus: state.normalizedStatus,
    paymentProjection: attentionMessage ? "attention_required" as const : state.paymentProjection,
    amountPaid: state.amountPaid,
    amountDue: state.amountDue,
    amountCredited: state.amountCredited,
    fullyPaidAt: state.fullyPaidAt,
    providerUpdatedAt: state.providerUpdatedAt,
    syncedAt: persisted.syncedAt,
    attentionRequired: Boolean(attentionMessage),
    totalDiverged: totalDiverged || claimTotalDiverged,
    claimStatus: persisted.claimStatus,
    claimPaidAmount: persisted.claimPaidAmount,
    claimProjectionApplied: persisted.claimProjectionApplied,
  };
}

export async function enqueueXeroSalesInvoiceRefresh(params: {
  organizationId: string;
  documentId: string;
  createdByUserId: string | null;
  triggerSource: "manual_refresh" | "scheduled";
  preparedIdentity?: PaymentClaimAccountingIdentitySnapshot;
  timing?: XeroActionTiming;
}) {
  const admin = db(await createAdminSupabaseClient());
  const loadedDocument = params.preparedIdentity?.document
    ?? await loadDocument(admin, params.organizationId, params.documentId);
  if (!loadedDocument) {
    throw new XeroSalesInvoiceRefreshError(
      "document_not_found",
      "The Payment Claim accounting identity was not found.",
    );
  }
  const identity = params.preparedIdentity
    ?? await resolvePaymentClaimAccountingIdentity({
      organizationId: params.organizationId,
      claimId: String(loadedDocument.project_claim_id),
      admin,
    });
  const existingScheduledRefresh = scheduledRefreshAlreadyQueued({
    identity,
    triggerSource: params.triggerSource,
    documentId: params.documentId,
  });
  if (existingScheduledRefresh) return existingScheduledRefresh;
  throwForIdentityResolution(identity);
  const document = identity.document;
  if (
    document.id !== params.documentId
    || document.organization_id !== params.organizationId
  ) {
    throw new XeroSalesInvoiceRefreshError(
      "invalid_document",
      "The prepared Payment Claim accounting identity changed.",
    );
  }
  validateDocument(document);
  const connection = identity.currentConnection;
  if (
    !connection
    || connection.status !== "connected"
    || connection.id !== document.accounting_connection_id
    || connection.tenant_id !== document.tenant_id
  ) {
    throw new XeroSalesInvoiceRefreshError(
      "connection_mismatch",
      "The current Xero connection or tenant does not match the linked Sales Invoice.",
    );
  }

  const insertJob = () => admin
      .from("organization_accounting_sync_jobs")
      .insert({
      organization_id: params.organizationId,
      provider: "xero",
      connection_id: document.accounting_connection_id,
      job_kind: "xero.sales_invoice.refresh",
      trigger_source: params.triggerSource,
      queue_state: "pending",
      request_payload: { accountingDocumentId: params.documentId },
      result_summary: {},
      idempotency_key: null,
      max_attempts: 3,
      created_by_user_id: params.createdByUserId,
    })
      .select("id, queue_state")
      .single();
  const inserted = params.timing
    ? await params.timing.span("refresh_job_insert", insertJob, {
        databaseOperation: "organization_accounting_sync_jobs.insert",
      })
    : await insertJob();
  if (!inserted.error && inserted.data) {
    return {
      jobId: String(inserted.data.id),
      documentId: params.documentId,
      currentStatus: String(inserted.data.queue_state),
      created: true,
    };
  }

  const raced = await resolvePaymentClaimAccountingIdentity({
    organizationId: params.organizationId,
    claimId: identity.claimId,
    admin,
    currentConnection: connection,
  });
  const racedScheduledRefresh = scheduledRefreshAlreadyQueued({
    identity: raced,
    triggerSource: params.triggerSource,
    documentId: params.documentId,
  });
  if (racedScheduledRefresh) return racedScheduledRefresh;
  throwForIdentityResolution(raced);
  throw new XeroSalesInvoiceRefreshError(
    "enqueue_failed",
    "Unable to queue the Sales Invoice refresh.",
  );
}

export async function enqueuePaymentClaimXeroRefreshForCurrentUser(
  params: { claimId: string },
  timing?: XeroActionTiming,
) {
  const member = timing
    ? await timing.span("refresh_authentication", () =>
        getCurrentOrganizationMember())
    : await getCurrentOrganizationMember();
  if (!member) {
    throw new XeroSalesInvoiceRefreshError(
      "unauthorized",
      "You do not have permission to refresh Payment Claim Sales Invoices.",
    );
  }
  const authorizationGroup = timing?.startParallelGroup(
    "refresh_authorisation",
  );
  const [permissions, featureEnabled] = await Promise.all([
    authorizationGroup
      ? authorizationGroup.measure("permission_batch", () =>
          getOrganizationPermissionsBatch({
            organizationId: member.organization_id,
            permissions: [
              "accounting.sales_invoices.view",
              "accounting.sales_invoices.manage",
              PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
            ],
          }))
      : getOrganizationPermissionsBatch({
          organizationId: member.organization_id,
          permissions: [
            "accounting.sales_invoices.view",
            "accounting.sales_invoices.manage",
            PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
          ],
        }),
    authorizationGroup
      ? authorizationGroup.measure("feature_gate", () =>
          isPaymentClaimInitialPushEnabled(member.organization_id))
      : isPaymentClaimInitialPushEnabled(member.organization_id),
  ]);
  authorizationGroup?.complete();
  if (permissions["accounting.sales_invoices.manage"] !== true) {
    throw new XeroSalesInvoiceRefreshError(
      "unauthorized",
      "You do not have permission to refresh Payment Claim Sales Invoices.",
    );
  }
  const admin = db(await createAdminSupabaseClient());
  const identityLoad = () => resolvePaymentClaimAccountingIdentity({
    organizationId: member.organization_id,
    claimId: params.claimId,
    admin,
  });
  const identity = timing
    ? await timing.span("refresh_identity", identityLoad)
    : await identityLoad();
  throwForIdentityResolution(identity);
  const result = await enqueueXeroSalesInvoiceRefresh({
    organizationId: member.organization_id,
    documentId: String(identity.document.id),
    createdByUserId: member.user_id,
    triggerSource: "manual_refresh",
    preparedIdentity: identity,
    timing,
  });
  return {
    ...result,
    organizationId: member.organization_id,
    requestContext: createAccountingSyncRequestContextFromIdentity({
      identity: {
        userId: member.user_id,
        organizationId: member.organization_id,
        membershipId: member.id,
      },
      claimId: params.claimId,
      permissions,
      featureFlags: { initialPaymentClaimPushEnabled: featureEnabled },
      accountingDocumentId: String(identity.document.id),
      revisionId:
        typeof identity.document.active_accounting_revision_id === "string"
          ? identity.document.active_accounting_revision_id
          : null,
    }),
  };
}

export async function enqueueEligibleXeroSalesInvoiceRefreshes(params?: { limit?: number }) {
  const admin = db(await createAdminSupabaseClient());
  const limit = Math.max(1, Math.min(params?.limit ?? 25, 100));
  const result = await admin
    .from("organization_accounting_documents")
    .select("id, organization_id")
    .eq("provider", "xero")
    .eq("local_document_type", "project_claim")
    .not("external_document_id", "is", null)
    .or("normalized_external_status.is.null,normalized_external_status.in.(awaiting_payment,partially_paid,paid,unknown)")
    .order("last_status_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (result.error) {
    throw new XeroSalesInvoiceRefreshError("enqueue_failed", "Unable to load Sales Invoices eligible for refresh.");
  }
  const jobs = [];
  for (const row of (result.data ?? []) as Array<{ id: string; organization_id: string }>) {
    try {
      jobs.push(await enqueueXeroSalesInvoiceRefresh({
        organizationId: row.organization_id,
        documentId: row.id,
        createdByUserId: null,
        triggerSource: "scheduled",
      }));
    } catch {
      // A disconnected tenant or active outbound sync does not block other organizations.
    }
  }
  return jobs;
}
