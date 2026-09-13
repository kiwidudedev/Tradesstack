import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrganizationXeroConnection } from "@/lib/xero/service";

type Row = Record<string, unknown>;
type UntypedAdmin = {
  // Payment Claim revision fields intentionally precede some generated clients.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export const PAYMENT_CLAIM_FINANCIAL_JOB_KINDS = [
  "xero.sales_invoice.sync",
  "xero.payment_claim.initial_push",
  "xero.payment_claim.replacement",
  "xero.payment_claim.accounting_update",
] as const;

export const PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS = [
  "xero.sales_invoice.attachment",
  "xero.payment_claim.initial_push.attachment",
  "xero.payment_claim.replacement.attachment",
] as const;

const ACTIVE_QUEUE_STATES = ["pending", "claimed", "retry_scheduled"] as const;

export type PaymentClaimAccountingIdentityIssue =
  | "missing_accounting_identity"
  | "missing_invoice_id"
  | "missing_active_revision"
  | "invoice_id_mismatch"
  | "invoice_number_mismatch"
  | "revision_mismatch";

export type PaymentClaimRefreshBlockingReason =
  | PaymentClaimAccountingIdentityIssue
  | "connection_mismatch"
  | "tenant_mismatch"
  | "initial_push_in_progress"
  | "replacement_in_progress"
  | "accounting_update_in_progress"
  | "sync_in_progress"
  | "refresh_in_progress";

export type PaymentClaimAccountingIdentitySnapshot = {
  claimId: string;
  document: Row | null;
  activeRevision: Row | null;
  currentConnection: Row | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  tenantId: string | null;
  connectionId: string | null;
  provider: "xero" | null;
  identitySource: "active_revision" | "legacy_document" | null;
  identityIssue: PaymentClaimAccountingIdentityIssue | null;
  navigationUrl: string | null;
  activeFinancialJob: Row | null;
  activeRefreshJob: Row | null;
  activeAttachmentJob: Row | null;
  latestJob: Row | null;
  workflowState: string | null;
  workflowGeneration: {
    documentUpdatedAt: string | null;
    activeRevisionId: string | null;
    activeJobId: string | null;
  };
  refresh: {
    eligible: boolean;
    blockingReason: PaymentClaimRefreshBlockingReason | null;
    message: string | null;
  };
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isActiveJob(job: Row) {
  return ACTIVE_QUEUE_STATES.includes(
    String(job.queue_state) as (typeof ACTIVE_QUEUE_STATES)[number],
  );
}

function refreshBlockForJob(job: Row | null): {
  reason: PaymentClaimRefreshBlockingReason;
  message: string;
} | null {
  switch (text(job?.job_kind)) {
    case "xero.payment_claim.initial_push":
      return {
        reason: "initial_push_in_progress",
        message: "The initial Xero invoice push is still in progress. Refresh it after synchronization completes.",
      };
    case "xero.payment_claim.replacement":
      return {
        reason: "replacement_in_progress",
        message: "The replacement Xero invoice is still in progress. Refresh it after synchronization completes.",
      };
    case "xero.payment_claim.accounting_update":
      return {
        reason: "accounting_update_in_progress",
        message: "The Xero accounting update is still in progress. Refresh it after synchronization completes.",
      };
    case "xero.sales_invoice.sync":
      return {
        reason: "sync_in_progress",
        message: "The Sales Invoice is already being synchronized. Refresh it after synchronization completes.",
      };
    default:
      return null;
  }
}

export function paymentClaimXeroInvoiceUrl(invoiceId: string | null) {
  return invoiceId
    ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`
    : null;
}

export function derivePaymentClaimAccountingIdentity(params: {
  organizationId: string;
  claimId: string;
  document: Row | null;
  activeRevision: Row | null;
  currentConnection: Row | null;
  jobs: Row[];
}): PaymentClaimAccountingIdentitySnapshot {
  const { document } = params;
  const revisionBacked =
    document?.integration_contract === "payment_claim_revision_v1";
  const activeRevision = params.activeRevision;
  const activeFinancialJob = params.jobs.find((job) =>
    isActiveJob(job)
    && PAYMENT_CLAIM_FINANCIAL_JOB_KINDS.includes(
      String(job.job_kind) as (typeof PAYMENT_CLAIM_FINANCIAL_JOB_KINDS)[number],
    )
  ) ?? null;
  const activeRefreshJob = params.jobs.find((job) =>
    isActiveJob(job) && job.job_kind === "xero.sales_invoice.refresh"
  ) ?? null;
  const activeAttachmentJob = params.jobs.find((job) =>
    isActiveJob(job)
    && PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS.includes(
      String(job.job_kind) as (typeof PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS)[number],
    )
  ) ?? null;
  const latestJob = params.jobs.find((job) =>
    !PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS.includes(
      String(job.job_kind) as (typeof PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS)[number],
    )
  ) ?? null;

  let identityIssue: PaymentClaimAccountingIdentityIssue | null = null;
  let identitySource: PaymentClaimAccountingIdentitySnapshot["identitySource"] =
    null;
  let invoiceId: string | null = null;
  let invoiceNumber: string | null = null;
  let tenantId: string | null = null;
  let connectionId: string | null = null;

  if (!document) {
    identityIssue = "missing_accounting_identity";
  } else {
    tenantId = text(document.tenant_id);
    connectionId = text(document.accounting_connection_id);
    if (revisionBacked) {
      if (!text(document.active_accounting_revision_id) || !activeRevision) {
        identityIssue = "missing_active_revision";
      } else {
        const revisionMatches = (
          text(activeRevision.id) === text(document.active_accounting_revision_id)
          && text(activeRevision.accounting_document_id) === text(document.id)
          && text(activeRevision.organization_id) === params.organizationId
          && text(activeRevision.source_document_id) === params.claimId
          && text(activeRevision.provider) === "xero"
          && text(activeRevision.tenant_id) === tenantId
          && text(activeRevision.connection_id) === connectionId
          && activeRevision.lifecycle_state === "succeeded"
        );
        if (!revisionMatches) {
          identityIssue = "revision_mismatch";
        } else if (
          text(activeRevision.external_document_id)
          !== text(document.external_document_id)
        ) {
          identityIssue = "invoice_id_mismatch";
        } else if (
          text(activeRevision.external_document_number)
          !== text(document.external_document_number)
        ) {
          identityIssue = "invoice_number_mismatch";
        } else {
          identitySource = "active_revision";
          invoiceId = text(activeRevision.external_document_id);
          invoiceNumber = text(activeRevision.external_document_number);
        }
      }
    } else {
      // Existing legacy Payment Claim links remain readable until separately
      // adopted into the immutable revision contract.
      identitySource = "legacy_document";
      invoiceId = text(document.external_document_id);
      invoiceNumber = text(document.external_document_number);
    }
    if (!identityIssue && !invoiceId) identityIssue = "missing_invoice_id";
  }

  const financialBlock = refreshBlockForJob(activeFinancialJob);
  let blockingReason: PaymentClaimRefreshBlockingReason | null = null;
  let blockingMessage: string | null = null;
  if (financialBlock) {
    blockingReason = financialBlock.reason;
    blockingMessage = financialBlock.message;
  } else if (activeRefreshJob) {
    blockingReason = "refresh_in_progress";
    blockingMessage = "The Xero Sales Invoice refresh is already in progress.";
  } else if (identityIssue) {
    blockingReason = identityIssue;
    blockingMessage = identityIssue === "missing_invoice_id"
      ? "The Payment Claim has no linked Xero InvoiceID."
      : identityIssue === "missing_active_revision"
        ? "The active immutable accounting revision was not found."
        : identityIssue === "invoice_id_mismatch"
          ? "The Xero InvoiceID does not match the active accounting revision."
          : identityIssue === "invoice_number_mismatch"
            ? "The Xero Invoice Number does not match the active accounting revision."
            : identityIssue === "revision_mismatch"
              ? "The active Xero invoice identity does not match its accounting revision."
              : "The Payment Claim accounting identity was not found.";
  } else if (
    !params.currentConnection
    || params.currentConnection.status !== "connected"
    || text(params.currentConnection.id) !== connectionId
  ) {
    blockingReason = "connection_mismatch";
    blockingMessage =
      "The current Xero connection does not match the linked Sales Invoice.";
  } else if (text(params.currentConnection.tenant_id) !== tenantId) {
    blockingReason = "tenant_mismatch";
    blockingMessage =
      "The current Xero tenant does not match the linked Sales Invoice.";
  }

  return {
    claimId: params.claimId,
    document,
    activeRevision,
    currentConnection: params.currentConnection,
    invoiceId,
    invoiceNumber,
    tenantId,
    connectionId,
    provider: document?.provider === "xero" ? "xero" : null,
    identitySource,
    identityIssue,
    navigationUrl: paymentClaimXeroInvoiceUrl(invoiceId),
    activeFinancialJob,
    activeRefreshJob,
    activeAttachmentJob,
    latestJob,
    workflowState: text(
      activeFinancialJob?.queue_state ?? activeRefreshJob?.queue_state,
    ),
    workflowGeneration: {
      documentUpdatedAt: text(document?.updated_at),
      activeRevisionId: text(document?.active_accounting_revision_id),
      activeJobId: text(activeFinancialJob?.id ?? activeRefreshJob?.id),
    },
    refresh: {
      eligible: blockingReason === null,
      blockingReason,
      message: blockingMessage,
    },
  };
}

export async function resolvePaymentClaimAccountingIdentity(params: {
  organizationId: string;
  claimId: string;
  admin?: UntypedAdmin;
  currentConnection?: Row | null;
}): Promise<PaymentClaimAccountingIdentitySnapshot> {
  const admin = params.admin
    ?? createAdminSupabaseClient() as unknown as UntypedAdmin;
  const [documentsResult, currentConnection] = await Promise.all([
    admin.from("organization_accounting_documents")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .eq("local_document_type", "project_claim")
      .eq("project_claim_id", params.claimId)
      .order("updated_at", { ascending: false }),
    params.currentConnection === undefined
      ? getOrganizationXeroConnection(params.organizationId)
      : Promise.resolve(params.currentConnection),
  ]);
  if (documentsResult.error) throw new Error(documentsResult.error.message);
  const documents = (documentsResult.data ?? []) as Row[];
  const connectionId = text(currentConnection?.id);
  const tenantId = text(currentConnection?.tenant_id);
  const document = documents.find((candidate) =>
    text(candidate.accounting_connection_id) === connectionId
    && text(candidate.tenant_id) === tenantId
  ) ?? documents[0] ?? null;

  if (!document) {
    return derivePaymentClaimAccountingIdentity({
      organizationId: params.organizationId,
      claimId: params.claimId,
      document: null,
      activeRevision: null,
      currentConnection: currentConnection as Row | null,
      jobs: [],
    });
  }

  const activeRevisionId = text(document.active_accounting_revision_id);
  const [revisionResult, jobsResult] = await Promise.all([
    activeRevisionId
      ? admin.from("organization_accounting_document_revisions")
          .select("*")
          .eq("organization_id", params.organizationId)
          .eq("id", activeRevisionId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("organization_accounting_sync_jobs")
      .select("id, job_kind, queue_state, request_payload, created_at")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .in("job_kind", [
        ...PAYMENT_CLAIM_FINANCIAL_JOB_KINDS,
        "xero.sales_invoice.refresh",
        ...PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS,
      ])
      .eq("request_payload->>accountingDocumentId", String(document.id))
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (revisionResult.error) throw new Error(revisionResult.error.message);
  if (jobsResult.error) throw new Error(jobsResult.error.message);

  return derivePaymentClaimAccountingIdentity({
    organizationId: params.organizationId,
    claimId: params.claimId,
    document,
    activeRevision: revisionResult.data as Row | null,
    currentConnection: currentConnection as Row | null,
    jobs: (jobsResult.data ?? []) as Row[],
  });
}
