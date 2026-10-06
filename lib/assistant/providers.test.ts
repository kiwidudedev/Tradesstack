import { describe, expect, it } from "vitest";
import { extractProviderEvent, resolveAssistantProvider } from "./providers";

describe("assistant provider boundary", () => {
  it("normalizes OpenAI and Anthropic stream deltas", () => {
    expect(extractProviderEvent({ type: "response.output_text.delta", delta: "hello" }, "openai")).toBe("hello");
    expect(extractProviderEvent({ type: "content_block_delta", delta: { type: "text_delta", text: "bonjour" } }, "anthropic")).toBe("bonjour");
    expect(extractProviderEvent({ type: "response.completed" }, "openai")).toBe("");
  });

  it("does not select Anthropic when its server credential is absent", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(resolveAssistantProvider("anthropic")).toBe("openai");
    if (previous) process.env.ANTHROPIC_API_KEY = previous;
  });
});
