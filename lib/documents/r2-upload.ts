import { randomUUID } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getConfiguredR2StorageProvider } from "@/lib/storage/provider";
import { completeR2DocumentUpload } from "@/lib/documents/server";
import { assertDocumentVersionId } from "@/lib/documents/validation";

export async function createR2DocumentUpload(params: { request: Request; versionId: string }) {
  const versionId = assertDocumentVersionId(params.versionId);
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized.");

  const admin = createAdminSupabaseClient();
  const { data: version, error: versionError } = await admin
    .from("document_versions")
    .select("id,organization_id,uploaded_by,storage_key,upload_state,upload_expires_at,byte_size,claimed_mime_type")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError || !version || version.uploaded_by !== user.id || version.upload_state !== "pending") {
    throw new Error("Pending upload not found or access denied.");
  }
  const claimedMimeType = version.claimed_mime_type;
  if (!claimedMimeType) throw new Error("Upload reservation is missing a MIME type.");
  const { data: member } = await admin.from("organization_members").select("role").eq("organization_id", version.organization_id).eq("user_id", user.id).maybeSingle();
  if (!member) throw new Error("Pending upload not found or access denied.");
  const { data: permission } = await admin.from("role_permissions").select("is_allowed").eq("role", member.role).eq("permission_key", "files.write").maybeSingle();
  if (!permission?.is_allowed) throw new Error("Pending upload not found or access denied.");
  if (!version.upload_expires_at || Date.parse(version.upload_expires_at) <= Date.now()) throw new Error("Pending upload has expired.");
  if (!params.request.body) throw new Error("Upload body is required.");
  const contentType = (params.request.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
  if (!contentType || contentType !== claimedMimeType.toLowerCase()) throw new Error("Uploaded MIME type does not match the reservation.");
  const declaredContentLength = Number(params.request.headers.get("content-length"));
  const expectedContentLength = Number(version.byte_size);
  if (Number.isFinite(declaredContentLength) && declaredContentLength !== expectedContentLength) {
    throw new Error("Uploaded size does not match the reservation.");
  }

  // Browsers intentionally omit Content-Length for fetch uploads. R2 still
  // needs a known-length stream, so bind the authenticated request body to the
  // size reserved in the database. FixedLengthStream also rejects truncated
  // and oversized bodies without buffering the document in Worker memory.
  const fixedLengthStream = (globalThis as typeof globalThis & {
    FixedLengthStream?: new (length: number) => TransformStream<Uint8Array, Uint8Array>;
  }).FixedLengthStream;
  if (!fixedLengthStream) throw new Error("R2 fixed-length upload support is unavailable.");
  const body = params.request.body.pipeThrough(new fixedLengthStream(expectedContentLength));

  const storage = await getConfiguredR2StorageProvider();
  const stored = await storage.put({ key: version.storage_key, body, contentType, contentLength: expectedContentLength });
  await completeR2DocumentUpload({ actorUserId: user.id, versionId, size: stored.size, contentType, etag: stored.etag || `r2:${stored.key}`, storageObjectId: randomUUID() });
  return { versionId, stored: true };
}
