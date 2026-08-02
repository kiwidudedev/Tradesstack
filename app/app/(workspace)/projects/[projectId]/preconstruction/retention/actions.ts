"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addRetentionClaimAllocation,
  cancelRetentionClaimDraft,
  createRetentionClaimDraft,
  getRetentionClaim,
  removeRetentionClaimAllocation,
  submitRetentionClaim,
  updateRetentionClaimAllocation,
  updateRetentionClaimDraft,
} from "@/lib/retention/phase3-retention-claims";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { getRetentionClaimWorkspace } from "@/lib/retention/phase7-retention-workspace";
import {
  enqueueRetentionClaimPaymentRefresh,
  recordManualRetentionClaimPayment,
} from "@/lib/retention/phase10-payment-reconciliation";
import {
  saveRetentionClaimDraftDocument,
  type RetentionClaimDraftDocumentLine,
  type RetentionClaimDraftDocumentSaveResult,
} from "@/lib/retention/retention-claim-document-save";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getOrganizationPermissionsBatch,
} from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  buildRetentionClaimPushProposal,
  createRetentionClaimPushProposalToken,
  persistRetentionClaimPushProposal,
  toRetentionClaimPushPreview,
  verifyRetentionClaimPushProposalToken,
  isRetentionClaimImmutableXeroEnabled,
} from "@/lib/xero/retention-claim-push-proposal";
import {
  confirmRetentionClaimPush,
  RetentionClaimPushError,
} from "@/lib/xero/retention-claim-push-confirmation";
import {
  getRetentionClaimImmutableXeroPanel,
  deriveRetentionClaimPanelFromCompletionEvidence,
  getRetentionClaimRefreshIdentity,
  type RetentionClaimImmutableXeroPanelState,
} from "@/lib/xero/retention-claim-immutable-panel";
import {
  enqueueRetentionClaimRevisionRefresh,
} from "@/lib/xero/retention-claim-revision-refresh";
import {
  RETENTION_CLAIM_PUSH_PERMISSION,
  type RetentionClaimPushProposal,
} from "@/lib/xero/retention-claim-push-contract";
import { runXeroSyncWorker } from "@/lib/xero/sync";
import {
  adoptLegacyVoidedRetentionClaimIfNeeded,
  RetentionClaimLegacyAdoptionError,
} from "@/lib/xero/retention-claim-legacy-adoption";
import {
  prepareRetentionClaimForXeroPreview,
  RetentionClaimPushPreparationError,
} from "@/lib/xero/retention-claim-push-preparation";
import { executeOneClickClaimPush } from "@/lib/xero/one-click-claim-push";
import {
  createXeroActionTiming,
  type XeroActionTiming,
} from "@/lib/xero/action-performance";
import {
  createAccountingSyncRequestContextFromIdentity,
  extendAccountingSyncRequestContext,
  type AccountingSyncRequestContext,
} from "@/lib/xero/accounting-sync-request-context";
import {
  completionEvidenceMatches,
  loadRetentionClaimLocalAccountingComparison,
  parseAccountingSyncCompletionEvidence,
} from "@/lib/xero/accounting-sync-completion-evidence";
import {
  RetentionClaimProposalDecisionError,
} from "@/lib/xero/retention-claim-proposal-decision-error";
import {
  recoverSynchronizedRetentionClaimPanel,
} from "@/lib/xero/retention-claim-stale-panel-recovery";

function retentionCompletionEvidence(
  execution: Awaited<ReturnType<typeof runXeroSyncWorker>>,
) {
  return parseAccountingSyncCompletionEvidence(
    execution.results[0]?.summary.completionEvidence,
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function field(formData: FormData, name: string, maximum = 250) {
  const value = formData.get(name);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

function requiredUuid(formData: FormData, name: string) {
  const value = field(formData, name, 36);
  if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${name}.`);
  return value;
}

function requiredRevision(formData: FormData) {
  const revision = Number(field(formData, "expectedDraftRevision", 20));
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Invalid Retention Claim revision.");
  }
  return revision;
}

function optionalDate(formData: FormData, name: string) {
  const value = field(formData, name, 10);
  if (!value) return null;
  if (!DATE_PATTERN.test(value)) throw new Error(`Invalid ${name}.`);
  return value;
}

function requiredAmount(formData: FormData) {
  const raw = field(formData, "allocationAmount", 30);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error("Allocation amount must be a positive amount with at most two decimals.");
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Allocation amount must be greater than zero.");
  }
  return amount;
}

function nonnegativeAmount(formData: FormData, name: string) {
  const raw = field(formData, name, 30);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(
      "Paid amount must be non-negative with at most two decimals.",
    );
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Paid amount must be non-negative.");
  }
  return amount;
}

function optionalUuid(formData: FormData, name: string) {
  const value = field(formData, name, 36);
  if (!value) return null;
  if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${name}.`);
  return value;
}

function paths(formData: FormData) {
  const projectSlug = field(formData, "projectSlug", 250);
  if (!projectSlug || projectSlug.includes("/") || projectSlug.includes("..")) {
    throw new Error("Invalid project route.");
  }
  const claimsPath =
    `/app/projects/${encodeURIComponent(projectSlug)}/preconstruction/claims`;
  const retentionClaimBasePath =
    `/app/projects/${encodeURIComponent(projectSlug)}/preconstruction/retention/claims`;
  return {
    projectSlug,
    claimsPath,
    registerHref: `${claimsPath}#retention`,
    retentionClaimBasePath,
  };
}

async function assertProjectRoute(projectSlug: string, projectId: string) {
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectSlug);
  if (!project || project.id !== projectId) {
    throw new Error("The Retention project route is not available.");
  }
}

async function assertClaimRoute(projectSlug: string, retentionClaimId: string) {
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectSlug);
  if (!project) throw new Error("The Retention project route is not available.");
  const claim = await getRetentionClaim(retentionClaimId);
  if (!claim.succeeded || claim.claim.projectId !== project.id) {
    throw new Error("The Retention Claim does not belong to this project.");
  }
}

function redirectWithError(
  path: string,
  code: string | null,
  hash = "",
) {
  const message = code
    ? `The action was rejected (${code.replaceAll("_", " ")}).`
    : "The Retention action could not be completed.";
  redirect(`${path}?retentionError=${encodeURIComponent(message)}${hash}`);
}

type SaveRetentionClaimDocumentActionInput = {
  projectSlug: string;
  retentionClaimId: string;
  expectedDraftRevision: number;
  title: string;
  reference: string | null;
  issueDate: string | null;
  dueDate: string | null;
  expectedPositionStateHash: string;
  expectedEligibilityStateHash: string;
  expectedOriginSetHash: string;
  lines: RetentionClaimDraftDocumentLine[];
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function validOptionalDate(value: string | null) {
  return value === null || DATE_PATTERN.test(value);
}

export async function saveRetentionClaimDocumentAction(
  input: SaveRetentionClaimDocumentActionInput,
): Promise<RetentionClaimDraftDocumentSaveResult> {
  if (
    !input.projectSlug ||
    input.projectSlug.length > 250 ||
    input.projectSlug.includes("/") ||
    input.projectSlug.includes("..") ||
    !UUID_PATTERN.test(input.retentionClaimId) ||
    !Number.isSafeInteger(input.expectedDraftRevision) ||
    input.expectedDraftRevision < 1 ||
    !input.title.trim() ||
    input.title.length > 250 ||
    (input.reference !== null && input.reference.length > 250) ||
    !validOptionalDate(input.issueDate) ||
    !validOptionalDate(input.dueDate) ||
    !SHA256_PATTERN.test(input.expectedPositionStateHash) ||
    !SHA256_PATTERN.test(input.expectedEligibilityStateHash) ||
    !SHA256_PATTERN.test(input.expectedOriginSetHash) ||
    !Array.isArray(input.lines) ||
    input.lines.length > 500
  ) {
    return {
      succeeded: false,
      errorCode: "invalid_line_set",
      requiresReload: false,
    };
  }

  const seenOrigins = new Set<string>();
  for (const line of input.lines) {
    if (
      !UUID_PATTERN.test(line.originatingPaymentClaimId) ||
      (line.candidateId !== null && !UUID_PATTERN.test(line.candidateId)) ||
      (line.existingAllocationId !== null &&
        !UUID_PATTERN.test(line.existingAllocationId)) ||
      !SHA256_PATTERN.test(line.expectedOriginStateHash) ||
      !Number.isSafeInteger(line.sequence) ||
      line.sequence < 1 ||
      line.sequence > 500 ||
      !Number.isSafeInteger(line.proposedAmountCents) ||
      line.proposedAmountCents < 0 ||
      line.proposedAmountCents > 99_999_999_999_999 ||
      seenOrigins.has(line.originatingPaymentClaimId)
    ) {
      return {
        succeeded: false,
        errorCode: "invalid_line_set",
        requiresReload: false,
      };
    }
    seenOrigins.add(line.originatingPaymentClaimId);
  }

  // Refresh the signed session before the gated mutation so newly activated,
  // admin-managed internal claims are available without requiring a logout.
  const supabase = await createServerSupabaseClient();
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    return {
      succeeded: false,
      errorCode: "permission_denied",
      requiresReload: false,
    };
  }

  await assertClaimRoute(input.projectSlug, input.retentionClaimId);
  const result = await saveRetentionClaimDraftDocument({
    ...input,
    title: input.title.trim(),
    reference: input.reference?.trim() || null,
    correlationId: crypto.randomUUID(),
  });

  if (result.succeeded) {
    const detailPath =
      `/app/projects/${encodeURIComponent(input.projectSlug)}` +
      `/preconstruction/retention/claims/${input.retentionClaimId}`;
    revalidatePath(
      `/app/projects/${encodeURIComponent(input.projectSlug)}/preconstruction/claims`,
    );
    revalidatePath(detailPath);
  }
  return result;
}

export async function createRetentionClaimAction(formData: FormData) {
  const { projectSlug, claimsPath, retentionClaimBasePath } = paths(formData);
  const projectId = requiredUuid(formData, "projectId");
  await assertProjectRoute(projectSlug, projectId);
  const result = await createRetentionClaimDraft({
    projectId,
    title: field(formData, "title") || "Retention Claim",
    reference: field(formData, "reference") || null,
    issueDate: optionalDate(formData, "issueDate"),
    dueDate: optionalDate(formData, "dueDate"),
    correlationId: crypto.randomUUID(),
  });

  if (!result.succeeded) {
    redirectWithError(claimsPath, result.errorCode, "#retention");
  }
  revalidatePath(claimsPath);
  redirect(`${retentionClaimBasePath}/${result.claim.id}`);
}

export async function updateRetentionClaimAction(formData: FormData) {
  const { projectSlug, claimsPath, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  const result = await updateRetentionClaimDraft({
    retentionClaimId: claimId,
    expectedDraftRevision: requiredRevision(formData),
    title: field(formData, "title") || "Retention Claim",
    reference: field(formData, "reference") || null,
    issueDate: optionalDate(formData, "issueDate"),
    dueDate: optionalDate(formData, "dueDate"),
    refreshPosition: true,
    correlationId: crypto.randomUUID(),
  });
  if (!result.succeeded) redirectWithError(detailPath, result.errorCode);
  revalidatePath(claimsPath);
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function addRetentionAllocationAction(formData: FormData) {
  const { projectSlug, claimsPath, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  const result = await addRetentionClaimAllocation({
    retentionClaimId: claimId,
    expectedDraftRevision: requiredRevision(formData),
    originatingPaymentClaimId: requiredUuid(
      formData,
      "originatingPaymentClaimId",
    ),
    allocationAmount: requiredAmount(formData),
    correlationId: crypto.randomUUID(),
  });
  if (!result.succeeded) redirectWithError(detailPath, result.errorCode);
  revalidatePath(claimsPath);
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function updateRetentionAllocationAction(formData: FormData) {
  const { projectSlug, claimsPath, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  const result = await updateRetentionClaimAllocation({
    allocationId: requiredUuid(formData, "allocationId"),
    expectedDraftRevision: requiredRevision(formData),
    allocationAmount: requiredAmount(formData),
    correlationId: crypto.randomUUID(),
  });
  if (!result.succeeded) redirectWithError(detailPath, result.errorCode);
  revalidatePath(claimsPath);
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function removeRetentionAllocationAction(formData: FormData) {
  const { projectSlug, claimsPath, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  const result = await removeRetentionClaimAllocation({
    allocationId: requiredUuid(formData, "allocationId"),
    expectedDraftRevision: requiredRevision(formData),
    correlationId: crypto.randomUUID(),
  });
  if (!result.succeeded) redirectWithError(detailPath, result.errorCode);
  revalidatePath(claimsPath);
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function submitRetentionClaimAction(formData: FormData) {
  const { projectSlug, claimsPath, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  const result = await submitRetentionClaim({
    retentionClaimId: claimId,
    expectedDraftRevision: requiredRevision(formData),
    expectedPositionStateHash: field(formData, "positionStateHash", 64),
    expectedEligibilityStateHash: field(formData, "eligibilityStateHash", 64),
    correlationId: crypto.randomUUID(),
  });
  if (!result.succeeded) redirectWithError(detailPath, result.errorCode);
  revalidatePath(claimsPath);
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function cancelRetentionClaimAction(formData: FormData) {
  const {
    projectSlug,
    claimsPath,
    registerHref,
    retentionClaimBasePath,
  } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  const reason = field(formData, "reason", 1000);
  if (!reason) throw new Error("A cancellation reason is required.");
  const result = await cancelRetentionClaimDraft({
    retentionClaimId: claimId,
    expectedDraftRevision: requiredRevision(formData),
    reason,
    correlationId: crypto.randomUUID(),
  });
  if (!result.succeeded) redirectWithError(detailPath, result.errorCode);
  revalidatePath(claimsPath);
  redirect(registerHref);
}

export async function generateRetentionClaimDocumentAction(formData: FormData) {
  const { projectSlug, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  redirectWithError(detailPath, "retention_documents_retired");
}

export async function syncRetentionClaimToXeroAction(formData: FormData) {
  const { projectSlug, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  redirectWithError(detailPath, "use_master_retention_push");
}

export async function retryRetentionClaimXeroAttachmentAction(formData: FormData) {
  const { projectSlug, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  redirectWithError(detailPath, "retention_attachments_retired");
}

export async function recordManualRetentionClaimPaymentAction(
  formData: FormData,
) {
  const { projectSlug, claimsPath, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  const result = await recordManualRetentionClaimPayment({
    retentionClaimId: claimId,
    paidAmount: nonnegativeAmount(formData, "paidAmount"),
    expectedPreviousReconciliationId: optionalUuid(
      formData,
      "expectedPreviousReconciliationId",
    ),
    correlationId: crypto.randomUUID(),
  });
  if (!result.succeeded) redirectWithError(detailPath, result.errorCode);
  revalidatePath(claimsPath);
  revalidatePath(detailPath);
  redirect(`${detailPath}?paymentReconciled=true`);
}

export async function refreshRetentionClaimPaymentAction(
  formData: FormData,
) {
  const { projectSlug, retentionClaimBasePath } = paths(formData);
  const claimId = requiredUuid(formData, "retentionClaimId");
  await assertClaimRoute(projectSlug, claimId);
  const detailPath = `${retentionClaimBasePath}/${claimId}`;
  const result = await enqueueRetentionClaimPaymentRefresh({
    retentionClaimId: claimId,
  });
  if (!result.succeeded) redirectWithError(detailPath, result.errorCode);
  revalidatePath(detailPath);
  redirect(`${detailPath}?paymentRefreshQueued=true`);
}

export type RetentionClaimXeroActionError = {
  code: string;
  message: string;
  supportReference: string | null;
};

export type RetentionClaimXeroPanelActionResult =
  | { ok: true; state: RetentionClaimImmutableXeroPanelState }
  | { ok: false; error: RetentionClaimXeroActionError };

export type MasterRetentionDateEditState = {
  claimDate: string;
  dueDate: string;
  optimisticRevision: number;
};

export type MasterRetentionDateActionResult =
  | {
      ok: true;
      changed: boolean;
      dates: MasterRetentionDateEditState;
    }
  | { ok: false; error: RetentionClaimXeroActionError };

type MasterRetentionDateRpcResult = {
  succeeded?: boolean;
  errorCode?: string | null;
  changed?: boolean;
  claimDate?: string | null;
  dueDate?: string | null;
  optimisticRevision?: number | string | null;
};

function masterRetentionDateError(
  code: string | null | undefined,
): RetentionClaimXeroActionError {
  const messages: Record<string, string> = {
    RETENTION_DATE_RESET_BLOCKED:
      "The Retention Claim dates cannot be edited while the linked Xero invoice requires attention.",
    RETENTION_DATES_INVALID:
      "Enter valid Claim and Due dates. The Due Date cannot be before the Claim Date.",
    RETENTION_DATES_STALE:
      "The Retention Claim changed. Reload the latest dates before saving.",
    RETENTION_DATES_UNCHANGED:
      "The Retention Claim dates are already current.",
  };
  return {
    code: code ?? "RETENTION_DATE_UPDATE_REJECTED",
    message: messages[code ?? ""]
      ?? "TradesStack could not safely update the Retention Claim dates.",
    supportReference: null,
  };
}

function parseMasterRetentionDateRpc(
  data: MasterRetentionDateRpcResult | null,
): MasterRetentionDateActionResult {
  if (
    !data?.succeeded
    || typeof data.claimDate !== "string"
    || typeof data.dueDate !== "string"
  ) {
    return {
      ok: false,
      error: masterRetentionDateError(data?.errorCode),
    };
  }
  const optimisticRevision = Number(data.optimisticRevision);
  if (!Number.isSafeInteger(optimisticRevision) || optimisticRevision < 1) {
    return {
      ok: false,
      error: masterRetentionDateError("RETENTION_DATES_STALE"),
    };
  }
  return {
    ok: true,
    changed: data.changed === true,
    dates: {
      claimDate: data.claimDate,
      dueDate: data.dueDate,
      optimisticRevision,
    },
  };
}

export async function resetMasterRetentionClaimDatesAction(params: {
  retentionClaimId: string;
}): Promise<MasterRetentionDateActionResult> {
  const timing = createXeroActionTiming({
    domain: "retention_claim",
    action: "reset",
    claimId: params.retentionClaimId,
  });
  timing.stage("action_start");
  if (!UUID_PATTERN.test(params.retentionClaimId)) {
    timing.failed("master_validation");
    return {
      ok: false,
      error: masterRetentionDateError("RETENTION_DATE_RESET_BLOCKED"),
    };
  }
  const supabase = await timing.measure(
    "supabase_client",
    () => createServerSupabaseClient(),
  );
  const resetRpc = () => (supabase.rpc as unknown as (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<{
    data: MasterRetentionDateRpcResult | null;
    error: { message: string } | null;
  }>)("reset_master_retention_claim_dates", {
    p_retention_claim_id: params.retentionClaimId,
  });
  const result = await timing.measure("reset_transaction", resetRpc, {
    databaseOperation: "reset_master_retention_claim_dates",
  });
  if (result.error) {
    timing.failed("accounting_safety_checks");
    return {
      ok: false,
      error: masterRetentionDateError("RETENTION_DATE_UPDATE_REJECTED"),
    };
  }
  const response = parseMasterRetentionDateRpc(result.data);
  timing.stage("response_build");
  timing.complete();
  return response;
}

export async function updateMasterRetentionClaimDatesAction(params: {
  retentionClaimId: string;
  claimDate: string;
  dueDate: string;
  optimisticRevision: number;
}): Promise<MasterRetentionDateActionResult> {
  if (
    !UUID_PATTERN.test(params.retentionClaimId)
    || !DATE_PATTERN.test(params.claimDate)
    || !DATE_PATTERN.test(params.dueDate)
    || !Number.isSafeInteger(params.optimisticRevision)
    || params.optimisticRevision < 1
  ) {
    return {
      ok: false,
      error: masterRetentionDateError("RETENTION_DATES_INVALID"),
    };
  }
  const claimDate = new Date(`${params.claimDate}T00:00:00Z`);
  const dueDate = new Date(`${params.dueDate}T00:00:00Z`);
  if (
    Number.isNaN(claimDate.getTime())
    || Number.isNaN(dueDate.getTime())
    || claimDate.toISOString().slice(0, 10) !== params.claimDate
    || dueDate.toISOString().slice(0, 10) !== params.dueDate
    || dueDate < claimDate
  ) {
    return {
      ok: false,
      error: masterRetentionDateError("RETENTION_DATES_INVALID"),
    };
  }
  const supabase = await createServerSupabaseClient();
  const result = await (supabase.rpc as unknown as (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<{
    data: MasterRetentionDateRpcResult | null;
    error: { message: string } | null;
  }>)("update_master_retention_claim_dates", {
    p_retention_claim_id: params.retentionClaimId,
    p_claim_date: params.claimDate,
    p_due_date: params.dueDate,
    p_expected_revision: params.optimisticRevision,
    p_correlation_id: crypto.randomUUID(),
  });
  if (result.error) {
    return {
      ok: false,
      error: masterRetentionDateError("RETENTION_DATE_UPDATE_REJECTED"),
    };
  }
  return parseMasterRetentionDateRpc(result.data);
}

function immutableXeroActionError(
  error: unknown,
  fallbackSupportReference: string | null = null,
): RetentionClaimXeroActionError {
  if (error instanceof RetentionClaimProposalDecisionError) {
    return {
      code: error.code,
      message: error.message,
      supportReference: null,
    };
  }
  if (error instanceof RetentionClaimPushError) {
    return {
      code: error.code,
      message: error.message,
      supportReference: error.supportReference ?? fallbackSupportReference,
    };
  }
  if (error instanceof RetentionClaimLegacyAdoptionError) {
    return {
      code: error.code,
      message: error.message,
      supportReference: error.supportReference ?? fallbackSupportReference,
    };
  }
  const raw = error instanceof Error ? error.message : "";
  return {
    code: /tenant|organisation/i.test(raw)
      ? "wrong_tenant"
      : /connection|scope|authorization|reconnect/i.test(raw)
        ? "connection_unavailable"
        : /payment/i.test(raw)
          ? "payments_exist"
          : /credit/i.test(raw)
            ? "credits_exist"
            : /uncertain|ambiguous|may have created/i.test(raw)
              ? "uncertain_result"
              : "database_failure",
    message: raw && !/sql|postgres|constraint|relation|column/i.test(raw)
      ? raw
      : "TradesStack could not complete the Retention Claim Xero action.",
    supportReference: fallbackSupportReference,
  };
}

export type RetentionClaimPushProposalActionResult =
  | {
      ok: true;
      preview: ReturnType<typeof toRetentionClaimPushPreview>;
      proposalToken: string;
    }
  | { ok: false; error: RetentionClaimXeroActionError };

function retentionSubmissionError(code: string | null) {
  const messages: Record<string, string> = {
    claim_not_found:
      "The Retention Claim is not available in this organisation.",
    claim_not_ready:
      "Only a saved valid Retention Claim can be pushed to Xero.",
    concurrent_update:
      "The saved Retention Claim changed. Reload it and review the latest values before pushing to Xero.",
    stale_draft:
      "The Retention position changed. Save the Retention Claim again before pushing to Xero.",
    stale_schedule:
      "Retention eligibility changed. Save the Retention Claim again before pushing to Xero.",
    stale_eligibility:
      "Retention eligibility changed. Save the Retention Claim again before pushing to Xero.",
    invalid_allocation_amount:
      "Save the Retention Claim and resolve its invalid lines before pushing to Xero.",
    allocation_exceeds_eligibility:
      "A Retention Claim line exceeds current eligibility. Review and save the Claim before pushing.",
    retention_not_eligible:
      "A Retention Claim line is not currently eligible. Review and save the Claim before pushing.",
    retention_overallocated:
      "A Retention Claim line exceeds current retention ownership. Review and save the Claim before pushing.",
    variance_blocking:
      "A blocking Retention variance must be resolved before pushing this Claim to Xero.",
    immutable_document_failed:
      "The submitted Retention Claim is safe, but its structured Xero preview could not be prepared. Click Push to Xero again to retry.",
  };
  return {
    code: code === "immutable_document_failed"
      ? "RETENTION_PROPOSAL_PREPARATION_FAILED"
      : code ?? "retention_submission_failed",
    message: messages[code ?? ""] ??
      "The saved Retention Claim could not be finalised. Review and save it before pushing to Xero.",
    supportReference: null,
  };
}

async function refreshRetentionClaimEvidenceIfStale(params: {
  organizationId: string;
  retentionClaimId: string;
  createdByUserId: string;
}) {
  const untypedAdmin = createAdminSupabaseClient() as unknown as {
    // Immutable accounting objects intentionally precede generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => any;
  };
  const document = await untypedAdmin
    .from("organization_accounting_documents")
    .select("id,active_accounting_revision_id")
    .eq("organization_id", params.organizationId)
    .eq("local_document_type", "retention_claim")
    .eq("retention_claim_id", params.retentionClaimId)
    .eq("integration_contract", "retention_claim_revision_v1")
    .maybeSingle();
  if (document.error) throw new Error(document.error.message);
  if (!document.data?.active_accounting_revision_id) return false;
  const observation = await untypedAdmin
    .from("organization_accounting_remote_observations")
    .select("observed_at")
    .eq("organization_id", params.organizationId)
    .eq(
      "accounting_revision_id",
      document.data.active_accounting_revision_id,
    )
    .order("observed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (observation.error) throw new Error(observation.error.message);
  const observedAt = Date.parse(String(observation.data?.observed_at ?? ""));
  if (
    Number.isFinite(observedAt)
    && observedAt >= Date.now() - 24 * 60 * 60 * 1000
  ) {
    return false;
  }
  const refresh = await enqueueRetentionClaimRevisionRefresh({
    organizationId: params.organizationId,
    accountingDocumentId: document.data.id,
    createdByUserId: params.createdByUserId,
    triggerSource: "manual_refresh",
  });
  const execution = await runXeroSyncWorker({
    organizationId: params.organizationId,
    jobId: refresh.jobId,
    limit: 1,
    workerId: `retention-claim-preview-refresh-${refresh.jobId}`,
  });
  if (execution.completedCount !== 1) {
    throw new Error(
      "The latest Xero invoice state could not be verified for this preview.",
    );
  }
  return true;
}

async function prepareRetentionClaimPushProposal(params: {
  retentionClaimId: string;
}, timing?: XeroActionTiming): Promise<{
  result: RetentionClaimPushProposalActionResult;
  proposal?: RetentionClaimPushProposal;
  requestContext?: AccountingSyncRequestContext;
}> {
  let submittedInternally = false;
  try {
    const member = await getCurrentOrganizationMember();
    if (!member) {
      return {
        result: {
          ok: false,
          error: {
            code: "unauthorized",
            message: "You do not have permission to Push Retention Claims to Xero.",
            supportReference: null,
          },
        },
      };
    }
    const authorisation = timing?.startParallelGroup("authorisation");
    const runAuthorisation = <T>(stage: string, operation: () => Promise<T>) =>
      authorisation ? authorisation.measure(stage, operation) : operation();
    const [permissions, featureEnabled] = await Promise.all([
      runAuthorisation("permission_batch", () =>
        getOrganizationPermissionsBatch({
          organizationId: member.organization_id,
          permissions: [
            RETENTION_CLAIM_PUSH_PERMISSION,
            "retention.claims.create",
          ],
        })),
      runAuthorisation("feature_gate", () =>
        isRetentionClaimImmutableXeroEnabled(member.organization_id)),
    ]);
    authorisation?.complete();
    if (permissions[RETENTION_CLAIM_PUSH_PERMISSION] !== true) {
      return {
        result: {
          ok: false,
          error: {
            code: "unauthorized",
            message:
              "You do not have permission to Push Retention Claims to Xero.",
            supportReference: null,
          },
        },
      };
    }
    let requestContext = createAccountingSyncRequestContextFromIdentity({
      identity: {
        userId: member.user_id,
        organizationId: member.organization_id,
        membershipId: member.id,
      },
      claimId: params.retentionClaimId,
      permissions,
      featureFlags: { retentionClaimImmutableXeroEnabled: featureEnabled },
    });
    // The browser supplies only identity. This boundary reloads the complete
    // saved Claim, atomically submits a valid Draft, then reloads Submitted.
    // Retention accounting evidence is structured; no PDF is generated.
    const prepareClaim = () => prepareRetentionClaimForXeroPreview({
      organizationId: member.organization_id,
      retentionClaimId: params.retentionClaimId,
    }, {
      loadWorkspace: getRetentionClaimWorkspace,
      reloadClaim: getRetentionClaim,
      submitClaim: submitRetentionClaim,
      correlationId: () => crypto.randomUUID(),
    });
    const preparation = timing
      ? await timing.measure("master_source_load", prepareClaim)
      : await prepareClaim();
    submittedInternally = preparation.submittedInternally;
    // Adoption is a deliberate side effect of the user's Push action, never
    // passive panel rendering. It also runs only after immutable submission.
    const adopt = () => adoptLegacyVoidedRetentionClaimIfNeeded({
      organizationId: member.organization_id,
      retentionClaimId: params.retentionClaimId,
      actorUserId: member.user_id,
    });
    if (timing) await timing.measure("legacy_adoption", adopt);
    else await adopt();
    // Proposal decisions use the latest immutable observation. If the active
    // InvoiceID has no sufficiently current evidence, perform one synchronous
    // read-only Xero refresh before resolving the operation.
    const refreshEvidence = () => refreshRetentionClaimEvidenceIfStale({
      organizationId: member.organization_id,
      retentionClaimId: params.retentionClaimId,
      createdByUserId: member.user_id,
    });
    if (timing) {
      await timing.measure("provider_freshness_check", refreshEvidence);
    } else {
      await refreshEvidence();
    }
    const build = () => buildRetentionClaimPushProposal({
      organizationId: member.organization_id,
      retentionClaimId: params.retentionClaimId,
      hasPushPermission: true,
    }, timing, { featureEnabled });
    const proposal = timing
      ? await timing.measure("proposal_build", build)
      : await build();
    const persist = () => persistRetentionClaimPushProposal({
      proposal,
      createdBy: member.user_id,
    });
    if (timing) await timing.measure("proposal_persistence", persist);
    else await persist();
    requestContext = extendAccountingSyncRequestContext(requestContext, {
      projectId: proposal.projectId,
      accountingDocumentId: proposal.accountingDocumentId,
      revisionId: proposal.previousRevisionId,
    });
    return {
      result: {
        ok: true,
        preview: toRetentionClaimPushPreview(proposal),
        proposalToken: createRetentionClaimPushProposalToken(proposal),
      },
      proposal,
      requestContext,
    };
  } catch (error) {
    const submissionFailure =
      error instanceof RetentionClaimPushPreparationError ? error : null;
    if (submittedInternally || submissionFailure?.submittedInternally) {
      return {
        result: {
          ok: false,
          error: {
            code: "RETENTION_PROPOSAL_PREPARATION_FAILED",
            message:
              "The Retention Claim was finalised, but its Xero preview could not be prepared. Push to Xero again to retry; the Claim will not be submitted twice.",
            supportReference: null,
          },
        },
      };
    }
    if (submissionFailure) {
      return {
        result: {
          ok: false,
          error: retentionSubmissionError(submissionFailure.code),
        },
      };
    }
    return {
      result: { ok: false, error: immutableXeroActionError(error) },
    };
  }
}

export async function loadRetentionClaimPushProposalAction(params: {
  retentionClaimId: string;
}): Promise<RetentionClaimPushProposalActionResult> {
  return (await prepareRetentionClaimPushProposal(params)).result;
}

async function confirmRetentionClaimPushPrepared(params: {
  proposalToken: string;
}, timing?: XeroActionTiming, prepared?: {
  proposal: RetentionClaimPushProposal;
  requestContext: AccountingSyncRequestContext;
}): Promise<RetentionClaimXeroPanelActionResult> {
  let supportReference: string | null = null;
  try {
    const token = verifyRetentionClaimPushProposalToken(params.proposalToken);
    const confirmation = await confirmRetentionClaimPush(
      params,
      prepared?.proposal,
      timing,
      prepared?.requestContext,
    );
    supportReference = confirmation.jobId;
    timing?.identify({
      accountingDocumentId: confirmation.accountingDocumentId,
      revisionId: confirmation.accountingRevisionId,
      jobId: confirmation.jobId,
    });
    if (confirmation.status !== "queued") {
      try {
        return {
          ok: true,
          state: await getRetentionClaimImmutableXeroPanel(
            token.retentionClaimId,
            timing,
            prepared?.requestContext,
          ),
        };
      } catch {
        return {
          ok: false,
          error: {
            code: "RETENTION_PANEL_RELOAD_FAILED",
            message:
              "The existing Xero invoice update is complete, but the Accounting Sync panel could not reload. Refresh the page to view the successful update.",
            supportReference: confirmation.jobId,
          },
        };
      }
    }
    timing?.stage("worker_dispatch_ready");
    const execution = timing
      ? await timing.measure("worker_execution", () => runXeroSyncWorker({
          organizationId: token.organizationId,
          jobId: confirmation.jobId,
          limit: 1,
          workerId: `retention-claim-confirm-${confirmation.jobId}`,
          timing,
        }))
      : await runXeroSyncWorker({
          organizationId: token.organizationId,
          jobId: confirmation.jobId,
          limit: 1,
          workerId: `retention-claim-confirm-${confirmation.jobId}`,
        });
    if (execution.completedCount !== 1) {
      const job = await createAdminSupabaseClient()
        .from("organization_accounting_sync_jobs")
        .select("last_error")
        .eq("organization_id", token.organizationId)
        .eq("id", confirmation.jobId)
        .maybeSingle();
      return {
        ok: false,
        error: immutableXeroActionError(
          new Error(job.error
            ? "The persisted Retention Claim Xero job requires attention."
            : job.data?.last_error
              ?? "The persisted Retention Claim Xero job requires attention."),
          confirmation.jobId,
        ),
      };
    }
    try {
      const completedContext = prepared?.requestContext
        ? extendAccountingSyncRequestContext(prepared.requestContext, {
            accountingDocumentId: confirmation.accountingDocumentId,
            revisionId: confirmation.accountingRevisionId,
          })
        : undefined;
      const completionEvidence = retentionCompletionEvidence(execution);
      const localComparison = completionEvidence
        ? timing
          ? await timing.measure("local_commercial_comparison", () =>
              loadRetentionClaimLocalAccountingComparison({
                evidence: completionEvidence,
              }))
          : await loadRetentionClaimLocalAccountingComparison({
              evidence: completionEvidence,
            })
        : null;
      const fastState = completedContext && completionEvidence && localComparison
        && completionEvidenceMatches({
          evidence: completionEvidence,
          organizationId: token.organizationId,
          claimId: token.retentionClaimId,
          accountingDocumentId: confirmation.accountingDocumentId,
          activeRevisionId: confirmation.accountingRevisionId,
          jobId: confirmation.jobId,
        })
          ? deriveRetentionClaimPanelFromCompletionEvidence({
            evidence: completionEvidence,
            requestContext: completedContext,
            localComparison,
          })
        : null;
      if (fastState) {
        timing?.stage("completion_fast_path", {
          cacheStatus: "hit",
        });
        return { ok: true, state: fastState };
      }
      const state = timing
        ? await timing.measure("final_panel_load", () =>
            getRetentionClaimImmutableXeroPanel(
              token.retentionClaimId,
              timing,
              completedContext,
            ))
        : await getRetentionClaimImmutableXeroPanel(
            token.retentionClaimId,
            undefined,
            completedContext,
          );
      return {
        ok: true,
        state,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "RETENTION_PANEL_RELOAD_FAILED",
          message:
            "The existing Xero invoice was updated successfully, but the Accounting Sync panel could not reload. Refresh the page to view the successful update.",
          supportReference: confirmation.jobId,
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: immutableXeroActionError(error, supportReference),
    };
  }
}

export async function confirmRetentionClaimPushAction(params: {
  proposalToken: string;
}): Promise<RetentionClaimXeroPanelActionResult> {
  return confirmRetentionClaimPushPrepared(params);
}

export async function pushRetentionClaimToXeroAction(params: {
  retentionClaimId: string;
}): Promise<RetentionClaimXeroPanelActionResult> {
  const timing = createXeroActionTiming({
    domain: "retention_claim",
    action: "push",
    claimId: params.retentionClaimId,
  });
  timing.stage("action_start");
  const result = await executeOneClickClaimPush<
    RetentionClaimImmutableXeroPanelState,
    RetentionClaimXeroActionError,
    {
      proposal: RetentionClaimPushProposal;
      requestContext: AccountingSyncRequestContext;
    }
  >({
    prepare: async () => {
      const prepared = await prepareRetentionClaimPushProposal({
      retentionClaimId: params.retentionClaimId,
      }, timing);
      return prepared.result.ok && prepared.proposal && prepared.requestContext
        ? {
            ...prepared.result,
            serverContext: {
              proposal: prepared.proposal,
              requestContext: prepared.requestContext,
            },
          }
        : prepared.result;
    },
    confirm: (proposalToken, prepared) => confirmRetentionClaimPushPrepared({
      proposalToken,
    }, timing, prepared),
    recover: async (failed) => {
      if (!failed.error.supportReference) return failed;
      try {
        const state = await getRetentionClaimImmutableXeroPanel(
          params.retentionClaimId,
        );
        return state.status === "synced" ? { ok: true, state } : failed;
      } catch {
        return failed;
      }
    },
  });
  const recovered = result.ok
    ? result
    : await recoverSynchronizedRetentionClaimPanel({
        failed: result,
        loadPanel: () => getRetentionClaimImmutableXeroPanel(
          params.retentionClaimId,
        ),
      });
  timing.complete();
  return recovered;
}

export async function refreshRetentionClaimXeroAction(params: {
  retentionClaimId: string;
}): Promise<RetentionClaimXeroPanelActionResult> {
  const timing = createXeroActionTiming({
    domain: "retention_claim",
    action: "refresh",
    claimId: params.retentionClaimId,
  });
  try {
    const member = await getCurrentOrganizationMember();
    if (!member) {
      timing.failed("authorisation");
      return {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Sign in before refreshing this Xero invoice.",
          supportReference: null,
        },
      };
    }
    const authorisation = timing.startParallelGroup("authorisation");
    const [permissions, featureEnabled] = await Promise.all([
      authorisation.measure("permission_batch", () =>
        getOrganizationPermissionsBatch({
          organizationId: member.organization_id,
          permissions: [
            RETENTION_CLAIM_PUSH_PERMISSION,
            "retention.claims.create",
          ],
        })),
      authorisation.measure("feature_gate", () =>
        isRetentionClaimImmutableXeroEnabled(member.organization_id)),
    ]);
    authorisation.complete();
    const identity = await timing.measure("identity_load", () =>
      getRetentionClaimRefreshIdentity({
        organizationId: member.organization_id,
        retentionClaimId: params.retentionClaimId,
        prepared: { featureEnabled, permissions },
      }));
    const requestContext = createAccountingSyncRequestContextFromIdentity({
      identity: {
        userId: member.user_id,
        organizationId: member.organization_id,
        membershipId: member.id,
      },
      claimId: params.retentionClaimId,
      permissions,
      featureFlags: { retentionClaimImmutableXeroEnabled: featureEnabled },
      projectId: identity.projectId,
      accountingDocumentId: identity.accountingDocumentId,
      revisionId: identity.activeRevisionId,
    });
    timing.identify({
      accountingDocumentId: identity.accountingDocumentId,
    });
    const refresh = await enqueueRetentionClaimRevisionRefresh({
      organizationId: member.organization_id,
      accountingDocumentId: identity.accountingDocumentId,
      createdByUserId: member.user_id,
      triggerSource: "manual_refresh",
    }, timing);
    timing.identify({ jobId: refresh.jobId });
    timing.stage("job_creation");
    const execution = await timing.measure("worker_execution", () => runXeroSyncWorker({
      organizationId: member.organization_id,
      jobId: refresh.jobId,
      limit: 1,
      workerId: `retention-claim-refresh-${refresh.jobId}`,
      timing,
    }));
    const completionEvidence = retentionCompletionEvidence(execution);
    const localComparison = completionEvidence
      ? await timing.measure("local_commercial_comparison", () =>
          loadRetentionClaimLocalAccountingComparison({
            evidence: completionEvidence,
          }))
      : null;
    const fastState = completionEvidence && localComparison
      && completionEvidenceMatches({
        evidence: completionEvidence,
        organizationId: member.organization_id,
        claimId: params.retentionClaimId,
        accountingDocumentId: identity.accountingDocumentId,
        activeRevisionId: identity.activeRevisionId,
        jobId: refresh.jobId,
      })
      ? deriveRetentionClaimPanelFromCompletionEvidence({
          evidence: completionEvidence,
          requestContext,
          localComparison,
        })
      : null;
    if (fastState) {
      timing.stage("completion_fast_path", {
        cacheStatus: "hit",
      });
      timing.complete();
      return { ok: true, state: fastState };
    }
    const state = await timing.measure("final_panel_load", () =>
      getRetentionClaimImmutableXeroPanel(
        params.retentionClaimId,
        timing,
        requestContext,
      ));
    timing.complete();
    return {
      ok: true,
      state,
    };
  } catch (error) {
    timing.failed("action_complete");
    return { ok: false, error: immutableXeroActionError(error) };
  }
}

export async function retryRetentionClaimXeroAttachmentPhase2cAction(params: {
  retentionClaimId: string;
}): Promise<RetentionClaimXeroPanelActionResult> {
  void params;
  return {
    ok: false,
    error: {
      code: "retention_attachments_retired",
      message:
        "Retention Claim PDFs and Xero attachment retries are retired for the cumulative master workflow.",
      supportReference: null,
    },
  };
}

export async function getRetentionClaimXeroPanelAction(params: {
  retentionClaimId: string;
}): Promise<RetentionClaimXeroPanelActionResult> {
  const timing = createXeroActionTiming({
    domain: "retention_claim",
    action: "panel_load",
    claimId: params.retentionClaimId,
  });
  try {
    const state = await timing.measure("final_panel_load", () =>
      getRetentionClaimImmutableXeroPanel(
        params.retentionClaimId,
        timing,
      ));
    timing.complete();
    return {
      ok: true,
      state,
    };
  } catch (error) {
    timing.failed("action_complete");
    return { ok: false, error: immutableXeroActionError(error) };
  }
}
