create table if not exists public.organization_memory_lifecycle_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  memory_id uuid not null references public.organization_memory_items (id) on delete cascade,
  lifecycle_event_type text not null,
  created_at timestamptz not null default now(),
  source_semantic_pool_id uuid not null references public.worksheet_memory_semantic_pools (id),
  source_revision_hash text not null,
  synthesis_history_id uuid not null references public.organization_memory_synthesis_history (id) on delete cascade,
  synthesis_queue_row_id uuid not null references public.worksheet_memory_synthesis_queue (id),
  synthesis_run_id uuid not null references public.worksheet_memory_synthesis_runs (id),
  before_memory_snapshot jsonb null,
  after_memory_snapshot jsonb null,
  reason_summary text null,
  schema_version integer not null default 1,
  constraint omlh_source_revision_hash_not_blank check (char_length(trim(source_revision_hash)) > 0),
  constraint omlh_schema_version_positive check (schema_version > 0),
  constraint omlh_lifecycle_event_type_check check (
    lifecycle_event_type in (
      'memory_created',
      'memory_reused',
      'memory_updated',
      'memory_reconciled'
    )
  )
);

create unique index if not exists omlh_org_memory_synthesis_event_uidx
  on public.organization_memory_lifecycle_history (
    organization_id,
    memory_id,
    synthesis_history_id,
    lifecycle_event_type
  );

create index if not exists omlh_org_memory_created_idx
  on public.organization_memory_lifecycle_history (organization_id, memory_id, created_at desc);

create index if not exists omlh_org_recent_created_idx
  on public.organization_memory_lifecycle_history (organization_id, created_at desc);

create index if not exists omlh_org_pool_created_idx
  on public.organization_memory_lifecycle_history (organization_id, source_semantic_pool_id, created_at desc);

create index if not exists omlh_org_queue_created_idx
  on public.organization_memory_lifecycle_history (organization_id, synthesis_queue_row_id, created_at desc);

create index if not exists omlh_org_synthesis_history_idx
  on public.organization_memory_lifecycle_history (organization_id, synthesis_history_id);

alter table public.organization_memory_lifecycle_history enable row level security;
alter table public.organization_memory_lifecycle_history force row level security;

revoke all on public.organization_memory_lifecycle_history from public, anon, authenticated;

grant select, insert on public.organization_memory_lifecycle_history to service_role;

create or replace function public.prevent_organization_memory_lifecycle_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'organization_memory_lifecycle_history is append-only and cannot be %.', tg_op
    using errcode = '55000';
end;
$$;

drop trigger if exists organization_memory_lifecycle_history_immutable_guard
  on public.organization_memory_lifecycle_history;

create trigger organization_memory_lifecycle_history_immutable_guard
before update or delete on public.organization_memory_lifecycle_history
for each row
execute function public.prevent_organization_memory_lifecycle_history_mutation();
