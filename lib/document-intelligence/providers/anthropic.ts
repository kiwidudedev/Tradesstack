import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import type {
  DocumentSourcePart,
  StructuredInterpretationRequest,
  StructuredInterpretationResult,
} from "@/lib/document-intelligence/contracts";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
export const DEFAULT_ANTHROPIC_DOCUMENT_TIMEOUT_MS = 600_000;
export const DEFAULT_ANTHROPIC_DOCUMENT_MAX_OUTPUT_TOKENS = 64_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeAnthropicJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAnthropicJsonSchema);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["maxItems", "minItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "$schema"].includes(key))
      .map(([key, child]) => [key, sanitizeAnthropicJsonSchema(child)])
  );
}

function sourceBlock(part: DocumentSourcePart): Record<string, unknown> {
  if (part.kind === "pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(part.content as Uint8Array).toString("base64"),
      },
      title: part.fileName,
      context: `TradesStack source part ${part.id}; locator metadata ${JSON.stringify(part.metadata)}`,
    };
  }
  if (part.kind === "image") {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: part.mimeType,
        data: Buffer.from(part.content as Uint8Array).toString("base64"),
      },
    };
  }
  return {
    type: "text",
    text: `SOURCE PART ${part.id} (${part.kind}: ${part.fileName})\n${String(part.content)}`,
  };
}

function usage(value: unknown) {
  if (!isRecord(value)) return { inputTokens: null, outputTokens: null, totalTokens: null };
  const inputTokens = typeof value.input_tokens === "number" ? value.input_tokens : null;
  const outputTokens = typeof value.output_tokens === "number" ? value.output_tokens : null;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
  };
}

function structuredValue(response: unknown): Record<string, unknown> | null {
  if (!isRecord(response)) return null;
  if (isRecord(response.structured_output)) return response.structured_output;
  if (!Array.isArray(response.content)) return null;
  const text = response.content
    .filter(isRecord)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function statusError(response: Response, model: string) {
  const status = response.status;
  let providerErrorType: string | null = null;
  let providerErrorMessage: string | null = null;
  try {
    const payload = await response.json() as unknown;
    if (isRecord(payload) && isRecord(payload.error)) {
      providerErrorType = typeof payload.error.type === "string" ? payload.error.type.slice(0, 100) : null;
      providerErrorMessage = typeof payload.error.message === "string"
        ? payload.error.message.replace(/[\r\n]+/g, " ").slice(0, 500)
        : null;
    }
  } catch {
    // The HTTP status remains the authoritative safe failure signal.
  }
  const billingUnavailable = status === 400
    && typeof providerErrorMessage === "string"
    && /credit balance|billing|purchase credits/i.test(providerErrorMessage);
  const code = billingUnavailable
    ? "provider_billing_error"
    : status === 401 || status === 403
    ? "provider_auth_error"
    : status === 429
      ? "provider_rate_limited"
      : RETRYABLE.has(status)
        ? "provider_server_error"
        : "provider_bad_response";
  return new DocumentIntelligenceError({
    code,
    provider: "anthropic",
    model,
    status,
    retryable: RETRYABLE.has(status),
    message: billingUnavailable
      ? "Anthropic billing credits are unavailable for document interpretation."
      : `Anthropic document interpretation failed (${status}).`,
    safeMetadata: {
      retryAfterMs: (() => {
        const header = response.headers.get("retry-after");
        if (!header) return null;
        const seconds = Number(header);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.min(300_000, seconds * 1000);
        const date = Date.parse(header);
        return Number.isFinite(date) ? Math.max(0, Math.min(300_000, date - Date.now())) : null;
      })(),
      providerErrorType,
      providerErrorMessage,
    },
  });
}

export async function interpretStructuredDocumentWithAnthropic(
  request: StructuredInterpretationRequest
): Promise<StructuredInterpretationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = request.model?.trim()
    || process.env.ANTHROPIC_MATERIAL_SUPPLIER_PRICING_MODEL?.trim()
    || "claude-sonnet-4-6";
  if (!apiKey) {
    throw new DocumentIntelligenceError({
      code: "provider_auth_error",
      message: "Anthropic is not configured for supplier pricing interpretation.",
      provider: "anthropic",
      model,
      retryable: false,
    });
  }

  const startedAt = new Date();
  let response: Response;
  try {
    console.info("anthropic_document_request_started", {
      model,
      attemptNumber: request.attemptNumber ?? 1,
      sourcePartCount: request.sourceParts.length,
      sourceBytes: request.sourceParts.reduce((sum, part) => sum + part.sizeBytes, 0),
      timeoutMs: request.timeoutMs ?? DEFAULT_ANTHROPIC_DOCUMENT_TIMEOUT_MS,
    });
    response = await fetchWithTimeout(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxOutputTokens ?? DEFAULT_ANTHROPIC_DOCUMENT_MAX_OUTPUT_TOKENS,
        system: request.systemInstruction,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: request.userInstruction },
            ...request.sourceParts.map(sourceBlock),
          ],
        }],
        output_config: {
          format: {
            type: "json_schema",
            schema: sanitizeAnthropicJsonSchema(request.schema),
          },
        },
      }),
    }, request.timeoutMs ?? DEFAULT_ANTHROPIC_DOCUMENT_TIMEOUT_MS);
  } catch (error) {
    const timedOut = error instanceof Error && error.message.includes("timed out");
    throw new DocumentIntelligenceError({
      code: timedOut ? "provider_timeout" : "provider_unknown_error",
      message: timedOut ? "Supplier pricing interpretation timed out." : "Supplier pricing provider request failed.",
      provider: "anthropic",
      model,
      retryable: !timedOut,
      safeMetadata: { errorType: error instanceof Error ? error.name : "UnknownError" },
    });
  }
  if (!response.ok) {
    const error = await statusError(response, model);
    console.warn("anthropic_document_request_rejected", {
      status: response.status,
      model,
      errorCode: error.code,
      providerErrorType: error.safeMetadata.providerErrorType ?? null,
      providerErrorMessage: error.safeMetadata.providerErrorMessage ?? null,
    });
    throw error;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new DocumentIntelligenceError({
      code: "provider_bad_response",
      message: "Anthropic returned an unreadable response.",
      provider: "anthropic",
      model,
      retryable: false,
    });
  }
  if (isRecord(json) && json.stop_reason === "refusal") {
    throw new DocumentIntelligenceError({ code: "provider_refusal", message: "Anthropic declined to interpret this document.", provider: "anthropic", model });
  }
  if (isRecord(json) && json.stop_reason === "max_tokens") {
    const completedAt = new Date();
    const tokenUsage = usage(json.usage);
    const requestId = typeof json.id === "string" ? json.id : response.headers.get("request-id");
    console.info("anthropic_document_request_stopped", {
      model,
      attemptNumber: request.attemptNumber ?? 1,
      requestId,
      stopReason: "max_tokens",
      durationMs: completedAt.getTime() - startedAt.getTime(),
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
    });
    throw new DocumentIntelligenceError({
      code: "provider_max_tokens",
      message: "Supplier pricing output exceeded the provider limit.",
      provider: "anthropic",
      model,
      retryable: false,
      safeMetadata: {
        requestId,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        attemptNumber: request.attemptNumber ?? 1,
      },
    });
  }
  const value = structuredValue(json);
  if (!value) {
    throw new DocumentIntelligenceError({ code: "provider_schema_parse_failed", message: "Anthropic returned an invalid supplier pricing structure.", provider: "anthropic", model });
  }
  const completedAt = new Date();
  const tokenUsage = usage(isRecord(json) ? json.usage : null);
  console.info("anthropic_document_request_completed", {
    model,
    attemptNumber: request.attemptNumber ?? 1,
    requestId: isRecord(json) && typeof json.id === "string" ? json.id : response.headers.get("request-id"),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
  });
  return {
    value,
    run: {
      provider: "anthropic",
      model,
      contractVersion: request.contractVersion,
      promptVersion: request.promptVersion,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      requestId: isRecord(json) && typeof json.id === "string" ? json.id : response.headers.get("request-id"),
      ...tokenUsage,
      attemptNumber: request.attemptNumber ?? 1,
      errorCode: null,
    },
  };
}
