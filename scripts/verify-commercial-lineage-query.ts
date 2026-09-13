import { createClient } from "@supabase/supabase-js";
import { SupabaseCommercialLineageDataSource, type CommercialLineageSupabaseClient } from "@/lib/commercial-lineage/supabase-data-source";
import { getCommercialLineageFromDataSource } from "@/lib/commercial-lineage/traversal";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Supabase service-role environment is required.");
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const source = new SupabaseCommercialLineageDataSource(
  admin as unknown as CommercialLineageSupabaseClient,
  admin as unknown as CommercialLineageSupabaseClient,
);

async function main() {
const actualResponse = await admin.from("project_actual_cost_events")
  .select("id,organization_id,project_id").not("purchase_order_id", "is", null)
  .order("created_at", { ascending: false }).limit(1).single();
if (actualResponse.error) throw new Error(actualResponse.error.message);
const actual = await getCommercialLineageFromDataSource(source, {
  organizationId: actualResponse.data.organization_id,
  projectId: actualResponse.data.project_id,
  entityType: "project_actual_cost_event",
  entityId: actualResponse.data.id,
  direction: "upstream",
});

const scopeResponse = await admin.from("commercial_lineage_edges")
  .select("organization_id,to_entity_type,to_entity_id")
  .eq("relationship_type", "scoped_by").is("superseded_at", null).limit(1).single();
if (scopeResponse.error) throw new Error(scopeResponse.error.message);
const reverse = await getCommercialLineageFromDataSource(source, {
  organizationId: scopeResponse.data.organization_id,
  entityType: scopeResponse.data.to_entity_type as "project_quote" | "project_variation",
  entityId: scopeResponse.data.to_entity_id,
  direction: "downstream",
});

process.stdout.write(`${JSON.stringify({
  actualUpstream: {
    nodeCount: actual.nodes.length,
    edgeCount: actual.edges.length,
    nodeTypes: [...new Set(actual.nodes.map((node) => node.entityType))].sort(),
    unknownBoundaries: actual.unknownBoundaries,
    financialSummary: actual.financialSummary,
    truncation: actual.truncation,
  },
  sourceDownstream: {
    nodeCount: reverse.nodes.length,
    edgeCount: reverse.edges.length,
    nodeTypes: [...new Set(reverse.nodes.map((node) => node.entityType))].sort(),
    financialSummary: reverse.financialSummary,
    truncation: reverse.truncation,
  },
}, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
