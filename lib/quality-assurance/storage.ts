/* eslint-disable @typescript-eslint/no-explicit-any */

import { QUALITY_PHOTO_ALLOWED_TYPES, QUALITY_PHOTOS_BUCKET, MAX_QUALITY_PHOTO_SIZE_BYTES } from "@/lib/quality-assurance/constants";
import { sanitizeFileName } from "@/lib/quality-assurance/helpers";
import type { ProjectContext, QualityPhotoUploadResult } from "@/lib/quality-assurance/types";

export async function getQualityPhotoSignedUrl(supabase: any, storagePath: string) {
  if (!supabase) {
    return storagePath;
  }
  const { data, error } = await supabase.storage.from(QUALITY_PHOTOS_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error || !data?.signedUrl) {
    return storagePath;
  }
  return data.signedUrl;
}

export function validateQualityPhotoFile(file: File) {
  if (!QUALITY_PHOTO_ALLOWED_TYPES.has(file.type)) {
    throw new Error("Unsupported file type. Please upload JPG, PNG, WebP, HEIC, HEIF, or GIF.");
  }
  if (file.size > MAX_QUALITY_PHOTO_SIZE_BYTES) {
    throw new Error("Photo is too large. Maximum size is 10 MB.");
  }
}

export async function uploadQualityPhoto(
  supabase: any,
  context: ProjectContext | null,
  sessionUserId: string | null | undefined,
  file: File
): Promise<QualityPhotoUploadResult> {
  if (!supabase || !context || !sessionUserId) {
    throw new Error("Upload context unavailable.");
  }
  validateQualityPhotoFile(file);
  const storagePath = `${context.organizationId}/${context.projectId}/quality/photos/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage.from(QUALITY_PHOTOS_BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    throw new Error(error.message);
  }
  return {
    storagePath,
    signedUrl: await getQualityPhotoSignedUrl(supabase, storagePath),
  };
}

export async function deleteQualityPhoto(supabase: any, storagePath: string | null | undefined) {
  if (!supabase || !storagePath) {
    return;
  }
  const { error } = await supabase.storage.from(QUALITY_PHOTOS_BUCKET).remove([storagePath]);
  if (error) {
    throw new Error(error.message);
  }
}
