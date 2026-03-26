import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SUGGESTED_TAGS = ["Good Client", "High Value", "Difficult", "Slow Payer"] as const;

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

function getDaysSince(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

function computeRawScore(params: { projects: number; activeLeads: number; wonProjects: number }): number {
  return params.projects * 2 + params.activeLeads * 3 + params.wonProjects * 2;
}

function formatCurrencyNZD(value: number): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function computeRating(rawScore: number): number {
  if (rawScore <= 0) {
    return 0;
  }
  const scaled = 1 + rawScore * 0.5;
  return Math.min(5, Math.max(1, scaled));
}

function formatRating(value: number): string {
  return `⭐ ${value.toFixed(1)}`;
}

function recommendationForClient(params: { projects: number; activeLeads: number; lastActivityDays: number | null }) {
  const hasRepeatWork = params.projects >= 2;
  const activeRecently = params.lastActivityDays !== null && params.lastActivityDays <= 14;

  if (hasRepeatWork && (params.activeLeads > 0 || activeRecently)) {
    return {
      label: "High Priority",
      detail: "Repeat work + recent activity",
      className: "border-[#CDE7D3] bg-[#F1FBF5] text-[#1F5C2E]",
    };
  }

  if (params.activeLeads > 0 || params.projects > 0) {
    return {
      label: "Medium Priority",
      detail: "Active or historical work exists, but urgency is moderate.",
      className: "border-[#EEDDBE] bg-[#FFFAF0] text-[#8B4B08]",
    };
  }

  return {
    label: "Low Priority",
    detail: "No active leads and limited recent activity.",
    className: "border-[#D6E1EE] bg-[#F6F9FC] text-[#48607F]",
  };
}

function statusSignal(stage: string): { icon: string; label: string; className: string } {
  if (stage === "Won" || stage === "Completion") {
    return { icon: "✔", label: stage, className: "text-[#1F7A3F]" };
  }
  if (stage === "Pricing" || stage === "Construction") {
    return { icon: "🟡", label: stage, className: "text-[#A15B06]" };
  }
  if (stage === "Lost") {
    return { icon: "✖", label: stage, className: "text-[#B42318]" };
  }
  return { icon: "•", label: stage, className: "text-[#466387]" };
}

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const member = await getCurrentOrganizationMember();

  if (!member) {
    redirect("/app/leads-clients/clients");
  }

  const supabase = await createServerSupabaseClient();
  const [clientResult, projectsResult, opportunitiesResult, allClientsResult, allProjectsResult, allOpportunitiesResult, hiddenWorkspacesResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name, email, phone, tags, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("organization_projects")
      .select("id, name, slug, stage, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("organization_opportunities")
      .select("id, name, slug, stage, converted_project_id, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("organization_clients")
      .select("id, name")
      .eq("organization_id", member.organization_id),
    supabase
      .from("organization_projects")
      .select("id, client_id")
      .eq("organization_id", member.organization_id),
    supabase
      .from("organization_opportunities")
      .select("client_id, stage")
      .eq("organization_id", member.organization_id),
    supabase
      .from("organization_opportunities")
      .select("workspace_project_id")
      .eq("organization_id", member.organization_id)
      .not("workspace_project_id", "is", null),
  ]);

  if (
    clientResult.error ||
    projectsResult.error ||
    opportunitiesResult.error ||
    allClientsResult.error ||
    allProjectsResult.error ||
    allOpportunitiesResult.error ||
    hiddenWorkspacesResult.error
  ) {
    redirect("/app/leads-clients/clients");
  }

  const client = clientResult.data;
  if (!client) {
    notFound();
  }

  const hiddenWorkspaceProjectIds = new Set(
    (hiddenWorkspacesResult.data ?? [])
      .map((row) => row.workspace_project_id)
      .filter((value): value is string => Boolean(value))
  );

  const projects = (projectsResult.data ?? []).filter((row) => !hiddenWorkspaceProjectIds.has(row.id));
  const opportunities = opportunitiesResult.data ?? [];
  const recentProjects = projects.slice(0, 5);
  const recentOpportunities = opportunities.slice(0, 5);

  const opportunityIds = opportunities.map((item) => item.id);
  const convertedProjectIds = Array.from(
    new Set(
      opportunities
        .map((item) => item.converted_project_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [opportunityQuotesResult, projectQuotesResult] = await Promise.all([
    opportunityIds.length > 0
      ? supabase
          .from("opportunity_quotes")
          .select("id, opportunity_id, total_quote_price, updated_at")
          .eq("organization_id", member.organization_id)
          .in("opportunity_id", opportunityIds)
      : Promise.resolve({ data: [], error: null }),
    convertedProjectIds.length > 0
      ? supabase
          .from("project_quotes")
          .select("id, project_id, total_quote_price, updated_at")
          .eq("organization_id", member.organization_id)
          .in("project_id", convertedProjectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (opportunityQuotesResult.error || projectQuotesResult.error) {
    redirect("/app/leads-clients/clients");
  }

  const latestOpportunityQuoteByOpportunityId = new Map<string, number>();
  const latestOpportunityQuoteUpdatedAtByOpportunityId = new Map<string, number>();
  for (const quote of opportunityQuotesResult.data ?? []) {
    const updatedAt = new Date(quote.updated_at).getTime();
    const currentUpdatedAt = latestOpportunityQuoteUpdatedAtByOpportunityId.get(quote.opportunity_id) ?? -1;
    if (updatedAt > currentUpdatedAt) {
      latestOpportunityQuoteUpdatedAtByOpportunityId.set(quote.opportunity_id, updatedAt);
      latestOpportunityQuoteByOpportunityId.set(quote.opportunity_id, quote.total_quote_price ?? 0);
    }
  }

  const latestProjectQuoteByProjectId = new Map<string, number>();
  const latestProjectQuoteUpdatedAtByProjectId = new Map<string, number>();
  for (const quote of projectQuotesResult.data ?? []) {
    const updatedAt = new Date(quote.updated_at).getTime();
    const currentUpdatedAt = latestProjectQuoteUpdatedAtByProjectId.get(quote.project_id) ?? -1;
    if (updatedAt > currentUpdatedAt) {
      latestProjectQuoteUpdatedAtByProjectId.set(quote.project_id, updatedAt);
      latestProjectQuoteByProjectId.set(quote.project_id, quote.total_quote_price ?? 0);
    }
  }

  const activeLeads = opportunities.filter((item) => item.stage !== "Won" && item.stage !== "Lost").length;
  const wonProjects = opportunities.filter((item) => item.stage === "Won").length;
  const totalEstimatedValue = opportunities.reduce((sum, item) => {
    return sum + (latestOpportunityQuoteByOpportunityId.get(item.id) ?? 0);
  }, 0);
  const totalValueWon = opportunities
    .filter((item) => item.stage === "Won")
    .reduce((sum, item) => {
      if (item.converted_project_id) {
        return sum + (latestProjectQuoteByProjectId.get(item.converted_project_id) ?? latestOpportunityQuoteByOpportunityId.get(item.id) ?? 0);
      }
      return sum + (latestOpportunityQuoteByOpportunityId.get(item.id) ?? 0);
    }, 0);
  const rawScore = computeRawScore({ projects: projects.length, activeLeads, wonProjects });
  const rating = computeRating(rawScore);

  const latestProjectUpdatedAt = projects[0]?.updated_at ?? null;
  const latestOpportunityUpdatedAt = opportunities[0]?.updated_at ?? null;
  const lastActivityIso = latestOpportunityUpdatedAt ?? latestProjectUpdatedAt ?? client.updated_at ?? client.created_at;
  const lastActivityDays = getDaysSince(lastActivityIso);
  const recommendation = recommendationForClient({ projects: projects.length, activeLeads, lastActivityDays });

  const orgClients = allClientsResult.data ?? [];
  const orgProjects = (allProjectsResult.data ?? []).filter((row) => !hiddenWorkspaceProjectIds.has(row.id));
  const orgOpportunities = allOpportunitiesResult.data ?? [];

  const projectCountByClient = new Map<string, number>();
  for (const row of orgProjects) {
    if (!row.client_id) {
      continue;
    }
    projectCountByClient.set(row.client_id, (projectCountByClient.get(row.client_id) ?? 0) + 1);
  }

  const activeLeadsByClient = new Map<string, number>();
  const wonByClient = new Map<string, number>();
  for (const row of orgOpportunities) {
    if (!row.client_id) {
      continue;
    }
    if (row.stage !== "Won" && row.stage !== "Lost") {
      activeLeadsByClient.set(row.client_id, (activeLeadsByClient.get(row.client_id) ?? 0) + 1);
    }
    if (row.stage === "Won") {
      wonByClient.set(row.client_id, (wonByClient.get(row.client_id) ?? 0) + 1);
    }
  }

  const rankedClients = orgClients
    .map((row) => {
      const projectsCount = projectCountByClient.get(row.id) ?? 0;
      const activeCount = activeLeadsByClient.get(row.id) ?? 0;
      const wonCount = wonByClient.get(row.id) ?? 0;
      const raw = computeRawScore({ projects: projectsCount, activeLeads: activeCount, wonProjects: wonCount });
      return {
        id: row.id,
        name: row.name,
        raw,
        rating: computeRating(raw),
      };
    })
    .sort((left, right) => {
      if (right.rating !== left.rating) {
        return right.rating - left.rating;
      }
      if (right.raw !== left.raw) {
        return right.raw - left.raw;
      }
      return left.name.localeCompare(right.name);
    });

  const highestRatedClientId = rankedClients[0]?.id ?? null;
  const isHighestRatedClient = highestRatedClientId === client.id;
  const repeatWorkSignal = projects.length >= 2;
  const activeRecentlySignal = lastActivityDays !== null && lastActivityDays <= 14;

  return (
    <main className="space-y-3 pb-8">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className={`${interMedium.className} h-8 rounded-[8px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
      >
        <Link href="/app/leads-clients/clients">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Clients
        </Link>
      </Button>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{client.name}</CardTitle>
                <span className={`${interMedium.className} inline-flex items-center rounded-full border border-[#D7E4F4] bg-[#F3F8FF] px-2.5 py-1 text-xs font-semibold text-[#2F557E]`}>
                  {formatRating(rating)}
                </span>
                {(client.tags ?? [])[0] ? (
                  <span className={`${interMedium.className} inline-flex items-center rounded-full border border-[#D5E0EE] bg-[#F3F7FC] px-2.5 py-1 text-xs font-medium text-[#466387]`}>
                    {(client.tags ?? [])[0]}
                  </span>
                ) : null}
              </div>

              <p className={`${interMedium.className} text-xs font-medium ${repeatWorkSignal || activeRecentlySignal ? "text-[#23683A]" : "text-[#70859F]"}`}>
                {repeatWorkSignal ? "✔ High repeat work" : "• Building repeat work"} {" • "} {activeRecentlySignal ? "Active recently" : "No recent activity"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" asChild className="h-9 rounded-[10px] border-[#D6DFEB] px-3 text-sm">
                <Link href="/app/projects">View Projects</Link>
              </Button>
              <Button asChild className="h-9 rounded-[10px] bg-[#F74917] px-3 text-sm text-white hover:bg-[#e63f10]">
                <Link href={`/app/leads-clients/opportunities/new?clientId=${client.id}`}>Add Opportunity</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardContent className="grid gap-2 p-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricPill label="Active Leads" value={String(activeLeads)} />
          <MetricPill label="Projects" value={String(projects.length)} />
          <MetricPill label="Last Activity" value={formatRelativeTime(lastActivityIso)} />
          <MetricPill label="Client Rating" value={formatRating(rating)} />
        </CardContent>
      </Card>

      <Card className={`border ${recommendation.className} shadow-none`}>
        <CardContent className="p-3">
          <p className={`${interMedium.className} text-sm font-semibold`}>🟢 {recommendation.label} Client</p>
          <p className={`${interMedium.className} mt-0.5 text-sm font-medium`}>
            {projects.length} project{projects.length === 1 ? "" : "s"} completed {" • "} {isHighestRatedClient ? "Highest rated client" : recommendation.detail}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-2 pt-5">
            <CardTitle className="text-lg font-semibold tracking-[-0.02em] text-[#0F172A]">Recent Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {recentOpportunities.length > 0 ? (
                recentOpportunities.map((opportunity) => (
                  <Link
                    key={opportunity.id}
                    href={`/app/leads-clients/opportunities/${opportunity.slug}`}
                    className="block cursor-pointer rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2.5 transition-all hover:-translate-y-[1px] hover:bg-[#F3F8FF]"
                  >
                    <p className={`${interMedium.className} text-sm font-semibold text-[#1E2D43]`}>{opportunity.name}</p>
                    <p className={`${interMedium.className} mt-1 text-xs font-semibold ${statusSignal(opportunity.stage).className}`}>
                      {statusSignal(opportunity.stage).icon} {statusSignal(opportunity.stage).label} {" • "} <span className="font-medium text-[#5F7592]">{formatRelativeTime(opportunity.updated_at)}</span>
                    </p>
                  </Link>
                ))
              ) : (
                <p className={`${interMedium.className} text-sm font-medium text-[#8A9CB4]`}>No opportunities yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-2 pt-5">
            <CardTitle className="text-lg font-semibold tracking-[-0.02em] text-[#0F172A]">Recent Projects</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {recentProjects.length > 0 ? (
                recentProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/app/projects/${project.slug}/dashboard`}
                    className="block cursor-pointer rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2.5 transition-all hover:-translate-y-[1px] hover:bg-[#F3F8FF]"
                  >
                    <p className={`${interMedium.className} text-sm font-semibold text-[#1E2D43]`}>{project.name}</p>
                    <p className={`${interMedium.className} mt-1 text-xs font-semibold ${statusSignal(project.stage).className}`}>
                      {statusSignal(project.stage).icon} {statusSignal(project.stage).label} {" • "} <span className="font-medium text-[#5F7592]">{formatRelativeTime(project.updated_at)}</span>
                    </p>
                  </Link>
                ))
              ) : (
                <p className={`${interMedium.className} text-sm font-medium text-[#8A9CB4]`}>No projects yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-1 pt-4">
          <CardTitle className="text-base font-semibold tracking-[-0.01em] text-[#0F172A]">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-3 pt-0">
          <p className={`${interMedium.className} text-sm font-medium text-[#6B809B]`}>
            Contact: {client.email || "No email"} {" • "} {client.phone || "No phone"}
          </p>
          <p className={`${interMedium.className} text-sm font-medium text-[#6B809B]`}>
            Total Estimated Value: <span className="font-semibold text-[#2A4462]">{formatCurrencyNZD(totalEstimatedValue)}</span> {" • "}
            Total Value Won: <span className="font-semibold text-[#2A4462]">{formatCurrencyNZD(totalValueWon)}</span>
          </p>
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-2 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg font-semibold tracking-[-0.02em] text-[#0F172A]">Tags</CardTitle>
            <Button variant="outline" asChild className="h-8 rounded-[9px] border-[#D6DFEB] px-3 text-xs">
              <Link href={`/app/leads-clients/clients/${client.id}/edit`}>+ Add Tag</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div className="flex flex-wrap gap-2">
            {(client.tags ?? []).length > 0 ? (
              (client.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className={`${interMedium.className} inline-flex items-center rounded-full border border-[#D5E0EE] bg-[#F3F7FC] px-2.5 py-1 text-xs font-medium text-[#466387]`}
                >
                  {tag}
                </span>
              ))
            ) : (
              <p className={`${interMedium.className} text-sm font-medium text-[#8A9CB4]`}>No tags yet. Add one to classify this client.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_TAGS.filter((tag) => !(client.tags ?? []).includes(tag)).map((tag) => (
              <span
                key={tag}
                className={`${interMedium.className} inline-flex items-center rounded-full border border-dashed border-[#CAD8EA] bg-[#FBFCFE] px-2.5 py-1 text-xs font-medium text-[#6A809C]`}
              >
                {tag}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2.5">
      <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.1em] text-[#667C97]`}>{label}</p>
      <p className={`${interMedium.className} mt-1 text-sm font-semibold text-[#1E2D43]`}>{value}</p>
    </div>
  );
}
