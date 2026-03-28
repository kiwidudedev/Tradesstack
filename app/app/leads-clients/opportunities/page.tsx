import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getLiveOpportunitiesForCurrentUser, type LiveOpportunityRow } from "@/lib/leads-clients-server";

function formatCurrencyCompactNZD(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDayMonth(value: string | null): string {
  if (!value) {
    return "No due date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short" }).format(date);
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

function getDueMeta(isoDate: string | null) {
  const diffDays = getDaysUntilIso(isoDate);
  if (diffDays === null) {
    return { text: "No due date", className: "text-[#8A97AB]" };
  }

  if (diffDays < 0) {
    return { text: "🔴 Overdue", className: "text-[#B91C1C]" };
  }

  if (diffDays === 0) {
    return { text: "⚠ Due today", className: "text-[#D97706]" };
  }

  if (diffDays === 1) {
    return { text: "⚠ Due tomorrow", className: "text-[#D97706]" };
  }

  return {
    text: `Due in ${diffDays} days`,
    className: diffDays <= 3 ? "text-[#D97706]" : "text-[#6F839E]",
  };
}

function filterByDueRange(rows: LiveOpportunityRow[], dueFilter: string): LiveOpportunityRow[] {
  if (dueFilter === "any") {
    return rows;
  }

  return rows.filter((row) => {
    const daysUntil = getDaysUntilIso(row.dueDateIso);
    if (daysUntil === null) {
      return false;
    }

    if (dueFilter === "next48h") {
      return daysUntil >= 0 && daysUntil <= 2;
    }

    if (dueFilter === "next7d") {
      return daysUntil >= 0 && daysUntil <= 7;
    }

    if (dueFilter === "overdue") {
      return daysUntil < 0;
    }

    return true;
  });
}

export default async function LeadsClientsOpportunitiesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const client = typeof params.client === "string" ? params.client : "all";
  const due = typeof params.due === "string" ? params.due : "any";

  const allRows = await getLiveOpportunitiesForCurrentUser();
  const clientOptions = Array.from(
    new Map(
      allRows
        .filter((row) => row.clientId)
        .map((row) => [row.clientId as string, row.clientName])
    ).entries()
  );

  const searchedRows = q
    ? allRows.filter((row) => {
        const haystack = `${row.name} ${row.location} ${row.clientName} ${row.ownerName}`.toLowerCase();
        return haystack.includes(q.toLowerCase());
      })
    : allRows;

  const clientFilteredRows =
    client !== "all"
      ? searchedRows.filter((row) => row.clientId === client)
      : searchedRows;

  const dueFilteredRows = filterByDueRange(clientFilteredRows, due);

  const pipelineRows = dueFilteredRows
    .filter((row) => row.group === "pipeline")
    .sort((left, right) => {
      const leftDays = getDaysUntilIso(left.dueDateIso);
      const rightDays = getDaysUntilIso(right.dueDateIso);
      if (leftDays === null && rightDays === null) {
        return left.name.localeCompare(right.name);
      }
      if (leftDays === null) {
        return 1;
      }
      if (rightDays === null) {
        return -1;
      }
      if (leftDays !== rightDays) {
        return leftDays - rightDays;
      }
      return left.name.localeCompare(right.name);
    });

  const pricedRows = dueFilteredRows
    .filter((row) => row.group === "priced" || row.group === "won")
    .sort((left, right) => {
      const leftTime = left.quotedDateIso ? new Date(left.quotedDateIso).getTime() : Number.POSITIVE_INFINITY;
      const rightTime = right.quotedDateIso ? new Date(right.quotedDateIso).getTime() : Number.POSITIVE_INFINITY;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.name.localeCompare(right.name);
    });

  const wonRows = dueFilteredRows
    .filter((row) => row.group === "won")
    .sort((left, right) => left.name.localeCompare(right.name));

  const dueSoonRows = pipelineRows.filter((row) => {
    const days = getDaysUntilIso(row.dueDateIso);
    return days !== null && days >= 0 && days <= 2;
  });

  const quotedCount = dueFilteredRows.filter((row) => row.stage === "Quoted").length;

  const stats = {
    active: pipelineRows.length,
    pipelineValue: pipelineRows.reduce((sum, row) => sum + row.valueNZD, 0),
    dueThisWeek: pipelineRows.filter((row) => {
      const days = getDaysUntilIso(row.dueDateIso);
      return days !== null && days >= 0 && days <= 7;
    }).length,
    quoted: quotedCount,
  };

  return (
    <main className="space-y-4 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-2 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Tender Opportunities</CardTitle>
            </div>
            <Button className="h-10 rounded-[6px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]" asChild>
              <Link href="/app/leads-clients/opportunities/new">Create Opportunity</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0">
          <p className={`${interMedium.className} text-sm font-medium text-[#5F7390]`}>
            <span className="font-semibold text-[#253047]">{stats.active}</span> active tenders {" \u00b7 "}
            <span className="font-semibold text-[#253047]">{formatCurrencyCompactNZD(stats.pipelineValue)}</span> pipeline {" \u00b7 "}
            <span className="font-semibold text-[#253047]">{stats.dueThisWeek}</span> due this week {" \u00b7 "}
            <span className="font-semibold text-[#253047]">{stats.quoted}</span> {stats.quoted === 1 ? "quote submitted" : "quotes submitted"}
          </p>

          <form method="get" className="flex flex-wrap items-center gap-3">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search opportunities"
              className={`${interMedium.className} h-10 w-full rounded-[6px] border-[#E2E8F0] bg-[#F8FAFC] text-sm font-medium text-[#0F172A] placeholder:text-[#73859f] md:max-w-[360px]`}
            />
            <select
              name="client"
              defaultValue={client}
              className={`${interMedium.className} h-10 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm font-medium text-[#415670]`}
            >
              <option value="all">Client: All</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              name="due"
              defaultValue={due}
              className={`${interMedium.className} h-10 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm font-medium text-[#415670]`}
            >
              <option value="any">Due date: Any</option>
              <option value="next48h">Due in 48 hours</option>
              <option value="next7d">Due in 7 days</option>
              <option value="overdue">Overdue</option>
            </select>
            <Button type="submit" variant="outline" className="h-10 rounded-[6px] border-[#E2E8F0] bg-white px-4 text-sm">
              Apply
            </Button>
            <Button variant="ghost" asChild className="h-10 rounded-[6px] px-3 text-sm">
              <Link href="/app/leads-clients/opportunities">Reset</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-6">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Tender Pipeline</CardTitle>
          <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#5F7390]`}>
            <span className="font-semibold text-[#253047]">{pipelineRows.length}</span> tenders being priced
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {dueSoonRows.length > 0 ? (
            <div className="mb-2.5 rounded-[6px] border border-[#F7E5D1] bg-[#FFFBF6] px-2.5 py-2">
              <p className={`${interMedium.className} text-xs font-semibold text-[#B45309]`}>
                ⚠ {dueSoonRows.length} tenders due in the next 48 hours
              </p>
              <p className={`${interMedium.className} mt-0.5 text-xs font-medium text-[#9A6A2D]`}>
                {dueSoonRows.map((item) => item.name).join(" • ")}
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-[6px] border border-[#E6EAF0]">
            <table className="min-w-full border-collapse">
              <thead className="bg-white">
                <tr className={`${interMedium.className} text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[#566B86]`}>
                  <th className="px-3 py-1.5">Opportunity</th>
                  <th className="px-3 py-1.5 text-right">Company</th>
                  <th className="px-3 py-1.5 text-right">Due</th>
                  <th className="px-3 py-1.5 text-right">Estimator</th>
                </tr>
              </thead>
              <tbody>
                {pipelineRows.map((row) => (
                  <tr key={row.opportunityId} className="cursor-pointer border-t border-[#E9EEF4] bg-white transition-colors hover:bg-[#EEF4FB]">
                    <td className="px-3 py-[3px]">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="block rounded-[6px]">
                        <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{row.name}</p>
                        <p className={`${interMedium.className} mt-0 text-[10px] font-normal text-[#97A6BB]`}>{row.location}</p>
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} inline-block text-sm font-medium text-[#2D3D55]`}>
                        {row.clientName}
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="inline-block text-right">
                        <DueDateCell isoDate={row.dueDateIso} />
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="inline-flex items-center justify-end">
                        <OwnerCell owner={row.ownerName} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {pipelineRows.length === 0 ? (
                  <tr className="border-t border-[#E9EEF4] bg-white">
                    <td colSpan={4} className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#8A97AB]`}>
                      No active tenders match your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-6">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Jobs Priced</CardTitle>
          <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#5F7390]`}>
            <span className="font-semibold text-[#253047]">{pricedRows.length}</span> priced tenders
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-[6px] border border-[#E6EAF0]">
            <table className="min-w-full border-collapse">
              <thead className="bg-white">
                <tr className={`${interMedium.className} text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[#566B86]`}>
                  <th className="px-3 py-1.5">Opportunity</th>
                  <th className="px-3 py-1.5 text-right">Company</th>
                  <th className="px-3 py-1.5 text-right">Quoted</th>
                  <th className="px-3 py-1.5 text-right">Estimator</th>
                </tr>
              </thead>
              <tbody>
                {pricedRows.map((row) => (
                  <tr key={row.opportunityId} className="cursor-pointer border-t border-[#E9EEF4] bg-white transition-colors hover:bg-[#EEF4FB]">
                    <td className="px-3 py-[3px]">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="block rounded-[6px]">
                        <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{row.name}</p>
                        <p className={`${interMedium.className} mt-0 text-[10px] font-normal text-[#97A6BB]`}>{row.location}</p>
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} inline-block text-sm font-medium text-[#2D3D55]`}>
                        {row.clientName}
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} inline-block text-sm font-medium text-[#2D3D55]`}>
                        {formatDayMonth(row.quotedDateIso)}
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="inline-flex items-center justify-end">
                        <OwnerCell owner={row.ownerName} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {pricedRows.length === 0 ? (
                  <tr className="border-t border-[#E9EEF4] bg-white">
                    <td colSpan={4} className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#8A97AB]`}>
                      No priced tenders yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-6">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Recently Won Jobs</CardTitle>
          <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#5F7390]`}>
            <span className="font-semibold text-[#253047]">{wonRows.length}</span> won tenders
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-[6px] border border-[#E6EAF0]">
            <table className="min-w-full border-collapse">
              <thead className="bg-white">
                <tr className={`${interMedium.className} text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[#566B86]`}>
                  <th className="px-3 py-1.5">Opportunity</th>
                  <th className="px-3 py-1.5 text-right">Company</th>
                  <th className="px-3 py-1.5 text-right">Won</th>
                  <th className="px-3 py-1.5 text-right">Estimator</th>
                </tr>
              </thead>
              <tbody>
                {wonRows.map((row) => (
                  <tr key={row.opportunityId} className="cursor-pointer border-t border-[#E9EEF4] bg-white transition-colors hover:bg-[#EEF4FB]">
                    <td className="px-3 py-[3px]">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="block rounded-[6px]">
                        <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{row.name}</p>
                        <p className={`${interMedium.className} mt-0 text-[10px] font-normal text-[#97A6BB]`}>{row.location}</p>
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} inline-block text-sm font-medium text-[#2D3D55]`}>
                        {row.clientName}
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} inline-block text-sm font-medium text-[#2D3D55]`}>
                        {formatDayMonth(row.quotedDateIso)}
                      </Link>
                    </td>
                    <td className="px-3 py-[3px] text-right">
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="inline-flex items-center justify-end">
                        <OwnerCell owner={row.ownerName} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {wonRows.length === 0 ? (
                  <tr className="border-t border-[#E9EEF4] bg-white">
                    <td colSpan={4} className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#8A97AB]`}>
                      No recently won jobs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function DueDateCell({ isoDate }: { isoDate: string | null }) {
  const label = formatDayMonth(isoDate);
  const meta = getDueMeta(isoDate);

  return (
    <div className="leading-tight text-right">
      <p className={`${interMedium.className} text-sm font-semibold text-[#1F2F45]`}>{label}</p>
      <p className={`${interMedium.className} mt-[1px] text-[11px] font-medium ${meta.className}`}>{meta.text}</p>
    </div>
  );
}

function OwnerCell({ owner }: { owner: string }) {
  const initial = owner.slice(0, 1).toUpperCase();

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`${interMedium.className} inline-flex h-[16px] w-[16px] items-center justify-center rounded-[6px] bg-[#E7EEF8] text-[9px] font-semibold text-[#36577F]`}>
        {initial}
      </span>
      <span className={`${interMedium.className} text-sm font-medium text-[#2D3D55]`}>{owner}</span>
    </span>
  );
}
