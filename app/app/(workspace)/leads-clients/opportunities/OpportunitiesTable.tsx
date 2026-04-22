"use client";

import Link from "next/link";
import { CalendarDays, User } from "lucide-react";
import type { LiveOpportunityRow } from "@/lib/leads-clients-server";

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
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function getDaysLeftBadge(isoDate: string | null) {
  const days = getDaysUntilIso(isoDate);
  if (days === null) return null;

  let bg = "bg-green-100 text-green-700";
  if (days < 0) bg = "bg-red-100 text-red-700";
  else if (days <= 7) bg = "bg-red-100 text-red-700";
  else if (days <= 14) bg = "bg-orange-100 text-orange-700";
  else if (days <= 21) bg = "bg-yellow-100 text-yellow-700";

  const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days} days`;
  return <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-semibold ${bg}`}>{label}</span>;
}

function WinProbabilityBar({ pct }: { pct: LiveOpportunityRow["clientWinRatePct"] }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#E9ECF2]">
        <div
          className="h-full rounded-full bg-[#F15A29] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[12px] font-medium text-[#5D708C]">{pct}%</span>
    </div>
  );
}

function OwnerAvatar({ name }: { name: string }) {
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B2E4D] text-[11px] font-bold text-white">
        {initial}
      </span>
      <span className="text-[13px] text-[#2C4460]">{name}</span>
    </span>
  );
}

export function OpportunitiesTable({ rows }: { rows: LiveOpportunityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <CalendarDays className="h-8 w-8 text-[#C5D3E0]" strokeWidth={1.5} />
        <p className="text-[14px] text-[#8A9BB0]">No opportunities found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[#E9ECF2]">
            {["OPPORTUNITY", "CONTACT", "TEAM MEMBER", "QUOTED AMOUNT", "QUOTED DATE", "DUE DATE", "DAYS LEFT", "WIN PROBABILITY"].map((col) => (
              <th key={col} className="px-4 py-3 text-[11px] font-semibold tracking-[0.07em] text-[#8A9BB0]">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.opportunityId}
              className="border-b border-[#F0F3F8] transition-colors hover:bg-[#F7F9FC]"
            >
              {/* Opportunity */}
              <td className="px-4 py-4">
                <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="group block">
                  <p className="text-[13px] font-semibold text-[#0F2238] group-hover:text-[#F15A29] transition-colors">
                    {row.name}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#7A8FA8]">{row.clientName}</p>
                </Link>
              </td>

              {/* Contact */}
              <td className="px-4 py-4">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0 text-[#9BAABB]" strokeWidth={1.8} />
                  <span className="text-[13px] text-[#2C4460]">{row.clientName}</span>
                </div>
                {row.location ? (
                  <p className="mt-0.5 pl-5 text-[11.5px] text-[#9BAABB]">{row.location}</p>
                ) : null}
              </td>

              {/* Team member */}
              <td className="px-4 py-4">
                <OwnerAvatar name={row.ownerName} />
              </td>

              {/* Quoted amount */}
              <td className="px-4 py-4">
                <span className="text-[13px] font-semibold text-[#0F2238]">
                  {row.valueNZD > 0 ? formatCurrencyNZD(row.valueNZD) : <span className="font-normal text-[#9BAABB]">Pending</span>}
                </span>
              </td>

              {/* Quoted date */}
              <td className="px-4 py-4">
                <span className="text-[13px] text-[#4A6080]">{formatDate(row.quotedDateIso)}</span>
              </td>

              {/* Due date */}
              <td className="px-4 py-4">
                <span className="text-[13px] text-[#4A6080]">{formatDate(row.dueDateIso)}</span>
              </td>

              {/* Days left */}
              <td className="px-4 py-4">
                {getDaysLeftBadge(row.dueDateIso) ?? <span className="text-[12px] text-[#9BAABB]">—</span>}
              </td>

              {/* Win probability */}
              <td className="px-4 py-4">
                <WinProbabilityBar pct={row.clientWinRatePct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
