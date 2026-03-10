import { ActivityCard } from "@/components/app/ActivityCard";
import { EditableProjectGrid } from "@/components/app/EditableProjectGrid";
import { getOrganizationProjectsForCurrentUser, getRecentActivityForCurrentUser } from "@/lib/projects-server";

export default async function DashboardPage() {
  const [projects, recentActivity] = await Promise.all([
    getOrganizationProjectsForCurrentUser(),
    getRecentActivityForCurrentUser(),
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
