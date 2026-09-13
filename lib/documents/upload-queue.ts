export type DocumentUploadQueueState =
  | "queued"
  | "uploading"
  | "retrying"
  | "completed"
  | "failed"
  | "abandoned";

const TRANSITIONS: Record<DocumentUploadQueueState, readonly DocumentUploadQueueState[]> = {
  queued: ["uploading", "abandoned"],
  uploading: ["completed", "failed", "abandoned"],
  retrying: ["completed", "failed", "abandoned"],
  completed: [],
  failed: ["retrying", "abandoned"],
  abandoned: [],
};

export function canTransitionDocumentUpload(
  from: DocumentUploadQueueState,
  to: DocumentUploadQueueState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function canRetryDocumentUpload(state: DocumentUploadQueueState): boolean {
  return canTransitionDocumentUpload(state, "retrying");
}

export function documentUploadPersistenceKey(params: {
  entityKind: "opportunity" | "project";
  entityId: string;
  parentNodeId: string | null;
  file: Pick<File, "name" | "size" | "lastModified">;
}): string {
  return [
    "tradesstack-document-upload",
    params.entityKind,
    params.entityId,
    params.parentNodeId ?? "root",
    params.file.name,
    params.file.size,
    params.file.lastModified,
  ].join(":");
}
