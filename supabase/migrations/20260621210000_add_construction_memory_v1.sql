create table if not exists public.construction_memory_evidence_pool_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_event_id uuid not null unique references public.cost_construction_intelligence_events (id) on delete cascade,
  queue_state text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  retry_after timestamptz null,
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_error_code text null,
  last_error_message text null,
  last_attempt_at timestamptz null,
  last_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_memory_evidence_pool_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  ),
  constraint construction_memory_evidence_pool_queue_attempt_count_non_negative check (attempt_count >= 0),
  constraint construction_memory_evidence_pool_queue_max_attempts_positive check (max_attempts > 0),
  constraint construction_memory_evidence_pool_queue_priority_non_negative check (priority >= 0)
);

create index if not exists construction_memory_evidence_pool_queue_claimable_idx
  on public.construction_memory_evidence_pool_queue (organization_id, queue_state, available_at, claim_expires_at, priority desc);

create table if not exists public.construction_memory_evidence_pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pool_signature text not null,
  scope_signature text not null,
  target_signature text not null,
  semantic_seed_signature text null,
  pool_kind text not null,
  scope_context jsonb not null default '{}'::jsonb,
  target_context jsonb not null default '{}'::jsonb,
  evidence_count integer not null default 0,
  event_count integer not null default 0,
  project_count integer not null default 0,
  supplier_count integer not null default 0,
  support_count integer not null default 0,
  contradiction_count integer not null default 0,
  average_confidence numeric null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  supporting_event_ids jsonb not null default '[]'::jsonb,
  pool_revision_hash text not null,
  maturity_status text not null default 'emerging',
  last_built_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_memory_evidence_pools_pool_signature_not_blank check (char_length(trim(pool_signature)) > 0),
  constraint construction_memory_evidence_pools_scope_signature_not_blank check (char_length(trim(scope_signature)) > 0),
  constraint construction_memory_evidence_pools_target_signature_not_blank check (char_length(trim(target_signature)) > 0),
  constraint construction_memory_evidence_pools_pool_kind_not_blank check (char_length(trim(pool_kind)) > 0),
  constraint construction_memory_evidence_pools_scope_context_object_check check (jsonb_typeof(scope_context) = 'object'),
  constraint construction_memory_evidence_pools_target_context_object_check check (jsonb_typeof(target_context) = 'object'),
  constraint construction_memory_evidence_pools_supporting_event_ids_array_check check (jsonb_typeof(supporting_event_ids) = 'array'),
  constraint construction_memory_evidence_pools_counts_nonnegative_check check (
    evidence_count >= 0
    and event_count >= 0
    and project_count >= 0
    and supplier_count >= 0
    and support_count >= 0
    and contradiction_count >= 0
  ),
  constraint construction_memory_evidence_pools_average_confidence_range_check check (
    average_confidence is null or (average_confidence >= 0 and average_confidence <= 1)
  ),
  constraint construction_memory_evidence_pools_maturity_status_check check (
    maturity_status in ('emerging', 'ready_for_synthesis', 'reinforced', 'durable', 'contested')
  )
);

create unique index if not exists construction_memory_evidence_pools_org_signature_uidx
  on public.construction_memory_evidence_pools (organization_id, pool_signature);

create index if not exists construction_memory_evidence_pools_org_maturity_idx
  on public.construction_memory_evidence_pools (organization_id, maturity_status, last_seen_at desc);

create table if not exists public.construction_memory_evidence_pool_events (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.construction_memory_evidence_pools (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_event_id uuid not null references public.cost_construction_intelligence_events (id) on delete cascade,
  evidence_role text not null default 'supporting',
  event_confidence numeric null,
  occurred_at timestamptz not null,
  linked_at timestamptz not null default now(),
  constraint construction_memory_evidence_pool_events_role_check check (
    evidence_role in ('supporting', 'contradictory', 'ignored')
  ),
  constraint construction_memory_evidence_pool_events_confidence_range_check check (
    event_confidence is null or (event_confidence >= 0 and event_confidence <= 1)
  )
);

create unique index if not exists construction_memory_evidence_pool_events_pool_event_uidx
  on public.construction_memory_evidence_pool_events (pool_id, source_event_id);

create table if not exists public.construction_memory_semantic_pool_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  seed_pool_id uuid not null references public.construction_memory_evidence_pools (id) on delete cascade,
  seed_pool_signature text not null,
  seed_pool_revision_hash text not null,
  seed_maturity_status text not null,
  queue_state text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  retry_after timestamptz null,
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_error_code text null,
  last_error_message text null,
  last_attempt_at timestamptz null,
  last_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_memory_semantic_pool_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  )
);

create unique index if not exists construction_memory_semantic_pool_queue_seed_revision_uidx
  on public.construction_memory_semantic_pool_queue (organization_id, seed_pool_id, seed_pool_revision_hash);

create table if not exists public.construction_memory_semantic_pool_runs (
  id uuid primary key default gen_random_uuid(),
  requested_organization_id uuid null references public.organizations (id) on delete set null,
  claimed_job_count integer not null default 0,
  completed_job_count integer not null default 0,
  retried_job_count integer not null default 0,
  dead_lettered_job_count integer not null default 0,
  semantic_pool_count integer not null default 0,
  candidate_event_count integer not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.construction_memory_semantic_pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  semantic_signature text not null,
  semantic_family text null,
  semantic_type text null,
  pool_status text not null default 'active',
  maturity_status text not null default 'emerging',
  title text null,
  summary text null,
  retrieval_guidance text null,
  scope_payload jsonb not null default '{}'::jsonb,
  pool_value_payload jsonb not null default '{}'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  contradiction_summary jsonb not null default '{}'::jsonb,
  support_count integer not null default 0,
  contradiction_count integer not null default 0,
  ignored_count integer not null default 0,
  event_count integer not null default 0,
  project_count integer not null default 0,
  supplier_count integer not null default 0,
  average_confidence numeric null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_grouped_at timestamptz not null default now(),
  source_revision_hash text not null,
  created_by_run_id uuid null references public.construction_memory_semantic_pool_runs (id) on delete set null,
  last_updated_by_run_id uuid null references public.construction_memory_semantic_pool_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_memory_semantic_pools_signature_not_blank check (char_length(trim(semantic_signature)) > 0),
  constraint construction_memory_semantic_pools_scope_payload_object_check check (jsonb_typeof(scope_payload) = 'object'),
  constraint construction_memory_semantic_pools_pool_value_payload_object_check check (jsonb_typeof(pool_value_payload) = 'object'),
  constraint construction_memory_semantic_pools_evidence_summary_object_check check (jsonb_typeof(evidence_summary) = 'object'),
  constraint construction_memory_semantic_pools_contradiction_summary_object_check check (jsonb_typeof(contradiction_summary) = 'object'),
  constraint construction_memory_semantic_pools_pool_status_check check (
    pool_status in ('active', 'contested', 'stale', 'superseded', 'rejected')
  ),
  constraint construction_memory_semantic_pools_maturity_status_check check (
    maturity_status in ('emerging', 'ready_for_synthesis', 'reinforced', 'durable', 'contested')
  )
);

create unique index if not exists construction_memory_semantic_pools_org_signature_uidx
  on public.construction_memory_semantic_pools (organization_id, semantic_signature);

create table if not exists public.construction_memory_semantic_pool_events (
  id uuid primary key default gen_random_uuid(),
  semantic_pool_id uuid not null references public.construction_memory_semantic_pools (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_event_id uuid not null references public.cost_construction_intelligence_events (id) on delete cascade,
  evidence_role text not null,
  linked_by_run_id uuid null references public.construction_memory_semantic_pool_runs (id) on delete set null,
  linked_at timestamptz not null default now(),
  constraint construction_memory_semantic_pool_events_role_check check (
    evidence_role in ('supporting', 'contradictory', 'ignored')
  )
);

create unique index if not exists construction_memory_semantic_pool_events_pool_event_uidx
  on public.construction_memory_semantic_pool_events (semantic_pool_id, source_event_id);

create table if not exists public.construction_memory_synthesis_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  semantic_pool_id uuid not null references public.construction_memory_semantic_pools (id) on delete cascade,
  source_revision_hash text not null,
  queue_state text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  retry_after timestamptz null,
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_error_code text null,
  last_error_message text null,
  last_attempt_at timestamptz null,
  last_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_memory_synthesis_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  )
);

create unique index if not exists construction_memory_synthesis_queue_org_pool_revision_uidx
  on public.construction_memory_synthesis_queue (organization_id, semantic_pool_id, source_revision_hash);

create table if not exists public.construction_memory_synthesis_runs (
  id uuid primary key default gen_random_uuid(),
  requested_organization_id uuid null references public.organizations (id) on delete set null,
  claimed_job_count integer not null default 0,
  completed_job_count integer not null default 0,
  retried_job_count integer not null default 0,
  dead_lettered_job_count integer not null default 0,
  no_memory_count integer not null default 0,
  created_memory_count integer not null default 0,
  updated_memory_count integer not null default 0,
  reused_memory_count integer not null default 0,
  reinforced_memory_count integer not null default 0,
  contradicted_memory_count integer not null default 0,
  superseded_memory_count integer not null default 0,
  organization_memory_write_count integer not null default 0,
  provenance_link_count integer not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_memory_items
  add column if not exists source_memory_pool_type text null,
  add column if not exists source_memory_pool_id uuid null;

create index if not exists organization_memory_items_org_source_memory_pool_idx
  on public.organization_memory_items (organization_id, source_memory_pool_type, source_memory_pool_id, is_active, updated_at desc)
  where source_memory_pool_id is not null;

alter table public.organization_memory_synthesis_history
  alter column source_semantic_pool_id drop not null,
  alter column synthesis_queue_row_id drop not null,
  alter column synthesis_run_id drop not null,
  add column if not exists source_memory_pool_type text null,
  add column if not exists source_memory_pool_id uuid null,
  add column if not exists source_queue_type text null,
  add column if not exists source_queue_id uuid null,
  add column if not exists source_run_type text null,
  add column if not exists source_run_id uuid null;

create index if not exists omsh_org_source_memory_pool_created_idx
  on public.organization_memory_synthesis_history (organization_id, source_memory_pool_type, source_memory_pool_id, created_at desc)
  where source_memory_pool_id is not null;

alter table public.organization_memory_lifecycle_history
  add column if not exists source_memory_pool_type text null,
  add column if not exists source_memory_pool_id uuid null,
  add column if not exists source_queue_type text null,
  add column if not exists source_queue_id uuid null,
  add column if not exists source_run_type text null,
  add column if not exists source_run_id uuid null;

create index if not exists omlh_org_source_memory_pool_created_idx
  on public.organization_memory_lifecycle_history (organization_id, source_memory_pool_type, source_memory_pool_id, created_at desc)
  where source_memory_pool_id is not null;

alter table public.organization_memory_lifecycle_history
  drop constraint if exists omlh_synthesis_origin_linkage_check;

alter table public.organization_memory_lifecycle_history
  add constraint omlh_synthesis_origin_linkage_check check (
    case
      when event_origin_type = 'synthesis' then
        (
          source_semantic_pool_id is not null
          and source_revision_hash is not null
          and synthesis_history_id is not null
          and synthesis_queue_row_id is not null
          and synthesis_run_id is not null
        )
        or (
          source_memory_pool_type is not null
          and source_memory_pool_id is not null
          and source_revision_hash is not null
          and synthesis_history_id is not null
          and source_queue_type is not null
          and source_queue_id is not null
          and source_run_type is not null
          and source_run_id is not null
        )
      else true
    end
  );

alter table public.organization_memory_confidence_history
  add column if not exists source_memory_pool_type text null,
  add column if not exists source_memory_pool_id uuid null,
  add column if not exists source_queue_type text null,
  add column if not exists source_queue_id uuid null,
  add column if not exists source_run_type text null,
  add column if not exists source_run_id uuid null;

create index if not exists omch_org_source_memory_pool_created_idx
  on public.organization_memory_confidence_history (organization_id, source_memory_pool_type, source_memory_pool_id, created_at desc)
  where source_memory_pool_id is not null;

create trigger set_construction_memory_evidence_pool_queue_updated_at
before update on public.construction_memory_evidence_pool_queue
for each row execute function public.set_updated_at();

create trigger set_construction_memory_evidence_pools_updated_at
before update on public.construction_memory_evidence_pools
for each row execute function public.set_updated_at();

create trigger set_construction_memory_semantic_pool_queue_updated_at
before update on public.construction_memory_semantic_pool_queue
for each row execute function public.set_updated_at();

create trigger set_construction_memory_semantic_pool_runs_updated_at
before update on public.construction_memory_semantic_pool_runs
for each row execute function public.set_updated_at();

create trigger set_construction_memory_semantic_pools_updated_at
before update on public.construction_memory_semantic_pools
for each row execute function public.set_updated_at();

create trigger set_construction_memory_synthesis_queue_updated_at
before update on public.construction_memory_synthesis_queue
for each row execute function public.set_updated_at();

create trigger set_construction_memory_synthesis_runs_updated_at
before update on public.construction_memory_synthesis_runs
for each row execute function public.set_updated_at();

alter table public.construction_memory_evidence_pool_queue enable row level security;
alter table public.construction_memory_evidence_pool_queue force row level security;
alter table public.construction_memory_evidence_pools enable row level security;
alter table public.construction_memory_evidence_pools force row level security;
alter table public.construction_memory_evidence_pool_events enable row level security;
alter table public.construction_memory_evidence_pool_events force row level security;
alter table public.construction_memory_semantic_pool_queue enable row level security;
alter table public.construction_memory_semantic_pool_queue force row level security;
alter table public.construction_memory_semantic_pool_runs enable row level security;
alter table public.construction_memory_semantic_pool_runs force row level security;
alter table public.construction_memory_semantic_pools enable row level security;
alter table public.construction_memory_semantic_pools force row level security;
alter table public.construction_memory_semantic_pool_events enable row level security;
alter table public.construction_memory_semantic_pool_events force row level security;
alter table public.construction_memory_synthesis_queue enable row level security;
alter table public.construction_memory_synthesis_queue force row level security;
alter table public.construction_memory_synthesis_runs enable row level security;
alter table public.construction_memory_synthesis_runs force row level security;

revoke all on public.construction_memory_evidence_pool_queue from public, anon, authenticated;
revoke all on public.construction_memory_evidence_pools from public, anon, authenticated;
revoke all on public.construction_memory_evidence_pool_events from public, anon, authenticated;
revoke all on public.construction_memory_semantic_pool_queue from public, anon, authenticated;
revoke all on public.construction_memory_semantic_pool_runs from public, anon, authenticated;
revoke all on public.construction_memory_semantic_pools from public, anon, authenticated;
revoke all on public.construction_memory_semantic_pool_events from public, anon, authenticated;
revoke all on public.construction_memory_synthesis_queue from public, anon, authenticated;
revoke all on public.construction_memory_synthesis_runs from public, anon, authenticated;

grant select, insert, update, delete on public.construction_memory_evidence_pool_queue to service_role;
grant select, insert, update, delete on public.construction_memory_evidence_pools to service_role;
grant select, insert, update, delete on public.construction_memory_evidence_pool_events to service_role;
grant select, insert, update, delete on public.construction_memory_semantic_pool_queue to service_role;
grant select, insert, update, delete on public.construction_memory_semantic_pool_runs to service_role;
grant select, insert, update, delete on public.construction_memory_semantic_pools to service_role;
grant select, insert, update, delete on public.construction_memory_semantic_pool_events to service_role;
grant select, insert, update, delete on public.construction_memory_synthesis_queue to service_role;
grant select, insert, update, delete on public.construction_memory_synthesis_runs to service_role;
