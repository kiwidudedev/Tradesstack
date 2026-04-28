import Link from "next/link";
import { Search, TrendingUp, DollarSign, CheckCircle2, Clock } from "lucide-react";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { getLiveOpportunitiesForCurrentUser, type LiveOpportunityRow } from "@/lib/leads-clients-server";
import type { QuoteStatus } from "@/lib/supabase/types";
import { OpportunitiesTable } from "./OpportunitiesTable";
import { NewOpportunityDialog } from "./NewOpportunityDialog";
import styles from "./opportunities.module.css";

const SUBMITTED_QUOTE_STATUSES: QuoteStatus[] = ["Sent", "Viewed", "Accepted"];

function formatCurrencyCompactNZD(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
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

function StatCard({
  label,
  value,
  sub,
  icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor?: string;
}) {
  return (
    <div className="flex min-h-[170px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] ${iconBg}`}>
          {icon}
        </span>
        <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>{label}</p>
      </div>
      <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(2.1rem,3vw,2.75rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{value}</p>
      <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium ${iconColor ?? "text-[#4B5D79]"}`}>{sub}</p>
    </div>
  );
}

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
  const allRows = await getLiveOpportunitiesForCurrentUser();
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
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.page} space-y-6 pb-8`}>
      {/* ── Header ── */}
      <section className={styles.heroBlock}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>Opportunities</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>Manage your sales pipeline and track quotes</p>
        </div>
        <div className={styles.heroActions}>
          <NewOpportunityDialog />
        </div>
      </section>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Submitted Quote Value"
          value={formatCurrencyCompactNZD(submittedQuoteValue)}
          sub={`${submittedQuoteCount} submitted quotes`}
          icon={<DollarSign className="h-5 w-5 text-[#D9E6F2]" strokeWidth={2.2} />}
          iconBg="bg-[#0E172B]"
          iconColor="text-[#0E172B]"
        />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          sub="Last 6 months average"
          icon={<TrendingUp className="h-5 w-5 text-[#F15A29]" strokeWidth={2.2} />}
          iconBg="bg-[#FFE5D9]"
          iconColor="text-[#F15A29]"
        />
        <StatCard
          label="Quotes This Month"
          value={String(quotesThisMonth)}
          sub={now.toLocaleString("en-NZ", { month: "long", year: "numeric" })}
          icon={<CheckCircle2 className="h-5 w-5 text-[#18384C]" strokeWidth={2.2} />}
          iconBg="bg-[#DFF1E5]"
          iconColor="text-[#18384C]"
        />
        <StatCard
          label="Due This Week"
          value={String(dueThisWeek)}
          sub="Tenders closing soon"
          icon={<Clock className="h-5 w-5 text-[#F15A29]" strokeWidth={2.2} />}
          iconBg="bg-[#FFE5D9]"
          iconColor="text-[#F15A29]"
        />
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-2">
        <Link
          href={`/app/leads-clients/opportunities?tab=active${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition ${
            tab === "active"
              ? "bg-[#F15A29] text-white shadow-sm"
              : "bg-white border border-[#E9ECF2] text-[#5D708C] hover:bg-[#F7F9FC]"
          }`}
        >
          Upcoming Quotes
        </Link>
        <Link
          href={`/app/leads-clients/opportunities?tab=past${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition ${
            tab === "past"
              ? "bg-[#F15A29] text-white shadow-sm"
              : "bg-white border border-[#E9ECF2] text-[#5D708C] hover:bg-[#F7F9FC]"
          }`}
        >
          Outstanding Quotes
        </Link>
        <Link
          href={`/app/leads-clients/opportunities?tab=won${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition ${
            tab === "won"
              ? "bg-[#F15A29] text-white shadow-sm"
              : "bg-white border border-[#E9ECF2] text-[#5D708C] hover:bg-[#F7F9FC]"
          }`}
        >
          Won
        </Link>
        <Link
          href={`/app/leads-clients/opportunities?tab=closed${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition ${
            tab === "closed"
              ? "bg-[#F15A29] text-white shadow-sm"
              : "bg-white border border-[#E9ECF2] text-[#5D708C] hover:bg-[#F7F9FC]"
          }`}
        >
          Lost
        </Link>
      </div>

      {/* ── Table section ── */}
      <div className="overflow-hidden rounded-[14px] border border-[#E9ECF2] bg-white shadow-[0_1px_4px_rgba(15,23,42,0.05)]">
        {/* Table header */}
        <div className="flex items-center justify-between border-b border-[#E9ECF2] px-5 py-4">
          <h2 className={ibmPlexSans.className} style={{ margin: 0, fontSize: "1.4rem", lineHeight: 1, letterSpacing: "-0.03em", fontWeight: 600, color: "#15212b" }}>{sectionLabel}</h2>
          <form method="get">
            <input type="hidden" name="tab" value={tab} />
            <label className="flex items-center gap-2 rounded-lg border border-[#E9ECF2] bg-[#F7F9FC] px-3 py-2 focus-within:border-[#9DB5D0] focus-within:bg-white transition-all">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#9BAABB]" strokeWidth={2} />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search opportunities..."
                className="w-48 bg-transparent text-[13px] text-[#2C4460] outline-none placeholder:text-[#9BAABB]"
              />
            </label>
          </form>
        </div>

        <OpportunitiesTable rows={searchedRows} />
      </div>
    </main>
  );
}
