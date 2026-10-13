import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  MAX_DRAWING_SET_UPLOAD_SIZE_BYTES,
  PROJECT_DRAWING_SETS_BUCKET,
  toDefaultDrawingSetDisplayName,
  toDrawingSetStoragePath,
} from "@/lib/drawing-sets";
import type { Database } from "@/lib/supabase/types";
import { getConfiguredStorageProviderKind } from "@/lib/storage/provider";

const PROJECT_DRAWING_SET_SELECT =
  "id, organization_id, project_id, uploaded_by, file_name, display_name, sort_order, archived_at, archived_by, source_type, source_revision, storage_path, file_size_bytes, mime_type, uploaded_at, created_at, updated_at";

export type ProjectDrawingSet = Database["public"]["Tables"]["project_drawing_sets"]["Row"];

type SupabaseErrorLike = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
};

function toErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && typeof (error as SupabaseErrorLike).message === "string"
      ? (error as SupabaseErrorLike).message as string
      : "";
  if (message.trim()) {
    const code = typeof error === "object" && error !== null && typeof (error as SupabaseErrorLike).code === "string"
      ? ` [${(error as SupabaseErrorLike).code}]`
      : "";
    return `${message.trim()}${code}`;
  }

  return fallback;
}

function toErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const candidate = error as SupabaseErrorLike;
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    details: typeof candidate.details === "string" ? candidate.details : undefined,
    hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
  };
}

function waitBeforeRetry(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 150 : 500));
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

  if (getConfiguredStorageProviderKind() === "r2") {
    const response = await fetch(
      `/api/takeoff/drawing-upload?organizationId=${encodeURIComponent(params.organizationId)}&projectId=${encodeURIComponent(params.projectId)}&fileName=${encodeURIComponent(normalizedFileName)}&size=${params.file.size}`,
      {
        method: "POST",
        headers: { "content-type": "application/pdf" },
        body: params.file,
      },
    );
    const payload = await response.json().catch(() => null) as { drawingSet?: ProjectDrawingSet; error?: string } | null;
    if (!response.ok || !payload?.drawingSet) {
      throw new Error(payload?.error || "Unable to upload the drawing to private storage.");
    }
    params.onProgress?.(params.file.size, params.file.size);
    return payload.drawingSet;
  }

  await uploadProjectDrawingSetPdfWithResumable({
    supabase: params.supabase,
    file: params.file,
    storagePath,
    onProgress: params.onProgress,
  });

  const mimeType = params.file.type.trim() || "application/pdf";
  const insertPayload = {
    organization_id: params.organizationId,
    project_id: params.projectId,
    uploaded_by: user.id,
    file_name: normalizedFileName,
    display_name: toDefaultDrawingSetDisplayName(normalizedFileName),
    source_type: "source" as const,
    source_revision: crypto.randomUUID(),
    sort_order: -1,
    storage_path: storagePath,
    file_size_bytes: params.file.size,
    mime_type: mimeType,
  };

  let insertError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: insertedRow, error } = await params.supabase
      .from("project_drawing_sets")
      .insert(insertPayload)
      .select(PROJECT_DRAWING_SET_SELECT)
      .single();

    if (!error && insertedRow) {
      return insertedRow;
    }

    insertError = error ?? new Error("The metadata insert returned no row.");
    console.error("[takeoff-upload] Drawing metadata persistence failed", {
      attempt: attempt + 1,
      organizationId: params.organizationId,
      projectId: params.projectId,
      storagePath,
      ...toErrorDetails(insertError),
    });

    // The insert may have committed even when the response was lost or the
    // follow-up row fetch returned no row. Recover by the unique storage path
    // before retrying; otherwise a retry could create a second record.
    const { data: recoveredRow } = await params.supabase
      .from("project_drawing_sets")
      .select(PROJECT_DRAWING_SET_SELECT)
      .eq("organization_id", params.organizationId)
      .eq("project_id", params.projectId)
      .eq("storage_path", storagePath)
      .maybeSingle();

    if (recoveredRow) {
      return recoveredRow;
    }

    if (attempt < 2) {
      await waitBeforeRetry(attempt);
    }
  }

  await params.supabase.storage.from(PROJECT_DRAWING_SETS_BUCKET).remove([storagePath]);
  throw new Error(toErrorMessage(insertError, "Drawing uploaded, but metadata could not be saved."));
}
