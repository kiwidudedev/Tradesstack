create table if not exists public.learning_review_cursors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  container_type text not null,
  scope_key text not null default 'organization',
  last_successful_review_month date null,
  last_cursor_updated_at timestamptz null,
  last_cursor_id uuid null,
  last_run_id uuid null references public.learning_review_runs (id) on delete set null,
  last_record_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_review_cursors_container_type_not_blank check (char_length(trim(container_type)) > 0),
  constraint learning_review_cursors_scope_key_not_blank check (char_length(trim(scope_key)) > 0),
  constraint learning_review_cursors_last_record_count_nonnegative check (last_record_count >= 0)
);

create unique index if not exists learning_review_cursors_org_container_scope_uidx
  on public.learning_review_cursors (organization_id, container_type, scope_key);

create index if not exists learning_review_cursors_org_month_idx
  on public.learning_review_cursors (organization_id, last_successful_review_month desc, updated_at desc);

drop trigger if exists set_learning_review_cursors_updated_at on public.learning_review_cursors;
create trigger set_learning_review_cursors_updated_at
before update on public.learning_review_cursors
for each row execute function public.set_updated_at();

alter table public.learning_review_cursors enable row level security;
alter table public.learning_review_cursors force row level security;

grant select, insert, update on public.learning_review_cursors to service_role;
