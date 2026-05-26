import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import type {
  PricingWorksheetAiConfidence,
  PricingWorksheetAiEvidenceSource,
} from "@/lib/pricing-worksheet-edit-plan";
import type { PricingWorksheetAiProvider } from "@/lib/ai/providers/pricing-worksheet/provider";
import {
  createPricingWorksheetProviderError,
  type PricingWorksheetProviderCitation,
  type PricingWorksheetProviderError,
  type PricingWorksheetProviderRequest,
  type PricingWorksheetProviderResponse,
} from "@/lib/ai/providers/pricing-worksheet/types";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const WORKSHEET_AI_WEB_SEARCH_TOOL = {
  type: "web_search",
} as const;
const RETRYABLE_PROVIDER_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504, 520, 522, 524]);

type PricingWorksheetProviderResponseFailureReason =
  | "missing_structured_output"
  | "malformed_json"
  | "truncated_json"
  | "schema_normalization_failed"
  | "no_assistant_message"
  | "unsupported_provider_shape"
  | "provider_tool_only_response"
  | "provider_returned_empty_response";

export type PricingWorksheetAssistantPayloadDiagnostics = {
  sourcePath: string;
  outputItemTypes: string[];
  contentItemTypes: string[];
  rawTextLength: number;
  structuredObjectFound: boolean;
  parseError?: string;
  possibleTruncatedJson?: boolean;
};

export type PricingWorksheetAssistantPayloadExtraction = {
  structuredObject: Record<string, unknown> | null;
  rawText: string;
  providerSources: PricingWorksheetAiEvidenceSource[];
  diagnostics: PricingWorksheetAssistantPayloadDiagnostics;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectOpenAiOutputItemTypes(responseJson: unknown): string[] {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.output)) {
    return [];
  }

  return responseJson.output
    .map((outputItem) => (isRecord(outputItem) && typeof outputItem.type === "string" ? outputItem.type : null))
    .filter((value): value is string => Boolean(value));
}

function collectOpenAiContentItemTypes(responseJson: unknown): string[] {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.output)) {
    return [];
  }

  const contentTypes: string[] = [];
  for (const outputItem of responseJson.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && typeof contentItem.type === "string") {
        contentTypes.push(contentItem.type);
      }
    }
  }

  return contentTypes;
}

function extractOpenAiResponseTextChunks(responseJson: unknown): string[] {
  if (!isRecord(responseJson)) {
    return [];
  }

  const chunks: string[] = [];
  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim().length > 0) {
    chunks.push(responseJson.output_text.trim());
  }

  const output = responseJson.output;
  if (!Array.isArray(output)) {
    return chunks;
  }

  for (const outputItem of output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (
        isRecord(contentItem) &&
        (contentItem.type === "output_text" || contentItem.type === "text") &&
        typeof contentItem.text === "string" &&
        contentItem.text.trim().length > 0
      ) {
        chunks.push(contentItem.text);
      }
    }
  }

  return chunks;
}

function extractOpenAiResponseText(responseJson: unknown): string {
  return extractOpenAiResponseTextChunks(responseJson).join("\n").trim();
}

function extractOpenAiStructuredObject(responseJson: unknown): Record<string, unknown> | null {
  if (!isRecord(responseJson)) {
    return null;
  }

  if (isRecord(responseJson.output_parsed)) {
    return responseJson.output_parsed;
  }

  const output = responseJson.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const outputItem of output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (isRecord(contentItem.json)) {
        return contentItem.json;
      }

      if (isRecord(contentItem.parsed)) {
        return contentItem.parsed;
      }
    }
  }

  return null;
}

function buildProviderResponseDiagnostics(
  responseJson: unknown,
  overrides?: Partial<PricingWorksheetAssistantPayloadDiagnostics>,
): PricingWorksheetAssistantPayloadDiagnostics {
  return {
    sourcePath: overrides?.sourcePath ?? "none",
    outputItemTypes: overrides?.outputItemTypes ?? collectOpenAiOutputItemTypes(responseJson),
    contentItemTypes: overrides?.contentItemTypes ?? collectOpenAiContentItemTypes(responseJson),
    rawTextLength: overrides?.rawTextLength ?? 0,
    structuredObjectFound: overrides?.structuredObjectFound ?? false,
    parseError: overrides?.parseError,
    possibleTruncatedJson: overrides?.possibleTruncatedJson ?? false,
  };
}

export function extractBalancedJsonObject(text: string): {
  jsonText: string | null;
  possibleTruncatedJson: boolean;
} {
  const source = text.trim();
  if (!source) {
    return { jsonText: null, possibleTruncatedJson: false };
  }

  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        return {
          jsonText: source.slice(startIndex, index + 1),
          possibleTruncatedJson: false,
        };
      }
    }
  }

  return {
    jsonText: null,
    possibleTruncatedJson: startIndex >= 0 && depth > 0,
  };
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function parseJsonObjectCandidate(payload: string): {
  structuredObject: Record<string, unknown> | null;
  parseError?: string;
  possibleTruncatedJson?: boolean;
} {
  const trimmed = stripMarkdownCodeFence(payload);
  if (!trimmed) {
    return { structuredObject: null };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      structuredObject: isRecord(parsed) ? parsed : null,
      parseError: isRecord(parsed) ? undefined : "parsed_value_was_not_an_object",
    };
  } catch (error) {
    const balanced = extractBalancedJsonObject(trimmed);
    if (!balanced.jsonText) {
      return {
        structuredObject: null,
        parseError: error instanceof Error ? error.message : "json_parse_failed",
        possibleTruncatedJson: balanced.possibleTruncatedJson,
      };
    }

    try {
      const parsed = JSON.parse(balanced.jsonText);
      return {
        structuredObject: isRecord(parsed) ? parsed : null,
        parseError: isRecord(parsed) ? undefined : "parsed_balanced_json_was_not_an_object",
        possibleTruncatedJson: false,
      };
    } catch (balancedError) {
      return {
        structuredObject: null,
        parseError: balancedError instanceof Error ? balancedError.message : "balanced_json_parse_failed",
        possibleTruncatedJson: balanced.possibleTruncatedJson,
      };
    }
  }
}

function inferEvidenceSourceType(params: { title?: string; url?: string }): PricingWorksheetAiEvidenceSource["sourceType"] {
  const haystack = `${params.title ?? ""} ${params.url ?? ""}`.toLowerCase();
  if (
    haystack.includes("ncc") ||
    haystack.includes("nzbc") ||
    haystack.includes("as/nzs") ||
    haystack.includes("building code") ||
    haystack.includes("standards")
  ) {
    return "standard_or_code";
  }

  if (
    haystack.includes("rondo") ||
    haystack.includes("gib") ||
    haystack.includes("knauf") ||
    haystack.includes("sika") ||
    haystack.includes("csr") ||
    haystack.includes("bostik")
  ) {
    return "manufacturer";
  }

  if (
    haystack.includes("supplier") ||
    haystack.includes("mitre10") ||
    haystack.includes("bunnings") ||
    haystack.includes("placemakers")
  ) {
    return "supplier";
  }

  if (haystack.includes("guide") || haystack.includes("manual") || haystack.includes("technical") || haystack.includes("guidance")) {
    return "industry_guidance";
  }

  return params.url ? "web" : "unknown";
}

function inferEvidenceJurisdiction(params: { title?: string; url?: string }): PricingWorksheetAiEvidenceSource["jurisdiction"] {
  const haystack = `${params.title ?? ""} ${params.url ?? ""}`.toLowerCase();
  if (haystack.includes(".au") || haystack.includes("australia") || haystack.includes("ncc") || haystack.includes("au/")) {
    return "AU";
  }

  if (haystack.includes(".nz") || haystack.includes("new zealand") || haystack.includes("nzbc") || haystack.includes("nz/")) {
    return "NZ";
  }

  if (haystack.includes("as/nzs") || (haystack.includes(".au") && haystack.includes(".nz"))) {
    return "AUS_NZ";
  }

  return "unknown";
}

function inferEvidenceConfidence(sourceType: PricingWorksheetAiEvidenceSource["sourceType"]): PricingWorksheetAiConfidence {
  if (sourceType === "standard_or_code") {
    return "high";
  }

  if (sourceType === "manufacturer" || sourceType === "industry_guidance" || sourceType === "project_document") {
    return "medium";
  }

  if (sourceType === "supplier" || sourceType === "unknown") {
    return "low";
  }

  return "medium";
}

function sanitizeEvidenceSourceText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function sanitizeEvidenceSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().slice(0, 280);
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

function buildEvidenceSourceId(index: number, title?: string, url?: string): string {
  const seed = (url || title || `source-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return seed.length > 0 ? seed : `source-${index + 1}`;
}

function buildEvidenceSourceDedupKey(source: Pick<PricingWorksheetAiEvidenceSource, "title" | "url">): string {
  const normalizedUrl = source.url?.trim().toLowerCase();
  if (normalizedUrl) {
    return normalizedUrl;
  }

  return source.title.trim().toLowerCase();
}

function mergeEvidenceSources(
  modelSources: PricingWorksheetAiEvidenceSource[],
  providerSources: PricingWorksheetAiEvidenceSource[],
): PricingWorksheetAiEvidenceSource[] {
  const merged: PricingWorksheetAiEvidenceSource[] = [];

  for (const source of [...providerSources, ...modelSources]) {
    const existingIndex = merged.findIndex((entry) => buildEvidenceSourceDedupKey(entry) === buildEvidenceSourceDedupKey(source));
    if (existingIndex < 0) {
      merged.push(source);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      title: existing.title.length >= source.title.length ? existing.title : source.title,
      url: existing.url ?? source.url,
      sourceType: existing.sourceType === "unknown" ? source.sourceType : existing.sourceType,
      jurisdiction: existing.jurisdiction === "unknown" ? source.jurisdiction : existing.jurisdiction,
      confidence:
        existing.confidence === "high" || source.confidence === "low"
          ? existing.confidence
          : source.confidence === "high"
            ? "high"
            : existing.confidence === "medium" || source.confidence === "medium"
              ? "medium"
              : "low",
      supportedClaims: Array.from(new Set([...(existing.supportedClaims ?? []), ...(source.supportedClaims ?? [])])).slice(0, 4),
      retrievedAt: existing.retrievedAt ?? source.retrievedAt,
    };
  }

  return merged.slice(0, 16);
}

function extractOpenAiEvidenceSources(responseJson: unknown): PricingWorksheetAiEvidenceSource[] {
  if (!isRecord(responseJson)) {
    return [];
  }

  const collected: PricingWorksheetAiEvidenceSource[] = [];
  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const retrievedAt = new Date().toISOString();

  for (const outputItem of output) {
    if (!isRecord(outputItem)) {
      continue;
    }

    if (
      outputItem.type === "web_search_call" &&
      isRecord(outputItem.action) &&
      Array.isArray(outputItem.action.sources)
    ) {
      for (const [index, sourceEntry] of outputItem.action.sources.entries()) {
        if (!isRecord(sourceEntry)) {
          continue;
        }

        const title = sanitizeEvidenceSourceText(sourceEntry.title, 120);
        const url = sanitizeEvidenceSourceUrl(sourceEntry.url);
        if (!title && !url) {
          continue;
        }
        const sourceType = inferEvidenceSourceType({ title, url });
        collected.push({
          id: buildEvidenceSourceId(index, title, url),
          title: title || (url ?? `Source ${index + 1}`),
          url,
          sourceType,
          jurisdiction: inferEvidenceJurisdiction({ title, url }),
          confidence: inferEvidenceConfidence(sourceType),
          retrievedAt,
          supportedClaims: [],
        });
      }
    }

    if (!Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem) || !Array.isArray(contentItem.annotations)) {
        continue;
      }

      for (const [index, annotation] of contentItem.annotations.entries()) {
        if (!isRecord(annotation) || annotation.type !== "url_citation") {
          continue;
        }

        const title = sanitizeEvidenceSourceText(annotation.title, 120);
        const url = sanitizeEvidenceSourceUrl(annotation.url);
        if (!title && !url) {
          continue;
        }

        const sourceType = inferEvidenceSourceType({ title, url });
        collected.push({
          id: buildEvidenceSourceId(index, title, url),
          title: title || (url ?? `Citation ${index + 1}`),
          url,
          sourceType,
          jurisdiction: inferEvidenceJurisdiction({ title, url }),
          confidence: inferEvidenceConfidence(sourceType),
          retrievedAt,
          supportedClaims: [],
        });
      }
    }
  }

  return mergeEvidenceSources([], collected);
}

function extractOpenAiCitations(responseJson: unknown): PricingWorksheetProviderCitation[] {
  return extractOpenAiEvidenceSources(responseJson).map((source) => ({
    title: source.title,
    url: source.url,
  }));
}

function hasIncompleteProviderSignal(responseJson: unknown): boolean {
  if (!isRecord(responseJson)) {
    return false;
  }

  if (responseJson.status === "incomplete") {
    return true;
  }

  if (isRecord(responseJson.incomplete_details)) {
    return true;
  }

  if (!Array.isArray(responseJson.output)) {
    return false;
  }

  return responseJson.output.some((outputItem) => isRecord(outputItem) && outputItem.status === "incomplete");
}

function classifyProviderResponseFailureReason(
  responseJson: unknown,
  extraction: PricingWorksheetAssistantPayloadExtraction,
): PricingWorksheetProviderResponseFailureReason {
  const { diagnostics, rawText } = extraction;
  const hasOutputItems = diagnostics.outputItemTypes.length > 0;
  const hasMessageOutput = diagnostics.outputItemTypes.includes("message");
  const hasToolOnlyOutput =
    hasOutputItems &&
    diagnostics.outputItemTypes.every((type) => type !== "message") &&
    diagnostics.outputItemTypes.some((type) => type.includes("tool") || type.includes("search"));

  if (!hasOutputItems && !rawText.trim()) {
    return "provider_returned_empty_response";
  }

  if (hasToolOnlyOutput && !rawText.trim()) {
    return "provider_tool_only_response";
  }

  if (!hasMessageOutput && !rawText.trim()) {
    return "no_assistant_message";
  }

  if (diagnostics.possibleTruncatedJson || hasIncompleteProviderSignal(responseJson)) {
    return "truncated_json";
  }

  if (diagnostics.parseError) {
    return rawText.trim() ? "malformed_json" : "missing_structured_output";
  }

  if (rawText.trim()) {
    return "missing_structured_output";
  }

  return "unsupported_provider_shape";
}

export function extractPricingWorksheetAssistantPayload(
  responseJson: unknown,
): PricingWorksheetAssistantPayloadExtraction {
  const providerSources = extractOpenAiEvidenceSources(responseJson);
  const outputItemTypes = collectOpenAiOutputItemTypes(responseJson);
  const contentItemTypes = collectOpenAiContentItemTypes(responseJson);

  if (!isRecord(responseJson)) {
    return {
      structuredObject: null,
      rawText: "",
      providerSources,
      diagnostics: buildProviderResponseDiagnostics(responseJson, {
        outputItemTypes,
        contentItemTypes,
      }),
    };
  }

  if (isRecord(responseJson.output_parsed)) {
    return {
      structuredObject: responseJson.output_parsed,
      rawText: extractOpenAiResponseText(responseJson),
      providerSources,
      diagnostics: buildProviderResponseDiagnostics(responseJson, {
        sourcePath: "output_parsed",
        outputItemTypes,
        contentItemTypes,
        rawTextLength: extractOpenAiResponseText(responseJson).length,
        structuredObjectFound: true,
      }),
    };
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const [outputIndex, outputItem] of output.entries()) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const [contentIndex, contentItem] of outputItem.content.entries()) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (isRecord(contentItem.parsed)) {
        return {
          structuredObject: contentItem.parsed,
          rawText: extractOpenAiResponseText(responseJson),
          providerSources,
          diagnostics: buildProviderResponseDiagnostics(responseJson, {
            sourcePath: `output[${outputIndex}].content[${contentIndex}].parsed`,
            outputItemTypes,
            contentItemTypes,
            rawTextLength: extractOpenAiResponseText(responseJson).length,
            structuredObjectFound: true,
          }),
        };
      }

      if (isRecord(contentItem.json)) {
        return {
          structuredObject: contentItem.json,
          rawText: extractOpenAiResponseText(responseJson),
          providerSources,
          diagnostics: buildProviderResponseDiagnostics(responseJson, {
            sourcePath: `output[${outputIndex}].content[${contentIndex}].json`,
            outputItemTypes,
            contentItemTypes,
            rawTextLength: extractOpenAiResponseText(responseJson).length,
            structuredObjectFound: true,
          }),
        };
      }
    }
  }

  const rawChunks = extractOpenAiResponseTextChunks(responseJson);
  const rawText = rawChunks.join("\n").trim();
  const topLevelOutputText = typeof responseJson.output_text === "string" ? responseJson.output_text.trim() : "";
  const candidates = [
    { label: "output_text", value: topLevelOutputText },
    ...rawChunks.map((chunk, index) => ({ label: `output_text_chunk_${index + 1}`, value: chunk })),
    { label: "joined_output_text", value: rawText },
  ].filter((candidate, index, array) => {
    if (!candidate.value) {
      return false;
    }
    return array.findIndex((entry) => entry.value === candidate.value) === index;
  });

  for (const candidate of candidates) {
    const parsedCandidate = parseJsonObjectCandidate(candidate.value);
    if (parsedCandidate.structuredObject) {
      return {
        structuredObject: parsedCandidate.structuredObject,
        rawText,
        providerSources,
        diagnostics: buildProviderResponseDiagnostics(responseJson, {
          sourcePath: candidate.label,
          outputItemTypes,
          contentItemTypes,
          rawTextLength: rawText.length,
          structuredObjectFound: true,
        }),
      };
    }
  }

  const finalCandidate = candidates[0]?.value ?? rawText;
  const parseAttempt = parseJsonObjectCandidate(finalCandidate);
  return {
    structuredObject: null,
    rawText,
    providerSources,
    diagnostics: buildProviderResponseDiagnostics(responseJson, {
      sourcePath: candidates[0]?.label ?? "none",
      outputItemTypes,
      contentItemTypes,
      rawTextLength: rawText.length,
      structuredObjectFound: false,
      parseError: parseAttempt.parseError,
      possibleTruncatedJson: parseAttempt.possibleTruncatedJson || hasIncompleteProviderSignal(responseJson),
    }),
  };
}

function mapOpenAiStatusError(params: {
  model: string;
  status: number;
  statusText: string;
  errorBody: string;
}): PricingWorksheetProviderError {
  const message = `OpenAI request failed with status ${params.status}.`;
  const rawError = {
    statusText: params.statusText,
    responseBodySnippet: params.errorBody.slice(0, 1200),
  };

  if (params.status === 401 || params.status === 403) {
    return createPricingWorksheetProviderError({
      code: "provider_auth_error",
      provider: "openai",
      model: params.model,
      status: params.status,
      retryable: false,
      message,
      rawError,
    });
  }

  if (params.status === 429) {
    return createPricingWorksheetProviderError({
      code: "provider_rate_limited",
      provider: "openai",
      model: params.model,
      status: params.status,
      retryable: true,
      message,
      rawError,
    });
  }

  if (RETRYABLE_PROVIDER_STATUS_CODES.has(params.status)) {
    return createPricingWorksheetProviderError({
      code: "provider_server_error",
      provider: "openai",
      model: params.model,
      status: params.status,
      retryable: true,
      message,
      rawError,
    });
  }

  return createPricingWorksheetProviderError({
    code: "provider_bad_response",
    provider: "openai",
    model: params.model,
    status: params.status,
    retryable: false,
    message,
    rawError,
  });
}

function mapOpenAiRequestError(model: string, error: unknown): PricingWorksheetProviderError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Upstream request timed out")) {
    return createPricingWorksheetProviderError({
      code: "provider_timeout",
      provider: "openai",
      model,
      retryable: true,
      message,
      rawError: error,
    });
  }

  return createPricingWorksheetProviderError({
    code: "provider_unknown_error",
    provider: "openai",
    model,
    retryable: true,
    message,
    rawError: error,
  });
}

function extractOpenAiUsage(responseJson: unknown): PricingWorksheetProviderResponse["usage"] | undefined {
  if (!isRecord(responseJson) || !isRecord(responseJson.usage)) {
    return undefined;
  }

  const usage = responseJson.usage;
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export class OpenAiPricingWorksheetProvider implements PricingWorksheetAiProvider {
  name = "openai" as const;
  defaultModel: string;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel?.trim() || DEFAULT_OPENAI_MODEL;
  }

  async generateEditPlan(
    request: PricingWorksheetProviderRequest
  ): Promise<PricingWorksheetProviderResponse> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const model = request.model.trim() || this.defaultModel;

    if (!apiKey) {
      throw createPricingWorksheetProviderError({
        code: "provider_auth_error",
        provider: "openai",
        model,
        retryable: false,
        message: "OPENAI_API_KEY is not configured.",
      });
    }

    const requestBody = JSON.stringify({
      model,
      max_output_tokens: request.maxOutputTokens,
      tools: request.enableWebSearch ? [WORKSHEET_AI_WEB_SEARCH_TOOL] : [],
      tool_choice: request.enableWebSearch ? "auto" : "none",
      include: request.enableWebSearch ? ["web_search_call.action.sources"] : [],
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: request.systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: request.userPrompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pricing_worksheet_edit_assistant",
          schema: request.schema,
          strict: true,
        },
      },
    });

    let response: Response;
    try {
      response = await fetchWithTimeout(
        OPENAI_API_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
        },
        request.timeoutMs,
      );
    } catch (error) {
      throw mapOpenAiRequestError(model, error);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw mapOpenAiStatusError({
        model,
        status: response.status,
        statusText: response.statusText,
        errorBody,
      });
    }

    let responseJson: unknown;
    try {
      responseJson = (await response.json()) as unknown;
    } catch (error) {
      throw createPricingWorksheetProviderError({
        code: "provider_bad_response",
        provider: "openai",
        model,
        retryable: false,
        message: "OpenAI returned invalid JSON.",
        rawError: error,
      });
    }

    const extraction = extractPricingWorksheetAssistantPayload(responseJson);
    if (!extraction.structuredObject) {
      const parseFailureReason = classifyProviderResponseFailureReason(responseJson, extraction);
      throw createPricingWorksheetProviderError({
        code: "provider_schema_parse_failed",
        provider: "openai",
        model,
        retryable: parseFailureReason === "truncated_json",
        message: `AI assistant returned an unreadable response (${parseFailureReason}).`,
        rawError: {
          parseFailureReason,
          diagnostics: extraction.diagnostics,
          responseJson,
        },
      });
    }

    return {
      provider: "openai",
      model,
      rawProviderResponse: responseJson,
      parsedJson: extraction.structuredObject,
      outputText: extraction.rawText,
      evidence: extraction.providerSources,
      citations: extractOpenAiCitations(responseJson),
      usage: extractOpenAiUsage(responseJson),
      warnings: [],
      webSearchUsed: request.enableWebSearch && extraction.providerSources.length > 0,
      effectiveWebSearchEnabled: request.enableWebSearch,
    };
  }
}
