"use client";

import { Upload, type DetailedError } from "tus-js-client";
import {
  DOCUMENT_STORAGE_BUCKET,
  DOCUMENT_TUS_CHUNK_SIZE_BYTES,
  DOCUMENT_TUS_RETRY_DELAYS_MS,
} from "@/lib/documents/constants";
import type { DocumentUploadReservation } from "@/lib/documents/server";
import { validateDocumentFile, type DocumentUploadInitiationInput } from "@/lib/documents/validation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

interface JsonError {
  error?: string;
  code?: string;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & JsonError;
  if (!response.ok) {
    throw new Error(body.error || "Document upload request failed.");
  }
  return body;
}

export function getDocumentTusEndpoint(supabaseUrl: string): string {
  const parsed = new URL(supabaseUrl);
  if (parsed.hostname.endsWith(".supabase.co")) {
    const projectRef = parsed.hostname.slice(0, -".supabase.co".length);
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${parsed.origin}/storage/v1/upload/resumable`;
}

export async function requestDocumentUploadInitiation(
  input: Omit<DocumentUploadInitiationInput, "extension">,
): Promise<DocumentUploadReservation> {
  const response = await fetch("/api/documents/uploads/initiate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<DocumentUploadReservation>(response);
}

export async function requestDocumentUploadCompletion(versionId: string) {
  const response = await fetch(`/api/documents/uploads/${versionId}/complete`, {
    method: "POST",
    cache: "no-store",
  });
  return readJsonOrThrow<{
    nodeId: string;
    versionId: string;
    versionNumber: number;
    displayName: string;
    byteSize: number;
    verifiedMimeType: string;
    activatedAt: string;
  }>(response);
}

export async function requestDocumentUploadAbandonment(versionId: string) {
  const response = await fetch(`/api/documents/uploads/${versionId}/abandon`, {
    method: "POST",
    cache: "no-store",
  });
  return readJsonOrThrow<{ uploadState: string }>(response);
}

export async function uploadReservedDocumentWithTus(params: {
  file: File;
  reservation: DocumentUploadReservation;
  signal?: AbortSignal;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}) {
  const validatedFile = validateDocumentFile({
    displayName: params.file.name,
    claimedMimeType: params.file.type,
    byteSize: params.file.size,
  });
  if (
    validatedFile.displayName !== params.reservation.displayName
    || validatedFile.claimedMimeType !== params.reservation.claimedMimeType
    || validatedFile.byteSize !== params.reservation.byteSize
    || params.reservation.bucket !== DOCUMENT_STORAGE_BUCKET
  ) {
    throw new Error("The selected file does not match its server reservation.");
  }
  if (Date.parse(params.reservation.uploadExpiresAt) <= Date.now()) {
    throw new Error("The pending upload has expired.");
  }

  const supabase = createBrowserSupabaseClient();
  const { url, anonKey } = getSupabaseEnv();
  const endpoint = getDocumentTusEndpoint(url);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const upload = new Upload(params.file, {
      endpoint,
      retryDelays: [...DOCUMENT_TUS_RETRY_DELAYS_MS],
      chunkSize: DOCUMENT_TUS_CHUNK_SIZE_BYTES,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async () =>
        `tradesstack-document:${params.reservation.versionId}:${params.file.size}:${params.file.lastModified}`,
      metadata: {
        bucketName: DOCUMENT_STORAGE_BUCKET,
        objectName: params.reservation.storageKey,
        contentType: params.reservation.claimedMimeType,
        cacheControl: "0",
      },
      headers: {
        apikey: anonKey,
        "x-upsert": "false",
      },
      async onBeforeRequest(request) {
        const { data, error } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (error || !accessToken) {
          throw new Error("Your authentication session expired.");
        }
        request.setHeader("authorization", `Bearer ${accessToken}`);
      },
      onProgress(uploadedBytes, totalBytes) {
        params.onProgress?.(uploadedBytes, totalBytes);
      },
      onError(error: Error | DetailedError) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      },
      onSuccess() {
        if (!settled) {
          settled = true;
          resolve();
        }
      },
    });

    const abort = () => {
      void upload.abort(false).finally(() => {
        if (!settled) {
          settled = true;
          reject(new DOMException("Document upload was cancelled.", "AbortError"));
        }
      });
    };
    params.signal?.addEventListener("abort", abort, { once: true });

    upload.findPreviousUploads()
      .then((previousUploads) => {
        const matchingUpload = previousUploads.find(
          (previous) =>
            previous.metadata.objectName === params.reservation.storageKey
            && previous.size === params.file.size,
        );
        if (matchingUpload) {
          upload.resumeFromPreviousUpload(matchingUpload);
        }
        upload.start();
      })
      .catch(reject);
  });

  // TUS success means Storage accepted the object. Only this server-authorized
  // completion call may activate the immutable document version.
  return requestDocumentUploadCompletion(params.reservation.versionId);
}
