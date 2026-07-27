import {
  linkCommercialItemToVariationLine,
  listCommercialItemDocumentLinksForVariation,
  listCommercialItemsByIds,
} from "@/lib/commercial-items/service";
import type {
  CommercialItemDocumentLinkPayload,
  CommercialItemPayload,
  CommercialItemsClient,
} from "@/lib/commercial-items/types";
import type { Json } from "@/lib/supabase/types";

export interface VariationCommercialItemLink {
  commercialItemId: string;
  commercialItemDescription: string;
  sourceStatus: CommercialItemPayload["sourceStatus"];
  sourceRange: string;
  sourceWorkbookId: string;
  sourceWorksheetId: string;
  sourceSheetId: string;
  sourceWorksheetName: string | null;
  sourceSheetName: string | null;
  sourceOwnerType: "opportunity" | "variation" | null;
  sourceOpportunitySlug: string | null;
  sourceProjectSlug: string | null;
  sourceVariationId: string | null;
  snapshotAtLinkJson: Json;
}

export interface VariationLineCommercialItemShape {
  id: string;
  commercialItemLink?: VariationCommercialItemLink | null;
}

export interface PersistCommercialItemVariationLinksSafelyResult {
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

export function buildVariationCommercialItemLink(item: CommercialItemPayload): VariationCommercialItemLink {
  const sourceLink = asRecord(item.sourceLinkJson);

  return {
    commercialItemId: item.id,
    commercialItemDescription: item.description,
    sourceStatus: item.sourceStatus,
    sourceRange: item.sourceRange,
    sourceWorkbookId: item.sourceWorkbookId,
    sourceWorksheetId: item.sourceWorksheetId,
    sourceSheetId: item.sourceSheetId,
    sourceWorksheetName: asString(sourceLink?.worksheetName),
    sourceSheetName: asString(sourceLink?.sheetName),
    sourceOwnerType:
      sourceLink?.ownerType === "opportunity" || sourceLink?.ownerType === "variation"
        ? sourceLink.ownerType
        : null,
    sourceOpportunitySlug: asString(sourceLink?.opportunitySlug),
    sourceProjectSlug: asString(sourceLink?.projectSlug),
    sourceVariationId: asString(sourceLink?.variationId),
    snapshotAtLinkJson: toLinkSnapshot(item),
  };
}

export function buildVariationCommercialItemSourceHref(
  lineItem: Pick<VariationLineCommercialItemShape, "commercialItemLink">,
): string | null {
  const link = lineItem.commercialItemLink;
  if (!link) {
    return null;
  }

  const query = `?sheetId=${encodeURIComponent(link.sourceSheetId)}`;

  if (link.sourceOwnerType === "variation" && link.sourceProjectSlug && link.sourceVariationId) {
    return `/app/projects/${link.sourceProjectSlug}/preconstruction/variations/${link.sourceVariationId}/pricing-worksheet/${link.sourceWorksheetId}${query}`;
  }

  if (link.sourceOpportunitySlug) {
    return `/app/leads-clients/opportunities/${link.sourceOpportunitySlug}/pricing-worksheet/${link.sourceWorksheetId}${query}`;
  }

  return null;
}

export async function persistCommercialItemVariationLinks(params: {
  client: CommercialItemsClient;
  organizationId: string;
  variationId: string;
  lineItems: VariationLineCommercialItemShape[];
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

    createdLinks.push(await linkCommercialItemToVariationLine(params.client, {
      organizationId: params.organizationId,
      commercialItemId: link.commercialItemId,
      variationId: params.variationId,
      variationLineId: item.id,
      snapshotAtLinkJson: link.snapshotAtLinkJson,
    }));
  }

  return createdLinks;
}

export async function persistCommercialItemVariationLinksSafely(params: {
  client: CommercialItemsClient;
  organizationId: string;
  variationId: string;
  lineItems: VariationLineCommercialItemShape[];
}): Promise<PersistCommercialItemVariationLinksSafelyResult> {
  try {
    const links = await persistCommercialItemVariationLinks(params);

    return {
      ok: true,
      links,
      errorMessage: null,
    };
  } catch (error) {
    return {
      ok: false,
      links: [],
      errorMessage: error instanceof Error ? error.message : "Commercial item variation linking failed.",
    };
  }
}

export async function enrichVariationLineItemsWithCommercialItems<T extends VariationLineCommercialItemShape>(params: {
  client: CommercialItemsClient;
  organizationId: string;
  variationId: string;
  lineItems: T[];
  onWarning?: (error: Error) => void;
}): Promise<T[]> {
  if (params.lineItems.length === 0) {
    return params.lineItems;
  }

  try {
    const links = await listCommercialItemDocumentLinksForVariation(params.client, {
      organizationId: params.organizationId,
      variationId: params.variationId,
    });
    const commercialItemIds = Array.from(new Set(links.map((link) => link.commercialItemId)));
    const linkedItems = await listCommercialItemsByIds(params.client, {
      organizationId: params.organizationId,
      commercialItemIds,
    });
    const commercialItemsById = new Map(linkedItems.map((item) => [item.id, item]));
    const linksByLineId = new Map<string, VariationCommercialItemLink>();

    for (const link of links) {
      const commercialItem = commercialItemsById.get(link.commercialItemId);
      if (!commercialItem) {
        continue;
      }

      linksByLineId.set(link.documentLineId, {
        ...buildVariationCommercialItemLink(commercialItem),
        snapshotAtLinkJson: link.snapshotAtLinkJson ?? buildVariationCommercialItemLink(commercialItem).snapshotAtLinkJson,
      });
    }

    return params.lineItems.map((item) => ({
      ...item,
      commercialItemLink: linksByLineId.get(item.id) ?? item.commercialItemLink ?? null,
    }));
  } catch (error) {
    if (params.onWarning && error instanceof Error) {
      params.onWarning(error);
    }

    return params.lineItems;
  }
}
