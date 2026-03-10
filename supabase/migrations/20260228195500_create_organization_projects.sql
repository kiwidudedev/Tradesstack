create table if not exists public.organization_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  stage text not null default 'Planning',
  location text not null default 'Unspecified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_projects_name_not_blank check (char_length(trim(name)) > 0),
  constraint organization_projects_slug_not_blank check (char_length(trim(slug)) > 0),
  constraint organization_projects_stage_check check (stage in ('Planning', 'Estimating', 'In Delivery')),
  constraint organization_projects_org_slug_unique unique (organization_id, slug)
);

create index if not exists organization_projects_org_idx
on public.organization_projects (organization_id);

create index if not exists organization_projects_org_created_at_idx
on public.organization_projects (organization_id, created_at desc);

drop trigger if exists set_organization_projects_updated_at on public.organization_projects;
create trigger set_organization_projects_updated_at
before update on public.organization_projects
for each row
execute function public.set_updated_at();

alter table public.organization_projects enable row level security;

drop policy if exists "Members can view organization projects" on public.organization_projects;
create policy "Members can view organization projects"
on public.organization_projects
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_projects.organization_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "Admins can create projects" on public.organization_projects;
create policy "Admins can create projects"
on public.organization_projects
for insert
with check (
  organization_projects.created_by = auth.uid()
  and
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_projects.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

drop policy if exists "Admins can update projects" on public.organization_projects;
create policy "Admins can update projects"
on public.organization_projects
for update
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_projects.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_projects.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

drop policy if exists "Admins can delete projects" on public.organization_projects;
create policy "Admins can delete projects"
on public.organization_projects
for delete
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_projects.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

grant select, insert, update, delete on public.organization_projects to authenticated;
