import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { normalizeXeroBillState, parseXeroDate } from "@/lib/xero/bill-status";
import { getXeroInvoice, XeroRequestError } from "@/lib/xero/client";
import { getFreshXeroAccessToken, getOrganizationXeroConnection } from "@/lib/xero/service";

type UntypedSupabase = SupabaseClient<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type AccountingDocumentRow = {
  id: string;
  organization_id: string;
  accounting_connection_id: string;
  current_version_id: string | null;
  provider: string;
  tenant_id: string;
  local_document_id: string;
  external_document_id: string | null;
  external_document_number: string | null;
  export_status: string;
  amount_exported: number | null;
  normalized_external_status: string | null;
  provider_updated_at: string | null;
};

type RefreshJobRow = {
  id: string;
  queue_state: string;
  request_payload: Record<string, unknown>;
};

export class XeroBillRefreshError extends Error {
  isRetryable: boolean;
  safeMessage: string;

  constructor(message: string, options?: { isRetryable?: boolean; safeMessage?: string }) {
    super(message);
    this.name = "XeroBillRefreshError";
    this.isRetryable = options?.isRetryable ?? false;
    this.safeMessage = options?.safeMessage ?? message;
  }
}

function db(client: SupabaseClient<Database>) {
  return client as unknown as UntypedSupabase;
}

function safeProviderError(error: unknown) {
  if (error instanceof XeroRequestError) {
    if (error.status === 404) return "The Xero Bill could not be found in the connected organization.";
    if (error.status === 429) return "Xero is temporarily rate limiting Bill status refreshes.";
    if (error.status === 401 || error.status === 403) return "Xero authorization must be restored before Bill status can refresh.";
  }
  if (error instanceof XeroBillRefreshError) return error.safeMessage;
  return "Unable to refresh the Xero Bill status right now.";
}

async function loadAccountingDocument(
  admin: SupabaseClient<Database>,
  organizationId: string,
  documentId: string,
) {
  const result = await db(admin)
    .from("organization_accounting_documents")
    .select("id, organization_id, accounting_connection_id, current_version_id, provider, tenant_id, local_document_id, external_document_id, external_document_number, export_status, amount_exported, normalized_external_status, provider_updated_at")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();
  if (result.error) throw new XeroBillRefreshError("Unable to load the accounting document.");
  if (!result.data) throw new XeroBillRefreshError("Accounting document not found.");
  return result.data as AccountingDocumentRow;
}

export async function recordXeroBillStatusRefreshError(params: {
  organizationId: string;
  documentId: string;
  workerJobId: string;
  error: unknown;
}) {
  const admin = await createAdminSupabaseClient();
  const safeMessage = safeProviderError(params.error);
  await db(admin).rpc("record_xero_bill_status_sync_error", {
    p_organization_id: params.organizationId,
    p_document_id: params.documentId,
    p_safe_error: safeMessage,
    p_job_id: params.workerJobId,
  });
  return safeMessage;
}

export async function refreshXeroBillStatus(params: {
  organizationId: string;
  documentId: string;
  workerJobId: string;
}) {
  const admin = await createAdminSupabaseClient();
  const document = await loadAccountingDocument(admin, params.organizationId, params.documentId);
  if (document.provider !== "xero" || !document.external_document_id) {
    throw new XeroBillRefreshError("The accounting document does not have a refreshable Xero Bill identity.");
  }

  const tokenState = await getFreshXeroAccessToken(params.organizationId);
  if (
    tokenState.connection.id !== document.accounting_connection_id
    || tokenState.connection.tenant_id !== document.tenant_id
  ) {
    throw new XeroBillRefreshError("The current Xero connection does not match the exported Bill.");
  }

  const invoices = await getXeroInvoice(
    tokenState.tokenSet.access_token,
    document.tenant_id,
    document.external_document_id,
  );
  const invoice = invoices[0];
  if (!invoice || invoice.InvoiceID !== document.external_document_id || invoice.Type !== "ACCPAY") {
    throw new XeroBillRefreshError("Xero returned an invalid Bill identity.");
  }

  const state = normalizeXeroBillState(invoice);
  if (
    document.amount_exported !== null
    && Math.abs(state.total - Number(document.amount_exported)) > 0.01
  ) {
    throw new XeroBillRefreshError("The Xero Bill total no longer matches the exported TradesStack amount.");
  }

  const syncedAt = new Date().toISOString();
  const providerUpdatedAt = parseXeroDate(invoice.UpdatedDateUTC);
  const fullyPaidAt = parseXeroDate(invoice.FullyPaidOnDate);
  const applyResult = await db(admin).rpc("apply_xero_bill_status_refresh", {
    p_organization_id: params.organizationId,
    p_document_id: document.id,
    p_expected_tenant_id: document.tenant_id,
    p_expected_external_document_id: document.external_document_id,
    p_raw_external_status: state.rawStatus,
    p_normalized_external_status: state.normalizedStatus,
    p_amount_paid: state.amountPaid,
    p_amount_due: state.amountDue,
    p_amount_credited: state.amountCredited,
    p_fully_paid_at: fullyPaidAt,
    p_provider_updated_at: providerUpdatedAt,
    p_synced_at: syncedAt,
    p_job_id: params.workerJobId,
  });
  if (applyResult.error) {
    throw new XeroBillRefreshError("Unable to persist the refreshed Xero Bill status.");
  }
  const applied = (applyResult.data ?? {}) as Record<string, unknown>;

  return {
    documentId: document.id,
    externalDocumentId: document.external_document_id,
    externalDocumentNumber: document.external_document_number,
    rawStatus: state.rawStatus,
    normalizedStatus: state.normalizedStatus,
    amountPaid: state.amountPaid,
    amountDue: state.amountDue,
    amountCredited: state.amountCredited,
    fullyPaidAt,
    providerUpdatedAt,
    syncedAt,
    changed: applied.changed === true,
    stale: applied.stale === true,
  };
}

export async function enqueueXeroBillRefresh(params: {
  organizationId: string;
  documentId: string;
  createdByUserId: string | null;
  triggerSource: "manual_refresh" | "scheduled";
}) {
  const admin = await createAdminSupabaseClient();
  const document = await loadAccountingDocument(admin, params.organizationId, params.documentId);
  if (document.provider !== "xero" || !document.external_document_id || !document.current_version_id) {
    throw new XeroBillRefreshError("The accounting document is not ready for Xero status refresh.");
  }
  const connection = await getOrganizationXeroConnection(params.organizationId);
  if (
    !connection
    || connection.status !== "connected"
    || connection.id !== document.accounting_connection_id
    || connection.tenant_id !== document.tenant_id
  ) {
    throw new XeroBillRefreshError("The current Xero connection does not match the exported Bill.");
  }

  const activeResult = await db(admin)
    .from("organization_accounting_sync_jobs")
    .select("id, queue_state, request_payload")
    .eq("organization_id", params.organizationId)
    .eq("provider", "xero")
    .eq("job_kind", "xero.bill.refresh")
    .in("queue_state", ["pending", "claimed", "retry_scheduled"])
    .order("created_at", { ascending: false });
  if (activeResult.error) throw new XeroBillRefreshError("Unable to inspect active Xero Bill refresh jobs.");
  const existing = ((activeResult.data ?? []) as RefreshJobRow[]).find(
    (job) => job.request_payload.documentId === document.id,
  );
  if (existing) {
    return { jobId: existing.id, documentId: document.id, currentStatus: existing.queue_state, created: false };
  }

  const payload = {
    documentId: document.id,
    documentVersionId: document.current_version_id,
    supplierInvoiceId: document.local_document_id,
  };
  const insertResult = await db(admin)
    .from("organization_accounting_sync_jobs")
    .insert({
      organization_id: params.organizationId,
      provider: "xero",
      connection_id: document.accounting_connection_id,
      job_kind: "xero.bill.refresh",
      trigger_source: params.triggerSource,
      request_payload: payload,
      result_summary: {},
      idempotency_key: null,
      created_by_user_id: params.createdByUserId,
    })
    .select("id, queue_state")
    .single();
  if (!insertResult.error && insertResult.data) {
    return {
      jobId: String(insertResult.data.id),
      documentId: document.id,
      currentStatus: String(insertResult.data.queue_state),
      created: true,
    };
  }

  const racedResult = await db(admin)
    .from("organization_accounting_sync_jobs")
    .select("id, queue_state, request_payload")
    .eq("organization_id", params.organizationId)
    .eq("provider", "xero")
    .eq("job_kind", "xero.bill.refresh")
    .in("queue_state", ["pending", "claimed", "retry_scheduled"])
    .order("created_at", { ascending: false });
  const raced = ((racedResult.data ?? []) as RefreshJobRow[]).find(
    (job) => job.request_payload.documentId === document.id,
  );
  if (!raced) throw new XeroBillRefreshError("Unable to queue the Xero Bill status refresh.");
  return { jobId: raced.id, documentId: document.id, currentStatus: raced.queue_state, created: false };
}

export async function enqueueEligibleXeroBillRefreshes(params?: { limit?: number }) {
  const admin = await createAdminSupabaseClient();
  const limit = Math.max(1, Math.min(params?.limit ?? 25, 100));
  const documentsResult = await db(admin)
    .from("organization_accounting_documents")
    .select("id, organization_id")
    .eq("provider", "xero")
    .eq("export_status", "exported")
    .not("external_document_id", "is", null)
    .or("normalized_external_status.is.null,normalized_external_status.not.in.(paid,voided,deleted)")
    .order("last_status_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (documentsResult.error) throw new XeroBillRefreshError("Unable to load Xero Bills eligible for refresh.");

  const jobs = [];
  for (const row of (documentsResult.data ?? []) as Array<{ id: string; organization_id: string }>) {
    try {
      jobs.push(await enqueueXeroBillRefresh({
        organizationId: row.organization_id,
        documentId: row.id,
        createdByUserId: null,
        triggerSource: "scheduled",
      }));
    } catch {
      // A disconnected or replaced tenant is skipped without blocking other organizations.
    }
  }
  return jobs;
}
