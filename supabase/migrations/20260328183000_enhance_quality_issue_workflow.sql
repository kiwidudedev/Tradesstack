alter table public.project_quality_issues
  add column if not exists description text not null default '',
  add column if not exists priority text not null default 'Medium';

alter table public.project_quality_issues
  drop constraint if exists project_quality_issues_status_check;

alter table public.project_quality_issues
  add constraint project_quality_issues_status_check
  check (status in ('Open', 'In Progress', 'Complete', 'Verified'));

alter table public.project_quality_issues
  drop constraint if exists project_quality_issues_priority_check;

alter table public.project_quality_issues
  add constraint project_quality_issues_priority_check
  check (priority in ('Low', 'Medium', 'High'));

create index if not exists project_quality_issues_org_project_priority_idx
  on public.project_quality_issues (organization_id, project_id, priority, due_date);

create table if not exists public.project_quality_issue_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  issue_id uuid not null references public.project_quality_issues (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  comment text not null,
  created_at timestamptz not null default now(),
  constraint project_quality_issue_comments_comment_not_blank check (char_length(trim(comment)) > 0)
);

create index if not exists project_quality_issue_comments_issue_created_idx
  on public.project_quality_issue_comments (issue_id, created_at asc);

create table if not exists public.project_quality_issue_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  issue_id uuid not null references public.project_quality_issues (id) on delete cascade,
  actor_user_id uuid null references auth.users (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now(),
  constraint project_quality_issue_activity_action_not_blank check (char_length(trim(action)) > 0)
);

create index if not exists project_quality_issue_activity_issue_created_idx
  on public.project_quality_issue_activity (issue_id, created_at asc);

alter table public.project_quality_issue_comments enable row level security;
alter table public.project_quality_issue_comments force row level security;
alter table public.project_quality_issue_activity enable row level security;
alter table public.project_quality_issue_activity force row level security;

drop policy if exists "Members can view quality issue comments" on public.project_quality_issue_comments;
create policy "Members can view quality issue comments"
on public.project_quality_issue_comments
for select
using (public.is_member_of_organization(project_quality_issue_comments.organization_id));

drop policy if exists "Members can create quality issue comments" on public.project_quality_issue_comments;
create policy "Members can create quality issue comments"
on public.project_quality_issue_comments
for insert
with check (
  project_quality_issue_comments.created_by = auth.uid()
  and public.is_member_of_organization(project_quality_issue_comments.organization_id)
  and exists (
    select 1
    from public.project_quality_issues i
    where i.id = project_quality_issue_comments.issue_id
      and i.project_id = project_quality_issue_comments.project_id
      and i.organization_id = project_quality_issue_comments.organization_id
  )
);

drop policy if exists "Admins can delete quality issue comments" on public.project_quality_issue_comments;
create policy "Admins can delete quality issue comments"
on public.project_quality_issue_comments
for delete
using (public.is_admin_of_organization(project_quality_issue_comments.organization_id));

drop policy if exists "Members can view quality issue activity" on public.project_quality_issue_activity;
create policy "Members can view quality issue activity"
on public.project_quality_issue_activity
for select
using (public.is_member_of_organization(project_quality_issue_activity.organization_id));

drop policy if exists "Members can create quality issue activity" on public.project_quality_issue_activity;
create policy "Members can create quality issue activity"
on public.project_quality_issue_activity
for insert
with check (
  public.is_member_of_organization(project_quality_issue_activity.organization_id)
  and exists (
    select 1
    from public.project_quality_issues i
    where i.id = project_quality_issue_activity.issue_id
      and i.project_id = project_quality_issue_activity.project_id
      and i.organization_id = project_quality_issue_activity.organization_id
  )
);

drop policy if exists "Admins can delete quality issue activity" on public.project_quality_issue_activity;
create policy "Admins can delete quality issue activity"
on public.project_quality_issue_activity
for delete
using (public.is_admin_of_organization(project_quality_issue_activity.organization_id));

grant select, insert, delete on public.project_quality_issue_comments to authenticated;
grant select, insert, delete on public.project_quality_issue_activity to authenticated;
