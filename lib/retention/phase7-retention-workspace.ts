import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  getProjectRetentionPosition,
  type RetentionPositionProjectSummary,
} from "@/lib/retention/phase2-retention-position";
import {
  getRetentionClaim,
  getRetentionClaimEvents,
  listRetentionClaimDrafts,
  type RetentionClaimEvent,
  type RetentionClaimHeader,
  type RetentionClaimReadModel,
} from "@/lib/retention/phase3-retention-claims";
import { getProjectRetentionEligibility } from "@/lib/retention/phase4-retention-schedules";
import {
  getProjectRollingRetentionClaim,
  getProjectRetentionClaimHistory,
  getRetentionRollingDraftOrigins,
  type ProjectRollingRetentionClaimResult,
  type RetentionClaimHistoryRow,
  type RollingRetentionOrigin,
} from "@/lib/retention/rolling-retention-claims";
import { resolveAccountingIdentityPresentation } from "@/lib/accounting/accounting-identity-presentation";

export type RetentionRegisterRow = {
  originatingPaymentClaimId: string;
  claimNumber: string;
  claimStatus: string;
  claimDate: string | null;
  currentRetentionOwned: number;
  currentEligibleRetention: number;
  committedRetention: number;
  availableRetention: number;
  nativeClaimedAmount: number;
  legacyReconciledAmount: number;
  remainingAmount: number;
  paidAmount: number;
  scheduleIds: string[];
  schedules: Array<{
    scheduleId: string;
    status: string;
    eligibilityDate: string | null;
    currentlyEligible: boolean;
    entitlementAmount: number;
  }>;
  scheduleNames: string[];
  nextEligibilityDate: string | null;
  latestRetentionClaim: {
    id: string;
    claimNumber: string;
    status: string;
    issueDate: string | null;
    allocationAmount: number;
  } | null;
  variance: {
    id: string;
    state: string;
    severity: string;
    isBlocking: boolean;
    primaryType: string;
  } | null;
  legacyReconciliation: {
    id: string;
    caseSequence: number;
    status: string;
  } | null;
};

export type RetentionRegisterReadModel = {
  succeeded: boolean;
  errorCode: string | null;
  organizationId?: string;
  projectId?: string;
  positionStateHash?: string;
  eligibilityStateHash?: string;
  rows: RetentionRegisterRow[];
};

export type RetentionWorkspaceReadModel = {
  register: RetentionRegisterReadModel;
  position: RetentionPositionProjectSummary;
  claims: RetentionClaimHeader[];
  rollingClaim: ProjectRollingRetentionClaimResult;
  claimHistory: RetentionClaimHistoryRow[];
  claimRows: RetentionClaimRegisterRow[];
  xeroVisible: boolean;
  masterAccounting: {
    pushedSubtotal: number;
    pushedTax: number;
    pushedTotal: number;
    externalInvoiceId: string | null;
    externalInvoiceNumber: string | null;
  } | null;
};

export type RetentionClaimRegisterRow = {
  claim: RetentionClaimHeader;
  originCount: number;
  paidAmount: number;
  outstandingAmount: number;
  xeroStatus: string | null;
  xeroVisible: boolean;
  automaticDraft: boolean;
};

export function buildRetentionClaimRegisterRows(input: {
  rollingClaim: ProjectRollingRetentionClaimResult;
  claimHistory: RetentionClaimHistoryRow[];
  xeroVisible: boolean;
}): RetentionClaimRegisterRow[] {
  const rows: RetentionClaimRegisterRow[] = [];
  const included = new Set<string>();
  const automaticProjection = input.rollingClaim.succeeded
    ? input.rollingClaim.claim
    : null;
  if (automaticProjection) included.add(automaticProjection.id);

  for (const history of input.claimHistory) {
    if (included.has(history.claim.id)) continue;
    included.add(history.claim.id);
    const submitted = history.claim.status === "submitted";
    rows.push({
      claim: history.claim,
      originCount: history.originCount,
      paidAmount: submitted ? history.paidAmount : 0,
      outstandingAmount: submitted ? history.outstandingAmount : 0,
      xeroStatus: submitted ? history.xeroStatus : null,
      xeroVisible: input.xeroVisible,
      automaticDraft: false,
    });
  }

  return rows;
}

function parseObject<T>(value: Json | null, operation: string): T {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${operation} returned an invalid Retention workspace payload.`);
  }
  return value as T;
}

export async function getProjectRetentionRegister(
  projectId: string,
): Promise<RetentionRegisterReadModel> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    "get_project_retention_register",
    { p_project_id: projectId },
  );

  if (error) {
    throw new Error(`Unable to read Retention Register: ${error.message}`);
  }

  return parseObject<RetentionRegisterReadModel>(
    data,
    "get_project_retention_register",
  );
}

export async function getRetentionWorkspace(
  projectId: string,
): Promise<RetentionWorkspaceReadModel> {
  const [
    register,
    positionResult,
    claimResult,
    rollingClaim,
    historyResult,
    masterIdentityResult,
  ] = await Promise.all([
    getProjectRetentionRegister(projectId),
    getProjectRetentionPosition({ projectId, pageSize: 1 }),
    listRetentionClaimDrafts({ projectId, limit: 100 }),
    getProjectRollingRetentionClaim(projectId),
    getProjectRetentionClaimHistory(projectId),
    (async () => {
      const supabase = await createServerSupabaseClient();
      return (supabase.from as unknown as (
        table: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) => any)("retention_claims")
        .select("id")
        .eq("project_id", projectId)
        .eq("master_role", "master_retention_claim")
        .maybeSingle();
    })(),
  ]);

  const allClaimHistory =
    historyResult.succeeded ? historyResult.claims : [];
  const masterId = masterIdentityResult.error
    ? null
    : String(masterIdentityResult.data?.id ?? "");
  const claimHistory = masterId
    ? allClaimHistory.filter((row) => row.claim.id === masterId)
    : allClaimHistory;
  const xeroVisible =
    historyResult.succeeded && historyResult.xeroVisible === true;
  const master = claimHistory.find(
    (row) =>
      row.claim.status === "submitted"
      && (!masterId || row.claim.id === masterId),
  )?.claim ?? null;
  let masterAccounting: RetentionWorkspaceReadModel["masterAccounting"] = null;
  if (master) {
    const supabase = await createServerSupabaseClient();
    const document = await (supabase.from as unknown as (
      table: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => any)("organization_accounting_documents")
      .select(
        "external_document_id,external_document_number,"
        + "active_accounting_revision_id",
      )
      .eq("retention_claim_id", master.id)
      .eq("local_document_type", "retention_claim")
      .maybeSingle();
    if (!document.error && document.data?.active_accounting_revision_id) {
      const revision = await (supabase.from as unknown as (
        table: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) => any)("organization_accounting_document_revisions")
        .select(
          "subtotal_minor,tax_minor,total_minor,"
          + "external_document_id,external_document_number",
        )
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

  return {
    register,
    position: positionResult.summary,
    claims: claimResult.succeeded ? claimResult.claims : [],
    rollingClaim,
    claimHistory,
    claimRows: buildRetentionClaimRegisterRows({
      rollingClaim,
      claimHistory,
      xeroVisible,
    }),
    xeroVisible,
    masterAccounting,
  };
}

export type RetentionClaimWorkspaceReadModel = {
  claim: RetentionClaimReadModel;
  events: RetentionClaimEvent[];
  eligibility: Record<string, Json | undefined>;
  rollingOrigins: RollingRetentionOrigin[];
  automaticRolling: boolean;
};

export async function getRetentionClaimWorkspace(
  retentionClaimId: string,
): Promise<RetentionClaimWorkspaceReadModel> {
  const claim = await getRetentionClaim(retentionClaimId);
  if (!claim.succeeded) {
    return {
      claim,
      events: [],
      eligibility: {},
      rollingOrigins: [],
      automaticRolling: false,
    };
  }

  const [eventsResult, eligibility, rollingResult] = await Promise.all([
    getRetentionClaimEvents(retentionClaimId, 100),
    getProjectRetentionEligibility(claim.claim.projectId),
    getRetentionRollingDraftOrigins(retentionClaimId),
  ]);

  return {
    claim,
    events: eventsResult.succeeded ? eventsResult.events : [],
    eligibility,
    rollingOrigins: rollingResult.succeeded ? rollingResult.origins : [],
    automaticRolling:
      rollingResult.succeeded && rollingResult.automaticRolling === true,
  };
}
