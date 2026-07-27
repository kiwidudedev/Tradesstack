"use client";

import type { ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import styles from "@/components/app/trade-pack-builder.module.css";
import { ibmPlexSans, interMedium } from "@/lib/fonts";

export const ACCOUNTING_SYNC_BADGE_CLASSES = {
  error: "bg-[#FEE2E2] text-[#991B1B]",
  success: "bg-[#DCFCE7] text-[#166534]",
  pending: "bg-[#FEF3C7] text-[#92400E]",
  processing: "bg-[#DBEAFE] text-[#1D4ED8]",
  muted: "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
} as const;

export const ACCOUNTING_PAYMENT_BADGE_CLASSES = {
  unpaid: ACCOUNTING_SYNC_BADGE_CLASSES.muted,
  partially_paid: ACCOUNTING_SYNC_BADGE_CLASSES.pending,
  paid: ACCOUNTING_SYNC_BADGE_CLASSES.success,
  attention_required: ACCOUNTING_SYNC_BADGE_CLASSES.error,
} as const;

export const ACCOUNTING_SYNC_TABLE_HEADINGS = [
  "Invoice #",
  "Sync Status",
  "Payment Status",
  "Last Sync",
  "Paid",
  "Outstanding",
  "Paid Date",
  "Action",
] as const;

export function formatAccountingSyncTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString("en-NZ");
}

export function formatAccountingNzd(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function AccountingSyncStatusPill(props: {
  className: string;
  label: string;
}) {
  return (
    <span className={`${ibmPlexSans.className} inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${props.className}`}>
      {props.label}
    </span>
  );
}

export function AccountingSyncXeroInvoiceLink(props: {
  invoiceNumber: string;
  xeroUrl: string;
  mobile?: boolean;
}) {
  return (
    <a
      href={props.xeroUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open Xero invoice ${props.invoiceNumber}`}
      className={`${ibmPlexSans.className} inline-flex items-center justify-center gap-1 rounded-[6px] font-semibold text-[var(--brand-blue)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${props.mobile ? "w-full border border-[var(--border)] px-3 py-2.5" : "text-[13px]"}`}
    >
      Open in Xero <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </a>
  );
}

export type AccountingSyncPanelError = {
  message: string;
  supportReference?: string | null;
} | null;

export function AccountingSyncPanel(props: {
  testIdPrefix: string;
  sectionTestId?: string;
  headingId: string;
  contentId: string;
  isOpen: boolean;
  onToggle: () => void;
  loading?: boolean;
  ariaBusy?: boolean;
  renderState?: boolean;
  actions?: ReactNode;
  statusLabel: string;
  syncBadgeClass: string;
  pending: boolean;
  invoiceNumber: string | null;
  paymentStatusLabel: string | null;
  paymentBadgeClass: string | null;
  lastSyncedAt: string | null;
  amountPaid: number | null;
  amountOutstanding: number | null;
  fullyPaidAt: string | null;
  xeroUrl: string | null;
  safeErrorMessage?: string | null;
  attachmentFailureMessage?: string | null;
  permissionMessage?: string | null;
  infoMessage?: string | null;
  actionError?: AccountingSyncPanelError;
  actionErrorSupportLabel?: string;
}) {
  const syncedAt = formatAccountingSyncTime(props.lastSyncedAt);
  const fullyPaidAt = formatAccountingSyncTime(props.fullyPaidAt);
  const hasInvoiceRow = Boolean(props.invoiceNumber) || props.pending;

  return (
    <section
      data-testid={props.sectionTestId ?? `${props.testIdPrefix}-section`}
      aria-labelledby={props.headingId}
      aria-busy={props.ariaBusy || undefined}
      className={`${styles.quotePanelCard} min-w-0 overflow-hidden px-4 py-5 sm:px-6`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          data-testid={`${props.testIdPrefix}-trigger`}
          aria-expanded={props.isOpen}
          aria-controls={props.contentId}
          aria-label={props.isOpen ? "Collapse Accounting Sync" : "Expand Accounting Sync"}
          onClick={props.onToggle}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[8px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
        >
          <h2 id={props.headingId} className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
            Accounting Sync
          </h2>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${props.isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {props.actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {props.actions}
          </div>
        ) : null}
      </div>

      {!props.isOpen ? null : (
        <div
          id={props.contentId}
          data-testid={`${props.testIdPrefix}-content`}
          className="mt-4 min-w-0 space-y-3"
        >
          {props.loading ? (
            <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-center">
              <p className={`${ibmPlexSans.className} text-[14px] text-[var(--text-secondary)]`}>
                Checking Xero readiness...
              </p>
            </div>
          ) : props.renderState === false ? null : (
            <>
              <div className="hidden overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] md:block">
                <div className="max-w-full overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse" aria-label="Linked Xero Sales Invoice">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                        {ACCOUNTING_SYNC_TABLE_HEADINGS.map((heading) => (
                          <th
                            key={heading}
                            scope="col"
                            className={`${ibmPlexSans.className} px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-secondary)]`}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hasInvoiceRow ? (
                        <tr
                          data-testid={`${props.testIdPrefix}-invoice-row`}
                          className="border-b border-[var(--border)] align-middle transition-colors last:border-b-0 hover:bg-[var(--surface-muted)]"
                        >
                          <td className={`${interMedium.className} px-4 py-4 text-[13px] font-semibold text-[var(--text-primary)]`}>
                            {props.invoiceNumber ?? <span aria-label="Invoice number not assigned">—</span>}
                          </td>
                          <td className="px-4 py-4">
                            <AccountingSyncStatusPill
                              className={props.syncBadgeClass}
                              label={props.statusLabel}
                            />
                          </td>
                          <td className="px-4 py-4">
                            {props.paymentStatusLabel && props.paymentBadgeClass ? (
                              <AccountingSyncStatusPill
                                className={props.paymentBadgeClass}
                                label={props.paymentStatusLabel}
                              />
                            ) : <span className="text-[var(--text-secondary)]">—</span>}
                          </td>
                          <td className={`${ibmPlexSans.className} px-4 py-4 text-[12px] text-[var(--text-primary)]`}>
                            {syncedAt ?? "—"}
                          </td>
                          <td className={`${interMedium.className} px-4 py-4 text-[13px] font-semibold text-[var(--text-primary)]`}>
                            {formatAccountingNzd(props.amountPaid)}
                          </td>
                          <td className={`${interMedium.className} px-4 py-4 text-[13px] font-semibold text-[var(--text-primary)]`}>
                            {formatAccountingNzd(props.amountOutstanding)}
                          </td>
                          <td className={`${ibmPlexSans.className} px-4 py-4 text-[12px] text-[var(--text-primary)]`}>
                            {fullyPaidAt ?? "—"}
                          </td>
                          <td className="px-4 py-4">
                            {props.invoiceNumber && props.xeroUrl ? (
                              <AccountingSyncXeroInvoiceLink
                                invoiceNumber={props.invoiceNumber}
                                xeroUrl={props.xeroUrl}
                              />
                            ) : <span className="text-[var(--text-secondary)]">—</span>}
                          </td>
                        </tr>
                      ) : (
                        <tr>
                          <td className="px-4 py-5" />
                          <td className="px-4 py-5" />
                          <td className="px-4 py-5" />
                          <td
                            data-testid={`${props.testIdPrefix}-empty-last-sync-status`}
                            className="px-4 py-5 text-center"
                          >
                            <AccountingSyncStatusPill
                              className={props.syncBadgeClass}
                              label={props.statusLabel}
                            />
                          </td>
                          <td colSpan={4} className="px-4 py-5" />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {hasInvoiceRow ? (
                <article
                  data-testid={`${props.testIdPrefix}-mobile-card`}
                  className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 md:hidden"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`${ibmPlexSans.className} text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]`}>
                        Invoice #
                      </p>
                      <p className={`${interMedium.className} mt-1 break-words text-[14px] font-semibold text-[var(--text-primary)]`}>
                        {props.invoiceNumber ?? "—"}
                      </p>
                    </div>
                    <AccountingSyncStatusPill
                      className={props.syncBadgeClass}
                      label={props.statusLabel}
                    />
                  </div>
                  <div className="mt-3">
                    <p className={`${ibmPlexSans.className} text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]`}>
                      Payment status
                    </p>
                    <div className="mt-1">
                      {props.paymentStatusLabel && props.paymentBadgeClass ? (
                        <AccountingSyncStatusPill
                          className={props.paymentBadgeClass}
                          label={props.paymentStatusLabel}
                        />
                      ) : <span className="text-[var(--text-secondary)]">—</span>}
                    </div>
                  </div>
                  <dl className={`${ibmPlexSans.className} mt-4 grid grid-cols-2 gap-3 text-[12px]`}>
                    <div className="col-span-2">
                      <dt className="text-[var(--text-secondary)]">Last sync</dt>
                      <dd className="mt-1 text-[var(--text-primary)]">{syncedAt ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-secondary)]">Paid</dt>
                      <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                        {formatAccountingNzd(props.amountPaid)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-secondary)]">Outstanding</dt>
                      <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                        {formatAccountingNzd(props.amountOutstanding)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[var(--text-secondary)]">Paid date</dt>
                      <dd className="mt-1 text-[var(--text-primary)]">{fullyPaidAt ?? "—"}</dd>
                    </div>
                  </dl>
                  {props.invoiceNumber && props.xeroUrl ? (
                    <div className="mt-4">
                      <AccountingSyncXeroInvoiceLink
                        invoiceNumber={props.invoiceNumber}
                        xeroUrl={props.xeroUrl}
                        mobile
                      />
                    </div>
                  ) : null}
                </article>
              ) : (
                <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-center md:hidden">
                  <AccountingSyncStatusPill
                    className={props.syncBadgeClass}
                    label={props.statusLabel}
                  />
                </div>
              )}

              {props.infoMessage ? (
                <p
                  role="status"
                  className={`${ibmPlexSans.className} rounded-[10px] border border-[var(--brand-blue)]/25 bg-[#EFF6FF] px-4 py-3 text-[12px] text-[#1E3A8A]`}
                >
                  {props.infoMessage}
                </p>
              ) : null}
              {props.safeErrorMessage ? (
                <p
                  role="alert"
                  className={`${ibmPlexSans.className} rounded-[10px] border border-[var(--error)]/25 bg-[var(--error-light)] px-4 py-3 text-[12px] text-[var(--error)]`}
                >
                  {props.safeErrorMessage}
                </p>
              ) : null}
              {props.attachmentFailureMessage ? (
                <p
                  role="alert"
                  className={`${ibmPlexSans.className} rounded-[10px] border border-[#F59E0B]/40 bg-[#FEF3C7] px-4 py-3 text-[12px] text-[#78350F]`}
                >
                  {props.attachmentFailureMessage}
                </p>
              ) : null}
              {props.permissionMessage ? (
                <p className={`${ibmPlexSans.className} text-[12px] text-[var(--text-secondary)]`}>
                  {props.permissionMessage}
                </p>
              ) : null}
            </>
          )}

          {props.actionError ? (
            <p
              role="alert"
              aria-live="polite"
              className={`${ibmPlexSans.className} rounded-[10px] border border-[var(--error)]/25 bg-[var(--error-light)] px-4 py-3 text-[12px] text-[var(--error)]`}
            >
              {props.actionError.message}
              {props.actionError.supportReference ? (
                <span className="mt-1 block">
                  {props.actionErrorSupportLabel ?? "Support reference:"}{" "}
                  {props.actionError.supportReference}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
