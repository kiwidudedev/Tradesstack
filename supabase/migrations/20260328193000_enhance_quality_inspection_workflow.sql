alter table public.project_quality_inspections
  add column if not exists trade text not null default '',
  add column if not exists location text not null default '',
  add column if not exists assignee_name text not null default '',
  add column if not exists due_date date null,
  add column if not exists template_name text not null default '';

create index if not exists project_quality_inspections_org_project_due_idx
  on public.project_quality_inspections (organization_id, project_id, due_date, scheduled_at);

create table if not exists public.project_quality_inspection_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  inspection_id uuid not null references public.project_quality_inspections (id) on delete cascade,
  inspection_item_id uuid null references public.project_quality_inspection_items (id) on delete cascade,
  actor_user_id uuid null references auth.users (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now(),
  constraint project_quality_inspection_activity_action_not_blank check (char_length(trim(action)) > 0)
);

create index if not exists project_quality_inspection_activity_inspection_created_idx
  on public.project_quality_inspection_activity (inspection_id, created_at desc);

alter table public.project_quality_inspection_activity enable row level security;
alter table public.project_quality_inspection_activity force row level security;

drop policy if exists "Members can view quality inspection activity" on public.project_quality_inspection_activity;
create policy "Members can view quality inspection activity"
on public.project_quality_inspection_activity
for select
using (public.is_member_of_organization(project_quality_inspection_activity.organization_id));

drop policy if exists "Members can create quality inspection activity" on public.project_quality_inspection_activity;
create policy "Members can create quality inspection activity"
on public.project_quality_inspection_activity
for insert
with check (
  public.is_member_of_organization(project_quality_inspection_activity.organization_id)
  and exists (
    select 1
    from public.project_quality_inspections i
    where i.id = project_quality_inspection_activity.inspection_id
      and i.project_id = project_quality_inspection_activity.project_id
      and i.organization_id = project_quality_inspection_activity.organization_id
  )
);

drop policy if exists "Admins can delete quality inspection activity" on public.project_quality_inspection_activity;
create policy "Admins can delete quality inspection activity"
on public.project_quality_inspection_activity
for delete
using (public.is_admin_of_organization(project_quality_inspection_activity.organization_id));

grant select, insert, delete on public.project_quality_inspection_activity to authenticated;
