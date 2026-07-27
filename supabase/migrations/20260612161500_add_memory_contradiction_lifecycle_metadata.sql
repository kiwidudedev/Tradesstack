alter table public.organization_memory_lifecycle_history
  add column if not exists lifecycle_metadata jsonb not null default '{}'::jsonb;

alter table public.organization_memory_lifecycle_history
  drop constraint if exists omlh_lifecycle_metadata_object_check;

alter table public.organization_memory_lifecycle_history
  add constraint omlh_lifecycle_metadata_object_check
  check (jsonb_typeof(lifecycle_metadata) = 'object');

create unique index if not exists omlh_org_memory_contradiction_basis_uidx
  on public.organization_memory_lifecycle_history (
    organization_id,
    memory_id,
    ((lifecycle_metadata ->> 'contradictionBasisHash'))
  )
  where lifecycle_event_type = 'memory_contradicted'
    and coalesce(lifecycle_metadata ->> 'contradictionBasisHash', '') <> '';

create index if not exists omlh_org_memory_contradiction_event_created_idx
  on public.organization_memory_lifecycle_history (
    organization_id,
    memory_id,
    lifecycle_event_type,
    created_at desc
  )
  where lifecycle_event_type = 'memory_contradicted';
