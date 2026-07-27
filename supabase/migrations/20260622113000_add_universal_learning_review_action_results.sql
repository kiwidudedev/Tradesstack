create table if not exists public.learning_review_action_results (
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid not null references public.learning_review_runs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  learning_id text not null,
  action_key text not null,
  action_type text not null,
  target_memory_id uuid null references public.organization_memory_items (id) on delete set null,
  result_status text not null default 'applied',
  reason text null,
  confidence_adjustment numeric null,
  created_memory_id uuid null references public.organization_memory_items (id) on delete set null,
  updated_memory_id uuid null references public.organization_memory_items (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint learning_review_action_results_learning_id_not_blank check (char_length(trim(learning_id)) > 0),
  constraint learning_review_action_results_action_key_not_blank check (char_length(trim(action_key)) > 0),
  constraint learning_review_action_results_action_type_check check (
    action_type in ('create', 'reinforce', 'update', 'contradict', 'retire', 'no_action')
  ),
  constraint learning_review_action_results_result_status_check check (
    result_status in ('applied', 'skipped', 'deduplicated', 'failed')
  ),
  constraint learning_review_action_results_confidence_adjustment_range_check check (
    confidence_adjustment is null or (confidence_adjustment >= -1 and confidence_adjustment <= 1)
  )
);

create unique index if not exists learning_review_action_results_run_action_uidx
  on public.learning_review_action_results (review_run_id, action_key);

create index if not exists learning_review_action_results_org_created_idx
  on public.learning_review_action_results (organization_id, created_at desc);

alter table public.learning_review_action_results enable row level security;
alter table public.learning_review_action_results force row level security;

grant select, insert on public.learning_review_action_results to service_role;
