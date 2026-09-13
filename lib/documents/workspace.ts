import { DOCUMENT_MIME_BY_EXTENSION } from "@/lib/documents/constants";

export const DOCUMENT_LIST_PAGE_SIZE = 100;
export const DOCUMENT_FILE_TYPES = [
  "all",
  "folders",
  "pdf",
  "images",
  "documents",
  "spreadsheets",
  "presentations",
  "text",
  "other",
] as const;
export const DOCUMENT_SORTS = ["name", "modified", "owner", "size"] as const;
export const DOCUMENT_DIRECTIONS = ["asc", "desc"] as const;
export const DOCUMENT_WORKSPACE_VIEWS = ["active", "deleted"] as const;

export type DocumentFileType = (typeof DOCUMENT_FILE_TYPES)[number];
export type DocumentSort = (typeof DOCUMENT_SORTS)[number];
export type DocumentDirection = (typeof DOCUMENT_DIRECTIONS)[number];
export type DocumentWorkspaceView = (typeof DOCUMENT_WORKSPACE_VIEWS)[number];

export interface DocumentWorkspaceNode {
  nodeId: string;
  kind: "folder" | "file";
  displayName: string;
  parentNodeId: string | null;
  ownerUserId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  byteSize: number | null;
  mimeType: string | null;
  fileExtension: string | null;
  versionNumber: number | null;
  uploadState: string | null;
  sha256Checksum: string | null;
  parentName: string | null;
}

export interface DocumentBreadcrumb {
  nodeId: string;
  parentNodeId: string | null;
  displayName: string;
}

export interface DocumentFolderOption {
  nodeId: string;
  parentNodeId: string | null;
  displayName: string;
}

export interface DocumentDeletedBatch {
  deletionBatchId: string;
  rootNodeId: string;
  kind: "folder" | "file";
  displayName: string;
  deletedByUserId: string;
  deletedByName: string;
  deletedAt: string;
  originalParentNodeId: string | null;
  originalParentName: string | null;
  itemCount: number;
  byteSize: number;
}

export interface DocumentStorageUsage {
  quotaBytes: number;
  activeBytes: number;
  deletedBytes: number;
  pendingBytes: number;
  totalBytes: number;
  remainingBytes: number;
  fileCount: number;
  folderCount: number;
  currentVersionCount: number;
  historicalVersionCount: number;
  canWrite: boolean;
  canDelete: boolean;
  canPurge: boolean;
  canMonitor: boolean;
  cleanupAttentionRequired: boolean;
}

export interface DocumentFilesPageMetadata {
  canView: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canPurge: boolean;
  cleanupAttentionRequired: boolean;
}

export interface DocumentWorkspaceQuery {
  view: DocumentWorkspaceView;
  folderId: string | null;
  search: string;
  fileType: DocumentFileType;
  sort: DocumentSort;
  direction: DocumentDirection;
  page: number;
}

export type DocumentEntityContext =
  | { kind: "opportunity"; id: string; slug: string }
  | { kind: "project"; id: string; slug: string };

export function documentFilesRoute(entity: DocumentEntityContext): string {
  return entity.kind === "opportunity"
    ? `/app/leads-clients/opportunities/${entity.slug}/files`
    : `/app/projects/${entity.slug}/files`;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function parseDocumentWorkspaceQuery(
  searchParams: Record<string, string | string[] | undefined>,
): DocumentWorkspaceQuery {
  const folder = first(searchParams.folder);
  const search = first(searchParams.q).trim().slice(0, 100);
  const fileTypeValue = first(searchParams.type).toLowerCase();
  const sortValue = first(searchParams.sort).toLowerCase();
  const directionValue = first(searchParams.direction).toLowerCase();
  const pageValue = Number.parseInt(first(searchParams.page), 10);
  const viewValue = first(searchParams.view).toLowerCase();

  return {
    view: DOCUMENT_WORKSPACE_VIEWS.includes(viewValue as DocumentWorkspaceView)
      ? viewValue as DocumentWorkspaceView
      : "active",
    folderId: UUID_PATTERN.test(folder) ? folder.toLowerCase() : null,
    search,
    fileType: DOCUMENT_FILE_TYPES.includes(fileTypeValue as DocumentFileType)
      ? fileTypeValue as DocumentFileType
      : "all",
    sort: DOCUMENT_SORTS.includes(sortValue as DocumentSort)
      ? sortValue as DocumentSort
      : "name",
    direction: DOCUMENT_DIRECTIONS.includes(directionValue as DocumentDirection)
      ? directionValue as DocumentDirection
      : "asc",
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

export function documentFileCategory(extension: string | null): DocumentFileType {
  switch (extension?.toLowerCase()) {
    case "pdf": return "pdf";
    case "jpg":
    case "jpeg":
    case "png":
    case "webp": return "images";
    case "doc":
    case "docx": return "documents";
    case "xls":
    case "xlsx":
    case "csv": return "spreadsheets";
    case "ppt":
    case "pptx": return "presentations";
    case "txt": return "text";
    default: return "other";
  }
}

export function formatDocumentBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function getDocumentFolderPath(
  folderId: string,
  folders: DocumentFolderOption[],
): string {
  const foldersById = new Map(folders.map((folder) => [folder.nodeId, folder]));
  const segments: string[] = [];
  const visited = new Set<string>();
  let current = foldersById.get(folderId);

  while (current && !visited.has(current.nodeId)) {
    visited.add(current.nodeId);
    segments.unshift(current.displayName);
    current = current.parentNodeId
      ? foldersById.get(current.parentNodeId)
      : undefined;
  }

  return segments.join(" / ");
}

export function isDocumentFolderDescendant(
  candidateFolderId: string,
  ancestorFolderId: string,
  folders: DocumentFolderOption[],
): boolean {
  const foldersById = new Map(folders.map((folder) => [folder.nodeId, folder]));
  const visited = new Set<string>();
  let current = foldersById.get(candidateFolderId);

  while (current && !visited.has(current.nodeId)) {
    if (current.parentNodeId === ancestorFolderId) return true;
    visited.add(current.nodeId);
    current = current.parentNodeId
      ? foldersById.get(current.parentNodeId)
      : undefined;
  }

  return false;
}

export function documentAcceptValue(): string {
  return Object.keys(DOCUMENT_MIME_BY_EXTENSION).map((extension) => `.${extension}`).join(",");
}

export function validateDocumentNodeName(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter a name.";
  if (name.length > 250) return "Names must be 250 characters or fewer.";
  if (name === "." || name === ".." || /[\u0000-\u001f\u007f-\u009f/\\]/u.test(name)) {
    return "That name is not valid.";
  }
  return null;
}
