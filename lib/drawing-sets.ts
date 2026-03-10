import type { Database } from "@/lib/supabase/types";

export const PROJECT_DRAWING_SETS_BUCKET = "project-drawing-sets";
export const MAX_DRAWING_SET_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024 * 1024;

export type ProjectDrawingSet = Database["public"]["Tables"]["project_drawing_sets"]["Row"];

function normalizeFileNameSegment(segment: string): string {
  const normalized = segment
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "drawing-set";
}

export function toDrawingSetStoragePath(params: {
  organizationId: string;
  projectId: string;
  fileName: string;
}): string {
  const fileName = params.fileName.trim();
  const extensionIndex = fileName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0 && extensionIndex < fileName.length - 1;

  const baseName = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
  const extension = hasExtension ? fileName.slice(extensionIndex + 1).toLowerCase() : null;

  const normalizedBaseName = normalizeFileNameSegment(baseName);
  const normalizedExtension = extension ? normalizeFileNameSegment(extension) : null;
  const objectName = normalizedExtension ? `${normalizedBaseName}.${normalizedExtension}` : normalizedBaseName;

  return `${params.organizationId}/${params.projectId}/${crypto.randomUUID()}-${objectName}`;
}

export function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "Unknown size";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
