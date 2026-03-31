import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "./clients.module.css";

const CLIENT_TAGS = ["Good Client", "High Value", "Difficult", "Slow Payer"] as const;

type ClaimFinanceRow = {
  project_id: string | null;
  status: string | null;
  claim_date: string | null;
  due_date: string | null;
  claim_amount: number | null;
  paid_amount: number | null;
  updated_at: string | null;
};

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "No recent activity";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "No recent activity";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) {
    return "Just now";
  }

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function formatRating(value: number): string {
  return `⭐ ${value.toFixed(1)}`;
}

function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}m`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return `$${Math.round(value)}`;
}

function formatDaysLabel(value: number): string {
  const rounded = Math.round(value);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

function getClientDisplayName(client: { company_name: string | null; name: string }): string {
  const company = client.company_name?.trim();
  if (company) {
    return company;
  }
  return client.name;
}

function getDaysSinceIso(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return null;
  }

  const dayMs = 1000 * 60 * 60 * 24;
  return Math.floor((Date.now() - time) / dayMs);
}

function clampRating(value: number): number {
  if (value < 1) {
    return 1;
  }
  if (value > 5) {
    return 5;
  }
  return value;
}

function normalizeClientTags(value: string[] | null): string[] {
  const supported = new Set(CLIENT_TAGS);
  return (value ?? []).filter((tag): tag is (typeof CLIENT_TAGS)[number] => supported.has(tag as (typeof CLIENT_TAGS)[number]));
}

export default async function LeadsClientsClientsPage() {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return (
      <main className={`${styles.clientsScope} space-y-6 pb-8`}>
        <Card className={styles.overviewCard}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Clients</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className={`${interMedium.className} ${styles.heroSummary}`}>Sign in to view organization clients.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [clientsResult, projectsResult, opportunitiesResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name, email, phone, tags, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("organization_projects")
      .select("id, client_id, updated_at")
      .eq("organization_id", member.organization_id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("organization_opportunities")
      .select("id, client_id, stage, estimated_value, updated_at")
      .eq("organization_id", member.organization_id)
      .order("updated_at", { ascending: false }),
  ]);

  const claimsResult = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{ data: ClaimFinanceRow[] | null; error: { message: string } | null }>;
      };
    };
  })
    .from("project_claims")
    .select("project_id, status, claim_date, due_date, claim_amount, paid_amount, updated_at")
    .eq("organization_id", member.organization_id);

  if (clientsResult.error || projectsResult.error || opportunitiesResult.error) {
    return (
      <main className={`${styles.clientsScope} space-y-6 pb-8`}>
        <Card className={styles.overviewCard}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Clients</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className={`${interMedium.className} ${styles.heroSummary}`}>Could not load client data right now. Please refresh.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const clients = clientsResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const opportunities = opportunitiesResult.data ?? [];
  const claims = claimsResult.error ? [] : (claimsResult.data ?? []);

  const projectCountByClientId = new Map<string, number>();
  const latestProjectActivityByClientId = new Map<string, string>();
  for (const project of projects) {
    if (!project.client_id) {
      continue;
    }
    projectCountByClientId.set(project.client_id, (projectCountByClientId.get(project.client_id) ?? 0) + 1);
    if (!latestProjectActivityByClientId.has(project.client_id)) {
      latestProjectActivityByClientId.set(project.client_id, project.updated_at);
    }
  }

  const activeLeadCountByClientId = new Map<string, number>();
  const wonLeadCountByClientId = new Map<string, number>();
  const totalLeadCountByClientId = new Map<string, number>();
  const wonValueByClientId = new Map<string, number>();
  const latestLeadActivityByClientId = new Map<string, string>();
  for (const opportunity of opportunities) {
    if (!opportunity.client_id) {
      continue;
    }

    if (!latestLeadActivityByClientId.has(opportunity.client_id)) {
      latestLeadActivityByClientId.set(opportunity.client_id, opportunity.updated_at);
    }

    totalLeadCountByClientId.set(opportunity.client_id, (totalLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);

    const isActiveLead = opportunity.stage !== "Won" && opportunity.stage !== "Lost";
    if (isActiveLead) {
      activeLeadCountByClientId.set(opportunity.client_id, (activeLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);
    }

    if (opportunity.stage === "Won") {
      wonLeadCountByClientId.set(opportunity.client_id, (wonLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);
      wonValueByClientId.set(opportunity.client_id, (wonValueByClientId.get(opportunity.client_id) ?? 0) + Number(opportunity.estimated_value ?? 0));
    }
  }

  const rowsWithRawScore = clients.map((client) => {
    const projectsCount = projectCountByClientId.get(client.id) ?? 0;
    const activeLeads = activeLeadCountByClientId.get(client.id) ?? 0;
    const wonProjects = wonLeadCountByClientId.get(client.id) ?? 0;
    const rawScore = projectsCount * 2 + activeLeads * 3 + wonProjects * 2;
    const lastActivityIso =
      latestLeadActivityByClientId.get(client.id) ??
      latestProjectActivityByClientId.get(client.id) ??
      client.updated_at ??
      client.created_at;

    return {
      ...client,
      activeLeads,
      projectsCount,
      wonProjects,
      rawScore,
      tags: normalizeClientTags(client.tags),
      lastActivityIso,
    };
  });

  const maxRawScore = rowsWithRawScore.reduce((max, row) => Math.max(max, row.rawScore), 0);
  const rows = rowsWithRawScore
    .map((row) => {
      const rating = maxRawScore === 0 ? 0 : clampRating(1 + (row.rawScore / maxRawScore) * 4);
      return {
        ...row,
        rating,
      };
    })
    .sort((left, right) => {
      if (right.rating !== left.rating) {
        return right.rating - left.rating;
      }
      if (right.rawScore !== left.rawScore) {
        return right.rawScore - left.rawScore;
      }
      return left.name.localeCompare(right.name);
    });

  const projectClientByProjectId = new Map<string, string>();
  for (const project of projects) {
    if (!project.client_id) {
      continue;
    }
    projectClientByProjectId.set(project.id, project.client_id);
  }

  const paidRevenueByClientId = new Map<string, number>();
  const paidRevenueLast12MonthsByClientId = new Map<string, number>();
  const overdueClientIds = new Set<string>();
  const slowPayingClientIds = new Set<string>();
  const overdueCountByClientId = new Map<string, number>();
  const payDaysSamplesByClientId = new Map<string, number[]>();
  const todayIso = new Date().toISOString().slice(0, 10);
  const last12MonthsCutoff = new Date();
  last12MonthsCutoff.setFullYear(last12MonthsCutoff.getFullYear() - 1);

  for (const claim of claims) {
    const projectId = claim.project_id;
    if (!projectId) {
      continue;
    }

    const clientId = projectClientByProjectId.get(projectId);
    if (!clientId) {
      continue;
    }

    const claimAmount = Number(claim.claim_amount ?? 0);
    const paidAmount = Number(claim.paid_amount ?? 0);
    const balance = Math.max(0, claimAmount - paidAmount);
    const claimAgeDays = getDaysSinceIso(claim.claim_date);

    paidRevenueByClientId.set(clientId, (paidRevenueByClientId.get(clientId) ?? 0) + paidAmount);
    if (paidAmount > 0 && claim.updated_at) {
      const paidAt = new Date(claim.updated_at);
      if (!Number.isNaN(paidAt.getTime()) && paidAt >= last12MonthsCutoff) {
        paidRevenueLast12MonthsByClientId.set(
          clientId,
          (paidRevenueLast12MonthsByClientId.get(clientId) ?? 0) + paidAmount
        );
      }
    }

    const dueDate = claim.due_date;
    const isOverdueByStatus = (claim.status ?? "").toLowerCase() === "overdue";
    const isOverdueByDate = Boolean(dueDate && dueDate < todayIso && balance > 0);
    if (isOverdueByStatus || isOverdueByDate) {
      overdueClientIds.add(clientId);
      overdueCountByClientId.set(clientId, (overdueCountByClientId.get(clientId) ?? 0) + 1);
    }

    if (balance > 0 && claimAgeDays !== null && claimAgeDays > 30) {
      slowPayingClientIds.add(clientId);
    }

    const isPaid = (claim.status ?? "").toLowerCase() === "paid" || paidAmount >= claimAmount;
    if (isPaid && claim.claim_date && claim.updated_at) {
      const invoiceTime = new Date(claim.claim_date).getTime();
      const paidTime = new Date(claim.updated_at).getTime();
      if (!Number.isNaN(invoiceTime) && !Number.isNaN(paidTime) && paidTime >= invoiceTime) {
        const daysToPay = (paidTime - invoiceTime) / (1000 * 60 * 60 * 24);
        const current = payDaysSamplesByClientId.get(clientId) ?? [];
        current.push(daysToPay);
        payDaysSamplesByClientId.set(clientId, current);
      }
    }
  }

  const topClient = rows.reduce<{ id: string; displayName: string; revenue: number; projectsCount: number } | null>((best, row) => {
    const revenue = (paidRevenueByClientId.get(row.id) ?? 0) + (wonValueByClientId.get(row.id) ?? 0);
    if (!best || revenue > best.revenue) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        revenue,
        projectsCount: row.projectsCount,
      };
    }
    return best;
  }, null);
  const topClientLast12Months = rows.reduce<{ id: string; displayName: string; revenue: number } | null>((best, row) => {
    const revenue = paidRevenueLast12MonthsByClientId.get(row.id) ?? 0;
    if (!best || revenue > best.revenue) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        revenue,
      };
    }
    return best;
  }, null);

  const noActivityClientIds = new Set(
    rows.filter((row) => {
      const days = getDaysSinceIso(row.lastActivityIso);
      return days !== null && days >= 60;
    }).map((row) => row.id)
  );
  const repeatClientCount = rows.filter((row) => row.projectsCount >= 2).length;
  const repeatClientPercent = rows.length > 0 ? Math.round((repeatClientCount / rows.length) * 100) : 0;
  const slowPayingClientCount = slowPayingClientIds.size;
  const totalClientValue = Array.from(rows).reduce(
    (sum, row) => sum + (paidRevenueByClientId.get(row.id) ?? 0) + (wonValueByClientId.get(row.id) ?? 0),
    0
  );
  const pipelineValue = opportunities
    .filter((item) => item.stage !== "Won" && item.stage !== "Lost")
    .reduce((sum, item) => sum + Number(item.estimated_value ?? 0), 0);
  const openQuotesCount = opportunities.filter((item) => item.stage !== "Won" && item.stage !== "Lost").length;
  const topClientDependencyPercent =
    topClient && totalClientValue > 0 ? Math.round((topClient.revenue / totalClientValue) * 100) : 0;
  const topClientForConversion = topClientLast12Months ?? topClient;
  const topClientOpportunityCount = topClientForConversion ? (totalLeadCountByClientId.get(topClientForConversion.id) ?? 0) : 0;
  const topClientWonCount = topClientForConversion ? (wonLeadCountByClientId.get(topClientForConversion.id) ?? 0) : 0;
  const topClientConversionRate = topClientOpportunityCount > 0 ? Math.round((topClientWonCount / topClientOpportunityCount) * 100) : 0;

  return (
    <main className={`${styles.clientsScope} space-y-6 pb-8`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroHeading}>Clients</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Track who you work with most and keep client relationships moving.
          </p>
        </div>
        <Button asChild className={styles.heroButton}>
          <Link href="/app/leads-clients/clients/new">+ Add Client</Link>
        </Button>
      </section>

      <section className={styles.grid}>
        <Card className={styles.overviewCard}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Client Intelligence</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className={styles.overviewGrid}>
              <article className={styles.metricTile}>
                <div className={styles.metricTop}>
                  <span className={styles.metricBadgeAccent}>C</span>
                  <span className={`${interMedium.className} ${styles.metricLabel}`}>Top Client</span>
                </div>
                <p className={`${interMedium.className} ${styles.metricTooltip}`}>
                  Client with the highest paid revenue over the past 12 months.
                </p>
                <p className={styles.metricValue}>{topClientLast12Months?.displayName ?? "—"}</p>
                <p className={`${interMedium.className} ${styles.metricMeta}`}>
                  {formatCurrencyCompact(topClientLast12Months?.revenue ?? 0)}
                </p>
              </article>
              <article className={styles.metricTile}>
                <div className={styles.metricTop}>
                  <span className={styles.metricBadgeInk}>R</span>
                  <span className={`${interMedium.className} ${styles.metricLabel}`}>Top Client Conversion</span>
                </div>
                <p className={`${interMedium.className} ${styles.metricTooltip}`}>
                  Won opportunities as a share of all opportunities for your top client.
                </p>
                <p className={styles.metricValue}>{topClientConversionRate}%</p>
                <p className={`${interMedium.className} ${styles.metricMeta}`}>
                  {topClientForConversion?.displayName ?? "—"} • {topClientWonCount}/{topClientOpportunityCount} won
                </p>
              </article>
              <article className={styles.metricTile}>
                <div className={styles.metricTop}>
                  <span className={styles.metricBadgeSage}>L</span>
                  <span className={`${interMedium.className} ${styles.metricLabel}`}>Repeat</span>
                </div>
                <p className={`${interMedium.className} ${styles.metricTooltip}`}>
                  Share of clients who have 2 or more jobs with you.
                </p>
                <p className={styles.metricValue}>{repeatClientPercent}%</p>
                <p className={`${interMedium.className} ${styles.metricMeta}`}>
                  {repeatClientCount} client{repeatClientCount === 1 ? "" : "s"}
                </p>
              </article>
              <article className={styles.metricTile}>
                <div className={styles.metricTop}>
                  <span className={styles.metricBadgeGold}>P</span>
                  <span className={`${interMedium.className} ${styles.metricLabel}`}>Pipeline</span>
                </div>
                <p className={`${interMedium.className} ${styles.metricTooltip}`}>
                  Total estimated value of open quotes (not won or lost), and how many open quotes exist.
                </p>
                <p className={styles.metricValue}>{formatCurrencyCompact(pipelineValue)}</p>
                <p className={`${interMedium.className} ${styles.metricMeta}`}>
                  {openQuotesCount} quote{openQuotesCount === 1 ? "" : "s"}
                </p>
              </article>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.tableCard}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Client Insights (AI layer)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className={styles.insightsList}>
              <li className={`${interMedium.className} ${styles.insightItem}`}>
                ⚠️ {slowPayingClientCount} client{slowPayingClientCount === 1 ? "" : "s"} taking &gt;30 days to pay
              </li>
              <li className={`${interMedium.className} ${styles.insightItem}`}>
                💰 {topClient?.displayName ?? "Top client"} = {topClientDependencyPercent}% of your revenue (high dependency)
              </li>
              <li className={`${interMedium.className} ${styles.insightItem}`}>
                🔁 {repeatClientPercent}% of work comes from repeat clients
              </li>
              <li className={`${interMedium.className} ${styles.insightItem}`}>
                📉 {noActivityClientIds.size} client{noActivityClientIds.size === 1 ? "" : "s"} ha{noActivityClientIds.size === 1 ? "s" : "ve"} no recent activity
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className={styles.tableCard}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Client list</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr className={`${interMedium.className} ${styles.headRow}`}>
                    <th className={styles.headCell}>Client</th>
                    <th className={styles.headCell}>Company</th>
                    <th className={styles.headCellCenter}>Rating</th>
                    <th className={styles.headCellCenter}>Active Leads</th>
                    <th className={styles.headCellCenter}>Projects</th>
                    <th className={styles.headCell}>Tags</th>
                    <th className={styles.headCellRight}>Last Activity</th>
                    <th className={styles.headCellRight} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((client) => {
                    const totalRevenue = paidRevenueByClientId.get(client.id) ?? 0;
                    const avgJobValue = client.projectsCount > 0 ? totalRevenue / client.projectsCount : 0;
                    const overdueCount = overdueCountByClientId.get(client.id) ?? 0;
                    const paySamples = payDaysSamplesByClientId.get(client.id) ?? [];
                    const avgDaysToPay = paySamples.length > 0
                      ? paySamples.reduce((sum, days) => sum + days, 0) / paySamples.length
                      : null;

                    const reliability = (() => {
                      if (overdueCount > 0) {
                        return { label: "At Risk", className: styles.rankStatusAtRisk };
                      }
                      if (avgDaysToPay === null) {
                        return { label: "New", className: styles.rankStatusNew };
                      }
                      if (avgDaysToPay < 7) {
                        return { label: "Reliable", className: styles.rankStatusActive };
                      }
                      if (avgDaysToPay < 21) {
                        return { label: "Watch", className: styles.rankStatusRepeat };
                      }
                      return { label: "At Risk", className: styles.rankStatusAtRisk };
                    })();

                    return (
                      <tr key={client.id} className={styles.row}>
                        <td className={styles.cell}>
                          <p className={`${interMedium.className} ${styles.primaryText}`}>{getClientDisplayName(client)}</p>
                          <p className={`${interMedium.className} ${styles.secondaryText}`}>
                            {formatCurrencyCompact(totalRevenue)} total • {formatCurrencyCompact(avgJobValue)} avg • {client.projectsCount} job{client.projectsCount === 1 ? "" : "s"}
                          </p>
                          <p className={`${interMedium.className} ${styles.secondaryText}`}>
                            {avgDaysToPay === null ? "No payment history" : `Paid in ${formatDaysLabel(avgDaysToPay)}`} • {overdueCount > 0 ? `${overdueCount} overdue` : "No overdue"}
                          </p>
                          <div className={styles.rowChips}>
                            <span className={`${interMedium.className} ${styles.rankStatus} ${reliability.className}`}>
                              {reliability.label}
                            </span>
                            {client.projectsCount >= 2 ? (
                              <span className={`${interMedium.className} ${styles.rankStatus} ${styles.rankStatusRepeat}`}>Repeat</span>
                            ) : null}
                            {client.projectsCount < 2 && client.activeLeads > 0 ? (
                              <span className={`${interMedium.className} ${styles.rankStatus} ${styles.rankStatusActive}`}>Active</span>
                            ) : null}
                          </div>
                        </td>
                      <td className={styles.cell}>
                        <p className={`${interMedium.className} ${styles.bodyText}`}>{client.company_name || client.name}</p>
                      </td>
                      <td className={styles.cellCenter}>
                        <p className={`${interMedium.className} ${styles.bodyText}`}>{formatRating(client.rating)}</p>
                      </td>
                      <td className={styles.cellCenter}>
                        <p className={`${interMedium.className} ${styles.bodyText}`}>{client.activeLeads}</p>
                      </td>
                      <td className={styles.cellCenter}>
                        <p className={`${interMedium.className} ${styles.bodyText}`}>{client.projectsCount}</p>
                      </td>
                      <td className={styles.cell}>
                        <div className={styles.tagList}>
                          {client.tags.length > 0 ? (
                            client.tags.map((tag) => (
                              <span key={tag} className={`${interMedium.className} ${styles.tag}`}>
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className={`${interMedium.className} ${styles.emptyTag}`}>No tags</span>
                          )}
                        </div>
                      </td>
                      <td className={styles.cellRight}>
                        <p className={`${interMedium.className} ${styles.bodyText}`}>{formatRelativeTime(client.lastActivityIso)}</p>
                      </td>
                      <td className={styles.cellRight}>
                        <div className={styles.actions}>
                          <Button variant="ghost" asChild className={styles.actionButton}>
                            <Link href={`/app/leads-clients/clients/${client.id}`}>View</Link>
                          </Button>
                          <Button variant="ghost" asChild className={styles.actionButton}>
                            <Link href={`/app/leads-clients/clients/${client.id}/edit`}>Edit</Link>
                          </Button>
                          <Button variant="ghost" asChild className={styles.actionButton}>
                            <Link href={`/app/leads-clients/opportunities/new?clientId=${client.id}`}>Add Lead</Link>
                          </Button>
                        </div>
                      </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={`${interMedium.className} ${styles.emptyState}`}>
                        No clients yet. Add your first client to start tracking leads and projects.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
