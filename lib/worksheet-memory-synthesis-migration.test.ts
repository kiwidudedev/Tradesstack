import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260608093000_add_worksheet_memory_synthesis.sql",
  "utf8",
);
const truthfulnessSql = readFileSync(
  "supabase/migrations/20260611133000_fix_stage8_truthfulness_and_provenance.sql",
  "utf8",
);
const identitySql = readFileSync(
  "supabase/migrations/20260611143000_add_stage8_memory_identity_column.sql",
  "utf8",
);
const reportingSql = readFileSync(
  "supabase/migrations/20260611152000_fix_stage8_reporting_truthfulness.sql",
  "utf8",
);
const synthesisHistorySql = readFileSync(
  "supabase/migrations/20260612090000_add_stage8_synthesis_history.sql",
  "utf8",
);
const synthesisHistoryHardeningSql = readFileSync(
  "supabase/migrations/20260612100000_harden_stage8_synthesis_history_immutability.sql",
  "utf8",
);
const lifecycleHistorySql = readFileSync(
  "supabase/migrations/20260612113000_add_organization_memory_lifecycle_history.sql",
  "utf8",
);
const reinforcementFoundationsSql = readFileSync(
  "supabase/migrations/20260612123000_add_reinforcement_foundations.sql",
  "utf8",
);
const reinforcementLogicSql = readFileSync(
  "supabase/migrations/20260612133000_add_memory_reinforcement_lifecycle_metadata.sql",
  "utf8",
);
const confidenceHistorySql = readFileSync(
  "supabase/migrations/20260612143000_add_organization_memory_confidence_history.sql",
  "utf8",
);
const contradictionFoundationsSql = readFileSync(
  "supabase/migrations/20260612153000_add_contradiction_foundations.sql",
  "utf8",
);
const contradictionLogicSql = readFileSync(
  "supabase/migrations/20260612161500_add_memory_contradiction_lifecycle_metadata.sql",
  "utf8",
);
const supersessionFoundationsSql = readFileSync(
  "supabase/migrations/20260613091500_add_supersession_foundations.sql",
  "utf8",
);
const supersessionIdempotencySql = readFileSync(
  "supabase/migrations/20260613103000_add_deterministic_supersession_idempotency.sql",
  "utf8",
);
const retirementFoundationsSql = readFileSync(
  "supabase/migrations/20260613113000_add_retirement_foundations.sql",
  "utf8",
);
const duplicateSourceEntityLinkGuardSql = `
select organization_memory_item_id, source_entity_type, source_entity_id, link_type, count(*)
from public.organization_memory_links
where source_entity_type is not null and source_entity_id is not null
group by 1,2,3,4
having count(*) > 1;
`.trim();

describe("worksheet memory synthesis migration", () => {
  it("adds synthesis queue and runs tables with RLS and service-role-only access", () => {
    expect(sql).toContain("create table if not exists public.worksheet_memory_synthesis_queue");
    expect(sql).toContain("create table if not exists public.worksheet_memory_synthesis_runs");
    expect(sql).toContain("alter table public.worksheet_memory_synthesis_queue enable row level security;");
    expect(sql).toContain("alter table public.worksheet_memory_synthesis_queue force row level security;");
    expect(sql).toContain("revoke all on public.worksheet_memory_synthesis_queue from public, anon, authenticated;");
    expect(sql).toContain("grant select, insert, update on public.worksheet_memory_synthesis_queue to service_role;");
    expect(sql).toContain("grant select, insert, update on public.worksheet_memory_synthesis_runs to service_role;");
  });

  it("adds enqueue, claim, and finalize RPCs with lease expiry, retry, and dead-letter handling", () => {
    expect(sql).toContain("create or replace function public.enqueue_worksheet_memory_synthesis_queue");
    expect(sql).toContain("create or replace function public.claim_worksheet_memory_synthesis_batch");
    expect(sql).toContain("claim_expires_at <= now()");
    expect(sql).toContain("claim_token = gen_random_uuid()");
    expect(sql).toContain("create or replace function public.finalize_worksheet_memory_synthesis_batch");
    expect(sql).toContain("queue_state = 'retry_scheduled'");
    expect(sql).toContain("queue_state = 'dead_lettered'");
  });

  it("adds duplicate-prevention and supersession support for organization memory writes", () => {
    expect(sql).toContain("add column if not exists memory_signature text null");
    expect(sql).toContain("add column if not exists source_revision_hash text null");
    expect(sql).toContain("add column if not exists superseded_by_memory_id uuid null references public.organization_memory_items (id) on delete set null");
    expect(sql).toContain("create unique index if not exists organization_memory_items_org_active_signature_uidx");
    expect(sql).toContain("where memory_signature is not null and is_active");
    expect(identitySql).toContain("add column if not exists source_semantic_pool_id uuid null");
    expect(identitySql).toContain("references public.worksheet_memory_semantic_pools (id)");
    expect(identitySql).toContain("update public.organization_memory_items omi");
    expect(identitySql).toContain("create index if not exists organization_memory_items_org_source_semantic_pool_idx");
  });

  it("extends synthesis run reporting columns for truthful create vs reuse vs update outcomes", () => {
    expect(reportingSql).toContain("add column if not exists updated_memory_count integer not null default 0");
    expect(reportingSql).toContain("add column if not exists reused_memory_count integer not null default 0");
    expect(reportingSql).toContain("add column if not exists reconciled_memory_count integer not null default 0");
    expect(reportingSql).toContain("add column if not exists deactivated_duplicate_memory_count integer not null default 0");
    expect(reportingSql).toContain("worksheet_memory_synthesis_runs_updated_memory_count_non_negative");
    expect(reportingSql).toContain("worksheet_memory_synthesis_runs_reused_memory_count_non_negative");
    expect(reportingSql).toContain("worksheet_memory_synthesis_runs_reconciled_memory_count_non_negative");
    expect(reportingSql).toContain("worksheet_memory_synthesis_runs_deactivated_duplicate_memory_count_non_negative");
  });

  it("adds immutable Stage 8 synthesis history with org-scoped indexes and service-role writes", () => {
    expect(synthesisHistorySql).toContain("create table if not exists public.organization_memory_synthesis_history");
    expect(synthesisHistorySql).toContain("source_semantic_pool_id uuid not null references public.worksheet_memory_semantic_pools");
    expect(synthesisHistorySql).toContain("synthesis_queue_row_id uuid not null references public.worksheet_memory_synthesis_queue");
    expect(synthesisHistorySql).toContain("synthesis_run_id uuid not null references public.worksheet_memory_synthesis_runs");
    expect(synthesisHistorySql).toContain("evidence_snapshot jsonb not null default '{}'::jsonb");
    expect(synthesisHistorySql).toContain("before_memory_snapshot jsonb null");
    expect(synthesisHistorySql).toContain("after_memory_snapshot jsonb null");
    expect(synthesisHistorySql).toContain("duplicate_deactivation_snapshot jsonb not null default '{}'::jsonb");
    expect(synthesisHistorySql).toContain("create unique index if not exists omsh_org_queue_run_uidx");
    expect(synthesisHistorySql).toContain("alter table public.organization_memory_synthesis_history enable row level security;");
    expect(synthesisHistorySql).toContain("alter table public.organization_memory_synthesis_history force row level security;");
    expect(synthesisHistorySql).toContain("revoke all on public.organization_memory_synthesis_history from public, anon, authenticated;");
    expect(synthesisHistorySql).toContain("grant select, insert on public.organization_memory_synthesis_history to service_role;");
  });

  it("hardens Stage 8 synthesis history with append-only trigger protection and recent-history index", () => {
    expect(synthesisHistoryHardeningSql).toContain(
      "create or replace function public.prevent_organization_memory_synthesis_history_mutation()"
    );
    expect(synthesisHistoryHardeningSql).toContain(
      "organization_memory_synthesis_history is append-only and cannot be %."
    );
    expect(synthesisHistoryHardeningSql).toContain(
      "create trigger organization_memory_synthesis_history_immutable_guard"
    );
    expect(synthesisHistoryHardeningSql).toContain(
      "before update or delete on public.organization_memory_synthesis_history"
    );
    expect(synthesisHistoryHardeningSql).toContain(
      "create index if not exists omsh_org_recent_created_idx"
    );
    expect(synthesisHistoryHardeningSql).toContain(
      "on public.organization_memory_synthesis_history (organization_id, created_at desc);"
    );
  });

  it("adds immutable memory lifecycle history with exact synthesis linkage and org-scoped indexes", () => {
    expect(lifecycleHistorySql).toContain("create table if not exists public.organization_memory_lifecycle_history");
    expect(lifecycleHistorySql).toContain("memory_id uuid not null references public.organization_memory_items (id) on delete cascade");
    expect(lifecycleHistorySql).toContain("synthesis_history_id uuid not null references public.organization_memory_synthesis_history (id) on delete cascade");
    expect(lifecycleHistorySql).toContain("lifecycle_event_type in (");
    expect(lifecycleHistorySql).toContain("'memory_created'");
    expect(lifecycleHistorySql).toContain("'memory_reused'");
    expect(lifecycleHistorySql).toContain("'memory_updated'");
    expect(lifecycleHistorySql).toContain("'memory_reconciled'");
    expect(lifecycleHistorySql).toContain("create unique index if not exists omlh_org_memory_synthesis_event_uidx");
    expect(lifecycleHistorySql).toContain("create index if not exists omlh_org_memory_created_idx");
    expect(lifecycleHistorySql).toContain("create index if not exists omlh_org_recent_created_idx");
    expect(lifecycleHistorySql).toContain("create index if not exists omlh_org_pool_created_idx");
    expect(lifecycleHistorySql).toContain("create index if not exists omlh_org_queue_created_idx");
    expect(lifecycleHistorySql).toContain("alter table public.organization_memory_lifecycle_history enable row level security;");
    expect(lifecycleHistorySql).toContain("alter table public.organization_memory_lifecycle_history force row level security;");
    expect(lifecycleHistorySql).toContain("revoke all on public.organization_memory_lifecycle_history from public, anon, authenticated;");
    expect(lifecycleHistorySql).toContain("grant select, insert on public.organization_memory_lifecycle_history to service_role;");
    expect(lifecycleHistorySql).toContain("create or replace function public.prevent_organization_memory_lifecycle_history_mutation()");
    expect(lifecycleHistorySql).toContain("organization_memory_lifecycle_history is append-only and cannot be %.");
    expect(lifecycleHistorySql).toContain("create trigger organization_memory_lifecycle_history_immutable_guard");
    expect(lifecycleHistorySql).toContain("before update or delete on public.organization_memory_lifecycle_history");
  });

  it("adds reinforcement foundation columns and allows future memory_reinforced lifecycle events", () => {
    expect(reinforcementFoundationsSql).toContain("alter table public.organization_memory_items");
    expect(reinforcementFoundationsSql).toContain("add column if not exists last_reinforced_synthesis_history_id uuid null");
    expect(reinforcementFoundationsSql).toContain("add column if not exists last_reinforced_lifecycle_history_id uuid null");
    expect(reinforcementFoundationsSql).toContain("add column if not exists last_reinforced_source_revision_hash text null");
    expect(reinforcementFoundationsSql).toContain("add column if not exists reinforcement_basis_hash text null");
    expect(reinforcementFoundationsSql).toContain("add column if not exists reinforced_supporting_classification_count integer not null default 0");
    expect(reinforcementFoundationsSql).toContain("organization_memory_items_reinforced_supporting_classification_count_non_negative");
    expect(reinforcementFoundationsSql).toContain("create index if not exists organization_memory_items_org_last_reinforced_idx");
    expect(reinforcementFoundationsSql).toContain("create index if not exists organization_memory_items_org_last_reinforced_synthesis_idx");
    expect(reinforcementFoundationsSql).toContain("create index if not exists organization_memory_items_org_last_reinforced_lifecycle_idx");
    expect(reinforcementFoundationsSql).toContain("drop constraint if exists omlh_lifecycle_event_type_check");
    expect(reinforcementFoundationsSql).toContain("'memory_reinforced'");
  });

  it("adds lifecycle metadata and reinforcement-basis idempotency support", () => {
    expect(reinforcementLogicSql).toContain("add column if not exists lifecycle_metadata jsonb not null default '{}'::jsonb");
    expect(reinforcementLogicSql).toContain("add constraint omlh_lifecycle_metadata_object_check");
    expect(reinforcementLogicSql).toContain("create unique index if not exists omlh_org_memory_reinforcement_basis_uidx");
    expect(reinforcementLogicSql).toContain("where lifecycle_event_type = 'memory_reinforced'");
    expect(reinforcementLogicSql).toContain("reinforcementBasisHash");
  });

  it("adds immutable confidence history plus cached confidence metadata on organization_memory_items", () => {
    expect(confidenceHistorySql).toContain("create table if not exists public.organization_memory_confidence_history");
    expect(confidenceHistorySql).toContain("confidence_before numeric null");
    expect(confidenceHistorySql).toContain("confidence_after numeric not null");
    expect(confidenceHistorySql).toContain("reason_type in (");
    expect(confidenceHistorySql).toContain("'memory_created'");
    expect(confidenceHistorySql).toContain("'reinforcement'");
    expect(confidenceHistorySql).toContain("'recalculation'");
    expect(confidenceHistorySql).toContain("create unique index if not exists omch_org_memory_lifecycle_reason_uidx");
    expect(confidenceHistorySql).toContain("create index if not exists omch_org_recent_created_idx");
    expect(confidenceHistorySql).toContain("alter table public.organization_memory_confidence_history enable row level security;");
    expect(confidenceHistorySql).toContain("alter table public.organization_memory_confidence_history force row level security;");
    expect(confidenceHistorySql).toContain("grant select, insert on public.organization_memory_confidence_history to service_role;");
    expect(confidenceHistorySql).toContain("create or replace function public.prevent_organization_memory_confidence_history_mutation()");
    expect(confidenceHistorySql).toContain("organization_memory_confidence_history is append-only and cannot be %.");
    expect(confidenceHistorySql).toContain("create trigger organization_memory_confidence_history_immutable_guard");
    expect(confidenceHistorySql).toContain("add column if not exists confidence_calculation_version integer not null default 1");
    expect(confidenceHistorySql).toContain("add column if not exists last_confidence_history_id uuid null");
    expect(confidenceHistorySql).toContain("add column if not exists last_confidence_calculated_at timestamptz null");
    expect(confidenceHistorySql).toContain("add column if not exists base_confidence_score numeric null");
    expect(confidenceHistorySql).toContain("add column if not exists confidence_reason_summary text null");
  });

  it("adds contradiction foundation columns and allows future contradiction lifecycle/confidence support", () => {
    expect(contradictionFoundationsSql).toContain("alter table public.organization_memory_items");
    expect(contradictionFoundationsSql).toContain("add column if not exists last_contradicted_synthesis_history_id uuid null");
    expect(contradictionFoundationsSql).toContain("add column if not exists last_contradicted_lifecycle_history_id uuid null");
    expect(contradictionFoundationsSql).toContain("add column if not exists last_contradicted_source_revision_hash text null");
    expect(contradictionFoundationsSql).toContain("add column if not exists contradiction_basis_hash text null");
    expect(contradictionFoundationsSql).toContain("add column if not exists contradicted_supporting_classification_count integer not null default 0");
    expect(contradictionFoundationsSql).toContain("add column if not exists contradiction_strength_score numeric null");
    expect(contradictionFoundationsSql).toContain("organization_memory_items_contradicted_supporting_classification_count_non_negative");
    expect(contradictionFoundationsSql).toContain("organization_memory_items_contradiction_strength_score_range_check");
    expect(contradictionFoundationsSql).toContain("create index if not exists organization_memory_items_org_last_contradicted_idx");
    expect(contradictionFoundationsSql).toContain("create index if not exists organization_memory_items_org_last_contradicted_synthesis_idx");
    expect(contradictionFoundationsSql).toContain("create index if not exists organization_memory_items_org_last_contradicted_lifecycle_idx");
    expect(contradictionFoundationsSql).toContain("create index if not exists organization_memory_items_org_contradiction_basis_idx");
    expect(contradictionFoundationsSql).toContain("'memory_contradicted'");
    expect(contradictionFoundationsSql).toContain("'contradiction'");
  });

  it("adds contradiction lifecycle metadata and contradiction-basis idempotency support", () => {
    expect(contradictionLogicSql).toContain("add column if not exists lifecycle_metadata jsonb not null default '{}'::jsonb");
    expect(contradictionLogicSql).toContain("add constraint omlh_lifecycle_metadata_object_check");
    expect(contradictionLogicSql).toContain("create unique index if not exists omlh_org_memory_contradiction_basis_uidx");
    expect(contradictionLogicSql).toContain("where lifecycle_event_type = 'memory_contradicted'");
    expect(contradictionLogicSql).toContain("contradictionBasisHash");
  });

  it("adds supersession foundation columns, indexes, and lifecycle support without destructive rewrites", () => {
    expect(supersessionFoundationsSql).toContain("add column if not exists memory_domain_signature text null");
    expect(supersessionFoundationsSql).toContain("add column if not exists superseded_at timestamptz null");
    expect(supersessionFoundationsSql).toContain("add column if not exists superseded_lifecycle_history_id uuid null");
    expect(supersessionFoundationsSql).toContain("references public.organization_memory_lifecycle_history (id) on delete set null");
    expect(supersessionFoundationsSql).toContain("add column if not exists superseded_by_synthesis_history_id uuid null");
    expect(supersessionFoundationsSql).toContain("references public.organization_memory_synthesis_history (id) on delete set null");
    expect(supersessionFoundationsSql).toContain("add column if not exists supersession_basis_hash text null");
    expect(supersessionFoundationsSql).toContain("add column if not exists supersession_reason_summary text null");
    expect(supersessionFoundationsSql).toContain("create index if not exists organization_memory_items_org_domain_signature_active_idx");
    expect(supersessionFoundationsSql).toContain("where memory_domain_signature is not null");
    expect(supersessionFoundationsSql).toContain("create index if not exists organization_memory_items_org_superseded_at_idx");
    expect(supersessionFoundationsSql).toContain("where superseded_at is not null");
    expect(supersessionFoundationsSql).toContain("create index if not exists organization_memory_items_org_superseded_lifecycle_idx");
    expect(supersessionFoundationsSql).toContain("where superseded_lifecycle_history_id is not null");
    expect(supersessionFoundationsSql).toContain("drop constraint if exists omlh_lifecycle_event_type_check");
    expect(supersessionFoundationsSql).toContain("'memory_superseded'");
    expect(supersessionFoundationsSql).not.toContain("update public.organization_memory_items");
    expect(supersessionFoundationsSql).not.toContain("delete from public.organization_memory_items");
  });

  it("adds DB-level idempotency protection for deterministic memory_superseded basis hashes", () => {
    expect(supersessionIdempotencySql).toContain("create unique index if not exists omlh_org_memory_supersession_basis_uidx");
    expect(supersessionIdempotencySql).toContain("on public.organization_memory_lifecycle_history");
    expect(supersessionIdempotencySql).toContain("lifecycle_event_type = 'memory_superseded'");
    expect(supersessionIdempotencySql).toContain("lifecycle_metadata ->> 'supersessionBasisHash'");
  });

  it("adds retirement fields and generalized lifecycle origins for future non-synthesis lifecycle events", () => {
    expect(retirementFoundationsSql).toContain("add column if not exists retired_at timestamptz null");
    expect(retirementFoundationsSql).toContain("add column if not exists retired_lifecycle_history_id uuid null");
    expect(retirementFoundationsSql).toContain("add column if not exists retired_by_synthesis_history_id uuid null");
    expect(retirementFoundationsSql).toContain("add column if not exists retirement_basis_hash text null");
    expect(retirementFoundationsSql).toContain("add column if not exists retirement_reason_summary text null");
    expect(retirementFoundationsSql).toContain("create index if not exists organization_memory_items_org_retired_at_idx");
    expect(retirementFoundationsSql).toContain("create index if not exists organization_memory_items_org_retired_lifecycle_idx");
    expect(retirementFoundationsSql).toContain("create index if not exists organization_memory_items_org_retirement_candidate_scan_idx");
    expect(retirementFoundationsSql).toContain("add column if not exists event_origin_type text not null default 'synthesis'");
    expect(retirementFoundationsSql).toContain("alter column source_semantic_pool_id drop not null");
    expect(retirementFoundationsSql).toContain("alter column source_revision_hash drop not null");
    expect(retirementFoundationsSql).toContain("alter column synthesis_history_id drop not null");
    expect(retirementFoundationsSql).toContain("alter column synthesis_queue_row_id drop not null");
    expect(retirementFoundationsSql).toContain("alter column synthesis_run_id drop not null");
    expect(retirementFoundationsSql).toContain("'memory_retired'");
    expect(retirementFoundationsSql).toContain("'retirement_evaluator'");
    expect(retirementFoundationsSql).toContain("'manual_admin'");
    expect(retirementFoundationsSql).toContain("add constraint omlh_synthesis_origin_linkage_check check");
    expect(retirementFoundationsSql).toContain("when event_origin_type = 'synthesis' then");
    expect(retirementFoundationsSql).toContain("create index if not exists omlh_org_origin_created_idx");
    expect(retirementFoundationsSql).toContain("create index if not exists omlh_org_memory_retired_created_idx");
  });

  it("adds provenance-friendly organization memory link uniqueness for semantic pools and classifications", () => {
    expect(sql).toContain("create unique index if not exists organization_memory_links_item_source_entity_role_uidx");
    expect(sql).toContain("on public.organization_memory_links (organization_memory_item_id, source_entity_type, source_entity_id, link_type)");
  });

  it("grants service_role access to organization memory writes for the worker", () => {
    expect(sql).toContain("grant select, insert, update on public.organization_memory_items to service_role;");
    expect(sql).toContain("grant select, insert, update on public.organization_memory_links to service_role;");
    expect(sql).toContain("grant execute on function public.claim_worksheet_memory_synthesis_batch(integer, uuid, text, integer) to service_role;");
  });

  it("extends provenance link roles and adds atomic provenance replacement for Stage 8 rewrites", () => {
    expect(truthfulnessSql).toContain("link_type in ('seed', 'supporting', 'confirmation', 'contradiction', 'supersession', 'uncertain', 'adjacent', 'excluded')");
    expect(truthfulnessSql).toContain("create or replace function public.replace_organization_memory_provenance_links");
    expect(truthfulnessSql).toContain("delete from public.organization_memory_links");
    expect(truthfulnessSql).toContain("insert into public.organization_memory_links");
    expect(truthfulnessSql).toContain("grant execute on function public.replace_organization_memory_provenance_links(uuid, uuid, jsonb) to service_role");
  });

  it("documents the duplicate source-entity link SQL guard needed before assuming source-entity uniqueness", () => {
    expect(duplicateSourceEntityLinkGuardSql).toContain("from public.organization_memory_links");
    expect(duplicateSourceEntityLinkGuardSql).toContain("where source_entity_type is not null and source_entity_id is not null");
    expect(duplicateSourceEntityLinkGuardSql).toContain("having count(*) > 1");
  });
});
