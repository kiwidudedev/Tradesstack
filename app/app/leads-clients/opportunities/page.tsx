import Link from "next/link";
import { CalendarDays, LayoutGrid, List, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getLiveOpportunitiesForCurrentUser, type LiveOpportunityRow } from "@/lib/leads-clients-server";
import { OpportunitiesBoard } from "./OpportunitiesBoard";
import styles from "./opportunities.module.css";

function formatCurrencyCompactNZD(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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

function sortRowsByDue(left: LiveOpportunityRow, right: LiveOpportunityRow) {
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

  const [member, allRows] = await Promise.all([
    getCurrentOrganizationMember(),
    getLiveOpportunitiesForCurrentUser(),
  ]);

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
    .sort(sortRowsByDue);

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
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.page} space-y-6 pb-8`}>
      <section className={styles.heroBlock}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>Tender Opportunities</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Track pipeline health, due dates, and estimator focus in one live tender workspace.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/app/leads-clients/opportunities/new" className={`${ibmPlexSans.className} ${styles.heroButton}`}>
            <Plus className="h-4 w-4" strokeWidth={2.3} />
            Create Opportunity
          </Link>
        </div>
      </section>

      <section className={styles.commandSurface}>
        <div className={styles.inlineStats}>
          <div className={styles.inlineStat}>
            <span className={styles.inlineStatLabel}>Active Tenders</span>
            <span className={styles.inlineStatValue}>{stats.active}</span>
          </div>
          <div className={styles.inlineStat}>
            <span className={styles.inlineStatLabel}>Pipeline Value</span>
            <span className={styles.inlineStatValue}>{formatCurrencyCompactNZD(stats.pipelineValue)}</span>
          </div>
          <div className={styles.inlineStat}>
            <span className={styles.inlineStatLabel}>Due This Week</span>
            <span className={styles.inlineStatValue}>{stats.dueThisWeek}</span>
          </div>
          <div className={styles.inlineStat}>
            <span className={styles.inlineStatLabel}>Submitted</span>
            <span className={styles.inlineStatValue}>{stats.quoted}</span>
          </div>
        </div>

        {dueSoonRows.length > 0 ? (
          <div className={styles.inlineAlert}>
            <span className={`${interMedium.className} ${styles.inlineAlertText}`}>
              {"⚠ "}
              {dueSoonRows.length} {dueSoonRows.length === 1 ? "tender due in 48 hours" : "tenders due in 48 hours"}
              {" — "}
              {dueSoonRows.map((item) => item.name).join(" • ")}
            </span>
          </div>
        ) : null}

        <form method="get" className={styles.boardToolbar}>
          <div className={styles.viewTabs}>
            <span className={`${interMedium.className} ${styles.viewTab} ${styles.viewTabActive}`}>
              <LayoutGrid className={styles.viewTabIcon} aria-hidden="true" />
              Board
            </span>
            <span className={`${interMedium.className} ${styles.viewTab}`}>
              <List className={styles.viewTabIcon} aria-hidden="true" />
              List
            </span>
            <span className={`${interMedium.className} ${styles.viewTab}`}>
              <CalendarDays className={styles.viewTabIcon} aria-hidden="true" />
              Calendar
            </span>
          </div>

          <div className={styles.toolbarActions}>
            {client !== "all" ? <input type="hidden" name="client" value={client} /> : null}
            {due !== "any" ? <input type="hidden" name="due" value={due} /> : null}
            <label className={styles.toolbarSearch}>
              <Search className={styles.toolbarSearchIcon} aria-hidden="true" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search in view..."
                className={`${interMedium.className} ${styles.toolbarSearchInput}`}
              />
            </label>
          </div>
        </form>
      </section>

      <section className={styles.boardSection}>
        <OpportunitiesBoard rows={dueFilteredRows} organizationId={member?.organization_id ?? ""} />
      </section>
    </main>
  );
}
