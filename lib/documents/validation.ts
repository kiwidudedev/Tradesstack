import {
  DOCUMENT_BLOCKED_EXTENSION_SEGMENTS,
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_MIME_BY_EXTENSION,
  type DocumentAllowedMimeType,
  type DocumentFileExtension,
} from "@/lib/documents/constants";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

export class DocumentInputError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DocumentInputError";
    this.code = code;
    this.status = status;
  }
}

export interface ValidatedDocumentFile {
  displayName: string;
  extension: DocumentFileExtension;
  claimedMimeType: DocumentAllowedMimeType;
  byteSize: number;
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new DocumentInputError("invalid_identifier", `${field} must be a valid UUID.`);
  }
  return value.toLowerCase();
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return requiredUuid(value, field);
}

export function validateDocumentFile(input: {
  displayName: unknown;
  claimedMimeType: unknown;
  byteSize: unknown;
}): ValidatedDocumentFile {
  if (typeof input.displayName !== "string") {
    throw new DocumentInputError("invalid_filename", "A file name is required.");
  }

  const displayName = input.displayName.trim();
  if (
    !displayName
    || displayName.length > 250
    || displayName === "."
    || displayName === ".."
    || CONTROL_CHARACTER_PATTERN.test(displayName)
    || displayName.includes("/")
    || displayName.includes("\\")
  ) {
    throw new DocumentInputError("invalid_filename", "The file name is not valid.");
  }

  const nameParts = displayName.toLowerCase().split(".");
  if (nameParts.length < 2 || !nameParts.at(-1)) {
    throw new DocumentInputError("missing_extension", "The file must have a supported extension.");
  }

  const extension = nameParts.at(-1) as string;
  const dangerousSegment = nameParts.slice(1).find((part) =>
    DOCUMENT_BLOCKED_EXTENSION_SEGMENTS.has(part)
  );
  if (dangerousSegment) {
    throw new DocumentInputError("blocked_extension", "This file type is not allowed.");
  }

  if (!(extension in DOCUMENT_MIME_BY_EXTENSION)) {
    throw new DocumentInputError("unsupported_extension", "This file extension is not supported.");
  }

  if (typeof input.claimedMimeType !== "string" || !input.claimedMimeType.trim()) {
    throw new DocumentInputError("missing_mime_type", "A supported file content type is required.");
  }

  const claimedMimeType = input.claimedMimeType.trim().toLowerCase();
  const allowedMimeTypes =
    DOCUMENT_MIME_BY_EXTENSION[extension as DocumentFileExtension] as readonly string[];
  if (!allowedMimeTypes.includes(claimedMimeType)) {
    throw new DocumentInputError(
      "mime_extension_mismatch",
      "The file content type does not match its extension.",
    );
  }

  if (
    typeof input.byteSize !== "number"
    || !Number.isSafeInteger(input.byteSize)
    || input.byteSize < 1
  ) {
    throw new DocumentInputError("invalid_file_size", "Empty files cannot be uploaded.");
  }

  if (input.byteSize > DOCUMENT_MAX_FILE_SIZE_BYTES) {
    throw new DocumentInputError("file_too_large", "The file exceeds the 2 GiB limit.", 413);
  }

  return {
    displayName,
    extension: extension as DocumentFileExtension,
    claimedMimeType: claimedMimeType as DocumentAllowedMimeType,
    byteSize: input.byteSize,
  };
}

export interface DocumentUploadInitiationInput extends ValidatedDocumentFile {
  opportunityId: string | null;
  projectId: string | null;
  parentNodeId: string | null;
  existingNodeId: string | null;
  idempotencyKey: string;
}

export function parseDocumentUploadInitiationInput(
  value: unknown,
): DocumentUploadInitiationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DocumentInputError("invalid_request", "Invalid upload request.");
  }

  const input = value as Record<string, unknown>;
  const opportunityId = optionalUuid(input.opportunityId, "opportunityId");
  const projectId = optionalUuid(input.projectId, "projectId");
  if (Number(opportunityId !== null) + Number(projectId !== null) !== 1) {
    throw new DocumentInputError(
      "invalid_entity",
      "Exactly one Opportunity or Project identifier is required.",
    );
  }

  return {
    ...validateDocumentFile({
      displayName: input.displayName,
      claimedMimeType: input.claimedMimeType,
      byteSize: input.byteSize,
    }),
    opportunityId,
    projectId,
    parentNodeId: optionalUuid(input.parentNodeId, "parentNodeId"),
    existingNodeId: optionalUuid(input.existingNodeId, "existingNodeId"),
    idempotencyKey: requiredUuid(input.idempotencyKey, "idempotencyKey"),
  };
}

export function assertDocumentVersionId(value: unknown): string {
  return requiredUuid(value, "versionId");
}

export function assertDocumentNodeId(value: unknown): string {
  return requiredUuid(value, "nodeId");
}

export function toSafeDocumentError(error: unknown): {
  code: string;
  message: string;
  status: number;
} {
  if (error instanceof DocumentInputError) {
    return { code: error.code, message: error.message, status: error.status };
  }

  const message = error instanceof Error ? error.message : "";
  if (/unauthorized|access denied/i.test(message)) {
    return { code: "forbidden", message: "Document access denied.", status: 403 };
  }
  if (/not found/i.test(message)) {
    return { code: "not_found", message: "Document resource not found.", status: 404 };
  }
  if (/expired/i.test(message)) {
    return { code: "upload_expired", message: "The pending upload has expired.", status: 409 };
  }
  if (/storage quota exceeded/i.test(message)) {
    return {
      code: "quota_exceeded",
      message: "Your organization has reached its document storage allowance.",
      status: 409,
    };
  }
  if (/idempotency|collision|already|not pending|does not match/i.test(message)) {
    return { code: "document_conflict", message: "The document request conflicts with current state.", status: 409 };
  }

  return {
    code: "document_operation_failed",
    message: "Unable to complete the document operation.",
    status: 500,
  };
}
