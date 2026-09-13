import type { WorksheetPublishDestinationAdapter } from "@/lib/commercial-items/destination-adapter";
import type { PublishedWorksheetCommercialRowWithItem } from "@/lib/commercial-items/published-worksheet-selection";
import {
  buildVariationCommercialItemLink,
  persistCommercialItemVariationLinksSafely,
} from "@/lib/commercial-items/variation-linking";
import type { CommercialItemsClient } from "@/lib/commercial-items/types";
import type { VariationCostSection } from "@/lib/commercial-items/variation-sections";
import { listCommercialItemsByIds } from "@/lib/commercial-items/service";

type VariationStatus = "Draft" | "Priced" | "Sent" | "Client Review" | "Approved" | "Rejected" | "Invoiced";

const MUTABLE_VARIATION_STATUSES = new Set<VariationStatus>(["Draft", "Priced"]);
const IMMUTABLE_VARIATION_MESSAGE = "This variation can no longer be changed from the pricing worksheet.";

interface ProjectVariationRow {
  id: string;
  updated_at: string | null;
  variation_number: string;
  variation_title: string;
  status: string;
  origin: string;
  requested_by: string;
  requested_date: string | null;
  due_date: string | null;
  sent_to_client_at: string | null;
  approved_at: string | null;
  invoice_ready: boolean;
  notes: string;
  margin_percent: number | null;
  discount_amount: number | null;
  contingency_amount: number | null;
  gst_percent: number | null;
  include_margin_in_export: boolean | null;
  include_discount_in_export: boolean | null;
  include_contingency_in_export: boolean | null;
  validity_period: string | null;
  payment_terms: string | null;
  lead_time: string | null;
  terms_inclusions: string | null;
  terms_exclusions: string | null;
  clarifications: string | null;
  assumptions: string | null;
}

interface ProjectVariationLineItemRow {
  id: string;
  section: VariationCostSection;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  sort_order: number | null;
  source_project_quote_id: string | null;
  source_project_quote_line_item_id: string | null;
  source_project_quote_number: string | null;
  source_purchase_order_id: string | null;
  source_purchase_order_line_item_id: string | null;
  source_purchase_order_number: string | null;
}

interface ProjectVariationAttachmentRow {
  id: string;
  file_name: string;
  file_kind: string;
  storage_path: string | null;
  external_url: string | null;
}

interface SaveProjectVariationDraftRow {
  id: string;
  updated_at: string;
  status: string;
}

export interface VariationPublishLineSelection {
  rowId: string;
  section: VariationCostSection;
}

export interface VariationPublishTarget {
  variationId: string;
  lineSelections: VariationPublishLineSelection[];
}

export interface VariationDestinationPublishResult {
  variationId: string;
  variationNumber: string;
  addedLineCount: number;
  skippedRowCount: number;
  variationLineIds: string[];
  partialLinkFailureMessage: string | null;
  message: string;
}

export function buildVariationPublicationRequestKey(params: {
  organizationId: string;
  variationId: string;
  rows: Array<{ sourceSignature: string; section: VariationCostSection }>;
}) {
  return [
    "worksheet-variation-v1",
    params.organizationId,
    params.variationId,
    ...params.rows.map((row) => `${row.sourceSignature}:${row.section}`).sort(),
  ].join(":");
}

function rowCountLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function buildSuccessMessage(params: {
  variationNumber: string;
  addedCount: number;
  skippedCount: number;
}) {
  const added = `${rowCountLabel(params.addedCount, "row")} added to ${params.variationNumber}.`;
  if (params.skippedCount <= 0) {
    return added;
  }

  return `${added} ${rowCountLabel(params.skippedCount, "row")} skipped.`;
}

function numberOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function loadVariation(params: {
  client: CommercialItemsClient;
  organizationId: string;
  projectId: string;
  variationId: string;
}) {
  const { data, error } = await params.client
    .from("project_variations")
    .select(`
      id,
      updated_at,
      variation_number,
      variation_title,
      status,
      origin,
      requested_by,
      requested_date,
      due_date,
      sent_to_client_at,
      approved_at,
      invoice_ready,
      notes,
      margin_percent,
      discount_amount,
      contingency_amount,
      gst_percent,
      include_margin_in_export,
      include_discount_in_export,
      include_contingency_in_export,
      validity_period,
      payment_terms,
      lead_time,
      terms_inclusions,
      terms_exclusions,
      clarifications,
      assumptions
    `)
    .eq("organization_id", params.organizationId)
    .eq("project_id", params.projectId)
    .eq("id", params.variationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Variation not found.");
  }

  return data as ProjectVariationRow;
}

async function loadVariationLineItems(params: {
  client: CommercialItemsClient;
  organizationId: string;
  projectId: string;
  variationId: string;
}) {
  const { data, error } = await params.client
    .from("project_variation_line_items")
    .select(`
      id,
      section,
      description,
      quantity,
      unit,
      rate,
      total,
      sort_order,
      source_project_quote_id,
      source_project_quote_line_item_id,
      source_project_quote_number,
      source_purchase_order_id,
      source_purchase_order_line_item_id,
      source_purchase_order_number
    `)
    .eq("organization_id", params.organizationId)
    .eq("project_id", params.projectId)
    .eq("variation_id", params.variationId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProjectVariationLineItemRow[];
}

async function loadVariationAttachments(params: {
  client: CommercialItemsClient;
  organizationId: string;
  variationId: string;
}) {
  const { data, error } = await params.client
    .from("project_variation_attachments")
    .select("id, file_name, file_kind, storage_path, external_url")
    .eq("organization_id", params.organizationId)
    .eq("variation_id", params.variationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProjectVariationAttachmentRow[];
}

function buildVariationLineDraft(params: {
  row: PublishedWorksheetCommercialRowWithItem;
  section: VariationCostSection;
}) {
  return {
    id: crypto.randomUUID(),
    section: params.section,
    description: params.row.description,
    quantity: params.row.quantity,
    unit: params.row.unit,
    rate: params.row.rate,
    total: params.row.total,
    sourceProjectQuoteId: null,
    sourceProjectQuoteLineItemId: null,
    sourceProjectQuoteNumber: "",
    sourcePurchaseOrderId: null,
    sourcePurchaseOrderLineItemId: null,
    sourcePurchaseOrderNumber: "",
    commercialItemLink: buildVariationCommercialItemLink(params.row.commercialItem),
  };
}

export const variationDestinationAdapter: WorksheetPublishDestinationAdapter<
  VariationPublishTarget,
  VariationDestinationPublishResult
> = {
  destination: "variation",
  async publishSelection(input) {
    if (!input.projectId) throw new Error("Variation project context is missing.");
    if (input.target.lineSelections.length === 0) throw new Error("Select at least one eligible row before adding it to the variation.");
    const variation = await loadVariation({ client: input.client, organizationId: input.organizationId, projectId: input.projectId, variationId: input.target.variationId });
    if (!MUTABLE_VARIATION_STATUSES.has((variation.status ?? "") as VariationStatus)) throw new Error(IMMUTABLE_VARIATION_MESSAGE);
    if (!variation.updated_at) throw new Error("Variation version is missing. Please refresh and try again.");
    const lineSelectionByRowId = new Map(input.target.lineSelections.map((selection) => [selection.rowId, selection]));
    const [existingLineItems, attachments] = await Promise.all([
      loadVariationLineItems({ client: input.client, organizationId: input.organizationId, projectId: input.projectId, variationId: variation.id }),
      loadVariationAttachments({ client: input.client, organizationId: input.organizationId, variationId: variation.id }),
    ]);
    const rows = input.publishedSelection.commercialRows.map((row) => {
      const selection = lineSelectionByRowId.get(row.rowId);
      if (!selection) throw new Error("One or more selected worksheet rows could not be mapped to the variation.");
      return { row, section: selection.section, lineId: row.rowId };
    });
    const requestKey = buildVariationPublicationRequestKey({
      organizationId: input.organizationId,
      variationId: variation.id,
      rows: rows.map(({ row, section }) => ({ sourceSignature: row.sourceSignature, section })),
    });
    const rpcResponse = await input.client.rpc("publish_worksheet_commercial_variation_v1" as never, {
      p_input: {
        requestKey,
        organizationId: input.organizationId,
        opportunityId: input.opportunityId,
        projectId: input.projectId,
        variationId: variation.id,
        expectedUpdatedAt: variation.updated_at,
        workbookId: input.workbookId,
        worksheetId: input.worksheetId,
        sheetId: input.sheetId,
        worksheetVersion: input.worksheetVersion,
        skippedRowCount: input.publishedSelection.skippedRows.length,
        variation: {
          title: variation.variation_title,
          number: variation.variation_number,
          status: variation.status,
          origin: variation.origin,
          requestedBy: variation.requested_by,
          requestedDate: variation.requested_date,
          dueDate: variation.due_date,
          sentToClientAt: variation.sent_to_client_at,
          approvedAt: variation.approved_at,
          invoiceReady: variation.invoice_ready,
          notes: variation.notes,
          marginPercent: Number(numberOrZero(variation.margin_percent).toFixed(3)),
          discountAmount: Number(numberOrZero(variation.discount_amount).toFixed(2)),
          contingencyAmount: Number(numberOrZero(variation.contingency_amount).toFixed(2)),
          gstPercent: Number(numberOrZero(variation.gst_percent).toFixed(3)),
          includeMarginInExport: variation.include_margin_in_export ?? true,
          includeDiscountInExport: variation.include_discount_in_export ?? false,
          includeContingencyInExport: variation.include_contingency_in_export ?? false,
          validityPeriod: variation.validity_period ?? "",
          paymentTerms: variation.payment_terms ?? "",
          leadTime: variation.lead_time ?? "",
          termsInclusions: variation.terms_inclusions ?? "",
          termsExclusions: variation.terms_exclusions ?? "",
          clarifications: variation.clarifications ?? "",
          assumptions: variation.assumptions ?? "",
        },
        existingLineItems: existingLineItems.map((line) => ({
          id: line.id, section: line.section, description: line.description, quantity: normalizeNullableNumber(line.quantity), unit: line.unit, rate: normalizeNullableNumber(line.rate), total: normalizeNullableNumber(line.total),
          sourceProjectQuoteId: line.source_project_quote_id, sourceProjectQuoteLineItemId: line.source_project_quote_line_item_id, sourceProjectQuoteNumber: line.source_project_quote_number ?? "",
          sourcePurchaseOrderId: line.source_purchase_order_id, sourcePurchaseOrderLineItemId: line.source_purchase_order_line_item_id, sourcePurchaseOrderNumber: line.source_purchase_order_number ?? "",
        })),
        attachments: attachments.map((attachment) => ({ id: attachment.id, name: attachment.file_name, type: attachment.file_kind, storagePath: attachment.storage_path, externalUrl: attachment.external_url })),
        commercialRows: rows.map(({ row, section, lineId }) => ({
          rowId: row.rowId,
          lineId,
          section,
          sourceRange: row.sourceRangeLabel,
          sourceSignature: row.sourceSignature,
          description: row.description,
          quantity: row.quantity,
          unit: row.unit,
          rate: row.rate,
          total: row.total,
          snapshotJson: row.snapshotJson,
          sourceLinkJson: row.sourceLinkJson,
          lockedMetadataJson: row.lockedMetadataJson,
        })),
      },
    } as never);
    if (rpcResponse.error) throw new Error(rpcResponse.error.message);
    const saved = (Array.isArray(rpcResponse.data) ? rpcResponse.data[0] : null) as {
      id: string;
      updated_at: string;
      status: string;
      variation_number: string;
      added_line_count: number;
      skipped_row_count: number;
      variation_line_ids: string[];
      commercial_item_ids: string[];
    } | null;
    if (!saved?.id) throw new Error("Variation was saved but no result was returned.");
    const commercialItems = await listCommercialItemsByIds(input.client, { organizationId: input.organizationId, commercialItemIds: saved.commercial_item_ids });
    const itemsById = new Map(commercialItems.map((item) => [item.id, item]));
    const publishedRows = rows.map(({ row }, index) => {
      const item = itemsById.get(saved.commercial_item_ids[index] ?? "");
      if (!item) throw new Error("Variation was published but its commercial source could not be reloaded.");
      return { ...row, commercialItem: item, reusedCommercialItem: false };
    });
    return {
      publishedRows,
      result: {
        variationId: saved.id,
        variationNumber: saved.variation_number,
        addedLineCount: saved.added_line_count,
        skippedRowCount: saved.skipped_row_count,
        variationLineIds: saved.variation_line_ids,
        partialLinkFailureMessage: null,
        message: buildSuccessMessage({ variationNumber: saved.variation_number, addedCount: saved.added_line_count, skippedCount: saved.skipped_row_count }),
      },
    };
  },
  async publish(input) {
    if (!input.projectId) {
      throw new Error("Variation project context is missing.");
    }

    if (input.target.lineSelections.length === 0) {
      throw new Error("Select at least one eligible row before adding it to the variation.");
    }

    const variation = await loadVariation({
      client: input.client,
      organizationId: input.organizationId,
      projectId: input.projectId,
      variationId: input.target.variationId,
    });

    if (!MUTABLE_VARIATION_STATUSES.has((variation.status ?? "") as VariationStatus)) {
      throw new Error(IMMUTABLE_VARIATION_MESSAGE);
    }

    if (!variation.updated_at) {
      throw new Error("Variation version is missing. Please refresh and try again.");
    }

    const lineSelectionByRowId = new Map(
      input.target.lineSelections.map((selection) => [selection.rowId, selection]),
    );
    const appendedLineDrafts = input.publishedRows.map((row) => {
      const selection = lineSelectionByRowId.get(row.rowId);
      if (!selection) {
        throw new Error("One or more selected worksheet rows could not be mapped to the variation.");
      }

      return buildVariationLineDraft({
        row,
        section: selection.section,
      });
    });

    const [existingLineItems, attachments] = await Promise.all([
      loadVariationLineItems({
        client: input.client,
        organizationId: input.organizationId,
        projectId: input.projectId,
        variationId: variation.id,
      }),
      loadVariationAttachments({
        client: input.client,
        organizationId: input.organizationId,
        variationId: variation.id,
      }),
    ]);

    const rpcResponse = await input.client.rpc("save_project_variation_draft" as never, {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_variation_id: variation.id,
      p_expected_updated_at: variation.updated_at,
      p_variation_title: variation.variation_title,
      p_variation_number: variation.variation_number,
      p_status: variation.status,
      p_origin: variation.origin,
      p_requested_by: variation.requested_by,
      p_requested_date: variation.requested_date,
      p_due_date: variation.due_date,
      p_sent_to_client_at: variation.sent_to_client_at,
      p_approved_at: variation.approved_at,
      p_invoice_ready: variation.invoice_ready,
      p_notes: variation.notes,
      p_margin_percent: Number(numberOrZero(variation.margin_percent).toFixed(3)),
      p_discount_amount: Number(numberOrZero(variation.discount_amount).toFixed(2)),
      p_contingency_amount: Number(numberOrZero(variation.contingency_amount).toFixed(2)),
      p_gst_percent: Number(numberOrZero(variation.gst_percent).toFixed(3)),
      p_include_margin_in_export: variation.include_margin_in_export ?? true,
      p_include_discount_in_export: variation.include_discount_in_export ?? false,
      p_include_contingency_in_export: variation.include_contingency_in_export ?? false,
      p_validity_period: variation.validity_period ?? "",
      p_payment_terms: variation.payment_terms ?? "",
      p_lead_time: variation.lead_time ?? "",
      p_terms_inclusions: variation.terms_inclusions ?? "",
      p_terms_exclusions: variation.terms_exclusions ?? "",
      p_clarifications: variation.clarifications ?? "",
      p_assumptions: variation.assumptions ?? "",
      p_line_items: [
        ...existingLineItems.map((line) => ({
          id: line.id,
          section: line.section,
          description: line.description,
          quantity: normalizeNullableNumber(line.quantity),
          unit: line.unit,
          rate: normalizeNullableNumber(line.rate),
          total: normalizeNullableNumber(line.total),
          sourceProjectQuoteId: line.source_project_quote_id,
          sourceProjectQuoteLineItemId: line.source_project_quote_line_item_id,
          sourceProjectQuoteNumber: line.source_project_quote_number ?? "",
          sourcePurchaseOrderId: line.source_purchase_order_id,
          sourcePurchaseOrderLineItemId: line.source_purchase_order_line_item_id,
          sourcePurchaseOrderNumber: line.source_purchase_order_number ?? "",
        })),
        ...appendedLineDrafts.map((line) => ({
          id: line.id,
          section: line.section,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          rate: line.rate,
          total: line.total,
          sourceProjectQuoteId: line.sourceProjectQuoteId,
          sourceProjectQuoteLineItemId: line.sourceProjectQuoteLineItemId,
          sourceProjectQuoteNumber: line.sourceProjectQuoteNumber,
          sourcePurchaseOrderId: line.sourcePurchaseOrderId,
          sourcePurchaseOrderLineItemId: line.sourcePurchaseOrderLineItemId,
          sourcePurchaseOrderNumber: line.sourcePurchaseOrderNumber,
        })),
      ],
      p_attachments: attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.file_name,
        type: attachment.file_kind,
        storagePath: attachment.storage_path,
        externalUrl: attachment.external_url,
      })),
    } as never);

    if (rpcResponse.error) {
      throw new Error(rpcResponse.error.message);
    }

    const savedRow = (Array.isArray(rpcResponse.data) ? rpcResponse.data[0] : null) as SaveProjectVariationDraftRow | null;
    if (!savedRow?.id) {
      throw new Error("Variation was saved but no result was returned.");
    }

    const partialLinkFailureMessage = (
      await persistCommercialItemVariationLinksSafely({
        client: input.client,
        organizationId: input.organizationId,
        variationId: variation.id,
        lineItems: appendedLineDrafts.map((line) => ({
          id: line.id,
          commercialItemLink: line.commercialItemLink,
        })),
      })
    ).errorMessage;

    return {
      variationId: variation.id,
      variationNumber: variation.variation_number,
      addedLineCount: appendedLineDrafts.length,
      skippedRowCount: input.publishedSelection.skippedRows.length,
      variationLineIds: appendedLineDrafts.map((line) => line.id),
      partialLinkFailureMessage,
      message: buildSuccessMessage({
        variationNumber: variation.variation_number,
        addedCount: appendedLineDrafts.length,
        skippedCount: input.publishedSelection.skippedRows.length,
      }),
    };
  },
};

export { IMMUTABLE_VARIATION_MESSAGE as variationPublishImmutableStatusMessage };
