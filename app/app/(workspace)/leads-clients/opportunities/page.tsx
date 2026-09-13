import Link from "next/link";
import { Search, TrendingUp, DollarSign, CheckCircle2, Clock } from "lucide-react";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";
import { getLiveOpportunitiesForCurrentUser, type LiveOpportunityRow } from "@/lib/leads-clients-server";
import { getOpportunityCreationDependenciesForCurrentUser } from "@/lib/opportunity-creation-dependencies-server";
import type { Database } from "@/lib/supabase/types";
type QuoteStatus = Database["public"]["Tables"]["project_quotes"]["Row"]["status"];
import { OpportunitiesTable } from "./OpportunitiesTable";
import { NewOpportunityDialog } from "./NewOpportunityDialog";

const SUBMITTED_QUOTE_STATUSES: QuoteStatus[] = ["Sent", "Viewed", "Accepted"];

function formatCurrencyCompactNZD(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function getDaysUntilIso(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const due = new Date(isoDate);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.ceil((dueMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const TABS = [
  { key: "active", label: "Upcoming Quotes" },
  { key: "past", label: "Outstanding Quotes" },
  { key: "won", label: "Won" },
  { key: "closed", label: "Lost" },
] as const;

export default async function LeadsClientsOpportunitiesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const tab = typeof params.tab === "string" ? params.tab : "active";
  const searchQuery = q.toLowerCase();

  const now = new Date();
  const [allRows, creationDependencies] = await Promise.all([
    getLiveOpportunitiesForCurrentUser(),
    getOpportunityCreationDependenciesForCurrentUser(),
  ]);
  const activeRows: LiveOpportunityRow[] = [];
  const sentRows: LiveOpportunityRow[] = [];
  const wonRowsByQuote: LiveOpportunityRow[] = [];
  const closedRows: LiveOpportunityRow[] = [];
  let submittedQuoteCount = 0;
  let submittedQuoteValue = 0;
  let wonCount = 0;
  let lostCount = 0;
  let quotesThisMonth = 0;
  let dueThisWeek = 0;

  for (const row of allRows) {
    const latestQuoteStatus = row.latestQuoteStatus ?? "Draft";
    const submittedQuote = row.stage === "Quoted" || SUBMITTED_QUOTE_STATUSES.includes(latestQuoteStatus);

    if (row.valueNZD > 0 && (row.stage === "Quoted" || row.stage === "Won" || SUBMITTED_QUOTE_STATUSES.includes(latestQuoteStatus))) {
      submittedQuoteCount += 1;
      submittedQuoteValue += row.valueNZD;
    }

    if (row.stage === "Won") {
      wonCount += 1;
    } else if (row.stage === "Lost") {
      lostCount += 1;
    }

    if (row.quotedDateIso) {
      const quotedDate = new Date(row.quotedDateIso);
      if (quotedDate.getMonth() === now.getMonth() && quotedDate.getFullYear() === now.getFullYear()) {
        quotesThisMonth += 1;
      }
    }

    if (row.group === "pipeline") {
      const days = getDaysUntilIso(row.dueDateIso);
      if (days !== null && days >= 0 && days <= 7) {
        dueThisWeek += 1;
      }
    }

    if (row.stage !== "Lost" && row.stage !== "Won" && !submittedQuote && row.dueDateIso) {
      activeRows.push(row);
    }
    if (latestQuoteStatus === "Sent" || latestQuoteStatus === "Viewed") {
      sentRows.push(row);
    }
    if (latestQuoteStatus === "Accepted" || row.stage === "Won" || Boolean(row.convertedProjectId)) {
      wonRowsByQuote.push(row);
    }
    if (latestQuoteStatus === "Rejected" || latestQuoteStatus === "Expired") {
      closedRows.push(row);
    }
  }

  const winRate =
    wonCount + lostCount > 0
      ? Math.round((wonCount / (wonCount + lostCount)) * 100)
      : 0;

  const tabRows =
    tab === "past"
      ? sentRows
      : tab === "won"
        ? wonRowsByQuote
        : tab === "closed"
          ? closedRows
          : activeRows;

  const searchedRows = q
    ? tabRows.filter((r) => {
        const haystack = `${r.name} ${r.location} ${r.clientName} ${r.ownerName}`.toLowerCase();
        return haystack.includes(searchQuery);
      })
    : tabRows;

  const sectionLabel =
    tab === "past"
      ? "Outstanding quotes"
      : tab === "won"
        ? "Won quotes"
      : tab === "closed"
        ? "Lost quotes"
      : "Upcoming quotes";

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
      <OperationalModuleHeader
        title="Opportunities"
        description="Manage your sales pipeline and track quotes"
        actions={<NewOpportunityDialog {...creationDependencies} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <OperationalKpiCard
          label="Submitted Quote Value"
          value={formatCurrencyCompactNZD(submittedQuoteValue)}
          helper={`${submittedQuoteCount} submitted quotes`}
          icon={<DollarSign className="h-5 w-5" strokeWidth={2.2} />}
        />
        <OperationalKpiCard
          label="Win Rate"
          value={`${winRate}%`}
          helper="Last 6 months average"
          icon={<TrendingUp className="h-5 w-5" strokeWidth={2.2} />}
        />
        <OperationalKpiCard
          label="Quotes This Month"
          value={String(quotesThisMonth)}
          helper={now.toLocaleString("en-NZ", { month: "long", year: "numeric" })}
          icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2.2} />}
        />
        <OperationalKpiCard
          label="Due This Week"
          value={String(dueThisWeek)}
          helper="Tenders closing soon"
          icon={<Clock className="h-5 w-5" strokeWidth={2.2} />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((entry) => (
          <Button
            key={entry.key}
            asChild
            variant={tab === entry.key ? "primary" : "secondary"}
            size="sm"
          >
            <Link
              href={`/app/leads-clients/opportunities?tab=${entry.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            >
              {entry.label}
            </Link>
          </Button>
        ))}
      </div>

      <OperationalPanel
        title={sectionLabel}
        actions={
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search opportunities..."
                className="w-64 pl-9"
              />
            </div>
          </form>
        }
        contentClassName="p-0"
      >
        <OpportunitiesTable rows={searchedRows} />
      </OperationalPanel>
    </main>
  );
}
