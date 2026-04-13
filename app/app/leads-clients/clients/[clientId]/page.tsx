import Link from "next/link";
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Clock3, TrendingUp, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interBold, interMedium, ibmPlexSans } from "@/lib/fonts";
import { ClientDetailHeader } from "./ClientDetailHeader";
import { formatDate, formatDateTime, getClientDetailData, toMoney, toPercent } from "./client-detail-data";
import styles from "./client-detail.module.css";

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const data = await getClientDetailData(clientId);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.scope} space-y-6 pb-8`}>
      <ClientDetailHeader client={data.client} clientId={clientId} activeTab="overview" isActive={data.jobsInProgress > 0 || data.activeOpportunities.length > 0} />

      <section id="overview" className={styles.performanceSection}>
        <div className={styles.quickStatsGrid}>
          {[
            {
              label: "Lifetime Value",
              value: toMoney(data.totalRevenue),
              meta: `${data.projects.length} total project${data.projects.length === 1 ? "" : "s"}`,
              icon: BriefcaseBusiness,
            },
            {
              label: "Conversion Rate",
              value: data.conversionRate === null ? "-" : toPercent(data.conversionRate),
              meta: data.activeOpportunities.length > 0 ? `${data.activeOpportunities.length} open opportunities` : "No open opportunities",
              icon: TrendingUp,
            },
            {
              label: "Payment Behaviour",
              value: data.avgDaysToPay === null ? "-" : `${Math.round(data.avgDaysToPay)} days`,
              meta: data.paymentReliability === null ? "No payment history yet" : `${toPercent(data.paymentReliability)} reliability`,
              icon: Clock3,
            },
            {
              label: "Active Pipeline",
              value: `${data.activeOpportunities.length}`,
              meta: `${data.jobsInProgress} active project${data.jobsInProgress === 1 ? "" : "s"}`,
              icon: BriefcaseBusiness,
            },
          ].map((metric, index) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.label} className={`${styles.metricSummaryCard} ${styles[`metricSummaryCard${index + 1}`]}`}>
                <CardContent className={styles.metricSummaryBody}>
                  <div className={styles.quickStatTile}>
                    <span className={styles.quickStatIcon}>
                      <Icon className="h-5 w-5" strokeWidth={2.1} />
                    </span>
                    <p className={`${interMedium.className} ${styles.quickStatLabel}`}>{metric.label}</p>
                    <p className={styles.quickStatValue}>{metric.value}</p>
                    <p className={styles.quickStatMeta}>{metric.meta}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className={styles.overviewGrid}>
          <Card className={`${styles.card} ${styles.infoCard}`}>
            <CardHeader className={styles.sectionHeader}>
              <div className={styles.sectionHeaderRow}>
                <CardTitle className={`${interBold.className} ${styles.sectionTitle}`}>Client Information</CardTitle>
                <Link href={`/app/leads-clients/clients/${clientId}/edit`} className={styles.editDetailsButton}>
                  Edit details
                </Link>
              </div>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.clientInfoGrid}>
                <div className={styles.infoPair}>
                  <p className={styles.contactLabel}>Primary Contact:</p>
                  <p className={styles.contactValue}>{data.client.name || "-"}</p>
                </div>
                <div className={styles.infoPair}>
                  <p className={styles.contactLabel}>Client Since:</p>
                  <p className={styles.contactValue}>{formatDate(data.client.created_at)}</p>
                </div>
                <div className={styles.infoPair}>
                  <p className={styles.contactLabel}>Email:</p>
                  <p className={styles.contactValue}>{data.client.email || "-"}</p>
                </div>
                <div className={styles.infoPair}>
                  <p className={styles.contactLabel}>Last Job Date:</p>
                  <p className={styles.contactValue}>{formatDate(data.latestJobDate)}</p>
                </div>
                <div className={styles.infoPair}>
                  <p className={styles.contactLabel}>Phone:</p>
                  <p className={styles.contactValue}>{data.client.phone || "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${styles.card} ${styles.infoCard}`}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={`${interBold.className} ${styles.sectionTitle}`}>Overview</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.metricList}>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Open Quotes Value</p>
                  <p className={styles.metricValue}>{toMoney(data.openQuotesValue)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Forecast Revenue</p>
                  <p className={styles.metricValue}>{toMoney(data.forecastRevenue)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Outstanding</p>
                  <p className={styles.metricValue}>{toMoney(data.outstanding)}</p>
                </article>
                <article className={styles.metricPill}>
                  <p className={`${interMedium.className} ${styles.metricLabel}`}>Repeat Jobs</p>
                  <p className={styles.metricValue}>{toPercent(data.repeatJobsPercent)}</p>
                </article>
              </div>
            </CardContent>
          </Card>

          <Card className={`${styles.card} ${styles.fullWidthCard}`}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={`${interBold.className} ${styles.sectionTitle}`}>Quick Activity</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.overviewActivityGrid}>
                <div className={styles.tableList}>
                  {data.projects.slice(0, 3).map((project) => (
                    <article key={project.id} className={styles.tableRow}>
                      <div>
                        <p className={styles.tableTitle}>{project.name}</p>
                        <p className={`${interMedium.className} ${styles.tableMeta}`}>{project.stage} · Updated {formatDate(project.updated_at)}</p>
                      </div>
                      <Link href={`/app/projects/${project.slug}/dashboard`} className={styles.inlineLink}>Open</Link>
                    </article>
                  ))}
                </div>
                <div className={styles.timelineList}>
                  {data.timelineRows.slice(0, 4).map((item) => (
                    <article key={item.id} className={styles.timelineRow}>
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineText}>
                        <p className={styles.timelineTitle}>{item.title}</p>
                        <p className={`${interMedium.className} ${styles.timelineMeta}`}>{item.detail}</p>
                        <p className={`${interMedium.className} ${styles.timelineTime}`}>{formatDateTime(item.at)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${styles.card} ${styles.fullWidthCard}`}>
            <CardHeader className={styles.sectionHeader}>
              <CardTitle className={`${interBold.className} ${styles.sectionTitle}`}>Risk Indicators</CardTitle>
            </CardHeader>
            <CardContent className={styles.cardBody}>
              <div className={styles.riskList}>
                {data.riskFlags.map((flag) => (
                  <article key={`${flag.label}-${flag.detail}`} className={styles[`riskRow${flag.tone[0].toUpperCase()}${flag.tone.slice(1)}`]}>
                    <div className={styles.riskIcon}>
                      {flag.tone === "green" ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.1} /> : flag.tone === "orange" ? <AlertTriangle className="h-4 w-4" strokeWidth={2.1} /> : <XCircle className="h-4 w-4" strokeWidth={2.1} />}
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
    </main>
  );
}
