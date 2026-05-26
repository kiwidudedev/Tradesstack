import type {
  PricingWorksheetAiProviderName,
  PricingWorksheetProviderRequest,
  PricingWorksheetProviderResponse,
} from "@/lib/ai/providers/pricing-worksheet/types";

export interface PricingWorksheetAiProvider {
  name: PricingWorksheetAiProviderName;
  defaultModel: string;

  generateEditPlan(
    request: PricingWorksheetProviderRequest
  ): Promise<PricingWorksheetProviderResponse>;
}
