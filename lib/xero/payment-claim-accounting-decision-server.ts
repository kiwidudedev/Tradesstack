import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasXeroInvoiceScope } from "@/lib/xero/scopes";
import {
  nextPaymentClaimReplacementNumber,
  resolvePaymentClaimAccountingOperation,
  type PaymentClaimAccountingDecision,
} from "@/lib/xero/payment-claim-accounting-decision";
import type { PaymentClaimXeroReadinessResult } from "@/lib/xero/payment-claim-readiness";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";

type Row = Record<string, unknown>;
type Db = {
  // Phase 2A objects intentionally precede some generated clients.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PaymentClaimAccountingDecisionEvidence = {
  revision: Row | null;
  projection: Row | null;
  revisions: Row[];
  events: Row[];
  latestObservation: Row | null;
  sourceOptimisticRevision: string | null;
  hasActiveWork: boolean;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function providerState(params: {
  document: Row | null;
  projection: Row | null;
  missingObserved: boolean;
  permanentlyMissing: boolean;
}) {
  if (params.permanentlyMissing) return "missing_confirmed" as const;
  if (params.missingObserved) return "missing_unconfirmed" as const;
  const refreshError = text(params.document?.last_status_sync_error);
  if (refreshError?.includes("could not be found")) return "missing_unconfirmed" as const;
  const normalized = text(params.projection?.normalized_invoice_status)
    ?? text(params.document?.normalized_external_status);
  switch (normalized) {
    case "authorised":
    case "authorised_unpaid":
    case "awaiting_payment": return "authorised" as const;
    case "voided": return "voided" as const;
    case "deleted": return "deleted" as const;
    case "paid": return "paid" as const;
    case "partially_paid": return "partially_paid" as const;
    case null: return text(params.document?.external_document_id) ? "unknown" as const : "not_exported" as const;
    default: return "unknown" as const;
  }
}

export async function loadPaymentClaimAccountingDecisionEvidence(params: {
  organizationId: string;
  document: Row | null;
  hasActiveWork?: boolean;
}): Promise<PaymentClaimAccountingDecisionEvidence> {
  const db = createAdminSupabaseClient() as unknown as Db;
  const activeRevisionId = text(
    params.document?.active_accounting_revision_id,
  );
  const documentId = text(params.document?.id);
  const [
    revisionResult,
    projectionResult,
    revisionsResult,
    eventsResult,
    jobsResult,
    latestObservationResult,
  ] = await Promise.all([
    activeRevisionId
      ? db.from("organization_accounting_document_revisions")
          .select("*")
          .eq("organization_id", params.organizationId)
          .eq("id", activeRevisionId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    documentId
      ? db.from("organization_accounting_projections")
          .select("*")
          .eq("organization_id", params.organizationId)
          .eq("accounting_document_id", documentId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    documentId
      ? db.from("organization_accounting_document_revisions")
          .select("id, external_document_number, revision_sequence")
          .eq("organization_id", params.organizationId)
          .eq("accounting_document_id", documentId)
      : Promise.resolve({ data: [], error: null }),
    documentId
      ? db.from("organization_accounting_events")
          .select("event_type, event_evidence, occurred_at")
          .eq("organization_id", params.organizationId)
          .eq("accounting_document_id", documentId)
          .in("event_type", [
            "provider_missing_observed",
            "provider_missing_confirmed",
            "revision_refresh_failed",
          ])
          .order("occurred_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [], error: null }),
    documentId && params.hasActiveWork === undefined
      ? db.from("organization_accounting_sync_jobs")
          .select("id")
          .eq("organization_id", params.organizationId)
          .in("job_kind", [
            "xero.payment_claim.initial_push",
            "xero.payment_claim.replacement",
            "xero.payment_claim.accounting_update",
            "xero.sales_invoice.sync",
          ])
          .in("queue_state", ["pending", "claimed", "retry_scheduled"])
          .eq("request_payload->>accountingDocumentId", documentId)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    activeRevisionId
      ? db.from("organization_accounting_remote_observations")
          .select(
            "id, raw_observation, content_hash, settlement_hash, raw_status,"
            + " observed_at",
          )
          .eq("organization_id", params.organizationId)
          .eq("accounting_revision_id", activeRevisionId)
          .order("observed_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const queryError = [
    revisionResult.error,
    projectionResult.error,
    revisionsResult.error,
    eventsResult.error,
    jobsResult.error,
    latestObservationResult.error,
  ].find(Boolean);
  if (queryError) throw new Error(queryError.message);
  const revision = revisionResult.data as Row | null;
  const confirmationPreviewHash = text(revision?.confirmation_preview_hash);
  const proposalResult = confirmationPreviewHash
    ? await db.from("organization_accounting_push_proposals")
        .select("source_optimistic_revision")
        .eq("organization_id", params.organizationId)
        .eq("source_document_type", "project_claim")
        .eq("preview_hash", confirmationPreviewHash)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };
  if (proposalResult.error) throw new Error(proposalResult.error.message);
  return {
    revision,
    projection: projectionResult.data as Row | null,
    revisions: (revisionsResult.data ?? []) as Row[],
    events: (eventsResult.data ?? []) as Row[],
    latestObservation: latestObservationResult.data as Row | null,
    sourceOptimisticRevision:
      text(proposalResult.data?.source_optimistic_revision),
    hasActiveWork:
      params.hasActiveWork ?? (jobsResult.data ?? []).length > 0,
  };
}

export async function resolvePaymentClaimAccountingOperationForState(params: {
  organizationId: string;
  claimNumber: string;
  readiness: PaymentClaimXeroReadinessResult;
  currentHash: string | null;
  document: Row | null;
  connection: Row | null;
  hasPushPermission: boolean;
  featureEnabled: boolean;
  hasActiveWork?: boolean;
  evidence?: PaymentClaimAccountingDecisionEvidence;
}): Promise<PaymentClaimAccountingDecision> {
  const evidence = params.evidence
    ?? await loadPaymentClaimAccountingDecisionEvidence({
      organizationId: params.organizationId,
      document: params.document,
      hasActiveWork: params.hasActiveWork,
    });
  const revision = evidence.revision;
  const projection = evidence.projection;
  const revisions = evidence.revisions;
  const observation = object(evidence.latestObservation?.raw_observation);
  const latestObservationAt = Date.parse(
    text(evidence.latestObservation?.observed_at) ?? "",
  );
  const missingObserved = evidence.events.some((event) =>
    event.event_type === "provider_missing_observed"
    && (
      !Number.isFinite(latestObservationAt)
      || Date.parse(text(event.occurred_at) ?? "") > latestObservationAt
    ),
  );
  const amountPaidMinor = projection?.amount_paid_minor == null
    ? Math.round(number(params.document?.amount_paid) * 100)
    : number(projection.amount_paid_minor);
  const amountDueMinor = projection?.amount_due_minor == null
    ? Math.round(number(params.document?.amount_due) * 100)
    : number(projection.amount_due_minor);
  const amountCreditedMinor = projection?.amount_credited_minor == null
    ? Math.round(number(params.document?.amount_credited) * 100)
    : number(projection.amount_credited_minor);
  const claimNumber = params.claimNumber.trim();
  const replacementNumber = nextPaymentClaimReplacementNumber(
    claimNumber,
    revisions
      .map((revision) => text(revision.external_document_number))
      .filter((invoiceNumber): invoiceNumber is string => Boolean(invoiceNumber)),
  );
  const connectionId = text(params.connection?.id);
  const tenantId = text(params.connection?.tenant_id);
  const documentConnectionId = text(params.document?.accounting_connection_id);
  const documentTenantId = text(params.document?.tenant_id);
  const activeHash = text(object(revision?.commercial_snapshot).currentStateHash);
  const legacyAdoptionEligible = Boolean(
    params.document
    && params.document.integration_contract !== "payment_claim_revision_v1"
    && !revision
    && text(params.document.external_document_id)
    && text(params.document.external_document_number)
    && (
      text(projection?.normalized_invoice_status)
        ?? text(params.document.normalized_external_status)
    ) === "voided",
  );

  const decision = resolvePaymentClaimAccountingOperation({
    featureEnabled: params.featureEnabled,
    hasPushPermission: params.hasPushPermission,
    readinessReady: params.readiness.ready,
    readinessMessage: params.readiness.blockers[0]?.message,
    hasActiveWork: evidence.hasActiveWork,
    hasStableDocument: Boolean(params.document),
    hasActiveRevision: Boolean(revision),
    legacyAdoptionEligible,
    activeRevisionIntent: revision?.revision_intent === "initial_push"
      ? "initial_push"
      : revision?.revision_intent === "replacement"
        ? "replacement"
        : revision ? "other" : null,
    activeInvoiceId: text(revision?.external_document_id) ?? text(params.document?.external_document_id),
    activeInvoiceNumber: text(revision?.external_document_number) ?? text(params.document?.external_document_number),
    replacementNumber,
    connectionMatches: !params.document || documentConnectionId === connectionId,
    tenantMatches: !params.document || documentTenantId === tenantId,
    hasInvoiceScope: hasXeroInvoiceScope(
      Array.isArray(params.connection?.scope) ? params.connection.scope as string[] : [],
    ),
    providerAvailable: !text(params.document?.last_status_sync_error)
      || text(params.document?.last_status_sync_error)?.includes("voided") === true
      || text(params.document?.last_status_sync_error)?.includes("could not be found") === true,
    providerState: providerState({
      document: params.document,
      projection,
      missingObserved,
      permanentlyMissing: evidence.events.some(
        (event) => event.event_type === "provider_missing_confirmed",
      ),
    }),
    amountPaidMinor,
    amountDueMinor,
    amountCreditedMinor,
    hasPayments: array(observation.Payments).length > 0,
    hasCredits: array(observation.CreditNotes).length > 0,
    financialDivergence: amountPaidMinor < 0
      || amountDueMinor < 0
      || amountCreditedMinor < 0,
    contentDivergence: projection?.divergent === true,
    claimChangedAfterExport: Boolean(activeHash && params.currentHash && activeHash !== params.currentHash),
    futureAccountingUpdateEnabled: true,
  });
  const observationRow = evidence.latestObservation;
  return {
    ...decision,
    latestObservationId: text(observationRow?.id),
    predecessorObservationHash: observationRow
      ? hashAccountingEvidence({
          id: observationRow.id,
          contentHash: observationRow.content_hash,
          settlementHash: observationRow.settlement_hash,
          rawStatus: observationRow.raw_status,
          observedAt: observationRow.observed_at,
        })
      : null,
  };
}
