alter table public.organization_projects
  add column if not exists source_opportunity_id uuid null references public.organization_opportunities (id) on delete set null;

create index if not exists organization_projects_org_source_opportunity_idx
  on public.organization_projects (organization_id, source_opportunity_id)
  where source_opportunity_id is not null;

drop policy if exists "Members can create organization projects" on public.organization_projects;
create policy "Members can create organization projects"
on public.organization_projects
for insert
with check (
  organization_projects.created_by = auth.uid()
  and public.is_member_of_organization(organization_projects.organization_id)
  and (
    organization_projects.client_id is null
    or exists (
      select 1
      from public.organization_clients c
      where c.id = organization_projects.client_id
        and c.organization_id = organization_projects.organization_id
    )
  )
  and (
    organization_projects.source_opportunity_id is null
    or exists (
      select 1
      from public.organization_opportunities o
      where o.id = organization_projects.source_opportunity_id
        and o.organization_id = organization_projects.organization_id
    )
  )
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
  and (
    organization_projects.client_id is null
    or exists (
      select 1
      from public.organization_clients c
      where c.id = organization_projects.client_id
        and c.organization_id = organization_projects.organization_id
    )
  )
  and (
    organization_projects.source_opportunity_id is null
    or exists (
      select 1
      from public.organization_opportunities o
      where o.id = organization_projects.source_opportunity_id
        and o.organization_id = organization_projects.organization_id
    )
  )
);
