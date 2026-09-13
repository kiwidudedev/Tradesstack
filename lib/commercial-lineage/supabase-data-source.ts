import type { Json } from "@/lib/supabase/types";
import {
  commercialLineageEntityKey,
  type CommercialLineageDataSource,
  type CommercialLineageEdge,
  type CommercialLineageEntityRef,
  type CommercialLineageEntityType,
  type CommercialLineageExpansion,
  type CommercialLineageFinancialSummary,
  type CommercialLineageNode,
  type CommercialLineageRelationshipType,
  type CommercialLineageUnknownBoundary,
} from "@/lib/commercial-lineage/types";

type QueryResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
type QueryBuilder = {
  select(columns?: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: string[]): QueryBuilder;
  is(column: string, value: null): QueryBuilder;
  or(filters: string): QueryBuilder;
  then: QueryResult["then"];
};
export type CommercialLineageSupabaseClient = {
  from(table: string): QueryBuilder;
};

type DbRow = Record<string, unknown>;

const entityTables: Record<CommercialLineageEntityType, string> = {
  commercial_item: "commercial_items",
  organization_material: "organization_materials",
  organization_material_supplier_product: "organization_material_supplier_products",
  organization_material_supplier_price: "organization_material_supplier_prices",
  takeoff_measurement: "takeoff_measurements",
  project_quote: "project_quotes",
  project_quote_line_item: "project_quote_line_items",
  project_variation: "project_variations",
  project_variation_line_item: "project_variation_line_items",
  project_purchase_order_line_item: "project_purchase_order_line_items",
  project_purchase_order: "project_purchase_orders",
  project_time_sheet_entry: "project_time_sheet_entries",
  cost_item: "cost_items",
  supplier_invoice: "supplier_invoices",
  supplier_invoice_line: "supplier_invoice_lines",
  supplier_invoice_line_allocation: "supplier_invoice_line_allocations",
  project_actual_cost_event: "project_actual_cost_events",
};

function asRows(data: unknown[] | null): DbRow[] {
  return (data ?? []).filter((value): value is DbRow => typeof value === "object" && value !== null);
}

async function unwrap(query: QueryBuilder): Promise<DbRow[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return asRows(data);
}

function stringValue(row: DbRow, key: string) {
  return typeof row[key] === "string" ? row[key] as string : null;
}

function numberValue(row: DbRow, key: string) {
  return typeof row[key] === "number" && Number.isFinite(row[key]) ? row[key] as number : 0;
}

function nodeFromRow(entityType: CommercialLineageEntityType, row: DbRow): CommercialLineageNode | null {
  const id = stringValue(row, "id");
  const organizationId = stringValue(row, "organization_id");
  if (!id || !organizationId) return null;
  const archived = stringValue(row, "archived_at");
  const current = row.is_current;
  const superseded = stringValue(row, "superseded_at") || (current === false ? "superseded" : null);
  return {
    entityType,
    entityId: id,
    organizationId,
    projectId: stringValue(row, "project_id"),
    state: archived ? "archived" : superseded ? "superseded" : "current",
    revision: {
      version: typeof row.version === "number" ? row.version : null,
      sourceVersion: typeof row.source_version === "number" ? row.source_version : null,
      sourceRevisionKey: stringValue(row, "source_revision_key"),
      correctionRootEventId: stringValue(row, "correction_root_event_id"),
    },
  };
}

function strongEdge(params: {
  organizationId: string;
  projectId: string | null;
  from: CommercialLineageEntityRef;
  to: CommercialLineageEntityRef;
  relationshipType: CommercialLineageRelationshipType;
  field: string;
}): CommercialLineageEdge {
  return {
    id: `strong:${commercialLineageEntityKey(params.from)}:${params.field}:${commercialLineageEntityKey(params.to)}`,
    organizationId: params.organizationId,
    projectId: params.projectId,
    from: params.from,
    to: params.to,
    relationshipType: params.relationshipType,
    representation: "strong_fk",
    evidenceSource: "database_foreign_key",
    evidenceVersion: "v1",
    evidenceRef: { field: params.field },
    createdAt: null,
    supersededAt: null,
  };
}

function addFk(params: {
  edges: CommercialLineageEdge[];
  refs: CommercialLineageEntityRef[];
  row: DbRow;
  fromType: CommercialLineageEntityType;
  field: string;
  toType: CommercialLineageEntityType;
  relationshipType: CommercialLineageRelationshipType;
}) {
  const fromId = stringValue(params.row, "id");
  const toId = stringValue(params.row, params.field);
  const organizationId = stringValue(params.row, "organization_id");
  if (!fromId || !toId || !organizationId) return;
  const from = { entityType: params.fromType, entityId: fromId };
  const to = { entityType: params.toType, entityId: toId };
  params.refs.push(to);
  params.edges.push(strongEdge({
    organizationId,
    projectId: stringValue(params.row, "project_id"),
    from,
    to,
    relationshipType: params.relationshipType,
    field: params.field,
  }));
}

function groupRefs(refs: CommercialLineageEntityRef[]) {
  const grouped = new Map<CommercialLineageEntityType, string[]>();
  refs.forEach((ref) => grouped.set(ref.entityType, [...(grouped.get(ref.entityType) ?? []), ref.entityId]));
  return grouped;
}

export class SupabaseCommercialLineageDataSource implements CommercialLineageDataSource {
  constructor(
    private readonly admin: CommercialLineageSupabaseClient,
    private readonly authorized: CommercialLineageSupabaseClient,
  ) {}

  private async loadAuthorizedNodes(refs: CommercialLineageEntityRef[]) {
    const nodes = new Map<string, CommercialLineageNode>();
    await Promise.all([...groupRefs(refs)].map(async ([entityType, ids]) => {
      const rows = await unwrap(this.authorized.from(entityTables[entityType])
        .select("*").in("id", [...new Set(ids)]));
      rows.map((row) => nodeFromRow(entityType, row)).forEach((node) => {
        if (node) nodes.set(commercialLineageEntityKey(node), node);
      });
    }));
    return nodes;
  }

  async loadRoot(params: {
    organizationId: string;
    projectId?: string | null;
    root: CommercialLineageEntityRef;
  }) {
    const rows = await unwrap(this.authorized.from(entityTables[params.root.entityType])
      .select("*").eq("id", params.root.entityId).eq("organization_id", params.organizationId));
    const node = rows.map((row) => nodeFromRow(params.root.entityType, row)).find(Boolean) ?? null;
    if (node && params.projectId && node.projectId && node.projectId !== params.projectId) return null;
    return node;
  }

  private async typedEdges(organizationId: string, frontier: CommercialLineageEntityRef[], includeSuperseded: boolean) {
    const queries: Promise<DbRow[]>[] = [];
    for (const [entityType, ids] of groupRefs(frontier)) {
      let fromQuery = this.admin.from("commercial_lineage_edges").select("*")
        .eq("organization_id", organizationId).eq("from_entity_type", entityType).in("from_entity_id", ids);
      let toQuery = this.admin.from("commercial_lineage_edges").select("*")
        .eq("organization_id", organizationId).eq("to_entity_type", entityType).in("to_entity_id", ids);
      if (!includeSuperseded) {
        fromQuery = fromQuery.is("superseded_at", null);
        toQuery = toQuery.is("superseded_at", null);
      }
      queries.push(unwrap(fromQuery), unwrap(toQuery));
    }
    const rows = (await Promise.all(queries)).flat();
    const seen = new Set<string>();
    return rows.flatMap((row): CommercialLineageEdge[] => {
      const id = stringValue(row, "id");
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{
        id,
        organizationId,
        projectId: stringValue(row, "project_id"),
        from: {
          entityType: stringValue(row, "from_entity_type") as CommercialLineageEntityType,
          entityId: stringValue(row, "from_entity_id")!,
        },
        to: {
          entityType: stringValue(row, "to_entity_type") as CommercialLineageEntityType,
          entityId: stringValue(row, "to_entity_id")!,
        },
        relationshipType: stringValue(row, "relationship_type") as CommercialLineageRelationshipType,
        representation: "typed_edge",
        evidenceSource: stringValue(row, "evidence_source") ?? "unknown",
        evidenceVersion: stringValue(row, "evidence_version") ?? "unknown",
        evidenceRef: (row.evidence_ref ?? {}) as Json,
        createdAt: stringValue(row, "created_at"),
        supersededAt: stringValue(row, "superseded_at"),
      }];
    });
  }

  private async strongConnections(organizationId: string, frontier: CommercialLineageEntityRef[]) {
    const edges: CommercialLineageEdge[] = [];
    const refs: CommercialLineageEntityRef[] = [];
    const boundaries: CommercialLineageUnknownBoundary[] = [];
    const grouped = groupRefs(frontier);

    const actualIds = grouped.get("project_actual_cost_event") ?? [];
    const allocationIds = grouped.get("supplier_invoice_line_allocation") ?? [];
    const poLineIds = grouped.get("project_purchase_order_line_item") ?? [];
    const poIds = grouped.get("project_purchase_order") ?? [];
    const commercialItemIds = grouped.get("commercial_item") ?? [];
    const costItemIds = grouped.get("cost_item") ?? [];
    const invoiceIds = grouped.get("supplier_invoice") ?? [];
    const invoiceLineIds = grouped.get("supplier_invoice_line") ?? [];
    const quoteLineIds = grouped.get("project_quote_line_item") ?? [];
    const variationLineIds = grouped.get("project_variation_line_item") ?? [];

    const tasks: Array<Promise<void>> = [];
    if (actualIds.length) tasks.push((async () => {
      const rows = await unwrap(this.admin.from("project_actual_cost_events").select("*")
        .eq("organization_id", organizationId).in("id", actualIds));
      for (const row of rows) {
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "supplier_invoice_line_allocation_id", toType: "supplier_invoice_line_allocation", relationshipType: "posted_from_allocation" });
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "supplier_invoice_id", toType: "supplier_invoice", relationshipType: "posted_from_invoice" });
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "supplier_invoice_line_id", toType: "supplier_invoice_line", relationshipType: "posted_from_invoice_line" });
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "purchase_order_id", toType: "project_purchase_order", relationshipType: "posted_from_purchase_order" });
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "purchase_order_line_item_id", toType: "project_purchase_order_line_item", relationshipType: "posted_from_purchase_order_line" });
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "cost_item_id", toType: "cost_item", relationshipType: "costed_by" });
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "source_cost_item_id", toType: "cost_item", relationshipType: "sourced_from_cost_item" });
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "reverses_event_id", toType: "project_actual_cost_event", relationshipType: "reverses" });
        addFk({ edges, refs, row, fromType: "project_actual_cost_event", field: "correction_root_event_id", toType: "project_actual_cost_event", relationshipType: "correction_root" });
        if (!stringValue(row, "purchase_order_id")) boundaries.push({
          entityType: "project_actual_cost_event", entityId: stringValue(row, "id")!, status: "not_applicable",
          dimension: "commercial_source", reason: "no_po_or_commercial_source",
        });
      }
    })());
    if (allocationIds.length) tasks.push((async () => {
      const rows = await unwrap(this.admin.from("supplier_invoice_line_allocations").select("*")
        .eq("organization_id", organizationId).in("id", allocationIds));
      for (const row of rows) {
        addFk({ edges, refs, row, fromType: "supplier_invoice_line_allocation", field: "supplier_invoice_id", toType: "supplier_invoice", relationshipType: "allocated_from_invoice" });
        addFk({ edges, refs, row, fromType: "supplier_invoice_line_allocation", field: "supplier_invoice_line_id", toType: "supplier_invoice_line", relationshipType: "allocated_from_invoice_line" });
        addFk({ edges, refs, row, fromType: "supplier_invoice_line_allocation", field: "purchase_order_id", toType: "project_purchase_order", relationshipType: "allocated_to_purchase_order" });
        addFk({ edges, refs, row, fromType: "supplier_invoice_line_allocation", field: "purchase_order_line_item_id", toType: "project_purchase_order_line_item", relationshipType: "allocated_to_purchase_order_line" });
        addFk({ edges, refs, row, fromType: "supplier_invoice_line_allocation", field: "cost_item_id", toType: "cost_item", relationshipType: "costed_by" });
        addFk({ edges, refs, row, fromType: "supplier_invoice_line_allocation", field: "source_cost_item_id", toType: "cost_item", relationshipType: "sourced_from_cost_item" });
        if (!stringValue(row, "purchase_order_id")) boundaries.push({
          entityType: "supplier_invoice_line_allocation", entityId: stringValue(row, "id")!, status: "not_applicable",
          dimension: "commercial_source", reason: "no_po_or_commercial_source",
        });
      }
    })());
    if (poLineIds.length) tasks.push((async () => {
      const rows = await unwrap(this.admin.from("project_purchase_order_line_items").select("*")
        .eq("organization_id", organizationId).in("id", poLineIds));
      for (const row of rows) {
        const before = edges.length;
        addFk({ edges, refs, row, fromType: "project_purchase_order_line_item", field: "purchase_order_id", toType: "project_purchase_order", relationshipType: "belongs_to_purchase_order" });
        addFk({ edges, refs, row, fromType: "project_purchase_order_line_item", field: "source_time_sheet_entry_id", toType: "project_time_sheet_entry", relationshipType: "sourced_from_timesheet" });
        addFk({ edges, refs, row, fromType: "project_purchase_order_line_item", field: "source_cost_item_id", toType: "cost_item", relationshipType: "sourced_from_cost_item" });
        addFk({ edges, refs, row, fromType: "project_purchase_order_line_item", field: "cost_item_id", toType: "cost_item", relationshipType: "costed_by" });
        if (edges.length === before + 1) boundaries.push({
          entityType: "project_purchase_order_line_item", entityId: stringValue(row, "id")!, status: "unknown",
          dimension: "upstream", reason: "manual_purchase_order_line_has_no_factual_source",
        });
      }
    })());
    if (commercialItemIds.length || poLineIds.length || quoteLineIds.length || variationLineIds.length) tasks.push((async () => {
      const filters: string[] = [];
      if (commercialItemIds.length) filters.push(`commercial_item_id.in.(${commercialItemIds.join(",")})`);
      if (poLineIds.length) filters.push(`and(document_kind.eq.purchase_order_line,document_line_id.in.(${poLineIds.join(",")}))`);
      if (quoteLineIds.length) filters.push(`and(document_kind.eq.quote_line,document_line_id.in.(${quoteLineIds.join(",")}))`);
      if (variationLineIds.length) filters.push(`and(document_kind.eq.variation_line,document_line_id.in.(${variationLineIds.join(",")}))`);
      const rows = await unwrap(this.admin.from("commercial_item_document_links").select("*")
        .eq("organization_id", organizationId).or(filters.join(",")));
      for (const row of rows) {
        const kind = stringValue(row, "document_kind");
        const documentType = kind === "quote_line" ? "project_quote_line_item"
          : kind === "variation_line" ? "project_variation_line_item"
          : "project_purchase_order_line_item";
        const from = { entityType: documentType as CommercialLineageEntityType, entityId: stringValue(row, "document_line_id")! };
        const to = { entityType: "commercial_item" as const, entityId: stringValue(row, "commercial_item_id")! };
        refs.push(from, to);
        edges.push({
          id: `document-link:${stringValue(row, "id")}`,
          organizationId,
          projectId: null,
          from,
          to,
          relationshipType: "commercial_item_document_link",
          representation: "document_link",
          evidenceSource: "commercial_item_document_links",
          evidenceVersion: "v1",
          evidenceRef: { documentId: stringValue(row, "document_id"), linkRole: stringValue(row, "link_role") },
          createdAt: stringValue(row, "created_at"),
          supersededAt: null,
        });
      }
    })());

    const addReverseQueries = (
      table: string,
      ids: string[],
      fromType: CommercialLineageEntityType,
      specs: Array<{ field: string; toType: CommercialLineageEntityType; relationshipType: CommercialLineageRelationshipType }>,
    ) => {
      if (!ids.length) return;
      tasks.push((async () => {
        const rows = await unwrap(this.admin.from(table).select("*").eq("organization_id", organizationId)
          .or(specs.map(({ field }) => `${field}.in.(${ids.join(",")})`).join(",")));
        rows.forEach((row) => {
          refs.push({ entityType: fromType, entityId: stringValue(row, "id")! });
          specs.forEach((spec) => {
            if (ids.includes(stringValue(row, spec.field) ?? "")) {
              addFk({ edges, refs, row, fromType, ...spec });
            }
          });
        });
      })());
    };
    addReverseQueries("project_actual_cost_events", allocationIds, "project_actual_cost_event", [
      { field: "supplier_invoice_line_allocation_id", toType: "supplier_invoice_line_allocation", relationshipType: "posted_from_allocation" },
    ]);
    addReverseQueries("project_actual_cost_events", poLineIds, "project_actual_cost_event", [
      { field: "purchase_order_line_item_id", toType: "project_purchase_order_line_item", relationshipType: "posted_from_purchase_order_line" },
    ]);
    addReverseQueries("supplier_invoice_line_allocations", poLineIds, "supplier_invoice_line_allocation", [
      { field: "purchase_order_line_item_id", toType: "project_purchase_order_line_item", relationshipType: "allocated_to_purchase_order_line" },
    ]);
    addReverseQueries("project_purchase_order_line_items", poIds, "project_purchase_order_line_item", [
      { field: "purchase_order_id", toType: "project_purchase_order", relationshipType: "belongs_to_purchase_order" },
    ]);
    addReverseQueries("supplier_invoice_line_allocations", poIds, "supplier_invoice_line_allocation", [
      { field: "purchase_order_id", toType: "project_purchase_order", relationshipType: "allocated_to_purchase_order" },
    ]);
    addReverseQueries("project_actual_cost_events", poIds, "project_actual_cost_event", [
      { field: "purchase_order_id", toType: "project_purchase_order", relationshipType: "posted_from_purchase_order" },
    ]);
    addReverseQueries("supplier_invoice_line_allocations", costItemIds, "supplier_invoice_line_allocation", [
      { field: "cost_item_id", toType: "cost_item", relationshipType: "costed_by" },
      { field: "source_cost_item_id", toType: "cost_item", relationshipType: "sourced_from_cost_item" },
    ]);
    addReverseQueries("project_purchase_order_line_items", costItemIds, "project_purchase_order_line_item", [
      { field: "cost_item_id", toType: "cost_item", relationshipType: "costed_by" },
      { field: "source_cost_item_id", toType: "cost_item", relationshipType: "sourced_from_cost_item" },
    ]);
    addReverseQueries("project_actual_cost_events", costItemIds, "project_actual_cost_event", [
      { field: "cost_item_id", toType: "cost_item", relationshipType: "costed_by" },
      { field: "source_cost_item_id", toType: "cost_item", relationshipType: "sourced_from_cost_item" },
    ]);
    addReverseQueries("supplier_invoice_line_allocations", invoiceIds, "supplier_invoice_line_allocation", [
      { field: "supplier_invoice_id", toType: "supplier_invoice", relationshipType: "allocated_from_invoice" },
    ]);
    addReverseQueries("project_actual_cost_events", invoiceIds, "project_actual_cost_event", [
      { field: "supplier_invoice_id", toType: "supplier_invoice", relationshipType: "posted_from_invoice" },
    ]);
    addReverseQueries("supplier_invoice_line_allocations", invoiceLineIds, "supplier_invoice_line_allocation", [
      { field: "supplier_invoice_line_id", toType: "supplier_invoice_line", relationshipType: "allocated_from_invoice_line" },
    ]);
    addReverseQueries("project_actual_cost_events", invoiceLineIds, "project_actual_cost_event", [
      { field: "supplier_invoice_line_id", toType: "supplier_invoice_line", relationshipType: "posted_from_invoice_line" },
    ]);

    if (costItemIds.length) tasks.push((async () => {
      const rows = await unwrap(this.admin.from("cost_items").select("*")
        .eq("organization_id", organizationId).in("id", costItemIds));
      for (const row of rows) {
        addFk({ edges, refs, row, fromType: "cost_item", field: "linked_quote_line_item_id", toType: "project_quote_line_item", relationshipType: "sourced_from_document_line" });
        addFk({ edges, refs, row, fromType: "cost_item", field: "linked_opportunity_quote_line_item_id", toType: "project_quote_line_item", relationshipType: "sourced_from_document_line" });
        addFk({ edges, refs, row, fromType: "cost_item", field: "linked_variation_line_item_id", toType: "project_variation_line_item", relationshipType: "sourced_from_document_line" });
      }
    })());

    await Promise.all(tasks);
    return { edges, refs, boundaries };
  }

  async expand(params: {
    organizationId: string;
    frontier: CommercialLineageEntityRef[];
    includeSuperseded: boolean;
  }): Promise<CommercialLineageExpansion> {
    const [typedEdges, strong] = await Promise.all([
      this.typedEdges(params.organizationId, params.frontier, params.includeSuperseded),
      this.strongConnections(params.organizationId, params.frontier),
    ]);
    const refs = [...typedEdges.flatMap((edge) => [edge.from, edge.to]), ...strong.refs];
    const authorizedNodes = await this.loadAuthorizedNodes(refs);
    const visibleEdges = [...typedEdges, ...strong.edges].filter((edge) =>
      authorizedNodes.has(commercialLineageEntityKey(edge.from))
      && authorizedNodes.has(commercialLineageEntityKey(edge.to)));
    const permissionBoundaries = refs
      .filter((ref) => !authorizedNodes.has(commercialLineageEntityKey(ref)))
      .map((ref): CommercialLineageUnknownBoundary => ({
        ...ref, status: "partial", dimension: "permission", reason: "branch_not_accessible",
      }));
    const allVisibleEdges = visibleEdges;
    const visibleBoundaries = strong.boundaries.filter((boundary) => {
      if (boundary.reason !== "manual_purchase_order_line_has_no_factual_source") return true;
      return !allVisibleEdges.some((edge) =>
        commercialLineageEntityKey(edge.from) === commercialLineageEntityKey(boundary)
        && edge.relationshipType !== "belongs_to_purchase_order");
    });
    return {
      nodes: [...authorizedNodes.values()],
      edges: allVisibleEdges,
      unknownBoundaries: [...visibleBoundaries, ...permissionBoundaries],
    };
  }

  async summarizeFinancials(params: {
    organizationId: string;
    nodes: CommercialLineageNode[];
  }): Promise<CommercialLineageFinancialSummary> {
    const grouped = groupRefs(params.nodes);
    const poLineIds = grouped.get("project_purchase_order_line_item") ?? [];
    const actualIds = grouped.get("project_actual_cost_event") ?? [];
    const [poLines, actuals] = await Promise.all([
      poLineIds.length
        ? unwrap(this.authorized.from("project_purchase_order_line_items").select("id,total")
          .eq("organization_id", params.organizationId).in("id", poLineIds))
        : [],
      actualIds.length
        ? unwrap(this.authorized.from("project_actual_cost_events").select("id,event_type,event_status,total_amount")
          .eq("organization_id", params.organizationId).in("id", actualIds))
        : [],
    ]);
    const committed = poLines.reduce((sum, row) => sum + numberValue(row, "total"), 0);
    const posted = actuals.filter((row) => stringValue(row, "event_status") === "posted");
    const actual = posted.filter((row) => stringValue(row, "event_type") !== "reversal")
      .reduce((sum, row) => sum + numberValue(row, "total_amount"), 0);
    const reversed = posted.filter((row) => stringValue(row, "event_type") === "reversal")
      .reduce((sum, row) => sum + Math.abs(numberValue(row, "total_amount")), 0);
    const netActual = posted.reduce((sum, row) => sum + numberValue(row, "total_amount"), 0);
    return { committed, actual, reversed, netActual };
  }
}
