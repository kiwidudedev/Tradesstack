alter table public.organization_memory_items
  add column if not exists last_reinforced_synthesis_history_id uuid null
    references public.organization_memory_synthesis_history (id) on delete set null,
  add column if not exists last_reinforced_lifecycle_history_id uuid null
    references public.organization_memory_lifecycle_history (id) on delete set null,
  add column if not exists last_reinforced_source_revision_hash text null,
  add column if not exists reinforcement_basis_hash text null,
  add column if not exists reinforced_supporting_classification_count integer not null default 0;

alter table public.organization_memory_items
  drop constraint if exists organization_memory_items_reinforced_supporting_classification_count_non_negative;

alter table public.organization_memory_items
  add constraint organization_memory_items_reinforced_supporting_classification_count_non_negative
  check (reinforced_supporting_classification_count >= 0);

create index if not exists organization_memory_items_org_last_reinforced_idx
  on public.organization_memory_items (organization_id, last_reinforced_at desc)
  where last_reinforced_at is not null;

create index if not exists organization_memory_items_org_last_reinforced_synthesis_idx
  on public.organization_memory_items (organization_id, last_reinforced_synthesis_history_id)
  where last_reinforced_synthesis_history_id is not null;

create index if not exists organization_memory_items_org_last_reinforced_lifecycle_idx
  on public.organization_memory_items (organization_id, last_reinforced_lifecycle_history_id)
  where last_reinforced_lifecycle_history_id is not null;

alter table public.organization_memory_lifecycle_history
  drop constraint if exists omlh_lifecycle_event_type_check;

alter table public.organization_memory_lifecycle_history
  add constraint omlh_lifecycle_event_type_check check (
    lifecycle_event_type in (
      'memory_created',
      'memory_reused',
      'memory_updated',
      'memory_reconciled',
      'memory_reinforced'
    )
  );
