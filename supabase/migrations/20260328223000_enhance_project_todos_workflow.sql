alter table public.project_job_todos
  add column if not exists trade text not null default '',
  add column if not exists priority text not null default 'Medium',
  add column if not exists status text not null default 'To Do',
  add column if not exists linked_inspection_id uuid null references public.project_quality_inspections (id) on delete set null;

update public.project_job_todos
set status = case when is_completed then 'Complete' else 'To Do' end
where status is null or status not in ('To Do', 'In Progress', 'Complete');

update public.project_job_todos
set priority = 'Medium'
where priority is null or priority not in ('Low', 'Medium', 'High');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_job_todos_priority_check'
      and conrelid = 'public.project_job_todos'::regclass
  ) then
    alter table public.project_job_todos
      add constraint project_job_todos_priority_check
      check (priority in ('Low', 'Medium', 'High'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_job_todos_status_check'
      and conrelid = 'public.project_job_todos'::regclass
  ) then
    alter table public.project_job_todos
      add constraint project_job_todos_status_check
      check (status in ('To Do', 'In Progress', 'Complete'));
  end if;
end
$$;

create or replace function public.sync_project_job_todo_completion_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := case when new.is_completed then 'Complete' else 'To Do' end;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status = old.status and new.is_completed is distinct from old.is_completed then
    if new.is_completed then
      new.status := 'Complete';
    elsif old.status = 'Complete' then
      new.status := 'To Do';
    end if;
  end if;

  new.is_completed := new.status = 'Complete';

  if new.is_completed then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_project_job_todo_completion_fields on public.project_job_todos;
create trigger sync_project_job_todo_completion_fields
before insert or update on public.project_job_todos
for each row
execute function public.sync_project_job_todo_completion_fields();

create index if not exists project_job_todos_org_project_status_due_assignee_idx
  on public.project_job_todos (organization_id, project_id, status, due_date, assigned_user_id, updated_at desc);

create index if not exists project_job_todos_org_project_priority_idx
  on public.project_job_todos (organization_id, project_id, priority, updated_at desc);
