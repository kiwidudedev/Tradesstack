alter table public.organization_memory_items
  add column if not exists retired_at timestamptz null,
  add column if not exists retired_lifecycle_history_id uuid null
    references public.organization_memory_lifecycle_history (id) on delete set null,
  add column if not exists retired_by_synthesis_history_id uuid null
    references public.organization_memory_synthesis_history (id) on delete set null,
  add column if not exists retirement_basis_hash text null,
  add column if not exists retirement_reason_summary text null;

create index if not exists organization_memory_items_org_retired_at_idx
  on public.organization_memory_items (organization_id, retired_at desc)
  where retired_at is not null;

create index if not exists organization_memory_items_org_retired_lifecycle_idx
  on public.organization_memory_items (organization_id, retired_lifecycle_history_id)
  where retired_lifecycle_history_id is not null;

create index if not exists organization_memory_items_org_retirement_candidate_scan_idx
  on public.organization_memory_items (
    organization_id,
    is_active,
    confidence_score,
    last_contradicted_at desc,
    last_reinforced_at desc
  )
  where is_active = true;

alter table public.organization_memory_lifecycle_history
  add column if not exists event_origin_type text not null default 'synthesis';

alter table public.organization_memory_lifecycle_history
  alter column source_semantic_pool_id drop not null,
  alter column source_revision_hash drop not null,
  alter column synthesis_history_id drop not null,
  alter column synthesis_queue_row_id drop not null,
  alter column synthesis_run_id drop not null;

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
      'memory_superseded',
      'memory_retired'
    )
  );

alter table public.organization_memory_lifecycle_history
  drop constraint if exists omlh_event_origin_type_check;

alter table public.organization_memory_lifecycle_history
  add constraint omlh_event_origin_type_check check (
    event_origin_type in (
      'synthesis',
      'retirement_evaluator',
      'manual_admin'
    )
  );

alter table public.organization_memory_lifecycle_history
  drop constraint if exists omlh_synthesis_origin_linkage_check;

alter table public.organization_memory_lifecycle_history
  add constraint omlh_synthesis_origin_linkage_check check (
    case
      when event_origin_type = 'synthesis' then
        source_semantic_pool_id is not null
        and source_revision_hash is not null
        and synthesis_history_id is not null
        and synthesis_queue_row_id is not null
        and synthesis_run_id is not null
      else true
    end
  );

create index if not exists omlh_org_origin_created_idx
  on public.organization_memory_lifecycle_history (organization_id, event_origin_type, created_at desc);

create index if not exists omlh_org_memory_retired_created_idx
  on public.organization_memory_lifecycle_history (organization_id, memory_id, created_at desc)
  where lifecycle_event_type = 'memory_retired';
