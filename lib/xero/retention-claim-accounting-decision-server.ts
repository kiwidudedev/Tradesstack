import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import { hasXeroInvoiceScope } from "@/lib/xero/scopes";
import {
  nextRetentionClaimReplacementNumber,
  resolveRetentionClaimAccountingOperation,
  type RetentionClaimAccountingDecision,
  type RetentionClaimProviderState,
} from "@/lib/xero/retention-claim-accounting-decision";

type Row = Record<string, unknown>;
type Db = {
  // Phase 2C objects intentionally precede generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function db() {
  return createAdminSupabaseClient() as unknown as Db;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function providerState(params: {
  document: Row | null;
  projection: Row | null;
  permanentlyMissing: boolean;
}): RetentionClaimProviderState {
  if (!params.document) return "not_exported";
  if (params.permanentlyMissing) return "missing_confirmed";
  const status = text(params.projection?.normalized_invoice_status)
    ?? text(params.document.normalized_external_status);
  if (status === "voided") return "voided";
  if (status === "deleted") return "deleted";
  if (status === "paid") return "paid";
  if (status === "partially_paid") return "partially_paid";
  if (status === "authorised" || status === "awaiting_payment") return "authorised";
  if (text(params.document.last_status_sync_error)?.includes("could not be found")) {
    return "missing_unconfirmed";
  }
  return text(params.document.external_document_id) ? "unknown" : "not_exported";
}

export async function resolveRetentionClaimAccountingOperationForState(params: {
  organizationId: string;
  claimNumber: string;
  sourceStateHash: string;
  issueDate?: string | null;
  dueDate?: string | null;
  readinessReady: boolean;
  readinessMessage?: string | null;
  retentionOwnershipValid: boolean;
  retentionOwnershipMessage?: string | null;
  document: Row | null;
  connection: Row | null;
  hasPushPermission: boolean;
  featureEnabled: boolean;
  hasActiveFinancialWork?: boolean;
  hasUncertainFinancialResult?: boolean;
}): Promise<RetentionClaimAccountingDecision & {
  activeRevisionId: string | null;
  activeRevisionInvoiceId: string | null;
  activeRevisionInvoiceNumber: string | null;
  latestObservationId: string | null;
  projectionId: string | null;
  predecessorObservationHash: string | null;
  nextRevisionSequence: number;
  financialChangedAfterExport: boolean;
  dateChangedAfterExport: boolean;
  decisionEvidence: {
    revision: Row | null;
    projection: Row | null;
    latestObservation: Row | null;
    activeJobs: Row[];
  };
}> {
  const admin = db();
  const documentId = text(params.document?.id);
  const activeRevisionId = text(params.document?.active_accounting_revision_id);
  const [revisionResult, projectionResult, revisionsResult, observationResult, jobResult, eventsResult] =
    await Promise.all([
      activeRevisionId
        ? admin.from("organization_accounting_document_revisions").select("*")
            .eq("organization_id", params.organizationId)
            .eq("id", activeRevisionId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      documentId
        ? admin.from("organization_accounting_projections").select("*")
            .eq("organization_id", params.organizationId)
            .eq("accounting_document_id", documentId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      documentId
        ? admin.from("organization_accounting_document_revisions")
            .select("id,external_document_number,revision_sequence")
            .eq("organization_id", params.organizationId)
            .eq("accounting_document_id", documentId)
        : Promise.resolve({ data: [], error: null }),
      activeRevisionId
        ? admin.from("organization_accounting_remote_observations")
            .select("*")
            .eq("organization_id", params.organizationId)
            .eq("accounting_revision_id", activeRevisionId)
            .order("observed_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      documentId && params.hasActiveFinancialWork === undefined
        ? admin.from("organization_accounting_sync_jobs")
            .select("id,job_kind,queue_state,request_payload")
            .eq("organization_id", params.organizationId)
            .in("job_kind", [
              "xero.retention_claim.initial_push",
              "xero.retention_claim.update",
              "xero.retention_claim.replacement",
              "xero.retention_claim.sync",
            ])
            .in("queue_state", ["pending", "claimed", "retry_scheduled"])
            .eq("request_payload->>accountingDocumentId", documentId)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
      documentId
        ? admin.from("organization_accounting_events")
            .select("event_type,occurred_at")
            .eq("organization_id", params.organizationId)
            .eq("accounting_document_id", documentId)
            .eq("event_type", "provider_missing_confirmed")
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const queryError = [
    revisionResult.error,
    projectionResult.error,
    revisionsResult.error,
    observationResult.error,
    jobResult.error,
    eventsResult.error,
  ].find(Boolean);
  if (queryError) throw new Error(queryError.message);

  const revision = revisionResult.data as Row | null;
  const projection = projectionResult.data as Row | null;
  const observationRow = observationResult.data as Row | null;
  const observation = object(observationRow?.raw_observation);
  const observedAtMs = Date.parse(String(observationRow?.observed_at ?? ""));
  const observationIsRecent = Number.isFinite(observedAtMs)
    && observedAtMs >= Date.now() - 24 * 60 * 60 * 1000;
  const historicalNumbers = (revisionsResult.data ?? [])
    .map((row: Row) => text(row.external_document_number))
    .filter((value: string | null): value is string => Boolean(value));
  const revisionIds = (revisionsResult.data ?? [])
    .map((row: Row) => text(row.id))
    .filter((value: string | null): value is string => Boolean(value));
  const uncertainResult =
    params.hasUncertainFinancialResult === undefined && revisionIds.length > 0
      ? await admin.from("organization_accounting_revision_attempts")
          .select("id,accounting_revision_id,outcome_code")
          .in("accounting_revision_id", revisionIds)
          .in("attempt_intent", ["create", "update", "replace"])
          .eq("queue_state", "attention_required")
          .limit(1)
      : { data: [], error: null };
  if (uncertainResult.error) throw new Error(uncertainResult.error.message);
  const replacementNumber = nextRetentionClaimReplacementNumber(
    params.claimNumber,
    historicalNumbers,
  );
  const connectionId = text(params.connection?.id);
  const tenantId = text(params.connection?.tenant_id);
  const activeHash = text(object(revision?.commercial_snapshot).currentStateHash);
  const revisionCommercial = object(revision?.commercial_snapshot);
  const revisionPayload = object(revision?.payload_snapshot);
  const activeIssueDate = text(revisionCommercial.issueDate)
    ?? text(revisionPayload.Date);
  const activeDueDate = text(revisionCommercial.dueDate)
    ?? text(revisionPayload.DueDate);
  const dateChangedAfterExport = Boolean(
    revision
    && (
      (params.issueDate && params.issueDate !== activeIssueDate)
      || (params.dueDate && params.dueDate !== activeDueDate)
    ),
  );
  const legacyAdoptionEligible = Boolean(
    params.document
    && params.document.integration_contract !== "retention_claim_revision_v1"
    && !revision
    && text(params.document.external_document_id)
    && text(params.document.external_document_number)
    && ["voided", "deleted"].includes(
      text(projection?.normalized_invoice_status)
      ?? text(params.document.normalized_external_status)
      ?? "",
    ),
  );
  const decision = resolveRetentionClaimAccountingOperation({
    featureEnabled: params.featureEnabled,
    hasPushPermission: params.hasPushPermission,
    readinessReady: params.readinessReady,
    readinessMessage: params.readinessMessage,
    retentionOwnershipValid: params.retentionOwnershipValid,
    retentionOwnershipMessage: params.retentionOwnershipMessage,
    hasActiveFinancialWork:
      params.hasActiveFinancialWork ?? (jobResult.data ?? []).length > 0,
    hasUncertainFinancialResult:
      params.hasUncertainFinancialResult ?? (uncertainResult.data ?? []).length > 0,
    hasStableDocument: Boolean(params.document),
    hasActiveRevision: Boolean(revision),
    legacyAdoptionEligible,
    activeInvoiceId: text(revision?.external_document_id)
      ?? text(params.document?.external_document_id),
    activeInvoiceNumber: text(revision?.external_document_number)
      ?? text(params.document?.external_document_number),
    replacementNumber,
    connectionMatches: !params.document
      || text(params.document.accounting_connection_id) === connectionId,
    tenantMatches: !params.document
      || text(params.document.tenant_id) === tenantId,
    hasInvoiceScope: hasXeroInvoiceScope(
      Array.isArray(params.connection?.scope) ? params.connection.scope as string[] : [],
    ),
    providerAvailable: Boolean(params.connection)
      && !["disconnected", "attention_required"].includes(
        text(params.connection?.status) ?? "",
      )
      && (!activeRevisionId || observationIsRecent),
    providerState: providerState({
      document: params.document,
      projection,
      permanentlyMissing: (eventsResult.data ?? []).length > 0,
    }),
    amountPaidMinor: projection?.amount_paid_minor == null
      ? Math.round(number(params.document?.amount_paid) * 100)
      : number(projection.amount_paid_minor),
    amountDueMinor: projection?.amount_due_minor == null
      ? Math.round(number(params.document?.amount_due) * 100)
      : number(projection.amount_due_minor),
    amountCreditedMinor: projection?.amount_credited_minor == null
      ? Math.round(number(params.document?.amount_credited) * 100)
      : number(projection.amount_credited_minor),
    hasPayments: array(observation.Payments).length > 0,
    hasCredits: array(observation.CreditNotes).length > 0,
    financialDivergence: number(projection?.amount_paid_minor) < 0
      || number(projection?.amount_due_minor) < 0
      || number(projection?.amount_credited_minor) < 0,
    contentDivergence: projection?.divergent === true,
    claimChangedAfterExport: Boolean(
      activeHash && params.sourceStateHash && activeHash !== params.sourceStateHash,
    ) || dateChangedAfterExport,
    canRefresh: Boolean(
      text(revision?.external_document_id)
      ?? text(params.document?.external_document_id),
    ) && Boolean(params.connection),
  });
  return {
    ...decision,
    activeRevisionId,
    activeRevisionInvoiceId: text(revision?.external_document_id),
    activeRevisionInvoiceNumber: text(revision?.external_document_number),
    latestObservationId: text(observationRow?.id),
    projectionId: text(projection?.id),
    predecessorObservationHash: observationRow
      ? hashAccountingEvidence({
          id: observationRow.id,
          contentHash: observationRow.content_hash,
          settlementHash: observationRow.settlement_hash,
          rawStatus: observationRow.raw_status,
          observedAt: observationRow.observed_at,
        })
      : null,
    financialChangedAfterExport: Boolean(
      activeHash && params.sourceStateHash && activeHash !== params.sourceStateHash,
    ),
    dateChangedAfterExport,
    nextRevisionSequence: Math.max(
      0,
      ...(revisionsResult.data ?? []).map(
        (row: Row) => number(row.revision_sequence),
      ),
    ) + 1,
    decisionEvidence: {
      revision,
      projection,
      latestObservation: observationRow,
      activeJobs: (jobResult.data ?? []) as Row[],
    },
  };
}
