import { parseWorksheetMaterialPricingProvenance } from "@/lib/worksheet-material-pricing-provenance";
import { parseWorksheetMeasureProvenance } from "@/lib/worksheet-measure-provenance";
import type { Json } from "@/lib/supabase/types";
import type {
  CommercialLineageEdgeEntityType,
  CommercialLineageRelationshipType,
} from "@/lib/commercial-lineage/types";

export type CommercialLineageIntegrityFindingCode =
  | "duplicate_active_edge"
  | "invalid_relationship_pair"
  | "cross_organization_edge"
  | "project_mismatch"
  | "missing_source_entity"
  | "valid_provenance_missing_edge";

export interface CommercialLineageIntegrityFinding {
  code: CommercialLineageIntegrityFindingCode;
  severity: "error" | "warning";
  entityType: string;
  entityId: string;
  detail: string;
}

export interface CommercialLineageIntegrityEdgeRow {
  id: string;
  organization_id: string;
  project_id: string | null;
  from_entity_type: CommercialLineageEdgeEntityType;
  from_entity_id: string;
  to_entity_type: CommercialLineageEdgeEntityType;
  to_entity_id: string;
  relationship_type: CommercialLineageRelationshipType;
  superseded_at: string | null;
}

export interface CommercialLineageIntegrityCommercialItem {
  id: string;
  organization_id: string;
  project_id: string | null;
  locked_metadata_json: Json;
}

export interface CommercialLineageEntityScope {
  organizationId: string;
  projectId: string | null;
}

const allowedPairs = new Set([
  "commercial_item:organization_material:derived_from_material",
  "commercial_item:organization_material_supplier_product:priced_from_supplier_product",
  "commercial_item:organization_material_supplier_price:priced_from_supplier_price",
  "commercial_item:takeoff_measurement:measured_from",
  "commercial_item:project_quote:scoped_by",
  "commercial_item:project_variation:scoped_by",
  "project_purchase_order_line_item:project_quote_line_item:caused_by",
  "project_purchase_order_line_item:project_variation_line_item:caused_by",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedEdges(item: CommercialLineageIntegrityCommercialItem) {
  if (!isRecord(item.locked_metadata_json) || !Array.isArray(item.locked_metadata_json.cells)) return [];
  const expected: Array<{
    toEntityType: CommercialLineageEdgeEntityType;
    toEntityId: string;
    relationshipType: CommercialLineageRelationshipType;
  }> = [];
  item.locked_metadata_json.cells.forEach((rawCell) => {
    if (!isRecord(rawCell) || !isRecord(rawCell.metadata)) return;
    const material = parseWorksheetMaterialPricingProvenance(rawCell.metadata.materialPricing);
    if (material) {
      const supplierPriceId = material.version === 2 ? material.sourcePricing.supplierPriceId : material.supplierPriceId;
      expected.push(
        { toEntityType: "organization_material", toEntityId: material.organizationMaterialId, relationshipType: "derived_from_material" },
        { toEntityType: "organization_material_supplier_product", toEntityId: material.supplierProductId, relationshipType: "priced_from_supplier_product" },
        { toEntityType: "organization_material_supplier_price", toEntityId: supplierPriceId, relationshipType: "priced_from_supplier_price" },
      );
    }
    const measure = parseWorksheetMeasureProvenance(rawCell.metadata.measureSource);
    if (measure) {
      expected.push({
        toEntityType: "takeoff_measurement",
        toEntityId: measure.measurementId,
        relationshipType: "measured_from",
      });
    }
  });
  return expected;
}

export function inspectCommercialLineageIntegrity(params: {
  edges: CommercialLineageIntegrityEdgeRow[];
  commercialItems: CommercialLineageIntegrityCommercialItem[];
  entityScopes?: Map<string, CommercialLineageEntityScope>;
}): CommercialLineageIntegrityFinding[] {
  const findings: CommercialLineageIntegrityFinding[] = [];
  const activeIdentity = new Set<string>();
  const activeEvidence = new Set<string>();

  params.edges.filter((edge) => edge.superseded_at === null).forEach((edge) => {
    const identity = [edge.organization_id, edge.from_entity_type, edge.from_entity_id,
      edge.to_entity_type, edge.to_entity_id, edge.relationship_type].join(":");
    if (activeIdentity.has(identity)) findings.push({
      code: "duplicate_active_edge", severity: "error", entityType: edge.from_entity_type,
      entityId: edge.from_entity_id, detail: `Duplicate active edge ${identity}.`,
    });
    activeIdentity.add(identity);
    activeEvidence.add(`${edge.from_entity_id}:${edge.to_entity_type}:${edge.to_entity_id}:${edge.relationship_type}`);

    const pair = `${edge.from_entity_type}:${edge.to_entity_type}:${edge.relationship_type}`;
    if (!allowedPairs.has(pair)) findings.push({
      code: "invalid_relationship_pair", severity: "error", entityType: edge.from_entity_type,
      entityId: edge.from_entity_id, detail: `Unsupported relationship pair ${pair}.`,
    });

    if (params.entityScopes) {
      const fromScope = params.entityScopes.get(`${edge.from_entity_type}:${edge.from_entity_id}`);
      const toScope = params.entityScopes.get(`${edge.to_entity_type}:${edge.to_entity_id}`);
      if (!fromScope || !toScope) findings.push({
        code: "missing_source_entity", severity: "error", entityType: edge.from_entity_type,
        entityId: edge.from_entity_id, detail: `Edge ${edge.id} references an entity absent from the scope catalogue.`,
      });
      else if (fromScope.organizationId !== edge.organization_id || toScope.organizationId !== edge.organization_id) findings.push({
        code: "cross_organization_edge", severity: "error", entityType: edge.from_entity_type,
        entityId: edge.from_entity_id, detail: `Edge ${edge.id} crosses organization scope.`,
      });
      else if (fromScope.projectId && toScope.projectId && fromScope.projectId !== toScope.projectId) findings.push({
        code: "project_mismatch", severity: "error", entityType: edge.from_entity_type,
        entityId: edge.from_entity_id, detail: `Edge ${edge.id} crosses project scope.`,
      });
    }
  });

  params.commercialItems.forEach((item) => {
    expectedEdges(item).forEach((expected) => {
      const identity = `${item.id}:${expected.toEntityType}:${expected.toEntityId}:${expected.relationshipType}`;
      if (!activeEvidence.has(identity)) findings.push({
        code: "valid_provenance_missing_edge", severity: "warning", entityType: "commercial_item",
        entityId: item.id, detail: `Validated metadata expects ${expected.relationshipType} to ${expected.toEntityType}:${expected.toEntityId}.`,
      });
    });
  });

  return findings;
}

