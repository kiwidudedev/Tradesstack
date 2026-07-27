import type { Json } from "@/lib/supabase/types";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import type { CommercialItemPayload } from "@/lib/commercial-items/types";

export type PublishedWorksheetDestination = "quote" | "purchase_order" | "variation";

export type PublishedWorksheetSkippedRowReason =
  | "blank_row"
  | "heading_row"
  | "subtotal_row"
  | "tax_row"
  | "grand_total_row"
  | "divider_row"
  | "missing_description"
  | "missing_commercial_value"
  | "destination_excluded"
  | "not_selected";

export interface PublishedWorksheetSkippedRow {
  rowId: string;
  rowIndex: number;
  rowLabel: string;
  reason: PublishedWorksheetSkippedRowReason;
}

export interface PublishedWorksheetCommercialRow {
  rowId: string;
  rowIndex: number;
  rowLabel: string;
  sourceRowIndex: number;
  sourceRange: WorksheetSelectionRange;
  sourceRangeLabel: string;
  sectionHeading: string | null;
  rowCategoryHint: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  snapshotJson: Json;
  sourceLinkJson: Json;
  lockedMetadataJson: Json;
  sourceSignature: string;
}

export interface PublishedWorksheetCommercialRowWithItem extends PublishedWorksheetCommercialRow {
  commercialItem: CommercialItemPayload;
  reusedCommercialItem: boolean;
}

export interface PublishedWorksheetSelection {
  destination: PublishedWorksheetDestination;
  selectionRange: WorksheetSelectionRange;
  commercialRows: PublishedWorksheetCommercialRow[];
  skippedRows: PublishedWorksheetSkippedRow[];
}

export function buildWorksheetPublishSummaryMessage(params: {
  destinationLabel: string;
  addedCount: number;
  skippedCount: number;
}) {
  const addedLabel = `${params.addedCount} row${params.addedCount === 1 ? "" : "s"} added to ${params.destinationLabel}.`;

  if (params.skippedCount <= 0) {
    return addedLabel;
  }

  return `${addedLabel} ${params.skippedCount} row${params.skippedCount === 1 ? "" : "s"} skipped.`;
}
