import type { Json } from "@/lib/supabase/types";
import type {
  TaskActivityPayload,
  TaskAttachmentPayload,
  TaskCommentPayload,
  TaskLinkPayload,
  TaskMetadata,
  TaskPayload,
  TaskPriority,
  TaskProjectContext,
  TaskStatus,
  TaskUserSummary,
} from "@/lib/tasks/types";

const TASK_STATUSES = new Set<TaskStatus>(["To Do", "In Progress", "Need Review", "Done", "Archived"]);
const TASK_PRIORITIES = new Set<TaskPriority>(["Low", "Medium", "High"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asMetadata(value: unknown): TaskMetadata {
  return isRecord(value) ? (value as TaskMetadata) : {};
}

function asJson(value: unknown): Json | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value as Json;
  }
  if (isRecord(value)) {
    return value as Json;
  }
  return null;
}

function asStatus(value: unknown): TaskStatus {
  return typeof value === "string" && TASK_STATUSES.has(value as TaskStatus) ? (value as TaskStatus) : "To Do";
}

function asPriority(value: unknown): TaskPriority {
  return typeof value === "string" && TASK_PRIORITIES.has(value as TaskPriority) ? (value as TaskPriority) : "Medium";
}

function normalizeUserSummary(value: unknown): TaskUserSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const userId = asString(value.userId);
  if (!userId) {
    return null;
  }

  return {
    userId,
    displayName: asString(value.displayName, "Team Member"),
  };
}

function normalizeProjectContext(value: unknown): TaskProjectContext {
  const row = isRecord(value) ? value : {};

  return {
    projectName: asNullableString(row.projectName),
    projectNumber: asNullableString(row.projectNumber),
    clientName: asNullableString(row.clientName),
    siteAddress: asNullableString(row.siteAddress),
    projectManager: asNullableString(row.projectManager),
    projectStatus: asNullableString(row.projectStatus),
    startDate: asNullableString(row.startDate),
    endDate: asNullableString(row.endDate),
  };
}

export function normalizeTaskPayload(value: unknown): TaskPayload {
  if (!isRecord(value)) {
    throw new Error("Invalid task payload.");
  }

  return {
    id: asString(value.id),
    organizationId: asString(value.organizationId),
    projectId: asString(value.projectId),
    opportunityId: asNullableString(value.opportunityId),
    title: asString(value.title, "Untitled task"),
    description: asString(value.description),
    taskType: asNullableString(value.taskType),
    trade: asString(value.trade),
    status: asStatus(value.status),
    priority: asPriority(value.priority),
    dueDate: asNullableString(value.dueDate),
    dueAt: asNullableString(value.dueAt),
    assignedUserId: asNullableString(value.assignedUserId),
    createdBy: asString(value.createdBy),
    createdAt: asString(value.createdAt),
    updatedBy: asNullableString(value.updatedBy),
    updatedAt: asString(value.updatedAt),
    completedBy: asNullableString(value.completedBy),
    completedAt: asNullableString(value.completedAt),
    archivedBy: asNullableString(value.archivedBy),
    archivedAt: asNullableString(value.archivedAt),
    archiveReason: asNullableString(value.archiveReason),
    deletedBy: asNullableString(value.deletedBy),
    deletedAt: asNullableString(value.deletedAt),
    deleteReason: asNullableString(value.deleteReason),
    sourceType: asNullableString(value.sourceType),
    sourceId: asNullableString(value.sourceId),
    linkedIssueId: asNullableString(value.linkedIssueId),
    linkedInspectionId: asNullableString(value.linkedInspectionId),
    linkedInspectionItemId: asNullableString(value.linkedInspectionItemId),
    linkedVariationId: asNullableString(value.linkedVariationId),
    linkedPurchaseOrderId: asNullableString(value.linkedPurchaseOrderId),
    linkedQuoteId: asNullableString(value.linkedQuoteId),
    linkedClientId: asNullableString(value.linkedClientId),
    metadata: asMetadata(value.metadata),
    assignee: normalizeUserSummary(value.assignee),
    creator: normalizeUserSummary(value.creator),
    projectContext: normalizeProjectContext(value.projectContext),
  };
}

export function normalizeTaskPayloadList(value: unknown): TaskPayload[] {
  return Array.isArray(value) ? value.map(normalizeTaskPayload) : [];
}

export function normalizeTaskActivityPayload(value: unknown): TaskActivityPayload {
  if (!isRecord(value)) {
    throw new Error("Invalid task activity payload.");
  }

  return {
    id: asString(value.id),
    organizationId: asString(value.organizationId),
    taskId: asString(value.taskId),
    projectId: asNullableString(value.projectId),
    actorUserId: asNullableString(value.actorUserId),
    eventType: asString(value.eventType),
    fieldName: asNullableString(value.fieldName),
    oldValue: asJson(value.oldValue),
    newValue: asJson(value.newValue),
    metadata: asMetadata(value.metadata),
    createdAt: asString(value.createdAt),
  };
}

export function normalizeTaskActivityPayloadList(value: unknown): TaskActivityPayload[] {
  return Array.isArray(value) ? value.map(normalizeTaskActivityPayload) : [];
}

export function normalizeTaskCommentPayload(value: unknown): TaskCommentPayload {
  if (!isRecord(value)) {
    throw new Error("Invalid task comment payload.");
  }

  return {
    id: asString(value.id),
    organizationId: asString(value.organizationId),
    taskId: asString(value.taskId),
    projectId: asNullableString(value.projectId),
    userId: asString(value.userId),
    comment: asString(value.comment),
    metadata: asMetadata(value.metadata),
    createdAt: asString(value.createdAt),
    updatedAt: asString(value.updatedAt),
    deletedAt: asNullableString(value.deletedAt),
    deletedBy: asNullableString(value.deletedBy),
  };
}

export function normalizeTaskCommentPayloadList(value: unknown): TaskCommentPayload[] {
  return Array.isArray(value) ? value.map(normalizeTaskCommentPayload) : [];
}

export function normalizeTaskAttachmentPayload(value: unknown): TaskAttachmentPayload {
  if (!isRecord(value)) {
    throw new Error("Invalid task attachment payload.");
  }

  return {
    id: asString(value.id),
    organizationId: asString(value.organizationId),
    taskId: asString(value.taskId),
    projectId: asNullableString(value.projectId),
    commentId: asNullableString(value.commentId),
    uploadedBy: asString(value.uploadedBy),
    fileName: asString(value.fileName, "Attachment"),
    originalFileName: asNullableString(value.originalFileName),
    fileType: asNullableString(value.fileType),
    mimeType: asString(value.mimeType),
    storageBucket: asString(value.storageBucket),
    storagePath: asString(value.storagePath),
    fileSize: asNullableNumber(value.fileSize),
    attachmentType: asString(value.attachmentType, "other"),
    metadata: asMetadata(value.metadata),
    createdAt: asString(value.createdAt),
    deletedAt: asNullableString(value.deletedAt),
    deletedBy: asNullableString(value.deletedBy),
  };
}

export function normalizeTaskAttachmentPayloadList(value: unknown): TaskAttachmentPayload[] {
  return Array.isArray(value) ? value.map(normalizeTaskAttachmentPayload) : [];
}

export function normalizeTaskLinkPayload(value: unknown): TaskLinkPayload {
  if (!isRecord(value)) {
    throw new Error("Invalid task link payload.");
  }

  return {
    id: asString(value.id),
    organizationId: asString(value.organizationId),
    taskId: asString(value.taskId),
    linkedType: asString(value.linkedType),
    linkedId: asString(value.linkedId),
    createdBy: asNullableString(value.createdBy),
    createdAt: asString(value.createdAt),
    metadata: asMetadata(value.metadata),
  };
}
