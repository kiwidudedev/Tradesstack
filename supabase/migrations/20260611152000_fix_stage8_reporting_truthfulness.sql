alter table public.worksheet_memory_synthesis_runs
  add column if not exists updated_memory_count integer not null default 0,
  add column if not exists reused_memory_count integer not null default 0,
  add column if not exists reconciled_memory_count integer not null default 0,
  add column if not exists deactivated_duplicate_memory_count integer not null default 0;

alter table public.worksheet_memory_synthesis_runs
  drop constraint if exists worksheet_memory_synthesis_runs_updated_memory_count_non_negative,
  drop constraint if exists worksheet_memory_synthesis_runs_reused_memory_count_non_negative,
  drop constraint if exists worksheet_memory_synthesis_runs_reconciled_memory_count_non_negative,
  drop constraint if exists worksheet_memory_synthesis_runs_deactivated_duplicate_memory_count_non_negative;

alter table public.worksheet_memory_synthesis_runs
  add constraint worksheet_memory_synthesis_runs_updated_memory_count_non_negative
    check (updated_memory_count >= 0),
  add constraint worksheet_memory_synthesis_runs_reused_memory_count_non_negative
    check (reused_memory_count >= 0),
  add constraint worksheet_memory_synthesis_runs_reconciled_memory_count_non_negative
    check (reconciled_memory_count >= 0),
  add constraint worksheet_memory_synthesis_runs_deactivated_duplicate_memory_count_non_negative
    check (deactivated_duplicate_memory_count >= 0);
