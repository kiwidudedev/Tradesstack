"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  Pencil,
  ReceiptText,
  Sparkles,
} from "lucide-react";
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

const EMPTY_FINANCIALS: FinancialSummary = {
  quoteValue: 0,
  variationTotal: 0,
  claimsSubmitted: 0,
  claimsPaidAmount: 0,
  claimsUnpaidAmount: 0,
  poOutstandingCount: 0,
  poOutstandingAmount: 0,
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
  const [financials, setFinancials] = useState<FinancialSummary>(EMPTY_FINANCIALS);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const isLoadingRef = useRef(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const projectBase = useMemo(() => `/app/projects/${routeProjectSlug}`, [routeProjectSlug]);
  const tradePackCardClassName =
    "app-surface app-surface-border rounded-[30px] border shadow-none";

  const overviewCards = useMemo(
    () => [
      {
        label: "Tasks due today",
        value: String(metrics.tasksDueToday),
        meta: `${metrics.overdueTasks} overdue`,
        href: `${projectBase}/job-management/todos`,
        icon: ClipboardList,
        iconClassName: "bg-[#ffe9de] text-[#f74917]",
      },
      {
        label: "Open issues",
        value: String(metrics.openIssues),
        meta: `${metrics.failedInspections} failed inspections`,
        href: `${projectBase}/job-management/quality-assurance`,
        icon: FileSearch,
        iconClassName: "bg-[#e8eef2] text-[#0b2639]",
      },
      {
        label: "Active workers",
        value: String(metrics.activeWorkers),
        meta: `${metrics.inspectionsToday} inspections today`,
        href: `${projectBase}/job-management/time-sheets`,
        icon: BriefcaseBusiness,
        iconClassName: "bg-[#dff1e5] text-[#2f6b4f]",
      },
      {
        label: "Pipeline value",
        value: formatMoney(financials.quoteValue + financials.variationTotal),
        meta: `${financials.claimsSubmitted} claims submitted`,
        href: `${projectBase}/preconstruction/claims`,
        icon: ReceiptText,
        iconClassName: "bg-[#f3ead6] text-[#8a6731]",
      },
    ],
    [
      financials.claimsSubmitted,
      financials.quoteValue,
      financials.variationTotal,
      metrics.activeWorkers,
      metrics.failedInspections,
      metrics.inspectionsToday,
      metrics.openIssues,
      metrics.overdueTasks,
      metrics.tasksDueToday,
      projectBase,
    ]
  );

  const focusItems = useMemo(
    () =>
      aiInsights.slice(0, 2).map((insight, index) => ({
        id: `focus-${index}`,
        eyebrow: index === 0 ? "Priority focus" : "Project insight",
        title: insight,
        detail:
          index === 0
            ? `${metrics.tasksDueToday} due today, ${metrics.overdueTasks} overdue.`
            : `${metrics.pendingVariations} pending variations and ${metrics.openIssues} open issues in play.`,
        href: `${projectBase}/drawing-intelligence`,
      })),
    [aiInsights, metrics.openIssues, metrics.overdueTasks, metrics.pendingVariations, metrics.tasksDueToday, projectBase]
  );

  const upcomingItems = useMemo(() => activity.slice(0, 4), [activity]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const loadData = async () => {
    if (!supabase || !routeProjectSlug || !session?.id || isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
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
      setFinancials(nextFinancials);
      setAiInsights(nextInsights);
      setActivity(sortedActivity);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project command centre.");
    } finally {
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectSlug, session?.id, session?.organizationId, supabase]);

  return (
    <main className="app-canvas -mb-8 space-y-6 pb-10">
      <section className="flex flex-col justify-between gap-4 pt-[0.15rem] xl:flex-row xl:items-start">
        <div className="space-y-2">
          <h1 className="mt-[0.45rem] max-w-[920px] text-[clamp(1.55rem,2.8vw,2.6rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-[#1d1d1d]">
            {context?.projectName ?? "Project Dashboard"}
          </h1>
          <p className={`${interMedium.className} mt-[0.65rem] max-w-none text-[15px] leading-[1.45] text-[#6b6b6b]`}>
            Your project dashboard
          </p>
        </div>

        <div className="flex flex-col items-start gap-[0.55rem] xl:items-end">
          <p className={`${interMedium.className} m-0 max-w-[260px] text-[15px] text-[#6b6b6b] xl:text-right`}>
            {new Intl.DateTimeFormat("en-NZ", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            }).format(currentTime)}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-[0.4rem] rounded-[999px] border border-[#0b2639] bg-[#0b2639] px-[0.7rem] py-[0.55rem] text-[15px] text-white transition hover:opacity-90"
          >
            <Pencil className="h-4 w-4" />
            Edit dashboard
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card className={tradePackCardClassName}>
          <CardHeader className="pb-[0.7rem]">
            <CardTitle className="mt-[0.45rem] text-[1.4rem] leading-none tracking-[-0.03em] text-[#1d1d1d]">Project Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-[0.65rem] pt-0">
            <div className="space-y-4">
              <div className="border-b border-[rgba(17,17,17,0.08)] pb-3">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#8a8a8a]`}>Project name</p>
                <p className="mt-[0.3rem] text-[15px] font-semibold text-[#1d1d1d]">{context?.projectName ?? "Loading project..."}</p>
              </div>
              <div className="border-b border-[rgba(17,17,17,0.08)] pb-3">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#8a8a8a]`}>Client</p>
                <p className="mt-[0.3rem] text-[15px] font-semibold text-[#1d1d1d]">{context?.clientName ?? "Unassigned"}</p>
              </div>
              <div className="border-b border-[rgba(17,17,17,0.08)] pb-3">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#8a8a8a]`}>Stage</p>
                <p className="mt-[0.3rem] text-[15px] font-semibold text-[#1d1d1d]">{context?.stage ?? "Planning"}</p>
              </div>
              <div className="border-b border-[rgba(17,17,17,0.08)] pb-3">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#8a8a8a]`}>Location</p>
                <p className="mt-[0.3rem] text-[15px] font-semibold text-[#1d1d1d]">{context?.location || "Not set"}</p>
              </div>
              <div>
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#8a8a8a]`}>Created</p>
                <p className="mt-[0.3rem] text-[15px] font-semibold text-[#1d1d1d]">{formatDateTime(context?.createdAt ?? null)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={tradePackCardClassName}>
          <CardHeader className="pb-[0.7rem]">
            <CardTitle className="mt-[0.45rem] text-[1.4rem] leading-none tracking-[-0.03em] text-[#1d1d1d]">Performance at a glance</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-[0.7rem] md:grid-cols-2">
              {overviewCards.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="app-surface app-surface-border rounded-[1.15rem] border p-[0.9rem] shadow-none transition hover:bg-[var(--app-surface)]"
                  >
                    <div className="flex items-center gap-[0.55rem]">
                      <span className={`inline-flex h-[1.7rem] w-[1.7rem] items-center justify-center rounded-[0.65rem] ${item.iconClassName}`}>
                        <Icon className="h-[1.125rem] w-[1.125rem]" />
                      </span>
                      <p className={`${interMedium.className} text-[15px] text-[#6b6b6b]`}>{item.label}</p>
                    </div>
                    <p className="mt-[0.7rem] text-[clamp(1.4rem,2.1vw,1.95rem)] font-semibold leading-none tracking-[0.01em] text-[#1d1d1d]">{item.value}</p>
                    <p className={`${interMedium.className} mt-[0.45rem] text-[15px] text-[#6b6b6b]`}>{item.meta}</p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card className={tradePackCardClassName}>
          <CardHeader className="pb-[0.7rem]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-[1rem] w-[1rem] text-[#f74917]" />
              <CardTitle className="mt-[0.45rem] text-[1.4rem] leading-none tracking-[-0.03em] text-[#1d1d1d]">Focus for the day</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-[0.65rem] pt-0">
            {(focusItems.length > 0 ? focusItems : aiInsights.map((insight, index) => ({
              id: `insight-${index}`,
              eyebrow: "Project insight",
              title: insight,
              detail: "Open the workspace to keep this item moving.",
              href: `${projectBase}/drawing-intelligence`,
            }))).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="app-surface app-surface-border grid grid-cols-[auto_1fr_auto] items-center gap-[0.7rem] rounded-[1rem] border px-[0.75rem] py-[0.7rem] shadow-none transition hover:bg-[var(--app-surface)]"
              >
                <span className="inline-flex h-[1.65rem] w-[1.65rem] shrink-0 items-center justify-center rounded-full bg-[#dff1e5] text-[#2f6b4f]">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#f74917]`}>{item.eyebrow}</p>
                  <p className="mt-[0.25rem] text-[15px] font-semibold text-[#1d1d1d]">{item.title}</p>
                  <p className={`${interMedium.className} mt-[0.25rem] text-[15px] leading-[1.5] text-[#6b6b6b]`}>{item.detail}</p>
                </div>
                <span className={`${interMedium.className} app-surface rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[#0b2639] shadow-none`}>
                  Open
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className={tradePackCardClassName}>
          <CardHeader className="pb-[0.7rem]">
            <CardTitle className="mt-[0.45rem] text-[1.4rem] leading-none tracking-[-0.03em] text-[#1d1d1d]">What&apos;s coming up next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-[0.65rem] pt-0">
            {upcomingItems.length === 0 ? (
              <div className="app-surface app-surface-border rounded-[1rem] border px-4 py-4 shadow-none">
                <p className={`${interMedium.className} text-[15px] text-[#6b6b6b]`}>No recent project activity.</p>
              </div>
            ) : (
              upcomingItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="app-surface app-surface-border block rounded-[1rem] border px-[0.75rem] py-[0.7rem] shadow-none transition hover:bg-[var(--app-surface)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[#1d1d1d]">{item.label}</p>
                      <p className={`${interMedium.className} mt-[0.25rem] truncate text-[15px] text-[#6b6b6b]`}>{item.detail}</p>
                    </div>
                    <span className={`${interMedium.className} shrink-0 rounded-full bg-[rgba(255,228,215,0.95)] px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-[#f74917]`}>
                      Live
                    </span>
                  </div>
                  <div className="mt-[0.45rem] flex items-center justify-between gap-3">
                    <p className={`${interMedium.className} text-[15px] text-[#6b6b6b]`}>{formatDateTime(item.at)}</p>
                    <span className="text-[15px] font-semibold text-[#0b2639]">View</span>
                  </div>
                </Link>
              ))
            )}
            {error ? (
              <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3">
                <p className={`${interMedium.className} text-sm text-rose-800`}>{error}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

    </main>
  );
}
