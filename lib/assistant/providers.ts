import "server-only";

import type { AssistantProviderName, AssistantProviderRequest, AssistantProviderStream } from "./types";

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4.1";
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_CHAT_MODEL || process.env.ANTHROPIC_VLM_MODEL || "claude-sonnet-4-6";
const PROVIDER_TIMEOUT_MS = 35_000;

export class AssistantProviderError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "AssistantProviderError";
    this.status = status;
  }
}

export function resolveAssistantProvider(preferred?: string | null): AssistantProviderName {
  if (preferred === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "openai";
}

export async function streamAssistantResponse(
  provider: AssistantProviderName,
  input: AssistantProviderRequest,
): Promise<AssistantProviderStream> {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  input.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AssistantProviderError("Anthropic is not configured.", 503);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: input.model || DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 1200,
          stream: true,
          system: input.system,
          messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      if (!response.ok || !response.body) throw new AssistantProviderError("Anthropic provider request failed.");
      return { response, provider, model: input.model || DEFAULT_ANTHROPIC_MODEL };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AssistantProviderError("OpenAI is not configured.", 503);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: input.model || DEFAULT_OPENAI_MODEL,
        stream: true,
        input: [
          { role: "system", content: [{ type: "input_text", text: input.system }] },
          ...input.messages.map((message) => ({
            role: message.role,
            content: [{ type: message.role === "assistant" ? "output_text" : "input_text", text: message.content }],
          })),
        ],
      }),
    });
    if (!response.ok || !response.body) throw new AssistantProviderError("OpenAI provider request failed.");
    return { response, provider, model: input.model || DEFAULT_OPENAI_MODEL };
  } catch (error) {
    if (error instanceof AssistantProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AssistantProviderError("AI provider request timed out.", 504);
    }
    throw new AssistantProviderError("AI provider request failed.");
  } finally {
    // The controller remains attached to the streamed response; it aborts an
    // upstream stream that exceeds the bounded request lifetime.
  }
}

export function extractProviderEvent(payload: Record<string, unknown>, provider: AssistantProviderName) {
  if (provider === "anthropic") {
    if (payload.type === "content_block_delta") {
      const delta = payload.delta;
      return delta && typeof delta === "object" && typeof (delta as { text?: unknown }).text === "string"
        ? (delta as { text: string }).text
        : "";
    }
    return "";
  }
  return payload.type === "response.output_text.delta" && typeof payload.delta === "string" ? payload.delta : "";
}

export function extractProviderUsage(payload: Record<string, unknown>, provider: AssistantProviderName) {
  const source = provider === "anthropic" ? payload.usage : (payload.response as { usage?: unknown } | undefined)?.usage;
  if (!source || typeof source !== "object") return 0;
  const usage = source as { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown };
  const total = typeof usage.total_tokens === "number"
    ? usage.total_tokens
    : Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0);
  return Number.isFinite(total) ? total : 0;
}
