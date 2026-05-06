import { redirect } from "next/navigation";
import { DashboardWorkspace } from "./DashboardWorkspace";
import { getLiveOpportunitiesForCurrentUser } from "@/lib/leads-clients-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getTradePackWorkspacesForCurrentUser } from "@/lib/trade-pack-workspaces-server";

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

function getGreeting(value: Date): string {
  const hour = value.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long" }).format(value);
}

function formatShortDate(value: Date): string {
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short" }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DashboardPage() {
  const [member, opportunities, projects] = await Promise.all([
    getCurrentOrganizationMember(),
    getLiveOpportunitiesForCurrentUser(),
    getTradePackWorkspacesForCurrentUser(),
  ]);

  if (!member) {
    redirect("/login");
  }

  const now = new Date();
  const firstName = toFirstName(member.display_name ?? null);
  const greeting = getGreeting(now);
  const dateLabel = formatLongDate(now);
  const initialTimeIso = now.toISOString();

  const newRequests = opportunities.filter((row) => row.stage === "New");
  const quotesInProgress = opportunities.filter((row) => row.stage === "Pricing" || row.stage === "Quoted");
  const activeProjects = projects.filter((row) => row.stage === "Construction");
  const awaitingPayment = opportunities.filter((row) => row.stage === "Quoted" || row.stage === "Won");
  const totalPipelineValue = opportunities.reduce((sum, row) => sum + row.valueNZD, 0);

  const overviewCards = [
    {
      label: "New requests",
      value: String(newRequests.length),
      meta: `${opportunities.filter((row) => row.stage === "Reviewing").length} in review`,
      tone: "accent" as const,
    },
    {
      label: "Quotes in progress",
      value: String(quotesInProgress.length),
      meta: `${opportunities.filter((row) => row.stage === "Quoted").length} approved`,
      tone: "ink" as const,
    },
    {
      label: "Active jobs",
      value: String(activeProjects.length),
      meta: `${projects.filter((row) => row.stage === "Pricing").length} still pricing`,
      tone: "sage" as const,
    },
    {
      label: "Pipeline value",
      value: formatMoney(totalPipelineValue),
      meta: `${awaitingPayment.length} awaiting payment`,
      tone: "gold" as const,
    },
  ];

  const todoItems = [
    {
      title: "Follow up new requests",
      count: newRequests.length,
      detail: "Reach out and confirm project scope details.",
    },
    {
      title: "Finish draft quotes",
      count: opportunities.filter((row) => row.stage === "Pricing").length,
      detail: "Move pricing work through to approval.",
    },
    {
      title: "Invoice won work",
      count: opportunities.filter((row) => row.stage === "Won").length,
      detail: "Send invoices for converted and awarded jobs.",
    },
    {
      title: "Review expired quotes",
      count: opportunities.filter((row) => row.latestQuoteStatus === "Expired").length,
      detail: "Reconnect with leads that need a refreshed quote.",
    },
  ].filter((item) => item.count > 0);

  const todaysTodo = [
    ...newRequests.slice(0, 2).map((row) => ({
      title: row.name,
      eyebrow: "New request",
      detail: row.location || row.clientName,
      badge: "Start assessment",
    })),
    ...opportunities
      .filter((row) => row.stage === "Pricing")
      .slice(0, 2)
      .map((row) => ({
        title: row.name,
        eyebrow: "Quote draft",
        detail: row.clientName,
        badge: "Review pricing",
      })),
    ...activeProjects.slice(0, 2).map((row) => ({
      title: row.name,
      eyebrow: "Active project",
      detail: row.location || row.project_code || "Construction",
      badge: "Check progress",
    })),
  ].slice(0, 5);

  const upcomingLeads = [...opportunities]
    .sort((a, b) => {
      const aValue = a.dueDateIso ? new Date(a.dueDateIso).getTime() : Number.POSITIVE_INFINITY;
      const bValue = b.dueDateIso ? new Date(b.dueDateIso).getTime() : Number.POSITIVE_INFINITY;
      return aValue - bValue;
    })
    .slice(0, 5)
    .map((row) => ({
      title: row.name,
      client: row.clientName,
      stage: row.stage,
      dueLabel: row.dueDateIso ? formatShortDate(new Date(row.dueDateIso)) : "No due date",
      value: formatMoney(row.valueNZD),
    }));

  return (
    <DashboardWorkspace
      dateLabel={dateLabel}
      initialTimeIso={initialTimeIso}
      greeting={greeting}
      firstName={firstName}
      overviewCards={overviewCards}
      todoItems={todoItems}
      todaysTodo={todaysTodo}
      upcomingLeads={upcomingLeads}
    />
  );
}
