"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export const QA_EVIDENCE_MAX_BYTES = 100 * 1024 * 1024;
export const QA_SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;
export const QA_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
export const QA_FILE_ACCEPT = `${QA_PHOTO_ACCEPT},application/pdf,text/plain,text/csv,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx`;

const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const FILE_MIMES = new Set([
  ...PHOTO_MIMES, "application/pdf", "text/plain", "text/csv", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const SIGNATURE_MIMES = new Set(["image/png"]);

export function validateQAEvidenceFile(file: File, type: "photo" | "file" | "signature") {
  if (!file.name.trim() || file.name.length > 250 || /[/\\\u0000-\u001f]/u.test(file.name)) throw new Error("Choose a file with a valid name.");
  if (file.size < 1) throw new Error("Empty files cannot be uploaded.");
  const maximum = type === "signature" ? QA_SIGNATURE_MAX_BYTES : QA_EVIDENCE_MAX_BYTES;
  if (file.size > maximum) throw new Error(type === "signature" ? "Signature image must be 2 MB or smaller." : "QA evidence must be 100 MB or smaller.");
  const allowed = type === "photo" ? PHOTO_MIMES : type === "signature" ? SIGNATURE_MIMES : FILE_MIMES;
  if (!allowed.has(file.type.toLowerCase())) {
    if (/\.hei[cf]$/i.test(file.name) && !file.type) throw new Error("This browser did not identify the iPhone image type. Export it as HEIC, JPEG, PNG, or WebP and try again.");
    throw new Error(type === "photo" ? "Use a JPEG, PNG, WebP, HEIC, or HEIF image." : type === "signature" ? "Signature images must be PNG files." : "This file type is not supported for QA evidence.");
  }
}

export async function uploadProjectQAEvidence(params: { file: File; storagePath: string; token: string }) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.storage.from("project-qa-evidence").uploadToSignedUrl(params.storagePath, params.token, params.file, {
    contentType: params.file.type,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message || "Evidence upload failed.");
}
