"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  documentFilesRoute,
  validateDocumentNodeName,
  type DocumentEntityContext,
} from "@/lib/documents/workspace";

export type DocumentMutationResult =
  | { ok: true }
  | { ok: false; error: string };

function safeMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  console.error("[documents/workspace-mutation] failed", {
    error: message || "unknown",
  });
  if (/restore destination|same name/i.test(message)) {
    return "An item with this name now exists in the original folder. Rename or move that item before restoring.";
  }
  if (/deleted parent/i.test(message)) {
    return "The original parent folder is deleted. Restore that parent batch first.";
  }
  if (/duplicate key|unique|collision/i.test(message)) {
    return "An item with that name already exists in this folder.";
  }
  if (/descendant|itself/i.test(message)) {
    return "A folder cannot be moved into itself or one of its subfolders.";
  }
  if (/access|permission|unauthorized/i.test(message)) {
    return "You do not have permission to perform this action.";
  }
  if (/not found|deleted|active/i.test(message)) {
    return "The item or destination is no longer available.";
  }
  return "Unable to update this document. Refresh and try again.";
}

export async function createDocumentFolderAction(params: {
  entity: DocumentEntityContext;
  workspaceId: string;
  parentNodeId: string | null;
  displayName: string;
}): Promise<DocumentMutationResult> {
  const validation = validateDocumentNodeName(params.displayName);
  if (validation) return { ok: false, error: validation };
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("create_document_folder", {
      p_workspace_id: params.workspaceId,
      p_parent_node_id: params.parentNodeId,
      p_display_name: params.displayName.trim(),
    } as never);
    if (error) throw error;
    revalidatePath(documentFilesRoute(params.entity));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function renameDocumentNodeAction(params: {
  entity: DocumentEntityContext;
  nodeId: string;
  displayName: string;
}): Promise<DocumentMutationResult> {
  const validation = validateDocumentNodeName(params.displayName);
  if (validation) return { ok: false, error: validation };
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("rename_document_node", {
      p_node_id: params.nodeId,
      p_display_name: params.displayName.trim(),
    });
    if (error) throw error;
    revalidatePath(documentFilesRoute(params.entity));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function moveDocumentNodeAction(params: {
  entity: DocumentEntityContext;
  nodeId: string;
  targetParentNodeId: string | null;
}): Promise<DocumentMutationResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("move_document_node", {
      p_node_id: params.nodeId,
      p_target_parent_node_id: params.targetParentNodeId,
    } as never);
    if (error) throw error;
    revalidatePath(documentFilesRoute(params.entity));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function deleteDocumentNodeAction(params: {
  entity: DocumentEntityContext;
  nodeId: string;
}): Promise<DocumentMutationResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("soft_delete_document_node", {
      p_node_id: params.nodeId,
    });
    if (error) throw error;
    revalidatePath(documentFilesRoute(params.entity));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function restoreDocumentNodeAction(params: {
  entity: DocumentEntityContext;
  nodeId: string;
}): Promise<DocumentMutationResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("restore_document_node", {
      p_node_id: params.nodeId,
    });
    if (error) throw error;
    revalidatePath(documentFilesRoute(params.entity));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function purgeDocumentNodeAction(params: {
  entity: DocumentEntityContext;
  nodeId: string;
}): Promise<DocumentMutationResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await (supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>)(
      "purge_document_node",
      { p_node_id: params.nodeId },
    );
    if (error) throw error;
    revalidatePath(documentFilesRoute(params.entity));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}
