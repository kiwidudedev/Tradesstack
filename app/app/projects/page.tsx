import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  getTradePackWorkspaceQuotaForCurrentUser,
  getTradePackWorkspacesForCurrentUser,
} from "@/lib/trade-pack-workspaces-server";

export default async function ProjectSpacePage() {
  const [projects, member] = await Promise.all([
    getTradePackWorkspacesForCurrentUser(),
    getCurrentOrganizationMember(),
  ]);
  const quota = member ? await getTradePackWorkspaceQuotaForCurrentUser(member.organization_id) : null;

  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Trade Pack Workspaces</CardTitle>
              {quota ? (
                <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#5f6f89]`}>
                  This month: {quota.createdCount}/{quota.monthlyLimit} trade pack workspaces created ({quota.remaining} remaining)
                </p>
              ) : null}
            </div>
            <Button className="h-10 rounded-[10px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]" asChild>
              <Link href="/app/trade-packs/new">Create Trade Pack Workspace</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 pb-8 md:grid-cols-2 xl:grid-cols-3">
          {projects.length > 0 ? (
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/app/projects/${project.slug}/dashboard`}
                className="rounded-[12px] border border-[#E6EAF0] bg-white px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)]"
              >
                <p className={`${interMedium.className} text-lg font-semibold tracking-[-0.01em] text-[#0F172A]`}>{project.name}</p>
                <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#64748B]`}>{project.location}</p>
              </Link>
            ))
          ) : (
            <div className="md:col-span-2 xl:col-span-3">
              <div className="rounded-[12px] border border-dashed border-[#c8cfdd] bg-white px-5 py-6">
                <p className={`${interMedium.className} text-base font-medium text-[#2d3445]`}>No trade pack workspaces yet.</p>
                <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#687996]`}>
                  Create your first trade pack workspace to enable Trade Pack Builder, Scope Builder, Change
                  Detection, and AI Chatbot.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
