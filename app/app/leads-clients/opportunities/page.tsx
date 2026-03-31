import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getLiveOpportunitiesForCurrentUser, type LiveOpportunityRow } from "@/lib/leads-clients-server";
import styles from "./opportunities.module.css";

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
    return { text: "No due date", className: styles.dueMetaSoft };
  }

  if (diffDays < 0) {
    return { text: "Overdue", className: styles.dueMetaDanger };
  }

  if (diffDays === 0) {
    return { text: "Due today", className: styles.dueMetaWarn };
  }

  if (diffDays === 1) {
    return { text: "Due tomorrow", className: styles.dueMetaWarn };
  }

  return {
    text: `Due in ${diffDays} days`,
    className: diffDays <= 3 ? styles.dueMetaWarn : styles.dueMetaSoft,
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
  const nowLabel = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());

  return (
    <main className={`${styles.page} space-y-6 pb-8`}>
      <section className={styles.heroBlock}>
        <div className="min-w-0">
          <CardTitle className={styles.heroTitle}>Tender Opportunities</CardTitle>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Track pipeline health, due dates, and estimator focus in one place.
          </p>
        </div>
        <div className={styles.heroActions}>
          <p className={`${interMedium.className} ${styles.heroDate}`}>{nowLabel}</p>
          <Button className={styles.heroButton} asChild>
            <Link href="/app/leads-clients/opportunities/new">Create Opportunity</Link>
          </Button>
        </div>
      </section>

      <Card className={styles.sectionCard}>
        <CardContent className="space-y-2.5 p-5">
          <p className={`${interMedium.className} ${styles.statLine}`}>
            <span className={styles.statStrong}>{stats.active}</span> active tenders {" \u00b7 "}
            <span className={styles.statStrong}>{formatCurrencyCompactNZD(stats.pipelineValue)}</span> pipeline {" \u00b7 "}
            <span className={styles.statStrong}>{stats.dueThisWeek}</span> due this week {" \u00b7 "}
            <span className={styles.statStrong}>{stats.quoted}</span> {stats.quoted === 1 ? "quote submitted" : "quotes submitted"}
          </p>

          <form method="get" className={styles.filtersForm}>
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search opportunities"
              className={`${interMedium.className} ${styles.searchInput} w-full md:max-w-[360px]`}
            />
            <select
              name="client"
              defaultValue={client}
              className={`${interMedium.className} ${styles.filterSelect} px-3.5`}
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
              className={`${interMedium.className} ${styles.filterSelect} px-3.5`}
            >
              <option value="any">Due date: Any</option>
              <option value="next48h">Due in 48 hours</option>
              <option value="next7d">Due in 7 days</option>
              <option value="overdue">Overdue</option>
            </select>
            <Button type="submit" variant="outline" className={styles.applyButton}>
              Apply
            </Button>
            <Button variant="ghost" asChild className={styles.resetButton}>
              <Link href="/app/leads-clients/opportunities">Reset</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className={styles.sectionCard}>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle className={styles.sectionTitle}>Tender Pipeline</CardTitle>
          <p className={`${interMedium.className} ${styles.sectionMeta}`}>
            <span className={styles.statStrong}>{pipelineRows.length}</span> tenders being priced
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {dueSoonRows.length > 0 ? (
            <div className={styles.alertBox}>
              <p className={`${interMedium.className} ${styles.alertTitle}`}>
                ⚠ {dueSoonRows.length} tenders due in the next 48 hours
              </p>
              <p className={`${interMedium.className} ${styles.alertText}`}>
                {dueSoonRows.map((item) => item.name).join(" • ")}
              </p>
            </div>
          ) : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr className={`${interMedium.className} ${styles.headRow}`}>
                  <th className={styles.headCell}>Opportunity</th>
                  <th className={styles.headCellRight}>Company</th>
                  <th className={styles.headCellRight}>Due</th>
                  <th className={styles.headCellRight}>Estimator</th>
                </tr>
              </thead>
              <tbody>
                {pipelineRows.map((row) => (
                  <tr key={row.opportunityId} className={styles.tableRow}>
                    <td className={styles.cell}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={styles.opportunityLink}>
                        <p className={`${interMedium.className} ${styles.primaryText}`}>{row.name}</p>
                        <p className={`${interMedium.className} ${styles.secondaryText}`}>{row.location}</p>
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} ${styles.ownerName} inline-block`}>
                        {row.clientName}
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="inline-block text-right">
                        <DueDateCell isoDate={row.dueDateIso} />
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="inline-flex items-center justify-end">
                        <OwnerCell owner={row.ownerName} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {pipelineRows.length === 0 ? (
                  <tr className={styles.emptyRow}>
                    <td colSpan={4} className={`${interMedium.className} ${styles.emptyCell}`}>
                      No active tenders match your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className={styles.sectionCard}>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle className={styles.sectionTitle}>Jobs Priced</CardTitle>
          <p className={`${interMedium.className} ${styles.sectionMeta}`}>
            <span className={styles.statStrong}>{pricedRows.length}</span> priced tenders
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr className={`${interMedium.className} ${styles.headRow}`}>
                  <th className={styles.headCell}>Opportunity</th>
                  <th className={styles.headCellRight}>Company</th>
                  <th className={styles.headCellRight}>Quoted</th>
                  <th className={styles.headCellRight}>Estimator</th>
                </tr>
              </thead>
              <tbody>
                {pricedRows.map((row) => (
                  <tr key={row.opportunityId} className={styles.tableRow}>
                    <td className={styles.cell}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={styles.opportunityLink}>
                        <p className={`${interMedium.className} ${styles.primaryText}`}>{row.name}</p>
                        <p className={`${interMedium.className} ${styles.secondaryText}`}>{row.location}</p>
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} ${styles.ownerName} inline-block`}>
                        {row.clientName}
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} ${styles.ownerName} inline-block`}>
                        {formatDayMonth(row.quotedDateIso)}
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="inline-flex items-center justify-end">
                        <OwnerCell owner={row.ownerName} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {pricedRows.length === 0 ? (
                  <tr className={styles.emptyRow}>
                    <td colSpan={4} className={`${interMedium.className} ${styles.emptyCell}`}>
                      No priced tenders yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className={styles.sectionCard}>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle className={styles.sectionTitle}>Recently Won Jobs</CardTitle>
          <p className={`${interMedium.className} ${styles.sectionMeta}`}>
            <span className={styles.statStrong}>{wonRows.length}</span> won tenders
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr className={`${interMedium.className} ${styles.headRow}`}>
                  <th className={styles.headCell}>Opportunity</th>
                  <th className={styles.headCellRight}>Company</th>
                  <th className={styles.headCellRight}>Won</th>
                  <th className={styles.headCellRight}>Estimator</th>
                </tr>
              </thead>
              <tbody>
                {wonRows.map((row) => (
                  <tr key={row.opportunityId} className={styles.tableRow}>
                    <td className={styles.cell}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={styles.opportunityLink}>
                        <p className={`${interMedium.className} ${styles.primaryText}`}>{row.name}</p>
                        <p className={`${interMedium.className} ${styles.secondaryText}`}>{row.location}</p>
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} ${styles.ownerName} inline-block`}>
                        {row.clientName}
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className={`${interMedium.className} ${styles.ownerName} inline-block`}>
                        {formatDayMonth(row.quotedDateIso)}
                      </Link>
                    </td>
                    <td className={styles.cellRight}>
                      <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="inline-flex items-center justify-end">
                        <OwnerCell owner={row.ownerName} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {wonRows.length === 0 ? (
                  <tr className={styles.emptyRow}>
                    <td colSpan={4} className={`${interMedium.className} ${styles.emptyCell}`}>
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
    <div className={styles.dueCell}>
      <p className={`${interMedium.className} ${styles.dueLabel}`}>{label}</p>
      <p className={`${interMedium.className} ${styles.dueMeta} ${meta.className}`}>{meta.text}</p>
    </div>
  );
}

function OwnerCell({ owner }: { owner: string }) {
  const initial = owner.slice(0, 1).toUpperCase();

  return (
    <span className={styles.ownerCell}>
      <span className={`${interMedium.className} ${styles.ownerBadge}`}>
        {initial}
      </span>
      <span className={`${interMedium.className} ${styles.ownerName}`}>{owner}</span>
    </span>
  );
}
