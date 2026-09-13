import type { CommercialItemsClient } from "@/lib/commercial-items/types";
import type { PurchaseOrderSourceSection } from "@/lib/purchase-orders/types";

export type TakeoffPurchaseOrderPublishTarget =
  | {
      mode: "new";
      supplierId: string;
      section: PurchaseOrderSourceSection;
      purchaseOrderTitle: string;
      requestKey: string;
    }
  | {
      mode: "existing";
      supplierId: string;
      section: PurchaseOrderSourceSection;
      purchaseOrderId: string;
      expectedUpdatedAt: string;
      requestKey: string;
    };

export interface TakeoffPurchaseOrderPublishResult {
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  purchaseOrderNumber: string;
  commercialItemId: string;
  targetMode: "new" | "existing";
  reusedCommercialItem: boolean;
}

type RpcRow = {
  purchase_order_id: string;
  purchase_order_line_id: string;
  purchase_order_number: string;
  commercial_item_id: string;
  target_mode: string;
  reused_commercial_item: boolean;
};

export async function publishTakeoffCommercialPurchaseOrder(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
  projectId: string;
  dataProjectId: string;
  measurementId: string;
  description: string;
  rate: number;
  target: TakeoffPurchaseOrderPublishTarget;
}): Promise<TakeoffPurchaseOrderPublishResult> {
  const response = await params.client.rpc("publish_takeoff_commercial_purchase_order_v1" as never, {
    p_input: {
      organizationId: params.organizationId,
      opportunityId: params.opportunityId,
      projectId: params.projectId,
      dataProjectId: params.dataProjectId,
      measurementId: params.measurementId,
      description: params.description,
      rate: params.rate,
      targetMode: params.target.mode,
      supplierId: params.target.supplierId,
      section: params.target.section,
      purchaseOrderTitle: params.target.mode === "new" ? params.target.purchaseOrderTitle : null,
      purchaseOrderId: params.target.mode === "existing" ? params.target.purchaseOrderId : null,
      expectedUpdatedAt: params.target.mode === "existing" ? params.target.expectedUpdatedAt : null,
      requestKey: params.target.requestKey,
    },
  } as never);
  if (response.error) throw new Error(response.error.message);
  const row = (Array.isArray(response.data) ? response.data[0] : null) as RpcRow | null;
  if (!row?.purchase_order_id || !row.purchase_order_line_id || !row.commercial_item_id) {
    throw new Error("Purchase Order publication completed without a result.");
  }
  return {
    purchaseOrderId: row.purchase_order_id,
    purchaseOrderLineId: row.purchase_order_line_id,
    purchaseOrderNumber: row.purchase_order_number,
    commercialItemId: row.commercial_item_id,
    targetMode: row.target_mode === "new" ? "new" : "existing",
    reusedCommercialItem: Boolean(row.reused_commercial_item),
  };
}
