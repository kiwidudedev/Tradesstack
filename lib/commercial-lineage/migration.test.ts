import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260824190000_add_commercial_lineage_edges.sql", import.meta.url),
  "utf8",
);

describe("commercial lineage database foundation", () => {
  it("is additive and keeps the entity namespace and relationship pairs allowlisted", () => {
    expect(migration).toContain("create table public.commercial_lineage_edges");
    expect(migration).toContain("resolve_commercial_lineage_entity_scope");
    expect(migration).toContain("commercial_lineage_relationship_is_allowed");
    expect(migration).toContain("commercial_lineage:unsupported_relationship_pair");
    expect(migration).not.toMatch(/execute\s+format/i);
  });

  it("enforces tenant, project, existence, duplicate, self-edge, and evidence integrity", () => {
    expect(migration).toContain("commercial_lineage:cross_organization_edge");
    expect(migration).toContain("commercial_lineage:project_mismatch");
    expect(migration).toContain("commercial_lineage:missing_from_entity");
    expect(migration).toContain("commercial_lineage_edges_active_identity_key");
    expect(migration).toContain("commercial_lineage_edges_no_self_edge_check");
    expect(migration).toContain("commercial_lineage_edges_evidence_ref_object_check");
    expect(migration).toContain("commercial_lineage_edges_evidence_ref_size_check");
    expect(migration).toContain("commercial_lineage:identity_and_evidence_are_immutable");
  });

  it("denies browser table writes and exposes only metadata-driven synchronization", () => {
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on public.commercial_lineage_edges from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.sync_commercial_item_lineage(uuid) to authenticated, service_role");
    expect(migration).not.toContain("grant insert on public.commercial_lineage_edges to authenticated");
  });

  it("normalizes only exact active Material bindings and exact Measurement versions", () => {
    expect(migration).toContain("binding.binding_state = 'active'");
    expect(migration).toContain("binding.workbook_id = item.source_workbook_id");
    expect(migration).toContain("binding.sheet_id = item.source_sheet_id");
    expect(migration).toContain("measurement.version = (measure ->> 'measurementVersion')::integer");
    expect(migration).toContain("measurement.archived_at is null");
    expect(migration).not.toMatch(/similarity|description\s*=|supplier_sku\s*=/i);
  });

  it("keeps backfills batch-auditable and service-role only", () => {
    expect(migration).toContain("p_evidence_batch_id uuid default gen_random_uuid()");
    expect(migration).toContain("'evidenceBatchId', p_evidence_batch_id");
    expect(migration).toContain("commercial_lineage:service_role_required");
  });
});

