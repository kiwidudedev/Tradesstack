import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { convertOpportunityToProjectForCurrentUser, deleteOpportunityForCurrentUser, getLiveOpportunitiesForCurrentUser } from "@/lib/leads-clients-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import type { QuoteStatus } from "@/lib/supabase/types";

const workspaceTabs = ["Summary", "Trade Packs", "Scopes", "Pricing & Submission"] as const;

function tabHref(opportunityId: string, tab: (typeof workspaceTabs)[number]) {
  if (tab === "Trade Packs") {
    return `/app/leads-clients/opportunities/${opportunityId}/drawing-intelligence`;
  }
  if (tab === "Scopes") {
    return `/app/leads-clients/opportunities/${opportunityId}/scope-builder`;
  }
  if (tab === "Pricing & Submission") {
    return `/app/leads-clients/opportunities/${opportunityId}/quote`;
  }
  return `/app/leads-clients/opportunities/${opportunityId}`;
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

function formatDueDate(isoDate: string | null): string {
  if (!isoDate) {
    return "No due date";
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short" }).format(date);
}

function getDueUrgency(isoDate: string | null): { text: string; toneClass: string } {
  const days = getDaysUntilIso(isoDate);
  if (days === null) {
    return { text: "No due date", toneClass: "text-[#6D809A]" };
  }
  if (days < 0) {
    return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`, toneClass: "text-[#B42318]" };
  }
  if (days === 0) {
    return { text: "Due today", toneClass: "text-[#B45309]" };
  }
  if (days === 1) {
    return { text: "Due tomorrow", toneClass: "text-[#B45309]" };
  }
  if (days === 2) {
    return { text: "2 days remaining", toneClass: "text-[#B42318]" };
  }
  return { text: `${days} days remaining`, toneClass: days <= 4 ? "text-[#B45309]" : "text-[#6D809A]" };
}

function formatCurrencyNZD(value: number): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeTime(isoDate: string): string {
  const target = new Date(isoDate);
  const deltaMs = Date.now() - target.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (deltaMs < hour) {
    const minutes = Math.max(1, Math.floor(deltaMs / minute));
    return `${minutes}m ago`;
  }
  if (deltaMs < day) {
    const hours = Math.max(1, Math.floor(deltaMs / hour));
    return `${hours}h ago`;
  }
  const days = Math.max(1, Math.floor(deltaMs / day));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function isGeneratedTradePackFile(fileName: string | null, storagePath: string | null): boolean {
  return /trade pack/i.test(fileName ?? "") || /-trade-pack\.pdf$/i.test(fileName ?? "") || /-trade-pack\.pdf$/i.test(storagePath ?? "");
}

export default async function OpportunityWorkspacePage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const opportunities = await getLiveOpportunitiesForCurrentUser();
  const opportunity = opportunities.find((item) => item.slug === opportunityId);

  if (!opportunity) {
    notFound();
  }
  const activeOpportunity = opportunity;

  const member = await getCurrentOrganizationMember();
  if (!member) {
    redirect("/app/leads-clients/opportunities");
  }

  const supabase = await createServerSupabaseClient();
  const [opportunityMetaResult, latestQuoteResult] = await Promise.all([
    supabase
      .from("organization_opportunities")
      .select("created_at, updated_at, converted_at")
      .eq("organization_id", member.organization_id)
      .eq("id", activeOpportunity.opportunityId)
      .maybeSingle(),
    supabase
      .from("opportunity_quotes")
      .select("id, status, total_quote_price, created_at, updated_at")
      .eq("organization_id", member.organization_id)
      .eq("opportunity_id", activeOpportunity.opportunityId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestQuote = latestQuoteResult.data;

  let quoteLineItemCount = 0;
  if (latestQuote?.id) {
    const quoteLineItemsResult = await supabase
      .from("opportunity_quote_line_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", member.organization_id)
      .eq("quote_id", latestQuote.id);
    quoteLineItemCount = quoteLineItemsResult.count ?? 0;
  }

  let tradePackCount = 0;
  let scopesComplete = 0;
  let latestTradePackCreatedAt: string | null = null;
  let latestCompletedScopeAt: string | null = null;
  const tenderWorkspaceProjectId = activeOpportunity.workspaceProjectId;

  if (tenderWorkspaceProjectId) {
    const [tradePacksResult, drawingSetsResult, scopeRunsResult] = await Promise.all([
      supabase
        .from("trade_packs")
        .select("id, created_at")
        .eq("organization_id", member.organization_id)
        .eq("project_id", tenderWorkspaceProjectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_drawing_sets")
        .select("id, uploaded_at, file_name, storage_path")
        .eq("organization_id", member.organization_id)
        .eq("project_id", tenderWorkspaceProjectId)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("scope_runs")
        .select("trade_pack_id, status, created_at, updated_at")
        .eq("organization_id", member.organization_id)
        .eq("project_id", tenderWorkspaceProjectId)
        .order("updated_at", { ascending: false }),
    ]);

    const canonicalTradePacks = tradePacksResult.data ?? [];
    if (canonicalTradePacks.length > 0) {
      tradePackCount = canonicalTradePacks.length;
      latestTradePackCreatedAt = canonicalTradePacks[0]?.created_at ?? null;
    } else {
      const legacyGeneratedTradePacks = (drawingSetsResult.data ?? []).filter((row) =>
        isGeneratedTradePackFile(row.file_name, row.storage_path)
      );
      tradePackCount = legacyGeneratedTradePacks.length;
      latestTradePackCreatedAt = legacyGeneratedTradePacks[0]?.uploaded_at ?? null;
    }

    const runs = scopeRunsResult.data ?? [];
    const completedTradePackIds = new Set<string>();
    for (const run of runs) {
      if (run.status === "complete") {
        completedTradePackIds.add(run.trade_pack_id);
        if (!latestCompletedScopeAt) {
          latestCompletedScopeAt = run.updated_at || run.created_at;
        }
      }
    }
    scopesComplete = completedTradePackIds.size;
  }

  const quoteStarted = Boolean(latestQuote);
  const submittedStatuses: QuoteStatus[] = ["Sent", "Viewed", "Accepted"];
  const quoteSubmitted = activeOpportunity.stage === "Quoted" || activeOpportunity.stage === "Won" || submittedStatuses.includes((latestQuote?.status as QuoteStatus) ?? "Draft");
  const pricingComplete = quoteStarted && quoteLineItemCount > 0;
  const packsGenerated = tradePackCount > 0;
  const scopeDenominator = tradePackCount > 0 ? tradePackCount : 1;
  const scopeProgress = tradePackCount > 0 ? Math.min(scopesComplete / tradePackCount, 1) : 0;
  const pricingProgress = quoteSubmitted ? 1 : quoteStarted ? 0.65 : 0;
  const quoteReadiness = quoteSubmitted ? 100 : Math.round((packsGenerated ? 0.35 : 0) * 100 + scopeProgress * 35 + pricingProgress * 30);

  const trackerSteps = [
    { label: "Lead Created", done: true },
    { label: "Trade Packs Generated", done: packsGenerated },
    { label: "Scopes Built", done: scopesComplete >= scopeDenominator && packsGenerated },
    { label: "Pricing Complete", done: pricingComplete },
    { label: "Quote Submitted", done: quoteSubmitted },
  ];

  const generateTradePackHref = `/app/leads-clients/opportunities/${opportunityId}/drawing-intelligence`;
  const buildScopeHref = `/app/leads-clients/opportunities/${opportunityId}/scope-builder`;

  const nextAction = !packsGenerated
    ? {
        title: "Generate Trade Pack",
        detail: "Required to begin scope and pricing.",
        ctaLabel: "Generate Trade Pack",
        href: generateTradePackHref,
      }
    : scopesComplete < scopeDenominator
      ? {
          title: "Build Remaining Scope",
          detail: `Complete ${scopeDenominator - scopesComplete} scope${scopeDenominator - scopesComplete === 1 ? "" : "s"} before final pricing.`,
          ctaLabel: "Build Scope",
          href: buildScopeHref,
        }
      : !quoteStarted
        ? {
            title: "Start Pricing",
            detail: "Create your tender quote from completed scope outputs.",
            ctaLabel: "Start Pricing",
            href: `/app/leads-clients/opportunities/${opportunityId}/quote`,
          }
        : !quoteSubmitted
          ? {
              title: "Submit Quote",
              detail: "Finalize quote details and mark the submission status.",
              ctaLabel: "Continue To Submission",
              href: `/app/leads-clients/opportunities/${opportunityId}/quote`,
            }
          : {
              title: "Continue Tender",
              detail: "Quote submitted. Track outcomes and prepare conversion.",
              ctaLabel: "Continue Tender",
              href: `/app/leads-clients/opportunities/${opportunityId}/quote`,
            };

  const dueUrgency = getDueUrgency(activeOpportunity.dueDateIso);
  const riskInsights = [
    ...(!packsGenerated ? ["Missing drawing intelligence. Generate your first trade pack to surface scope risks."] : []),
    ...(packsGenerated && scopesComplete < scopeDenominator
      ? [`${scopeDenominator - scopesComplete} trade pack${scopeDenominator - scopesComplete === 1 ? "" : "s"} still missing completed scope outputs.`]
      : []),
    ...(getDaysUntilIso(activeOpportunity.dueDateIso) !== null && (getDaysUntilIso(activeOpportunity.dueDateIso) ?? 0) <= 2 && !quoteSubmitted
      ? [`Tender due ${formatDueDate(activeOpportunity.dueDateIso)}. Submission window is now critical.`]
      : []),
    ...(quoteStarted && quoteLineItemCount === 0 ? ["Quote draft exists but no priced line items have been added yet."] : []),
  ].slice(0, 4);

  const activity = [
    opportunityMetaResult.data?.created_at
      ? { label: "Lead created", at: opportunityMetaResult.data.created_at }
      : null,
    latestTradePackCreatedAt
      ? {
          label: `${tradePackCount} trade pack${tradePackCount === 1 ? "" : "s"} generated`,
          at: latestTradePackCreatedAt,
        }
      : null,
    latestCompletedScopeAt
      ? {
          label: `${scopesComplete} scope${scopesComplete === 1 ? "" : "s"} completed`,
          at: latestCompletedScopeAt,
        }
      : null,
    latestQuote?.updated_at
      ? {
          label: `Quote ${quoteSubmitted ? "submitted" : "updated"}${latestQuote.status ? ` (${latestQuote.status})` : ""}`,
          at: latestQuote.updated_at,
        }
      : null,
    opportunityMetaResult.data?.converted_at
      ? { label: "Converted to project", at: opportunityMetaResult.data.converted_at }
      : null,
  ]
    .filter((item): item is { label: string; at: string } => Boolean(item))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  async function onConvertToProject() {
    "use server";

    const converted = await convertOpportunityToProjectForCurrentUser(opportunityId);
    redirect(`/app/projects/${converted.projectSlug}/dashboard`);
  }

  async function onDeleteOpportunity() {
    "use server";

    await deleteOpportunityForCurrentUser(activeOpportunity.opportunityId);
    redirect("/app/leads-clients/opportunities");
  }

  return (
    <main className="space-y-6 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{activeOpportunity.name}</CardTitle>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#64748B]`}>{activeOpportunity.location}</p>
              <p className={`${interMedium.className} mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#7B8EA8]`}>{activeOpportunity.stage}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                className="h-10 rounded-[10px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]"
              >
                <Link href={nextAction.href}>Continue Tender</Link>
              </Button>
              <Button asChild variant="outline" className="h-10 rounded-[10px] border-[#D8E2EE] bg-white px-[14px] text-sm font-medium text-[#24324A] hover:bg-[#F8FAFD]">
                <Link href={generateTradePackHref}>Generate Trade Pack</Link>
              </Button>
              <Button asChild variant="outline" className="h-10 rounded-[10px] border-[#D8E2EE] bg-white px-[14px] text-sm font-medium text-[#24324A] hover:bg-[#F8FAFD]">
                <Link href={buildScopeHref}>Build Scope</Link>
              </Button>
              <Button asChild variant="outline" className="h-10 rounded-[10px] border-[#D8E2EE] bg-white px-[14px] text-sm font-medium text-[#24324A] hover:bg-[#F8FAFD]">
                <Link href={`/app/leads-clients/opportunities/${opportunityId}/quote`}>Start Pricing</Link>
              </Button>
              {quoteSubmitted || activeOpportunity.stage === "Won" ? (
                <form action={onConvertToProject}>
                  <Button
                    type="submit"
                    className="h-10 rounded-[10px] bg-[#0F172A] px-[18px] text-sm font-medium text-white hover:bg-[#111c30]"
                  >
                    Convert To Project
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-[12px] border border-[#E6EAF0] bg-[#F8FAFC] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className={`${interMedium.className} text-sm font-semibold text-[#1E2B3F]`}>Status Progress</p>
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.08em] text-[#657A96]`}>
                  Quote Readiness {quoteReadiness}%
                </p>
              </div>
              <div className="h-2 w-full rounded-full bg-[#E7EEF6]">
                <div className="h-2 rounded-full bg-[#F74917] transition-all" style={{ width: `${quoteReadiness}%` }} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {trackerSteps.map((step) => (
                  <div key={step.label} className="flex items-center gap-2 rounded-[8px] border border-[#E1EAF4] bg-white px-2.5 py-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${step.done ? "bg-[#22C55E]" : "bg-[#CAD5E3]"}`} />
                    <span className={`${interMedium.className} text-xs font-semibold text-[#2A3B54]`}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[12px] border border-[#F7D9CC] bg-[#FFF7F4] p-4">
              <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.1em] text-[#B94D33]`}>Next Action</p>
              <h3 className="mt-2 text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">{nextAction.title}</h3>
              <p className={`${interMedium.className} mt-1.5 text-sm font-medium leading-relaxed text-[#7A4A3C]`}>{nextAction.detail}</p>
              <Button asChild className="mt-4 h-10 rounded-[10px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]">
                <Link href={nextAction.href}>{nextAction.ctaLabel}</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#E6EAF0] bg-white px-4 py-3">
            <div className={`${interMedium.className} flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-[#415670]`}>
              <span>
                Client: <strong className="text-[#0F172A]">{activeOpportunity.clientName}</strong>
              </span>
              <span className="text-[#A8B6C8]">|</span>
              <span>
                Due: <strong className="text-[#0F172A]">{formatDueDate(activeOpportunity.dueDateIso)}</strong>
              </span>
              <span className="text-[#A8B6C8]">|</span>
              <span>
                Estimator: <strong className="text-[#0F172A]">{activeOpportunity.ownerName}</strong>
              </span>
              <span className="text-[#A8B6C8]">|</span>
              <span className={`font-semibold ${dueUrgency.toneClass}`}>{dueUrgency.text}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {workspaceTabs.map((tab) => (
              <Link
                key={tab}
                href={tabHref(opportunityId, tab)}
                className={
                  interMedium.className +
                  (tab === "Summary"
                    ? " h-9 rounded-[10px] border border-[#D8E2EE] bg-[#F4F8FC] px-4 text-sm font-semibold text-[#0F172A]"
                    : " h-9 rounded-[10px] border border-transparent px-4 text-sm font-medium text-[#6D809A] hover:bg-[#F6F9FC] hover:text-[#30425D]")
                }
              >
                {tab}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-2 pt-6">
            <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Tender Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <SnapshotRow label="Trade Packs" value={`${tradePackCount}`} />
            <SnapshotRow label="Scopes Complete" value={`${scopesComplete} / ${tradePackCount || 0}`} />
            <SnapshotRow label="Quote Value" value={latestQuote?.total_quote_price ? formatCurrencyNZD(latestQuote.total_quote_price) : "Not started"} />
            <SnapshotRow label="Risks Identified" value={`${riskInsights.length || 1}`} tone={riskInsights.length > 0 ? "warning" : "neutral"} />
          </CardContent>
        </Card>

        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-2 pt-6">
            <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">AI Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {riskInsights.length > 0 ? (
              riskInsights.map((item) => (
                <div key={item} className="rounded-[10px] border border-[#FDEAD7] bg-[#FFFBF6] px-3 py-2.5">
                  <p className={`${interMedium.className} text-sm font-medium text-[#9A5F1D]`}>⚠ {item}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[10px] border border-[#DDEBDF] bg-[#F7FBF8] px-3 py-2.5">
                <p className={`${interMedium.className} text-sm font-medium text-[#2F6A45]`}>
                  No critical issues detected. Continue progressing scope and pricing.
                </p>
              </div>
            )}
            <Button asChild variant="outline" className="h-10 rounded-[10px] border-[#D8E2EE] bg-white px-4 text-sm font-medium text-[#24324A] hover:bg-[#F8FAFD]">
              <Link href={packsGenerated ? buildScopeHref : generateTradePackHref}>View Issues</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-2 pt-6">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {activity.length > 0 ? (
            activity.map((item) => (
              <div key={`${item.label}-${item.at}`} className="flex items-center justify-between rounded-[10px] border border-[#EAF0F6] bg-[#F9FBFD] px-3 py-2.5">
                <p className={`${interMedium.className} text-sm font-medium text-[#314760]`}>{item.label}</p>
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.08em] text-[#8396B0]`}>
                  {formatRelativeTime(item.at)}
                </p>
              </div>
            ))
          ) : (
            <p className={`${interMedium.className} text-sm font-medium text-[#566783]`}>
              Activity will appear here as your team generates packs, scopes, and quote updates.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-2 pt-6">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`${interMedium.className} text-sm font-medium leading-relaxed text-[#566783]`}>
            This tender workspace tracks opportunity progress from pack generation through pricing and submission.
            Use the next action card to keep momentum and the readiness score to monitor submission confidence.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <form action={onDeleteOpportunity}>
          <Button
            type="submit"
            variant="ghost"
            className="h-9 rounded-[10px] px-3 text-sm font-medium text-[#B42318] hover:bg-[#FEF3F2] hover:text-[#912018]"
          >
            Delete Lead
          </Button>
        </form>
      </div>
    </main>
  );
}

function SnapshotRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-[#EAF0F6] bg-[#F9FBFD] px-3 py-2.5">
      <p className={`${interMedium.className} text-sm font-medium text-[#5B6E89]`}>{label}</p>
      <p className={`${interMedium.className} text-sm font-semibold ${tone === "warning" ? "text-[#B45309]" : "text-[#0F172A]"}`}>{value}</p>
    </div>
  );
}
