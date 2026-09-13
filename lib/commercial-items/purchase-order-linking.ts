import {
  linkCommercialItemToPurchaseOrderLine,
  listCommercialItemDocumentLinksForPurchaseOrder,
  listCommercialItemsByIds,
} from "@/lib/commercial-items/service";
import type {
  CommercialItemDocumentLinkPayload,
  CommercialItemPayload,
  CommercialItemsClient,
} from "@/lib/commercial-items/types";
import type { Json } from "@/lib/supabase/types";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";

export interface PurchaseOrderCommercialItemLink {
  commercialItemId: string;
  commercialItemDescription: string;
  sourceStatus: CommercialItemPayload["sourceStatus"];
  sourceType: CommercialItemPayload["sourceType"];
  sourceRange: string | null;
  sourceWorkbookId: string | null;
  sourceWorksheetId: string | null;
  sourceSheetId: string | null;
  sourceTakeoffMeasurementId: string | null;
  sourceWorksheetName: string | null;
  sourceSheetName: string | null;
  sourceOwnerType: "opportunity" | "variation" | null;
  sourceOpportunitySlug: string | null;
  sourceProjectSlug: string | null;
  sourceVariationId: string | null;
  sourceTakeoffOwnerType: "opportunity" | "project" | null;
  sourceTakeoffOwnerSlug: string | null;
  sourceDrawingSetId: string | null;
  sourcePageId: string | null;
  snapshotAtLinkJson: Json;
}

export interface PurchaseOrderLineCommercialItemShape {
  id: string;
  lineUid: string | null;
  sourceCostItemId: string | null;
  commercialItemLink?: PurchaseOrderCommercialItemLink | null;
}

export interface PersistCommercialItemPurchaseOrderLinksSafelyResult {
  ok: boolean;
  links: CommercialItemDocumentLinkPayload[];
  errorMessage: string | null;
}

function asRecord(value: Json | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildSafeSourceLinkSnapshot(item: CommercialItemPayload): Json {
  const sourceLink = asRecord(item.sourceLinkJson);

  return {
    version: 1,
    sourceType: item.sourceType,
    measurementId: item.sourceTakeoffMeasurementId ?? null,
    ownerType: asString(sourceLink?.ownerType),
    opportunityId: asString(sourceLink?.opportunityId),
    opportunitySlug: asString(sourceLink?.opportunitySlug),
    projectId: asString(sourceLink?.projectId),
    projectSlug: asString(sourceLink?.projectSlug),
    quoteId: asString(sourceLink?.quoteId),
    variationId: asString(sourceLink?.variationId),
    worksheetId: item.sourceWorksheetId,
    workbookId: item.sourceWorkbookId,
    sheetId: item.sourceSheetId,
    worksheetName: asString(sourceLink?.worksheetName),
    sheetName: asString(sourceLink?.sheetName),
    range: item.sourceRange,
    worksheetVersion: typeof sourceLink?.worksheetVersion === "number" ? sourceLink.worksheetVersion : null,
    capturedAt: asString(sourceLink?.capturedAt),
    ownerSlug: asString(sourceLink?.ownerSlug),
    drawingSetId: asString(sourceLink?.drawingSetId),
    pageId: asString(sourceLink?.pageId),
  };
}

function toLinkSnapshot(item: CommercialItemPayload): Json {
  return {
    version: 1,
    commercialItemId: item.id,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    total: item.total,
    sourceStatus: item.sourceStatus,
    sourceRange: item.sourceRange,
    sourceWorkbookId: item.sourceWorkbookId,
    sourceWorksheetId: item.sourceWorksheetId,
    sourceSheetId: item.sourceSheetId,
    sourceLink: buildSafeSourceLinkSnapshot(item),
  };
}

export function buildPurchaseOrderCommercialItemLink(item: CommercialItemPayload): PurchaseOrderCommercialItemLink {
  const sourceLink = asRecord(item.sourceLinkJson);
  if (item.sourceType === "worksheet_selection" && (!item.sourceRange || !item.sourceWorkbookId || !item.sourceWorksheetId || !item.sourceSheetId)) {
    throw new Error("Purchase Order commercial links require worksheet source provenance.");
  }
  const takeoffOwnerType = sourceLink?.ownerType === "opportunity" || sourceLink?.ownerType === "project"
    ? sourceLink.ownerType
    : null;
  if (item.sourceType === "takeoff_measurement" && (
    !item.sourceTakeoffMeasurementId
    || !takeoffOwnerType
    || !asString(sourceLink?.ownerSlug)
    || !asString(sourceLink?.drawingSetId)
    || !asString(sourceLink?.pageId)
  )) {
    throw new Error("Purchase Order Takeoff links require measurement, owner, drawing, and page provenance.");
  }

  return {
    commercialItemId: item.id,
    commercialItemDescription: item.description,
    sourceStatus: item.sourceStatus,
    sourceType: item.sourceType,
    sourceRange: item.sourceRange,
    sourceWorkbookId: item.sourceWorkbookId,
    sourceWorksheetId: item.sourceWorksheetId,
    sourceSheetId: item.sourceSheetId,
    sourceTakeoffMeasurementId: item.sourceTakeoffMeasurementId ?? null,
    sourceWorksheetName: asString(sourceLink?.worksheetName),
    sourceSheetName: asString(sourceLink?.sheetName),
    sourceOwnerType:
      sourceLink?.ownerType === "opportunity" || sourceLink?.ownerType === "variation"
        ? sourceLink.ownerType
        : null,
    sourceOpportunitySlug: asString(sourceLink?.opportunitySlug),
    sourceProjectSlug: asString(sourceLink?.projectSlug),
    sourceVariationId: asString(sourceLink?.variationId),
    sourceTakeoffOwnerType: takeoffOwnerType,
    sourceTakeoffOwnerSlug: asString(sourceLink?.ownerSlug),
    sourceDrawingSetId: asString(sourceLink?.drawingSetId),
    sourcePageId: asString(sourceLink?.pageId),
    snapshotAtLinkJson: toLinkSnapshot(item),
  };
}

export function buildPurchaseOrderCommercialItemSourceHref(
  lineItem: Pick<PurchaseOrderLineCommercialItemShape, "commercialItemLink">,
): string | null {
  const link = lineItem.commercialItemLink;
  if (!link) {
    return null;
  }

  if (
    link.sourceType === "takeoff_measurement"
    && link.sourceTakeoffOwnerType
    && link.sourceTakeoffOwnerSlug
    && link.sourceDrawingSetId
    && link.sourcePageId
  ) {
    return buildTakeoffHref(
      { kind: link.sourceTakeoffOwnerType, slug: link.sourceTakeoffOwnerSlug },
      "measure",
      { drawingSetId: link.sourceDrawingSetId, pageId: link.sourcePageId },
    );
  }

  if (!link.sourceSheetId || !link.sourceWorksheetId) return null;

  const query = `?sheetId=${encodeURIComponent(link.sourceSheetId)}`;

  if (link.sourceOwnerType === "variation" && link.sourceProjectSlug && link.sourceVariationId) {
    return `/app/projects/${link.sourceProjectSlug}/preconstruction/variations/${link.sourceVariationId}/pricing-worksheet/${link.sourceWorksheetId}${query}`;
  }

  if (link.sourceOpportunitySlug) {
    return `/app/leads-clients/opportunities/${link.sourceOpportunitySlug}/pricing-worksheet/${link.sourceWorksheetId}${query}`;
  }

  return null;
}

export async function persistCommercialItemPurchaseOrderLinks(params: {
  client: CommercialItemsClient;
  organizationId: string;
  purchaseOrderId: string;
  lineItems: PurchaseOrderLineCommercialItemShape[];
}): Promise<CommercialItemDocumentLinkPayload[]> {
  const linkedLineItems = params.lineItems.filter((item) => item.commercialItemLink?.commercialItemId);
  if (linkedLineItems.length === 0) {
    return [];
  }

  const createdLinks: CommercialItemDocumentLinkPayload[] = [];

  for (const item of linkedLineItems) {
    const link = item.commercialItemLink;
    if (!link) {
      continue;
    }

    if (item.sourceCostItemId) {
      throw new Error("Purchase order commercial source links cannot be attached to lines that already use cost item source lineage.");
    }

    createdLinks.push(await linkCommercialItemToPurchaseOrderLine(params.client, {
      organizationId: params.organizationId,
      commercialItemId: link.commercialItemId,
      purchaseOrderId: params.purchaseOrderId,
      purchaseOrderLineId: item.id,
      snapshotAtLinkJson: link.snapshotAtLinkJson,
    }));
  }

  return createdLinks;
}

export async function persistCommercialItemPurchaseOrderLinksSafely(params: {
  client: CommercialItemsClient;
  organizationId: string;
  purchaseOrderId: string;
  lineItems: PurchaseOrderLineCommercialItemShape[];
}): Promise<PersistCommercialItemPurchaseOrderLinksSafelyResult> {
  try {
    const links = await persistCommercialItemPurchaseOrderLinks(params);

    return {
      ok: true,
      links,
      errorMessage: null,
    };
  } catch (error) {
    return {
      ok: false,
      links: [],
      errorMessage: error instanceof Error ? error.message : "Commercial item purchase order linking failed.",
    };
  }
}

export async function enrichPurchaseOrderLineItemsWithCommercialItems<T extends PurchaseOrderLineCommercialItemShape>(params: {
  client: CommercialItemsClient;
  organizationId: string;
  purchaseOrderId: string;
  lineItems: T[];
  onWarning?: (error: Error) => void;
}): Promise<T[]> {
  if (params.lineItems.length === 0) {
    return params.lineItems;
  }

  try {
    const links = await listCommercialItemDocumentLinksForPurchaseOrder(params.client, {
      organizationId: params.organizationId,
      purchaseOrderId: params.purchaseOrderId,
    });
    const commercialItemIds = Array.from(new Set(links.map((link) => link.commercialItemId)));
    const linkedItems = await listCommercialItemsByIds(params.client, {
      organizationId: params.organizationId,
      commercialItemIds,
    });
    const commercialItemsById = new Map(linkedItems.map((item) => [item.id, item]));
    const linksByLineId = new Map<string, PurchaseOrderCommercialItemLink>();

    for (const link of links) {
      const commercialItem = commercialItemsById.get(link.commercialItemId);
      if (!commercialItem) {
        continue;
      }

      linksByLineId.set(link.documentLineId, {
        ...buildPurchaseOrderCommercialItemLink(commercialItem),
        snapshotAtLinkJson: link.snapshotAtLinkJson ?? buildPurchaseOrderCommercialItemLink(commercialItem).snapshotAtLinkJson,
      });
    }

    return params.lineItems.map((item) => ({
      ...item,
      commercialItemLink: linksByLineId.get(item.id) ?? item.commercialItemLink ?? null,
    }));
  } catch (error) {
    if (params.onWarning) {
      params.onWarning(error instanceof Error ? error : new Error("Commercial item enrichment failed."));
    }

    return params.lineItems;
  }
}
