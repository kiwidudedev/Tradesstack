drop index if exists public.project_job_todos_dash_overdue_due_at_idx;
drop index if exists public.project_job_todos_dash_overdue_due_date_idx;

create index if not exists project_job_todos_dash_overdue_due_at_idx
  on public.project_job_todos (organization_id, project_id, due_at)
  where status not in ('Complete', 'Archived') and due_at is not null;

create index if not exists project_job_todos_dash_overdue_due_date_idx
  on public.project_job_todos (organization_id, project_id, due_date)
  where status not in ('Complete', 'Archived') and due_at is null;
