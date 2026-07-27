"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ACCOUNTING_PAYMENT_BADGE_CLASSES,
  ACCOUNTING_SYNC_BADGE_CLASSES,
  AccountingSyncPanel,
} from "@/components/app/AccountingSyncPanel";
import type {
  RetentionClaimImmutableXeroPanelState,
} from "@/lib/xero/retention-claim-immutable-panel";
import {
  getRetentionClaimXeroPanelAction,
  pushRetentionClaimToXeroAction,
  refreshRetentionClaimXeroAction,
  resetMasterRetentionClaimDatesAction,
  type RetentionClaimXeroActionError,
} from "@/app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions";
import {
  useOptionalRetentionClaimDateEditing,
} from "@/components/app/RetentionClaimDateEditing";

const BADGES: Record<RetentionClaimImmutableXeroPanelState["status"], string> = {
  not_ready: ACCOUNTING_SYNC_BADGE_CLASSES.error,
  ready_to_sync: ACCOUNTING_SYNC_BADGE_CLASSES.success,
  update_required: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  queued: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  processing: ACCOUNTING_SYNC_BADGE_CLASSES.processing,
  synced: ACCOUNTING_SYNC_BADGE_CLASSES.success,
  verification_required: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  uncertain: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  missing_in_xero: ACCOUNTING_SYNC_BADGE_CLASSES.error,
  voided_in_xero: ACCOUNTING_SYNC_BADGE_CLASSES.error,
  attention_required: ACCOUNTING_SYNC_BADGE_CLASSES.error,
};

export function RetentionClaimXeroPanel(props: {
  retentionClaimId: string;
  initialState?: RetentionClaimImmutableXeroPanelState;
  draftCanPush?: boolean;
  draftBlockedMessage?: string;
}) {
  const [state, setState] =
    useState<RetentionClaimImmutableXeroPanelState | null>(
      props.initialState ?? null,
    );
  const [open, setOpen] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] =
    useState<RetentionClaimXeroActionError | null>(null);
  const dateEditing = useOptionalRetentionClaimDateEditing();

  useEffect(() => {
    if (props.initialState && !dateEditing?.version) return;
    let cancelled = false;
    void getRetentionClaimXeroPanelAction({
      retentionClaimId: props.retentionClaimId,
    }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState(result.state);
        setError(null);
      } else {
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    props.initialState,
    props.retentionClaimId,
    dateEditing?.version,
  ]);

  if (!state) {
    return (
      <AccountingSyncPanel
        testIdPrefix="retention-claim-xero"
        headingId="retention-claim-xero-heading"
        contentId="retention-claim-xero-content"
        isOpen={open}
        onToggle={() => setOpen((current) => !current)}
        loading
        renderState={false}
        statusLabel="Checking"
        syncBadgeClass={ACCOUNTING_SYNC_BADGE_CLASSES.muted}
        pending={false}
        invoiceNumber={null}
        paymentStatusLabel={null}
        paymentBadgeClass={null}
        lastSyncedAt={null}
        amountPaid={null}
        amountOutstanding={null}
        fullyPaidAt={null}
        xeroUrl={null}
      />
    );
  }
  if (!state.visible) return null;

  const push = async () => {
    if (pushing) return;
    setPushing(true);
    setError(null);
    setSuccessMessage(null);
    const wasUpdate = state.status === "update_required";
    const result = await pushRetentionClaimToXeroAction({
      retentionClaimId: props.retentionClaimId,
    });
    if (result.ok) {
      setState(result.state);
      if (wasUpdate && result.state.status === "synced") {
        setSuccessMessage("Xero invoice updated successfully.");
      }
    }
    else setError(result.error);
    setPushing(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    setSuccessMessage(null);
    const result = await refreshRetentionClaimXeroAction({
      retentionClaimId: props.retentionClaimId,
    });
    if (result.ok) setState(result.state);
    else setError(result.error);
    setRefreshing(false);
  };

  const resetDates = async () => {
    if (!dateEditing || resetting) return;
    setResetting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await resetMasterRetentionClaimDatesAction({
        retentionClaimId: props.retentionClaimId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dateEditing.start(result.dates);
      window.requestAnimationFrame(() => {
        const dateSection = document.getElementById(
          "retention-claim-date-section",
        );
        dateSection?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.requestAnimationFrame(() => {
          document.getElementById("master-retention-claim-date")?.focus();
        });
      });
    } catch {
      setError({
        code: "RETENTION_DATE_UPDATE_REJECTED",
        message: "TradesStack could not safely unlock the Retention Claim dates.",
        supportReference: null,
      });
    } finally {
      setResetting(false);
    }
  };

  const paymentBadgeClass = state.paymentStatus
    ? ACCOUNTING_PAYMENT_BADGE_CLASSES[state.paymentStatus]
    : null;
  const draftMode = props.draftCanPush !== undefined;
  const actionLabel = draftMode
    ? props.draftCanPush ? "Push to Xero" : null
    : dateEditing?.editing ? null : state.actionLabel;
  const statusLabel = draftMode && props.draftCanPush
    ? "Ready to sync"
    : state.statusLabel;
  const syncBadgeClass = draftMode && props.draftCanPush
    ? ACCOUNTING_SYNC_BADGE_CLASSES.success
    : BADGES[state.status];
  const infoMessage = draftMode
    ? props.draftCanPush
      ? null
      : props.draftBlockedMessage
        ?? "Save the Retention Claim and resolve any invalid lines before pushing it to Xero."
    : state.infoMessage;
  const safeErrorMessage = state.status === "synced"
    ? null
    : state.safeErrorMessage;
  const actionError = error;
  const toTaxExclusiveAmount = (amount: number | null) => {
    if (
      amount === null
      || state.invoiceSubtotalMinor == null
      || state.invoiceTotalMinor == null
      || state.invoiceTotalMinor <= 0
    ) {
      return amount;
    }
    return Math.round(
      Math.round(amount * 100)
      * state.invoiceSubtotalMinor
      / state.invoiceTotalMinor,
    ) / 100;
  };

  return (
    <AccountingSyncPanel
      testIdPrefix="retention-claim-xero"
      sectionTestId="retention-claim-xero-panel"
      headingId="retention-claim-xero-heading"
      contentId="retention-claim-xero-content"
      isOpen={open}
      onToggle={() => setOpen((value) => !value)}
      ariaBusy={pushing || resetting}
      actions={(
        <>
          {state.canRefresh ? (
            <Button
              type="button"
              variant="secondary"
              disabled={
                refreshing
                || pushing
                || resetting
                || dateEditing?.editing
                || state.refreshInProgress
              }
              onClick={() => void refresh()}
            >
              {refreshing || state.refreshInProgress
                ? "Refreshing..."
                : "Refresh"}
            </Button>
          ) : null}
          {!draftMode
            && dateEditing
            && state.canResetDates
            && !dateEditing.editing ? (
              <Button
                type="button"
                variant="secondary"
                title="Reset the Retention Claim dates for editing. This does not delete or void the Xero invoice."
                disabled={
                  refreshing
                  || pushing
                  || resetting
                  || state.refreshInProgress
                }
                onClick={() => void resetDates()}
              >
                {resetting ? "Resetting..." : "Reset"}
              </Button>
            ) : null}
          {actionLabel ? (
            <Button
              type="button"
              disabled={
                !state.canManage
                || pushing
                || refreshing
                || resetting
                || state.refreshInProgress
              }
              onClick={() => void push()}
            >
              {pushing ? "Pushing to Xero..." : actionLabel}
            </Button>
          ) : null}
        </>
      )}
      statusLabel={statusLabel}
      syncBadgeClass={syncBadgeClass}
      pending={state.status === "queued" || state.status === "processing"}
      invoiceNumber={state.invoiceNumber}
      paymentStatusLabel={state.paymentStatusLabel}
      paymentBadgeClass={paymentBadgeClass}
      lastSyncedAt={state.lastSyncedAt}
      amountPaid={toTaxExclusiveAmount(state.amountPaid)}
      amountOutstanding={toTaxExclusiveAmount(state.amountOutstanding)}
      fullyPaidAt={state.fullyPaidAt}
      xeroUrl={state.xeroUrl}
      infoMessage={successMessage ?? infoMessage}
      safeErrorMessage={safeErrorMessage}
      attachmentFailureMessage={null}
      permissionMessage={!state.canManage
        ? "You can view Xero synchronization state, but managing Sales Invoices requires accounting permission."
        : null}
      actionError={actionError}
    />
  );
}
