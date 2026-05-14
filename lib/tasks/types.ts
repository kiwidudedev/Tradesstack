import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

export type TaskRpcClient = SupabaseClient<Database>;

export type TaskStatus = "To Do" | "In Progress" | "Need Review" | "Done" | "Archived";
export type TaskPriority = "Low" | "Medium" | "High";

export type TaskType =
  | "delivery"
  | "site_check"
  | "qa_check"
  | "supplier_follow_up"
  | "client_follow_up"
  | "variation_follow_up"
  | "purchase_order_follow_up"
  | "material_check"
  | "labour_booking"
  | "health_safety"
  | "admin"
  | "claim"
  | "defect"
  | "meeting"
  | "reminder"
  | "installation"
  | "inspection"
  | "procurement"
  | "coordination"
  | "other";

export type TaskMetadata = Record<string, Json | undefined>;

export interface TaskUserSummary {
  userId: string;
  displayName: string;
}

export interface TaskProjectContext {
  projectName: string | null;
  projectNumber: string | null;
  clientName: string | null;
  siteAddress: string | null;
  projectManager: string | null;
  projectStatus: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface TaskPayload {
  id: string;
  organizationId: string;
  projectId: string;
  opportunityId: string | null;
  title: string;
  description: string;
  taskType: TaskType | string | null;
  trade: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  dueAt: string | null;
  assignedUserId: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  completedBy: string | null;
  completedAt: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
  archiveReason: string | null;
  deletedBy: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
  sourceType: string | null;
  sourceId: string | null;
  linkedIssueId: string | null;
  linkedInspectionId: string | null;
  linkedInspectionItemId: string | null;
  linkedVariationId: string | null;
  linkedPurchaseOrderId: string | null;
  linkedQuoteId: string | null;
  linkedClientId: string | null;
  metadata: TaskMetadata;
  assignee: TaskUserSummary | null;
  creator: TaskUserSummary | null;
  projectContext: TaskProjectContext;
}

export interface TaskActivityPayload {
  id: string;
  organizationId: string;
  taskId: string;
  projectId: string | null;
  actorUserId: string | null;
  eventType: string;
  fieldName: string | null;
  oldValue: Json | null;
  newValue: Json | null;
  metadata: TaskMetadata;
  createdAt: string;
}

export interface TaskCommentPayload {
  id: string;
  organizationId: string;
  taskId: string;
  projectId: string | null;
  userId: string;
  comment: string;
  metadata: TaskMetadata;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface TaskAttachmentPayload {
  id: string;
  organizationId: string;
  taskId: string;
  projectId: string | null;
  commentId: string | null;
  uploadedBy: string;
  fileName: string;
  originalFileName: string | null;
  fileType: string | null;
  mimeType: string;
  storageBucket: string;
  storagePath: string;
  fileSize: number | null;
  attachmentType: string;
  metadata: TaskMetadata;
  createdAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

export type TaskAttachmentType =
  | "photo"
  | "pdf"
  | "document"
  | "delivery_docket"
  | "qa_photo"
  | "site_photo"
  | "variation_attachment"
  | "invoice_attachment"
  | "other";

export interface TaskLinkPayload {
  id: string;
  organizationId: string;
  taskId: string;
  linkedType: string;
  linkedId: string;
  createdBy: string | null;
  createdAt: string;
  metadata: TaskMetadata;
}

export interface ListTasksInput {
  projectId?: string | null;
  opportunityId?: string | null;
  statuses?: TaskStatus[] | null;
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

export interface CreateTaskInput {
  projectId: string;
  opportunityId?: string | null;
  title: string;
  description?: string;
  taskType?: TaskType | string | null;
  trade?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  dueAt?: string | null;
  assignedUserId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  linkedIssueId?: string | null;
  linkedInspectionId?: string | null;
  linkedInspectionItemId?: string | null;
  linkedVariationId?: string | null;
  linkedPurchaseOrderId?: string | null;
  linkedQuoteId?: string | null;
  linkedClientId?: string | null;
  metadata?: TaskMetadata;
}

export type UpdateTaskInput = Partial<
  Pick<
    CreateTaskInput,
    | "title"
    | "description"
    | "taskType"
    | "trade"
    | "status"
    | "priority"
    | "dueDate"
    | "dueAt"
    | "assignedUserId"
    | "linkedIssueId"
    | "linkedInspectionId"
    | "linkedInspectionItemId"
    | "linkedVariationId"
    | "linkedPurchaseOrderId"
    | "linkedQuoteId"
    | "linkedClientId"
    | "metadata"
  >
>;

export interface TaskCommentInput {
  taskId: string;
  comment: string;
  metadata?: TaskMetadata;
}

export interface TaskAttachmentInput {
  taskId: string;
  fileName: string;
  originalFileName?: string | null;
  fileType?: string | null;
  mimeType: string;
  storageBucket?: string;
  storagePath: string;
  fileSize?: number | null;
  attachmentType?: TaskAttachmentType;
  commentId?: string | null;
  metadata?: TaskMetadata;
}

export interface TaskAttachmentUploadInput {
  taskId: string;
  file: File;
  attachmentType?: TaskAttachmentType;
  commentId?: string | null;
  metadata?: TaskMetadata;
}

export interface TaskAttachmentStoragePathInput {
  organizationId: string;
  projectId?: string | null;
  taskId: string;
  fileName: string;
}

export interface UpdateTaskCommentInput {
  commentId: string;
  comment: string;
  metadata?: TaskMetadata | null;
}

export interface TaskLinkInput {
  taskId: string;
  linkedType: string;
  linkedId: string;
  metadata?: TaskMetadata;
}
