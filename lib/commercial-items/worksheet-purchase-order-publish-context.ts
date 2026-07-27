import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import type { WorksheetPurchaseOrderPublishContext } from "@/lib/commercial-items/worksheet-purchase-order-publish-context-server";

export async function resolveWorksheetPurchaseOrderPublishContext(params: {
  owner: PricingWorksheetOwnerContextValue;
}): Promise<WorksheetPurchaseOrderPublishContext> {
  const response = await fetch("/api/commercial-items/purchase-order-publish-context", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const payload = (await response.json().catch(() => null)) as
    | { context?: WorksheetPurchaseOrderPublishContext; error?: string }
    | null;

  if (!response.ok || !payload?.context) {
    throw new Error(payload?.error ?? "Unable to prepare purchase order publishing.");
  }

  return payload.context;
}
