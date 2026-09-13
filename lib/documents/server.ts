import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_DOWNLOAD_LIFETIME_SECONDS, DOCUMENT_STORAGE_BUCKET } from "@/lib/documents/constants";
import type { DocumentUploadInitiationInput } from "@/lib/documents/validation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type DocumentClient = SupabaseClient<Database>;

export interface DocumentUploadReservation {
  nodeId: string;
  versionId: string;
  versionNumber: number;
  storageKey: string;
  uploadState: string;
  uploadExpiresAt: string;
  displayName: string;
  claimedMimeType: string;
  byteSize: number;
  bucket: typeof DOCUMENT_STORAGE_BUCKET;
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export async function initiateDocumentUpload(
  supabase: DocumentClient,
  input: DocumentUploadInitiationInput,
): Promise<DocumentUploadReservation> {
  const args = {
    p_opportunity_id: input.opportunityId,
    p_project_id: input.projectId,
    p_parent_node_id: input.parentNodeId,
    p_display_name: input.displayName,
    p_claimed_mime_type: input.claimedMimeType,
    p_file_extension: input.extension,
    p_byte_size: input.byteSize,
    p_existing_node_id: input.existingNodeId,
    p_idempotency_key: input.idempotencyKey,
  } as unknown as Database["public"]["Functions"]["initiate_document_upload"]["Args"];
  const { data, error } = await supabase.rpc("initiate_document_upload", args);

  const row = firstRow(data);
  if (error || !row) {
    throw new Error(error?.message || "Unable to initiate document upload.");
  }

  return {
    nodeId: row.node_id,
    versionId: row.version_id,
    versionNumber: row.version_number,
    storageKey: row.storage_key,
    uploadState: row.upload_state,
    uploadExpiresAt: row.upload_expires_at,
    displayName: row.display_name,
    claimedMimeType: row.claimed_mime_type,
    byteSize: Number(row.byte_size),
    bucket: DOCUMENT_STORAGE_BUCKET,
  };
}

export async function completeDocumentUpload(params: {
  actorUserId: string;
  versionId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("complete_document_upload", {
    p_version_id: params.versionId,
    p_actor_user_id: params.actorUserId,
  });
  const row = firstRow(data);
  if (error || !row) {
    throw new Error(error?.message || "Unable to complete document upload.");
  }
  return {
    nodeId: row.node_id,
    versionId: row.version_id,
    versionNumber: row.version_number,
    displayName: row.display_name,
    byteSize: Number(row.byte_size),
    verifiedMimeType: row.verified_mime_type,
    activatedAt: row.activated_at,
  };
}

export async function abandonDocumentUpload(
  supabase: DocumentClient,
  versionId: string,
) {
  const { data, error } = await supabase.rpc("mark_document_upload_failed", {
    p_version_id: versionId,
    p_failure_code: "client_abandoned",
    p_failure_message: "The upload was abandoned by the initiating client.",
    p_abandon: true,
  });
  if (error) {
    throw new Error(error.message);
  }
  return { uploadState: data };
}

export async function createDocumentDownload(params: {
  supabase: DocumentClient;
  nodeId: string;
  onTiming?: (stage: "authorization" | "signed-url", durationMs: number) => void;
}) {
  let started = performance.now();
  const { data, error } = await params.supabase.rpc("resolve_document_download", {
    p_node_id: params.nodeId,
  });
  params.onTiming?.("authorization", performance.now() - started);
  const row = firstRow(data);
  if (error || !row) {
    throw new Error(error?.message || "Document file not found or access denied.");
  }

  const admin = createAdminSupabaseClient();
  started = performance.now();
  const signed = await admin.storage
    .from(DOCUMENT_STORAGE_BUCKET)
    .createSignedUrl(row.storage_key, DOCUMENT_DOWNLOAD_LIFETIME_SECONDS, {
      download: row.display_name,
    });
  params.onTiming?.("signed-url", performance.now() - started);

  if (signed.error || !signed.data?.signedUrl) {
    throw new Error("Unable to create document download.");
  }

  return {
    url: signed.data.signedUrl,
    expiresInSeconds: DOCUMENT_DOWNLOAD_LIFETIME_SECONDS,
    displayName: row.display_name,
    versionId: row.version_id,
  };
}
