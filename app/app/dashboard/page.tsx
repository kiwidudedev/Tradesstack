import { ActivityCard } from "@/components/app/ActivityCard";
import { EditableProjectGrid } from "@/components/app/EditableProjectGrid";
import {
  getTradePackWorkspaceRecentActivityForCurrentUser,
  getTradePackWorkspacesForCurrentUser,
} from "@/lib/trade-pack-workspaces-server";

export default async function DashboardPage() {
  const [projects, recentActivity] = await Promise.all([
    getTradePackWorkspacesForCurrentUser(),
    getTradePackWorkspaceRecentActivityForCurrentUser(),
  ]);

  return (
    <main className="space-y-8 pb-8">
      <section>
        <EditableProjectGrid initialProjects={projects} />
      </section>

      <section>
        <ActivityCard items={recentActivity} />
      </section>
    </main>
  );
}
