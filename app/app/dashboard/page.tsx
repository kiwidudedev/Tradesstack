import { ActivityCard } from "@/components/app/ActivityCard";
import { EditableProjectGrid } from "@/components/app/EditableProjectGrid";
import { TodaysTodosCard } from "@/components/app/TodaysTodosCard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getLiveOpportunitiesForCurrentUser } from "@/lib/leads-clients-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  getTradePackWorkspaceRecentActivityForCurrentUser,
  getTradePackWorkspacesForCurrentUser,
} from "@/lib/trade-pack-workspaces-server";

function toFirstName(value: string | null): string {
  if (!value) {
    return "User";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "User";
  }

  return trimmed.split(/\s+/)[0] ?? "User";
}

function formatDayMonth(value: string | null): string {
  if (!value) {
    return "No due date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short" }).format(date);
}

function getDaysUntilIso(isoDate: string | null): number | null {
  if (!isoDate) {
    return null;
  }

  const due = new Date(isoDate);
  if (Number.isNaN(due.getTime())) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.ceil((dueMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDueMeta(isoDate: string | null) {
  const diffDays = getDaysUntilIso(isoDate);
  if (diffDays === null) {
    return { text: "No due date", className: "text-[#8A97AB]" };
  }

  if (diffDays < 0) {
    return { text: "🔴 Overdue", className: "text-[#B91C1C]" };
  }

  if (diffDays === 0) {
    return { text: "⚠ Due today", className: "text-[#D97706]" };
  }

  if (diffDays === 1) {
    return { text: "⚠ Due tomorrow", className: "text-[#D97706]" };
  }

  return {
    text: `Due in ${diffDays} days`,
    className: diffDays <= 3 ? "text-[#D97706]" : "text-[#6F839E]",
  };
}

function DueDateCell({ isoDate }: { isoDate: string | null }) {
  const dueMeta = getDueMeta(isoDate);

  return (
    <div className="text-right">
      <p className={`${interMedium.className} text-sm font-semibold text-[#1F2B3D]`}>{formatDayMonth(isoDate)}</p>
      <p className={`${interMedium.className} text-[10px] font-medium ${dueMeta.className}`}>{dueMeta.text}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const [projects, recentActivity, member, opportunities] = await Promise.all([
    getTradePackWorkspacesForCurrentUser(),
    getTradePackWorkspaceRecentActivityForCurrentUser(),
    getCurrentOrganizationMember(),
    getLiveOpportunitiesForCurrentUser(),
  ]);

  if (projects.length === 0) {
    redirect("/app/projects/new");
  }

  const firstName = toFirstName(member?.display_name ?? null);
  const upcomingLeadOpportunities = opportunities
    .filter((row) => row.group === "pipeline")
    .sort((left, right) => {
      const leftDays = getDaysUntilIso(left.dueDateIso);
      const rightDays = getDaysUntilIso(right.dueDateIso);
      if (leftDays === null && rightDays === null) {
        return left.name.localeCompare(right.name);
      }
      if (leftDays === null) {
        return 1;
      }
      if (rightDays === null) {
        return -1;
      }
      if (leftDays !== rightDays) {
        return leftDays - rightDays;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, 5);

  return (
    <main className="space-y-8 pb-8">
      <section>
        <EditableProjectGrid initialProjects={projects} />
      </section>

      <section className="-mt-6">
        <h2 className="mb-4 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Upcoming Lead Opportunities</h2>
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-3 pt-5">
            <div className="flex items-center justify-between gap-3">
              <p className={`${interMedium.className} text-sm font-medium text-[#5F7390]`}>
                <span className="font-semibold text-[#253047]">{upcomingLeadOpportunities.length}</span> upcoming tenders
              </p>
              <Link
                href="/app/leads-clients/opportunities"
                className={`${interMedium.className} text-sm font-semibold text-[#31507A] transition-colors hover:text-[#0F172A]`}
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto rounded-[10px] border border-[#E6EAF0]">
              <table className="min-w-full border-collapse">
                <thead className="bg-white">
                  <tr className={`${interMedium.className} text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[#566B86]`}>
                    <th className="px-3 py-1.5">Opportunity</th>
                    <th className="px-3 py-1.5 text-right">Company</th>
                    <th className="px-3 py-1.5 text-right">Due</th>
                    <th className="px-3 py-1.5 text-right">Estimator</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingLeadOpportunities.map((row) => (
                    <tr key={row.opportunityId} className="cursor-pointer border-t border-[#E9EEF4] bg-white transition-colors hover:bg-[#EEF4FB]">
                      <td className="p-0">
                        <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="block w-full px-3 py-[3px]">
                          <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{row.name}</p>
                          <p className={`${interMedium.className} mt-0 text-[10px] font-normal text-[#97A6BB]`}>{row.location}</p>
                        </Link>
                      </td>
                      <td className="p-0 text-right">
                        <Link
                          href={`/app/leads-clients/opportunities/${row.slug}`}
                          className={`${interMedium.className} block w-full px-3 py-[3px] text-sm font-medium text-[#2D3D55]`}
                        >
                          {row.clientName}
                        </Link>
                      </td>
                      <td className="p-0 text-right">
                        <Link href={`/app/leads-clients/opportunities/${row.slug}`} className="block w-full px-3 py-[3px] text-right">
                          <DueDateCell isoDate={row.dueDateIso} />
                        </Link>
                      </td>
                      <td className="p-0 text-right">
                        <Link
                          href={`/app/leads-clients/opportunities/${row.slug}`}
                          className={`${interMedium.className} block w-full px-3 py-[3px] text-sm font-medium text-[#2D3D55]`}
                        >
                          {row.ownerName}
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {upcomingLeadOpportunities.length === 0 ? (
                    <tr className="border-t border-[#E9EEF4] bg-white">
                      <td colSpan={4} className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#8A97AB]`}>
                        No upcoming opportunities right now.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <TodaysTodosCard userName={firstName} />
      </section>

      <section>
        <ActivityCard items={recentActivity} />
      </section>
    </main>
  );
}
