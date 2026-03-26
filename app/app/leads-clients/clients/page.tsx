import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CLIENT_TAGS = ["Good Client", "High Value", "Difficult", "Slow Payer"] as const;

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "No recent activity";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "No recent activity";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) {
    return "Just now";
  }

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function formatRating(value: number): string {
  return `⭐ ${value.toFixed(1)}`;
}

function clampRating(value: number): number {
  if (value < 1) {
    return 1;
  }
  if (value > 5) {
    return 5;
  }
  return value;
}

function normalizeClientTags(value: string[] | null): string[] {
  const supported = new Set(CLIENT_TAGS);
  return (value ?? []).filter((tag): tag is (typeof CLIENT_TAGS)[number] => supported.has(tag as (typeof CLIENT_TAGS)[number]));
}

export default async function LeadsClientsClientsPage() {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return (
      <main className="space-y-8 pb-8">
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-4 pt-7">
            <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>Sign in to view organization clients.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [clientsResult, projectsResult, opportunitiesResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name, email, phone, tags, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("organization_projects")
      .select("id, client_id, updated_at")
      .eq("organization_id", member.organization_id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("organization_opportunities")
      .select("id, client_id, stage, updated_at")
      .eq("organization_id", member.organization_id)
      .order("updated_at", { ascending: false }),
  ]);

  if (clientsResult.error || projectsResult.error || opportunitiesResult.error) {
    return (
      <main className="space-y-6 pb-8">
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-4 pt-7">
            <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>Could not load client data right now. Please refresh.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const clients = clientsResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const opportunities = opportunitiesResult.data ?? [];

  const projectCountByClientId = new Map<string, number>();
  const latestProjectActivityByClientId = new Map<string, string>();
  for (const project of projects) {
    if (!project.client_id) {
      continue;
    }
    projectCountByClientId.set(project.client_id, (projectCountByClientId.get(project.client_id) ?? 0) + 1);
    if (!latestProjectActivityByClientId.has(project.client_id)) {
      latestProjectActivityByClientId.set(project.client_id, project.updated_at);
    }
  }

  const activeLeadCountByClientId = new Map<string, number>();
  const wonLeadCountByClientId = new Map<string, number>();
  const latestLeadActivityByClientId = new Map<string, string>();
  for (const opportunity of opportunities) {
    if (!opportunity.client_id) {
      continue;
    }

    if (!latestLeadActivityByClientId.has(opportunity.client_id)) {
      latestLeadActivityByClientId.set(opportunity.client_id, opportunity.updated_at);
    }

    const isActiveLead = opportunity.stage !== "Won" && opportunity.stage !== "Lost";
    if (isActiveLead) {
      activeLeadCountByClientId.set(opportunity.client_id, (activeLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);
    }

    if (opportunity.stage === "Won") {
      wonLeadCountByClientId.set(opportunity.client_id, (wonLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);
    }
  }

  const rowsWithRawScore = clients.map((client) => {
    const projectsCount = projectCountByClientId.get(client.id) ?? 0;
    const activeLeads = activeLeadCountByClientId.get(client.id) ?? 0;
    const wonProjects = wonLeadCountByClientId.get(client.id) ?? 0;
    const rawScore = projectsCount * 2 + activeLeads * 3 + wonProjects * 2;
    const lastActivityIso =
      latestLeadActivityByClientId.get(client.id) ??
      latestProjectActivityByClientId.get(client.id) ??
      client.updated_at ??
      client.created_at;

    return {
      ...client,
      activeLeads,
      projectsCount,
      wonProjects,
      rawScore,
      tags: normalizeClientTags(client.tags),
      lastActivityIso,
    };
  });

  const maxRawScore = rowsWithRawScore.reduce((max, row) => Math.max(max, row.rawScore), 0);
  const rows = rowsWithRawScore
    .map((row) => {
      const rating = maxRawScore === 0 ? 0 : clampRating(1 + (row.rawScore / maxRawScore) * 4);
      return {
        ...row,
        rating,
      };
    })
    .sort((left, right) => {
      if (right.rating !== left.rating) {
        return right.rating - left.rating;
      }
      if (right.rawScore !== left.rawScore) {
        return right.rawScore - left.rawScore;
      }
      return left.name.localeCompare(right.name);
    });

  const summary = {
    totalClients: clients.length,
  };

  const topClients = rows.slice(0, 3);
  const mostWorkedWith = rows.reduce<{ name: string; projectsCount: number } | null>((best, row) => {
    if (!best || row.projectsCount > best.projectsCount) {
      return { name: row.name, projectsCount: row.projectsCount };
    }
    return best;
  }, null);

  return (
    <main className="space-y-4 pb-8">
      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-3 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Client Summary</CardTitle>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#5F7390]`}>
                Total Clients: <span className="font-semibold text-[#253047]">{summary.totalClients}</span>
              </p>
            </div>
            <Button asChild className="h-10 rounded-[10px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]">
              <Link href="/app/leads-clients/clients/new">+ Add Client</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {topClients.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-3">
              {topClients.map((client, index) => (
                <div key={client.id} className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-3.5 py-3">
                  <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#6B7F99]`}>{index + 1}. Client Rank</p>
                  <p className={`${interMedium.className} mt-1 text-sm font-semibold text-[#1D2B40]`}>{client.name}</p>
                  <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#385777]`}>{formatRating(client.rating)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className={`${interMedium.className} text-sm font-medium text-[#7A8EA8]`}>No client rankings yet.</p>
          )}

          <p className={`${interMedium.className} text-sm font-medium text-[#5C728E]`}>
            {mostWorkedWith && mostWorkedWith.projectsCount > 0
              ? `You've worked most with ${mostWorkedWith.name} (${mostWorkedWith.projectsCount} project${mostWorkedWith.projectsCount === 1 ? "" : "s"}).`
              : "Add projects and active leads to start building client priority insights."}
          </p>
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardContent className="p-4">
          <div className="overflow-x-auto rounded-[10px] border border-[#E6EAF0]">
            <table className="min-w-full border-collapse">
              <thead className="bg-white">
                <tr className={`${interMedium.className} text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[#566B86]`}>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5 text-center">Rating</th>
                  <th className="px-3 py-2.5 text-center">Active Leads</th>
                  <th className="px-3 py-2.5 text-center">Projects</th>
                  <th className="px-3 py-2.5">Tags</th>
                  <th className="px-3 py-2.5 text-right">Last Activity</th>
                  <th className="w-[210px] px-3 py-2.5 text-right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((client) => (
                  <tr key={client.id} className="group border-t border-[#E9EEF4] bg-white transition-colors hover:bg-[#F8FBFF]">
                    <td className="px-3 py-3">
                      <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{client.name}</p>
                      <p className={`${interMedium.className} mt-0.5 text-xs font-medium text-[#6C809B]`}>{client.email || client.phone || "No contact details"}</p>
                    </td>
                    <td className={`${interMedium.className} px-3 py-3 text-sm font-medium text-[#2D3D55]`}>
                      {client.company_name || "\u2014"}
                    </td>
                    <td className={`${interMedium.className} px-3 py-3 text-center text-sm font-semibold text-[#304763]`}>
                      {formatRating(client.rating)}
                    </td>
                    <td className={`${interMedium.className} px-3 py-3 text-center text-sm font-semibold text-[#304763]`}>
                      {client.activeLeads}
                    </td>
                    <td className={`${interMedium.className} px-3 py-3 text-center text-sm font-semibold text-[#304763]`}>
                      {client.projectsCount}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {client.tags.length > 0 ? (
                          client.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`${interMedium.className} inline-flex items-center rounded-full border border-[#D5E0EE] bg-[#F3F7FC] px-2.5 py-1 text-xs font-medium text-[#466387]`}
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className={`${interMedium.className} text-xs font-medium text-[#8A9CB4]`}>No tags</span>
                        )}
                      </div>
                    </td>
                    <td className={`${interMedium.className} px-3 py-3 text-right text-sm font-medium text-[#4A607D]`}>
                      {formatRelativeTime(client.lastActivityIso)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <Button variant="ghost" asChild className="h-8 rounded-[8px] px-2.5 text-xs text-[#3B4F69] hover:bg-[#EFF5FC]">
                          <Link href={`/app/leads-clients/clients/${client.id}`}>View</Link>
                        </Button>
                        <Button variant="ghost" asChild className="h-8 rounded-[8px] px-2.5 text-xs text-[#3B4F69] hover:bg-[#EFF5FC]">
                          <Link href={`/app/leads-clients/clients/${client.id}/edit`}>Edit</Link>
                        </Button>
                        <Button variant="ghost" asChild className="h-8 rounded-[8px] px-2.5 text-xs text-[#3B4F69] hover:bg-[#EFF5FC]">
                          <Link href={`/app/leads-clients/opportunities/new?clientId=${client.id}`}>Add Lead</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr className="border-t border-[#E9EEF4] bg-white">
                    <td colSpan={8} className={`${interMedium.className} px-4 py-4 text-sm font-medium text-[#8A97AB]`}>
                      No clients yet. Add your first client to start tracking leads and projects.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
