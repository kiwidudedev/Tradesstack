"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, CircleDot, Clock3, FileText, ListTodo, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type TodoStatus = "To Do" | "In Progress" | "Complete";
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
    return "Complete";
  }
  if (value === "To Do" || value === "In Progress" || value === "Complete") {
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
  if (status === "Complete") {
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
  if (status === "Complete") {
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
  const [statusFilter, setStatusFilter] = useState("To Do");
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
    if (statusFilter === "Complete") {
      return ["Complete", "Archived"];
    }
    if (statusFilter === "To Do") {
      return ["To Do"];
    }
    return ["To Do", "In Progress"];
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
          .in("status", ["Complete", "Archived"]),
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
      if (statusFilter === "All" && task.status === "Complete") {
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
          is_completed: newStatus === "Complete",
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
          is_completed: detailStatus === "Complete",
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
      if (detailStatus === "Complete") {
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

  const renderLinkedBadge = (task: TodoRow) => {
    if (task.linkedIssueId) {
      return <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Issue</Badge>;
    }
    if (task.linkedInspectionId || task.linkedInspectionItemId) {
      return <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Inspection</Badge>;
    }
    if (task.sourceType === "qa_issue") {
      return <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Auto from Issue</Badge>;
    }
    if (task.sourceType === "inspection_fail") {
      return <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Auto from Inspection</Badge>;
    }
    return <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Standalone</Badge>;
  };

  return (
    <div className="space-y-6 pb-8">
      <Card className="border-[#D9DEE5] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <CardTitle className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">Tasks</CardTitle>
          <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
            Execution layer for job tasks linked to issues and inspections.
          </p>
        </CardHeader>
        <CardContent className="pb-7">
          <div className="overflow-x-auto rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC]">
            <div className="flex min-w-[760px] divide-x divide-[#E3E8F0]">
              <div className="flex flex-1 items-center gap-3 px-5 py-4">
                <ListTodo className="h-5 w-5 text-[#334155]" />
                <div>
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>To Do</p>
                  <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{stats.todoCount}</p>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-3 px-5 py-4">
                <Clock3 className="h-5 w-5 text-[#B45309]" />
                <div>
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Overdue</p>
                  <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{stats.overdueCount}</p>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-3 px-5 py-4">
                <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
                <div>
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Complete</p>
                  <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{stats.completeCount}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#D9DEE5] bg-white shadow-none">
        <CardHeader className="pb-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-[220px] border-[#CBD5E1] bg-white"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
              >
                <option value="All">All status</option>
                <option value="To Do">To Do</option>
                <option value="Complete">Completed</option>
              </select>
              <select
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as GroupByMode)}
                className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
              >
                <option value="All">All tasks</option>
                <option value="Status">Group by status</option>
                <option value="Assignee">Group by assignee</option>
                <option value="Trade">Group by trade</option>
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("To Do");
                  setAssigneeFilter("All");
                  setTradeFilter("All");
                  setPriorityFilter("All");
                  setDueFilter("All");
                  setLinkedTypeFilter("All");
                  setGroupBy("All");
                }}
                className="h-9 border-[#CBD5E1] bg-white text-[#334155]"
              >
                Reset Filters
              </Button>
            </div>
            <Button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="h-9 rounded-[6px] bg-[#F74917] px-3 text-xs font-semibold text-white hover:bg-[#e63f10]"
            >
              Add Task
            </Button>
          </div>

          <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-5">
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
            >
              {assigneeFilterOptions.map((option) => (
                <option key={`${option.value}-${option.label}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={tradeFilter}
              onChange={(event) => setTradeFilter(event.target.value)}
              className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
            >
              <option value="All">All trades</option>
              {tradeOptions.filter((option) => option !== "All").map((trade) => (
                <option key={trade} value={trade}>
                  {trade}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
            >
              <option value="All">All priority</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select
              value={dueFilter}
              onChange={(event) => setDueFilter(event.target.value)}
              className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
            >
              <option value="All">All due dates</option>
              <option value="Overdue">Overdue</option>
              <option value="Due Today">Due today</option>
              <option value="No Due Date">No due date</option>
            </select>
            <select
              value={linkedTypeFilter}
              onChange={(event) => setLinkedTypeFilter(event.target.value)}
              className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
            >
              <option value="All">All links</option>
              <option value="Issue">Issue</option>
              <option value="Inspection">Inspection</option>
              <option value="None">None</option>
            </select>
          </div>

          {error ? (
            <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2">
              <p className={`${interMedium.className} text-xs font-medium text-rose-800`}>{error}</p>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4 pb-6">
          {isLoading ? <p className={`${interMedium.className} text-sm text-[#64748B]`}>Loading tasks...</p> : null}

          {!isLoading && filteredTodos.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white px-4 py-7 text-center">
              <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>No tasks yet</p>
              <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>
                Add tasks to manage work on this job.
              </p>
            </div>
          ) : null}

          {!isLoading &&
            groupedTodos.map((group) => (
              <div key={group.key} className="space-y-2">
                {groupBy !== "All" ? (
                  <p className={`${interMedium.className} px-1 text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>
                    {group.label}
                  </p>
                ) : null}
                {group.items.map((task) => {
                  const overdue = isOverdue(task.dueDate, task.dueAt, task.status);
                  const assignedName = task.assignedUserId ? userNameById.get(task.assignedUserId) ?? "Team Member" : "Unassigned";
                  const pdfCount = attachmentCountsByTodoId[task.id] ?? 0;
                  const linkedIssueName = task.linkedIssueId ? issueNameById.get(task.linkedIssueId) ?? "Linked issue" : "";
                  const linkedInspectionName = task.linkedInspectionId
                    ? inspectionNameById.get(task.linkedInspectionId) ?? "Linked inspection"
                    : task.linkedInspectionItemId
                      ? inspectionNameById.get(inspectionItemById.get(task.linkedInspectionItemId)?.inspectionId ?? "") ??
                        "Linked inspection"
                      : "";

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        setSelectedTaskId(task.id);
                        setIsDetailOpen(true);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-[8px] border bg-white px-3 py-3 text-left transition-colors hover:bg-[#F8FAFC]",
                        overdue ? "border-rose-200" : "border-[#E6EAF0]"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <CircleDot className="h-4 w-4 text-[#64748B]" />
                        <div className="min-w-0">
                          <p className={`${interMedium.className} truncate text-sm font-semibold text-[#0F172A]`}>{task.title}</p>
                          <p className={`${interMedium.className} truncate text-xs text-[#64748B]`}>
                            {task.trade || "No trade"} • {assignedName} • {formatDueLabel(task.dueDate, task.dueAt)}
                          </p>
                          {linkedIssueName || linkedInspectionName ? (
                            <p className={`${interMedium.className} truncate text-xs text-[#475569]`}>
                              {linkedIssueName || linkedInspectionName}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="ml-3 flex flex-wrap items-center justify-end gap-2">
                        {renderLinkedBadge(task)}
                        {pdfCount > 0 ? (
                          <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#334155]`}>
                            {pdfCount} PDF
                          </span>
                        ) : null}
                        <span
                          className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${priorityTone(task.priority)}`}
                        >
                          {task.priority}
                        </span>
                        {overdue ? (
                          <span className={`${interMedium.className} rounded-full border border-rose-200 bg-rose-100 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-rose-700`}>
                            Overdue
                          </span>
                        ) : null}
                        <span
                          className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusTone(task.status)}`}
                        >
                          {task.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
        </CardContent>
      </Card>

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          <div className="space-y-4">
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Tasks</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Add Task</h3>
            </div>

            <div className="space-y-1">
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Title</p>
              <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </div>

            <div className="space-y-1">
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Description</p>
              <textarea
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                rows={4}
                className={`${interMedium.className} w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Trade</p>
                <Input value={newTrade} onChange={(event) => setNewTrade(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </div>
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Assign To</p>
                <select
                  value={newAssignedUserId}
                  onChange={(event) => setNewAssignedUserId(event.target.value)}
                  className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                >
                  {assigneeOptions.map((member) => (
                    <option key={`${member.userId}-${member.name}`} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Due Date</p>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(event) => setNewDueDate(event.target.value)}
                  className="h-10 border-[#CBD5E1] bg-white"
                />
              </div>
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Due Time</p>
                <Input
                  type="time"
                  value={newDueTime}
                  onChange={(event) => setNewDueTime(event.target.value)}
                  className="h-10 border-[#CBD5E1] bg-white"
                />
              </div>
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Priority</p>
                <select
                  value={newPriority}
                  onChange={(event) => setNewPriority(event.target.value as TodoPriority)}
                  className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Status</p>
                <select
                  value={newStatus}
                  onChange={(event) => setNewStatus(event.target.value as TodoStatus)}
                  className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                >
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Complete">Complete</option>
                </select>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Link</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <select
                  value={newLinkedIssueId}
                  onChange={(event) => setNewLinkedIssueId(event.target.value)}
                  className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                >
                  <option value="">No linked issue</option>
                  {issueOptions.map((issue) => (
                    <option key={issue.id} value={issue.id}>
                      {issue.title}
                    </option>
                  ))}
                </select>
                <select
                  value={newLinkedInspectionId}
                  onChange={(event) => setNewLinkedInspectionId(event.target.value)}
                  className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                >
                  <option value="">No linked inspection</option>
                  {inspectionOptions.map((inspection) => (
                    <option key={inspection.id} value={inspection.id}>
                      {inspection.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Attach PDF</p>
              <label className="mt-2 flex h-14 w-full cursor-pointer items-center justify-between rounded-[12px] border border-[#CBD5E1] bg-white px-4 transition-colors hover:bg-[#F8FAFC]">
                <span className={`${interMedium.className} truncate text-sm font-semibold text-[#334155]`}>
                  {newPdfName || "Choose PDF"}
                </span>
                <span className="ml-3 inline-flex h-10 min-w-[110px] items-center justify-center rounded-[12px] bg-[#0F172A] px-4 text-sm font-semibold text-white">
                  Browse
                </span>
                <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void handleCreatePdfSelect(event)} />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="h-9 border-[#CBD5E1] bg-white text-[#334155]">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void createTask()}
                disabled={isSaving || !newTitle.trim()}
                className="h-9 rounded-[6px] bg-[#F74917] px-4 text-xs font-semibold text-white hover:bg-[#e63f10]"
              >
                Save Task
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent side="right" className="w-full max-w-[620px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          {selectedTask ? (
            <div className="space-y-4">
              <div>
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Task Detail</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">{selectedTask.title}</h3>
              </div>

              <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 sm:grid-cols-2">
                <div>
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Created</p>
                  <p className={`${interMedium.className} text-sm text-[#334155]`}>{formatEventTime(selectedTask.createdAt)}</p>
                </div>
                <div>
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Updated</p>
                  <p className={`${interMedium.className} text-sm text-[#334155]`}>{formatEventTime(selectedTask.updatedAt)}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Title</p>
                <Input value={detailTitle} onChange={(event) => setDetailTitle(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </div>

              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Notes</p>
                <textarea
                  value={detailDescription}
                  onChange={(event) => setDetailDescription(event.target.value)}
                  rows={4}
                  className={`${interMedium.className} w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Trade</p>
                  <Input value={detailTrade} onChange={(event) => setDetailTrade(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
                </div>
                <div className="space-y-1">
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Assign To</p>
                  <select
                    value={detailAssignedUserId}
                    onChange={(event) => setDetailAssignedUserId(event.target.value)}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                  >
                    {assigneeOptions.map((member) => (
                      <option key={`${member.userId}-${member.name}`} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Due Date</p>
                <Input
                  type="date"
                  value={detailDueDate}
                  onChange={(event) => setDetailDueDate(event.target.value)}
                  className="h-10 border-[#CBD5E1] bg-white"
                />
              </div>
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Due Time</p>
                <Input
                  type="time"
                  value={detailDueTime}
                  onChange={(event) => setDetailDueTime(event.target.value)}
                  className="h-10 border-[#CBD5E1] bg-white"
                />
              </div>
              <div className="space-y-1">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Priority</p>
                  <select
                    value={detailPriority}
                    onChange={(event) => setDetailPriority(event.target.value as TodoPriority)}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Status</p>
                  <select
                    value={detailStatus}
                    onChange={(event) => setDetailStatus(event.target.value as TodoStatus)}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                  >
                    <option value="To Do">To Do</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Complete">Complete</option>
                  </select>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Links</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <select
                    value={detailLinkedIssueId}
                    onChange={(event) => setDetailLinkedIssueId(event.target.value)}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                  >
                    <option value="">No linked issue</option>
                    {issueOptions.map((issue) => (
                      <option key={issue.id} value={issue.id}>
                        {issue.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={detailLinkedInspectionId}
                    onChange={(event) => setDetailLinkedInspectionId(event.target.value)}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                  >
                    <option value="">No linked inspection</option>
                    {inspectionOptions.map((inspection) => (
                      <option key={inspection.id} value={inspection.id}>
                        {inspection.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>PDF Attachments</p>
                <div className="mt-2 space-y-2">
                  <label className="flex h-14 w-full cursor-pointer items-center justify-between rounded-[12px] border border-[#CBD5E1] bg-white px-4 transition-colors hover:bg-[#F8FAFC]">
                    <span className={`${interMedium.className} truncate text-sm font-semibold text-[#334155]`}>
                      {detailPdfName || "Choose PDF"}
                    </span>
                    <span className="ml-3 inline-flex h-10 min-w-[110px] items-center justify-center rounded-[12px] bg-[#0F172A] px-4 text-sm font-semibold text-white">
                      Browse
                    </span>
                    <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void handleDetailPdfSelect(event)} />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void addAttachmentToSelectedTask()}
                    disabled={isSaving || !detailPdfDataUrl}
                    className="h-9 border-[#CBD5E1] bg-white text-[#334155]"
                  >
                    Attach PDF
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {selectedTaskAttachments.length === 0 ? (
                    <p className={`${interMedium.className} text-xs text-[#64748B]`}>No PDFs attached to this task.</p>
                  ) : (
                    selectedTaskAttachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                        <div className="min-w-0">
                          <p className={`${interMedium.className} truncate text-sm font-semibold text-[#0F172A]`}>
                            {attachment.fileName}
                          </p>
                          <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                            {formatBytes(attachment.fileSizeBytes) || "PDF"} • {formatEventTime(attachment.createdAt)}
                          </p>
                        </div>
                        <div className="ml-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void openAttachment(attachment)}
                            className="inline-flex items-center gap-1 rounded-[6px] border border-[#CBD5E1] bg-white px-2 py-1 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteAttachment(attachment.id)}
                            className="inline-flex items-center rounded-[6px] border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Activity</p>
                <div className="mt-2 space-y-2">
                  <p className={`${interMedium.className} text-xs text-[#475569]`}>Created: {formatEventTime(selectedTask.createdAt)}</p>
                  <p className={`${interMedium.className} text-xs text-[#475569]`}>Last updated: {formatEventTime(selectedTask.updatedAt)}</p>
                  <p className={`${interMedium.className} text-xs text-[#475569]`}>
                    Linked source: {selectedTask.sourceType === "qa_issue" ? "Issue" : selectedTask.sourceType === "inspection_fail" ? "Inspection Fail" : "Manual"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => void deleteTask()} disabled={isSaving} className="h-9 border-rose-200 bg-white text-rose-700 hover:bg-rose-50">
                  Delete Task
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDetailStatus("Complete")}
                    disabled={isSaving || detailStatus === "Complete"}
                    className="h-9 border-[#CBD5E1] bg-white text-[#334155]"
                  >
                    Mark Complete
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void saveTask()}
                    disabled={isSaving || !detailTitle.trim()}
                    className="h-9 rounded-[6px] bg-[#F74917] px-4 text-xs font-semibold text-white hover:bg-[#e63f10]"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className={`${interMedium.className} text-sm text-[#64748B]`}>Select a task to view details.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
