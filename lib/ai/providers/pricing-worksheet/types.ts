import type { PricingWorksheetAiEvidenceSource } from "@/lib/pricing-worksheet-edit-plan";

export type PricingWorksheetAiProviderName = "openai" | "anthropic";

export type PricingWorksheetProviderRequest = {
  systemPrompt: string;
  userPrompt: string;
  schema: Record<string, unknown>;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  enableWebSearch: boolean;
  metadata?: Record<string, unknown>;
};

export type PricingWorksheetProviderCitation = {
  title: string;
  url?: string;
};

export type PricingWorksheetProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type PricingWorksheetProviderResponse = {
  provider: PricingWorksheetAiProviderName;
  model: string;
  rawProviderResponse: unknown;
  parsedJson: Record<string, unknown> | null;
  outputText: string;
  evidence: PricingWorksheetAiEvidenceSource[];
  citations: PricingWorksheetProviderCitation[];
  usage?: PricingWorksheetProviderUsage;
  warnings: string[];
  webSearchUsed: boolean;
  effectiveWebSearchEnabled: boolean;
};

export type PricingWorksheetProviderErrorCode =
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_auth_error"
  | "provider_server_error"
  | "provider_bad_response"
  | "provider_schema_parse_failed"
  | "provider_schema_validation_failed"
  | "provider_tool_error"
  | "provider_unknown_error";

export type PricingWorksheetProviderError = Error & {
  code: PricingWorksheetProviderErrorCode;
  provider: PricingWorksheetAiProviderName;
  model: string;
  status: number | null;
  retryable: boolean;
  rawError: unknown;
};

export function createPricingWorksheetProviderError(params: {
  code: PricingWorksheetProviderErrorCode;
  provider: PricingWorksheetAiProviderName;
  model: string;
  status?: number | null;
  retryable: boolean;
  message: string;
  rawError?: unknown;
}): PricingWorksheetProviderError {
  const error = new Error(params.message) as PricingWorksheetProviderError;
  error.code = params.code;
  error.provider = params.provider;
  error.model = params.model;
  error.status = params.status ?? null;
  error.retryable = params.retryable;
  error.rawError = params.rawError ?? null;
  return error;
}

export function isPricingWorksheetProviderError(error: unknown): error is PricingWorksheetProviderError {
  return (
    error instanceof Error &&
    typeof (error as PricingWorksheetProviderError).code === "string" &&
    typeof (error as PricingWorksheetProviderError).provider === "string" &&
    typeof (error as PricingWorksheetProviderError).model === "string" &&
    typeof (error as PricingWorksheetProviderError).retryable === "boolean"
  );
}
