import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Award, DollarSign, Mail, Phone, Search, TrendingUp, Users } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";
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
      <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
        <OperationalPanel>
          <p className="text-sm text-[var(--text-secondary)]">Sign in to view organization clients.</p>
        </OperationalPanel>
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
      <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
        <OperationalPanel>
          <p className="text-sm text-[var(--text-secondary)]">Could not load client data right now. Please refresh.</p>
        </OperationalPanel>
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
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
      <OperationalModuleHeader
        title="Clients"
        description="Track who you work with most and keep client relationships moving."
        actions={<AddClientDialog createClientAction={createClient} />}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Top clients</p>
          <div className="flex items-center gap-1">
            {TOP_CLIENT_PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.key}
                asChild
                variant={option.key === topClientPeriod ? "primary" : "secondary"}
                size="sm"
              >
                <Link href={buildClientsHref(option.key)}>{option.label}</Link>
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 grid-cols-4">
          {bestConversionClientInTopPeriod ? (
            <Link
              href={`/app/leads-clients/clients/${bestConversionClientInTopPeriod.id}`}
              className="block transition-colors hover:bg-[var(--surface-muted)]/40 rounded-[var(--radius-lg)]"
            >
              <OperationalKpiCard
                label="Best Conversion Rate"
                value={bestConversionClientInTopPeriod.displayName}
                helper={`${Math.round(bestConversionClientInTopPeriod.conversionRate * 100)}% conversion rate`}
                icon={<TrendingUp className="h-5 w-5" strokeWidth={2.2} />}
              />
            </Link>
          ) : (
            <OperationalKpiCard
              label="Best Conversion Rate"
              value="—"
              icon={<TrendingUp className="h-5 w-5" strokeWidth={2.2} />}
            />
          )}

          {highestValueWonClient ? (
            <Link
              href={`/app/leads-clients/clients/${highestValueWonClient.id}`}
              className="block transition-colors hover:bg-[var(--surface-muted)]/40 rounded-[var(--radius-lg)]"
            >
              <OperationalKpiCard
                label="Highest Value Won"
                value={highestValueWonClient.displayName}
                helper={`$${((wonValueByClientId.get(highestValueWonClient.id) ?? 0) / 1_000_000).toFixed(1)}M won`}
                icon={<DollarSign className="h-5 w-5" strokeWidth={2.2} />}
              />
            </Link>
          ) : (
            <OperationalKpiCard
              label="Highest Value Won"
              value="—"
              icon={<DollarSign className="h-5 w-5" strokeWidth={2.2} />}
            />
          )}

          {mostRepeatWinsClient ? (
            <Link
              href={`/app/leads-clients/clients/${mostRepeatWinsClient.id}`}
              className="block transition-colors hover:bg-[var(--surface-muted)]/40 rounded-[var(--radius-lg)]"
            >
              <OperationalKpiCard
                label="Most Repeat Wins"
                value={mostRepeatWinsClient.displayName}
                helper={`${mostRepeatWinsClient.wonCount} jobs won`}
                icon={<Award className="h-5 w-5" strokeWidth={2.2} />}
              />
            </Link>
          ) : (
            <OperationalKpiCard
              label="Most Repeat Wins"
              value="—"
              icon={<Award className="h-5 w-5" strokeWidth={2.2} />}
            />
          )}

          <OperationalKpiCard
            label="Total Clients"
            value={rows.length}
            helper={`${rows.filter((r) => r.activeLeads > 0).length} active`}
            icon={<Users className="h-5 w-5" strokeWidth={2.2} />}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form action="/app/leads-clients/clients" method="get" className="flex-1">
          {topClientPeriod !== "12m" ? <input type="hidden" name="topClientPeriod" value={topClientPeriod} /> : null}
          {statusFilter !== "all" ? <input type="hidden" name="statusFilter" value={statusFilter} /> : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              name="clientSearch"
              defaultValue={clientSearch}
              placeholder="Search clients..."
              className="pl-9"
            />
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "active", "inactive"] as const).map((s) => {
            const label = s.charAt(0).toUpperCase() + s.slice(1);
            return (
              <Button
                key={s}
                asChild
                variant={statusFilter === s ? "primary" : "secondary"}
                size="sm"
              >
                <Link href={buildStatusHref(s)}>{label}</Link>
              </Button>
            );
          })}
        </div>
      </div>

      <OperationalPanel contentClassName="p-0">
        {filteredClientRows.length === 0 ? (
          <div className="p-6">
            <OperationalEmptyState title="No matching clients found." />
          </div>
        ) : (
          <OperationalTable className="min-w-[720px]">
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead>Client</OperationalTableHead>
                <OperationalTableHead>Contact</OperationalTableHead>
                <OperationalTableHead>Projects</OperationalTableHead>
                <OperationalTableHead>Status</OperationalTableHead>
                <OperationalTableHead className="text-right">Actions</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {filteredClientRows.map((client) => {
                const displayName = client.company_name?.trim() || "Unknown Company";
                const initials = displayName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w: string) => w[0]?.toUpperCase() ?? "")
                  .join("");
                const isOverdue = overdueClientIds.has(client.id);
                const totalProjects = client.projectsCount;
                const activeProjects = client.activeLeads;
                const statusVariant = isOverdue ? "overdue" : activeProjects > 0 ? "approved" : "draft";
                const statusLabel = isOverdue ? "Overdue" : activeProjects > 0 ? "Active" : "Inactive";

                return (
                  <OperationalTableRow key={client.id}>
                    <OperationalTableCell>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-white">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--text-primary)]">{displayName}</p>
                          {client.name ? (
                            <p className="text-sm text-[var(--text-secondary)]">{client.name}</p>
                          ) : null}
                        </div>
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                        {client.email ? (
                          <CopyableClientContact label="email" value={client.email}>
                            <Mail className="h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                          </CopyableClientContact>
                        ) : null}
                        {client.phone ? (
                          <CopyableClientContact label="phone number" value={client.phone}>
                            <Phone className="h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                          </CopyableClientContact>
                        ) : null}
                        {!client.email && !client.phone ? (
                          <p className="text-[var(--text-muted)]">—</p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      {activeProjects} active / {totalProjects} total
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={statusVariant}>{statusLabel}</StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="flex justify-end">
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/app/leads-clients/clients/${client.id}`}>View</Link>
                        </Button>
                      </div>
                    </OperationalTableCell>
                  </OperationalTableRow>
                );
              })}
            </OperationalTableBody>
          </OperationalTable>
        )}
      </OperationalPanel>
    </main>
  );
}
