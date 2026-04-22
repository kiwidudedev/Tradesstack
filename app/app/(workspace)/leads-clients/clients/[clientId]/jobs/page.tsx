import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium, ibmPlexSans } from "@/lib/fonts";
import { ClientDetailHeader } from "../ClientDetailHeader";
import { formatDate, getClientDetailData } from "../client-detail-data";
import styles from "../client-detail.module.css";

export default async function ClientJobsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const data = await getClientDetailData(clientId);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.scope} space-y-6 pb-8`}>
      <ClientDetailHeader client={data.client} clientId={clientId} activeTab="jobs" isActive={data.jobsInProgress > 0 || data.activeOpportunities.length > 0} />
      <section className={styles.activitySection}>
        <Card className={styles.card}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Jobs</CardTitle>
          </CardHeader>
          <CardContent className={styles.cardBody}>
            {data.projects.length === 0 ? <p className={`${interMedium.className} ${styles.emptyState}`}>No jobs linked to this client yet.</p> : <div className={styles.tableList}>{data.projects.map((project) => <article key={project.id} className={styles.tableRow}><div><p className={styles.tableTitle}>{project.name}</p><p className={`${interMedium.className} ${styles.tableMeta}`}>{project.stage} · Updated {formatDate(project.updated_at)}</p></div><Link href={`/app/projects/${project.slug}/dashboard`} className={styles.inlineLink}>Open</Link></article>)}</div>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
