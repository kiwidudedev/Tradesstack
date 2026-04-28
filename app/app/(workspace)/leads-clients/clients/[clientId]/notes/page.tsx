import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { ibmPlexSans } from "@/lib/fonts";
import { ClientDetailHeader } from "../ClientDetailHeader";
import { getClientNotesTabData } from "../client-detail-data";
import styles from "../client-detail.module.css";
import { NotesBoard } from "./NotesBoard";

export default async function ClientNotesPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const data = await getClientNotesTabData(clientId);
  const member = await getCurrentOrganizationMember();

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} ${styles.scope} space-y-6 pb-8`}>
      <ClientDetailHeader client={data.client} clientId={clientId} activeTab="notes" isActive={data.jobsInProgress > 0 || data.activeOpportunities.length > 0} />
      <NotesBoard
        clientId={clientId}
        currentAuthorName={member?.display_name?.trim() || "Team member"}
        notes={data.noteEntries}
      />
    </main>
  );
}
