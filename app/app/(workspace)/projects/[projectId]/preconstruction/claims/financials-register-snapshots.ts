import "server-only";

import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { resolveProjectContractualBaseline } from "@/lib/opportunity-lifecycle-compatibility-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  resolveAccountingIdentityPresentation,
} from "@/lib/accounting/accounting-identity-presentation";
import {
  buildRetentionClaimRegisterRows,
  getProjectRetentionRegister,
} from "@/lib/retention/phase7-retention-workspace";
import {
  getProjectRetentionClaimHistory,
  getProjectRollingRetentionClaim,
} from "@/lib/retention/rolling-retention-claims";
import type {
  FinancialsRegisterSnapshotResult,
  PaymentClaimRegisterIdentity,
  PaymentClaimRegisterQuote,
  PaymentClaimRegisterRow,
  PaymentClaimRegisterSnapshot,
  PaymentClaimRegisterVariation,
  RetentionRegisterSnapshot,
} from "./financials-register-types";

const ACCOUNTING_VIEW_PERMISSION = "accounting.sales_invoices.view";
const ACCOUNTING_MANAGE_PERMISSION = "accounting.sales_invoices.manage";

type RegisterDatabaseClient = UntypedAdmin;

type FinancialsRegisterContext = {
  organizationId: string;
  userId: string;
  projectId: string;
  projectSlug: string;
  permissions: Record<string, boolean>;
  database: RegisterDatabaseClient;
  sharedTiming: {
    authentication: number;
    membership: number;
    permissionBatch: number;
    projectContext: number;
  };
};

type UntypedAdmin = {
  // The Phase 2 accounting read model intentionally precedes generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function elapsed(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function calculateVariationPreGstTotal(variation: PaymentClaimRegisterVariation) {
  const subtotal = Number(variation.subtotal ?? 0);
  const marginPercent = Number(variation.margin_percent ?? 0);
  const discountAmount = Number(variation.discount_amount ?? 0);
  const contingencyAmount = Number(variation.contingency_amount ?? 0);
  return Math.max(
    0,
    subtotal
      + subtotal * (marginPercent / 100)
      + contingencyAmount
      - discountAmount,
  );
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function paymentXeroStatusLabel(document: Record<string, unknown>) {
  const remoteStatus = text(document.normalized_external_status)?.toLowerCase();
  if (remoteStatus === "voided" || remoteStatus === "deleted") return "Voided";
  switch (text(document.export_status)) {
    case "exported":
      return "Synced";
    case "attention_required":
      return "Attention";
    case "failed":
      return "Failed";
    case "queued":
      return "Queued";
    case "exporting":
      return "Syncing";
    default:
      return "Not synced";
  }
}

export async function loadFinancialsRegisterContext(
  projectSlug: string,
): Promise<FinancialsRegisterContext | null> {
  const authenticationStartedAt = performance.now();
  const member = await getCurrentOrganizationMember();
  const authentication = elapsed(authenticationStartedAt);
  const membership = authentication;
  if (!member) return null;

  const database =
    await createServerSupabaseClient() as unknown as RegisterDatabaseClient;
  const projectStartedAt = performance.now();
  const permissionStartedAt = performance.now();
  const [projectResult, permissions] = await Promise.all([
    database
      .from("organization_projects")
      .select("id,slug")
      .eq("organization_id", member.organization_id)
      .eq("slug", projectSlug)
      .maybeSingle(),
    getOrganizationPermissionsBatch({
      organizationId: member.organization_id,
      permissions: [
        ACCOUNTING_VIEW_PERMISSION,
        ACCOUNTING_MANAGE_PERMISSION,
      ],
    }),
  ]);
  const projectContext = elapsed(projectStartedAt);
  const permissionBatch = elapsed(permissionStartedAt);
  if (projectResult.error || !projectResult.data?.id) return null;

  return {
    organizationId: member.organization_id,
    userId: member.user_id,
    projectId: String(projectResult.data.id),
    projectSlug,
    permissions,
    database,
    sharedTiming: {
      authentication,
      membership,
      permissionBatch,
      projectContext,
    },
  };
}

export async function loadPaymentClaimRegisterSnapshot(
  context: FinancialsRegisterContext,
): Promise<PaymentClaimRegisterSnapshot> {
  const totalStartedAt = performance.now();
  const snapshotStartedAt = performance.now();
  const database = context.database;
  const admin = createAdminSupabaseClient() as unknown as UntypedAdmin;
  const [
    claimsResult,
    quotesResult,
    variationsResult,
    contractualBaseline,
  ] = await Promise.all([
    database
      .from("project_claims")
      .select(
        "id,claim_number,claim_title,claim_type,status,claim_date,"
        + "period_start,period_end,due_date,percent_complete,claim_amount,"
        + "paid_amount,retention_percent,retention_withheld_amount,"
        + "retention_released_amount,retention_held_to_date,"
        + "retention_released_to_date,retention_balance,net_claim_excl_gst,"
        + "gst_amount,total_payable,linked_quote_value,"
        + "linked_approved_variations,revised_contract_value,"
        + "previous_claims_total,updated_at",
      )
      .eq("organization_id", context.organizationId)
      .eq("project_id", context.projectId)
      .order("claim_date", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false }),
    database
      .from("project_quotes")
      .select(
        "id,status,subtotal,margin_percent,discount_amount,"
        + "contingency_amount,updated_at",
      )
      .eq("organization_id", context.organizationId)
      .eq("project_id", context.projectId)
      .order("updated_at", { ascending: false }),
    database
      .from("project_variations")
      .select(
        "id,status,subtotal,margin_percent,discount_amount,contingency_amount",
      )
      .eq("organization_id", context.organizationId)
      .eq("project_id", context.projectId),
    resolveProjectContractualBaseline({
      client: database as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
      organizationId: context.organizationId,
      projectId: context.projectId,
    }),
  ]);
  if (claimsResult.error) throw new Error(claimsResult.error.message);
  if (quotesResult.error) throw new Error(quotesResult.error.message);
  if (variationsResult.error) throw new Error(variationsResult.error.message);
  const paymentSnapshot = elapsed(snapshotStartedAt);

  const claims = (claimsResult.data ?? []) as PaymentClaimRegisterRow[];
  const projectQuotes = (quotesResult.data ?? []) as PaymentClaimRegisterQuote[];
  const quotes = contractualBaseline === null
    ? projectQuotes
    : contractualBaseline.isValid
      ? projectQuotes.filter((quote) => quote.id === contractualBaseline.quoteId)
      : [];
  const variations =
    (variationsResult.data ?? []) as PaymentClaimRegisterVariation[];
  const canViewAccounting =
    context.permissions[ACCOUNTING_VIEW_PERMISSION] === true
    || context.permissions[ACCOUNTING_MANAGE_PERMISSION] === true;

  const accountingStartedAt = performance.now();
  let accountingIdentities: Record<string, PaymentClaimRegisterIdentity> = {};
  let accountingQueryCount = 0;
  if (canViewAccounting && claims.length > 0) {
    accountingQueryCount += 1;
    const documentsResult = await admin
      .from("organization_accounting_documents")
      .select(
        "id,project_claim_id,active_accounting_revision_id,"
        + "external_document_id,external_document_number,export_status,"
        + "normalized_external_status",
      )
      .eq("organization_id", context.organizationId)
      .eq("provider", "xero")
      .eq("local_document_type", "project_claim")
      .in("project_claim_id", claims.map((claim) => claim.id));
    if (documentsResult.error) throw new Error(documentsResult.error.message);
    const documents =
      (documentsResult.data ?? []) as Array<Record<string, unknown>>;
    const revisionIds = documents
      .map((document) => text(document.active_accounting_revision_id))
      .filter((id): id is string => Boolean(id));
    accountingQueryCount += revisionIds.length > 0 ? 1 : 0;
    const revisionsResult = revisionIds.length > 0
      ? await admin
          .from("organization_accounting_document_revisions")
          .select(
            "id,accounting_document_id,external_document_id,"
            + "external_document_number,lifecycle_state",
          )
          .eq("organization_id", context.organizationId)
          .in("id", revisionIds)
      : { data: [], error: null };
    if (revisionsResult.error) throw new Error(revisionsResult.error.message);
    const revisions = new Map(
      ((revisionsResult.data ?? []) as Array<Record<string, unknown>>)
        .map((revision) => [text(revision.id), revision] as const)
        .filter(
          (entry): entry is [string, Record<string, unknown>] =>
            Boolean(entry[0]),
        ),
    );
    const documentsByClaim = new Map(
      documents
        .map((document) => [text(document.project_claim_id), document] as const)
        .filter(
          (entry): entry is [string, Record<string, unknown>] =>
            Boolean(entry[0]),
        ),
    );
    accountingIdentities = Object.fromEntries(claims.map((claim) => {
      const document = documentsByClaim.get(claim.id);
      const revision = document
        ? revisions.get(text(document.active_accounting_revision_id) ?? "")
        : null;
      const revisionMatchesDocument = Boolean(
        document
        && revision
        && text(revision.accounting_document_id) === text(document.id),
      );
      const identity = resolveAccountingIdentityPresentation({
        commercialClaimNumber: claim.claim_number,
        activeRevisionInvoiceNumber: revisionMatchesDocument
          ? text(revision?.external_document_number)
          : null,
        activeRevisionInvoiceId: revisionMatchesDocument
          ? text(revision?.external_document_id)
          : null,
        stableDocumentInvoiceNumber: text(document?.external_document_number),
        stableDocumentInvoiceId: text(document?.external_document_id),
      });
      return [claim.id, {
        claimId: claim.id,
        identity,
        statusLabel: document
          ? paymentXeroStatusLabel(document)
          : "Not synced",
      }];
    }));
  }
  const paymentAccountingState = elapsed(accountingStartedAt);

  const presentationStartedAt = performance.now();
  const approvedVariationsValue = variations
    .filter((variation) => variation.status === "Approved")
    .reduce(
      (total, variation) =>
        total + calculateVariationPreGstTotal(variation),
      0,
    );
  const paymentPresentation = elapsed(presentationStartedAt);
  const paymentTotal = elapsed(totalStartedAt);
  console.info("[financials-register][payment]", {
    operationDurationMs: paymentTotal,
    actionElapsedMs: paymentTotal,
    parallelGroup: "financials_register_snapshots",
    rowsReturned: claims.length,
    queryCount: 3 + accountingQueryCount,
    payment_snapshot: paymentSnapshot,
    payment_accounting_state: paymentAccountingState,
    payment_presentation: paymentPresentation,
    payment_total: paymentTotal,
  });

  return {
    organizationId: context.organizationId,
    projectId: context.projectId,
    projectSlug: context.projectSlug,
    claims,
    quotes,
    approvedVariationsValue,
    accountingIdentities,
    loadedAt: new Date().toISOString(),
  };
}

export async function loadRetentionRegisterSnapshot(
  context: FinancialsRegisterContext,
): Promise<RetentionRegisterSnapshot> {
  const totalStartedAt = performance.now();
  const snapshotStartedAt = performance.now();
  const serverClient = context.database;
  const admin = createAdminSupabaseClient() as unknown as UntypedAdmin;
  const [register, rollingClaim, history, masterIdentityResult] =
    await Promise.all([
      getProjectRetentionRegister(context.projectId),
      getProjectRollingRetentionClaim(context.projectId),
      getProjectRetentionClaimHistory(context.projectId),
      serverClient
        .from("retention_claims")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId)
        .eq("master_role", "master_retention_claim")
        .maybeSingle(),
    ]);
  const retentionSnapshot = elapsed(snapshotStartedAt);

  const masterId = masterIdentityResult.error
    ? null
    : text(masterIdentityResult.data?.id);
  const claimHistory = masterId
    ? history.claims.filter((row) => row.claim.id === masterId)
    : history.claims;
  const xeroVisible = history.succeeded && history.xeroVisible === true;
  const claimRows = buildRetentionClaimRegisterRows({
    rollingClaim,
    claimHistory,
    xeroVisible,
  });
  const master = claimHistory.find(
    (row) =>
      row.claim.status === "submitted"
      && (!masterId || row.claim.id === masterId),
  )?.claim ?? null;

  const accountingStartedAt = performance.now();
  let accountingQueryCount = 0;
  let masterAccounting: RetentionRegisterSnapshot["masterAccounting"] = null;
  const canViewAccounting =
    context.permissions[ACCOUNTING_VIEW_PERMISSION] === true
    || context.permissions[ACCOUNTING_MANAGE_PERMISSION] === true;
  if (master && canViewAccounting) {
    accountingQueryCount += 1;
    const document = await admin
      .from("organization_accounting_documents")
      .select(
        "external_document_id,external_document_number,"
        + "active_accounting_revision_id",
      )
      .eq("organization_id", context.organizationId)
      .eq("retention_claim_id", master.id)
      .eq("local_document_type", "retention_claim")
      .maybeSingle();
    if (!document.error && document.data?.active_accounting_revision_id) {
      accountingQueryCount += 1;
      const revision = await admin
        .from("organization_accounting_document_revisions")
        .select(
          "subtotal_minor,tax_minor,total_minor,"
          + "external_document_id,external_document_number",
        )
        .eq("organization_id", context.organizationId)
        .eq("id", document.data.active_accounting_revision_id)
        .maybeSingle();
      if (!revision.error && revision.data) {
        const identity = resolveAccountingIdentityPresentation({
          commercialClaimNumber: master.claimNumber,
          activeRevisionInvoiceId: revision.data.external_document_id,
          activeRevisionInvoiceNumber: revision.data.external_document_number,
          stableDocumentInvoiceId: document.data.external_document_id,
          stableDocumentInvoiceNumber: document.data.external_document_number,
        });
        masterAccounting = {
          pushedSubtotal: Number(revision.data.subtotal_minor ?? 0) / 100,
          pushedTax: Number(revision.data.tax_minor ?? 0) / 100,
          pushedTotal: Number(revision.data.total_minor ?? 0) / 100,
          externalInvoiceId: identity.activeXeroInvoiceId,
          externalInvoiceNumber: identity.activeXeroInvoiceNumber,
        };
      }
    }
  }
  const retentionAccountingState = elapsed(accountingStartedAt);

  const presentationStartedAt = performance.now();
  const snapshot: RetentionRegisterSnapshot = {
    register,
    claimRows,
    xeroVisible,
    masterAccounting,
    loadedAt: new Date().toISOString(),
  };
  const retentionPresentation = elapsed(presentationStartedAt);
  const retentionTotal = elapsed(totalStartedAt);
  console.info("[financials-register][retention]", {
    operationDurationMs: retentionTotal,
    actionElapsedMs: retentionTotal,
    parallelGroup: "financials_register_snapshots",
    rowsReturned: claimRows.length,
    queryCount: 4 + accountingQueryCount,
    retention_snapshot: retentionSnapshot,
    retention_accounting_state: retentionAccountingState,
    retention_presentation: retentionPresentation,
    retention_total: retentionTotal,
  });
  return snapshot;
}

function scopedResult<T>(
  settled: PromiseSettledResult<T>,
  startedAt: number,
  fallback: string,
): FinancialsRegisterSnapshotResult<T> {
  if (settled.status === "fulfilled") {
    return {
      snapshot: settled.value,
      error: null,
      durationMs: elapsed(startedAt),
    };
  }
  console.error("[financials-register] Scoped snapshot failed.", {
    errorType:
      settled.reason instanceof Error
        ? settled.reason.name
        : "UnknownError",
  });
  return {
    snapshot: null,
    error: fallback,
    durationMs: elapsed(startedAt),
  };
}

export async function loadFinancialsRegisterPageData(projectSlug: string) {
  const actionStartedAt = performance.now();
  const context = await loadFinancialsRegisterContext(projectSlug);
  if (!context) return null;

  const paymentStartedAt = performance.now();
  const retentionStartedAt = performance.now();
  const [payment, retention] = await Promise.allSettled([
    loadPaymentClaimRegisterSnapshot(context),
    loadRetentionRegisterSnapshot(context),
  ]);
  const actionElapsedMs = elapsed(actionStartedAt);
  console.info("[financials-register][page]", {
    operationDurationMs: actionElapsedMs,
    actionElapsedMs,
    parallelGroup: "financials_register_snapshots",
    rowsReturned:
      (payment.status === "fulfilled" ? payment.value.claims.length : 0)
      + (retention.status === "fulfilled"
        ? retention.value.claimRows.length
        : 0),
    queryCount: null,
    authentication: context.sharedTiming.authentication,
    membership: context.sharedTiming.membership,
    permission_batch: context.sharedTiming.permissionBatch,
    project_context: context.sharedTiming.projectContext,
  });

  return {
    projectId: context.projectId,
    projectSlug: context.projectSlug,
    payment: scopedResult(
      payment,
      paymentStartedAt,
      "Unable to load Payment Claims.",
    ),
    retention: scopedResult(
      retention,
      retentionStartedAt,
      "Unable to load Retention Claims.",
    ),
  };
}

export async function loadPaymentClaimRegisterSnapshotForCurrentUser(
  projectSlug: string,
): Promise<FinancialsRegisterSnapshotResult<PaymentClaimRegisterSnapshot>> {
  const startedAt = performance.now();
  const context = await loadFinancialsRegisterContext(projectSlug);
  if (!context) {
    return {
      snapshot: null,
      error: "Project not found.",
      durationMs: elapsed(startedAt),
    };
  }
  try {
    return {
      snapshot: await loadPaymentClaimRegisterSnapshot(context),
      error: null,
      durationMs: elapsed(startedAt),
    };
  } catch (error) {
    console.error("[financials-register][payment] Fallback load failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      snapshot: null,
      error: "Unable to load Payment Claims.",
      durationMs: elapsed(startedAt),
    };
  }
}
