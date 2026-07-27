alter table public.organization_memory_items
  add column if not exists last_contradicted_synthesis_history_id uuid null
    references public.organization_memory_synthesis_history (id) on delete set null,
  add column if not exists last_contradicted_lifecycle_history_id uuid null
    references public.organization_memory_lifecycle_history (id) on delete set null,
  add column if not exists last_contradicted_source_revision_hash text null,
  add column if not exists contradiction_basis_hash text null,
  add column if not exists contradicted_supporting_classification_count integer not null default 0,
  add column if not exists contradiction_strength_score numeric null;

alter table public.organization_memory_items
  drop constraint if exists organization_memory_items_contradicted_supporting_classification_count_non_negative;

alter table public.organization_memory_items
  add constraint organization_memory_items_contradicted_supporting_classification_count_non_negative
  check (contradicted_supporting_classification_count >= 0);

alter table public.organization_memory_items
  drop constraint if exists organization_memory_items_contradiction_strength_score_range_check;

alter table public.organization_memory_items
  add constraint organization_memory_items_contradiction_strength_score_range_check
  check (
    contradiction_strength_score is null
    or (contradiction_strength_score >= 0 and contradiction_strength_score <= 1)
  );

create index if not exists organization_memory_items_org_last_contradicted_idx
  on public.organization_memory_items (organization_id, last_contradicted_at desc)
  where last_contradicted_at is not null;

create index if not exists organization_memory_items_org_last_contradicted_synthesis_idx
  on public.organization_memory_items (organization_id, last_contradicted_synthesis_history_id)
  where last_contradicted_synthesis_history_id is not null;

create index if not exists organization_memory_items_org_last_contradicted_lifecycle_idx
  on public.organization_memory_items (organization_id, last_contradicted_lifecycle_history_id)
  where last_contradicted_lifecycle_history_id is not null;

create index if not exists organization_memory_items_org_contradiction_basis_idx
  on public.organization_memory_items (organization_id, contradiction_basis_hash)
  where contradiction_basis_hash is not null;

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
      'memory_contradicted'
    )
  );

alter table public.organization_memory_confidence_history
  drop constraint if exists omch_reason_type_check;

alter table public.organization_memory_confidence_history
  add constraint omch_reason_type_check check (
    reason_type in (
      'memory_created',
      'reinforcement',
      'recalculation',
      'contradiction',
      'supersession',
      'retirement',
      'manual_adjustment'
    )
  );
