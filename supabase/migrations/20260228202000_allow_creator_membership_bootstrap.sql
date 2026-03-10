drop policy if exists "Creators can read created organization" on public.organizations;
create policy "Creators can read created organization"
on public.organizations
for select
using (
  organizations.created_by = auth.uid()
);

drop policy if exists "Creators can self bootstrap membership" on public.organization_members;
create policy "Creators can self bootstrap membership"
on public.organization_members
for insert
with check (
  organization_members.user_id = auth.uid()
  and organization_members.role = 'admin'
  and exists (
    select 1
    from public.organizations o
    where o.id = organization_members.organization_id
      and o.created_by = auth.uid()
  )
);
