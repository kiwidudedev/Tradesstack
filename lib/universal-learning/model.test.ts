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
