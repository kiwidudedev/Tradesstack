import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

export type CommercialItemsClient = SupabaseClient<Database>;

export type CommercialItemSourceType = "worksheet_selection" | "takeoff_measurement";
export type CommercialItemSourceStatus = "current" | "stale" | "broken" | "needs_review";
export type CommercialItemUclValidationStatus = "not_reviewed" | "valid" | "invalid";
export type CommercialItemDocumentKind =
  | "quote_line"
  | "purchase_order_line"
  | "variation_line"
  | "budget_item"
  | "claim_line"
  | "invoice_line";
export type CommercialItemLinkRole = "source" | "reference";

export interface CommercialItemRow {
  id: string;
  organization_id: string;
  opportunity_id: string;
  project_id: string | null;
  source_type: string;
  source_workbook_id: string | null;
  source_worksheet_id: string | null;
  source_sheet_id: string | null;
  source_takeoff_measurement_id?: string | null;
  source_range: string | null;
  source_signature: string;
  source_version: number;
  source_status: string;
  stale_reason_code: string | null;
  last_source_checked_at: string | null;
  last_source_changed_at: string | null;
  description: string;
  quantity: number | string | null;
  unit: string | null;
  rate: number | string | null;
  total: number | string | null;
  snapshot_json: Json;
  source_link_json: Json;
  ucl_classification: string | null;
  ucl_validation_status: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CommercialItemDocumentLinkRow {
  id: string;
  organization_id: string;
  commercial_item_id: string;
  document_kind: string;
  document_id: string;
  document_line_id: string;
  link_role: string;
  snapshot_at_link_json: Json;
  created_by: string;
  created_at: string;
}

export interface CommercialItemPayload {
  id: string;
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
  sourceType: CommercialItemSourceType;
  sourceWorkbookId: string | null;
  sourceWorksheetId: string | null;
  sourceSheetId: string | null;
  sourceTakeoffMeasurementId?: string | null;
  sourceRange: string | null;
  sourceSignature: string;
  sourceVersion: number;
  sourceStatus: CommercialItemSourceStatus;
  staleReasonCode: string | null;
  lastSourceCheckedAt: string | null;
  lastSourceChangedAt: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  snapshotJson: Json;
  sourceLinkJson: Json;
  uclClassification: string | null;
  uclValidationStatus: CommercialItemUclValidationStatus;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialItemDocumentLinkPayload {
  id: string;
  organizationId: string;
  commercialItemId: string;
  documentKind: CommercialItemDocumentKind;
  documentId: string;
  documentLineId: string;
  linkRole: CommercialItemLinkRole;
  snapshotAtLinkJson: Json;
  createdBy: string;
  createdAt: string;
}

export interface CreateCommercialItemInput {
  organizationId: string;
  opportunityId: string;
  projectId?: string | null;
  sourceType?: "worksheet_selection";
  sourceWorkbookId: string;
  sourceWorksheetId?: string | null;
  sourceSheetId: string;
  sourceRange: string;
  sourceSignature: string;
  sourceVersion?: number;
  sourceStatus?: CommercialItemSourceStatus;
  staleReasonCode?: string | null;
  lastSourceCheckedAt?: string | null;
  lastSourceChangedAt?: string | null;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  rate?: number | null;
  total?: number | null;
  snapshotJson: Json;
  sourceLinkJson: Json;
  lockedMetadataJson: Json;
  uclClassification?: string | null;
  uclValidationStatus?: CommercialItemUclValidationStatus;
}

export interface CreateTakeoffCommercialItemInput {
  organizationId: string;
  opportunityId: string;
  projectId?: string | null;
  dataProjectId: string;
  measurementId: string;
  description: string;
  rate: number;
}

export interface GetCommercialItemInput {
  commercialItemId: string;
}

export interface ListCommercialItemsForOpportunityInput {
  organizationId: string;
  opportunityId: string;
}

export interface ListCommercialItemsByIdsInput {
  organizationId: string;
  commercialItemIds: string[];
}

export interface ListCommercialItemDocumentLinksForQuoteInput {
  organizationId: string;
  quoteId: string;
}

export interface ListCommercialItemDocumentLinksForPurchaseOrderInput {
  organizationId: string;
  purchaseOrderId: string;
}

export interface ListCommercialItemDocumentLinksForVariationInput {
  organizationId: string;
  variationId: string;
}

export interface LinkCommercialItemToQuoteLineInput {
  organizationId: string;
  commercialItemId: string;
  quoteId: string;
  quoteLineId: string;
  linkRole?: CommercialItemLinkRole;
  snapshotAtLinkJson?: Json;
}

export interface LinkCommercialItemToPurchaseOrderLineInput {
  organizationId: string;
  commercialItemId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  linkRole?: CommercialItemLinkRole;
  snapshotAtLinkJson?: Json;
}

export interface LinkCommercialItemToVariationLineInput {
  organizationId: string;
  commercialItemId: string;
  variationId: string;
  variationLineId: string;
  linkRole?: CommercialItemLinkRole;
  snapshotAtLinkJson?: Json;
}

export interface RepairProjectQuoteSourceOpportunityLineageInput {
  organizationId: string;
  quoteId: string;
}

export interface RepairProjectQuoteSourceOpportunityLineagePayload {
  id: string;
  sourceOpportunityId: string | null;
}
