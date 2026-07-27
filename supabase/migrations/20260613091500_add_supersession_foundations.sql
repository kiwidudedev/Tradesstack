alter table public.organization_memory_items
  add column if not exists memory_domain_signature text null,
  add column if not exists superseded_at timestamptz null,
  add column if not exists superseded_lifecycle_history_id uuid null
    references public.organization_memory_lifecycle_history (id) on delete set null,
  add column if not exists superseded_by_synthesis_history_id uuid null
    references public.organization_memory_synthesis_history (id) on delete set null,
  add column if not exists supersession_basis_hash text null,
  add column if not exists supersession_reason_summary text null;

create index if not exists organization_memory_items_org_domain_signature_active_idx
  on public.organization_memory_items (organization_id, memory_domain_signature, is_active, updated_at desc)
  where memory_domain_signature is not null;

create index if not exists organization_memory_items_org_superseded_at_idx
  on public.organization_memory_items (organization_id, superseded_at desc)
  where superseded_at is not null;

create index if not exists organization_memory_items_org_superseded_lifecycle_idx
  on public.organization_memory_items (organization_id, superseded_lifecycle_history_id)
  where superseded_lifecycle_history_id is not null;

alter table public.organization_memory_lifecycle_history
  drop constraint if exists omlh_lifecycle_event_type_check;

alter table public.organization_memory_lifecycle_history
  add constraint omlh_lifecycle_event_type_check check (
    lifecycle_event_type in (
      'memory_created',
      'memory_reused',
      'memory_updated',
      'memory_reconciled',
      'memory_reinforced',
      'memory_contradicted',
      'memory_superseded'
    )
  );
