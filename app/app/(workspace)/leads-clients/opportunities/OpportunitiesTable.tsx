"use client";

import Link from "next/link";
import { opportunityQuoteRevisionLabel } from "@/lib/opportunity-quote-display";
import { CalendarDays, User } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { formatMoneyOperational } from "@/lib/format/currency";
import type { LiveOpportunityRow } from "@/lib/leads-clients-server";

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function getDaysUntilIso(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const due = new Date(isoDate);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.ceil((dueMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCurrencyNZD(value: number) {
  return formatMoneyOperational(value);
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

function getDaysLeftBadge(isoDate: string | null) {
  const days = getDaysUntilIso(isoDate);
  if (days === null) return null;

  let status: NonNullable<StatusBadgeProps["status"]> = "approved";
  if (days < 0) status = "overdue";
  else if (days <= 7) status = "overdue";
  else if (days <= 14) status = "pending";
  else if (days <= 21) status = "pending";

  const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days} days`;
  return <StatusBadge status={status}>{label}</StatusBadge>;
}

function WinProbabilityBar({ pct }: { pct: LiveOpportunityRow["clientWinRatePct"] }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-full rounded-full bg-[var(--brand-blue)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-[var(--text-secondary)]">{pct}%</span>
    </div>
  );
}

function OwnerAvatar({ name }: { name: string }) {
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--navy-primary)] text-xs font-bold text-[var(--sidebar-foreground)]">
        {initial}
      </span>
      <span className="text-sm text-[var(--text-primary)]">{name}</span>
    </span>
  );
}

export function OpportunitiesTable({ rows }: { rows: LiveOpportunityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-6">
        <OperationalEmptyState
          icon={<CalendarDays className="h-8 w-8" strokeWidth={1.5} />}
          title="No opportunities found."
        />
      </div>
    );
  }

  return (
    <OperationalTable className="min-w-[900px]">
      <OperationalTableHeader>
        <OperationalTableRow>
          {["OPPORTUNITY", "CONTACT", "TEAM MEMBER", "QUOTED AMOUNT", "QUOTED DATE", "DUE DATE", "DAYS LEFT", "WIN PROBABILITY"].map((col) => (
            <OperationalTableHead key={col} className="text-xs tracking-[0.07em] text-[var(--text-secondary)]">
              {col}
            </OperationalTableHead>
          ))}
        </OperationalTableRow>
      </OperationalTableHeader>
      <OperationalTableBody>
        {rows.map((row) => (
          <OperationalTableRow key={row.quoteSeriesId ?? row.opportunityId}>
            <OperationalTableCell>
              <Link href={row.quoteRevisionId ? `/app/leads-clients/opportunities/${row.slug}/quote/${row.quoteRevisionId}` : `/app/leads-clients/opportunities/${row.slug}`} className="group block">
                <p className="text-sm font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--brand-blue)]">
                  {row.name}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{row.clientName}</p>
                {row.quoteNumber ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{row.quoteNumber} · {opportunityQuoteRevisionLabel(row.revisionNumber)}</p> : null}
              </Link>
            </OperationalTableCell>

            <OperationalTableCell>
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" strokeWidth={1.8} />
                <span className="text-sm text-[var(--text-primary)]">{row.clientName}</span>
              </div>
              {row.location ? (
                <p className="mt-0.5 pl-5 text-xs text-[var(--text-muted)]">{row.location}</p>
              ) : null}
            </OperationalTableCell>

            <OperationalTableCell>
              <OwnerAvatar name={row.ownerName} />
            </OperationalTableCell>

            <OperationalTableCell>
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {row.valueNZD > 0 ? formatCurrencyNZD(row.valueNZD) : <span className="font-normal text-[var(--text-muted)]">Pending</span>}
              </span>
            </OperationalTableCell>

            <OperationalTableCell className="text-sm text-[var(--text-secondary)]">
              {formatDate(row.quotedDateIso)}
            </OperationalTableCell>

            <OperationalTableCell className="text-sm text-[var(--text-secondary)]">
              {formatDate(row.dueDateIso)}
            </OperationalTableCell>

            <OperationalTableCell>
              {getDaysLeftBadge(row.dueDateIso) ?? <span className="text-xs text-[var(--text-muted)]">—</span>}
            </OperationalTableCell>

            <OperationalTableCell>
              {row.quoteSeriesId ? <span className="text-xs text-[var(--text-muted)]">—</span> : <WinProbabilityBar pct={row.clientWinRatePct} />}
            </OperationalTableCell>
          </OperationalTableRow>
        ))}
      </OperationalTableBody>
    </OperationalTable>
  );
}
