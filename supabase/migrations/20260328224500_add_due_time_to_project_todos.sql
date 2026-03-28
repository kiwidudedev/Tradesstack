alter table public.project_job_todos
  add column if not exists due_at timestamptz null;

update public.project_job_todos
set due_at = (due_date::text || ' 23:59:00+00')::timestamptz
where due_at is null and due_date is not null;

create index if not exists project_job_todos_org_project_due_at_idx
  on public.project_job_todos (organization_id, project_id, due_at, updated_at desc);
