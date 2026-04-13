import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium, ibmPlexSans } from "@/lib/fonts";
import { ClientDetailHeader } from "../ClientDetailHeader";
import { formatDateTime, getClientDetailData } from "../client-detail-data";
import styles from "../client-detail.module.css";

export default async function ClientNotesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const data = await getClientDetailData(clientId);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.scope} space-y-6 pb-8`}>
      <ClientDetailHeader client={data.client} clientId={clientId} activeTab="notes" isActive={data.jobsInProgress > 0 || data.activeOpportunities.length > 0} />
      <section className={styles.activitySection}>
        <Card className={styles.card}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Add a note</CardTitle>
          </CardHeader>
          <CardContent className={styles.cardBody}>
            <div className={styles.noteComposer}>
              <textarea
                className={`${interMedium.className} ${styles.noteComposerInput}`}
                placeholder="Type your note here..."
                readOnly
              />
              <button type="button" className={`${ibmPlexSans.className} ${styles.noteComposerButton}`} disabled>
                Save Note
              </button>
              <p className={`${interMedium.className} ${styles.noteComposerHint}`}>
                Client notes are currently shown from linked opportunity notes.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.card}>
          <CardHeader className={styles.sectionHeader}>
            <CardTitle className={styles.sectionTitle}>Recent Notes</CardTitle>
          </CardHeader>
          <CardContent className={styles.cardBody}>
            {data.noteEntries.length === 0 ? (
              <p className={`${interMedium.className} ${styles.emptyState}`}>No notes logged yet.</p>
            ) : (
              <div className={styles.notesFeed}>
                {data.noteEntries.map((note) => (
                  <Link key={note.id} href={note.href} className={styles.notesFeedItem}>
                    <p className={styles.notesFeedBody}>{note.body}</p>
                    <p className={`${interMedium.className} ${styles.notesFeedMeta}`}>Added from {note.title} · {formatDateTime(note.at)}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
