import {
  linkCommercialItemToQuoteLine,
  listCommercialItemDocumentLinksForQuote,
  listCommercialItemsByIds,
  repairProjectQuoteSourceOpportunityLineage,
} from "@/lib/commercial-items/service";
import type { CommercialItemDocumentLinkPayload, CommercialItemPayload, CommercialItemsClient } from "@/lib/commercial-items/types";
import type { Json } from "@/lib/supabase/types";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";

export interface QuoteCommercialItemLink {
  commercialItemId: string;
  commercialItemDescription: string;
  sourceStatus: CommercialItemPayload["sourceStatus"];
  sourceRange: string | null;
  sourceWorkbookId: string | null;
  sourceWorksheetId: string | null;
  sourceSheetId: string | null;
  sourceWorksheetName: string | null;
  sourceSheetName: string | null;
  snapshotAtLinkJson: Json;
}

export interface QuoteCommercialItemPickerItem {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  sourceStatus: CommercialItemPayload["sourceStatus"];
  sourceRange: string | null;
  sourceWorkbookId: string | null;
  sourceWorksheetId: string | null;
  sourceSheetId: string | null;
  sourceWorksheetName: string | null;
  sourceSheetName: string | null;
  updatedAt: string;
}

export interface QuoteLineCommercialItemShape {
  id: string;
  section: "Item" | "Materials" | "Labour" | "Plant" | "Subcontractors" | "Preliminaries";
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  isOptional: boolean;
  commercialItemLink?: QuoteCommercialItemLink | null;
}

export interface PersistCommercialItemQuoteLinksSafelyResult {
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
    measurementId: item.sourceTakeoffMeasurementId,
    worksheetId: item.sourceWorksheetId,
    workbookId: item.sourceWorkbookId,
    sheetId: item.sourceSheetId,
    worksheetName: asString(sourceLink?.worksheetName),
    sheetName: asString(sourceLink?.sheetName),
    range: item.sourceRange,
    ownerType: asString(sourceLink?.ownerType),
    opportunityId: asString(sourceLink?.opportunityId),
    opportunitySlug: asString(sourceLink?.opportunitySlug),
    projectId: asString(sourceLink?.projectId),
    projectSlug: asString(sourceLink?.projectSlug),
    quoteId: asString(sourceLink?.quoteId),
    variationId: asString(sourceLink?.variationId),
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

export function buildQuoteCommercialItemLink(item: CommercialItemPayload): QuoteCommercialItemLink {
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
    snapshotAtLinkJson: toLinkSnapshot(item),
  };
}

export function buildQuoteCommercialItemPickerItem(item: CommercialItemPayload): QuoteCommercialItemPickerItem {
  const link = buildQuoteCommercialItemLink(item);

  return {
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    total: item.total,
    sourceStatus: item.sourceStatus,
    sourceRange: item.sourceRange,
    sourceWorkbookId: link.sourceWorkbookId,
    sourceWorksheetId: link.sourceWorksheetId,
    sourceSheetId: link.sourceSheetId,
    sourceWorksheetName: link.sourceWorksheetName,
    sourceSheetName: link.sourceSheetName,
    updatedAt: item.updatedAt,
  };
}

export function buildQuoteLineDraftFromCommercialItem(item: CommercialItemPayload): QuoteLineCommercialItemShape {
  const quantity = item.quantity ?? 1;
  const rate = item.rate ?? (item.total !== null && quantity !== 0 ? item.total / quantity : 0);

  return {
    id: crypto.randomUUID(),
    section: "Item",
    description: item.description,
    quantity,
    unit: item.unit ?? "Item",
    rate,
    isOptional: false,
    commercialItemLink: buildQuoteCommercialItemLink(item),
  };
}

export function attachCommercialItemLinksToQuoteLines<T extends QuoteLineCommercialItemShape>(
  lineItems: T[],
  links: CommercialItemDocumentLinkPayload[],
  items: CommercialItemPayload[],
): T[] {
  const commercialItemsById = new Map(items.map((item) => [item.id, item]));
  const linksByLineId = new Map<string, QuoteCommercialItemLink>();

  for (const link of links) {
    const commercialItem = commercialItemsById.get(link.commercialItemId);
    if (!commercialItem) {
      continue;
    }

    linksByLineId.set(link.documentLineId, {
      ...buildQuoteCommercialItemLink(commercialItem),
      snapshotAtLinkJson: link.snapshotAtLinkJson ?? buildQuoteCommercialItemLink(commercialItem).snapshotAtLinkJson,
    });
  }

  return lineItems.map((item) => ({
    ...item,
    commercialItemLink: linksByLineId.get(item.id) ?? item.commercialItemLink ?? null,
  }));
}

export function buildCommercialItemSourceHref(
  lineItem: Pick<QuoteLineCommercialItemShape, "commercialItemLink">,
  opportunitySlug: string | null | undefined,
): string | null {
  const link = lineItem.commercialItemLink;
  if (!link || !opportunitySlug) {
    if (!link) {
      return null;
    }
  }

  const sourceLinkRecord =
    link.snapshotAtLinkJson && typeof link.snapshotAtLinkJson === "object" && !Array.isArray(link.snapshotAtLinkJson)
      ? (link.snapshotAtLinkJson as Record<string, unknown>)
      : null;
  const sourceLink =
    sourceLinkRecord?.sourceLink && typeof sourceLinkRecord.sourceLink === "object" && !Array.isArray(sourceLinkRecord.sourceLink)
      ? (sourceLinkRecord.sourceLink as Record<string, unknown>)
      : null;
  const ownerType = typeof sourceLink?.ownerType === "string" ? sourceLink.ownerType : null;
  const projectSlug = typeof sourceLink?.projectSlug === "string" ? sourceLink.projectSlug : null;
  const variationId = typeof sourceLink?.variationId === "string" ? sourceLink.variationId : null;
  const quoteId = typeof sourceLink?.quoteId === "string" ? sourceLink.quoteId : null;
  const linkedOpportunitySlug = typeof sourceLink?.opportunitySlug === "string" ? sourceLink.opportunitySlug : null;
  const sourceType = typeof sourceLink?.sourceType === "string" ? sourceLink.sourceType : null;
  const ownerSlug = typeof sourceLink?.ownerSlug === "string" ? sourceLink.ownerSlug : null;
  const drawingSetId = typeof sourceLink?.drawingSetId === "string" ? sourceLink.drawingSetId : null;
  const pageId = typeof sourceLink?.pageId === "string" ? sourceLink.pageId : null;

  if (sourceType === "takeoff_measurement" && (ownerType === "project" || ownerType === "opportunity") && ownerSlug && drawingSetId && pageId) {
    return buildTakeoffHref({ kind: ownerType, slug: ownerSlug }, "measure", { drawingSetId, pageId });
  }

  if (!link.sourceWorksheetId || !link.sourceSheetId) return null;

  if (ownerType === "variation" && projectSlug && variationId) {
    return `/app/projects/${projectSlug}/preconstruction/variations/${variationId}/pricing-worksheet/${link.sourceWorksheetId}?sheetId=${encodeURIComponent(link.sourceSheetId)}`;
  }

  if (ownerType === "quote" && projectSlug && quoteId) {
    return `/app/projects/${projectSlug}/preconstruction/quote/${quoteId}/pricing-worksheet/${link.sourceWorksheetId}?sheetId=${encodeURIComponent(link.sourceSheetId)}`;
  }

  const resolvedOpportunitySlug = opportunitySlug ?? linkedOpportunitySlug;
  if (!resolvedOpportunitySlug) {
    return null;
  }

  return `/app/leads-clients/opportunities/${resolvedOpportunitySlug}/pricing-worksheet/${link.sourceWorksheetId}?sheetId=${encodeURIComponent(link.sourceSheetId)}`;
}

export async function persistCommercialItemQuoteLinks(params: {
  client: CommercialItemsClient;
  organizationId: string;
  quoteId: string;
  quoteSourceOpportunityId: string | null;
  lineItems: QuoteLineCommercialItemShape[];
}): Promise<CommercialItemDocumentLinkPayload[]> {
  const linkedLineItems = params.lineItems.filter((item) => item.commercialItemLink?.commercialItemId);
  if (linkedLineItems.length === 0) {
    return [];
  }

  if (!params.quoteSourceOpportunityId) {
    throw new Error("This quote is not linked to an opportunity workspace, so Commercial Items cannot be attached yet.");
  }

  const repairedQuote = await repairProjectQuoteSourceOpportunityLineage(params.client, {
    organizationId: params.organizationId,
    quoteId: params.quoteId,
  });

  if (repairedQuote.sourceOpportunityId !== params.quoteSourceOpportunityId) {
    throw new Error("This quote belongs to a different opportunity.");
  }

  const createdLinks: CommercialItemDocumentLinkPayload[] = [];

  for (const item of linkedLineItems) {
    const link = item.commercialItemLink;
    if (!link) {
      continue;
    }

    createdLinks.push(await linkCommercialItemToQuoteLine(params.client, {
      organizationId: params.organizationId,
      commercialItemId: link.commercialItemId,
      quoteId: params.quoteId,
      quoteLineId: item.id,
      snapshotAtLinkJson: link.snapshotAtLinkJson,
    }));
  }

  return createdLinks;
}

export async function persistCommercialItemQuoteLinksSafely(params: {
  client: CommercialItemsClient;
  organizationId: string;
  quoteId: string;
  quoteSourceOpportunityId: string | null;
  lineItems: QuoteLineCommercialItemShape[];
}): Promise<PersistCommercialItemQuoteLinksSafelyResult> {
  try {
    const links = await persistCommercialItemQuoteLinks(params);

    return {
      ok: true,
      links,
      errorMessage: null,
    };
  } catch (error) {
    return {
      ok: false,
      links: [],
      errorMessage: error instanceof Error ? error.message : "Commercial Item linking failed.",
    };
  }
}

export async function enrichQuoteLineItemsWithCommercialItems<T extends QuoteLineCommercialItemShape>(params: {
  client: CommercialItemsClient;
  organizationId: string;
  quoteId: string;
  lineItems: T[];
  onWarning?: (error: Error) => void;
}): Promise<T[]> {
  if (params.lineItems.length === 0) {
    return params.lineItems;
  }

  try {
    const links = await listCommercialItemDocumentLinksForQuote(params.client, {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
    });
    const commercialItemIds = Array.from(new Set(links.map((link) => link.commercialItemId)));
    const linkedItems = await listCommercialItemsByIds(params.client, {
      organizationId: params.organizationId,
      commercialItemIds,
    });

    return attachCommercialItemLinksToQuoteLines(params.lineItems, links, linkedItems);
  } catch (error) {
    if (params.onWarning) {
      params.onWarning(error instanceof Error ? error : new Error("Commercial Item enrichment failed."));
    }

    return params.lineItems;
  }
}
