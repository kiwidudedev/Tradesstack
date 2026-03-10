drop policy if exists "Admins can create projects" on public.organization_projects;
drop policy if exists "Members can create organization projects" on public.organization_projects;

create policy "Members can create organization projects"
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
  )
);
