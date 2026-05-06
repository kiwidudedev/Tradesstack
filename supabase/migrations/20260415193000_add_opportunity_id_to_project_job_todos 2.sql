alter table public.project_job_todos
  add column if not exists opportunity_id uuid null references public.organization_opportunities (id) on delete cascade;

update public.project_job_todos t
set opportunity_id = o.id
from public.organization_opportunities o
where t.opportunity_id is null
  and o.workspace_project_id = t.project_id
  and o.organization_id = t.organization_id;

create index if not exists project_job_todos_org_opportunity_status_created_idx
  on public.project_job_todos (organization_id, opportunity_id, status, created_at desc)
  where opportunity_id is not null;

create index if not exists project_job_todos_opportunity_idx
  on public.project_job_todos (opportunity_id, created_at desc)
  where opportunity_id is not null;

drop policy if exists "Members can create project todos" on public.project_job_todos;
create policy "Members can create project todos"
on public.project_job_todos
for insert
with check (
  project_job_todos.created_by = auth.uid()
  and public.is_member_of_organization(project_job_todos.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_job_todos.project_id
      and p.organization_id = project_job_todos.organization_id
  )
  and (
    project_job_todos.opportunity_id is null
    or exists (
      select 1
      from public.organization_opportunities o
      where o.id = project_job_todos.opportunity_id
        and o.organization_id = project_job_todos.organization_id
        and o.workspace_project_id = project_job_todos.project_id
    )
  )
);

drop policy if exists "Members can update project todos" on public.project_job_todos;
create policy "Members can update project todos"
on public.project_job_todos
for update
using (public.is_member_of_organization(project_job_todos.organization_id))
with check (
  public.is_member_of_organization(project_job_todos.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_job_todos.project_id
      and p.organization_id = project_job_todos.organization_id
  )
  and (
    project_job_todos.opportunity_id is null
    or exists (
      select 1
      from public.organization_opportunities o
      where o.id = project_job_todos.opportunity_id
        and o.organization_id = project_job_todos.organization_id
        and o.workspace_project_id = project_job_todos.project_id
    )
  )
);
