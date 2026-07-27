create table if not exists public.organization_memory_synthesis_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  memory_id uuid null references public.organization_memory_items (id) on delete set null,
  source_semantic_pool_id uuid not null references public.worksheet_memory_semantic_pools (id),
  source_revision_hash text not null,
  synthesis_queue_row_id uuid not null references public.worksheet_memory_synthesis_queue (id),
  synthesis_run_id uuid not null references public.worksheet_memory_synthesis_runs (id),
  synthesis_decision text not null,
  persistence_outcome text not null,
  provider text null,
  model text null,
  prompt_version text not null,
  schema_version integer not null default 1,
  decision_schema_version integer not null default 1,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  before_memory_snapshot jsonb null,
  after_memory_snapshot jsonb null,
  duplicate_deactivation_snapshot jsonb not null default '{}'::jsonb,
  reasoning_summary text null,
  created_at timestamptz not null default now(),
  constraint omsh_src_rev_not_blank check (char_length(trim(source_revision_hash)) > 0),
  constraint omsh_prompt_version_not_blank check (char_length(trim(prompt_version)) > 0),
  constraint omsh_schema_version_positive check (schema_version > 0),
  constraint omsh_decision_schema_version_positive check (decision_schema_version > 0),
  constraint omsh_synthesis_decision_check check (
    synthesis_decision in ('no_memory', 'create_memory', 'reinforce_existing_memory', 'supersede_existing_memory')
  ),
  constraint omsh_persistence_outcome_check check (
    persistence_outcome in ('none', 'created', 'reused', 'updated')
  )
);

create unique index if not exists omsh_org_queue_run_uidx
  on public.organization_memory_synthesis_history (organization_id, synthesis_queue_row_id, synthesis_run_id);

create index if not exists omsh_org_memory_created_idx
  on public.organization_memory_synthesis_history (organization_id, memory_id, created_at desc)
  where memory_id is not null;

create index if not exists omsh_org_pool_created_idx
  on public.organization_memory_synthesis_history (organization_id, source_semantic_pool_id, created_at desc);

create index if not exists omsh_org_queue_created_idx
  on public.organization_memory_synthesis_history (organization_id, synthesis_queue_row_id, created_at desc);

alter table public.organization_memory_synthesis_history enable row level security;
alter table public.organization_memory_synthesis_history force row level security;

revoke all on public.organization_memory_synthesis_history from public, anon, authenticated;

grant select, insert on public.organization_memory_synthesis_history to service_role;
