export type DocumentIntelligenceErrorCode =
  | "provider_auth_error"
  | "provider_billing_error"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_server_error"
  | "provider_bad_response"
  | "provider_schema_parse_failed"
  | "provider_refusal"
  | "provider_max_tokens"
  | "provider_unknown_error"
  | "unsupported_source"
  | "invalid_source";

export class DocumentIntelligenceError extends Error {
  code: DocumentIntelligenceErrorCode;
  provider: string;
  model: string;
  status: number | null;
  retryable: boolean;
  safeMetadata: Record<string, unknown>;

  constructor(input: {
    code: DocumentIntelligenceErrorCode;
    message: string;
    provider?: string;
    model?: string;
    status?: number | null;
    retryable?: boolean;
    safeMetadata?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "DocumentIntelligenceError";
    this.code = input.code;
    this.provider = input.provider ?? "unknown";
    this.model = input.model ?? "unknown";
    this.status = input.status ?? null;
    this.retryable = Boolean(input.retryable);
    this.safeMetadata = input.safeMetadata ?? {};
  }
}

export function isDocumentIntelligenceError(value: unknown): value is DocumentIntelligenceError {
  return value instanceof DocumentIntelligenceError;
}
