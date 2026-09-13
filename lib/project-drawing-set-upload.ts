import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  MAX_DRAWING_SET_UPLOAD_SIZE_BYTES,
  PROJECT_DRAWING_SETS_BUCKET,
  toDefaultDrawingSetDisplayName,
  toDrawingSetStoragePath,
} from "@/lib/drawing-sets";
import type { Database } from "@/lib/supabase/types";

const PROJECT_DRAWING_SET_SELECT =
  "id, organization_id, project_id, uploaded_by, file_name, display_name, sort_order, archived_at, archived_by, source_type, source_revision, storage_path, file_size_bytes, mime_type, uploaded_at, created_at, updated_at";

export type ProjectDrawingSet = Database["public"]["Tables"]["project_drawing_sets"]["Row"];

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function assertPdfFile(file: File) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    throw new Error("Only PDF files can be uploaded as source drawings.");
  }

  if (file.size <= 0) {
    throw new Error("Empty files cannot be uploaded.");
  }

  if (file.size > MAX_DRAWING_SET_UPLOAD_SIZE_BYTES) {
    throw new Error("This file exceeds the maximum drawing upload size.");
  }
}

export async function uploadProjectDrawingSetPdfWithResumable(params: {
  supabase: SupabaseClient<Database>;
  file: File;
  storagePath: string;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<void> {
  const [{ Upload }, { url, anonKey }] = await Promise.all([
    import("tus-js-client"),
    Promise.resolve(getSupabaseEnv()),
  ]);
  const { data: sessionData, error: sessionError } = await params.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;

  if (sessionError || !accessToken) {
    throw new Error("Your auth session expired. Please refresh and try again.");
  }

  const endpoint = `${url}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(params.file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      chunkSize: 5 * 1024 * 1024,
      metadata: {
        bucketName: PROJECT_DRAWING_SETS_BUCKET,
        objectName: params.storagePath,
        contentType: "application/pdf",
        cacheControl: "3600",
      },
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "x-upsert": "false",
      },
      onError(uploadError) {
        reject(uploadError);
      },
      onProgress(uploadedBytes, totalBytes) {
        params.onProgress?.(uploadedBytes, totalBytes);
      },
      onSuccess() {
        resolve();
      },
    });

    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }

        upload.start();
      })
      .catch(reject);
  });
}

export async function uploadSourceDrawingSetToProject(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  projectId: string;
  file: File;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<ProjectDrawingSet> {
  assertPdfFile(params.file);

  const {
    data: { user },
    error: userError,
  } = await params.supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to upload drawings.");
  }

  const normalizedFileName = params.file.name.trim();
  if (!normalizedFileName) {
    throw new Error("File name cannot be blank.");
  }

  const storagePath = toDrawingSetStoragePath({
    organizationId: params.organizationId,
    projectId: params.projectId,
    fileName: normalizedFileName,
  });

  await uploadProjectDrawingSetPdfWithResumable({
    supabase: params.supabase,
    file: params.file,
    storagePath,
    onProgress: params.onProgress,
  });

  const mimeType = params.file.type.trim() || "application/pdf";
  const { data: insertedRow, error: insertError } = await params.supabase
    .from("project_drawing_sets")
    .insert({
      organization_id: params.organizationId,
      project_id: params.projectId,
      uploaded_by: user.id,
      file_name: normalizedFileName,
      display_name: toDefaultDrawingSetDisplayName(normalizedFileName),
      source_type: "source",
      storage_path: storagePath,
      file_size_bytes: params.file.size,
      mime_type: mimeType,
    })
    .select(PROJECT_DRAWING_SET_SELECT)
    .single();

  if (insertError || !insertedRow) {
    await params.supabase.storage.from(PROJECT_DRAWING_SETS_BUCKET).remove([storagePath]);
    throw new Error(toErrorMessage(insertError, "Drawing uploaded, but metadata could not be saved."));
  }

  return insertedRow;
}
