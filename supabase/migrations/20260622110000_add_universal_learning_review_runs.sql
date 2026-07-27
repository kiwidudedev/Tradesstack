create table if not exists public.learning_review_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  container_type text not null,
  scope_key text not null default 'organization',
  review_month date not null,
  run_type text not null default 'monthly',
  run_status text not null default 'pending',
  previous_cursor_updated_at timestamptz null,
  previous_cursor_id uuid null,
  candidate_next_cursor_updated_at timestamptz null,
  candidate_next_cursor_id uuid null,
  final_next_cursor_updated_at timestamptz null,
  final_next_cursor_id uuid null,
  selected_record_count integer not null default 0,
  memory_pack_count integer not null default 0,
  model_provider text null,
  model_name text null,
  prompt_version text not null default 'ucl-v1',
  prompt_hash text not null default '',
  response_hash text null,
  input_token_count integer null,
  output_token_count integer null,
  total_token_count integer null,
  duration_ms integer null,
  error_code text null,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_review_runs_container_type_not_blank check (char_length(trim(container_type)) > 0),
  constraint learning_review_runs_scope_key_not_blank check (char_length(trim(scope_key)) > 0),
  constraint learning_review_runs_run_type_check check (
    run_type in ('monthly', 'milestone', 'threshold', 'manual')
  ),
  constraint learning_review_runs_run_status_check check (
    run_status in ('pending', 'building', 'prompted', 'responded', 'applying', 'completed', 'failed', 'dead_lettered')
  ),
  constraint learning_review_runs_prompt_version_not_blank check (char_length(trim(prompt_version)) > 0),
  constraint learning_review_runs_prompt_hash_not_blank check (char_length(trim(prompt_hash)) > 0),
  constraint learning_review_runs_selected_record_count_nonnegative check (selected_record_count >= 0),
  constraint learning_review_runs_memory_pack_count_nonnegative check (memory_pack_count >= 0),
  constraint learning_review_runs_input_token_count_nonnegative check (input_token_count is null or input_token_count >= 0),
  constraint learning_review_runs_output_token_count_nonnegative check (output_token_count is null or output_token_count >= 0),
  constraint learning_review_runs_total_token_count_nonnegative check (total_token_count is null or total_token_count >= 0),
  constraint learning_review_runs_duration_ms_nonnegative check (duration_ms is null or duration_ms >= 0)
);

create index if not exists learning_review_runs_org_container_month_idx
  on public.learning_review_runs (organization_id, container_type, review_month desc, created_at desc);

create index if not exists learning_review_runs_org_status_created_idx
  on public.learning_review_runs (organization_id, run_status, created_at desc);

create index if not exists learning_review_runs_org_scope_month_idx
  on public.learning_review_runs (organization_id, scope_key, review_month desc, created_at desc);

create unique index if not exists learning_review_runs_org_container_scope_month_type_uidx
  on public.learning_review_runs (organization_id, container_type, scope_key, review_month, run_type, prompt_hash);

drop trigger if exists set_learning_review_runs_updated_at on public.learning_review_runs;
create trigger set_learning_review_runs_updated_at
before update on public.learning_review_runs
for each row execute function public.set_updated_at();

alter table public.learning_review_runs enable row level security;
alter table public.learning_review_runs force row level security;

grant select, insert, update on public.learning_review_runs to service_role;
