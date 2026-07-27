create table if not exists public.worksheet_memory_evidence_pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pool_signature text not null,
  scope_signature text not null,
  target_signature text not null,
  pool_kind text not null,
  event_type text not null,
  scope_context jsonb not null default '{}'::jsonb,
  target_context jsonb not null default '{}'::jsonb,
  evidence_count integer not null default 0,
  worksheet_count integer not null default 0,
  workbook_count integer not null default 0,
  project_count integer not null default 0,
  support_count integer not null default 0,
  contradiction_count integer not null default 0,
  ignored_count integer not null default 0,
  average_confidence numeric null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  pool_revision_hash text not null,
  maturity_status text not null default 'emerging',
  last_built_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_memory_evidence_pools_pool_signature_not_blank check (char_length(trim(pool_signature)) > 0),
  constraint worksheet_memory_evidence_pools_scope_signature_not_blank check (char_length(trim(scope_signature)) > 0),
  constraint worksheet_memory_evidence_pools_target_signature_not_blank check (char_length(trim(target_signature)) > 0),
  constraint worksheet_memory_evidence_pools_pool_kind_not_blank check (char_length(trim(pool_kind)) > 0),
  constraint worksheet_memory_evidence_pools_event_type_not_blank check (char_length(trim(event_type)) > 0),
  constraint worksheet_memory_evidence_pools_scope_context_object_check check (jsonb_typeof(scope_context) = 'object'),
  constraint worksheet_memory_evidence_pools_target_context_object_check check (jsonb_typeof(target_context) = 'object'),
  constraint worksheet_memory_evidence_pools_counts_nonnegative_check check (
    evidence_count >= 0
    and worksheet_count >= 0
    and workbook_count >= 0
    and project_count >= 0
    and support_count >= 0
    and contradiction_count >= 0
    and ignored_count >= 0
  ),
  constraint worksheet_memory_evidence_pools_average_confidence_range_check check (
    average_confidence is null or (average_confidence >= 0 and average_confidence <= 1)
  ),
  constraint worksheet_memory_evidence_pools_maturity_status_check check (
    maturity_status in ('emerging', 'ready_for_synthesis', 'reinforced', 'durable')
  )
);

create unique index if not exists worksheet_memory_evidence_pools_org_signature_uidx
  on public.worksheet_memory_evidence_pools (organization_id, pool_signature);

create index if not exists worksheet_memory_evidence_pools_org_maturity_idx
  on public.worksheet_memory_evidence_pools (organization_id, maturity_status, last_seen_at desc);

create index if not exists worksheet_memory_evidence_pools_org_kind_idx
  on public.worksheet_memory_evidence_pools (organization_id, pool_kind, event_type, updated_at desc);

create table if not exists public.worksheet_memory_evidence_pool_events (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.worksheet_memory_evidence_pools (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_event_id uuid not null references public.intelligence_events (id) on delete cascade,
  classification_record_id uuid null references public.worksheet_event_classifications (id) on delete set null,
  classification_version integer not null default 1,
  classification_attempt_number integer not null default 1,
  evidence_role text not null default 'supporting',
  event_confidence numeric null,
  occurred_at timestamptz not null,
  linked_at timestamptz not null default now(),
  constraint worksheet_memory_evidence_pool_events_version_positive check (classification_version > 0),
  constraint worksheet_memory_evidence_pool_events_attempt_positive check (classification_attempt_number > 0),
  constraint worksheet_memory_evidence_pool_events_confidence_range_check check (
    event_confidence is null or (event_confidence >= 0 and event_confidence <= 1)
  ),
  constraint worksheet_memory_evidence_pool_events_evidence_role_check check (
    evidence_role in ('supporting', 'contradictory', 'ignored')
  )
);

create unique index if not exists worksheet_memory_evidence_pool_events_pool_event_uidx
  on public.worksheet_memory_evidence_pool_events (pool_id, source_event_id);

create index if not exists worksheet_memory_evidence_pool_events_org_pool_idx
  on public.worksheet_memory_evidence_pool_events (organization_id, pool_id, occurred_at desc);

create index if not exists worksheet_memory_evidence_pool_events_source_idx
  on public.worksheet_memory_evidence_pool_events (source_event_id, linked_at desc);

create index if not exists worksheet_memory_evidence_pool_events_classification_idx
  on public.worksheet_memory_evidence_pool_events (classification_record_id)
  where classification_record_id is not null;

create trigger set_worksheet_memory_evidence_pools_updated_at
before update on public.worksheet_memory_evidence_pools
for each row execute function public.set_updated_at();

alter table public.worksheet_memory_evidence_pools enable row level security;
alter table public.worksheet_memory_evidence_pools force row level security;
alter table public.worksheet_memory_evidence_pool_events enable row level security;
alter table public.worksheet_memory_evidence_pool_events force row level security;

revoke all on public.worksheet_memory_evidence_pools from public, anon, authenticated;
revoke all on public.worksheet_memory_evidence_pool_events from public, anon, authenticated;

grant select, insert, update on public.worksheet_memory_evidence_pools to service_role;
grant select, insert, update on public.worksheet_memory_evidence_pool_events to service_role;
