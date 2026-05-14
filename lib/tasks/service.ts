import type { Json } from "@/lib/supabase/types";
import {
  normalizeTaskActivityPayloadList,
  normalizeTaskAttachmentPayloadList,
  normalizeTaskCommentPayload,
  normalizeTaskCommentPayloadList,
  normalizeTaskLinkPayload,
  normalizeTaskPayload,
  normalizeTaskPayloadList,
} from "@/lib/tasks/normalization";
import type {
  CreateTaskInput,
  ListTasksInput,
  TaskActivityPayload,
  TaskAttachmentPayload,
  TaskCommentInput,
  TaskCommentPayload,
  TaskLinkInput,
  TaskLinkPayload,
  TaskPayload,
  TaskRpcClient,
  UpdateTaskCommentInput,
  UpdateTaskInput,
} from "@/lib/tasks/types";

function toRpcJson(value: unknown): Json {
  return value as Json;
}

type TaskRpcResponse = {
  data: Json | null;
  error: { message: string } | null;
};

async function unwrapRpc<T>(request: unknown, normalize: (value: unknown) => T): Promise<T> {
  const { data, error } = await (request as PromiseLike<TaskRpcResponse>);

  if (error) {
    throw new Error(error.message);
  }

  return normalize(data);
}

export async function listTasks(client: TaskRpcClient, input: ListTasksInput = {}): Promise<TaskPayload[]> {
  return unwrapRpc(
    client.rpc("list_tasks", {
      p_project_id: input.projectId ?? undefined,
      p_opportunity_id: input.opportunityId ?? undefined,
      p_statuses: input.statuses ?? undefined,
      p_include_archived: input.includeArchived ?? false,
      p_include_deleted: input.includeDeleted ?? false,
    }),
    normalizeTaskPayloadList
  );
}

export async function getTask(client: TaskRpcClient, taskId: string): Promise<TaskPayload> {
  return unwrapRpc(client.rpc("get_task", { p_task_id: taskId }), normalizeTaskPayload);
}

export async function listTaskActivity(client: TaskRpcClient, taskId: string): Promise<TaskActivityPayload[]> {
  return unwrapRpc(client.rpc("list_task_activity", { p_task_id: taskId }), normalizeTaskActivityPayloadList);
}

export async function listTaskComments(
  client: TaskRpcClient,
  taskId: string,
  options: { includeDeleted?: boolean } = {}
): Promise<TaskCommentPayload[]> {
  return unwrapRpc(
    client.rpc("list_task_comments", {
      p_task_id: taskId,
      p_include_deleted: options.includeDeleted ?? false,
    }),
    normalizeTaskCommentPayloadList
  );
}

export async function listTaskAttachments(
  client: TaskRpcClient,
  taskId: string,
  options: { includeDeleted?: boolean } = {}
): Promise<TaskAttachmentPayload[]> {
  return unwrapRpc(
    client.rpc("list_task_attachments", {
      p_task_id: taskId,
      p_include_deleted: options.includeDeleted ?? false,
    }),
    normalizeTaskAttachmentPayloadList
  );
}

export async function createTask(client: TaskRpcClient, input: CreateTaskInput): Promise<TaskPayload> {
  return unwrapRpc(client.rpc("create_task", { p_input: toRpcJson(input) }), normalizeTaskPayload);
}

export async function updateTask(client: TaskRpcClient, taskId: string, patch: UpdateTaskInput): Promise<TaskPayload> {
  return unwrapRpc(
    client.rpc("update_task", {
      p_task_id: taskId,
      p_patch: toRpcJson(patch),
    }),
    normalizeTaskPayload
  );
}

export async function assignTask(client: TaskRpcClient, taskId: string, assignedUserId: string): Promise<TaskPayload> {
  return unwrapRpc(
    client.rpc("assign_task", {
      p_task_id: taskId,
      p_assigned_user_id: assignedUserId,
    }),
    normalizeTaskPayload
  );
}

export async function completeTask(client: TaskRpcClient, taskId: string): Promise<TaskPayload> {
  return unwrapRpc(client.rpc("complete_task", { p_task_id: taskId }), normalizeTaskPayload);
}

export async function reopenTask(client: TaskRpcClient, taskId: string): Promise<TaskPayload> {
  return unwrapRpc(client.rpc("reopen_task", { p_task_id: taskId }), normalizeTaskPayload);
}

export async function archiveTask(client: TaskRpcClient, taskId: string, reason?: string | null): Promise<TaskPayload> {
  return unwrapRpc(
    client.rpc("archive_task", {
      p_task_id: taskId,
      p_reason: reason ?? undefined,
    }),
    normalizeTaskPayload
  );
}

export async function softDeleteTask(client: TaskRpcClient, taskId: string, reason?: string | null): Promise<TaskPayload> {
  return unwrapRpc(
    client.rpc("soft_delete_task", {
      p_task_id: taskId,
      p_reason: reason ?? undefined,
    }),
    normalizeTaskPayload
  );
}

export async function restoreTask(client: TaskRpcClient, taskId: string): Promise<TaskPayload> {
  return unwrapRpc(client.rpc("restore_task", { p_task_id: taskId }), normalizeTaskPayload);
}

export async function createTaskComment(client: TaskRpcClient, input: TaskCommentInput): Promise<TaskCommentPayload> {
  return unwrapRpc(
    client.rpc("create_task_comment", {
      p_task_id: input.taskId,
      p_comment: input.comment,
      p_metadata: toRpcJson(input.metadata ?? {}),
    }),
    normalizeTaskCommentPayload
  );
}

export async function updateTaskComment(client: TaskRpcClient, input: UpdateTaskCommentInput): Promise<TaskCommentPayload> {
  return unwrapRpc(
    client.rpc("update_task_comment", {
      p_comment_id: input.commentId,
      p_comment: input.comment,
      p_metadata: input.metadata === undefined || input.metadata === null ? undefined : toRpcJson(input.metadata),
    }),
    normalizeTaskCommentPayload
  );
}

export async function deleteTaskComment(client: TaskRpcClient, commentId: string): Promise<{ id: string; deletedAt: string | null; deletedBy: string | null }> {
  return unwrapRpc(client.rpc("delete_task_comment", { p_comment_id: commentId }), (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Invalid task comment delete payload.");
    }

    const row = value as Record<string, unknown>;
    return {
      id: typeof row.id === "string" ? row.id : "",
      deletedAt: typeof row.deletedAt === "string" ? row.deletedAt : null,
      deletedBy: typeof row.deletedBy === "string" ? row.deletedBy : null,
    };
  });
}

export async function addTaskLink(client: TaskRpcClient, input: TaskLinkInput): Promise<TaskLinkPayload> {
  return unwrapRpc(
    client.rpc("add_task_link", {
      p_task_id: input.taskId,
      p_linked_type: input.linkedType,
      p_linked_id: input.linkedId,
      p_metadata: toRpcJson(input.metadata ?? {}),
    }),
    normalizeTaskLinkPayload
  );
}

export async function removeTaskLink(client: TaskRpcClient, taskLinkId: string): Promise<{ id: string; removed: boolean }> {
  return unwrapRpc(client.rpc("remove_task_link", { p_task_link_id: taskLinkId }), (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Invalid task link removal payload.");
    }

    const row = value as Record<string, unknown>;
    return {
      id: typeof row.id === "string" ? row.id : "",
      removed: row.removed === true,
    };
  });
}
