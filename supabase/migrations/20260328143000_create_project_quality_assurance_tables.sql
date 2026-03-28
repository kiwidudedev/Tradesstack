create table if not exists public.project_quality_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  trade text not null default '',
  location text not null default '',
  status text not null default 'Open',
  due_date date null,
  assignee_name text not null default '',
  assignee_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quality_issues_title_not_blank check (char_length(trim(title)) > 0),
  constraint project_quality_issues_status_check check (status in ('Open', 'In Progress', 'Complete'))
);

create index if not exists project_quality_issues_org_idx
  on public.project_quality_issues (organization_id, created_at desc);
create index if not exists project_quality_issues_project_status_idx
  on public.project_quality_issues (project_id, status, due_date);

drop trigger if exists set_project_quality_issues_updated_at on public.project_quality_issues;
create trigger set_project_quality_issues_updated_at
before update on public.project_quality_issues
for each row execute function public.set_updated_at();

create table if not exists public.project_quality_issue_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  issue_id uuid not null references public.project_quality_issues (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now(),
  constraint project_quality_issue_photos_photo_url_not_blank check (char_length(trim(photo_url)) > 0)
);

create index if not exists project_quality_issue_photos_issue_idx
  on public.project_quality_issue_photos (issue_id, created_at desc);
create index if not exists project_quality_issue_photos_project_idx
  on public.project_quality_issue_photos (project_id, created_at desc);

create table if not exists public.project_quality_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  scheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quality_inspections_title_not_blank check (char_length(trim(title)) > 0)
);

create index if not exists project_quality_inspections_project_scheduled_idx
  on public.project_quality_inspections (project_id, scheduled_at desc);

drop trigger if exists set_project_quality_inspections_updated_at on public.project_quality_inspections;
create trigger set_project_quality_inspections_updated_at
before update on public.project_quality_inspections
for each row execute function public.set_updated_at();

create table if not exists public.project_quality_inspection_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  inspection_id uuid not null references public.project_quality_inspections (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  label text not null,
  status text null,
  notes text not null default '',
  photo_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quality_inspection_items_label_not_blank check (char_length(trim(label)) > 0),
  constraint project_quality_inspection_items_status_check check (status is null or status in ('pass', 'fail'))
);

create index if not exists project_quality_inspection_items_inspection_idx
  on public.project_quality_inspection_items (inspection_id, created_at asc);
create index if not exists project_quality_inspection_items_status_idx
  on public.project_quality_inspection_items (project_id, status);

drop trigger if exists set_project_quality_inspection_items_updated_at on public.project_quality_inspection_items;
create trigger set_project_quality_inspection_items_updated_at
before update on public.project_quality_inspection_items
for each row execute function public.set_updated_at();

create table if not exists public.project_quality_sign_offs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  status text not null default 'Pending',
  requested_at timestamptz null,
  signed_by_name text null,
  signed_by_user_id uuid null references auth.users (id) on delete set null,
  signed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quality_sign_offs_title_not_blank check (char_length(trim(title)) > 0),
  constraint project_quality_sign_offs_status_check check (status in ('Pending', 'Requested', 'Signed'))
);

create index if not exists project_quality_sign_offs_project_idx
  on public.project_quality_sign_offs (project_id, created_at asc);

drop trigger if exists set_project_quality_sign_offs_updated_at on public.project_quality_sign_offs;
create trigger set_project_quality_sign_offs_updated_at
before update on public.project_quality_sign_offs
for each row execute function public.set_updated_at();

create table if not exists public.project_job_todos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  due_date date null,
  is_completed boolean not null default false,
  completed_at timestamptz null,
  assigned_user_id uuid null references auth.users (id) on delete set null,
  source_type text null,
  source_id uuid null,
  linked_issue_id uuid null references public.project_quality_issues (id) on delete set null,
  linked_inspection_item_id uuid null references public.project_quality_inspection_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_job_todos_title_not_blank check (char_length(trim(title)) > 0),
  constraint project_job_todos_source_type_check check (source_type is null or source_type in ('qa_issue', 'inspection_fail'))
);

create index if not exists project_job_todos_project_due_idx
  on public.project_job_todos (project_id, is_completed, due_date, created_at desc);
create unique index if not exists project_job_todos_source_unique_idx
  on public.project_job_todos (project_id, source_type, source_id)
  where source_type is not null and source_id is not null;

drop trigger if exists set_project_job_todos_updated_at on public.project_job_todos;
create trigger set_project_job_todos_updated_at
before update on public.project_job_todos
for each row execute function public.set_updated_at();

create or replace function public.sync_project_todo_from_quality_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'Complete' then
    insert into public.project_job_todos (
      organization_id,
      project_id,
      created_by,
      title,
      description,
      due_date,
      is_completed,
      completed_at,
      source_type,
      source_id,
      linked_issue_id
    )
    values (
      new.organization_id,
      new.project_id,
      new.created_by,
      new.title,
      format('Auto-linked from Quality Assurance issue (%s - %s).', nullif(new.trade, ''), nullif(new.location, '')),
      new.due_date,
      false,
      null,
      'qa_issue',
      new.id,
      new.id
    )
    on conflict (project_id, source_type, source_id) where source_type is not null and source_id is not null
    do update set
      title = excluded.title,
      description = excluded.description,
      due_date = excluded.due_date,
      linked_issue_id = excluded.linked_issue_id,
      is_completed = false,
      completed_at = null,
      updated_at = now();
  else
    update public.project_job_todos
    set is_completed = true,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where project_id = new.project_id
      and source_type = 'qa_issue'
      and source_id = new.id
      and is_completed = false;
  end if;

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
begin
  select i.title, i.scheduled_at
  into inspection_title, inspection_scheduled_at
  from public.project_quality_inspections i
  where i.id = new.inspection_id;

  if new.status = 'fail' then
    insert into public.project_job_todos (
      organization_id,
      project_id,
      created_by,
      title,
      description,
      due_date,
      is_completed,
      completed_at,
      source_type,
      source_id,
      linked_inspection_item_id
    )
    values (
      new.organization_id,
      new.project_id,
      new.created_by,
      concat(coalesce(inspection_title, 'Inspection'), ' - ', new.label),
      'Auto-linked from failed inspection checklist item.',
      inspection_scheduled_at::date,
      false,
      null,
      'inspection_fail',
      new.id,
      new.id
    )
    on conflict (project_id, source_type, source_id) where source_type is not null and source_id is not null
    do update set
      title = excluded.title,
      description = excluded.description,
      due_date = excluded.due_date,
      linked_inspection_item_id = excluded.linked_inspection_item_id,
      is_completed = false,
      completed_at = null,
      updated_at = now();
  else
    update public.project_job_todos
    set is_completed = true,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where project_id = new.project_id
      and source_type = 'inspection_fail'
      and source_id = new.id
      and is_completed = false;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_project_todo_from_quality_issue on public.project_quality_issues;
create trigger sync_project_todo_from_quality_issue
after insert or update of status, title, trade, location, due_date on public.project_quality_issues
for each row execute function public.sync_project_todo_from_quality_issue();

drop trigger if exists sync_project_todo_from_inspection_item on public.project_quality_inspection_items;
create trigger sync_project_todo_from_inspection_item
after insert or update of status, label on public.project_quality_inspection_items
for each row execute function public.sync_project_todo_from_inspection_item();

alter table public.project_quality_issues enable row level security;
alter table public.project_quality_issues force row level security;
alter table public.project_quality_issue_photos enable row level security;
alter table public.project_quality_issue_photos force row level security;
alter table public.project_quality_inspections enable row level security;
alter table public.project_quality_inspections force row level security;
alter table public.project_quality_inspection_items enable row level security;
alter table public.project_quality_inspection_items force row level security;
alter table public.project_quality_sign_offs enable row level security;
alter table public.project_quality_sign_offs force row level security;
alter table public.project_job_todos enable row level security;
alter table public.project_job_todos force row level security;

drop policy if exists "Members can view quality issues" on public.project_quality_issues;
create policy "Members can view quality issues"
on public.project_quality_issues
for select
using (public.is_member_of_organization(project_quality_issues.organization_id));

drop policy if exists "Members can create quality issues" on public.project_quality_issues;
create policy "Members can create quality issues"
on public.project_quality_issues
for insert
with check (
  project_quality_issues.created_by = auth.uid()
  and public.is_member_of_organization(project_quality_issues.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_issues.project_id
      and p.organization_id = project_quality_issues.organization_id
  )
);

drop policy if exists "Members can update quality issues" on public.project_quality_issues;
create policy "Members can update quality issues"
on public.project_quality_issues
for update
using (public.is_member_of_organization(project_quality_issues.organization_id))
with check (
  public.is_member_of_organization(project_quality_issues.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_issues.project_id
      and p.organization_id = project_quality_issues.organization_id
  )
);

drop policy if exists "Admins can delete quality issues" on public.project_quality_issues;
create policy "Admins can delete quality issues"
on public.project_quality_issues
for delete
using (public.is_admin_of_organization(project_quality_issues.organization_id));

drop policy if exists "Members can view quality issue photos" on public.project_quality_issue_photos;
create policy "Members can view quality issue photos"
on public.project_quality_issue_photos
for select
using (public.is_member_of_organization(project_quality_issue_photos.organization_id));

drop policy if exists "Members can create quality issue photos" on public.project_quality_issue_photos;
create policy "Members can create quality issue photos"
on public.project_quality_issue_photos
for insert
with check (
  project_quality_issue_photos.created_by = auth.uid()
  and public.is_member_of_organization(project_quality_issue_photos.organization_id)
  and exists (
    select 1
    from public.project_quality_issues i
    where i.id = project_quality_issue_photos.issue_id
      and i.project_id = project_quality_issue_photos.project_id
      and i.organization_id = project_quality_issue_photos.organization_id
  )
);

drop policy if exists "Admins can delete quality issue photos" on public.project_quality_issue_photos;
create policy "Admins can delete quality issue photos"
on public.project_quality_issue_photos
for delete
using (public.is_admin_of_organization(project_quality_issue_photos.organization_id));

drop policy if exists "Members can view quality inspections" on public.project_quality_inspections;
create policy "Members can view quality inspections"
on public.project_quality_inspections
for select
using (public.is_member_of_organization(project_quality_inspections.organization_id));

drop policy if exists "Members can create quality inspections" on public.project_quality_inspections;
create policy "Members can create quality inspections"
on public.project_quality_inspections
for insert
with check (
  project_quality_inspections.created_by = auth.uid()
  and public.is_member_of_organization(project_quality_inspections.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_inspections.project_id
      and p.organization_id = project_quality_inspections.organization_id
  )
);

drop policy if exists "Members can update quality inspections" on public.project_quality_inspections;
create policy "Members can update quality inspections"
on public.project_quality_inspections
for update
using (public.is_member_of_organization(project_quality_inspections.organization_id))
with check (
  public.is_member_of_organization(project_quality_inspections.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_inspections.project_id
      and p.organization_id = project_quality_inspections.organization_id
  )
);

drop policy if exists "Admins can delete quality inspections" on public.project_quality_inspections;
create policy "Admins can delete quality inspections"
on public.project_quality_inspections
for delete
using (public.is_admin_of_organization(project_quality_inspections.organization_id));

drop policy if exists "Members can view quality inspection items" on public.project_quality_inspection_items;
create policy "Members can view quality inspection items"
on public.project_quality_inspection_items
for select
using (public.is_member_of_organization(project_quality_inspection_items.organization_id));

drop policy if exists "Members can create quality inspection items" on public.project_quality_inspection_items;
create policy "Members can create quality inspection items"
on public.project_quality_inspection_items
for insert
with check (
  project_quality_inspection_items.created_by = auth.uid()
  and public.is_member_of_organization(project_quality_inspection_items.organization_id)
  and exists (
    select 1
    from public.project_quality_inspections i
    where i.id = project_quality_inspection_items.inspection_id
      and i.project_id = project_quality_inspection_items.project_id
      and i.organization_id = project_quality_inspection_items.organization_id
  )
);

drop policy if exists "Members can update quality inspection items" on public.project_quality_inspection_items;
create policy "Members can update quality inspection items"
on public.project_quality_inspection_items
for update
using (public.is_member_of_organization(project_quality_inspection_items.organization_id))
with check (
  public.is_member_of_organization(project_quality_inspection_items.organization_id)
  and exists (
    select 1
    from public.project_quality_inspections i
    where i.id = project_quality_inspection_items.inspection_id
      and i.project_id = project_quality_inspection_items.project_id
      and i.organization_id = project_quality_inspection_items.organization_id
  )
);

drop policy if exists "Admins can delete quality inspection items" on public.project_quality_inspection_items;
create policy "Admins can delete quality inspection items"
on public.project_quality_inspection_items
for delete
using (public.is_admin_of_organization(project_quality_inspection_items.organization_id));

drop policy if exists "Members can view quality sign offs" on public.project_quality_sign_offs;
create policy "Members can view quality sign offs"
on public.project_quality_sign_offs
for select
using (public.is_member_of_organization(project_quality_sign_offs.organization_id));

drop policy if exists "Members can create quality sign offs" on public.project_quality_sign_offs;
create policy "Members can create quality sign offs"
on public.project_quality_sign_offs
for insert
with check (
  project_quality_sign_offs.created_by = auth.uid()
  and public.is_member_of_organization(project_quality_sign_offs.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_sign_offs.project_id
      and p.organization_id = project_quality_sign_offs.organization_id
  )
);

drop policy if exists "Members can update quality sign offs" on public.project_quality_sign_offs;
create policy "Members can update quality sign offs"
on public.project_quality_sign_offs
for update
using (public.is_member_of_organization(project_quality_sign_offs.organization_id))
with check (
  public.is_member_of_organization(project_quality_sign_offs.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_sign_offs.project_id
      and p.organization_id = project_quality_sign_offs.organization_id
  )
);

drop policy if exists "Admins can delete quality sign offs" on public.project_quality_sign_offs;
create policy "Admins can delete quality sign offs"
on public.project_quality_sign_offs
for delete
using (public.is_admin_of_organization(project_quality_sign_offs.organization_id));

drop policy if exists "Members can view project todos" on public.project_job_todos;
create policy "Members can view project todos"
on public.project_job_todos
for select
using (public.is_member_of_organization(project_job_todos.organization_id));

drop policy if exists "Members can create project todos" on public.project_job_todos;
create policy "Members can create project todos"
on public.project_job_todos
for insert
with check (
  project_job_todos.created_by = auth.uid()
  and public.is_member_of_organization(project_job_todos.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_job_todos.project_id
      and p.organization_id = project_job_todos.organization_id
  )
);

drop policy if exists "Members can update project todos" on public.project_job_todos;
create policy "Members can update project todos"
on public.project_job_todos
for update
using (public.is_member_of_organization(project_job_todos.organization_id))
with check (
  public.is_member_of_organization(project_job_todos.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_job_todos.project_id
      and p.organization_id = project_job_todos.organization_id
  )
);

drop policy if exists "Admins can delete project todos" on public.project_job_todos;
create policy "Admins can delete project todos"
on public.project_job_todos
for delete
using (public.is_admin_of_organization(project_job_todos.organization_id));

grant select, insert, update, delete on public.project_quality_issues to authenticated;
grant select, insert, delete on public.project_quality_issue_photos to authenticated;
grant select, insert, update, delete on public.project_quality_inspections to authenticated;
grant select, insert, update, delete on public.project_quality_inspection_items to authenticated;
grant select, insert, update, delete on public.project_quality_sign_offs to authenticated;
grant select, insert, update, delete on public.project_job_todos to authenticated;
