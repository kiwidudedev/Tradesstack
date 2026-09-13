import { describe, expect, it } from "vitest";
import { getCommercialLineageFromDataSource } from "@/lib/commercial-lineage/traversal";
import type {
  CommercialLineageDataSource,
  CommercialLineageEdge,
  CommercialLineageEntityRef,
  CommercialLineageNode,
  CommercialLineageUnknownBoundary,
} from "@/lib/commercial-lineage/types";

const organizationId = "org-1";
const node = (entityType: CommercialLineageEntityRef["entityType"], entityId: string): CommercialLineageNode => ({
  entityType, entityId, organizationId, projectId: "project-1", state: "current", revision: null,
});
const edge = (
  id: string,
  from: CommercialLineageEntityRef,
  to: CommercialLineageEntityRef,
  relationshipType: CommercialLineageEdge["relationshipType"],
): CommercialLineageEdge => ({
  id, organizationId, projectId: "project-1", from, to, relationshipType,
  representation: id.startsWith("typed") ? "typed_edge" : "strong_fk",
  evidenceSource: "fixture", evidenceVersion: "v1", evidenceRef: {}, createdAt: null, supersededAt: null,
});

function fixtureDataSource(params: {
  nodes: CommercialLineageNode[];
  edges: CommercialLineageEdge[];
  boundaries?: CommercialLineageUnknownBoundary[];
}): CommercialLineageDataSource {
  const byKey = new Map(params.nodes.map((value) => [`${value.entityType}:${value.entityId}`, value]));
  return {
    async loadRoot({ root }) { return byKey.get(`${root.entityType}:${root.entityId}`) ?? null; },
    async expand({ frontier }) {
      const keys = new Set(frontier.map((ref) => `${ref.entityType}:${ref.entityId}`));
      const edges = params.edges.filter((value) =>
        keys.has(`${value.from.entityType}:${value.from.entityId}`)
        || keys.has(`${value.to.entityType}:${value.to.entityId}`));
      return {
        edges,
        nodes: edges.flatMap((value) => [value.from, value.to])
          .map((ref) => byKey.get(`${ref.entityType}:${ref.entityId}`)!)
          .filter(Boolean),
        unknownBoundaries: params.boundaries ?? [],
      };
    },
    async summarizeFinancials() { return { committed: 125, actual: 115, reversed: 10, netActual: 105 }; },
  };
}

describe("commercial lineage traversal", () => {
  const material = node("organization_material", "material-1");
  const item = node("commercial_item", "item-1");
  const poLine = node("project_purchase_order_line_item", "po-line-1");
  const allocation = node("supplier_invoice_line_allocation", "allocation-1");
  const actual = node("project_actual_cost_event", "actual-1");
  const graphEdges = [
    edge("typed-material", item, material, "derived_from_material"),
    edge("document-link", poLine, item, "commercial_item_document_link"),
    edge("allocation-po", allocation, poLine, "allocated_to_purchase_order_line"),
    edge("actual-allocation", actual, allocation, "posted_from_allocation"),
    edge("cycle-proof", item, poLine, "scoped_by"),
  ];

  it("traverses source to financial outcome without using edge amounts as truth", async () => {
    const result = await getCommercialLineageFromDataSource(
      fixtureDataSource({ nodes: [material, item, poLine, allocation, actual], edges: graphEdges }),
      { organizationId, entityType: "organization_material", entityId: "material-1", direction: "downstream" },
    );
    expect(result.nodes.map((value) => value.entityType)).toContain("project_actual_cost_event");
    expect(result.financialSummary).toEqual({ committed: 125, actual: 115, reversed: 10, netActual: 105 });
    expect(result.truncation.truncated).toBe(false);
  });

  it("traverses Actual upstream through every factual branch and terminates cycles", async () => {
    const result = await getCommercialLineageFromDataSource(
      fixtureDataSource({ nodes: [material, item, poLine, allocation, actual], edges: graphEdges }),
      { organizationId, entityType: "project_actual_cost_event", entityId: "actual-1", direction: "upstream" },
    );
    expect(result.nodes.map((value) => `${value.entityType}:${value.entityId}`)).toContain("organization_material:material-1");
    expect(new Set(result.nodes.map((value) => `${value.entityType}:${value.entityId}`)).size).toBe(result.nodes.length);
  });

  it("returns explicit no-PO semantics without fabricating an upstream edge", async () => {
    const noPo = node("supplier_invoice_line_allocation", "allocation-no-po");
    const boundary: CommercialLineageUnknownBoundary = {
      entityType: noPo.entityType, entityId: noPo.entityId, status: "not_applicable",
      dimension: "commercial_source", reason: "no_po_or_commercial_source",
    };
    const result = await getCommercialLineageFromDataSource(
      fixtureDataSource({ nodes: [noPo], edges: [], boundaries: [boundary] }),
      { organizationId, entityType: noPo.entityType, entityId: noPo.entityId },
    );
    expect(result.unknownBoundaries).toEqual([boundary]);
    expect(result.edges).toEqual([]);
  });

  it("enforces the hard depth maximum and reports truncation", async () => {
    const result = await getCommercialLineageFromDataSource(
      fixtureDataSource({ nodes: [material, item, poLine, allocation, actual], edges: graphEdges }),
      { organizationId, entityType: material.entityType, entityId: material.entityId, maxDepth: 100 },
    );
    expect(result.truncation.hardMaximumDepth).toBe(16);
    expect(result.truncation.requestedDepth).toBe(100);
    expect(result.truncation.truncated).toBe(true);
  });
});
