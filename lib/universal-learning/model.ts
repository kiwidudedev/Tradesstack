import type { UniversalLearningPromptBuildResult } from "@/lib/universal-learning/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS = 8_000;

type UniversalLearningModelErrorCode = "model_output_truncated" | "model_output_unparseable";

class UniversalLearningModelResponseError extends Error {
  rawText: string;
  responsePayload: Record<string, unknown>;
  code: UniversalLearningModelErrorCode;

  constructor(message: string, input: {
    rawText: string;
    responsePayload: Record<string, unknown>;
    code: UniversalLearningModelErrorCode;
  }) {
    super(message);
    this.name = "UniversalLearningModelResponseError";
    this.rawText = input.rawText;
    this.responsePayload = input.responsePayload;
    this.code = input.code;
  }
}

export class UniversalLearningModelParseError extends UniversalLearningModelResponseError {
  constructor(message: string, input: {
    rawText: string;
    responsePayload: Record<string, unknown>;
  }) {
    super(message, { ...input, code: "model_output_unparseable" });
    this.name = "UniversalLearningModelParseError";
  }
}

export class UniversalLearningModelOutputTruncatedError extends UniversalLearningModelResponseError {
  constructor(message: string, input: {
    rawText: string;
    responsePayload: Record<string, unknown>;
  }) {
    super(message, { ...input, code: "model_output_truncated" });
    this.name = "UniversalLearningModelOutputTruncatedError";
  }
}

function parseJsonObjectFromText(payload: string): Record<string, unknown> | null {
  function parseCandidate(candidate: string) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  function extractBalancedObject(text: string) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        if (depth === 0) {
          start = index;
        }
        depth += 1;
        continue;
      }

      if (char === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          return text.slice(start, index + 1);
        }
      }
    }

    return null;
  }

  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  const direct = parseCandidate(trimmed);
  if (direct) {
    return direct;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = parseCandidate(fenced[1].trim());
    if (parsed) {
      return parsed;
    }
  }

  const balancedObject = extractBalancedObject(trimmed);
  if (balancedObject) {
    const parsed = parseCandidate(balancedObject);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractAnthropicResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const record = item as Record<string, unknown>;
      if (record.type !== "text") {
        return "";
      }
      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

export type UniversalLearningModelResult = {
  provider: "anthropic";
  model: string;
  rawText: string;
  parsedJson: Record<string, unknown>;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type UniversalLearningModelInvoker = (
  prompt: UniversalLearningPromptBuildResult,
) => Promise<UniversalLearningModelResult>;

export const callUniversalConstructionLearningAnthropic: UniversalLearningModelInvoker = async (prompt) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Universal Construction Learning.");
  }

  const model = process.env.UNIVERSAL_CONSTRUCTION_LEARNING_ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const maxOutputTokens = Number.parseInt(
    process.env.UNIVERSAL_CONSTRUCTION_LEARNING_ANTHROPIC_MAX_OUTPUT_TOKENS ?? `${DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS}`,
    10,
  );
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
        ? maxOutputTokens
        : DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS,
      temperature: 0,
      system: prompt.systemPrompt,
      messages: [
        {
          role: "user",
          content: prompt.userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed with status ${response.status}.`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  const rawText = extractAnthropicResponseText(json);
  if (json.stop_reason === "max_tokens") {
    throw new UniversalLearningModelOutputTruncatedError(
      "Anthropic output was truncated because it hit the max token limit.",
      {
        rawText,
        responsePayload: json,
      },
    );
  }
  const parsedJson = parseJsonObjectFromText(rawText);
  if (!parsedJson) {
    throw new UniversalLearningModelParseError("Anthropic returned a response that could not be parsed as JSON.", {
      rawText,
      responsePayload: json,
    });
  }

  const usage = (json.usage ?? {}) as Record<string, unknown>;
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : null;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : null;

  return {
    provider: "anthropic",
    model,
    rawText,
    parsedJson,
    inputTokens,
    outputTokens,
    totalTokens:
      inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
  };
};
