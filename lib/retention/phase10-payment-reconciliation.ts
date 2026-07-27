import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  allocatePaidRetentionByLargestRemainder,
} from "@/lib/retention/phase10-payment-attribution";

type Row = Record<string, unknown>;
type Client = {
  // Phase 10 RPCs and tables intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type RetentionClaimPaymentState = {
  visible: boolean;
  canManage: boolean;
  subtotalExclTax: number;
  latestReconciliationId: string | null;
  latestSource: "manual" | "xero" | null;
  latestStatus:
    | "unpaid"
    | "partially_paid"
    | "paid"
    | "attention_required"
    | null;
  currentPaidAmount: number;
  currentOutstandingAmount: number;
  attentionMessage: string | null;
  reconciledAt: string | null;
  attributions: Array<{
    allocationId: string;
    originatingPaymentClaimId: string;
    sequence: number;
    paidAmount: number;
  }>;
  accountingDocumentId: string | null;
  externalInvoiceId: string | null;
  refreshInProgress: boolean;
};

type RpcState = {
  succeeded?: boolean;
  errorCode?: string;
  actorUserId?: string;
  organizationId?: string;
  projectId?: string;
  retentionClaimId?: string;
  subtotalExclTax?: number;
  latestReconciliation?: Row | null;
  currentAppliedReconciliation?: Row | null;
  attributions?: Row[];
};

function db(client: unknown) {
  return client as Client;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
  admin = false,
) {
  const client = db(
    admin
      ? await createAdminSupabaseClient()
      : await createServerSupabaseClient(),
  );
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? {}) as RpcState & {
    succeeded?: boolean;
    errorCode?: string;
    jobId?: string;
    createdJob?: boolean;
  };
}

export async function getRetentionClaimPaymentState(
  retentionClaimId: string,
): Promise<RetentionClaimPaymentState> {
  const result = await rpc("get_retention_claim_payment_state", {
    p_retention_claim_id: retentionClaimId,
  });
  if (!result.succeeded) {
    return {
      visible: false,
      canManage: false,
      subtotalExclTax: 0,
      latestReconciliationId: null,
      latestSource: null,
      latestStatus: null,
      currentPaidAmount: 0,
      currentOutstandingAmount: 0,
      attentionMessage: null,
      reconciledAt: null,
      attributions: [],
      accountingDocumentId: null,
      externalInvoiceId: null,
      refreshInProgress: false,
    };
  }
  const manage = await rpc("get_retention_claim_payment_manage_access", {
    p_retention_claim_id: retentionClaimId,
  });
  const admin = db(await createAdminSupabaseClient());
  const document = await admin.from("organization_accounting_documents")
    .select("*")
    .eq("organization_id", result.organizationId)
    .eq("provider", "xero")
    .eq("local_document_type", "retention_claim")
    .eq("retention_claim_id", retentionClaimId)
    .maybeSingle();
  if (document.error) throw new Error(document.error.message);
  const documentRow = document.data as Row | null;
  let refreshInProgress = false;
  if (documentRow) {
    const jobs = await admin.from("organization_accounting_sync_jobs")
      .select("id,job_kind,queue_state,request_payload")
      .eq("organization_id", result.organizationId)
      .eq("job_kind", "xero.retention_claim.refresh")
      .in("queue_state", ["pending", "claimed", "retry_scheduled"])
      .contains("request_payload", { accountingDocumentId: documentRow.id })
      .limit(1);
    if (jobs.error) throw new Error(jobs.error.message);
    refreshInProgress = (jobs.data?.length ?? 0) > 0;
  }
  const latest = result.latestReconciliation ?? null;
  const applied = result.currentAppliedReconciliation ?? null;
  const subtotal = number(result.subtotalExclTax);
  return {
    visible: true,
    canManage: manage.succeeded === true,
    subtotalExclTax: subtotal,
    latestReconciliationId: text(latest?.id),
    latestSource: text(latest?.source) as "manual" | "xero" | null,
    latestStatus: text(latest?.payment_status) as RetentionClaimPaymentState["latestStatus"],
    currentPaidAmount: number(applied?.paid_amount_excl_tax),
    currentOutstandingAmount:
      applied ? number(applied.outstanding_amount_excl_tax) : subtotal,
    attentionMessage: text(latest?.attention_message),
    reconciledAt: text(latest?.reconciled_at),
    attributions: (result.attributions ?? []).map((row) => ({
      allocationId: String(row.retention_claim_allocation_id),
      originatingPaymentClaimId: String(row.originating_payment_claim_id),
      sequence: Number(row.allocation_sequence),
      paidAmount: Number(row.paid_amount),
    })),
    accountingDocumentId: text(documentRow?.id),
    externalInvoiceId: text(documentRow?.external_document_id),
    refreshInProgress,
  };
}

export async function recordManualRetentionClaimPayment(params: {
  retentionClaimId: string;
  paidAmount: number;
  expectedPreviousReconciliationId: string | null;
  correlationId: string;
}) {
  const access = await rpc("get_retention_claim_payment_manage_access", {
    p_retention_claim_id: params.retentionClaimId,
  });
  if (!access.succeeded || !access.actorUserId || !access.organizationId) {
    return {
      succeeded: false,
      errorCode: access.errorCode ?? "permission_denied",
    };
  }
  const admin = db(await createAdminSupabaseClient());
  const [claim, allocations] = await Promise.all([
    admin.from("retention_claims").select("*")
      .eq("organization_id", access.organizationId)
      .eq("id", params.retentionClaimId).maybeSingle(),
    admin.from("retention_claim_allocations").select("*")
      .eq("organization_id", access.organizationId)
      .eq("retention_claim_id", params.retentionClaimId)
      .order("allocation_sequence"),
  ]);
  if (claim.error || allocations.error || !claim.data) {
    throw new Error(
      claim.error?.message
      ?? allocations.error?.message
      ?? "Retention Claim not found.",
    );
  }
  const subtotal = Number(claim.data.subtotal_excl_tax);
  const paid = Math.round(params.paidAmount * 100) / 100;
  const attribution = allocatePaidRetentionByLargestRemainder({
    paidAmount: paid,
    subtotalExclTax: subtotal,
    allocations: (allocations.data ?? []).map((row: Row) => ({
      allocationId: String(row.id),
      originatingPaymentClaimId:
        String(row.originating_payment_claim_id),
      sequence: Number(row.allocation_sequence),
      allocationAmount: Number(row.allocation_amount),
    })),
  });
  const status = paid === 0
    ? "unpaid"
    : paid === subtotal
      ? "paid"
      : "partially_paid";
  const result = await rpc(
    "record_retention_claim_payment_reconciliation",
    {
      p_retention_claim_id: params.retentionClaimId,
      p_source: "manual",
      p_actor_user_id: access.actorUserId,
      p_expected_previous_reconciliation_id:
        params.expectedPreviousReconciliationId,
      p_payment_status: status,
      p_projection_applied: true,
      p_paid_amount_excl_tax: paid,
      p_invoice_total_gross: null,
      p_amount_paid_gross: null,
      p_amount_due_gross: null,
      p_amount_credited_gross: null,
      p_raw_provider_status: null,
      p_normalized_provider_status: null,
      p_fully_paid_at: null,
      p_provider_updated_at: null,
      p_accounting_document_id: null,
      p_accounting_snapshot_id: null,
      p_external_document_id: null,
      p_attention_code: null,
      p_attention_message: null,
      p_attributions: attribution,
      p_correlation_id: params.correlationId,
    },
    true,
  );
  return {
    succeeded: result.succeeded === true,
    errorCode: result.errorCode ?? null,
  };
}

export async function enqueueRetentionClaimPaymentRefresh(params: {
  retentionClaimId: string;
}) {
  const access = await rpc("get_retention_claim_payment_manage_access", {
    p_retention_claim_id: params.retentionClaimId,
  });
  if (!access.succeeded || !access.actorUserId || !access.organizationId) {
    return {
      succeeded: false,
      errorCode: access.errorCode ?? "permission_denied",
    };
  }
  const admin = db(await createAdminSupabaseClient());
  const document = await admin.from("organization_accounting_documents")
    .select("id,integration_contract")
    .eq("organization_id", access.organizationId)
    .eq("provider", "xero")
    .eq("local_document_type", "retention_claim")
    .eq("retention_claim_id", params.retentionClaimId)
    .not("external_document_id", "is", null)
    .maybeSingle();
  if (document.error || !document.data) {
    return { succeeded: false, errorCode: "accounting_document_not_found" };
  }
  if (document.data.integration_contract === "retention_claim_revision_v1") {
    return {
      succeeded: false,
      errorCode: "immutable_accounting_refresh_required",
    };
  }
  const queued = await rpc(
    "queue_retention_claim_payment_refresh",
    {
      p_accounting_document_id: document.data.id,
      p_actor_user_id: access.actorUserId,
      p_trigger_source: "manual_refresh",
    },
    true,
  );
  return {
    succeeded: queued.succeeded === true,
    errorCode: queued.errorCode ?? null,
  };
}

export async function enqueueScheduledRetentionClaimPaymentRefreshes(
  limit = 25,
) {
  const admin = db(await createAdminSupabaseClient());
  const documents = await admin.from("organization_accounting_documents")
    .select("id,integration_contract")
    .eq("provider", "xero")
    .eq("local_document_type", "retention_claim")
    .eq("export_status", "exported")
    .not("external_document_id", "is", null)
    .or(
      "normalized_external_status.is.null,"
      + "normalized_external_status.in.(awaiting_payment,partially_paid,paid,unknown)",
    )
    .order("last_status_synced_at", { ascending: true, nullsFirst: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (documents.error) throw new Error(documents.error.message);
  const queued = [];
  for (const document of documents.data ?? []) {
    if (document.integration_contract === "retention_claim_revision_v1") {
      continue;
    }
    const result = await rpc(
      "queue_retention_claim_payment_refresh",
      {
        p_accounting_document_id: document.id,
        p_actor_user_id: null,
        p_trigger_source: "scheduled",
      },
      true,
    );
    if (result.succeeded) queued.push(result);
  }
  return queued;
}
