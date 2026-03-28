alter table public.project_quality_sign_offs
  add column if not exists signoff_type text not null default 'Internal',
  add column if not exists trade text not null default '',
  add column if not exists location text not null default '',
  add column if not exists assignee_name text not null default '',
  add column if not exists due_date date null,
  add column if not exists linked_inspection_id uuid null references public.project_quality_inspections (id) on delete set null,
  add column if not exists linked_issue_id uuid null references public.project_quality_issues (id) on delete set null,
  add column if not exists note text not null default '';

alter table public.project_quality_sign_offs
  drop constraint if exists project_quality_sign_offs_status_check;

alter table public.project_quality_sign_offs
  add constraint project_quality_sign_offs_status_check
  check (status in ('Pending', 'Requested', 'Signed', 'Rejected'));

alter table public.project_quality_sign_offs
  drop constraint if exists project_quality_sign_offs_type_check;

alter table public.project_quality_sign_offs
  add constraint project_quality_sign_offs_type_check
  check (signoff_type in ('Internal', 'Client', 'Council', 'Final Handover'));

create index if not exists project_quality_sign_offs_org_project_type_status_due_idx
  on public.project_quality_sign_offs (organization_id, project_id, signoff_type, status, due_date);

create table if not exists public.project_quality_signoff_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  signoff_id uuid not null references public.project_quality_sign_offs (id) on delete cascade,
  actor_user_id uuid null references auth.users (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now(),
  constraint project_quality_signoff_activity_action_not_blank check (char_length(trim(action)) > 0)
);

create index if not exists project_quality_signoff_activity_signoff_created_idx
  on public.project_quality_signoff_activity (signoff_id, created_at desc);

alter table public.project_quality_signoff_activity enable row level security;
alter table public.project_quality_signoff_activity force row level security;

drop policy if exists "Members can view quality signoff activity" on public.project_quality_signoff_activity;
create policy "Members can view quality signoff activity"
on public.project_quality_signoff_activity
for select
using (public.is_member_of_organization(project_quality_signoff_activity.organization_id));

drop policy if exists "Members can create quality signoff activity" on public.project_quality_signoff_activity;
create policy "Members can create quality signoff activity"
on public.project_quality_signoff_activity
for insert
with check (
  public.is_member_of_organization(project_quality_signoff_activity.organization_id)
  and exists (
    select 1
    from public.project_quality_sign_offs s
    where s.id = project_quality_signoff_activity.signoff_id
      and s.project_id = project_quality_signoff_activity.project_id
      and s.organization_id = project_quality_signoff_activity.organization_id
  )
);

drop policy if exists "Admins can delete quality signoff activity" on public.project_quality_signoff_activity;
create policy "Admins can delete quality signoff activity"
on public.project_quality_signoff_activity
for delete
using (public.is_admin_of_organization(project_quality_signoff_activity.organization_id));

grant select, insert, delete on public.project_quality_signoff_activity to authenticated;
