create table if not exists public.organization_memory_confidence_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  memory_id uuid not null references public.organization_memory_items (id) on delete cascade,
  confidence_before numeric null,
  confidence_after numeric not null,
  confidence_delta numeric null,
  reason_type text not null,
  reason_summary text null,
  calculation_version integer not null default 1,
  calculation_inputs jsonb not null default '{}'::jsonb,
  contributor_snapshot jsonb not null default '{}'::jsonb,
  lifecycle_history_id uuid null references public.organization_memory_lifecycle_history (id) on delete set null,
  synthesis_history_id uuid null references public.organization_memory_synthesis_history (id) on delete set null,
  source_semantic_pool_id uuid null references public.worksheet_memory_semantic_pools (id) on delete set null,
  source_revision_hash text null,
  synthesis_queue_row_id uuid null references public.worksheet_memory_synthesis_queue (id) on delete set null,
  synthesis_run_id uuid null references public.worksheet_memory_synthesis_runs (id) on delete set null,
  is_recalculation boolean not null default false,
  manual_actor_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint omch_reason_type_check check (
    reason_type in (
      'memory_created',
      'reinforcement',
      'recalculation',
      'contradiction',
      'supersession',
      'retirement',
      'manual_adjustment'
    )
  ),
  constraint omch_calculation_version_positive check (calculation_version > 0),
  constraint omch_calculation_inputs_object_check check (jsonb_typeof(calculation_inputs) = 'object'),
  constraint omch_contributor_snapshot_object_check check (jsonb_typeof(contributor_snapshot) = 'object'),
  constraint omch_source_revision_hash_not_blank check (
    source_revision_hash is null or char_length(trim(source_revision_hash)) > 0
  )
);

create unique index if not exists omch_org_memory_lifecycle_reason_uidx
  on public.organization_memory_confidence_history (
    organization_id,
    memory_id,
    lifecycle_history_id,
    reason_type
  )
  where lifecycle_history_id is not null;

create index if not exists omch_org_memory_created_idx
  on public.organization_memory_confidence_history (organization_id, memory_id, created_at desc);

create index if not exists omch_org_recent_created_idx
  on public.organization_memory_confidence_history (organization_id, created_at desc);

create index if not exists omch_org_pool_created_idx
  on public.organization_memory_confidence_history (
    organization_id,
    source_semantic_pool_id,
    created_at desc
  )
  where source_semantic_pool_id is not null;

create index if not exists omch_org_synthesis_history_idx
  on public.organization_memory_confidence_history (organization_id, synthesis_history_id)
  where synthesis_history_id is not null;

create index if not exists omch_org_lifecycle_history_idx
  on public.organization_memory_confidence_history (organization_id, lifecycle_history_id)
  where lifecycle_history_id is not null;

alter table public.organization_memory_confidence_history enable row level security;
alter table public.organization_memory_confidence_history force row level security;

revoke all on public.organization_memory_confidence_history from public, anon, authenticated;

grant select, insert on public.organization_memory_confidence_history to service_role;

create or replace function public.prevent_organization_memory_confidence_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'organization_memory_confidence_history is append-only and cannot be %.', tg_op
    using errcode = '55000';
end;
$$;

drop trigger if exists organization_memory_confidence_history_immutable_guard
  on public.organization_memory_confidence_history;

create trigger organization_memory_confidence_history_immutable_guard
before update or delete on public.organization_memory_confidence_history
for each row
execute function public.prevent_organization_memory_confidence_history_mutation();

alter table public.organization_memory_items
  add column if not exists confidence_calculation_version integer not null default 1,
  add column if not exists last_confidence_history_id uuid null
    references public.organization_memory_confidence_history (id) on delete set null,
  add column if not exists last_confidence_calculated_at timestamptz null,
  add column if not exists base_confidence_score numeric null,
  add column if not exists confidence_reason_summary text null;

create index if not exists organization_memory_items_org_last_confidence_history_idx
  on public.organization_memory_items (organization_id, last_confidence_history_id)
  where last_confidence_history_id is not null;

create index if not exists organization_memory_items_org_last_confidence_calculated_idx
  on public.organization_memory_items (organization_id, last_confidence_calculated_at desc)
  where last_confidence_calculated_at is not null;
