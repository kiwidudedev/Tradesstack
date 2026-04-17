begin;

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  organization_member_id uuid not null references public.organization_members (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  is_active boolean not null default true,
  removed_at timestamptz null,
  removed_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_members_org_idx
  on public.project_members (organization_id);

create index if not exists project_members_project_active_idx
  on public.project_members (project_id, is_active);

create index if not exists project_members_member_active_idx
  on public.project_members (organization_member_id, is_active);

create index if not exists project_members_org_project_active_idx
  on public.project_members (organization_id, project_id, is_active);

create unique index if not exists project_members_project_member_active_unique_idx
  on public.project_members (project_id, organization_member_id)
  where is_active = true;

create or replace function public.enforce_project_members_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_organization_id uuid;
  member_organization_id uuid;
begin
  if tg_op = 'INSERT' and new.is_active = false then
    raise exception 'Cannot insert inactive project member';
  end if;

  select p.organization_id
  into project_organization_id
  from public.organization_projects p
  where p.id = new.project_id;

  if project_organization_id is null then
    raise exception 'Project not found for project_members row';
  end if;

  select m.organization_id
  into member_organization_id
  from public.organization_members m
  where m.id = new.organization_member_id;

  if member_organization_id is null then
    raise exception 'Organization member not found for project_members row';
  end if;

  if new.organization_id <> project_organization_id then
    raise exception 'project_members.organization_id must match organization_projects.organization_id';
  end if;

  if new.organization_id <> member_organization_id then
    raise exception 'project_members.organization_id must match organization_members.organization_id';
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'project_members.organization_id cannot be changed after insert';
    end if;

    if new.project_id <> old.project_id then
      raise exception 'project_members.project_id cannot be changed after insert';
    end if;

    if new.organization_member_id <> old.organization_member_id then
      raise exception 'project_members.organization_member_id cannot be changed after insert';
    end if;

    if new.created_by <> old.created_by then
      raise exception 'project_members.created_by cannot be changed after insert';
    end if;

    if new.created_at <> old.created_at then
      raise exception 'project_members.created_at cannot be changed after insert';
    end if;
  end if;

  if new.is_active then
    new.removed_at := null;
    new.removed_by := null;
  else
    if tg_op = 'INSERT' then
      new.removed_at := coalesce(new.removed_at, now());
      new.removed_by := coalesce(new.removed_by, auth.uid(), new.created_by);
    else
      if old.is_active then
        new.removed_at := coalesce(new.removed_at, now());
        new.removed_by := coalesce(new.removed_by, auth.uid(), old.removed_by);
      else
        new.removed_at := coalesce(new.removed_at, old.removed_at, now());
        new.removed_by := coalesce(new.removed_by, old.removed_by, auth.uid());
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_project_members_integrity on public.project_members;
create trigger enforce_project_members_integrity
before insert or update on public.project_members
for each row execute function public.enforce_project_members_integrity();

drop trigger if exists set_project_members_updated_at on public.project_members;
create trigger set_project_members_updated_at
before update on public.project_members
for each row execute function public.set_updated_at();

alter table public.project_members enable row level security;
alter table public.project_members force row level security;

drop policy if exists "Members can view project members" on public.project_members;
create policy "Members can view project members"
on public.project_members
for select
using (public.is_member_of_organization(project_members.organization_id));

drop policy if exists "Owners can create project members" on public.project_members;
create policy "Owners can create project members"
on public.project_members
for insert
with check (
  project_members.created_by = auth.uid()
  and public.is_owner_of_organization(project_members.organization_id)
);

drop policy if exists "Owners can update project members" on public.project_members;
create policy "Owners can update project members"
on public.project_members
for update
using (
  public.is_owner_of_organization(project_members.organization_id)
)
with check (
  public.is_owner_of_organization(project_members.organization_id)
);

grant select, insert, update on public.project_members to authenticated;

commit;
