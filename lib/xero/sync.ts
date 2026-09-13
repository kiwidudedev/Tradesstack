import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { XeroActionTiming } from "@/lib/xero/action-performance";
import { shouldXeroFailureAffectConnectionHealth } from "@/lib/xero/job-report";
import { getXeroAccounts, getXeroTaxRates, listXeroConnections, XeroRequestError } from "@/lib/xero/client";
import {
  exportPreparedXeroDraftBill,
  markXeroBillAttentionRequired,
  markXeroBillFailed,
} from "@/lib/xero/bills";
import { importXeroContacts } from "@/lib/xero/contacts";
import {
  recordXeroBillStatusRefreshError,
  refreshXeroBillStatus,
  XeroBillRefreshError,
} from "@/lib/xero/bill-refresh";
import {
  createInitialXeroSalesInvoice,
  InitialXeroSalesInvoiceCreateError,
} from "@/lib/xero/payment-claim-sales-invoice-create";
import {
  ExistingXeroSalesInvoiceUpdateError,
  updateExistingXeroSalesInvoice,
} from "@/lib/xero/payment-claim-sales-invoice-update";
import {
  recordXeroSalesInvoiceRefreshError,
  refreshXeroSalesInvoiceStatus,
  XeroSalesInvoiceRefreshError,
} from "@/lib/xero/payment-claim-sales-invoice-refresh";
import { XERO_SALES_INVOICE_DOCUMENT_ONLY_REFRESH_ERRORS } from "@/lib/xero/payment-claim-sales-invoice-refresh-contract";
import {
  attachPaymentClaimPdfToXeroSalesInvoice,
  enqueueXeroSalesInvoiceAttachment,
  recordXeroSalesInvoiceAttachmentError,
  XeroSalesInvoiceAttachmentError,
} from "@/lib/xero/payment-claim-sales-invoice-attachment";
import { selectPaymentClaimSalesInvoiceSyncMode } from "@/lib/xero/payment-claim-sales-invoice-job-routing";
import {
  executePaymentClaimInitialPush,
  executePaymentClaimInitialPushAttachment,
  PaymentClaimInitialPushWorkerError,
} from "@/lib/xero/payment-claim-initial-push-worker";
import {
  executePaymentClaimReplacement,
  PaymentClaimReplacementWorkerError,
} from "@/lib/xero/payment-claim-replacement-worker";
import {
  createRetentionClaimXeroSalesInvoice,
  recordRetentionClaimXeroCreateError,
  RetentionClaimXeroCreateError,
} from "@/lib/xero/retention-claim-sales-invoice-create";
import {
  attachRetentionClaimPdfToXeroInvoice,
  queueRetentionClaimXeroAttachmentForWorker,
  recordRetentionClaimXeroAttachmentError,
  RetentionClaimXeroAttachmentError,
} from "@/lib/xero/retention-claim-sales-invoice-attachment";
import {
  recordRetentionClaimPaymentRefreshError,
  refreshRetentionClaimPaymentFromXero,
  RetentionClaimPaymentRefreshError,
} from "@/lib/xero/retention-claim-payment-refresh";
import {
  executeRetentionClaimPush,
  executeRetentionClaimPushAttachment,
  RetentionClaimPushWorkerError,
} from "@/lib/xero/retention-claim-push-worker";
import {
  executeRetentionClaimUpdate,
  RetentionClaimUpdateWorkerError,
} from "@/lib/xero/retention-claim-update-worker";
import {
  executePaymentClaimAccountingUpdate,
  PaymentClaimAccountingUpdateWorkerError,
} from "@/lib/xero/payment-claim-accounting-update-worker";
import {
  recordRetentionClaimRevisionRefreshError,
  refreshRetentionClaimRevisionFromXero,
  RetentionClaimRevisionRefreshError,
} from "@/lib/xero/retention-claim-revision-refresh";
import { getFreshXeroAccessToken, getOrganizationXeroConnection } from "@/lib/xero/service";
import type { XeroAccount, XeroTaxRate } from "@/lib/xero/types";
import {
  loadAccountingSyncCompletionEvidence,
} from "@/lib/xero/accounting-sync-completion-evidence";

type SyncJobRow = {
  id: string;
  organization_id: string;
  provider: "xero";
  connection_id: string | null;
  job_kind:
    | "import_accounts"
    | "import_tax_rates"
    | "import_contacts"
    | "health_check"
    | "xero.bill.export"
    | "xero.bill.refresh"
    | "xero.sales_invoice.sync"
    | "xero.sales_invoice.refresh"
    | "xero.sales_invoice.attachment"
    | "xero.retention_claim.sync"
    | "xero.retention_claim.attachment"
    | "xero.retention_claim.refresh"
    | "xero.retention_claim.initial_push"
    | "xero.retention_claim.initial_push.attachment"
    | "xero.retention_claim.update"
    | "xero.retention_claim.replacement"
    | "xero.retention_claim.replacement.attachment"
    | "xero.payment_claim.initial_push"
    | "xero.payment_claim.initial_push.attachment"
    | "xero.payment_claim.replacement"
    | "xero.payment_claim.replacement.attachment"
    | "xero.payment_claim.accounting_update";
  trigger_source:
    | "oauth_callback"
    | "tenant_selection"
    | "manual_refresh"
    | "scheduled"
    | "health_poll"
    | "user_export"
    | "user_retry";
  queue_state: "pending" | "claimed" | "retry_scheduled" | "completed" | "dead_lettered";
  request_payload: Record<string, unknown>;
  result_summary: Record<string, unknown>;
  idempotency_key: string | null;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  retry_after: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  claim_expires_at: string | null;
  last_completed_at: string | null;
  last_error: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type TaxRateUpsert = {
  organization_id: string;
  provider: "xero";
  external_id: string;
  name: string;
  display_name: string | null;
  effective_rate: number | null;
  tax_type: string | null;
  status: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
};

class XeroSyncError extends Error {
  isRetryable: boolean;
  requiresAttention: boolean;
  affectsConnectionHealth: boolean;

  constructor(message: string, options?: {
    isRetryable?: boolean;
    requiresAttention?: boolean;
    affectsConnectionHealth?: boolean;
  }) {
    super(message);
    this.name = "XeroSyncError";
    this.isRetryable = options?.isRetryable ?? false;
    this.requiresAttention = options?.requiresAttention ?? false;
    this.affectsConnectionHealth = options?.affectsConnectionHealth
      ?? /invalid[_ ]grant|refresh token|revoked|unauthori[sz]ed|tenant (access|mismatch|denied)|http[_ ]?(401|403)/i.test(message);
  }
}

function jobFailureAffectsConnectionHealth(job: SyncJobRow, error: unknown) {
  return shouldXeroFailureAffectConnectionHealth({
    jobKind: job.job_kind,
    message: error instanceof Error ? error.message : "",
    httpStatus: error instanceof XeroRequestError ? error.status : null,
    explicitImpact: error instanceof XeroSyncError ? error.affectsConnectionHealth : null,
  });
}

function toUniqueCostCode(params: {
  existingCodes: Set<string>;
  preferredCode: string;
}) {
  const base = params.preferredCode.trim().slice(0, 120) || "xero-account";
  if (!params.existingCodes.has(base)) {
    params.existingCodes.add(base);
    return base;
  }

  let suffix = 2;
  while (true) {
    const candidate = `${base}-${suffix}`;
    if (!params.existingCodes.has(candidate)) {
      params.existingCodes.add(candidate);
      return candidate;
    }
    suffix += 1;
  }
}

function readXeroAccountString(account: XeroAccount, ...keys: Array<keyof XeroAccount>) {
  for (const key of keys) {
    const value = account[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeXeroAccountCode(account: XeroAccount) {
  const externalCode = readXeroAccountString(account, "code", "Code");
  const accountId = readXeroAccountString(account, "accountID", "AccountID");
  const name = readXeroAccountString(account, "name", "Name") ?? "Untitled account";

  if (!accountId) {
    throw new XeroSyncError("Xero account import encountered a record without AccountID.", {
      isRetryable: false,
      requiresAttention: true,
    });
  }

  return {
    accountId,
    externalCode,
    codeSeed: externalCode ?? `xero-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    name,
  };
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getAdmin() {
  return await createAdminSupabaseClient();
}

export async function enqueueOrganizationXeroSync(params: {
  organizationId: string;
  connectionId: string;
  createdByUserId: string | null;
  triggerSource: "oauth_callback" | "tenant_selection" | "manual_refresh" | "scheduled" | "health_poll";
  includeHealthCheck?: boolean;
  includeContacts?: boolean;
}) {
  const admin = await getAdmin();
  const jobKinds: Array<SyncJobRow["job_kind"]> = [
    "import_accounts",
    "import_tax_rates",
    ...(params.includeContacts ? (["import_contacts"] as const) : []),
    ...(params.includeHealthCheck ? (["health_check"] as const) : []),
  ];

  const results: SyncJobRow[] = [];
  let createdCount = 0;

  for (const jobKind of jobKinds) {
    const activeQuery = await admin
      .from("organization_accounting_sync_jobs" as never)
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .eq("job_kind", jobKind)
      .in("queue_state", ["pending", "claimed", "retry_scheduled"] as never)
      .order("created_at", { ascending: false })
      .limit(1);

    if (activeQuery.error) {
      throw new Error(activeQuery.error.message);
    }

    const existing = (activeQuery.data?.[0] ?? null) as SyncJobRow | null;
    if (existing) {
      results.push(existing);
      continue;
    }

    const insert = await admin
      .from("organization_accounting_sync_jobs" as never)
      .insert({
        organization_id: params.organizationId,
        provider: "xero",
        connection_id: params.connectionId,
        job_kind: jobKind,
        trigger_source: params.triggerSource,
        request_payload: {},
        result_summary: {},
        idempotency_key: null,
        created_by_user_id: params.createdByUserId,
      } as never)
      .select("*")
      .single();
    const insertedRow = (insert.data ?? null) as SyncJobRow | null;

    if (insert.error || !insertedRow) {
      const retryRead = await admin
        .from("organization_accounting_sync_jobs" as never)
        .select("*")
        .eq("organization_id", params.organizationId)
        .eq("provider", "xero")
        .eq("job_kind", jobKind)
        .in("queue_state", ["pending", "claimed", "retry_scheduled"] as never)
        .order("created_at", { ascending: false })
        .limit(1);

      if (retryRead.error || !retryRead.data?.[0]) {
        throw new Error(insert.error?.message ?? "Unable to enqueue the Xero sync job.");
      }

      results.push(retryRead.data[0] as SyncJobRow);
      continue;
    }

    results.push(insertedRow);
    createdCount += 1;
  }

  return {
    jobs: results,
    createdCount,
  };
}

async function importXeroAccounts(params: {
  organizationId: string;
  tenantId: string;
  accounts: XeroAccount[];
  userId: string | null;
}) {
  const admin = await getAdmin();
  const normalizedAccounts = params.accounts.filter((account) => Boolean(readXeroAccountString(account, "name", "Name")));

  const existingRowsResult = await admin
    .from("organization_cost_codes")
    .select("id, code, external_provider, external_code, metadata, is_active")
    .eq("organization_id", params.organizationId)
    .eq("external_provider", "xero");

  if (existingRowsResult.error) {
    throw new Error(existingRowsResult.error.message);
  }

  const allCodesResult = await admin
    .from("organization_cost_codes")
    .select("code")
    .eq("organization_id", params.organizationId);

  if (allCodesResult.error) {
    throw new Error(allCodesResult.error.message);
  }

  const existingXeroByAccountId = new Map<string, { id: string; code: string | null }>();
  for (const row of existingRowsResult.data ?? []) {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    const accountId = typeof metadata?.accountId === "string" && metadata.accountId.trim() ? metadata.accountId.trim() : null;
    if (accountId) {
      existingXeroByAccountId.set(accountId, {
        id: row.id,
        code: row.code,
      });
    }
  }

  const usedCodes = new Set(
    (allCodesResult.data ?? [])
      .map((row) => (typeof row.code === "string" ? row.code.trim() : ""))
      .filter(Boolean),
  );

  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];

  for (const account of normalizedAccounts) {
    const normalized = normalizeXeroAccountCode(account);
    const existing = existingXeroByAccountId.get(normalized.accountId) ?? null;
    const code =
      existing?.code && existing.code.trim()
        ? existing.code
        : toUniqueCostCode({
            existingCodes: usedCodes,
            preferredCode: normalized.codeSeed,
          });

    const payload = {
      organization_id: params.organizationId,
      created_by: params.userId,
      code,
      name: normalized.name,
      description: readXeroAccountString(account, "description", "Description"),
      external_provider: "xero",
      external_code: normalized.externalCode,
      is_active: ((readXeroAccountString(account, "status", "Status") ?? "ACTIVE") !== "ARCHIVED")
        && ((readXeroAccountString(account, "status", "Status") ?? "ACTIVE") !== "DELETED"),
      is_default: false,
      metadata: {
        accountId: normalized.accountId,
        tenantId: params.tenantId,
        type: readXeroAccountString(account, "type", "Type"),
        status: readXeroAccountString(account, "status", "Status"),
        taxType: readXeroAccountString(account, "taxType", "TaxType"),
        class: readXeroAccountString(account, "class", "Class"),
        enablePaymentsToAccount: account.enablePaymentsToAccount ?? account.EnablePaymentsToAccount ?? null,
        showInExpenseClaims: account.showInExpenseClaims ?? account.ShowInExpenseClaims ?? null,
        reportingCode: readXeroAccountString(account, "reportingCode", "ReportingCode"),
        reportingCodeName: readXeroAccountString(account, "reportingCodeName", "ReportingCodeName"),
      },
    };

    if (existing) {
      updates.push({
        id: existing.id,
        ...payload,
      });
    } else {
      inserts.push(payload);
    }
  }

  if (updates.length > 0) {
    const updateResult = await admin
      .from("organization_cost_codes")
      .upsert(updates as never, {
        onConflict: "id",
      });

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }
  }

  if (inserts.length > 0) {
    const insertResult = await admin.from("organization_cost_codes").insert(inserts as never);

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }
  }

  return {
    importedCount: updates.length + inserts.length,
    deactivatedCount: 0,
  };
}

async function importXeroTaxRates(params: {
  organizationId: string;
  taxRates: XeroTaxRate[];
  userId: string | null;
}) {
  const admin = await getAdmin();
  const upserts: TaxRateUpsert[] = params.taxRates
    .filter((rate) => typeof rate.TaxType === "string" && rate.TaxType.trim())
    .map((rate) => ({
      organization_id: params.organizationId,
      provider: "xero",
      external_id: rate.TaxType?.trim() ?? "",
      name: typeof rate.Name === "string" && rate.Name.trim() ? rate.Name.trim() : rate.TaxType?.trim() ?? "Untitled tax rate",
      display_name: typeof rate.Name === "string" && rate.Name.trim() ? rate.Name.trim() : null,
      effective_rate: toFiniteNumber(rate.EffectiveRate ?? rate.DisplayTaxRate),
      tax_type: rate.TaxType?.trim() ?? null,
      status: typeof rate.Status === "string" && rate.Status.trim() ? rate.Status.trim() : null,
      is_active: (rate.Status ?? "ACTIVE").toUpperCase() === "ACTIVE",
      metadata: {
        displayTaxRate: toFiniteNumber(rate.DisplayTaxRate),
        canApplyToAssets: rate.CanApplyToAssets ?? null,
        canApplyToEquity: rate.CanApplyToEquity ?? null,
        canApplyToExpenses: rate.CanApplyToExpenses ?? null,
        canApplyToLiabilities: rate.CanApplyToLiabilities ?? null,
        canApplyToRevenue: rate.CanApplyToRevenue ?? null,
        taxComponents: Array.isArray(rate.TaxComponents) ? rate.TaxComponents : [],
      },
      created_by_user_id: params.userId,
    }));

  if (upserts.length === 0) {
    return { importedCount: 0 };
  }

  const upsertResult = await admin
    .from("organization_accounting_tax_rates" as never)
    .upsert(upserts as never, {
      onConflict: "organization_id,provider,external_id",
    });

  if (upsertResult.error) {
    throw new Error(upsertResult.error.message);
  }

  return {
    importedCount: upserts.length,
  };
}

async function claimNextJob(params: {
  organizationId?: string;
  jobId?: string;
  workerId: string;
}) {
  const admin = await getAdmin();
  const query = admin
    .from("organization_accounting_sync_jobs" as never)
    .select("*")
    .eq("provider", "xero")
    .in("queue_state", ["pending", "claimed", "retry_scheduled"] as never)
    .order("available_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(20);

  const organizationQuery = params.organizationId
    ? query.eq("organization_id", params.organizationId)
    : query;
  const scopedQuery = params.jobId
    ? organizationQuery.eq("id", params.jobId)
    : organizationQuery;

  const { data, error } = await scopedQuery;

  if (error) {
    throw new Error(error.message);
  }

  const now = Date.now();
  const claimUntilIso = new Date(now + 10 * 60 * 1_000).toISOString();

  for (const rawRow of data ?? []) {
    const row = rawRow as SyncJobRow;
    const retryAfterMs = row.retry_after ? Date.parse(row.retry_after) : null;
    const claimExpiresAtMs = row.claim_expires_at ? Date.parse(row.claim_expires_at) : null;

    const isEligible =
      row.queue_state === "pending"
      || (row.queue_state === "retry_scheduled" && (!retryAfterMs || retryAfterMs <= now))
      || (row.queue_state === "claimed" && (!claimExpiresAtMs || claimExpiresAtMs <= now));

    if (!isEligible) {
      continue;
    }

    const claimResult = await admin
      .from("organization_accounting_sync_jobs" as never)
      .update({
        queue_state: "claimed",
        claimed_at: new Date(now).toISOString(),
        claimed_by: params.workerId,
        claim_expires_at: claimUntilIso,
        updated_at: new Date(now).toISOString(),
      } as never)
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select("*")
      .maybeSingle();

    if (!claimResult.error && claimResult.data) {
      return claimResult.data as SyncJobRow;
    }
  }

  return null;
}

async function finalizeJob(params: {
  job: SyncJobRow;
  queueState: "completed" | "retry_scheduled" | "dead_lettered";
  resultSummary: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const admin = await getAdmin();
  const nextAttemptCount = params.job.attempt_count + (params.queueState === "completed" ? 0 : 1);
  const retryAfter =
    params.queueState === "retry_scheduled"
      ? new Date(Date.now() + 5 * 60 * 1_000).toISOString()
      : null;

  const updateResult = await admin
    .from("organization_accounting_sync_jobs" as never)
    .update({
      queue_state: params.queueState,
      attempt_count: nextAttemptCount,
      retry_after: retryAfter,
      result_summary: params.resultSummary,
      last_error: params.errorMessage ?? null,
      claimed_at: null,
      claimed_by: null,
      claim_expires_at: null,
      last_completed_at: params.queueState === "completed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", params.job.id)
    .eq("queue_state", "claimed");

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }
}

async function runClaimedJob(job: SyncJobRow) {
  if (job.job_kind === "xero.retention_claim.refresh") {
    const accountingDocumentId =
      typeof job.request_payload.accountingDocumentId === "string"
        ? job.request_payload.accountingDocumentId
        : "";
    if (!accountingDocumentId) {
      throw new XeroSyncError(
        "The Retention Claim payment refresh job payload is incomplete.",
      );
    }
    let revisionBacked =
      job.request_payload.integrationContract === "retention_claim_revision_v1";
    if (!revisionBacked) {
      const admin = await getAdmin();
      const contract = await admin
        .from("organization_accounting_documents" as never)
        .select("integration_contract")
        .eq("organization_id", job.organization_id)
        .eq("id", accountingDocumentId)
        .maybeSingle();
      const row = contract.data as { integration_contract?: string | null } | null;
      revisionBacked =
        !contract.error
        && row?.integration_contract === "retention_claim_revision_v1";
    }
    if (revisionBacked) {
      try {
        return await refreshRetentionClaimRevisionFromXero({
          organizationId: job.organization_id,
          accountingDocumentId,
          workerJobId: job.id,
        });
      } catch (error) {
        const safeMessage = await recordRetentionClaimRevisionRefreshError({
          organizationId: job.organization_id,
          accountingDocumentId,
          error,
        }).catch(() => "Unable to refresh the immutable Retention Claim invoice.");
        throw new XeroSyncError(safeMessage, {
          isRetryable: error instanceof XeroRequestError
            ? error.isRetryable
            : error instanceof RetentionClaimRevisionRefreshError
              ? error.retryable
              : false,
          requiresAttention: true,
        });
      }
    }
    try {
      return await refreshRetentionClaimPaymentFromXero({
        organizationId: job.organization_id,
        accountingDocumentId,
        workerJobId: job.id,
        actorUserId: job.created_by_user_id,
      });
    } catch (error) {
      const safeMessage = await recordRetentionClaimPaymentRefreshError({
        organizationId: job.organization_id,
        accountingDocumentId,
        error,
      }).catch(() => "Unable to refresh the Retention Claim payment state.");
      throw new XeroSyncError(safeMessage, {
        isRetryable: error instanceof XeroRequestError
          ? error.isRetryable
          : error instanceof RetentionClaimPaymentRefreshError
            ? error.isRetryable
            : false,
        requiresAttention:
          error instanceof RetentionClaimPaymentRefreshError
          && !["concurrent_reconciliation"].includes(error.code),
      });
    }
  }

  if (job.job_kind === "xero.retention_claim.sync") {
    const accountingDocumentId = typeof job.request_payload.accountingDocumentId === "string"
      ? job.request_payload.accountingDocumentId : "";
    const accountingSnapshotId = typeof job.request_payload.accountingSnapshotId === "string"
      ? job.request_payload.accountingSnapshotId : "";
    const payloadSha256 = typeof job.request_payload.payloadSha256 === "string"
      ? job.request_payload.payloadSha256 : "";
    if (!accountingDocumentId || !accountingSnapshotId || !payloadSha256) {
      throw new XeroSyncError("The Retention Claim Xero sync job payload is incomplete.");
    }
    try {
      return await createRetentionClaimXeroSalesInvoice({
        organizationId: job.organization_id,
        accountingDocumentId,
        accountingSnapshotId,
        queuedPayloadSha256: payloadSha256,
        workerJobId: job.id,
      });
    } catch (error) {
      const safeMessage = await recordRetentionClaimXeroCreateError({
        organizationId: job.organization_id,
        accountingDocumentId,
        workerJobId: job.id,
        error,
      }).catch(() => "Unable to create the Retention Claim Xero invoice.");
      throw new XeroSyncError(safeMessage, {
        isRetryable: error instanceof XeroRequestError
          ? error.isRetryable
          : error instanceof RetentionClaimXeroCreateError
            ? error.isRetryable
            : false,
        requiresAttention: error instanceof RetentionClaimXeroCreateError
          && ["ambiguous_recovery", "amount_mismatch", "concurrent_identity_change"].includes(error.code),
      });
    }
  }

  if (job.job_kind === "xero.retention_claim.attachment") {
    const accountingDocumentId = typeof job.request_payload.accountingDocumentId === "string"
      ? job.request_payload.accountingDocumentId : "";
    const accountingSnapshotId = typeof job.request_payload.accountingSnapshotId === "string"
      ? job.request_payload.accountingSnapshotId : "";
    const pdfSha256 = typeof job.request_payload.pdfSha256 === "string"
      ? job.request_payload.pdfSha256 : "";
    if (!accountingDocumentId || !accountingSnapshotId || !pdfSha256) {
      throw new XeroSyncError("The Retention Claim Xero attachment job payload is incomplete.");
    }
    try {
      return await attachRetentionClaimPdfToXeroInvoice({
        organizationId: job.organization_id,
        accountingDocumentId,
        accountingSnapshotId,
        queuedPdfSha256: pdfSha256,
        workerJobId: job.id,
      });
    } catch (error) {
      const safeMessage = await recordRetentionClaimXeroAttachmentError({
        organizationId: job.organization_id,
        accountingDocumentId,
        workerJobId: job.id,
        error,
      }).catch(() => "Unable to attach the Retention Claim PDF.");
      throw new XeroSyncError(safeMessage, {
        isRetryable: error instanceof XeroRequestError
          ? error.isRetryable
          : error instanceof RetentionClaimXeroAttachmentError
            ? error.isRetryable
            : false,
        requiresAttention: false,
      });
    }
  }

  if (
    job.job_kind === "xero.retention_claim.initial_push"
    || job.job_kind === "xero.retention_claim.initial_push.attachment"
    || job.job_kind === "xero.retention_claim.replacement"
    || job.job_kind === "xero.retention_claim.replacement.attachment"
  ) {
    const accountingRevisionId =
      typeof job.request_payload.accountingRevisionId === "string"
        ? job.request_payload.accountingRevisionId
        : "";
    const attemptId = typeof job.request_payload.attemptId === "string"
      ? job.request_payload.attemptId
      : "";
    if (!accountingRevisionId || !attemptId) {
      throw new XeroSyncError(
        "The immutable Retention Claim job payload is incomplete.",
        { isRetryable: false, requiresAttention: true },
      );
    }
    try {
      return job.job_kind.endsWith(".attachment")
        ? await executeRetentionClaimPushAttachment({
            accountingRevisionId,
            attemptId,
            workerId: job.claimed_by ?? job.id,
          })
        : await executeRetentionClaimPush({
            accountingRevisionId,
            attemptId,
            workerId: job.claimed_by ?? job.id,
          });
    } catch (error) {
      throw new XeroSyncError(
        error instanceof Error
          ? error.message
          : "Immutable Retention Claim execution failed.",
        {
          isRetryable: error instanceof XeroRequestError
            ? error.isRetryable
            : error instanceof RetentionClaimPushWorkerError
              ? error.retryable
              : false,
          requiresAttention: error instanceof RetentionClaimPushWorkerError
            ? error.uncertain || !error.retryable
            : true,
        },
      );
    }
  }

  if (job.job_kind === "xero.retention_claim.update") {
    const accountingRevisionId =
      typeof job.request_payload.accountingRevisionId === "string"
        ? job.request_payload.accountingRevisionId
        : "";
    const attemptId = typeof job.request_payload.attemptId === "string"
      ? job.request_payload.attemptId
      : "";
    if (!accountingRevisionId || !attemptId) {
      throw new XeroSyncError(
        "The cumulative Retention update job payload is incomplete.",
        { isRetryable: false, requiresAttention: true },
      );
    }
    try {
      return await executeRetentionClaimUpdate({
        accountingRevisionId,
        attemptId,
        workerId: job.claimed_by ?? job.id,
      });
    } catch (error) {
      throw new XeroSyncError(
        error instanceof Error
          ? error.message
          : "Cumulative Retention update execution failed.",
        {
          isRetryable: error instanceof RetentionClaimUpdateWorkerError
            ? error.retryable
            : false,
          requiresAttention: error instanceof RetentionClaimUpdateWorkerError
            ? error.uncertain || !error.retryable
            : true,
        },
      );
    }
  }

  if (
    job.job_kind === "xero.payment_claim.initial_push"
    || job.job_kind === "xero.payment_claim.initial_push.attachment"
  ) {
    const accountingRevisionId = typeof job.request_payload.accountingRevisionId === "string"
      ? job.request_payload.accountingRevisionId : "";
    const attemptId = typeof job.request_payload.attemptId === "string"
      ? job.request_payload.attemptId : "";
    const intent = typeof job.request_payload.intent === "string"
      ? job.request_payload.intent : "";
    const expectedIntent = job.job_kind === "xero.payment_claim.initial_push"
      ? "initial_push" : "initial_push_attachment";
    if (!accountingRevisionId || !attemptId || intent !== expectedIntent) {
      throw new XeroSyncError("The immutable Payment Claim job payload is incomplete.", {
        isRetryable: false,
        requiresAttention: true,
      });
    }
    try {
      return job.job_kind === "xero.payment_claim.initial_push"
        ? await executePaymentClaimInitialPush({
            accountingRevisionId,
            attemptId,
            workerId: job.claimed_by ?? job.id,
          })
        : await executePaymentClaimInitialPushAttachment({
            accountingRevisionId,
            attemptId,
            workerId: job.claimed_by ?? job.id,
          });
    } catch (error) {
      throw new XeroSyncError(
        error instanceof Error ? error.message : "Immutable Payment Claim execution failed.",
        {
          isRetryable: error instanceof XeroRequestError
            ? error.isRetryable
            : error instanceof PaymentClaimInitialPushWorkerError
              ? error.retryable
              : false,
          requiresAttention: error instanceof PaymentClaimInitialPushWorkerError
            ? error.uncertain || !error.retryable
            : true,
        },
      );
    }
  }

  if (
    job.job_kind === "xero.payment_claim.replacement"
    || job.job_kind === "xero.payment_claim.replacement.attachment"
  ) {
    const accountingRevisionId = typeof job.request_payload.accountingRevisionId === "string"
      ? job.request_payload.accountingRevisionId : "";
    const attemptId = typeof job.request_payload.attemptId === "string"
      ? job.request_payload.attemptId : "";
    const expectedIntent = job.job_kind === "xero.payment_claim.replacement"
      ? undefined : "replacement_attachment";
    if (
      !accountingRevisionId || !attemptId
      || (expectedIntent && job.request_payload.intent !== expectedIntent)
    ) {
      throw new XeroSyncError("The immutable Payment Claim replacement job payload is incomplete.", {
        isRetryable: false,
        requiresAttention: true,
      });
    }
    try {
      return job.job_kind === "xero.payment_claim.replacement"
        ? await executePaymentClaimReplacement({
            accountingRevisionId,
            attemptId,
            workerId: job.claimed_by ?? job.id,
          })
        : await executePaymentClaimInitialPushAttachment({
            accountingRevisionId,
            attemptId,
            workerId: job.claimed_by ?? job.id,
          });
    } catch (error) {
      throw new XeroSyncError(
        error instanceof Error ? error.message : "Immutable Payment Claim replacement failed.",
        {
          isRetryable: error instanceof XeroRequestError
            ? error.isRetryable
            : error instanceof PaymentClaimReplacementWorkerError
              ? error.retryable
              : error instanceof PaymentClaimInitialPushWorkerError
                ? error.retryable
                : false,
          requiresAttention: error instanceof PaymentClaimReplacementWorkerError
            ? error.uncertain || !error.retryable
            : true,
        },
      );
    }
  }

  if (job.job_kind === "xero.payment_claim.accounting_update") {
    const accountingRevisionId =
      typeof job.request_payload.accountingRevisionId === "string"
        ? job.request_payload.accountingRevisionId
        : "";
    const attemptId = typeof job.request_payload.attemptId === "string"
      ? job.request_payload.attemptId
      : "";
    if (
      !accountingRevisionId
      || !attemptId
      || job.request_payload.intent !== "direct_update"
    ) {
      throw new XeroSyncError(
        "The immutable Payment Claim update job payload is incomplete.",
        { isRetryable: false, requiresAttention: true },
      );
    }
    try {
      return await executePaymentClaimAccountingUpdate({
        accountingRevisionId,
        attemptId,
        workerId: job.claimed_by ?? job.id,
        jobId: job.id,
      });
    } catch (error) {
      throw new XeroSyncError(
        error instanceof Error
          ? error.message
          : "Immutable Payment Claim update execution failed.",
        {
          isRetryable:
            error instanceof XeroRequestError
              ? error.isRetryable
              : error instanceof PaymentClaimAccountingUpdateWorkerError
              ? error.retryable
              : error instanceof PaymentClaimInitialPushWorkerError
                ? error.retryable
              : false,
          requiresAttention:
            error instanceof PaymentClaimAccountingUpdateWorkerError
              ? error.uncertain || !error.retryable
              : true,
          affectsConnectionHealth:
            error instanceof XeroRequestError
              ? error.status === 401 || error.status === 403
              : error instanceof PaymentClaimAccountingUpdateWorkerError
                ? error.code === "tenant_mismatch"
                : false,
        },
      );
    }
  }

  if (job.job_kind === "xero.sales_invoice.sync") {
    const accountingDocumentId = typeof job.request_payload.accountingDocumentId === "string"
      ? job.request_payload.accountingDocumentId
      : "";
    if (!accountingDocumentId) {
      throw new XeroSyncError("The Xero Sales Invoice create job payload is incomplete.", {
        isRetryable: false,
        requiresAttention: false,
      });
    }
    try {
      const admin = await getAdmin();
      const documentResult = await admin
        .from("organization_accounting_documents" as never)
        .select("external_document_id, integration_contract")
        .eq("organization_id", job.organization_id)
        .eq("id", accountingDocumentId)
        .maybeSingle();
      if (documentResult.error) throw new Error(documentResult.error.message);
      if (!documentResult.data) {
        throw new ExistingXeroSalesInvoiceUpdateError(
          "document_not_found",
          "Accounting document not found.",
        );
      }
      const existingInvoiceId = (documentResult.data as { external_document_id?: string | null }).external_document_id;
      if (
        (documentResult.data as { integration_contract?: string | null }).integration_contract
        === "payment_claim_revision_v1"
      ) {
        throw new ExistingXeroSalesInvoiceUpdateError(
          "create_required",
          "Revision-backed Payment Claims cannot enter the legacy create or amendment worker.",
        );
      }
      const queuedHash = typeof job.request_payload.queuedHash === "string" ? job.request_payload.queuedHash : "";
      if (selectPaymentClaimSalesInvoiceSyncMode(existingInvoiceId) === "update") {
        return await updateExistingXeroSalesInvoice({
          organizationId: job.organization_id,
          accountingDocumentId,
          queuedHash,
          workerJobId: job.id,
        });
      }
      const created = await createInitialXeroSalesInvoice({
        organizationId: job.organization_id,
        accountingDocumentId,
        workerJobId: job.id,
        queuedHash,
      });
      const synchronizedAt = new Date().toISOString();
      const hashPersistence = await admin
        .from("organization_accounting_documents" as never)
        .update({
          last_synced_hash: queuedHash,
          last_synced_at: synchronizedAt,
          export_status: "exported",
          last_error_code: null,
          last_error_message: null,
        } as never)
        .eq("organization_id", job.organization_id)
        .eq("id", accountingDocumentId)
        .eq("external_document_id", created.invoiceId)
        .select("id")
        .maybeSingle();
      if (hashPersistence.error || !hashPersistence.data) {
        throw new Error("Unable to persist the synchronized Payment Claim state hash.");
      }
      return created;
    } catch (error) {
      throw new XeroSyncError(
        error instanceof Error ? error.message : "Xero Sales Invoice creation failed.",
        {
          isRetryable: error instanceof XeroRequestError
            ? error.isRetryable
            : error instanceof InitialXeroSalesInvoiceCreateError
              ? error.isRetryable
              : error instanceof ExistingXeroSalesInvoiceUpdateError
                ? error.isRetryable
              : false,
          requiresAttention: error instanceof ExistingXeroSalesInvoiceUpdateError
            && !["stale_job", "create_required", "document_not_found"].includes(error.code),
        },
      );
    }
  }

  if (job.job_kind === "xero.bill.export") {
    const documentVersionId =
      typeof job.request_payload.documentVersionId === "string"
        ? job.request_payload.documentVersionId
        : "";
    const documentId =
      typeof job.request_payload.documentId === "string"
        ? job.request_payload.documentId
        : "";
    if (!documentVersionId || !documentId) {
      throw new XeroSyncError("The Draft Xero Bill job payload is incomplete.", {
        isRetryable: false,
        requiresAttention: false,
      });
    }

    try {
      return await exportPreparedXeroDraftBill({
        organizationId: job.organization_id,
        documentVersionId,
        workerJobId: job.id,
      });
    } catch (error) {
      const retryableRateLimit =
        error instanceof XeroRequestError && error.status === 429;
      const admin = await getAdmin();
      const versionState = await admin
        .from("organization_accounting_document_versions" as never)
        .select("request_started_at")
        .eq("id", documentVersionId)
        .maybeSingle();
      const requestMayHaveReachedXero = Boolean(
        (versionState.data as { request_started_at?: string | null } | null)
          ?.request_started_at
      );
      if (!retryableRateLimit && requestMayHaveReachedXero) {
        await markXeroBillAttentionRequired({
          documentId,
          versionId: documentVersionId,
          code:
            error instanceof XeroRequestError
              ? `xero_http_${error.status}`
              : "uncertain_export_result",
          message:
            error instanceof XeroRequestError
              ? error.message
              : "The Draft Xero Bill result could not be proven. Operator review is required before retrying.",
        });
      } else if (!retryableRateLimit) {
        await markXeroBillFailed({
          documentId,
          versionId: documentVersionId,
          code: "export_preflight_failed",
          message:
            error instanceof Error
              ? error.message
              : "The Draft Xero Bill export failed before a request was sent.",
        });
      }
      throw new XeroSyncError(
        error instanceof Error ? error.message : "Draft Xero Bill export failed.",
        {
          isRetryable: retryableRateLimit,
          requiresAttention: !retryableRateLimit,
        },
      );
    }
  }

  if (job.job_kind === "xero.sales_invoice.refresh") {
    const accountingDocumentId = typeof job.request_payload.accountingDocumentId === "string"
      ? job.request_payload.accountingDocumentId
      : "";
    if (!accountingDocumentId) {
      throw new XeroSyncError("The Xero Sales Invoice refresh job payload is incomplete.", {
        isRetryable: false,
        requiresAttention: false,
      });
    }
    try {
      return await refreshXeroSalesInvoiceStatus({
        organizationId: job.organization_id,
        documentId: accountingDocumentId,
        workerJobId: job.id,
      });
    } catch (error) {
      const safeMessage = await recordXeroSalesInvoiceRefreshError({
        organizationId: job.organization_id,
        documentId: accountingDocumentId,
        error,
      }).catch(() => "Unable to refresh the Xero Sales Invoice right now.");
      throw new XeroSyncError(safeMessage, {
        isRetryable: error instanceof XeroRequestError
          ? error.isRetryable
          : error instanceof XeroSalesInvoiceRefreshError
            ? error.isRetryable
            : false,
        requiresAttention: error instanceof XeroSalesInvoiceRefreshError
          ? ![
              "sync_in_progress",
              "attachment_in_progress",
              "unauthorized",
              ...XERO_SALES_INVOICE_DOCUMENT_ONLY_REFRESH_ERRORS,
            ].includes(error.code)
          : error instanceof XeroRequestError && error.status !== 429,
      });
    }
  }

  if (job.job_kind === "xero.sales_invoice.attachment") {
    const accountingDocumentId = typeof job.request_payload.accountingDocumentId === "string"
      ? job.request_payload.accountingDocumentId
      : "";
    if (!accountingDocumentId) {
      throw new XeroSyncError("The Xero Sales Invoice attachment job payload is incomplete.", {
        isRetryable: false,
        requiresAttention: false,
      });
    }
    try {
      return await attachPaymentClaimPdfToXeroSalesInvoice({
        organizationId: job.organization_id,
        accountingDocumentId,
        workerJobId: job.id,
      });
    } catch (error) {
      const safeMessage = await recordXeroSalesInvoiceAttachmentError({
        organizationId: job.organization_id,
        documentId: accountingDocumentId,
        error,
      }).catch(() => "Unable to attach the Payment Claim PDF in Xero right now.");
      throw new XeroSyncError(safeMessage, {
        isRetryable: error instanceof XeroRequestError
          ? error.isRetryable
          : error instanceof XeroSalesInvoiceAttachmentError
            ? error.isRetryable
            : false,
        requiresAttention: false,
      });
    }
  }

  if (job.job_kind === "xero.bill.refresh") {
    const documentId =
      typeof job.request_payload.documentId === "string"
        ? job.request_payload.documentId
        : "";
    if (!documentId) {
      throw new XeroSyncError("The Xero Bill refresh job payload is incomplete.", {
        isRetryable: false,
        requiresAttention: false,
      });
    }
    try {
      return await refreshXeroBillStatus({
        organizationId: job.organization_id,
        documentId,
        workerJobId: job.id,
      });
    } catch (error) {
      const safeMessage = await recordXeroBillStatusRefreshError({
        organizationId: job.organization_id,
        documentId,
        workerJobId: job.id,
        error,
      }).catch(() => "Unable to refresh the Xero Bill status right now.");
      throw new XeroSyncError(safeMessage, {
        isRetryable:
          error instanceof XeroRequestError
            ? error.isRetryable
            : error instanceof XeroBillRefreshError
              ? error.isRetryable
              : false,
        requiresAttention:
          error instanceof XeroRequestError
            ? error.status !== 429 && error.status >= 400 && error.status < 500
            : false,
      });
    }
  }

  const connection = await getOrganizationXeroConnection(job.organization_id);
  if (!connection) {
    throw new XeroSyncError("The Xero connection no longer exists for this organization.", {
      isRetryable: false,
      requiresAttention: false,
    });
  }
  if (connection.status === "disconnected") {
    throw new XeroSyncError("The Xero connection is disconnected, so queued sync jobs cannot run.", {
      isRetryable: false,
      requiresAttention: false,
    });
  }
  if (connection.status === "attention_required") {
    throw new XeroSyncError("The Xero connection requires attention before queued sync jobs can run.", {
      isRetryable: false,
      requiresAttention: true,
    });
  }
  if (!connection.tenant_id) {
    throw new XeroSyncError("A Xero tenant must be selected before sync jobs can run.", {
      isRetryable: false,
      requiresAttention: false,
    });
  }

  let freshTokenState;
  try {
    freshTokenState = await getFreshXeroAccessToken(job.organization_id);
  } catch (error) {
    if (error instanceof XeroRequestError) {
      throw new XeroSyncError(error.message, {
        isRetryable: error.isRetryable,
        requiresAttention: error.status >= 400 && error.status < 500,
      });
    }
    throw error;
  }

  const { connection: freshConnection, tokenSet } = freshTokenState;
  const userId = freshConnection.connected_by_user_id ?? null;
  const admin = await getAdmin();
  const tenantId = freshConnection.tenant_id;

  if (!tenantId) {
    throw new Error("A Xero tenant must be selected before sync jobs can run.");
  }

  if (job.job_kind === "health_check") {
    const liveConnections = await listXeroConnections(tokenSet.access_token);
    const hasSelectedTenant = liveConnections.some((item) => item.tenantId === freshConnection.tenant_id);
    const { error } = await admin
      .from("organization_xero_connections" as never)
      .update({
        last_health_status: hasSelectedTenant ? "healthy" : "degraded",
        last_health_checked_at: new Date().toISOString(),
        last_error: hasSelectedTenant ? null : "The selected Xero tenant is no longer present in the active connection list.",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", freshConnection.id);

    if (error) {
      throw new Error(error.message);
    }

    return {
      healthy: hasSelectedTenant,
      tenantCount: liveConnections.length,
    };
  }

  if (job.job_kind === "import_accounts") {
    const accounts = await getXeroAccounts(tokenSet.access_token, tenantId);
    const result = await importXeroAccounts({
      organizationId: job.organization_id,
      tenantId,
      accounts,
      userId,
    });

    const { error } = await admin
      .from("organization_xero_connections" as never)
      .update({
        last_accounts_sync_at: new Date().toISOString(),
        last_sync_completed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", freshConnection.id);

    if (error) {
      throw new Error(error.message);
    }

    return {
      ...result,
      fetchedCount: accounts.length,
    };
  }

  if (job.job_kind === "import_contacts") {
    const result = await importXeroContacts({
      organizationId: job.organization_id,
      connectionId: freshConnection.id,
      tenantId,
    });

    const { error } = await admin
      .from("organization_xero_connections" as never)
      .update({
        last_contacts_sync_at: new Date().toISOString(),
        last_sync_completed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", freshConnection.id);

    if (error) {
      throw new Error(error.message);
    }

    return result;
  }

  const taxRates = await getXeroTaxRates(tokenSet.access_token, tenantId);
  const result = await importXeroTaxRates({
    organizationId: job.organization_id,
    taxRates,
    userId,
  });

  const { error } = await admin
    .from("organization_xero_connections" as never)
    .update({
      last_tax_rates_sync_at: new Date().toISOString(),
      last_sync_completed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", freshConnection.id);

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...result,
    fetchedCount: taxRates.length,
  };
}

export async function runXeroSyncWorker(params: {
  organizationId?: string;
  jobId?: string;
  limit?: number;
  workerId: string;
  timing?: XeroActionTiming;
}) {
  const admin = await getAdmin();
  const limit = Math.max(1, Math.min(params.limit ?? 10, 25));
  let claimedCount = 0;
  let completedCount = 0;
  let retriedCount = 0;
  let deadLetteredCount = 0;
  const results: Array<{ jobId: string; jobKind: string; summary: Record<string, unknown> }> = [];

  for (let index = 0; index < limit; index += 1) {
    const claimJob = () => claimNextJob({
        organizationId: params.organizationId,
        jobId: params.jobId,
        workerId: params.workerId,
      });
    const job = params.timing
      ? await params.timing.span("worker_job_lease", claimJob, {
          databaseOperation: "organization_accounting_sync_jobs.claim",
        })
      : await claimJob();

    if (!job) {
      break;
    }

    claimedCount += 1;
    if (job.connection_id) {
      await admin
        .from("organization_xero_connections" as never)
        .update({
          last_sync_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", job.connection_id);
    }

    try {
      const providerSummary = params.timing
        ? await params.timing.span("worker_provider_execution", () =>
            runClaimedJob(job), {
              xeroRequestPurpose: job.job_kind,
            })
        : await runClaimedJob(job);
      const completionEvidence = [
        "xero.sales_invoice.refresh",
        "xero.retention_claim.refresh",
        "xero.retention_claim.initial_push",
        "xero.retention_claim.update",
        "xero.retention_claim.replacement",
        "xero.payment_claim.initial_push",
        "xero.payment_claim.accounting_update",
        "xero.payment_claim.replacement",
      ].includes(job.job_kind)
        ? params.timing
          ? await params.timing.span(
              "worker_completion_evidence",
              () => loadAccountingSyncCompletionEvidence({
                organizationId: job.organization_id,
                jobId: job.id,
              }),
              {
                databaseOperation:
                  "get_accounting_sync_completion_evidence",
              },
            )
          : await loadAccountingSyncCompletionEvidence({
              organizationId: job.organization_id,
              jobId: job.id,
            })
        : null;
      const summary = completionEvidence
        ? { ...providerSummary, completionEvidence }
        : providerSummary;
      const finalizeCompletedJob = () => finalizeJob({
          job,
          queueState: "completed",
          resultSummary: summary,
        });
      if (params.timing) {
        await params.timing.span(
          "worker_job_completion",
          finalizeCompletedJob,
          {
            databaseOperation:
              "organization_accounting_sync_jobs.complete",
          },
        );
      } else {
        await finalizeCompletedJob();
      }
      if (job.job_kind === "xero.sales_invoice.sync") {
        const accountingDocumentId = typeof job.request_payload.accountingDocumentId === "string"
          ? job.request_payload.accountingDocumentId
          : "";
        if (accountingDocumentId) {
          await enqueueXeroSalesInvoiceAttachment({
            organizationId: job.organization_id,
            accountingDocumentId,
            createdByUserId: job.created_by_user_id,
            triggerSource: "user_export",
          }).catch(async (error) => {
            await recordXeroSalesInvoiceAttachmentError({
              organizationId: job.organization_id,
              documentId: accountingDocumentId,
              error,
            }).catch(() => undefined);
          });
        }
      }
      if (job.job_kind === "xero.retention_claim.sync") {
        const accountingDocumentId = typeof job.request_payload.accountingDocumentId === "string"
          ? job.request_payload.accountingDocumentId
          : "";
        if (accountingDocumentId) {
          await queueRetentionClaimXeroAttachmentForWorker({
            accountingDocumentId,
            actorUserId: job.created_by_user_id,
            correlationId: job.id,
          }).catch(async (error) => {
            await recordRetentionClaimXeroAttachmentError({
              organizationId: job.organization_id,
              accountingDocumentId,
              workerJobId: job.id,
              error,
            }).catch(() => undefined);
          });
        }
      }
      completedCount += 1;
      results.push({
        jobId: job.id,
        jobKind: job.job_kind,
        summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Xero sync job failed.";
      const queueState =
        error instanceof XeroSyncError && !error.isRetryable
          ? "dead_lettered"
          : job.attempt_count + 1 >= job.max_attempts
            ? "dead_lettered"
            : "retry_scheduled";

      const finalizeFailedJob = () => finalizeJob({
          job,
          queueState,
          resultSummary: {},
          errorMessage: message,
        });
      if (params.timing) {
        await params.timing.span(
          "worker_job_failure_completion",
          finalizeFailedJob,
          {
            databaseOperation:
              "organization_accounting_sync_jobs.failure",
          },
        );
      } else {
        await finalizeFailedJob();
      }

      if (
        job.connection_id
        && !job.job_kind.startsWith("xero.bill.")
        && jobFailureAffectsConnectionHealth(job, error)
      ) {
        await admin
          .from("organization_xero_connections" as never)
          .update({
            last_error: message,
            last_health_status: "error",
            last_health_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", job.connection_id);

        if (error instanceof XeroSyncError && error.requiresAttention) {
          await admin
            .from("organization_xero_connections" as never)
            .update({
              status: "attention_required",
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", job.connection_id);
        }
      }

      if (queueState === "dead_lettered") {
        deadLetteredCount += 1;
      } else {
        retriedCount += 1;
      }
    }
  }

  return {
    claimedCount,
    completedCount,
    retriedCount,
    deadLetteredCount,
    results,
  };
}
