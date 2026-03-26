alter table public.organization_opportunities
  add column if not exists workspace_project_id uuid references public.organization_projects (id) on delete set null;

create index if not exists organization_opportunities_org_workspace_project_idx
  on public.organization_opportunities (organization_id, workspace_project_id);
