import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callUniversalConstructionLearningAnthropic,
  UniversalLearningModelOutputTruncatedError,
} from "@/lib/universal-learning/model";

describe("Universal learning Anthropic model", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.UNIVERSAL_CONSTRUCTION_LEARNING_ANTHROPIC_MAX_OUTPUT_TOKENS;
  });

  it("returns the exact credential-free provider request only when diagnostics are requested", async () => {
    process.env.ANTHROPIC_API_KEY = "must-never-be-returned";
    process.env.UNIVERSAL_CONSTRUCTION_LEARNING_ANTHROPIC_MAX_OUTPUT_TOKENS = "321";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "{\"reviewSummary\":{}}" }],
        usage: {
          input_tokens: 20,
          output_tokens: 5,
        },
      }),
    }));
    global.fetch = fetchMock as typeof fetch;
    const prompt = {
      promptVersion: "ucl-test",
      systemPrompt: "safe system prompt",
      userPrompt: "safe user prompt",
      promptPacket: {} as never,
    };

    const ordinary = await callUniversalConstructionLearningAnthropic(prompt);
    const diagnostic = await callUniversalConstructionLearningAnthropic(prompt, {
      captureDiagnostic: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ordinary).not.toHaveProperty("diagnostic");
    expect(diagnostic.diagnostic?.request).toEqual({
      model: "claude-sonnet-4-6",
      max_tokens: 321,
      temperature: 0,
      system: "safe system prompt",
      messages: [{ role: "user", content: "safe user prompt" }],
    });
    expect(JSON.stringify(diagnostic.diagnostic)).not.toContain("must-never-be-returned");
    expect(JSON.stringify(diagnostic.diagnostic)).not.toContain("x-api-key");
    expect(JSON.stringify(diagnostic.diagnostic)).not.toContain("authorization");
    const providerRequest = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );
    expect(providerRequest).toEqual(diagnostic.diagnostic?.request);
  });

  it("raises a truncation error when Anthropic stops at max_tokens", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stop_reason: "max_tokens",
        content: [
          {
            type: "text",
            text: "{\"reviewSummary\":",
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 8000,
        },
      }),
    })) as typeof fetch;

    await expect(callUniversalConstructionLearningAnthropic({
      promptVersion: "ucl-test",
      systemPrompt: "system",
      userPrompt: "user",
      promptPacket: {} as never,
    })).rejects.toBeInstanceOf(UniversalLearningModelOutputTruncatedError);
  });
});
