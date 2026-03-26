"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsHeaderFilters } from "@/components/app/AnalyticsHeaderFilters";
import type { OpportunityStage } from "@/lib/supabase/types";

export type AnalyticsOpportunityRow = {
  opportunityId: string;
  slug: string;
  name: string;
  location: string;
  stage: OpportunityStage;
  clientId: string | null;
  clientName: string;
  ownerName: string;
  dueDateIso: string | null;
  quotedDateIso: string | null;
  hasQuote: boolean;
  latestQuoteStatus: string | null;
  latestQuoteUpdatedIso: string | null;
  valueNZD: number;
  workspaceProjectId: string | null;
  workspaceProjectSlug: string | null;
  convertedProjectId: string | null;
  group: "pipeline" | "priced" | "won";
};

function formatCurrencyCompactNZD(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrencyNZD(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getReferenceDate(row: AnalyticsOpportunityRow): Date | null {
  const source = row.latestQuoteUpdatedIso ?? row.quotedDateIso ?? row.dueDateIso;
  if (!source) {
    return null;
  }

  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getDaysUntilIso(isoDate: string | null): number | null {
  if (!isoDate) {
    return null;
  }

  const due = new Date(isoDate);
  if (Number.isNaN(due.getTime())) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.ceil((dueMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isQuoteStatusIncluded(status: string | null): boolean {
  return status === "Sent" || status === "Accepted" || status === "Rejected" || status === "Expired";
}

function windowStartForRange(range: string): Date | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "7d") {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  }
  if (range === "30d") {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
  }
  if (range === "90d") {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 90);
  }
  return null;
}

function softCardClassName() {
  return "border-[#F0F4FA] bg-white shadow-[0_1px_2px_rgba(8,40,81,0.035),0_12px_30px_rgba(8,40,81,0.05)]";
}

export function AnalyticsDashboardClient({
  initialRows,
}: {
  initialRows: AnalyticsOpportunityRow[];
}) {
  const [range, setRange] = useState<string>("30d");
  const [estimator, setEstimator] = useState<string>("all");
  const [client, setClient] = useState<string>("all");
  const [hoverMonthIndex, setHoverMonthIndex] = useState<number | null>(null);

  const estimatorOptions = useMemo(
    () => Array.from(new Set(initialRows.map((row) => row.ownerName))).sort((a, b) => a.localeCompare(b)),
    [initialRows]
  );
  const clientOptions = useMemo(
    () => Array.from(new Set(initialRows.map((row) => row.clientName))).sort((a, b) => a.localeCompare(b)),
    [initialRows]
  );

  const safeEstimator = estimator !== "all" && !estimatorOptions.includes(estimator) ? "all" : estimator;
  const safeClient = client !== "all" && !clientOptions.includes(client) ? "all" : client;

  const orgRows = useMemo(
    () =>
      initialRows.filter((row) => {
        if (safeEstimator !== "all" && row.ownerName !== safeEstimator) {
          return false;
        }
        if (safeClient !== "all" && row.clientName !== safeClient) {
          return false;
        }
        return true;
      }),
    [initialRows, safeClient, safeEstimator]
  );

  const startDateForRange = windowStartForRange(range);
  const windowRows = orgRows.filter((row) => {
    if (!startDateForRange) {
      return true;
    }
    const stamp = getReferenceDate(row);
    return stamp ? stamp >= startDateForRange : false;
  });

  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const pastYearRows = orgRows.filter((row) => {
    const stamp = getReferenceDate(row);
    return stamp ? stamp >= oneYearAgo : false;
  });

  const currentPipelineRows = orgRows.filter(
    (row) => row.stage !== "Won" && row.stage !== "Lost" && row.latestQuoteStatus === "Sent"
  );
  const currentPipelineValue = currentPipelineRows.reduce((sum, row) => sum + row.valueNZD, 0);

  const totalQuoteRows = windowRows.filter((row) => {
    if (isQuoteStatusIncluded(row.latestQuoteStatus)) {
      return true;
    }
    return row.stage === "Quoted" || row.stage === "Won" || row.stage === "Lost";
  });
  const totalQuotesValue = totalQuoteRows.reduce((sum, row) => sum + row.valueNZD, 0);

  const pastYearQuoteRows = pastYearRows.filter((row) => {
    if (isQuoteStatusIncluded(row.latestQuoteStatus)) {
      return true;
    }
    return row.stage === "Quoted" || row.stage === "Won" || row.stage === "Lost";
  });

  const totalLeadsPricedPastYear = pastYearQuoteRows.length;
  const totalProjectsWonPastYear = pastYearRows.filter((row) => row.stage === "Won").length;
  const totalProjectsLostPastYear = pastYearRows.filter((row) => row.stage === "Lost").length;
  const totalClosedPastYear = totalProjectsWonPastYear + totalProjectsLostPastYear;
  const conversionRatePastYear = totalClosedPastYear > 0 ? Math.round((totalProjectsWonPastYear / totalClosedPastYear) * 100) : 0;
  const averageQuoteTotalPastYear =
    totalLeadsPricedPastYear > 0
      ? pastYearQuoteRows.reduce((sum, row) => sum + row.valueNZD, 0) / totalLeadsPricedPastYear
      : 0;

  const clientClosedStats = new Map<string, { wins: number; closed: number }>();
  for (const row of pastYearRows) {
    if (row.stage !== "Won" && row.stage !== "Lost") {
      continue;
    }
    const current = clientClosedStats.get(row.clientName) ?? { wins: 0, closed: 0 };
    current.closed += 1;
    if (row.stage === "Won") {
      current.wins += 1;
    }
    clientClosedStats.set(row.clientName, current);
  }

  const highestClientConversion = Array.from(clientClosedStats.entries())
    .map(([name, stats]) => ({
      name,
      conversion: stats.closed > 0 ? Math.round((stats.wins / stats.closed) * 100) : 0,
      closed: stats.closed,
    }))
    .sort((a, b) => b.conversion - a.conversion || b.closed - a.closed)[0] ?? null;

  const quotesByClient = new Map<string, number>();
  for (const row of pastYearQuoteRows) {
    quotesByClient.set(row.clientName, (quotesByClient.get(row.clientName) ?? 0) + 1);
  }
  const quotesByClientRows = Array.from(quotesByClient.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const mostQuotesClient = quotesByClientRows[0] ?? null;
  const leastQuotesClient = quotesByClientRows.length > 0 ? quotesByClientRows[quotesByClientRows.length - 1] : null;

  const monthTrend = (() => {
    const buckets: Array<{ label: string; value: number; quoteCount: number }> = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
      let monthValue = 0;
      let monthCount = 0;
      for (const row of pastYearQuoteRows) {
        const stamp = getReferenceDate(row);
        if (!stamp || stamp < start || stamp > end) {
          continue;
        }
        monthValue += row.valueNZD;
        monthCount += 1;
      }
      buckets.push({
        label: new Intl.DateTimeFormat("en-NZ", { month: "short" }).format(date),
        value: monthValue,
        quoteCount: monthCount,
      });
    }
    return buckets;
  })();

  const maxTrendValue = Math.max(...monthTrend.map((row) => row.value), 1);
  const maxTrendQuoteCount = Math.max(...monthTrend.map((row) => row.quoteCount), 1);
  const lineSeriesPoints = monthTrend.map((bucket, index) => {
    const x = (index / Math.max(monthTrend.length - 1, 1)) * 100;
    const y = 92 - (bucket.quoteCount / maxTrendQuoteCount) * 72;
    return {
      x,
      y: Math.max(12, Math.min(94, y)),
    };
  });
  const linePath = lineSeriesPoints.reduce((path, point, index, points) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    const prev = points[index - 1];
    const controlX = (prev.x + point.x) / 2;
    return `${path} C ${controlX} ${prev.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");

  const sentQuoteValue = totalQuoteRows
    .filter((row) => row.latestQuoteStatus === "Sent" || (row.latestQuoteStatus == null && row.stage === "Quoted"))
    .reduce((sum, row) => sum + row.valueNZD, 0);
  const wonQuoteValue = totalQuoteRows
    .filter((row) => row.latestQuoteStatus === "Accepted" || row.stage === "Won")
    .reduce((sum, row) => sum + row.valueNZD, 0);
  const lostQuoteValue = totalQuoteRows
    .filter((row) => row.latestQuoteStatus === "Rejected" || row.stage === "Lost")
    .reduce((sum, row) => sum + row.valueNZD, 0);
  const expiredQuoteValue = totalQuoteRows
    .filter((row) => row.latestQuoteStatus === "Expired")
    .reduce((sum, row) => sum + row.valueNZD, 0);

  const openRows = orgRows.filter((row) => row.stage !== "Won" && row.stage !== "Lost");
  const openAverageValue = openRows.length > 0 ? openRows.reduce((sum, row) => sum + row.valueNZD, 0) / openRows.length : 0;
  const highValueDueThisWeek = openRows.filter((row) => {
    const days = getDaysUntilIso(row.dueDateIso);
    return days !== null && days >= 0 && days <= 7 && row.valueNZD >= openAverageValue;
  }).length;
  const tendersNotStarted = openRows.filter((row) => row.stage === "New").length;
  const overdueSubmissions = openRows.filter((row) => {
    const days = getDaysUntilIso(row.dueDateIso);
    return days !== null && days < 0;
  }).length;

  const handleExport = () => {
    const rows = windowRows.map((row) => ({
      opportunity: row.name,
      client: row.clientName,
      estimator: row.ownerName,
      stage: row.stage,
      quoteStatus: row.latestQuoteStatus ?? "",
      valueNZD: row.valueNZD,
      dueDate: row.dueDateIso ?? "",
      referenceDate: getReferenceDate(row)?.toISOString() ?? "",
    }));
    const header = ["Opportunity", "Client", "Estimator", "Stage", "Quote Status", "Value (NZD)", "Due Date", "Reference Date"];
    const csvBody = rows
      .map((item) =>
        [
          item.opportunity,
          item.client,
          item.estimator,
          item.stage,
          item.quoteStatus,
          String(item.valueNZD),
          item.dueDate,
          item.referenceDate,
        ]
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");
    const csv = `${header.join(",")}\n${csvBody}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pipeline-intelligence-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="bg-[#F4F6FA] pb-8">
      <div className="mx-auto w-full max-w-[1280px] space-y-4">
        <section className="space-y-1 pt-1 text-center">
          <h2 className="text-[48px] font-semibold leading-none tracking-[-0.04em] text-[#082851] sm:text-[52px]">Pipeline Intelligence</h2>
          <p className="mx-auto max-w-[820px] text-[17px] text-[#5B6F8A]">
            Track your pipeline, conversion, and client performance in one place
          </p>
        </section>

        <div className="rounded-xl border border-[#EAF0F7] bg-white/85 p-3 shadow-[0_1px_2px_rgba(8,40,81,0.035)]">
          <AnalyticsHeaderFilters
            range={range}
            estimator={safeEstimator}
            client={safeClient}
            estimatorOptions={estimatorOptions}
            clientOptions={clientOptions}
            onRangeChange={(value) => setRange(value)}
            onEstimatorChange={(value) => setEstimator(value)}
            onClientChange={(value) => setClient(value)}
            onExport={handleExport}
          />
        </div>

        <section className="grid gap-4 xl:grid-cols-12">
          <Card className={`border-[#0C335E] bg-gradient-to-br from-[#04234D] to-[#06305F] shadow-[0_1px_2px_rgba(8,40,81,0.08),0_10px_24px_rgba(4,35,77,0.18)] xl:col-span-3`}>
            <CardContent className="flex h-full flex-col justify-between p-7">
              <div>
                <p className="text-sm font-medium text-white/70">Outstanding Quotes</p>
                <p className="mt-4 text-[70px] font-semibold leading-none tracking-[-0.04em] text-white">
                  {formatCurrencyCompactNZD(currentPipelineValue)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/70">Open quotes awaiting response</p>
              </div>
              <div className="mt-5 border-t border-white/30 pt-3 text-[11px] text-white/85">
                <span className="font-medium text-white/85">Sent</span> <span className="font-semibold text-[#F74917]">{formatCurrencyCompactNZD(sentQuoteValue)}</span>
                <span className="mx-2 text-white/55">•</span>
                <span className="font-medium text-white/85">Won</span> <span className="font-semibold text-[#F74917]">{formatCurrencyCompactNZD(wonQuoteValue)}</span>
                <span className="mx-2 text-white/55">•</span>
                <span className="font-medium text-white/85">Lost</span> <span className="font-semibold text-[#F74917]">{formatCurrencyCompactNZD(lostQuoteValue)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className={`${softCardClassName()} xl:col-span-6`}>
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold text-[#082851]">Number of quotes / Quote Total (Past 12 months)</CardTitle>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-[#C8D6EE] bg-[#EEF3FC] px-2 py-0.5 font-medium text-[#6F8FC7]">Quote No.</span>
                  <span className="rounded-full border border-[#F8CFC2] bg-[#FFF1EB] px-2 py-0.5 font-medium text-[#F9A489]">Quote $</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="relative rounded-xl border border-[#EAF0F7] bg-[#FAFCFF] p-4">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-x-8 top-7 grid h-32 grid-rows-4">
                    <div className="border-b border-[#ECF2F9]" />
                    <div className="border-b border-[#ECF2F9]" />
                    <div className="border-b border-[#ECF2F9]" />
                    <div className="border-b border-[#ECF2F9]" />
                  </div>
                  <div className="pointer-events-none absolute left-0 top-7 flex h-32 w-8 flex-col justify-between text-[9px] font-medium text-[#8A9CB5]">
                    <span>{formatCurrencyCompactNZD(maxTrendValue)}</span>
                    <span>{formatCurrencyCompactNZD(maxTrendValue * 0.66)}</span>
                    <span>{formatCurrencyCompactNZD(maxTrendValue * 0.33)}</span>
                    <span>$0</span>
                  </div>
                  <div className="grid h-40 grid-cols-12 items-end gap-2 pl-8">
                    {monthTrend.map((bucket, index) => (
                      <button
                        key={bucket.label}
                        type="button"
                        onMouseEnter={() => setHoverMonthIndex(index)}
                        onMouseLeave={() => setHoverMonthIndex(null)}
                        onFocus={() => setHoverMonthIndex(index)}
                        onBlur={() => setHoverMonthIndex(null)}
                        className="flex flex-col items-center gap-2 rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#BFD0EA]"
                      >
                        <div className="relative flex h-32 w-full items-end justify-center rounded-[8px] bg-[#F2F5FA] px-1">
                          <div
                            className={index === monthTrend.length - 1 ? "w-[66%] rounded-[6px] bg-[#F9A489] transition-all" : "w-[66%] rounded-[6px] bg-[#8BA5DD] transition-all"}
                            style={{
                              height: `${Math.max((bucket.value / maxTrendValue) * 100, bucket.value > 0 ? 3 : 0)}%`,
                              opacity: hoverMonthIndex !== null && hoverMonthIndex !== index ? 0.45 : 0.95,
                            }}
                            title={`${bucket.label}: ${formatCurrencyNZD(bucket.value)}`}
                          />
                          {hoverMonthIndex === index ? (
                            <div className="absolute -top-9 z-20 rounded-md border border-[#DDE7F2] bg-white px-2 py-1 text-[10px] font-medium text-[#253A59] shadow-sm">
                              {bucket.label} · {formatCurrencyNZD(bucket.value)} · {bucket.quoteCount} quotes
                            </div>
                          ) : null}
                        </div>
                        <p className="text-[10px] font-medium text-[#6F829E]">{bucket.label}</p>
                      </button>
                    ))}
                  </div>
                  <svg
                    className="pointer-events-none absolute inset-x-8 top-7 h-[128px] w-[calc(100%-2rem)]"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <path
                      fill="none"
                      d={linePath}
                      stroke="#6F8FC7"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.8"
                    />
                    <circle
                      cx={lineSeriesPoints[Math.max(monthTrend.length - 1, 0)]?.x ?? 100}
                      cy={lineSeriesPoints[Math.max(monthTrend.length - 1, 0)]?.y ?? 50}
                      r="1.6"
                      fill="#F9A489"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4 xl:col-span-3">
            <Card className={`${softCardClassName()}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F74917]" />
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#6F819B]">Highest Client Conversion</p>
                </div>
                <p className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[#082851]">
                  {highestClientConversion ? highestClientConversion.name : "Tradesstack Limited"}
                </p>
                <div className="mt-2 h-px bg-[#EDF2F8]" />
                <p className="mt-2.5 text-[15px] font-medium text-[#62758F]">
                  {highestClientConversion ? `${highestClientConversion.conversion}% conversion` : "100% conversion"}
                </p>
                <p className="mt-1 text-[13px] text-[#8092AA]">Top performer this period</p>
              </CardContent>
            </Card>

            <Card className={`${softCardClassName()}`}>
              <CardContent className="p-5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F74917]" />
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#6F819B]">Conversion Rate</p>
                </div>
                <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#082851]">
                  {conversionRatePastYear}%
                </p>
                <div className="mt-2 h-px bg-[#EDF2F8]" />
                <div className="mt-2.5 flex items-center gap-3">
                  <div
                    className="relative h-10 w-10 rounded-full"
                    style={{ background: `conic-gradient(#F74917 ${conversionRatePastYear * 3.6}deg, #E8EEF7 0deg)` }}
                  >
                    <div className="absolute inset-[4px] flex items-center justify-center rounded-full bg-white text-[9px] font-semibold text-[#082851]">
                      {conversionRatePastYear}%
                    </div>
                  </div>
                  <p className="text-[11px] text-[#8899AF]">Won vs lost (past 12 months)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-6">
          <Card className={`${softCardClassName()}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F74917]" />
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#6F819B]">Total Quotes</p>
              </div>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#082851]">{formatCurrencyCompactNZD(totalQuotesValue)}</p>
              <div className="mt-2 h-px bg-[#EDF2F8]" />
              <p className="mt-2.5 text-[11px] text-[#7B8DA6]">
                Sent {formatCurrencyCompactNZD(sentQuoteValue)} • Won {formatCurrencyCompactNZD(wonQuoteValue)} • Lost {formatCurrencyCompactNZD(lostQuoteValue)} • Exp {formatCurrencyCompactNZD(expiredQuoteValue)}
              </p>
            </CardContent>
          </Card>
          <Card className={`${softCardClassName()}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F74917]" />
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#7B8DA6]">Leads Priced</p>
              </div>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#082851]">{totalLeadsPricedPastYear}</p>
              <div className="mt-2 h-px bg-[#EDF2F8]" />
              <p className="mt-2.5 text-[11px] text-[#8899AF]">Past 12 months</p>
            </CardContent>
          </Card>
          <Card className={`${softCardClassName()}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F74917]" />
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#7B8DA6]">Projects Won</p>
              </div>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#082851]">{totalProjectsWonPastYear}</p>
              <div className="mt-2 h-px bg-[#EDF2F8]" />
              <p className="mt-2.5 text-[11px] text-[#8899AF]">Past 12 months</p>
            </CardContent>
          </Card>
          <Card className={`${softCardClassName()}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F74917]" />
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#7B8DA6]">Projects Lost</p>
              </div>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#082851]">{totalProjectsLostPastYear}</p>
              <div className="mt-2 h-px bg-[#EDF2F8]" />
              <p className="mt-2.5 text-[11px] text-[#8899AF]">Past 12 months</p>
            </CardContent>
          </Card>
          <Card className={`${softCardClassName()}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F74917]" />
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#7B8DA6]">Conversion Rate</p>
              </div>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#082851]">{conversionRatePastYear}%</p>
              <div className="mt-2 h-px bg-[#EDF2F8]" />
              <p className="mt-2.5 text-[11px] text-[#8899AF]">Past 12 months</p>
            </CardContent>
          </Card>
          <Card className={`${softCardClassName()}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F74917]" />
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#7B8DA6]">Average Quote Total</p>
              </div>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#082851]">{formatCurrencyCompactNZD(averageQuoteTotalPastYear)}</p>
              <div className="mt-2 h-px bg-[#EDF2F8]" />
              <p className="mt-2.5 text-[11px] text-[#8899AF]">Past 12 months</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-12">
          <Card className={`${softCardClassName()} xl:col-span-8`}>
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#F74917]" />
                <CardTitle className="text-[19px] font-semibold text-[#082851]">Insights</CardTitle>
              </div>
              <div className="mt-2 h-px bg-[#EDF2F8]" />
            </CardHeader>
            <CardContent className="pt-1">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-medium text-[#082851]">Most Active Client</p>
                    <p className="mt-1 text-sm text-[#5B6F8A]">{mostQuotesClient ? mostQuotesClient.name : "No quote data"}</p>
                  </div>
                  <p className="text-xl font-semibold text-[#082851]">{mostQuotesClient ? `${mostQuotesClient.count} submitted` : "-"}</p>
                </div>
                <div className="h-px bg-[#E7EDF5]" />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-medium text-[#082851]">Lowest Activity Client</p>
                    <p className="mt-1 text-sm text-[#5B6F8A]">{leastQuotesClient ? leastQuotesClient.name : "No quote data"}</p>
                  </div>
                  <p className="text-xl font-semibold text-[#082851]">{leastQuotesClient ? `${leastQuotesClient.count} submitted` : "-"}</p>
                </div>
                <div className="rounded-lg border border-[#EDF2F8] bg-[#FAFCFF] px-3 py-2 text-sm text-[#5F7390]">
                  {mostQuotesClient && leastQuotesClient && mostQuotesClient.name === leastQuotesClient.name
                    ? "All quotes are currently concentrated in one client. Expand submissions to diversify pipeline risk."
                    : "Quote activity is uneven across clients. There is room to diversify where tenders are being submitted."}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${softCardClassName()} xl:col-span-4`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#F74917]" />
                <p className="text-[19px] font-semibold text-[#082851]">Client Conversion</p>
              </div>
              <div className="mt-2 h-px bg-[#EDF2F8]" />
              <div className="mt-2" />
              <p className="text-[12px] leading-relaxed text-[#5B6F8A]">
                Prioritize high converting clients and close overdue opportunities to improve weekly outcomes.
              </p>
              <div className="mt-2.5 space-y-1 text-[12px] text-[#5D6F89]">
                <p>
                  <span className="font-semibold text-[#082851]">{highValueDueThisWeek}</span> high value jobs due this week
                </p>
                <p>
                  <span className="font-semibold text-[#082851]">{tendersNotStarted}</span> tenders not started
                </p>
                <p>
                  <span className="font-semibold text-[#082851]">{overdueSubmissions}</span> overdue submissions
                </p>
              </div>
              <Button asChild className="mt-3.5 h-9 rounded-xl bg-[#F74917] px-3.5 text-[13px] font-medium text-white shadow-[0_10px_18px_rgba(247,73,23,0.25)] hover:bg-[#e63f10]">
                <Link href="/app/leads-clients/opportunities?due=next7d">View Priority Opportunities</Link>
              </Button>
              <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[#8293AA]">
                <Sparkles className="h-3.5 w-3.5 text-[#F74917]" />
                Weekly focus recommendation
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
