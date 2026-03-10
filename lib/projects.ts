import type { Database } from "@/lib/supabase/types";

export type OrganizationProject = Database["public"]["Tables"]["organization_projects"]["Row"];
export type ProjectStage = Database["public"]["Tables"]["organization_projects"]["Row"]["stage"];

export const PROJECT_STAGE_OPTIONS: ReadonlyArray<ProjectStage> = ["Planning", "Estimating", "In Delivery"];
export const PROJECT_IMAGES_BUCKET = "project-images";
export const MAX_PROJECT_IMAGE_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export function toProjectSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "project";
}

export function resolveUniqueProjectSlug(baseSlug: string, existingSlugs: string[]): string {
  const normalizedBase = baseSlug.toLowerCase();
  const used = new Set(existingSlugs.map((slug) => slug.toLowerCase()));

  if (!used.has(normalizedBase)) {
    return baseSlug;
  }

  let counter = 2;
  while (used.has(`${normalizedBase}-${counter}`)) {
    counter += 1;
  }

  return `${baseSlug}-${counter}`;
}

export function formatProjectNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePathSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "file";
}

export function toProjectImageStoragePath(params: {
  organizationId: string;
  projectId: string;
  fileName: string;
}): string {
  const fileName = params.fileName.trim() || "project-image";
  const extensionIndex = fileName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0 && extensionIndex < fileName.length - 1;
  const baseName = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
  const extension = hasExtension ? fileName.slice(extensionIndex + 1) : "jpg";
  const normalizedBase = normalizePathSegment(baseName);
  const normalizedExtension = normalizePathSegment(extension);

  return `${params.organizationId}/${params.projectId}/${crypto.randomUUID()}-${normalizedBase}.${normalizedExtension}`;
}
