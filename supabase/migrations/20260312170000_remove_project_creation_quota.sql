-- Remove monthly project-creation quota enforcement.
-- Keep organization membership + created_by checks for organization_projects inserts.

drop policy if exists "Members can create organization projects" on public.organization_projects;

create policy "Members can create organization projects"
on public.organization_projects
for insert
with check (
  organization_projects.created_by = auth.uid()
  and public.is_member_of_organization(organization_projects.organization_id)
);
