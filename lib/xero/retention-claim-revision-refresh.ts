import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import { getXeroInvoice, XeroRequestError } from "@/lib/xero/client";
import {
  normalizeXeroSalesInvoicePaymentState,
} from "@/lib/xero/payment-claim-sales-invoice-refresh";
import {
  verifyRetentionClaimXeroInvoice,
} from "@/lib/xero/retention-claim-push-contract";
import { getOrganizationXeroConnection, getFreshXeroAccessToken } from "@/lib/xero/service";
import type { RetentionClaimXeroPayload } from "@/lib/xero/retention-claim-sales-invoice-payload";
import type { XeroInvoice } from "@/lib/xero/types";
import type { XeroActionTiming } from "@/lib/xero/action-performance";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 2C objects intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

export class RetentionClaimRevisionRefreshError extends Error {
  constructor(
    readonly code:
      | "document_not_found"
      | "invalid_document"
      | "missing_invoice"
      | "connection_mismatch"
      | "invoice_identity_mismatch"
      | "provider_failure"
      | "refresh_in_progress",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "RetentionClaimRevisionRefreshError";
  }
}

function admin() {
  return createAdminSupabaseClient() as unknown as Admin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function load(params: {
  organizationId: string;
  accountingDocumentId: string;
}) {
  const db = admin();
  const documentResult = await db.from("organization_accounting_documents")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .maybeSingle();
  if (documentResult.error || !documentResult.data) {
    throw new RetentionClaimRevisionRefreshError(
      "document_not_found",
      "The Retention Claim accounting document was not found.",
    );
  }
  const document = documentResult.data as Row;
  if (
    document.local_document_type !== "retention_claim"
    || document.integration_contract !== "retention_claim_revision_v1"
    || !document.active_accounting_revision_id
  ) {
    throw new RetentionClaimRevisionRefreshError(
      "invalid_document",
      "The Retention Claim does not have an active immutable Xero revision.",
    );
  }
  const revisionResult = await db.from(
    "organization_accounting_document_revisions",
  )
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", document.active_accounting_revision_id)
    .eq("accounting_document_id", document.id)
    .maybeSingle();
  if (revisionResult.error || !revisionResult.data) {
    throw new RetentionClaimRevisionRefreshError(
      "invalid_document",
      "The active Retention Claim accounting revision could not be loaded.",
    );
  }
  return { document, revision: revisionResult.data as Row };
}

export async function refreshRetentionClaimRevisionFromXero(params: {
  organizationId: string;
  accountingDocumentId: string;
  workerJobId: string;
}) {
  const db = admin();
  const { document, revision } = await load(params);
  const invoiceId = text(revision.external_document_id);
  const invoiceNumber = text(revision.external_document_number);
  if (
    !invoiceId
    || !invoiceNumber
    || text(document.external_document_id) !== invoiceId
    || text(document.external_document_number) !== invoiceNumber
  ) {
    throw new RetentionClaimRevisionRefreshError(
      "invoice_identity_mismatch",
      "The active Retention Claim Xero identity is incomplete.",
    );
  }
  const token = await getFreshXeroAccessToken(params.organizationId);
  if (
    token.connection.id !== revision.connection_id
    || token.connection.tenant_id !== revision.tenant_id
  ) {
    throw new RetentionClaimRevisionRefreshError(
      "connection_mismatch",
      "The current Xero connection or tenant does not match the active Retention Claim revision.",
    );
  }

  let invoice: XeroInvoice | undefined;
  try {
    invoice = (await getXeroInvoice(
      token.tokenSet.access_token,
      String(revision.tenant_id),
      invoiceId,
    ))[0];
  } catch (error) {
    if (error instanceof XeroRequestError && error.status === 404) {
      throw new RetentionClaimRevisionRefreshError(
        "missing_invoice",
        "The active Retention Claim invoice was not found in Xero. Its loss has not been classified as permanent.",
      );
    }
    throw error;
  }
  if (
    !invoice
    || invoice.InvoiceID !== invoiceId
    || invoice.InvoiceNumber !== invoiceNumber
    || invoice.Type !== "ACCREC"
  ) {
    throw new RetentionClaimRevisionRefreshError(
      "invoice_identity_mismatch",
      "Xero returned an invoice that does not match the active Retention Claim revision.",
    );
  }

  const payment = normalizeXeroSalesInvoicePaymentState(invoice);
  const payload = revision.payload_snapshot as RetentionClaimXeroPayload;
  // Settlement fields legitimately change. Verify immutable content with the
  // original requested status/zero settlement substituted only for comparison.
  const structural = verifyRetentionClaimXeroInvoice({
    expected: payload,
    actual: {
      ...(invoice as Row),
      Status: payload.Status,
      AmountPaid: 0,
      AmountCredited: 0,
      Payments: [],
      CreditNotes: [],
    },
    subtotalMinor: Number(revision.subtotal_minor),
    taxMinor: Number(revision.tax_minor),
    totalMinor: Number(revision.total_minor),
  });
  const settlementHash = hashAccountingEvidence({
    amountPaid: invoice.AmountPaid ?? 0,
    amountCredited: invoice.AmountCredited ?? 0,
    payments: invoice.Payments ?? [],
    creditNotes: (invoice as Row).CreditNotes ?? [],
  });
  const contentHash = structural.exact
    ? String(revision.provider_content_hash)
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
  const recorded = await db.rpc("record_accounting_remote_observation_phase2a", {
    p_input: {
      organizationId: params.organizationId,
      accountingDocumentId: document.id,
      accountingRevisionId: revision.id,
      provider: "xero",
      tenantId: revision.tenant_id,
      externalDocumentId: invoiceId,
      providerUpdatedAt: payment.providerUpdatedAt,
      rawStatus: payment.rawStatus,
      normalizedStatus: payment.normalizedStatus,
      normalizedInvoiceStatus:
        payment.normalizedStatus === "awaiting_payment"
          ? "authorised"
          : payment.normalizedStatus,
      normalizedPaymentStatus: payment.paymentProjection,
      contentHash,
      settlementHash,
      amountPaidMinor: Math.round(payment.amountPaid * 100),
      amountDueMinor: Math.round(payment.amountDue * 100),
      amountCreditedMinor: Math.round(payment.amountCredited * 100),
      rawObservation: invoice,
      correlationId: params.workerJobId,
    },
  });
  if (recorded.error) {
    throw new RetentionClaimRevisionRefreshError(
      "invalid_document",
      "The immutable Retention Claim Xero observation could not be recorded.",
    );
  }
  if (["voided", "deleted"].includes(payment.normalizedStatus)) {
    await db.from("organization_accounting_events").insert({
      organization_id: params.organizationId,
      accounting_document_id: document.id,
      accounting_revision_id: revision.id,
      event_type: "void_confirmed",
      correlation_id: params.workerJobId,
      event_evidence: {
        externalDocumentId: invoiceId,
        externalDocumentNumber: invoiceNumber,
        amountPaidMinor: Math.round(payment.amountPaid * 100),
        amountCreditedMinor: Math.round(payment.amountCredited * 100),
      },
    });
  }
  return {
    accountingDocumentId: document.id,
    accountingRevisionId: revision.id,
    externalDocumentId: invoiceId,
    externalDocumentNumber: invoiceNumber,
    normalizedStatus: payment.normalizedStatus,
    contentMatches: structural.exact,
    amountPaid: payment.amountPaid,
    amountDue: payment.amountDue,
    amountCredited: payment.amountCredited,
    operationalRetentionClaimMutated: false,
  };
}

export async function recordRetentionClaimRevisionRefreshError(params: {
  organizationId: string;
  accountingDocumentId: string;
  error: unknown;
}) {
  const db = admin();
  const loaded = await load(params).catch(() => null);
  if (!loaded) return "Unable to refresh the immutable Retention Claim invoice.";
  const message = params.error instanceof RetentionClaimRevisionRefreshError
    ? params.error.message
    : params.error instanceof XeroRequestError
      ? params.error.status === 429
        ? "Xero is temporarily rate limiting Retention Claim refreshes."
        : "Unable to refresh the Retention Claim invoice from Xero."
      : "Unable to refresh the Retention Claim invoice from Xero.";
  await db.from("organization_accounting_events").insert({
    organization_id: params.organizationId,
    accounting_document_id: loaded.document.id,
    accounting_revision_id: loaded.revision.id,
    event_type: params.error instanceof RetentionClaimRevisionRefreshError
      && params.error.code === "missing_invoice"
      ? "provider_missing_observed"
      : "revision_refresh_failed",
    event_evidence: {
      code: params.error instanceof RetentionClaimRevisionRefreshError
        ? params.error.code
        : "provider_failure",
      message,
      permanent: params.error instanceof RetentionClaimRevisionRefreshError
        && params.error.code === "missing_invoice"
        ? false
        : undefined,
    },
  });
  return message;
}

export async function enqueueRetentionClaimRevisionRefresh(params: {
  organizationId: string;
  accountingDocumentId: string;
  createdByUserId: string | null;
  triggerSource: "manual_refresh" | "scheduled";
}, timing?: XeroActionTiming) {
  const db = admin();
  const identityLoad = () => Promise.all([
    load(params),
    getOrganizationXeroConnection(params.organizationId),
  ]);
  const [{ document, revision }, connection] = timing
    ? await timing.span("refresh_revision_identity", identityLoad)
    : await identityLoad();
  if (
    !connection
    || connection.status !== "connected"
    || connection.id !== revision.connection_id
    || connection.tenant_id !== revision.tenant_id
  ) {
    throw new RetentionClaimRevisionRefreshError(
      "connection_mismatch",
      "The Xero connection or tenant no longer matches the active Retention Claim revision.",
    );
  }
  const activeJobsLoad = () => db.from("organization_accounting_sync_jobs")
      .select("id,job_kind,queue_state,request_payload")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .eq(
        "request_payload->>accountingDocumentId",
        params.accountingDocumentId,
      )
      .in("job_kind", [
        "xero.retention_claim.initial_push",
        "xero.retention_claim.update",
        "xero.retention_claim.replacement",
        "xero.retention_claim.refresh",
      ])
      .in("queue_state", ["pending", "claimed", "retry_scheduled"])
      .order("created_at", { ascending: false })
      .limit(25);
  const jobs = timing
    ? await timing.span("refresh_active_jobs", activeJobsLoad, {
        databaseOperation:
          "organization_accounting_sync_jobs.active_by_document",
      })
    : await activeJobsLoad();
  if (jobs.error) throw new Error(jobs.error.message);
  const active = (jobs.data ?? []) as Row[];
  const existingRefresh = active.find(
    (job) => job.job_kind === "xero.retention_claim.refresh",
  );
  if (existingRefresh) {
    return {
      jobId: String(existingRefresh.id),
      accountingDocumentId: params.accountingDocumentId,
      reused: true,
    };
  }
  if (active.length > 0) {
    throw new RetentionClaimRevisionRefreshError(
      "refresh_in_progress",
      "A Retention Claim Xero accounting operation is already in progress.",
    );
  }
  const idempotencyKey = hashAccountingEvidence({
    kind: "xero.retention_claim.refresh",
    accountingDocumentId: document.id,
    accountingRevisionId: revision.id,
    requestedAtBucket: new Date().toISOString().slice(0, 16),
  });
  const insertJob = () => db.from("organization_accounting_sync_jobs")
      .insert({
      organization_id: params.organizationId,
      provider: "xero",
      connection_id: connection.id,
      job_kind: "xero.retention_claim.refresh",
      trigger_source: params.triggerSource,
      request_payload: {
        accountingDocumentId: document.id,
        accountingRevisionId: revision.id,
        integrationContract: "retention_claim_revision_v1",
      },
      result_summary: {},
      idempotency_key: idempotencyKey,
      max_attempts: 5,
      created_by_user_id: params.createdByUserId,
    })
      .select("id")
      .single();
  const inserted = timing
    ? await timing.span("refresh_job_insert", insertJob, {
        databaseOperation: "organization_accounting_sync_jobs.insert",
      })
    : await insertJob();
  if (inserted.error) throw new Error(inserted.error.message);
  return {
    jobId: String(inserted.data.id),
    accountingDocumentId: document.id,
    reused: false,
  };
}
