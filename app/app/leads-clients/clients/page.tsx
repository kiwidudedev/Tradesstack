import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "./clients.module.css";

const CLIENT_TAGS = ["Good Client", "High Value", "Difficult", "Slow Payer"] as const;
const TOP_CLIENT_PERIOD_OPTIONS = [
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "12m", label: "12M" },
  { key: "all", label: "All" },
] as const;
type TopClientPeriodKey = (typeof TOP_CLIENT_PERIOD_OPTIONS)[number]["key"];

type ClaimFinanceRow = {
  project_id: string | null;
  status: string | null;
  claim_date: string | null;
  due_date: string | null;
  claim_amount: number | null;
  paid_amount: number | null;
  updated_at: string | null;
};

function getClientDisplayName(client: { company_name: string | null; name: string }): string {
  return client.company_name?.trim() || "Unknown Company";
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

function getTopClientPeriodCutoff(period: TopClientPeriodKey, now: Date): Date | null {
  if (period === "all") {
    return null;
  }
  const cutoff = new Date(now);
  if (period === "12m") {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    return cutoff;
  }
  if (period === "90d") {
    cutoff.setDate(cutoff.getDate() - 90);
    return cutoff;
  }
  cutoff.setDate(cutoff.getDate() - 30);
  return cutoff;
}

function isOnOrAfterCutoff(value: string | null, cutoff: Date | null): boolean {
  if (cutoff === null) {
    return true;
  }
  if (!value) {
    return false;
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return timestamp >= cutoff.getTime();
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

type LeadsClientsClientsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsClientsClientsPage({ searchParams }: LeadsClientsClientsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const topClientPeriodParam = resolvedSearchParams.topClientPeriod;
  const topClientPeriodRaw = Array.isArray(topClientPeriodParam) ? topClientPeriodParam[0] : topClientPeriodParam;
  const clientSearchParam = resolvedSearchParams.clientSearch;
  const clientSearchRaw = Array.isArray(clientSearchParam) ? clientSearchParam[0] : clientSearchParam;
  const clientSearch = (clientSearchRaw ?? "").trim();
  const topClientPeriod = TOP_CLIENT_PERIOD_OPTIONS.some((option) => option.key === topClientPeriodRaw)
    ? (topClientPeriodRaw as TopClientPeriodKey)
    : "12m";
  const topClientPeriodCutoff = getTopClientPeriodCutoff(topClientPeriod, new Date());
  const buildClientsHref = (nextTopClientPeriod: TopClientPeriodKey): string => {
    const params = new URLSearchParams();
    if (nextTopClientPeriod !== "12m") {
      params.set("topClientPeriod", nextTopClientPeriod);
    }
    const query = params.toString();
    return query ? `/app/leads-clients/clients?${query}` : "/app/leads-clients/clients";
  };

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
      .select("id, client_id, stage, estimated_value, created_at, updated_at")
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
  const projectCountInSelectedPeriodByClientId = new Map<string, number>();
  const latestProjectActivityByClientId = new Map<string, string>();
  for (const project of projects) {
    if (!project.client_id) {
      continue;
    }
    projectCountByClientId.set(project.client_id, (projectCountByClientId.get(project.client_id) ?? 0) + 1);
    if (isOnOrAfterCutoff(project.updated_at, topClientPeriodCutoff)) {
      projectCountInSelectedPeriodByClientId.set(
        project.client_id,
        (projectCountInSelectedPeriodByClientId.get(project.client_id) ?? 0) + 1
      );
    }
    if (!latestProjectActivityByClientId.has(project.client_id)) {
      latestProjectActivityByClientId.set(project.client_id, project.updated_at);
    }
  }

  const activeLeadCountByClientId = new Map<string, number>();
  const wonLeadCountByClientId = new Map<string, number>();
  const totalLeadCountInTopClientPeriodByClientId = new Map<string, number>();
  const wonLeadCountInTopClientPeriodByClientId = new Map<string, number>();
  const wonValueInTopClientPeriodByClientId = new Map<string, number>();
  const decisionDaysSamplesInTopPeriodByClientId = new Map<string, number[]>();
  const wonValueByClientId = new Map<string, number>();
  const latestLeadActivityByClientId = new Map<string, string>();
  for (const opportunity of opportunities) {
    if (!opportunity.client_id) {
      continue;
    }

    if (!latestLeadActivityByClientId.has(opportunity.client_id)) {
      latestLeadActivityByClientId.set(opportunity.client_id, opportunity.updated_at);
    }

    if (isOnOrAfterCutoff(opportunity.updated_at, topClientPeriodCutoff)) {
      totalLeadCountInTopClientPeriodByClientId.set(
        opportunity.client_id,
        (totalLeadCountInTopClientPeriodByClientId.get(opportunity.client_id) ?? 0) + 1
      );
    }

    const isActiveLead = opportunity.stage !== "Won" && opportunity.stage !== "Lost";
    if (isActiveLead) {
      activeLeadCountByClientId.set(opportunity.client_id, (activeLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);
    }

    if (opportunity.stage === "Won") {
      wonLeadCountByClientId.set(opportunity.client_id, (wonLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);
      wonValueByClientId.set(opportunity.client_id, (wonValueByClientId.get(opportunity.client_id) ?? 0) + Number(opportunity.estimated_value ?? 0));
      if (isOnOrAfterCutoff(opportunity.updated_at, topClientPeriodCutoff)) {
        wonLeadCountInTopClientPeriodByClientId.set(
          opportunity.client_id,
          (wonLeadCountInTopClientPeriodByClientId.get(opportunity.client_id) ?? 0) + 1
        );
        wonValueInTopClientPeriodByClientId.set(
          opportunity.client_id,
          (wonValueInTopClientPeriodByClientId.get(opportunity.client_id) ?? 0) + Number(opportunity.estimated_value ?? 0)
        );
      }
    }

    const isDecided = opportunity.stage === "Won" || opportunity.stage === "Lost";
    if (isDecided && isOnOrAfterCutoff(opportunity.updated_at, topClientPeriodCutoff)) {
      const createdAt = new Date(opportunity.created_at).getTime();
      const decidedAt = new Date(opportunity.updated_at).getTime();
      if (!Number.isNaN(createdAt) && !Number.isNaN(decidedAt) && decidedAt >= createdAt) {
        const decisionDays = (decidedAt - createdAt) / (1000 * 60 * 60 * 24);
        const current = decisionDaysSamplesInTopPeriodByClientId.get(opportunity.client_id) ?? [];
        current.push(decisionDays);
        decisionDaysSamplesInTopPeriodByClientId.set(opportunity.client_id, current);
      }
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

  const bestConversionClientInTopPeriod = rows.reduce<{
    id: string;
    displayName: string;
    wonCount: number;
    opportunityCount: number;
    conversionRate: number;
  } | null>((best, row) => {
    const opportunityCount = totalLeadCountInTopClientPeriodByClientId.get(row.id) ?? 0;
    if (opportunityCount === 0) {
      return best;
    }
    const wonCount = wonLeadCountInTopClientPeriodByClientId.get(row.id) ?? 0;
    const conversionRate = wonCount / opportunityCount;
    if (
      !best ||
      conversionRate > best.conversionRate ||
      (conversionRate === best.conversionRate && opportunityCount > best.opportunityCount) ||
      (conversionRate === best.conversionRate && opportunityCount === best.opportunityCount && wonCount > best.wonCount)
    ) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        wonCount,
        opportunityCount,
        conversionRate,
      };
    }
    return best;
  }, null);

  const mostRepeatWinsClient = rows.reduce<{
    id: string;
    displayName: string;
    wonCount: number;
  } | null>((best, row) => {
    const wonCount = wonLeadCountInTopClientPeriodByClientId.get(row.id) ?? 0;
    if (!best || wonCount > best.wonCount) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        wonCount,
      };
    }
    return best;
  }, null);
  const fastestDecisionClient = rows.reduce<{
    id: string;
    displayName: string;
    avgDecisionDays: number;
    decidedCount: number;
  } | null>((best, row) => {
    const samples = decisionDaysSamplesInTopPeriodByClientId.get(row.id) ?? [];
    if (samples.length === 0) {
      return best;
    }
    const avgDecisionDays = samples.reduce((sum, days) => sum + days, 0) / samples.length;
    if (
      !best ||
      avgDecisionDays < best.avgDecisionDays ||
      (avgDecisionDays === best.avgDecisionDays && samples.length > best.decidedCount)
    ) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        avgDecisionDays,
        decidedCount: samples.length,
      };
    }
    return best;
  }, null);
  const filteredClientRows = rows.filter((client) => {
    if (!clientSearch) {
      return true;
    }
    const company = client.company_name?.trim() || "";
    return company.toLowerCase().includes(clientSearch.toLowerCase());
  });
  const highestValueWonClient = rows.reduce<{
    id: string;
    displayName: string;
    wonValue: number;
    wonCount: number;
  } | null>((best, row) => {
    const wonValue = wonValueInTopClientPeriodByClientId.get(row.id) ?? 0;
    const wonCount = wonLeadCountInTopClientPeriodByClientId.get(row.id) ?? 0;
    if (!best || wonValue > best.wonValue) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        wonValue,
        wonCount,
      };
    }
    return best;
  }, null);

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
        <Card className={`${styles.overviewCard} relative`}>
          <div className="absolute right-6 top-6 z-20 flex items-center gap-2">
            <span className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6A7B95]`}>
              {TOP_CLIENT_PERIOD_OPTIONS.find((option) => option.key === topClientPeriod)?.label ?? "12M"}
            </span>
            <details className="relative">
              <summary className="flex h-[32px] w-[32px] cursor-pointer list-none items-center justify-center rounded-full border border-[#DCE3EC] bg-white text-[#4D607D] transition hover:bg-[#EEF3F9]">
                <SlidersHorizontal className="h-[13px] w-[13px]" />
              </summary>
              <div className="absolute right-0 top-11 z-20 min-w-[128px] rounded-[12px] border border-[#DCE3EC] bg-white p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
                {TOP_CLIENT_PERIOD_OPTIONS.map((option) => {
                  const isActive = option.key === topClientPeriod;
                  const href = buildClientsHref(option.key);
                  return (
                    <Link
                      key={option.key}
                      href={href}
                      className={`block rounded-[8px] px-2.5 py-1.5 text-xs font-semibold ${
                        isActive ? "bg-[#1D293D] text-white" : "text-[#4D607D] hover:bg-[#EEF3F9]"
                      }`}
                    >
                      {option.label}
                    </Link>
                  );
                })}
              </div>
            </details>
          </div>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Client Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className={styles.overviewGrid}>
              {bestConversionClientInTopPeriod ? (
                <Link href={`/app/leads-clients/clients/${bestConversionClientInTopPeriod.id}`} className="block">
                  <article className={`${styles.metricTile} cursor-pointer`}>
                    <div className={styles.metricTop}>
                      <span className={`${interMedium.className} ${styles.metricLabel}`}>Best Conversion Client</span>
                    </div>
                    <p className={styles.metricValue}>{bestConversionClientInTopPeriod.displayName}</p>
                  </article>
                </Link>
              ) : (
                <article className={styles.metricTile}>
                  <div className={styles.metricTop}>
                    <span className={`${interMedium.className} ${styles.metricLabel}`}>Best Conversion Client</span>
                  </div>
                  <p className={styles.metricValue}>—</p>
                </article>
              )}
              {highestValueWonClient ? (
                <Link href={`/app/leads-clients/clients/${highestValueWonClient.id}`} className="block">
                  <article className={`${styles.metricTile} cursor-pointer`}>
                    <div className={styles.metricTop}>
                      <span className={`${interMedium.className} ${styles.metricLabel}`}>Highest Value Won Client</span>
                    </div>
                    <p className={styles.metricValue}>{highestValueWonClient.displayName}</p>
                  </article>
                </Link>
              ) : (
                <article className={styles.metricTile}>
                  <div className={styles.metricTop}>
                    <span className={`${interMedium.className} ${styles.metricLabel}`}>Highest Value Won Client</span>
                  </div>
                  <p className={styles.metricValue}>—</p>
                </article>
              )}
              {mostRepeatWinsClient ? (
                <Link href={`/app/leads-clients/clients/${mostRepeatWinsClient.id}`} className="block">
                  <article className={`${styles.metricTile} cursor-pointer`}>
                    <div className={styles.metricTop}>
                      <span className={`${interMedium.className} ${styles.metricLabel}`}>Most Repeat Wins</span>
                    </div>
                    <p className={styles.metricValue}>{mostRepeatWinsClient.displayName}</p>
                  </article>
                </Link>
              ) : (
                <article className={styles.metricTile}>
                  <div className={styles.metricTop}>
                    <span className={`${interMedium.className} ${styles.metricLabel}`}>Most Repeat Wins</span>
                  </div>
                  <p className={styles.metricValue}>—</p>
                </article>
              )}
              {fastestDecisionClient ? (
                <Link href={`/app/leads-clients/clients/${fastestDecisionClient.id}`} className="block">
                  <article className={`${styles.metricTile} cursor-pointer`}>
                    <div className={styles.metricTop}>
                      <span className={`${interMedium.className} ${styles.metricLabel}`}>Fastest Decision Client</span>
                    </div>
                    <p className={styles.metricValue}>{fastestDecisionClient.displayName}</p>
                  </article>
                </Link>
              ) : (
                <article className={styles.metricTile}>
                  <div className={styles.metricTop}>
                    <span className={`${interMedium.className} ${styles.metricLabel}`}>Fastest Decision Client</span>
                  </div>
                  <p className={styles.metricValue}>—</p>
                </article>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={styles.tableCard}>
          <CardHeader className={`${styles.sectionHeader} !flex-row !items-center !justify-between !space-y-0 gap-3`}>
            <CardTitle className={styles.sectionTitle}>Client list</CardTitle>
            <form action="/app/leads-clients/clients" method="get" className="flex items-center gap-2">
              {topClientPeriod !== "12m" ? <input type="hidden" name="topClientPeriod" value={topClientPeriod} /> : null}
              <input
                type="text"
                name="clientSearch"
                defaultValue={clientSearch}
                placeholder="Search"
                className={`${interMedium.className} ${styles.actionButton} w-auto outline-none placeholder:text-[#7b8aa3] focus:border-[#bfc9d8]`}
              />
            </form>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredClientRows.length === 0 ? (
              <div className={styles.simpleEmptyPanel}>
                <p className={`${interMedium.className} ${styles.simpleEmptyText}`}>
                  No matching clients found.
                </p>
              </div>
            ) : (
              <div className={styles.simpleList}>
                {filteredClientRows.map((client) => (
                  <article key={client.id} className={styles.simpleListItem}>
                    <p className={`${interMedium.className} ${styles.simpleListTitle}`}>{client.company_name || "Unknown Company"}</p>
                    <Button variant="ghost" asChild className={styles.actionButton}>
                      <Link href={`/app/leads-clients/clients/${client.id}`}>View</Link>
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={styles.tableCard}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Client Insights (AI)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0" />
        </Card>
      </section>
    </main>
  );
}
