create or replace function public.is_member_of_organization(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_admin_of_organization(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  );
$$;

grant execute on function public.is_member_of_organization(uuid) to authenticated;
grant execute on function public.is_admin_of_organization(uuid) to authenticated;

drop policy if exists "Users can read own organization" on public.organizations;
drop policy if exists "Creators can read created organization" on public.organizations;
create policy "Users can read own organization"
on public.organizations
for select
using (
  public.is_member_of_organization(organizations.id)
  or organizations.created_by = auth.uid()
);

drop policy if exists "Admins can update organization" on public.organizations;
create policy "Admins can update organization"
on public.organizations
for update
using (
  public.is_admin_of_organization(organizations.id)
)
with check (
  public.is_admin_of_organization(organizations.id)
);

drop policy if exists "Members can view organization members" on public.organization_members;
create policy "Members can view organization members"
on public.organization_members
for select
using (
  public.is_member_of_organization(organization_members.organization_id)
);

drop policy if exists "Admins can update members" on public.organization_members;
create policy "Admins can update members"
on public.organization_members
for update
using (
  public.is_admin_of_organization(organization_members.organization_id)
)
with check (
  public.is_admin_of_organization(organization_members.organization_id)
);

drop policy if exists "Admins can remove members" on public.organization_members;
create policy "Admins can remove members"
on public.organization_members
for delete
using (
  public.is_admin_of_organization(organization_members.organization_id)
);

drop policy if exists "Admins can view invites" on public.organization_invites;
create policy "Admins can view invites"
on public.organization_invites
for select
using (
  public.is_admin_of_organization(organization_invites.organization_id)
);

drop policy if exists "Admins can create invites" on public.organization_invites;
create policy "Admins can create invites"
on public.organization_invites
for insert
with check (
  organization_invites.invited_by = auth.uid()
  and public.is_admin_of_organization(organization_invites.organization_id)
);

drop policy if exists "Admins can update invites" on public.organization_invites;
create policy "Admins can update invites"
on public.organization_invites
for update
using (
  public.is_admin_of_organization(organization_invites.organization_id)
)
with check (
  public.is_admin_of_organization(organization_invites.organization_id)
);

drop policy if exists "Admins can delete invites" on public.organization_invites;
create policy "Admins can delete invites"
on public.organization_invites
for delete
using (
  public.is_admin_of_organization(organization_invites.organization_id)
);

drop policy if exists "Members can view organization projects" on public.organization_projects;
create policy "Members can view organization projects"
on public.organization_projects
for select
using (
  public.is_member_of_organization(organization_projects.organization_id)
);

drop policy if exists "Admins can update projects" on public.organization_projects;
create policy "Admins can update projects"
on public.organization_projects
for update
using (
  public.is_admin_of_organization(organization_projects.organization_id)
)
with check (
  public.is_admin_of_organization(organization_projects.organization_id)
);

drop policy if exists "Admins can delete projects" on public.organization_projects;
create policy "Admins can delete projects"
on public.organization_projects
for delete
using (
  public.is_admin_of_organization(organization_projects.organization_id)
);

drop policy if exists "Members can create organization projects" on public.organization_projects;
drop policy if exists "Admins can create projects" on public.organization_projects;
create policy "Members can create organization projects"
on public.organization_projects
for insert
with check (
  organization_projects.created_by = auth.uid()
  and public.is_member_of_organization(organization_projects.organization_id)
);
