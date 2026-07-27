create or replace function public.repair_project_quote_source_opportunity_lineage(
  p_organization_id uuid,
  p_quote_id uuid
)
returns table (
  id uuid,
  source_opportunity_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  quote_row public.project_quotes%rowtype;
  resolved_project_source_opportunity_id uuid;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select q.*
  into quote_row
  from public.project_quotes q
  join public.organization_projects p
    on p.id = q.project_id
   and p.organization_id = q.organization_id
  where q.id = p_quote_id
    and q.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Quote not found';
  end if;

  select p.source_opportunity_id
  into resolved_project_source_opportunity_id
  from public.organization_projects p
  where p.id = quote_row.project_id
    and p.organization_id = quote_row.organization_id;

  if resolved_project_source_opportunity_id is not null and not exists (
    select 1
    from public.organization_opportunities opportunity
    where opportunity.id = resolved_project_source_opportunity_id
      and opportunity.organization_id = p_organization_id
      and opportunity.workspace_project_id = quote_row.project_id
  ) then
    raise exception 'This quote belongs to a different opportunity.';
  end if;

  if quote_row.source_opportunity_id is not null
    and resolved_project_source_opportunity_id is not null
    and quote_row.source_opportunity_id <> resolved_project_source_opportunity_id then
    raise exception 'This quote belongs to a different opportunity.';
  end if;

  if quote_row.source_opportunity_id is null
    and resolved_project_source_opportunity_id is not null then
    update public.project_quotes q
    set source_opportunity_id = resolved_project_source_opportunity_id
    where q.id = quote_row.id
    returning * into quote_row;
  end if;

  return query
  select quote_row.id, quote_row.source_opportunity_id;
end;
$$;

grant execute on function public.repair_project_quote_source_opportunity_lineage(uuid, uuid) to authenticated;

with safely_repairable_quotes as (
  select q.id, project.source_opportunity_id
  from public.project_quotes q
  join public.organization_projects project
    on project.id = q.project_id
   and project.organization_id = q.organization_id
  join public.organization_opportunities opportunity
    on opportunity.id = project.source_opportunity_id
   and opportunity.organization_id = q.organization_id
   and opportunity.workspace_project_id = q.project_id
  where q.source_opportunity_id is null
    and project.source_opportunity_id is not null
    and not exists (
      select 1
      from public.organization_opportunities other_opportunity
      where other_opportunity.organization_id = q.organization_id
        and other_opportunity.workspace_project_id = q.project_id
        and other_opportunity.id <> opportunity.id
    )
)
update public.project_quotes q
set source_opportunity_id = candidate.source_opportunity_id
from safely_repairable_quotes candidate
where q.id = candidate.id
  and q.source_opportunity_id is null;
