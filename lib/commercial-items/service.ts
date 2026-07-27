import { normalizeCommercialItemDocumentLinkRow, normalizeCommercialItemRow, normalizeCommercialItemRowList } from "@/lib/commercial-items/normalization";
import type {
  CommercialItemDocumentLinkPayload,
  CommercialItemDocumentLinkRow,
  CommercialItemPayload,
  CommercialItemRow,
  CommercialItemsClient,
  CreateCommercialItemInput,
  GetCommercialItemInput,
  LinkCommercialItemToPurchaseOrderLineInput,
  LinkCommercialItemToQuoteLineInput,
  LinkCommercialItemToVariationLineInput,
  ListCommercialItemDocumentLinksForVariationInput,
  ListCommercialItemDocumentLinksForPurchaseOrderInput,
  ListCommercialItemDocumentLinksForQuoteInput,
  ListCommercialItemsByIdsInput,
  ListCommercialItemsForOpportunityInput,
  RepairProjectQuoteSourceOpportunityLineageInput,
  RepairProjectQuoteSourceOpportunityLineagePayload,
} from "@/lib/commercial-items/types";
import type { Json } from "@/lib/supabase/types";

async function unwrapRpcRow<T>(
  request: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data[0] ?? null) : null;
}

async function unwrapRpcRows<T>(
  request: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data : [];
}

function toRpcJson(value: Json | undefined): Json {
  return value ?? {};
}

export async function createCommercialItem(
  client: CommercialItemsClient,
  input: CreateCommercialItemInput,
): Promise<CommercialItemPayload> {
  const row = await unwrapRpcRow<CommercialItemRow>(
    client.rpc("create_commercial_item" as never, {
      p_input: {
        organizationId: input.organizationId,
        opportunityId: input.opportunityId,
        projectId: input.projectId ?? null,
        sourceType: input.sourceType ?? "worksheet_selection",
        sourceWorkbookId: input.sourceWorkbookId,
        sourceWorksheetId: input.sourceWorksheetId ?? input.sourceWorkbookId,
        sourceSheetId: input.sourceSheetId,
        sourceRange: input.sourceRange,
        sourceSignature: input.sourceSignature,
        sourceVersion: input.sourceVersion ?? 1,
        sourceStatus: input.sourceStatus ?? "current",
        staleReasonCode: input.staleReasonCode ?? null,
        lastSourceCheckedAt: input.lastSourceCheckedAt ?? null,
        lastSourceChangedAt: input.lastSourceChangedAt ?? null,
        description: input.description,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        rate: input.rate ?? null,
        total: input.total ?? null,
        snapshotJson: toRpcJson(input.snapshotJson),
        sourceLinkJson: toRpcJson(input.sourceLinkJson),
        lockedMetadataJson: toRpcJson(input.lockedMetadataJson),
        uclClassification: input.uclClassification ?? null,
        uclValidationStatus: input.uclValidationStatus ?? "not_reviewed",
      },
    } as never),
  );

  if (!row) {
    throw new Error("Commercial item was not created.");
  }

  return normalizeCommercialItemRow(row);
}

export async function getCommercialItem(
  client: CommercialItemsClient,
  input: GetCommercialItemInput,
): Promise<CommercialItemPayload | null> {
  const row = await unwrapRpcRow<CommercialItemRow>(
    client.rpc("get_commercial_item" as never, {
      p_commercial_item_id: input.commercialItemId,
    } as never),
  );

  return row ? normalizeCommercialItemRow(row) : null;
}

export async function listCommercialItemsForOpportunity(
  client: CommercialItemsClient,
  input: ListCommercialItemsForOpportunityInput,
): Promise<CommercialItemPayload[]> {
  const rows = await unwrapRpcRows<CommercialItemRow>(
    client.rpc("list_commercial_items_for_opportunity" as never, {
      p_organization_id: input.organizationId,
      p_opportunity_id: input.opportunityId,
    } as never),
  );

  return normalizeCommercialItemRowList(rows);
}

export async function listCommercialItemsByIds(
  client: CommercialItemsClient,
  input: ListCommercialItemsByIdsInput,
): Promise<CommercialItemPayload[]> {
  if (input.commercialItemIds.length === 0) {
    return [];
  }

  const queryClient: Pick<CommercialItemsClient, "from"> = client;

  const { data, error } = await queryClient
    .from("commercial_items")
    .select(`
      id,
      organization_id,
      opportunity_id,
      project_id,
      source_type,
      source_workbook_id,
      source_worksheet_id,
      source_sheet_id,
      source_range,
      source_signature,
      source_version,
      source_status,
      stale_reason_code,
      last_source_checked_at,
      last_source_changed_at,
      description,
      quantity,
      unit,
      rate,
      total,
      snapshot_json,
      source_link_json,
      ucl_classification,
      ucl_validation_status,
      created_by,
      updated_by,
      created_at,
      updated_at
    `)
    .eq("organization_id", input.organizationId)
    .in("id", input.commercialItemIds);

  if (error) {
    throw new Error(error.message);
  }

  return normalizeCommercialItemRowList((data ?? []) as CommercialItemRow[]);
}

export async function listCommercialItemDocumentLinksForQuote(
  client: CommercialItemsClient,
  input: ListCommercialItemDocumentLinksForQuoteInput,
): Promise<CommercialItemDocumentLinkPayload[]> {
  const queryClient: Pick<CommercialItemsClient, "from"> = client;

  const { data, error } = await queryClient
    .from("commercial_item_document_links")
    .select(`
      id,
      organization_id,
      commercial_item_id,
      document_kind,
      document_id,
      document_line_id,
      link_role,
      snapshot_at_link_json,
      created_by,
      created_at
    `)
    .eq("organization_id", input.organizationId)
    .eq("document_kind", "quote_line")
    .eq("document_id", input.quoteId)
    .eq("link_role", "source");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: unknown) => normalizeCommercialItemDocumentLinkRow(row as CommercialItemDocumentLinkRow));
}

export async function listCommercialItemDocumentLinksForPurchaseOrder(
  client: CommercialItemsClient,
  input: ListCommercialItemDocumentLinksForPurchaseOrderInput,
): Promise<CommercialItemDocumentLinkPayload[]> {
  const queryClient: Pick<CommercialItemsClient, "from"> = client;

  const { data, error } = await queryClient
    .from("commercial_item_document_links")
    .select(`
      id,
      organization_id,
      commercial_item_id,
      document_kind,
      document_id,
      document_line_id,
      link_role,
      snapshot_at_link_json,
      created_by,
      created_at
    `)
    .eq("organization_id", input.organizationId)
    .eq("document_kind", "purchase_order_line")
    .eq("document_id", input.purchaseOrderId)
    .eq("link_role", "source");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: unknown) => normalizeCommercialItemDocumentLinkRow(row as CommercialItemDocumentLinkRow));
}

export async function listCommercialItemDocumentLinksForVariation(
  client: CommercialItemsClient,
  input: ListCommercialItemDocumentLinksForVariationInput,
): Promise<CommercialItemDocumentLinkPayload[]> {
  const queryClient: Pick<CommercialItemsClient, "from"> = client;

  const { data, error } = await queryClient
    .from("commercial_item_document_links")
    .select(`
      id,
      organization_id,
      commercial_item_id,
      document_kind,
      document_id,
      document_line_id,
      link_role,
      snapshot_at_link_json,
      created_by,
      created_at
    `)
    .eq("organization_id", input.organizationId)
    .eq("document_kind", "variation_line")
    .eq("document_id", input.variationId)
    .eq("link_role", "source");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: unknown) => normalizeCommercialItemDocumentLinkRow(row as CommercialItemDocumentLinkRow));
}

export async function linkCommercialItemToQuoteLine(
  client: CommercialItemsClient,
  input: LinkCommercialItemToQuoteLineInput,
): Promise<CommercialItemDocumentLinkPayload> {
  const row = await unwrapRpcRow<CommercialItemDocumentLinkRow>(
    client.rpc("link_commercial_item_to_quote_line" as never, {
      p_input: {
        organizationId: input.organizationId,
        commercialItemId: input.commercialItemId,
        quoteId: input.quoteId,
        quoteLineId: input.quoteLineId,
        linkRole: input.linkRole ?? "source",
        snapshotAtLinkJson: toRpcJson(input.snapshotAtLinkJson),
      },
    } as never),
  );

  if (!row) {
    throw new Error("Commercial item quote link was not created.");
  }

  return normalizeCommercialItemDocumentLinkRow(row);
}

export async function repairProjectQuoteSourceOpportunityLineage(
  client: CommercialItemsClient,
  input: RepairProjectQuoteSourceOpportunityLineageInput,
): Promise<RepairProjectQuoteSourceOpportunityLineagePayload> {
  const row = await unwrapRpcRow<{
    id: string;
    source_opportunity_id: string | null;
  }>(
    client.rpc("repair_project_quote_source_opportunity_lineage" as never, {
      p_organization_id: input.organizationId,
      p_quote_id: input.quoteId,
    } as never),
  );

  if (!row) {
    throw new Error("Quote source opportunity lineage could not be repaired.");
  }

  return {
    id: row.id,
    sourceOpportunityId: row.source_opportunity_id,
  };
}

export async function linkCommercialItemToPurchaseOrderLine(
  client: CommercialItemsClient,
  input: LinkCommercialItemToPurchaseOrderLineInput,
): Promise<CommercialItemDocumentLinkPayload> {
  const row = await unwrapRpcRow<CommercialItemDocumentLinkRow>(
    client.rpc("link_commercial_item_to_purchase_order_line" as never, {
      p_input: {
        organizationId: input.organizationId,
        commercialItemId: input.commercialItemId,
        purchaseOrderId: input.purchaseOrderId,
        purchaseOrderLineId: input.purchaseOrderLineId,
        linkRole: input.linkRole ?? "source",
        snapshotAtLinkJson: toRpcJson(input.snapshotAtLinkJson),
      },
    } as never),
  );

  if (!row) {
    throw new Error("Commercial item purchase order link was not created.");
  }

  return normalizeCommercialItemDocumentLinkRow(row);
}

export async function linkCommercialItemToVariationLine(
  client: CommercialItemsClient,
  input: LinkCommercialItemToVariationLineInput,
): Promise<CommercialItemDocumentLinkPayload> {
  const row = await unwrapRpcRow<CommercialItemDocumentLinkRow>(
    client.rpc("link_commercial_item_to_variation_line" as never, {
      p_input: {
        organizationId: input.organizationId,
        commercialItemId: input.commercialItemId,
        variationId: input.variationId,
        variationLineId: input.variationLineId,
        linkRole: input.linkRole ?? "source",
        snapshotAtLinkJson: toRpcJson(input.snapshotAtLinkJson),
      },
    } as never),
  );

  if (!row) {
    throw new Error("Commercial item variation link was not created.");
  }

  return normalizeCommercialItemDocumentLinkRow(row);
}
