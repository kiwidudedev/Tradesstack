alter table public.worksheet_memory_semantic_pool_runs
  add column if not exists diagnostic_summary jsonb not null default '{}'::jsonb;

alter table public.worksheet_memory_semantic_pool_runs
  drop constraint if exists worksheet_memory_semantic_pool_runs_diagnostic_summary_object_check;

alter table public.worksheet_memory_semantic_pool_runs
  add constraint worksheet_memory_semantic_pool_runs_diagnostic_summary_object_check
  check (jsonb_typeof(diagnostic_summary) = 'object');
