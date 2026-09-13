export const DOCUMENT_STORAGE_BUCKET = "organization-documents";
export const DOCUMENT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
export const DOCUMENT_DEFAULT_ORGANIZATION_QUOTA_BYTES = 100 * 1024 * 1024 * 1024;
export const DOCUMENT_PENDING_UPLOAD_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const DOCUMENT_DOWNLOAD_LIFETIME_SECONDS = 5 * 60;
export const DOCUMENT_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
export const DOCUMENT_TUS_RETRY_DELAYS_MS = [0, 1_000, 3_000, 5_000, 10_000, 20_000] as const;

export const DOCUMENT_MIME_BY_EXTENSION = {
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  csv: ["text/csv"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
} as const;

export type DocumentFileExtension = keyof typeof DOCUMENT_MIME_BY_EXTENSION;
export type DocumentAllowedMimeType =
  (typeof DOCUMENT_MIME_BY_EXTENSION)[DocumentFileExtension][number];

export const DOCUMENT_BLOCKED_EXTENSION_SEGMENTS = new Set([
  "exe",
  "com",
  "bat",
  "cmd",
  "msi",
  "msp",
  "scr",
  "ps1",
  "psm1",
  "sh",
  "bash",
  "zsh",
  "js",
  "mjs",
  "cjs",
  "html",
  "htm",
  "svg",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "bz2",
  "xz",
  "iso",
  "dmg",
  "pkg",
  "app",
  "apk",
  "jar",
  "docm",
  "dotm",
  "xlsm",
  "xltm",
  "pptm",
  "potm",
]);
