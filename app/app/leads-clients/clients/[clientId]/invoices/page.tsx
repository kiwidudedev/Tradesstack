import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium, ibmPlexSans } from "@/lib/fonts";
import { ClientDetailHeader } from "../ClientDetailHeader";
import { formatDate, getClientDetailData, toMoney, toNumeric } from "../client-detail-data";
import styles from "../client-detail.module.css";

export default async function ClientInvoicesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const data = await getClientDetailData(clientId);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.scope} space-y-6 pb-8`}>
      <ClientDetailHeader client={data.client} clientId={clientId} activeTab="invoices" isActive={data.jobsInProgress > 0 || data.activeOpportunities.length > 0} />
      <section className={styles.activitySection}>
        <Card className={styles.card}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Invoices</CardTitle>
          </CardHeader>
          <CardContent className={styles.cardBody}>
            {data.recentClaims.length === 0 ? <p className={`${interMedium.className} ${styles.emptyState}`}>No invoice or claim records yet.</p> : <div className={styles.tableList}>{data.recentClaims.map((claim) => { const balance = Math.max(0, toNumeric(claim.claim_amount) - toNumeric(claim.paid_amount)); const project = data.projectById.get(claim.project_id); return <article key={claim.id} className={styles.tableRow}><div><p className={styles.tableTitle}>{claim.claim_number} · {claim.claim_title}</p><p className={`${interMedium.className} ${styles.tableMeta}`}>{claim.status || "Draft"} · Due {formatDate(claim.due_date)} · Balance {toMoney(balance)}</p></div>{project ? <Link href={`/app/projects/${project.slug}/preconstruction/claims/${claim.id}`} className={styles.inlineLink}>Open</Link> : null}</article>; })}</div>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
