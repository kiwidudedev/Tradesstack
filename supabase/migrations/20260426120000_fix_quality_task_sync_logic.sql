alter table public.project_quality_issues
  drop constraint if exists project_quality_issues_status_check;

alter table public.project_quality_issues
  add constraint project_quality_issues_status_check
  check (status in ('Open', 'In Progress', 'Blocked', 'Requires Attention', 'Complete', 'Verified'));

update public.project_job_todos
set source_type = 'quality_issue'
where source_type = 'qa_issue';

update public.project_job_todos
set source_type = 'quality_inspection_item'
where source_type = 'inspection_fail';

alter table public.project_job_todos
  drop constraint if exists project_job_todos_source_type_check;

alter table public.project_job_todos
  add constraint project_job_todos_source_type_check
  check (source_type is null or source_type in ('quality_issue', 'quality_inspection_item'));

drop index if exists project_job_todos_source_unique_idx;

with ranked_todos as (
  select
    id,
    row_number() over (
      partition by project_id, source_type, source_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_number
  from public.project_job_todos
  where source_type is not null
    and source_id is not null
)
delete from public.project_job_todos todos
using ranked_todos
where todos.id = ranked_todos.id
  and ranked_todos.row_number > 1;

create unique index if not exists project_job_todos_source_unique_idx
  on public.project_job_todos (project_id, source_type, source_id)
  where source_type is not null and source_id is not null;

create or replace function public.sync_project_todo_from_quality_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_closed boolean;
begin
  is_closed := new.status in ('Complete', 'Verified');

  insert into public.project_job_todos (
    organization_id,
    project_id,
    opportunity_id,
    created_by,
    title,
    description,
    due_date,
    is_completed,
    completed_at,
    status,
    source_type,
    source_id,
    linked_issue_id
  )
  values (
    new.organization_id,
    new.project_id,
    (
      select o.id
      from public.organization_opportunities o
      where o.workspace_project_id = new.project_id
        and o.organization_id = new.organization_id
      limit 1
    ),
    new.created_by,
    new.title,
    format('Auto-linked from Quality Assurance issue (%s - %s).', nullif(new.trade, ''), nullif(new.location, '')),
    new.due_date,
    is_closed,
    case when is_closed then coalesce(now(), now()) else null end,
    case when is_closed then 'Done' else 'To Do' end,
    'quality_issue',
    new.id,
    new.id
  )
  on conflict (project_id, source_type, source_id) where source_type is not null and source_id is not null
  do update set
    title = excluded.title,
    description = excluded.description,
    due_date = excluded.due_date,
    linked_issue_id = excluded.linked_issue_id,
    is_completed = excluded.is_completed,
    completed_at = case
      when excluded.is_completed then coalesce(project_job_todos.completed_at, now())
      else null
    end,
    status = excluded.status,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_project_todo_from_inspection_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inspection_title text;
  inspection_scheduled_at timestamptz;
  inspection_opportunity_id uuid;
  is_failed boolean;
begin
  select i.title, i.scheduled_at, p.source_opportunity_id
  into inspection_title, inspection_scheduled_at, inspection_opportunity_id
  from public.project_quality_inspections i
  join public.organization_projects p on p.id = i.project_id
  where i.id = new.inspection_id;

  is_failed := new.status = 'fail';

  insert into public.project_job_todos (
    organization_id,
    project_id,
    opportunity_id,
    created_by,
    title,
    description,
    due_date,
    is_completed,
    completed_at,
    status,
    source_type,
    source_id,
    linked_inspection_item_id
  )
  values (
    new.organization_id,
    new.project_id,
    inspection_opportunity_id,
    new.created_by,
    concat(coalesce(inspection_title, 'Inspection'), ' - ', new.label),
    'Auto-linked from failed inspection checklist item.',
    inspection_scheduled_at::date,
    not is_failed,
    case when is_failed then null else now() end,
    case when is_failed then 'To Do' else 'Done' end,
    'quality_inspection_item',
    new.id,
    new.id
  )
  on conflict (project_id, source_type, source_id) where source_type is not null and source_id is not null
  do update set
    title = excluded.title,
    description = excluded.description,
    due_date = excluded.due_date,
    linked_inspection_item_id = excluded.linked_inspection_item_id,
    is_completed = excluded.is_completed,
    completed_at = case
      when excluded.is_completed then coalesce(project_job_todos.completed_at, now())
      else null
    end,
    status = excluded.status,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.cleanup_project_todo_from_quality_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.project_job_todos
  where project_id = old.project_id
    and source_type = 'quality_issue'
    and source_id = old.id;

  return old;
end;
$$;

create or replace function public.cleanup_project_todo_from_inspection_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.project_job_todos
  where project_id = old.project_id
    and source_type = 'quality_inspection_item'
    and source_id = old.id;

  return old;
end;
$$;

drop trigger if exists sync_project_todo_from_quality_issue on public.project_quality_issues;
create trigger sync_project_todo_from_quality_issue
after insert or update of status, title, trade, location, due_date on public.project_quality_issues
for each row execute function public.sync_project_todo_from_quality_issue();

drop trigger if exists cleanup_project_todo_from_quality_issue on public.project_quality_issues;
create trigger cleanup_project_todo_from_quality_issue
after delete on public.project_quality_issues
for each row execute function public.cleanup_project_todo_from_quality_issue();

drop trigger if exists sync_project_todo_from_inspection_item on public.project_quality_inspection_items;
create trigger sync_project_todo_from_inspection_item
after insert or update of status, label on public.project_quality_inspection_items
for each row execute function public.sync_project_todo_from_inspection_item();

drop trigger if exists cleanup_project_todo_from_inspection_item on public.project_quality_inspection_items;
create trigger cleanup_project_todo_from_inspection_item
after delete on public.project_quality_inspection_items
for each row execute function public.cleanup_project_todo_from_inspection_item();
