"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableFooter,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { formatMoneyOperational } from "@/lib/format/currency";
import type { ProjectCostReportData, ProjectCostReportRow } from "@/lib/project-cost-report";
import { cn } from "@/lib/utils";
import { Calculator, Landmark, ReceiptText, TrendingDown } from "lucide-react";

function formatMoney(value: number) {
  return formatMoneyOperational(value, { decimals: 2 });
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatRemaining(value: number) {
  if (value < 0) {
    return `Overrun ${formatMoney(Math.abs(value))}`;
  }

  return formatMoney(value);
}

function deriveCostAreaLabel(row: ProjectCostReportRow) {
  if (row.isUnmatchedActual) {
    return "Unmatched actuals";
  }

  if (row.isBudgetAdjustment) {
    return "Commercial adjustments";
  }

  if (row.tradesstackCostCode) {
    return row.tradesstackCostCodeLabel
      ? `${row.tradesstackCostCode} ${row.tradesstackCostCodeLabel}`
      : row.tradesstackCostCode;
  }

  return row.classificationLabel;
}

function deriveRowMetadata(row: ProjectCostReportRow) {
  if (row.isUnmatchedActual || row.isBudgetAdjustment) {
    return [];
  }

  const values = [
    row.mappedAccountingCode
      ? row.mappedAccountingCodeLabel
        ? `${row.mappedAccountingCode} ${row.mappedAccountingCodeLabel}`
        : row.mappedAccountingCode
      : null,
  ].filter((value): value is string => Boolean(value));

  return values;
}

function deriveRowStatus(row: ProjectCostReportRow) {
  if (row.isUnmatchedActual) {
    return { label: "Unmatched", status: "pending" as const };
  }

  if (row.isBudgetAdjustment) {
    return { label: "No spend yet", status: "draft" as const };
  }

  if (row.estimated === 0 && row.actual > 0) {
    return { label: "No budget", status: "overdue" as const };
  }

  if (row.actual > row.estimated) {
    return { label: "Overspent", status: "overdue" as const };
  }

  if (row.estimated > 0 && row.actual > 0) {
    return { label: "On track", status: "approved" as const };
  }

  if (row.estimated > 0 && row.actual === 0) {
    return { label: "No spend yet", status: "draft" as const };
  }

  return { label: "No budget", status: "pending" as const };
}

function actualLedgerBadgeStatus(value: ProjectCostReportRow["drilldown"]["actualEvents"][number]["ledgerLabel"]) {
  switch (value) {
    case "Reversal":
      return "overdue" as const;
    case "Repost":
      return "sent" as const;
    case "Posting":
    default:
      return "approved" as const;
  }
}

function CompactEmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--text-secondary)]">{children}</p>;
}

function ExpandableSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
      {children}
    </div>
  );
}

function DetailSubsection({
  title,
  subtotal,
  children,
}: {
  title: string;
  subtotal: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{title}</h5>
        <p className="text-sm font-medium text-[var(--text-secondary)]">{formatMoney(subtotal)}</p>
      </div>
      {children}
    </div>
  );
}

function InlineMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-[var(--status-approved)]"
      : tone === "bad"
        ? "text-[var(--status-overdue)]"
        : "text-[var(--text-primary)]";

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{label}</p>
      <p className={cn("text-sm font-medium", toneClass)}>{value}</p>
    </div>
  );
}

function DrilldownContent({
  projectSlug,
  row,
  mode = "both",
}: {
  projectSlug: string;
  row: ProjectCostReportRow;
  mode?: "budget" | "spend" | "both";
}) {
  const quoteLines = row.drilldown.estimatedLines.filter((line) => line.sourceType === "quote");
  const variationLines = row.drilldown.estimatedLines.filter((line) => line.sourceType === "variation");
  const adjustmentLines = row.drilldown.estimatedLines.filter((line) => line.sourceType === "adjustment");
  const quoteSubtotal = quoteLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const variationSubtotal = variationLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const adjustmentSubtotal = adjustmentLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const remainingTone = row.varianceAmount < 0 ? "bad" : row.varianceAmount > 0 ? "good" : "default";

  const budgetSourceHref = (line: ProjectCostReportRow["drilldown"]["estimatedLines"][number]) => {
    if (!line.sourceDocumentId) {
      return null;
    }

    if (line.sourceType === "quote") {
      return `/app/projects/${projectSlug}/preconstruction/quote/${line.sourceDocumentId}`;
    }

    if (line.sourceType === "variation") {
      return `/app/projects/${projectSlug}/preconstruction/variations/${line.sourceDocumentId}`;
    }

    return null;
  };

  return (
    <div className="space-y-4 py-2">
      {mode !== "spend" ? (
      <ExpandableSection title="Budget structure">
        <div className="grid gap-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3">
          <InlineMetric label="Budget subtotal" value={formatMoney(row.drilldown.estimatedSubtotal)} />
          <InlineMetric label="Spent" value={formatMoney(row.actual)} />
          <InlineMetric label="Remaining / Overrun" value={formatRemaining(row.varianceAmount)} tone={remainingTone} />
        </div>

        <DetailSubsection title="Original quote lines" subtotal={quoteSubtotal}>
          {quoteLines.length === 0 ? (
            <CompactEmptyLine>No original quote lines</CompactEmptyLine>
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
                  <OperationalTableHead>Source</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {quoteLines.map((line) => (
                  <OperationalTableRow key={line.id}>
                    <OperationalTableCell className="max-w-[320px] break-words">{line.description}</OperationalTableCell>
                    <OperationalTableCell>{line.section ?? "—"}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{line.quantity.toFixed(3).replace(/\.?0+$/, "")}</OperationalTableCell>
                    <OperationalTableCell>{line.unit ?? "—"}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(line.unitRate)}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(line.lineTotal)}</OperationalTableCell>
                    <OperationalTableCell>
                      {budgetSourceHref(line) && line.sourceReference ? (
                        <Link href={budgetSourceHref(line)!} className="inline-flex items-center gap-1 text-[var(--brand-blue)] hover:underline">
                          {line.sourceReference}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        "—"
                      )}
                    </OperationalTableCell>
                  </OperationalTableRow>
                ))}
              </OperationalTableBody>
            </OperationalTable>
          )}
        </DetailSubsection>

        <DetailSubsection title="Approved variation lines" subtotal={variationSubtotal}>
          {variationLines.length === 0 ? (
            <CompactEmptyLine>No approved variation lines</CompactEmptyLine>
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
                  <OperationalTableHead>Source</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {variationLines.map((line) => (
                  <OperationalTableRow key={line.id}>
                    <OperationalTableCell className="max-w-[320px] break-words">{line.description}</OperationalTableCell>
                    <OperationalTableCell>{line.section ?? "—"}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{line.quantity.toFixed(3).replace(/\.?0+$/, "")}</OperationalTableCell>
                    <OperationalTableCell>{line.unit ?? "—"}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(line.unitRate)}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(line.lineTotal)}</OperationalTableCell>
                    <OperationalTableCell>
                      {budgetSourceHref(line) && line.sourceReference ? (
                        <Link href={budgetSourceHref(line)!} className="inline-flex items-center gap-1 text-[var(--brand-blue)] hover:underline">
                          {line.sourceReference}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : line.sourceReference ? (
                        <span className="text-sm text-[var(--text-secondary)]">{line.sourceReference}</span>
                      ) : (
                        "—"
                      )}
                    </OperationalTableCell>
                  </OperationalTableRow>
                ))}
              </OperationalTableBody>
            </OperationalTable>
          )}
        </DetailSubsection>

        <DetailSubsection title="Commercial adjustments" subtotal={adjustmentSubtotal}>
          {adjustmentLines.length === 0 ? (
            <CompactEmptyLine>No commercial adjustments</CompactEmptyLine>
          ) : (
            <OperationalTable>
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>Description</OperationalTableHead>
                  <OperationalTableHead className="text-right">Total</OperationalTableHead>
                  <OperationalTableHead>Source</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {adjustmentLines.map((line) => (
                  <OperationalTableRow key={line.id}>
                    <OperationalTableCell className="max-w-[420px] break-words">{line.description}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(line.lineTotal)}</OperationalTableCell>
                    <OperationalTableCell>{line.sourceReference ?? "—"}</OperationalTableCell>
                  </OperationalTableRow>
                ))}
              </OperationalTableBody>
            </OperationalTable>
          )}
        </DetailSubsection>
      </ExpandableSection>
      ) : null}

      {mode !== "budget" ? (
      <ExpandableSection title="Spend activity">
        <div className="grid gap-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3">
          <InlineMetric label="Committed subtotal" value={formatMoney(row.drilldown.committedSubtotal)} />
          <InlineMetric label="Actual spent subtotal" value={formatMoney(row.drilldown.actualSubtotal)} />
          <InlineMetric label="Remaining / Overrun" value={formatRemaining(row.varianceAmount)} tone={remainingTone} />
        </div>

        <DetailSubsection title="PO commitments" subtotal={row.drilldown.committedSubtotal}>
          {row.drilldown.committedLines.length === 0 ? (
            <CompactEmptyLine>No PO commitments</CompactEmptyLine>
          ) : (
            <OperationalTable>
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>PO</OperationalTableHead>
                  <OperationalTableHead>Status</OperationalTableHead>
                  <OperationalTableHead>Description</OperationalTableHead>
                  <OperationalTableHead className="text-right">Qty</OperationalTableHead>
                  <OperationalTableHead>Unit</OperationalTableHead>
                  <OperationalTableHead className="text-right">Rate</OperationalTableHead>
                  <OperationalTableHead className="text-right">Total</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {row.drilldown.committedLines.map((line) => (
                  <OperationalTableRow key={line.id}>
                    <OperationalTableCell>
                      {line.purchaseOrderId && line.purchaseOrderNumber ? (
                        <div className="space-y-1">
                          <Link
                            href={`/app/projects/${projectSlug}/preconstruction/purchase-orders/${line.purchaseOrderId}`}
                            className="inline-flex items-center gap-1 text-[var(--brand-blue)] hover:underline"
                          >
                            {line.purchaseOrderNumber}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          {line.purchaseOrderTitle ? (
                            <p className="max-w-[220px] break-words text-xs text-[var(--text-secondary)]">
                              {line.purchaseOrderTitle}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </OperationalTableCell>
                    <OperationalTableCell>{line.purchaseOrderStatus ?? "—"}</OperationalTableCell>
                    <OperationalTableCell className="max-w-[320px] break-words">{line.description}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{line.quantity.toFixed(3).replace(/\.?0+$/, "")}</OperationalTableCell>
                    <OperationalTableCell>{line.unit ?? "—"}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(line.rate)}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(line.total)}</OperationalTableCell>
                  </OperationalTableRow>
                ))}
              </OperationalTableBody>
            </OperationalTable>
          )}
        </DetailSubsection>

        <DetailSubsection title="Actual spend" subtotal={row.drilldown.actualSubtotal}>
          <p className="text-xs text-[var(--text-secondary)]">Includes postings, reversals, and reposts.</p>
          {row.drilldown.actualEvents.length === 0 ? (
            <CompactEmptyLine>No actual spend</CompactEmptyLine>
          ) : (
            <OperationalTable>
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>Date</OperationalTableHead>
                  <OperationalTableHead>Type</OperationalTableHead>
                  <OperationalTableHead>Source</OperationalTableHead>
                  <OperationalTableHead>Supplier</OperationalTableHead>
                  <OperationalTableHead>Match</OperationalTableHead>
                  <OperationalTableHead className="text-right">Amount</OperationalTableHead>
                  <OperationalTableHead className="text-right">Tax</OperationalTableHead>
                  <OperationalTableHead className="text-right">Total</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {row.drilldown.actualEvents.map((event) => (
                  <OperationalTableRow key={event.id}>
                    <OperationalTableCell>{event.eventDate}</OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        <StatusBadge status={actualLedgerBadgeStatus(event.ledgerLabel)}>
                          {event.ledgerLabel}
                        </StatusBadge>
                        {event.isCorrectionChain ? (
                          <p className="text-xs text-[var(--text-secondary)]">
                            Chain {event.correctionRootEventId?.slice(0, 8) ?? "—"}
                          </p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        {event.supplierInvoiceId && event.supplierInvoiceNumber ? (
                          <Link
                            href={`/app/company/supplier-invoices/${event.supplierInvoiceId}`}
                            className="inline-flex items-center gap-1 text-[var(--brand-blue)] hover:underline"
                          >
                            {event.supplierInvoiceNumber}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <span>—</span>
                        )}
                        {event.purchaseOrderId && event.purchaseOrderNumber ? (
                          <Link
                            href={`/app/projects/${projectSlug}/preconstruction/purchase-orders/${event.purchaseOrderId}`}
                            className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--brand-blue)] hover:underline"
                          >
                            PO {event.purchaseOrderNumber}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        ) : null}
                        {event.supplierReference ? (
                          <p className="max-w-[220px] break-words text-xs text-[var(--text-secondary)]">
                            Ref: {event.supplierReference}
                          </p>
                        ) : null}
                        {event.reversalReason ? (
                          <p className="max-w-[220px] break-words text-xs text-[var(--text-secondary)]">
                            Reason: {event.reversalReason}
                          </p>
                        ) : null}
                        {event.reversalNote ? (
                          <p className="max-w-[220px] break-words text-xs text-[var(--text-secondary)]">
                            Note: {event.reversalNote}
                          </p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>{event.supplierName ?? "—"}</OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={event.matchLabel === "Matched" ? "approved" : "pending"}>
                        {event.matchLabel}
                      </StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(event.amount)}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(event.taxAmount)}</OperationalTableCell>
                    <OperationalTableCell className="text-right">{formatMoney(event.totalAmount)}</OperationalTableCell>
                  </OperationalTableRow>
                ))}
              </OperationalTableBody>
            </OperationalTable>
          )}
        </DetailSubsection>
      </ExpandableSection>
      ) : null}
    </div>
  );
}

export function ProjectFinancialsReport({
  report,
}: {
  report: ProjectCostReportData;
}) {
  const [expandedBudgetKeys, setExpandedBudgetKeys] = useState<Set<string>>(new Set());
  const [expandedSpendKeys, setExpandedSpendKeys] = useState<Set<string>>(new Set());

  const toggleBudgetRow = (key: string) => {
    setExpandedBudgetKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSpendRow = (key: string) => {
    setExpandedSpendKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const emptyMessages = [
    !report.states.hasBaselineQuote
      ? "No baseline quote found yet. Estimated costs are shown as zero until the project has an accepted, sent, or latest quote."
      : null,
    !report.states.hasCommittedCosts
      ? "No committed purchase order costs found yet in Approved, Issued, Received, or Invoiced status."
      : null,
    !report.states.hasPostedActuals
      ? "No posted actual-cost ledger events found yet. Supplier invoice allocations must be approved and posted before they appear here."
      : null,
  ].filter((value): value is string => Boolean(value));

  const budgetRows = report.rows.filter((row) => row.estimated !== 0 || row.isBudgetAdjustment);
  const spendRows = report.rows.filter(
    (row) =>
      row.estimated !== 0 ||
      row.committed !== 0 ||
      row.actual !== 0 ||
      row.isUnmatchedActual ||
      row.drilldown.actualEvents.length > 0
  );

  return (
    <main className="space-y-6 bg-[var(--background)] pb-8">
      <OperationalModuleHeader
        title="Financials"
        description="Project cost report showing budget, commitments, and spend."
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status="active">{report.taxBasisLabel}</StatusBadge>
          {report.baselineQuote ? (
            <StatusBadge status="draft">
              Baseline Quote {report.baselineQuote.quoteNumber} ({report.baselineQuote.status})
            </StatusBadge>
          ) : (
            <StatusBadge status="pending">No baseline quote</StatusBadge>
          )}
        </div>
      </OperationalModuleHeader>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OperationalKpiCard
          label="Current Budget"
          value={formatMoney(report.summary.currentBudget)}
          helper={report.baselineQuote ? `Baseline quote ${report.baselineQuote.quoteNumber} plus approved variations` : "Awaiting baseline quote"}
          icon={<Calculator className="h-5 w-5" />}
          tone="navy"
        >
          <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center justify-between gap-3">
              <span>Original Budget</span>
              <span className="font-medium text-[var(--text-primary)]">{formatMoney(report.summary.originalBudget)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Approved Variations</span>
              <span className="font-medium text-[var(--text-primary)]">{formatMoney(report.summary.approvedVariations)}</span>
            </div>
          </div>
        </OperationalKpiCard>
        <OperationalKpiCard
          label="Committed"
          value={formatMoney(report.summary.committed)}
          helper="Approved, issued, received, and invoiced PO lines"
          icon={<Landmark className="h-5 w-5" />}
          tone="amber"
        />
        <OperationalKpiCard
          label="Spent"
          value={formatMoney(report.summary.actual)}
          helper="Net posted actual-cost ledger events"
          icon={<ReceiptText className="h-5 w-5" />}
          tone="orange"
        />
        <OperationalKpiCard
          label="Remaining / Overrun"
          value={formatRemaining(report.summary.varianceAmount)}
          helper={
            report.summary.currentBudget === 0
              ? "Awaiting current budget"
              : formatPercent(report.summary.variancePercent)
          }
          icon={<TrendingDown className="h-5 w-5" />}
          tone={
            report.summary.varianceAmount > 0
              ? "sage"
              : report.summary.varianceAmount < 0
                ? "red"
                : "neutral"
          }
        />
      </section>

      <OperationalPanel
        title="Budget structure"
        description="Shows how the approved project budget is made up from the original quote, approved variations, and any commercial adjustments."
      >
        <div className="space-y-4">
          {emptyMessages.length > 0 ? (
            <div className="space-y-2">
              {emptyMessages.map((message) => (
                <OperationalAlert key={message} variant="info">
                  {message}
                </OperationalAlert>
              ))}
            </div>
          ) : null}

          {budgetRows.length === 0 ? (
            <OperationalEmptyState
              title="No budget structure available yet."
              description="Add a baseline quote or approved variations to populate the project budget structure."
            />
          ) : (
            <OperationalTable>
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead className="w-[52px]"> </OperationalTableHead>
                  <OperationalTableHead>Budget area / Trade package</OperationalTableHead>
                  <OperationalTableHead className="text-right">Original Budget</OperationalTableHead>
                  <OperationalTableHead className="text-right">Approved Variations</OperationalTableHead>
                  <OperationalTableHead className="text-right">Current Budget</OperationalTableHead>
                  <OperationalTableHead>Source / Status</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {budgetRows.map((row) => {
                  const isExpanded = expandedBudgetKeys.has(row.key);
                  const rowStatus = deriveRowStatus(row);
                  const costAreaLabel = deriveCostAreaLabel(row);
                  const originalBudget = row.drilldown.estimatedLines
                    .filter((line) => line.sourceType === "quote")
                    .reduce((sum, line) => sum + line.lineTotal, 0);
                  const approvedVariations = row.drilldown.estimatedLines
                    .filter((line) => line.sourceType === "variation")
                    .reduce((sum, line) => sum + line.lineTotal, 0);
                  return (
                    <Fragment key={row.key}>
                      <OperationalTableRow key={row.key}>
                        <OperationalTableCell>
                          <button
                            type="button"
                            onClick={() => toggleBudgetRow(row.key)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Collapse row" : "Expand row"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="break-words font-medium text-[var(--text-primary)]">
                                {costAreaLabel}
                              </span>
                              {row.isUnmatchedActual ? (
                                <StatusBadge status="pending">Unmatched actual</StatusBadge>
                              ) : row.isBudgetAdjustment ? (
                                <StatusBadge status="draft">Reconciliation</StatusBadge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                              {deriveRowMetadata(row).length > 0 ? (
                                deriveRowMetadata(row).map((value) => <span key={value}>{value}</span>)
                              ) : !row.isUnmatchedActual && !row.isBudgetAdjustment ? (
                                <span>Unclassified</span>
                              ) : null}
                            </div>
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell className="text-right">{formatMoney(originalBudget)}</OperationalTableCell>
                        <OperationalTableCell className="text-right">{formatMoney(approvedVariations)}</OperationalTableCell>
                        <OperationalTableCell className="text-right font-medium">{formatMoney(row.estimated)}</OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-2">
                            <p className="text-sm text-[var(--text-secondary)]">
                              {row.isBudgetAdjustment
                                ? "Commercial reconciliation"
                                : approvedVariations > 0
                                  ? "Original quote + approved variations"
                                  : "Original quote"}
                            </p>
                            <StatusBadge status={row.isBudgetAdjustment ? "draft" : rowStatus.status}>
                              {row.isBudgetAdjustment ? "Reconciliation" : approvedVariations > 0 ? "Revised budget" : "Original budget"}
                            </StatusBadge>
                          </div>
                        </OperationalTableCell>
                      </OperationalTableRow>
                      {isExpanded ? (
                        <OperationalTableRow className="hover:bg-transparent">
                          <OperationalTableCell colSpan={6} className="bg-[var(--background)]">
                            <DrilldownContent projectSlug={report.projectSlug} row={row} mode="budget" />
                          </OperationalTableCell>
                        </OperationalTableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </OperationalTableBody>
              <OperationalTableFooter>
                <OperationalTableRow>
                  <OperationalTableCell />
                  <OperationalTableCell className="font-semibold">Totals</OperationalTableCell>
                  <OperationalTableCell className="text-right font-semibold">{formatMoney(report.summary.originalBudget)}</OperationalTableCell>
                  <OperationalTableCell className="text-right font-semibold">{formatMoney(report.summary.approvedVariations)}</OperationalTableCell>
                  <OperationalTableCell className="text-right font-semibold">{formatMoney(report.summary.currentBudget)}</OperationalTableCell>
                  <OperationalTableCell>
                    <StatusBadge status="approved">Approved allowance</StatusBadge>
                  </OperationalTableCell>
                </OperationalTableRow>
              </OperationalTableFooter>
            </OperationalTable>
          )}
        </div>
      </OperationalPanel>

      <OperationalPanel
        title="Spend activity"
        description="Shows committed and posted spend against the current project budget."
      >
        <div className="space-y-4">
          {!report.states.hasReportRows ? (
            <OperationalEmptyState
              title="No spend activity available yet."
              description="Add committed purchase orders or posted actual costs to populate spend activity."
            />
          ) : (
            <OperationalTable>
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead className="w-[52px]"> </OperationalTableHead>
                  <OperationalTableHead>Cost area / Trade package</OperationalTableHead>
                  <OperationalTableHead className="text-right">Current Budget</OperationalTableHead>
                  <OperationalTableHead className="text-right">Committed</OperationalTableHead>
                  <OperationalTableHead className="text-right">Spent</OperationalTableHead>
                  <OperationalTableHead className="text-right">Remaining / Overrun</OperationalTableHead>
                  <OperationalTableHead>Status</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {spendRows.map((row) => {
                  const isExpanded = expandedSpendKeys.has(row.key);
                  const rowStatus = deriveRowStatus(row);
                  const costAreaLabel = deriveCostAreaLabel(row);
                  return (
                    <Fragment key={`spend-${row.key}`}>
                      <OperationalTableRow>
                        <OperationalTableCell>
                          <button
                            type="button"
                            onClick={() => toggleSpendRow(row.key)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Collapse row" : "Expand row"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="break-words font-medium text-[var(--text-primary)]">{costAreaLabel}</span>
                              {row.isUnmatchedActual ? <StatusBadge status="pending">Unmatched actual</StatusBadge> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                              {deriveRowMetadata(row).length > 0 ? (
                                deriveRowMetadata(row).map((value) => <span key={value}>{value}</span>)
                              ) : !row.isUnmatchedActual && !row.isBudgetAdjustment ? (
                                <span>Unclassified</span>
                              ) : null}
                            </div>
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell className="text-right">{formatMoney(row.estimated)}</OperationalTableCell>
                        <OperationalTableCell className="text-right">{formatMoney(row.committed)}</OperationalTableCell>
                        <OperationalTableCell className="text-right">{formatMoney(row.actual)}</OperationalTableCell>
                        <OperationalTableCell className={cn("text-right font-medium", row.varianceAmount < 0 ? "text-[var(--status-overdue)]" : row.varianceAmount > 0 ? "text-[var(--status-approved)]" : "text-[var(--text-primary)]")}>
                          {formatRemaining(row.varianceAmount)}
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <StatusBadge status={rowStatus.status}>{rowStatus.label}</StatusBadge>
                        </OperationalTableCell>
                      </OperationalTableRow>
                      {isExpanded ? (
                        <OperationalTableRow className="hover:bg-transparent">
                          <OperationalTableCell colSpan={7} className="bg-[var(--background)]">
                            <DrilldownContent projectSlug={report.projectSlug} row={row} mode="spend" />
                          </OperationalTableCell>
                        </OperationalTableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </OperationalTableBody>
              <OperationalTableFooter>
                <OperationalTableRow>
                  <OperationalTableCell />
                  <OperationalTableCell className="font-semibold">Totals</OperationalTableCell>
                  <OperationalTableCell className="text-right font-semibold">{formatMoney(report.summary.currentBudget)}</OperationalTableCell>
                  <OperationalTableCell className="text-right font-semibold">{formatMoney(report.summary.committed)}</OperationalTableCell>
                  <OperationalTableCell className="text-right font-semibold">{formatMoney(report.summary.actual)}</OperationalTableCell>
                  <OperationalTableCell className={cn("text-right font-semibold", report.summary.varianceAmount < 0 ? "text-[var(--status-overdue)]" : report.summary.varianceAmount > 0 ? "text-[var(--status-approved)]" : "text-[var(--text-primary)]")}>
                    {formatRemaining(report.summary.varianceAmount)}
                  </OperationalTableCell>
                  <OperationalTableCell>
                    <StatusBadge
                      status={
                        report.summary.currentBudget === 0 && report.summary.actual > 0
                          ? "overdue"
                          : report.summary.actual > report.summary.currentBudget
                            ? "overdue"
                            : report.summary.actual > 0
                              ? "approved"
                              : "draft"
                      }
                    >
                      {report.summary.currentBudget === 0 && report.summary.actual > 0
                        ? "No budget"
                        : report.summary.actual > report.summary.currentBudget
                          ? "Overspent"
                          : report.summary.actual > 0
                            ? "On track"
                            : "No spend yet"}
                    </StatusBadge>
                  </OperationalTableCell>
                </OperationalTableRow>
              </OperationalTableFooter>
            </OperationalTable>
          )}
        </div>
      </OperationalPanel>
    </main>
  );
}
