import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium, ibmPlexSans } from "@/lib/fonts";
import { ClientDetailHeader } from "../ClientDetailHeader";
import { formatDateTime, getClientTimelineTabData } from "../client-detail-data";
import styles from "../client-detail.module.css";

export default async function ClientTimelinePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const data = await getClientTimelineTabData(clientId);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.scope} space-y-6 pb-8`}>
      <ClientDetailHeader client={data.client} clientId={clientId} activeTab="timeline" isActive={data.jobsInProgress > 0 || data.activeOpportunities.length > 0} />
      <section className={styles.activitySection}>
        <Card className={`${styles.card} ${styles.timelineCard}`}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent className={styles.cardBody}>
            {data.timelineRows.length === 0 ? <p className={`${interMedium.className} ${styles.emptyState}`}>No activity yet for this client.</p> : <div className={styles.timelineList}>{data.timelineRows.map((item) => <article key={item.id} className={styles.timelineRow}><div className={styles.timelineDot} /><div className={styles.timelineText}><p className={styles.timelineTitle}>{item.title}</p><p className={`${interMedium.className} ${styles.timelineMeta}`}>{item.detail}</p><p className={`${interMedium.className} ${styles.timelineTime}`}>{formatDateTime(item.at)}</p>{item.href ? <Link className={styles.inlineLink} href={item.href}>Open</Link> : null}</div></article>)}</div>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
