alter table public.project_job_todos
  drop constraint if exists project_job_todos_status_check;

alter table public.project_job_todos
  add constraint project_job_todos_status_check
  check (status in ('To Do', 'In Progress', 'Complete', 'Archived'));

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
    elsif old.status in ('Complete', 'Archived') then
      new.status := 'To Do';
    end if;
  end if;

  new.is_completed := new.status in ('Complete', 'Archived');

  if new.is_completed then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

update public.project_job_todos
set is_completed = (status in ('Complete', 'Archived'))
where is_completed is distinct from (status in ('Complete', 'Archived'));
