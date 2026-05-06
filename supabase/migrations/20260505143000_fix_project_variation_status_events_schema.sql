alter table public.project_variation_status_events
  add column if not exists event_type text,
  add column if not exists occurred_at timestamptz,
  add column if not exists metadata jsonb,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

update public.project_variation_status_events
set
  event_type = coalesce(
    event_type,
    case
      when to_status = 'Approved' then 'approved'
      else 'status_changed'
    end
  ),
  occurred_at = coalesce(occurred_at, changed_at),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_by = coalesce(created_by, changed_by)
where event_type is null
   or occurred_at is null
   or metadata is null
   or created_by is null;

alter table public.project_variation_status_events
  alter column event_type set default 'status_changed',
  alter column event_type set not null,
  alter column occurred_at set default now(),
  alter column occurred_at set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column to_status drop not null;

alter table public.project_variation_status_events
  drop constraint if exists project_variation_status_events_event_type_check;

alter table public.project_variation_status_events
  add constraint project_variation_status_events_event_type_check
  check (event_type in ('status_changed', 'approved'));

create index if not exists project_variation_status_events_variation_occurred_idx
  on public.project_variation_status_events (variation_id, occurred_at desc);
