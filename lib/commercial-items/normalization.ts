import type { Json } from "@/lib/supabase/types";
import type {
  CommercialItemDocumentLinkPayload,
  CommercialItemDocumentLinkRow,
  CommercialItemPayload,
  CommercialItemRow,
} from "@/lib/commercial-items/types";

function asNumberOrNull(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asJson(value: Json | null | undefined): Json {
  return value ?? {};
}

export function normalizeCommercialItemRow(row: CommercialItemRow): CommercialItemPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    opportunityId: row.opportunity_id,
    projectId: row.project_id,
    sourceType: row.source_type as CommercialItemPayload["sourceType"],
    sourceWorkbookId: row.source_workbook_id,
    sourceWorksheetId: row.source_worksheet_id,
    sourceSheetId: row.source_sheet_id,
    sourceRange: row.source_range,
    sourceSignature: row.source_signature,
    sourceVersion: row.source_version,
    sourceStatus: row.source_status as CommercialItemPayload["sourceStatus"],
    staleReasonCode: row.stale_reason_code,
    lastSourceCheckedAt: row.last_source_checked_at,
    lastSourceChangedAt: row.last_source_changed_at,
    description: row.description,
    quantity: asNumberOrNull(row.quantity),
    unit: row.unit,
    rate: asNumberOrNull(row.rate),
    total: asNumberOrNull(row.total),
    snapshotJson: asJson(row.snapshot_json),
    sourceLinkJson: asJson(row.source_link_json),
    uclClassification: row.ucl_classification,
    uclValidationStatus: row.ucl_validation_status as CommercialItemPayload["uclValidationStatus"],
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeCommercialItemRowList(rows: CommercialItemRow[]): CommercialItemPayload[] {
  return rows.map(normalizeCommercialItemRow);
}

export function normalizeCommercialItemDocumentLinkRow(
  row: CommercialItemDocumentLinkRow,
): CommercialItemDocumentLinkPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    commercialItemId: row.commercial_item_id,
    documentKind: row.document_kind as CommercialItemDocumentLinkPayload["documentKind"],
    documentId: row.document_id,
    documentLineId: row.document_line_id,
    linkRole: row.link_role as CommercialItemDocumentLinkPayload["linkRole"],
    snapshotAtLinkJson: asJson(row.snapshot_at_link_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function normalizeCommercialItemDocumentLinkRowList(
  rows: CommercialItemDocumentLinkRow[],
): CommercialItemDocumentLinkPayload[] {
  return rows.map(normalizeCommercialItemDocumentLinkRow);
}
