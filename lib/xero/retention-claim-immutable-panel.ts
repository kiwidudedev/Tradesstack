import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getOrganizationPermissionsBatch,
  hasOrganizationPermission,
} from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  resolveRetentionClaimAccountingOperationForState,
} from "@/lib/xero/retention-claim-accounting-decision-server";
import {
  isRetentionClaimImmutableXeroEnabled,
} from "@/lib/xero/retention-claim-push-proposal";
import {
  loadRetentionClaimStructuredSourceAccess,
} from "@/lib/xero/retention-claim-sales-invoice";
import {
  loadDirectRetentionOriginEvidence,
} from "@/lib/xero/retention-claim-direct-origin-evidence-server";
import {
  RETENTION_CLAIM_PUSH_PERMISSION,
} from "@/lib/xero/retention-claim-push-contract";
import { getOrganizationXeroConnection } from "@/lib/xero/service";
import type { XeroActionTiming } from "@/lib/xero/action-performance";
import {
  type AccountingSyncRequestContext,
} from "@/lib/xero/accounting-sync-request-context";
import type {
  AccountingSyncCompletionEvidence,
  AccountingSyncLocalComparison,
} from "@/lib/xero/accounting-sync-completion-evidence";

type Row = Record<string, unknown>;
type QueryResult = {
  data: Row | null;
  error: { message: string } | null;
};
type Admin = {
  // Phase 2C objects intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

export type RetentionClaimImmutableXeroPanelStatus =
  | "not_ready"
  | "ready_to_sync"
  | "update_required"
  | "queued"
  | "processing"
  | "synced"
  | "verification_required"
  | "uncertain"
  | "missing_in_xero"
  | "voided_in_xero"
  | "attention_required";

export type RetentionClaimImmutableXeroPanelState = {
  visible: boolean;
  canManage: boolean;
  status: RetentionClaimImmutableXeroPanelStatus;
  statusLabel: string;
  actionLabel: "Push to Xero" | null;
  canRefresh: boolean;
  canResetDates: boolean;
  resetDatesBlockedReason: string | null;
  refreshInProgress: boolean;
  invoiceId: string | null;
  invoiceNumber: string | null;
  xeroUrl: string | null;
  lastSyncedAt: string | null;
  amountPaid: number | null;
  amountOutstanding: number | null;
  invoiceSubtotalMinor?: number | null;
  invoiceTaxMinor?: number | null;
  invoiceTotalMinor?: number | null;
  authoritativeInheritedTax?: boolean;
  paymentStatus: "unpaid" | "partially_paid" | "paid" | "attention_required" | null;
  paymentStatusLabel: "Unpaid" | "Partially paid" | "Paid" | "Attention required" | null;
  fullyPaidAt: string | null;
  attachmentStatus: string | null;
  attachmentErrorMessage: string | null;
  canRetryAttachment: boolean;
  infoMessage: string | null;
  safeErrorMessage: string | null;
  decisionOperation: string;
  blockers: Array<{ code: string; message: string }>;
};

function admin() {
  return createAdminSupabaseClient() as unknown as Admin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function label(status: RetentionClaimImmutableXeroPanelStatus) {
  const labels: Record<RetentionClaimImmutableXeroPanelStatus, string> = {
    not_ready: "Not ready",
    ready_to_sync: "Ready to sync",
    update_required: "Update required",
    queued: "Queued",
    processing: "Processing",
    synced: "Synced",
    verification_required: "Verification required",
    uncertain: "Uncertain",
    missing_in_xero: "Missing in Xero",
    voided_in_xero: "Voided in Xero",
    attention_required: "Attention required",
  };
  return labels[status];
}

function paymentProjection(document: Row | null, projection: Row | null) {
  if (projection) {
    switch (text(projection.normalized_payment_status)) {
      case "unpaid": return { status: "unpaid", label: "Unpaid" } as const;
      case "partially_paid": return {
        status: "partially_paid",
        label: "Partially paid",
      } as const;
      case "paid": return { status: "paid", label: "Paid" } as const;
      case "attention_required": return {
        status: "attention_required",
        label: "Attention required",
      } as const;
    }
  }
  if (!document || !text(document.last_status_synced_at)) {
    return { status: null, label: null } as const;
  }
  if (text(document.last_status_sync_error)) {
    return {
      status: "attention_required",
      label: "Attention required",
    } as const;
  }
  switch (text(document.normalized_external_status)) {
    case "awaiting_payment": return { status: "unpaid", label: "Unpaid" } as const;
    case "partially_paid": return {
      status: "partially_paid",
      label: "Partially paid",
    } as const;
    case "paid": return { status: "paid", label: "Paid" } as const;
    case "voided":
    case "deleted":
    case "unknown": return {
      status: "attention_required",
      label: "Attention required",
    } as const;
    default: return { status: null, label: null } as const;
  }
}

export function deriveRetentionClaimPanelFromCompletionEvidence(params: {
  evidence: AccountingSyncCompletionEvidence;
  requestContext: AccountingSyncRequestContext;
  localComparison: AccountingSyncLocalComparison;
}): RetentionClaimImmutableXeroPanelState | null {
  const { evidence, localComparison, requestContext } = params;
  if (
    evidence.sourceDocumentType !== "retention_claim"
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
  const normalized = text(evidence.projection.normalized_invoice_status)
    ?? evidence.providerStatus.toLowerCase();
  const voided = normalized === "voided" || normalized === "deleted";
  const authorised = [
    "authorised",
    "awaiting_payment",
    "authorised_unpaid",
  ].includes(normalized);
  if (!voided && !authorised) return null;
  const canManage =
    requestContext.permissions[RETENTION_CLAIM_PUSH_PERMISSION] === true;
  const canEditDates =
    requestContext.permissions["retention.claims.create"] === true;
  const canReplace = voided
    && canManage
    && evidence.paidMinor === 0
    && evidence.creditedMinor === 0;
  const rawObservation = evidence.observation.raw_observation as Row | null;
  const payment = paymentProjection(evidence.document, evidence.projection);
  const revisionTaxSnapshot = evidence.revision.tax_snapshot as Row | null;
  const authoritativeInheritedTax =
    text(revisionTaxSnapshot?.inheritanceContract)
      === "direct_immutable_retention_v1";
  return {
    visible: true,
    canManage,
    status: voided ? "voided_in_xero" : "synced",
    statusLabel: label(voided ? "voided_in_xero" : "synced"),
    actionLabel: canReplace ? "Push to Xero" : null,
    canRefresh: canManage,
    canResetDates: !voided && canManage && canEditDates,
    resetDatesBlockedReason: !voided && canManage && canEditDates
      ? null
      : voided
        ? "Replace the voided Xero invoice before resetting the dates."
        : "The Retention Claim dates cannot be edited in the current accounting state.",
    refreshInProgress: false,
    invoiceId: evidence.invoiceId,
    invoiceNumber: evidence.invoiceNumber,
    xeroUrl:
      `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(evidence.invoiceId)}`,
    lastSyncedAt: evidence.observedAt,
    amountPaid: evidence.paidMinor / 100,
    amountOutstanding: evidence.outstandingMinor / 100,
    invoiceSubtotalMinor: evidence.subtotalMinor,
    invoiceTaxMinor: authoritativeInheritedTax ? evidence.taxMinor : null,
    invoiceTotalMinor: evidence.totalMinor,
    authoritativeInheritedTax,
    paymentStatus: payment.status,
    paymentStatusLabel: payment.label,
    fullyPaidAt: text(evidence.document.fully_paid_at)
      ?? text(rawObservation?.FullyPaidOnDate)
      ?? text(rawObservation?.fullyPaidOnDate),
    attachmentStatus: null,
    attachmentErrorMessage: null,
    canRetryAttachment: false,
    infoMessage: null,
    safeErrorMessage: null,
    decisionOperation: voided ? "REPLACEMENT_EXPORT" : "BLOCKED",
    blockers: [],
  };
}

export async function getRetentionClaimImmutableXeroPanel(
  retentionClaimId: string,
  timing?: XeroActionTiming,
  requestContext?: AccountingSyncRequestContext,
): Promise<RetentionClaimImmutableXeroPanelState> {
  const trustedContext = requestContext
    && requestContext.claimId === retentionClaimId
    ? requestContext
    : null;
  const member = trustedContext
    ? {
        id: trustedContext.membershipId,
        user_id: trustedContext.userId,
        organization_id: trustedContext.organizationId,
      }
    : timing
      ? await timing.span(
          "authentication_membership",
          () => getCurrentOrganizationMember(),
          { databaseOperation: "current_organization_member" },
        )
      : await getCurrentOrganizationMember();
  const hidden: RetentionClaimImmutableXeroPanelState = {
    visible: false,
    canManage: false,
    status: "not_ready",
    statusLabel: "Not ready",
    actionLabel: null,
    canRefresh: false,
    canResetDates: false,
    resetDatesBlockedReason: null,
    refreshInProgress: false,
    invoiceId: null,
    invoiceNumber: null,
    xeroUrl: null,
    lastSyncedAt: null,
    amountPaid: null,
    amountOutstanding: null,
    paymentStatus: null,
    paymentStatusLabel: null,
    fullyPaidAt: null,
    attachmentStatus: null,
    attachmentErrorMessage: null,
    canRetryAttachment: false,
    infoMessage: null,
    safeErrorMessage: null,
    decisionOperation: "BLOCKED",
    blockers: [],
  };
  if (!member) {
    return hidden;
  }
  const db = admin();
  const dependencies = timing?.startParallelGroup("retention_panel_dependencies");
  const runDependency = <T>(
    stage: string,
    operation: () => PromiseLike<T>,
    databaseOperation?: string,
  ) => dependencies
    ? dependencies.measure(stage, operation, { databaseOperation })
    : Promise.resolve(operation());
  const [
    claimResult,
    permissions,
    featureEnabled,
    documentResult,
    connection,
    structuredSourceAccess,
    organizationResult,
  ] =
    await Promise.all([
      runDependency<QueryResult>("master_claim", () => db.from("retention_claims")
        .select(
          "id,organization_id,project_id,claim_number,issue_date,due_date,"
          + "draft_revision,status",
        )
        .eq("id", retentionClaimId)
        .eq("organization_id", member.organization_id)
        .maybeSingle(), "retention_master_claim"),
      trustedContext
        ? Promise.resolve(trustedContext.permissions)
        : runDependency<Record<string, boolean>>("permission_batch", () =>
            getOrganizationPermissionsBatch({
              organizationId: member.organization_id,
              permissions: [
                RETENTION_CLAIM_PUSH_PERMISSION,
                "retention.claims.create",
              ],
            }), "get_organization_permissions_batch"),
      trustedContext
        && Object.hasOwn(
          trustedContext.featureFlags,
          "retentionClaimImmutableXeroEnabled",
        )
        ? Promise.resolve(
            trustedContext.featureFlags.retentionClaimImmutableXeroEnabled
              === true,
          )
        : runDependency("feature_gate", () =>
            isRetentionClaimImmutableXeroEnabled(member.organization_id),
          "retention_claim_feature_gate"),
      runDependency<QueryResult>("accounting_document", () =>
        db.from("organization_accounting_documents").select("*")
          .eq("organization_id", member.organization_id)
          .eq("provider", "xero")
          .eq("local_document_type", "retention_claim")
          .eq("retention_claim_id", retentionClaimId)
          .maybeSingle(), "retention_accounting_document"),
      runDependency("xero_connection", () =>
        getOrganizationXeroConnection(member.organization_id),
      "organization_xero_connection"),
      runDependency("structured_source", () =>
        loadRetentionClaimStructuredSourceAccess(retentionClaimId),
      "get_retention_claim_xero_source_phase2c"),
      runDependency<QueryResult>("organization", () =>
        db.from("organizations").select("id,default_currency")
          .eq("id", member.organization_id)
          .maybeSingle(), "retention_organization_currency"),
    ]);
  dependencies?.complete();
  if (claimResult.error || !claimResult.data) {
    return hidden;
  }
  const claim = claimResult.data;
  const canManage = permissions[RETENTION_CLAIM_PUSH_PERMISSION] === true;
  const canEditDates = permissions["retention.claims.create"] === true;
  if (!featureEnabled) {
    return hidden;
  }
  if (documentResult.error || organizationResult.error) {
    throw new Error(
      documentResult.error?.message ?? organizationResult.error?.message,
    );
  }
  const document = documentResult.data as Row | null;
  const authoritativeSourceStateHash = text(
    structuredSourceAccess.source?.claim.submissionStateHash,
  );
  const submittedSourceReady = claim.status !== "submitted"
    || (
      structuredSourceAccess.succeeded === true
      && Boolean(authoritativeSourceStateHash)
    );
  const directOriginResolution = claim.status === "submitted"
    && structuredSourceAccess.source
    && connection?.id
    && connection.tenant_id
    && text(organizationResult.data?.default_currency)
    ? await loadDirectRetentionOriginEvidence({
        source: structuredSourceAccess.source,
        connectionId: connection.id,
        tenantId: connection.tenant_id,
        currencyCode: text(organizationResult.data?.default_currency)!,
        routeAccountCode: "700",
      })
    : null;
  const directReadinessBlocker = directOriginResolution
    && !directOriginResolution.ok
    ? directOriginResolution.blocker
    : null;
  const directOriginEvidence = directOriginResolution?.ok
    ? directOriginResolution.evidence
    : null;
  const directOriginReady = claim.status !== "submitted"
    || Boolean(directOriginEvidence);
  timing?.identify({
    accountingDocumentId: text(document?.id),
    revisionId: text(document?.active_accounting_revision_id),
  });
  const decision = await (timing
    ? timing.span("accounting_decision_evidence", () =>
        resolveRetentionClaimAccountingOperationForState({
    organizationId: member.organization_id,
    claimNumber: String(claim.claim_number),
    sourceStateHash: authoritativeSourceStateHash ?? "",
    issueDate: String(claim.issue_date ?? ""),
    dueDate: String(claim.due_date ?? ""),
    readinessReady: claim.status === "submitted"
      && submittedSourceReady
      && directOriginReady,
    readinessMessage: claim.status === "submitted"
      && submittedSourceReady
      && directOriginReady
      ? undefined
      : claim.status === "submitted"
        ? directReadinessBlocker?.message
          ?? "Retention Claim accounting evidence could not be resolved."
      : "Save the Retention Claim before pushing it to Xero.",
    retentionOwnershipValid: true,
    retentionOwnershipMessage: null,
    document,
    connection: connection as unknown as Row | null,
    hasPushPermission: canManage,
    featureEnabled: true,
    desiredSubtotalMinor:
      directOriginEvidence?.releaseAmountMinor,
    desiredTaxMinor:
      directOriginEvidence?.releaseTaxMinor,
    desiredTotalMinor:
      directOriginEvidence?.releaseTotalMinor,
    desiredTaxType:
      directOriginEvidence?.taxType,
    desiredOriginRevisionLineId:
      directOriginEvidence?.originAccountingRevisionLineId,
        }), { databaseOperation: "retention_accounting_decision_evidence" })
    : resolveRetentionClaimAccountingOperationForState({
        organizationId: member.organization_id,
        claimNumber: String(claim.claim_number),
        sourceStateHash: authoritativeSourceStateHash ?? "",
        issueDate: String(claim.issue_date ?? ""),
        dueDate: String(claim.due_date ?? ""),
        readinessReady: claim.status === "submitted"
          && submittedSourceReady
          && directOriginReady,
        readinessMessage: claim.status === "submitted"
          && submittedSourceReady
          && directOriginReady
          ? undefined
          : claim.status === "submitted"
            ? directReadinessBlocker?.message
              ?? "Retention Claim accounting evidence could not be resolved."
          : "Save the Retention Claim before pushing it to Xero.",
        retentionOwnershipValid: true,
        retentionOwnershipMessage: null,
        document,
        connection: connection as unknown as Row | null,
        hasPushPermission: canManage,
        featureEnabled: true,
        desiredSubtotalMinor:
          directOriginEvidence?.releaseAmountMinor,
        desiredTaxMinor:
          directOriginEvidence?.releaseTaxMinor,
        desiredTotalMinor:
          directOriginEvidence?.releaseTotalMinor,
        desiredTaxType:
          directOriginEvidence?.taxType,
        desiredOriginRevisionLineId:
          directOriginEvidence?.originAccountingRevisionLineId,
      }));

  const activeJobs = decision.decisionEvidence.activeJobs;
  const refreshInProgress = activeJobs.some(
    (job) => job.job_kind === "xero.retention_claim.refresh",
  );
  const financialJob = activeJobs.find((job) =>
    [
      "xero.retention_claim.initial_push",
      "xero.retention_claim.replacement",
      "xero.retention_claim.update",
    ]
      .includes(String(job.job_kind)),
  );
  const revisionRow = decision.decisionEvidence.revision;
  const observationRow = decision.decisionEvidence.latestObservation;
  const projectionRow = decision.decisionEvidence.projection;
  const payment = paymentProjection(document, projectionRow);
  const rawObservation = observationRow?.raw_observation as Row | null;
  const revisionTaxSnapshot = revisionRow?.tax_snapshot as Row | null;
  const authoritativeInheritedTax =
    text(revisionTaxSnapshot?.inheritanceContract)
      === "direct_immutable_retention_v1";
  const observedAtMs = Date.parse(String(observationRow?.observed_at ?? ""));
  const exactVerified = Boolean(
    revisionRow
    && observationRow
    && projectionRow
    && observationRow.accounting_revision_id === revisionRow.id
    && observationRow.external_document_id === revisionRow.external_document_id
    && observationRow.content_hash === revisionRow.provider_content_hash
    && observationRow.tenant_id === revisionRow.tenant_id
    && revisionRow.connection_id === connection?.id
    && revisionRow.tenant_id === connection?.tenant_id
    && document?.external_document_id === revisionRow.external_document_id
    && document?.external_document_number === revisionRow.external_document_number
    && projectionRow.remote_observation_id === observationRow.id
    && projectionRow.divergent !== true
    && Number.isFinite(observedAtMs)
    && observedAtMs >= Date.now() - 24 * 60 * 60 * 1000
  );
  let status: RetentionClaimImmutableXeroPanelStatus;
  if (financialJob?.queue_state === "claimed") status = "processing";
  else if (financialJob) status = "queued";
  else if (decision.accountingState === "uncertain_result") status = "uncertain";
  else if (decision.accountingState === "missing_unconfirmed") status = "missing_in_xero";
  else if (decision.operation === "REPLACEMENT_EXPORT") status = "voided_in_xero";
  else if (decision.operation === "UPDATE_EXISTING_INVOICE") status = "update_required";
  else if (revisionRow?.lifecycle_state === "attention_required") status = "attention_required";
  else if (exactVerified) status = "synced";
  else if (revisionRow?.lifecycle_state === "succeeded") status = "verification_required";
  else if (decision.canPush) status = "ready_to_sync";
  else status = "not_ready";

  const invoiceId = text(revisionRow?.external_document_id)
    ?? text(document?.external_document_id);
  const invoiceNumber = text(revisionRow?.external_document_number)
    ?? text(document?.external_document_number);
  const canResetDates = Boolean(
    claim.status === "submitted"
    && canManage
    && canEditDates
    && !financialJob
    && !refreshInProgress
    && (status === "synced" || status === "update_required"),
  );
  const presentation = timing?.startOperation("presentation_mapping");
  const panel: RetentionClaimImmutableXeroPanelState = {
    visible: true,
    canManage,
    status,
    statusLabel: label(status),
    actionLabel: decision.canPush ? "Push to Xero" : null,
    canRefresh: Boolean(invoiceId) && decision.canRefresh && !refreshInProgress,
    canResetDates,
    resetDatesBlockedReason: canResetDates
      ? null
      : decision.blockers[0]?.message
        ?? (financialJob || refreshInProgress
          ? "Wait for the current Xero action to finish before resetting the dates."
          : "The Retention Claim dates cannot be edited in the current accounting state."),
    refreshInProgress,
    invoiceId,
    invoiceNumber,
    xeroUrl: invoiceId
      ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`
      : null,
    lastSyncedAt: text(observationRow?.observed_at)
      ?? text(document?.last_synced_at)
      ?? text(document?.exported_at),
    amountPaid: projectionRow?.amount_paid_minor == null
      ? null
      : Number(projectionRow.amount_paid_minor) / 100,
    amountOutstanding: projectionRow?.amount_due_minor == null
      ? null
      : Number(projectionRow.amount_due_minor) / 100,
    invoiceSubtotalMinor: revisionRow?.subtotal_minor == null
      ? null
      : Number(revisionRow.subtotal_minor),
    invoiceTaxMinor: authoritativeInheritedTax
      && revisionRow?.tax_minor != null
      ? Number(revisionRow.tax_minor)
      : null,
    invoiceTotalMinor: revisionRow?.total_minor == null
      ? null
      : Number(revisionRow.total_minor),
    authoritativeInheritedTax,
    paymentStatus: payment.status,
    paymentStatusLabel: payment.label,
    fullyPaidAt: text(document?.fully_paid_at)
      ?? text(rawObservation?.FullyPaidOnDate)
      ?? text(rawObservation?.fullyPaidOnDate),
    attachmentStatus: null,
    attachmentErrorMessage: null,
    canRetryAttachment: false,
    infoMessage: claim.status === "draft"
      ? "Save the Retention Claim and resolve any invalid lines before pushing it to Xero."
      : decision.operation === "UPDATE_EXISTING_INVOICE"
        ? decision.dateChangedAfterExport
          && !decision.financialChangedAfterExport
          ? "Retention Claim dates have changed since the last Xero sync."
          : "Retention values or dates have changed since the last Xero sync."
        : null,
    safeErrorMessage: claim.status === "draft"
      || decision.blockers[0]?.code === "already_exported"
      ? null
      : directReadinessBlocker?.message
        ?? decision.blockers[0]?.message
        ?? null,
    decisionOperation: decision.operation,
    blockers: directReadinessBlocker
      ? [directReadinessBlocker]
      : decision.blockers,
  };
  presentation?.complete({
    rowsReturned: 1,
    cacheStatus: "not_applicable",
  });
  return panel;
}

export async function getRetentionClaimRefreshIdentity(params: {
  organizationId: string;
  retentionClaimId: string;
  prepared?: {
    featureEnabled: boolean;
    permissions: Readonly<Record<string, boolean>>;
  };
}) {
  const db = admin();
  const [featureEnabled, canManage, claimResult, documentResult] =
    await Promise.all([
      params.prepared
        ? Promise.resolve(params.prepared.featureEnabled)
        : isRetentionClaimImmutableXeroEnabled(params.organizationId),
      params.prepared
        ? Promise.resolve(
            params.prepared.permissions[RETENTION_CLAIM_PUSH_PERMISSION]
              === true,
          )
        : hasOrganizationPermission(
            params.organizationId,
            RETENTION_CLAIM_PUSH_PERMISSION,
          ),
      db.from("retention_claims")
        .select("id,organization_id,project_id")
        .eq("organization_id", params.organizationId)
        .eq("id", params.retentionClaimId)
        .maybeSingle(),
      db.from("organization_accounting_documents")
        .select(
          "id,organization_id,retention_claim_id,"
          + "active_accounting_revision_id,external_document_id,"
          + "accounting_connection_id,tenant_id",
        )
        .eq("organization_id", params.organizationId)
        .eq("provider", "xero")
        .eq("local_document_type", "retention_claim")
        .eq("retention_claim_id", params.retentionClaimId)
        .eq("integration_contract", "retention_claim_revision_v1")
        .maybeSingle(),
    ]);
  if (!featureEnabled || !canManage) {
    throw new Error(
      "You do not have permission to refresh this Retention Claim invoice.",
    );
  }
  if (claimResult.error || !claimResult.data) {
    throw new Error("The Retention Claim could not be loaded.");
  }
  if (documentResult.error || !documentResult.data) {
    throw new Error(
      "The immutable Retention Claim accounting document was not found.",
    );
  }
  const document = documentResult.data as Row;
  if (
    !text(document.active_accounting_revision_id)
    || !text(document.external_document_id)
  ) {
    throw new Error(
      "The Retention Claim has no active immutable Xero invoice.",
    );
  }
  return {
    organizationId: params.organizationId,
    projectId: String(claimResult.data.project_id),
    retentionClaimId: params.retentionClaimId,
    accountingDocumentId: String(document.id),
    activeRevisionId: String(document.active_accounting_revision_id),
    invoiceId: String(document.external_document_id),
    connectionId: text(document.accounting_connection_id),
    tenantId: text(document.tenant_id),
  };
}
