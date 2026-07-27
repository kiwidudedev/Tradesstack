"use client";

import Link from "next/link";
import { Fragment, Suspense } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OperationalKpiCard,
  type OperationalKpiTone,
} from "@/components/app/OperationalKpiCard";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { DashboardActivitySkeleton, DashboardSectionSkeleton } from "@/components/app/ProjectRouteSkeletons";
import { useAuth } from "@/hooks/use-auth";
import { formatMoneyOperational } from "@/lib/format/currency";
import { interMedium } from "@/lib/fonts";
import {
  normalizeDashboardAggregateResult,
  type DashboardAggregateResult,
} from "@/lib/project-dashboard-aggregate";
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

interface ProjectDetailsDraft {
  projectName: string;
  clientName: string;
  stage: string;
  location: string;
  createdAt: string;
}

interface OrganizationMemberOption {
  id: string;
  userId: string;
  displayName: string;
  role: string;
}

interface ProjectMemberListItem {
  id: string;
  organization_id: string;
  project_id: string;
  organization_member_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role: string;
  user_id: string;
  display_name: string;
  avatar_path: string | null;
}

function formatStageLabel(stage: string | null | undefined) {
  if (!stage) {
    return "Project";
  }

  if (stage === "Pricing") {
    return "In Progress";
  }

  return stage;
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
  return formatMoneyOperational(value);
}

function buildDashboardInsights(nextMetrics: DashboardMetrics, nextFinancials: FinancialSummary) {
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

  return nextInsights;
}

function buildDashboardActivity(result: DashboardAggregateResult, projectBase: string): ActivityItem[] {
  const taskFeed: ActivityItem[] = result.feeds.tasks.map((row) => ({
    id: `task-${row.id}`,
    label: "Task updated",
    detail: `${String(row.title ?? "Task")} (${String(row.status ?? "")})`,
    at: typeof row.updated_at === "string" ? row.updated_at : "",
    href: `${projectBase}/job-management/todos`,
  }));
  const issueFeed: ActivityItem[] = result.feeds.issues.map((row) => ({
    id: `issue-${row.id}`,
    label: "Issue updated",
    detail: `${String(row.title ?? "Issue")} (${String(row.status ?? "")})`,
    at: typeof row.updated_at === "string" ? row.updated_at : "",
    href: `${projectBase}/job-management/quality-assurance`,
  }));
  const variationFeed: ActivityItem[] = result.feeds.variations.map((row) => ({
    id: `variation-${row.id}`,
    label: "Variation updated",
    detail: `${String(row.variation_number ?? "Variation")} (${String(row.status ?? "")})`,
    at: typeof row.updated_at === "string" ? row.updated_at : "",
    href: `${projectBase}/preconstruction/variations`,
  }));
  const claimFeed: ActivityItem[] = result.feeds.claims.map((row) => ({
    id: `claim-${row.id}`,
    label: "Claim updated",
    detail: `${String(row.claim_number ?? "Claim")} (${String(row.status ?? "")})`,
    at: typeof row.updated_at === "string" ? row.updated_at : "",
    href: `${projectBase}/preconstruction/claims`,
  }));
  const timeFeed: ActivityItem[] = result.feeds.time_events.map((row) => ({
    id: `time-${row.id}`,
    label: "Time sheet event",
    detail: String(row.message ?? String(row.event_type ?? "Time update")),
    at: typeof row.created_at === "string" ? row.created_at : "",
    href: `${projectBase}/job-management/time-sheets`,
  }));
  const signoffFeed: ActivityItem[] = result.feeds.signoffs.map((row) => ({
    id: `signoff-${row.id}`,
    label: "Sign-off updated",
    detail: `${String(row.title ?? "Sign-off")} (${String(row.status ?? "")})`,
    at: typeof row.updated_at === "string" ? row.updated_at : "",
    href: `${projectBase}/job-management/quality-assurance`,
  }));

  return [...taskFeed, ...issueFeed, ...variationFeed, ...claimFeed, ...timeFeed, ...signoffFeed]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
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
  const [isEditingProjectDetails, setIsEditingProjectDetails] = useState(false);
  const [projectDetailsDraft, setProjectDetailsDraft] = useState<ProjectDetailsDraft>({
    projectName: "",
    clientName: "",
    stage: "",
    location: "",
    createdAt: "",
  });
  const [projectMembers, setProjectMembers] = useState<ProjectMemberListItem[]>([]);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMemberOption[]>([]);
  const [isLoadingProjectMembers, setIsLoadingProjectMembers] = useState(false);
  const [projectMembersError, setProjectMembersError] = useState<string | null>(null);
  const [selectedProjectMemberToAdd, setSelectedProjectMemberToAdd] = useState("");
  const [isAddingProjectMember, setIsAddingProjectMember] = useState(false);
  const [removingProjectMemberId, setRemovingProjectMemberId] = useState<string | null>(null);
  const isLoadingRef = useRef(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const projectBase = useMemo(() => `/app/projects/${routeProjectSlug}`, [routeProjectSlug]);

  const overviewCards = useMemo(
    () => [
      {
        label: "Due today",
        value: String(metrics.tasksDueToday),
        helper: `${metrics.overdueTasks} overdue`,
        href: `${projectBase}/job-management/todos`,
        icon: ClipboardList,
        tone: "orange" as OperationalKpiTone,
        helperColorClass: "text-[var(--kpi-fg-orange)]",
      },
      {
        label: "Open issues",
        value: String(metrics.openIssues),
        helper: `${metrics.failedInspections} failed inspections`,
        href: `${projectBase}/job-management/quality-assurance`,
        icon: FileSearch,
        tone: "red" as OperationalKpiTone,
        helperColorClass: "text-[var(--kpi-fg-red)]",
      },
      {
        label: "Active workers",
        value: String(metrics.activeWorkers),
        helper: `${metrics.inspectionsToday} inspections today`,
        href: `${projectBase}/job-management/time-sheets`,
        icon: BriefcaseBusiness,
        tone: "sage" as OperationalKpiTone,
        helperColorClass: "text-[var(--kpi-fg-sage)]",
      },
      {
        label: "Pipeline value",
        value: formatMoney(financials.quoteValue + financials.variationTotal),
        helper: `${financials.claimsSubmitted} claims submitted`,
        href: `${projectBase}/preconstruction/claims`,
        icon: ReceiptText,
        tone: "amber" as OperationalKpiTone,
        helperColorClass: "text-[var(--kpi-fg-orange)]",
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
        href: `${projectBase}/dashboard`,
      })),
    [aiInsights, metrics.openIssues, metrics.overdueTasks, metrics.pendingVariations, metrics.tasksDueToday, projectBase]
  );

  const upcomingItems = useMemo(() => activity.slice(0, 4), [activity]);

  const loadData = async () => {
    if (!supabase || !routeProjectSlug || !session?.id || isLoadingRef.current) {
      return;
    }

    const timingLabel = `[projects][dashboard] load:${routeProjectSlug}`;
    console.time(timingLabel);
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
      const now = new Date();
      const nowIso = now.toISOString();
      const today = now.toISOString().slice(0, 10);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const startOfDayIso = startOfDay.toISOString();
      const endOfDayIso = endOfDay.toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
      const aggregateRpcArgs = {
        p_organization_id: resolvedOrganizationId,
        p_project_slug: routeProjectSlug,
        p_now: nowIso,
        p_today: today,
        p_start_of_day: startOfDayIso,
        p_end_of_day: endOfDayIso,
        p_month_start: monthStart,
        p_month_end: monthEnd,
      };

      const applyAggregateResult = (result: DashboardAggregateResult) => {
        const nextContext: ProjectContext = {
          organizationId: resolvedOrganizationId,
          projectId: result.project.projectId,
          projectName: result.project.projectName,
          stage: result.project.stage,
          location: result.project.location,
          createdAt: result.project.createdAt,
          clientName: result.project.clientName,
        };
        const nextMetrics: DashboardMetrics = {
          overdueTasks: result.metrics.overdueTasks,
          awaitingVariationApproval: result.metrics.awaitingVariationApproval,
          claimReadyToSend: result.metrics.claimReadyToSend,
          openIssues: result.metrics.openIssues,
          failedInspections: result.metrics.failedInspections,
          tasksDueToday: result.metrics.tasksDueToday,
          pendingVariations: result.metrics.pendingVariations,
          claimsThisMonth: result.metrics.claimsThisMonth,
          activeWorkers: result.metrics.activeWorkers,
          pendingSignoffs: result.metrics.pendingSignoffs,
          inspectionsToday: result.metrics.inspectionsToday,
        };
        const nextFinancials: FinancialSummary = {
          quoteValue: result.financials.quoteValue,
          variationTotal: result.financials.variationTotal,
          claimsSubmitted: result.financials.claimsSubmitted,
          claimsPaidAmount: result.financials.claimsPaidAmount,
          claimsUnpaidAmount: result.financials.claimsUnpaidAmount,
          poOutstandingCount: result.financials.poOutstandingCount,
          poOutstandingAmount: result.financials.poOutstandingAmount,
        };

        setContext(nextContext);
        setProjectDetailsDraft({
          projectName: nextContext.projectName,
          clientName: nextContext.clientName,
          stage: nextContext.stage,
          location: nextContext.location,
          createdAt: nextContext.createdAt,
        });
        setMetrics(nextMetrics);
        setFinancials(nextFinancials);
        setAiInsights(buildDashboardInsights(nextMetrics, nextFinancials));
        setActivity(buildDashboardActivity(result, projectBase));
      };

      const { data: aggregateData, error: aggregateError } = await supabase.rpc("get_project_dashboard_aggregate", aggregateRpcArgs);
      if (!aggregateError) {
        const normalizedAggregate = normalizeDashboardAggregateResult(aggregateData);
        if (normalizedAggregate) {
          applyAggregateResult(normalizedAggregate);
          console.info("[projects][dashboard] query-count", {
            projectSlug: routeProjectSlug,
            approximateQueries: (session.organizationId ? 0 : 1) + 1,
            source: "aggregate-rpc",
          });
          return;
        }

        console.warn("[projects][dashboard] aggregate rpc returned unexpected shape", {
          projectSlug: routeProjectSlug,
          returnedType: Array.isArray(aggregateData) ? "array" : typeof aggregateData,
        });
      } else {
        console.error("[projects][dashboard] aggregate rpc error", {
          projectSlug: routeProjectSlug,
          message: aggregateError.message,
        });
      }

      console.warn("[projects][dashboard] falling back to legacy dashboard loader", {
        projectSlug: routeProjectSlug,
      });

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
        openTaskDatesResult,
        issuesSummaryResult,
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
          .select("id, title, status, due_at, due_date, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .neq("status", "Done")
          .neq("status", "Archived")
          .order("updated_at", { ascending: false }),
        issuesTable
          .select("id, title, status, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false }),
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
        openTaskDatesResult.error ??
        issuesSummaryResult.error ??
        failedInspectionsCountResult.error ??
        awaitingVariationApprovalCountResult.error ??
        claimReadyToSendCountResult.error ??
        claimsThisMonthCountResult.error ??
        activeWorkersCountResult.error;

      if (priorityError) {
        throw new Error(priorityError.message ?? "Unable to load project dashboard.");
      }

      const openTaskRows = (openTaskDatesResult.data ?? []) as Array<Record<string, unknown>>;
      const overdueTasks = openTaskRows.reduce((sum, row) => {
        const dueAt = typeof row.due_at === "string" ? row.due_at : null;
        const dueDate = typeof row.due_date === "string" ? row.due_date : null;

        if (dueAt) {
          return sum + (dueAt < nowIso ? 1 : 0);
        }

        if (dueDate) {
          return sum + (dueDate < today ? 1 : 0);
        }

        return sum;
      }, 0);

      const tasksDueToday = openTaskRows.reduce((sum, row) => {
        const dueAt = typeof row.due_at === "string" ? row.due_at : null;
        const dueDate = typeof row.due_date === "string" ? row.due_date : null;

        if (dueAt) {
          return sum + (dueAt >= startOfDayIso && dueAt < endOfDayIso ? 1 : 0);
        }

        if (dueDate) {
          return sum + (dueDate === today ? 1 : 0);
        }

        return sum;
      }, 0);

      const issuesRows = (issuesSummaryResult.data ?? []) as Array<Record<string, unknown>>;
      const openIssues = issuesRows.filter((row) => {
        const status = String(row.status ?? "");
        return status === "Open" || status === "In Progress" || status === "Blocked" || status === "Requires Attention";
      }).length;

      const [
        inspectionsTodayExactRowsResult,
        latestQuoteResult,
        variationsSummaryResult,
        claimsSummaryResult,
        poSummaryResult,
        variationsFeedResult,
        claimsFeedResult,
        timeFeedResult,
        signoffSummaryResult,
      ] = await Promise.all([
        inspectionsTable
          .select("id, scheduled_at", { count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectId)
          .gte("scheduled_at", startOfDayIso)
          .lt("scheduled_at", endOfDayIso),
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
          .limit(200),
      ]);

      const secondaryError =
        inspectionsTodayExactRowsResult.error ??
        latestQuoteResult.error ??
        variationsSummaryResult.error ??
        claimsSummaryResult.error ??
        poSummaryResult.error ??
        variationsFeedResult.error ??
        claimsFeedResult.error ??
        timeFeedResult.error ??
        signoffSummaryResult.error;

      if (secondaryError) {
        throw new Error(secondaryError.message ?? "Unable to load extended dashboard data.");
      }

      const inspectionAuditRows = (inspectionsTodayExactRowsResult.data ?? []) as Array<Record<string, unknown>>;
      const signoffRows = (signoffSummaryResult.data ?? []) as Array<Record<string, unknown>>;
      const pendingSignoffs = signoffRows.filter((row) => {
        const status = String(row.status ?? "");
        return status === "Pending" || status === "Requested";
      }).length;
      const variationsRows = (variationsSummaryResult.data ?? []) as Array<Record<string, unknown>>;
      const claimsRows = (claimsSummaryResult.data ?? []) as Array<Record<string, unknown>>;
      const poRows = (poSummaryResult.data ?? []) as Array<Record<string, unknown>>;
      const outstandingPoRows = poRows.filter((row) => {
        const status = String(row.status ?? "");
        return status !== "Invoiced" && status !== "Cancelled" && status !== "Received";
      });

      const fallbackAggregate: DashboardAggregateResult = {
        project: {
          projectId,
          projectName: String(projectRow.name ?? "Project"),
          stage: String(projectRow.stage ?? "Planning"),
          location: String(projectRow.location ?? ""),
          createdAt: typeof projectRow.created_at === "string" ? projectRow.created_at : nowIso,
          clientName: String(clientResult.data?.name ?? "Unassigned"),
        },
        metrics: {
          overdueTasks,
          awaitingVariationApproval: awaitingVariationApprovalCountResult.count ?? 0,
          claimReadyToSend: claimReadyToSendCountResult.count ?? 0,
          openIssues,
          failedInspections: failedInspectionsCountResult.count ?? 0,
          tasksDueToday,
          pendingVariations: awaitingVariationApprovalCountResult.count ?? 0,
          claimsThisMonth: claimsThisMonthCountResult.count ?? 0,
          activeWorkers: activeWorkersCountResult.count ?? 0,
          pendingSignoffs,
          inspectionsToday: inspectionsTodayExactRowsResult.count ?? inspectionAuditRows.length,
        },
        financials: {
          quoteValue: typeof latestQuoteResult.data?.total_quote_price === "number" ? latestQuoteResult.data.total_quote_price : 0,
          variationTotal: variationsRows.reduce(
            (sum, row) => sum + (typeof row.total_variation_price === "number" ? row.total_variation_price : 0),
            0
          ),
          claimsSubmitted: claimsRows.filter((row) => {
            const status = String(row.status ?? "");
            return status === "Submitted" || status === "Unpaid" || status === "Paid" || status === "Overdue";
          }).length,
          claimsPaidAmount: claimsRows.filter((row) => {
            const status = String(row.status ?? "");
            return status === "Submitted" || status === "Unpaid" || status === "Paid" || status === "Overdue";
          }).reduce((sum, row) => sum + (typeof row.paid_amount === "number" ? row.paid_amount : 0), 0),
          claimsUnpaidAmount: claimsRows.filter((row) => {
            const status = String(row.status ?? "");
            return status === "Submitted" || status === "Unpaid" || status === "Overdue";
          }).reduce((sum, row) => {
            const claimAmount = typeof row.claim_amount === "number" ? row.claim_amount : 0;
            const paidAmount = typeof row.paid_amount === "number" ? row.paid_amount : 0;
            return sum + Math.max(0, claimAmount - paidAmount);
          }, 0),
          poOutstandingCount: outstandingPoRows.length,
          poOutstandingAmount: outstandingPoRows.reduce(
            (sum, row) => sum + (typeof row.total_purchase_order_price === "number" ? row.total_purchase_order_price : 0),
            0
          ),
        },
        feeds: {
          tasks: openTaskRows.slice(0, 6).map((row) => ({
            id: String(row.id ?? ""),
            title: String(row.title ?? "Task"),
            status: String(row.status ?? ""),
            updated_at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
          })),
          issues: issuesRows.slice(0, 6).map((row) => ({
            id: String(row.id ?? ""),
            title: String(row.title ?? "Issue"),
            status: String(row.status ?? ""),
            updated_at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
          })),
          variations: ((variationsFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id ?? ""),
            variation_number: String(row.variation_number ?? "Variation"),
            status: String(row.status ?? ""),
            updated_at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
          })),
          claims: ((claimsFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id ?? ""),
            claim_number: String(row.claim_number ?? "Claim"),
            status: String(row.status ?? ""),
            updated_at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
          })),
          time_events: ((timeFeedResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id ?? ""),
            event_type: String(row.event_type ?? "Time update"),
            message: String(row.message ?? String(row.event_type ?? "Time update")),
            created_at: typeof row.created_at === "string" ? row.created_at : nowIso,
          })),
          signoffs: signoffRows.slice(0, 6).map((row) => ({
            id: String(row.id ?? ""),
            title: String(row.title ?? "Sign-off"),
            status: String(row.status ?? ""),
            updated_at: typeof row.updated_at === "string" ? row.updated_at : nowIso,
          })),
        },
      };

      applyAggregateResult(fallbackAggregate);
      console.info("[projects][dashboard] query-count", {
        projectSlug: routeProjectSlug,
        approximateQueries: (session.organizationId ? 0 : 1) + 1 + 8 + 9,
        source: "legacy-fallback",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project command centre.");
    } finally {
      console.timeEnd(timingLabel);
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectSlug, session?.id, session?.organizationId, supabase]);

  useEffect(() => {
    if (!supabase || !context?.organizationId || !context.projectId) {
      return;
    }

    let isCancelled = false;

    const loadProjectTeamData = async () => {
      const timingLabel = `[projects][dashboard][team] load:${routeProjectSlug}`;
      console.time(timingLabel);
      setIsLoadingProjectMembers(true);
      setProjectMembersError(null);
      setSelectedProjectMemberToAdd("");

      try {
        const [projectMembersResult, organizationMembersResult] = await Promise.all([
          supabase.rpc("list_project_members", {
            p_organization_id: context.organizationId,
            p_project_id: context.projectId,
          }),
          supabase
            .from("organization_members")
            .select("id, user_id, display_name, role")
            .eq("organization_id", context.organizationId)
            .order("display_name", { ascending: true }),
        ]);

        if (projectMembersResult.error || organizationMembersResult.error) {
          throw new Error(projectMembersResult.error?.message ?? organizationMembersResult.error?.message ?? "Unable to load project team.");
        }

        if (isCancelled) {
          return;
        }

        const nextProjectMembers = (projectMembersResult.data ?? []) as ProjectMemberListItem[];
        const nextOrganizationMembers = ((organizationMembersResult.data ?? []) as Array<Record<string, unknown>>)
          .map((member) => ({
            id: typeof member.id === "string" ? member.id : "",
            userId: typeof member.user_id === "string" ? member.user_id : "",
            displayName: typeof member.display_name === "string" && member.display_name.trim().length > 0 ? member.display_name : "Unnamed user",
            role: typeof member.role === "string" ? member.role : "worker",
          }))
          .filter((member) => member.id && member.userId);

        setProjectMembers(nextProjectMembers);
        setOrganizationMembers(nextOrganizationMembers);
      } catch (loadProjectTeamError) {
        if (!isCancelled) {
          setProjectMembersError(loadProjectTeamError instanceof Error ? loadProjectTeamError.message : "Unable to load project team.");
        }
      } finally {
        console.info("[projects][dashboard][team] query-count", {
          projectSlug: routeProjectSlug,
          approximateQueries: 2,
        });
        console.timeEnd(timingLabel);
        if (!isCancelled) {
          setIsLoadingProjectMembers(false);
        }
      }
    };

    void loadProjectTeamData();

    return () => {
      isCancelled = true;
    };
  }, [context?.organizationId, context?.projectId, supabase]);

  const activeProjectMemberIds = useMemo(
    () => new Set(projectMembers.filter((member) => member.is_active).map((member) => member.organization_member_id)),
    [projectMembers]
  );

  const availableOrganizationMembers = useMemo(
    () => organizationMembers.filter((member) => !activeProjectMemberIds.has(member.id)),
    [activeProjectMemberIds, organizationMembers]
  );

  const handleAddProjectMember = async (organizationMemberId: string) => {
    if (!supabase || !context?.organizationId || !context.projectId || !organizationMemberId || isAddingProjectMember) {
      return;
    }

    setIsAddingProjectMember(true);
    setProjectMembersError(null);

    try {
      const { data, error: addError } = await supabase.rpc("add_project_member", {
        p_organization_id: context.organizationId,
        p_project_id: context.projectId,
        p_organization_member_id: organizationMemberId,
      });

      if (addError) {
        throw new Error(addError.message);
      }

      const addedMember = (data?.[0] ?? null) as {
        id: string;
        organization_id: string;
        project_id: string;
        organization_member_id: string;
        created_by: string;
        is_active: boolean;
        removed_at: string | null;
        removed_by: string | null;
        created_at: string;
        updated_at: string;
      } | null;

      if (!addedMember) {
        throw new Error("Project member could not be added.");
      }

      const matchingMember = organizationMembers.find((member) => member.id === organizationMemberId);

      setProjectMembers((previous) => {
        const nextRows = previous.filter((member) => member.organization_member_id !== organizationMemberId);
        const nextMember: ProjectMemberListItem = {
          id: addedMember.id,
          organization_id: addedMember.organization_id,
          project_id: addedMember.project_id,
          organization_member_id: addedMember.organization_member_id,
          is_active: addedMember.is_active,
          created_at: addedMember.created_at,
          updated_at: addedMember.updated_at,
          role: matchingMember?.role ?? "worker",
          user_id: matchingMember?.userId ?? "",
          display_name: matchingMember?.displayName ?? "Unnamed user",
          avatar_path: null,
        };

        return [...nextRows, nextMember].sort((left, right) => left.display_name.localeCompare(right.display_name, undefined, { sensitivity: "base" }));
      });
      setSelectedProjectMemberToAdd("");
    } catch (addProjectMemberError) {
      setProjectMembersError(addProjectMemberError instanceof Error ? addProjectMemberError.message : "Unable to add project member.");
    } finally {
      setIsAddingProjectMember(false);
      setSelectedProjectMemberToAdd("");
    }
  };

  const handleRemoveProjectMember = async (member: ProjectMemberListItem) => {
    if (!supabase || !context?.organizationId || !context.projectId || removingProjectMemberId) {
      return;
    }

    setRemovingProjectMemberId(member.id);
    setProjectMembersError(null);

    try {
      const { error: removeError } = await supabase.rpc("remove_project_member", {
        p_organization_id: context.organizationId,
        p_project_id: context.projectId,
        p_organization_member_id: member.organization_member_id,
      });

      if (removeError) {
        throw new Error(removeError.message);
      }

      setProjectMembers((previous) => previous.filter((entry) => entry.id !== member.id));
    } catch (removeProjectMemberError) {
      setProjectMembersError(removeProjectMemberError instanceof Error ? removeProjectMemberError.message : "Unable to remove project member.");
    } finally {
      setRemovingProjectMemberId(null);
    }
  };

  const detailRows = [
    {
      key: "projectName",
      label: "Project Name:",
      value: context?.projectName ?? "Loading project...",
      draftValue: projectDetailsDraft.projectName,
    },
    {
      key: "clientName",
      label: "Client:",
      value: context?.clientName ?? "Unassigned",
      draftValue: projectDetailsDraft.clientName,
    },
    {
      key: "stage",
      label: "Stage:",
      value: context?.stage ?? "Planning",
      draftValue: projectDetailsDraft.stage,
    },
    {
      key: "location",
      label: "Location:",
      value: context?.location || "Not set",
      draftValue: projectDetailsDraft.location,
    },
    {
      key: "createdAt",
      label: "Created:",
      value: formatDateTime(context?.createdAt ?? null),
      draftValue: projectDetailsDraft.createdAt,
    },
  ] as const;

  return (
    <main className="app-canvas -mb-8 space-y-6 bg-[var(--background)] pb-8">
      <Suspense fallback={<DashboardSectionSkeleton />}>
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block transition hover:opacity-90"
                >
                  <OperationalKpiCard
                    label={item.label}
                    value={item.value}
                    helper={<span className={item.helperColorClass}>{item.helper}</span>}
                    icon={<Icon className="h-5 w-5" strokeWidth={2.1} />}
                    tone={item.tone}
                  />
                </Link>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.35fr)] xl:items-start">
            <OperationalPanel
              className="h-fit"
              title="Project Details"
              actions={
                isEditingProjectDetails ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (context) {
                          setProjectDetailsDraft({
                            projectName: context.projectName,
                            clientName: context.clientName,
                            stage: context.stage,
                            location: context.location,
                            createdAt: context.createdAt,
                          });
                        }
                        setIsEditingProjectDetails(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setContext((previous) =>
                          previous
                            ? {
                                ...previous,
                                projectName: projectDetailsDraft.projectName,
                                clientName: projectDetailsDraft.clientName,
                                stage: projectDetailsDraft.stage,
                                location: projectDetailsDraft.location,
                                createdAt: projectDetailsDraft.createdAt,
                              }
                            : previous
                        );
                        setIsEditingProjectDetails(false);
                      }}
                    >
                      Save
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditingProjectDetails(true)}
                  >
                    Edit details
                  </Button>
                )
              }
            >
              <div className="grid gap-x-4 gap-y-3 md:grid-cols-[160px_minmax(0,1fr)]">
                {detailRows.map((row) => (
                  <Fragment key={row.key}>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">{row.label}</p>
                    {isEditingProjectDetails ? (
                      <input
                        value={row.draftValue}
                        onChange={(event) =>
                          setProjectDetailsDraft((previous) => ({
                            ...previous,
                            [row.key]: event.target.value,
                          }))
                        }
                        className="h-[2.9rem] rounded-[0.85rem] border border-[var(--border)] bg-[var(--surface)] px-4 text-[15px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]"
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-[var(--text-primary)]">{row.value}</p>
                    )}
                  </Fragment>
                ))}
                {!isEditingProjectDetails ? (
                  <>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">Project Team:</p>
                    <div>
                      {isLoadingProjectMembers ? (
                        <p className="text-[15px] font-medium text-[var(--text-secondary)]">Loading project team...</p>
                      ) : projectMembers.length > 0 ? (
                        <div className="space-y-1.5">
                          {projectMembers.map((member) => (
                            <div key={member.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="text-[15px] font-medium text-[var(--text-primary)]">{member.display_name}</p>
                              <span className="text-[14px] font-medium uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                                {member.role.replace(/_/g, " ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[15px] font-medium text-[var(--text-secondary)]">No members assigned</p>
                      )}
                    </div>
                  </>
                ) : null}
                {isEditingProjectDetails ? (
                  <>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">Project Team:</p>
                    <div className="space-y-3">
                      {isLoadingProjectMembers ? (
                        <p className="text-[16px] font-medium text-[var(--text-secondary)]">Loading project team...</p>
                      ) : projectMembers.length > 0 ? (
                        <div className="space-y-2">
                          {projectMembers.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between gap-3 rounded-[0.85rem] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[16px] font-medium text-[var(--text-primary)]">{member.display_name}</p>
                                <p className="mt-0.5 text-[13px] font-medium uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                                  {member.role.replace(/_/g, " ")}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleRemoveProjectMember(member)}
                                disabled={removingProjectMemberId === member.id || isAddingProjectMember}
                                className="inline-flex shrink-0 items-center justify-center rounded-[0.7rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--error)] transition hover:bg-[var(--error-light)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {removingProjectMemberId === member.id ? "Removing..." : "Remove"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[16px] font-medium text-[var(--text-secondary)]">No members assigned yet</p>
                      )}

                      {availableOrganizationMembers.length > 0 ? (
                        <select
                          value={selectedProjectMemberToAdd}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setSelectedProjectMemberToAdd(nextValue);
                            if (nextValue) {
                              void handleAddProjectMember(nextValue);
                            }
                          }}
                          disabled={isLoadingProjectMembers || isAddingProjectMember || Boolean(removingProjectMemberId)}
                          className="h-[2.9rem] w-full rounded-[0.85rem] border border-[var(--border)] bg-[var(--surface)] px-4 text-[16px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-muted)]"
                        >
                          <option value="">{isAddingProjectMember ? "Adding member..." : "Add member"}</option>
                          {availableOrganizationMembers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.displayName} ({member.role.replace(/_/g, " ")})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-[14px] font-medium text-[var(--text-secondary)]">All organization members are already assigned.</p>
                      )}

                      {projectMembersError ? (
                        <p className="text-[14px] font-medium text-[var(--error)]">{projectMembersError}</p>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </OperationalPanel>

            <OperationalPanel className="h-full" title="Today's Priority" contentClassName="flex h-full flex-col p-6 pt-6">
              {(focusItems.length > 0 ? focusItems : aiInsights.map((insight, index) => ({
                id: `insight-${index}`,
                title: insight,
                href: `${projectBase}/dashboard`,
              }))).map((item, index, items) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`grid grid-cols-[auto_1fr] items-start gap-3 py-4 transition-colors hover:bg-[var(--app-surface)] ${index < items.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--info-light)]">
                    <input
                      type="checkbox"
                      checked={false}
                      readOnly
                      aria-label={`Mark ${item.title} complete`}
                      className="h-4 w-4 shrink-0 accent-[var(--info)]"
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-[1.35] text-[var(--text-primary)]">{item.title}</p>
                    <p className="mt-1 text-[13px] font-medium text-[var(--text-secondary)]">
                      Assigned to: {index === 0 ? "Project Lead" : index === 1 ? "Site Manager" : "Operations Team"}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                      <span
                        className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold ${
                          index === 0
                            ? "bg-[var(--error-light)] text-[var(--error)]"
                            : "bg-[var(--warning-light)] text-[var(--warning)]"
                        }`}
                      >
                        {index === 0 ? "High Priority" : "Medium Priority"}
                      </span>
                      <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                        Due: {index === 0 ? "Today" : index === 1 ? "Tomorrow" : "This Week"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </OperationalPanel>
          </div>

        </section>
      </Suspense>

      <Suspense fallback={<DashboardActivitySkeleton />}>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
          <OperationalPanel className="h-fit" title="What's Coming Up Next" contentClassName="space-y-[0.65rem] p-6">
            {upcomingItems.length === 0 ? (
              <div className="app-surface rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-4">
                <p className={`${interMedium.className} text-sm text-[var(--text-secondary)]`}>No recent project activity.</p>
              </div>
            ) : (
              upcomingItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="app-surface block rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-3 transition hover:bg-[var(--app-surface)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.label}</p>
                      <p className={`${interMedium.className} mt-0.5 truncate text-[13px] text-[var(--text-secondary)]`}>{item.detail}</p>
                    </div>
                    <span className={`${interMedium.className} shrink-0 rounded-full bg-[var(--warning-light)] px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-[var(--orange-primary)]`}>
                      Live
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <p className={`${interMedium.className} text-[13px] text-[var(--text-secondary)]`}>{formatDateTime(item.at)}</p>
                    <span className="text-[13px] font-semibold text-[var(--navy-primary)]">View</span>
                  </div>
                </Link>
              ))
            )}
            {error ? (
              <div className="rounded-[18px] border border-[var(--error-light)] bg-[var(--error-light)] px-4 py-3">
                <p className={`${interMedium.className} text-sm text-[var(--error)]`}>{error}</p>
              </div>
            ) : null}
          </OperationalPanel>
          <div />
        </section>
      </Suspense>

    </main>
  );
}
