export type InterpretationFieldState = "found" | "inferred" | "unreadable" | "missing";

export type SourceEvidence = {
  sourcePartId: string;
  page: number | null;
  sheet: string | null;
  cellRange: string | null;
  excerpt: string | null;
  boundingRegion: number[] | null;
};

export type InterpretationField<T> = {
  value: T | null;
  state: InterpretationFieldState;
  confidence: number | null;
  evidence: SourceEvidence[];
};

export type InterpretationWarning = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
};

export type DocumentSourcePart = {
  id: string;
  kind: "pdf" | "spreadsheet" | "csv" | "image" | "email_body";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  content: string | Uint8Array;
  metadata: Record<string, unknown>;
};

export type InterpretationRunMetadata = {
  provider: string;
  model: string;
  contractVersion: string;
  promptVersion: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  attemptNumber: number;
  errorCode: string | null;
};

export type StructuredInterpretationRequest = {
  model?: string;
  systemInstruction: string;
  userInstruction: string;
  schema: Record<string, unknown>;
  sourceParts: DocumentSourcePart[];
  maxOutputTokens?: number;
  timeoutMs?: number;
  contractVersion: string;
  promptVersion: string;
  attemptNumber?: number;
};

export type StructuredInterpretationResult = {
  value: Record<string, unknown>;
  run: InterpretationRunMetadata;
};
