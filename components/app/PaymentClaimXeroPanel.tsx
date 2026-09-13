"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ACCOUNTING_PAYMENT_BADGE_CLASSES,
  ACCOUNTING_SYNC_BADGE_CLASSES,
  AccountingSyncPanel,
} from "@/components/app/AccountingSyncPanel";
import type { PaymentClaimXeroPanelState } from "@/lib/xero/payment-claim-sales-invoice-panel";
import {
  enqueuePaymentClaimXeroRefreshAction,
  getPaymentClaimXeroPanelAction,
  pushPaymentClaimToXeroAction,
  type PaymentClaimXeroActionError,
} from "@/app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions";

const SYNC_BADGES: Record<PaymentClaimXeroPanelState["status"], string> = {
  not_ready: ACCOUNTING_SYNC_BADGE_CLASSES.error,
  ready_to_sync: ACCOUNTING_SYNC_BADGE_CLASSES.success,
  queued: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  syncing: ACCOUNTING_SYNC_BADGE_CLASSES.processing,
  synced: ACCOUNTING_SYNC_BADGE_CLASSES.success,
  verification_required: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  update_pending: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  locally_diverged: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  uncertain: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  legacy_linked: ACCOUNTING_SYNC_BADGE_CLASSES.muted,
  missing_in_xero: ACCOUNTING_SYNC_BADGE_CLASSES.error,
  voided_in_xero: ACCOUNTING_SYNC_BADGE_CLASSES.error,
  attention_required: ACCOUNTING_SYNC_BADGE_CLASSES.error,
};

const PAYMENT_BADGES: Record<
  NonNullable<PaymentClaimXeroPanelState["paymentStatus"]>,
  string
> = {
  ...ACCOUNTING_PAYMENT_BADGE_CLASSES,
};

export function PaymentClaimXeroPanel(props: {
  claimId: string;
  savedRevision: string | null;
  initialState?: PaymentClaimXeroPanelState;
  onStateChange?: (state: PaymentClaimXeroPanelState) => void;
}) {
  const onStateChange = props.onStateChange;
  const [state, setState] = useState<PaymentClaimXeroPanelState | null>(
    props.initialState ?? null,
  );
  const [loading, setLoading] = useState(!props.initialState);
  const [refreshing, setRefreshing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [actionError, setActionError] =
    useState<PaymentClaimXeroActionError | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const skipInitialLoad = useRef(Boolean(props.initialState));

  useEffect(() => {
    if (skipInitialLoad.current) {
      skipInitialLoad.current = false;
      return;
    }
    let cancelled = false;
    void getPaymentClaimXeroPanelAction({ claimId: props.claimId }).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          setState(result.state);
          setActionError(null);
        } else {
          setActionError(result.error);
        }
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [props.claimId, props.savedRevision]);

  useEffect(() => {
    if (state) onStateChange?.(state);
  }, [onStateChange, state]);

  if (!loading && state && !state.visible) return null;

  const onPush = async () => {
    if (pushing) return;
    setPushing(true);
    setActionError(null);
    const result = await pushPaymentClaimToXeroAction({
      claimId: props.claimId,
    });
    if (result.ok) setState(result.state);
    else setActionError(result.error);
    setPushing(false);
  };

  const onRefresh = async () => {
    if (
      !state?.canRefresh
      || refreshing
      || pushing
      || state.refreshInProgress
    ) return;
    setRefreshing(true);
    setActionError(null);
    const result = await enqueuePaymentClaimXeroRefreshAction({
      claimId: props.claimId,
      intent: "refresh",
    });
    if (result.ok) setState(result.state);
    else setActionError(result.error);
    setRefreshing(false);
  };

  const hasPendingRow = state?.status === "queued"
    || state?.status === "syncing";
  const showRefresh = Boolean(
    state?.canManage
    && state.invoiceId,
  );
  const paymentBadgeClass = state?.paymentStatus
    ? PAYMENT_BADGES[state.paymentStatus]
    : null;

  return (
    <AccountingSyncPanel
      testIdPrefix="payment-claim-xero"
      headingId="payment-claim-xero-heading"
      contentId="payment-claim-xero-content"
      isOpen={isOpen}
      onToggle={() => setIsOpen((current) => !current)}
      loading={loading}
      ariaBusy={pushing}
      renderState={Boolean(state)}
      actions={state ? (
        <>
          {showRefresh ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onRefresh()}
              disabled={
                !state.canRefresh
                || refreshing
                || pushing
                || state.refreshInProgress
              }
            >
              {refreshing || state.refreshInProgress
                ? "Refreshing..."
                : "Refresh"}
            </Button>
          ) : null}
          {state.actionLabel ? (
            <Button
              type="button"
              onClick={() => void onPush()}
              disabled={
                pushing
                || refreshing
                || loading
                || !state.canManage
                || state.refreshInProgress
              }
            >
              {pushing ? "Pushing to Xero..." : state.actionLabel}
            </Button>
          ) : null}
        </>
      ) : null}
      statusLabel={state?.statusLabel ?? "Not ready"}
      syncBadgeClass={state ? SYNC_BADGES[state.status] : SYNC_BADGES.not_ready}
      pending={hasPendingRow}
      invoiceNumber={state?.invoiceNumber ?? null}
      paymentStatusLabel={state?.paymentStatusLabel ?? null}
      paymentBadgeClass={paymentBadgeClass}
      lastSyncedAt={state?.lastSyncedAt ?? null}
      amountPaid={state?.amountPaid ?? null}
      amountOutstanding={state?.amountOutstanding ?? null}
      fullyPaidAt={state?.fullyPaidAt ?? null}
      xeroUrl={state?.xeroUrl ?? null}
      safeErrorMessage={state?.safeErrorMessage}
      guidance={state && state.blockers.length > 0 ? (
        <div className="space-y-2" data-testid="payment-claim-xero-readiness-blockers">
          <p className="font-semibold text-[var(--text-primary)]">Readiness items</p>
          <ul className="list-disc space-y-1 pl-5">
            {state.blockers.map((blocker) => (
              <li key={blocker.code}>
                {blocker.code === "xero_disconnected"
                  ? "Xero connection needs reauthorization."
                  : blocker.code === "client_contact_missing"
                    ? "Client is not linked to a Xero Contact."
                    : blocker.message}
                {blocker.code === "xero_disconnected" ? (
                  <>{" "}<Link className="font-semibold text-[var(--brand-blue)] hover:underline" href="/app/settings/integrations">Open Integrations</Link></>
                ) : null}
                {blocker.code === "client_contact_missing" && state.clientId ? (
                  <>{" "}<Link className="font-semibold text-[var(--brand-blue)] hover:underline" href={`/app/leads-clients/clients/${state.clientId}`}>
                    Client → {state.clientName ?? "client"} → Xero Contact
                  </Link></>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      attachmentFailureMessage={
        state?.invoiceNumber && state.attachmentStatus === "failed"
          ? `Xero invoice ${state.invoiceNumber} was created successfully, but its PDF attachment failed. Do not push the invoice again.${state.attachmentErrorMessage ? ` ${state.attachmentErrorMessage}` : ""}`
          : null
      }
      permissionMessage={state && !state.canManage
        ? "You can view Xero synchronization state, but managing Sales Invoices requires accounting permission."
        : null}
      actionError={actionError}
      actionErrorSupportLabel="Support reference:"
    />
  );
}
