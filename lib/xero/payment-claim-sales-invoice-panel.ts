import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getOrganizationPermissionsBatch,
  hasOrganizationPermission,
} from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { buildPaymentClaimXeroCurrentStateHashFromPayload } from "@/lib/xero/payment-claim-sales-invoice-hash";
import { buildPaymentClaimXeroPayloadFromResolvedSnapshot } from "@/lib/xero/payment-claim-sales-invoice-payload";
import {
  evaluatePaymentClaimXeroReadinessSnapshot,
  resolvePaymentClaimXeroDependencies,
  resolvePaymentClaimXeroReadinessContext,
  type PaymentClaimXeroReadinessBlocker,
  type PaymentClaimXeroReadinessResult,
  type PaymentClaimXeroReadinessSnapshot,
} from "@/lib/xero/payment-claim-readiness";
import {
  PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
} from "@/lib/xero/payment-claim-initial-push-contract";
import { XERO_SALES_INVOICE_MISSING_MESSAGE } from "@/lib/xero/payment-claim-sales-invoice-refresh-contract";
import type { PaymentClaimAccountingDecision } from "@/lib/xero/payment-claim-accounting-decision";
import {
  loadPaymentClaimAccountingDecisionEvidence,
  resolvePaymentClaimAccountingOperationForState,
} from "@/lib/xero/payment-claim-accounting-decision-server";
import type { XeroActionTiming } from "@/lib/xero/action-performance";
import type {
  AccountingSyncRequestContext,
} from "@/lib/xero/accounting-sync-request-context";
import type {
  AccountingSyncCompletionEvidence,
  AccountingSyncLocalComparison,
} from "@/lib/xero/accounting-sync-completion-evidence";
import {
  PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS,
  PAYMENT_CLAIM_FINANCIAL_JOB_KINDS,
  paymentClaimXeroInvoiceUrl,
  resolvePaymentClaimAccountingIdentity,
  type PaymentClaimAccountingIdentitySnapshot,
} from "@/lib/xero/payment-claim-accounting-identity";

type Row = Record<string, unknown>;
type UntypedAdmin = {
  // Stage 1 polymorphic fields are not present in every generated client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PaymentClaimXeroPanelStatus =
  | "not_ready"
  | "ready_to_sync"
  | "queued"
  | "syncing"
  | "synced"
  | "verification_required"
  | "update_pending"
  | "locally_diverged"
  | "uncertain"
  | "legacy_linked"
  | "missing_in_xero"
  | "voided_in_xero"
  | "attention_required";

export type PaymentClaimXeroPanelState = {
  visible: boolean;
  canManage: boolean;
  status: PaymentClaimXeroPanelStatus;
  statusLabel: string;
  message: string;
  blockers: PaymentClaimXeroReadinessBlocker[];
  clientId?: string | null;
  clientName?: string | null;
  invoiceId?: string | null;
  invoiceNumber: string | null;
  lastSyncedAt: string | null;
  safeErrorMessage: string | null;
  xeroUrl: string | null;
  actionLabel: "Push to Xero" | null;
  accountingDecision?: PaymentClaimAccountingDecision;
  initialPushEnabled?: boolean;
  revisionBacked?: boolean;
  paymentStatus: "unpaid" | "partially_paid" | "paid" | "attention_required" | null;
  paymentStatusLabel: "Unpaid" | "Partially paid" | "Paid" | "Attention required" | null;
  amountPaid: number | null;
  amountOutstanding: number | null;
  fullyPaidAt: string | null;
  lastRefreshedAt: string | null;
  refreshInProgress: boolean;
  canRefresh: boolean;
  attachmentStatus: "not_attached" | "queued" | "attaching" | "attached" | "out_of_date" | "failed";
  attachmentStatusLabel: string;
  attachmentFilename: string | null;
  attachmentUploadedAt: string | null;
  attachmentErrorMessage: string | null;
  attachmentInProgress: boolean;
  canAttach: boolean;
  attachmentActionLabel: "Attach PDF" | "Attach updated PDF" | "Retry attachment" | null;
};

export type PaymentClaimXeroEnqueueResult = {
  jobId: string;
  accountingDocumentId: string;
  status: "queued" | "syncing";
  reusedActiveJob: boolean;
};

export class PaymentClaimXeroEnqueueError extends Error {
  readonly code:
    | "unauthorized"
    | "claim_not_found"
    | "not_ready"
    | "invalid_document"
    | "already_synced"
    | "enqueue_failed";

  constructor(code: PaymentClaimXeroEnqueueError["code"], message: string) {
    super(message);
    this.name = "PaymentClaimXeroEnqueueError";
    this.code = code;
  }
}

const STATUS_LABELS: Record<PaymentClaimXeroPanelStatus, string> = {
  not_ready: "Not ready",
  ready_to_sync: "Ready to sync",
  queued: "Queued",
  syncing: "Syncing",
  synced: "Synced",
  verification_required: "Verification required",
  update_pending: "Update pending",
  locally_diverged: "Update required",
  uncertain: "Checking Xero result",
  legacy_linked: "Legacy Xero link",
  missing_in_xero: "Missing in Xero",
  voided_in_xero: "Voided in Xero",
  attention_required: "Attention required",
};

function adminDb(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedAdmin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : {};
}

function messageForStatus(status: PaymentClaimXeroPanelStatus) {
  switch (status) {
    case "not_ready": return "Resolve the readiness items below before synchronizing this claim.";
    case "ready_to_sync": return "This saved Submitted claim is ready to create as a Xero Sales Invoice.";
    case "queued": return "The Xero synchronization job is queued.";
    case "syncing": return "The existing Xero synchronization job is being processed.";
    case "synced": return "The current saved claim state is synchronized to Xero.";
    case "verification_required": return "Refresh to verify this invoice against the configured Xero organisation.";
    case "update_pending": return "The saved claim has changed since its last successful Xero synchronization.";
    case "locally_diverged": return "This Payment Claim has changed since it was pushed to Xero. Push to Xero will safely update the existing unpaid invoice.";
    case "uncertain": return "Xero may have created this invoice. TradesStack is checking the result. Do not push again.";
    case "legacy_linked": return "This invoice uses the existing legacy Xero integration until a later migration.";
    case "missing_in_xero": return "Xero no longer contains this invoice. TradesStack has retained its immutable accounting history.";
    case "voided_in_xero": return "The linked Xero Sales Invoice is voided. Push the Payment Claim to Xero to create a new authorised invoice.";
    case "attention_required": return "The last Xero synchronization needs attention before it can complete.";
  }
}

function paymentProjection(document: Row | null, projection: Row | null) {
  if (projection) {
    switch (text(projection.normalized_payment_status)) {
      case "unpaid": return { status: "unpaid", label: "Unpaid" } as const;
      case "partially_paid": return { status: "partially_paid", label: "Partially paid" } as const;
      case "paid": return { status: "paid", label: "Paid" } as const;
      case "attention_required": return { status: "attention_required", label: "Attention required" } as const;
    }
  }
  if (!document || !text(document.last_status_synced_at)) {
    return { status: null, label: null } as const;
  }
  if (text(document.last_status_sync_error)) {
    return { status: "attention_required", label: "Attention required" } as const;
  }
  switch (text(document.normalized_external_status)) {
    case "awaiting_payment": return { status: "unpaid", label: "Unpaid" } as const;
    case "partially_paid": return { status: "partially_paid", label: "Partially paid" } as const;
    case "paid": return { status: "paid", label: "Paid" } as const;
    case "voided":
    case "deleted":
    case "unknown": return { status: "attention_required", label: "Attention required" } as const;
    default: return { status: null, label: null } as const;
  }
}

function attachmentProjection(params: {
  document: Row | null;
  currentHash: string | null;
  activeAttachmentJob: Row | null;
  canManage: boolean;
  activeFinancialJob: Row | null;
}) {
  const invoiceId = text(params.document?.external_document_id);
  const activeState = text(params.activeAttachmentJob?.queue_state);
  const lastSyncedHash = text(params.document?.last_synced_hash);
  const attachmentHash = text(params.document?.attachment_synced_hash);
  const attachmentError = text(params.document?.attachment_error_message);
  const freshForAttachment = Boolean(params.currentHash && lastSyncedHash === params.currentHash);
  let status: PaymentClaimXeroPanelState["attachmentStatus"];
  if (activeState === "claimed") status = "attaching";
  else if (["pending", "retry_scheduled"].includes(activeState ?? "")) status = "queued";
  else if (!invoiceId || !attachmentHash) status = attachmentError ? "failed" : "not_attached";
  else if (params.currentHash !== attachmentHash) status = "out_of_date";
  else if (attachmentError || params.document?.attachment_status === "failed") status = "failed";
  else status = "attached";
  const labels: Record<typeof status, string> = {
    not_attached: "PDF not attached",
    queued: "Attachment queued",
    attaching: "Attaching PDF",
    attached: "PDF attached",
    out_of_date: "Attachment out of date",
    failed: "Attachment failed",
  };
  const canAttach = Boolean(
    params.canManage
    && invoiceId
    && freshForAttachment
    && !params.activeFinancialJob
    && !params.activeAttachmentJob,
  );
  return {
    status,
    label: labels[status],
    error: attachmentError,
    canAttach,
    actionLabel: !canAttach || status === "attached"
      ? null
      : status === "failed"
        ? "Retry attachment" as const
        : status === "out_of_date"
          ? "Attach updated PDF" as const
          : "Attach PDF" as const,
  };
}

export function derivePaymentClaimXeroPanelState(params: {
  canManage: boolean;
  readiness: PaymentClaimXeroReadinessResult;
  document: Row | null;
  activeJob: Row | null;
  latestJob: Row | null;
  activeRefreshJob?: Row | null;
  activeAttachmentJob?: Row | null;
  currentHash: string | null;
  initialPushEnabled?: boolean;
  canPush?: boolean;
  accountingDecision?: PaymentClaimAccountingDecision;
  projection?: Row | null;
  activeRevision?: Row | null;
  latestObservation?: Row | null;
  latestVerificationFailure?: Row | null;
  resolvedIdentity?: PaymentClaimAccountingIdentitySnapshot | null;
}): PaymentClaimXeroPanelState {
  const document = params.document;
  const revisionBacked = document?.integration_contract === "payment_claim_revision_v1";
  const activeRevision = params.activeRevision ?? null;
  const revisionIdentityMatches = params.resolvedIdentity
    ? params.resolvedIdentity.identityIssue === null
      && params.resolvedIdentity.identitySource === "active_revision"
    : Boolean(
      activeRevision
      && text(activeRevision.id) === text(document?.active_accounting_revision_id)
      && text(activeRevision.accounting_document_id) === text(document?.id)
      && text(activeRevision.external_document_id) === text(document?.external_document_id)
      && text(activeRevision.external_document_number) === text(document?.external_document_number)
      && text(activeRevision.tenant_id) === text(document?.tenant_id)
      && text(activeRevision.connection_id) === text(document?.accounting_connection_id),
    );
  const invoiceId = params.resolvedIdentity
    ? params.resolvedIdentity.invoiceId
    : revisionBacked
      ? revisionIdentityMatches
        ? text(activeRevision?.external_document_id)
        : null
      : text(document?.external_document_id);
  const activeQueueState = text(params.activeJob?.queue_state);
  const latestQueueState = text(params.latestJob?.queue_state);
  const documentStatus = text(document?.export_status);
  const refreshError = text(document?.last_status_sync_error);
  const missingInXero = refreshError === XERO_SALES_INVOICE_MISSING_MESSAGE
    || params.accountingDecision?.accountingState === "missing_unconfirmed"
    || params.accountingDecision?.accountingState === "ready_for_replacement_after_confirmed_loss";
  const projectedInvoiceStatus = text(params.projection?.normalized_invoice_status);
  const voidedInXero = ["voided", "deleted"].includes(
    projectedInvoiceStatus
      ?? (params.accountingDecision?.accountingState.includes("replacement_after_void") ? "voided" : null)
      ?? text(document?.normalized_external_status)
      ?? "",
  );
  const initialPushEnabled = params.initialPushEnabled === true;
  const observation = params.latestObservation ?? null;
  const rawObservation = observation?.raw_observation
    && typeof observation.raw_observation === "object"
    && !Array.isArray(observation.raw_observation)
      ? observation.raw_observation as Row
      : null;
  const verifiedActiveRevision = Boolean(
    revisionBacked
    && revisionIdentityMatches
    && observation
    && text(observation.accounting_document_id) === text(document?.id)
    && text(observation.accounting_revision_id) === text(activeRevision?.id)
    && text(observation.tenant_id) === text(activeRevision?.tenant_id)
    && text(observation.external_document_id) === text(activeRevision?.external_document_id)
    && text(observation.content_hash) === text(activeRevision?.provider_content_hash)
    && rawObservation
    && text(rawObservation.Type) === "ACCREC"
    && text(rawObservation.InvoiceID) === text(activeRevision?.external_document_id)
    && text(rawObservation.InvoiceNumber) === text(activeRevision?.external_document_number)
    && Math.round(Number(rawObservation.SubTotal) * 100) === Number(activeRevision?.subtotal_minor)
    && Math.round(Number(rawObservation.TotalTax) * 100) === Number(activeRevision?.tax_minor)
    && Math.round(Number(rawObservation.Total) * 100) === Number(activeRevision?.total_minor)
    && text(params.projection?.accounting_revision_id) === text(activeRevision?.id)
    && text(params.projection?.remote_observation_id) === text(observation.id)
    && params.projection?.divergent !== true
  );
  const observationAt = Date.parse(text(observation?.observed_at) ?? "");
  const verificationFailureAt = Date.parse(
    text(params.latestVerificationFailure?.occurred_at) ?? "",
  );
  const verificationFailed = Boolean(
    revisionBacked
    && params.latestVerificationFailure
    && (
      !Number.isFinite(observationAt)
      || verificationFailureAt > observationAt
    ),
  );

  let status: PaymentClaimXeroPanelStatus;
  if (activeQueueState === "claimed") {
    status = "syncing";
  } else if (activeQueueState === "pending" || activeQueueState === "retry_scheduled") {
    status = "queued";
  } else if (missingInXero) {
    status = "missing_in_xero";
  } else if (voidedInXero) {
    status = "voided_in_xero";
  } else if (
    refreshError
    || verificationFailed
    || documentStatus === "attention_required"
    || documentStatus === "failed"
    || latestQueueState === "dead_lettered"
  ) {
    status = revisionBacked && text(document?.last_error_code)?.includes("uncertain")
      ? "uncertain" : "attention_required";
  } else if (!params.readiness.ready) {
    status = "not_ready";
  } else if (revisionBacked) {
    if (params.currentHash && text(document?.last_synced_hash) !== params.currentHash) {
      status = "locally_diverged";
    } else {
      status = verifiedActiveRevision ? "synced" : "verification_required";
    }
  } else if (!invoiceId) {
    status = "ready_to_sync";
  } else if (params.currentHash && text(document?.last_synced_hash) === params.currentHash) {
    status = "synced";
  } else if (invoiceId) {
    status = "update_pending";
  } else {
    status = "legacy_linked";
  }

  const safeErrorMessage = ["attention_required", "missing_in_xero"].includes(status)
    ? refreshError
      ?? text(
        params.latestVerificationFailure?.event_evidence
        && typeof params.latestVerificationFailure.event_evidence === "object"
          ? (params.latestVerificationFailure.event_evidence as Row).message
          : null,
      )
      ?? text(document?.last_error_message)
      ?? "Xero synchronization did not complete. Review readiness and retry when safe."
    : null;
  const payment = paymentProjection(document, params.projection ?? null);
  const attachment = attachmentProjection({
    document,
    currentHash: params.currentHash,
    activeAttachmentJob: params.activeAttachmentJob ?? null,
    canManage: params.canManage,
    activeFinancialJob: params.activeJob,
  });
  return {
    visible: true,
    canManage: params.canManage,
    status,
    statusLabel: STATUS_LABELS[status],
    message: params.accountingDecision?.blockers[0]?.message ?? messageForStatus(status),
    blockers: params.readiness.blockers,
    invoiceId,
    invoiceNumber: params.resolvedIdentity
      ? params.resolvedIdentity.invoiceNumber
      : revisionBacked && revisionIdentityMatches
        ? text(activeRevision?.external_document_number)
        : text(document?.external_document_number),
    lastSyncedAt: revisionBacked
      ? text(observation?.observed_at) ?? text(document?.last_synced_at) ?? text(document?.exported_at)
      : text(document?.last_synced_at) ?? text(document?.exported_at),
    safeErrorMessage,
    xeroUrl: missingInXero
      ? null
      : params.resolvedIdentity?.navigationUrl
        ?? paymentClaimXeroInvoiceUrl(invoiceId),
    actionLabel: params.canManage && params.accountingDecision?.canPush ? "Push to Xero" : null,
    accountingDecision: params.accountingDecision,
    initialPushEnabled,
    revisionBacked,
    paymentStatus: payment.status,
    paymentStatusLabel: payment.label,
    amountPaid: params.projection?.amount_paid_minor == null
      ? document?.amount_paid == null ? null : Number(document.amount_paid)
      : Number(params.projection.amount_paid_minor) / 100,
    amountOutstanding: params.projection?.amount_due_minor == null
      ? document?.amount_due == null ? null : Number(document.amount_due)
      : Number(params.projection.amount_due_minor) / 100,
    fullyPaidAt: text(document?.fully_paid_at),
    lastRefreshedAt: text(params.projection?.projected_at) ?? text(document?.last_status_synced_at),
    refreshInProgress: Boolean(params.activeRefreshJob),
    canRefresh: params.canManage && (
      params.resolvedIdentity
        ? Boolean(params.resolvedIdentity.invoiceId)
          && (
            params.resolvedIdentity.refresh.eligible
            || params.resolvedIdentity.refresh.blockingReason
              === "refresh_in_progress"
          )
        : Boolean(
          invoiceId
          || text(document?.active_accounting_revision_id)
          || (
            document?.export_status === "exported"
            && text(document?.external_document_number)
          ),
        )
    ),
    attachmentStatus: attachment.status,
    attachmentStatusLabel: attachment.label,
    attachmentFilename: text(document?.attachment_filename),
    attachmentUploadedAt: text(document?.attachment_uploaded_at),
    attachmentErrorMessage: attachment.error,
    attachmentInProgress: Boolean(params.activeAttachmentJob),
    canAttach: attachment.canAttach,
    attachmentActionLabel: attachment.actionLabel,
  };
}

export function derivePaymentClaimPanelFromCompletionEvidence(params: {
  evidence: AccountingSyncCompletionEvidence;
  requestContext: AccountingSyncRequestContext;
  localComparison: AccountingSyncLocalComparison;
}): PaymentClaimXeroPanelState | null {
  const { evidence, localComparison, requestContext } = params;
  if (
    evidence.sourceDocumentType !== "project_claim"
    || evidence.organizationId !== requestContext.organizationId
    || evidence.claimId !== requestContext.claimId
    || requestContext.accountingDocumentId !== evidence.accountingDocumentId
    || requestContext.revisionId !== evidence.activeRevisionId
    || localComparison.claimId !== evidence.claimId
    || !localComparison.matchesActiveRevision
    || !evidence.sourceMatches
  ) {
    return null;
  }
  const panel = derivePaymentClaimXeroPanelState({
    canManage:
      requestContext.permissions["accounting.sales_invoices.manage"] === true,
    readiness: { ready: true, blockers: [] },
    document: evidence.document,
    activeJob: null,
    latestJob: null,
    activeRefreshJob: null,
    activeAttachmentJob: null,
    currentHash: text(object(evidence.revision.commercial_snapshot).currentStateHash),
    initialPushEnabled:
      requestContext.featureFlags.initialPaymentClaimPushEnabled === true,
    canPush:
      requestContext.permissions[PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION] === true,
    projection: evidence.projection,
    activeRevision: evidence.revision,
    latestObservation: evidence.observation,
    latestVerificationFailure: null,
  });
  return ["synced", "voided_in_xero", "missing_in_xero"].includes(panel.status)
    ? panel
    : null;
}

async function currentMemberWithPermission(permission: "view" | "manage") {
  const member = await getCurrentOrganizationMember();
  if (!member) return null;
  const allowed = await hasOrganizationPermission(
    member.organization_id,
    `accounting.sales_invoices.${permission}`,
  );
  return allowed ? member : null;
}

function lightweightPaymentReadiness(claim: Row | null): PaymentClaimXeroReadinessResult {
  if (!claim) {
    return {
      ready: false,
      blockers: [{
        code: "claim_not_found",
        message: "Payment Claim not found.",
      }],
    };
  }
  if (claim.status !== "Submitted") {
    return {
      ready: false,
      blockers: [{
        code: "claim_not_submitted",
        message: "Payment Claim must be Submitted before it can be pushed to Xero.",
      }],
    };
  }
  return { ready: true, blockers: [] };
}

async function loadPaymentClaimXeroRecoveryGuidance(params: {
  db: UntypedAdmin;
  organizationId: string;
  projectId: string | null;
  connection: Row | null;
}) {
  const blockers: PaymentClaimXeroReadinessBlocker[] = [];
  if (params.connection?.status !== "connected") {
    blockers.push({
      code: "xero_disconnected",
      message: "Xero connection needs reauthorization.",
    });
  }
  if (!params.projectId) return { blockers, clientId: null, clientName: null };

  const project = await params.db
    .from("organization_projects")
    .select("client_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.projectId)
    .maybeSingle();
  if (project.error || !project.data?.client_id) {
    return { blockers, clientId: null, clientName: null };
  }

  const clientId = text(project.data.client_id);
  if (!clientId) return { blockers, clientId: null, clientName: null };
  const [client, activeLink] = await Promise.all([
    params.db
      .from("organization_clients")
      .select("id, name, company_name")
      .eq("organization_id", params.organizationId)
      .eq("id", clientId)
      .maybeSingle(),
    params.db
      .from("organization_external_contacts")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .eq("local_entity_type", "client")
      .eq("local_entity_id", clientId)
      .eq("accounting_connection_id", text(params.connection?.id) ?? "")
      .eq("tenant_id", text(params.connection?.tenant_id) ?? "")
      .in("link_status", ["linked", "attention_required", "external_archived"])
      .limit(1),
  ]);
  if (activeLink.error || (activeLink.data ?? []).length === 0) {
    blockers.push({
      code: "client_contact_missing",
      message: "Client is not linked to a Xero Contact.",
    });
  }
  return {
    blockers,
    clientId,
    clientName: text(client.data?.name) ?? text(client.data?.company_name),
  };
}

function optimisticRevisionMatches(
  claimUpdatedAt: unknown,
  revisionOptimisticValue: unknown,
) {
  const left = Date.parse(text(claimUpdatedAt) ?? "");
  const right = Date.parse(text(revisionOptimisticValue) ?? "");
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

async function resolveFullPushContext(params: {
  organizationId: string;
  claimId: string;
}) {
  const resolution = await resolvePaymentClaimXeroReadinessContext(params);
  if (!resolution.snapshot) {
    return {
      snapshot: null,
      readiness: resolution.terminalReadiness,
      currentHash: null,
    };
  }
  const readiness = evaluatePaymentClaimXeroReadinessSnapshot(
    resolution.snapshot,
  );
  let currentHash: string | null = null;
  if (readiness.ready) {
    const payloadResult = buildPaymentClaimXeroPayloadFromResolvedSnapshot(
      resolution.snapshot,
    );
    currentHash = buildPaymentClaimXeroCurrentStateHashFromPayload({
      snapshot: resolution.snapshot,
      payloadResult,
    }).hash;
  }
  return { snapshot: resolution.snapshot, readiness, currentHash };
}

async function loadJobs(params: {
  db: UntypedAdmin;
  organizationId: string;
  documentId: string;
}) {
  const result = await params.db
    .from("organization_accounting_sync_jobs")
    .select("id, job_kind, queue_state, request_payload, created_at")
    .eq("organization_id", params.organizationId)
    .eq("provider", "xero")
    .in("job_kind", [
      ...PAYMENT_CLAIM_FINANCIAL_JOB_KINDS,
      "xero.sales_invoice.refresh",
      ...PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS,
    ])
    .eq("request_payload->>accountingDocumentId", params.documentId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (result.error) throw new Error(result.error.message);
  const jobs = (result.data ?? []) as Row[];
  return {
    activeJob: jobs.find((job) =>
      PAYMENT_CLAIM_FINANCIAL_JOB_KINDS.includes(
        String(job.job_kind) as (typeof PAYMENT_CLAIM_FINANCIAL_JOB_KINDS)[number],
      )
      && ["pending", "claimed", "retry_scheduled"].includes(String(job.queue_state)),
    ) ?? null,
    activeRefreshJob: jobs.find((job) =>
      job.job_kind === "xero.sales_invoice.refresh"
      && ["pending", "claimed", "retry_scheduled"].includes(String(job.queue_state)),
    ) ?? null,
    activeAttachmentJob: jobs.find((job) =>
      PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS.includes(
        String(job.job_kind) as (typeof PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS)[number],
      )
      && ["pending", "claimed", "retry_scheduled"].includes(String(job.queue_state)),
    ) ?? null,
    latestJob: jobs.find((job) =>
      !PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS.includes(
        String(job.job_kind) as (typeof PAYMENT_CLAIM_ATTACHMENT_JOB_KINDS)[number],
      ),
    ) ?? null,
  };
}

export async function getPaymentClaimXeroPanelState(params: {
  claimId: string;
}, timing?: XeroActionTiming, requestContext?: AccountingSyncRequestContext): Promise<PaymentClaimXeroPanelState> {
  const trustedContext = requestContext?.claimId === params.claimId
    ? requestContext
    : null;
  const member = trustedContext
    ? {
        id: trustedContext.membershipId,
        organization_id: trustedContext.organizationId,
        user_id: trustedContext.userId,
      }
    : timing
      ? await timing.measure(
          "authentication_membership",
          () => getCurrentOrganizationMember(),
          { databaseOperation: "current_organization_member" },
        )
      : await getCurrentOrganizationMember();
  if (!member) {
    return {
      visible: false,
      canManage: false,
      status: "not_ready",
      statusLabel: STATUS_LABELS.not_ready,
      message: "Xero Sales Invoice access is unavailable.",
      blockers: [],
      invoiceId: null,
      invoiceNumber: null,
      lastSyncedAt: null,
      safeErrorMessage: null,
      xeroUrl: null,
      actionLabel: null,
      accountingDecision: undefined,
      initialPushEnabled: false,
      revisionBacked: false,
      paymentStatus: null,
      paymentStatusLabel: null,
      amountPaid: null,
      amountOutstanding: null,
      fullyPaidAt: null,
      lastRefreshedAt: null,
      refreshInProgress: false,
      canRefresh: false,
      attachmentStatus: "not_attached",
      attachmentStatusLabel: "PDF not attached",
      attachmentFilename: null,
      attachmentUploadedAt: null,
      attachmentErrorMessage: null,
      attachmentInProgress: false,
      canAttach: false,
      attachmentActionLabel: null,
    };
  }
  const admin = adminDb(await createAdminSupabaseClient());
  timing?.stage("supabase_admin_client", {
    cacheStatus: "not_applicable",
  });
  const dependencies = timing?.startParallelGroup("payment_panel_dependencies");
  const runDependency = <T>(
    stage: string,
    operation: () => PromiseLike<T>,
    databaseOperation?: string,
  ) => dependencies
    ? dependencies.measure(stage, operation, { databaseOperation })
    : Promise.resolve(operation());
  const [permissions, settings, claimResult, identity] =
    await Promise.all([
      trustedContext
        ? Promise.resolve(trustedContext.permissions)
        : runDependency<Record<string, boolean>>("permission_batch", () =>
            getOrganizationPermissionsBatch({
              organizationId: member.organization_id,
              permissions: [
                "accounting.sales_invoices.view",
                "accounting.sales_invoices.manage",
                PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
              ],
            }), "get_organization_permissions_batch"),
      runDependency<{ data: Row | null; error: { message: string } | null }>(
        "feature_gate", () =>
          trustedContext
          && Object.hasOwn(
            trustedContext.featureFlags,
            "initialPaymentClaimPushEnabled",
          )
            ? Promise.resolve({
                data: {
                  initial_payment_claim_push_enabled:
                    trustedContext.featureFlags
                      .initialPaymentClaimPushEnabled === true,
                },
                error: null,
              })
            : admin
                .from("organization_accounting_phase2b_settings")
                .select("initial_payment_claim_push_enabled")
                .eq("organization_id", member.organization_id)
                .maybeSingle(),
        "payment_claim_feature_gate"),
      runDependency<{ data: Row | null; error: { message: string } | null }>(
        "payment_claim_identity", () => admin
        .from("project_claims")
        .select("id,organization_id,project_id,claim_number,status,updated_at")
        .eq("organization_id", member.organization_id)
        .eq("id", params.claimId)
        .maybeSingle(), "project_claims.panel_identity"),
      runDependency<PaymentClaimAccountingIdentitySnapshot>(
        "accounting_identity",
        () => resolvePaymentClaimAccountingIdentity({
          organizationId: member.organization_id,
          claimId: params.claimId,
          admin,
        }),
        "payment_claim_accounting_identity",
      ),
    ]);
  dependencies?.complete();
  const canView = permissions["accounting.sales_invoices.view"] === true;
  const canManage = permissions["accounting.sales_invoices.manage"] === true;
  const canPush = permissions[PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION] === true;
  if (!canView) {
    return {
      visible: false,
      canManage: false,
      status: "not_ready",
      statusLabel: STATUS_LABELS.not_ready,
      message: "Xero Sales Invoice access is unavailable.",
      blockers: [],
      invoiceId: null,
      invoiceNumber: null,
      lastSyncedAt: null,
      safeErrorMessage: null,
      xeroUrl: null,
      actionLabel: null,
      accountingDecision: undefined,
      initialPushEnabled: false,
      revisionBacked: false,
      paymentStatus: null,
      paymentStatusLabel: null,
      amountPaid: null,
      amountOutstanding: null,
      fullyPaidAt: null,
      lastRefreshedAt: null,
      refreshInProgress: false,
      canRefresh: false,
      attachmentStatus: "not_attached",
      attachmentStatusLabel: "PDF not attached",
      attachmentFilename: null,
      attachmentUploadedAt: null,
      attachmentErrorMessage: null,
      attachmentInProgress: false,
      canAttach: false,
      attachmentActionLabel: null,
    };
  }
  const initialPushEnabled = !settings.error
    && settings.data?.initial_payment_claim_push_enabled === true;
  if (claimResult.error) throw new Error(claimResult.error.message);
  const claim = claimResult.data as Row | null;
  const document = identity.document;
  const lightweightReadiness = lightweightPaymentReadiness(claim);
  const recoveryGuidance = claim && lightweightReadiness.ready
    ? await loadPaymentClaimXeroRecoveryGuidance({
        db: admin,
        organizationId: member.organization_id,
        projectId: text(claim.project_id),
        connection: identity.currentConnection,
      })
    : { blockers: [] as PaymentClaimXeroReadinessBlocker[], clientId: null, clientName: null };
  const readiness = recoveryGuidance.blockers.length > 0
    ? { ready: false, blockers: recoveryGuidance.blockers }
    : lightweightReadiness;
  timing?.identify({
    accountingDocumentId: text(document?.id),
    revisionId: text(document?.active_accounting_revision_id),
  });
  const jobs = {
    activeJob: identity.activeFinancialJob,
    activeRefreshJob: identity.activeRefreshJob,
    activeAttachmentJob: identity.activeAttachmentJob,
    latestJob: identity.latestJob,
  };
  const decisionEvidence = await (
    timing
      ? timing.span("accounting_evidence", () =>
          loadPaymentClaimAccountingDecisionEvidence({
            organizationId: member.organization_id,
            document,
            hasActiveWork: false,
            resolvedActiveRevision: identity.activeRevision,
          }), { databaseOperation: "payment_claim_accounting_evidence" })
      : loadPaymentClaimAccountingDecisionEvidence({
          organizationId: member.organization_id,
          document,
          hasActiveWork: false,
          resolvedActiveRevision: identity.activeRevision,
        })
  );
  const activeCommercialHash = text(
    object(decisionEvidence.revision?.commercial_snapshot).currentStateHash,
  );
  const currentHash = !activeCommercialHash
    ? null
    : optimisticRevisionMatches(
        claim?.updated_at,
        decisionEvidence.sourceOptimisticRevision,
      )
      ? activeCommercialHash
      : "__payment_claim_changed__";
  const accountingDecision = await (timing
    ? timing.span("accounting_decision", () =>
        resolvePaymentClaimAccountingOperationForState({
    organizationId: member.organization_id,
    claimNumber: String(claim?.claim_number ?? ""),
    readiness,
    currentHash,
    document,
    connection: identity.currentConnection,
    hasPushPermission: canPush,
    featureEnabled: initialPushEnabled,
    hasActiveWork: Boolean(jobs.activeJob),
    evidence: {
      ...decisionEvidence,
      hasActiveWork: Boolean(jobs.activeJob),
    },
        }), { cacheStatus: "not_applicable" })
    : resolvePaymentClaimAccountingOperationForState({
        organizationId: member.organization_id,
        claimNumber: String(claim?.claim_number ?? ""),
        readiness,
        currentHash,
        document,
        connection: identity.currentConnection,
        hasPushPermission: canPush,
        featureEnabled: initialPushEnabled,
        hasActiveWork: Boolean(jobs.activeJob),
        evidence: {
          ...decisionEvidence,
          hasActiveWork: Boolean(jobs.activeJob),
        },
      }));
  const latestVerificationFailure = decisionEvidence.events.find((event) =>
    ["provider_missing_observed", "revision_refresh_failed"].includes(
      String(event.event_type),
    )
  ) ?? null;
  const presentation = timing?.startOperation("presentation_mapping");
  const panel = derivePaymentClaimXeroPanelState({
    canManage,
    readiness,
    document,
    activeJob: jobs.activeJob,
    latestJob: jobs.latestJob,
    activeRefreshJob: jobs.activeRefreshJob,
    activeAttachmentJob: jobs.activeAttachmentJob,
    currentHash,
    initialPushEnabled,
    canPush,
    accountingDecision,
    projection: decisionEvidence.projection,
    activeRevision: identity.activeRevision,
    latestObservation: decisionEvidence.latestObservation,
    latestVerificationFailure,
    resolvedIdentity: identity,
  });
  presentation?.complete({
    rowsReturned: 1,
    cacheStatus: "not_applicable",
  });
  return {
    ...panel,
    clientId: recoveryGuidance.clientId,
    clientName: recoveryGuidance.clientName,
  };
}

async function ensureAccountingDocument(params: {
  db: UntypedAdmin;
  organizationId: string;
  snapshot: PaymentClaimXeroReadinessSnapshot;
}) {
  const resolved = resolvePaymentClaimXeroDependencies(params.snapshot);
  const connectionId = resolved.connectionId;
  const tenantId = resolved.tenantId;
  if (!connectionId || !tenantId) {
    throw new PaymentClaimXeroEnqueueError("not_ready", "Xero connection and tenant are required.");
  }
  const existing = params.snapshot.accountingDocuments[0] ?? null;
  if (existing) {
    if (
      existing.organization_id !== params.organizationId
      || existing.provider !== "xero"
      || existing.local_document_type !== "project_claim"
      || existing.project_claim_id !== params.snapshot.claim.id
      || existing.accounting_connection_id !== connectionId
      || existing.tenant_id !== tenantId
    ) {
      throw new PaymentClaimXeroEnqueueError("invalid_document", "The current accounting document identity is invalid.");
    }
    return existing;
  }

  const values = {
    organization_id: params.organizationId,
    accounting_connection_id: connectionId,
    provider: "xero",
    tenant_id: tenantId,
    local_document_type: "project_claim",
    local_document_id: null,
    project_claim_id: params.snapshot.claim.id,
    current_version_id: null,
    export_status: "not_ready",
    currency_code: "NZD",
  };
  const inserted = await params.db
    .from("organization_accounting_documents")
    .insert(values)
    .select("*")
    .single();
  if (!inserted.error && inserted.data) return inserted.data as Row;

  // The partial unique index is the authority during concurrent first clicks.
  const raced = await params.db
    .from("organization_accounting_documents")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("provider", "xero")
    .eq("tenant_id", tenantId)
    .eq("local_document_type", "project_claim")
    .eq("project_claim_id", params.snapshot.claim.id)
    .maybeSingle();
  if (raced.error || !raced.data) {
    throw new PaymentClaimXeroEnqueueError(
      "invalid_document",
      "Unable to safely create or reuse the Payment Claim accounting document.",
    );
  }
  return raced.data as Row;
}

async function enqueueOrReuseActiveJob(params: {
  db: UntypedAdmin;
  organizationId: string;
  userId: string;
  connectionId: string;
  document: Row;
  queuedHash: string;
}) {
  const documentId = text(params.document.id)!;
  const findJobs = async () => {
    return loadJobs({
      db: params.db,
      organizationId: params.organizationId,
      documentId,
    });
  };
  const initialJobs = await findJobs();
  if (initialJobs.activeRefreshJob) {
    throw new PaymentClaimXeroEnqueueError(
      "enqueue_failed",
      "The Sales Invoice is being refreshed. Synchronize it after refresh completes.",
    );
  }
  if (initialJobs.activeAttachmentJob) {
    throw new PaymentClaimXeroEnqueueError(
      "enqueue_failed",
      "The Payment Claim PDF is being attached. Synchronize claim changes after attachment completes.",
    );
  }
  const existing = initialJobs.activeJob;
  if (existing) return { job: existing, reused: true };

  const triggerSource = ["attention_required", "failed"].includes(String(params.document.export_status))
    || initialJobs.latestJob?.queue_state === "dead_lettered"
    ? "user_retry"
    : "user_export";
  const inserted = await params.db
    .from("organization_accounting_sync_jobs")
    .insert({
      organization_id: params.organizationId,
      provider: "xero",
      connection_id: params.connectionId,
      job_kind: "xero.sales_invoice.sync",
      trigger_source: triggerSource,
      queue_state: "pending",
      request_payload: {
        accountingDocumentId: documentId,
        queuedHash: params.queuedHash,
      },
      result_summary: {},
      idempotency_key: null,
      max_attempts: 3,
      created_by_user_id: params.userId,
    })
    .select("*")
    .single();
  if (!inserted.error && inserted.data) return { job: inserted.data as Row, reused: false };

  const raced = (await findJobs()).activeJob;
  if (raced) return { job: raced, reused: true };
  throw new PaymentClaimXeroEnqueueError(
    "enqueue_failed",
    "Unable to safely enqueue the Xero Sales Invoice synchronization.",
  );
}

export async function enqueuePaymentClaimXeroSync(params: {
  claimId: string;
}): Promise<PaymentClaimXeroEnqueueResult> {
  const member = await currentMemberWithPermission("manage");
  if (!member) {
    throw new PaymentClaimXeroEnqueueError(
      "unauthorized",
      "You do not have permission to synchronize Payment Claims to Xero.",
    );
  }
  const context = await resolveFullPushContext({
    organizationId: member.organization_id,
    claimId: params.claimId,
  });
  if (!context.snapshot) {
    throw new PaymentClaimXeroEnqueueError(
      "claim_not_found",
      context.readiness.blockers[0]?.message ?? "Payment Claim not found.",
    );
  }
  if (!context.readiness.ready || !context.currentHash) {
    throw new PaymentClaimXeroEnqueueError(
      "not_ready",
      context.readiness.blockers[0]?.message ?? "Payment Claim is not ready for Xero.",
    );
  }
  const phase2b = await adminDb(await createAdminSupabaseClient())
    .from("organization_accounting_phase2b_settings")
    .select("initial_payment_claim_push_enabled")
    .eq("organization_id", member.organization_id)
    .maybeSingle();
  const currentDocument = context.snapshot.accountingDocuments[0] ?? null;
  if (
    phase2b.data?.initial_payment_claim_push_enabled === true
    && !text(currentDocument?.external_document_id)
  ) {
    throw new PaymentClaimXeroEnqueueError(
      "enqueue_failed",
      "Use Push to Xero and confirm the complete accounting preview for this Payment Claim.",
    );
  }

  const db = adminDb(await createAdminSupabaseClient());
  const document = await ensureAccountingDocument({
    db,
    organizationId: member.organization_id,
    snapshot: context.snapshot,
  });
  if (text(document.external_document_id) && text(document.last_synced_hash) === context.currentHash) {
    throw new PaymentClaimXeroEnqueueError("already_synced", "This saved claim is already synchronized to Xero.");
  }
  const connectionId = text(document.accounting_connection_id)!;
  const queued = await enqueueOrReuseActiveJob({
    db,
    organizationId: member.organization_id,
    userId: member.user_id,
    connectionId,
    document,
    queuedHash: context.currentHash,
  });
  const jobId = text(queued.job.id)!;
  const queueState = text(queued.job.queue_state);
  const status = queueState === "claimed" ? "syncing" : "queued";

  const documentUpdate = await db
    .from("organization_accounting_documents")
    .update({
      export_status: status === "syncing" ? "exporting" : "queued",
      last_error_code: null,
      last_error_message: null,
    })
    .eq("organization_id", member.organization_id)
    .eq("id", document.id)
    .select("id")
    .maybeSingle();
  if (documentUpdate.error || !documentUpdate.data) {
    throw new PaymentClaimXeroEnqueueError("invalid_document", "Unable to mark the accounting document as queued.");
  }

  return {
    jobId,
    accountingDocumentId: text(document.id)!,
    status,
    reusedActiveJob: queued.reused,
  };
}
