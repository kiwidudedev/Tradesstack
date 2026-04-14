"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Calendar, CheckCircle2, Clock3, FileText, Flag, ListTodo, Pencil, Search, Trash2, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type TodoStatus = "To Do" | "In Progress" | "Need Review" | "Done";
type TodoPriority = "Low" | "Medium" | "High";
type TodoSourceType = "qa_issue" | "inspection_fail" | null;
type GroupByMode = "All" | "Status" | "Assignee" | "Trade";

interface TodoRow {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  dueAt: string | null;
  isCompleted: boolean;
  assignedUserId: string | null;
  sourceType: TodoSourceType;
  linkedIssueId: string | null;
  linkedInspectionId: string | null;
  linkedInspectionItemId: string | null;
  trade: string;
  priority: TodoPriority;
  status: TodoStatus;
  createdAt: string;
  updatedAt: string;
}

interface ProjectContext {
  organizationId: string;
  projectId: string;
}

interface OrganizationUserOption {
  userId: string;
  name: string;
}

interface LinkedIssueOption {
  id: string;
  title: string;
}

interface LinkedInspectionOption {
  id: string;
  title: string;
}

interface LinkedInspectionItemOption {
  id: string;
  inspectionId: string;
  label: string;
}

interface TodoAttachment {
  id: string;
  todoId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSizeBytes: number | null;
  createdAt: string;
}

interface TaskStats {
  todoCount: number;
  inProgressCount: number;
  completeCount: number;
  overdueCount: number;
}

const EMPTY_TASK_STATS: TaskStats = {
  todoCount: 0,
  inProgressCount: 0,
  completeCount: 0,
  overdueCount: 0,
};

function normalizeStatus(value: unknown): TodoStatus {
  if (value === "Archived") {
    return "Done";
  }
  if (value === "Complete") {
    return "Done";
  }
  if (value === "To Do" || value === "In Progress" || value === "Need Review" || value === "Done") {
    return value;
  }
  return "To Do";
}

function normalizePriority(value: unknown): TodoPriority {
  if (value === "Low" || value === "Medium" || value === "High") {
    return value;
  }
  return "Medium";
}

function normalizeSourceType(value: unknown): TodoSourceType {
  if (value === "qa_issue" || value === "inspection_fail") {
    return value;
  }
  return null;
}

function formatDueDate(value: string | null) {
  if (!value) {
    return "No due date";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }
  return date.toLocaleDateString("en-NZ", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTaskTableDate(value: string | null, dueAt: string | null) {
  const source = dueAt ?? (value ? `${value}T00:00:00` : null);
  if (!source) {
    return "No due date";
  }
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }
  return date.toLocaleDateString("en-NZ", { month: "short", day: "numeric", year: "numeric" });
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "NA";
}

function toDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${hour}:${minute}`;
}

function buildDueAt(dateValue: string, timeValue: string) {
  if (!dateValue) {
    return null;
  }
  const resolvedTime = timeValue || "23:59";
  const date = new Date(`${dateValue}T${resolvedTime}`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function formatDueLabel(dueDate: string | null, dueAt: string | null) {
  if (dueAt) {
    const due = new Date(dueAt);
    if (!Number.isNaN(due.getTime())) {
      return due.toLocaleString("en-NZ", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
  }
  return formatDueDate(dueDate);
}

function formatEventTime(value: string) {
  const date = new Date(value);
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

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function isOverdue(dueDate: string | null, dueAt: string | null, status: TodoStatus) {
  if (status === "Done") {
    return false;
  }
  if (dueAt) {
    const dueDateTime = new Date(dueAt);
    if (!Number.isNaN(dueDateTime.getTime())) {
      return dueDateTime.getTime() < Date.now();
    }
  }
  if (!dueDate) {
    return false;
  }
  const dueEndOfDay = new Date(`${dueDate}T23:59:59`);
  if (Number.isNaN(dueEndOfDay.getTime())) {
    return false;
  }
  return dueEndOfDay.getTime() < Date.now();
}

function statusTone(status: TodoStatus) {
  if (status === "Done") {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
  if (status === "In Progress") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function priorityTone(priority: TodoPriority) {
  if (priority === "High") {
    return "bg-rose-100 text-rose-800 border-rose-200";
  }
  if (priority === "Low") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  return "bg-orange-100 text-orange-800 border-orange-200";
}

function dueFilterMatch(dueFilter: string, dueDate: string | null, dueAt: string | null, status: TodoStatus) {
  if (dueFilter === "All") {
    return true;
  }
  const now = new Date();
  const todayIso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
  const dueDayIso = dueAt ? toDateInputValue(dueAt) : dueDate;
  if (dueFilter === "Overdue") {
    return isOverdue(dueDate, dueAt, status);
  }
  if (dueFilter === "Due Today") {
    return dueDayIso === todayIso;
  }
  if (dueFilter === "No Due Date") {
    return dueDate === null && dueAt === null;
  }
  return true;
}

export function ProjectTodosBoard() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId ?? "";
  const { session } = useAuth();

  const [context, setContext] = useState<ProjectContext | null>(null);
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [stats, setStats] = useState<TaskStats>(EMPTY_TASK_STATS);
  const [attachmentCountsByTodoId, setAttachmentCountsByTodoId] = useState<Record<string, number>>({});
  const [selectedTaskAttachments, setSelectedTaskAttachments] = useState<TodoAttachment[]>([]);
  const [organizationUsers, setOrganizationUsers] = useState<OrganizationUserOption[]>([]);
  const [issueOptions, setIssueOptions] = useState<LinkedIssueOption[]>([]);
  const [inspectionOptions, setInspectionOptions] = useState<LinkedInspectionOption[]>([]);
  const [inspectionItemOptions, setInspectionItemOptions] = useState<LinkedInspectionItemOption[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [tradeFilter, setTradeFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [dueFilter, setDueFilter] = useState("All");
  const [linkedTypeFilter, setLinkedTypeFilter] = useState("All");
  const [groupBy, setGroupBy] = useState<GroupByMode>("All");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newAssignedUserId, setNewAssignedUserId] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("");
  const [newPdfName, setNewPdfName] = useState("");
  const [newPdfDataUrl, setNewPdfDataUrl] = useState("");
  const [newPdfSizeBytes, setNewPdfSizeBytes] = useState<number | null>(null);
  const [newPriority, setNewPriority] = useState<TodoPriority>("Medium");
  const [newStatus, setNewStatus] = useState<TodoStatus>("To Do");
  const [newLinkedIssueId, setNewLinkedIssueId] = useState("");
  const [newLinkedInspectionId, setNewLinkedInspectionId] = useState("");

  const [detailTitle, setDetailTitle] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [detailTrade, setDetailTrade] = useState("");
  const [detailAssignedUserId, setDetailAssignedUserId] = useState("");
  const [detailDueDate, setDetailDueDate] = useState("");
  const [detailDueTime, setDetailDueTime] = useState("");
  const [detailPdfName, setDetailPdfName] = useState("");
  const [detailPdfDataUrl, setDetailPdfDataUrl] = useState("");
  const [detailPdfSizeBytes, setDetailPdfSizeBytes] = useState<number | null>(null);
  const [detailPriority, setDetailPriority] = useState<TodoPriority>("Medium");
  const [detailStatus, setDetailStatus] = useState<TodoStatus>("To Do");
  const [detailLinkedIssueId, setDetailLinkedIssueId] = useState("");
  const [detailLinkedInspectionId, setDetailLinkedInspectionId] = useState("");

  const isLoadingRef = useRef(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const selectedTask = useMemo(() => todos.find((task) => task.id === selectedTaskId) ?? null, [todos, selectedTaskId]);
  const issueNameById = useMemo(() => new Map(issueOptions.map((item) => [item.id, item.title])), [issueOptions]);
  const inspectionNameById = useMemo(() => new Map(inspectionOptions.map((item) => [item.id, item.title])), [inspectionOptions]);
  const inspectionItemById = useMemo(() => new Map(inspectionItemOptions.map((item) => [item.id, item])), [inspectionItemOptions]);
  const userNameById = useMemo(() => new Map(organizationUsers.map((member) => [member.userId, member.name])), [organizationUsers]);

  const assigneeOptions = useMemo(
    () => [{ userId: "", name: "Unassigned" }, ...organizationUsers],
    [organizationUsers]
  );
  const statusesToLoad = useMemo(() => {
    if (statusFilter === "Done") {
      return ["Done", "Complete", "Archived"];
    }
    if (statusFilter === "To Do") {
      return ["To Do"];
    }
    if (statusFilter === "In Progress") {
      return ["In Progress"];
    }
    if (statusFilter === "Need Review") {
      return ["Need Review"];
    }
    return ["To Do", "In Progress", "Need Review"];
  }, [statusFilter]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }
    setDetailTitle(selectedTask.title);
    setDetailDescription(selectedTask.description);
    setDetailTrade(selectedTask.trade);
    setDetailAssignedUserId(selectedTask.assignedUserId ?? "");
    setDetailDueDate(selectedTask.dueDate ?? toDateInputValue(selectedTask.dueAt));
    setDetailDueTime(toTimeInputValue(selectedTask.dueAt));
    setDetailPdfName("");
    setDetailPdfDataUrl("");
    setDetailPdfSizeBytes(null);
    setDetailPriority(selectedTask.priority);
    setDetailStatus(selectedTask.status);
    setDetailLinkedIssueId(selectedTask.linkedIssueId ?? "");
    setDetailLinkedInspectionId(selectedTask.linkedInspectionId ?? "");
  }, [selectedTask]);

  const loadAttachmentsForTask = async (taskId: string, activeContext?: ProjectContext | null) => {
    const taskContext = activeContext ?? context;
    if (!supabase || !taskContext || !taskId) {
      setSelectedTaskAttachments([]);
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentTable = (supabase as any).from("project_job_todo_attachments");
      const { data, error: attachmentError } = await attachmentTable
        .select("id, todo_id, file_name, file_url, mime_type, file_size_bytes, created_at")
        .eq("organization_id", taskContext.organizationId)
        .eq("project_id", taskContext.projectId)
        .eq("todo_id", taskId)
        .order("created_at", { ascending: false });
      if (attachmentError) {
        throw new Error(attachmentError.message);
      }
      const normalized: TodoAttachment[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        todoId: String(row.todo_id ?? ""),
        fileName: String(row.file_name ?? "Attachment.pdf"),
        fileUrl: String(row.file_url ?? ""),
        mimeType: String(row.mime_type ?? ""),
        fileSizeBytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      }));
      setSelectedTaskAttachments(normalized);
    } catch (attachmentLoadError) {
      setError(attachmentLoadError instanceof Error ? attachmentLoadError.message : "Unable to load task PDFs.");
    }
  };

  const loadAttachmentCountsForTasks = async (taskIds: string[], activeContext?: ProjectContext | null) => {
    const taskContext = activeContext ?? context;
    if (!supabase || !taskContext) {
      setAttachmentCountsByTodoId({});
      return;
    }
    if (taskIds.length === 0) {
      setAttachmentCountsByTodoId({});
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentTable = (supabase as any).from("project_job_todo_attachments");
      const { data, error: attachmentError } = await attachmentTable
        .select("todo_id")
        .eq("organization_id", taskContext.organizationId)
        .eq("project_id", taskContext.projectId)
        .in("todo_id", taskIds)
        .limit(5000);
      if (attachmentError) {
        throw new Error(attachmentError.message);
      }
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const todoId = typeof row.todo_id === "string" ? row.todo_id : "";
        if (!todoId) {
          continue;
        }
        counts[todoId] = (counts[todoId] ?? 0) + 1;
      }
      setAttachmentCountsByTodoId(counts);
    } catch {
      setAttachmentCountsByTodoId({});
    }
  };

  const loadData = async (options?: { showLoading?: boolean }) => {
    if (!supabase || !routeProjectSlug || !session?.id || isLoadingRef.current) {
      return;
    }

    const showLoading = options?.showLoading ?? true;
    isLoadingRef.current = true;
    if (showLoading) {
      setIsLoading(true);
    }
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
        .select("id")
        .eq("organization_id", resolvedOrganizationId)
        .eq("slug", routeProjectSlug)
        .maybeSingle();

      if (projectError || !projectRow) {
        throw new Error(projectError?.message ?? "Project not found.");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todosTable = (supabase as any).from("project_job_todos");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usersTable = (supabase as any).from("organization_members");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesTable = (supabase as any).from("project_quality_issues");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionsTable = (supabase as any).from("project_quality_inspections");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionItemsTable = (supabase as any).from("project_quality_inspection_items");
      const now = new Date();
      const nowIso = now.toISOString();
      const today = nowIso.slice(0, 10);

      const [todosResult, usersResult, issuesResult, inspectionsResult, inspectionItemsResult, todoCountResult, inProgressCountResult, completeCountResult, overdueByDueAtResult, overdueByDueDateResult] = await Promise.all([
        todosTable
          .select(
            "id, title, description, due_date, due_at, is_completed, assigned_user_id, source_type, linked_issue_id, linked_inspection_id, linked_inspection_item_id, trade, priority, status, created_at, updated_at"
          )
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .in("status", statusesToLoad)
          .order("due_at", { ascending: true, nullsFirst: false })
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("updated_at", { ascending: false })
          .limit(1000),
        usersTable
          .select("user_id, display_name")
          .eq("organization_id", resolvedOrganizationId)
          .order("display_name", { ascending: true }),
        issuesTable
          .select("id, title")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("created_at", { ascending: false })
          .limit(400),
        inspectionsTable
          .select("id, title")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("created_at", { ascending: false })
          .limit(300),
        inspectionItemsTable
          .select("id, inspection_id, label")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .limit(1500),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .eq("status", "To Do"),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .eq("status", "In Progress"),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .in("status", ["Done", "Complete", "Archived"]),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .in("status", ["To Do", "In Progress"])
          .lt("due_at", nowIso),
        todosTable
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .in("status", ["To Do", "In Progress"])
          .is("due_at", null)
          .lt("due_date", today),
      ]);

      if (
        todosResult.error ||
        usersResult.error ||
        issuesResult.error ||
        inspectionsResult.error ||
        inspectionItemsResult.error ||
        todoCountResult.error ||
        inProgressCountResult.error ||
        completeCountResult.error ||
        overdueByDueAtResult.error ||
        overdueByDueDateResult.error
      ) {
        throw new Error(
          todosResult.error?.message ??
            usersResult.error?.message ??
            issuesResult.error?.message ??
            inspectionsResult.error?.message ??
            inspectionItemsResult.error?.message ??
            todoCountResult.error?.message ??
            inProgressCountResult.error?.message ??
            completeCountResult.error?.message ??
            overdueByDueAtResult.error?.message ??
            overdueByDueDateResult.error?.message ??
            "Unable to load tasks."
        );
      }

      const normalizedTodos: TodoRow[] = ((todosResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        title: String(row.title ?? ""),
        description: String(row.description ?? ""),
        dueDate: typeof row.due_date === "string" ? row.due_date : null,
        dueAt: typeof row.due_at === "string" ? row.due_at : null,
        isCompleted: Boolean(row.is_completed),
        assignedUserId: typeof row.assigned_user_id === "string" ? row.assigned_user_id : null,
        sourceType: normalizeSourceType(row.source_type),
        linkedIssueId: typeof row.linked_issue_id === "string" ? row.linked_issue_id : null,
        linkedInspectionId: typeof row.linked_inspection_id === "string" ? row.linked_inspection_id : null,
        linkedInspectionItemId: typeof row.linked_inspection_item_id === "string" ? row.linked_inspection_item_id : null,
        trade: String(row.trade ?? ""),
        priority: normalizePriority(row.priority),
        status: normalizeStatus(row.status),
        createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
      }));

      const normalizedUsers: OrganizationUserOption[] = ((usersResult.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => ({
          userId: String(row.user_id ?? ""),
          name: String(row.display_name ?? "").trim(),
        }))
        .filter((row) => row.userId.length > 0)
        .map((row) => ({ ...row, name: row.name || (row.userId === session.id ? session.name ?? "You" : "Team Member") }));

      const normalizedIssues: LinkedIssueOption[] = ((issuesResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        title: String(row.title ?? ""),
      }));

      const normalizedInspections: LinkedInspectionOption[] = ((inspectionsResult.data ?? []) as Array<Record<string, unknown>>).map(
        (row) => ({
          id: String(row.id),
          title: String(row.title ?? ""),
        })
      );

      const normalizedInspectionItems: LinkedInspectionItemOption[] =
        ((inspectionItemsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          inspectionId: String(row.inspection_id ?? ""),
          label: String(row.label ?? ""),
        }));

      const nextContext = { organizationId: resolvedOrganizationId, projectId: projectRow.id };

      setContext(nextContext);
      setTodos(normalizedTodos);
      setStats({
        todoCount: todoCountResult.count ?? 0,
        inProgressCount: inProgressCountResult.count ?? 0,
        completeCount: completeCountResult.count ?? 0,
        overdueCount: (overdueByDueAtResult.count ?? 0) + (overdueByDueDateResult.count ?? 0),
      });
      setOrganizationUsers(normalizedUsers);
      setIssueOptions(normalizedIssues);
      setInspectionOptions(normalizedInspections);
      setInspectionItemOptions(normalizedInspectionItems);
      setSelectedTaskId((current) => current ?? normalizedTodos[0]?.id ?? null);
      void loadAttachmentCountsForTasks(
        normalizedTodos.map((todo) => todo.id),
        nextContext
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tasks.");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    void loadData({ showLoading: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectSlug, session?.id, session?.organizationId, statusFilter, supabase, statusesToLoad]);

  useEffect(() => {
    if (!isDetailOpen || !selectedTaskId) {
      setSelectedTaskAttachments([]);
      return;
    }
    void loadAttachmentsForTask(selectedTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDetailOpen, selectedTaskId, context?.organizationId, context?.projectId, supabase]);

  const filteredTodos = useMemo(() => {
    return todos.filter((task) => {
      if (statusFilter === "All" && task.status === "Done") {
        return false;
      }

      const searchValue = search.trim().toLowerCase();
      if (searchValue) {
        const inspectionLabel = task.linkedInspectionItemId
          ? inspectionItemById.get(task.linkedInspectionItemId)?.label ?? ""
          : "";
        const haystack = `${task.title} ${task.description} ${task.trade} ${issueNameById.get(task.linkedIssueId ?? "") ?? ""} ${inspectionNameById.get(task.linkedInspectionId ?? "") ?? ""} ${inspectionLabel}`.toLowerCase();
        if (!haystack.includes(searchValue)) {
          return false;
        }
      }

      if (statusFilter !== "All" && task.status !== statusFilter) {
        return false;
      }
      if (assigneeFilter !== "All" && (task.assignedUserId ?? "") !== assigneeFilter) {
        return false;
      }
      if (tradeFilter !== "All" && task.trade !== tradeFilter) {
        return false;
      }
      if (priorityFilter !== "All" && task.priority !== priorityFilter) {
        return false;
      }
      if (!dueFilterMatch(dueFilter, task.dueDate, task.dueAt, task.status)) {
        return false;
      }

      if (linkedTypeFilter === "Issue" && !task.linkedIssueId) {
        return false;
      }
      if (linkedTypeFilter === "Inspection" && !task.linkedInspectionId && !task.linkedInspectionItemId) {
        return false;
      }
      if (
        linkedTypeFilter === "None" &&
        (task.linkedIssueId || task.linkedInspectionId || task.linkedInspectionItemId)
      ) {
        return false;
      }

      return true;
    });
  }, [
    todos,
    search,
    statusFilter,
    assigneeFilter,
    tradeFilter,
    priorityFilter,
    dueFilter,
    linkedTypeFilter,
    inspectionItemById,
    issueNameById,
    inspectionNameById,
  ]);

  const groupedTodos = useMemo(() => {
    if (groupBy === "All") {
      return [{ key: "all", label: "All Tasks", items: filteredTodos }];
    }

    const groups = new Map<string, TodoRow[]>();
    for (const task of filteredTodos) {
      let key = "";
      if (groupBy === "Status") {
        key = task.status;
      } else if (groupBy === "Assignee") {
        key = task.assignedUserId ? userNameById.get(task.assignedUserId) ?? "Team Member" : "Unassigned";
      } else {
        key = task.trade || "No trade";
      }
      const list = groups.get(key) ?? [];
      list.push(task);
      groups.set(key, list);
    }

    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({ key, label: key, items }));
  }, [filteredTodos, groupBy, userNameById]);

  const tradeOptions = useMemo(() => ["All", ...new Set(todos.map((task) => task.trade).filter(Boolean))], [todos]);
  const assigneeFilterOptions = useMemo(
    () => [
      { value: "All", label: "All assignees" },
      ...organizationUsers.map((member) => ({ value: member.userId, label: member.name })),
      { value: "", label: "Unassigned" },
    ],
    [organizationUsers]
  );
  const statusSections = useMemo(() => {
    const orderedStatuses: Array<{
      key: TodoStatus | "Need Review";
      label: string;
      icon: typeof CircleDot;
      accent: string;
      countColor: string;
    }> = [
      { key: "To Do", label: "To-do", icon: ListTodo, accent: "text-[#8B5CF6]", countColor: "text-[#A855F7]" },
      { key: "In Progress", label: "On Progress", icon: Clock3, accent: "text-[#0EA5E9]", countColor: "text-[#38BDF8]" },
      { key: "Need Review", label: "Need Review", icon: AlertCircle, accent: "text-[#F59E0B]", countColor: "text-[#F59E0B]" },
      { key: "Done", label: "Done", icon: CheckCircle2, accent: "text-[#22C55E]", countColor: "text-[#16A34A]" },
    ];

    return orderedStatuses
      .map((section) => ({
        ...section,
        items: filteredTodos.filter((task) => task.status === section.key),
      }))
      .filter((section) => statusFilter === "All" || statusFilter === section.key);
  }, [filteredTodos, statusFilter]);

  const resetCreateForm = () => {
    setNewTitle("");
    setNewDescription("");
    setNewTrade("");
    setNewAssignedUserId("");
    setNewDueDate("");
    setNewDueTime("");
    setNewPdfName("");
    setNewPdfDataUrl("");
    setNewPdfSizeBytes(null);
    setNewPriority("Medium");
    setNewStatus("To Do");
    setNewLinkedIssueId("");
    setNewLinkedInspectionId("");
  };

  const handleCreatePdfSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setNewPdfName("");
      setNewPdfDataUrl("");
      setNewPdfSizeBytes(null);
      return;
    }
    if (!isPdfFile(file)) {
      setError("Please attach a PDF file.");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setNewPdfName(file.name);
      setNewPdfDataUrl(dataUrl);
      setNewPdfSizeBytes(file.size);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to read PDF.");
    }
  };

  const handleDetailPdfSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setDetailPdfName("");
      setDetailPdfDataUrl("");
      setDetailPdfSizeBytes(null);
      return;
    }
    if (!isPdfFile(file)) {
      setError("Please attach a PDF file.");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setDetailPdfName(file.name);
      setDetailPdfDataUrl(dataUrl);
      setDetailPdfSizeBytes(file.size);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to read PDF.");
    }
  };

  const createTask = async () => {
    if (!context || !supabase || !session?.id || !newTitle.trim()) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todosTable = (supabase as any).from("project_job_todos");
      const dueAt = buildDueAt(newDueDate, newDueTime);
      const { data: insertedTask, error: insertError } = await todosTable
        .insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          created_by: session.id,
          title: newTitle.trim(),
          description: newDescription.trim(),
          due_date: newDueDate || null,
          due_at: dueAt,
          assigned_user_id: newAssignedUserId || null,
          trade: newTrade.trim(),
          priority: newPriority,
          status: newStatus,
          is_completed: newStatus === "Done",
          source_type: null,
          source_id: null,
          linked_issue_id: newLinkedIssueId || null,
          linked_inspection_id: newLinkedInspectionId || null,
        })
        .select("id")
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      if (newPdfDataUrl && insertedTask?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attachmentTable = (supabase as any).from("project_job_todo_attachments");
        const { error: attachmentError } = await attachmentTable.insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          todo_id: insertedTask.id,
          created_by: session.id,
          file_name: newPdfName || "Attachment.pdf",
          file_url: newPdfDataUrl,
          mime_type: "application/pdf",
          file_size_bytes: newPdfSizeBytes,
        });
        if (attachmentError) {
          throw new Error(attachmentError.message);
        }
      }

      setIsCreateOpen(false);
      resetCreateForm();
      await loadData({ showLoading: false });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create task.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveTask = async () => {
    if (!context || !supabase || !selectedTask || !detailTitle.trim()) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todosTable = (supabase as any).from("project_job_todos");
      const dueAt = buildDueAt(detailDueDate, detailDueTime);
      const { error: updateError } = await todosTable
        .update({
          title: detailTitle.trim(),
          description: detailDescription.trim(),
          due_date: detailDueDate || null,
          due_at: dueAt,
          assigned_user_id: detailAssignedUserId || null,
          trade: detailTrade.trim(),
          priority: detailPriority,
          status: detailStatus,
          is_completed: detailStatus === "Done",
          linked_issue_id: detailLinkedIssueId || null,
          linked_inspection_id: detailLinkedInspectionId || null,
        })
        .eq("id", selectedTask.id)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await loadData({ showLoading: false });
      if (detailStatus === "Done") {
        setIsDetailOpen(false);
        setSelectedTaskId(null);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update task.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!context || !supabase || !selectedTask) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todosTable = (supabase as any).from("project_job_todos");
      const { error: deleteError } = await todosTable
        .delete()
        .eq("id", selectedTask.id)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      setIsDetailOpen(false);
      setSelectedTaskId(null);
      await loadData({ showLoading: false });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to delete task.");
    } finally {
      setIsSaving(false);
    }
  };

  const addAttachmentToSelectedTask = async () => {
    if (!context || !supabase || !session?.id || !selectedTask || !detailPdfDataUrl) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentTable = (supabase as any).from("project_job_todo_attachments");
      const { error: attachmentError } = await attachmentTable.insert({
        organization_id: context.organizationId,
        project_id: context.projectId,
        todo_id: selectedTask.id,
        created_by: session.id,
        file_name: detailPdfName || "Attachment.pdf",
        file_url: detailPdfDataUrl,
        mime_type: "application/pdf",
        file_size_bytes: detailPdfSizeBytes,
      });
      if (attachmentError) {
        throw new Error(attachmentError.message);
      }
      setDetailPdfName("");
      setDetailPdfDataUrl("");
      setDetailPdfSizeBytes(null);
      await Promise.all([
        loadData({ showLoading: false }),
        loadAttachmentsForTask(selectedTask.id),
      ]);
    } catch (attachmentSaveError) {
      setError(attachmentSaveError instanceof Error ? attachmentSaveError.message : "Unable to attach PDF.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    if (!context || !supabase) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentTable = (supabase as any).from("project_job_todo_attachments");
      const { error: removeError } = await attachmentTable
        .delete()
        .eq("id", attachmentId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (removeError) {
        throw new Error(removeError.message);
      }
      await Promise.all([
        loadData({ showLoading: false }),
        selectedTaskId ? loadAttachmentsForTask(selectedTaskId) : Promise.resolve(),
      ]);
    } catch (removeAttachmentError) {
      setError(removeAttachmentError instanceof Error ? removeAttachmentError.message : "Unable to delete PDF.");
    } finally {
      setIsSaving(false);
    }
  };

  const openAttachment = async (attachment: TodoAttachment) => {
    try {
      if (!attachment.fileUrl) {
        throw new Error("Missing attachment URL.");
      }
      if (attachment.fileUrl.startsWith("data:")) {
        const response = await fetch(attachment.fileUrl);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 60_000);
        return;
      }
      window.open(attachment.fileUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open PDF.");
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-[22px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">Tasks</h1>
              <div className="inline-flex items-center gap-2 rounded-[12px] bg-[#FEE2E2] px-4 py-2 text-[14px] font-medium text-[#B91C1C]">
                <AlertCircle className="h-4 w-4" strokeWidth={2} />
                {stats.overdueCount} Overdue
              </div>
              <div className="inline-flex items-center rounded-[14px] border border-[#E2E8F1] bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="inline-flex items-center gap-2 rounded-[10px] bg-[#F8FAFC] px-4 py-2 text-[13px] font-medium text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                  <ListTodo className="h-4 w-4" strokeWidth={2} />
                  List
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="h-9 rounded-[12px] bg-[#F74917] px-4 text-[14px] font-semibold text-white hover:bg-[#e63f10]"
            >
              <span className="mr-1 text-[16px] leading-none">+</span>
              Add Task
            </Button>
          </div>
        </div>

        <div className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search..."
                  className="h-10 rounded-[12px] border-[#D9E3EE] bg-white pl-11 text-[14px]"
                />
              </div>
              <div className="relative">
                <AlertCircle className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white pl-10 pr-8 text-[14px] text-[#0F172A]`}
                >
                  <option value="All">All Status</option>
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Need Review">Need Review</option>
                  <option value="Done">Done</option>
                </select>
              </div>
              <div className="relative">
                <Flag className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                  className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white pl-10 pr-8 text-[14px] text-[#0F172A]`}
                >
                  <option value="All">Filter</option>
                  <option value="High">High priority</option>
                  <option value="Medium">Medium priority</option>
                  <option value="Low">Low priority</option>
                </select>
              </div>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
                <select
                  value={dueFilter}
                  onChange={(event) => setDueFilter(event.target.value)}
                  className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white pl-10 pr-8 text-[14px] text-[#0F172A]`}
                >
                  <option value="All">Sort</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Due Today">Due Today</option>
                  <option value="No Due Date">No Due Date</option>
                </select>
              </div>
              <div className="relative">
                <UserCircle2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
                <select
                  value={assigneeFilter}
                  onChange={(event) => setAssigneeFilter(event.target.value)}
                  className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white pl-10 pr-8 text-[14px] text-[#0F172A]`}
                >
                  {assigneeFilterOptions.map((option) => (
                    <option key={`${option.value}-${option.label}`} value={option.value}>
                      {option.label === "All assignees" ? "People" : option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
            {error ? (
              <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2">
                <p className={`${interMedium.className} text-xs font-medium text-rose-800`}>{error}</p>
              </div>
            ) : null}

            {!isLoading ? (
              <div className="space-y-4">
                {filteredTodos.length === 0 ? (
                  <div className="rounded-[16px] border border-[#D9E3EE] bg-white px-4 py-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                    <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>
                      {todos.length === 0 ? "No tasks yet" : "No matching tasks"}
                    </p>
                    <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>
                      {todos.length === 0 ? "Add tasks to manage work on this job." : "Try adjusting your filters or search."}
                    </p>
                  </div>
                ) : (
                  statusSections.map((section) => {
                    return (
                      <div key={section.key} className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <p className="m-0 text-[22px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">
                              {section.key === "To Do" ? "To Do" : section.label}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsCreateOpen(true)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#E2E8F1] bg-white text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#334155]"
                            aria-label={`Add task to ${section.label}`}
                          >
                            +
                          </button>
                        </div>

                        <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                        <div className="grid grid-cols-[minmax(220px,1.6fr)_minmax(220px,1.8fr)_minmax(120px,0.8fr)_minmax(150px,0.95fr)_minmax(140px,0.9fr)_minmax(150px,0.95fr)_72px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
                          {[
                            "Task Name",
                            "Descriptions",
                            "Priority",
                            "Timeline Date",
                            "People",
                            "Progress",
                            " ",
                          ].map((heading) => (
                            <div key={heading} className="flex items-center gap-2">
                              <p className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                                {heading}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div>
                          {section.items.length === 0 ? (
                            <div className="px-5 py-6">
                              <p className={`${interMedium.className} m-0 text-[13px] text-[#6B7C93]`}>No tasks in this section yet.</p>
                            </div>
                          ) : section.items.map((task) => {
                            const overdue = isOverdue(task.dueDate, task.dueAt, task.status);
                            const assignedName = task.assignedUserId ? userNameById.get(task.assignedUserId) ?? "Team Member" : "Unassigned";
                            const linkedIssueName = task.linkedIssueId ? issueNameById.get(task.linkedIssueId) ?? "Linked issue" : "";
                            const linkedInspectionName = task.linkedInspectionId
                              ? inspectionNameById.get(task.linkedInspectionId) ?? "Linked inspection"
                              : task.linkedInspectionItemId
                                ? inspectionNameById.get(inspectionItemById.get(task.linkedInspectionItemId)?.inspectionId ?? "") ?? "Linked inspection"
                                : "";
                            const progressValue = task.status === "Done" ? 10 : task.status === "In Progress" ? 5 : 1;
                            const detailSummary = task.description || linkedIssueName || linkedInspectionName || "No description added";

                            return (
                              <div
                                key={task.id}
                                className={cn(
                                  "grid grid-cols-[minmax(220px,1.6fr)_minmax(220px,1.8fr)_minmax(120px,0.8fr)_minmax(150px,0.95fr)_minmax(140px,0.9fr)_minmax(150px,0.95fr)_72px] items-center border-b border-[#EEF3F8] px-5 py-3 last:border-b-0",
                                  overdue ? "bg-[#FFF6F6]" : "bg-white"
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTaskId(task.id);
                                    setIsDetailOpen(true);
                                  }}
                                  className="min-w-0 text-left"
                                >
                                  <div className="flex items-start gap-3">
                                    <span className="mt-0.5 h-4 w-4 rounded-[4px] border border-[#D7E0EA] bg-white" />
                                    <div className="min-w-0">
                                      <p className={`${interMedium.className} m-0 truncate text-[14px] font-semibold text-[#0F172A]`}>{task.title}</p>
                                      {task.trade ? (
                                        <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[#6B7C93]`}>
                                          {task.trade}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </button>

                                <div className="min-w-0 pr-4">
                                  <p className={`${interMedium.className} m-0 truncate text-[13px] text-[#0F172A]`}>{detailSummary}</p>
                                </div>

                                <div className="flex items-center">
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full px-3 py-1 text-[12px] font-medium",
                                      task.priority === "Low"
                                        ? "bg-[#DCFCE7] text-[#15803D]"
                                        : task.priority === "High"
                                          ? "bg-[#FEE2E2] text-[#B91C1C]"
                                          : "bg-[#FEF3C7] text-[#A16207]"
                                    )}
                                  >
                                    {task.priority}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Calendar className={cn("h-4 w-4", overdue ? "text-[#FF3B30]" : "text-[#64748B]")} strokeWidth={2} />
                                  <div>
                                    <p className={cn(`${interMedium.className} m-0 text-[13px]`, overdue ? "font-semibold text-[#FF3B30]" : "text-[#0F172A]")}>
                                      {formatTaskTableDate(task.dueDate, task.dueAt)}
                                    </p>
                                    {overdue ? (
                                      <p className={`${interMedium.className} m-0 text-[11px] font-medium uppercase tracking-[0.06em] text-[#B91C1C]`}>
                                        Overdue
                                      </p>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F74917] text-[12px] font-semibold text-white">
                                    {getInitials(assignedName)}
                                  </span>
                                  <p className={`${interMedium.className} m-0 truncate text-[13px] text-[#0F172A]`}>{assignedName}</p>
                                </div>

                                <div className="pr-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className={`${interMedium.className} m-0 text-[11px] text-[#64748B]`}>Checklist</p>
                                    <p className={`${interMedium.className} m-0 text-[11px] font-medium text-[#0F172A]`}>{progressValue}/10</p>
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E6EDF5]">
                                    <div
                                      className="h-full rounded-full bg-[#1DA1F2]"
                                      style={{ width: `${(progressValue / 10) * 100}%` }}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedTaskId(task.id);
                                      setIsDetailOpen(true);
                                    }}
                                    className={`${ibmPlexSans.className} inline-flex h-9 items-center justify-center gap-1.5 rounded-[12px] bg-[#F74917] px-3.5 text-[13px] font-semibold text-white transition hover:bg-[#e63f10]`}
                                    aria-label={`Edit ${task.title}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                                    Edit
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <p className={`${interMedium.className} text-sm text-[#64748B]`}>Loading tasks...</p>
            )}
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
          <div className="space-y-0">
            <DialogHeader className="px-7 pb-6 pt-7">
              <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]`}>
                Add Task
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3.5 px-7 pb-4">
              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Title
                </label>
                <Input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                />
              </div>

              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  rows={3}
                  className={`${ibmPlexSans.className} w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                />
              </div>

              <div>
                <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                  Assignee
                </label>
                <select
                  value={newAssignedUserId}
                  onChange={(event) => setNewAssignedUserId(event.target.value)}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                >
                  {assigneeOptions.map((member) => (
                    <option key={`${member.userId}-${member.name}`} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Due Date
                  </label>
                  <Input
                    type="date"
                    value={newDueDate}
                    onChange={(event) => setNewDueDate(event.target.value)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                  />
                </div>
                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Due Time
                  </label>
                  <Input
                    type="time"
                    step="60"
                    value={newDueTime}
                    onChange={(event) => setNewDueTime(event.target.value)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29] [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:text-[#10283B] [&::-webkit-datetime-edit-fields-wrapper]:text-[#10283B]`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(event) => setNewPriority(event.target.value as TodoPriority)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(event) => setNewStatus(event.target.value as TodoStatus)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                className={`${ibmPlexSans.className} h-10 rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void createTask()}
                disabled={isSaving || !newTitle.trim()}
                className={`${ibmPlexSans.className} h-10 rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f]`}
              >
                Save Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
          {selectedTask ? (
            <div className="space-y-0">
              <DialogHeader className="px-7 pb-6 pt-7">
                <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]`}>
                  Edit Task
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3.5 px-7 pb-4">
                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Title
                  </label>
                  <Input
                    value={detailTitle}
                    onChange={(event) => setDetailTitle(event.target.value)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                  />
                </div>

                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Description
                  </label>
                  <textarea
                    value={detailDescription}
                    onChange={(event) => setDetailDescription(event.target.value)}
                    rows={3}
                    className={`${ibmPlexSans.className} w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                  />
                </div>

                <div>
                  <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                    Assignee
                  </label>
                  <select
                    value={detailAssignedUserId}
                    onChange={(event) => setDetailAssignedUserId(event.target.value)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                  >
                    {assigneeOptions.map((member) => (
                      <option key={`${member.userId}-${member.name}`} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                      Due Date
                    </label>
                    <Input
                      type="date"
                      value={detailDueDate}
                      onChange={(event) => setDetailDueDate(event.target.value)}
                      className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                    />
                  </div>
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                      Due Time
                    </label>
                    <Input
                      type="time"
                      step="60"
                      value={detailDueTime}
                      onChange={(event) => setDetailDueTime(event.target.value)}
                      className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29] [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:text-[#10283B] [&::-webkit-datetime-edit-fields-wrapper]:text-[#10283B]`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                      Priority
                    </label>
                    <select
                      value={detailPriority}
                      onChange={(event) => setDetailPriority(event.target.value as TodoPriority)}
                      className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
                      Status
                    </label>
                    <select
                      value={detailStatus}
                      onChange={(event) => setDetailStatus(event.target.value as TodoStatus)}
                      className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDetailOpen(false)}
                  className={`${ibmPlexSans.className} h-10 rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveTask()}
                  disabled={isSaving || !detailTitle.trim()}
                  className={`${ibmPlexSans.className} h-10 rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f]`}
                >
                  Save Task
                </Button>
              </div>
            </div>
          ) : (
            <p className={`${interMedium.className} text-sm text-[#64748B]`}>Select a task to view details.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
