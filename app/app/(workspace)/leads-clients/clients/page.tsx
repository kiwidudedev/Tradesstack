import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Award, DollarSign, TrendingUp, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { requirePermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AddClientDialog } from "./AddClientDialog";
import { CopyableClientContact } from "./CopyableClientContact";
const TOP_CLIENT_PERIOD_OPTIONS = [
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "12m", label: "12M" },
  { key: "all", label: "All" },
] as const;
type TopClientPeriodKey = (typeof TOP_CLIENT_PERIOD_OPTIONS)[number]["key"];

type ClaimFinanceRow = {
  project_id: string | null;
  status: string | null;
  due_date: string | null;
  claim_amount: number | null;
  paid_amount: number | null;
};

function getClientDisplayName(client: { company_name: string | null; name: string }): string {
  return client.company_name?.trim() || "Unknown Company";
}

function getTopClientPeriodCutoff(period: TopClientPeriodKey, now: Date): Date | null {
  if (period === "all") {
    return null;
  }
  const cutoff = new Date(now);
  if (period === "12m") {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    return cutoff;
  }
  if (period === "90d") {
    cutoff.setDate(cutoff.getDate() - 90);
    return cutoff;
  }
  cutoff.setDate(cutoff.getDate() - 30);
  return cutoff;
}

function isOnOrAfterCutoff(value: string | null, cutoff: Date | null): boolean {
  if (cutoff === null) {
    return true;
  }
  if (!value) {
    return false;
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return timestamp >= cutoff.getTime();
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

type LeadsClientsClientsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsClientsClientsPage({ searchParams }: LeadsClientsClientsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const topClientPeriodParam = resolvedSearchParams.topClientPeriod;
  const topClientPeriodRaw = Array.isArray(topClientPeriodParam) ? topClientPeriodParam[0] : topClientPeriodParam;
  const clientSearchParam = resolvedSearchParams.clientSearch;
  const clientSearchRaw = Array.isArray(clientSearchParam) ? clientSearchParam[0] : clientSearchParam;
  const clientSearch = (clientSearchRaw ?? "").trim();
  const statusFilterRaw = resolvedSearchParams.statusFilter;
  const statusFilter = (Array.isArray(statusFilterRaw) ? statusFilterRaw[0] : statusFilterRaw) ?? "all";
  const topClientPeriod = TOP_CLIENT_PERIOD_OPTIONS.some((option) => option.key === topClientPeriodRaw)
    ? (topClientPeriodRaw as TopClientPeriodKey)
    : "12m";
  const topClientPeriodCutoff = getTopClientPeriodCutoff(topClientPeriod, new Date());
  const buildClientsHref = (nextTopClientPeriod: TopClientPeriodKey): string => {
    const params = new URLSearchParams();
    if (nextTopClientPeriod !== "12m") {
      params.set("topClientPeriod", nextTopClientPeriod);
    }
    if (statusFilter !== "all") params.set("statusFilter", statusFilter);
    const query = params.toString();
    return query ? `/app/leads-clients/clients?${query}` : "/app/leads-clients/clients";
  };
  const buildStatusHref = (nextStatusFilter: string): string => {
    const params = new URLSearchParams();
    if (topClientPeriod !== "12m") params.set("topClientPeriod", topClientPeriod);
    if (nextStatusFilter !== "all") params.set("statusFilter", nextStatusFilter);
    if (clientSearch) params.set("clientSearch", clientSearch);
    const query = params.toString();
    return query ? `/app/leads-clients/clients?${query}` : "/app/leads-clients/clients";
  };

  const member = await getCurrentOrganizationMember();

  async function createClient(formData: FormData) {
    "use server";

    const currentMember = await getCurrentOrganizationMember();
    if (!currentMember) {
      redirect("/app/leads-clients/clients");
    }

    await requirePermission("leads.clients.write", "/app/leads-clients/clients");

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/app/leads-clients/clients");
    }

    const companyName = String(formData.get("companyName") ?? "").trim();
    const contactName = String(formData.get("contactName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    const tags = formData
      .getAll("profileTags")
      .map((value) => String(value))
      .filter(Boolean);

    if (!companyName || !contactName) {
      redirect("/app/leads-clients/clients");
    }

    const { error } = await supabase.from("organization_clients").insert({
      organization_id: currentMember.organization_id,
      created_by: user.id,
      name: contactName,
      company_name: companyName,
      email: email || null,
      phone: phone || null,
      tags,
    });

    if (error) {
      redirect("/app/leads-clients/clients");
    }

    revalidatePath("/app/leads-clients/clients");
    redirect("/app/leads-clients/clients");
  }

  if (!member) {
    return (
      <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
        <Card className="overflow-hidden rounded-[32px] border-none bg-[var(--app-surface)] shadow-none">
          <CardContent className="px-6 py-6">
            <p className={`${interMedium.className} text-[15px] text-[#6b6b6b]`}>Sign in to view organization clients.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [clientsResult, projectsResult, opportunitiesResult, claimsResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name, email, phone")
      .eq("organization_id", member.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("organization_projects")
      .select("id, client_id")
      .eq("organization_id", member.organization_id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("organization_opportunities")
      .select("client_id, stage, estimated_value, updated_at")
      .eq("organization_id", member.organization_id)
      .order("updated_at", { ascending: false }),
    (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => Promise<{ data: ClaimFinanceRow[] | null; error: { message: string } | null }>;
        };
      };
    })
      .from("project_claims")
      .select("project_id, status, due_date, claim_amount, paid_amount")
      .eq("organization_id", member.organization_id),
  ]);

  if (clientsResult.error || projectsResult.error || opportunitiesResult.error) {
    return (
      <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
        <Card className="overflow-hidden rounded-[32px] border-none bg-[var(--app-surface)] shadow-none">
          <CardContent className="px-6 py-6">
            <p className={`${interMedium.className} text-[15px] text-[#6b6b6b]`}>Could not load client data right now. Please refresh.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const clients = clientsResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const opportunities = opportunitiesResult.data ?? [];
  const claims = claimsResult.error ? [] : (claimsResult.data ?? []);

  const projectCountByClientId = new Map<string, number>();
  for (const project of projects) {
    if (!project.client_id) {
      continue;
    }
    projectCountByClientId.set(project.client_id, (projectCountByClientId.get(project.client_id) ?? 0) + 1);
  }

  const activeLeadCountByClientId = new Map<string, number>();
  const wonLeadCountByClientId = new Map<string, number>();
  const totalLeadCountInTopClientPeriodByClientId = new Map<string, number>();
  const wonLeadCountInTopClientPeriodByClientId = new Map<string, number>();
  const wonValueInTopClientPeriodByClientId = new Map<string, number>();
  const wonValueByClientId = new Map<string, number>();
  for (const opportunity of opportunities) {
    if (!opportunity.client_id) {
      continue;
    }

    if (isOnOrAfterCutoff(opportunity.updated_at, topClientPeriodCutoff)) {
      totalLeadCountInTopClientPeriodByClientId.set(
        opportunity.client_id,
        (totalLeadCountInTopClientPeriodByClientId.get(opportunity.client_id) ?? 0) + 1
      );
    }

    const isActiveLead = opportunity.stage !== "Won" && opportunity.stage !== "Lost";
    if (isActiveLead) {
      activeLeadCountByClientId.set(opportunity.client_id, (activeLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);
    }

    if (opportunity.stage === "Won") {
      wonLeadCountByClientId.set(opportunity.client_id, (wonLeadCountByClientId.get(opportunity.client_id) ?? 0) + 1);
      wonValueByClientId.set(opportunity.client_id, (wonValueByClientId.get(opportunity.client_id) ?? 0) + Number(opportunity.estimated_value ?? 0));
      if (isOnOrAfterCutoff(opportunity.updated_at, topClientPeriodCutoff)) {
        wonLeadCountInTopClientPeriodByClientId.set(
          opportunity.client_id,
          (wonLeadCountInTopClientPeriodByClientId.get(opportunity.client_id) ?? 0) + 1
        );
        wonValueInTopClientPeriodByClientId.set(
          opportunity.client_id,
          (wonValueInTopClientPeriodByClientId.get(opportunity.client_id) ?? 0) + Number(opportunity.estimated_value ?? 0)
        );
      }
    }
  }

  const rowsWithRawScore = clients.map((client) => {
    const projectsCount = projectCountByClientId.get(client.id) ?? 0;
    const activeLeads = activeLeadCountByClientId.get(client.id) ?? 0;
    const wonProjects = wonLeadCountByClientId.get(client.id) ?? 0;
    const rawScore = projectsCount * 2 + activeLeads * 3 + wonProjects * 2;

    return {
      ...client,
      activeLeads,
      projectsCount,
      wonProjects,
      rawScore,
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

  const projectClientByProjectId = new Map<string, string>();
  for (const project of projects) {
    if (!project.client_id) {
      continue;
    }
    projectClientByProjectId.set(project.id, project.client_id);
  }

  const overdueClientIds = new Set<string>();
  const todayIso = new Date().toISOString().slice(0, 10);

  for (const claim of claims) {
    const projectId = claim.project_id;
    if (!projectId) {
      continue;
    }

    const clientId = projectClientByProjectId.get(projectId);
    if (!clientId) {
      continue;
    }

    const claimAmount = Number(claim.claim_amount ?? 0);
    const paidAmount = Number(claim.paid_amount ?? 0);
    const balance = Math.max(0, claimAmount - paidAmount);
    const dueDate = claim.due_date;
    const isOverdueByStatus = (claim.status ?? "").toLowerCase() === "overdue";
    const isOverdueByDate = Boolean(dueDate && dueDate < todayIso && balance > 0);
    if (isOverdueByStatus || isOverdueByDate) {
      overdueClientIds.add(clientId);
    }
  }

  const bestConversionClientInTopPeriod = rows.reduce<{
    id: string;
    displayName: string;
    wonCount: number;
    opportunityCount: number;
    conversionRate: number;
  } | null>((best, row) => {
    const opportunityCount = totalLeadCountInTopClientPeriodByClientId.get(row.id) ?? 0;
    if (opportunityCount === 0) {
      return best;
    }
    const wonCount = wonLeadCountInTopClientPeriodByClientId.get(row.id) ?? 0;
    const conversionRate = wonCount / opportunityCount;
    if (
      !best ||
      conversionRate > best.conversionRate ||
      (conversionRate === best.conversionRate && opportunityCount > best.opportunityCount) ||
      (conversionRate === best.conversionRate && opportunityCount === best.opportunityCount && wonCount > best.wonCount)
    ) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        wonCount,
        opportunityCount,
        conversionRate,
      };
    }
    return best;
  }, null);

  const mostRepeatWinsClient = rows.reduce<{
    id: string;
    displayName: string;
    wonCount: number;
  } | null>((best, row) => {
    const wonCount = wonLeadCountInTopClientPeriodByClientId.get(row.id) ?? 0;
    if (!best || wonCount > best.wonCount) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        wonCount,
      };
    }
    return best;
  }, null);
  const filteredClientRows = rows.filter((client) => {
    const company = client.company_name?.trim() || "";
    if (clientSearch && !company.toLowerCase().includes(clientSearch.toLowerCase())) return false;
    if (statusFilter === "active" && client.activeLeads === 0) return false;
    if (statusFilter === "inactive" && client.activeLeads > 0) return false;
    return true;
  });
  const highestValueWonClient = rows.reduce<{
    id: string;
    displayName: string;
    wonValue: number;
    wonCount: number;
  } | null>((best, row) => {
    const wonValue = wonValueInTopClientPeriodByClientId.get(row.id) ?? 0;
    const wonCount = wonLeadCountInTopClientPeriodByClientId.get(row.id) ?? 0;
    if (!best || wonValue > best.wonValue) {
      return {
        id: row.id,
        displayName: getClientDisplayName(row),
        wonValue,
        wonCount,
      };
    }
    return best;
  }, null);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
      <section className="flex items-start justify-between gap-4 pt-[25px]">
        <div>
          <h1 className="m-0 text-[clamp(1.24rem,2.24vw,2.08rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#1d1d1d]">
            Clients
          </h1>
          <p className={`${interMedium.className} mt-[0.65rem] text-[15px] leading-[1.45] text-[#6b6b6b]`}>
            Track who you work with most and keep client relationships moving.
          </p>
        </div>
        <AddClientDialog createClientAction={createClient} />
      </section>

      <div className="space-y-5">
        {/* Client Summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className={`${ibmPlexSans.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>Top clients</p>
            <div className="flex items-center gap-1">
              {TOP_CLIENT_PERIOD_OPTIONS.map((option) => {
                const isActive = option.key === topClientPeriod;
                return (
                  <Link
                    key={option.key}
                    href={buildClientsHref(option.key)}
                    className={`${ibmPlexSans.className} rounded-[0.45rem] px-3 py-1 text-[12px] font-semibold transition ${
                      isActive ? "bg-[#0B2739] text-white" : "border border-[#E2E8F1] bg-white text-[#4D607D] hover:bg-[#EEF3F9]"
                    }`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 grid-cols-4">
            {/* Best Conversion Rate */}
            {bestConversionClientInTopPeriod ? (
              <Link href={`/app/leads-clients/clients/${bestConversionClientInTopPeriod.id}`} className="flex min-h-[170px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)] transition hover:bg-[#F3F9F9]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#FFE5D9]">
                    <TrendingUp className="h-5 w-5 text-[#F15A29]" strokeWidth={2.2} />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Best Conversion Rate</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.1rem,2vw,1.4rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-[#111827]`}>{bestConversionClientInTopPeriod.displayName}</p>
                <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[#F15A29]`}>{Math.round(bestConversionClientInTopPeriod.conversionRate * 100)}% conversion rate</p>
              </Link>
            ) : (
              <div className="flex min-h-[170px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#FFE5D9]">
                    <TrendingUp className="h-5 w-5 text-[#F15A29]" strokeWidth={2.2} />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Best Conversion Rate</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[1.4rem] font-semibold text-[#B0BEC8]`}>—</p>
              </div>
            )}

            {/* Highest Value Won */}
            {highestValueWonClient ? (
              <Link href={`/app/leads-clients/clients/${highestValueWonClient.id}`} className="flex min-h-[170px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)] transition hover:bg-[#F3F9F9]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#0E172B]">
                    <DollarSign className="h-5 w-5 text-[#D9E6F2]" strokeWidth={2.2} />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Highest Value Won</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.1rem,2vw,1.4rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-[#111827]`}>{highestValueWonClient.displayName}</p>
                <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[#0E172B]`}>${((wonValueByClientId.get(highestValueWonClient.id) ?? 0) / 1_000_000).toFixed(1)}M won</p>
              </Link>
            ) : (
              <div className="flex min-h-[170px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#0E172B]">
                    <DollarSign className="h-5 w-5 text-[#D9E6F2]" strokeWidth={2.2} />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Highest Value Won</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[1.4rem] font-semibold text-[#B0BEC8]`}>—</p>
              </div>
            )}

            {/* Most Active Client */}
            {mostRepeatWinsClient ? (
              <Link href={`/app/leads-clients/clients/${mostRepeatWinsClient.id}`} className="flex min-h-[170px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)] transition hover:bg-[#F3F9F9]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#DFF1E5]">
                    <Award className="h-5 w-5 text-[#18384C]" strokeWidth={2.2} />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Most Repeat Wins</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.1rem,2vw,1.4rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-[#111827]`}>{mostRepeatWinsClient.displayName}</p>
                <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[#18384C]`}>{mostRepeatWinsClient.wonCount} jobs won</p>
              </Link>
            ) : (
              <div className="flex min-h-[170px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#DFF1E5]">
                    <Award className="h-5 w-5 text-[#18384C]" strokeWidth={2.2} />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Most Repeat Wins</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[1.4rem] font-semibold text-[#B0BEC8]`}>—</p>
              </div>
            )}

            {/* Total Clients */}
            <div className="flex min-h-[170px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#FFE5D9]">
                  <Users className="h-5 w-5 text-[#F15A29]" strokeWidth={2.2} />
                </span>
                <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Total Clients</p>
              </div>
              <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(2.1rem,3vw,2.75rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{rows.length}</p>
              <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[#4B5D79]`}>{rows.filter(r => r.activeLeads > 0).length} active</p>
            </div>
          </div>
        </div>

        {/* Search + Filter bar */}
        <form action="/app/leads-clients/clients" method="get" className="flex items-center gap-3 mt-4">
          {topClientPeriod !== "12m" ? <input type="hidden" name="topClientPeriod" value={topClientPeriod} /> : null}
          <div className="flex flex-1 items-center gap-2 rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3 h-[42px]">
            <svg width="14" height="14" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="#9AAAB8" strokeWidth="1.3"/><path d="M9 9l2.5 2.5" stroke="#9AAAB8" strokeWidth="1.3" strokeLinecap="round"/></svg>
            <input
              type="text"
              name="clientSearch"
              defaultValue={clientSearch}
              placeholder="Search clients..."
              className={`${ibmPlexSans.className} h-full flex-1 border-0 bg-transparent text-[14px] text-[#1d1d1d] outline-none placeholder:text-[#9AAAB8]`}
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(["all", "active", "inactive"] as const).map((s) => {
              const isActive = statusFilter === s;
              const label = s.charAt(0).toUpperCase() + s.slice(1);
              return (
                <Link
                  key={s}
                  href={buildStatusHref(s)}
                  className={`${ibmPlexSans.className} inline-flex h-[42px] items-center rounded-[0.8rem] px-5 text-[14px] font-semibold transition ${
                    isActive ? "bg-[#0B2739] text-white" : "border border-[#E2E8F1] bg-white text-[#10283B] hover:bg-[#EEF3F9]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </form>

        {/* Client List */}
        <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
          <CardContent className="p-0">
            {filteredClientRows.length === 0 ? (
              <div className="px-6 pb-6">
                <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                  <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>No matching clients found.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F1] bg-[#F8FAFB]">
                      {["Client", "Contact", "Projects", "Status", "Actions"].map((h) => (
                        <th key={h} className={`${ibmPlexSans.className} px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClientRows.map((client) => {
                      const displayName = client.company_name?.trim() || "Unknown Company";
                      const initials = displayName.split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("");
                      const isOverdue = overdueClientIds.has(client.id);
                      const totalProjects = client.projectsCount;
                      const activeProjects = client.activeLeads;

                      return (
                        <tr key={client.id} className="group border-b border-[#E2E8F1] last:border-0 transition-colors hover:bg-[#F8FBFB]">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={`${ibmPlexSans.className} inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F15A29] text-[13px] font-semibold text-white`}>
                                {initials}
                              </span>
                              <div>
                                <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>{displayName}</p>
                                {client.name ? <p className={`${ibmPlexSans.className} text-[13px] text-[#6A7A89]`}>{client.name}</p> : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                              <div className="space-y-1">
                              {client.email ? (
                                <CopyableClientContact label="email" value={client.email}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="1" y="2.5" width="10" height="7" rx="1.2" stroke="#6A7A89" strokeWidth="1.1"/><path d="M1 4l5 3.5L11 4" stroke="#6A7A89" strokeWidth="1.1" strokeLinecap="round"/></svg>
                                </CopyableClientContact>
                              ) : null}
                              {client.phone ? (
                                <CopyableClientContact label="phone number" value={client.phone}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 2.5C2 2.5 2.5 1 3.5 1c.5 0 1 .5 1.5 1.5S5.5 4 5 4.5C4.5 5 5 6 6 7s2 1.5 2.5 1c.5-.5 1.5-.5 2-.5s1.5 1 1.5 1.5c0 1-1.5 1.5-1.5 1.5C8 11 1 4 2 2.5z" stroke="#6A7A89" strokeWidth="1.1" strokeLinecap="round"/></svg>
                                </CopyableClientContact>
                              ) : null}
                              {!client.email && !client.phone ? <p className={`${ibmPlexSans.className} text-[13px] text-[#B0BEC8]`}>—</p> : null}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>
                              {activeProjects} active / {totalProjects} total
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                              isOverdue
                                ? "bg-[#FEE2E2] text-[#B91C1C]"
                                : activeProjects > 0
                                ? "bg-[#DCFCE7] text-[#15803D]"
                                : "bg-[#F1F5F9] text-[#64748B]"
                            }`}>
                              {isOverdue ? "Overdue" : activeProjects > 0 ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              href={`/app/leads-clients/clients/${client.id}`}
                              className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
