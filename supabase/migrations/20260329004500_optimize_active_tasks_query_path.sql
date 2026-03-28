create index if not exists project_job_todos_active_list_idx
  on public.project_job_todos (organization_id, project_id, status, due_at, due_date, updated_at desc)
  where status in ('To Do', 'In Progress');
