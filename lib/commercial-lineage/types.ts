import type { Json } from "@/lib/supabase/types";

export const COMMERCIAL_LINEAGE_DEFAULT_DEPTH = 8;
export const COMMERCIAL_LINEAGE_MAX_DEPTH = 16;

export const commercialLineageEdgeEntityTypes = [
  "commercial_item",
  "organization_material",
  "organization_material_supplier_product",
  "organization_material_supplier_price",
  "takeoff_measurement",
  "project_quote",
  "project_quote_line_item",
  "project_variation",
  "project_variation_line_item",
  "project_purchase_order_line_item",
] as const;

export type CommercialLineageEdgeEntityType = typeof commercialLineageEdgeEntityTypes[number];

export type CommercialLineageEntityType = CommercialLineageEdgeEntityType
  | "project_purchase_order"
  | "project_time_sheet_entry"
  | "cost_item"
  | "supplier_invoice"
  | "supplier_invoice_line"
  | "supplier_invoice_line_allocation"
  | "project_actual_cost_event";

export type CommercialLineageRelationshipType =
  | "derived_from_material"
  | "priced_from_supplier_product"
  | "priced_from_supplier_price"
  | "measured_from"
  | "scoped_by"
  | "caused_by"
  | "commercial_item_document_link"
  | "belongs_to_purchase_order"
  | "sourced_from_timesheet"
  | "costed_by"
  | "sourced_from_cost_item"
  | "sourced_from_document_line"
  | "allocated_from_invoice"
  | "allocated_from_invoice_line"
  | "allocated_to_purchase_order"
  | "allocated_to_purchase_order_line"
  | "posted_from_allocation"
  | "posted_from_invoice"
  | "posted_from_invoice_line"
  | "posted_from_purchase_order"
  | "posted_from_purchase_order_line"
  | "reverses"
  | "correction_root";

export type CommercialLineageCompleteness = "known" | "partial" | "unknown" | "not_applicable" | "invalid";
export type CommercialLineageDirection = "upstream" | "downstream" | "both";

export interface CommercialLineageEntityRef {
  entityType: CommercialLineageEntityType;
  entityId: string;
}

export interface CommercialLineageNode extends CommercialLineageEntityRef {
  organizationId: string;
  projectId: string | null;
  state: "current" | "superseded" | "archived" | "unknown";
  revision: Json | null;
  attributes?: Record<string, Json | undefined>;
}

export interface CommercialLineageEdge {
  id: string;
  organizationId: string;
  projectId: string | null;
  from: CommercialLineageEntityRef;
  to: CommercialLineageEntityRef;
  relationshipType: CommercialLineageRelationshipType;
  representation: "typed_edge" | "strong_fk" | "document_link";
  evidenceSource: string;
  evidenceVersion: string;
  evidenceRef: Json;
  createdAt: string | null;
  supersededAt: string | null;
}

export interface CommercialLineageUnknownBoundary extends CommercialLineageEntityRef {
  status: CommercialLineageCompleteness;
  dimension: "upstream" | "commercial_source" | "record" | "permission";
  reason: string;
}

export interface CommercialLineageFinancialSummary {
  committed: number;
  actual: number;
  reversed: number;
  netActual: number;
}

export interface CommercialLineageExpansion {
  nodes: CommercialLineageNode[];
  edges: CommercialLineageEdge[];
  unknownBoundaries: CommercialLineageUnknownBoundary[];
}

export interface CommercialLineageDataSource {
  loadRoot(params: {
    organizationId: string;
    projectId?: string | null;
    root: CommercialLineageEntityRef;
  }): Promise<CommercialLineageNode | null>;
  expand(params: {
    organizationId: string;
    frontier: CommercialLineageEntityRef[];
    includeSuperseded: boolean;
  }): Promise<CommercialLineageExpansion>;
  summarizeFinancials(params: {
    organizationId: string;
    nodes: CommercialLineageNode[];
  }): Promise<CommercialLineageFinancialSummary>;
}

export interface GetCommercialLineageInput extends CommercialLineageEntityRef {
  organizationId: string;
  projectId?: string | null;
  direction?: CommercialLineageDirection;
  maxDepth?: number;
  includeSuperseded?: boolean;
}

export interface CommercialLineageResult {
  root: CommercialLineageNode;
  nodes: CommercialLineageNode[];
  edges: CommercialLineageEdge[];
  financialSummary: CommercialLineageFinancialSummary;
  unknownBoundaries: CommercialLineageUnknownBoundary[];
  evidence: Array<{
    edgeId: string;
    source: string;
    version: string;
    ref: Json;
  }>;
  truncation: {
    truncated: boolean;
    requestedDepth: number;
    traversedDepth: number;
    hardMaximumDepth: number;
  };
}

export function commercialLineageEntityKey(ref: CommercialLineageEntityRef) {
  return `${ref.entityType}:${ref.entityId}`;
}
