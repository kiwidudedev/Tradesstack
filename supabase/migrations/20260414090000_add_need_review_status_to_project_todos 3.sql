alter table public.project_job_todos
  drop constraint if exists project_job_todos_status_check;

alter table public.project_job_todos
  add constraint project_job_todos_status_check
  check (status in ('To Do', 'In Progress', 'Need Review', 'Complete', 'Archived'));
