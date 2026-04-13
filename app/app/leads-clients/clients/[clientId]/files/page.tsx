import Link from "next/link";
import { FileDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { interMedium, ibmPlexSans } from "@/lib/fonts";
import { ClientDetailHeader } from "../ClientDetailHeader";
import { formatDate, getClientDetailData } from "../client-detail-data";
import styles from "../client-detail.module.css";

function formatFileSize(value: number | null): string {
  if (!value || value <= 0) {
    return "-";
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

export default async function ClientFilesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const data = await getClientDetailData(clientId);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.scope} space-y-6 pb-8`}>
      <ClientDetailHeader client={data.client} clientId={clientId} activeTab="files" isActive={data.jobsInProgress > 0 || data.activeOpportunities.length > 0} />
      <section className={styles.activitySection}>
        <Card className={`${styles.card} ${styles.fileTableCard}`}>
          <CardContent className={styles.fileTableBody}>
            {data.drawingSets.length === 0 ? (
              <p className={`${interMedium.className} ${styles.emptyState} p-6`}>No files linked yet.</p>
            ) : (
              <div className={styles.fileTable}>
                <div className={styles.fileTableHead}>
                  <p className={styles.fileTableHeading}>File Name</p>
                  <p className={styles.fileTableHeading}>Size</p>
                  <p className={styles.fileTableHeading}>Date</p>
                  <p className={styles.fileTableHeading}>Actions</p>
                </div>
                {data.drawingSets.map((file) => (
                  <div key={file.id} className={styles.fileTableRow}>
                    <div className={styles.fileNameCell}>
                      <FileDown className="h-5 w-5 text-[#8AA0BD]" strokeWidth={2} />
                      <p className={styles.fileNameText}>{file.file_name}</p>
                    </div>
                    <p className={styles.fileMetaText}>{formatFileSize(file.file_size_bytes)}</p>
                    <p className={styles.fileMetaText}>{formatDate(file.created_at)}</p>
                    <div>
                      {file.download_url ? (
                        <Link href={file.download_url} className={styles.fileActionLink} target="_blank">
                          Download
                        </Link>
                      ) : (
                        <span className={styles.fileActionMuted}>Unavailable</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
