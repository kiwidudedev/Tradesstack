import {
  COMMERCIAL_LINEAGE_DEFAULT_DEPTH,
  COMMERCIAL_LINEAGE_MAX_DEPTH,
  commercialLineageEntityKey,
  type CommercialLineageDataSource,
  type CommercialLineageEdge,
  type CommercialLineageEntityRef,
  type CommercialLineageResult,
  type GetCommercialLineageInput,
} from "@/lib/commercial-lineage/types";

function followsDirection(
  edge: CommercialLineageEdge,
  frontierKeys: Set<string>,
  direction: NonNullable<GetCommercialLineageInput["direction"]>,
) {
  const fromInFrontier = frontierKeys.has(commercialLineageEntityKey(edge.from));
  const toInFrontier = frontierKeys.has(commercialLineageEntityKey(edge.to));
  if (direction === "upstream") return fromInFrontier;
  if (direction === "downstream") return toInFrontier;
  return fromInFrontier || toInFrontier;
}

function nextRefsForEdge(
  edge: CommercialLineageEdge,
  frontierKeys: Set<string>,
  direction: NonNullable<GetCommercialLineageInput["direction"]>,
) {
  const refs: CommercialLineageEntityRef[] = [];
  if ((direction === "upstream" || direction === "both") && frontierKeys.has(commercialLineageEntityKey(edge.from))) {
    refs.push(edge.to);
  }
  if ((direction === "downstream" || direction === "both") && frontierKeys.has(commercialLineageEntityKey(edge.to))) {
    refs.push(edge.from);
  }
  return refs;
}

export async function getCommercialLineageFromDataSource(
  dataSource: CommercialLineageDataSource,
  input: GetCommercialLineageInput,
): Promise<CommercialLineageResult> {
  const requestedDepth = input.maxDepth ?? COMMERCIAL_LINEAGE_DEFAULT_DEPTH;
  if (!Number.isInteger(requestedDepth) || requestedDepth < 0) {
    throw new Error("Commercial lineage depth must be a non-negative integer.");
  }
  const maxDepth = Math.min(requestedDepth, COMMERCIAL_LINEAGE_MAX_DEPTH);
  const direction = input.direction ?? "both";
  const rootRef = { entityType: input.entityType, entityId: input.entityId };
  const root = await dataSource.loadRoot({
    organizationId: input.organizationId,
    projectId: input.projectId,
    root: rootRef,
  });
  if (!root) throw new Error("Lineage root was not found or is not accessible.");

  const nodes = new Map([[commercialLineageEntityKey(root), root]]);
  const edges = new Map<string, CommercialLineageEdge>();
  const unknownBoundaries = new Map<string, CommercialLineageResult["unknownBoundaries"][number]>();
  let frontier: CommercialLineageEntityRef[] = [rootRef];
  let traversedDepth = 0;

  while (frontier.length > 0 && traversedDepth < maxDepth) {
    const frontierKeys = new Set(frontier.map(commercialLineageEntityKey));
    const visitedBeforeExpansion = new Set(nodes.keys());
    const expansion = await dataSource.expand({
      organizationId: input.organizationId,
      frontier,
      includeSuperseded: input.includeSuperseded ?? false,
    });
    expansion.nodes.forEach((node) => nodes.set(commercialLineageEntityKey(node), node));
    expansion.unknownBoundaries.forEach((boundary) => {
      unknownBoundaries.set(`${commercialLineageEntityKey(boundary)}:${boundary.dimension}:${boundary.reason}`, boundary);
    });

    const next = new Map<string, CommercialLineageEntityRef>();
    for (const edge of expansion.edges) {
      if (!followsDirection(edge, frontierKeys, direction)) continue;
      edges.set(edge.id, edge);
      for (const ref of nextRefsForEdge(edge, frontierKeys, direction)) {
        const key = commercialLineageEntityKey(ref);
        if (!nodes.has(key)) continue;
        if (!frontierKeys.has(key)) next.set(key, ref);
      }
    }

    traversedDepth += 1;
    frontier = [...next.entries()]
      .filter(([key]) => !visitedBeforeExpansion.has(key))
      .map(([, ref]) => ref);
  }

  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()];
  const financialSummary = await dataSource.summarizeFinancials({
    organizationId: input.organizationId,
    nodes: nodeList,
  });

  return {
    root,
    nodes: nodeList,
    edges: edgeList,
    financialSummary,
    unknownBoundaries: [...unknownBoundaries.values()],
    evidence: edgeList.map((edge) => ({
      edgeId: edge.id,
      source: edge.evidenceSource,
      version: edge.evidenceVersion,
      ref: edge.evidenceRef,
    })),
    truncation: {
      truncated: requestedDepth > COMMERCIAL_LINEAGE_MAX_DEPTH || frontier.length > 0,
      requestedDepth,
      traversedDepth,
      hardMaximumDepth: COMMERCIAL_LINEAGE_MAX_DEPTH,
    },
  };
}
