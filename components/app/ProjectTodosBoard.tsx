"use client";

import { Suspense, type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Calendar, FileText, Flag, ListTodo, Pencil, Search, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/app/FormLabel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { ToolbarSelect } from "@/components/app/ToolbarSelect";
import { TodosSectionSkeleton } from "@/components/app/ProjectRouteSkeletons";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  createTask as createSharedTask,
  deleteTaskAttachment,
  getTask as getSharedTask,
  listTaskAttachments,
  listTasks as listSharedTasks,
  updateTask as updateSharedTask,
  uploadTaskAttachment,
} from "@/lib/tasks/service";
import type { TaskPayload, TaskStatus } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

type TodoStatus = "To Do" | "In Progress" | "Need Review" | "Done";
type TodoPriority = "Low" | "Medium" | "High";
type TodoSourceType = "quality_issue" | "quality_inspection_item" | null;
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
  displayKey: string;
  source: "legacy" | "storage";
  todoId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSizeBytes: number | null;
  createdAt: string;
  storageBucket: string | null;
  storagePath: string | null;
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
  if (value === "quality_issue" || value === "quality_inspection_item") {
    return value;
  }
  if (value === "qa_issue") {
    return "quality_issue";
  }
  if (value === "inspection_fail") {
    return "quality_inspection_item";
  }
  return null;
}

function mapTaskPayloadToTodoRow(task: TaskPayload): TodoRow {
  const status = normalizeStatus(task.status);

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    dueAt: task.dueAt,
    isCompleted: status === "Done" || Boolean(task.completedAt),
    assignedUserId: task.assignedUserId,
    sourceType: normalizeSourceType(task.sourceType),
    linkedIssueId: task.linkedIssueId,
    linkedInspectionId: task.linkedInspectionId,
    linkedInspectionItemId: task.linkedInspectionItemId,
    trade: task.trade,
    priority: normalizePriority(task.priority),
    status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
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

function getLegacyAttachmentId(metadata: Record<string, unknown>): string | null {
  const value = metadata.legacyAttachmentId;
  return typeof value === "string" && value.length > 0 ? value : null;
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
    return "bg-[var(--success-light)] text-[var(--success)] border-[var(--success-light)]";
  }
  if (status === "In Progress") {
    return "bg-[var(--warning-light)] text-[var(--warning)] border-[var(--warning-light)]";
  }
  return "bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border)]";
}

function priorityTone(priority: TodoPriority) {
  if (priority === "High") {
    return "bg-[var(--error-light)] text-[var(--error)] border-[var(--error-light)]";
  }
  if (priority === "Low") {
    return "bg-[var(--info-light)] text-[var(--info)] border-[var(--info-light)]";
  }
  return "bg-[var(--warning-light)] text-[var(--warning)] border-[var(--warning-light)]";
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
  const [newPdfFile, setNewPdfFile] = useState<File | null>(null);
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
  const [detailPdfFile, setDetailPdfFile] = useState<File | null>(null);
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
      return ["Done", "Archived"];
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
    setDetailPdfFile(null);
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
      const [storageAttachments, legacyAttachmentsResult] = await Promise.all([
        listTaskAttachments(supabase, taskId),
        attachmentTable
          .select("id, todo_id, file_name, file_url, mime_type, file_size_bytes, created_at")
          .eq("organization_id", taskContext.organizationId)
          .eq("project_id", taskContext.projectId)
          .eq("todo_id", taskId)
          .order("created_at", { ascending: false }),
      ]);
      const { data, error: attachmentError } = legacyAttachmentsResult;
      if (attachmentError) {
        throw new Error(attachmentError.message);
      }

      const migratedLegacyIds = new Set(
        storageAttachments
          .map((attachment) => getLegacyAttachmentId(attachment.metadata as Record<string, unknown>))
          .filter((value): value is string => Boolean(value))
      );
      const normalizedStorage: TodoAttachment[] = storageAttachments.map((attachment) => ({
        id: attachment.id,
        displayKey: `storage:${attachment.id}`,
        source: "storage",
        todoId: attachment.taskId,
        fileName: attachment.fileName || "Attachment.pdf",
        fileUrl: "",
        mimeType: attachment.mimeType,
        fileSizeBytes: attachment.fileSize,
        createdAt: attachment.createdAt,
        storageBucket: attachment.storageBucket,
        storagePath: attachment.storagePath,
      }));
      const normalizedLegacy: TodoAttachment[] = ((data ?? []) as Array<Record<string, unknown>>)
        .filter((row) => !migratedLegacyIds.has(String(row.id)))
        .map((row) => ({
          id: String(row.id),
          displayKey: `legacy:${String(row.id)}`,
          source: "legacy",
          todoId: String(row.todo_id ?? ""),
          fileName: String(row.file_name ?? "Attachment.pdf"),
          fileUrl: String(row.file_url ?? ""),
          mimeType: String(row.mime_type ?? ""),
          fileSizeBytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
          storageBucket: null,
          storagePath: null,
        }));
      const normalized = [...normalizedStorage, ...normalizedLegacy].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      setSelectedTaskAttachments(normalized);
    } catch (attachmentLoadError) {
      setError(attachmentLoadError instanceof Error ? attachmentLoadError.message : "Unable to load task PDFs.");
    }
  };

  const loadData = async (options?: { showLoading?: boolean }) => {
    if (!supabase || !routeProjectSlug || !session?.id || isLoadingRef.current) {
      return;
    }

    const showLoading = options?.showLoading ?? true;
    const timingLabel = `[projects][todos] load:${routeProjectSlug}`;
    console.time(timingLabel);
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
      const usersTable = (supabase as any).from("organization_members");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesTable = (supabase as any).from("project_quality_issues");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionsTable = (supabase as any).from("project_quality_inspections");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionItemsTable = (supabase as any).from("project_quality_inspection_items");

      const [todosResult, usersResult, issuesResult, inspectionsResult, inspectionItemsResult, statsSummaryResult] = await Promise.all([
        listSharedTasks(supabase, {
          projectId: projectRow.id,
          statuses: statusesToLoad as TaskStatus[],
          includeArchived: statusFilter === "Done",
        }),
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
        listSharedTasks(supabase, {
          projectId: projectRow.id,
          statuses: ["To Do", "In Progress", "Done", "Archived"],
          includeArchived: true,
        }),
      ]);

      if (
        usersResult.error ||
        issuesResult.error ||
        inspectionsResult.error ||
        inspectionItemsResult.error
      ) {
        throw new Error(
          usersResult.error?.message ??
            issuesResult.error?.message ??
            inspectionsResult.error?.message ??
            inspectionItemsResult.error?.message ??
            "Unable to load tasks."
        );
      }

      const normalizedTodos = todosResult.map(mapTaskPayloadToTodoRow);

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
      const nextStats = statsSummaryResult.reduce<TaskStats>((summary, task) => {
        const row = mapTaskPayloadToTodoRow(task);
        const status = row.status;
        const dueAt = row.dueAt;
        const dueDate = row.dueDate;

        if (status === "To Do") {
          summary.todoCount += 1;
        } else if (status === "In Progress") {
          summary.inProgressCount += 1;
        } else if (status === "Done") {
          summary.completeCount += 1;
        }

        if ((status === "To Do" || status === "In Progress") && isOverdue(dueDate, dueAt, status)) {
          summary.overdueCount += 1;
        }

        return summary;
      }, { ...EMPTY_TASK_STATS });

      const nextContext = { organizationId: resolvedOrganizationId, projectId: projectRow.id };

      setContext(nextContext);
      setTodos(normalizedTodos);
      setStats(nextStats);
      setOrganizationUsers(normalizedUsers);
      setIssueOptions(normalizedIssues);
      setInspectionOptions(normalizedInspections);
      setInspectionItemOptions(normalizedInspectionItems);
      setSelectedTaskId((current) => current ?? normalizedTodos[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tasks.");
    } finally {
      const approximateQueryCount = (session.organizationId ? 0 : 1) + 1 + 6;
      console.info("[projects][todos] query-count", {
        projectSlug: routeProjectSlug,
        approximateQueries: approximateQueryCount,
      });
      console.timeEnd(timingLabel);
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

  const resetCreateForm = () => {
    setNewTitle("");
    setNewDescription("");
    setNewTrade("");
    setNewAssignedUserId("");
    setNewDueDate("");
    setNewDueTime("");
    setNewPdfName("");
    setNewPdfFile(null);
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
      setNewPdfFile(null);
      setNewPdfSizeBytes(null);
      return;
    }
    if (!isPdfFile(file)) {
      setError("Please attach a PDF file.");
      event.target.value = "";
      return;
    }
    setNewPdfName(file.name);
    setNewPdfFile(file);
    setNewPdfSizeBytes(file.size);
  };

  const handleDetailPdfSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setDetailPdfName("");
      setDetailPdfFile(null);
      setDetailPdfSizeBytes(null);
      return;
    }
    if (!isPdfFile(file)) {
      setError("Please attach a PDF file.");
      event.target.value = "";
      return;
    }
    setDetailPdfName(file.name);
    setDetailPdfFile(file);
    setDetailPdfSizeBytes(file.size);
  };

  const createTask = async () => {
    if (!context || !supabase || !session?.id || !newTitle.trim()) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const dueAt = buildDueAt(newDueDate, newDueTime);
      const insertedTask = await createSharedTask(supabase, {
        projectId: context.projectId,
        title: newTitle.trim(),
        description: newDescription.trim(),
        dueDate: newDueDate || null,
        dueAt,
        assignedUserId: newAssignedUserId || null,
        trade: newTrade.trim(),
        priority: newPriority,
        status: newStatus,
        linkedIssueId: newLinkedIssueId || null,
        linkedInspectionId: newLinkedInspectionId || null,
      });

      if (newPdfFile && insertedTask?.id) {
        await uploadTaskAttachment(supabase, {
          taskId: insertedTask.id,
          file: newPdfFile,
          attachmentType: "pdf",
        });
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
      const existingTask = await getSharedTask(supabase, selectedTask.id);
      if (existingTask.projectId !== context.projectId) {
        throw new Error("Task does not belong to this project.");
      }

      const dueAt = buildDueAt(detailDueDate, detailDueTime);
      await updateSharedTask(supabase, selectedTask.id, {
        title: detailTitle.trim(),
        description: detailDescription.trim(),
        dueDate: detailDueDate || null,
        dueAt,
        assignedUserId: detailAssignedUserId || null,
        trade: detailTrade.trim(),
        priority: detailPriority,
        status: detailStatus,
        linkedIssueId: detailLinkedIssueId || null,
        linkedInspectionId: detailLinkedInspectionId || null,
      });

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

  const addAttachmentToSelectedTask = async () => {
    if (!context || !supabase || !session?.id || !selectedTask || !detailPdfFile) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await uploadTaskAttachment(supabase, {
        taskId: selectedTask.id,
        file: detailPdfFile,
        attachmentType: "pdf",
      });
      setDetailPdfName("");
      setDetailPdfFile(null);
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

  const deleteAttachment = async (attachment: TodoAttachment) => {
    if (!context || !supabase) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      if (attachment.source === "storage") {
        await deleteTaskAttachment(supabase, attachment.id);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attachmentTable = (supabase as any).from("project_job_todo_attachments");
        const { error: removeError } = await attachmentTable
          .delete()
          .eq("id", attachment.id)
          .eq("organization_id", context.organizationId)
          .eq("project_id", context.projectId);
        if (removeError) {
          throw new Error(removeError.message);
        }
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
      if (attachment.source === "storage") {
        if (!supabase || !attachment.storageBucket || !attachment.storagePath) {
          throw new Error("Missing attachment storage path.");
        }
        const { data, error: signedUrlError } = await supabase.storage
          .from(attachment.storageBucket)
          .createSignedUrl(attachment.storagePath, 60);
        if (signedUrlError || !data?.signedUrl) {
          throw new Error(signedUrlError?.message ?? "Unable to open PDF.");
        }
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        return;
      }

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
              <h1 className="m-0 text-[22px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]">Tasks</h1>
              <div className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--error-light)] px-4 py-2 text-[14px] font-medium text-[var(--error)]">
                <AlertCircle className="h-4 w-4" strokeWidth={2} />
                {stats.overdueCount} Overdue
              </div>
              <div className="inline-flex items-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-sm)]">
                <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] shadow-[var(--shadow-sm)]">
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
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" strokeWidth={2} />
                <Input
                  size="toolbar"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search..."
                  className="pl-11"
                />
              </div>
              <ToolbarSelect
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                leadingIcon={<AlertCircle strokeWidth={2} />}
                className={`${interMedium.className} min-w-[150px]`}
              >
                <option value="All">All Status</option>
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Need Review">Need Review</option>
                <option value="Done">Done</option>
              </ToolbarSelect>
              <ToolbarSelect
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                leadingIcon={<Flag strokeWidth={2} />}
                className={`${interMedium.className} min-w-[150px]`}
              >
                <option value="All">Filter</option>
                <option value="High">High priority</option>
                <option value="Medium">Medium priority</option>
                <option value="Low">Low priority</option>
              </ToolbarSelect>
              <ToolbarSelect
                value={dueFilter}
                onChange={(event) => setDueFilter(event.target.value)}
                leadingIcon={<Calendar strokeWidth={2} />}
                className={`${interMedium.className} min-w-[150px]`}
              >
                <option value="All">Sort</option>
                <option value="Overdue">Overdue</option>
                <option value="Due Today">Due Today</option>
                <option value="No Due Date">No Due Date</option>
              </ToolbarSelect>
              <ToolbarSelect
                value={assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                leadingIcon={<UserCircle2 strokeWidth={2} />}
                className={`${interMedium.className} min-w-[150px]`}
              >
                {assigneeFilterOptions.map((option) => (
                  <option key={`${option.value}-${option.label}`} value={option.value}>
                    {option.label === "All assignees" ? "People" : option.label}
                  </option>
                ))}
              </ToolbarSelect>
            </div>
          </div>
        </div>

        <Suspense fallback={<TodosSectionSkeleton />}>
          <div className="space-y-4">
            {error ? (
              <div className="rounded-[var(--radius-sm)] border border-[var(--error-light)] bg-[var(--error-light)] px-3 py-2">
                <p className={`${interMedium.className} text-xs font-medium text-[var(--error)]`}>{error}</p>
              </div>
            ) : null}

            {!isLoading ? (
              <div className="space-y-4">
                {filteredTodos.length === 0 ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center shadow-[var(--shadow-sm)]">
                    <p className={`${interMedium.className} text-sm font-semibold text-[var(--text-primary)]`}>
                      {todos.length === 0 ? "No tasks yet" : "No matching tasks"}
                    </p>
                    <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>
                      {todos.length === 0 ? "Add tasks to manage work on this job." : "Try adjusting your filters or search."}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-elevated)]">
                    <OperationalTable>
                      <OperationalTableHeader>
                        <OperationalTableRow className="hover:bg-transparent">
                          <OperationalTableHead>Task Name</OperationalTableHead>
                          <OperationalTableHead>Description</OperationalTableHead>
                          <OperationalTableHead>Status</OperationalTableHead>
                          <OperationalTableHead>Priority</OperationalTableHead>
                          <OperationalTableHead>Due Date</OperationalTableHead>
                          <OperationalTableHead>Assignee</OperationalTableHead>
                          <OperationalTableHead className="text-right">Actions</OperationalTableHead>
                        </OperationalTableRow>
                      </OperationalTableHeader>
                      <OperationalTableBody>
                        {filteredTodos.map((task) => {
                          const overdue = isOverdue(task.dueDate, task.dueAt, task.status);
                          const assignedName = task.assignedUserId ? userNameById.get(task.assignedUserId) ?? "Team Member" : "Unassigned";
                          const linkedIssueName = task.linkedIssueId ? issueNameById.get(task.linkedIssueId) ?? "Linked issue" : "";
                          const linkedInspectionName = task.linkedInspectionId
                            ? inspectionNameById.get(task.linkedInspectionId) ?? "Linked inspection"
                            : task.linkedInspectionItemId
                              ? inspectionNameById.get(inspectionItemById.get(task.linkedInspectionItemId)?.inspectionId ?? "") ?? "Linked inspection"
                              : "";
                          const detailSummary = task.description || linkedIssueName || linkedInspectionName || "No description added";
                          const statusVariant =
                            task.status === "To Do"
                              ? ("draft" as const)
                              : task.status === "In Progress"
                                ? ("active" as const)
                                : task.status === "Need Review"
                                  ? ("pending" as const)
                                  : ("completed" as const);

                          return (
                            <OperationalTableRow
                              key={task.id}
                              className={overdue ? "bg-[var(--error-light)] hover:bg-[var(--error-light)]" : ""}
                            >
                              <OperationalTableCell>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTaskId(task.id);
                                    setIsDetailOpen(true);
                                  }}
                                  className="flex w-full items-start gap-3 text-left"
                                >
                                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border border-[var(--border)] bg-[var(--surface)]" />
                                  <div className="min-w-0">
                                    <p className={`${interMedium.className} m-0 truncate text-[14px] font-semibold text-[var(--text-primary)]`}>{task.title}</p>
                                    {task.trade ? (
                                      <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[var(--text-secondary)]`}>
                                        {task.trade}
                                      </p>
                                    ) : null}
                                  </div>
                                </button>
                              </OperationalTableCell>

                              <OperationalTableCell>
                                <p className={`${interMedium.className} m-0 max-w-[28ch] truncate text-[13px] text-[var(--text-primary)]`}>{detailSummary}</p>
                              </OperationalTableCell>

                              <OperationalTableCell>
                                <StatusBadge status={statusVariant}>{task.status}</StatusBadge>
                              </OperationalTableCell>

                              <OperationalTableCell>
                                <span
                                  className={cn(
                                    "inline-flex rounded-full px-3 py-1 text-[12px] font-medium",
                                    task.priority === "Low"
                                      ? "bg-[var(--success-light)] text-[var(--success)]"
                                      : task.priority === "High"
                                        ? "bg-[var(--error-light)] text-[var(--error)]"
                                        : "bg-[var(--warning-light)] text-[var(--warning)]"
                                  )}
                                >
                                  {task.priority}
                                </span>
                              </OperationalTableCell>

                              <OperationalTableCell>
                                <div className="flex items-center gap-2">
                                  <Calendar className={cn("h-4 w-4", overdue ? "text-[var(--error)]" : "text-[var(--text-secondary)]")} strokeWidth={2} />
                                  <div>
                                    <p className={cn(`${interMedium.className} m-0 text-[13px]`, overdue ? "font-semibold text-[var(--error)]" : "text-[var(--text-primary)]")}>
                                      {formatTaskTableDate(task.dueDate, task.dueAt)}
                                    </p>
                                    {overdue ? (
                                      <p className={`${interMedium.className} m-0 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--error)]`}>
                                        Overdue
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </OperationalTableCell>

                              <OperationalTableCell>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[12px] font-semibold text-white">
                                    {getInitials(assignedName)}
                                  </span>
                                  <p className={`${interMedium.className} m-0 truncate text-[13px] text-[var(--text-primary)]`}>{assignedName}</p>
                                </div>
                              </OperationalTableCell>

                              <OperationalTableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTaskId(task.id);
                                    setIsDetailOpen(true);
                                  }}
                                  aria-label={`Edit ${task.title}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                                  Edit
                                </Button>
                              </OperationalTableCell>
                            </OperationalTableRow>
                          );
                        })}
                      </OperationalTableBody>
                    </OperationalTable>
                  </div>
                )}
              </div>
            ) : (
              <p className={`${interMedium.className} text-sm text-[var(--text-secondary)]`}>Loading tasks...</p>
            )}
          </div>
        </Suspense>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
          <div className="space-y-0">
            <DialogHeader className="px-7 pb-6 pt-7">
              <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]`}>
                Add Task
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3.5 px-7 pb-4">
              <div>
                <FormLabel>
                  Title
                </FormLabel>
                <Input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                />
              </div>

              <div>
                <FormLabel>
                  Description
                </FormLabel>
                <textarea
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  rows={3}
                  className={`${ibmPlexSans.className} w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                />
              </div>

              <div>
                <FormLabel>
                  Assignee
                </FormLabel>
                <select
                  value={newAssignedUserId}
                  onChange={(event) => setNewAssignedUserId(event.target.value)}
                  className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
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
                  <FormLabel>
                    Due Date
                  </FormLabel>
                  <Input
                    type="date"
                    value={newDueDate}
                    onChange={(event) => setNewDueDate(event.target.value)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                  />
                </div>
                <div>
                  <FormLabel>
                    Due Time
                  </FormLabel>
                  <Input
                    type="time"
                    step="60"
                    value={newDueTime}
                    onChange={(event) => setNewDueTime(event.target.value)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:text-[var(--text-primary)] [&::-webkit-datetime-edit-fields-wrapper]:text-[var(--text-primary)]`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FormLabel>
                    Priority
                  </FormLabel>
                  <select
                    value={newPriority}
                    onChange={(event) => setNewPriority(event.target.value as TodoPriority)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <FormLabel>
                    Status
                  </FormLabel>
                  <select
                    value={newStatus}
                    onChange={(event) => setNewStatus(event.target.value as TodoStatus)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
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
                className={`${ibmPlexSans.className} h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]`}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void createTask()}
                disabled={isSaving || !newTitle.trim()}
                className={`${ibmPlexSans.className} h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white transition hover:bg-[var(--primary-hover)]`}
              >
                Save Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
          {selectedTask ? (
            <div className="space-y-0">
              <DialogHeader className="px-7 pb-6 pt-7">
                <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]`}>
                  Edit Task
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3.5 px-7 pb-4">
                <div>
                  <FormLabel>
                    Title
                  </FormLabel>
                  <Input
                    value={detailTitle}
                    onChange={(event) => setDetailTitle(event.target.value)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                  />
                </div>

                <div>
                  <FormLabel>
                    Description
                  </FormLabel>
                  <textarea
                    value={detailDescription}
                    onChange={(event) => setDetailDescription(event.target.value)}
                    rows={3}
                    className={`${ibmPlexSans.className} w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                  />
                </div>

                <div>
                  <FormLabel>
                    Assignee
                  </FormLabel>
                  <select
                    value={detailAssignedUserId}
                    onChange={(event) => setDetailAssignedUserId(event.target.value)}
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
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
                    <FormLabel>
                      Due Date
                    </FormLabel>
                    <Input
                      type="date"
                      value={detailDueDate}
                      onChange={(event) => setDetailDueDate(event.target.value)}
                      className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                    />
                  </div>
                  <div>
                    <FormLabel>
                      Due Time
                    </FormLabel>
                    <Input
                      type="time"
                      step="60"
                      value={detailDueTime}
                      onChange={(event) => setDetailDueTime(event.target.value)}
                      className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:text-[var(--text-primary)] [&::-webkit-datetime-edit-fields-wrapper]:text-[var(--text-primary)]`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FormLabel>
                      Priority
                    </FormLabel>
                    <select
                      value={detailPriority}
                      onChange={(event) => setDetailPriority(event.target.value as TodoPriority)}
                      className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div>
                    <FormLabel>
                      Status
                    </FormLabel>
                    <select
                      value={detailStatus}
                      onChange={(event) => setDetailStatus(event.target.value as TodoStatus)}
                      className={`${ibmPlexSans.className} h-[2.75rem] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
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
                  className={`${ibmPlexSans.className} h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]`}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveTask()}
                  disabled={isSaving || !detailTitle.trim()}
                  className={`${ibmPlexSans.className} h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white transition hover:bg-[var(--primary-hover)]`}
                >
                  Save Task
                </Button>
              </div>
            </div>
          ) : (
            <p className={`${interMedium.className} text-sm text-[var(--text-secondary)]`}>Select a task to view details.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
