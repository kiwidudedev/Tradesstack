"use server";

import { resolvePurchaseOrderPublishOptions } from "@/lib/commercial-items/purchase-order-destination-adapter";
import { normalizeCommercialRate } from "@/lib/commercial-items/precision";
import {
  publishTakeoffCommercialPurchaseOrder,
  type TakeoffPurchaseOrderPublishTarget,
} from "@/lib/commercial-items/takeoff-purchase-order-destination";
import { PURCHASE_ORDER_SOURCE_SECTIONS } from "@/lib/purchase-orders/types";
import {
  resolveTakeoffCommercialMeasurementAuthority,
  resolveTakeoffPurchaseOrderProjectAuthority,
} from "@/lib/takeoff/commercial-authority-server";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

export type TakeoffAddToPurchaseOrderContextResult =
  | { ok: false; error: string }
  | {
      ok: true;
      measurement: {
        id: string;
        name: string;
        description: string;
        quantity: number;
        unit: string;
        kind: "line" | "area" | "count";
      };
      suppliers: Array<{ id: string; label: string }>;
      draftPurchaseOrders: Awaited<ReturnType<typeof resolvePurchaseOrderPublishOptions>>["draftPurchaseOrders"];
      initialMode: "new";
      initialPurchaseOrderTitle: string;
    };

async function resolvePurchaseOrderAuthority(owner: TakeoffRouteOwner, measurementId: string) {
  const sourceAuthority = await resolveTakeoffCommercialMeasurementAuthority({
    owner,
    measurementId,
    destinationLabel: "Purchase Order",
  });
  const project = await resolveTakeoffPurchaseOrderProjectAuthority({
    supabase: sourceAuthority.supabase,
    organizationId: sourceAuthority.context.organizationId,
    opportunityId: sourceAuthority.context.lineageOpportunityId!,
    dataProjectId: sourceAuthority.context.dataProjectId,
  });
  return { ...sourceAuthority, project };
}

export async function loadTakeoffAddToPurchaseOrderContext(input: {
  owner: TakeoffRouteOwner;
  measurementId: string;
}): Promise<TakeoffAddToPurchaseOrderContextResult> {
  try {
    const authority = await resolvePurchaseOrderAuthority(input.owner, input.measurementId);
    const options = await resolvePurchaseOrderPublishOptions({
      client: authority.supabase,
      organizationId: authority.context.organizationId,
      projectId: authority.project.id,
    });
    return {
      ok: true,
      measurement: authority.commercialMeasurement,
      suppliers: options.suppliers.map(({ id, label }) => ({ id, label })),
      draftPurchaseOrders: options.draftPurchaseOrders,
      initialMode: "new",
      initialPurchaseOrderTitle: "New Purchase Order",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to load Purchase Order destinations." };
  }
}

export async function publishTakeoffMeasurementToPurchaseOrder(input: {
  owner: TakeoffRouteOwner;
  measurementId: string;
  description: string;
  rate: number;
  target: TakeoffPurchaseOrderPublishTarget;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const authority = await resolvePurchaseOrderAuthority(input.owner, input.measurementId);
    const description = input.description.trim();
    if (!description) throw new Error("Description is required.");
    const rate = normalizeCommercialRate(Number(input.rate));
    if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be a non-negative number.");
    if (!input.target.supplierId) throw new Error("Select a supplier before adding this measurement.");
    if (!PURCHASE_ORDER_SOURCE_SECTIONS.includes(input.target.section)) {
      throw new Error("Select a valid procurement section.");
    }
    if (!input.target.requestKey.trim()) throw new Error("Purchase Order publication request identity is missing.");

    const result = await publishTakeoffCommercialPurchaseOrder({
      client: authority.supabase,
      organizationId: authority.context.organizationId,
      opportunityId: authority.context.lineageOpportunityId!,
      projectId: authority.project.id,
      dataProjectId: authority.context.dataProjectId,
      measurementId: authority.measurement.id,
      description,
      rate,
      target: input.target,
    });
    return { ok: true, message: `Measurement added to ${result.purchaseOrderNumber}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add this measurement to the Purchase Order." };
  }
}
