import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { interMedium, ibmPlexSans } from "@/lib/fonts";
import { ClientDetailHeader } from "../ClientDetailHeader";
import { formatDate, getClientQuotesTabData, getQuoteStatusTone, quoteHref, toMoney, toNumeric } from "../client-detail-data";
import styles from "../client-detail.module.css";

export default async function ClientQuotesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const data = await getClientQuotesTabData(clientId);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.scope} space-y-6 pb-8`}>
      <ClientDetailHeader client={data.client} clientId={clientId} activeTab="quotes" isActive={data.jobsInProgress > 0 || data.activeOpportunities.length > 0} />
      <section className={styles.activitySection}>
        <Card className={`${styles.card} ${styles.quoteTableCard}`}>
          <CardContent className={styles.quoteTableBody}>
            {data.recentQuotes.length === 0 ? (
              <p className={`${interMedium.className} ${styles.emptyState} p-6`}>No quotes linked to this client yet.</p>
            ) : (
              <div className={styles.quoteTable}>
                <div className={styles.quoteTableHead}>
                  <p className={styles.quoteTableHeading}>Quote Reference</p>
                  <p className={styles.quoteTableHeading}>Value</p>
                  <p className={styles.quoteTableHeading}>Status</p>
                  <p className={styles.quoteTableHeading}>Date</p>
                </div>
                {data.recentQuotes.map((quote) => {
                  const href = quoteHref(quote, data.projectById, data.opportunityById);
                  const statusTone = getQuoteStatusTone(quote.status);
                  return (
                    <div key={quote.id} className={styles.quoteTableRow}>
                      <div className={styles.quotePrimaryCell}>
                        {href ? <Link href={href} className={styles.quotePrimaryLink}>{quote.quote_number} · {quote.quote_title}</Link> : <p className={styles.quotePrimaryText}>{quote.quote_number} · {quote.quote_title}</p>}
                      </div>
                      <p className={styles.quoteValueCell}>{toMoney(toNumeric(quote.total_quote_price))}</p>
                      <div><span className={styles[`quoteStatus${statusTone[0].toUpperCase()}${statusTone.slice(1)}`]}>{quote.status}</span></div>
                      <p className={styles.quoteDateCell}>{formatDate(quote.updated_at || quote.created_at)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
