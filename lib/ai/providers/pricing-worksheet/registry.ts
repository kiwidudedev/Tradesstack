import type { PricingWorksheetAiProvider } from "@/lib/ai/providers/pricing-worksheet/provider";
import { AnthropicPricingWorksheetProvider } from "@/lib/ai/providers/pricing-worksheet/anthropic-provider";
import { OpenAiPricingWorksheetProvider } from "@/lib/ai/providers/pricing-worksheet/openai-provider";
import { type PricingWorksheetAiProviderName } from "@/lib/ai/providers/pricing-worksheet/types";

function normalizeProviderName(value: string | undefined | null): PricingWorksheetAiProviderName {
  return value?.trim().toLowerCase() === "anthropic" ? "anthropic" : "openai";
}

export function getPricingWorksheetAiProviderName(): PricingWorksheetAiProviderName {
  return normalizeProviderName(process.env.PRICING_WORKSHEET_AI_PROVIDER);
}

export function getPricingWorksheetOpenAiModel(): string {
  return (
    process.env.PRICING_WORKSHEET_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_PRICING_WORKSHEET_MODEL?.trim() ||
    "gpt-5.5"
  );
}

export function getPricingWorksheetAnthropicModel(): string {
  return (
    process.env.ANTHROPIC_WORKSHEET_MODEL?.trim() ||
    process.env.PRICING_WORKSHEET_ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-6"
  );
}

export function getPricingWorksheetAiProvider(providerName?: string): PricingWorksheetAiProvider {
  const requestedProvider = normalizeProviderName(providerName ?? process.env.PRICING_WORKSHEET_AI_PROVIDER);

  if (requestedProvider === "anthropic") {
    return new AnthropicPricingWorksheetProvider(getPricingWorksheetAnthropicModel());
  }

  return new OpenAiPricingWorksheetProvider(getPricingWorksheetOpenAiModel());
}
