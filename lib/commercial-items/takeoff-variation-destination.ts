import type { CommercialItemsClient } from "@/lib/commercial-items/types";
import type { VariationCostSection } from "@/lib/commercial-items/variation-sections";

export type TakeoffVariationPublishTarget =
  | {
      mode: "new";
      section: VariationCostSection;
      variationTitle: string;
      requestKey: string;
    }
  | {
      mode: "existing";
      section: VariationCostSection;
      variationId: string;
      expectedUpdatedAt: string;
      requestKey: string;
    };

export interface TakeoffVariationPublishResult {
  variationId: string;
  variationLineId: string;
  variationNumber: string;
  commercialItemId: string;
  targetMode: "new" | "existing";
  status: "Draft" | "Priced";
  reusedCommercialItem: boolean;
}

type RpcRow = {
  variation_id: string;
  variation_line_id: string;
  variation_number: string;
  commercial_item_id: string;
  target_mode: string;
  status: string;
  reused_commercial_item: boolean;
};

export async function publishTakeoffCommercialVariation(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
  projectId: string;
  dataProjectId: string;
  measurementId: string;
  description: string;
  rate: number;
  target: TakeoffVariationPublishTarget;
}): Promise<TakeoffVariationPublishResult> {
  const response = await params.client.rpc("publish_takeoff_commercial_variation_v1" as never, {
    p_input: {
      organizationId: params.organizationId,
      opportunityId: params.opportunityId,
      projectId: params.projectId,
      dataProjectId: params.dataProjectId,
      measurementId: params.measurementId,
      description: params.description,
      rate: params.rate,
      targetMode: params.target.mode,
      section: params.target.section,
      variationTitle: params.target.mode === "new" ? params.target.variationTitle : null,
      variationId: params.target.mode === "existing" ? params.target.variationId : null,
      expectedUpdatedAt: params.target.mode === "existing" ? params.target.expectedUpdatedAt : null,
      requestKey: params.target.requestKey,
    },
  } as never);
  if (response.error) throw new Error(response.error.message);
  const row = (Array.isArray(response.data) ? response.data[0] : null) as RpcRow | null;
  if (!row?.variation_id || !row.variation_line_id || !row.commercial_item_id) {
    throw new Error("Variation publication completed without a result.");
  }
  return {
    variationId: row.variation_id,
    variationLineId: row.variation_line_id,
    variationNumber: row.variation_number,
    commercialItemId: row.commercial_item_id,
    targetMode: row.target_mode === "new" ? "new" : "existing",
    status: row.status === "Priced" ? "Priced" : "Draft",
    reusedCommercialItem: Boolean(row.reused_commercial_item),
  };
}
