import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const protectedTables = [
  ["supplier_invoice_line_allocations", "id,organization_id,supplier_invoice_id,supplier_invoice_line_id,purchase_order_id,purchase_order_line_item_id,project_id,allocated_amount,allocated_quantity,cost_item_id,source_cost_item_id,tradesstack_cost_code,organization_cost_code_id,accounting_mapping_id,review_status,approval_status,updated_at"],
  ["project_actual_cost_events", "id,organization_id,project_id,supplier_invoice_id,supplier_invoice_line_id,supplier_invoice_line_allocation_id,purchase_order_id,purchase_order_line_item_id,cost_item_id,source_cost_item_id,tradesstack_cost_code,organization_cost_code_id,accounting_mapping_id,amount,tax_amount,total_amount,quantity,event_type,event_status,reverses_event_id,correction_root_event_id,posting_source,source_reference,created_at"],
  ["project_claims", "id,organization_id,project_id,status,claim_amount,net_claim_excl_gst,gst_amount,total_payable,retention_withheld_amount,retention_released_amount,updated_at"],
  ["retention_claims", "id,organization_id,project_id,status,subtotal_excl_tax,draft_revision,submission_state_hash,submission_eligibility_state_hash,updated_at"],
  ["organization_accounting_document_versions", "id,organization_id,document_id,status,content_hash,finance_hash,subtotal_snapshot,tax_total_snapshot,total_snapshot,created_at"],
];

function digest(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function fingerprintProtectedTables() {
  const result = {};
  for (const [table, columns] of protectedTables) {
    const { data, error } = await admin.from(table).select(columns).order("id");
    if (error) {
      result[table] = { unavailable: error.message };
      continue;
    }
    result[table] = { rows: data.length, sha256: digest(data) };
  }
  return result;
}

const before = await fingerprintProtectedTables();
let backfill = null;
if (process.argv.includes("--backfill")) {
  const evidenceBatchId = randomUUID();
  const { data, error } = await admin.rpc("backfill_commercial_lineage_edges", {
    p_evidence_batch_id: evidenceBatchId,
  });
  if (error) throw new Error(error.message);
  backfill = data;
}

const { data: edges, error: edgesError } = await admin
  .from("commercial_lineage_edges")
  .select("id,organization_id,project_id,from_entity_type,from_entity_id,to_entity_type,to_entity_id,relationship_type,evidence_source,evidence_version,evidence_batch_id,superseded_at")
  .order("id");
if (edgesError) throw new Error(edgesError.message);

const activeIdentities = new Set();
let duplicateActiveEdges = 0;
for (const edge of edges.filter((value) => value.superseded_at === null)) {
  const identity = [edge.organization_id, edge.from_entity_type, edge.from_entity_id,
    edge.to_entity_type, edge.to_entity_id, edge.relationship_type].join(":");
  if (activeIdentities.has(identity)) duplicateActiveEdges += 1;
  activeIdentities.add(identity);
}

const byRelationship = Object.fromEntries(
  [...new Set(edges.map((edge) => edge.relationship_type))].sort().map((relationship) => [
    relationship,
    edges.filter((edge) => edge.relationship_type === relationship).length,
  ]),
);
const after = await fingerprintProtectedTables();

process.stdout.write(`${JSON.stringify({
  backfill,
  edges: { total: edges.length, active: activeIdentities.size, byRelationship, duplicateActiveEdges },
  protectedFinancialRowsUnchanged: JSON.stringify(before) === JSON.stringify(after),
  protectedBefore: before,
  protectedAfter: after,
}, null, 2)}\n`);
