import { classifyLineItem } from "./classifyLineItem";
import { createCostItemFromLineItem } from "./costItems";

export const EXAMPLE_INPUTS = [
  "1980x810 hollowcore door",
  "Supply and install LED downlights",
  "Scissor lift hire for ceiling works",
] as const;

export type ExampleOutput = {
  input: string;
  classification: ReturnType<typeof classifyLineItem>;
  costItem: ReturnType<typeof createCostItemFromLineItem>;
};

export function runExamples(): ExampleOutput[] {
  return EXAMPLE_INPUTS.map((input, index) => {
    const classification = classifyLineItem(input);
    const costItem = createCostItemFromLineItem({
      organizationId: "org-demo",
      projectId: "project-demo",
      description: input,
      quantity: index + 1,
      unit: index === 2 ? "day" : "item",
      rate: index === 2 ? 250 : 100,
      sourceType: "quote",
      sourceId: `source-${index + 1}`,
      sourceLineId: `line-${index + 1}`,
      status: "draft",
    });

    return {
      input,
      classification,
      costItem,
    };
  });
}
