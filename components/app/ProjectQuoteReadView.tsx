"use client";

import type { ReactNode } from "react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { WorksheetSourceLink } from "@/components/app/WorksheetSourceLink";
import { Button } from "@/components/ui/button";
import { ibmPlexSans } from "@/lib/fonts";
import {
  STATUS_OPTIONS,
  lineItemTotal,
  toDayMonthYearLabel,
  toMoney,
  type LineItem,
  type PricingSummary,
  type QuoteStatus,
} from "@/lib/quote-editor-core";
import styles from "@/components/app/trade-pack-builder.module.css";

function quoteStatusBadge(status: QuoteStatus): NonNullable<StatusBadgeProps["status"]> {
  if (status === "Accepted") return "approved";
  if (status === "Sent") return "sent";
  if (status === "Rejected" || status === "Expired") return "overdue";
  return "draft";
}

export function ProjectQuoteReadView({
  error,
  saveMessage,
  readOnlyMessage,
  quoteNumber,
  quoteTitle,
  quoteStatus,
  canManageQuote,
  onEdit,
  onExport,
  primaryAction,
  clientName,
  siteAddress,
  projectName,
  quoteDate,
  expiryDate,
  lineItems,
  termsInclusions,
  termsExclusions,
  clarifications,
  assumptions,
  pricingSummary,
  getCommercialItemSourceHref,
  isCommercialMetadataPending,
}: {
  error: string | null;
  saveMessage: string | null;
  readOnlyMessage: string | null;
  quoteNumber: string;
  quoteTitle: string;
  quoteStatus: QuoteStatus;
  canManageQuote: boolean;
  onEdit: () => void;
  onExport: () => void;
  primaryAction?: ReactNode;
  clientName: string;
  siteAddress: string;
  projectName: string;
  quoteDate: string;
  expiryDate: string;
  lineItems: LineItem[];
  termsInclusions: string;
  termsExclusions: string;
  clarifications: string;
  assumptions: string;
  pricingSummary: PricingSummary;
  getCommercialItemSourceHref: (item: LineItem) => string | null;
  isCommercialMetadataPending: boolean;
}) {
  const statusLabel = STATUS_OPTIONS.find((status) => status.value === quoteStatus)?.label ?? quoteStatus;
  const title = quoteNumber.trim() || quoteTitle.trim() || "Quote";
  const subtotalExcludingGst = Math.max(0, pricingSummary.grandTotal - pricingSummary.gst);

  return (
    <div className={`${ibmPlexSans.className} -mb-8 w-full space-y-6 bg-[var(--background)]`}>
      <OperationalModuleHeader
        title={(
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{title}</span>
            <StatusBadge status={quoteStatusBadge(quoteStatus)}>{statusLabel}</StatusBadge>
          </span>
        )}
        description={saveMessage ?? undefined}
        actions={(
          <>
            {primaryAction ?? (
              <Button type="button" variant="secondary" onClick={onEdit} disabled={!canManageQuote}>
                Edit Quote
              </Button>
            )}
            <Button type="button" onClick={onExport}>Export PDF</Button>
          </>
        )}
      />

      {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
      {readOnlyMessage ? <OperationalAlert variant="warning">{readOnlyMessage}</OperationalAlert> : null}

      <OperationalPanel contentClassName="p-0">
        <div className="px-6 py-6">
          <h2 className={`${styles.quoteSectionTitle} mb-5 border-b border-[var(--border)] pb-5`}>Quote Details</h2>
          <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
            {[
              ["Client", clientName || "—"],
              ["Site", siteAddress || "—"],
              ["Project", projectName || "—"],
              ["Issued", toDayMonthYearLabel(quoteDate)],
              ["Quote Number", quoteNumber || "—"],
              ["Expiry", toDayMonthYearLabel(expiryDate)],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[110px_1fr] items-baseline gap-3">
                <span className={styles.quoteBodyLabel}>{label}</span>
                <span className={styles.quoteBodyValue}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 pb-4 pt-5">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-5">
            <h2 className={styles.quoteSectionTitle}>Line Items</h2>
            {isCommercialMetadataPending ? (
              <span className="text-xs text-[var(--text-muted)]">Loading source details…</span>
            ) : null}
          </div>
        </div>
        <div className="px-6 pb-2">
          {lineItems.length === 0 ? (
            <OperationalEmptyState title="No line items added yet." />
          ) : (
            <OperationalTable>
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>Description</OperationalTableHead>
                  <OperationalTableHead>Section</OperationalTableHead>
                  <OperationalTableHead className="text-right">Qty</OperationalTableHead>
                  <OperationalTableHead>Unit</OperationalTableHead>
                  <OperationalTableHead className="text-right">Rate</OperationalTableHead>
                  <OperationalTableHead className="text-right">Total</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {lineItems.map((item) => (
                  <OperationalTableRow key={item.id}>
                    <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                      <div>{item.description || "Untitled item"}</div>
                      {item.commercialItemLink ? (
                        <div className="mt-1.5 text-[11px] leading-none">
                          <WorksheetSourceLink href={getCommercialItemSourceHref(item)} />
                        </div>
                      ) : null}
                    </OperationalTableCell>
                    <OperationalTableCell className="text-[var(--text-secondary)]">{item.section}{item.isOptional ? " (Optional)" : ""}</OperationalTableCell>
                    <OperationalTableCell className="text-right font-semibold text-[var(--text-primary)]">{item.quantity}</OperationalTableCell>
                    <OperationalTableCell className="text-[var(--text-secondary)]">{item.unit || "—"}</OperationalTableCell>
                    <OperationalTableCell className="text-right font-semibold text-[var(--text-primary)]">{toMoney(item.rate)}</OperationalTableCell>
                    <OperationalTableCell className="text-right font-semibold text-[var(--text-primary)]">{toMoney(lineItemTotal(item))}</OperationalTableCell>
                  </OperationalTableRow>
                ))}
              </OperationalTableBody>
            </OperationalTable>
          )}
        </div>

        {(termsInclusions || termsExclusions || clarifications || assumptions) ? (
          <div className="px-6 py-6">
            <h2 className={`${styles.quoteSectionTitle} mb-5 border-b border-[var(--border)] pb-5`}>Terms & Clarifications</h2>
            <div className="space-y-4">
              {[
                ["Inclusions", termsInclusions],
                ["Exclusions", termsExclusions],
                ["Clarifications", clarifications],
                ["Assumptions", assumptions],
              ].filter(([, value]) => Boolean(value)).map(([label, value], index, entries) => (
                <div key={label} className={`grid grid-cols-[130px_1fr] gap-3 ${index < entries.length - 1 ? "border-b border-[var(--border)] pb-4" : ""}`}>
                  <p className={styles.quoteBodyLabel}>{label}</p>
                  <p className={styles.quoteBodyValue}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="border-t border-[var(--border)] px-6 py-4">
          <div className="ml-auto max-w-[280px] space-y-1">
            <p className={`${styles.quoteBodyLabel} text-right`}>Subtotal (excl. GST)</p>
            <p className="text-right text-[22px] font-bold leading-none tracking-[-0.03em] text-[var(--text-primary)]">{toMoney(subtotalExcludingGst)}</p>
          </div>
        </div>
      </OperationalPanel>
    </div>
  );
}
