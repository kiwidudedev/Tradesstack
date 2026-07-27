import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import type { WorksheetVariationPublishContext } from "@/lib/commercial-items/worksheet-variation-publish-context-server";

export async function resolveWorksheetVariationPublishContext(params: {
  owner: PricingWorksheetOwnerContextValue;
}): Promise<WorksheetVariationPublishContext> {
  const response = await fetch("/api/commercial-items/variation-publish-context", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const payload = (await response.json().catch(() => null)) as
    | { context?: WorksheetVariationPublishContext; error?: string }
    | null;

  if (!response.ok || !payload?.context) {
    throw new Error(payload?.error ?? "Unable to prepare variation publishing.");
  }

  return payload.context;
}
