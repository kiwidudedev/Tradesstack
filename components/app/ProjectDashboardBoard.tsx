"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Clock3, FileWarning, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface ProjectContext {
  organizationId: string;
  projectId: string;
  projectName: string;
  stage: string;
  location: string;
  createdAt: string;
  clientName: string;
}

interface DashboardMetrics {
  overdueTasks: number;
  awaitingVariationApproval: number;
  claimReadyToSend: number;
  openIssues: number;
  failedInspections: number;
  tasksDueToday: number;
  pendingVariations: number;
  claimsThisMonth: number;
  activeWorkers: number;
  pendingSignoffs: number;
  inspectionsToday: number;
}

interface FinancialSummary {
  quoteValue: number;
  variationTotal: number;
  claimsSubmitted: number;
  claimsPaidAmount: number;
  claimsUnpaidAmount: number;
  poOutstandingCount: number;
  poOutstandingAmount: number;
}

interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  at: string;
  href: string;
}

const EMPTY_METRICS: DashboardMetrics = {
  overdueTasks: 0,
  awaitingVariationApproval: 0,
  claimReadyToSend: 0,
  openIssues: 0,
  failedInspections: 0,
  tasksDueToday: 0,
  pendingVariations: 0,
  claimsThisMonth: 0,
  activeWorkers: 0,
  pendingSignoffs: 0,
  inspectionsToday: 0,
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString("en-NZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ProjectDashboardBoard() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId ?? "";
  const { session } = useAuth();

  const [context, setContext] = useState<ProjectContext | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isPriorityLoading, setIsPriorityLoading] = useState(true);
  const [isProjectActivityOpen, setIsProjectActivityOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoadingRef = useRef(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const projectBase = useMemo(() => `/app/projects/${routeProjectSlug}`, [routeProjectSlug]);

  const actionRequired = useMemo(
    () =>
      [
      { label: "Overdue tasks", value: metrics.overdueTasks, href: `${projectBase}/job-management/todos` },
      { label: "Variations awaiting approval", value: metrics.awaitingVariationApproval, href: `${projectBase}/preconstruction/variations` },
      { label: "Claims ready to send", value: metrics.claimReadyToSend, href: `${projectBase}/preconstruction/claims` },
      { label: "Open issues", value: metrics.openIssues, href: `${projectBase}/job-management/quality-assurance` },
      { label: "Failed inspections", value: metrics.failedInspections, href: `${projectBase}/job-management/quality-assurance` },
      ]
        .filter((item) => item.value > 0)
        .slice(0, 7),
    [metrics.awaitingVariationApproval, metrics.claimReadyToSend, metrics.failedInspections, metrics.openIssues, metrics.overdueTasks, projectBase]
  );

  const loadData = async () => {
    if (!supabase || !routeProjectSlug || !session?.id || isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setIsPriorityLoading(true);
    setError(null);

    try {
      let resolvedOrganizationId = session.organizationId;
      if (!resolvedOrganizationId) {
        const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
        resolvedOrganizationId = ensuredOrganizationId ?? null;
      }
      if (!resolvedOrganizationId) {
        throw new Error("Could not resolve your organization.");
      }

      const { data: projectRow, error: projectError } = await supabase
        .from("organization_projects")
        .select("id, name, stage, location, created_at, client_id")
        .eq("organization_id", resolvedOrganizationId)
        .eq("slug", routeProjectSlug)
        .maybeSingle();

      if (projectError || !projectRow) {
        throw new Error(projectError?.message ?? "Project not found.");
      }

      const projectId = String(projectRow.id);
      const now = new Date();
      const nowIso = now.toISOString();
      const today = now.toISOString().slice(0, 10);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientsTable = (supabase as any).from("organization_clients");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todosTable = (supabase as any).from("project_job_todos");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesTable = (supabase as any).from("project_quality_issues");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionsTable = (supabase as any).from("project_quality_inspections");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionItemsTable = (supabase as any).from("project_quality_inspection_items");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signoffsTable = (supabase as any).from("project_quality_sign_offs");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quoteTable = (supabase as any).from("project_quotes");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variationsTable = (supabase as any).from("project_variations");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claimsTable = (supabase as any).from("project_claims");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poTable = (supabase as any).from("project_purchase_orders");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const timeSheetsTable = (supabase as any).from("project_time_sheet_entries");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const timeEventsTable = (supabase as any).from("project_time_sheet_events");

      const [
        clientResult,
        taskOverdueByDueAtResult,
        taskOverdueByDateResult,
        tasksDueTodayDueAtResult,
        tasksDueTodayDateResult,
        openIssuesCountResult,
        failedInspectionsCountResult,
        awaitingVariationApprovalCountResult,
        claimReadyToSendCountResult,
        claimsThisMonthCountResult,
        activeWorkersCountResult,
      ] = await Promise.all([
        projectRow.client_id
          ? clientsTable
              .select("name")
              .eq("organization_id", resolvedOrganizationId)
              .eq("id", String(projectRow.client_id))
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .neq("status", "Complete")
          .neq("status", "Archived")
          .lt("due_at", nowIso),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .neq("status", "Complete")
          .neq("status", "Archived")
          .is("due_at", null)
          .lt("due_date", today),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .neq("status", "Complete")
          .neq("status", "Archived")
          .gte("due_at", startOfDay.toISOString())
          .lt("due_at", endOfDay.toISOString()),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .neq("status", "Complete")
          .neq("status", "Archived")
          .is("due_at", null)
          .eq("due_date", today),
        issuesTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .in("status", ["Open", "In Progress"]),
        inspectionItemsTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .eq("status", "fail"),
        variationsTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .in("status", ["Sent", "Client Review"]),
        claimsTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .eq("status", "Draft")
          .gt("claim_amount", 0),
        claimsTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .gte("claim_date", monthStart)
          .lt("claim_date", monthEnd),
        timeSheetsTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .is("clock_out_at", null),
      ]);

      const priorityError =
        clientResult.error ??
        taskOverdueByDueAtResult.error ??
        taskOverdueByDateResult.error ??
        tasksDueTodayDueAtResult.error ??
        tasksDueTodayDateResult.error ??
        openIssuesCountResult.error ??
        failedInspectionsCountResult.error ??
        awaitingVariationApprovalCountResult.error ??
        claimReadyToSendCountResult.error ??
        claimsThisMonthCountResult.error ??
        activeWorkersCountResult.error;

      if (priorityError) {
        throw new Error(priorityError.message ?? "Unable to load project dashboard.");
      }

      const nextMetrics: DashboardMetrics = {
        overdueTasks: (taskOverdueByDueAtResult.count ?? 0) + (taskOverdueByDateResult.count ?? 0),
        awaitingVariationApproval: awaitingVariationApprovalCountResult.count ?? 0,
        claimReadyToSend: claimReadyToSendCountResult.count ?? 0,
        openIssues: openIssuesCountResult.count ?? 0,
        failedInspections: failedInspectionsCountResult.count ?? 0,
        tasksDueToday: (tasksDueTodayDueAtResult.count ?? 0) + (tasksDueTodayDateResult.count ?? 0),
        pendingVariations: awaitingVariationApprovalCountResult.count ?? 0,
        claimsThisMonth: claimsThisMonthCountResult.count ?? 0,
        activeWorkers: activeWorkersCountResult.count ?? 0,
        pendingSignoffs: 0,
        inspectionsToday: 0,
      };

      setContext({
        organizationId: resolvedOrganizationId,
        projectId,
        projectName: String(projectRow.name ?? "Project"),
        stage: String(projectRow.stage ?? "Planning"),
        location: String(projectRow.location ?? ""),
        createdAt: typeof projectRow.created_at === "string" ? projectRow.created_at : nowIso,
        clientName: String(clientResult.data?.name ?? "Unassigned"),
      });
      setMetrics(nextMetrics);
      setIsPriorityLoading(false);

      const [
        inspectionsTodayCountResult,
        pendingSignoffsCountResult,
        latestQuoteResult,
        variationsSummaryResult,
        claimsSummaryResult,
        poSummaryResult,
        tasksFeedResult,
        issuesFeedResult,
        variationsFeedResult,
        claimsFeedResult,
        timeFeedResult,
        signoffFeedResult,
      ] = await Promise.all([
        inspectionsTable
          .select("id", { head: true, count: "planned" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .gte("scheduled_at", startOfDay.toISOString())
          .lt("scheduled_at", endOfDay.toISOString()),
        signoffsTable
          .select("id", { head: true, count: "planned" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .in("status", ["Pending", "Requested"]),
        quoteTable
          .select("total_quote_price")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        variationsTable
          .select("status, total_variation_price")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .limit(200),
        claimsTable
          .select("status, claim_amount, paid_amount")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .limit(200),
        poTable
          .select("status, total_purchase_order_price")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .limit(200),
        todosTable
          .select("id, title, status, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .neq("status", "Complete")
          .neq("status", "Archived")
          .order("updated_at", { ascending: false })
          .limit(6),
        issuesTable
          .select("id, title, status, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(6),
        variationsTable
          .select("id, variation_number, status, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(6),
        claimsTable
          .select("id, claim_number, status, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(6),
        timeEventsTable
          .select("id, event_type, message, created_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(6),
        signoffsTable
          .select("id, title, status, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(6),
      ]);

      const secondaryError =
        inspectionsTodayCountResult.error ??
        pendingSignoffsCountResult.error ??
        latestQuoteResult.error ??
        variationsSummaryResult.error ??
        claimsSummaryResult.error ??
        poSummaryResult.error ??
        tasksFeedResult.error ??
        issuesFeedResult.error ??
        variationsFeedResult.error ??
        claimsFeedResult.error ??
        timeFeedResult.error ??
        signoffFeedResult.error;

      if (secondaryError) {
        throw new Error(secondaryError.message ?? "Unable to load extended dashboard data.");
      }

      const variationsRows = (variationsSummaryResult.data ?? []) as Array<Record<string, unknown>>;
      const variationTotal = variationsRows.reduce((sum, row) => sum + (typeof row.total_variation_price === "number" ? row.total_variation_price : 0), 0);

      const claimsRows = (claimsSummaryResult.data ?? []) as Array<Record<string, unknown>>;
      const claimsSubmitted = claimsRows.filter((row) => {
        const status = String(row.status ?? "");
        return status === "Submitted" || status === "Unpaid" || status === "Paid" || status === "Overdue";
      }).length;
      const claimsPaidAmount = claimsRows.reduce((sum, row) => sum + (typeof row.paid_amount === "number" ? row.paid_amount : 0), 0);
      const claimsUnpaidAmount = claimsRows.reduce((sum, row) => {
        const claimAmount = typeof row.claim_amount === "number" ? row.claim_amount : 0;
        const paidAmount = typeof row.paid_amount === "number" ? row.paid_amount : 0;
        return sum + Math.max(0, claimAmount - paidAmount);
      }, 0);

      const poRows = (poSummaryResult.data ?? []) as Array<Record<string, unknown>>;
      const outstandingPoRows = poRows.filter((row) => {
        const status = String(row.status ?? "");
        return status !== "Invoiced" && status !== "Cancelled" && status !== "Received";
      });
      const poOutstandingAmount = outstandingPoRows.reduce((sum, row) => sum + (typeof row.total_purchase_order_price === "number" ? row.total_purchase_order_price : 0), 0);

      const taskFeed: ActivityItem[] = ((tasksFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `task-${String(row.id)}`,
        label: "Task updated",
        detail: `${String(row.title ?? "Task")} (${String(row.status ?? "")})`,
        at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
        href: `${projectBase}/job-management/todos`,
      }));
      const issueFeed: ActivityItem[] = ((issuesFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `issue-${String(row.id)}`,
        label: "Issue updated",
        detail: `${String(row.title ?? "Issue")} (${String(row.status ?? "")})`,
        at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
        href: `${projectBase}/job-management/quality-assurance`,
      }));
      const variationFeed: ActivityItem[] = ((variationsFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `variation-${String(row.id)}`,
        label: "Variation updated",
        detail: `${String(row.variation_number ?? "Variation")} (${String(row.status ?? "")})`,
        at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
        href: `${projectBase}/preconstruction/variations`,
      }));
      const claimFeed: ActivityItem[] = ((claimsFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `claim-${String(row.id)}`,
        label: "Claim updated",
        detail: `${String(row.claim_number ?? "Claim")} (${String(row.status ?? "")})`,
        at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
        href: `${projectBase}/preconstruction/claims`,
      }));
      const timeFeed: ActivityItem[] = ((timeFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `time-${String(row.id)}`,
        label: "Time sheet event",
        detail: String(row.message ?? String(row.event_type ?? "Time update")),
        at: typeof row.created_at === "string" ? row.created_at : nowIso,
        href: `${projectBase}/job-management/time-sheets`,
      }));
      const signoffFeed: ActivityItem[] = ((signoffFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `signoff-${String(row.id)}`,
        label: "Sign-off updated",
        detail: `${String(row.title ?? "Sign-off")} (${String(row.status ?? "")})`,
        at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
        href: `${projectBase}/job-management/quality-assurance`,
      }));

      const sortedActivity = [...taskFeed, ...issueFeed, ...variationFeed, ...claimFeed, ...timeFeed, ...signoffFeed]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 12);

      const nextFinancials: FinancialSummary = {
        quoteValue: typeof latestQuoteResult.data?.total_quote_price === "number" ? latestQuoteResult.data.total_quote_price : 0,
        variationTotal,
        claimsSubmitted,
        claimsPaidAmount,
        claimsUnpaidAmount,
        poOutstandingCount: outstandingPoRows.length,
        poOutstandingAmount,
      };

      const nextInsights: string[] = [];
      if (nextMetrics.failedInspections > 0) {
        nextInsights.push(`${nextMetrics.failedInspections} inspection failures can auto-create follow-up tasks.`);
      }
      if (nextMetrics.overdueTasks >= 2) {
        nextInsights.push(`Task completion is slipping with ${nextMetrics.overdueTasks} overdue items.`);
      }
      if (nextMetrics.awaitingVariationApproval > 0 && nextFinancials.poOutstandingCount === 0) {
        nextInsights.push("Variation risk detected: pending approvals are not yet reflected in purchase orders.");
      }
      if (nextFinancials.claimsUnpaidAmount > 0) {
        nextInsights.push(`Cashflow pressure: ${formatMoney(nextFinancials.claimsUnpaidAmount)} remains unpaid.`);
      }
      if (nextMetrics.pendingSignoffs > 0 && nextMetrics.openIssues > 0) {
        nextInsights.push("Sign-off risk: open QA issues may block approvals.");
      }
      if (nextInsights.length === 0) {
        nextInsights.push("No major risks detected right now. Keep momentum on inspections and claims.");
      }

      setMetrics((previous) => ({
        ...previous,
        pendingSignoffs: pendingSignoffsCountResult.count ?? 0,
        inspectionsToday: inspectionsTodayCountResult.count ?? 0,
      }));
      setAiInsights(nextInsights);
      setActivity(sortedActivity);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project command centre.");
    } finally {
      setIsPriorityLoading(false);
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectSlug, session?.id, session?.organizationId, supabase]);

  return (
    <main className="space-y-6 pb-8">
      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-4 pt-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">
                {context?.projectName ?? "Project Command Centre"}
              </CardTitle>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="overflow-x-auto rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC]">
        <div className="flex min-w-[820px] divide-x divide-[#E3E8F0]">
          <Link href={`${projectBase}/job-management/todos`} className="flex flex-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-white">
            <Clock3 className="h-5 w-5 text-[#B45309]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Tasks Due Today</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{metrics.tasksDueToday}</p>
            </div>
          </Link>
          <Link href={`${projectBase}/job-management/quality-assurance`} className="flex flex-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-white">
            <AlertTriangle className="h-5 w-5 text-[#DC2626]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Open Issues</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{metrics.openIssues}</p>
            </div>
          </Link>
          <Link href={`${projectBase}/preconstruction/variations`} className="flex flex-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-white">
            <FileWarning className="h-5 w-5 text-[#1D4ED8]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Pending Variations</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{metrics.pendingVariations}</p>
            </div>
          </Link>
          <Link href={`${projectBase}/preconstruction/claims`} className="flex flex-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-white">
            <CalendarClock className="h-5 w-5 text-[#0F766E]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Claims This Month</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{metrics.claimsThisMonth}</p>
            </div>
          </Link>
          <Link href={`${projectBase}/job-management/time-sheets`} className="flex flex-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-white">
            <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Active Workers</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{metrics.activeWorkers}</p>
            </div>
          </Link>
        </div>
      </div>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-5">
          <CardTitle className="text-lg font-semibold tracking-[-0.02em] text-[#0F172A]">Action Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-5">
          {isPriorityLoading ? <p className={`${interMedium.className} text-sm text-[#64748B]`}>Loading priority items...</p> : null}
          {!isPriorityLoading && actionRequired.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white px-4 py-4">
              <p className={`${interMedium.className} text-sm text-[#0F172A]`}>No immediate project blockers right now.</p>
            </div>
          ) : null}
          {actionRequired.map((item) => (
            <Link key={item.label} href={item.href} className="block">
              <div className="flex items-center justify-between rounded-[8px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 transition-colors hover:bg-[#FEE2E2]">
                <p className={`${interMedium.className} text-sm font-semibold text-[#7F1D1D]`}>{item.label}</p>
                <div className="flex items-center gap-2">
                  <span className={`${interMedium.className} rounded-full border border-[#FCA5A5] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#B91C1C]`}>
                    {item.value}
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#B91C1C]" />
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#1D4ED8]" />
            <CardTitle className="text-lg font-semibold tracking-[-0.02em] text-[#0F172A]">Project Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pb-5">
          {aiInsights.map((insight, index) => (
            <Link key={`${insight}-${index}`} href={`${projectBase}/drawing-intelligence`} className="block rounded-[8px] border border-[#E6EAF0] bg-white px-3 py-2 hover:bg-[#F8FAFC]">
              <p className={`${interMedium.className} text-sm text-[#0F172A]`}>{insight}</p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-5">
          <button
            type="button"
            onClick={() => setIsProjectActivityOpen((current) => !current)}
            className="flex w-full items-center justify-between text-left"
          >
            <CardTitle className="text-lg font-semibold tracking-[-0.02em] text-[#0F172A]">Project Activity</CardTitle>
            <ChevronRight className={`h-4 w-4 text-[#334155] transition-transform ${isProjectActivityOpen ? "rotate-90" : ""}`} />
          </button>
        </CardHeader>
        {isProjectActivityOpen ? (
          <CardContent className="space-y-2 pb-5">
            {activity.length === 0 ? (
              <p className={`${interMedium.className} text-sm text-[#64748B]`}>No recent project activity.</p>
            ) : (
              activity.map((item) => (
                <Link key={item.id} href={item.href} className="flex items-center justify-between rounded-[8px] border border-[#E6EAF0] bg-white px-3 py-2 hover:bg-[#F8FAFC]">
                  <div className="min-w-0">
                    <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{item.label}</p>
                    <p className={`${interMedium.className} truncate text-xs text-[#64748B]`}>{item.detail}</p>
                  </div>
                  <p className={`${interMedium.className} ml-3 text-xs text-[#64748B]`}>{formatDateTime(item.at)}</p>
                </Link>
              ))
            )}
            {error ? (
              <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2">
                <p className={`${interMedium.className} text-xs font-medium text-rose-800`}>{error}</p>
              </div>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
