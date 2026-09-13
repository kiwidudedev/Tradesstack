import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  DOCUMENT_LIST_PAGE_SIZE,
  type DocumentBreadcrumb,
  type DocumentDeletedBatch,
  type DocumentFilesPageMetadata,
  type DocumentFolderOption,
  type DocumentStorageUsage,
  type DocumentWorkspaceNode,
  type DocumentWorkspaceQuery,
} from "@/lib/documents/workspace";

type DocumentClient = SupabaseClient<Database>;
type RpcResult = { data: unknown; error: { message: string } | null };
type DynamicRpc = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

async function rpc(
  client: DocumentClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await (client.rpc as unknown as DynamicRpc)(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

export class DocumentWorkspaceConsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentWorkspaceConsistencyError";
  }
}

export function shouldResolveOpportunityFilesProject(opportunity: {
  stage: string;
  convertedProjectId: string | null;
}): boolean {
  return opportunity.stage === "Won" || Boolean(opportunity.convertedProjectId);
}

export function resolveOpportunityFilesProjectEvidence(params: {
  opportunity: { id: string; stage: string; convertedProjectId: string | null } | null;
  mapping: { projectId: string } | null;
  project: { id: string; slug: string; sourceOpportunityId: string | null } | null;
}): { id: string; slug: string } | null {
  if (!params.opportunity) {
    throw new DocumentWorkspaceConsistencyError("Opportunity lifecycle evidence is missing.");
  }
  if (!params.mapping) {
    if (params.opportunity.convertedProjectId || params.opportunity.stage === "Won") {
      throw new DocumentWorkspaceConsistencyError(
        "Converted Opportunity metadata has no authoritative final Project mapping.",
      );
    }
    return null;
  }
  if (params.opportunity.convertedProjectId !== params.mapping.projectId) {
    throw new DocumentWorkspaceConsistencyError(
      "Opportunity final Project mapping contradicts conversion metadata.",
    );
  }
  if (
    !params.project
    || params.project.id !== params.mapping.projectId
    || params.project.sourceOpportunityId !== params.opportunity.id
  ) {
    throw new DocumentWorkspaceConsistencyError(
      "The authoritative final Project is missing or has contradictory lineage.",
    );
  }
  return { id: params.project.id, slug: params.project.slug };
}

export async function resolveOpportunityFilesProject(
  client: DocumentClient,
  params: { organizationId: string; opportunityId: string; signal?: AbortSignal },
): Promise<{ id: string; slug: string } | null> {
  const opportunityQuery = client
    .from("organization_opportunities")
    .select("id, stage, converted_project_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.opportunityId);
  const mappingQuery = client
    .from("opportunity_final_projects")
    .select("project_id")
    .eq("organization_id", params.organizationId)
    .eq("opportunity_id", params.opportunityId);
  const [opportunityResult, mappingResult] = await Promise.all([
    (params.signal ? opportunityQuery.abortSignal(params.signal) : opportunityQuery).maybeSingle(),
    (params.signal ? mappingQuery.abortSignal(params.signal) : mappingQuery).maybeSingle(),
  ]);
  if (opportunityResult.error) throw new Error(opportunityResult.error.message);
  if (mappingResult.error) throw new Error(mappingResult.error.message);

  const mappedProjectId = mappingResult.data?.project_id ?? null;
  const projectQuery = mappedProjectId
    ? client
        .from("organization_projects")
        .select("id, slug, source_opportunity_id")
        .eq("organization_id", params.organizationId)
        .eq("id", mappedProjectId)
    : null;
  const projectResult = projectQuery
    ? await (params.signal ? projectQuery.abortSignal(params.signal) : projectQuery).maybeSingle()
    : { data: null, error: null };
  if (projectResult.error) throw new Error(projectResult.error.message);

  return resolveOpportunityFilesProjectEvidence({
    opportunity: opportunityResult.data
      ? {
          id: opportunityResult.data.id,
          stage: opportunityResult.data.stage,
          convertedProjectId: opportunityResult.data.converted_project_id,
        }
      : null,
    mapping: mappedProjectId ? { projectId: mappedProjectId } : null,
    project: projectResult.data
      ? {
          id: projectResult.data.id,
          slug: projectResult.data.slug,
          sourceOpportunityId: projectResult.data.source_opportunity_id,
        }
      : null,
  });
}

/**
 * Resolves only the global navigation destination. Transport failures degrade
 * to the Opportunity Files route; that route re-runs strict lifecycle checks
 * before exposing a workspace or redirecting to the final Project.
 */
export async function resolveOpportunityFilesProjectForNavigation(
  client: DocumentClient,
  params: { organizationId: string; opportunityId: string; timeoutMs?: number },
): Promise<{ id: string; slug: string } | null> {
  const timeoutMs = Math.min(10_000, Math.max(250, params.timeoutMs ?? 3_000));
  try {
    return await resolveOpportunityFilesProject(client, {
      organizationId: params.organizationId,
      opportunityId: params.opportunityId,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DocumentWorkspaceConsistencyError) throw error;
    console.warn("[documents/navigation] Final Project lookup unavailable; using Opportunity Files.", {
      opportunityId: params.opportunityId,
      message: error instanceof Error ? error.message : "Unknown lookup failure",
    });
    return null;
  }
}

export async function getOpportunityDocumentWorkspace(
  client: DocumentClient,
  opportunityId: string,
): Promise<string> {
  const data = await rpc(client, "get_or_create_opportunity_document_workspace", {
    p_opportunity_id: opportunityId,
  });
  if (typeof data !== "string") throw new Error("Unable to resolve document workspace.");
  return data;
}

export async function resolveOpportunityDocumentWorkspace(
  client: DocumentClient,
  opportunityId: string,
): Promise<string | null> {
  const data = await rpc(client, "resolve_opportunity_document_workspace", {
    p_opportunity_id: opportunityId,
  });
  return typeof data === "string" ? data : null;
}

export async function resolveProjectDocumentWorkspace(
  client: DocumentClient,
  projectId: string,
): Promise<string | null> {
  const data = await rpc(client, "resolve_project_document_workspace", {
    p_project_id: projectId,
  });
  return typeof data === "string" ? data : null;
}

export async function getOrCreateProjectDocumentWorkspace(
  client: DocumentClient,
  projectId: string,
): Promise<string> {
  const data = await rpc(client, "get_or_create_project_document_workspace", {
    p_project_id: projectId,
  });
  if (typeof data !== "string") {
    throw new Error("Unable to resolve Project document workspace.");
  }
  return data;
}

export async function ensureOpportunityProjectDocumentWorkspace(
  client: DocumentClient,
  opportunityId: string,
  projectId: string,
): Promise<string> {
  const data = await rpc(
    client,
    "ensure_opportunity_project_document_workspace",
    {
      p_opportunity_id: opportunityId,
      p_project_id: projectId,
    },
  );
  if (typeof data !== "string") {
    throw new Error("Unable to link the Project document workspace.");
  }
  return data;
}

export async function listDocumentWorkspace(params: {
  client: DocumentClient;
  workspaceId: string;
  query: DocumentWorkspaceQuery;
}) {
  const data = await rpc(params.client, "list_document_workspace_nodes", {
    p_workspace_id: params.workspaceId,
    p_parent_node_id: params.query.folderId,
    p_search: params.query.search || null,
    p_file_type: params.query.fileType,
    p_sort: params.query.sort,
    p_direction: params.query.direction,
    p_limit: DOCUMENT_LIST_PAGE_SIZE,
    p_offset: (params.query.page - 1) * DOCUMENT_LIST_PAGE_SIZE,
  });
  const resultRows = rows(data);
  return {
    nodes: resultRows.map((row): DocumentWorkspaceNode => ({
      nodeId: String(row.node_id),
      kind: row.kind === "folder" ? "folder" : "file",
      displayName: String(row.display_name),
      parentNodeId: row.parent_node_id ? String(row.parent_node_id) : null,
      ownerUserId: String(row.owner_user_id),
      ownerName: String(row.owner_name),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      byteSize: row.byte_size === null ? null : Number(row.byte_size),
      mimeType: row.mime_type ? String(row.mime_type) : null,
      fileExtension: row.file_extension ? String(row.file_extension) : null,
      versionNumber: row.version_number === null ? null : Number(row.version_number),
      uploadState: row.upload_state ? String(row.upload_state) : null,
      sha256Checksum: row.sha256_checksum ? String(row.sha256_checksum) : null,
      parentName: row.parent_name ? String(row.parent_name) : null,
    })),
    totalCount: resultRows[0] ? Number(resultRows[0].total_count) : 0,
  };
}

export async function getDocumentBreadcrumbs(params: {
  client: DocumentClient;
  workspaceId: string;
  folderId: string | null;
}): Promise<DocumentBreadcrumb[]> {
  if (!params.folderId) return [];
  const data = await rpc(params.client, "get_document_folder_breadcrumbs", {
    p_workspace_id: params.workspaceId,
    p_folder_node_id: params.folderId,
  });
  return rows(data).map((row) => ({
    nodeId: String(row.node_id),
    parentNodeId: row.parent_node_id ? String(row.parent_node_id) : null,
    displayName: String(row.display_name),
  }));
}

export async function listDocumentFolders(
  client: DocumentClient,
  workspaceId: string,
): Promise<DocumentFolderOption[]> {
  const data = await rpc(client, "list_document_workspace_folders", {
    p_workspace_id: workspaceId,
  });
  return rows(data).map((row) => ({
    nodeId: String(row.node_id),
    parentNodeId: row.parent_node_id ? String(row.parent_node_id) : null,
    displayName: String(row.display_name),
  }));
}

export async function listDeletedDocumentBatches(params: {
  client: DocumentClient;
  workspaceId: string;
  query: DocumentWorkspaceQuery;
}) {
  const data = await rpc(params.client, "list_deleted_document_batches", {
    p_workspace_id: params.workspaceId,
    p_search: params.query.search || null,
    p_file_type: params.query.fileType,
    p_sort: params.query.sort,
    p_direction: params.query.direction,
    p_limit: DOCUMENT_LIST_PAGE_SIZE,
    p_offset: (params.query.page - 1) * DOCUMENT_LIST_PAGE_SIZE,
  });
  const resultRows = rows(data);
  return {
    batches: resultRows.map((row): DocumentDeletedBatch => ({
      deletionBatchId: String(row.deletion_batch_id),
      rootNodeId: String(row.root_node_id),
      kind: row.kind === "folder" ? "folder" : "file",
      displayName: String(row.display_name),
      deletedByUserId: String(row.deleted_by_user_id),
      deletedByName: String(row.deleted_by_name),
      deletedAt: String(row.deleted_at),
      originalParentNodeId: row.original_parent_node_id
        ? String(row.original_parent_node_id)
        : null,
      originalParentName: row.original_parent_name
        ? String(row.original_parent_name)
        : null,
      itemCount: Number(row.item_count),
      byteSize: Number(row.byte_size),
    })),
    totalCount: resultRows[0] ? Number(resultRows[0].total_count) : 0,
  };
}

export async function getDocumentStorageUsage(
  client: DocumentClient,
  workspaceId: string,
): Promise<DocumentStorageUsage> {
  const [data, capabilitiesData] = await Promise.all([
    rpc(client, "get_document_storage_usage", {
      p_workspace_id: workspaceId,
    }),
    rpc(client, "get_document_workspace_capabilities", {
      p_workspace_id: workspaceId,
    }),
  ]);
  const row = rows(data)[0];
  const capabilities = rows(capabilitiesData)[0];
  if (!row) throw new Error("Unable to load document storage usage.");
  if (!capabilities) throw new Error("Unable to load document workspace capabilities.");
  return {
    quotaBytes: Number(row.quota_bytes),
    activeBytes: Number(row.active_bytes),
    deletedBytes: Number(row.deleted_bytes),
    pendingBytes: Number(row.pending_bytes),
    totalBytes: Number(row.total_bytes),
    remainingBytes: Number(row.remaining_bytes),
    fileCount: Number(row.file_count),
    folderCount: Number(row.folder_count),
    currentVersionCount: Number(row.current_version_count),
    historicalVersionCount: Number(row.historical_version_count),
    canWrite: Boolean(capabilities.can_write),
    canDelete: Boolean(row.can_delete),
    canPurge: Boolean(row.can_purge),
    canMonitor: Boolean(row.can_monitor),
    cleanupAttentionRequired: Boolean(row.cleanup_attention_required),
  };
}

export async function getDocumentFilesPageMetadata(
  client: DocumentClient,
  workspaceId: string,
): Promise<DocumentFilesPageMetadata> {
  const data = await rpc(client, "get_document_files_page_metadata", {
    p_workspace_id: workspaceId,
  });
  const row = rows(data)[0];
  if (!row) throw new Error("Unable to load document Files metadata.");
  return {
    canView: Boolean(row.can_view),
    canWrite: Boolean(row.can_write),
    canDelete: Boolean(row.can_delete),
    canPurge: Boolean(row.can_purge),
    cleanupAttentionRequired: Boolean(row.cleanup_attention_required),
  };
}
