import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Calendar, DollarSign, LayoutGrid, Pencil, TrendingUp } from "lucide-react";
import {
  LeadsPageContent,
  LeadsPanel,
  leadsBodyLabelStyle,
  leadsBodyValueStyle,
  leadsButtonLabelStyle,
  leadsMetricPanelClassName,
  leadsPanelClassName,
  leadsSectionTitleStyle,
} from "@/components/app/LeadsPagePrimitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "Unknown";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCurrencyNZD(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "$0";
  }

  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDueDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "No due date";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }

  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateInputValue(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function formatTimeInputValue(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildDueAt(dateValue: string, timeValue: string): string | null {
  if (!dateValue) {
    return null;
  }

  if (!timeValue) {
    return `${dateValue}T00:00:00.000Z`;
  }

  const parsed = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getDueMeta(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "Schedule not set";
  }

  const due = new Date(isoDate);
  if (Number.isNaN(due.getTime())) {
    return "Schedule not set";
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.ceil((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} overdue`;
  }
  if (diffDays === 0) {
    return "Due today";
  }
  return `${diffDays} day${diffDays === 1 ? "" : "s"} remaining`;
}

function getLeadDateCardState({
  dueDate,
  latestQuoteStatus,
  submittedAt,
}: {
  dueDate: string | null | undefined;
  latestQuoteStatus: string | null | undefined;
  submittedAt: string | null | undefined;
}) {
  const isSubmitted = latestQuoteStatus === "Sent";

  if (isSubmitted) {
    return {
      label: "Date submitted",
      value: formatDueDate(submittedAt),
      meta: submittedAt ? "Quote submitted" : "Submission date unavailable",
    };
  }

  return {
    label: "Lead due date",
    value: formatDueDate(dueDate),
    meta: getDueMeta(dueDate),
  };
}

function formatTaskTableDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "No date";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "No date";
  }

  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getPriorityPillClasses(priority: string | null | undefined): string {
  if (priority === "High") {
    return "bg-[#FFE3E3] text-[#C2410C]";
  }
  if (priority === "Low") {
    return "bg-[#E7F7EE] text-[#15803D]";
  }
  return "bg-[#FFF1BF] text-[#B7791F]";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

const leadDetailsValueStyle = {
  ...leadsBodyValueStyle,
  fontWeight: 500,
} as const;

function isDueToday(isoDate: string | null | undefined): boolean {
  if (!isoDate) {
    return false;
  }

  const dueDate = new Date(isoDate);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const now = new Date();
  return (
    dueDate.getFullYear() === now.getFullYear() &&
    dueDate.getMonth() === now.getMonth() &&
    dueDate.getDate() === now.getDate()
  );
}

export default async function OpportunityWorkspacePage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;

  const member = await getCurrentOrganizationMember();
  if (!member) {
    redirect("/app/leads-clients/opportunities");
  }

  const sharedOpportunity = await getOpportunityWorkspaceData(opportunityId);
  if (!sharedOpportunity) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const opportunityResult = await supabase
    .from("organization_opportunities")
    .select("location, stage, created_at, due_date, notes")
    .eq("organization_id", sharedOpportunity.organizationId)
    .eq("id", sharedOpportunity.opportunityId)
    .maybeSingle();

  if (opportunityResult.error) {
    throw new Error(opportunityResult.error.message);
  }

  if (!opportunityResult.data) {
    notFound();
  }

  const activeOpportunity = {
    opportunityId: sharedOpportunity.opportunityId,
    slug: sharedOpportunity.slug,
    name: sharedOpportunity.name,
    location: opportunityResult.data.location,
    stage: opportunityResult.data.stage,
    clientId: sharedOpportunity.clientId,
    clientName: sharedOpportunity.clientName,
    ownerName: sharedOpportunity.ownerName,
    createdAt: opportunityResult.data.created_at,
    dueDate: opportunityResult.data.due_date,
    notes: opportunityResult.data.notes ?? "",
    workspaceProjectId: sharedOpportunity.workspaceProjectId,
  };

  const [clientOpportunityCountResult, clientWonCountResult, leadTasksResult, assigneesResult] = await Promise.all([
    activeOpportunity.clientId
      ? supabase
          .from("organization_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", member.organization_id)
          .eq("client_id", activeOpportunity.clientId)
      : Promise.resolve({ count: 0 }),
    activeOpportunity.clientId
      ? supabase
          .from("organization_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", member.organization_id)
          .eq("client_id", activeOpportunity.clientId)
          .eq("stage", "Won")
      : Promise.resolve({ count: 0 }),
    activeOpportunity.opportunityId
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("project_job_todos")
          .select("id, title, description, priority, due_date, due_at, assigned_user_id, status")
          .eq("organization_id", member.organization_id)
          .eq("opportunity_id", activeOpportunity.opportunityId)
          .eq("status", "To Do")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("organization_members")
      .select("user_id, display_name")
      .eq("organization_id", member.organization_id)
      .order("display_name", { ascending: true }),
  ]);

  const clientOpportunityCount = clientOpportunityCountResult.count ?? 0;
  const clientWonCount = clientWonCountResult.count ?? 0;
  const clientConversionRate =
    clientOpportunityCount > 0 ? Math.round((clientWonCount / clientOpportunityCount) * 100) : 0;
  const latestQuoteTotal = sharedOpportunity.latestQuoteSummary?.totalQuotePrice ?? null;
  const latestQuoteStatus = sharedOpportunity.latestQuoteSummary?.status ?? null;
  const leadDateCard = getLeadDateCardState({
    dueDate: activeOpportunity.dueDate,
    latestQuoteStatus,
    submittedAt:
      sharedOpportunity.latestQuoteSummary?.quoteDate ??
      sharedOpportunity.latestQuoteSummary?.updatedAt ??
      null,
  });

  const assigneeNameById = new Map((assigneesResult.data ?? []).map((person) => [person.user_id, person.display_name || "Team Member"]));
  const organizationAssignees = (assigneesResult.data ?? []).map((person) => ({
    userId: person.user_id,
    name: person.display_name || "Team Member",
  }));
  const leadTasks = ((leadTasksResult.data ?? []) as Array<Record<string, unknown>>).map((task) => ({
    id: typeof task.id === "string" ? task.id : "",
    title: typeof task.title === "string" ? task.title : "Untitled task",
    description: typeof task.description === "string" ? task.description : "",
    priority: typeof task.priority === "string" ? task.priority : "Medium",
    dueDate: typeof task.due_date === "string" ? task.due_date : null,
    dueAt: typeof task.due_at === "string" ? task.due_at : null,
    assignedUserId: typeof task.assigned_user_id === "string" ? task.assigned_user_id : null,
    status: typeof task.status === "string" ? task.status : "To Do",
  }));
  const dueTasksTodayCount = leadTasks.filter((task) => isDueToday(task.dueDate)).length;
  async function saveOpportunityDetails(formData: FormData) {
    "use server";

    const member = await getCurrentOrganizationMember();
    if (!member) {
      redirect("/app/leads-clients/opportunities");
    }

    const supabase = await createServerSupabaseClient();

    const name = String(formData.get("projectName") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();
    const clientName = String(formData.get("clientName") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "").trim();

    if (!name) {
      redirect(`/app/leads-clients/opportunities/${opportunityId}`);
    }

    const updatePayload: {
      name: string;
      location: string;
      due_date: string | null;
      client_id?: string | null;
    } = {
      name,
      location,
      due_date: dueDate || null,
    };

    if (clientName) {
      const clientResult = await supabase
        .from("organization_clients")
        .select("id")
        .eq("organization_id", member.organization_id)
        .eq("company_name", clientName)
        .maybeSingle();

      if (clientResult.data?.id) {
        updatePayload.client_id = clientResult.data.id;
      }
    }

    const updateResult = await supabase
      .from("organization_opportunities")
      .update(updatePayload)
      .eq("organization_id", member.organization_id)
      .eq("id", activeOpportunity.opportunityId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    revalidatePath(`/app/leads-clients/opportunities/${opportunityId}`);
    redirect(`/app/leads-clients/opportunities/${opportunityId}`);
  }

  async function saveOpportunityNotes(formData: FormData) {
    "use server";

    const member = await getCurrentOrganizationMember();
    if (!member) {
      redirect("/app/leads-clients/opportunities");
    }

    const supabase = await createServerSupabaseClient();
    const notes = String(formData.get("notes") ?? "");

    const updateResult = await supabase
      .from("organization_opportunities")
      .update({ notes })
      .eq("organization_id", member.organization_id)
      .eq("id", activeOpportunity.opportunityId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    revalidatePath(`/app/leads-clients/opportunities/${opportunityId}`);
  }

  async function createLeadTask(formData: FormData) {
    "use server";

    const member = await getCurrentOrganizationMember();
    if (!member) {
      redirect("/app/leads-clients/opportunities");
    }

    if (!activeOpportunity.workspaceProjectId) {
      return;
    }

    const supabase = await createServerSupabaseClient();
    const title = String(formData.get("taskTitle") ?? "").trim();
    const description = String(formData.get("taskDescription") ?? "").trim();
    const priority = String(formData.get("taskPriority") ?? "Medium").trim() || "Medium";
    const status = String(formData.get("taskStatus") ?? "To Do").trim() || "To Do";
    const dueDate = String(formData.get("taskDueDate") ?? "").trim();
    const dueTime = String(formData.get("taskDueTime") ?? "").trim();
    const assignedUserId = String(formData.get("taskAssignedUserId") ?? "").trim();

    if (!title) {
      redirect(`/app/leads-clients/opportunities/${opportunityId}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todosTable = (supabase as any).from("project_job_todos");
    const { error } = await todosTable.insert({
      organization_id: member.organization_id,
      project_id: activeOpportunity.workspaceProjectId,
      opportunity_id: activeOpportunity.opportunityId,
      created_by: member.user_id,
      title,
      description,
      due_date: dueDate || null,
      due_at: buildDueAt(dueDate, dueTime),
      assigned_user_id: assignedUserId || null,
      trade: "",
      priority,
      status,
      is_completed: status === "Done",
      source_type: null,
      source_id: null,
      linked_issue_id: null,
      linked_inspection_id: null,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/app/leads-clients/opportunities/${opportunityId}`);
    redirect(`/app/leads-clients/opportunities/${opportunityId}#lead-todos`);
  }

  async function updateLeadTask(formData: FormData) {
    "use server";

    const member = await getCurrentOrganizationMember();
    if (!member) {
      redirect("/app/leads-clients/opportunities");
    }

    const taskId = String(formData.get("taskId") ?? "").trim();
    const title = String(formData.get("taskTitle") ?? "").trim();
    const description = String(formData.get("taskDescription") ?? "").trim();
    const priority = String(formData.get("taskPriority") ?? "Medium").trim() || "Medium";
    const status = String(formData.get("taskStatus") ?? "To Do").trim() || "To Do";
    const dueDate = String(formData.get("taskDueDate") ?? "").trim();
    const dueTime = String(formData.get("taskDueTime") ?? "").trim();
    const assignedUserId = String(formData.get("taskAssignedUserId") ?? "").trim();

    if (!taskId || !title) {
      redirect(`/app/leads-clients/opportunities/${opportunityId}`);
    }

    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todosTable = (supabase as any).from("project_job_todos");
    const { error } = await todosTable
      .update({
        title,
        description,
        due_date: dueDate || null,
        due_at: buildDueAt(dueDate, dueTime),
        assigned_user_id: assignedUserId || null,
        priority,
        status,
        is_completed: status === "Done",
      })
      .eq("organization_id", member.organization_id)
      .eq("id", taskId)
      .eq("opportunity_id", activeOpportunity.opportunityId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/app/leads-clients/opportunities/${opportunityId}`);
    redirect(`/app/leads-clients/opportunities/${opportunityId}#lead-todos`);
  }

  return (
    <LeadsPageContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className={`${leadsMetricPanelClassName} app-surface flex min-h-[170px] flex-col p-5`}>
              <div className="flex items-center gap-4">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] shrink-0 items-center justify-center rounded-[1rem] bg-[#FFE5D9] text-[#F74919] shadow-[0_4px_10px_rgba(247,73,25,0.08)]">
                  <LayoutGrid className="h-[1.45rem] w-[1.45rem]" strokeWidth={2.1} />
                </span>
                <p style={leadsBodyLabelStyle}>{leadDateCard.label}</p>
              </div>
              <p className="mt-auto pt-5" style={leadsBodyValueStyle}>
                {leadDateCard.value}
              </p>
              <p className="mt-3 text-[16px] font-medium text-[#F74919]">{leadDateCard.meta}</p>
            </div>

            <Link
              href={activeOpportunity.clientId ? `/app/leads-clients/clients/${activeOpportunity.clientId}` : "/app/leads-clients/clients"}
              prefetch
              className={`${leadsMetricPanelClassName} app-surface flex min-h-[170px] flex-col p-5 transition hover:bg-[var(--app-surface)]`}
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] shrink-0 items-center justify-center rounded-[1rem] bg-[#FFE5D9] text-[#F74919] shadow-[0_4px_10px_rgba(247,73,25,0.08)]">
                  <TrendingUp className="h-[1.45rem] w-[1.45rem]" strokeWidth={2.1} />
                </span>
                <p style={leadsBodyLabelStyle}>Client conversion rate</p>
              </div>
              <p className="mt-auto pt-5" style={leadsBodyValueStyle}>
                {clientConversionRate}%
              </p>
              <p className="mt-3 text-[16px] font-medium text-[#F74919]">
                {clientWonCount} won of {clientOpportunityCount} opportunities
              </p>
            </Link>

            <Link
              href={`/app/leads-clients/opportunities/${opportunityId}/quote`}
              prefetch
              className={`${leadsMetricPanelClassName} app-surface flex min-h-[170px] flex-col p-5 transition hover:bg-[var(--app-surface)]`}
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] shrink-0 items-center justify-center rounded-[1rem] bg-[#FFE5D9] text-[#F74919] shadow-[0_4px_10px_rgba(247,73,25,0.08)]">
                  <DollarSign className="h-[1.45rem] w-[1.45rem]" strokeWidth={2.1} />
                </span>
                <p style={leadsBodyLabelStyle}>Quote Total</p>
              </div>
              <p className="mt-auto pt-5" style={leadsBodyValueStyle}>
                {formatCurrencyNZD(latestQuoteTotal)}
              </p>
              <p className="mt-3 text-[16px] font-medium text-[#F74919]">
                {latestQuoteStatus ? `Latest quote ${latestQuoteStatus.toLowerCase()}` : "Quote not started"}
              </p>
            </Link>

            <Link
              href="#lead-todos"
              className={`${leadsMetricPanelClassName} app-surface flex min-h-[170px] flex-col p-5 transition hover:bg-[var(--app-surface)]`}
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] shrink-0 items-center justify-center rounded-[1rem] bg-[#FFE5D9] text-[#F74919] shadow-[0_4px_10px_rgba(247,73,25,0.08)]">
                  <Calendar className="h-[1.45rem] w-[1.45rem]" strokeWidth={2.1} />
                </span>
                <p style={leadsBodyLabelStyle}>Due Today</p>
              </div>
              <p className="mt-auto pt-5" style={leadsBodyValueStyle}>
                {dueTasksTodayCount}
              </p>
              <p className="mt-3 text-[16px] font-medium text-[#F74919]">
                {dueTasksTodayCount === 1 ? "1 task due today" : `${dueTasksTodayCount} tasks due today`}
              </p>
            </Link>

          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.945fr)_minmax(0,1.35fr)] xl:items-stretch">
            <Card className={`${leadsPanelClassName} app-surface h-full`}>
              <input id="lead-details-edit-toggle" type="checkbox" className="peer sr-only" />
              <div className="peer-checked:[&_.lead-details-edit-actions]:flex peer-checked:[&_.lead-details-edit-form]:block peer-checked:[&_.lead-details-edit-toggle]:hidden peer-checked:[&_.lead-details-view]:hidden">
                <CardHeader className="flex flex-row items-center justify-between gap-4 pb-[1.15rem] pt-[1.35rem]">
                  <CardTitle className="mt-0" style={leadsSectionTitleStyle}>Lead Details</CardTitle>
                  <div className="lead-details-edit-actions hidden items-center gap-3">
                    <label
                      htmlFor="lead-details-edit-toggle"
                      className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[1rem] border border-[#CBD5E1] bg-white px-5 py-2.5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
                    >
                      Cancel
                    </label>
                    <button
                      type="submit"
                      form="opportunity-details-form"
                      className="inline-flex shrink-0 items-center justify-center rounded-[1rem] bg-[#F15A29] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f]"
                    >
                      Save
                    </button>
                  </div>
                  <label
                    htmlFor="lead-details-edit-toggle"
                    className="lead-details-edit-toggle inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-[0.72rem] border border-[#CBD5E1] bg-white px-4 py-2 text-[14px] font-medium text-[#475569] transition hover:bg-[#F8FAFC]"
                    style={leadsButtonLabelStyle}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Edit details
                  </label>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="lead-details-view">
                    <div className="grid gap-x-[19.2px] gap-y-[14.4px] pt-[1.2rem] md:grid-cols-[160px_minmax(0,1fr)]">
                      <p style={leadsBodyLabelStyle}>Project Name:</p>
                      <p style={leadDetailsValueStyle}>{activeOpportunity.name}</p>

                      <p style={leadsBodyLabelStyle}>Client:</p>
                      <p style={leadDetailsValueStyle}>{activeOpportunity.clientName || "Unassigned"}</p>

                      <p style={leadsBodyLabelStyle}>Location:</p>
                      <p style={leadDetailsValueStyle}>{activeOpportunity.location || "Not set"}</p>

                      <p style={leadsBodyLabelStyle}>Lead Due Date:</p>
                      <p style={leadDetailsValueStyle}>{formatDueDate(activeOpportunity.dueDate)}</p>

                      <p style={leadsBodyLabelStyle}>Created:</p>
                      <p style={leadDetailsValueStyle}>{formatDateTime(activeOpportunity.createdAt)}</p>
                    </div>
                  </div>

                  <form id="opportunity-details-form" action={saveOpportunityDetails} className="lead-details-edit-form hidden">
                    <div className="grid gap-x-[19.2px] gap-y-[14.4px] pt-[1.2rem] md:grid-cols-[160px_minmax(0,1fr)]">
                      <p className="text-[18px] font-semibold text-[#4B5D79]">Project Name:</p>
                      <input
                        name="projectName"
                        defaultValue={activeOpportunity.name}
                        required
                        className="h-[2.9rem] rounded-[0.85rem] border border-[#CBD5E1] bg-white px-4 text-[18px] font-medium text-[#111827] outline-none transition focus:border-[#F15A29]"
                      />

                      <p className="text-[18px] font-semibold text-[#4B5D79]">Client:</p>
                      <input
                        name="clientName"
                        defaultValue={activeOpportunity.clientName || ""}
                        className="h-[2.9rem] rounded-[0.85rem] border border-[#CBD5E1] bg-white px-4 text-[18px] font-medium text-[#111827] outline-none transition focus:border-[#F15A29]"
                      />

                      <p className="text-[18px] font-semibold text-[#4B5D79]">Location:</p>
                      <input
                        name="location"
                        defaultValue={activeOpportunity.location || ""}
                        className="h-[2.9rem] rounded-[0.85rem] border border-[#CBD5E1] bg-white px-4 text-[18px] font-medium text-[#111827] outline-none transition focus:border-[#F15A29]"
                      />

                      <p className="text-[18px] font-semibold text-[#4B5D79]">Lead Due Date:</p>
                      <input
                        type="date"
                        name="dueDate"
                        defaultValue={formatDateInputValue(activeOpportunity.dueDate)}
                        className="h-[2.9rem] rounded-[0.85rem] border border-[#CBD5E1] bg-white px-4 text-[18px] font-medium text-[#111827] outline-none transition focus:border-[#F15A29]"
                      />

                      <p className="text-[18px] font-semibold text-[#4B5D79]">Created:</p>
                      <div className="flex h-[2.9rem] items-center rounded-[0.85rem] border border-[#CBD5E1] bg-white px-4 text-[18px] font-medium text-[#111827]">
                        {formatDateTime(activeOpportunity.createdAt)}
                      </div>
                    </div>
                  </form>
                </CardContent>
              </div>
            </Card>

            <Card className={`${leadsPanelClassName} app-surface h-full`}>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-[1.15rem] pt-[1.35rem]">
                <CardTitle className="mt-0" style={leadsSectionTitleStyle}>Notes</CardTitle>
                <button
                  type="submit"
                  form="opportunity-notes-form"
                  className="inline-flex shrink-0 items-center justify-center rounded-[0.72rem] bg-[#F15A29] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f]"
                >
                  Save
                </button>
              </CardHeader>
              <CardContent className="h-full pt-0">
                <form id="opportunity-notes-form" action={saveOpportunityNotes} className="h-full flex-col">
                  <textarea
                    name="notes"
                    defaultValue={activeOpportunity.notes}
                    placeholder="Add notes for this lead..."
                    className="h-[240px] w-full resize-none overflow-y-auto bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_42px,#E2E8F1_42px,#E2E8F1_43px)] bg-transparent px-1 py-2 text-[15px] leading-[43px] text-[#111827] outline-none placeholder:text-[#8A94A6]"
                  />
                </form>
              </CardContent>
            </Card>
          </div>

            <div id="lead-todos" className="mt-4 scroll-mt-24 space-y-3">
              <input id="lead-task-create-toggle" type="checkbox" className="peer sr-only" />
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                <p className="m-0" style={leadsSectionTitleStyle}>
                  To Do
                </p>
              </div>
              <div>
                <label
                  htmlFor="lead-task-create-toggle"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#E2E8F1] bg-white text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#334155]"
                  aria-label="Add task to To Do"
                >
                  +
                </label>
              </div>
            </div>

            <LeadsPanel className="overflow-hidden rounded-[18px] border-[#D9E3EE]">
              <div className="grid grid-cols-[minmax(220px,1.6fr)_minmax(220px,1.8fr)_minmax(120px,0.8fr)_minmax(150px,0.95fr)_minmax(140px,0.9fr)_minmax(150px,0.95fr)_72px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
                {[
                  "Task Name",
                  "Descriptions",
                  "Priority",
                  "Timeline Date",
                  "People",
                  " ",
                ].map((heading) => (
                  <div key={heading} className="flex items-center gap-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]">
                      {heading}
                    </p>
                  </div>
                ))}
              </div>

              <div>
                {leadTasks.length === 0 ? (
                  <div className="px-5 py-6">
                    <p className="m-0 text-[13px] text-[#6B7C93]">No tasks in this section yet.</p>
                  </div>
                ) : (
                  leadTasks.map((task) => {
                    const assigneeName = task.assignedUserId ? assigneeNameById.get(task.assignedUserId) ?? "Team Member" : "Unassigned";
                    const editToggleId = `lead-task-edit-toggle-${task.id}`;
                    return (
                      <div key={task.id}>
                        <input id={editToggleId} type="checkbox" className="peer sr-only" />
                        <div className="grid grid-cols-[minmax(220px,1.6fr)_minmax(220px,1.8fr)_minmax(120px,0.8fr)_minmax(150px,0.95fr)_minmax(140px,0.9fr)_minmax(150px,0.95fr)_72px] items-center border-b border-[#EEF3F8] bg-white px-5 py-5 last:border-b-0">
                          <button type="button" className="min-w-0 text-left">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 h-4 w-4 rounded-[4px] border border-[#D7E0EA] bg-white" />
                              <div className="min-w-0">
                                <p className="m-0 truncate text-[14px] font-semibold text-[#0F172A]">{task.title}</p>
                              </div>
                            </div>
                          </button>

                          <div className="min-w-0 pr-4">
                            <p className="m-0 truncate text-[13px] text-[#0F172A]">{task.description || "No description added"}</p>
                          </div>

                          <div className="flex items-center">
                            <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-medium ${getPriorityPillClasses(task.priority)}`}>
                              {task.priority}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-[#64748B]" strokeWidth={2} />
                            <div>
                              <p className="m-0 text-[13px] text-[#0F172A]">{formatTaskTableDate(task.dueDate)}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F74917] text-[12px] font-semibold text-white">
                              {getInitials(assigneeName)}
                            </span>
                            <p className="m-0 truncate text-[13px] text-[#0F172A]">{assigneeName}</p>
                          </div>

                          <div />

                          <div className="flex items-center justify-end gap-2">
                            <label
                              htmlFor={editToggleId}
                              className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] bg-[#F74917] px-3.5 text-[13px] font-semibold text-white transition hover:bg-[#e63f10]"
                              aria-label={`Edit ${task.title}`}
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                              Edit
                            </label>
                          </div>
                        </div>

                        <div className="pointer-events-none fixed inset-0 z-40 hidden items-center justify-center bg-[#0F172A]/45 px-4 py-8 peer-checked:flex">
                          <label htmlFor={editToggleId} className="absolute inset-0" aria-hidden="true" />
                          <form
                            action={updateLeadTask}
                            className="pointer-events-auto max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]"
                          >
                            <input type="hidden" name="taskId" value={task.id} />
                            <div className="space-y-0">
                              <div className="px-7 pb-6 pt-7">
                                <h3 className="m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]">
                                  Edit Task
                                </h3>
                              </div>

                              <div className="space-y-3.5 px-7 pb-4">
                                <div>
                                  <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Title</label>
                                  <input
                                    name="taskTitle"
                                    defaultValue={task.title}
                                    autoFocus
                                    className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Description</label>
                                  <textarea
                                    name="taskDescription"
                                    rows={3}
                                    defaultValue={task.description}
                                    className="w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Assignee</label>
                                  <select
                                    name="taskAssignedUserId"
                                    defaultValue={task.assignedUserId ?? ""}
                                    className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                                  >
                                    <option value="">Unassigned</option>
                                    {organizationAssignees.map((assignee) => (
                                      <option key={assignee.userId} value={assignee.userId}>
                                        {assignee.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Due Date</label>
                                    <input
                                      type="date"
                                      name="taskDueDate"
                                      defaultValue={formatDateInputValue(task.dueDate)}
                                      className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Due Time</label>
                                    <input
                                      type="time"
                                      name="taskDueTime"
                                      defaultValue={formatTimeInputValue(task.dueAt)}
                                      className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29] [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:text-[#10283B] [&::-webkit-datetime-edit-fields-wrapper]:text-[#10283B]"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Priority</label>
                                    <select
                                      name="taskPriority"
                                      defaultValue={task.priority}
                                      className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                                    >
                                      <option value="High">High</option>
                                      <option value="Medium">Medium</option>
                                      <option value="Low">Low</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Status</label>
                                    <select
                                      name="taskStatus"
                                      defaultValue={task.status}
                                      className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                                    >
                                      <option value="To Do">To Do</option>
                                      <option value="In Progress">In Progress</option>
                                      <option value="Need Review">Need Review</option>
                                      <option value="Done">Done</option>
                                    </select>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
                                <label
                                  htmlFor={editToggleId}
                                  className="inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
                                >
                                  Cancel
                                </label>
                                <button
                                  type="submit"
                                  className="inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f]"
                                >
                                  Save Task
                                </button>
                              </div>
                            </div>
                          </form>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </LeadsPanel>

            <div className="pointer-events-none fixed inset-0 z-40 hidden items-center justify-center bg-[#0F172A]/45 px-4 py-8 peer-checked:flex">
              <label htmlFor="lead-task-create-toggle" className="absolute inset-0" aria-hidden="true" />
              <form
                action={createLeadTask}
                className="pointer-events-auto max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]"
              >
                <div className="space-y-0">
                  <div className="px-7 pb-6 pt-7">
                    <h3 className="m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]">
                      Add Task
                    </h3>
                  </div>

                  <div className="space-y-3.5 px-7 pb-4">
                    <div>
                      <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Title</label>
                      <input
                        name="taskTitle"
                        autoFocus
                        className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Description</label>
                      <textarea
                        name="taskDescription"
                        rows={3}
                        className="w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Assignee</label>
                      <select
                        name="taskAssignedUserId"
                        defaultValue=""
                        className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                      >
                        <option value="">Unassigned</option>
                        {organizationAssignees.map((assignee) => (
                          <option key={assignee.userId} value={assignee.userId}>
                            {assignee.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Due Date</label>
                        <input
                          type="date"
                          name="taskDueDate"
                          className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Due Time</label>
                        <input
                          type="time"
                          name="taskDueTime"
                          className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29] [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:text-[#10283B] [&::-webkit-datetime-edit-fields-wrapper]:text-[#10283B]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Priority</label>
                        <select
                          name="taskPriority"
                          defaultValue="High"
                          className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-semibold text-[#1d2433]">Status</label>
                        <select
                          name="taskStatus"
                          defaultValue="To Do"
                          className="h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]"
                        >
                          <option value="To Do">To Do</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Need Review">Need Review</option>
                          <option value="Done">Done</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
                    <label
                      htmlFor="lead-task-create-toggle"
                      className="inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
                    >
                      Cancel
                    </label>
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f]"
                    >
                      Save Task
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
    </LeadsPageContent>
  );
}
