"use server";

import {
  enqueuePaymentClaimXeroSync,
  derivePaymentClaimPanelFromCompletionEvidence,
  getPaymentClaimXeroPanelState,
  PaymentClaimXeroEnqueueError,
  type PaymentClaimXeroPanelState,
} from "@/lib/xero/payment-claim-sales-invoice-panel";
import {
  enqueuePaymentClaimXeroRefreshForCurrentUser,
  XeroSalesInvoiceRefreshError,
} from "@/lib/xero/payment-claim-sales-invoice-refresh";
import {
  enqueuePaymentClaimXeroAttachmentForCurrentUser,
  XeroSalesInvoiceAttachmentError,
} from "@/lib/xero/payment-claim-sales-invoice-attachment";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
  type PaymentClaimInitialPushProposal,
} from "@/lib/xero/payment-claim-initial-push-contract";
import {
  buildPaymentClaimPushProposal,
  createInitialPushProposalToken,
  persistPaymentClaimPushProposal,
  toInitialPushPreview,
  verifyInitialPushProposalToken,
  type PaymentClaimInitialPushPreview,
  isPaymentClaimInitialPushEnabled,
} from "@/lib/xero/payment-claim-initial-push-proposal";
import {
  confirmPaymentClaimPush,
  PaymentClaimInitialPushError,
} from "@/lib/xero/payment-claim-initial-push-confirmation";
import { runXeroSyncWorker } from "@/lib/xero/sync";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  adoptLegacyVoidedPaymentClaimIfNeeded,
  PaymentClaimLegacyAdoptionError,
} from "@/lib/xero/payment-claim-legacy-adoption";
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
  loadPaymentClaimLocalAccountingComparison,
  parseAccountingSyncCompletionEvidence,
} from "@/lib/xero/accounting-sync-completion-evidence";

function paymentCompletionEvidence(
  execution: Awaited<ReturnType<typeof runXeroSyncWorker>>,
) {
  return parseAccountingSyncCompletionEvidence(
    execution.results[0]?.summary.completionEvidence,
  );
}

export type PaymentClaimXeroActionError = {
  code: string;
  message: string;
  supportReference: string | null;
};

export type PaymentClaimXeroPanelActionResult =
  | { ok: true; state: PaymentClaimXeroPanelState }
  | { ok: false; error: PaymentClaimXeroActionError };

function actionError(
  code: string,
  message: string,
  supportReference: string | null = null,
): PaymentClaimXeroActionError {
  return { code, message, supportReference };
}

function safeActionError(
  error: unknown,
  supportReference: string | null = null,
): PaymentClaimXeroActionError {
  if (error instanceof PaymentClaimXeroEnqueueError) {
    return actionError(error.code, error.message, supportReference);
  }
  if (error instanceof XeroSalesInvoiceRefreshError) {
    return actionError(error.code, error.safeMessage, supportReference);
  }
  if (error instanceof XeroSalesInvoiceAttachmentError) {
    return actionError(error.code, error.safeMessage, supportReference);
  }
  if (error instanceof PaymentClaimInitialPushError) {
    if ([
      "PAYMENT_CLAIM_CHANGED",
      "ACCOUNTING_STATE_CHANGED",
      "ACTIVE_REVISION_CHANGED",
      "XERO_EVIDENCE_CHANGED",
      "PROPOSAL_EXPIRED",
    ].includes(error.code)) {
      return actionError(
        error.code,
        error.message,
        error.supportReference ?? supportReference,
      );
    }
    if (error.code === "stale_proposal") {
      return actionError("proposal_stale", error.message, supportReference);
    }
    if (error.code === "not_ready") {
      const message = error.message;
      if (/partially paid/i.test(message)) {
        return actionError("previous_invoice_part_paid", message, supportReference);
      }
      if (/payments/i.test(message)) {
        return actionError("previous_invoice_paid", message, supportReference);
      }
      if (/credits/i.test(message)) {
        return actionError("previous_invoice_credited", message, supportReference);
      }
      if (/tenant|organisation/i.test(message)) {
        return actionError("wrong_xero_organisation", message, supportReference);
      }
      if (/connection|authorization|scope/i.test(message)) {
        return actionError(
          "xero_connection_unavailable",
          "Reconnect Xero before pushing this Payment Claim.",
          supportReference,
        );
      }
      if (/voided|replacement eligible/i.test(message)) {
        return actionError(
          "previous_invoice_not_voided",
          "The previous Xero invoice is no longer confirmed as voided.",
          supportReference,
        );
      }
      return actionError("payment_claim_not_ready", message, supportReference);
    }
    if (error.code === "invalid_proposal") {
      return actionError("proposal_invalid", error.message, supportReference);
    }
    if (error.code === "unauthorized") {
      return actionError("unauthorized", error.message, supportReference);
    }
    if (
      error.code === "payment_update_confirmation_rpc_failed"
      || error.code === "payment_update_confirmation_result_invalid"
    ) {
      return actionError(
        error.code,
        "TradesStack could not persist the confirmed accounting operation.",
        error.supportReference ?? supportReference,
      );
    }
    return actionError(
      "internal_database_failure",
      "TradesStack could not persist the confirmed accounting operation.",
      error.supportReference ?? supportReference,
    );
  }
  if (error instanceof PaymentClaimLegacyAdoptionError) {
    return actionError(
      error.code,
      error.message,
      error.supportReference ?? supportReference,
    );
  }
  return actionError(
    "internal_action_failure",
    "TradesStack could not complete the Xero Sales Invoice action.",
    supportReference,
  );
}

function safePersistedWorkerError(
  message: string | null,
  supportReference: string,
): PaymentClaimXeroActionError {
  const value = message ?? "";
  if (/uncertain|may have created|safely identifiable/i.test(value)) {
    return actionError(
      "invoice_result_uncertain",
      "Xero may have created the replacement invoice. TradesStack will not create another invoice until the result is safely recovered.",
      supportReference,
    );
  }
  if (/tenant|organisation/i.test(value)) {
    return actionError(
      "wrong_xero_organisation",
      "The linked Xero organisation could not be confirmed.",
      supportReference,
    );
  }
  if (/connection|authorization|scope|reconnect/i.test(value)) {
    return actionError(
      "xero_connection_unavailable",
      "Reconnect Xero before pushing this Payment Claim.",
      supportReference,
    );
  }
  if (/partially paid/i.test(value)) {
    return actionError(
      "previous_invoice_part_paid",
      "The previous Xero invoice is partially paid and cannot be replaced.",
      supportReference,
    );
  }
  if (/payments/i.test(value)) {
    return actionError(
      "previous_invoice_paid",
      "The previous Xero invoice has payments and cannot be replaced.",
      supportReference,
    );
  }
  if (/credits/i.test(value)) {
    return actionError(
      "previous_invoice_credited",
      "The previous Xero invoice has credits and cannot be replaced.",
      supportReference,
    );
  }
  if (/voided|replacement eligible/i.test(value)) {
    return actionError(
      "previous_invoice_not_voided",
      "The previous Xero invoice is no longer confirmed as voided.",
      supportReference,
    );
  }
  if (/validation|rejected|content mismatch|wrong_/i.test(value)) {
    return actionError(
      "xero_invoice_rejected",
      "Xero rejected the confirmed replacement invoice or returned values that did not match it.",
      supportReference,
    );
  }
  return actionError(
    "internal_worker_failure",
    "TradesStack could not complete the confirmed replacement operation.",
    supportReference,
  );
}

export type PaymentClaimInitialPushProposalActionResult =
  | { ok: true; preview: PaymentClaimInitialPushPreview; proposalToken: string }
  | { ok: false; error: PaymentClaimXeroActionError };

async function preparePaymentClaimPushProposal(params: {
  claimId: string;
}, timing?: XeroActionTiming): Promise<{
  result: PaymentClaimInitialPushProposalActionResult;
  proposal?: PaymentClaimInitialPushProposal;
  requestContext?: AccountingSyncRequestContext;
}> {
  try {
    const member = await getCurrentOrganizationMember();
    if (!member) {
      return {
        result: {
          ok: false,
          error: actionError(
            "unauthorized",
            "You do not have permission to Push Payment Claims to Xero.",
          ),
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
            "accounting.sales_invoices.view",
            "accounting.sales_invoices.manage",
            PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
          ],
        })),
      runAuthorisation("feature_gate", () =>
        isPaymentClaimInitialPushEnabled(member.organization_id)),
    ]);
    authorisation?.complete();
    if (permissions[PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION] !== true) {
      return {
        result: {
          ok: false,
          error: actionError(
            "unauthorized",
            "You do not have permission to Push Payment Claims to Xero.",
          ),
        },
      };
    }
    let requestContext = createAccountingSyncRequestContextFromIdentity({
      identity: {
        userId: member.user_id,
        organizationId: member.organization_id,
        membershipId: member.id,
      },
      claimId: params.claimId,
      permissions,
      featureFlags: { initialPaymentClaimPushEnabled: featureEnabled },
    });
    const adopt = () => adoptLegacyVoidedPaymentClaimIfNeeded({
      organizationId: member.organization_id,
      claimId: params.claimId,
      actorUserId: member.user_id,
    });
    if (timing) await timing.measure("legacy_adoption", adopt);
    else await adopt();
    const build = () => buildPaymentClaimPushProposal({
      organizationId: member.organization_id,
      claimId: params.claimId,
    }, timing, { featureEnabled });
    const proposal = timing
      ? await timing.measure("proposal_build", build)
      : await build();
    const persist = () => persistPaymentClaimPushProposal({
      proposal,
      createdBy: member.user_id,
    });
    if (timing) await timing.measure("proposal_persistence", persist);
    else await persist();
    requestContext = extendAccountingSyncRequestContext(requestContext, {
      projectId: proposal.projectId,
      accountingDocumentId: proposal.accountingDocumentId,
    });
    return {
      result: {
        ok: true,
        preview: toInitialPushPreview(proposal),
        proposalToken: createInitialPushProposalToken(proposal),
      },
      proposal,
      requestContext,
    };
  } catch (error) {
    return {
      result: { ok: false, error: safeActionError(error) },
    };
  }
}

export async function loadPaymentClaimPushProposalAction(params: {
  claimId: string;
}): Promise<PaymentClaimInitialPushProposalActionResult> {
  return (await preparePaymentClaimPushProposal(params)).result;
}

export const loadPaymentClaimInitialPushProposalAction = loadPaymentClaimPushProposalAction;

async function confirmPaymentClaimPushPrepared(params: {
  proposalToken: string;
}, timing?: XeroActionTiming, prepared?: {
  proposal: PaymentClaimInitialPushProposal;
  requestContext: AccountingSyncRequestContext;
}): Promise<PaymentClaimXeroPanelActionResult> {
  let supportReference: string | null = null;
  try {
    const token = verifyInitialPushProposalToken(params.proposalToken);
    const confirmation = await confirmPaymentClaimPush(
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
    timing?.stage("worker_dispatch_ready");
    const execution = timing
      ? await timing.measure("worker_execution", () => runXeroSyncWorker({
          organizationId: token.organizationId,
          jobId: confirmation.jobId,
          limit: 1,
          workerId: `payment-claim-confirm-${confirmation.jobId}`,
          timing,
        }))
      : await runXeroSyncWorker({
          organizationId: token.organizationId,
          jobId: confirmation.jobId,
          limit: 1,
          workerId: `payment-claim-confirm-${confirmation.jobId}`,
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
        error: safePersistedWorkerError(
          job.error ? null : job.data?.last_error ?? null,
          confirmation.jobId,
        ),
      };
    }
    const completedContext = prepared?.requestContext
      ? extendAccountingSyncRequestContext(prepared.requestContext, {
          accountingDocumentId: confirmation.accountingDocumentId,
          revisionId: confirmation.accountingRevisionId,
        })
      : undefined;
    const completionEvidence = paymentCompletionEvidence(execution);
    const localComparison = completionEvidence
      ? timing
        ? await timing.measure("local_commercial_comparison", () =>
            loadPaymentClaimLocalAccountingComparison({
              evidence: completionEvidence,
            }))
        : await loadPaymentClaimLocalAccountingComparison({
            evidence: completionEvidence,
          })
      : null;
    const fastState = completedContext && completionEvidence && localComparison
      && completionEvidenceMatches({
        evidence: completionEvidence,
        organizationId: token.organizationId,
        claimId: token.claimId,
        accountingDocumentId: confirmation.accountingDocumentId,
        activeRevisionId: confirmation.accountingRevisionId,
        jobId: confirmation.jobId,
      })
        ? derivePaymentClaimPanelFromCompletionEvidence({
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
          getPaymentClaimXeroPanelState(
            { claimId: token.claimId },
            timing,
            completedContext,
          ))
      : await getPaymentClaimXeroPanelState(
          { claimId: token.claimId },
          undefined,
          completedContext,
        );
    return {
      ok: true,
      state,
    };
  } catch (error) {
    return { ok: false, error: safeActionError(error, supportReference) };
  }
}

export async function confirmPaymentClaimPushAction(params: {
  proposalToken: string;
}): Promise<PaymentClaimXeroPanelActionResult> {
  return confirmPaymentClaimPushPrepared(params);
}

export const confirmPaymentClaimInitialPushAction = confirmPaymentClaimPushAction;

export async function pushPaymentClaimToXeroAction(params: {
  claimId: string;
}): Promise<PaymentClaimXeroPanelActionResult> {
  const timing = createXeroActionTiming({
    domain: "payment_claim",
    action: "push",
    claimId: params.claimId,
  });
  timing.stage("action_start");
  const result = await executeOneClickClaimPush<
    PaymentClaimXeroPanelState,
    PaymentClaimXeroActionError,
    {
      proposal: PaymentClaimInitialPushProposal;
      requestContext: AccountingSyncRequestContext;
    }
  >({
    prepare: async () => {
      const prepared = await preparePaymentClaimPushProposal({
        claimId: params.claimId,
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
    confirm: (proposalToken, prepared) => confirmPaymentClaimPushPrepared({
      proposalToken,
    }, timing, prepared),
    recover: async (failed) => {
      if (!failed.error.supportReference) return failed;
      try {
        const state = await getPaymentClaimXeroPanelState({
          claimId: params.claimId,
        });
        return state.status === "synced" ? { ok: true, state } : failed;
      } catch {
        return failed;
      }
    },
  });
  timing.complete();
  return result;
}

export async function enqueuePaymentClaimXeroAttachmentAction(params: {
  claimId: string;
  intent: "attach" | "retry_attachment";
}): Promise<PaymentClaimXeroPanelActionResult> {
  try {
    await enqueuePaymentClaimXeroAttachmentForCurrentUser(params);
    return { ok: true, state: await getPaymentClaimXeroPanelState({ claimId: params.claimId }) };
  } catch (error) {
    return { ok: false, error: safeActionError(error) };
  }
}

export async function enqueuePaymentClaimXeroRefreshAction(params: {
  claimId: string;
  intent: "refresh";
}): Promise<PaymentClaimXeroPanelActionResult> {
  const timing = createXeroActionTiming({
    domain: "payment_claim",
    action: "refresh",
    claimId: params.claimId,
  });
  try {
    if (params.intent !== "refresh") throw new Error("Unsupported Xero refresh intent.");
    timing.stage("authorisation");
    const refresh = await enqueuePaymentClaimXeroRefreshForCurrentUser(
      { claimId: params.claimId },
      timing,
    );
    timing.identify({ jobId: refresh.jobId });
    timing.stage("job_creation");
    const execution = await timing.measure("worker_execution", () => runXeroSyncWorker({
      organizationId: refresh.organizationId,
      jobId: refresh.jobId,
      limit: 1,
      workerId: `payment-claim-refresh-${refresh.jobId}`,
      timing,
    }));
    const completionEvidence = paymentCompletionEvidence(execution);
    const localComparison = completionEvidence
      ? await timing.measure("local_commercial_comparison", () =>
          loadPaymentClaimLocalAccountingComparison({
            evidence: completionEvidence,
          }))
      : null;
    const fastState = completionEvidence && localComparison
      && refresh.requestContext.accountingDocumentId
      && refresh.requestContext.revisionId
      && completionEvidenceMatches({
        evidence: completionEvidence,
        organizationId: refresh.organizationId,
        claimId: params.claimId,
        accountingDocumentId: refresh.requestContext.accountingDocumentId,
        activeRevisionId: refresh.requestContext.revisionId,
        jobId: refresh.jobId,
      })
      ? derivePaymentClaimPanelFromCompletionEvidence({
          evidence: completionEvidence,
          requestContext: refresh.requestContext,
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
      getPaymentClaimXeroPanelState(
        { claimId: params.claimId },
        timing,
        refresh.requestContext,
      ));
    timing.complete();
    return { ok: true, state };
  } catch (error) {
    timing.failed("action_complete");
    return { ok: false, error: safeActionError(error) };
  }
}

export async function getPaymentClaimXeroPanelAction(params: {
  claimId: string;
}): Promise<PaymentClaimXeroPanelActionResult> {
  const timing = createXeroActionTiming({
    domain: "payment_claim",
    action: "panel_load",
    claimId: params.claimId,
  });
  try {
    const state = await timing.measure("final_panel_load", () =>
      getPaymentClaimXeroPanelState({ claimId: params.claimId }, timing));
    timing.complete();
    return { ok: true, state };
  } catch (error) {
    timing.failed("action_complete");
    return { ok: false, error: safeActionError(error) };
  }
}

export async function enqueuePaymentClaimXeroSyncAction(params: {
  claimId: string;
  intent: "sync";
}): Promise<PaymentClaimXeroPanelActionResult> {
  try {
    if (params.intent !== "sync") throw new Error("Unsupported Xero action intent.");
    await enqueuePaymentClaimXeroSync({ claimId: params.claimId });
    return { ok: true, state: await getPaymentClaimXeroPanelState({ claimId: params.claimId }) };
  } catch (error) {
    return { ok: false, error: safeActionError(error) };
  }
}
