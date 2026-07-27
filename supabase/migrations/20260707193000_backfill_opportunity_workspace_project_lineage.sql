update public.organization_projects as project
set source_opportunity_id = candidate.opportunity_id
from (
  select
    opportunity.organization_id,
    opportunity.id as opportunity_id,
    opportunity.workspace_project_id as project_id
  from public.organization_opportunities as opportunity
  join public.organization_projects as linked_project
    on linked_project.id = opportunity.workspace_project_id
   and linked_project.organization_id = opportunity.organization_id
  where opportunity.workspace_project_id is not null
    and linked_project.source_opportunity_id is null
    and not exists (
      select 1
      from public.organization_opportunities as other_opportunity
      where other_opportunity.organization_id = opportunity.organization_id
        and other_opportunity.workspace_project_id = opportunity.workspace_project_id
        and other_opportunity.id <> opportunity.id
    )
) as candidate
where project.organization_id = candidate.organization_id
  and project.id = candidate.project_id
  and project.source_opportunity_id is null;
