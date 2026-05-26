import { afterEach, describe, expect, it } from "vitest";
import {
  getPricingWorksheetAiProvider,
  getPricingWorksheetAiProviderName,
  getPricingWorksheetAnthropicModel,
  getPricingWorksheetOpenAiModel,
} from "@/lib/ai/providers/pricing-worksheet/registry";

const originalProvider = process.env.PRICING_WORKSHEET_AI_PROVIDER;
const originalOpenAiModel = process.env.PRICING_WORKSHEET_OPENAI_MODEL;
const originalAnthropicModel = process.env.ANTHROPIC_WORKSHEET_MODEL;

afterEach(() => {
  process.env.PRICING_WORKSHEET_AI_PROVIDER = originalProvider;
  process.env.PRICING_WORKSHEET_OPENAI_MODEL = originalOpenAiModel;
  process.env.ANTHROPIC_WORKSHEET_MODEL = originalAnthropicModel;
});

describe("pricing worksheet provider registry", () => {
  it("defaults to openai", () => {
    delete process.env.PRICING_WORKSHEET_AI_PROVIDER;

    expect(getPricingWorksheetAiProviderName()).toBe("openai");
    expect(getPricingWorksheetAiProvider().name).toBe("openai");
    expect(getPricingWorksheetOpenAiModel()).toBe("gpt-5.5");
  });

  it("selects anthropic only when the env flag is set", () => {
    process.env.PRICING_WORKSHEET_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_WORKSHEET_MODEL = "claude-sonnet-4-6";

    expect(getPricingWorksheetAiProviderName()).toBe("anthropic");
    expect(getPricingWorksheetAiProvider().name).toBe("anthropic");
    expect(getPricingWorksheetAnthropicModel()).toBe("claude-sonnet-4-6");
  });
});
