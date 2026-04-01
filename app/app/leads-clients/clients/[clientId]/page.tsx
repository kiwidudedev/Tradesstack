import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, DollarSign, FileText, FolderOpen, Receipt, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "./client-detail.module.css";

type ClientRow = {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  stage: string;
  created_at: string;
  updated_at: string;
};

type OpportunityRow = {
  id: string;
  slug: string;
  name: string;
  stage: string;
  estimated_value: number | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectQuoteRow = {
  id: string;
  project_id: string;
  quote_title: string;
  quote_number: string;
  status: string;
  total_quote_price: number | null;
  created_at: string;
  updated_at: string;
};

type OpportunityQuoteRow = {
  id: string;
  opportunity_id: string;
  quote_title: string;
  quote_number: string;
  status: string;
  total_quote_price: number | null;
  created_at: string;
  updated_at: string;
};

type ClaimRow = {
  id: string;
  project_id: string;
  claim_number: string;
  claim_title: string;
  status: string | null;
  claim_date: string | null;
  due_date: string | null;
  claim_amount: number | null;
  paid_amount: number | null;
  notes: string | null;
  updated_at: string;
};

type VariationRow = {
  id: string;
  project_id: string;
  variation_number: string;
  variation_title: string;
  status: string;
  total_variation_price: number | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type DrawingSetRow = {
  id: string;
  project_id: string;
  file_name: string;
  created_at: string;
};

type UntypedResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  detail: string;
  href: string | null;
};

type RiskTone = "green" | "orange" | "red";

function toMoney(value: number): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function dayDiff(from: string | null | undefined, to: string | null | undefined): number | null {
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  if (!fromDate || !toDateValue) {
    return null;
  }
  const ms = toDateValue.getTime() - fromDate.getTime();
  if (ms < 0) {
    return null;
  }
  return ms / (1000 * 60 * 60 * 24);
}

function toPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function toNumeric(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function isOpenQuote(status: string): boolean {
  return status === "Draft" || status === "Ready to Send" || status === "Sent" || status === "Viewed";
}

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const member = await getCurrentOrganizationMember();

  if (!member) {
    redirect("/app/leads-clients/clients");
  }

  const supabase = await createServerSupabaseClient();
  const [clientResult, projectsResult, opportunitiesResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name, email, phone, tags, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("id", clientId)
      .maybeSingle<ClientRow>(),
    supabase
      .from("organization_projects")
      .select("id, slug, name, stage, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .returns<ProjectRow[]>(),
    supabase
      .from("organization_opportunities")
      .select("id, slug, name, stage, estimated_value, due_date, notes, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .returns<OpportunityRow[]>(),
  ]);

  if (clientResult.error || !clientResult.data) {
    notFound();
  }

  const client = clientResult.data;
  const projects = projectsResult.error ? [] : (projectsResult.data ?? []);
  const opportunities = opportunitiesResult.error ? [] : (opportunitiesResult.data ?? []);
  const projectIdSet = new Set(projects.map((project) => project.id));
  const opportunityIdSet = new Set(opportunities.map((opportunity) => opportunity.id));

  const untypedSupabase = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<UntypedResult<Record<string, unknown>>>;
      };
    };
  };

  const [projectQuotesResult, opportunityQuotesRawResult, claimsRawResult, variationsRawResult, filesRawResult] = await Promise.all([
    supabase
      .from("project_quotes")
      .select("id, project_id, quote_title, quote_number, status, total_quote_price, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .returns<ProjectQuoteRow[]>(),
    untypedSupabase
      .from("opportunity_quotes")
      .select("id, opportunity_id, quote_title, quote_number, status, total_quote_price, created_at, updated_at")
      .eq("organization_id", member.organization_id),
    untypedSupabase
      .from("project_claims")
      .select("id, project_id, claim_number, claim_title, status, claim_date, due_date, claim_amount, paid_amount, notes, updated_at")
      .eq("organization_id", member.organization_id),
    untypedSupabase
      .from("project_variations")
      .select("id, project_id, variation_number, variation_title, status, total_variation_price, approved_at, notes, created_at, updated_at")
      .eq("organization_id", member.organization_id),
    untypedSupabase
      .from("project_drawing_sets")
      .select("id, project_id, file_name, created_at")
      .eq("organization_id", member.organization_id),
  ]);

  const projectQuotes = (projectQuotesResult.error ? [] : (projectQuotesResult.data ?? [])).filter((quote) =>
    projectIdSet.has(quote.project_id)
  );

  const opportunityQuotes = ((opportunityQuotesRawResult.error ? [] : (opportunityQuotesRawResult.data ?? [])) as OpportunityQuoteRow[]).filter(
    (quote) => opportunityIdSet.has(quote.opportunity_id)
  );

  const claims = ((claimsRawResult.error ? [] : (claimsRawResult.data ?? [])) as ClaimRow[]).filter((claim) =>
    projectIdSet.has(claim.project_id)
  );

  const variations = ((variationsRawResult.error ? [] : (variationsRawResult.data ?? [])) as VariationRow[]).filter((variation) =>
    projectIdSet.has(variation.project_id)
  );

  const drawingSets = ((filesRawResult.error ? [] : (filesRawResult.data ?? [])) as DrawingSetRow[]).filter((file) =>
    projectIdSet.has(file.project_id)
  );

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));

  const totalRevenue = claims.reduce((sum, claim) => sum + toNumeric(claim.paid_amount), 0);
  const totalClaimed = claims.reduce((sum, claim) => sum + toNumeric(claim.claim_amount), 0);
  const outstanding = Math.max(0, totalClaimed - totalRevenue);

  const latestJobDate = projects.reduce<string | null>((latest, project) => {
    if (!latest) {
      return project.updated_at;
    }
    return project.updated_at > latest ? project.updated_at : latest;
  }, null);

  const jobsCompleted = projects.filter((project) => project.stage === "Completion").length;
  const jobsInProgress = projects.filter((project) => project.stage !== "Completion").length;
  const avgJobValue = jobsCompleted > 0 ? totalRevenue / jobsCompleted : totalRevenue;

  const paidClaims = claims.filter((claim) => {
    const paidAmount = toNumeric(claim.paid_amount);
    const claimAmount = toNumeric(claim.claim_amount);
    const status = (claim.status ?? "").toLowerCase();
    return status === "paid" || paidAmount >= claimAmount;
  });

  const daySamples = paidClaims
    .map((claim) => dayDiff(claim.claim_date, claim.updated_at))
    .filter((value): value is number => value !== null);
  const avgDaysToPay = daySamples.length > 0 ? daySamples.reduce((sum, value) => sum + value, 0) / daySamples.length : null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueClaims = claims.filter((claim) => {
    const dueDate = claim.due_date;
    const claimAmount = toNumeric(claim.claim_amount);
    const paidAmount = toNumeric(claim.paid_amount);
    const balance = Math.max(0, claimAmount - paidAmount);
    const status = (claim.status ?? "").toLowerCase();
    const overdueByStatus = status === "overdue";
    const overdueByDate = Boolean(dueDate && dueDate < todayIso && balance > 0);
    return overdueByStatus || overdueByDate;
  });
  const overdueAmount = overdueClaims.reduce((sum, claim) => {
    const claimAmount = toNumeric(claim.claim_amount);
    const paidAmount = toNumeric(claim.paid_amount);
    return sum + Math.max(0, claimAmount - paidAmount);
  }, 0);

  const paymentReliability = claims.length > 0 ? (paidClaims.length / claims.length) * 100 : null;

  const repeatJobs = Math.max(0, projects.length - 1);
  const repeatJobsPercent = projects.length > 0 ? (repeatJobs / projects.length) * 100 : 0;
  const revenueFromRepeatWork = projects.length > 1 ? (totalRevenue * repeatJobs) / projects.length : 0;

  const openQuotesValue = [...projectQuotes, ...opportunityQuotes]
    .filter((quote) => isOpenQuote(quote.status))
    .reduce((sum, quote) => sum + toNumeric(quote.total_quote_price), 0);

  const activeOpportunitiesValue = opportunities
    .filter((opportunity) => opportunity.stage !== "Won" && opportunity.stage !== "Lost")
    .reduce((sum, opportunity) => sum + toNumeric(opportunity.estimated_value), 0);

  const forecastRevenue = openQuotesValue + activeOpportunitiesValue;

  const now = new Date();
  const last90Start = new Date(now);
  last90Start.setDate(last90Start.getDate() - 90);
  const previous90Start = new Date(last90Start);
  previous90Start.setDate(previous90Start.getDate() - 90);

  let revenueLast90 = 0;
  let revenuePrevious90 = 0;
  for (const claim of claims) {
    const paidAmount = toNumeric(claim.paid_amount);
    if (paidAmount <= 0 || !claim.updated_at) {
      continue;
    }
    const paidAt = toDate(claim.updated_at);
    if (!paidAt) {
      continue;
    }
    if (paidAt >= last90Start) {
      revenueLast90 += paidAmount;
    } else if (paidAt >= previous90Start && paidAt < last90Start) {
      revenuePrevious90 += paidAmount;
    }
  }

  const spendDeclinePercent =
    revenuePrevious90 > 0 ? ((revenuePrevious90 - revenueLast90) / revenuePrevious90) * 100 : revenueLast90 === 0 ? 0 : -100;

  const rejectedVariationCount = variations.filter((variation) => variation.status === "Rejected").length;

  const riskFlags: Array<{ tone: RiskTone; label: string; detail: string }> = [];
  if (overdueAmount > 0) {
    riskFlags.push({
      tone: "red",
      label: "Overdue invoices",
      detail: `${overdueClaims.length} overdue, ${toMoney(overdueAmount)} outstanding`,
    });
  }

  if (rejectedVariationCount > 0) {
    riskFlags.push({
      tone: "orange",
      label: "Dispute signal",
      detail: `${rejectedVariationCount} rejected variation${rejectedVariationCount === 1 ? "" : "s"}`,
    });
  }

  if (spendDeclinePercent >= 25 && revenuePrevious90 > 0) {
    riskFlags.push({
      tone: spendDeclinePercent >= 50 ? "red" : "orange",
      label: "Declining spend",
      detail: `${toPercent(spendDeclinePercent)} down vs prior 90 days`,
    });
  }

  if (avgDaysToPay !== null && avgDaysToPay > 45) {
    riskFlags.push({
      tone: "orange",
      label: "Slow payment behavior",
      detail: `${Math.round(avgDaysToPay)} days average to pay`,
    });
  }

  if (riskFlags.length === 0) {
    riskFlags.push({ tone: "green", label: "Healthy profile", detail: "No immediate risk indicators found" });
  }

  const noteEntries = opportunities
    .filter((opportunity) => (opportunity.notes ?? "").trim().length > 0)
    .map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.name,
      body: (opportunity.notes ?? "").trim(),
      at: opportunity.updated_at,
      href: `/app/leads-clients/opportunities/${opportunity.slug}`,
    }))
    .sort((left, right) => right.at.localeCompare(left.at));

  const timeline: TimelineEvent[] = [
    {
      id: `client-created-${client.id}`,
      at: client.created_at,
      title: "Client profile created",
      detail: client.company_name?.trim() || client.name,
      href: null,
    },
  ];

  for (const project of projects) {
    timeline.push({
      id: `project-${project.id}`,
      at: project.created_at,
      title: "Job created",
      detail: project.name,
      href: `/app/projects/${project.slug}/dashboard`,
    });
  }

  for (const opportunity of opportunities) {
    timeline.push({
      id: `opportunity-${opportunity.id}`,
      at: opportunity.updated_at,
      title: "Opportunity updated",
      detail: `${opportunity.name} · ${opportunity.stage}`,
      href: `/app/leads-clients/opportunities/${opportunity.slug}`,
    });
  }

  for (const quote of opportunityQuotes) {
    const linkedOpportunity = opportunityById.get(quote.opportunity_id);
    timeline.push({
      id: `opportunity-quote-${quote.id}`,
      at: quote.updated_at || quote.created_at,
      title: quote.status === "Sent" || quote.status === "Viewed" ? "Quote sent" : "Quote issued",
      detail: `${quote.quote_number} · ${quote.quote_title}`,
      href: linkedOpportunity ? `/app/leads-clients/opportunities/${linkedOpportunity.slug}/quote` : null,
    });
  }

  for (const claim of claims) {
    const linkedProject = projectById.get(claim.project_id);
    timeline.push({
      id: `claim-issued-${claim.id}`,
      at: claim.claim_date || claim.updated_at,
      title: "Invoice / claim issued",
      detail: `${claim.claim_number} · ${claim.claim_title}`,
      href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/claims/${claim.id}` : null,
    });

    if (toNumeric(claim.paid_amount) > 0) {
      timeline.push({
        id: `claim-paid-${claim.id}`,
        at: claim.updated_at,
        title: "Payment received",
        detail: `${claim.claim_number} · ${toMoney(toNumeric(claim.paid_amount))}`,
        href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/claims/${claim.id}` : null,
      });
    }
  }

  for (const variation of variations) {
    if (!variation.approved_at) {
      continue;
    }
    const linkedProject = projectById.get(variation.project_id);
    timeline.push({
      id: `variation-approved-${variation.id}`,
      at: variation.approved_at,
      title: "Variation approved",
      detail: `${variation.variation_number} · ${variation.variation_title}`,
      href: linkedProject ? `/app/projects/${linkedProject.slug}/preconstruction/variations/${variation.id}` : null,
    });
  }

  for (const note of noteEntries) {
    timeline.push({
      id: `note-${note.id}`,
      at: note.at,
      title: "Note added",
      detail: note.title,
      href: note.href,
    });
  }

  const timelineRows = timeline.sort((left, right) => right.at.localeCompare(left.at)).slice(0, 14);
  const recentClaims = [...claims]
    .sort((left, right) => (right.due_date || right.updated_at).localeCompare(left.due_date || left.updated_at))
    .slice(0, 8);

  return (
    <main className={`${styles.scope} space-y-6 pb-8`}>
      <section className={styles.headerSection}>
        <Card className={styles.card}>
          <CardContent className={`${styles.cardBody} ${styles.identityWrap}`}>
            <div className={styles.identityBlock}>
              <div className={styles.backActionRow}>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className={`${interMedium.className} ${styles.backButton} h-9 px-4 text-sm font-medium`}
                >
                  <Link href="/app/leads-clients/clients">
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Back to Clients
                  </Link>
                </Button>
              </div>
              <h1 className={styles.heroTitle}>{client.company_name?.trim() || client.name}</h1>
              <p className={`${interMedium.className} ${styles.heroSubline}`}>{client.name}</p>
              <div className={styles.tagWrap}>
                {(client.tags ?? []).length > 0 ? (
                  (client.tags ?? []).map((tag) => (
                    <span key={tag} className={`${interMedium.className} ${styles.tagPill}`}>
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className={`${interMedium.className} ${styles.emptyPill}`}>No tags yet</span>
                )}
              </div>
              <div className={styles.contactGrid}>
                <div>
                  <p className={`${interMedium.className} ${styles.contactLabel}`}>Email</p>
                  <p className={styles.contactValue}>{client.email || "-"}</p>
                </div>
                <div>
                  <p className={`${interMedium.className} ${styles.contactLabel}`}>Phone</p>
                  <p className={styles.contactValue}>{client.phone || "-"}</p>
                </div>
              </div>
            </div>

            <div className={styles.quickStatsBlock}>
              <div className={styles.quickStatTile}>
                <span className={styles.quickStatIcon}>
                  <DollarSign className="h-4 w-4" strokeWidth={2.1} />
                </span>
                <p className={`${interMedium.className} ${styles.quickStatLabel}`}>Total Revenue</p>
                <p className={styles.quickStatValue}>{toMoney(totalRevenue)}</p>
              </div>
              <div className={styles.quickStatTile}>
                <span className={styles.quickStatIcon}>
                  <Receipt className="h-4 w-4" strokeWidth={2.1} />
                </span>
                <p className={`${interMedium.className} ${styles.quickStatLabel}`}>Outstanding</p>
                <p className={styles.quickStatValue}>{toMoney(outstanding)}</p>
              </div>
              <div className={styles.quickStatTile}>
                <span className={styles.quickStatIcon}>
                  <Clock3 className="h-4 w-4" strokeWidth={2.1} />
                </span>
                <p className={`${interMedium.className} ${styles.quickStatLabel}`}>Last Job Date</p>
                <p className={styles.quickStatValue}>{formatDate(latestJobDate)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className={styles.performanceSection}>
        <div className={styles.sectionIntro}>
          <h2 className={styles.sectionHeading}>Performance</h2>
          <p className={`${interMedium.className} ${styles.sectionSummary}`}>Data and signals to judge client value, reliability, and forward pipeline.</p>
        </div>

        <div className={styles.performanceGrid}>
          <Card className={styles.card}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={styles.sectionTitle}>Client Value</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.metricList}>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Total Revenue</p>
                  <p className={styles.metricValue}>{toMoney(totalRevenue)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Avg Job Value</p>
                  <p className={styles.metricValue}>{toMoney(avgJobValue)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Lifetime Value</p>
                  <p className={styles.metricValue}>{toMoney(totalRevenue)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Jobs Completed</p>
                  <p className={styles.metricValue}>{jobsCompleted}</p>
                </article>
              </div>
            </CardContent>
          </Card>

          <Card className={styles.card}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={styles.sectionTitle}>Payment Behaviour</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.metricList}>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Avg Days to Pay</p>
                  <p className={styles.metricValue}>{avgDaysToPay === null ? "-" : `${Math.round(avgDaysToPay)} days`}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Overdue Amount</p>
                  <p className={styles.metricValue}>{toMoney(overdueAmount)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Payment Reliability</p>
                  <p className={styles.metricValue}>{paymentReliability === null ? "-" : toPercent(paymentReliability)}</p>
                </article>
              </div>
            </CardContent>
          </Card>

          <Card className={styles.card}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={styles.sectionTitle}>Repeat Work</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.metricList}>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Repeat Jobs</p>
                  <p className={styles.metricValue}>{toPercent(repeatJobsPercent)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Revenue from Repeat</p>
                  <p className={styles.metricValue}>{toMoney(revenueFromRepeatWork)}</p>
                </article>
              </div>
            </CardContent>
          </Card>

          <Card className={styles.card}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={styles.sectionTitle}>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.metricList}>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Open Quotes Value</p>
                  <p className={styles.metricValue}>{toMoney(openQuotesValue)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Jobs in Progress</p>
                  <p className={styles.metricValue}>{jobsInProgress}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Forecast Revenue</p>
                  <p className={styles.metricValue}>{toMoney(forecastRevenue)}</p>
                </article>
              </div>
            </CardContent>
          </Card>

          <Card className={styles.card}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={styles.sectionTitle}>Risk Indicators</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.riskList}>
                {riskFlags.map((flag) => (
                  <article key={`${flag.label}-${flag.detail}`} className={styles[`riskRow${flag.tone[0].toUpperCase()}${flag.tone.slice(1)}`]}>
                    <div className={styles.riskIcon}>
                      {flag.tone === "green" ? (
                        <CheckCircle2 className="h-4 w-4" strokeWidth={2.1} />
                      ) : flag.tone === "orange" ? (
                        <AlertTriangle className="h-4 w-4" strokeWidth={2.1} />
                      ) : (
                        <XCircle className="h-4 w-4" strokeWidth={2.1} />
                      )}
                    </div>
                    <div>
                      <p className={styles.riskTitle}>{flag.label}</p>
                      <p className={`${interMedium.className} ${styles.riskMeta}`}>{flag.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className={styles.activitySection}>
        <div className={styles.sectionIntro}>
          <h2 className={styles.sectionHeading}>Activity</h2>
          <p className={`${interMedium.className} ${styles.sectionSummary}`}>Live work context across jobs, quotes, invoices, variations, notes, and files.</p>
        </div>

        <div className={styles.activityTabs}>
          <a href="#jobs" className={`${interMedium.className} ${styles.activityTab}`}>Jobs</a>
          <a href="#financial" className={`${interMedium.className} ${styles.activityTab}`}>Quotes + Invoices</a>
          <a href="#notes-files" className={`${interMedium.className} ${styles.activityTab}`}>Notes + Files</a>
          <a href="#timeline" className={`${interMedium.className} ${styles.activityTab}`}>Timeline</a>
        </div>

        <div className={styles.activityGrid}>
          <Card id="timeline" className={`${styles.card} ${styles.timelineCard}`}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={styles.sectionTitle}>Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              {timelineRows.length === 0 ? (
                <p className={`${interMedium.className} ${styles.emptyState}`}>No activity yet for this client.</p>
              ) : (
                <div className={styles.timelineList}>
                  {timelineRows.map((item) => (
                    <article key={item.id} className={styles.timelineRow}>
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineText}>
                        <p className={styles.timelineTitle}>{item.title}</p>
                        <p className={`${interMedium.className} ${styles.timelineMeta}`}>{item.detail}</p>
                        <p className={`${interMedium.className} ${styles.timelineTime}`}>{formatDateTime(item.at)}</p>
                        {item.href ? (
                          <Link className={`${interMedium.className} ${styles.timelineLink}`} href={item.href}>
                            Open
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className={styles.activityStack}>
            <Card id="jobs" className={styles.card}>
              <CardHeader className={styles.sectionHeader}>
                <CardTitle className={styles.sectionTitle}>Jobs</CardTitle>
              </CardHeader>
              <CardContent className={styles.cardBody}>
                {projects.length === 0 ? (
                  <p className={`${interMedium.className} ${styles.emptyState}`}>No jobs linked to this client yet.</p>
                ) : (
                  <div className={styles.tableList}>
                    {projects.slice(0, 8).map((project) => (
                      <article key={project.id} className={styles.tableRow}>
                        <div>
                          <p className={styles.tableTitle}>{project.name}</p>
                          <p className={`${interMedium.className} ${styles.tableMeta}`}>{project.stage} · Updated {formatDate(project.updated_at)}</p>
                        </div>
                        <Button variant="ghost" asChild className={styles.inlineActionButton}>
                          <Link href={`/app/projects/${project.slug}/dashboard`}>Open</Link>
                        </Button>
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card id="financial" className={styles.card}>
              <CardHeader className={styles.sectionHeader}>
                <CardTitle className={styles.sectionTitle}>Quotes + Invoices</CardTitle>
              </CardHeader>
              <CardContent className={styles.cardBody}>
                {recentClaims.length === 0 ? (
                  <p className={`${interMedium.className} ${styles.emptyState}`}>No invoice or claim records yet.</p>
                ) : (
                  <div className={styles.tableList}>
                    {recentClaims.map((claim) => {
                      const claimAmount = toNumeric(claim.claim_amount);
                      const paidAmount = toNumeric(claim.paid_amount);
                      const balance = Math.max(0, claimAmount - paidAmount);
                      const project = projectById.get(claim.project_id);
                      return (
                        <article key={claim.id} className={styles.tableRow}>
                          <div>
                            <p className={styles.tableTitle}>{claim.claim_number} · {claim.claim_title}</p>
                            <p className={`${interMedium.className} ${styles.tableMeta}`}>
                              {claim.status || "Draft"} · Due {formatDate(claim.due_date)} · Balance {toMoney(balance)}
                            </p>
                          </div>
                          {project ? (
                            <Button variant="ghost" asChild className={styles.inlineActionButton}>
                              <Link href={`/app/projects/${project.slug}/preconstruction/claims/${claim.id}`}>Open</Link>
                            </Button>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card id="notes-files" className={styles.card}>
              <CardHeader className={styles.sectionHeader}>
                <CardTitle className={styles.sectionTitle}>Notes + Files</CardTitle>
              </CardHeader>
              <CardContent className={styles.cardBody}>
                <div className={styles.notesFilesGrid}>
                  <article className={styles.notesFilePane}>
                    <p className={styles.notesPaneHeading}>
                      <FileText className="h-4 w-4" /> Notes
                    </p>
                    {noteEntries.length === 0 ? (
                      <p className={`${interMedium.className} ${styles.emptyState}`}>No notes logged yet.</p>
                    ) : (
                      <div className={styles.notesList}>
                        {noteEntries.slice(0, 4).map((note) => (
                          <Link key={note.id} href={note.href} className={styles.noteItem}>
                            <p className={styles.noteTitle}>{note.title}</p>
                            <p className={`${interMedium.className} ${styles.noteBody}`}>{note.body}</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </article>

                  <article className={styles.notesFilePane}>
                    <p className={styles.notesPaneHeading}>
                      <FolderOpen className="h-4 w-4" /> Files
                    </p>
                    {drawingSets.length === 0 ? (
                      <p className={`${interMedium.className} ${styles.emptyState}`}>No files linked yet.</p>
                    ) : (
                      <div className={styles.notesList}>
                        {drawingSets.slice(0, 6).map((file) => (
                          <div key={file.id} className={styles.fileItem}>
                            <p className={styles.noteTitle}>{file.file_name}</p>
                            <p className={`${interMedium.className} ${styles.noteBody}`}>Added {formatDate(file.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}
