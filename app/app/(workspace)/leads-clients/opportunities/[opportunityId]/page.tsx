import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Calendar, DollarSign, LayoutGrid, Pencil, TrendingUp } from "lucide-react";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoneyOperational } from "@/lib/format/currency";
import { getOpportunityWorkspaceData } from "@/lib/opportunity-workspace-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

const MODAL_INPUT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const MODAL_SELECT_CLASS = MODAL_INPUT_CLASS;
const MODAL_TEXTAREA_CLASS =
  "flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const SECTION_TITLE_CLASS = "m-0 text-lg font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]";
const FIELD_LABEL_CLASS = "mb-1.5 block text-sm font-medium text-[var(--text-primary)]";

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

  return formatMoneyOperational(value);
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

function getPriorityBadgeStatus(priority: string | null | undefined): NonNullable<StatusBadgeProps["status"]> {
  if (priority === "High") {
    return "overdue";
  }
  if (priority === "Low") {
    return "approved";
  }
  return "pending";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

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
    <div className="min-w-0 flex-1 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OperationalKpiCard
          label={leadDateCard.label}
          value={leadDateCard.value}
          helper={leadDateCard.meta}
          icon={<LayoutGrid className="h-5 w-5" strokeWidth={2.1} />}
        />

        <Link
          href={activeOpportunity.clientId ? `/app/leads-clients/clients/${activeOpportunity.clientId}` : "/app/leads-clients/clients"}
          prefetch
          className="block rounded-[var(--radius-lg)] transition-colors hover:bg-[var(--surface-muted)]/40"
        >
          <OperationalKpiCard
            label="Client conversion rate"
            value={`${clientConversionRate}%`}
            helper={`${clientWonCount} won of ${clientOpportunityCount} opportunities`}
            icon={<TrendingUp className="h-5 w-5" strokeWidth={2.1} />}
          />
        </Link>

        <Link
          href={`/app/leads-clients/opportunities/${opportunityId}/quote`}
          prefetch
          className="block rounded-[var(--radius-lg)] transition-colors hover:bg-[var(--surface-muted)]/40"
        >
          <OperationalKpiCard
            label="Quote Total"
            value={formatCurrencyNZD(latestQuoteTotal)}
            helper={latestQuoteStatus ? `Latest quote ${latestQuoteStatus.toLowerCase()}` : "Quote not started"}
            icon={<DollarSign className="h-5 w-5" strokeWidth={2.1} />}
          />
        </Link>

        <Link
          href="#lead-todos"
          className="block rounded-[var(--radius-lg)] transition-colors hover:bg-[var(--surface-muted)]/40"
        >
          <OperationalKpiCard
            label="Due Today"
            value={dueTasksTodayCount}
            helper={dueTasksTodayCount === 1 ? "1 task due today" : `${dueTasksTodayCount} tasks due today`}
            icon={<Calendar className="h-5 w-5" strokeWidth={2.1} />}
          />
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.945fr)_minmax(0,1.35fr)] xl:items-stretch">
        <div className="relative">
          <input id="lead-details-edit-toggle" type="checkbox" className="peer sr-only" />
          <div className="peer-checked:[&_.lead-details-edit-actions]:flex peer-checked:[&_.lead-details-edit-form]:block peer-checked:[&_.lead-details-edit-toggle]:hidden peer-checked:[&_.lead-details-view]:hidden h-full">
            <OperationalPanel
              className="h-full"
              title="Lead Details"
              actions={
                <>
                  <div className="lead-details-edit-actions hidden items-center gap-2">
                    <Button asChild type="button" variant="secondary" size="sm">
                      <label htmlFor="lead-details-edit-toggle" className="cursor-pointer">
                        Cancel
                      </label>
                    </Button>
                    <Button type="submit" form="opportunity-details-form" size="sm">
                      Save
                    </Button>
                  </div>
                  <Button asChild type="button" variant="secondary" size="sm" className="lead-details-edit-toggle">
                    <label htmlFor="lead-details-edit-toggle" className="cursor-pointer">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                      Edit details
                    </label>
                  </Button>
                </>
              }
            >
              <div className="lead-details-view">
                <div className="grid gap-x-5 gap-y-3.5 md:grid-cols-[160px_minmax(0,1fr)]">
                  <p className="text-sm text-[var(--text-secondary)]">Project Name:</p>
                  <p className="text-sm text-[var(--text-primary)]">{activeOpportunity.name}</p>

                  <p className="text-sm text-[var(--text-secondary)]">Client:</p>
                  <p className="text-sm text-[var(--text-primary)]">{activeOpportunity.clientName || "Unassigned"}</p>

                  <p className="text-sm text-[var(--text-secondary)]">Location:</p>
                  <p className="text-sm text-[var(--text-primary)]">{activeOpportunity.location || "Not set"}</p>

                  <p className="text-sm text-[var(--text-secondary)]">Lead Due Date:</p>
                  <p className="text-sm text-[var(--text-primary)]">{formatDueDate(activeOpportunity.dueDate)}</p>

                  <p className="text-sm text-[var(--text-secondary)]">Created:</p>
                  <p className="text-sm text-[var(--text-primary)]">{formatDateTime(activeOpportunity.createdAt)}</p>
                </div>
              </div>

              <form id="opportunity-details-form" action={saveOpportunityDetails} className="lead-details-edit-form hidden">
                <div className="grid gap-x-5 gap-y-3.5 md:grid-cols-[160px_minmax(0,1fr)]">
                  <label className="self-center text-sm font-medium text-[var(--text-primary)]" htmlFor="opportunity-projectName">Project Name:</label>
                  <Input
                    id="opportunity-projectName"
                    name="projectName"
                    defaultValue={activeOpportunity.name}
                    required
                  />

                  <label className="self-center text-sm font-medium text-[var(--text-primary)]" htmlFor="opportunity-clientName">Client:</label>
                  <Input
                    id="opportunity-clientName"
                    name="clientName"
                    defaultValue={activeOpportunity.clientName || ""}
                  />

                  <label className="self-center text-sm font-medium text-[var(--text-primary)]" htmlFor="opportunity-location">Location:</label>
                  <Input
                    id="opportunity-location"
                    name="location"
                    defaultValue={activeOpportunity.location || ""}
                  />

                  <label className="self-center text-sm font-medium text-[var(--text-primary)]" htmlFor="opportunity-dueDate">Lead Due Date:</label>
                  <Input
                    id="opportunity-dueDate"
                    type="date"
                    name="dueDate"
                    defaultValue={formatDateInputValue(activeOpportunity.dueDate)}
                  />

                  <p className="self-center text-sm font-medium text-[var(--text-primary)]">Created:</p>
                  <div className="flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 text-sm text-[var(--text-secondary)]">
                    {formatDateTime(activeOpportunity.createdAt)}
                  </div>
                </div>
              </form>
            </OperationalPanel>
          </div>
        </div>

        <OperationalPanel
          className="h-full"
          title="Notes"
          actions={
            <Button type="submit" form="opportunity-notes-form" size="sm">
              Save
            </Button>
          }
        >
          <form id="opportunity-notes-form" action={saveOpportunityNotes} className="h-full flex-col">
            <textarea
              name="notes"
              defaultValue={activeOpportunity.notes}
              placeholder="Add notes for this lead..."
              className="h-[240px] w-full resize-none overflow-y-auto bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_42px,var(--border)_42px,var(--border)_43px)] bg-transparent px-1 py-2 text-[15px] leading-[43px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </form>
        </OperationalPanel>
      </div>

      <div id="lead-todos" className="scroll-mt-24 space-y-3">
        <input id="lead-task-create-toggle" type="checkbox" className="peer sr-only" />
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <p className={SECTION_TITLE_CLASS}>To Do</p>
          </div>
          <div>
            <Button asChild type="button" variant="secondary" size="sm" className="h-7 w-7 p-0">
              <label htmlFor="lead-task-create-toggle" className="cursor-pointer" aria-label="Add task to To Do">
                +
              </label>
            </Button>
          </div>
        </div>

        <OperationalPanel contentClassName="p-0">
          <div className="grid grid-cols-[minmax(220px,1.6fr)_minmax(220px,1.8fr)_minmax(120px,0.8fr)_minmax(150px,0.95fr)_minmax(140px,0.9fr)_minmax(150px,0.95fr)_72px] border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-3">
            {[
              "Task Name",
              "Descriptions",
              "Priority",
              "Timeline Date",
              "People",
              " ",
            ].map((heading) => (
              <div key={heading} className="flex items-center gap-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                  {heading}
                </p>
              </div>
            ))}
          </div>

          <div>
            {leadTasks.length === 0 ? (
              <div className="px-5 py-6">
                <p className="m-0 text-sm text-[var(--text-secondary)]">No tasks in this section yet.</p>
              </div>
            ) : (
              leadTasks.map((task) => {
                const assigneeName = task.assignedUserId ? assigneeNameById.get(task.assignedUserId) ?? "Team Member" : "Unassigned";
                const editToggleId = `lead-task-edit-toggle-${task.id}`;
                return (
                  <div key={task.id}>
                    <input id={editToggleId} type="checkbox" className="peer sr-only" />
                    <div className="grid grid-cols-[minmax(220px,1.6fr)_minmax(220px,1.8fr)_minmax(120px,0.8fr)_minmax(150px,0.95fr)_minmax(140px,0.9fr)_minmax(150px,0.95fr)_72px] items-center border-b border-[var(--border)] bg-[var(--card)] px-5 py-5 last:border-b-0">
                      <button type="button" className="min-w-0 text-left">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 h-4 w-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)]" />
                          <div className="min-w-0">
                            <p className="m-0 truncate text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
                          </div>
                        </div>
                      </button>

                      <div className="min-w-0 pr-4">
                        <p className="m-0 truncate text-sm text-[var(--text-primary)]">{task.description || "No description added"}</p>
                      </div>

                      <div className="flex items-center">
                        <StatusBadge status={getPriorityBadgeStatus(task.priority)}>{task.priority}</StatusBadge>
                      </div>

                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={2} />
                        <div>
                          <p className="m-0 text-sm text-[var(--text-primary)]">{formatTaskTableDate(task.dueDate)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-[var(--primary-foreground)]">
                          {getInitials(assigneeName)}
                        </span>
                        <p className="m-0 truncate text-sm text-[var(--text-primary)]">{assigneeName}</p>
                      </div>

                      <div />

                      <div className="flex items-center justify-end gap-2">
                        <Button asChild type="button" size="sm">
                          <label htmlFor={editToggleId} className="cursor-pointer" aria-label={`Edit ${task.title}`}>
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                            Edit
                          </label>
                        </Button>
                      </div>
                    </div>

                    <div className="pointer-events-none fixed inset-0 z-40 hidden items-center justify-center bg-[var(--text-primary)]/45 px-4 py-8 peer-checked:flex">
                      <label htmlFor={editToggleId} className="absolute inset-0" aria-hidden="true" />
                      <form
                        action={updateLeadTask}
                        className="pointer-events-auto max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-0 shadow-[var(--shadow-lg)]"
                      >
                        <input type="hidden" name="taskId" value={task.id} />
                        <div className="space-y-0">
                          <div className="px-7 pb-6 pt-7">
                            <h3 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                              Edit Task
                            </h3>
                          </div>

                          <div className="space-y-3.5 px-7 pb-4">
                            <div>
                              <label className={FIELD_LABEL_CLASS}>Title</label>
                              <Input
                                name="taskTitle"
                                defaultValue={task.title}
                                autoFocus
                              />
                            </div>

                            <div>
                              <label className={FIELD_LABEL_CLASS}>Description</label>
                              <textarea
                                name="taskDescription"
                                rows={3}
                                defaultValue={task.description}
                                className={MODAL_TEXTAREA_CLASS}
                              />
                            </div>

                            <div>
                              <label className={FIELD_LABEL_CLASS}>Assignee</label>
                              <select
                                name="taskAssignedUserId"
                                defaultValue={task.assignedUserId ?? ""}
                                className={MODAL_SELECT_CLASS}
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
                                <label className={FIELD_LABEL_CLASS}>Due Date</label>
                                <Input
                                  type="date"
                                  name="taskDueDate"
                                  defaultValue={formatDateInputValue(task.dueDate)}
                                />
                              </div>
                              <div>
                                <label className={FIELD_LABEL_CLASS}>Due Time</label>
                                <Input
                                  type="time"
                                  name="taskDueTime"
                                  defaultValue={formatTimeInputValue(task.dueAt)}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={FIELD_LABEL_CLASS}>Priority</label>
                                <select
                                  name="taskPriority"
                                  defaultValue={task.priority}
                                  className={MODAL_SELECT_CLASS}
                                >
                                  <option value="High">High</option>
                                  <option value="Medium">Medium</option>
                                  <option value="Low">Low</option>
                                </select>
                              </div>
                              <div>
                                <label className={FIELD_LABEL_CLASS}>Status</label>
                                <select
                                  name="taskStatus"
                                  defaultValue={task.status}
                                  className={MODAL_SELECT_CLASS}
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
                            <Button asChild type="button" variant="secondary">
                              <label htmlFor={editToggleId} className="cursor-pointer">Cancel</label>
                            </Button>
                            <Button type="submit">Save Task</Button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </OperationalPanel>

        <div className="pointer-events-none fixed inset-0 z-40 hidden items-center justify-center bg-[var(--text-primary)]/45 px-4 py-8 peer-checked:flex">
          <label htmlFor="lead-task-create-toggle" className="absolute inset-0" aria-hidden="true" />
          <form
            action={createLeadTask}
            className="pointer-events-auto max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-0 shadow-[var(--shadow-lg)]"
          >
            <div className="space-y-0">
              <div className="px-7 pb-6 pt-7">
                <h3 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                  Add Task
                </h3>
              </div>

              <div className="space-y-3.5 px-7 pb-4">
                <div>
                  <label className={FIELD_LABEL_CLASS}>Title</label>
                  <Input name="taskTitle" autoFocus />
                </div>

                <div>
                  <label className={FIELD_LABEL_CLASS}>Description</label>
                  <textarea
                    name="taskDescription"
                    rows={3}
                    className={MODAL_TEXTAREA_CLASS}
                  />
                </div>

                <div>
                  <label className={FIELD_LABEL_CLASS}>Assignee</label>
                  <select
                    name="taskAssignedUserId"
                    defaultValue=""
                    className={MODAL_SELECT_CLASS}
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
                    <label className={FIELD_LABEL_CLASS}>Due Date</label>
                    <Input type="date" name="taskDueDate" />
                  </div>
                  <div>
                    <label className={FIELD_LABEL_CLASS}>Due Time</label>
                    <Input type="time" name="taskDueTime" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={FIELD_LABEL_CLASS}>Priority</label>
                    <select
                      name="taskPriority"
                      defaultValue="High"
                      className={MODAL_SELECT_CLASS}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL_CLASS}>Status</label>
                    <select
                      name="taskStatus"
                      defaultValue="To Do"
                      className={MODAL_SELECT_CLASS}
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
                <Button asChild type="button" variant="secondary">
                  <label htmlFor="lead-task-create-toggle" className="cursor-pointer">Cancel</label>
                </Button>
                <Button type="submit">Save Task</Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
