import { createClient } from "@supabase/supabase-js";
import {
  inspectCommercialLineageIntegrity,
  type CommercialLineageEntityScope,
  type CommercialLineageIntegrityEdgeRow,
} from "@/lib/commercial-lineage/integrity";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Supabase service-role environment is required.");
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const tables = {
  commercial_item: { table: "commercial_items", projectScoped: true },
  organization_material: { table: "organization_materials", projectScoped: false },
  organization_material_supplier_product: { table: "organization_material_supplier_products", projectScoped: false },
  organization_material_supplier_price: { table: "organization_material_supplier_prices", projectScoped: false },
  takeoff_measurement: { table: "takeoff_measurements", projectScoped: true },
  project_quote: { table: "project_quotes", projectScoped: true },
  project_quote_line_item: { table: "project_quote_line_items", projectScoped: true },
  project_variation: { table: "project_variations", projectScoped: true },
  project_variation_line_item: { table: "project_variation_line_items", projectScoped: true },
  project_purchase_order_line_item: { table: "project_purchase_order_line_items", projectScoped: true },
} as const;

async function main() {
  const [edgeResult, itemResult] = await Promise.all([
    admin.from("commercial_lineage_edges").select("id,organization_id,project_id,from_entity_type,from_entity_id,to_entity_type,to_entity_id,relationship_type,superseded_at"),
    admin.from("commercial_items").select("id,organization_id,project_id,locked_metadata_json"),
  ]);
  if (edgeResult.error) throw new Error(edgeResult.error.message);
  if (itemResult.error) throw new Error(itemResult.error.message);
  const edges = edgeResult.data as CommercialLineageIntegrityEdgeRow[];
  const refs = new Map<string, Set<string>>();
  edges.forEach((edge) => {
    refs.set(edge.from_entity_type, (refs.get(edge.from_entity_type) ?? new Set()).add(edge.from_entity_id));
    refs.set(edge.to_entity_type, (refs.get(edge.to_entity_type) ?? new Set()).add(edge.to_entity_id));
  });
  const scopes = new Map<string, CommercialLineageEntityScope>();
  await Promise.all([...refs].map(async ([entityType, ids]) => {
    const definition = tables[entityType as keyof typeof tables];
    const result = await admin.from(definition.table)
      .select(definition.projectScoped ? "id,organization_id,project_id" : "id,organization_id").in("id", [...ids]);
    if (result.error) throw new Error(result.error.message);
    const rows = result.data as unknown as Array<{ id: string; organization_id: string; project_id?: string | null }>;
    rows.forEach((row) => scopes.set(`${entityType}:${row.id}`, {
      organizationId: row.organization_id,
      projectId: "project_id" in row && typeof row.project_id === "string" ? row.project_id : null,
    }));
  }));
  const findings = inspectCommercialLineageIntegrity({
    edges,
    commercialItems: itemResult.data,
    entityScopes: scopes,
  });
  process.stdout.write(`${JSON.stringify({
    edgesScanned: edges.length,
    commercialItemsScanned: itemResult.data.length,
    findingsByCode: Object.fromEntries([...new Set(findings.map((finding) => finding.code))]
      .sort().map((code) => [code, findings.filter((finding) => finding.code === code).length])),
    findings,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
